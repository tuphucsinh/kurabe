-- Phase 76.1: bảng chat_reports — lưu báo lỗi từ chat widget để Mika cron điều tra
-- RLS: chặn anon/authenticated — CHỈ service role (supabaseAdmin) ghi/đọc

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  user_name text not null default '',
  role text not null default '',
  pathname text not null default '',
  question text not null default '',
  history text not null default '',
  created_at timestamptz not null default now(),
  status text not null default 'new'  -- new → investigating → planned → done
);

alter table public.chat_reports enable row level security;
-- không tạo policy nào: anon/authenticated không có quyền (default deny)

grant select, insert, update (status) on public.chat_reports to service_role;
