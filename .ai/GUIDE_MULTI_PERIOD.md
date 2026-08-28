# Hướng dẫn Quản lý Đa kỳ Đánh giá

Tính năng multi-period cho phép Kurabe lưu nhiều kỳ đánh giá và liên kết mỗi evaluation với đúng `period_id`. Kỳ `Active` là kỳ đang mở để thực hiện đánh giá; kỳ `Closed` là kỳ đã đóng và phải được bảo vệ khỏi mọi thay đổi dữ liệu.

## 1. Phạm vi trạng thái hiện tại

- Có thể tạo kỳ mới, chọn kỳ trong bộ chọn kỳ, xem dữ liệu theo kỳ ở các màn hình có hỗ trợ period selector và đóng kỳ.
- Lịch sử kỳ `Closed` theo route riêng `/history/[employeeId]` đã implement, verify local và commit tại `f79f94f`; chưa push/deploy.
- Detail và compare hiện hành phải theo contract Active-only ở server, không lấy kỳ từ `localStorage` hoặc `AuthContext.currentPeriod` làm authority.

## 2. Tạo kỳ đánh giá mới

- **Ai thực hiện:** chỉ `Manager`.
- **Cách làm:**
  1. Mở Dashboard hoặc khu vực quản lý kỳ.
  2. Chọn **Tạo kỳ mới** khi chưa có kỳ `Active`.
  3. Nhập năm đánh giá. UI hiện tại tự sinh tên theo mẫu `Kỳ {year}`; không có ô nhập tên hoặc ngày bắt đầu/kết thúc.

- **Hành động hệ thống:**
  - Tạo một record trong `evaluation_periods` với status `active`.
  - Khởi tạo evaluation và Round 1 theo workflow cho các user active, bao gồm cả Manager self-evaluation.
  - Việc tạo kỳ phải giữ invariant chỉ một kỳ `Active`. UI đang ẩn nút khi đã có Active; server-side uniqueness/guard vẫn là điều kiện cần được bảo vệ khi thay đổi write path.

## 3. Chuyển đổi giữa các kỳ

- **Ai thực hiện:** người dùng có quyền xem dữ liệu tương ứng.
- **Cách làm:**
  1. Mở **Bộ chọn kỳ** trong Sidebar.
  2. Chọn kỳ muốn xem.

Bộ chọn kỳ và `selected_period_id` là **UI preference** cho các màn hình hỗ trợ xem nhiều kỳ; không phải server authority cho mọi route.

### Ngoại lệ bắt buộc: evaluation detail và compare

Hai route mặc định:

```text
/evaluations/[id]
/evaluations/[id]/compare
```

phải resolve period ở server trước khi query evaluation:

```text
0 Active  → NO_ACTIVE_PERIOD → không query evaluation
1 Active  → dùng đúng activePeriodId
2+ Active → MULTIPLE_ACTIVE_PERIODS → fail-closed
```

Quy tắc:

- Query aggregate phải lọc chính xác `period_id = activePeriodId`.
- React Query key phải chứa `activePeriodId` thật; không cache bằng `undefined`.
- Không dùng `localStorage`, `AuthContext.currentPeriod` hoặc kỳ `Closed` làm authority cho current detail/compare.
- Không fallback âm thầm sang kỳ `Closed` hoặc kỳ mới nhất.
- `NO_ACTIVE_PERIOD` phải hiển thị trạng thái rõ: **Hiện chưa có kỳ đánh giá đang mở.**
- `MULTIPLE_ACTIVE_PERIODS` phải fail-closed và ghi nhận anomaly để xử lý dữ liệu/configuration.

## 4. Đóng kỳ đánh giá

- **Ai thực hiện:** chỉ `Manager`.
- **Cách làm:**
  1. Chọn kỳ đang `Active`.
  2. Mở Dashboard hoặc khu vực quản lý kỳ.
  3. Chọn **Đóng kỳ** và xác nhận.

