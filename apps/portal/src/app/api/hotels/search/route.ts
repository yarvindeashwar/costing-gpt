import { NextRequest, NextResponse } from 'next/server';
import { getPool, setTenantContext } from '../../../../lib/db';

// Define the response type for hotel tariff information
interface HotelTariffInfo {
  hotelName: string;
  city: string;
  category: string;
  vendor: string;
  baseRate: number;
  gstPercent: number;
  serviceFee: number;
  mealPlan: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
  totalRate: number;
}

/**
 * API endpoint to search for hotel tariff information
 * @param request The incoming request
 * @returns JSON response with hotel tariff information
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const city = searchParams.get('city');
  const category = searchParams.get('category');
  const sortBy = searchParams.get('sortBy') || 'baseRate';
  const sortOrder = searchParams.get('sortOrder') || 'asc';
  const limit = parseInt(searchParams.get('limit') || '10');

  try {
    // Get database connection
    const pool = await getPool();
    await setTenantContext(pool);
    
    // Build the query based on search parameters
    let query = `
      SELECT 
        p.ProductName as hotelName,
        p.City as city,
        p.Category as category,
        v.VendorName as vendor,
        t.BaseRate as baseRate,
        t.GSTPercent as gstPercent,
        t.ServiceFee as serviceFee,
        t.MealPlan as mealPlan,
        t.Season as season,
        t.StartDate as startDate,
        t.EndDate as endDate,
        (t.BaseRate + (t.BaseRate * t.GSTPercent / 100) + t.ServiceFee) as totalRate
      FROM 
        app.Tariffs t
        JOIN app.Products p ON t.ProductId = p.ProductId
        JOIN app.Vendors v ON t.VendorId = v.VendorId
      WHERE 
        t.TenantId = @tenantId
    `;
    
    const queryParams: any = { tenantId: process.env.TENANT_ID || '' };
    
    // Add filters if provided
    if (city) {
      query += ` AND p.City = @city`;
      queryParams.city = city;
    }
    
    if (category) {
      query += ` AND p.Category = @category`;
      queryParams.category = category;
    }
    
    // Add sorting
    query += ` ORDER BY ${sortBy === 'totalRate' ? 'totalRate' : 't.' + sortBy} ${sortOrder === 'desc' ? 'DESC' : 'ASC'}`;
    
    // Add limit
    query += ` OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`;
    queryParams.limit = limit;
    
    // Execute the query
    const request = pool.request();
    
    // Add all parameters
    Object.keys(queryParams).forEach(key => {
      request.input(key, queryParams[key]);
    });
    
    const result = await request.query(query);
    
    // Format the results
    const hotels: HotelTariffInfo[] = result.recordset.map((row: any) => ({
      hotelName: row.hotelName,
      city: row.city,
      category: row.category,
      vendor: row.vendor,
      baseRate: row.baseRate,
      gstPercent: row.gstPercent,
      serviceFee: row.serviceFee,
      mealPlan: row.mealPlan,
      season: row.season,
      startDate: row.startDate ? new Date(row.startDate).toISOString().split('T')[0] : null,
      endDate: row.endDate ? new Date(row.endDate).toISOString().split('T')[0] : null,
      totalRate: row.totalRate
    }));
    
    return NextResponse.json({ 
      success: true, 
      hotels
    });
  } catch (error) {
    console.error('Error searching for hotels:', error);
    return NextResponse.json({ 
      success: false, 
      message: `Failed to search for hotels: ${(error as Error).message}`,
      hotels: []
    }, { status: 500 });
  }
}
