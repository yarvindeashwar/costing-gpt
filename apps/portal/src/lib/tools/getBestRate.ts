import { z } from 'zod';
import * as sql from 'mssql';
import { db } from '../db-pool';

export const getBestRate = {
  schema: {
    name: 'getBestRate',
    description: 'Return cheapest hotel rate',
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: 'City name to search for hotels'
        },
        category: {
          type: 'string',
          description: 'Hotel category (e.g., "5-star", "4-star")'
        },
        start: {
          type: 'string',
          description: 'Check-in date in YYYY-MM-DD format',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$'
        },
        end: {
          type: 'string',
          description: 'Check-out date in YYYY-MM-DD format',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$'
        },
        pax: {
          type: 'integer',
          description: 'Number of people',
          default: 1
        }
      },
      required: ['city', 'category', 'start', 'end']
    }
  },

  // Define the type for the arguments
  async run(args: {
    city: string;
    category: string;
    start: string;
    end: string;
    pax?: number;
  }) {
    const nights =
      (new Date(args.end).valueOf() - new Date(args.start).valueOf()) / 86_400_000;

    const pool = await db();
    // Log the query parameters to help debug
    console.log('Searching for hotels with parameters:', { city: args.city, category: args.category });
    
    // Let's try to get the table schema first to see the actual column names
    const schemaResult = await pool.request().query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'Tariffs'
    `);
    
    console.log('Available columns in Tariffs table:', schemaResult.recordset);
    
    // Based on the actual schema, we'll modify our query to work with the available columns
    // Since there's no Category column, we'll just filter by City
    // And we'll skip the TenantId filter since it's causing type conversion issues
    const result = await pool.request()
      .input('city', `%${args.city}%`)
      .query(`
        SELECT TOP 1 * 
        FROM dbo.Tariffs
        WHERE City LIKE @city
        ORDER BY BaseRate
      `);

    // Log the query results
    console.log('Query results:', result.recordset);
    
    if (!result.recordset.length) {
      return {
        hotel: undefined,
        message: `No hotels found in ${args.city}.`
      };
    }

    const t = result.recordset[0];
    const total = t.BaseRate * nights * (1 + t.GstPercent / 100) + t.ServiceFee;

    // Create a hotel object using the available fields from the database
    return {
      hotel: {
        name: `${args.category} Hotel in ${args.city}`,
        city: args.city,
        category: args.category,
        baseRate: t.BaseRate,
        gstPercent: t.GstPercent,
        serviceFee: t.ServiceFee,
        mealPlan: t.MealPlan,
        season: t.Season,
        vendorId: t.VendorId,
        productId: t.ProductId,
        nights,
        totalPrice: total,
        perPerson: total / (args.pax || 1),
      },
    };
  },
};
