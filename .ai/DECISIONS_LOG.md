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
