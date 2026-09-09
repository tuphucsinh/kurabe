-- KURABE P99M1T01 schema-only baseline.
-- Generated from authorized redacted catalog 99cf57ca6f69b02e86def267dded04b73057349dee04b2def14cf3ff6c10db38.
-- No production rows, PII, credentials, or connection strings.
BEGIN;
SET search_path = public;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public."ai_summaries" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "period_id" uuid NOT NULL,
  "summary" text NOT NULL,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."ai_usage" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "action" text DEFAULT 'ai'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."audit_logs" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "actor_id" text,
  "actor_name" text,
  "action" text NOT NULL,
  "entity" text NOT NULL,
  "entity_id" text,
  "detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."chat_reports" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_name" text DEFAULT ''::text NOT NULL,
  "role" text DEFAULT ''::text NOT NULL,
  "pathname" text DEFAULT ''::text NOT NULL,
  "question" text DEFAULT ''::text NOT NULL,
  "history" text DEFAULT ''::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'new'::text NOT NULL,
  "user_id" uuid
);

CREATE TABLE public."chat_usage" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."criteria" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "applies_to" text,
  "weight" integer DEFAULT 1,
  "group_id" uuid,
  "sort_order" integer DEFAULT 0,
  "default_level_index" integer,
  "is_active" boolean DEFAULT true
);

CREATE TABLE public."criteria_groups" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "short_name" text,
  "sort_order" integer DEFAULT 0,
  "is_active" boolean DEFAULT true
);

CREATE TABLE public."criterion_audiences" (
  "criterion_id" uuid NOT NULL,
  "audience" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."criterion_levels" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "criterion_id" uuid NOT NULL,
  "points" integer NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0
);

CREATE TABLE public."evaluation_periods" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "year" integer NOT NULL,
  "name" text NOT NULL,
  "status" text NOT NULL,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "closed_at" timestamp with time zone,
  "target_rate" integer DEFAULT 75 NOT NULL,
  "target_grade" text DEFAULT 'AB'::text NOT NULL
);

CREATE TABLE public."evaluation_responses" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "round_id" uuid,
  "criterion_id" uuid,
  "level_id" uuid,
  "points" integer NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."evaluation_rounds" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "evaluation_id" uuid NOT NULL,
  "round" integer NOT NULL,
  "evaluator_id" uuid,
  "evaluator_role" text NOT NULL,
  "scores" jsonb DEFAULT '{}'::jsonb,
  "notes" jsonb DEFAULT '{}'::jsonb,
  "total_score" numeric,
  "grade" text,
  "comment" text,
  "additional_comment" text,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "status" text DEFAULT 'Draft'::text NOT NULL
);

CREATE TABLE public."evaluations" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "period_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "employee_role" text NOT NULL,
  "team_id" uuid,
  "current_round" integer DEFAULT 1,
  "status" text NOT NULL,
  "final_grade" text,
  "final_score" numeric,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  "return_note" text,
  "result_message" text
);

CREATE TABLE public."grade_bands" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "role_group" text NOT NULL,
  "grade" text NOT NULL,
  "min_score" integer,
  "max_score" integer,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE public."login_attempts" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_code" text NOT NULL,
  "ip" text NOT NULL,
  "attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."sessions" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "token_hash" text NOT NULL,
  "user_id" uuid NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public."teams" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "leader_id" uuid,
  "created_at" timestamp with time zone DEFAULT now(),
  "is_active" boolean DEFAULT true
);

CREATE TABLE public."users" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "employee_code" text NOT NULL,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "team_id" uuid,
  "join_date" date,
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now(),
  "is_active" boolean DEFAULT true,
  "updated_at" timestamp with time zone DEFAULT now(),
  "password_hash" text,
  "subleader_id" uuid,
  "description" text,
  "gender" text DEFAULT 'Nữ'::text NOT NULL
);

