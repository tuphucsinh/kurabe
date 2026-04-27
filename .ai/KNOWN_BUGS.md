# Known Bugs & Notes - Kurabe QAQC Evaluation

## Technical Debt
- [ ] **Data Persistence**: Hiện tại data được lưu trong `localStorage`. Cần tích hợp Supabase cho production.
- [ ] **Formula Validation**: Các công thức tính điểm (nhóm E, F) cần được kiểm thử kỹ hơn với các trường hợp biên (tất cả 5, tất cả 1, hoặc có tiêu chí âm).
- [ ] **Type Safety**: Một số chỗ dùng `any` trong `scoring.ts` khi xử lý dynamic criteria.

## UI/UX
- [x] **Mobile Touch Targets**: Nút chọn điểm (1-5) trên mobile đã được tăng padding (p-5).
- [ ] **Export Feature**: Chưa có tính năng xuất PDF/Excel kết quả đánh giá.
- [ ] **Real-time Sync**: Nếu mở trên 2 tab, data `localStorage` có thể bị conflict.

## Logic
- [ ] **Grading Consistency**: Xếp loại AB/B cho nhân viên đôi khi bị chồng lấn điểm nếu không check kỹ `minScore`/`maxScore`.
