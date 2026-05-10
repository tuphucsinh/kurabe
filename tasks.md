## Phase 33: Visibility & Authorization Refinement

### [#P33T01] [src/lib/db/evaluations.ts] `Update filtering logic`

**Mục tiêu**: Lọc evaluations dựa trên role và evaluatorId để đảm bảo Leader/SubLeader chỉ thấy những bản đánh giá họ tham gia.

**Interface mới**:
~~~ts
// Cập nhật signature
export async function getEvaluations(user?: User | null): Promise<Evaluation[]>;
export async function getEvaluationsByPeriod(periodId: string, user?: User | null): Promise<Evaluation[]>;
export async function getEvaluationByEmployee(employeeId: string, periodId?: string, requester?: User | null): Promise<Evaluation | null>;
~~~

**Thay đổi cụ thể**:
1. Trong `getEvaluations` & `getEvaluationsByPeriod`: 
   - Nếu `user.role` là `Leader` hoặc `SubLeader`:
     - Bước 1: Query `evaluation_rounds` để lấy danh sách `evaluation_id` mà `user.id` là `evaluator_id`.
     - Bước 2: Query `evaluations` với `.or(`employee_id.eq.${user.id},id.in.(${ids.join(',')})`)`.
2. Trong `getEvaluationByEmployee`:
   - Thêm tham số `requester`.
   - Nếu `requester` không phải Admin/Manager, kiểm tra xem `requester.id` có phải là `employeeId` hoặc có nằm trong danh sách evaluator của evaluation đó không.

**Ràng buộc**:
- Admin/Manager thấy tất cả.
- Tránh `!inner` join nếu làm mất các rounds khác của evaluation.
- Xử lý case `ids` rỗng cho `.in.()`.

**Status**: `[x]`

---

### [#P33T02] [src/hooks/use-db.ts] `Update hooks with user context`

**Mục tiêu**: Đồng bộ hooks với logic filter mới và phân tách cache React Query.

**Thay đổi cụ thể**:
1. `useEvaluations(user)`: Thêm `user?.id` vào `queryKey`.
2. `useEvaluationsByPeriod(periodId, user)`: Thêm `user?.id` vào `queryKey`.
3. `useEvaluationByEmployee(employeeId, periodId, requester)`: Thêm `requester?.id` vào `queryKey`.

**Status**: `[x]`

---

### [#P33T03] [src/app/evaluations/page.tsx] & [src/app/evaluations/[id]/page.tsx] `UI Integration`

**Mục tiêu**: Lấy user từ context và truyền vào hooks.

**Thay đổi cụ thể**:
1. Sử dụng `useUserContext()` để lấy `user` hiện tại.
2. Truyền `user` vào `useEvaluations`, `useEvaluationsByPeriod` và `useEvaluationByEmployee`.

**Status**: `[x]`

---

### [#P33T04] [src/actions/evaluation.ts] `Dynamic Approval Flow`

**Mục tiêu**: Điều chỉnh logic chuyển round dựa trên role của người được đánh giá.

**Thay đổi cụ thể**:
1. Xác định Round tiếp theo dựa trên role employee:
   - Employee: R1(SubLeader) -> R2(Leader) -> R3(Manager).
   - SubLeader: R1(Leader) -> R2(Manager) -> Done.
   - Leader: R1(Manager) -> Done.
2. Cập nhật `saveEvaluationRound` để tìm `nextEvaluator` đúng theo hierarchy của team.

**Status**: `[ ]`

