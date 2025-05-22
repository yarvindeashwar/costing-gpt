import { NextRequest, NextResponse } from 'next/server';
import { analyzeDocument, HotelTariff } from '../../../../lib/document-intelligence';
import { saveHotelTariff } from '../../../../lib/db';
import { saveDocumentReference, saveHotelTariffToNewSchema, updateDocumentStatus } from '../../../../lib/hotel-db';

/**
 * Extracts hotel tariff information from document analysis result
 * @param result Document analysis result
 * @returns Extracted hotel tariff information
 */
function extractHotelTariff(result: any): HotelTariff | null {
  try {
    // Log the structure of the result for debugging
    console.log('Document analysis result structure:', JSON.stringify(result, null, 2));
    
    // If using mock data (for development/testing)
    if (result.documents && result.documents.length > 0 && result.documents[0].docType === 'HotelTariff') {
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
    }
    
    // If we have document content, try to extract information from the raw text
    if (result.content) {
      console.log('Attempting to extract hotel information from document content');
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
      
      console.log('Extracted tariff data:', extractedTariff);
      return extractedTariff;
    }
    
    // No sample data fallback
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
    try {
      documentId = await saveDocumentReference(blobUrl);
      console.log(`Document reference saved with ID: ${documentId}`);
      
      // Update status to processing
      await updateDocumentStatus(documentId, 'processing');
    } catch (error) {
      console.error('Error saving document reference:', error);
      // Continue even if document reference saving fails
    }
    
    // Analyze document
    const result = await analyzeDocument(fileBuffer, file.name);
    
    // Extract hotel tariff information
    const tariff = extractHotelTariff(result);
    
    // If document ID exists and we have extracted text, update the document
    if (documentId && result.content) {
      try {
        await updateDocumentStatus(documentId, 'completed', result.content);
      } catch (error) {
        console.error('Error updating document status:', error);
      }
    }
    
    // If tariff information was extracted, try to save it to both databases
    let dbResult = null;
    let newSchemaResult = null;
    
    if (tariff) {
      // Try to save to the original database for backward compatibility
      try {
        dbResult = await saveHotelTariff(tariff);
        console.log('Original database save result:', dbResult);
      } catch (error) {
        console.error('Error saving to original database:', error);
        dbResult = {
          success: false,
          message: 'Failed to save to original database',
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
      
      // If both database saves failed but we have tariff data
      if ((!dbResult || !dbResult.success) && (!newSchemaResult || !newSchemaResult.success)) {
        console.log('Providing extraction-only success message since both database saves failed');
        dbResult = {
          success: true,
          message: 'Hotel tariff information was successfully extracted from the document. However, it could not be saved to either database.',
          extractedOnly: true
        };
      }
    } else if (documentId) {
      // If no tariff could be extracted, update document status to failed
      try {
        await updateDocumentStatus(documentId, 'failed');
      } catch (error) {
        console.error('Error updating document status to failed:', error);
      }
    }
    
    return NextResponse.json({ 
      result,
      tariff,
      dbResult,
      newSchemaResult,
      documentId
    });
  } catch (error) {
    console.error('Document analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze document', details: (error as Error).message },
      { status: 500 }
    );
  }
}
