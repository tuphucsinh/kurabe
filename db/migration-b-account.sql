-- ============================================================
-- KURABE QAQC — Migration Phase B: Tab Tài khoản (đổi mật khẩu)
-- Chạy trên Supabase SQL Editor (2026-08-13)
-- ============================================================

-- Cột lưu mật khẩu (bcrypt hash). Null = user chưa đặt mật khẩu
-- (login hiện tại vẫn là fake login theo mã NV — Phase 44 sẽ bật password)
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
