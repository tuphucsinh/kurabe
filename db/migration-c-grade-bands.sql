-- ============================================================
-- KURABE QAQC — Migration Phase C: Tab Thang điểm xếp loại
-- Chạy trên Supabase SQL Editor (2026-08-13)
-- ============================================================

-- 1. Bảng dải điểm (grade bands) — riêng cho Quản lý (leader) và Nhân viên (staff)
CREATE TABLE IF NOT EXISTS public.grade_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_group text NOT NULL CHECK (role_group IN ('leader', 'staff')),
  grade text NOT NULL CHECK (grade IN ('S', 'A', 'AB', 'B', 'C', 'D')),
  min_score int,
  max_score int,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (role_group, grade)
);

-- 2. Seed từ giá trị hardcode hiện tại (src/data/criteria.ts)
INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
  ('leader', 'S',  170, NULL, 0),
  ('leader', 'A',  160, 169,  1),
  ('leader', 'AB', 130, 159,  2),
  ('leader', 'B',  100, 129,  3),
  ('leader', 'C',  70,  99,   4),
  ('leader', 'D',  NULL, 69,  5),
  ('staff',  'S',  155, NULL, 0),
  ('staff',  'A',  145, 154,  1),
  ('staff',  'AB', 115, 144,  2),
  ('staff',  'B',  90,  114,  3),
  ('staff',  'C',  60,  89,   4),
  ('staff',  'D',  NULL, 59,  5)
ON CONFLICT (role_group, grade) DO NOTHING;

-- 3. RLS: đồng bộ hiện trạng dự án (fake login qua anon key — bảo mật thật thuộc Phase 44)
ALTER TABLE public.grade_bands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "grade_bands_all" ON public.grade_bands;
CREATE POLICY "grade_bands_all" ON public.grade_bands
  FOR ALL USING (true) WITH CHECK (true);
