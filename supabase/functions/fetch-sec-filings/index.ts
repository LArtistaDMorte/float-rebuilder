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

    // Fetch SEC filings using new EDGAR API
    // SEC EDGAR API documentation: https://www.sec.gov/edgar/sec-api-documentation
    const userAgent = 'FloatTracker/1.0 contact@example.com';
    
    // First, get the company tickers to find CIK
    const tickersResponse = await fetch(
      'https://www.sec.gov/files/company_tickers.json',
      { headers: { 'User-Agent': userAgent } }
    );

    if (!tickersResponse.ok) {
      throw new Error(`SEC API error: ${tickersResponse.statusText}`);
    }

    const tickersData = await tickersResponse.json();
    
    // Find CIK for the ticker
    const companyData = Object.values(tickersData).find(
      (company: any) => company.ticker.toUpperCase() === ticker.toUpperCase()
    ) as any;

    if (!companyData) {
      throw new Error(`Ticker ${ticker} not found in SEC database`);
    }

    const cik = String(companyData.cik_str).padStart(10, '0');
    
    // Fetch company submissions
    const submissionsResponse = await fetch(
      `https://data.sec.gov/submissions/CIK${cik}.json`,
      { headers: { 'User-Agent': userAgent } }
    );

    if (!submissionsResponse.ok) {
      throw new Error(`SEC submissions API error: ${submissionsResponse.statusText}`);
    }

    const submissionsData = await submissionsResponse.json();
    
    // Filter for relevant filing types
    const filingTypes = ['8-K', '10-Q', '10-K', 'S-1', 'S-3', '424B5'];
    const filings = [];

    const recentFilings = submissionsData.filings?.recent;
    if (recentFilings) {
      for (let i = 0; i < recentFilings.form.length && i < 200; i++) {
        const form = recentFilings.form[i];
        if (filingTypes.includes(form)) {
          filings.push({
            type: form,
            filingDate: recentFilings.filingDate[i],
            accessionNumber: recentFilings.accessionNumber[i].replace(/-/g, ''),
            primaryDocument: recentFilings.primaryDocument[i],
            cik: cik
          });
        }
      }
    }

    // Store filings in database
    const filingRecords = filings.map(filing => ({
      ticker_id: tickerRecord.data.id,
      filing_type: filing.type,
      filing_date: filing.filingDate,
      accession_number: filing.accessionNumber,
      filing_url: `https://www.sec.gov/Archives/edgar/data/${cik}/${filing.accessionNumber}/${filing.primaryDocument}`,
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
