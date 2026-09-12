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
          is_active: boolean
          label: string
          points: number
          sort_order: number | null
        }
        Insert: {
          criterion_id: string
          description?: string | null
          id?: string
          is_active?: boolean
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
      criterion_audiences: {
        Row: {
          audience: string
          created_at: string | null
          is_active: boolean
          criterion_id: string
        }
        Insert: {
          audience: string
          created_at?: string | null
          is_active?: boolean
          criterion_id: string
        }
        Update: {
          audience?: string
          created_at?: string | null
          is_active?: boolean
          criterion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "criterion_audiences_criterion_id_fkey"
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
          grade_config_version_id: string | null
          id: string
          criteria_config_version_id: string | null
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
          grade_config_version_id?: string | null
          id?: string
          criteria_config_version_id?: string | null
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
          grade_config_version_id?: string | null
          id?: string
          criteria_config_version_id?: string | null
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
          result_message: string | null
          return_note: string | null
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
          result_message?: string | null
          return_note?: string | null
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
          result_message?: string | null
          return_note?: string | null
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
      ai_summaries: {
        Row: {
          coverage_dropped_items: number
          coverage_fields: Json
          coverage_fitted_items: number
          coverage_status: string
          coverage_total_items: number
          coverage_truncated: boolean
          created_at: string | null
          created_by: string | null
          id: string
          period_id: string
          source_generated_at: string | null
          source_revision: string | null
          summary: string
        }
        Insert: {
          coverage_dropped_items?: number
          coverage_fields?: Json
          coverage_fitted_items?: number
          coverage_status?: string
          coverage_total_items?: number
          coverage_truncated?: boolean
          created_at?: string | null
          created_by?: string | null
          id?: string
          period_id: string
          source_generated_at?: string | null
          source_revision?: string | null
          summary: string
        }
        Update: {
          coverage_dropped_items?: number
          coverage_fields?: Json
          coverage_fitted_items?: number
          coverage_status?: string
          coverage_total_items?: number
          coverage_truncated?: boolean
          created_at?: string | null
          created_by?: string | null
          id?: string
          period_id?: string
          source_generated_at?: string | null
          source_revision?: string | null
          summary?: string
        }
        Relationships: []
      }
      chat_usage: {
        Row: {
          id: string
          user_id: string
          created_at: string | null
          request_id: string | null
          status: string
        }
        Insert: {
          id?: string
          user_id: string
          created_at?: string | null
          request_id?: string | null
          status?: string
        }
        Update: {
          id?: string
          user_id?: string
          created_at?: string | null
          request_id?: string | null
          status?: string
        }
        Relationships: []
      }
      chat_reports: {
        Row: {
          id: string
          user_name: string
          role: string
          pathname: string
          question: string
          history: string
          created_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          id?: string
          user_name?: string
          role?: string
          pathname?: string
          question?: string
          history?: string
          created_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          id?: string
          user_name?: string
          role?: string
          pathname?: string
          question?: string
          history?: string
          created_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
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
          version_id: string
        }
        Insert: {
          created_at?: string | null
          grade: string
          id?: string
          max_score?: number | null
          min_score?: number | null
          role_group: string
          sort_order?: number
          version_id: string
        }
        Update: {
          created_at?: string | null
          grade?: string
          id?: string
          max_score?: number | null
          min_score?: number | null
          role_group?: string
          sort_order?: number
          version_id?: string
        }
        Relationships: []
      }
      grade_band_versions: {
        Row: {
          checksum: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          version_no: number
        }
        Insert: {
          checksum: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          version_no: number
        }
        Update: {
          checksum?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          version_no?: number
        }
        Relationships: []
      }
      criteria_config_versions: {
        Row: {
          checksum: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          version_no: number
        }
        Insert: {
          checksum: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          version_no: number
        }
        Update: {
          checksum?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          version_no?: number
        }
        Relationships: []
      }
      criteria_group_versions: {
        Row: {
          code: string
          group_id: string
          name: string
          short_name: string | null
          sort_order: number
          version_id: string
        }
        Insert: {
          code: string
          group_id: string
          name: string
          short_name?: string | null
          sort_order?: number
          version_id: string
        }
        Update: {
          code?: string
          group_id?: string
          name?: string
          short_name?: string | null
          sort_order?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "criteria_group_versions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "criteria_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      criterion_versions: {
        Row: {
          applies_to: string | null
          code: string
          default_level_index: number | null
          description: string | null
          group_id: string
          name: string
          sort_order: number
          version_id: string
          weight: number | null
          criterion_id: string
        }
        Insert: {
          applies_to?: string | null
          code: string
          default_level_index?: number | null
          description?: string | null
          group_id: string
          name: string
          sort_order?: number
          version_id: string
          weight?: number | null
          criterion_id: string
        }
        Update: {
          applies_to?: string | null
          code?: string
          default_level_index?: number | null
          description?: string | null
          group_id?: string
          name?: string
          sort_order?: number
          version_id?: string
          weight?: number | null
          criterion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "criterion_versions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "criteria_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      criterion_level_versions: {
        Row: {
          description: string | null
          label: string
          level_id: string
          points: number
          criterion_id: string
          sort_order: number
          version_id: string
        }
        Insert: {
          description?: string | null
          label: string
          level_id: string
          points: number
          criterion_id: string
          sort_order?: number
          version_id: string
        }
        Update: {
          description?: string | null
          label?: string
          level_id?: string
          points?: number
          criterion_id?: string
          sort_order?: number
          version_id?: string
        }
        Relationships: []
      }
      criterion_audience_versions: {
        Row: {
          audience: string
          criterion_id: string
          version_id: string
        }
        Insert: {
          audience: string
          criterion_id: string
          version_id: string
        }
        Update: {
          audience?: string
          criterion_id?: string
          version_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          description: string | null
          employee_code: string
          gender: string
          id: string
          is_active: boolean | null
          join_date: string | null
          name: string
          password_hash: string | null
          password_setup_required: boolean
          credential_revision: number
          role: string
          subleader_id: string | null
          team_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          employee_code: string
          gender?: string
          id?: string
          is_active?: boolean | null
          join_date?: string | null
          name: string
          password_hash?: string | null
          password_setup_required?: boolean
          credential_revision?: number
          role: string
          subleader_id?: string | null
          team_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          employee_code?: string
          gender?: string
          id?: string
          is_active?: boolean | null
          join_date?: string | null
          name?: string
          password_hash?: string | null
          password_setup_required?: boolean
          credential_revision?: number
          role?: string
          subleader_id?: string | null
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
      sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
          credential_revision: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
          credential_revision?: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
          credential_revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      password_setup_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_setup_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempted_at: string
          employee_code: string
          id: string
          ip: string
          request_id: string | null
          status: string
        }
        Insert: {
          attempted_at?: string
          employee_code: string
          id?: string
          ip: string
          request_id?: string | null
          status?: string
        }
        Update: {
          attempted_at?: string
          employee_code?: string
          id?: string
          ip?: string
          request_id?: string | null
          status?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          action: string
          created_at: string
          id: string
          request_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          action?: string
          created_at?: string
          id?: string
          request_id?: string | null
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          request_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_quota_reserve: {
        Args: {
          p_kind: string
          p_user_id: string
          p_request_id: string
          p_window_seconds?: number
          p_max_requests?: number
          p_retention_days?: number
          p_action?: string
        }
        Returns: {
          allowed: boolean
          error: string | null
        }[]
      }
      ai_quota_consume: {
        Args: {
          p_kind: string
          p_user_id: string
          p_request_id: string
        }
        Returns: {
          consumed: boolean
          error: string | null
        }[]
      }
      ai_quota_refund: {
        Args: {
          p_kind: string
          p_user_id: string
          p_request_id: string
        }
        Returns: {
          refunded: boolean
          error: string | null
        }[]
      }
      issue_session_transaction: {
        Args: {
          p_user_id: string
          p_expected_password_hash: string | null
          p_expected_password_setup_required: boolean
          p_expected_credential_revision: number
          p_token_hash: string
          p_expires_at: string
        }
        Returns: {
          user_id: string
        }[]
      }
      change_password_transaction: {
        Args: {
          p_user_id: string
          p_expected_password_hash: string
          p_new_password_hash: string
          p_current_session_token_hash?: string | null
          p_expected_credential_revision: number
        }
        Returns: {
          user_id: string
          revoked_sessions: number
        }[]
      }
      complete_password_setup_transaction: {
        Args: {
          p_token_hash: string
          p_password_hash: string
          p_expected_credential_revision: number | null
        }
        Returns: {
          user_id: string
        }[]
      }
      acquire_login_admission: {
        Args: {
          p_request_id: string
          p_employee_code: string
          p_ip: string
          p_window_seconds?: number
          p_max_account_attempts?: number
          p_max_ip_attempts?: number
          p_reservation_timeout_seconds?: number
        }
        Returns: {
          allowed: boolean
          account_attempts: number
          ip_attempts: number
          locked_by: string | null
          retry_after_seconds: number
        }[]
      }
      finalize_login_admission: {
        Args: {
          p_request_id: string
          p_employee_code: string
          p_ip: string
          p_success: boolean
          p_window_seconds?: number
          p_max_account_attempts?: number
          p_max_ip_attempts?: number
        }
        Returns: {
          finalized: boolean
          allowed: boolean
          account_attempts: number
          ip_attempts: number
          locked_by: string | null
          retry_after_seconds: number
        }[]
      }
      issue_session_finalize_login_admission: {
        Args: {
          p_user_id: string
          p_expected_password_hash: string | null
          p_expected_password_setup_required: boolean
          p_expected_credential_revision: number
          p_token_hash: string
          p_expires_at: string
          p_request_id: string
          p_employee_code: string
          p_ip: string
          p_max_account_attempts: number
          p_max_ip_attempts: number
          p_window_seconds: number
        }
        Returns: {
          user_id: string
        }[]
      }
      check_login_rate_limit: {
        Args: {
          p_employee_code: string
          p_ip: string
          p_window_seconds?: number
          p_max_account_attempts?: number
          p_max_ip_attempts?: number
        }
        Returns: {
          allowed: boolean
          account_attempts: number
          ip_attempts: number
          locked_by: string | null
          retry_after_seconds: number
        }[]
      }
      clear_login_attempts: {
        Args: {
          p_employee_code: string
          p_ip?: string | null
        }
        Returns: number
      }
      record_failed_login_transaction: {
        Args: {
          p_employee_code: string
          p_ip: string
          p_window_seconds?: number
          p_max_account_attempts?: number
          p_max_ip_attempts?: number
        }
        Returns: {
          allowed: boolean
          account_attempts: number
          ip_attempts: number
          locked_by: string | null
          retry_after_seconds: number
        }[]
      }
      reset_password_transaction: {
        Args: {
          p_user_id: string
          p_token_hash: string
          p_expires_at: string
          p_expected_credential_revision: number | null
        }
        Returns: {
          token_id: string
          user_id: string
          expires_at: string
        }[]
      }
      apply_personnel_transaction: {
        Args: {
          p_users: Json
          p_team?: Json | null
          p_actor_id: string
        }
        Returns: Json
      }
      upsert_ai_summary_if_active: {
        Args: {
          p_period_id: string
          p_summary: string
          p_created_by: string
          p_coverage_status: string
          p_coverage_total_items: number
          p_coverage_fitted_items: number
          p_coverage_dropped_items: number
          p_coverage_truncated: boolean
          p_coverage_fields: Json
          p_source_revision: string
          p_source_generated_at: string
        }
        Returns: Json
      }
      get_active_grade_config: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      save_grade_config: {
        Args: {
          p_bands: Json
          p_expected_version: number
        }
        Returns: Json
      }
      get_active_criteria_config: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      save_criteria_config: {
        Args: {
          p_config: Json
          p_expected_version: number
        }
        Returns: Json
      }
      save_evaluation_round_transaction_active_only: {
        Args: {
          p_evaluation_id: string
          p_round: number
          p_actor_id: string
          p_scores: Json
          p_notes: Json
          p_comment: string
          p_total_score: number
          p_grade: string
          p_is_submit: boolean | null
          p_submitted_at?: string
          p_next_round?: number | null
          p_next_evaluator_id?: string | null
          p_next_evaluator_role?: string | null
          p_next_status?: string | null
          p_is_final?: boolean
          p_criteria_config_version_id?: string | null
          p_grade_config_version_id?: string | null
        }
        Returns: {
          round_id: string
          evaluation_id: string
          next_round_id: string | null
          final_status: string
        }[]
      }
      return_evaluation_round_transaction: {
        Args: {
          p_evaluation_id: string
          p_round: number
          p_actor_id: string
          p_reason: string
        }
        Returns: {
          evaluation_id: string
          restored_round: number
          restored_status: string
        }[]
      }
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

export interface PasswordSetupTokenRecord {
  user_id: string
  token_hash: string
  expires_at: string
  used_at: string | null
}

export interface CredentialChangeRecord {
  user_id: string
  revoked_sessions: number
}

export interface LoginAttemptRecord {
  id: string
  employee_code: string
  ip: string
  attempted_at: string
  request_id: string | null
  status: string
}
