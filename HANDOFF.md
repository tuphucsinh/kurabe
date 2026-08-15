# HANDOFF — Kurabe QAQC (cập nhật 2026-08-15)

## Trạng thái
- **Phase 71 (Hướng dẫn 4 vai trò + sidebar "Hướng dẫn" + in theo vai trò)**: DONE ✅ — Reviewer R1→R2 PASS (plan). `guide-content.ts` 1 nguồn data 4 role (Manager 16 bước/Leader 9/SubLeader 7/Employee 4 + FAQ); **34/34 screenshot thật annotate khoanh vùng đỏ** (login 158/663/432/16735); sidebar "Hỗ trợ"→"Hướng dẫn"; `/support` render guide theo role đang login + selector (Manager 4 role); print `/support/print?role=` A4. E2E 4 role ALL PASS + lint 0 + build PASS.
- Git: main, 5 commits Phase 71 (`373ffac` `a58d653` `ddb8173` `f5224d0` `4984110`) — **CHƯA PUSH**. Server local chạy port 3000.

## Còn mở
1. 2 nút AI chưa verify ("Soạn thông báo", "Giải thích bằng AI" — action đã có, actions/ai.ts).
2. Deploy Vercel (⚠️ AI env chưa set trên Vercel) + Cloudflare Tunnel chờ domain vorigin.vn.
3. [THẤP] deleteEvaluationPeriod hard-delete không check dòng (actions/period.ts:182).
4. [THẤP] Rate-limit login chống brute-force.

## Việc tiếp theo gợi ý
- Anh quyết: push commits Phase 71? verify 2 nút AI? hay deploy Vercel?
- Session sau mở: đọc AGENTS.md + tasks.md (Phase 71 6/6 [x]) + .ai/KNOWN_BUGS.md.
