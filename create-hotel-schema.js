// Script to create hotel schema using Azure AD authentication
const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// Read the SQL schema file
const schemaFilePath = path.join(__dirname, 'hotel-schema.sql');
const schemaSql = fs.readFileSync(schemaFilePath, 'utf8');

// Split the SQL script into individual commands (split by GO statements)
const sqlCommands = schemaSql.split(/^\s*GO\s*$/m).filter(cmd => cmd.trim() !== '');

async function createSchema() {
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

    console.log('Connecting to SQL database using Azure AD Default authentication...');
    const pool = await new sql.ConnectionPool(config).connect();
    console.log('Connected to SQL database successfully');

    // Execute each SQL command
    for (const command of sqlCommands) {
      if (command.trim()) {
        try {
          console.log(`Executing SQL command: ${command.substring(0, 50)}...`);
          await pool.request().query(command);
          console.log('Command executed successfully');
        } catch (error) {
          console.error(`Error executing SQL command: ${error.message}`);
          console.error('Command was:', command);
        }
      }
    }

    console.log('Schema creation completed');
    await pool.close();
    console.log('Connection closed');
  } catch (error) {
    console.error('Error creating schema:', error);
  }
}

createSchema().catch(console.error);
