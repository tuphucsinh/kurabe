-- Phase 75: bảng chat_usage cho giới hạn lượt chat widget (15 lượt/account/2h)
-- RLS: chỉ service role (supabaseAdmin) được đọc/ghi — KHÔNG policy cho anon/authenticated

create table if not exists public.chat_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_usage_user_created_idx on public.chat_usage (user_id, created_at);

alter table public.chat_usage enable row level security;

-- Không tạo policy nào: anon/authenticated hoàn toàn không truy cập; chỉ service role
-- (supabase_admin / service_role) xuyên qua RLS.