ALTER TABLE public."ai_summaries" ADD CONSTRAINT "ai_summaries_pkey" PRIMARY KEY (id);
ALTER TABLE public."ai_usage" ADD CONSTRAINT "ai_usage_pkey" PRIMARY KEY (id);
ALTER TABLE public."audit_logs" ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY (id);
ALTER TABLE public."chat_reports" ADD CONSTRAINT "chat_reports_pkey" PRIMARY KEY (id);
ALTER TABLE public."chat_usage" ADD CONSTRAINT "chat_usage_pkey" PRIMARY KEY (id);
ALTER TABLE public."criteria" ADD CONSTRAINT "criteria_pkey" PRIMARY KEY (id);
ALTER TABLE public."criteria_groups" ADD CONSTRAINT "criteria_groups_pkey" PRIMARY KEY (id);
ALTER TABLE public."criterion_audiences" ADD CONSTRAINT "criterion_audiences_pkey" PRIMARY KEY (criterion_id, audience);
ALTER TABLE public."criterion_levels" ADD CONSTRAINT "criterion_levels_pkey" PRIMARY KEY (id);
ALTER TABLE public."evaluation_periods" ADD CONSTRAINT "evaluation_periods_pkey" PRIMARY KEY (id);
ALTER TABLE public."evaluation_responses" ADD CONSTRAINT "evaluation_responses_pkey" PRIMARY KEY (id);
ALTER TABLE public."evaluation_rounds" ADD CONSTRAINT "evaluation_rounds_pkey" PRIMARY KEY (id);
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_pkey" PRIMARY KEY (id);
ALTER TABLE public."grade_bands" ADD CONSTRAINT "grade_bands_pkey" PRIMARY KEY (id);
ALTER TABLE public."login_attempts" ADD CONSTRAINT "login_attempts_pkey" PRIMARY KEY (id);
ALTER TABLE public."sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."teams" ADD CONSTRAINT "teams_pkey" PRIMARY KEY (id);
ALTER TABLE public."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);
ALTER TABLE public."ai_summaries" ADD CONSTRAINT "ai_summaries_period_id_key" UNIQUE (period_id);
ALTER TABLE public."criteria" ADD CONSTRAINT "criteria_code_key" UNIQUE (code);
ALTER TABLE public."criteria_groups" ADD CONSTRAINT "criteria_groups_code_key" UNIQUE (code);
ALTER TABLE public."evaluation_rounds" ADD CONSTRAINT "uq_evaluation_rounds_eval_round" UNIQUE (evaluation_id, round);
ALTER TABLE public."evaluations" ADD CONSTRAINT "uq_evaluations_period_employee" UNIQUE (period_id, employee_id);
ALTER TABLE public."grade_bands" ADD CONSTRAINT "grade_bands_role_group_grade_key" UNIQUE (role_group, grade);
ALTER TABLE public."sessions" ADD CONSTRAINT "sessions_token_hash_key" UNIQUE (token_hash);
ALTER TABLE public."criterion_audiences" ADD CONSTRAINT "criterion_audiences_audience_check" CHECK (audience = ANY (ARRAY['management'::text, 'employee'::text, 'worker'::text]));
ALTER TABLE public."evaluation_rounds" ADD CONSTRAINT "chk_evaluation_rounds_round_range" CHECK (round >= 1 AND round <= 3);
ALTER TABLE public."evaluation_rounds" ADD CONSTRAINT "chk_evaluation_rounds_status_valid" CHECK (status = ANY (ARRAY['NotStarted'::text, 'Draft'::text, 'Submitted'::text]));
ALTER TABLE public."evaluation_rounds" ADD CONSTRAINT "chk_evaluation_rounds_total_score_non_negative" CHECK (total_score IS NULL OR total_score >= 0::numeric);
ALTER TABLE public."evaluations" ADD CONSTRAINT "chk_evaluations_current_round_range" CHECK (current_round IS NULL OR current_round >= 1 AND current_round <= 3);
ALTER TABLE public."evaluations" ADD CONSTRAINT "chk_evaluations_final_score_non_negative" CHECK (final_score IS NULL OR final_score >= 0::numeric);
ALTER TABLE public."evaluations" ADD CONSTRAINT "chk_evaluations_status_valid" CHECK (status = ANY (ARRAY['NotStarted'::text, 'Draft'::text, 'Submitted'::text, 'Reviewed'::text, 'Approved'::text]));
ALTER TABLE public."grade_bands" ADD CONSTRAINT "grade_bands_grade_check" CHECK (grade = ANY (ARRAY['S'::text, 'A'::text, 'AB'::text, 'B'::text, 'C'::text, 'D'::text]));
ALTER TABLE public."grade_bands" ADD CONSTRAINT "grade_bands_role_group_check" CHECK (role_group = ANY (ARRAY['leader'::text, 'staff'::text, 'worker'::text]));
ALTER TABLE public."ai_summaries" ADD CONSTRAINT "ai_summaries_period_id_fkey" FOREIGN KEY (period_id) REFERENCES evaluation_periods(id) ON DELETE CASCADE;
ALTER TABLE public."ai_usage" ADD CONSTRAINT "ai_usage_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."criteria" ADD CONSTRAINT "criteria_group_id_fkey" FOREIGN KEY (group_id) REFERENCES criteria_groups(id) ON DELETE CASCADE;
ALTER TABLE public."criterion_audiences" ADD CONSTRAINT "criterion_audiences_criterion_id_fkey" FOREIGN KEY (criterion_id) REFERENCES criteria(id) ON DELETE CASCADE;
ALTER TABLE public."criterion_levels" ADD CONSTRAINT "criterion_levels_criterion_id_fkey" FOREIGN KEY (criterion_id) REFERENCES criteria(id) ON DELETE CASCADE;
ALTER TABLE public."evaluation_periods" ADD CONSTRAINT "evaluation_periods_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."evaluation_responses" ADD CONSTRAINT "evaluation_responses_criterion_id_fkey" FOREIGN KEY (criterion_id) REFERENCES criteria(id);
ALTER TABLE public."evaluation_responses" ADD CONSTRAINT "evaluation_responses_level_id_fkey" FOREIGN KEY (level_id) REFERENCES criterion_levels(id);
ALTER TABLE public."evaluation_responses" ADD CONSTRAINT "evaluation_responses_round_id_fkey" FOREIGN KEY (round_id) REFERENCES evaluation_rounds(id) ON DELETE CASCADE;
ALTER TABLE public."evaluation_rounds" ADD CONSTRAINT "evaluation_rounds_evaluation_id_fkey" FOREIGN KEY (evaluation_id) REFERENCES evaluations(id) ON DELETE CASCADE;
ALTER TABLE public."evaluation_rounds" ADD CONSTRAINT "evaluation_rounds_evaluator_id_fkey" FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_employee_id_fkey" FOREIGN KEY (employee_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_period_id_fkey" FOREIGN KEY (period_id) REFERENCES evaluation_periods(id) ON DELETE CASCADE;
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE public."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE public."teams" ADD CONSTRAINT "fk_teams_leader" FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE public."users" ADD CONSTRAINT "users_subleader_id_fkey" FOREIGN KEY (subleader_id) REFERENCES users(id);
ALTER TABLE public."users" ADD CONSTRAINT "users_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL;

