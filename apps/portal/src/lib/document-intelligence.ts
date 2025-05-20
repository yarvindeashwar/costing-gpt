import { DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import { AzureKeyCredential } from "@azure/core-auth";
import { Readable } from 'stream';

// Configuration constants
const DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT || "";
const DOCUMENT_INTELLIGENCE_KEY = process.env.DOCUMENT_INTELLIGENCE_KEY || "";

// Check if required environment variables are set
if (!DOCUMENT_INTELLIGENCE_ENDPOINT || !DOCUMENT_INTELLIGENCE_KEY) {
  console.error("Missing Document Intelligence configuration. Please set DOCUMENT_INTELLIGENCE_ENDPOINT and DOCUMENT_INTELLIGENCE_KEY environment variables.");
}

// Initialize Document Intelligence client
export const documentIntelligenceClient = new DocumentAnalysisClient(
  DOCUMENT_INTELLIGENCE_ENDPOINT,
  new AzureKeyCredential(DOCUMENT_INTELLIGENCE_KEY)
);

// Define hotel tariff data structure
export interface HotelTariff {
  hotelName: string;
  vendor: string;
  city: string;
  category: string; // e.g., "5-star", "luxury", "budget"
  baseRate: number;
  gstPercent: number;
  serviceFee: number;
  mealPlan: string; // e.g., "Breakfast Only", "All Inclusive"
  season: string; // e.g., "Peak", "Off-peak"
  startDate: string; // ISO format date
  endDate: string; // ISO format date
  description?: string;
}

/**
 * Analyzes a document using Azure Document Intelligence
 * @param fileBuffer - The document file buffer
 * @param fileName - The name of the file (used to determine content type)
 * @returns Analysis result
 */
export async function analyzeDocument(fileBuffer: Buffer, fileName: string) {
  try {
    // Create a mock result for testing purposes when credentials are not properly configured
    const mockResult = {
      content: "This is a mock document analysis result. Use this for UI testing until Document Intelligence credentials are properly configured.\n\nSample document content would appear here. This is placeholder text to demonstrate the UI functionality.\n\nThe actual Document Intelligence service would extract text, tables, and other content from your uploaded document.",
      pages: [
        { pageNumber: 1, width: 8.5, height: 11, unit: "inch" }
      ],
      tables: [
        {
          rowCount: 3,
          columnCount: 3,
          cells: [
            { rowIndex: 0, columnIndex: 0, content: "Header 1", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 0, columnIndex: 1, content: "Header 2", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 0, columnIndex: 2, content: "Header 3", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 1, columnIndex: 0, content: "Row 1, Cell 1", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 1, columnIndex: 1, content: "Row 1, Cell 2", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 1, columnIndex: 2, content: "Row 1, Cell 3", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 2, columnIndex: 0, content: "Row 2, Cell 1", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 2, columnIndex: 1, content: "Row 2, Cell 2", rowSpan: 1, columnSpan: 1 },
            { rowIndex: 2, columnIndex: 2, content: "Row 2, Cell 3", rowSpan: 1, columnSpan: 1 }
          ]
        }
      ],
      documents: [
        {
          docType: "HotelTariff",
          fields: {
            hotelName: { content: "Grand Luxury Hotel", confidence: 0.95 },
            vendor: { content: "Luxury Travels Ltd", confidence: 0.92 },
            city: { content: "Mumbai", confidence: 0.98 },
            category: { content: "5-star", confidence: 0.99 },
            baseRate: { content: "12500", confidence: 0.97 },
            gstPercent: { content: "18", confidence: 0.99 },
            serviceFee: { content: "1000", confidence: 0.95 },
            mealPlan: { content: "Breakfast & Dinner", confidence: 0.94 },
            season: { content: "Peak", confidence: 0.93 },
            startDate: { content: "2023-10-01", confidence: 0.96 },
            endDate: { content: "2024-03-31", confidence: 0.96 },
            description: { content: "Luxury accommodations with sea view", confidence: 0.91 }
          }
        }
      ]
    };
    
    // Determine content type based on file extension
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    
    if (fileExtension === 'pdf') {
      contentType = 'application/pdf';
    } else if (['jpg', 'jpeg', 'png'].includes(fileExtension || '')) {
      contentType = `image/${fileExtension}`;
    } else if (['docx', 'doc'].includes(fileExtension || '')) {
      contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // Check if we have valid credentials
    if (!DOCUMENT_INTELLIGENCE_KEY || !DOCUMENT_INTELLIGENCE_ENDPOINT || 
        DOCUMENT_INTELLIGENCE_KEY === 'your-document-intelligence-key') {
      console.log("Using mock implementation since Document Intelligence credentials are not properly configured");
      return mockResult;
    }
    
    // Create a readable stream from the buffer for the SDK
    const readableStream = new Readable();
    readableStream.push(fileBuffer);
    readableStream.push(null); // Signals the end of the stream

    // Use your custom trained model
    const customModelId = "hoteldetails";
    
    console.log(`Analyzing document using custom model: ${customModelId}`);
    
    // Set up document analysis options
    const options = {
      onProgress: ({ status }: { status: string }) => {
        console.log(`Document analysis status: ${status}`);
      }
    };
    
    // Start the document analysis operation with the custom model
    const poller = await documentIntelligenceClient.beginAnalyzeDocument(
      customModelId,
      readableStream,
      options
    );

    // Wait for the operation to complete
    const result = await poller.pollUntilDone();
    return result;
  } catch (error) {
    console.error("Error analyzing document:", error);
    throw error;
  }
}

/**
 * Extracts text content from a document analysis result
 * @param result - The document analysis result
 * @returns Extracted text content
 */
export function extractTextContent(result: any) {
  if (!result || !result.content) {
    return '';
  }
  
  return result.content;
}

/**
 * Extracts tables from a document analysis result
 * @param result - The document analysis result
 * @returns Extracted tables
 */
export function extractTables(result: any) {
  if (!result || !result.tables || result.tables.length === 0) {
    return [];
  }
  
  return result.tables.map((table: any) => {
    const rows = [];
    const cells = table.cells || [];
    
    // Group cells by row index
    const rowMap = new Map();
    for (const cell of cells) {
      const rowIndex = cell.rowIndex;
      if (!rowMap.has(rowIndex)) {
        rowMap.set(rowIndex, []);
      }
      rowMap.get(rowIndex).push(cell);
    }
    
    // Sort rows and cells within rows
    const sortedRowIndices = Array.from(rowMap.keys()).sort((a, b) => a - b);
    for (const rowIndex of sortedRowIndices) {
      const rowCells = rowMap.get(rowIndex);
      rowCells.sort((a: any, b: any) => a.columnIndex - b.columnIndex);
      
      // Extract cell content
      const row = rowCells.map((cell: any) => ({
        text: cell.content || '',
        rowSpan: cell.rowSpan || 1,
        columnSpan: cell.columnSpan || 1
      }));
      
      rows.push(row);
    }
    
    return {
      rows,
      rowCount: table.rowCount,
      columnCount: table.columnCount
    };
  });
}
