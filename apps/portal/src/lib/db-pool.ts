import * as sql from 'mssql';

// SQL connection pool
let pool: sql.ConnectionPool | null = null;

// Get a connection to the SQL database
export const db = async (): Promise<sql.ConnectionPool> => {
  if (!pool) {
    try {
      // Get connection string from environment variable
      const SQL_CONN = process.env.SQL_CONN;
      
      if (!SQL_CONN) {
        console.error("SQL_CONN environment variable is not set");
        throw new Error("SQL_CONN environment variable is not set");
      }
      
      // Create a config object for Azure AD authentication
      const config: sql.config = {
        server: 'gptsqlsrv.database.windows.net',
        database: 'costingdb',
        authentication: {
          type: 'azure-active-directory-default',
          options: {}
        },
        options: {
          encrypt: true,
          trustServerCertificate: false
        }
      };
      
      console.log("Attempting to connect to SQL database with Azure AD authentication...");
      
      // Use the config object for Azure AD authentication
      pool = await new sql.ConnectionPool(config).connect();
      console.log("Connected to SQL database successfully");
    } catch (error) {
      console.error("Error connecting to SQL database:", error);
      throw error;
    }
  }
  return pool;
};

// Close the SQL connection pool
export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.close();
    pool = null;
  }
};
