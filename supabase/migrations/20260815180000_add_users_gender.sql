-- Phase 76: thêm cột giới tính cho users (mặc định 'Nữ' — tự backfill user hiện có)
-- BẮT BUỘC GRANT cột gender cho anon/authenticated (RLS row-level không đủ — thiếu GRANT
-- → USER_SELECT qua anon client lỗi → getSessionUser catch null → mọi user bị coi chưa đăng nhập)

alter table public.users add column if not exists gender text not null default 'Nữ';

grant select (id, employee_code, name, role, team_id, join_date, avatar_url, created_at, is_active, subleader_id, description, gender)
  on public.users to anon, authenticated;
