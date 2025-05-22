const { BlobServiceClient } = require('@azure/storage-blob');
const { DocumentAnalysisClient } = require('@azure/ai-form-recognizer');
const { DefaultAzureCredential } = require('@azure/identity');
const { Readable } = require('stream');

// Import extraction and database modules
const { extractHotelTariff } = require('./extraction');
const { 
    saveDocumentReference, 
    updateDocumentStatus, 
    saveHotelTariffToDatabase 
} = require('./database');

// Configuration constants
const DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
const DOCUMENT_INTELLIGENCE_KEY = process.env.DOCUMENT_INTELLIGENCE_KEY;
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT;
const OPENAI_KEY = process.env.OPENAI_KEY;
const CUSTOM_MODEL_ID = 'hoteldetails';

/**
 * Azure Function triggered by a new blob in the hotel-tariffs container
 * @param {*} context - Function context
 * @param {Buffer} myBlob - The blob that triggered the function
 */
module.exports = async function(context, myBlob) {
    context.log(`Processing blob: ${context.bindingData.name}`);
    
    try {
        // Step 1: Save document reference to the database
        const blobUrl = `https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net/hotel-tariffs/${context.bindingData.name}`;
        const documentId = await saveDocumentReference(context, blobUrl);
        context.log(`Document reference saved with ID: ${documentId}`);
        
        // Update status to processing
        await updateDocumentStatus(context, documentId, 'processing');
        
        // Step 2: Analyze the document using Document Intelligence
        context.log('Analyzing document with Document Intelligence...');
        const result = await analyzeDocument(context, myBlob, context.bindingData.name);
        context.log('Document analysis completed');
        
        // Step 3: Extract hotel tariff information using multi-layered approach
        context.log('Extracting hotel tariff information...');
        const extractionResult = await extractHotelTariff(context, result);
        const { tariff, extractionMethod } = extractionResult;
        
        // Step 4: Update document status with extracted text
        if (result.content) {
            await updateDocumentStatus(context, documentId, tariff ? 'completed' : 'failed', result.content);
        }
        
        // Step 5: Save tariff to database if extraction was successful
        let dbResult = null;
        if (tariff) {
            context.log(`Hotel tariff information extracted successfully using ${extractionMethod}`);
            dbResult = await saveHotelTariffToDatabase(context, tariff, documentId);
            context.log('Database save result:', dbResult);
            
            // Step 6: Send to processing queue for additional processing
            context.bindings.outputQueueItem = {
                documentId,
                tariffId: dbResult.tariffId,
                extractionMethod,
                processingDate: new Date().toISOString(),
                tariff
            };
            
            context.log('Tariff information sent to processing queue');
        } else {
            context.log('Failed to extract hotel tariff information');
            await updateDocumentStatus(context, documentId, 'failed');
        }
        
        // Return processing results
        context.done(null, {
            status: tariff ? 'success' : 'failure',
            message: tariff ? 'Document processed successfully' : 'Failed to extract tariff information',
            documentId,
            extractionMethod: extractionMethod || 'none',
            tariff,
            dbResult
        });
    } catch (error) {
        context.log.error('Error processing document:', error);
        context.done(error);
    }
};

/**
 * Analyzes a document using Azure Document Intelligence
 * @param {*} context - Function context
 * @param {Buffer} fileBuffer - Document buffer
 * @param {string} fileName - Document file name
 * @returns Document analysis result
 */
async function analyzeDocument(context, fileBuffer, fileName) {
    try {
        // Create Document Intelligence client
        const { AzureKeyCredential } = require('@azure/ai-form-recognizer');
        const credential = DOCUMENT_INTELLIGENCE_KEY 
            ? new AzureKeyCredential(DOCUMENT_INTELLIGENCE_KEY)
            : new DefaultAzureCredential();
            
        const documentIntelligenceClient = new DocumentAnalysisClient(
            DOCUMENT_INTELLIGENCE_ENDPOINT,
            credential
        );
        
        // Create a readable stream from the buffer for the SDK
        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null); // Signals the end of the stream
        
        context.log(`Analyzing document using custom model: ${CUSTOM_MODEL_ID}`);
        
        // Set up document analysis options
        const options = {
            onProgress: ({ status }) => {
                context.log(`Document analysis status: ${status}`);
            }
        };
        
        // Start the document analysis operation with the custom model
        const poller = await documentIntelligenceClient.beginAnalyzeDocument(
            CUSTOM_MODEL_ID,
            readableStream,
            options
        );
        
        // Wait for the operation to complete
        const result = await poller.pollUntilDone();
        return result;
    } catch (error) {
        context.log.error("Error analyzing document:", error);
        throw error;
    }
}
