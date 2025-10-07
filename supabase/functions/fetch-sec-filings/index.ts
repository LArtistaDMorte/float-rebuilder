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
    const { ticker } = await req.json();
    
    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    console.log(`Fetching SEC filings for ${ticker}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Fetch SEC filings from EDGAR API
    // SEC EDGAR API documentation: https://www.sec.gov/edgar/sec-api-documentation
    const userAgent = 'FloatTracker/1.0 (contact@example.com)';
    
    const cikResponse = await fetch(
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${ticker}&type=&dateb=&owner=exclude&count=10&output=json`,
      { headers: { 'User-Agent': userAgent } }
    );

    if (!cikResponse.ok) {
      throw new Error(`SEC API error: ${cikResponse.statusText}`);
    }

    const cikData = await cikResponse.json();
    
    // Fetch recent filings (8-K, 10-Q, 10-K, S-1, etc.)
    const filingTypes = ['8-K', '10-Q', '10-K', 'S-1', 'S-3', '424B'];
    const filings = [];

    for (const filingType of filingTypes) {
      const filingResponse = await fetch(
        `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${ticker}&type=${filingType}&dateb=&owner=exclude&count=20&output=json`,
        { headers: { 'User-Agent': userAgent } }
      );

      if (filingResponse.ok) {
        const filingData = await filingResponse.json();
        if (filingData.filings?.recent) {
          filings.push(...filingData.filings.recent);
        }
      }

      // Rate limiting - SEC requires 10 requests per second max
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    // Store filings in database
    const filingRecords = filings.map(filing => ({
      ticker_id: tickerRecord.data.id,
      filing_type: filing.type,
      filing_date: filing.filingDate,
      accession_number: filing.accessionNumber,
      filing_url: `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${filing.cik}&accession_number=${filing.accessionNumber}&xbrl_type=v`,
      parsed_data: filing,
      processed: false
    }));

    const { data: insertedFilings, error: filingError } = await supabase
      .from('sec_filings')
      .upsert(filingRecords, { onConflict: 'accession_number' })
      .select();

    if (filingError) {
      console.error('Error inserting filings:', filingError);
    }

    console.log(`Successfully fetched ${filings.length} filings for ${ticker}`);

    return new Response(
      JSON.stringify({
        success: true,
        ticker: ticker.toUpperCase(),
        filings_count: filings.length,
        filings: insertedFilings || []
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching SEC filings:', error);
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
