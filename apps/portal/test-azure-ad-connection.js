// Test script to verify Azure AD authentication to SQL database
require('dotenv').config({ path: '.env.local' });
const sql = require('mssql');

async function testConnection() {
  console.log('Testing Azure AD authentication to SQL database...');
  console.log('Using client ID:', process.env.AZURE_CLIENT_ID ? process.env.AZURE_CLIENT_ID : 'Client ID is NOT set');
  
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
    
    console.log('Attempting to connect with Azure AD authentication...');
    
    // Connect to the database
    const pool = await new sql.ConnectionPool(config).connect();
    console.log('Connected to SQL database successfully using Azure AD authentication!');
    
    // Try a simple query to verify connection
    const result = await pool.request().query('SELECT TOP 1 * FROM INFORMATION_SCHEMA.TABLES');
    console.log('Query executed successfully. First table:', result.recordset[0]);
    
    // Close the connection
    await pool.close();
    console.log('Connection closed.');
    
    return true;
  } catch (error) {
    console.error('Error connecting to SQL database:', error);
    
    // Check for specific error messages
    if (error.message.includes('AADSTS700016')) {
      console.error('Authentication failed: The application may not be registered in the correct tenant or may not have permissions to the SQL database.');
    } else if (error.message.includes('AADSTS50034')) {
      console.error('Authentication failed: The user account may be disabled or deleted.');
    } else if (error.message.includes('AADSTS65001')) {
      console.error('Authentication failed: The application may not have consent from the user or admin.');
    } else if (error.message.includes('Login failed for user')) {
      console.error('SQL Login failed: The user may not exist in the database or may not have permissions.');
    }
    
    return false;
  }
}

// Run the test
testConnection()
  .then(success => {
    console.log('Test completed:', success ? 'SUCCESS' : 'FAILED');
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
