-- ============================================================
-- KURABE QAQC — Migration Phase 58: SubLeader & Description
-- Thêm 2 cột mới (subleader_id, description) cho bảng users
-- Chạy trên Supabase SQL Editor / Management API (2026-08-13)
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS subleader_id uuid REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS description text;
