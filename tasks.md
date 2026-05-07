# Tasks

## Phase 29: Bug Fix + Refactor + Optimization

### [#P29T01] [src/actions/period.ts] Fix `is_active` query

**Mục tiêu**: Thêm cột `is_active` (boolean, default true) vào bảng `users` trên Supabase. Sửa query `.eq('is_active', true)` cho đúng.

**Thay đổi cụ thể**:
1. Chạy migration trên Supabase: `ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE NOT NULL;`
2. Verify query `period.ts:40` hoạt động đúng sau migration

**Ràng buộc**:
- Tất cả users hiện tại default `is_active = true`
- Không thay đổi code — chỉ cần DB migration

**Status**: `[x]`

---

### [#P29T02] [src/hooks/use-db.ts] Fix `useEvaluationByEmployee` enable condition

**Mục tiêu**: Hook phải hoạt động khi không truyền `periodId`.

**Thay đổi cụ thể**:
1. Sửa `enabled: !!employeeId && !!periodId` → `enabled: !!employeeId`
2. DAL `getEvaluationByEmployee` đã handle case `periodId` undefined

**Ràng buộc**:
- KHÔNG thay đổi DAL logic
- Callers (evaluation page, compare page) KHÔNG cần sửa

**Status**: `[ ]`

---

### [#P29T03] [src/lib/db/evaluations.ts] Chuẩn hóa `mapPeriodFromDb` status

**Mục tiêu**: Mapper period status robust hơn, handle edge case.

**Thay đổi cụ thể**:
1. Sửa mapping dùng `.toLowerCase()` check thay vì hard compare

~~~ts
// Trước:
status: db.status === 'active' ? 'Active' : 'Closed',
// Sau:
status: db.status?.toLowerCase() === 'active' ? 'Active' : 'Closed',
~~~

**Ràng buộc**: Không thay đổi behavior hiện tại

**Status**: `[ ]`

---

### [#P29T04] [src/contexts/AuthContext.tsx] Tách queries, giảm re-render

**Mục tiêu**: AuthContext gọi 2 Supabase queries trong 1 effect, set 4 state riêng → 4 lần re-render. Tối ưu cho free tier.

**Thay đổi cụ thể**:
1. Gộp state updates vào 1 batch setState
2. Kiểm tra `isInitialized` trước khi set state → tránh double-render Strict Mode

**Ràng buộc**:
- Giữ nguyên localStorage persistence behavior
- Giữ nguyên API: `useAuth()` trả về cùng interface

**Status**: `[ ]`

---

### [#P29T05] [src/hooks/use-db.ts] Thêm `staleTime` cho React Query hooks

**Mục tiêu**: Default `staleTime = 0` → mỗi mount đều refetch. Free tier 500K row reads/month → lãng phí.

**Thay đổi cụ thể**:
1. `useUsers`, `useTeams`, `useCriteria` → `staleTime: 5 * 60 * 1000` (5 phút)
2. `useEvaluations` → `staleTime: 2 * 60 * 1000` (2 phút)
3. `usePeriods`, `useActivePeriod` → `staleTime: 10 * 60 * 1000` (10 phút)

**Ràng buộc**:
- Mutation hooks (`useUpsert*`, `useDelete*`) vẫn invalidate đúng → data fresh sau write
- Không ảnh hưởng UX — data vẫn tự refresh khi window focus

**Status**: `[ ]`

---

### [#P29T06] [src/app/reports/page.tsx] Tối ưu Reports data processing

**Mục tiêu**: `reportData` useMemo nặng — nested `.filter().map().reduce()` lặp lại. Tối ưu CPU time.

**Thay đổi cụ thể**:
1. Pre-build `Map<userId, User>` và `Map<teamId, User[]>` 1 lần thay vì `users.find()` N lần
2. Single-pass grade counting thay vì multiple `.filter()` calls

**Ràng buộc**:
- Output KHÔNG đổi, chỉ optimize internal computation
- Không thay đổi UI rendering

**Status**: `[x]`

---

### [#P29T07] [src/app/dashboard/page.tsx] Tối ưu Dashboard tương tự

**Mục tiêu**: Dashboard page dùng nhiều `.find()` trong `useMemo` + map bên JSX.

**Thay đổi cụ thể**:
1. Pre-build lookup maps cho users → tránh O(n²) trong gradeData + teamStatus
2. Cache `evaluations.slice(0,5)` thay vì tính lại mỗi render

**Ràng buộc**: Không thay đổi UI

**Status**: `[x]`
