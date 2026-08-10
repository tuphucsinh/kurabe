# Hướng dẫn Vận hành Dành cho Admin (Kurabe QAQC)

Tài liệu này cung cấp các hướng dẫn cơ bản cho Quản trị viên (Admin) để vận hành, bảo trì và xử lý các tác vụ định kỳ của hệ thống Đánh giá QAQC.

## 1. Reset Dữ Liệu Cho Kỳ Đánh Giá Mới (Năm/Quý Mới)

Hệ thống được thiết kế để theo dõi đánh giá theo từng "Kỳ Đánh Giá" (Period). Khi bắt đầu một đợt đánh giá mới, không cần thiết phải xóa dữ liệu cũ, thay vào đó:

1. Đăng nhập với quyền **Admin** (đang mở trong giai đoạn test).
2. Vào trang **Cài Đặt (Settings)** > tab **Kỳ Đánh Giá (Periods)**.
3. Tạo một Kỳ Đánh Giá mới (VD: "Đánh giá QAQC Năm 2026").
4. Đặt Kỳ Đánh Giá này làm **Active (Kỳ hiện tại)**.
5. Toàn bộ nhân viên khi đăng nhập sẽ tự động được chuyển sang kỳ đánh giá mới này và bắt đầu đánh giá với bảng điểm trắng.
6. (Tùy chọn) Có thể xem lại kết quả của các kỳ cũ bằng cách chuyển kỳ đánh giá ở góc phải màn hình Dashboard.

## 2. Quản Lý Tiêu Chí Đánh Giá

Tiêu chí đánh giá có thể được thay đổi theo yêu cầu của phòng ban.

- **Vị trí sửa:** Tab **Tiêu Chí (Criteria)** trong **Settings**.
- **Lưu ý quan trọng:** Không nên sửa hoặc xóa các tiêu chí đã được áp dụng ở kỳ trước (vì sẽ ảnh hưởng đến lịch sử kết quả). 
- **Quy trình chuẩn:** 
  1. Nếu muốn đổi tiêu chí: Nên khóa (inactive) tiêu chí cũ.
  2. Tạo tiêu chí mới và áp dụng cho các kỳ đánh giá hiện hành trở về sau.

## 3. Xuất Dữ Liệu (Backup/Báo cáo)

Mọi dữ liệu đều được tự động lưu trữ trên **Supabase** Database.

- Để lập báo cáo tổng hợp, hãy sử dụng tính năng **Export Excel** ở trang **Báo Cáo (Reports)**.
- Hệ thống sẽ xuất toàn bộ dữ liệu của kỳ hiện tại thành file `.xlsx` bao gồm điểm thành phần, tổng điểm và xếp loại để phục vụ tính lương thưởng.

## 4. Quản Lý Tài Khoản / Phân Quyền

*Lưu ý: Hiện tại trong giai đoạn Test (UAT), đăng nhập đang được mở công khai dạng "Fake Login" (chọn tên để vào).*

- **Trưởng nhóm (Team Leader):** Chỉ có thể đánh giá nhân viên thuộc nhóm của mình. Admin có thể thay đổi Leader của nhóm trong tab **Teams** (Settings).
- **Trưởng phòng / Quản lý cấp cao (Manager):** Có quyền xem báo cáo tổng quan của toàn bộ nhân viên, nhưng không được thay đổi điểm nếu không phải là người đánh giá trực tiếp.
- Các điều chỉnh quyền hạn và thiết lập bảo mật RLS sẽ được kích hoạt ở giai đoạn sau (Phase 44).

## 5. Xử Lý Sự Cố Thường Gặp

- **Lỗi đồng bộ (Sync error):** Thường do mất kết nối mạng, F5 (Tải lại trang). Dữ liệu điểm đã nhập trước đó sẽ không bị mất vì đã được autosave trên Supabase.
- **Xếp loại không hiển thị hoặc bị "#N/A":** Kiểm tra lại công thức ở tab **Settings > Criteria**. Có thể cấu hình minScore/maxScore đang bị thiết lập có lỗ hổng hoặc bị trùng lặp khoảng điểm.
