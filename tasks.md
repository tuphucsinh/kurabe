# KURABE QAQC — Task List (WBS)

> File anchor cho `/do`. Phase DONE đã sweep gọn (summary ≤ 4 dòng) — chi tiết xem `.ai/MASTER_PLAN.md`.

## Phase 52: Trang Cài đặt (Settings Hub) [DONE] ✅
- Settings 7 tabs: Kỳ đánh giá, Tài khoản, Thang điểm, Nhóm & Quyền, Nhật ký, Mục tiêu, Điều hướng — Manager guard; tách PeriodActions khỏi Dashboard.
- Account: đặt/đổi password (bcrypt, `password_hash`), Grade Bands DB 12 bands + validator + editor, reset password NV (Manager) — verify browser/DB PASS.

## Phase 53: Reset mật khẩu nhân viên (Manager) [DONE] ✅
- `resetPassword` đặt `password_hash = NULL` (trạng thái chưa đặt) + nút/ConfirmDialog ở /employees; NV 7346 đã reset (data thật). Nguyên tắc khôi phục: NULL = vào bằng mã NV.

## Phase 54: Bảo mật (C2+C3) + Audit log + Nhắc tồn đọng [DONE] ✅ (Reviewer PASS)
- C2: `src/lib/auth.ts` requireAuth/requireManager áp mọi server action (bỏ trust client actorId); middleware bảo vệ /settings.
- C3: RLS anon SELECT-only `evaluation_periods` + `grade_bands` (migration-d); server ghi qua supabaseAdmin (service-role server-only).
- Audit: bảng `audit_logs` + `logAudit()` + tab "Nhật ký" (Manager); PendingReviews Dashboard (theo evaluator) — sửa luôn bug viewer (stats 22).

## Phase 55: Mục tiêu Kỳ cấu hình được (Manager) [DONE] ✅
- Migration target_rate/target_grade (default 75/AB) + Settings tab "Mục tiêu" + Báo cáo đọc động. Kèm P1: login ẩn "Tài khoản test" production (`NEXT_PUBLIC_SHOW_TEST_LOGIN=true` chỉ local).

## Phase 56: AI — Cảnh báo bất thường + khung AI [DONE] ✅
- `lib/anomaly.ts` (chênh ≥20/≥30 giữa vòng, rule chính xác) + AnomalyAlertCard Dashboard + explainAnomalyAction; `lib/ai.ts` (OpenAI-compatible, fail-soft, retry content rỗng, model `gpt-5.6-luna`, timeout 45s).

## Phase 57: Tóm tắt kỳ đánh giá bằng AI [DONE] ✅
- Bảng `ai_summaries` (cache UNIQUE theo kỳ) + generatePeriodSummaryAction (Manager, ẩn danh hóa, skip khi chưa có điểm) + AiSummaryCard /reports.

## Phase 58: Gợi ý nhận xét + Soạn thông báo kết quả (AI, Manager) [DONE] ✅
- Nút AI trên /evaluations/[id] (Gợi ý khi chấm + Soạn thông báo + Sao chép). **Chuẩn prompt** (chi tiết MASTER_PLAN): 4-5 câu, tên tiêu chuẩn + mã ngoặc, xưng hô "Nhân viên", vai trò luôn "quản lý" đa dạng cụm, kỷ luật 1 câu đa dạng, tham khảo ngầm vòng trước, KHÔNG so sánh điểm vòng, giọng người, few-shot 2 mẫu, temp 0.7. Verified 3 ví dụ anh duyệt.

## Phase 59: 🔗 lyly ↔ kurabe [DONE] ✅ (ngoài repo)
- lyly: MCP supabase (ANON — chỉ đọc) + skill `kurabe-monitor` (~/.hermes/profiles/lyly/skills/...). Verified: kỳ 2026 active, 22 NV 22 chưa xong, QC Gia dụng 15 NV (Leader Mai Thị Hòa), phát hiện QI Gia dụng chưa gán Leader. Chị Ly chat Telegram bot lyly.

---

## Phase 44: Security Hardening 🔴 (PARTIAL — C2+C3 xong ở Phase 54; còn C1 + refactor client writes)

### [#P44C1] Auth Fix — CÒN LẠI (defer sau UAT)
- Thêm password/PIN cho Manager login (hotfix); dài hạn migrate Supabase Auth.
- ⚠️ Nguyên tắc khôi phục (chốt 13-08): `password_hash = NULL` = chưa đặt → vẫn login mã NV (dự phòng); quên mật khẩu → reset NULL qua MCP/SQL Editor → login mã NV → đặt lại.

### [#P44C2] Refactor client writes sang server actions — CÒN LẠI
- Client vẫn anon-write `users`/`teams`/`evaluations`/`evaluation_rounds`/`evaluation_responses`/`criteria` (ghi nhận rủi ro; làm cùng C1). `audit_logs` select mở anon (đồng bộ mô hình anon-read).

---

## Pending / Next (chốt 13-08)
- Chờ anh báo **PUSH** (local ahead 16; kèm 3 AI env lên Vercel: AI_API_KEY, AI_BASE_URL, AI_MODEL=gpt-5.6-luna).
- **QI Gia dụng chưa gán Leader** (lyly phát hiện — anh cập nhật khi UAT).
- P2 "Gợi ý khác" + Chat hỏi đáp dữ liệu — sau kỳ đầu có data thật.
