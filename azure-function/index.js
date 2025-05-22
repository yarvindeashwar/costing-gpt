const { BlobServiceClient } = require('@azure/storage-blob');
const { DocumentAnalysisClient } = require('@azure/ai-form-recognizer');
const { DefaultAzureCredential } = require('@azure/identity');
const { Readable } = require('stream');
const sql = require('mssql');

// Configuration constants
const DOCUMENT_INTELLIGENCE_ENDPOINT = process.env.DOCUMENT_INTELLIGENCE_ENDPOINT;
const DOCUMENT_INTELLIGENCE_KEY = process.env.DOCUMENT_INTELLIGENCE_KEY;
const CUSTOM_MODEL_ID = 'hoteldetails';

/**
 * Azure Function triggered by a new blob in the hotel-tariffs container
 * @param {*} context - Function context
 * @param {Buffer} myBlob - The blob that triggered the function
 */
module.exports = async function(context, myBlob) {
    context.log(`Processing blob: ${context.bindingData.name}`);
    
    try {
        // Analyze the document
        const result = await analyzeDocument(myBlob, context.bindingData.name);
        context.log('Document analysis completed');
        
        // Extract hotel tariff information
        const tariff = extractHotelTariff(result);
        
        if (tariff) {
            context.log('Hotel tariff information extracted successfully');
            
            // Save document reference to the database
            const blobUrl = `https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net/hotel-tariffs/${context.bindingData.name}`;
            const documentId = await saveDocumentReference(blobUrl);
            context.log(`Document reference saved with ID: ${documentId}`);
            
            // Update status to processing
            await updateDocumentStatus(documentId, 'processing');
            
            // Save extracted text to document record
            if (result.content) {
                await updateDocumentStatus(documentId, 'completed', result.content);
            }
            
            // Save tariff to database
            const dbResult = await saveHotelTariffToDatabase(tariff, documentId);
            context.log('Database save result:', dbResult);
            
            context.done(null, {
                status: 'success',
                message: 'Document processed successfully',
                documentId,
                tariff,
                dbResult
            });
        } else {
            context.log.error('Failed to extract hotel tariff information');
            
            // Save document reference with failed status
            const blobUrl = `https://${process.env.STORAGE_ACCOUNT_NAME}.blob.core.windows.net/hotel-tariffs/${context.bindingData.name}`;
            const documentId = await saveDocumentReference(blobUrl);
            await updateDocumentStatus(documentId, 'failed');
            
            context.done(null, {
                status: 'error',
                message: 'Failed to extract hotel tariff information'
            });
        }
    } catch (error) {
        context.log.error('Error processing document:', error);
        context.done(error);
    }
};

/**
 * Analyzes a document using Azure Document Intelligence
 * @param {Buffer} fileBuffer - Document buffer
 * @param {string} fileName - Document file name
 * @returns Document analysis result
 */
