import { NextRequest, NextResponse } from 'next/server';
import * as sql from 'mssql';
import { getPool } from '../../../../lib/hotel-db';
import { headers } from 'next/headers';

/**
 * Fetches detailed tariff information from the database
 * @route GET /api/tariff/[id]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // In Next.js 14/15, dynamic route parameters must be awaited
    // before accessing their properties
    const resolvedParams = await params;
    const tariffId = parseInt(resolvedParams.id);
    
    if (isNaN(tariffId)) {
      return NextResponse.json(
        { error: 'Invalid tariff ID' },
        { status: 400 }
      );
    }
    
    // Connect to the database
    const pool = await getPool();
    
    // Fetch tariff details from the new schema with all related information
    const result = await pool.request()
      .input('tariffId', sql.Int, tariffId)
      .query(`
        SELECT 
          t.tariff_id,
          t.base_rate,
          t.tax_percent,
          t.service_fee,
          t.created_at,
          t.updated_at,
          p.property_id,
          p.property_name AS hotel_name,
          p.city,
          p.category,
          v.vendor_id,
          v.vendor_name,
          s.season_id,
          s.season_name,
          s.start_date,
          s.end_date,
          rt.room_type_id,
          rt.room_name,
          rp.rate_plan_id,
          rp.plan_name,
          rp.meal_plan,
          ta.attributes
        FROM 
          hotel.tariffs t
          INNER JOIN hotel.properties p ON t.property_id = p.property_id
          INNER JOIN hotel.vendors v ON t.vendor_id = v.vendor_id
          INNER JOIN hotel.seasons s ON t.season_id = s.season_id
          INNER JOIN hotel.room_types rt ON t.room_type_id = rt.room_type_id
          INNER JOIN hotel.rate_plans rp ON t.rate_plan_id = rp.rate_plan_id
          LEFT JOIN hotel.tariff_attributes ta ON t.tariff_id = ta.tariff_id
        WHERE 
          t.tariff_id = @tariffId
      `);
    
    if (result.recordset.length === 0) {
      return NextResponse.json(
        { error: 'Tariff not found' },
        { status: 404 }
      );
    }
    
    // Format the data for the frontend
    const tariffData = result.recordset[0];
    
    // Parse JSON attributes if present
    let attributes = {};
    if (tariffData.attributes) {
      try {
        attributes = JSON.parse(tariffData.attributes);
      } catch (e) {
        console.error('Error parsing tariff attributes:', e);
      }
    }
    
    // Format dates
    const startDate = tariffData.start_date ? new Date(tariffData.start_date).toISOString().split('T')[0] : '';
    const endDate = tariffData.end_date ? new Date(tariffData.end_date).toISOString().split('T')[0] : '';
    
    return NextResponse.json({
      tariff: {
        id: tariffData.tariff_id,
        baseRate: tariffData.base_rate,
        taxPercent: tariffData.tax_percent,
        serviceFee: tariffData.service_fee,
        createdAt: tariffData.created_at,
        updatedAt: tariffData.updated_at,
        property: {
          id: tariffData.property_id,
          name: tariffData.hotel_name,
          city: tariffData.city,
          category: tariffData.category
        },
        vendor: {
          id: tariffData.vendor_id,
          name: tariffData.vendor_name
        },
        season: {
          id: tariffData.season_id,
          name: tariffData.season_name,
          startDate,
          endDate
        },
        roomType: {
          id: tariffData.room_type_id,
          name: tariffData.room_name
        },
        ratePlan: {
          id: tariffData.rate_plan_id,
          name: tariffData.plan_name,
          mealPlan: tariffData.meal_plan
        },
        attributes
      }
    });
  } catch (error) {
    console.error('Error fetching tariff details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tariff details', details: (error as Error).message },
      { status: 500 }
    );
  }
}
