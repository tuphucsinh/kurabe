# Kiến thức hệ thống KURABE — cho Chat Widget hỗ trợ

> Tài liệu tham khảo của trợ lý chat. Mô tả chức năng + quy trình (KHÔNG chứa dữ liệu nhân sự thật). Mọi câu trả lời phải dựa trên nội dung này, gọi khách là "anh" hoặc "chị" (theo giới tính người dùng), xưng "em", không dùng emoji.

## 1. Tổng quan

KURABE là hệ thống đánh giá năng lực QAQC theo kỳ (period). Quy trình gồm nhiều vòng đánh giá tuần tự, mỗi chức vụ có số vòng riêng. Hệ thống quản lý: nhân viên, nhóm, tiêu chuẩn đánh giá, thang điểm, kỳ đánh giá, kết quả xếp loại.

## 2. Kiến trúc kỹ thuật

- Frontend: Next.js (App Router) + React Query + Tailwind CSS.
- Backend: Supabase (PostgreSQL) — dữ liệu nhân sự, đánh giá, tiêu chuẩn, nhật ký.
- Server Actions (thư mục `src/actions/`) xử lý nghiệp vụ + quyền; giao diện ở `src/app/`; component dùng chung ở `src/components/`.
- Tính năng AI dùng model gpt-5.6-luna qua opencode; AI chỉ là gợi ý, người dùng phải rà soát trước khi dùng.

## 3. Vai trò và quyền

| Vai trò | Quyền chính |
|---|---|
| **Manager** | Quản trị toàn hệ thống: nhân sự, nhóm, Leader, tiêu chuẩn, thang điểm, kỳ đánh giá; chấm vòng cuối; trả lại đánh giá; đóng kỳ; xem báo cáo toàn hệ thống; dùng AI nâng cao. |
| **Leader** | Quản lý 1 nhóm: tự đánh giá, chấm vòng 2 cho nhân viên, trả lại vòng 1 cho SubLeader, thêm/sửa Nhân viên hoặc SubLeader trong nhóm mình, xem báo cáo phạm vi nhóm. KHÔNG xóa nhân viên, không đổi Leader. |
| **SubLeader** | Phụ trách nhóm nhỏ: tự đánh giá, chấm vòng 1 cho nhân viên trong nhóm phụ trách, sửa lại khi bị trả về. KHÔNG thêm/sửa/xóa nhân viên. |
| **Nhân viên** | Chỉ xem kết quả đánh giá của mình sau khi chốt. KHÔNG tự chấm. |
| **Công nhân** | (Role Worker) Nhân sự trực tiếp/sản xuất: chỉ xem kết quả đánh giá của mình sau khi chốt. KHÔNG tự chấm. Áp dụng bảng tiêu chuẩn và thang điểm riêng cho Công nhân (Worker). |

## 4. Workflow đánh giá (theo vòng)

- **Manager**: 1 vòng — tự đánh giá (SELF) là xong.
- **Leader**: 2 vòng — Vòng 1 tự đánh giá, Vòng 2 Manager chấm.
- **SubLeader**: 3 vòng — Vòng 1 tự đánh giá, Vòng 2 Leader, Vòng 3 Manager.
- **Nhân viên**: 3 vòng — Vòng 1 SubLeader, Vòng 2 Leader, Vòng 3 Manager chốt.
- **Công nhân**: 3 vòng — Vòng 1 SubLeader, Vòng 2 Leader, Vòng 3 Manager chốt (áp dụng tiêu chuẩn và thang điểm riêng cho Công nhân).

Nguyên tắc tuần tự: **vòng sau chỉ mở khi vòng trước đã nộp**. Đã nộp là khóa, không tự sửa; muốn sửa phải bị cấp trên trả lại (kèm lý do bắt buộc).

## 5. Quy trình thao tác từng chức vụ

