# Master Task List (Danh sách việc cần làm)

> File này được duy trì và chia nhỏ bởi **PLANNER**, trong khi **RUNNER** sẽ sử dụng nó để làm việc và đánh dấu tiến độ hàng ngày.

## Phase 14: Workflow Data Model

| ID | Tên Phase | Nội dung chính | Status |
|---|---|---|---|
| P14 | Workflow Data Model | Refactor data model: EvaluationPeriod, Multi-round Evaluation, EvaluationRound, phân quyền theo Role | `[x]` |
| P15 | Workflow Engine | State machine, phân quyền đánh giá/review, lock sau gửi, luồng gửi/nhận thông báo | `[ ]` |
| P16 | Multi-round UI | CriteriaTab overlay đa tầng, badge phân biệt lần đánh giá, notification, dashboard cập nhật | `[ ]` |

---

### [#P14T01] [src/data/mock.ts] `Refactor types: EvaluationPeriod, EvaluationRound, Evaluation`

**Mục tiêu**: Thiết kế lại data model gốc. Thêm entity `EvaluationPeriod` (kỳ đánh giá), refactor `Evaluation` để chứa nhiều `EvaluationRound` (lần đánh giá 1/2/3).

**Interface mới**:
```ts
type PeriodStatus = 'Active' | 'Closed';
type EvalStatus = 'NotStarted' | 'Draft' | 'Submitted' | 'Reviewed' | 'Approved';
type RoundNumber = 1 | 2 | 3;

interface EvaluationPeriod {
  id: string;
  year: number;
  name: string;           // VD: "Kỳ đánh giá 2026"
  status: PeriodStatus;
  createdBy: string;      // Manager userId
  createdAt: string;
  closedAt?: string;
}

interface EvaluationRound {
  round: RoundNumber;
  evaluatorId: string;    // Người đánh giá lần này
  evaluatorRole: Role;    // Role snapshot tại thời điểm đánh giá
  scores: Record<string, number>;  // criteriaId → points
  notes: Record<string, string>;   // criteriaId → ghi chú
  totalScore: number;
  grade: Grade;
  comment?: string;       // Nhận xét chung cho lần đánh giá này
  submittedAt?: string;   // null = Draft, có giá trị = Locked
  createdAt: string;
}

interface Evaluation {
  id: string;
  periodId: string;       // Thuộc kỳ đánh giá nào
  employeeId: string;     // Người ĐƯỢC đánh giá
  employeeRole: Role;     // Role snapshot
  teamId: string;
  rounds: EvaluationRound[];  // Max 3 rounds
  currentRound: RoundNumber;  // Round đang active
  status: EvalStatus;     // Trạng thái tổng
  finalGrade?: Grade;     // Grade cuối cùng (sau Manager approve)
  finalScore?: number;
  createdAt: string;
  updatedAt: string;
}
```

**Thay đổi cụ thể**:
1. Thêm types mới: `PeriodStatus`, `EvalStatus`, `RoundNumber`
2. Thêm interface: `EvaluationPeriod`, `EvaluationRound`
3. Refactor interface `Evaluation`: bỏ `evaluatorId`, `scores`, `totalScore`, `grade` trực tiếp → chuyển vào `rounds[]`
4. Thêm field: `periodId`, `employeeRole`, `teamId`, `rounds`, `currentRound`, `finalGrade`, `finalScore`, `updatedAt`
5. Refactor `MockDB`: thêm `periods: EvaluationPeriod[]`
6. KHÔNG đổi `User`, `Team` interface

**Ràng buộc**:
- Backward-compatible: Export cũ (`Evaluation`, `MockDB`) vẫn phải tồn tại (interface mới, tên cũ)
- `Grade` type từ `mock.ts` và `scoring.ts` phải đồng bộ
- Giữ `Role` type tại `mock.ts` (thêm 'Employee' nếu chưa có) — KHÔNG import từ `criteria.ts`

**Status**: `[x]`

---

### [#P14T02] [src/data/mock.ts] `Tạo mock data mới cho multi-round workflow`

**Mục tiêu**: Tạo dữ liệu mẫu phản ánh đúng quy trình 3 lần đánh giá. Bao gồm 1 kỳ đánh giá active, nhiều evaluations ở các trạng thái khác nhau.

**Thay đổi cụ thể**:
1. Thêm `mockPeriods`: 1 period active (2026)
2. Refactor `mockEvaluations` → dùng struct mới với `rounds[]`:
   - **u3** (SubLeader, t1): Round 1 done (by u2-Leader), Round 2 done (by u2-Leader review) → đang chờ Manager
   - **u4** (SubLeader, t1): Round 1 done (by u2), Round 2 in-progress (Leader đang review)
   - **u5** (SubLeader, t2): Round 1 draft (SubLeader mới bắt đầu chấm)
   - **u2** (Leader): Round 1 done (tự đánh giá), chờ Manager review
