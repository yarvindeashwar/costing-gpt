/**
 * This module contains the extraction logic for hotel tariff documents
 */

/**
 * Extract hotel tariff information using multi-layered approach
 * @param {*} context Function context for logging
 * @param {Object} result Document analysis result
 * @returns {Object} Extracted tariff and method used
 */
async function extractHotelTariff(context, result) {
    try {
        // Log the structure of the result for debugging
        context.log('Document analysis result structure:', JSON.stringify(result, null, 2));
        
        // Layer 1: Try to extract from structured model output
        if (result.documents && result.documents.length > 0 && result.documents[0].docType === 'HotelTariff') {
            const tariff = extractFromStructuredModel(context, result.documents[0]);
            if (tariff) {
                return { tariff, extractionMethod: 'structured_model' };
            }
        }
        
        // Layer 2: Try to extract using regex patterns
        if (result.content) {
            const tariff = extractWithRegex(context, result.content);
            if (tariff && tariff.hotelName && (tariff.city || tariff.baseRate > 0)) {
                return { tariff, extractionMethod: 'regex' };
            }
        }
        
        // Layer 3: Try to extract using LLM
        if (result.content) {
            try {
                const tariff = await extractWithLLM(context, result.content);
                if (tariff && tariff.hotelName) {
                    return { tariff, extractionMethod: 'llm' };
                }
            } catch (llmError) {
                context.log.error('LLM extraction failed:', llmError);
            }
        }
        
        // No extraction methods worked
        context.log('No data could be extracted from the document');
        return { tariff: null, extractionMethod: 'none' };
    } catch (error) {
        context.log.error('Error extracting hotel tariff:', error);
        return { tariff: null, extractionMethod: 'error' };
    }
}

/**
 * Extract hotel tariff from structured model output
 * @param {*} context Function context for logging
 * @param {Object} doc Document from analysis result
 * @returns {Object|null} Extracted hotel tariff
 */
function extractFromStructuredModel(context, doc) {
    try {
        context.log('Found structured HotelTariff document:', JSON.stringify(doc, null, 2));
        
        // Extract fields from the document analysis result
        return {
            hotelName: doc.fields.hotelName?.content || '',
            vendor: doc.fields.vendor?.content || '',
            city: doc.fields.city?.content || '',
            category: doc.fields.category?.content || '',
            baseRate: parseFloat(doc.fields.baseRate?.content || '0'),
            gstPercent: parseFloat(doc.fields.gstPercent?.content || '0'),
            serviceFee: parseFloat(doc.fields.serviceFee?.content || '0'),
            mealPlan: doc.fields.mealPlan?.content || '',
            season: doc.fields.season?.content || '',
            startDate: doc.fields.startDate?.content || new Date().toISOString().split('T')[0],
            endDate: doc.fields.endDate?.content || new Date().toISOString().split('T')[0],
            description: doc.fields.description?.content || ''
        };
    } catch (error) {
        context.log.error('Error extracting from structured model:', error);
        return null;
    }
}

/**
 * Extract hotel tariff using regex patterns
 * @param {*} context Function context for logging
 * @param {string} content Document text content
 * @returns {Object|null} Extracted hotel tariff
 */
