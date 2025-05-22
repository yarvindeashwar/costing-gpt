// Script to upload a document to Azure Blob Storage
const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');

// Configuration
const storageAccountName = 'gptstormarvin';
const containerName = 'hotel-tariffs';

async function uploadDocument(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return;
    }

    // Get file details
    const fileName = path.basename(filePath);
    const fileExtension = path.extname(fileName).toLowerCase();
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.docx'];
    
    if (!allowedExtensions.includes(fileExtension)) {
      console.error(`File type not supported. Allowed types: ${allowedExtensions.join(', ')}`);
      return;
    }

    // Read file content
    const fileContent = fs.readFileSync(filePath);
    
    // Set content type based on file extension
    let contentType = 'application/octet-stream';
    if (fileExtension === '.pdf') {
      contentType = 'application/pdf';
    } else if (['.jpg', '.jpeg'].includes(fileExtension)) {
      contentType = 'image/jpeg';
    } else if (fileExtension === '.png') {
      contentType = 'image/png';
    } else if (fileExtension === '.docx') {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Connect to Azure Blob Storage using Azure CLI credentials
    console.log('Connecting to Azure Blob Storage...');
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
    
    // Get container client
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // Create blob client
    const blobName = `${Date.now()}-${fileName}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    
    // Upload file
    console.log(`Uploading file "${fileName}" to Azure Blob Storage...`);
    const uploadOptions = {
      blobHTTPHeaders: {
        blobContentType: contentType
      }
    };
    
    await blockBlobClient.upload(fileContent, fileContent.length, uploadOptions);
    
    console.log('Upload successful!');
    console.log(`Blob URL: ${blockBlobClient.url}`);
    
    // Return the blob URL for further processing
    return blockBlobClient.url;
  } catch (error) {
    console.error('Error uploading document:', error);
  }
}

// Check command line arguments
if (process.argv.length < 3) {
  console.log('Usage: node upload-document.js <file-path>');
  process.exit(1);
}

// Get file path from command line arguments
const filePath = process.argv[2];

// Upload document
uploadDocument(filePath)
  .then(blobUrl => {
    if (blobUrl) {
      console.log('Document uploaded successfully.');
      console.log('The document will be processed automatically by the Azure Function.');
    }
  })
  .catch(console.error);
