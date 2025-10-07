-- Create tables for storing ticker and historical data

-- Tickers table
CREATE TABLE public.tickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL UNIQUE,
  company_name TEXT,
  exchange TEXT,
  sector TEXT,
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Historical float and market cap data
CREATE TABLE public.historical_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id UUID NOT NULL REFERENCES public.tickers(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  float_shares BIGINT,
  outstanding_shares BIGINT,
  market_cap NUMERIC(20, 2),
  price NUMERIC(10, 2),
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(ticker_id, date)
);

-- Corporate actions (splits, offerings, dilutions, etc.)
CREATE TABLE public.corporate_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id UUID NOT NULL REFERENCES public.tickers(id) ON DELETE CASCADE,
  action_date DATE NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('split', 'reverse_split', 'offering', 'warrant_exercise', 'dilution', 'name_change', 'ticker_change')),
  description TEXT NOT NULL,
  impact_description TEXT,
  shares_before BIGINT,
  shares_after BIGINT,
  split_ratio TEXT,
  filing_url TEXT,
  source TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- SEC filings tracking
CREATE TABLE public.sec_filings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker_id UUID NOT NULL REFERENCES public.tickers(id) ON DELETE CASCADE,
  filing_type TEXT NOT NULL,
  filing_date DATE NOT NULL,
  accession_number TEXT UNIQUE,
  filing_url TEXT,
  parsed_data JSONB,
  processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_historical_data_ticker_date ON public.historical_data(ticker_id, date DESC);
CREATE INDEX idx_corporate_actions_ticker_date ON public.corporate_actions(ticker_id, action_date DESC);
CREATE INDEX idx_sec_filings_ticker ON public.sec_filings(ticker_id, filing_date DESC);
CREATE INDEX idx_tickers_symbol ON public.tickers(symbol);

-- Enable Row Level Security
ALTER TABLE public.tickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sec_filings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (public read access for this analytics tool)
CREATE POLICY "Allow public read access to tickers"
  ON public.tickers FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to historical_data"
  ON public.historical_data FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to corporate_actions"
  ON public.corporate_actions FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to sec_filings"
  ON public.sec_filings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Function to update last_updated timestamp
CREATE OR REPLACE FUNCTION public.update_ticker_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.tickers
  SET last_updated = now()
  WHERE id = NEW.ticker_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to update ticker timestamp when new data is added
CREATE TRIGGER update_ticker_on_historical_data
  AFTER INSERT ON public.historical_data
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ticker_timestamp();