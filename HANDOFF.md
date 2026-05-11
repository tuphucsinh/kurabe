# HANDOFF - 2026-05-11

## Status
- Repo đang dirty (nhiều thay đổi chưa commit), tập trung vào Phase 35 + UI/UX fixes cho quy trình đánh giá và trang Hỗ trợ.
- Đã sửa/hoàn thiện luồng đánh giá nhiều vòng theo “draft-gated visibility” và chỉnh quyền theo vai trò (SubLeader/Leader/Manager), bao gồm trạng thái xem/sửa, submit, compare/detail.
- Đã sửa lỗi submit tạo vòng kế tiếp bị crash do `ON CONFLICT` không có constraint (chuyển sang check-exists + insert).
- Đã sửa UI/UX: bỏ `alert()` cho lưu nháp và submit, thay bằng toast top-center; fix flicker “không thể tải vòng đánh giá”; fix “xếp loại gần nhất” hiển thị nhầm vì round kế tiếp NotStarted.
- Đã xử lý tiêu chí có nhiều thẻ cùng điểm (A3) bằng cách lưu bền vững lựa chọn theo `level index` qua metadata.
- Đã mở quyền Leader thêm/sửa nhân viên trong nhóm mình quản lý (không cho xóa; khóa team/role theo scope).
- Đã làm đẹp và sắp xếp lại trang Hỗ trợ: layout header gọn + quick nav + cột phải sticky; bổ sung hướng dẫn chi tiết và quyền hạn.
- Đã thêm nút “Xóa kỳ” cho Manager (có xác nhận 2 bước) tại Dashboard.

## Files Touched (high level)
- Evaluations: `src/app/evaluations/[id]/page.tsx`, `src/app/evaluations/[id]/compare/page.tsx`, `src/actions/evaluation.ts`, `src/data/workflow.ts`, `src/lib/db/evaluations.ts`, `src/types/index.ts`, `src/lib/round-level-selection.ts`, `src/components/evaluation/CriteriaTab.tsx`, `src/components/evaluation/EvaluationHeader.tsx`.
- Employees: `src/app/employees/page.tsx`, `src/components/modals/EmployeeModal.tsx`.
- Admin: `src/app/dashboard/page.tsx`, `src/actions/period.ts`.
- Support: `src/app/support/page.tsx`.
- Misc: `tsconfig.json`, `MASTER_PLAN.md`, `.ai/MASTER_PLAN.md`, `scratch/*`.

## Verification
- Pass: `npx tsc --noEmit`.
- Pass: `npx eslint "src/app/support/page.tsx"`.
- Lưu ý: `git status` đang có nhiều file modified/untracked; chưa chạy full `npm run lint` toàn repo trong snapshot này.

## Pending / Notes
- Cần quyết định có commit/push các thay đổi hiện tại hay không (hiện chưa commit).
- Nếu muốn khóa chặt hơn: thêm guard ở data layer/server action cho quyền Leader quản lý nhân viên (hiện đã chặn ở UI/handler).