- **Hành động hệ thống:** cập nhật period sang `Closed` và ghi `closed_at`.
- Kỳ `Closed` phải read-only ở cả UI và server. Không được chỉ ẩn nút chỉnh sửa ở UI.
- **Trạng thái implementation:** server-side Closed-period guard đã được triển khai trong Phase 96; historical route Phase 97 chỉ read-only và không thay đổi write path.

## 5. Lịch sử kỳ đã đóng — Phase 97

Phase 97 candidate cung cấp lối vào riêng, explicit và read-only:

```text
Lịch sử đánh giá
  ├── Kỳ 2025 · Đã đóng
  └── Kỳ 2026 · Đã đóng
```

Yêu cầu:

- Server authorize bằng `requireAuth()` và `canViewEvaluation()`.
- Không làm thay đổi kỳ `Active` hiện tại.
- Không bắt người dùng nhập query parameter để mở kỳ cũ.
- Mọi write vào evaluation thuộc kỳ `Closed` phải bị server từ chối.
- Candidate đã có plan/WBS riêng và đã qua verification/review; commit/push/deploy là bước release riêng, chưa thực hiện.

## 6. Data integrity và thao tác nguy hiểm

- Mọi evaluation và round phải giữ đúng `period_id`; không query evaluation chỉ theo `employee_id` khi route cần current period.
- Không xóa trực tiếp `evaluation_periods` trong database nếu đã có evaluations/rounds.
- Nếu cần xóa kỳ, chỉ dùng server action có kiểm tra quyền Manager và trạng thái kỳ; phải có approval, backup/rollback expectation và xác nhận cascade.
- Không tạo kỳ test hoặc xóa dữ liệu test trên production. Dùng org/fixture test được phép và cleanup theo đúng ID sau khi test PASS.

## 7. Verification an toàn

### Kiểm tra read-only

- Xác nhận UI chỉ hiển thị **Tạo kỳ mới** khi không có Active.
- Kiểm tra bộ chọn kỳ hiển thị rõ `Active`/`Closed`.
- Kiểm tra Dashboard/Reports/Employees tải đúng period đã chọn ở các route hỗ trợ period selector.
- Kiểm tra detail/compare bằng dữ liệu được phép:
  - đúng một Active → query có `period_id` đúng;
  - không Active → `NO_ACTIVE_PERIOD`;
  - nhiều Active → `MULTIPLE_ACTIVE_PERIODS` và không mở nhầm dữ liệu.
- Kiểm tra không có console error, request failure hoặc cross-period data leak.

### Kiểm tra có mutation

Chỉ thực hiện trên fixture/org test được phép, không mặc định trên production:

1. Tạo một kỳ test qua UI với quyền Manager.
2. Xác nhận evaluation/Round 1 được khởi tạo theo workflow, bao gồm Manager nếu là user active.
3. Đóng kỳ test.
4. Xác nhận mọi write vào kỳ `Closed` bị server từ chối.
5. Cleanup đúng kỳ test sau khi toàn bộ kiểm tra PASS.

## 8. Contract kỹ thuật tham chiếu

| Trạng thái | Ý nghĩa |
|---|---|
| `Active` | Kỳ đang mở; current detail/compare chỉ chấp nhận đúng một kỳ Active. |
| `Closed` | Kỳ đã đóng; dữ liệu lịch sử, không tự động fallback vào current route. |
| `NO_ACTIVE_PERIOD` | Không có kỳ Active; fail-closed, không query evaluation current route. |
| `MULTIPLE_ACTIVE_PERIODS` | Dữ liệu/configuration bất thường; fail-closed, không tự chọn một kỳ. |

Nguồn liên quan:

- `src/actions/period.ts` — create/close/delete period.
- `src/contexts/AuthContext.tsx` — UI period preference.
- `src/lib/db/evaluations.ts` — period helpers và mapping status.
- `src/app/evaluations/[id]` và `src/app/evaluations/[id]/compare` — current evaluation routes.
- `.ai/MASTER_PLAN.md` — canonical implementation plan và residual risks.
- `.ai/DECISIONS_LOG.md` — quyết định Active-only và Phase 97 deferred.
