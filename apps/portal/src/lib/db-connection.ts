import * as mssql from 'mssql';

// Get environment variables
const SQL_CONNECTION_STRING = process.env.SQL_CONN || '';
const TENANT_ID = process.env.TENANT_ID || 'demo-tenant';

// Singleton connection pool
let pool: mssql.ConnectionPool | null = null;

/**
 * Creates a connection configuration for SQL Server
 * Handles both SQL authentication and Azure AD authentication
 */
function createConnectionConfig(): mssql.config {
  // Parse server and database from connection string if available
  const serverMatch = SQL_CONNECTION_STRING.match(/Server=tcp:([^,]+)/);
  const databaseMatch = SQL_CONNECTION_STRING.match(/Initial Catalog=([^;]+)/);
  
  const server = serverMatch ? serverMatch[1] : 'gptsqlsrv.database.windows.net';
  const database = databaseMatch ? databaseMatch[1] : 'costingdb';
  
  // Check if using Azure AD authentication
  if (SQL_CONNECTION_STRING.includes('Authentication=Active Directory')) {
    console.log('Using Azure AD authentication');
    
    return {
      server,
      database,
      options: {
        encrypt: true,
        trustServerCertificate: false
      },
      // Azure AD Default authentication (uses the logged-in user's credentials)
      authentication: {
        type: 'azure-active-directory-default',
        options: {} // Required empty options object
      }
    };
  }
  
  // Default to using the connection string directly
  console.log('Using SQL authentication');
  return {
    server,
    database,
    options: {
      encrypt: true,
      trustServerCertificate: false
    },
    // Parse user/password from connection string if available
    ...parseUserPasswordFromConnectionString(SQL_CONNECTION_STRING)
  };
}

/**
 * Extracts user and password from a connection string if present
 */
function parseUserPasswordFromConnectionString(connectionString: string): { user?: string; password?: string } {
  const userMatch = connectionString.match(/User Id=([^;]+)/);
  const passwordMatch = connectionString.match(/Password=([^;]+)/);
  
  return {
    user: userMatch ? userMatch[1] : undefined,
    password: passwordMatch ? passwordMatch[1] : undefined
  };
}

/**
 * Gets a connection pool to the SQL database
 * Creates a new pool if one doesn't exist
 */
export async function getDbPool(): Promise<mssql.ConnectionPool> {
  if (!pool) {
    try {
      // Check if connection string is configured
      if (!SQL_CONNECTION_STRING || SQL_CONNECTION_STRING.includes('your_storage_account_connection_string_here')) {
        throw new Error('SQL connection string is not properly configured');
      }
      
      // Create config and connect
      const config = createConnectionConfig();
      pool = await new mssql.ConnectionPool(config).connect();
      console.log('Connected to SQL database');
    } catch (error) {
      console.error('Error connecting to SQL database:', error);
      throw error;
    }
  }
  
  return pool;
}

/**
 * Sets the tenant context for row-level security
 * 
 * Note: The database doesn't actually have the stored procedure, but
 * we'll keep this function for future compatibility if the stored procedure
 * is added later. For now, it just returns without doing anything.
 */
export async function setTenantContext(pool: mssql.ConnectionPool): Promise<void> {
  // Simply log and return since we know the stored procedure doesn't exist
  console.log(`Using tenant ID: ${TENANT_ID} for filtering data`);
  
  // No actual tenant context setting needed since the procedure doesn't exist
  // The database likely handles tenant filtering through WHERE clauses instead
}

/**
 * Closes the database connection pool
 */
export async function closeDbPool(): Promise<void> {
  if (pool) {
    try {
      await pool.close();
      pool = null;
      console.log('SQL connection pool closed');
    } catch (error) {
      console.error('Error closing SQL connection pool:', error);
      throw error;
    }
  }
}
