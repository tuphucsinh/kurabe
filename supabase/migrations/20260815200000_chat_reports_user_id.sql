-- Phase 76.2: chat_reports thêm cột user_id (giới hạn 1 báo lỗi/ngày/account theo user)
alter table public.chat_reports add column if not exists user_id uuid;

-- index cho count theo user + thời gian
create index if not exists chat_reports_user_created_idx on public.chat_reports (user_id, created_at);
