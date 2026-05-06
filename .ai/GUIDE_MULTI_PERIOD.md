# Hướng dẫn Tính năng: Quản lý Đa Kỳ Đánh giá (Multi-period)

Tính năng này cho phép hệ thống Kurabe vận hành qua nhiều giai đoạn thời gian (Quý, Năm) mà không làm lẫn lộn dữ liệu giữa các kỳ.

## 1. Luồng vận hành (Workflow)

Hệ thống hoạt động theo chu kỳ khép kín:
**Tạo kỳ mới** → **Thực hiện đánh giá** → **Xem báo cáo** → **Đóng kỳ** → **Lưu trữ**.

---

## 2. Các chức năng chi tiết

### A. Tạo kỳ đánh giá mới (Mở kỳ)
- **Ai thực hiện**: Chỉ tài khoản có quyền `Manager`.
- **Cách làm**:
  1. Truy cập **Dashboard**.
  2. Nhấn nút **"+ Tạo kỳ mới"** (nút này chỉ hiện khi không có kỳ nào đang ở trạng thái `Active`).
  3. Nhập **Tên kỳ** (VD: Quý 2) và **Năm** (VD: 2026).
- **Hành động hệ thống**:
  - Tạo record mới trong bảng `evaluation_periods`.
  - **[Quan trọng]**: Hệ thống tự động quét toàn bộ danh sách nhân viên (trừ Manager) và tạo sẵn các bản ghi `evaluations` + `evaluation_rounds` (Round 1) cho kỳ đó.
  - Sau khi tạo, kỳ này sẽ trở thành kỳ mặc định của hệ thống.

### B. Chuyển đổi giữa các kỳ
- **Ai thực hiện**: Tất cả người dùng.
- **Cách làm**:
  1. Nhìn vào thanh **Sidebar** (bên trái), ngay phía trên thông tin cá nhân.
  2. Click vào **Bộ chọn kỳ** (hiện tên kỳ hiện tại kèm icon Lịch).
  3. Chọn kỳ muốn xem từ danh sách xổ xuống.
- **Hành động hệ thống**:
  - Cập nhật Global Context.
  - Tải lại dữ liệu (Dashboard, Báo cáo, Danh sách nhân viên) tương ứng với kỳ đã chọn.

### C. Đóng kỳ đánh giá
- **Ai thực hiện**: Chỉ tài khoản có quyền `Manager`.
- **Cách làm**:
  1. Chọn kỳ đang ở trạng thái `Active` (nếu chưa chọn).
  2. Truy cập **Dashboard**, nhấn nút **"Đóng kỳ"** (màu đỏ).
  3. Xác nhận qua hộp thoại Confirm.
- **Hành động hệ thống**:
  - Cập nhật trạng thái kỳ sang `Closed`.
  - Toàn bộ các bản đánh giá thuộc kỳ này sẽ **không thể chỉnh sửa** (Read-only) để đảm bảo tính toàn vẹn của lịch sử.

---

## 3. Các bước kiểm tra (Verification Steps)

1. **Kiểm tra hiển thị**: Đăng nhập bằng Manager, kiểm tra xem có thấy nút "+ Tạo kỳ mới" không.
2. **Kiểm tra tính năng**: Tạo thử một kỳ "Test 2026". Quay lại Dashboard xem các con số StatCards có về 0 không (vì là kỳ mới chưa có data).
3. **Kiểm tra Switching**: Chuyển sang kỳ "Quý 1 - 2026" (đã có dữ liệu), Dashboard và Reports phải hiển thị lại các biểu đồ và con số cũ.

---

## 4. Lưu ý kỹ thuật cho Admin
- **Data Integrity**: Dữ liệu Evaluations được liên kết chặt chẽ với `period_id`. Đừng xóa kỳ đánh giá trực tiếp trong Database nếu đã có dữ liệu rounds.
- **Active State**: Chỉ nên có **duy nhất 1 kỳ** ở trạng thái `Active` tại một thời điểm để tránh nhầm lẫn cho nhân viên khi thực hiện tự đánh giá.
