# Phase 97 — Lịch sử đánh giá

## Status

`PASS_WITH_CONSTRAINT — committed at c171462; chưa push/deploy`

## Goal

Cung cấp route read-only riêng để người dùng xem các kết quả đánh giá đã hoàn tất của một employee theo từng kỳ `Closed`, không làm thay đổi kỳ `Active`, scoring, workflow, auth/RBAC, schema hoặc các write path.

## Verified current state

- `src/components/evaluation/HistoryList.tsx` đang hiển thị summary lịch sử inline cho owner; đây là component client và chỉ phù hợp summary.
- `src/data/workflow.ts:142-162` là predicate `canViewEvaluation()` hiện hành; Manager xem tất cả, owner/evaluator/đúng flow mới được xem.
- `src/lib/db/users-admin.ts` đã có server-only `supabaseAdmin` và `getUserByIdAdmin`/user mapping cho route cần target employee.
- `src/lib/supabase-admin.ts:1-15` cấm đưa service-role client vào client component.
- `src/app/evaluations/[id]/page.tsx` là server wrapper mỏng gọi client child; route mới có thể dùng server page tương tự nhưng phải query lịch sử server-side.
- `src/components/layout/Sidebar.tsx:40-55` là nguồn link điều hướng hiện hành.
- `src/components/evaluation/HistoryList.tsx`/admin query hiện có không cung cấp route lịch sử đầy đủ theo closed period.

## Decision / optimality

**Chọn:** server page `/history/[employeeId]` + dedicated server-only admin query + stateless read-only renderer.

- Tốt hơn client-only query vì auth/access denial nằm ở server boundary.
- Tốt hơn query parameter vì route rõ target và không bắt người dùng hiểu `employeeId`.
- Không thêm bảng/index/RPC/migration vì dữ liệu period/evaluation/round đã tồn tại.
- Không thay đổi `HistoryList` inline ngoài việc không dùng nó làm authority cho route mới.

## Scope

### In scope

1. Server-only query lấy target employee, các evaluation của target có `status = 'Approved'`, join/resolve period, chỉ giữ period raw `status = 'closed'`.
2. Lọc từng evaluation bằng `canViewEvaluation(viewer, evaluation, allUsersContext)`; không tin employeeId từ client để bypass.
3. Route `/history/[employeeId]` có auth guard; target không tồn tại/không có quyền trả not-found/empty theo convention hiện tại, không lộ dữ liệu.
4. UI hiển thị tên/mã target ở mức cần thiết, danh sách theo kỳ giảm dần, score/grade/round summary và trạng thái read-only; có loading/error/empty states phù hợp server render.
5. Link self-history trong sidebar và link history từ employee list ở đúng surface hiện có, không thêm mutation control.
6. Unit/contract tests cho closed-only, active exclusion, access denial, empty/error và không có write action.

### Explicitly out of scope

- Không đóng/tạo/xóa/reopen/restore period.
- Không save/submit/approve/AI/export/import.
- Không sửa `db/**`, schema, migration, RPC, scoring, workflow hoặc `ChatWidget`.
- Không đổi semantics `canViewEvaluation`, `HistoryList` inline, current Active resolver hay evaluation write guard.
- Không login/mutation trên production; không push/deploy trong phase này.

## Data contract

```ts
type HistoryPageData = {
  target: User;
  entries: Array<{
    evaluation: Evaluation;
    period: EvaluationPeriod;
  }>;
};
```

- `entries` chỉ chứa `evaluation.status === 'Approved'` và `period.status === 'Closed'`.
- Sort: `period.year DESC`, sau đó `period.createdAt DESC`, sau đó `evaluation.id ASC`.
- Nếu target tồn tại nhưng không có entry hợp lệ: hiển thị empty state, không fallback sang Active/latest.
- Nếu viewer thiếu auth hoặc không có quyền với target/evaluation: fail closed; không trả raw evaluation/round data.
- Admin query là server-only; client renderer chỉ nhận mapped data đã qua guard/filter.

## Ordered WBS

### P97T01 — Query/access boundary

- Files: `src/lib/db/evaluation-history-admin.ts` (new), bounded edits only in `src/lib/db/users-admin.ts` if an existing helper is insufficient.
- Depends on: intake above; no DB/schema dependency.
- Implement: load viewer/target context through existing server auth contract; query target evaluations with closed-period relation; map with existing mappers; build all-users context only as needed by `canViewEvaluation`; filter fail-closed.
- Tests: closed-only, Active exclusion, Manager/owner/Leader/SubLeader access predicate and no-target/DB-error behavior with mocked admin client at module boundary.
- Verify: focused test command; no production endpoint/mutation.
- Stop: if existing mapper/query shape cannot provide period data without a schema change, stop and report `Insufficient data.` rather than expanding schema.

### P97T02 — Read-only route and renderer

- Files: `src/app/history/[employeeId]/page.tsx` (new), `src/app/history/[employeeId]/error.tsx` (new safe route boundary), `src/components/evaluation/EvaluationHistoryPage.tsx` (new), optional existing UI link files only.
- Depends on: P97T01.
- Implement: server auth/access boundary; page title/back link; period cards with final grade/score/round status; explicit read-only label; empty/error states; no buttons/forms/actions that mutate.
- Tests: component/contract tests for list, empty, error, and absence of mutation controls.
- Verify: typecheck + focused test; route static inspection.
- Stop: if page imports `supabaseAdmin` into client code or introduces a write handler.

### P97T03 — Navigation integration

- Files: `src/components/layout/Sidebar.tsx`, the existing employee list action component only after exact link location is verified.
- Depends on: P97T02.
- Implement: self-history link for individual users; authorized employee-history link for staff surface; preserve existing nav/actions and mobile/desktop behavior.
- Tests: link href contract and existing layout tests.
- Verify: diff scope and no action-handler change.
- Stop: do not add broad employee search, query parameters, or new permission semantics.

### P97T04 — Verification and evidence

- Depends on: P97T01–T03.
- Run exact project gates: focused test, `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check`.
- Browser lane: local build/server only if project-native route verification is available; use unauthenticated route check plus authorized existing session only for read-only render. Production mutation is forbidden.
- Capture redacted evidence outside source tree under `/home/pi5/hermes-artifacts/kurabe/p97/` if screenshots are needed; do not save credentials, cookies, tokens, employee PII dumps, or raw session state.
- Acceptance requires actual route render, closed-only behavior, no console/runtime error observed in the tested route, and no changed protected paths.

## Rollback / stop

- Rollback is a bounded source revert to the pre-Phase-97 baseline for only changed files; no database rollback is needed because this phase has no DB mutation/schema change.
- Stop immediately on source drift, auth/access ambiguity, schema requirement, test failure repeated twice, accidental production mutation, secret/PII exposure, or scope expansion.
- No commit, push, deployment or production browser mutation is implied by this plan.

## Risk and unknowns

- **R1/R2:** server read path and UI route; no durable DB mutation.
- **RISK:** historical evaluation rows may have soft-deleted targets or incomplete round data; renderer must degrade to safe empty/partial display without weakening access.
- **UNKNOWN:** exact existing employee-row action component/link insertion point until source is re-read immediately before patch.
- **VERIFIED:** current production has active external writers; this phase does not depend on lifecycle quiescence and must not touch those writes.

## Reviewer gate

Because this phase changes a server auth/read boundary, route access and data exposure must receive a fresh independent review after implementation. Reviewer evaluates the diff/test package only; Mika owns final verification.
