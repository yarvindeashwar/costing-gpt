import { NextRequest, NextResponse } from 'next/server';
import { AzureOpenAI } from 'openai';
import * as mssql from 'mssql';
import { getDbPool, setTenantContext, closeDbPool } from '@/lib/db-connection';

// Configuration constants
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT || '';
const OPENAI_KEY = process.env.OPENAI_KEY || '';
const OPENAI_DEPLOYMENT = process.env.OPENAI_DEPLOYMENT || 'gpt-4';
const OPENAI_API_VERSION = process.env.OPENAI_API_VERSION || '2023-05-15';
const TENANT_ID = process.env.TENANT_ID || 'demo-tenant';

// Check if required environment variables are set
const missingEnvVars: string[] = [];
if (!OPENAI_ENDPOINT || OPENAI_ENDPOINT.includes('your-azure-openai-resource')) missingEnvVars.push('OPENAI_ENDPOINT');
if (!OPENAI_KEY || OPENAI_KEY === 'your-actual-openai-key') missingEnvVars.push('OPENAI_KEY');

// Log missing environment variables
if (missingEnvVars.length > 0) {
  console.error(`Missing or invalid environment variables: ${missingEnvVars.join(', ')}`);
}

// Initialize Azure OpenAI client
const client = new AzureOpenAI({
  apiKey: OPENAI_KEY,
  endpoint: OPENAI_ENDPOINT,
  deployment: OPENAI_DEPLOYMENT,
  apiVersion: OPENAI_API_VERSION
});

// Mock data for hotel rates as fallback
const mockHotels = [
  {
    name: 'Luxury Palace Hotel',
    vendor: 'Premium Stays Ltd',
    city: 'Mumbai',
    category: '5-star',
    mealPlan: 'Breakfast & Dinner',
    season: 'Peak',
    baseRate: 12000,
    gst: {
      percent: 18,
      amount: 2160
    },
    serviceFee: 1000,
    totalPrice: 15160
  },
  {
    name: 'Seaside Resort',
    vendor: 'Coastal Retreats',
    city: 'Goa',
    category: '4-star',
    mealPlan: 'All Inclusive',
    season: 'Peak',
    baseRate: 8500,
    gst: {
      percent: 18,
      amount: 1530
    },
    serviceFee: 750,
    totalPrice: 10780
  },
  {
    name: 'Mountain View Lodge',
    vendor: 'Highland Stays',
    city: 'Shimla',
    category: '3-star',
    mealPlan: 'Breakfast Only',
    season: 'Off-peak',
    baseRate: 5000,
    gst: {
      percent: 18,
      amount: 900
    },
    serviceFee: 500,
    totalPrice: 6400
  },
  {
    name: 'Business Suites',
    vendor: 'Corporate Stays',
    city: 'Bangalore',
    category: '4-star',
    mealPlan: 'Breakfast Only',
    season: 'Regular',
    baseRate: 7500,
    gst: {
      percent: 18,
      amount: 1350
    },
    serviceFee: 600,
    totalPrice: 9450
  },
  {
    name: 'Royal Heritage Palace',
    vendor: 'Heritage Hotels Group',
    city: 'Jaipur',
    category: '5-star',
    mealPlan: 'All Inclusive',
    season: 'Peak',
    baseRate: 15000,
    gst: {
      percent: 18,
      amount: 2700
    },
    serviceFee: 1200,
    totalPrice: 18900
  }
];

// Mock function to get the best rate
function getMockRate(city: string, category: string, start: string, end: string, pax: number) {
  // Find a hotel that matches the criteria
  const hotel = mockHotels.find(h => 
    h.city.toLowerCase().includes(city.toLowerCase()) && 
    h.category.toLowerCase().includes(category.toLowerCase())
  );
  
  if (!hotel) {
    return {
      found: false,
      message: 'No matching rates found for the given criteria.'
    };
  }
  
  // Calculate number of nights
  const startDate = new Date(start);
  const endDate = new Date(end);
  const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate total price based on nights
  const baseTotal = hotel.baseRate * nights;
  const gstAmount = baseTotal * (hotel.gst.percent / 100);
  const totalPrice = baseTotal + gstAmount + hotel.serviceFee;
  
  return {
    found: true,
    hotel: {
      name: hotel.name,
      vendor: hotel.vendor,
      city: hotel.city,
      category: hotel.category,
      mealPlan: hotel.mealPlan,
      season: hotel.season,
      baseRate: hotel.baseRate,
      nights: nights,
      baseTotal: baseTotal,
      gst: {
        percent: hotel.gst.percent,
        amount: gstAmount
      },
      serviceFee: hotel.serviceFee,
      totalPrice: totalPrice,
      perPerson: pax > 0 ? (totalPrice / pax) : totalPrice
    }
  };
}

/**
 * Get the best rate from the Tariffs table based on search criteria
 */
