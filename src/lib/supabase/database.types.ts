export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      ai_calls: {
        Row: {
          cache_hit: boolean | null;
          cache_read_tokens: number | null;
          cache_write_tokens: number | null;
          cost_usd: number | null;
          created_at: string;
          error: string | null;
          id: string;
          input_tokens: number | null;
          latency_ms: number | null;
          model: string;
          output_tokens: number | null;
          purpose: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          cache_hit?: boolean | null;
          cache_read_tokens?: number | null;
          cache_write_tokens?: number | null;
          cost_usd?: number | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model: string;
          output_tokens?: number | null;
          purpose: string;
          user_id?: string;
        };
        Update: {
          cache_hit?: boolean | null;
          cache_read_tokens?: number | null;
          cache_write_tokens?: number | null;
          cost_usd?: number | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          input_tokens?: number | null;
          latency_ms?: number | null;
          model?: string;
          output_tokens?: number | null;
          purpose?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      allowed_users: {
        Row: {
          created_at: string;
          email: string;
          note: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          email: string;
          note?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          note?: string | null;
        };
        Relationships: [];
      };
      day_targets: {
        Row: {
          calories: number;
          created_at: string;
          date: string;
          day_type: string;
          id: string;
          protein_g: number;
          reason: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          calories: number;
          created_at?: string;
          date: string;
          day_type: string;
          id?: string;
          protein_g: number;
          reason?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          calories?: number;
          created_at?: string;
          date?: string;
          day_type?: string;
          id?: string;
          protein_g?: number;
          reason?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      eval_cases: {
        Row: {
          created_at: string;
          expected_calories: number;
          expected_items: NonNullable<Json>;
          expected_protein_g: number;
          id: string;
          input_text: string;
          notes: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expected_calories: number;
          expected_items?: NonNullable<Json>;
          expected_protein_g: number;
          id?: string;
          input_text: string;
          notes?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          expected_calories?: number;
          expected_items?: NonNullable<Json>;
          expected_protein_g?: number;
          id?: string;
          input_text?: string;
          notes?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      foods: {
        Row: {
          brand: string | null;
          calories: number;
          carbs_g: number | null;
          created_at: string;
          fat_g: number | null;
          id: string;
          name: string;
          protein_g: number;
          provider: string;
          provider_id: string;
          raw: Json | null;
          serving_size: number | null;
          serving_unit: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand?: string | null;
          calories: number;
          carbs_g?: number | null;
          created_at?: string;
          fat_g?: number | null;
          id?: string;
          name: string;
          protein_g: number;
          provider: string;
          provider_id: string;
          raw?: Json | null;
          serving_size?: number | null;
          serving_unit?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          brand?: string | null;
          calories?: number;
          carbs_g?: number | null;
          created_at?: string;
          fat_g?: number | null;
          id?: string;
          name?: string;
          protein_g?: number;
          provider?: string;
          provider_id?: string;
          raw?: Json | null;
          serving_size?: number | null;
          serving_unit?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      meal_logs: {
        Row: {
          calories: number;
          carbs_g: number | null;
          client_id: string | null;
          confidence: string | null;
          created_at: string;
          fat_g: number | null;
          id: string;
          input_text: string | null;
          items: NonNullable<Json>;
          local_date: string;
          logged_at: string;
          modifiers: Json | null;
          portion: number;
          protein_g: number;
          saved_meal_id: string | null;
          source: string;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          calories: number;
          carbs_g?: number | null;
          client_id?: string | null;
          confidence?: string | null;
          created_at?: string;
          fat_g?: number | null;
          id?: string;
          input_text?: string | null;
          items?: NonNullable<Json>;
          local_date: string;
          logged_at?: string;
          modifiers?: Json | null;
          portion?: number;
          protein_g: number;
          saved_meal_id?: string | null;
          source: string;
          timezone: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          calories?: number;
          carbs_g?: number | null;
          client_id?: string | null;
          confidence?: string | null;
          created_at?: string;
          fat_g?: number | null;
          id?: string;
          input_text?: string | null;
          items?: NonNullable<Json>;
          local_date?: string;
          logged_at?: string;
          modifiers?: Json | null;
          portion?: number;
          protein_g?: number;
          saved_meal_id?: string | null;
          source?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "meal_logs_saved_meal_id_fkey";
            columns: ["saved_meal_id"];
            isOneToOne: false;
            referencedRelation: "saved_meals";
            referencedColumns: ["id"];
          },
        ];
      };
      places: {
        Row: {
          created_at: string;
          google_place_id: string | null;
          id: string;
          is_chain: boolean;
          menu_snapshot: Json | null;
          menu_snapshot_at: string | null;
          name: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          google_place_id?: string | null;
          id?: string;
          is_chain?: boolean;
          menu_snapshot?: Json | null;
          menu_snapshot_at?: string | null;
          name: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          google_place_id?: string | null;
          id?: string;
          is_chain?: boolean;
          menu_snapshot?: Json | null;
          menu_snapshot_at?: string | null;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          baseline_calories: number | null;
          calorie_floor: number;
          created_at: string;
          display_name: string | null;
          is_demo: boolean;
          long_run_distance_m: number;
          max_loss_lb_per_week: number;
          protein_long_run_g: number;
          protein_rest_g: number;
          protein_run_g: number;
          protein_strength_g: number;
          rest_day_deficit: number;
          timezone: string;
          units: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          baseline_calories?: number | null;
          calorie_floor?: number;
          created_at?: string;
          display_name?: string | null;
          is_demo?: boolean;
          long_run_distance_m?: number;
          max_loss_lb_per_week?: number;
          protein_long_run_g?: number;
          protein_rest_g?: number;
          protein_run_g?: number;
          protein_strength_g?: number;
          rest_day_deficit?: number;
          timezone?: string;
          units?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          baseline_calories?: number | null;
          calorie_floor?: number;
          created_at?: string;
          display_name?: string | null;
          is_demo?: boolean;
          long_run_distance_m?: number;
          max_loss_lb_per_week?: number;
          protein_long_run_g?: number;
          protein_rest_g?: number;
          protein_run_g?: number;
          protein_strength_g?: number;
          rest_day_deficit?: number;
          timezone?: string;
          units?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      saved_meals: {
        Row: {
          archived: boolean;
          calories: number;
          carbs_g: number | null;
          created_at: string;
          embedding: string | null;
          fat_g: number | null;
          id: string;
          items: NonNullable<Json>;
          last_used_at: string | null;
          name: string;
          nickname: string | null;
          place_id: string | null;
          protein_g: number;
          superseded_by: string | null;
          updated_at: string;
          use_count: number;
          user_id: string;
          version: number;
        };
        ComputedFields: never;
        Insert: {
          archived?: boolean;
          calories?: number;
          carbs_g?: number | null;
          created_at?: string;
          embedding?: string | null;
          fat_g?: number | null;
          id?: string;
          items?: NonNullable<Json>;
          last_used_at?: string | null;
          name: string;
          nickname?: string | null;
          place_id?: string | null;
          protein_g?: number;
          superseded_by?: string | null;
          updated_at?: string;
          use_count?: number;
          user_id?: string;
          version?: number;
        };
        Update: {
          archived?: boolean;
          calories?: number;
          carbs_g?: number | null;
          created_at?: string;
          embedding?: string | null;
          fat_g?: number | null;
          id?: string;
          items?: NonNullable<Json>;
          last_used_at?: string | null;
          name?: string;
          nickname?: string | null;
          place_id?: string | null;
          protein_g?: number;
          superseded_by?: string | null;
          updated_at?: string;
          use_count?: number;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "saved_meals_place_id_fkey";
            columns: ["place_id"];
            isOneToOne: false;
            referencedRelation: "places";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "saved_meals_superseded_by_fkey";
            columns: ["superseded_by"];
            isOneToOne: false;
            referencedRelation: "saved_meals";
            referencedColumns: ["id"];
          },
        ];
      };
      strava_connections: {
        Row: {
          access_token_encrypted: string | null;
          athlete_id: number;
          created_at: string;
          expires_at: string | null;
          refresh_token_encrypted: string;
          scopes: string[];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          access_token_encrypted?: string | null;
          athlete_id: number;
          created_at?: string;
          expires_at?: string | null;
          refresh_token_encrypted: string;
          scopes?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          access_token_encrypted?: string | null;
          athlete_id?: number;
          created_at?: string;
          expires_at?: string | null;
          refresh_token_encrypted?: string;
          scopes?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      weigh_ins: {
        Row: {
          created_at: string;
          id: string;
          measured_at: string;
          source: string;
          updated_at: string;
          user_id: string;
          weight_kg: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          measured_at: string;
          source?: string;
          updated_at?: string;
          user_id?: string;
          weight_kg: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          measured_at?: string;
          source?: string;
          updated_at?: string;
          user_id?: string;
          weight_kg?: number;
        };
        Relationships: [];
      };
      workouts: {
        Row: {
          calories_estimate: number | null;
          created_at: string;
          distance_m: number | null;
          duration_s: number | null;
          id: string;
          local_date: string;
          source: string;
          started_at: string;
          strava_activity_id: number | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          calories_estimate?: number | null;
          created_at?: string;
          distance_m?: number | null;
          duration_s?: number | null;
          id?: string;
          local_date: string;
          source: string;
          started_at: string;
          strava_activity_id?: number | null;
          type: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          calories_estimate?: number | null;
          created_at?: string;
          distance_m?: number | null;
          duration_s?: number | null;
          id?: string;
          local_date?: string;
          source?: string;
          started_at?: string;
          strava_activity_id?: number | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      hook_before_user_created: { Args: { event: Json }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
