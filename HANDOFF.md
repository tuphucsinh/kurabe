# HANDOFF — Kurabe QAQC (cập nhật 2026-08-15)

## Trạng thái
- **Phase 71 (Hướng dẫn 4 vai trò + sidebar "Hướng dẫn" + in theo vai trò)**: DONE ✅ — Reviewer R1→R2 PASS (plan). `guide-content.ts` 1 nguồn data 4 role (Manager 16 bước/Leader 8/SubLeader 6/Employee 4 + FAQ); **32/32 screenshot thật annotate khoanh vùng đỏ** (login 158/663/432/16735); sidebar "Hỗ trợ"→"Hướng dẫn"; `/support` render guide theo role đang login + selector (Manager 4 role); print `/support/print?role=` A4. E2E 4 role ALL PASS + lint 0 + build PASS.
- **Phase 72 (Tinh gọn trang Hướng dẫn)**: DONE ✅ — Reviewer R1→R2 PASS (plan). page.tsx **738→208 dòng**: xóa 6 section cũ + 7 hằng data + quickLinks + dọn import. Trang chỉ còn: header gọn + block "Hướng dẫn theo vai trò của bạn" + cột phải "Nguyên tắc quyền truy cập". Build PASS + E2E 4 role ALL PASS + visual verified.
- Git: main, Phase 71-72 commits — **MỘT PHẦN ĐÃ PUSH** (`e373979..334ccbd` sáng nay), còn **2 commits Phase 72 chưa push** (`6f97303`, `879308c`). Server local chạy port 3000.

## Còn mở
1. 2 nút AI chưa verify ("Soạn thông báo", "Giải thích bằng AI" — action đã có, actions/ai.ts).
2. Deploy Vercel (⚠️ AI env chưa set trên Vercel) + Cloudflare Tunnel chờ domain vorigin.vn.
3. [THẤP] deleteEvaluationPeriod hard-delete không check dòng (actions/period.ts:182).
4. [THẤP] Rate-limit login chống brute-force.

## Việc tiếp theo gợi ý
- Push nốt 2 commits Phase 72 khi anh duyệt; verify 2 nút AI; deploy Vercel.
- Session sau mở: đọc AGENTS.md + tasks.md (P71 6/6 + P72 3/3 [x]) + .ai/KNOWN_BUGS.md.