### Manager
1. Đăng nhập; đặt mật khẩu lần đầu (Cài đặt → Tài khoản) nếu chưa có.
2. Tạo nhóm + bổ nhiệm Leader (Nhóm → Thêm nhóm mới → chọn Leader). Mỗi nhóm 1 Leader duy nhất.
3. Thêm/sửa/xóa nhân viên: trang Nhân viên (nút Thêm nhân viên, bút chì sửa, thùng rác xóa — xóa mềm, lịch sử giữ lại) HOẶC nút Thêm nhân viên ngay trên trang chi tiết nhóm (nhóm tự chọn sẵn là nhóm đang mở). Import hàng loạt bằng Nhập từ Excel với File mẫu.
4. Kiểm tra/soạn tiêu chuẩn (Tiêu chuẩn): nhóm tiêu chí A-F, mức điểm, Mức mặc định (áp cho kỳ mới). Thay đổi ảnh hưởng kỳ hiện tại — rà soát trước khi lưu.
5. Chỉnh thang điểm xếp loại (Cài đặt → Thang điểm): khoảng điểm S/A/AB/B/C/D.
6. Tạo kỳ đánh giá (Cài đặt → Kỳ đánh giá) nếu chưa có; chọn kỳ hoạt động.
7. Tự đánh giá bản thân (Nhân viên → tên mình → mở phiếu → chấm → Gửi).
8. Theo dõi tiến độ (Dashboard + Nhân viên + trang chi tiết nhóm): badge trạng thái Chưa bắt đầu / Đã nộp vòng X / Đã có KQĐG. Ở trang Nhân viên/chi tiết nhóm, ô xếp loại có viền xanh lá + dấu ✓ = đã có kết quả cuối; bấm tên nhân viên cũng mở được phiếu.
9. Chấm vòng cuối (vòng 3) khi Leader đã nộp vòng 2: mở phiếu, xem điểm/nhận xét vòng trước, chấm theo tiêu chuẩn, ghi nhận xét (có thể Gợi ý nhận xét AI), Gửi.
10. Trả lại đánh giá khi cần chỉnh: bấm Trả lại đánh giá, nhập lý do bắt buộc; người giữ lượt thấy banner vàng, sửa lại và nộp lại.
11. Dùng AI (Manager): Gợi ý nhận xét khi chấm; Soạn thông báo kết quả (AI) trên phiếu đã chốt hoặc Soạn thông báo hàng loạt ở trang Báo cáo (AI tự viết riêng cho từng nhân viên); Giải thích bất thường khi điểm chênh lệch ≥20 giữa 2 vòng; Tạo tóm tắt AI và Soạn Biên bản kết thúc kỳ trên Báo cáo; hỏi trợ lý chat số liệu/tình hình theo trang (tìm kiếm ngữ nghĩa).
12. Xem báo cáo (Dashboard + Báo cáo): KPI, tiến độ nhóm, phân bổ xếp loại, radar năng lực, Top Performers, tóm tắt AI.
13. Đóng kỳ (Cài đặt → Kỳ đánh giá) khi mọi nhân viên đã có kết quả vòng cuối; kỳ đóng khóa thao tác, dữ liệu vẫn xem được.

### Leader
1. Đăng nhập; đặt mật khẩu lần đầu nếu chưa có.
2. Xem Dashboard + Nhân viên: tiến độ nhóm, ai còn giữ lượt.
3. Thêm/sửa nhân viên trong nhóm mình: trang Nhân viên hoặc trang chi tiết nhóm (nút Thêm nhân viên, nhóm tự chọn là nhóm của mình). KHÔNG xóa, không đổi Leader.
4. Tự đánh giá bản thân (1 vòng), rồi Manager chấm vòng cuối.
5. Chấm vòng 2 khi SubLeader đã nộp vòng 1: tham khảo điểm vòng 1 để tránh chênh lệch lớn.
6. Trả lại vòng 1 khi cần SubLeader chỉnh (kèm lý do).
7. Xem báo cáo phạm vi nhóm.

### SubLeader
1. Đăng nhập; đặt mật khẩu lần đầu nếu chưa có.
2. Xem Dashboard + Nhân viên phụ trách.
3. Chấm vòng 1 cho nhân viên trong nhóm phụ trách: mở phiếu (icon tài liệu hoặc bấm tên), chấm theo nhóm tiêu chuẩn A-F, Lưu bản nháp thường xuyên, kiểm tra rồi Gửi.
4. Tự đánh giá bản thân.
5. Bị trả về → xem banner vàng lý do → sửa → nộp lại.

### Nhân viên
1. Đăng nhập; đặt mật khẩu lần đầu nếu chưa có.
2. Xem kết quả của mình sau khi Manager chốt: mở phiếu (icon hoặc bấm tên), xem điểm/nhận xét từng vòng + xếp loại cuối.
3. Không tự chấm; không mở được hồ sơ người khác (chặn theo phạm vi).

### Công nhân (Worker)
1. Đăng nhập; đặt mật khẩu lần đầu nếu chưa có.
2. Xem kết quả của mình sau khi Manager chốt: mở phiếu (icon hoặc bấm tên), xem điểm/nhận xét từng vòng + xếp loại cuối.
3. Không tự chấm; không mở được hồ sơ người khác (chặn theo phạm vi).

## 6. Trang đánh giá (phiếu chấm điểm)

