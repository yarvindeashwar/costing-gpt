import * as sql from 'mssql';
import { HotelTariff } from './document-intelligence';

// Configuration constants
const SQL_CONN = process.env.SQL_CONN || 'Server=tcp:gptsqlsrv.database.windows.net,1433;Initial Catalog=costingdb;User Id=costing_app_user;Password=YourStrongPassword123!;Encrypt=true;TrustServerCertificate=False;Connection Timeout=30;';
const TENANT_ID = process.env.TENANT_ID || '';

// Check if required environment variables are set
if (!SQL_CONN) {
  console.error("Missing SQL connection string. Please set SQL_CONN environment variable.");
}

if (!TENANT_ID) {
  console.error("Missing Tenant ID. Please set TENANT_ID environment variable.");
}

// SQL connection pool
let pool: sql.ConnectionPool | null = null;

/**
 * Get a connection to the SQL database
 * @returns SQL connection pool
 */
export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    try {
      pool = await new sql.ConnectionPool(SQL_CONN).connect();
      console.log("Connected to SQL database");
    } catch (error) {
      console.error("Error connecting to SQL database:", error);
      throw error;
    }
  }
  return pool;
}

/**
 * Set tenant context for row-level security
 * @param pool SQL connection pool
 */
export async function setTenantContext(pool: sql.ConnectionPool): Promise<void> {
  try {
    await pool.request().query(`EXEC app.sp_set_tenant_context @TenantId = '${TENANT_ID}'`);
  } catch (error) {
    console.error("Error setting tenant context:", error);
    throw error;
  }
}

/**
 * Check if a product (hotel) exists in the database
 * @param hotelName The name of the hotel
 * @param city The city where the hotel is located
 * @param category The hotel category (e.g., 5-star)
 * @returns Product ID if found, null otherwise
 */
async function getProductId(hotelName: string, city: string, category: string): Promise<number | null> {
  try {
    const pool = await getPool();
    await setTenantContext(pool);
    
    const result = await pool.request()
      .input('tenantId', TENANT_ID)
      .input('productName', hotelName)
      .input('city', city)
      .input('category', category)
      .query(`
        SELECT ProductId 
        FROM app.Products 
        WHERE TenantId = @tenantId 
        AND ProductName = @productName 
        AND City = @city 
        AND Category = @category
      `);
    
    if (result.recordset.length > 0) {
      return result.recordset[0].ProductId;
    }
    
    // If product doesn't exist, create it
    const insertResult = await pool.request()
      .input('tenantId', TENANT_ID)
      .input('productName', hotelName)
      .input('city', city)
      .input('category', category)
      .input('productType', 'Hotel')
      .query(`
        INSERT INTO app.Products (TenantId, ProductName, City, Category, ProductType)
        VALUES (@tenantId, @productName, @city, @category, @productType);
        SELECT SCOPE_IDENTITY() AS ProductId;
      `);
    
    return insertResult.recordset[0].ProductId;
  } catch (error) {
    console.error('Error getting or creating product:', error);
    throw error;
  }
}

/**
 * Check if a vendor exists in the database
 * @param vendorName The name of the vendor
 * @returns Vendor ID if found, null otherwise
 */
async function getVendorId(vendorName: string): Promise<number | null> {
  try {
    const pool = await getPool();
    await setTenantContext(pool);
    
    const result = await pool.request()
      .input('tenantId', TENANT_ID)
      .input('vendorName', vendorName)
      .query(`
        SELECT VendorId 
        FROM app.Vendors 
        WHERE TenantId = @tenantId 
        AND VendorName = @vendorName
      `);
    
    if (result.recordset.length > 0) {
      return result.recordset[0].VendorId;
    }
    
    // If vendor doesn't exist, create it
    const insertResult = await pool.request()
      .input('tenantId', TENANT_ID)
      .input('vendorName', vendorName)
      .query(`
        INSERT INTO app.Vendors (TenantId, VendorName)
        VALUES (@tenantId, @vendorName);
        SELECT SCOPE_IDENTITY() AS VendorId;
      `);
    
    return insertResult.recordset[0].VendorId;
  } catch (error) {
    console.error('Error getting or creating vendor:', error);
    throw error;
  }
}