async function analyzeDocument(fileBuffer, fileName) {
    try {
        // Create Document Intelligence client
        const credential = DOCUMENT_INTELLIGENCE_KEY 
            ? { AzureKeyCredential: { key: DOCUMENT_INTELLIGENCE_KEY } }
            : { DefaultAzureCredential: new DefaultAzureCredential() };
            
        const documentIntelligenceClient = new DocumentAnalysisClient(
            DOCUMENT_INTELLIGENCE_ENDPOINT,
            credential.AzureKeyCredential || credential.DefaultAzureCredential
        );
        
        // Create a readable stream from the buffer for the SDK
        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null); // Signals the end of the stream
        
        console.log(`Analyzing document using custom model: ${CUSTOM_MODEL_ID}`);
        
        // Set up document analysis options
        const options = {
            onProgress: ({ status }) => {
                console.log(`Document analysis status: ${status}`);
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
        console.error("Error analyzing document:", error);
        throw error;
    }
}

/**
 * Extracts hotel tariff information from document analysis result
 * @param {Object} result - Document analysis result
 * @returns {Object|null} Extracted hotel tariff information
 */
function extractHotelTariff(result) {
    try {
        // Log the structure of the result for debugging
        console.log('Document analysis result structure:', JSON.stringify(result, null, 2));
        
        // If using structured data from the custom model
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
            const extractedTariff = {
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
 * Get a connection to the SQL database
 * @returns {Promise<sql.ConnectionPool>} SQL connection pool
 */
async function getPool() {
    try {
        // Configure SQL connection with Azure AD Default authentication
        const config = {
            server: 'gptsqlsrv.database.windows.net',
            database: 'costingdb',
            authentication: {
                type: 'azure-active-directory-default',
                options: {
                    clientId: process.env.AZURE_CLIENT_ID
                }
            },
            options: {
                encrypt: true,
                trustServerCertificate: false,
                connectTimeout: 30000
            }
        };
        
        // Connect to the database
        const pool = await new sql.ConnectionPool(config).connect();
        console.log("Connected to SQL database using Azure AD Default authentication");
        return pool;
    } catch (error) {
        console.error("Error connecting to SQL database:", error);
        throw error;
    }
}

/**
 * Save document reference to the database
 * @param {string} blobUrl - URL of the document in blob storage
 * @param {string} documentType - Type of document
 * @returns {Promise<number>} Document ID
 */
async function saveDocumentReference(blobUrl, documentType = 'hotel-tariff') {
    try {
        const pool = await getPool();
        
        const result = await pool.request()
            .input('blobUrl', sql.NVarChar, blobUrl)
            .input('documentType', sql.NVarChar, documentType)
            .input('tenantId', sql.NVarChar, process.env.TENANT_ID || '')
            .query(`
                INSERT INTO hotel.documents (
                    blob_url, document_type, tenant_id, processing_status
                )
                VALUES (
                    @blobUrl, @documentType, @tenantId, 'pending'
                );
                SELECT SCOPE_IDENTITY() AS DocumentId;
            `);
        
        return result.recordset[0].DocumentId;
    } catch (error) {
        console.error('Error saving document reference:', error);
        throw error;
    }
}

/**
 * Update document processing status
 * @param {number} documentId - Document ID
 * @param {string} status - Processing status
 * @param {string} extractedText - Extracted text from the document
 */
async function updateDocumentStatus(documentId, status, extractedText) {
    try {
        const pool = await getPool();
        
        const request = pool.request()
            .input('documentId', sql.Int, documentId)
            .input('status', sql.NVarChar, status)
            .input('processedDate', sql.DateTime, new Date());
        
        if (extractedText) {
            request.input('extractedText', sql.NVarChar, extractedText);
            await request.query(`
                UPDATE hotel.documents
                SET processing_status = @status,
                    processed_date = @processedDate,
                    extracted_text = @extractedText
                WHERE document_id = @documentId
            `);
        } else {
            await request.query(`
                UPDATE hotel.documents
                SET processing_status = @status,
                    processed_date = @processedDate
                WHERE document_id = @documentId
            `);
        }
    } catch (error) {
        console.error('Error updating document status:', error);
        throw error;
    }
}

/**
 * Save hotel tariff information to the database
 * @param {Object} tariff - The hotel tariff information
 * @param {number} documentId - Document ID reference
 * @returns {Promise<Object>} Object indicating success or failure
 */
async function saveHotelTariffToDatabase(tariff, documentId) {
    try {
        // Get database connection
        const pool = await getPool();
        
        // Log the tariff data for debugging
        console.log('Saving tariff data to database:', JSON.stringify(tariff, null, 2));
        
        // Get or create property (hotel)
        const propertyId = await getOrCreateProperty(pool, tariff.hotelName, tariff.city, tariff.category);
        
        // Get or create vendor
        const vendorId = await getOrCreateVendor(pool, tariff.vendor || 'Unknown Vendor');
        
        // Get or create room type (using default)
        const roomTypeId = await getOrCreateRoomType(pool, propertyId);
        
        // Get or create rate plan
        const ratePlanId = await getOrCreateRatePlan(pool, propertyId, tariff.mealPlan);
        
        // Get or create season
        const seasonId = await getOrCreateSeason(
            pool,
            propertyId,
            tariff.season,
            tariff.startDate,
            tariff.endDate
        );
        
        // Check if tariff already exists
        const existingTariff = await pool.request()
            .input('propertyId', sql.Int, propertyId)
            .input('vendorId', sql.Int, vendorId)
            .input('roomTypeId', sql.Int, roomTypeId)
            .input('ratePlanId', sql.Int, ratePlanId)
            .input('seasonId', sql.Int, seasonId)
            .query(`
                SELECT tariff_id 
                FROM hotel.tariffs 
                WHERE property_id = @propertyId 
                AND vendor_id = @vendorId
                AND room_type_id = @roomTypeId
                AND rate_plan_id = @ratePlanId
                AND season_id = @seasonId
            `);
        
        let tariffId;
        
        if (existingTariff.recordset.length > 0) {
            // Update existing tariff
            tariffId = existingTariff.recordset[0].tariff_id;
            
            await pool.request()
                .input('tariffId', sql.Int, tariffId)
                .input('baseRate', sql.Decimal(10, 2), tariff.baseRate)
                .input('taxPercent', sql.Decimal(5, 2), tariff.gstPercent)
                .input('serviceFee', sql.Decimal(10, 2), tariff.serviceFee)
                .query(`
                    UPDATE hotel.tariffs 
                    SET base_rate = @baseRate,
                        tax_percent = @taxPercent,
                        service_fee = @serviceFee,
                        updated_at = GETDATE()
                    WHERE tariff_id = @tariffId
                `);
            
            // If we have a document ID, store it as JSON attribute
            if (documentId) {
                const attributes = JSON.stringify({ documentId });
                await pool.request()
                    .input('tariffId', sql.Int, tariffId)
                    .input('attributes', sql.NVarChar, attributes)
                    .query(`
                        IF EXISTS (SELECT 1 FROM hotel.tariff_attributes WHERE tariff_id = @tariffId)
                            UPDATE hotel.tariff_attributes 
                            SET attributes = @attributes
                            WHERE tariff_id = @tariffId
                        ELSE
                            INSERT INTO hotel.tariff_attributes (tariff_id, attributes)
                            VALUES (@tariffId, @attributes)
                    `);
            }
            
            return { 
                success: true, 
                message: 'Hotel tariff information updated successfully', 
                tariffId 
            };
        } else {
            // Insert new tariff
            const insertResult = await pool.request()
                .input('propertyId', sql.Int, propertyId)
                .input('vendorId', sql.Int, vendorId)
                .input('roomTypeId', sql.Int, roomTypeId)
                .input('ratePlanId', sql.Int, ratePlanId)
                .input('seasonId', sql.Int, seasonId)
                .input('baseRate', sql.Decimal(10, 2), tariff.baseRate)
                .input('taxPercent', sql.Decimal(5, 2), tariff.gstPercent)
                .input('serviceFee', sql.Decimal(10, 2), tariff.serviceFee)
                .query(`
                    INSERT INTO hotel.tariffs (
                        property_id, vendor_id, room_type_id, rate_plan_id, season_id,
                        base_rate, tax_percent, service_fee
                    )
                    VALUES (
                        @propertyId, @vendorId, @roomTypeId, @ratePlanId, @seasonId,
                        @baseRate, @taxPercent, @serviceFee
                    );
                    SELECT SCOPE_IDENTITY() AS TariffId;
                `);
            
            tariffId = insertResult.recordset[0].TariffId;
            
            // If we have a document ID, store it as JSON attribute
            if (documentId) {
                const attributes = JSON.stringify({ documentId });
                await pool.request()
                    .input('tariffId', sql.Int, tariffId)
                    .input('attributes', sql.NVarChar, attributes)
                    .query(`
                        INSERT INTO hotel.tariff_attributes (tariff_id, attributes)
                        VALUES (@tariffId, @attributes)
                    `);
            }
            
            return { 
                success: true, 
                message: 'Hotel tariff information saved successfully', 
                tariffId 
            };
        }
    } catch (error) {
        console.error('Error saving hotel tariff to database:', error);
        return { 
            success: false, 
            message: `Failed to save hotel tariff: ${error.message}`,
            error: error
        };
    }
}

/**
 * Get or create a property (hotel) in the database
 * @param {sql.ConnectionPool} pool - SQL connection pool
 * @param {string} hotelName - Hotel name
 * @param {string} city - City
 * @param {string} category - Hotel category (e.g., 5-star)
 * @returns {Promise<number>} Property ID
 */
async function getOrCreateProperty(pool, hotelName, city, category) {
    try {
        // Check if property exists
        const existingProperty = await pool.request()
            .input('propertyName', sql.NVarChar, hotelName)
            .input('city', sql.NVarChar, city)
            .query(`
                SELECT property_id 
                FROM hotel.properties 
                WHERE property_name = @propertyName 
                AND city = @city
            `);
        
        if (existingProperty.recordset.length > 0) {
            return existingProperty.recordset[0].property_id;
        }
        
        // Create new property
        const insertResult = await pool.request()
            .input('propertyName', sql.NVarChar, hotelName)
            .input('city', sql.NVarChar, city)
            .input('category', sql.NVarChar, category)
            .input('propertyType', sql.NVarChar, 'hotel')
            .query(`
                INSERT INTO hotel.properties (
                    property_name, city, category, property_type
                )
                VALUES (
                    @propertyName, @city, @category, @propertyType
                );
                SELECT SCOPE_IDENTITY() AS PropertyId;
            `);
        
        return insertResult.recordset[0].PropertyId;
    } catch (error) {
        console.error('Error getting or creating property:', error);
        throw error;
    }
}

/**
 * Get or create a vendor in the database
 * @param {sql.ConnectionPool} pool - SQL connection pool
 * @param {string} vendorName - Vendor name
 * @returns {Promise<number>} Vendor ID
 */
async function getOrCreateVendor(pool, vendorName) {
    try {
        // Check if vendor exists
        const existingVendor = await pool.request()
            .input('vendorName', sql.NVarChar, vendorName)
            .query(`
                SELECT vendor_id 
                FROM hotel.vendors 
                WHERE vendor_name = @vendorName
            `);
        
        if (existingVendor.recordset.length > 0) {
            return existingVendor.recordset[0].vendor_id;
        }
        
        // Create new vendor
        const insertResult = await pool.request()
            .input('vendorName', sql.NVarChar, vendorName)
            .query(`
                INSERT INTO hotel.vendors (
                    vendor_name
                )
                VALUES (
                    @vendorName
                );
                SELECT SCOPE_IDENTITY() AS VendorId;
            `);
        
        return insertResult.recordset[0].VendorId;
    } catch (error) {
        console.error('Error getting or creating vendor:', error);
        throw error;
    }
}

/**
 * Get or create a season in the database
 * @param {sql.ConnectionPool} pool - SQL connection pool
 * @param {number} propertyId - Property ID
 * @param {string} seasonName - Season name
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<number>} Season ID
 */
async function getOrCreateSeason(pool, propertyId, seasonName, startDate, endDate) {
    try {
        // Use default season name if not provided
        const season = seasonName || 'Regular';
        
        // Check if season exists
        const existingSeason = await pool.request()
            .input('propertyId', sql.Int, propertyId)
            .input('seasonName', sql.NVarChar, season)
            .input('startDate', sql.Date, startDate)
            .input('endDate', sql.Date, endDate)
            .query(`
                SELECT season_id 
                FROM hotel.seasons 
                WHERE property_id = @propertyId 
                AND season_name = @seasonName
                AND start_date = @startDate
                AND end_date = @endDate
            `);
        
        if (existingSeason.recordset.length > 0) {
            return existingSeason.recordset[0].season_id;
        }
        
        // Create new season
        const insertResult = await pool.request()
            .input('propertyId', sql.Int, propertyId)
            .input('seasonName', sql.NVarChar, season)
            .input('startDate', sql.Date, startDate)
            .input('endDate', sql.Date, endDate)
            .query(`
                INSERT INTO hotel.seasons (
                    property_id, season_name, start_date, end_date
                )
                VALUES (
                    @propertyId, @seasonName, @startDate, @endDate
                );
                SELECT SCOPE_IDENTITY() AS SeasonId;
            `);
        
        return insertResult.recordset[0].SeasonId;
    } catch (error) {
        console.error('Error getting or creating season:', error);
        throw error;
    }
}

/**
 * Get or create a room type in the database
 * @param {sql.ConnectionPool} pool - SQL connection pool
 * @param {number} propertyId - Property ID
 * @param {string} roomName - Room name
 * @returns {Promise<number>} Room Type ID
 */
async function getOrCreateRoomType(pool, propertyId, roomName = 'Standard Room') {
    try {
        // Check if room type exists
        const existingRoomType = await pool.request()
            .input('propertyId', sql.Int, propertyId)
            .input('roomName', sql.NVarChar, roomName)
            .query(`
                SELECT room_type_id 
                FROM hotel.room_types 
                WHERE property_id = @propertyId 
                AND room_name = @roomName
            `);
        
        if (existingRoomType.recordset.length > 0) {
            return existingRoomType.recordset[0].room_type_id;
        }
        
        // Create new room type
        const insertResult = await pool.request()
            .input('propertyId', sql.Int, propertyId)
            .input('roomName', sql.NVarChar, roomName)
            .input('occupancyStandard', sql.Int, 2)
            .input('occupancyMax', sql.Int, 3)
            .query(`
                INSERT INTO hotel.room_types (
                    property_id, room_name, occupancy_standard, occupancy_max
                )
                VALUES (
                    @propertyId, @roomName, @occupancyStandard, @occupancyMax
                );
                SELECT SCOPE_IDENTITY() AS RoomTypeId;
            `);
        
        return insertResult.recordset[0].RoomTypeId;
    } catch (error) {
        console.error('Error getting or creating room type:', error);
        throw error;
    }
}

/**
 * Get or create a rate plan in the database
 * @param {sql.ConnectionPool} pool - SQL connection pool
 * @param {number} propertyId - Property ID
 * @param {string} mealPlan - Meal plan
 * @returns {Promise<number>} Rate Plan ID
 */
async function getOrCreateRatePlan(pool, propertyId, mealPlan) {
    try {
        // Use default meal plan if not provided
        const meal = mealPlan || 'Room Only';
        
        // Check if rate plan exists
        const existingRatePlan = await pool.request()
            .input('propertyId', sql.Int, propertyId)
            .input('mealPlan', sql.NVarChar, meal)
            .query(`
                SELECT rate_plan_id 
                FROM hotel.rate_plans 
                WHERE property_id = @propertyId 
                AND meal_plan = @mealPlan
            `);
        
        if (existingRatePlan.recordset.length > 0) {
            return existingRatePlan.recordset[0].rate_plan_id;
        }
        
        // Create new rate plan
        const planName = `${meal} Plan`;
        const insertResult = await pool.request()
            .input('propertyId', sql.Int, propertyId)
            .input('planName', sql.NVarChar, planName)
            .input('mealPlan', sql.NVarChar, meal)
            .query(`
                INSERT INTO hotel.rate_plans (
                    property_id, plan_name, meal_plan
                )
                VALUES (
                    @propertyId, @planName, @mealPlan
                );
                SELECT SCOPE_IDENTITY() AS RatePlanId;
            `);
        
        return insertResult.recordset[0].RatePlanId;
    } catch (error) {
        console.error('Error getting or creating rate plan:', error);
        throw error;
    }
}