3. Cập nhật `db: MockDB` → thêm `periods` field

**Bảng mock data chi tiết**:

| employeeId | employee | currentRound | status | R1 evaluator | R1 status | R2 evaluator | R2 status |
|---|---|---|---|---|---|---|---|
| u3 | Lê Văn NV1 | 3 | Reviewed | u2 (Leader) | Submitted | u2 (Leader) | Submitted |
| u4 | Phạm Thị NV2 | 2 | Draft | u2 (Leader) | Submitted | u2 (Leader) | Draft |
| u5 | Hoàng Văn NV3 | 1 | Draft | u5 (self) | Draft | — | — |
| u2 | Trần Thị Leader | 2 | Submitted | u2 (self) | Submitted | — | — |

**Ràng buộc**:
- Điểm phải nằm trong range hợp lệ của `criteria.ts`
- `totalScore` và `grade` phải match với `scoring.ts` logic
- Round 2 scores có thể giống hoặc khác Round 1 (để demo overlay)

**Status**: `[x]`

---

### [#P14T03] [src/data/workflow.ts] `Workflow rules & permission helpers`

**Mục tiêu**: Tạo file utility chứa business rules cho workflow đánh giá: ai được đánh giá ai, ai được review ai, trạng thái chuyển đổi hợp lệ.

**Interface mới**:
```ts
// Kiểm tra quyền đánh giá
canEvaluate(evaluator: User, target: User): boolean

// Kiểm tra quyền review (round 2, 3)
canReview(reviewer: User, evaluation: Evaluation): boolean

// Lấy danh sách nhân viên mà user hiện tại có thể đánh giá
getEvaluatableEmployees(currentUser: User, allUsers: User[], teams: Team[]): User[]

// Kiểm tra evaluation có thể submit không
canSubmitRound(evaluation: Evaluation, round: RoundNumber): boolean

// Lấy round tiếp theo
getNextRound(currentRound: RoundNumber): RoundNumber | null

// Kiểm tra đã lock chưa (đã submit)
isRoundLocked(round: EvaluationRound): boolean
```

**Logic phân quyền chi tiết**:

| Evaluator Role | Đánh giá ai (Round 1) | Review ai (Round 2) | Review ai (Round 3) |
|---|---|---|---|
| SubLeader | NV cùng team + tự mình | ❌ | ❌ |
| Leader | Tự mình (Round 1) | SubLeader cùng team (nhận R1 → review R2) | ❌ |
| Manager | Tự mình | ❌ | Tất cả (nhận R1 Leader + R2 SubLeader → review R3) |

**Ràng buộc**:
- Pure functions, không side effects
- Không import React
- Export tất cả functions
- Unit-testable (stateless)

**Status**: `[x]`

---

### [#P14T04] [src/lib/scoring.ts] `Cập nhật scoring cho multi-round`

**Mục tiêu**: Thêm helper function để tính điểm/grade cho 1 round cụ thể và so sánh round khác biệt giữa các lần đánh giá.

**Interface mới**:
```ts
// Tính score cho 1 round
calculateRoundScore(round: EvaluationRound): { totalScore: number; grade: Grade }

// So sánh 2 rounds, trả về danh sách criteriaId có điểm khác
diffRounds(round1: EvaluationRound, round2: EvaluationRound): string[]

// Lấy grade cuối cùng (round cuối cùng đã submitted)
getFinalResult(evaluation: Evaluation): { totalScore: number; grade: Grade; round: RoundNumber }
```

**Thay đổi cụ thể**:
1. Thêm `calculateRoundScore()` — wrapper `calculateGrade()` nhận `EvaluationRound`
2. Thêm `diffRounds()` — trả về `criteriaId[]` mà `round2.scores[id] !== round1.scores[id]`
3. Thêm `getFinalResult()` — lấy round cuối cùng có `submittedAt` → tính `totalScore` + `grade`
4. Giữ nguyên `calculateGrade()` và `getGradeColor()` — backward compatible

**Ràng buộc**:
- KHÔNG sửa function cũ
- Import types mới từ `mock.ts`
- Pure functions

**Status**: `[x]`

---

### [#P14T05] [src/contexts/AuthContext.tsx] `Mở rộng AuthContext cho workflow`

**Mục tiêu**: Thêm computed values liên quan workflow vào AuthContext để các component con dễ truy cập quyền hạn.

**Interface mới**:
```ts
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (employeeId: string) => void;
  logout: () => void;
  // MỚI:
  isManager: boolean;
  isLeader: boolean;
  isSubLeader: boolean;
  currentPeriod: EvaluationPeriod | null;  // Kỳ đánh giá đang active
}
```

