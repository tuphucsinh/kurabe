# HANDOFF — Kurabe QAQC (2026-08-14)

## Phase 65: Live Test Toàn Diện ✅ DONE
- Toàn bộ tính năng đã live-test trên org test (team Test Full E2E + TST01-06/TST99), cleanup xong, **DB nguyên trạng baseline: 22 users / 3 teams / 22 ev / 1 approved / audit 8 / ai_summaries 0**.
- Commits: 10 (21f6860, 67d6b21, bb52d2f, 9b8bbb8, e7a5822 + docs) — **chưa push** (đợi anh).
- Chi tiết: `.ai/MASTER_PLAN.md` Phase 65 + `tasks.md` T01-T06.

## 2 BUG chờ anh duyệt fix (ghi `.ai/KNOWN_BUGS.md`)
1. **Audit gap**: thêm/sửa NV + tạo/sửa team KHÔNG ghi nhật ký (upsert qua lib/db, `upsertUserAction` dead code). Fix đề xuất: thêm logAudit vào lib/db hoặc chuyển UI sang server actions.
2. **Chuyển team user không sync** evaluation.team_id + evaluator R2/R3 → Leader team mới không thấy evaluation. Fix đề xuất: sync team change như sync subleader.

## Ghi nhận vận hành
- Reports cache 300s (data stale ≤5p — design); AI suggestion chờ ~60s; "Soạn thông báo"/"Giải thích AI"/AI summary fail-soft; form thêm NV default team = nhóm đầu (chọn team cẩn thận); mock login (không test được password login).
- Server local: `npm run start` (đang chạy proc_1322862e760e — kill khi xong).
- Supabase keepalive cron vẫn hoạt động (T7 21:00, CN 08:00 → Discord #report).
