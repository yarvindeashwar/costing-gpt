import { NextRequest, NextResponse } from 'next/server';
import { analyzeDocument, HotelTariff } from '../../../../lib/document-intelligence';
import { saveHotelTariff } from '../../../../lib/db';
import { saveDocumentReference, saveHotelTariffToNewSchema, updateDocumentStatus } from '../../../../lib/hotel-db';
import { extractHotelTariffWithLLM } from '../../../../lib/llm-extractor';

// Track processing metrics
let totalDocumentsProcessed = 0;
let extractionMethodCounts: Record<string, number> = {
  structured_model: 0,
  regex: 0,
  llm: 0,
  none: 0
};
let successRate = 0;

/**
 * Extracts hotel tariff information from document analysis result
 * @param result Document analysis result
 * @returns Extracted hotel tariff information
 */
async function extractHotelTariff(result: any): Promise<HotelTariff | null> {
  try {
    // Log the structure of the result for debugging
    console.log('Document analysis result structure:', JSON.stringify(result, null, 2));
    
    // Method 1: Extract from structured model output
    if (result.documents && result.documents.length > 0 && result.documents[0].docType === 'HotelTariff') {
      try {
        const doc = result.documents[0];
        console.log('Found structured HotelTariff document:', JSON.stringify(doc, null, 2));
        
        // Extract fields from the document analysis result
        return {
          hotelName: doc.fields.hotelName?.content || '',
          vendor: doc.fields.vendor?.content || '',
          city: doc.fields.city?.content || '',
          category: doc.fields.category?.content || '',
          baseRate: parseFloat(doc.fields.baseRate?.content || '0'),
          gstPercent: parseFloat(doc.fields.gstPercent?.content || '0'),
          serviceFee: parseFloat(doc.fields.serviceFee?.content || '0'),
          mealPlan: doc.fields.mealPlan?.content || '',
          season: doc.fields.season?.content || '',
          startDate: doc.fields.startDate?.content || new Date().toISOString().split('T')[0],
          endDate: doc.fields.endDate?.content || new Date().toISOString().split('T')[0],
          description: doc.fields.description?.content || ''
        };
      } catch (structuredError) {
        console.error('Error extracting from structured model:', structuredError);
        // Continue to next extraction method
      }
    }
    
    // Method 2: Extract using regex patterns
    if (result.content) {
      try {
        console.log('Attempting to extract hotel information using regex patterns');
        const content = result.content;
        
        // Try to extract hotel name using regex patterns
        let hotelName = '';
        const hotelNameRegex = /(?:hotel|property|accommodation|resort)\s*(?:name)?\s*[:\-]?\s*([\w\s&]+)/i;
        const hotelNameMatch = content.match(hotelNameRegex);
        if (hotelNameMatch && hotelNameMatch[1]) {
          hotelName = hotelNameMatch[1].trim();
        }
        
        // Try to extract city
        let city = '';
        const cityRegex = /(?:city|location)\s*[:\-]?\s*([\w\s]+)/i;
        const cityMatch = content.match(cityRegex);
        if (cityMatch && cityMatch[1]) {
          city = cityMatch[1].trim();
        }
        
        // Try to extract category/star rating
        let category = '';
        const categoryRegex = /(?:category|star|rating)\s*[:\-]?\s*([\w\s\-]+)/i;
        const categoryMatch = content.match(categoryRegex);
        if (categoryMatch && categoryMatch[1]) {
          category = categoryMatch[1].trim();
        }
        
        // Try to extract rates
        let baseRate = 0;
        const rateRegex = /(?:rate|price|cost|amount)\s*[:\-]?\s*(?:Rs\.?|₹|INR)?\s*(\d[\d,\.]*)/i;
        const rateMatch = content.match(rateRegex);
        if (rateMatch && rateMatch[1]) {
          baseRate = parseFloat(rateMatch[1].replace(/,/g, ''));
        }
        
        // Try to extract GST
        let gstPercent = 0;
        const gstRegex = /(?:gst|tax)\s*[:\-]?\s*(\d+)\s*%/i;
        const gstMatch = content.match(gstRegex);
        if (gstMatch && gstMatch[1]) {
          gstPercent = parseFloat(gstMatch[1]);
        }
        
        // Try to extract vendor
        let vendor = '';
        const vendorRegex = /(?:vendor|provider|agency|travel\s*agent)\s*[:\-]?\s*([\w\s&]+)/i;
        const vendorMatch = content.match(vendorRegex);
        if (vendorMatch && vendorMatch[1]) {
          vendor = vendorMatch[1].trim();
        }
        
        // Check if we extracted enough information to be useful
        if (hotelName && (city || baseRate > 0)) {
          // Use only the extracted data without fallbacks
          const extractedTariff: HotelTariff = {
            hotelName: hotelName,
            vendor: vendor,
            city: city,
            category: category,
            baseRate: baseRate,
            gstPercent: gstPercent,
            serviceFee: 0, // No fallback
            mealPlan: '', // No fallback
            season: '', // No fallback
            startDate: new Date().toISOString().split('T')[0], // Current date as default
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
            description: ''
          };
          
          console.log('Extracted tariff data using regex:', extractedTariff);
          return extractedTariff;
        }
      } catch (regexError) {
        console.error('Error extracting with regex:', regexError);
        // Continue to next extraction method
      }
    }
    
    // Method 3: Try LLM extraction as a fallback
    if (result.content) {
      try {
        console.log('Attempting LLM extraction as fallback');
        const llmTariff = await extractHotelTariffWithLLM(result.content);
        if (llmTariff && llmTariff.hotelName) {
          console.log('LLM extraction successful:', llmTariff);
          return llmTariff;
        }
      } catch (llmError) {
        console.error('LLM extraction failed:', llmError);
        // Continue to final fallback
      }
    }
    
    // No extraction methods worked
    console.log('No data could be extracted from the document');
    return null;
  } catch (error) {
    console.error('Error extracting hotel tariff:', error);
    return null;
  }
}

