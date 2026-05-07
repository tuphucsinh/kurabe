# Known Bugs & Notes - Kurabe QAQC Evaluation

## Technical Debt
- [x] **Data Persistence**: Đã chuyển sang dùng Supabase thay thế localStorage.
- [ ] **Formula Validation**: Các công thức tính điểm (nhóm E, F) cần được kiểm thử kỹ hơn với các trường hợp biên (tất cả 5, tất cả 1, hoặc có tiêu chí âm).
- [ ] **Type Safety**: Một số chỗ dùng `any` trong `scoring.ts` khi xử lý dynamic criteria.
- [ ] **Technical Debt (Linting)**: Vẫn còn nhiều `any` và warning trong `src/lib/db/*`, sẽ xử lý ở Phase Refactor riêng biệt.

## UI/UX
- [x] **Mobile Touch Targets**: Nút chọn điểm (1-5) trên mobile đã được tăng padding (p-5).
- [ ] **Export Feature**: Chưa có tính năng xuất PDF/Excel kết quả đánh giá.
- [x] **Real-time Sync**: Đã sử dụng Supabase để sync real-time thay cho localStorage.

## Logic
- [ ] **Grading Consistency**: Xếp loại AB/B cho nhân viên đôi khi bị chồng lấn điểm nếu không check kỹ `minScore`/`maxScore`.
