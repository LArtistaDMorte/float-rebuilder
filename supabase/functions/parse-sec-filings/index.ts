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
    const { ticker, limit = 5 } = await req.json();
    console.log(`Parsing SEC filings for ${ticker}, limit: ${limit}`);

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
    const { data: filings, error: filingsError } = await supabase
      .from('sec_filings')
      .select('*')
      .eq('ticker_id', tickerData.id)
      .eq('processed', false)
      .order('filing_date', { ascending: false })
      .limit(limit);

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

        // Fetch the actual filing document
        let filingText = '';
        if (filing.filing_url) {
          try {
            const response = await fetch(filing.filing_url, {
              headers: {
                'User-Agent': 'Mozilla/5.0',
                'Accept': 'text/html,application/xhtml+xml',
              }
            });
            const html = await response.text();
            
            // Basic HTML to text conversion - strip tags and get text content
            filingText = html
              .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
              .replace(/<[^>]+>/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            // Limit to first 30,000 characters to avoid token limits
            filingText = filingText.substring(0, 30000);
          } catch (fetchError) {
            console.error('Error fetching filing document:', fetchError);
            filingText = 'Filing document could not be retrieved.';
          }
        }

        // Use Lovable AI to extract data
        const aiPrompt = `You are a financial data extraction expert. Analyze this SEC ${filing.filing_type} filing and extract:

1. Outstanding shares count (total shares issued)
2. Float shares (shares available for public trading, excluding restricted/insider shares)
3. Any corporate actions (stock splits, reverse splits, offerings, buybacks)
4. Effective dates for each data point

Filing excerpt:
${filingText}

Return ONLY valid JSON in this exact format:
{
  "outstanding_shares": number or null,
  "float_shares": number or null,
  "market_cap": number or null,
  "corporate_actions": [
    {
      "action_type": "split|reverse_split|offering|buyback|other",
      "action_date": "YYYY-MM-DD",
      "description": "brief description",
      "shares_before": number or null,
      "shares_after": number or null,
      "split_ratio": "e.g., 2-for-1" or null,
      "impact_description": "how this affects float/shares"
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

        // Parse the AI response
        let extractedData;
        try {
          // Remove markdown code blocks if present
          const cleanedContent = extractedContent
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();
          extractedData = JSON.parse(cleanedContent);
        } catch (parseError) {
          console.error('Failed to parse AI response:', extractedContent);
          throw new Error('Invalid JSON from AI');
        }

        // Insert historical data if we have share counts
        if (extractedData.outstanding_shares || extractedData.float_shares) {
          const { error: histError } = await supabase
            .from('historical_data')
            .upsert({
              ticker_id: tickerData.id,
              date: filing.filing_date,
              outstanding_shares: extractedData.outstanding_shares,
              float_shares: extractedData.float_shares,
              market_cap: extractedData.market_cap,
              source: `SEC ${filing.filing_type}`,
            }, {
              onConflict: 'ticker_id,date',
              ignoreDuplicates: false,
            });

          if (histError) {
            console.error('Error inserting historical data:', histError);
          } else {
            console.log('Inserted historical data for', filing.filing_date);
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
