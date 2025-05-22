// Test script for Azure AD authentication to SQL Database
const sql = require('mssql');
require('dotenv').config({ path: './apps/portal/.env.local' });

async function testAzureADConnection() {
  console.log('Testing Azure AD connection to SQL Database...');
  console.log('Environment variables:');
  console.log('- AZURE_CLIENT_ID:', process.env.AZURE_CLIENT_ID ? 'Set' : 'Not set');
  
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
    
    console.log('Connecting to SQL database with config:', JSON.stringify(config, null, 2));
    
    // Connect to the database
    const pool = await new sql.ConnectionPool(config).connect();
    console.log("✅ Successfully connected to SQL database using Azure AD authentication");
    
    // Test a simple query
    console.log('Running test query...');
    const result = await pool.request().query('SELECT @@VERSION AS Version');
    console.log("SQL Server version:", result.recordset[0].Version);
    
    // Test if hotel schema exists
    try {
      const schemaResult = await pool.request().query(`
        SELECT schema_id FROM sys.schemas WHERE name = 'hotel'
      `);
      
      if (schemaResult.recordset.length > 0) {
        console.log("✅ Hotel schema exists");
        
        // Check if tables exist
        const tablesResult = await pool.request().query(`
          SELECT TABLE_NAME 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = 'hotel'
        `);
        
        console.log("Tables in hotel schema:", tablesResult.recordset.map(r => r.TABLE_NAME).join(', '));
      } else {
        console.log("❌ Hotel schema does not exist");
      }
    } catch (schemaError) {
      console.error("Error checking schema:", schemaError);
    }
    
    // Close the connection
    await pool.close();
    console.log("Connection closed");
    
    return true;
  } catch (error) {
    console.error("❌ Error connecting to SQL database:", error);
    console.log("Error details:", error.message);
    
    if (error.message.includes('AADSTS')) {
      console.log("\nThis appears to be an Azure AD authentication error. Please check:");
      console.log("1. Your AZURE_CLIENT_ID is correct");
      console.log("2. You are logged in with the correct Azure account");
      console.log("3. The application has permissions to access the database");
    }
    
    if (error.message.includes('firewall')) {
      console.log("\nThis appears to be a firewall issue. Please check:");
      console.log("1. Your IP address is allowed in the SQL Server firewall rules");
      console.log("2. You can add your current IP in the Azure Portal under SQL Server > Networking");
    }
    
    return false;
  }
}

// Run the test
testAzureADConnection()
  .then(success => {
    if (success) {
      console.log('\n✅ Azure AD authentication test completed successfully');
    } else {
      console.log('\n❌ Azure AD authentication test failed');
    }
  })
  .catch(err => {
    console.error('Unexpected error during test:', err);
  });
