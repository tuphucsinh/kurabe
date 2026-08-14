# Decisions Log

| # | Ngày | Quyết định | Lý do |
|---|---|---|---|
| 1 | 2026-04-27 | Chọn **TailwindCSS** thay Vanilla CSS | Tối ưu tốc độ vibe-code với AI, utility-first giảm context switching |
| 2 | 2026-04-27 | Chọn **Supabase** cho Backend (phase sau) | User chốt; giao diện local mock data trước |
| 3 | 2026-04-27 | Chọn **Next.js 15 App Router** | SSR/SSG sẵn, file-based routing, React Server Components |
| 4 | 2026-04-27 | Design System lấy từ **Stitch Project 1003102391417666898** | Đảm bảo UI khớp 100% bản mẫu đã thiết kế |
| 5 | 2026-04-28 | **Migrate criteria vào Supabase DB** | CRUD UI (Phase 22-23) cần DB thực tế; 34 tiêu chí + levels vào bảng `criteria`, `criterion_levels` |
| 6 | 2026-04-28 | **Giữ fake login** (chọn user từ list), query từ Supabase | Chưa cần Supabase Auth; chuyển sang phase riêng khi cần |
| 7 | 2026-04-28 | **Chưa enable RLS** — auth ở application level | RLS sẽ thêm sau khi có Supabase Auth thực sự |
| 8 | 2026-08-10 | **Tách Toast ra khỏi Data Layer** | Tránh gây lỗi `set-state-in-effect` và loop khi show notification từ hook/actions. Các components/actions return lỗi hoặc dùng context. |
| 9 | 2026-08-10 | **Bỏ qua Supabase Auth (Tạm hoãn Phase 44)** | Đang trong giai đoạn testing, cần user đăng nhập không password để dễ dàng sửa và thử nghiệm. |
| 10 | 2026-08-12 | **Tiếp quản dự án vào workflow chuẩn Mika** — sync AGENTS.md template chuẩn + xóa CLAUDE.md/GEMINI.md (Antigravity cũ). Baseline: `cef098f` | Đưa dự án vào quy trình Mika→Runner→Reviewer thống nhất; verify build PASS + lint PASS (1 warning). Phase 44 (Security) vẫn DEFERRED theo yêu cầu UAT. |
| 11 | 2026-08-14 | **Trả lại đánh giá (Phase 64)**: reviewer ở lượt chưa submit → trả về round-1 (unlock + xóa round hiện tại); Manager Approved tự trả về Draft; lưu `return_note` (bắt buộc nhập lý do); round hiện tại bị xóa khi trả lại | Cấp trên cần yêu cầu vòng trước chỉnh sửa; manager cần sửa báo cáo sau khi nộp; lý do bắt buộc để vòng trước biết cần sửa gì |
| 12 | 2026-08-14 | **Bật đăng nhập mật khẩu thật (Phase 69)**: login qua server action (bcrypt compare, cookie `auth_session` httpOnly — giữ tên cookie); rule NULL = login mã NV thuần (dự phòng); KHÔNG đặt pass sẵn cho account nào — NV tự đặt sau; `REVOKE SELECT (password_hash) FROM anon` để hash không lộ qua API | Hoàn tất P44-C1: thay mock login bằng password thật an toàn tối thiểu, giữ lối vào dự phòng không bao giờ khóa account |
| 13 | 2026-08-14 | **C3 — Server actions là lớp ghi DUY NHẤT (Phase 70)**: siết 8 bảng data chính từ "Enable all access for anon" → SELECT-only; mọi write qua server actions (requireAuth/requireManager + supabaseAdmin + logAudit + revalidate); migration theo NHÓM bảng (users/teams → criteria → evaluations) kèm test anon-blocked ngay sau mỗi nhóm chống regression im lặng; giữ nguyên mức quyền nghiệp vụ hiện tại (chỉ chuyển lớp) | Anon key công khai trong bundle → ai cũng ghi/xóa data; đóng lỗ hổng trước khi mở production; bài học P65T06 (anon DELETE fail im lặng) → migration từng nhóm + verify ngay |
