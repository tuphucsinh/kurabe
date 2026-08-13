# HANDOFF SNAPSHOT
**Date**: 2026-08-13 · **Git**: local `main` AHEAD 16 (chưa push — production ở `b135177`); build/lint PASS; DB nguyên trạng.

**Đã xong phiên này** (chi tiết: `.ai/MASTER_PLAN.md`):
1. Fix Báo cáo (5 mục: trend ảo, max 237 động, criteria %, Xuất file 2 sheets 22 NV, guard role).
2. Trang chi tiết nhóm `/teams/[id]` + fix link employee id.
3. Phase 55: Mục tiêu kỳ cấu hình (Settings + Reports động); P1 ẩn test login production.
4. Fix logout full-reload (hết frame lẫn login+sidebar).
5. Phase 56-58: AI — Cảnh báo + Giải thích, Tóm tắt kỳ, Gợi ý nhận xét + Soạn thông báo (chỉ Manager; prompt chuẩn anh duyệt; model gpt-5.6-luna).
6. Fix defensive `(ev.rounds||[])`; Phase 59: lyly ↔ kurabe (MCP anon + skill kurabe-monitor — verified).

**Blocker / Next**:
- Chờ anh báo **PUSH** (16 commits + 3 AI env lên Vercel: AI_API_KEY, AI_BASE_URL, AI_MODEL).
- **QI Gia dụng chưa gán Leader** — anh cập nhật khi UAT.
- Kỳ 2026 có điểm thật → AI đầy đủ hoạt động; P2 "Gợi ý khác" + Chat — sau kỳ đầu.
- Phase 44 C1 (password login) defer sau UAT.
- **Phase 61 DONE (13-08)**: SubLeader đa dạng — users+subleader_id/description; vòng 1 theo SubLeader gán; UI Teams/Employees/team-detail. **Còn**: QI Gia dụng 3 NV chưa gán (cần tạo SubLeader); QI Gia dụng chưa có Leader.
