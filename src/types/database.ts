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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      criteria: {
        Row: {
          applies_to: string | null
          code: string
          default_level_index: number | null
          description: string | null
          group_id: string | null
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          weight: number | null
        }
        Insert: {
          applies_to?: string | null
          code: string
          default_level_index?: number | null
          description?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          weight?: number | null
        }
        Update: {
          applies_to?: string | null
          code?: string
          default_level_index?: number | null
          description?: string | null
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "criteria_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "criteria_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      criteria_groups: {
        Row: {
          code: string
          id: string
          is_active: boolean | null
          name: string
          short_name: string | null
          sort_order: number | null
        }
        Insert: {
          code: string
          id?: string
          is_active?: boolean | null
          name: string
          short_name?: string | null
          sort_order?: number | null
        }
        Update: {
          code?: string
          id?: string
          is_active?: boolean | null
          name?: string
          short_name?: string | null
          sort_order?: number | null
        }
        Relationships: []
      }
      criterion_levels: {
        Row: {
          criterion_id: string
          description: string | null
          id: string
          label: string
          points: number
          sort_order: number | null
        }
        Insert: {
          criterion_id: string
          description?: string | null
          id?: string
          label: string
          points: number
          sort_order?: number | null
        }
        Update: {
          criterion_id?: string
          description?: string | null
          id?: string
          label?: string
          points?: number
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "criterion_levels_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "criteria"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_periods: {
        Row: {
          closed_at: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          status: string
          target_grade: string
          target_rate: number
          year: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          status?: string
          target_grade?: string
          target_rate?: number
          year: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          status?: string
          target_grade?: string
          target_rate?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_responses: {
        Row: {
          comment: string | null
          created_at: string | null
          criterion_id: string | null
          id: string
          level_id: string | null
          points: number
          round_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          criterion_id?: string | null
          id?: string
          level_id?: string | null
          points: number
          round_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          criterion_id?: string | null
          id?: string
          level_id?: string | null
          points?: number
          round_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_responses_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_responses_level_id_fkey"
            columns: ["level_id"]
            isOneToOne: false
            referencedRelation: "criterion_levels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_responses_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "evaluation_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_rounds: {
        Row: {
          additional_comment: string | null
          comment: string | null
          created_at: string | null
          evaluation_id: string
          evaluator_id: string | null
          evaluator_role: string
          grade: string | null
          id: string
          notes: Json | null
          round: number
          scores: Json | null
          status: string
          submitted_at: string | null
          total_score: number | null
        }
        Insert: {
          additional_comment?: string | null
          comment?: string | null
          created_at?: string | null
          evaluation_id: string
          evaluator_id?: string | null
          evaluator_role: string
          grade?: string | null
          id?: string
          notes?: Json | null
          round: number
          scores?: Json | null
          status?: string
          submitted_at?: string | null
          total_score?: number | null
        }
        Update: {
          additional_comment?: string | null
          comment?: string | null
          created_at?: string | null
          evaluation_id?: string
          evaluator_id?: string | null
          evaluator_role?: string
          grade?: string | null
          id?: string
          notes?: Json | null
          round?: number
          scores?: Json | null
          status?: string
          submitted_at?: string | null
          total_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_rounds_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluation_rounds_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          created_at: string | null
          current_round: number | null
          employee_id: string
          employee_role: string
          final_grade: string | null
          final_score: number | null
          id: string
          period_id: string
          status: string
          team_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_round?: number | null
          employee_id: string
          employee_role: string
          final_grade?: string | null
          final_score?: number | null
          id?: string
          period_id: string
          status: string
          team_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_round?: number | null
          employee_id?: string
          employee_role?: string
          final_grade?: string | null
          final_score?: number | null
          id?: string
          period_id?: string
          status?: string
          team_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "evaluation_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          leader_id: string | null
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          leader_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_teams_leader"
            columns: ["leader_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          created_at: string | null
          detail: Record<string, unknown> | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string | null
          detail?: Record<string, unknown> | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string | null
          detail?: Record<string, unknown> | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      grade_bands: {
        Row: {
          created_at: string | null
          grade: string
          id: string
          max_score: number | null
          min_score: number | null
          role_group: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          grade: string
          id?: string
          max_score?: number | null
          min_score?: number | null
          role_group: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          grade?: string
          id?: string
          max_score?: number | null
          min_score?: number | null
          role_group?: string
          sort_order?: number
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          employee_code: string
          id: string
          is_active: boolean | null
          join_date: string | null
          name: string
          password_hash: string | null
          role: string
          team_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          employee_code: string
          id?: string
          is_active?: boolean | null
          join_date?: string | null
          name: string
          password_hash?: string | null
          role: string
          team_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          employee_code?: string
          id?: string
          is_active?: boolean | null
          join_date?: string | null
          name?: string
          password_hash?: string | null
          role?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
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
