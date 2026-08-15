# HANDOFF — Kurabe QAQC (cập nhật 2026-08-15)

## Trạng thái
- **Phase 71 (Hướng dẫn 4 vai trò + sidebar "Hướng dẫn" + in theo vai trò)**: DONE ✅ — Reviewer R1→R2 PASS (plan). `guide-content.ts` 1 nguồn data 4 role (Manager 16 bước/Leader 8/SubLeader 6/Employee 4 + FAQ); **32/32 screenshot thật annotate khoanh vùng đỏ** (login 158/663/432/16735); sidebar "Hỗ trợ"→"Hướng dẫn"; `/support` render guide theo role đang login + selector (Manager 4 role); print `/support/print?role=` A4. E2E 4 role ALL PASS + lint 0 + build PASS.
- **Phase 72 (Tinh gọn trang Hướng dẫn)**: DONE ✅ — Reviewer R1→R2 PASS (plan). page.tsx **738→208 dòng**: xóa 6 section cũ + 7 hằng data + quickLinks + dọn import. Trang chỉ còn: header gọn + block "Hướng dẫn theo vai trò của bạn" + cột phải "Nguyên tắc quyền truy cập". Build PASS + E2E 4 role ALL PASS + visual verified.
- **Phase 73 (Nút "THÊM NHÂN VIÊN" ở trang chi tiết nhóm)**: DONE ✅ — Reviewer R1→R5 (4 vòng: dead-code modal → 2 lỗ bảo mật → 3 lỗ quyền → PASS thực thi). EmployeeModal **shared** (extract từ employees inline, dùng chung 2 nơi). Nút "Thêm nhân viên" ở `/teams/[id]` (Manager mọi nhóm / Leader nhóm mình; SubLeader/Employee không thấy) + `restrictToTeamId` (nhóm mặc định = nhóm đang mở, select disabled). **Nới quyền upsertUserAction: Leader được thêm/sửa Employee/SubLeader trong nhóm mình** (ép teamId server-side + chặn hạ chức + 3 check EDIT). E2E thật PASS: Manager/Leader thêm NV OK, SubLeader không thấy nút. NV tạm đã xóa mềm.
- **Phase 74 (Thẻ Leader riêng ở trang chi tiết nhóm)**: DONE ✅ — FAST route (UI render thuần, không chạm auth/DB). Leader Block đầu danh sách (trước SubLeader blocks): avatar + tên + mã + badge Leader + kết quả đánh giá (grade/score L{round}/status) + nút Xem đánh giá như nhân viên. Verified: team "QC Gia dụng" Leader Mai Thị Hòa 8707 AB–L2–147 "Đã có KẾT QUẢ". Commit `7817898` đã push.
- Git: main, Phase 71-74 commits — **ĐÃ PUSH hết** (`...7817898`), in sync. Server local chạy port 3000 (npm run start qua wrapper run-with-env).
- ⚠️ **MÔI TRƯỜNG**: shell env bị ô nhiễm `NEXT_PUBLIC_SUPABASE_URL=https://iloaeaoojxdovedjtowt...` (sangwebsite — SAI project) → build/start KURABE phải `unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY` trước (Next ưu tiên env có sẵn > .env.local; NEXT_PUBLIC inline lúc build). Đã phát hiện khi E2E login fail "Mã nhân viên không hợp lệ".

## Còn mở
1. 2 nút AI chưa verify ("Soạn thông báo", "Giải thích bằng AI" — action đã có, actions/ai.ts).
2. Deploy Vercel (⚠️ AI env chưa set trên Vercel) + Cloudflare Tunnel chờ domain vorigin.vn.
3. [THẤP] deleteEvaluationPeriod hard-delete không check dòng (actions/period.ts:182).
4. [THẤP] Rate-limit login chống brute-force.

## Việc tiếp theo gợi ý
- Push nốt 2 commits Phase 72 khi anh duyệt; verify 2 nút AI; deploy Vercel.
- Session sau mở: đọc AGENTS.md + tasks.md (P71 6/6 + P72 3/3 [x]) + .ai/KNOWN_BUGS.md.