CREATE INDEX idx_ai_usage_user_time ON public.ai_usage USING btree (user_id, created_at);
CREATE INDEX chat_reports_user_created_idx ON public.chat_reports USING btree (user_id, created_at);
CREATE INDEX chat_usage_user_created_idx ON public.chat_usage USING btree (user_id, created_at);
CREATE INDEX idx_criteria_group_id ON public.criteria USING btree (group_id);
CREATE INDEX idx_criterion_audiences_audience ON public.criterion_audiences USING btree (audience);
CREATE INDEX idx_criterion_audiences_criterion_id ON public.criterion_audiences USING btree (criterion_id);
CREATE INDEX idx_criterion_levels_criterion_id ON public.criterion_levels USING btree (criterion_id);
CREATE INDEX idx_evaluation_periods_created_by ON public.evaluation_periods USING btree (created_by);
CREATE UNIQUE INDEX idx_evaluation_periods_single_active ON public.evaluation_periods USING btree (status) WHERE (status = 'active'::text);
CREATE INDEX idx_evaluation_responses_criterion_id ON public.evaluation_responses USING btree (criterion_id);
CREATE INDEX idx_evaluation_responses_level_id ON public.evaluation_responses USING btree (level_id);
CREATE INDEX idx_evaluation_responses_round_id ON public.evaluation_responses USING btree (round_id);
CREATE INDEX idx_evaluation_rounds_eval_round ON public.evaluation_rounds USING btree (evaluation_id, round);
CREATE INDEX idx_evaluation_rounds_evaluation_id ON public.evaluation_rounds USING btree (evaluation_id);
CREATE INDEX idx_evaluation_rounds_evaluator_id ON public.evaluation_rounds USING btree (evaluator_id);
CREATE INDEX idx_evaluations_employee_id ON public.evaluations USING btree (employee_id);
CREATE INDEX idx_evaluations_period_employee ON public.evaluations USING btree (period_id, employee_id);
CREATE INDEX idx_evaluations_period_id ON public.evaluations USING btree (period_id);
CREATE INDEX idx_evaluations_team_id ON public.evaluations USING btree (team_id);
CREATE INDEX idx_login_attempts_code_ip_time ON public.login_attempts USING btree (employee_code, ip, attempted_at);
CREATE INDEX idx_sessions_token_hash ON public.sessions USING btree (token_hash);
CREATE INDEX idx_sessions_user_expires ON public.sessions USING btree (user_id, expires_at);
CREATE INDEX idx_teams_leader_id ON public.teams USING btree (leader_id);
CREATE INDEX idx_users_team_id ON public.users USING btree (team_id);
CREATE UNIQUE INDEX users_employee_code_active_idx ON public.users USING btree (employee_code) WHERE (is_active = true);

\ir functions.sql

