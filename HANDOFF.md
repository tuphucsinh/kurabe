# HANDOFF SNAPSHOT
**Date**: 2026-08-13 (tối) · **Git**: `main` đồng bộ origin (ahead 0 — ĐÃ PUSH 66 commits); build/lint PASS; DB nguyên trạng (22 NV / 3 nhóm / 22 ev / Kỳ 2026 active).

**Đã xong phiên** (chi tiết `.ai/MASTER_PLAN.md` Phase 61-63):
1. Phase 61 hoàn tất: fix promote (bỏ rule 1 SubLeader/team) + sync subleader_id → round 1 + badge/grade đúng; UI team detail blocks + grid cột thẳng; settings mở cho NV (tab Tài khoản đổi mật khẩu).
2. Live test E2E: org test → 3 vòng đánh giá → Approved; verify dashboard/reports/scope; dọn sạch test data.
3. Production: push + Vercel; fix login flash + kẹt (AppLayout /login full-screen + location.href); tối ưu tốc độ (cache 300s + revalidateTag on mutation + lazy radar + cron warm-ping 5 phút).

**Blocker / Next**:
- **AI env lên Vercel CHƯA set** (AI_API_KEY, AI_BASE_URL, AI_MODEL=gpt-5.6-luna) — production AI chưa hoạt động.
- QI Gia dụng chưa Leader + 3 NV chưa gán SubLeader (anh cập nhật khi UAT).
- Phase 60 Cloudflare: chờ anh đưa vorigin.vn nameserver sang Cloudflare + báo Active.
- Phase 44 C1 (password login) + refactor client writes — defer sau UAT.
