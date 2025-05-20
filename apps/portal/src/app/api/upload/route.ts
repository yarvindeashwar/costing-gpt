import { NextRequest, NextResponse } from 'next/server';
import { BlobServiceClient, StorageSharedKeyCredential, BlobSASPermissions, generateBlobSASQueryParameters } from '@azure/storage-blob';
import { AzureKeyCredential, DocumentAnalysisClient } from '@azure/ai-form-recognizer';
import sql from 'mssql';

// Configuration constants
const STORAGE_ACCOUNT_NAME = process.env.STORAGE_ACCOUNT_NAME || 'gptstor';
const STORAGE_ACCOUNT_KEY = process.env.STORAGE_ACCOUNT_KEY || '';
const CONTAINER_NAME = 'vendor-pdfs';
const TENANT_ID = process.env.TENANT_ID || 'demo-tenant';
const DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT || '';
const DOCUMENT_INTELLIGENCE_KEY = process.env.DOCUMENT_INTELLIGENCE_KEY || '';
const DOCUMENT_INTELLIGENCE_MODEL_ID = 'DI_HOTEL_ID';
const SQL_CONNECTION_STRING = process.env.SQL_CONN || '';

/**
 * Handles file uploads for rate sheets
 * @route POST /api/upload
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Read filename and fileBase64 from request
    const { filename, fileBase64, vendorId, productType } = await request.json();
    
    if (!filename || !fileBase64) {
      return NextResponse.json(
        { error: 'Missing required fields: filename and fileBase64' },
        { status: 400 }
      );
    }

    // Decode base64 file content
    const fileBuffer = Buffer.from(fileBase64, 'base64');
    
    // Generate timestamp for unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const blobName = `${TENANT_ID}/${timestamp}_${filename}`;
    
    // 2. Build SAS URL with 30-minute expiry
    const sharedKeyCredential = new StorageSharedKeyCredential(
      STORAGE_ACCOUNT_NAME,
      STORAGE_ACCOUNT_KEY
    );
    
    const blobServiceClient = new BlobServiceClient(
      `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      sharedKeyCredential
    );
    
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    const blobClient = containerClient.getBlobClient(blobName);
    const blockBlobClient = blobClient.getBlockBlobClient();
    
    // Generate SAS token with 30-minute expiry
    const expiryTime = new Date();
    expiryTime.setMinutes(expiryTime.getMinutes() + 30);
    
    const sasOptions = {
      containerName: CONTAINER_NAME,
      blobName: blobName,
      permissions: BlobSASPermissions.parse('r'),  // Read permission
      startsOn: new Date(),
      expiresOn: expiryTime,
    };
    
    const sasToken = generateBlobSASQueryParameters(
      sasOptions,
      sharedKeyCredential
    ).toString();
    
    const sasUrl = `${blobClient.url}?${sasToken}`;
    
    // 3. Upload data to Azure Blob Storage
    console.log(`Uploading file to ${blobName}`);
    await blockBlobClient.uploadData(fileBuffer);
    console.log('Upload complete');
    
    // 4. Call Document Intelligence to analyze the document
    console.log('Analyzing document with Document Intelligence');
    const documentIntelligenceClient = new DocumentAnalysisClient(
      DOCUMENT_INTELLIGENCE_ENDPOINT,
      new AzureKeyCredential(DOCUMENT_INTELLIGENCE_KEY)
    );
    
    const poller = await documentIntelligenceClient.beginAnalyzeDocument(
      DOCUMENT_INTELLIGENCE_MODEL_ID,
      fileBuffer
    );
    
    const result = await poller.pollUntilDone();
    console.log('Document analysis complete');
    
    // Extract the document analysis results
    const extractedData = JSON.stringify(result);
    
    // 5. Insert JSON into RawRateSheets table
    console.log('Connecting to SQL database');
    await sql.connect(SQL_CONNECTION_STRING);
    
    const insertQuery = `
      INSERT INTO app.RawRateSheets 
        (TenantId, VendorId, ProductType, FileName, ExtractedData) 
      VALUES 
        (@tenantId, @vendorId, @productType, @fileName, @extractedData);
      SELECT SCOPE_IDENTITY() AS RateSheetId;
    `;
    
    const insertResult = await sql.query({
      query: insertQuery,
      parameters: [
        { name: 'tenantId', value: TENANT_ID },
        { name: 'vendorId', value: vendorId || '00000000-0000-0000-0000-000000000000' },
        { name: 'productType', value: productType || 'Hotel' },
        { name: 'fileName', value: filename },
        { name: 'extractedData', value: extractedData }
      ]
    });
    
    const rateSheetId = insertResult.recordset[0].RateSheetId;
    console.log(`Inserted rate sheet with ID: ${rateSheetId}`);
    
    // 6. Execute stored procedure to materialize tariffs
    console.log('Materializing tariffs');
    await sql.query(`EXEC app.sp_materialize_tariff @RateSheetId = ${rateSheetId}`);
    console.log('Tariff materialization complete');
    
    // 7. Return success response
    return NextResponse.json({
      ok: true,
      rateSheetId,
      blobUrl: sasUrl,
      message: 'File processed successfully'
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to process file', details: (error as Error).message },
      { status: 500 }
    );
  } finally {
    // Close SQL connection
    await sql.close();
  }
}