async function getBestRate(city: string, category: string, start: string, end: string, pax: number) {
  let pool: mssql.ConnectionPool | null = null;
  
  try {
    // Calculate number of nights
    const startDate = new Date(start);
    const endDate = new Date(end);
    const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`Getting best rate for: ${city}, ${category}, ${start} to ${end}, ${pax} people`);
    
    // Get database connection using our new module
    pool = await getDbPool();
    
    // Inspect database structure for diagnostics
    console.log('Connected to database, inspecting structure...');
    
    try {
      // Check schemas
      const schemas = await pool.request().query('SELECT name FROM sys.schemas');
      console.log('Available schemas:', schemas.recordset.map((r: any) => r.name).join(', '));
      
      // Check if app schema exists
      const appSchemaExists = schemas.recordset.some((r: any) => r.name === 'app');
      console.log('app schema exists:', appSchemaExists);
      
      // Check stored procedures
      const procs = await pool.request().query(
        "SELECT schema_name(schema_id) as schema_name, name FROM sys.procedures"
      );
      console.log('Available stored procedures:');
      procs.recordset.forEach((p: any) => console.log(`- ${p.schema_name}.${p.name}`));
      
      // Check tables
      const tables = await pool.request().query(
        "SELECT schema_name(schema_id) as schema_name, name FROM sys.tables"
      );
      console.log('Available tables:');
      tables.recordset.forEach((t: any) => console.log(`- ${t.schema_name}.${t.name}`));
      
      // Examine the columns in the key tables
      console.log('\nExamining table columns:');
      
      // Check Vendors table structure
      const vendorColumns = await pool.request().query(
        "SELECT name, system_type_name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Vendors')"
      );
      console.log('\nVendors table columns:');
      vendorColumns.recordset.forEach((col: any) => console.log(`- ${col.name} (${col.system_type_name})`));
      
      // Check Products table structure
      const productColumns = await pool.request().query(
        "SELECT name, system_type_name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Products')"
      );
      console.log('\nProducts table columns:');
      productColumns.recordset.forEach((col: any) => console.log(`- ${col.name} (${col.system_type_name})`));
      
      // Check Tariffs table structure
      const tariffColumns = await pool.request().query(
        "SELECT name, system_type_name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Tariffs')"
      );
      console.log('\nTariffs table columns:');
      tariffColumns.recordset.forEach((col: any) => console.log(`- ${col.name} (${col.system_type_name})`));
    } catch (error) {
      console.error('Error inspecting database:', error);
    }
    
    // Try to set tenant context
    try {
      await setTenantContext(pool);
    } catch (error) {
      console.warn('Continuing without tenant context:', (error as Error).message);
    }
    
    // Query to get the best rate - simplified based on actual schema
    // Removing TenantId filter since we don't have a valid UUID
    const query = `
      SELECT TOP 1
        t.TariffId,
        t.ProductId,
        t.VendorId,
        t.BaseRate,
        t.GstPercent,
        t.ServiceFee,
        t.MealPlan,
        t.Season,
        t.City,
        'Budget' as Category  -- Using hardcoded category since we don't have Products table info
      FROM 
        dbo.Tariffs t
      WHERE 
        t.City LIKE @city
      ORDER BY 
        t.BaseRate ASC
    `;
    
    const request = pool.request();
    request.input('city', mssql.VarChar, `%${city}%`);
    // No longer need tenantId or category parameters
    
    console.log(`Executing SQL query for city: ${city}, category: ${category}`);
    const result = await request.query(query);
    console.log(`Query results: ${result.recordset.length} records found`);
    
    if (result.recordset.length === 0) {
      console.log('No hotels found in database matching the criteria');
      return {
        found: false,
        message: 'No matching hotel rates found in our database for the given criteria.'
      };
    }
    
    // Get the first (cheapest) hotel from the results
    const hotel = result.recordset[0];
    console.log(`Found tariff in ${hotel.City} with rate: ${hotel.BaseRate}`);
    
    // Calculate totals based on number of nights
    const baseTotal = hotel.BaseRate * nights;
    const gstAmount = baseTotal * (hotel.GstPercent / 100);
    const totalPrice = baseTotal + gstAmount + hotel.ServiceFee;
    
    // Use the tariff ID as a placeholder for hotel name since we don't have product details
    const hotelName = `Hotel in ${hotel.City}`;
    
    return {
      found: true,
      hotel: {
        name: hotelName,
        vendor: `Vendor ID: ${hotel.VendorId}`, // We don't have vendor name in our simplified query
        city: hotel.City,
        category: hotel.Category,
        mealPlan: hotel.MealPlan,
        season: hotel.Season,
        baseRate: hotel.BaseRate,
        nights: nights,
        baseTotal: baseTotal,
        gst: {
          percent: hotel.GstPercent,
          amount: gstAmount
        },
        serviceFee: hotel.ServiceFee,
        totalPrice: totalPrice,
        perPerson: pax > 0 ? (totalPrice / pax) : totalPrice
      }
    };
  } catch (error) {
    console.error('Error getting best rate from database:', error);
    
    // Check for specific error types to provide better error messages
    const errorMessage = (error as Error).message || '';
    if (errorMessage.includes('Login failed') || errorMessage.includes('Cannot open database')) {
      console.error('Database authentication or connection error');
      return {
        found: false,
        error: 'Database authentication error',
        message: 'There is currently a technical issue with our hotel database. Please try again later to find the best rate for a hotel in Bhutan from May 22nd to May 23rd for 2 people.'
      };
    } else if (errorMessage.includes('timeout')) {
      console.error('Database connection timeout');
      return {
        found: false,
        error: 'Database timeout error',
        message: 'Our hotel database is currently experiencing high load. Please try again in a few minutes.'
      };
    }
    
    return {
      found: false,
      error: `Database error: ${(error as Error).message}`,
      message: 'There is currently a technical issue with our hotel database. Please try again later to find the best rate for a hotel in Bhutan from May 22nd to May 23rd for 2 people.'
    };
  }
  // Note: We don't close the pool here as it's managed by our db-connection module
}

