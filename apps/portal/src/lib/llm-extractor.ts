// src/extractHotelTariff.ts

import { HotelTariff } from './document-intelligence';
import { AzureOpenAI } from 'openai';

//
// ─── ENV VARS ───────────────────────────────────────────────────────────────────
//
const endpoint       = process.env.OPENAI_ENDPOINT;
const apiKey         = process.env.OPENAI_KEY;
const deploymentName = process.env.OPENAI_DEPLOYMENT;
const apiVersion     = process.env.OPENAI_API_VERSION ?? '2024-12-01-preview';

if (!endpoint || !apiKey || !deploymentName) {
  throw new Error(
    'Missing Azure OpenAI configuration. ' +
    'Make sure OPENAI_ENDPOINT, OPENAI_KEY and OPENAI_DEPLOYMENT are all set in your env.'
  );
}

//
// ─── CLIENT ───────────────────────────────────────────────────────────────────
//
const client = new AzureOpenAI({
  apiKey,
  endpoint,                // e.g. https://costinggptmarvin1.openai.azure.com/
  deployment: deploymentName,
  apiVersion,
});

//
// ─── FUNCTION ─────────────────────────────────────────────────────────────────
//
/**
 * Extract hotel tariff information using Azure OpenAI
 * @param documentText The text content of the document
 * @returns Extracted hotel tariff info or null on failure
 */
export async function extractHotelTariffWithLLM(
  documentText: string
): Promise<HotelTariff | null> {
  try {
    // truncate to 4000 chars to stay under token limits
    const truncatedText = documentText.slice(0, 4000);

    const messages = [
      {
        role: 'system',
        content: 'You are an extraction assistant that outputs *only* valid JSON. Follow the exact format requirements.'
      },
      {
        role: 'user',
        content: `
Extract the following fields from the text below and return exactly one JSON object with keys:
hotelName, city, category, vendor, baseRate, gstPercent, serviceFee, mealPlan, season, startDate, endDate

IMPORTANT FORMATTING REQUIREMENTS:
1. All fields must be simple strings or numbers only, never objects or arrays
2. mealPlan must be a single string like "Breakfast Only" or "Breakfast, Lunch, Dinner"
3. baseRate, gstPercent, and serviceFee must be numeric values without currency symbols
4. startDate and endDate must be in YYYY-MM-DD format
5. If you're unsure about a value, use an empty string "" for text fields or 0 for numeric fields

Text:
${truncatedText}`
      }
    ];

    const resp = await client.chat.completions.create({
      model: deploymentName,
      messages,
      temperature: 0
    });

    const raw = resp.choices?.[0]?.message?.content?.trim();
    if (!raw) return null;

    const data = JSON.parse(raw);
    const today      = new Date().toISOString().split('T')[0];
    const inThirty   = new Date(Date.now() + 30 * 86400_000).toISOString().split('T')[0];

    // Process mealPlan to ensure it's a string, even if LLM returns an object
    let mealPlanValue = '';
    if (data.mealPlan) {
      if (typeof data.mealPlan === 'string') {
        mealPlanValue = data.mealPlan;
      } else if (typeof data.mealPlan === 'object') {
        // If it's an object like {Breakfast: true, Lunch: true, Dinner: false}
        // Convert it to a string like 'Breakfast, Lunch'
        mealPlanValue = Object.entries(data.mealPlan)
          .filter(([_, included]) => included)
          .map(([meal]) => meal)
          .join(', ');
      }
    }

    // Ensure we have valid dates
    const startDate = data.startDate && data.startDate.trim() ? data.startDate : today;
    const endDate = data.endDate && data.endDate.trim() ? data.endDate : inThirty;
    
    // Validate date formats (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const validStartDate = dateRegex.test(startDate) ? startDate : today;
    const validEndDate = dateRegex.test(endDate) ? endDate : inThirty;
    
    const tariff: HotelTariff = {
      hotelName:  data.hotelName  ?? '',
      city:       data.city       ?? '',
      category:   data.category   ?? '',
      vendor:     data.vendor     ?? '',
      baseRate:   parseFloat(data.baseRate)   || 0,
      gstPercent: parseFloat(data.gstPercent) || 0,
      serviceFee: parseFloat(data.serviceFee) || 0,
      mealPlan:   mealPlanValue,
      season:     data.season     ?? '',
      startDate:  validStartDate,
      endDate:    validEndDate,
      description: ''               // fill in as needed
    };

    return tariff;
  } catch (err) {
    console.error('extractHotelTariffWithLLM error:', err);
    return null;
  }
}