function extractWithRegex(context, content) {
    try {
        context.log('Attempting to extract hotel information using regex patterns');
        
        // Try to extract hotel name using regex patterns
        let hotelName = '';
        const hotelNameRegex = /(?:hotel|property|accommodation|resort)\s*(?:name)?\s*[:\-]?\s*([\w\s&]+)/i;
        const hotelNameMatch = content.match(hotelNameRegex);
        if (hotelNameMatch && hotelNameMatch[1]) {
            hotelName = hotelNameMatch[1].trim();
        }
        
        // Try to extract city
        let city = '';
        const cityRegex = /(?:city|location)\s*[:\-]?\s*([\w\s]+)/i;
        const cityMatch = content.match(cityRegex);
        if (cityMatch && cityMatch[1]) {
            city = cityMatch[1].trim();
        }
        
        // Try to extract category/star rating
        let category = '';
        const categoryRegex = /(?:category|star|rating)\s*[:\-]?\s*([\w\s\-]+)/i;
        const categoryMatch = content.match(categoryRegex);
        if (categoryMatch && categoryMatch[1]) {
            category = categoryMatch[1].trim();
        }
        
        // Try to extract rates
        let baseRate = 0;
        const rateRegex = /(?:rate|price|cost|amount)\s*[:\-]?\s*(?:Rs\.?|₹|INR)?\s*(\d[\d,\.]*)/i;
        const rateMatch = content.match(rateRegex);
        if (rateMatch && rateMatch[1]) {
            baseRate = parseFloat(rateMatch[1].replace(/,/g, ''));
        }
        
        // Try to extract GST
        let gstPercent = 0;
        const gstRegex = /(?:gst|tax)\s*[:\-]?\s*(\d+)\s*%/i;
        const gstMatch = content.match(gstRegex);
        if (gstMatch && gstMatch[1]) {
            gstPercent = parseFloat(gstMatch[1]);
        }
        
        // Try to extract vendor
        let vendor = '';
        const vendorRegex = /(?:vendor|provider|agency|travel\s*agent)\s*[:\-]?\s*([\w\s&]+)/i;
        const vendorMatch = content.match(vendorRegex);
        if (vendorMatch && vendorMatch[1]) {
            vendor = vendorMatch[1].trim();
        }
        
        // Try to extract meal plan
        let mealPlan = '';
        const mealPlanRegex = /(?:meal|board)\s*(?:plan|basis)?\s*[:\-]?\s*([\w\s&]+)/i;
        const mealPlanMatch = content.match(mealPlanRegex);
        if (mealPlanMatch && mealPlanMatch[1]) {
            mealPlan = mealPlanMatch[1].trim();
        }
        
        // Try to extract season
        let season = '';
        const seasonRegex = /(?:season)\s*[:\-]?\s*([\w\s&]+)/i;
        const seasonMatch = content.match(seasonRegex);
        if (seasonMatch && seasonMatch[1]) {
            season = seasonMatch[1].trim();
        }
        
        // Use only the extracted data without fallbacks
        const extractedTariff = {
            hotelName: hotelName,
            vendor: vendor,
            city: city,
            category: category,
            baseRate: baseRate,
            gstPercent: gstPercent,
            serviceFee: 0, // No fallback
            mealPlan: mealPlan,
            season: season,
            startDate: new Date().toISOString().split('T')[0], // Current date as default
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
            description: ''
        };
        
        context.log('Extracted tariff data using regex:', extractedTariff);
        return extractedTariff;
    } catch (error) {
        context.log.error('Error extracting with regex:', error);
        return null;
    }
}

/**
 * Extract hotel tariff using LLM
 * @param {*} context Function context for logging
 * @param {string} content Document text content
 * @returns {Object|null} Extracted hotel tariff
 */
async function extractWithLLM(context, content) {
    try {
        context.log('Attempting to extract hotel tariff information using LLM');
        
        // Create OpenAI client
        const openAIClient = new OpenAIClient(
            OPENAI_ENDPOINT,
            OPENAI_KEY ? { key: OPENAI_KEY } : new DefaultAzureCredential()
        );
        
        // Create a prompt for the LLM
        const prompt = `
You are an AI assistant specialized in extracting hotel tariff information from documents.
Extract the following information from the text below:
- Hotel Name
- City/Location
- Category/Star Rating
- Vendor/Provider
- Base Rate (numeric value only)
- GST/Tax Percentage (numeric value only)
- Service Fee (numeric value only)
- Meal Plan
- Season (if mentioned)
- Start Date (in YYYY-MM-DD format if available)
- End Date (in YYYY-MM-DD format if available)

If you cannot find a specific piece of information, leave it blank or use 0 for numeric values.
Format your response as a valid JSON object with the following keys:
hotelName, city, category, vendor, baseRate, gstPercent, serviceFee, mealPlan, season, startDate, endDate

Text:
${content.substring(0, 4000)} // Limit text to 4000 characters to avoid token limits
`;

        // Call the OpenAI API
        const response = await openAIClient.getChatCompletions(
            "gpt-4", // or your specific deployment name
            [
                { role: "system", content: "You are a specialized extraction assistant that only outputs valid JSON." },
                { role: "user", content: prompt }
            ],
            { responseFormat: { type: "json_object" } }
        );
        
        // Get the response text
        const responseText = response.choices[0].message.content;
        
        if (!responseText) {
            context.log('LLM returned empty response');
            return null;
        }
        
        try {
            // Parse the JSON response
            const extractedData = JSON.parse(responseText);
            context.log('LLM extracted data:', extractedData);
            
            // Convert to HotelTariff format
            const tariff = {
                hotelName: extractedData.hotelName || '',
                city: extractedData.city || '',
                category: extractedData.category || '',
                vendor: extractedData.vendor || '',
                baseRate: parseFloat(extractedData.baseRate) || 0,
                gstPercent: parseFloat(extractedData.gstPercent) || 0,
                serviceFee: parseFloat(extractedData.serviceFee) || 0,
                mealPlan: extractedData.mealPlan || '',
                season: extractedData.season || '',
                startDate: extractedData.startDate || new Date().toISOString().split('T')[0],
                endDate: extractedData.endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                description: ''
            };
            
            return tariff;
        } catch (parseError) {
            context.log.error('Error parsing LLM response:', parseError);
            context.log('Raw LLM response:', responseText);
            return null;
        }
    } catch (error) {
        context.log.error('Error calling LLM for extraction:', error);
        return null;
    }
}

module.exports = {
    extractHotelTariff,
    extractFromStructuredModel,
    extractWithRegex,
    extractWithLLM
};
