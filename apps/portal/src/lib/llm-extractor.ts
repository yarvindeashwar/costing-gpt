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
        content: 'You are an extraction assistant that outputs *only* valid JSON.'
      },
      {
        role: 'user',
        content: `
Extract the following fields from the text below and return exactly one JSON object with keys:
hotelName, city, category, vendor, baseRate, gstPercent, serviceFee, mealPlan, season, startDate, endDate

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

    const tariff: HotelTariff = {
      hotelName:  data.hotelName  ?? '',
      city:       data.city       ?? '',
      category:   data.category   ?? '',
      vendor:     data.vendor     ?? '',
      baseRate:   parseFloat(data.baseRate)   || 0,
      gstPercent: parseFloat(data.gstPercent) || 0,
      serviceFee: parseFloat(data.serviceFee) || 0,
      mealPlan:   data.mealPlan   ?? '',
      season:     data.season     ?? '',
      startDate:  data.startDate  ?? today,
      endDate:    data.endDate    ?? inThirty,
      description: ''               // fill in as needed
    };

    return tariff;
  } catch (err) {
    console.error('extractHotelTariffWithLLM error:', err);
    return null;
  }
}
