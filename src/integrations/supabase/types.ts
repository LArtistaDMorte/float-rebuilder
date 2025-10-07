export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      corporate_actions: {
        Row: {
          action_date: string
          action_type: string
          created_at: string | null
          description: string
          filing_url: string | null
          id: string
          impact_description: string | null
          shares_after: number | null
          shares_before: number | null
          source: string | null
          split_ratio: string | null
          ticker_id: string
        }
        Insert: {
          action_date: string
          action_type: string
          created_at?: string | null
          description: string
          filing_url?: string | null
          id?: string
          impact_description?: string | null
          shares_after?: number | null
          shares_before?: number | null
          source?: string | null
          split_ratio?: string | null
          ticker_id: string
        }
        Update: {
          action_date?: string
          action_type?: string
          created_at?: string | null
          description?: string
          filing_url?: string | null
          id?: string
          impact_description?: string | null
          shares_after?: number | null
          shares_before?: number | null
          source?: string | null
          split_ratio?: string | null
          ticker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_actions_ticker_id_fkey"
            columns: ["ticker_id"]
            isOneToOne: false
            referencedRelation: "tickers"
            referencedColumns: ["id"]
          },
        ]
      }
      historical_data: {
        Row: {
          created_at: string | null
          date: string
          float_shares: number | null
          id: string
          market_cap: number | null
          outstanding_shares: number | null
          price: number | null
          source: string | null
          ticker_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          float_shares?: number | null
          id?: string
          market_cap?: number | null
          outstanding_shares?: number | null
          price?: number | null
          source?: string | null
          ticker_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          float_shares?: number | null
          id?: string
          market_cap?: number | null
          outstanding_shares?: number | null
          price?: number | null
          source?: string | null
          ticker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historical_data_ticker_id_fkey"
            columns: ["ticker_id"]
            isOneToOne: false
            referencedRelation: "tickers"
            referencedColumns: ["id"]
          },
        ]
      }
      sec_filings: {
        Row: {
          accession_number: string | null
          created_at: string | null
          filing_date: string
          filing_type: string
          filing_url: string | null
          id: string
          parsed_data: Json | null
          processed: boolean | null
          ticker_id: string
        }
        Insert: {
          accession_number?: string | null
          created_at?: string | null
          filing_date: string
          filing_type: string
          filing_url?: string | null
          id?: string
          parsed_data?: Json | null
          processed?: boolean | null
          ticker_id: string
        }
        Update: {
          accession_number?: string | null
          created_at?: string | null
          filing_date?: string
          filing_type?: string
          filing_url?: string | null
          id?: string
          parsed_data?: Json | null
          processed?: boolean | null
          ticker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sec_filings_ticker_id_fkey"
            columns: ["ticker_id"]
            isOneToOne: false
            referencedRelation: "tickers"
            referencedColumns: ["id"]
          },
        ]
      }
      tickers: {
        Row: {
          company_name: string | null
          created_at: string | null
          exchange: string | null
          id: string
          last_updated: string | null
          sector: string | null
          symbol: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string | null
          exchange?: string | null
          id?: string
          last_updated?: string | null
          sector?: string | null
          symbol: string
        }
        Update: {
          company_name?: string | null
          created_at?: string | null
          exchange?: string | null
          id?: string
          last_updated?: string | null
          sector?: string | null
          symbol?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