/**
 * Handles document analysis requests
 * @route POST /api/document/analyze
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check file size (limit to 4MB)
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size exceeds 4MB limit' },
        { status: 400 }
      );
    }

    // Check file type
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PDF, JPG, PNG, and DOCX files are supported.' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // Generate a blob URL (this would be replaced with actual blob storage in production)
    const blobUrl = `local://${file.name}`;
    
    // Save document reference to the database
    let documentId;
    let dbAvailable = false;
    try {
      documentId = await saveDocumentReference(blobUrl);
      console.log(`Document reference saved with ID: ${documentId}`);
      
      // Update status to processing
      await updateDocumentStatus(documentId, 'processing');
      dbAvailable = true;
    } catch (error) {
      console.error('Error saving document reference:', error);
      console.log('Continuing with document analysis without database access');
      // Use a mock document ID for local testing
      documentId = Date.now();
    }
    
    // Analyze document
    const result = await analyzeDocument(fileBuffer, file.name);
    
    // Extract hotel tariff information with multi-layered approach
    const tariff = await extractHotelTariff(result);
    
    // If document ID exists and we have extracted text, update the document
    if (documentId && result.content && dbAvailable) {
      try {
        await updateDocumentStatus(documentId, tariff ? 'completed' : 'failed', result.content);
      } catch (error) {
        console.error('Error updating document status:', error);
      }
    }
    
    // If tariff information was extracted, try to save it to both databases
    let dbResult = null;
    let newSchemaResult = null;
    
    if (tariff && dbAvailable) {
      // Try to save to the original database for backward compatibility
      try {
        // Attempt to save to database
        dbResult = await saveHotelTariff(tariff);
        console.log('Original database save result:', dbResult);
        
        // If there was an error but it's related to schema creation, try again
        if (!dbResult.success && dbResult.error && 
            (dbResult.message.includes('schema') || dbResult.message.includes('table'))) {
          console.log('Retrying database save after schema error...');
          // Wait a moment for any schema changes to be applied
          await new Promise(resolve => setTimeout(resolve, 1000));
          dbResult = await saveHotelTariff(tariff);
          console.log('Retry result:', dbResult);
        }
      } catch (error) {
        console.error('Error saving to original database:', error);
        // Provide a fallback response when database connectivity fails
        dbResult = {
          success: false,
          message: 'Original database connection failed.',
          error: (error as Error).message
        };
      }
      
      // Try to save to the new hotel schema
      try {
        newSchemaResult = await saveHotelTariffToNewSchema(tariff, documentId);
        console.log('New schema save result:', newSchemaResult);
      } catch (error) {
        console.error('Error saving to new schema:', error);
        newSchemaResult = {
          success: false,
          message: 'Failed to save to new hotel schema',
          error: (error as Error).message
        };
      }
    } else if (tariff) {
      // Database not available but we have tariff data
      dbResult = {
        success: false,
        message: 'Database connection not available. Tariff information was extracted but not saved.',
        extractedOnly: true
      };
    }
    
    // If both database saves failed but we have tariff data
    if (tariff && (!dbResult?.success) && (!newSchemaResult?.success)) {
      console.log('Providing extraction-only success message since database saves failed');
      dbResult = {
        success: true,
        message: 'Hotel tariff information was successfully extracted from the document. However, it could not be saved to either database.',
        extractedOnly: true
      };
    } else if (documentId && !tariff && dbAvailable) {
      // If no tariff could be extracted, update document status to failed
      try {
        await updateDocumentStatus(documentId, 'failed');
      } catch (error) {
        console.error('Error updating document status to failed:', error);
      }
    }
    
    // Determine the extraction method used
    let extractionMethod = 'none';
    if (tariff) {
      if (result.documents && result.documents.length > 0 && result.documents[0].docType === 'HotelTariff') {
        extractionMethod = 'structured_model';
      } else if (tariff.hotelName && (tariff.city || tariff.baseRate > 0)) {
        extractionMethod = 'regex';
      } else {
        extractionMethod = 'llm';
      }
      
      // Update metrics
      totalDocumentsProcessed++;
      extractionMethodCounts[extractionMethod]++;
      successRate = ((extractionMethodCounts.structured_model + extractionMethodCounts.regex + extractionMethodCounts.llm) / totalDocumentsProcessed) * 100;
    }
    
    return NextResponse.json({ 
      result,
      tariff,
      dbResult,
      newSchemaResult,
      documentId,
      extractionMethod,
      processingDetails: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        extractionMethod,
        extractionSuccess: !!tariff,
        dbSaveSuccess: dbResult?.success || newSchemaResult?.success || false,
        dbAvailable
      },
      metrics: {
        totalDocumentsProcessed,
        extractionMethodCounts,
        successRate: successRate.toFixed(2) + '%',
        processingTime: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Document analysis error:', error);
    
    // Provide a more user-friendly error message
    let errorMessage = 'Failed to analyze document';
    let errorDetails = (error as Error).message;
    
    // Check for specific error types
    if (errorDetails.includes('OPENAI_KEY')) {
      errorMessage = 'LLM extraction is not configured';
      errorDetails = 'The OpenAI API key is missing. Document analysis will continue without LLM fallback.';
    } else if (errorDetails.includes('DOCUMENT_INTELLIGENCE')) {
      errorMessage = 'Document Intelligence is not properly configured';
      errorDetails = 'Please check your Document Intelligence credentials.';
    }
    
    return NextResponse.json(
      { 
        error: errorMessage, 
        details: errorDetails,
        success: false,
        processingDetails: {
          errorOccurred: true,
          errorType: 'server_error',
          errorMessage: errorMessage,
          processingTime: new Date().toISOString()
        }
      },
      { status: 500 }
    );
  }
}
