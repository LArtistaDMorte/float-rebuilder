import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HistoricalDataPoint {
  date: string;
  float_shares: number | null;
  market_cap: number | null;
  price: number | null;
}

export interface CorporateAction {
  action_date: string;
  action_type: string;
  description: string;
  impact_description: string | null;
  shares_before: number | null;
  shares_after: number | null;
}

export const useTickerData = (ticker: string | null) => {
  return useQuery({
    queryKey: ["ticker-data", ticker],
    queryFn: async () => {
      if (!ticker) return null;

      // Get ticker record
      const { data: tickerData, error: tickerError } = await supabase
        .from("tickers")
        .select("*")
        .eq("symbol", ticker.toUpperCase())
        .maybeSingle();

      if (tickerError) throw tickerError;
      if (!tickerData) return null;

      // Get historical data
      const { data: historicalData, error: historicalError } = await supabase
        .from("historical_data")
        .select("date, float_shares, market_cap, price")
        .eq("ticker_id", tickerData.id)
        .order("date", { ascending: true });

      if (historicalError) throw historicalError;

      // Get corporate actions
      const { data: corporateActions, error: actionsError } = await supabase
        .from("corporate_actions")
        .select("*")
        .eq("ticker_id", tickerData.id)
        .order("action_date", { ascending: false });

      if (actionsError) throw actionsError;

      return {
        ticker: tickerData,
        historicalData: historicalData as HistoricalDataPoint[],
        corporateActions: corporateActions as CorporateAction[],
      };
    },
    enabled: !!ticker,
  });
};

export const useFetchMarketData = () => {
  return async (ticker: string) => {
    const { data, error } = await supabase.functions.invoke("fetch-market-data", {
      body: { ticker },
    });

    if (error) throw error;
    return data;
  };
};

export const useFetchSECFilings = () => {
  return async (ticker: string) => {
    const { data, error } = await supabase.functions.invoke("fetch-sec-filings", {
      body: { ticker },
    });

    if (error) throw error;
    return data;
  };
};
