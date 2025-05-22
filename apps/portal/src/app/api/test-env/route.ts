import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    sql_conn_exists: !!process.env.SQL_CONN,
    // Only show a masked version for security
    sql_conn_masked: process.env.SQL_CONN 
      ? `${process.env.SQL_CONN.substring(0, 20)}...${process.env.SQL_CONN.substring(process.env.SQL_CONN.length - 20)}`
      : null,
    tenant_id: process.env.TENANT_ID || null,
    node_env: process.env.NODE_ENV || null
  });
}
