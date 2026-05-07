# MASTER PLAN - KURABE DELETE FUNCTIONALITY

## Phase 1: Infrastructure & Hooks
- [ ] [#P1T01] [src/hooks/use-db.ts]: Thêm các hooks xóa sử dụng server actions.
- [ ] [#P1T02] [.ai/DECISIONS_LOG.md]: Ghi nhận việc thêm chức năng xóa.

## Phase 2: Employees Page
- [ ] [#P2T01] [src/app/employees/page.tsx]: Thêm cột thao tác với nút xóa nhân viên.

## Phase 3: Teams Page
- [ ] [#P3T02] [src/app/teams/page.tsx]: Thêm nút xóa vào thẻ nhóm.

## Phase 4: Criteria Page
- [ ] [#P4T03] [src/app/criteria/page.tsx]: Thêm nút xóa cho tiêu chí và nhóm tiêu chí.

## Phase 29: Performance Optimization & Cleanup
- [x] Đã hoàn thành tối ưu hoá hooks (staleTime), AuthContext (giảm re-render), và xử lý dữ liệu Reports/Dashboard.

## Phase 30: Linting & Tech Debt Cleanup
- [x] Sửa lỗi type safety `error: any` sang `error: unknown` ở các file `src/actions/*`
- [x] Xóa các unused imports và variable unused để dọn dẹp code
- [x] Thêm `eslint-disable-next-line react-hooks/set-state-in-effect` cho các pattern SSR hydration guard và prop→state sync hợp lệ
- [x] Cập nhật KNOWN_BUGS cho các lỗi `any` còn lại trong `src/lib/db/*` (Sẽ xử lý trong Phase Refactor riêng)
