# HANDOFF SNAPSHOT
**Date**: 2026-08-13

## Trạng thái phiên (13-08)
- **Git: local `main` AHEAD 15 commits so với origin/main — CHƯA PUSH** (quy tắc mới: push chỉ khi anh báo; commit cuối `2001891`). Production (Vercel lykiv.vercel.app) đang ở commit `b135177` (cũ hơn 15 commits — chưa có AI + fix mới).
- Build/lint PASS 100%. Local server chạy (PID hiện tại từ `npm run start` — bản mới nhất). DB Supabase nguyên trạng (mọi data test đã restore — chỉ còn data thật UAT).
- AI chạy bằng key OpenCode Go: env `AI_API_KEY`/`AI_BASE_URL`/`AI_MODEL=gpt-5.6-luna` trong `.env.local` (KHÔNG push — cần thêm vào Vercel khi push).

## Đã hoàn thành phiên này
1. **Fix Báo cáo (5 mục)**: bỏ trend ảo hardcode; max điểm động từ DB (237 thay 150); criteria % theo max nhóm thật; wire nút "Xuất file" (engine `lib/export.ts` + viewer fix — file 2 sheets, 22 NV); guard role Manager/Leader (Employee → redirect).
2. **Trang chi tiết nhóm** `/teams/[id]` (trước 404): header + KPI + bảng thành viên + badge role/trạng thái + link đánh giá (dùng EMPLOYEE id — fix lỗi "Quyền truy cập bị từ chối").
3. **Phase 55 — Mục tiêu kỳ cấu hình được**: migration `migration-f-target.sql` (target_rate/target_grade, default 75/AB); Settings tab "Mục tiêu" (chọn kỳ + % + grade); Báo cáo đọc động (`periodTarget`).
4. **P1 bảo mật**: ẩn "Tài khoản test (Real Data)" trên production — flag `NEXT_PUBLIC_SHOW_TEST_LOGIN=true` chỉ ở `.env.local`.
5. **Fix logout triệt để**: `window.location.href='/login'` full-reload (hết frame lẫn login+sidebar; trước đó 2 cách client/server-side vẫn chớp).
6. **Phase 56 — AI khởi động**: `lib/anomaly.ts` (rule chênh ≥20/≥30 điểm giữa 2 vòng) + `AnomalyAlertCard` Dashboard + `explainAnomalyAction` + khung `lib/ai.ts` (OpenAI-compatible, fail-soft, retry khi content rỗng).
7. **Phase 57 — Tóm tắt kỳ AI**: bảng `ai_summaries` (cache theo kỳ) + `generatePeriodSummaryAction` (ẩn danh hóa, skip khi chưa có điểm) + `AiSummaryCard` trên Báo cáo.
8. **Phase 58 — Gợi ý nhận xét + Soạn thông báo kết quả (chỉ Manager)**: nút trên trang đánh giá (card "Ghi chú chung"); prompt chất lượng cao sau nhiều vòng tinh chỉnh (xem MASTER_PLAN): 4-5 câu, cụ thể theo TÊN tiêu chuẩn + mã trong ngoặc, xưng hô "Nhân viên", vai trò luôn "quản lý" (đa dạng cụm), kỷ luật không vi phạm 1 câu đa dạng, tham khảo NGẦM nhận xét vòng trước (không trích), KHÔNG so sánh điểm giữa vòng, giọng người thật (chống AI-isms), few-shot 2 mẫu phong cách, temperature 0.7.
9. **Fix model AI**: `gpt-5.6-luna` thay deepseek-v4-flash (reasoning ngốn hết max_tokens → content rỗng với prompt dài); token 600-900, timeout 45s, retry ×2 token.
10. **Fix defensive**: `(ev.rounds || [])` ở anomaly/ai-summary/evaluations page (hết TypeError filter khi data cũ thiếu rounds).
11. **🔗 lyly ↔ kurabe**: MCP supabase (ANON key — chỉ đọc, không PAT) + skill `kurabe-monitor` trong profile lyly (`~/.hermes/profiles/lyly/skills/software-development/kurabe-monitor/`). Verified: lyly trả lời đúng dữ liệu thật (kỳ 2026 active, 22 NV, 22 chưa xong; QC Gia dụng 15 NV Leader Mai Thị Hòa; phát hiện QI Gia dụng CHƯA GÁN LEADER). Chị Ly chat Telegram bot lyly (DM "Ly Ngo" 8632993932).

## Next Action / Blocker
- **Chờ anh báo PUSH**: 15 commits + thêm 3 AI env lên Vercel (AI_API_KEY=OPENCODE_GO_API_KEY, AI_BASE_URL=https://opencode.ai/zen/go/v1, AI_MODEL=gpt-5.6-luna).
- **QI Gia dụng chưa gán Leader** trong `users/teams` — anh cập nhật khi UAT.
- Kỳ 2026 chưa có đánh giá có điểm — AI cảnh báo/tóm tắt sẽ hoạt động khi có data thật.
- P2 "Gợi ý khác" + Chat hỏi đáp dữ liệu — làm sau kỳ đầu.
- Phase 44 C1 (password login) vẫn defer sau UAT.