**Thay đổi cụ thể**:
1. Import `EvaluationPeriod` từ `mock.ts`, import `db`
2. Thêm computed: `isManager`, `isLeader`, `isSubLeader` — derived từ `user.role`
3. Thêm `currentPeriod` — `db.periods.find(p => p.status === 'Active')`
4. Thêm vào Provider value

**Ràng buộc**:
- KHÔNG thay đổi `login()`, `logout()` behavior
- Backward compatible — các component dùng `useAuth()` hiện tại không bị break
- `currentPeriod` nullable — chưa mở kỳ thì null

**Status**: `[x]`

---


> Mục tiêu: Thực thi logic chuyển đổi trạng thái (State Machine), xử lý Gửi/Nhận kết quả, và phân quyền thực tế trên API/Action layer.

---

### [#P15T01] [src/actions/evaluation.ts] `saveEvaluationRoundDraft(evaluationId, roundNumber, scores, notes, comment)`

**Mục tiêu**: Lưu bản nháp cho round hiện tại. Không khóa, không chuyển round.

**Thay đổi cụ thể**:
1. Kiểm tra `isRoundLocked()`
2. Cập nhật `scores`, `notes`, `comment` cho round tương ứng trong `evaluation.rounds`
3. Cập nhật `updatedAt` của evaluation
4. Tính lại `totalScore` và `grade` cho round đó (dùng `calculateRoundScore`)

**Status**: `[x]`

---

### [#P15T02] [src/actions/evaluation.ts] `submitEvaluationRound(evaluationId, roundNumber)`

**Mục tiêu**: Chốt kết quả round hiện tại. Khóa round, mở round tiếp theo nếu cần.

**Thay đổi cụ thể**:
1. Kiểm tra `isRoundLocked()`
2. Set `submittedAt = new Date().toISOString()`
3. Nếu còn round tiếp theo (`getNextRound`):
   - Tạo `EvaluationRound` mới cho round kế tiếp
   - Copy `scores`, `notes` từ round hiện tại sang làm baseline cho round mới
   - evaluatorId/evaluatorRole của round mới sẽ được xác định khi user tiếp theo mở ra (hoặc set sẵn dựa trên workflow logic)
   - Tăng `evaluation.currentRound`
4. Nếu là round cuối cùng:
   - Set `evaluation.status = 'Approved'`
   - Set `evaluation.finalScore` và `evaluation.finalGrade` từ round cuối
5. Cập nhật `db.evaluations`

**Ràng buộc**:
- Phải dùng `workflow.ts` helpers
- Đảm bảo role-based logic: Staff round 1 xong -> Leader round 2.

**Status**: `[x]`

---

### [#P15T03] [src/actions/period.ts] `initializeEvaluationPeriod(year)`

**Mục tiêu**: Manager khởi tạo kỳ đánh giá mới. Tự động tạo bản ghi Evaluation cho tất cả nhân viên dựa trên user list hiện tại.

**Thay đổi cụ thể**:
1. Check role Manager
2. Tạo `EvaluationPeriod` mới (status: Active)
3. Duyệt `mockUsers`, tạo `Evaluation` (status: NotStarted) cho mỗi người
4. Round 1 mặc định:
   - Nếu là Employee: evaluator = SubLeader cùng team
   - Nếu là SubLeader/Leader/Manager: evaluator = self (tự đánh giá)

**Status**: `[x]`

---

## Phase 16: Multi-round UI & Experience

> Mục tiêu: Cập nhật giao diện trang đánh giá để hiển thị lịch sử các round (overlay), badge phân biệt, và các nút điều khiển workflow.

---

### [#P16T01] [src/components/evaluations/CriteriaTab.tsx] `Overlay previous round scores`

**Mục tiêu**: Khi đang đánh giá Round 2/3, hiển thị điểm của Round trước đó (ví dụ Round 1) dưới dạng badge hoặc text mờ để người đánh giá tham khảo/so sánh.

**Thay đổi cụ thể**:
1. Nhận thêm prop `previousRound: EvaluationRound`
2. Tại mỗi input điểm: nếu `previousRound` có điểm, hiển thị 1 badge nhỏ bên cạnh (VD: "R1: 4")
3. Nếu điểm hiện tại khác điểm cũ -> highlight (border màu khác)

**Status**: `[x]`

---

### [#P16T02] [src/app/evaluations/[id]/page.tsx] `Workflow controls (Submit/Lock)`

**Mục tiêu**: Thêm nút "Gửi kết quả" (Submit) và xử lý trạng thái Read-only khi đã nộp.

**Thay đổi cụ thể**:
1. Thêm nút "Submit Evaluation" ở cuối trang
2. Nếu `isRoundLocked(currentRound)` -> disable tất cả input điểm/ghi chú
3. Hiển thị thông tin: "Đã nộp bởi [Tên] lúc [Giờ]"
4. Breadcrumb/Status bar: Hiển thị tiến trình (Round 1/2/3)

**Status**: `[x]`
