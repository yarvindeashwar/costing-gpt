import { NextResponse } from 'next/server';
import { db } from '@/lib/db-pool';

export async function GET() {
  try {
    const pool = await db();
    const result = await pool.request().query('SELECT TOP 1 * FROM dbo.Tariffs');
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection successful',
      data: result.recordset[0] || null,
      tables: result.recordsets && result.recordsets.length > 0 ? Object.keys(result.recordset[0] || {}) : []
    });
  } catch (error: any) {
    console.error('Database connection error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Database connection failed',
      error: error.message
    }, { status: 500 });
  }
}