CREATE TRIGGER set_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER TABLE public."ai_summaries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."ai_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."chat_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."criteria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."criteria_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."criterion_audiences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."criterion_levels" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evaluation_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evaluation_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evaluation_rounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."grade_bands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."login_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."users" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_summaries_select_only" ON public."ai_summaries" FOR SELECT TO public USING (true);
CREATE POLICY "audit_logs_select_only" ON public."audit_logs" FOR SELECT TO public USING (true);
CREATE POLICY "criteria_select_only" ON public."criteria" FOR SELECT TO public USING (true);
CREATE POLICY "criteria_groups_select_only" ON public."criteria_groups" FOR SELECT TO public USING (true);
CREATE POLICY "criterion_audiences_select_only" ON public."criterion_audiences" FOR SELECT TO public USING (true);
CREATE POLICY "criterion_levels_select_only" ON public."criterion_levels" FOR SELECT TO public USING (true);
CREATE POLICY "evaluation_periods_select_only" ON public."evaluation_periods" FOR SELECT TO public USING (true);
CREATE POLICY "evaluation_responses_select_only" ON public."evaluation_responses" FOR SELECT TO public USING (true);
CREATE POLICY "evaluation_rounds_select_only" ON public."evaluation_rounds" FOR SELECT TO public USING (true);
CREATE POLICY "evaluations_select_only" ON public."evaluations" FOR SELECT TO public USING (true);
CREATE POLICY "grade_bands_select_only" ON public."grade_bands" FOR SELECT TO public USING (true);
CREATE POLICY "teams_select_only" ON public."teams" FOR SELECT TO public USING (true);
CREATE POLICY "users_select_only" ON public."users" FOR SELECT TO public USING (true);

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public."chat_usage" TO "anon";
GRANT SELECT ON TABLE public."criteria" TO "anon";
GRANT SELECT ON TABLE public."criteria_groups" TO "anon";
GRANT REFERENCES ON TABLE public."criterion_audiences" TO "anon";
GRANT SELECT ON TABLE public."criterion_audiences" TO "anon";
GRANT TRIGGER ON TABLE public."criterion_audiences" TO "anon";
GRANT SELECT ON TABLE public."criterion_levels" TO "anon";
GRANT SELECT ON TABLE public."evaluation_periods" TO "anon";
GRANT SELECT ON TABLE public."grade_bands" TO "anon";
GRANT DELETE ON TABLE public."ai_summaries" TO "authenticated";
GRANT INSERT ON TABLE public."ai_summaries" TO "authenticated";
GRANT REFERENCES ON TABLE public."ai_summaries" TO "authenticated";
GRANT SELECT ON TABLE public."ai_summaries" TO "authenticated";
GRANT TRIGGER ON TABLE public."ai_summaries" TO "authenticated";
GRANT TRUNCATE ON TABLE public."ai_summaries" TO "authenticated";
GRANT UPDATE ON TABLE public."ai_summaries" TO "authenticated";
GRANT DELETE ON TABLE public."ai_usage" TO "authenticated";
GRANT INSERT ON TABLE public."ai_usage" TO "authenticated";
GRANT REFERENCES ON TABLE public."ai_usage" TO "authenticated";
GRANT SELECT ON TABLE public."ai_usage" TO "authenticated";
GRANT TRIGGER ON TABLE public."ai_usage" TO "authenticated";
GRANT TRUNCATE ON TABLE public."ai_usage" TO "authenticated";
GRANT UPDATE ON TABLE public."ai_usage" TO "authenticated";
GRANT DELETE ON TABLE public."audit_logs" TO "authenticated";
GRANT INSERT ON TABLE public."audit_logs" TO "authenticated";
GRANT REFERENCES ON TABLE public."audit_logs" TO "authenticated";
GRANT SELECT ON TABLE public."audit_logs" TO "authenticated";
GRANT TRIGGER ON TABLE public."audit_logs" TO "authenticated";
GRANT TRUNCATE ON TABLE public."audit_logs" TO "authenticated";
GRANT UPDATE ON TABLE public."audit_logs" TO "authenticated";
GRANT DELETE ON TABLE public."chat_reports" TO "authenticated";
GRANT INSERT ON TABLE public."chat_reports" TO "authenticated";
GRANT REFERENCES ON TABLE public."chat_reports" TO "authenticated";
GRANT SELECT ON TABLE public."chat_reports" TO "authenticated";
GRANT TRIGGER ON TABLE public."chat_reports" TO "authenticated";
GRANT TRUNCATE ON TABLE public."chat_reports" TO "authenticated";
GRANT UPDATE ON TABLE public."chat_reports" TO "authenticated";
GRANT DELETE ON TABLE public."chat_usage" TO "authenticated";
GRANT INSERT ON TABLE public."chat_usage" TO "authenticated";
GRANT REFERENCES ON TABLE public."chat_usage" TO "authenticated";
GRANT SELECT ON TABLE public."chat_usage" TO "authenticated";
GRANT TRIGGER ON TABLE public."chat_usage" TO "authenticated";
GRANT TRUNCATE ON TABLE public."chat_usage" TO "authenticated";
GRANT UPDATE ON TABLE public."chat_usage" TO "authenticated";
GRANT DELETE ON TABLE public."criteria" TO "authenticated";
GRANT INSERT ON TABLE public."criteria" TO "authenticated";
GRANT REFERENCES ON TABLE public."criteria" TO "authenticated";
GRANT SELECT ON TABLE public."criteria" TO "authenticated";
GRANT TRIGGER ON TABLE public."criteria" TO "authenticated";
GRANT TRUNCATE ON TABLE public."criteria" TO "authenticated";
GRANT UPDATE ON TABLE public."criteria" TO "authenticated";
GRANT DELETE ON TABLE public."criteria_groups" TO "authenticated";
GRANT INSERT ON TABLE public."criteria_groups" TO "authenticated";
GRANT REFERENCES ON TABLE public."criteria_groups" TO "authenticated";
GRANT SELECT ON TABLE public."criteria_groups" TO "authenticated";
GRANT TRIGGER ON TABLE public."criteria_groups" TO "authenticated";
GRANT TRUNCATE ON TABLE public."criteria_groups" TO "authenticated";
GRANT UPDATE ON TABLE public."criteria_groups" TO "authenticated";
GRANT DELETE ON TABLE public."criterion_audiences" TO "authenticated";
GRANT INSERT ON TABLE public."criterion_audiences" TO "authenticated";
GRANT REFERENCES ON TABLE public."criterion_audiences" TO "authenticated";
GRANT SELECT ON TABLE public."criterion_audiences" TO "authenticated";
GRANT TRIGGER ON TABLE public."criterion_audiences" TO "authenticated";
GRANT TRUNCATE ON TABLE public."criterion_audiences" TO "authenticated";
GRANT UPDATE ON TABLE public."criterion_audiences" TO "authenticated";
GRANT DELETE ON TABLE public."criterion_levels" TO "authenticated";
GRANT INSERT ON TABLE public."criterion_levels" TO "authenticated";
GRANT REFERENCES ON TABLE public."criterion_levels" TO "authenticated";
GRANT SELECT ON TABLE public."criterion_levels" TO "authenticated";
GRANT TRIGGER ON TABLE public."criterion_levels" TO "authenticated";
GRANT TRUNCATE ON TABLE public."criterion_levels" TO "authenticated";
GRANT UPDATE ON TABLE public."criterion_levels" TO "authenticated";
GRANT DELETE ON TABLE public."evaluation_periods" TO "authenticated";
GRANT INSERT ON TABLE public."evaluation_periods" TO "authenticated";
GRANT REFERENCES ON TABLE public."evaluation_periods" TO "authenticated";
GRANT SELECT ON TABLE public."evaluation_periods" TO "authenticated";
GRANT TRIGGER ON TABLE public."evaluation_periods" TO "authenticated";
GRANT TRUNCATE ON TABLE public."evaluation_periods" TO "authenticated";
GRANT UPDATE ON TABLE public."evaluation_periods" TO "authenticated";
GRANT DELETE ON TABLE public."evaluation_responses" TO "authenticated";
GRANT INSERT ON TABLE public."evaluation_responses" TO "authenticated";
GRANT REFERENCES ON TABLE public."evaluation_responses" TO "authenticated";
GRANT SELECT ON TABLE public."evaluation_responses" TO "authenticated";
GRANT TRIGGER ON TABLE public."evaluation_responses" TO "authenticated";
GRANT TRUNCATE ON TABLE public."evaluation_responses" TO "authenticated";
GRANT UPDATE ON TABLE public."evaluation_responses" TO "authenticated";
GRANT DELETE ON TABLE public."evaluation_rounds" TO "authenticated";
GRANT INSERT ON TABLE public."evaluation_rounds" TO "authenticated";
GRANT REFERENCES ON TABLE public."evaluation_rounds" TO "authenticated";
GRANT SELECT ON TABLE public."evaluation_rounds" TO "authenticated";
GRANT TRIGGER ON TABLE public."evaluation_rounds" TO "authenticated";
GRANT TRUNCATE ON TABLE public."evaluation_rounds" TO "authenticated";
GRANT UPDATE ON TABLE public."evaluation_rounds" TO "authenticated";
GRANT DELETE ON TABLE public."evaluations" TO "authenticated";
GRANT INSERT ON TABLE public."evaluations" TO "authenticated";
GRANT REFERENCES ON TABLE public."evaluations" TO "authenticated";
GRANT SELECT ON TABLE public."evaluations" TO "authenticated";
GRANT TRIGGER ON TABLE public."evaluations" TO "authenticated";
GRANT TRUNCATE ON TABLE public."evaluations" TO "authenticated";
GRANT UPDATE ON TABLE public."evaluations" TO "authenticated";
GRANT DELETE ON TABLE public."grade_bands" TO "authenticated";
GRANT INSERT ON TABLE public."grade_bands" TO "authenticated";
GRANT REFERENCES ON TABLE public."grade_bands" TO "authenticated";
GRANT SELECT ON TABLE public."grade_bands" TO "authenticated";
GRANT TRIGGER ON TABLE public."grade_bands" TO "authenticated";
GRANT TRUNCATE ON TABLE public."grade_bands" TO "authenticated";
GRANT UPDATE ON TABLE public."grade_bands" TO "authenticated";
GRANT DELETE ON TABLE public."login_attempts" TO "authenticated";
GRANT INSERT ON TABLE public."login_attempts" TO "authenticated";
GRANT REFERENCES ON TABLE public."login_attempts" TO "authenticated";
GRANT SELECT ON TABLE public."login_attempts" TO "authenticated";
GRANT TRIGGER ON TABLE public."login_attempts" TO "authenticated";
GRANT TRUNCATE ON TABLE public."login_attempts" TO "authenticated";
GRANT UPDATE ON TABLE public."login_attempts" TO "authenticated";
GRANT DELETE ON TABLE public."sessions" TO "authenticated";
GRANT INSERT ON TABLE public."sessions" TO "authenticated";
GRANT REFERENCES ON TABLE public."sessions" TO "authenticated";
GRANT SELECT ON TABLE public."sessions" TO "authenticated";
GRANT TRIGGER ON TABLE public."sessions" TO "authenticated";
GRANT TRUNCATE ON TABLE public."sessions" TO "authenticated";
GRANT UPDATE ON TABLE public."sessions" TO "authenticated";
GRANT DELETE ON TABLE public."teams" TO "authenticated";
GRANT INSERT ON TABLE public."teams" TO "authenticated";
GRANT REFERENCES ON TABLE public."teams" TO "authenticated";
GRANT SELECT ON TABLE public."teams" TO "authenticated";
GRANT TRIGGER ON TABLE public."teams" TO "authenticated";
GRANT TRUNCATE ON TABLE public."teams" TO "authenticated";
GRANT UPDATE ON TABLE public."teams" TO "authenticated";
GRANT DELETE ON TABLE public."users" TO "authenticated";
GRANT INSERT ON TABLE public."users" TO "authenticated";
GRANT REFERENCES ON TABLE public."users" TO "authenticated";
GRANT SELECT ON TABLE public."users" TO "authenticated";
GRANT TRIGGER ON TABLE public."users" TO "authenticated";
GRANT TRUNCATE ON TABLE public."users" TO "authenticated";
GRANT UPDATE ON TABLE public."users" TO "authenticated";
GRANT DELETE ON TABLE public."ai_summaries" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."ai_summaries" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."ai_summaries" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."ai_summaries" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."ai_summaries" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."ai_summaries" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."ai_summaries" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."ai_usage" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."ai_usage" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."ai_usage" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."ai_usage" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."ai_usage" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."ai_usage" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."ai_usage" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."audit_logs" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."audit_logs" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."audit_logs" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."audit_logs" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."audit_logs" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."audit_logs" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."audit_logs" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."chat_reports" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."chat_reports" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."chat_reports" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."chat_reports" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."chat_reports" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."chat_reports" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."chat_reports" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."chat_usage" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."chat_usage" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."chat_usage" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."chat_usage" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."chat_usage" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."chat_usage" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."chat_usage" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."criteria" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."criteria" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."criteria" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."criteria" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."criteria" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."criteria" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."criteria" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."criteria_groups" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."criteria_groups" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."criteria_groups" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."criteria_groups" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."criteria_groups" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."criteria_groups" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."criteria_groups" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."criterion_audiences" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."criterion_audiences" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."criterion_audiences" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."criterion_audiences" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."criterion_audiences" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."criterion_audiences" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."criterion_audiences" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."criterion_levels" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."criterion_levels" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."criterion_levels" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."criterion_levels" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."criterion_levels" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."criterion_levels" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."criterion_levels" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."evaluation_periods" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."evaluation_periods" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."evaluation_periods" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."evaluation_periods" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."evaluation_periods" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."evaluation_periods" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."evaluation_periods" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."evaluation_responses" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."evaluation_responses" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."evaluation_responses" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."evaluation_responses" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."evaluation_responses" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."evaluation_responses" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."evaluation_responses" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."evaluation_rounds" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."evaluation_rounds" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."evaluation_rounds" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."evaluation_rounds" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."evaluation_rounds" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."evaluation_rounds" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."evaluation_rounds" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."evaluations" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."evaluations" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."evaluations" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."evaluations" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."evaluations" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."evaluations" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."evaluations" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."grade_bands" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."grade_bands" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."grade_bands" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."grade_bands" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."grade_bands" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."grade_bands" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."grade_bands" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."login_attempts" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."login_attempts" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."login_attempts" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."login_attempts" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."login_attempts" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."login_attempts" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."login_attempts" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."sessions" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."sessions" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."sessions" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."sessions" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."sessions" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."sessions" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."sessions" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."teams" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."teams" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."teams" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."teams" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."teams" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."teams" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."teams" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."users" TO "postgres" WITH GRANT OPTION;
GRANT INSERT ON TABLE public."users" TO "postgres" WITH GRANT OPTION;
GRANT REFERENCES ON TABLE public."users" TO "postgres" WITH GRANT OPTION;
GRANT SELECT ON TABLE public."users" TO "postgres" WITH GRANT OPTION;
GRANT TRIGGER ON TABLE public."users" TO "postgres" WITH GRANT OPTION;
GRANT TRUNCATE ON TABLE public."users" TO "postgres" WITH GRANT OPTION;
GRANT UPDATE ON TABLE public."users" TO "postgres" WITH GRANT OPTION;
GRANT DELETE ON TABLE public."ai_summaries" TO "service_role";
GRANT INSERT ON TABLE public."ai_summaries" TO "service_role";
GRANT REFERENCES ON TABLE public."ai_summaries" TO "service_role";
GRANT SELECT ON TABLE public."ai_summaries" TO "service_role";
GRANT TRIGGER ON TABLE public."ai_summaries" TO "service_role";
GRANT TRUNCATE ON TABLE public."ai_summaries" TO "service_role";
GRANT UPDATE ON TABLE public."ai_summaries" TO "service_role";
GRANT DELETE ON TABLE public."ai_usage" TO "service_role";
GRANT INSERT ON TABLE public."ai_usage" TO "service_role";
GRANT REFERENCES ON TABLE public."ai_usage" TO "service_role";
GRANT SELECT ON TABLE public."ai_usage" TO "service_role";
GRANT TRIGGER ON TABLE public."ai_usage" TO "service_role";
GRANT TRUNCATE ON TABLE public."ai_usage" TO "service_role";
GRANT UPDATE ON TABLE public."ai_usage" TO "service_role";
GRANT DELETE ON TABLE public."audit_logs" TO "service_role";
GRANT INSERT ON TABLE public."audit_logs" TO "service_role";
GRANT REFERENCES ON TABLE public."audit_logs" TO "service_role";
GRANT SELECT ON TABLE public."audit_logs" TO "service_role";
GRANT TRIGGER ON TABLE public."audit_logs" TO "service_role";
GRANT TRUNCATE ON TABLE public."audit_logs" TO "service_role";
GRANT UPDATE ON TABLE public."audit_logs" TO "service_role";
GRANT DELETE ON TABLE public."chat_reports" TO "service_role";
GRANT INSERT ON TABLE public."chat_reports" TO "service_role";
GRANT REFERENCES ON TABLE public."chat_reports" TO "service_role";
GRANT SELECT ON TABLE public."chat_reports" TO "service_role";
GRANT TRIGGER ON TABLE public."chat_reports" TO "service_role";
GRANT TRUNCATE ON TABLE public."chat_reports" TO "service_role";
GRANT UPDATE ON TABLE public."chat_reports" TO "service_role";
GRANT DELETE ON TABLE public."chat_usage" TO "service_role";
GRANT INSERT ON TABLE public."chat_usage" TO "service_role";
GRANT REFERENCES ON TABLE public."chat_usage" TO "service_role";
GRANT SELECT ON TABLE public."chat_usage" TO "service_role";
GRANT TRIGGER ON TABLE public."chat_usage" TO "service_role";
GRANT TRUNCATE ON TABLE public."chat_usage" TO "service_role";
GRANT UPDATE ON TABLE public."chat_usage" TO "service_role";
GRANT DELETE ON TABLE public."criteria" TO "service_role";
GRANT INSERT ON TABLE public."criteria" TO "service_role";
GRANT REFERENCES ON TABLE public."criteria" TO "service_role";
GRANT SELECT ON TABLE public."criteria" TO "service_role";
GRANT TRIGGER ON TABLE public."criteria" TO "service_role";
GRANT TRUNCATE ON TABLE public."criteria" TO "service_role";
GRANT UPDATE ON TABLE public."criteria" TO "service_role";
GRANT DELETE ON TABLE public."criteria_groups" TO "service_role";
GRANT INSERT ON TABLE public."criteria_groups" TO "service_role";
GRANT REFERENCES ON TABLE public."criteria_groups" TO "service_role";
GRANT SELECT ON TABLE public."criteria_groups" TO "service_role";
GRANT TRIGGER ON TABLE public."criteria_groups" TO "service_role";
GRANT TRUNCATE ON TABLE public."criteria_groups" TO "service_role";
GRANT UPDATE ON TABLE public."criteria_groups" TO "service_role";
GRANT DELETE ON TABLE public."criterion_audiences" TO "service_role";
GRANT INSERT ON TABLE public."criterion_audiences" TO "service_role";
GRANT REFERENCES ON TABLE public."criterion_audiences" TO "service_role";
GRANT SELECT ON TABLE public."criterion_audiences" TO "service_role";
GRANT TRIGGER ON TABLE public."criterion_audiences" TO "service_role";
GRANT TRUNCATE ON TABLE public."criterion_audiences" TO "service_role";
GRANT UPDATE ON TABLE public."criterion_audiences" TO "service_role";
GRANT DELETE ON TABLE public."criterion_levels" TO "service_role";
GRANT INSERT ON TABLE public."criterion_levels" TO "service_role";
GRANT REFERENCES ON TABLE public."criterion_levels" TO "service_role";
GRANT SELECT ON TABLE public."criterion_levels" TO "service_role";
GRANT TRIGGER ON TABLE public."criterion_levels" TO "service_role";
GRANT TRUNCATE ON TABLE public."criterion_levels" TO "service_role";
GRANT UPDATE ON TABLE public."criterion_levels" TO "service_role";
GRANT DELETE ON TABLE public."evaluation_periods" TO "service_role";
GRANT INSERT ON TABLE public."evaluation_periods" TO "service_role";
GRANT REFERENCES ON TABLE public."evaluation_periods" TO "service_role";
GRANT SELECT ON TABLE public."evaluation_periods" TO "service_role";
GRANT TRIGGER ON TABLE public."evaluation_periods" TO "service_role";
GRANT TRUNCATE ON TABLE public."evaluation_periods" TO "service_role";
GRANT UPDATE ON TABLE public."evaluation_periods" TO "service_role";
GRANT DELETE ON TABLE public."evaluation_responses" TO "service_role";
GRANT INSERT ON TABLE public."evaluation_responses" TO "service_role";
GRANT REFERENCES ON TABLE public."evaluation_responses" TO "service_role";
GRANT SELECT ON TABLE public."evaluation_responses" TO "service_role";
GRANT TRIGGER ON TABLE public."evaluation_responses" TO "service_role";
GRANT TRUNCATE ON TABLE public."evaluation_responses" TO "service_role";
GRANT UPDATE ON TABLE public."evaluation_responses" TO "service_role";
GRANT DELETE ON TABLE public."evaluation_rounds" TO "service_role";
GRANT INSERT ON TABLE public."evaluation_rounds" TO "service_role";
GRANT REFERENCES ON TABLE public."evaluation_rounds" TO "service_role";
GRANT SELECT ON TABLE public."evaluation_rounds" TO "service_role";
GRANT TRIGGER ON TABLE public."evaluation_rounds" TO "service_role";
GRANT TRUNCATE ON TABLE public."evaluation_rounds" TO "service_role";
GRANT UPDATE ON TABLE public."evaluation_rounds" TO "service_role";
GRANT DELETE ON TABLE public."evaluations" TO "service_role";
GRANT INSERT ON TABLE public."evaluations" TO "service_role";
GRANT REFERENCES ON TABLE public."evaluations" TO "service_role";
GRANT SELECT ON TABLE public."evaluations" TO "service_role";
GRANT TRIGGER ON TABLE public."evaluations" TO "service_role";
GRANT TRUNCATE ON TABLE public."evaluations" TO "service_role";
GRANT UPDATE ON TABLE public."evaluations" TO "service_role";
GRANT DELETE ON TABLE public."grade_bands" TO "service_role";
GRANT INSERT ON TABLE public."grade_bands" TO "service_role";
GRANT REFERENCES ON TABLE public."grade_bands" TO "service_role";
GRANT SELECT ON TABLE public."grade_bands" TO "service_role";
GRANT TRIGGER ON TABLE public."grade_bands" TO "service_role";
GRANT TRUNCATE ON TABLE public."grade_bands" TO "service_role";
GRANT UPDATE ON TABLE public."grade_bands" TO "service_role";
GRANT DELETE ON TABLE public."login_attempts" TO "service_role";
GRANT INSERT ON TABLE public."login_attempts" TO "service_role";
GRANT REFERENCES ON TABLE public."login_attempts" TO "service_role";
GRANT SELECT ON TABLE public."login_attempts" TO "service_role";
GRANT TRIGGER ON TABLE public."login_attempts" TO "service_role";
GRANT TRUNCATE ON TABLE public."login_attempts" TO "service_role";
GRANT UPDATE ON TABLE public."login_attempts" TO "service_role";
GRANT DELETE ON TABLE public."sessions" TO "service_role";
GRANT INSERT ON TABLE public."sessions" TO "service_role";
GRANT REFERENCES ON TABLE public."sessions" TO "service_role";
GRANT SELECT ON TABLE public."sessions" TO "service_role";
GRANT TRIGGER ON TABLE public."sessions" TO "service_role";
GRANT TRUNCATE ON TABLE public."sessions" TO "service_role";
GRANT UPDATE ON TABLE public."sessions" TO "service_role";
GRANT DELETE ON TABLE public."teams" TO "service_role";
GRANT INSERT ON TABLE public."teams" TO "service_role";
GRANT REFERENCES ON TABLE public."teams" TO "service_role";
GRANT SELECT ON TABLE public."teams" TO "service_role";
GRANT TRIGGER ON TABLE public."teams" TO "service_role";
GRANT TRUNCATE ON TABLE public."teams" TO "service_role";
GRANT UPDATE ON TABLE public."teams" TO "service_role";
GRANT DELETE ON TABLE public."users" TO "service_role";
GRANT INSERT ON TABLE public."users" TO "service_role";
GRANT REFERENCES ON TABLE public."users" TO "service_role";
GRANT SELECT ON TABLE public."users" TO "service_role";
GRANT TRIGGER ON TABLE public."users" TO "service_role";
GRANT TRUNCATE ON TABLE public."users" TO "service_role";
GRANT UPDATE ON TABLE public."users" TO "service_role";
GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO "anon";
GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO "authenticated";
GRANT EXECUTE ON FUNCTION public."create_evaluation_period_atomic"(p_name text, p_year integer, p_created_by uuid, p_created_at timestamp with time zone, p_evaluations jsonb, p_rounds jsonb) TO "postgres" WITH GRANT OPTION;
GRANT EXECUTE ON FUNCTION public."delete_empty_evaluation_period_atomic"(p_period_id uuid) TO "postgres" WITH GRANT OPTION;
GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO "postgres" WITH GRANT OPTION;
GRANT EXECUTE ON FUNCTION public."save_evaluation_round_transaction"(p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone, p_next_round integer, p_next_evaluator_id uuid, p_next_evaluator_role text, p_next_status text, p_is_final boolean) TO "postgres" WITH GRANT OPTION;
GRANT EXECUTE ON FUNCTION public."save_evaluation_round_transaction_active_only"(p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone, p_next_round integer, p_next_evaluator_id uuid, p_next_evaluator_role text, p_next_status text, p_is_final boolean) TO "postgres" WITH GRANT OPTION;
GRANT EXECUTE ON FUNCTION public."create_evaluation_period_atomic"(p_name text, p_year integer, p_created_by uuid, p_created_at timestamp with time zone, p_evaluations jsonb, p_rounds jsonb) TO "service_role";
GRANT EXECUTE ON FUNCTION public."delete_empty_evaluation_period_atomic"(p_period_id uuid) TO "service_role";
GRANT EXECUTE ON FUNCTION public."handle_updated_at"() TO "service_role";
GRANT EXECUTE ON FUNCTION public."save_evaluation_round_transaction"(p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone, p_next_round integer, p_next_evaluator_id uuid, p_next_evaluator_role text, p_next_status text, p_is_final boolean) TO "service_role";
GRANT EXECUTE ON FUNCTION public."save_evaluation_round_transaction_active_only"(p_evaluation_id uuid, p_round integer, p_actor_id uuid, p_scores jsonb, p_notes jsonb, p_comment text, p_total_score numeric, p_grade text, p_is_submit boolean, p_submitted_at timestamp with time zone, p_next_round integer, p_next_evaluator_id uuid, p_next_evaluator_role text, p_next_status text, p_is_final boolean) TO "service_role";

COMMIT;
