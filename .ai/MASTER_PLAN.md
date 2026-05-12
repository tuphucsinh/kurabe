# MASTER_PLAN.md

## Completed Phases
### Phase 32: Data Management & Reset 2026
- Xóa thành công dữ liệu kỳ đánh giá 2026 (ID: `818f9273-2f73-49be-9463-9d82a1719797`) khỏi Database.
- Bổ sung Server Action `deleteEvaluationPeriod` để hỗ trợ xóa kỳ đánh giá từ UI.

### Phase 33: Visibility & Authorization Refinement
- Lọc evaluations theo owner/evaluator, không mở rộng quyền theo toàn team.
- Đồng bộ React Query key và UI hooks với user context.
- Cập nhật approval flow động theo role: Employee qua SubLeader/Leader/Manager, SubLeader qua Leader/Manager, Leader qua Manager.

### Phase 34: Workflow Correction
- Tạo shared workflow contract tại `src/lib/evaluation-workflow.ts`.
- Đồng bộ khởi tạo kỳ, submit round, helper quyền, detail UI và compare UI theo rule: Manager tự đánh giá 1 vòng; Leader tự đánh giá rồi Manager; SubLeader tự đánh giá rồi Leader rồi Manager; Employee do SubLeader, Leader, Manager đánh giá.
- Chuẩn hóa grade theo role người được đánh giá và loại bỏ giả định UI mọi evaluation đều có 3 vòng.

### Phase 35: Draft-Gated Evaluation Visibility
- Bổ sung `EvaluationRoundStatus` + `EvaluationAccessState` để tách rõ `edit/readonly/blocked`.
- Đồng bộ quyền xem/sửa theo draft-gated workflow cho Employee/SubLeader/Leader/Manager, gồm guard Manager chỉ edit khi round trước đã submitted.
- Chuẩn hóa mapping trạng thái round từ DB (`submitted_at` ưu tiên cao nhất), thêm fallback legacy dữ liệu nháp.
- Siết server action submit/draft: dùng `actorId`, chặn save draft vào round đã submit, cập nhật status round/evaluation đúng flow, thêm rollback best-effort khi submit flow lỗi.
- Hoàn thiện UI detail/compare theo access-state; compare chỉ hiển thị visible rounds và empty state `Chưa có đánh giá.`.
- Cập nhật `tsconfig` loại `scratch/` khỏi typecheck để giữ baseline build sạch.

## Next Phases
### Phase 36: Vercel Deployment & Production Readiness
- Verify local production build to catch environment/type issues.
- Configure Environment Variables on Vercel Dashboard.
- Connect GitHub repository to Vercel for Automated Deployment.
- Final production smoke test.
