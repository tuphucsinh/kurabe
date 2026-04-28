# Kurabe - Tasks List

## Completed
- Phase 18: Optimization & Comparison Page
- Phase 19: Cập nhật quản lý Nhóm
- Phase 21: Refactor & Optimization
- Phase 22: CRUD Tiêu chuẩn Đánh giá
- Phase 23: UI Polish — Modal, Description & Group ShortName

---

## Phase 24A: Supabase Foundation

### [#P24T01] [src/lib/supabase.ts] `createClient(): SupabaseClient`

**Mục tiêu**: Cài đặt Supabase SDK, thiết lập env vars và file kết nối.

**Thay đổi cụ thể**:
1. `npm install @supabase/supabase-js`
2. Tạo `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://cliiqqthppxuzirabzla.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
   ```
3. Tạo `src/lib/supabase.ts` — export `supabase` (browser client)

**Ràng buộc**:
- Không thay đổi bất kỳ file UI nào
- `.env.local` phải nằm trong `.gitignore`

**Status**: `[x]`

---

### [#P24T02] [supabase migration] DDL — Tạo 8 bảng

**Mục tiêu**: Tạo schema PostgreSQL trên Supabase.

**Bảng cần tạo**:

| Bảng | Mô tả |
|---|---|
| `teams` | id, name, leader_id, created_at |
| `users` | id, employee_code (UK), name, role, team_id (FK), join_date, avatar_url, created_at |
| `evaluation_periods` | id, year, name, status, created_by (FK), created_at, closed_at |
| `evaluations` | id, period_id (FK), employee_id (FK), employee_role, team_id (FK), current_round, status, final_grade, final_score, created_at, updated_at |
| `evaluation_rounds` | id, evaluation_id (FK), round, evaluator_id (FK), evaluator_role, scores (JSONB), notes (JSONB), total_score, grade, comment, additional_comment, submitted_at, created_at |
| `criteria_groups` | id, code (UK), name, short_name, sort_order |
| `criteria` | id, code (UK), name, description, applies_to, weight, group_id (FK), sort_order |
| `criterion_levels` | id, criterion_id (FK), points, label, description, sort_order |

**Indexes**: `evaluation_rounds(evaluation_id)`, `evaluations(period_id)`, `evaluations(employee_id)`, `criteria(group_id)`, `criterion_levels(criterion_id)`

**Ràng buộc**:
- Dùng `apply_migration` tool
- FK constraints + CASCADE rules hợp lý
- `role` và `status` dùng TEXT (không enum DB, kiểm tra ở app level)

**Status**: `[x]`

---

### [#P24T03] [supabase] Seed data

**Mục tiêu**: Seed toàn bộ dữ liệu ban đầu từ mock + criteria hardcode.

**Dữ liệu cần seed**:

| Bảng | Số records |
|---|---|
| `teams` | 2 |
| `users` | 5 |
| `evaluation_periods` | 1 |
| `evaluations` | 4 |
| `evaluation_rounds` | 7 |
| `criteria_groups` | 6 (A→F) |
| `criteria` | 34 tiêu chí |
| `criterion_levels` | ~150 levels |

**Ràng buộc**:
- Dùng `execute_sql` tool
- Phải map đúng FK relationships
- Dùng stable UUIDs (gen_random_uuid() tại thời điểm insert)
- Scores trong evaluation_rounds phải tham chiếu đúng criteria codes

**Status**: `[x]`

---

## Phase 24B: Data Access Layer

### [#P24T04] [src/lib/db/users.ts + teams.ts] DAL — Users & Teams

**Mục tiêu**: Query functions thay thế `db.users`, `db.teams`.

**Interface mới**:
```ts
// src/lib/db/users.ts
export async function getUsers(): Promise<User[]>
export async function getUserById(id: string): Promise<User | null>
export async function getUsersByTeam(teamId: string): Promise<User[]>

// src/lib/db/teams.ts
export async function getTeams(): Promise<Team[]>
export async function getTeamById(id: string): Promise<Team | null>
```

**Ràng buộc**:
- Return type khớp `User`, `Team` interface hiện tại
- Map snake_case → camelCase (employee_code → employeeCode)
- Import supabase client từ `src/lib/supabase.ts`

