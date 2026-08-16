-- ============================================================
-- KURABE QAQC — Migration Phase K3: Revoke anon read on sensitive tables
-- File migration: CHỈ VIẾT FILE — KHÔNG CHẠY LÊN DB
-- ============================================================
-- Mục tiêu: Khóa hoàn toàn truy cập đọc trực tiếp qua PostgREST (anon key)
-- vào các bảng nhạy cảm chứa PII nhân sự, điểm số, nhận xét đánh giá,
-- tóm tắt AI, nhật ký kiểm toán và báo cáo sự cố.
--
-- Toàn bộ client-side reads cho các bảng này đã được chuyển sang Server Actions
-- chạy bằng supabaseAdmin (service_role) và kiểm soát qua requireAuth / requireRole.
--
-- Bảng nhạy cảm được thu hồi SELECT:
-- 1. public.evaluations
-- 2. public.evaluation_rounds (thu hồi toàn bảng, chỉ cấp lại cột không nhạy cảm nếu cần)
-- 3. public.evaluation_responses
-- 4. public.ai_summaries
-- 5. public.audit_logs
-- 6. public.chat_reports
--
-- Bảng GIỮ NGUYÊN quyền SELECT cho anon (dữ liệu cấu hình / danh mục dùng chung):
-- users (đã bảo vệ cột password_hash qua migration-i), teams,
-- criteria, criterion_levels, criteria_groups, grade_bands, evaluation_periods.

-- 1. Thu hồi quyền SELECT toàn bộ bảng nhạy cảm khỏi role anon
REVOKE SELECT ON
  public.evaluations,
  public.evaluation_rounds,
  public.evaluation_responses,
  public.ai_summaries,
  public.audit_logs,
  public.chat_reports
FROM anon;

-- 2. (BỎ — 2026-08-16, Reviewer bắt) KHÔNG cấp lại bất kỳ cột nào của evaluation_rounds cho anon.
--    Lý do: GRANT SELECT (total_score, evaluator_id, ...) trước đó vẫn để anon đọc điểm vòng + người chấm
--    (join users anon-readable). Mọi read đã chuyển qua server actions (requireAuth + canViewEvaluation)
--    nên anon KHÔNG cần đọc evaluation_rounds nữa. Đã REVOKE cột bổ sung trên DB thật.

-- ============================================================
-- ROLLBACK SCRIPT (Dùng khi cần khôi phục trạng thái cũ):
-- ============================================================
-- GRANT SELECT ON
--   public.evaluations,
--   public.evaluation_rounds,
--   public.evaluation_responses,
--   public.ai_summaries,
--   public.audit_logs,
--   public.chat_reports
-- TO anon;
-- ============================================================
