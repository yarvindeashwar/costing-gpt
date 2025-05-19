import { NextRequest, NextResponse } from 'next/server';
import { AzureOpenAI } from 'openai';
import * as mssql from 'mssql';

// Configuration constants
const OPENAI_ENDPOINT = process.env.OPENAI_ENDPOINT || '';
const OPENAI_KEY = process.env.OPENAI_KEY || '';
const OPENAI_DEPLOYMENT = process.env.OPENAI_DEPLOYMENT || 'gpt-4-turbo';
const SQL_CONNECTION_STRING = process.env.SQL_CONN || '';
const TENANT_ID = process.env.TENANT_ID || 'demo-tenant';

// Initialize Azure OpenAI client
const client = new AzureOpenAI({
  apiKey: OPENAI_KEY,
  endpoint: OPENAI_ENDPOINT,
  deployment: OPENAI_DEPLOYMENT,
  apiVersion: "2023-05-15"
});

/**
 * Get the best rate from the Tariffs table based on search criteria
 */
async function getBestRate(city: string, category: string, start: string, end: string, pax: number) {
  let pool: mssql.ConnectionPool | null = null;
  
  try {
    // Create a new connection pool
    pool = await new mssql.ConnectionPool(SQL_CONNECTION_STRING).connect();
    
    // Set the tenant context for row-level security
    await pool.request().query(`EXEC app.sp_set_tenant_context @TenantId = '${TENANT_ID}'`);
    
    // Calculate number of nights
    const startDate = new Date(start);
    const endDate = new Date(end);
    const nights = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    // Query to get the best rate
    const query = `
      SELECT TOP 1
        p.Name AS HotelName,
        v.Name AS VendorName,
        t.BaseRate,
        t.GstPercent,
        t.ServiceFee,
        t.MealPlan,
        t.Season,
        JSON_VALUE(p.Description, '$.city') AS City,
        JSON_VALUE(p.Description, '$.category') AS Category
      FROM 
        app.Tariffs t
        JOIN app.Products p ON t.ProductId = p.ProductId
        JOIN app.Vendors v ON t.VendorId = v.VendorId
      WHERE 
        t.TenantId = @tenantId
        AND JSON_VALUE(p.Description, '$.city') LIKE @city
        AND JSON_VALUE(p.Description, '$.category') LIKE @category
        AND t.StartDate <= @startDate
        AND t.EndDate >= @endDate
      ORDER BY 
        (t.BaseRate * @nights) ASC
    `;
    
    const request = pool.request();
    request.input('tenantId', TENANT_ID);
    request.input('city', `%${city}%`);
    request.input('category', `%${category}%`);
    request.input('startDate', start);
    request.input('endDate', end);
    request.input('nights', nights);
    
    const result = await request.query(query);
    
    if (result.recordset.length === 0) {
      return {
        found: false,
        message: 'No matching rates found for the given criteria.'
      };
    }
    
    const hotel = result.recordset[0];
    const baseTotal = hotel.BaseRate * nights;
    const gstAmount = baseTotal * (hotel.GstPercent / 100);
    const totalPrice = baseTotal + gstAmount + hotel.ServiceFee;
    
    return {
      found: true,
      hotel: {
        name: hotel.HotelName,
        vendor: hotel.VendorName,
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
    console.error('Error getting best rate:', error);
    return {
      found: false,
      error: (error as Error).message
    };
  } finally {
    // Close the connection pool if it was created
    if (pool) {
      try {
        await pool.close();
      } catch (error) {
        console.error('Error closing SQL connection pool:', error);
      }
    }
  }
}

/**
 * Handles chat messages for AI-assisted costing
 * @route POST /api/chat
 */
export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();
    
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty messages array' },
        { status: 400 }
      );
    }

    // Define the tool for getting the best rate
    const tools = [
      {
        type: "function" as const,
        function: {
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
    const response = await client.chat.completions.create({
      model: OPENAI_DEPLOYMENT,
      messages: chatMessages,
      tools: tools,
      tool_choice: 'auto'
    });

    // Process tool calls if present
    const responseMessage = response.choices[0].message;
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Handle tool calls
      const toolCall = responseMessage.tool_calls[0];
      if (toolCall.function?.name === 'getBestRate') {
        const args = JSON.parse(toolCall.function.arguments);
        const { city, category, start, end, pax = 1 } = args;
        
        // Call the getBestRate function
        const rateResult = await getBestRate(city, category, start, end, pax);
        
        // Add the tool call result to the messages
        chatMessages.push(responseMessage);
        chatMessages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          content: JSON.stringify(rateResult)
        });
        
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
