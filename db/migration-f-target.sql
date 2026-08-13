-- ============================================================
-- KURABE QAQC — Migration Phase 55: Mục tiêu kỳ (cấu hình được)
-- Thêm target_rate + target_grade vào evaluation_periods
-- Chạy trên Supabase SQL Editor / Management API (2026-08-13)
-- ============================================================

ALTER TABLE public.evaluation_periods
  ADD COLUMN IF NOT EXISTS target_rate integer NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS target_grade text NOT NULL DEFAULT 'AB';
