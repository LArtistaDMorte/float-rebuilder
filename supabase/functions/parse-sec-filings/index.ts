import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, limit } = await req.json();
    const fetchLimit = typeof limit === 'number' ? limit : undefined;
    console.log(`Parsing SEC filings for ${ticker}${fetchLimit !== undefined ? `, limit: ${fetchLimit}` : ' (all unprocessed)'}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get ticker ID
    const { data: tickerData, error: tickerError } = await supabase
      .from('tickers')
      .select('id, symbol')
      .eq('symbol', ticker.toUpperCase())
      .maybeSingle();

    if (tickerError) throw tickerError;
    if (!tickerData) {
      return new Response(
        JSON.stringify({ error: 'Ticker not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get unprocessed filings
    let query = supabase
      .from('sec_filings')
      .select('*')
      .eq('ticker_id', tickerData.id)
      .eq('processed', false)
      .order('filing_date', { ascending: false });
    
    if (typeof fetchLimit === 'number') {
      query = query.limit(fetchLimit);
    }
    
    const { data: filings, error: filingsError } = await query;

    if (filingsError) throw filingsError;

    if (!filings || filings.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No unprocessed filings found',
          processed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${filings.length} unprocessed filings`);

    let processed = 0;
    let errors = 0;

    for (const filing of filings) {
      try {
        console.log(`Processing filing: ${filing.filing_type} from ${filing.filing_date}`);

        // Initialize extracted data structure
        let extractedData: any = { 
          outstanding_shares: null, 
          float_shares: null, 
          public_float_usd: null, 
          public_float_date: null, 
          corporate_actions: [] 
        };
        
        if (filing.filing_url) {
          try {
            const response = await fetch(filing.filing_url, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/html,application/xhtml+xml',
              }
            });
            const html = await response.text();
            
            // Basic HTML to text conversion
            const filingText = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            // Extract relevant sections for AI analysis
            const relevantSections: string[] = [];
            
            const coverPageMatch = filingText.match(/(class\s*of\s*stock|shares?\s+outstanding|public\s+float).{0,5000}/i);
            if (coverPageMatch) relevantSections.push(coverPageMatch[0]);
            
            const capitalMatch = filingText.match(/(capital\s+stock|stockholders.{0,200}equity|description\s+of\s+securities).{0,3000}/i);
            if (capitalMatch) relevantSections.push(capitalMatch[0]);

            const splitMatch = filingText.match(/(stock\s+split|reverse\s+split|split.{0,200}ratio).{0,2000}/gi);
            if (splitMatch) relevantSections.push(...splitMatch);

            const offeringMatch = filingText.match(/(public\s+offering|secondary\s+offering|registered\s+direct).{0,2000}/gi);
            if (offeringMatch) relevantSections.push(...offeringMatch);

            // Use regex to extract key data points
            // Outstanding shares (handle multiple phrasings)
            let outstandingMatch = filingText.match(/outstanding[:\s]+([0-9,\.]+)\s*(shares?|common\s+stock)/i);
            if (!outstandingMatch) {
              outstandingMatch = filingText.match(/shares?\s+outstanding[^0-9]{0,40}([0-9][0-9,\.]*)/i);
            }
            if (!outstandingMatch) {
              const alt = filingText.match(/as\s+of\s+[^\n]{0,60}?there\s+were\s+([0-9][0-9,\.]*)\s+(?:shares|of\s+common\s+stock)\s+outstanding/i);
              if (alt) outstandingMatch = alt;
            }
            if (outstandingMatch) {
              extractedData.outstanding_shares = Math.round(parseFloat(outstandingMatch[1].replace(/,/g, '')));
              console.log('Regex extracted outstanding shares:', extractedData.outstanding_shares);
            }

            // Public float in USD (aka aggregate market value of non-affiliates)
            let publicFloatMatch = filingText.match(/public\s+float[:\s]+\$([0-9,.]+)\s*(million|billion)?/i);
            if (!publicFloatMatch) {
              publicFloatMatch = filingText.match(/aggregate\s+market\s+value[^$]{0,120}\$([0-9,.]+)\s*(million|billion)?[^\n]{0,80}(?:held\s+by\s+non-affiliates|non\s*affiliates)/i);
            }
            if (publicFloatMatch) {
              let floatValue = parseFloat(publicFloatMatch[1].replace(/,/g, ''));
              const scale = publicFloatMatch[2]?.toLowerCase();
              if (scale === 'million') floatValue *= 1_000_000;
              if (scale === 'billion') floatValue *= 1_000_000_000;
              extractedData.public_float_usd = floatValue;
              console.log('Regex extracted public float USD:', extractedData.public_float_usd);
              
              const floatDateMatch = filingText.match(/(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i);
              if (floatDateMatch) {
                extractedData.public_float_date = floatDateMatch[0];
                console.log('Found public float date:', extractedData.public_float_date);
              }
            }

            const splitRatioMatch = filingText.match(/(\d+)\s*-?\s*for\s*-?\s*(\d+)\s*(reverse\s+)?split/i);
            if (splitRatioMatch) {
              console.log('Regex detected split:', splitRatioMatch[0]);
            }

            // Prepare focused text for AI
            const focusedText = relevantSections.length > 0 
              ? relevantSections.join('\n\n---\n\n').substring(0, 15000)
              : filingText.substring(0, 15000);

            // Enhanced AI prompt
            const aiPrompt = `You are analyzing a ${filing.filing_type} SEC filing. Extract ONLY the following data points:

1. outstanding_shares: Total common shares issued and outstanding (number only)
2. float_shares: Public float shares available for trading (if mentioned as share count)
3. public_float_usd: Public float value in USD (if mentioned as dollar amount)
4. public_float_date: Date associated with the public float figure (YYYY-MM-DD format)
5. corporate_actions: Array of material events (splits, reverse splits, offerings, buybacks)

CRITICAL RULES:
- Return NULL if data is not found or unclear
- For public_float_usd, only extract if it says "public float" with a dollar amount
- For corporate_actions, only include if there's an actual event with a date
- If you see a stock split, include the ratio (e.g., "1-for-10" for reverse split)

Filing sections:
${focusedText}

Return ONLY valid JSON with NO markdown:
{
  "outstanding_shares": number or null,
  "float_shares": number or null,
  "public_float_usd": number or null,
  "public_float_date": "YYYY-MM-DD" or null,
  "corporate_actions": [
    {
      "action_type": "split|reverse_split|offering|buyback",
      "action_date": "YYYY-MM-DD",
      "description": "concise description",
      "shares_before": number or null,
      "shares_after": number or null,
      "split_ratio": "X-for-Y" or null,
      "impact_description": "effect on float"
    }
  ]
}`;

            console.log('Sending to Lovable AI for analysis...');

            const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${lovableApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                  { 
                    role: 'system', 
                    content: 'You are a financial data extraction expert. Always return valid JSON only, no markdown or explanation.' 
                  },
                  { role: 'user', content: aiPrompt }
                ],
                temperature: 0.1,
              }),
            });

            if (!aiResponse.ok) {
              const errorText = await aiResponse.text();
              console.error('AI API error:', aiResponse.status, errorText);
              throw new Error(`AI API error: ${aiResponse.status}`);
            }

            const aiData = await aiResponse.json();
            const extractedContent = aiData.choices[0].message.content;
            
            console.log('AI response:', extractedContent);

            // Parse AI response and merge with regex data
            try {
              const cleanedContent = extractedContent
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
              const aiExtracted = JSON.parse(cleanedContent);
              
              // Merge: prefer AI data if present, otherwise use regex
              extractedData = {
                outstanding_shares: aiExtracted.outstanding_shares || extractedData.outstanding_shares,
                float_shares: aiExtracted.float_shares || extractedData.float_shares,
                public_float_usd: aiExtracted.public_float_usd || extractedData.public_float_usd,
                public_float_date: aiExtracted.public_float_date || extractedData.public_float_date,
                corporate_actions: aiExtracted.corporate_actions || []
              };
            } catch (parseError) {
              console.error('Failed to parse AI response:', extractedContent);
            }
          } catch (fetchError) {
            console.error('Error fetching filing document:', fetchError);
          }
        }

        // Convert public_float_usd to float_shares if needed
        if (extractedData.public_float_usd && !extractedData.float_shares) {
          console.log('Attempting to convert public_float_usd to float_shares...');
          
          const targetDate = extractedData.public_float_date || filing.filing_date;
          const { data: priceData } = await supabase
            .from('historical_data')
            .select('price, date')
            .eq('ticker_id', tickerData.id)
            .not('price', 'is', null)
            .order('date', { ascending: false })
            .limit(100);
          
          if (priceData && priceData.length > 0) {
            const targetTime = new Date(targetDate).getTime();
            let closestPrice = priceData[0];
            let minDiff = Math.abs(new Date(priceData[0].date).getTime() - targetTime);
            
            for (const p of priceData) {
              const diff = Math.abs(new Date(p.date).getTime() - targetTime);
              if (diff < minDiff) {
                minDiff = diff;
                closestPrice = p;
              }
            }
            
            if (closestPrice.price && closestPrice.price > 0) {
              extractedData.float_shares = Math.round(extractedData.public_float_usd / closestPrice.price);
              console.log(`Converted $${extractedData.public_float_usd} to ${extractedData.float_shares} shares using price $${closestPrice.price} from ${closestPrice.date}`);
            }
          }
        }

        // Compute market_cap if we have outstanding_shares
        let market_cap = null;
        if (extractedData.outstanding_shares) {
          const { data: priceData } = await supabase
            .from('historical_data')
            .select('price')
            .eq('ticker_id', tickerData.id)
            .eq('date', filing.filing_date)
            .maybeSingle();
          
          if (priceData?.price) {
            market_cap = extractedData.outstanding_shares * priceData.price;
            console.log(`Computed market cap: ${market_cap}`);
          }
        }

        // Insert or update historical data if we have share counts
        if (extractedData.outstanding_shares || extractedData.float_shares) {
          // First try to update existing row for that date
          const { data: updData, error: updErr } = await supabase
            .from('historical_data')
            .update({
              outstanding_shares: extractedData.outstanding_shares,
              float_shares: extractedData.float_shares,
              market_cap: market_cap,
              source: `SEC ${filing.filing_type}`,
            })
            .eq('ticker_id', tickerData.id)
            .eq('date', filing.filing_date)
            .select('id');

          if (updErr) {
            console.error('Error updating historical data:', updErr);
          }

          if (!updData || updData.length === 0) {
            const { error: insErr } = await supabase
              .from('historical_data')
              .insert({
                ticker_id: tickerData.id,
                date: filing.filing_date,
                outstanding_shares: extractedData.outstanding_shares,
                float_shares: extractedData.float_shares,
                market_cap: market_cap,
                source: `SEC ${filing.filing_type}`,
              });
            if (insErr) {
              console.error('Error inserting historical data:', insErr);
            } else {
              console.log('Inserted historical data for', filing.filing_date);
            }
          } else {
            console.log('Updated historical data for', filing.filing_date);
          }
        }

        // Insert corporate actions
        if (extractedData.corporate_actions && extractedData.corporate_actions.length > 0) {
          for (const action of extractedData.corporate_actions) {
            const { error: actionError } = await supabase
              .from('corporate_actions')
              .insert({
                ticker_id: tickerData.id,
                action_type: action.action_type,
                action_date: action.action_date,
                description: action.description,
                shares_before: action.shares_before,
                shares_after: action.shares_after,
                split_ratio: action.split_ratio,
                impact_description: action.impact_description,
                source: `SEC ${filing.filing_type}`,
                filing_url: filing.filing_url,
              });

            if (actionError) {
              console.error('Error inserting corporate action:', actionError);
            } else {
              console.log('Inserted corporate action:', action.action_type);
            }
          }
        }

        // Mark filing as processed
        const { error: updateError } = await supabase
          .from('sec_filings')
          .update({ 
            processed: true,
            parsed_data: extractedData,
          })
          .eq('id', filing.id);

        if (updateError) {
          console.error('Error updating filing:', updateError);
        } else {
          processed++;
          console.log(`Successfully processed filing ${filing.id}`);
        }

      } catch (filingError) {
        console.error(`Error processing filing ${filing.id}:`, filingError);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        ticker: ticker.toUpperCase(),
        processed,
        errors,
        total: filings.length,
        message: `Processed ${processed} of ${filings.length} filings`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in parse-sec-filings:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
