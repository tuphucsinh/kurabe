-- ============================================================
-- KURABE QAQC — Migration Phase K1: Session thật, login attempts & AI usage
-- File migration: CHỈ VIẾT FILE — KHÔNG chạy lên DB
-- ============================================================

-- 1. Bảng sessions: lưu token hash 256-bit thay vì cookie user.id thô
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires ON public.sessions (user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON public.sessions (token_hash);

-- 2. Bảng login_attempts: đếm số lần đăng nhập thất bại theo (mã NV, IP)
CREATE TABLE IF NOT EXISTS public.login_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_code text NOT NULL,
  ip text NOT NULL,
  attempted_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_code_ip_time ON public.login_attempts (employee_code, ip, attempted_at);

-- 3. Bảng ai_usage: ghi nhận lượt gọi AI/LLM để rate-limit
CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'ai',
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_time ON public.ai_usage (user_id, created_at);

-- 4. Bật RLS và khóa anon (chỉ server action qua supabaseAdmin/service_role truy cập)
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sessions, public.login_attempts, public.ai_usage FROM anon;