- Khi mở phiếu: **nhóm tiêu chuẩn đầu tiên (NHÓM A) được highlight sẵn**.
- Dãy nhóm tiêu chuẩn (A-F) ở ĐẦU trang và **LẶP LẠI Ở CUỐI trang** ("Chuyển nhanh đến nhóm tiêu chuẩn") — đánh xong nhóm nào, bấm nhóm kế tiếp ở cuối trang là chuyển + tự cuộn lên đầu, không cần cuộn tay.
- Mỗi tiêu chí: chọn 1 mức điểm (thẻ điểm +/-, mức mặc định được chọn sẵn), có thể ghi chú riêng (nút GHI CHÚ).
- Trạng thái vòng: các nhãn L1/L2/L3 thể hiện điểm từng vòng đã nộp; chỉ tính vòng đã nộp, vòng đang nháp không tính vào kết quả.
- Cột Xếp loại gần nhất: hiển thị đầy đủ các vòng đã nộp (L1 trái → vòng cao phải); viền xanh lá + ✓ = đã có kết quả cuối.
- Nút Ghi chú chung + Gợi ý nhận xét (AI) + Soạn thông báo kết quả (AI, Manager) ở cột phải.
- Nút "Trả lại đánh giá" (cấp trên) khi cần chỉnh; "Lưu bản nháp" lưu tạm; "Gửi Đánh giá" nộp chính thức (khóa vòng).
- Nút "Chi tiết so sánh" xem so sánh điểm giữa các vòng.

## 7. Các trang chính

- **Bảng điều khiển (Dashboard)**: KPI, tiến độ từng nhóm, phân bổ xếp loại, cảnh báo bất thường, hoạt động gần đây.
- **Nhóm**: danh sách nhóm; chi tiết nhóm hiển thị thẻ Leader (đầu danh sách) + các SubLeader + nhân viên trực thuộc, kèm kết quả đánh giá từng người + nút Thêm nhân viên (Manager/Leader) + nút Xem đánh giá.
- **Nhân viên**: bảng toàn bộ nhân sự, tìm kiếm theo tên/mã, lọc theo Nhóm/Chức vụ, cột Chức vụ / Chức danh / Giới tính / Xếp loại gần nhất, nút Thêm nhân viên / Nhập từ Excel / File mẫu, thao tác xem/sửa/đặt lại mật khẩu/xóa.
- **Chức danh**: là trường "Chức danh" trong hồ sơ nhân viên (nhập khi thêm/sửa nhân viên), hiển thị ở cột Chức danh (vd Shusa, Shunin, Sub-Leader, Kakarichou...). Chỉ role quản lý (Manager/Leader/SubLeader) mới hiển thị chức danh; Nhân viên và Công nhân không hiển thị chức danh, dù có nhập.
- **Giới tính**: mỗi nhân viên có giới tính Nam/Nữ (khi thêm/sửa nhân viên chọn giới tính; mặc định Nữ).
- **Báo cáo**: radar năng lực, khoảng cách so mục tiêu, biến động điểm qua vòng, Top Performers, tóm tắt AI; nút Soạn thông báo kết quả (AI, hàng loạt) và Soạn Biên bản kết thúc kỳ (Manager).
- **Tiêu chuẩn**: nhóm tiêu chí A-F, thêm/sửa/xóa tiêu chí, mức điểm, mức mặc định.
- **Cài đặt**: tab Tài khoản (đổi/đặt mật khẩu), Kỳ đánh giá (tạo/đóng), Thang điểm, Nhóm & Quyền, Nhật ký, Mục tiêu.
- **Hướng dẫn**: hướng dẫn theo chức vụ + sơ đồ quy trình 3 vòng + FAQ + in A4 (nút "In Hướng Dẫn A4" mở bản in theo chức vụ).

## 8. Lỗi và trục trặc thường gặp

- **Không mở được phiếu đánh giá**: vòng trước chưa nộp — vòng sau chưa mở (kể cả Manager). Nhắc người đang giữ lượt nộp.
- **Không sửa được đánh giá đã gửi**: vòng đã nộp bị khóa; phải bị cấp trên trả lại mới sửa.
- **Đặt mật khẩu lần đầu**: Cài đặt → Tài khoản → nút Đặt mật khẩu (tối thiểu 6 ký tự); quên mật khẩu → Manager đặt lại (nút khóa trên trang Nhân viên, mật khẩu về trống).
- **Chênh lệch điểm lớn giữa 2 vòng (≥20)**: Dashboard cảnh báo; Manager dùng Giải thích bằng AI để phân tích.
- **Xóa nhân viên nhầm**: xóa là xóa mềm — nhân viên không còn trong kỳ mới nhưng lịch sử đánh giá cũ vẫn giữ để đối chiếu.
- **Thay đổi tiêu chuẩn giữa kỳ**: áp dụng ngay cho kỳ hiện tại — rà soát kỹ trước khi lưu.
- **Chưa có kỳ đánh giá**: tạo ở Cài đặt → Kỳ đánh giá; nhân viên chỉ đánh giá trong kỳ đang hoạt động.
- **Mỗi nhóm mấy Leader**: đúng 1; đổi Leader ở Nhóm → Chỉnh sửa nhóm.

> Lưu ý: quy tắc ứng xử của trợ lý (xưng hô theo giới tính, không emoji, phạm vi trả lời theo chức vụ...) do hệ thống cấu hình riêng — không liệt kê trong tài liệu này.
