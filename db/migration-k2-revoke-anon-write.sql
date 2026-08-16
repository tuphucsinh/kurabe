-- ============================================================
-- KURABE QAQC — Migration Phase K2: Revoke anon write privileges
-- File migration: CHỈ VIẾT FILE — KHÔNG chạy lên DB
-- ============================================================
-- Thu hồi quyền INSERT, UPDATE, DELETE khỏi vai trò anon trên các bảng nghiệp vụ.
-- GIỮ LẠI SELECT vì app sử dụng mô hình anon-read có kiểm soát qua RLS.
-- Mọi thao tác ghi dữ liệu đi qua Server Actions với supabaseAdmin (service_role).

REVOKE INSERT, UPDATE, DELETE ON
  public.users,
  public.teams,
  public.evaluations,
  public.evaluation_rounds,
  public.evaluation_responses,
  public.criteria,
  public.criteria_groups,
  public.criterion_levels,
  public.evaluation_periods,
  public.grade_bands,
  public.chat_usage,
  public.audit_logs,
  public.ai_summaries,
  public.chat_reports
FROM anon;
