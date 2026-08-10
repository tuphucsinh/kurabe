# Known Bugs & Notes - Kurabe QAQC Evaluation

## Technical Debt
- [x] **Data Persistence**: Đã chuyển sang dùng Supabase thay thế localStorage.
- [ ] **Formula Validation**: Các công thức tính điểm (nhóm E, F) cần được kiểm thử kỹ hơn với các trường hợp biên (tất cả 5, tất cả 1, hoặc có tiêu chí âm).
- [x] **Type Safety**: Refactored `src/lib/db/*.ts` to use Supabase generated types, removed most `as any` casts.
- [x] **Technical Debt (Linting)**: Đã hoàn thành Refactor Type Safety cho thư viện Database ở Phase 31.

## UI/UX
- [x] **Mobile Touch Targets**: Nút chọn điểm (1-5) trên mobile đã được tăng padding (p-5).
- [x] **Export Feature**: Đã hoàn thành tính năng Export ra file Excel.
- [x] **Real-time Sync**: Đã sử dụng Supabase để sync real-time thay cho localStorage.

## Logic
- [x] **Grading Consistency**: Đã fix lỗi logic xếp loại AB/B cho nhân viên, hiện tại xếp loại hoạt động ổn định và chính xác theo `minScore`/`maxScore`.