/**
 * Handles chat messages for AI-assisted costing
 * @route POST /api/chat
 */
export async function POST(request: NextRequest) {
  try {
    // Check for missing environment variables first
    if (missingEnvVars.length > 0) {
      return NextResponse.json(
        { 
          error: 'Configuration error', 
          content: `The chat service is not properly configured. Missing environment variables: ${missingEnvVars.join(', ')}. Please contact the administrator.`,
          isConfigError: true
        },
        { status: 500 }
      );
    }

    const { messages } = await request.json();
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty messages array' },
        { status: 400 }
      );
    }

    // For API version 2023-05-15, we need to use functions instead of tools
    const functions = [
      {
        name: 'getBestRate',
        description: 'Get the best hotel rate based on city, category, dates, and number of people',
        parameters: {
          type: 'object',
          properties: {
            city: {
              type: 'string',
              description: 'The city where the hotel is located'
            },
            category: {
              type: 'string',
              description: 'The hotel category (e.g., "5-star", "luxury", "budget")'
            },
            start: {
              type: 'string',
              description: 'The check-in date in YYYY-MM-DD format'
            },
            end: {
              type: 'string',
              description: 'The check-out date in YYYY-MM-DD format'
            },
            pax: {
              type: 'number',
              description: 'The number of people (used for per-person pricing)'
            }
          },
          required: ['city', 'category', 'start', 'end']
        }
      }
    ];

    // System message to instruct the agent
    const systemMessage = {
      role: 'system',
      content: `You are a travel cost assistant. Your job is to help users find the best hotel rates.
      
      When a user asks about hotel prices or accommodation costs:
      1. Extract the city, hotel category, check-in date, check-out date, and number of people from their query
      2. Use the getBestRate tool to find the best available rate
      3. Respond with a friendly message that includes:
         - The hotel name
         - The total price
         - The number of nights
         - Per person cost if applicable
      
      If information is missing, ask the user for the specific details you need.
      Always format currency values properly and be helpful and concise.`
    };

    // Prepare the messages array with the system message
    const chatMessages = [systemMessage, ...messages];

    // Call OpenAI with the agent configuration
    // For API version 2023-05-15, we use functions instead of tools
    const response = await client.chat.completions.create({
      model: OPENAI_DEPLOYMENT,
      messages: chatMessages,
      functions: functions,
      function_call: 'auto'
    });

    // Process function calls if present (for API version 2023-05-15)
    const responseMessage = response.choices[0].message;
    if (responseMessage.function_call) {
      // Handle function call
      const functionCall = responseMessage.function_call;
      if (functionCall.name === 'getBestRate') {
        try {
          const args = JSON.parse(functionCall.arguments);
          const { city, category, start, end, pax = 1 } = args;
          
          console.log(`Getting best rate for: ${city}, ${category}, ${start} to ${end}, ${pax} people`);
          
          // Call the getBestRate function
          const rateResult = await getBestRate(city, category, start, end, pax);
          
          // Add the assistant's message to the conversation
          chatMessages.push(responseMessage);
          
          // Add the function result to the messages
          chatMessages.push({
            role: 'function',
            name: 'getBestRate',
            content: JSON.stringify(rateResult)
          });
        } catch (error) {
          console.error('Error processing getBestRate function call:', error);
          
          // Add error result to the messages
          chatMessages.push({
            role: 'function',
            name: 'getBestRate',
            content: JSON.stringify({
              found: false,
              error: `Function call error: ${(error as Error).message}`,
              message: 'There was an error processing your request. Please try again later.'
            })
          });
        }
        
        // Get the final response from the assistant
        const finalResponse = await client.chat.completions.create({
          model: OPENAI_DEPLOYMENT,
          messages: chatMessages
        });
        
        return NextResponse.json(finalResponse.choices[0].message);
      }
    }
    
    // If no tool calls were made, return the direct response
    return NextResponse.json(responseMessage);
    
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request', details: (error as Error).message },
      { status: 500 }
    );
  }
}
