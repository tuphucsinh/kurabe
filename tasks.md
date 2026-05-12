# Active Tasks

## Phase 36: Vercel Deployment & Production Readiness

### [#P36T01] [root] `npm run build` verification

**Mục tiêu**: Chạy thử build production ở local để đảm bảo không có lỗi type hoặc cấu hình trước khi đẩy lên Vercel.

**Thay đổi cụ thể**:
1. Mở terminal tại thư mục gốc.
2. Chạy `npm run build`.
3. Kiểm tra các lỗi lint hoặc type nếu có.

**Ràng buộc**:
- Phải build thành công 100% không lỗi.

**Status**: `[x]`

---

### [#P36T02] [github] `git push origin master`

**Mục tiêu**: Đồng bộ các thay đổi mới nhất lên GitHub để Vercel có thể fetch code.

**Thay đổi cụ thể**:
1. Chạy `git push origin master`.

**Ràng buộc**:
- Đảm bảo repo trên GitHub đã được tạo và remote đúng.

**Status**: `[x]` (Đã cấu hình PAT và đồng bộ code lên GitHub)

---

### [#P36T03] [vercel] `Dashboard Setup & Env Config`

**Mục tiêu**: Hướng dẫn Anh kết nối repo và cấu hình biến môi trường trên Vercel.

**Thay đổi cụ thể**:
1. Hướng dẫn Anh vào [vercel.com](https://vercel.com).
2. Chọn "Add New" -> "Project".
3. Import repo `kurabe`.
4. Cấu hình Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Nhấn "Deploy".

**Status**: `[/]` (Đang chờ Anh thực hiện trên web)

---

### [#P36T04] [root] `Production Smoke Test`

**Mục tiêu**: Kiểm tra ứng dụng sau khi deploy thành công trên domain của Vercel.

**Thay đổi cụ thể**:
1. Truy cập URL Vercel cung cấp.
2. Kiểm tra flow Login và xem dữ liệu từ Supabase.

**Status**: `[ ]`