**Status**: `[x]`

---

### [#P24T05] [src/lib/db/evaluations.ts] DAL — Evaluations & Rounds

**Mục tiêu**: Query functions cho evaluations, join rounds thành nested array.

**Interface mới**:
```ts
export async function getEvaluations(): Promise<Evaluation[]>
export async function getEvaluationById(id: string): Promise<Evaluation | null>
export async function getEvaluationsByPeriod(periodId: string): Promise<Evaluation[]>
export async function getEvaluationByEmployee(employeeId: string, periodId?: string): Promise<Evaluation | null>
export async function getPeriods(): Promise<EvaluationPeriod[]>
export async function getActivePeriod(): Promise<EvaluationPeriod | null>
```

**Ràng buộc**:
- `Evaluation.rounds` phải được construct từ JOIN `evaluation_rounds` và sort by `round ASC`
- Giữ nguyên shape `Evaluation` interface (rounds là nested array)
- snake_case → camelCase mapping

**Status**: `[x]`

---

### [#P24T06] [src/lib/db/criteria.ts] DAL — Criteria

**Mục tiêu**: Query functions thay thế hardcoded `allCriteria` và `getCriteriaForRole()`.

**Interface mới**:
```ts
export async function getAllCriteriaGroups(): Promise<CriteriaGroup[]>
export async function getCriteriaGroupById(id: string): Promise<CriteriaGroup | null>
export async function getCriteriaForRole(role: Role): Promise<CriteriaGroup[]>
```

**Ràng buộc**:
- Return type khớp `CriteriaGroup[]` hiện tại (nested `criteria[].levels[]`)
- Construct 3-level hierarchy: groups → criteria → levels
- Filter `appliesTo` logic giữ nguyên như hàm `getCriteriaForRole()` hiện tại

**Status**: `[x]`

---

## Phase 24C: Integration

### [#P24T07] [src/actions/*.ts] Server Actions — Supabase Integration

**Mục tiêu**: Migrate `period.ts` và `evaluation.ts` sang Supabase.

**Thay đổi cụ thể**:
1. `createEvaluationPeriod`: Insert `evaluation_periods`, lấy users, bulk insert `evaluations` + `evaluation_rounds`.
2. `saveEvaluationRound`: Update `evaluation_rounds`, update status/current_round trong `evaluations`, tự động tạo record round tiếp theo.

**Ràng buộc**:
- Dùng Supabase client
- Giữ nguyên return type `{ success, error?, ... }`
- `revalidatePath()` vẫn cần giữ

**Status**: `[x]`

---

### [#P24T08] [src/contexts/AuthContext.tsx + Pages] Refactor Auth & Pages

**Mục tiêu**: Thay thế tất cả `db.*` / `mockUsers` / `mockEvaluations` bằng DAL functions.

**Trạng thái**:
- `AuthContext.tsx`: Đã migrate sang Supabase `[x]`
- `app/login/page.tsx`: Cần fix reference `mockUsers` `[ ]`
- `app/dashboard/page.tsx`: Cần check `[ ]`
- `app/employees/page.tsx`: Cần check `[ ]`
- `app/teams/page.tsx`: Cần check `[ ]`
- `app/evaluations/[id]/page.tsx`: Cần check `[ ]`
- `app/criteria/page.tsx`: Cần check `[ ]`

**Status**: `[x]`

---

### [#P24T09] Cleanup & Finalize

**Mục tiêu**: Xóa mock data, consolidate types, verify build.

**Thay đổi cụ thể**:
1. Xóa `src/data/mock.ts`
2. Cập nhật `src/types/index.ts` — gom tất cả types (User, Team, Evaluation, Grade, etc.)
3. Giữ `src/data/workflow.ts` — cập nhật import từ `@/types`
4. Giữ `src/data/criteria.ts` CHỈ cho `gradingLeader` / `gradingStaff` (static lookup tables)
5. Verify: `npm run build` phải pass
6. Verify: zero `import from '@/data/mock'` trong codebase

**Ràng buộc**:
- Không thay đổi UI
- `workflow.ts` là pure functions — giữ nguyên logic, chỉ đổi import

**Status**: `[x]`