/**
 * Save hotel tariff information to the database
 * @param tariff The hotel tariff information
 * @returns Object indicating success or failure
 */
export async function saveHotelTariff(tariff: HotelTariff): Promise<{ success: boolean; message: string; tariffId?: number }> {
  try {
    // Get database connection
    const pool = await getPool();
    await setTenantContext(pool);
    
    // Check if product (hotel) exists
    const productId = await getProductId(tariff.hotelName, tariff.city, tariff.category);
    if (!productId) {
      return { success: false, message: 'Failed to create or find product record' };
    }
    
    // Check if vendor exists
    const vendorId = await getVendorId(tariff.vendor);
    if (!vendorId) {
      return { success: false, message: 'Failed to create or find vendor record' };
    }
    
    // Check if tariff already exists for this product, vendor, and season
    const existingTariff = await pool.request()
      .input('tenantId', TENANT_ID)
      .input('productId', productId)
      .input('vendorId', vendorId)
      .input('season', tariff.season)
      .query(`
        SELECT TariffId 
        FROM app.Tariffs 
        WHERE TenantId = @tenantId 
        AND ProductId = @productId 
        AND VendorId = @vendorId 
        AND Season = @season
      `);
    
    let tariffId;
    
    if (existingTariff.recordset.length > 0) {
      // Update existing tariff
      tariffId = existingTariff.recordset[0].TariffId;
      
      await pool.request()
        .input('tariffId', tariffId)
        .input('baseRate', tariff.baseRate)
        .input('gstPercent', tariff.gstPercent)
        .input('serviceFee', tariff.serviceFee)
        .input('mealPlan', tariff.mealPlan)
        .input('startDate', tariff.startDate)
        .input('endDate', tariff.endDate)
        .input('description', tariff.description || '')
        .query(`
          UPDATE app.Tariffs 
          SET BaseRate = @baseRate,
              GSTPercent = @gstPercent,
              ServiceFee = @serviceFee,
              MealPlan = @mealPlan,
              StartDate = @startDate,
              EndDate = @endDate,
              Description = @description,
              UpdatedAt = GETDATE()
          WHERE TariffId = @tariffId
        `);
      
      return { 
        success: true, 
        message: 'Hotel tariff information updated successfully', 
        tariffId 
      };
    } else {
      // Insert new tariff
      const insertResult = await pool.request()
        .input('tenantId', TENANT_ID)
        .input('productId', productId)
        .input('vendorId', vendorId)
        .input('baseRate', tariff.baseRate)
        .input('gstPercent', tariff.gstPercent)
        .input('serviceFee', tariff.serviceFee)
        .input('mealPlan', tariff.mealPlan)
        .input('season', tariff.season)
        .input('startDate', tariff.startDate)
        .input('endDate', tariff.endDate)
        .input('description', tariff.description || '')
        .query(`
          INSERT INTO app.Tariffs (
            TenantId, ProductId, VendorId, BaseRate, GSTPercent, 
            ServiceFee, MealPlan, Season, StartDate, EndDate, Description
          )
          VALUES (
            @tenantId, @productId, @vendorId, @baseRate, @gstPercent,
            @serviceFee, @mealPlan, @season, @startDate, @endDate, @description
          );
          SELECT SCOPE_IDENTITY() AS TariffId;
        `);
      
      tariffId = insertResult.recordset[0].TariffId;
      
      return { 
        success: true, 
        message: 'Hotel tariff information saved successfully', 
        tariffId 
      };
    }
  } catch (error) {
    console.error('Error saving hotel tariff:', error);
    return { 
      success: false, 
      message: `Failed to save hotel tariff: ${(error as Error).message}` 
    };
  }
}
