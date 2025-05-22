/**
 * This module contains database operations for the Document Processor function
 */
const sql = require('mssql');

/**
 * Get a connection to the SQL database
 * @param {*} context Function context for logging
 * @returns {Promise<sql.ConnectionPool>} SQL connection pool
 */
async function getPool(context) {
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
        context.log("Connected to SQL database using Azure AD Default authentication");
        return pool;
    } catch (error) {
        context.log.error("Error connecting to SQL database:", error);
        throw error;
    }
}

/**
 * Save document reference to the database
 * @param {*} context Function context for logging
 * @param {string} blobUrl URL of the document in blob storage
 * @param {string} documentType Type of document
 * @returns {Promise<number>} Document ID
 */
async function saveDocumentReference(context, blobUrl, documentType = 'hotel-tariff') {
    try {
        const pool = await getPool(context);
        
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
        context.log.error('Error saving document reference:', error);
        throw error;
    }
}

/**
 * Update document processing status
 * @param {*} context Function context for logging
 * @param {number} documentId Document ID
 * @param {string} status Processing status
 * @param {string} extractedText Extracted text from the document
 */
async function updateDocumentStatus(context, documentId, status, extractedText) {
    try {
        const pool = await getPool(context);
        
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
        context.log.error('Error updating document status:', error);
        throw error;
    }
}

/**
 * Save hotel tariff information to the database
 * @param {*} context Function context for logging
 * @param {Object} tariff The hotel tariff information
 * @param {number} documentId Document ID reference
 * @returns {Promise<Object>} Object indicating success or failure
 */
async function saveHotelTariffToDatabase(context, tariff, documentId) {
    try {
        // Get database connection
        const pool = await getPool(context);
        
        // Log the tariff data for debugging
        context.log('Saving tariff data to database:', JSON.stringify(tariff, null, 2));
        
        // Get or create property (hotel)
        const propertyId = await getOrCreateProperty(context, pool, tariff.hotelName, tariff.city, tariff.category);
        
        // Get or create vendor
        const vendorId = await getOrCreateVendor(context, pool, tariff.vendor || 'Unknown Vendor');
        
        // Get or create room type (using default)
        const roomTypeId = await getOrCreateRoomType(context, pool, propertyId);
        
        // Get or create rate plan
        const ratePlanId = await getOrCreateRatePlan(context, pool, propertyId, tariff.mealPlan);
        
        // Get or create season
        const seasonId = await getOrCreateSeason(
            context,
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
        context.log.error('Error saving hotel tariff to database:', error);
        return { 
            success: false, 
            message: `Failed to save hotel tariff: ${error.message}`,
            error: error
        };
    }
}

/**
 * Get or create a property (hotel) in the database
 * @param {*} context Function context for logging
 * @param {sql.ConnectionPool} pool SQL connection pool
 * @param {string} hotelName Hotel name
 * @param {string} city City
 * @param {string} category Hotel category (e.g., 5-star)
 * @returns {Promise<number>} Property ID
 */
async function getOrCreateProperty(context, pool, hotelName, city, category) {
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
        context.log.error('Error getting or creating property:', error);
        throw error;
    }
}

/**
 * Get or create a vendor in the database
 * @param {*} context Function context for logging
 * @param {sql.ConnectionPool} pool SQL connection pool
 * @param {string} vendorName Vendor name
 * @returns {Promise<number>} Vendor ID
 */
async function getOrCreateVendor(context, pool, vendorName) {
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
        context.log.error('Error getting or creating vendor:', error);
        throw error;
    }
}

/**
 * Get or create a season in the database
 * @param {*} context Function context for logging
 * @param {sql.ConnectionPool} pool SQL connection pool
 * @param {number} propertyId Property ID
 * @param {string} seasonName Season name
 * @param {string} startDate Start date
 * @param {string} endDate End date
 * @returns {Promise<number>} Season ID
 */
async function getOrCreateSeason(context, pool, propertyId, seasonName, startDate, endDate) {
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
        context.log.error('Error getting or creating season:', error);
        throw error;
    }
}

/**
 * Get or create a room type in the database
 * @param {*} context Function context for logging
 * @param {sql.ConnectionPool} pool SQL connection pool
 * @param {number} propertyId Property ID
 * @param {string} roomName Room name
 * @returns {Promise<number>} Room Type ID
 */
async function getOrCreateRoomType(context, pool, propertyId, roomName = 'Standard Room') {
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
        context.log.error('Error getting or creating room type:', error);
        throw error;
    }
}

/**
 * Get or create a rate plan in the database
 * @param {*} context Function context for logging
 * @param {sql.ConnectionPool} pool SQL connection pool
 * @param {number} propertyId Property ID
 * @param {string} mealPlan Meal plan
 * @returns {Promise<number>} Rate Plan ID
 */
async function getOrCreateRatePlan(context, pool, propertyId, mealPlan) {
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
        context.log.error('Error getting or creating rate plan:', error);
        throw error;
    }
}

module.exports = {
    getPool,
    saveDocumentReference,
    updateDocumentStatus,
    saveHotelTariffToDatabase,
    getOrCreateProperty,
    getOrCreateVendor,
    getOrCreateSeason,
    getOrCreateRoomType,
    getOrCreateRatePlan
};
