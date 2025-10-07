import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, startDate, endDate } = await req.json();
    
    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    console.log(`Fetching market data for ${ticker} from ${startDate} to ${endDate}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('supabase_url')!;
    const supabaseKey = Deno.env.get('supabase_service_role_key')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get API keys from secrets (optional - configure based on which APIs you want to use)
    const finnhubKey = Deno.env.get('FINNHUB_API_KEY');
    const polygonKey = Deno.env.get('POLYGON_API_KEY');
    const alphaVantageKey = Deno.env.get('ALPHA_VANTAGE_API_KEY');

    // Get or create ticker record
    let tickerRecord = await supabase
      .from('tickers')
      .select('*')
      .eq('symbol', ticker.toUpperCase())
      .single();

    if (!tickerRecord.data) {
      const { data: newTicker, error: insertError } = await supabase
        .from('tickers')
        .insert({ symbol: ticker.toUpperCase() })
        .select()
        .single();
      
      if (insertError) throw insertError;
      tickerRecord.data = newTicker;
    }

    const historicalData = [];

    // Try Finnhub API (if key is available)
    if (finnhubKey) {
      try {
        // Fetch company profile for float data
        const profileResponse = await fetch(
          `https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${finnhubKey}`
        );
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          console.log('Finnhub profile data:', profileData);

          // Fetch historical prices
          const now = Math.floor(Date.now() / 1000);
          const oneYearAgo = now - (365 * 24 * 60 * 60);
          
          const candleResponse = await fetch(
            `https://finnhub.io/api/v1/stock/candle?symbol=${ticker}&resolution=D&from=${oneYearAgo}&to=${now}&token=${finnhubKey}`
          );

          if (candleResponse.ok) {
            const candleData = await candleResponse.json();
            
            if (candleData.c && candleData.c.length > 0) {
              for (let i = 0; i < candleData.c.length; i++) {
                const date = new Date(candleData.t[i] * 1000).toISOString().split('T')[0];
                const price = candleData.c[i];
                const shares = profileData.shareOutstanding || null;
                
                historicalData.push({
                  ticker_id: tickerRecord.data.id,
                  date,
                  price,
                  float_shares: shares ? Math.round(shares * 1000000) : null,
                  outstanding_shares: shares ? Math.round(shares * 1000000) : null,
                  market_cap: shares && price ? Math.round(shares * price * 1000000) : null,
                  source: 'finnhub'
                });
              }
            }
          }
        }
      } catch (error) {
        console.error('Finnhub API error:', error);
      }
    }

    // Try Polygon.io API (if key is available)
    if (polygonKey && historicalData.length === 0) {
      try {
        const from = startDate || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const to = endDate || new Date().toISOString().split('T')[0];
        
        const response = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?apiKey=${polygonKey}`
        );

        if (response.ok) {
          const data = await response.json();
          
          if (data.results) {
            for (const result of data.results) {
              const date = new Date(result.t).toISOString().split('T')[0];
              
              historicalData.push({
                ticker_id: tickerRecord.data.id,
                date,
                price: result.c,
                source: 'polygon'
              });
            }
          }
        }
      } catch (error) {
        console.error('Polygon API error:', error);
      }
    }

    // Try AlphaVantage API (if key is available)
    if (alphaVantageKey && historicalData.length === 0) {
      try {
        const response = await fetch(
          `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&outputsize=full&apikey=${alphaVantageKey}`
        );

        if (response.ok) {
          const data = await response.json();
          
          if (data['Time Series (Daily)']) {
            for (const [date, values] of Object.entries(data['Time Series (Daily)'])) {
              const dailyData = values as Record<string, string>;
              historicalData.push({
                ticker_id: tickerRecord.data.id,
                date,
                price: parseFloat(dailyData['4. close']),
                source: 'alphavantage'
              });
            }
          }
        }
      } catch (error) {
        console.error('AlphaVantage API error:', error);
      }
    }

    // Insert historical data into database
    if (historicalData.length > 0) {
      const { data: insertedData, error: insertError } = await supabase
        .from('historical_data')
        .upsert(historicalData, { onConflict: 'ticker_id,date' })
        .select();

      if (insertError) {
        console.error('Error inserting historical data:', insertError);
      }

      console.log(`Successfully inserted ${historicalData.length} data points`);

      return new Response(
        JSON.stringify({
          success: true,
          ticker: ticker.toUpperCase(),
          data_points: historicalData.length,
          data: insertedData || []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No API keys configured. Please add FINNHUB_API_KEY, POLYGON_API_KEY, or ALPHA_VANTAGE_API_KEY to secrets.',
          ticker: ticker.toUpperCase()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Error fetching market data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
