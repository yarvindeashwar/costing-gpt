import { getBestRate } from '@/lib/tools/getBestRate';
import * as sql from 'mssql';

// Mock the SQL module
jest.mock('mssql', () => {
  const mockRecordset = [
    {
      BaseRate: 10000,
      GstPercent: 18,
      ServiceFee: 1000,
      MealPlan: 'Breakfast & Dinner',
      Season: 'Peak'
    }
  ];

  return {
    ConnectionPool: jest.fn().mockImplementation(() => {
      return {
        connect: jest.fn().mockResolvedValue({}),
        request: jest.fn().mockReturnValue({
          input: jest.fn().mockReturnThis(),
          query: jest.fn().mockResolvedValue({ recordset: mockRecordset })
        }),
        close: jest.fn().mockResolvedValue({})
      };
    })
  };
});

// Mock the db-pool module
jest.mock('@/lib/db-pool', () => {
  return {
    db: jest.fn().mockResolvedValue({
      request: jest.fn().mockReturnValue({
        input: jest.fn().mockReturnThis(),
        query: jest.fn().mockResolvedValue({
          recordset: [
            {
              BaseRate: 10000,
              GstPercent: 18,
              ServiceFee: 1000,
              MealPlan: 'Breakfast & Dinner',
              Season: 'Peak'
            }
          ]
        })
      })
    })
  };
});

describe('getBestRate tool', () => {
  it('should return hotel rate information when found', async () => {
    const args = {
      city: 'Mumbai',
      category: '5-star',
      start: '2025-06-01',
      end: '2025-06-03',
      pax: 2
    };

    const result = await getBestRate.run(args);

    expect(result.found).toBe(true);
    expect(result.hotel).toBeDefined();
    expect(result.hotel.city).toBe('Mumbai');
    expect(result.hotel.category).toBe('5-star');
    expect(result.hotel.nights).toBe(2);
    expect(result.hotel.totalPrice).toBeDefined();
    expect(result.hotel.perPerson).toBeDefined();
  });
});
