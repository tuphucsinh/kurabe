# KURABE QAQC — Task List (WBS)

> `/do` anchor. Chỉ giữ **Phase ACTIVE + work PAUSED/GATED còn thực sự pending**.
> Future phases chỉ nằm ở `.ai/MASTER_PLAN.md` và chỉ được `/plan2task` khi trở thành ACTIVE.
> Runner **không edit `tasks.md`, không commit**; Mika tick sau independent verification.

## Dispatch semantics

- **Independent: yes** = sau khi `Depends on` đã satisfied, task không cần output/coordination từ sibling task khác và có thể giao runner riêng.
- **Parallel-safe: yes** = file ownership/runtime state không overlap với task khác trong cùng wave; Mika có thể dùng worktree riêng cho `agy/coder`.
- Chỉ dispatch song song khi **cả hai** task đều `Independent: yes` + `Parallel-safe: yes` và cùng wave/prerequisite đã mở.
- Production DB mutation, production lifecycle và branch-setting luôn serial dù source candidates trước đó parallel được.
- Mỗi runner nhận BASE_SHA + exact task block; Mika merge/commit từng task sau verify.

## Parallel dispatch map — Phase 98

| Wave | Có thể dispatch đồng thời | Điều kiện |
|---|---|---|
| **P98-W1** | `P98M1T01` + `P98M1T02` | Start Phase 98 |
| **P98-W2** | `P98M2T01` + `P98M3T01` | `P98M1T02` PASS |
| **P98-W3** | `P98M2T02` + `P98M2T04` | `P98M2T01` PASS |
| **P98-W4** | `P98M2T03` | `P98M2T02` PASS |
| **P98-W5 SERIAL** | `P98M2T05` → `P98M3T02` | source/reviewer gates PASS + explicit production approval |

> `P98M1T01` có thể hoàn tất/merge bất kỳ lúc nào trước Phase 98 gate; nó không block W2 vì W2 phụ thuộc DB catalog, không phụ thuộc framework patch.

---

# Phase 98: Release Blockers & Production Truth — ACTIVE

## Milestone M1: Framework patch + production truth

### [#P98M1T01] [`package.json`, `package-lock.json`] `upgradeNextPatch(): DependencySet`

**Goal**: Nâng Next khỏi affected `<16.3.3` sang patched 16.3 release mà không kéo unrelated upgrades.

**Depends on**: `none`.

**Parallel-safe**: `yes`.

**Independent**: `yes` — chỉ sở hữu package manifests.

**Dispatch wave**: `P98-W1`.

**New interface**: none.

**Context hiện có**:
- `next` + `eslint-config-next` đang `16.3.2`.
- Baseline lint/typecheck/tests/build PASS.

**Concrete changes**:
1. Nâng `next` lên `16.3.4` hoặc newer approved patch cùng 16.3 line.
2. Match `eslint-config-next` exact patch.
3. Update lockfile; không chủ động bump dependency khác.
4. Kiểm tra Image Optimization route nếu app dùng.

**Constraints**:
- Không major/minor migration.
- Không suppress advisory.
- Không sửa app semantics.

**Definition of Done**:
- `npm ci`, lint, typecheck, full tests, build, `git diff --check`, `npm audit --omit=dev` PASS.
- Installed Next `>=16.3.3`; không edit `tasks.md`, không commit.

**Status**: `[x]`

---

### [#P98M1T02] [read-only Supabase catalog → `.tmp/p98-production-catalog.json`] `captureProductionCatalog(): ProductionTruth`

**Goal**: Chốt live DB security/integrity truth trước mọi migration.

**Depends on**: `none`.

**Parallel-safe**: `yes`.

**Independent**: `yes` — read-only; không đụng source/package.

**Dispatch wave**: `P98-W1`.

**New interface**:
```ts
type ProductionTruth = {
  activePeriodCount: number;
  nullPasswordCount: number;
  nullEvaluatorCount: number;
};
```

**Context hiện có**:
- Live index/RPC/RLS/grants không được suy đoán từ SQL file.

**Concrete changes**:
1. Read Active cardinality, migration ledger, indexes.
2. Read function definitions/signatures + execute grants.
3. Read RLS/table grants; aggregate NULL password/evaluator counts.
4. Diff expected repo objects với live catalog.

**Constraints**:
- SELECT/catalog only; không DDL/DML, raw PII hay credential.
- Drift hoặc `Active > 1` → STOP.

**Definition of Done**:
- Artifact có PASS/UNKNOWN/DRIFT + provenance cho từng gate.
- Zero mutation; không edit `tasks.md`, không commit.

**Status**: `[ ]`

---

### [#P98M2T01] [`supabase/migrations/20260905070000_p98_password_setup.sql`, `db/rollback-p98-password-setup.sql`, `src/types/database.ts`] `password_setup_state`

**Goal**: Tạo data contract tối thiểu cho setup/reset one-time; NULL hash không còn mang nghĩa credential hợp lệ.

**Depends on**: `[#P98M1T02]`.

**Parallel-safe**: `yes`.

**Independent**: `yes` — file ownership tách khỏi evaluator migration.

**Dispatch wave**: `P98-W2`.

**New interface**:
```ts
interface PasswordSetupTokenRecord {
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
}
```

**Context hiện có**:
- `resetPassword()` set `password_hash=null`; `login()` bỏ password check khi NULL.
- Catalog T02 cho biết legacy NULL-hash population.

**Concrete changes**:
1. Candidate schema cho explicit setup-required + one-time token state.
2. Constraints/indexes cho one-time/expiry/revoke semantics.
3. Add exact rollback + provenance.
4. Update DB types theo schema candidate.

**Constraints**:
- Raw token không lưu DB.
- Không production apply.
- Không migrate sang Supabase Auth.

**Definition of Done**:
- Fresh-schema/static migration test + rollback review PASS.
- No production mutation; không edit `tasks.md`, không commit.

**Status**: `[x]`

---

### [#P98M2T02] [`supabase/migrations/20260905072000_p98_password_setup_transaction.sql`, `db/rollback-p98-password-setup-transaction.sql`, `src/lib/auth-password-setup.ts`, `src/actions/account.ts`, `src/actions/auth.ts`, `tests/p98-password-setup.test.mjs`] `resetPassword()` + `completePasswordSetup()` + `login()`

**Goal**: Normal login fail-closed với NULL/setup-required; reset revoke sessions và issue one-time setup credential.

**Depends on**: `[#P98M2T01]`.

**Parallel-safe**: `yes`.

**Independent**: `yes` — sau schema contract, chỉ sở hữu auth service/action files.

**Dispatch wave**: `P98-W3`.

**New interface**:
```ts
type ResetPasswordResult =
  | { success: true; setupToken: string; expiresAt: string }
  | { success: false; error: string };

// Candidate RPC boundary: reset/session/token writes and setup token consume/password update are transactional.
// Raw passwords/tokens never cross the database boundary; only bcrypt/token hashes do.
```

**Context hiện có**:
- Existing reset đã delete sessions nhưng tạo NULL password state.
- Login hiện giữ Q3 passwordless fallback.

**Concrete changes**:
1. NULL/setup-required normal login → reject.
2. Add candidate transaction RPCs for reset/token issuance and setup token consume/password update, with exact rollback.
3. Reset: revoke sessions, mark setup-required, store token hash/expiry through the transaction RPC.
4. Add setup action validate+consume token, set bcrypt hash, clear setup state through the transaction RPC.
5. Revoke prior tokens on reset/success.
6. Add focused regression coverage for valid/wrong/NULL login, session revoke, expired/used token, setup→login, unauthorized reset, and RPC/rollback contracts.

**Constraints**:
- Cryptographic random, short-lived, one-time token.
- Không log password/raw token.
- Generic auth errors, không unnecessary account-state leak.
- Candidate migration only; no production apply or live RPC mutation.

**Definition of Done**:
- `node tests/p98-password-setup.test.mjs` covers valid/wrong/NULL login, session revoke, expired/used token, setup→login, unauthorized reset, and RPC/rollback contracts.
- Full gates PASS; không edit `tasks.md`, không commit.

**Status**: `[x]`

---

### [#P98M2T03] [`src/app/setup-password/page.tsx`, `src/components/account/PasswordSetupForm.tsx`] `PasswordSetupPage`

**Goal**: Cung cấp bounded unauthenticated setup UI để user dùng one-time token tạo password mới sau reset.

**Depends on**: `[#P98M2T02]`.

**Parallel-safe**: `yes`.

**Independent**: `yes` — route/component mới, không sửa auth action ownership.

**Dispatch wave**: `P98-W4`.

**New interface**:
```ts
type PasswordSetupFormProps = { token: string };
```

**Context hiện có**:
- Auth action T02 cung cấp `completePasswordSetup`.
- Normal login đã fail-closed khi setup-required.

**Concrete changes**:
1. Add setup route nhận token từ URL theo safe parsing.
2. Form nhập password + confirm; call setup action.
3. Success → login route; invalid/expired/used token → generic safe error.
4. Add browser/component regression tests.

**Constraints**:
- Không render/log token ngoài input flow.
- Không expose employee/account details.
- Mobile/keyboard/accessibility phải usable.

**Definition of Done**:
- Valid setup browser flow PASS; expired/used token fails safely; no console/JS error.
- Full gates + browser verify PASS; không edit `tasks.md`, không commit.

**Status**: `[ ]`

---

### [#P98M2T04] [`supabase/migrations/20260905070500_p98_mark_legacy_password_setup.sql`, `db/rollback-p98-mark-legacy-password-setup.sql`] `markLegacyNullPasswordsSetupRequired()`

**Goal**: Chuẩn bị chuyển existing NULL-hash accounts sang setup-required mà không tạo default/shared password.

**Depends on**: `[#P98M2T01]`.

**Parallel-safe**: `yes`.

**Independent**: `yes` — migration file riêng; không sửa auth source.

**Dispatch wave**: `P98-W3`.

**New interface**: none.

**Context hiện có**:
- Aggregate legacy count lấy từ T02 catalog.
- User chỉ nhận raw setup token khi Manager trigger reset/setup flow, không batch-generate token.

**Concrete changes**:
1. Preflight exact eligible count.
2. Candidate update chỉ mark setup-required cho NULL-hash rows.
3. Add affected-row assertions + rollback.
4. Add no-lockout migration test.

**Constraints**:
- Không production apply.
- Không auto-generate password/token.
- Evidence không chứa employee list.

**Definition of Done**:
- Candidate + rollback + no-lockout test PASS.
- Không edit `tasks.md`, không commit.

**Status**: `[ ]`

---

### [#P98M2T05] [production auth migration + Vercel readback] `rolloutPasswordSetupHardening(): AuthEvidence`

**Goal**: Controlled rollout P0 fix và chứng minh production không còn NULL-password normal login.

**Depends on**: `[#P98M1T01], [#P98M2T02], [#P98M2T03], [#P98M2T04]`.

**Parallel-safe**: `no`.

**Independent**: `no` — mutable production state; serial controlled gate.

**Dispatch wave**: `P98-W5 SERIAL`.

**New interface**: none.

**Context hiện có**:
- Source/schema candidates phải đã Mika-verify + fresh Reviewer PASS.
- Production DB mutation cần explicit user approval.

**Concrete changes**:
1. Freeze source/deployment/catalog preflight.
2. Apply reviewed schema + legacy-state migration exact order.
3. Deploy/readback canonical main.
4. Run safe auth matrix: NULL blocked, reset/setup/login, old session revoked.
5. Postflight counts/catalog.

**Constraints**:
- Explicit production approval bắt buộc.
- Mismatch → STOP + reviewed rollback, không fix-forward.
- Không bulk expose legacy identities.

**Definition of Done**:
- P0 behavior closed live; migration ledger/catalog/source SHA verified.
- Reviewer/Mika evidence PASS; không edit `tasks.md`, runner không commit.

**Status**: `[ ]`

### Milestone M2 Gate — Mika + fresh Reviewer
- AUTH-01 chỉ CLOSED sau T05 runtime evidence.
- T05 production state phải ổn định trước bất kỳ production DB mutation tiếp theo.

---

## Milestone M3: Evaluator authorization NULL-safety

### [#P98M3T01] [`supabase/migrations/20260905071000_p98_evaluator_null_safety.sql`, `db/rollback-p98-evaluator-null-safety.sql`, `tests/p98-evaluator-auth.test.mjs`] `save_evaluation_round_transaction*`

**Goal**: Reject NULL/wrong evaluator bằng NULL-safe SQL ở underlying + active-only transaction path.

**Depends on**: `[#P98M1T02]`.

**Parallel-safe**: `yes`.

**Independent**: `yes` — migration/test files riêng, tách auth lane.

**Dispatch wave**: `P98-W2`.

**New interface**: none.

**Context hiện có**:
- Legacy SQL dùng `v_round.evaluator_id != p_actor_id`.
- Active-only wrapper delegate underlying function.

**Concrete changes**:
1. Replace comparison bằng `IS DISTINCT FROM` hoặc explicit NULL reject.
2. Giữ wrapper/underlying semantics đồng nhất.
3. Add forward migration + exact rollback/provenance.
4. Test NULL, wrong, correct evaluator, submitted, Closed.

**Constraints**:
- Không trust evaluator payload client.
- Không production apply.
- Không đổi scoring/workflow.

**Definition of Done**:
- Focused tests + full gates PASS.
- Fresh Reviewer package ready; không edit `tasks.md`, không commit.

**Status**: `[x]`

---

### [#P98M3T02] [production evaluator migration + RPC canary] `rolloutEvaluatorNullSafety(): RpcEvidence`

**Goal**: Apply reviewed NULL-safety migration và verify live authorization.

**Depends on**: `[#P98M2T05], [#P98M3T01]`.

**Parallel-safe**: `no`.

**Independent**: `no` — production DB mutation serial.

**Dispatch wave**: `P98-W5 SERIAL`.

**New interface**: none.

**Context hiện có**:
- Source migration/rollback phải Reviewer PASS trước execute.

**Concrete changes**:
1. Preflight source SHA/catalog/no-concurrent-write nếu cần.
2. Apply exact reviewed migration.
3. Readback function signature/definition/grants.
4. Canary assigned vs NULL/wrong evaluator.

**Constraints**:
- Explicit production approval bắt buộc.
- Mismatch → STOP/rollback reviewed path; không broad cleanup.

**Definition of Done**:
- NULL/wrong rejected live; assigned path unaffected; catalog matches reviewed SQL.
- Mika/Reviewer evidence PASS; không edit `tasks.md`, không commit.

**Status**: `[ ]`

---

### [#P96T10] [existing read-only manifest] `captureLifecycleBaseline(): EvidenceManifest`

**Goal**: Giữ provenance của baseline/rollback manifest đã hoàn tất; chỉ refresh read-only nếu production drift làm evidence cũ không còn usable.

**Depends on**: `none`.

**Parallel-safe**: `no`.

**Independent**: `no` — thuộc serial production lifecycle.

**Dispatch wave**: `P96E-PAUSED`.

**New interface**: none.

**Context hiện có**:
- Preflight read-only đã PASS_WITH_CONSTRAINT; không lifecycle mutation đã chạy.

**Concrete changes**:
1. Không mutation.
2. Final integration phase quyết định reuse hay refresh read-only.

**Constraints**:
- Không claim hidden env value.
- Không persist PII/token.

**Definition of Done**:
- Existing evidence usable hoặc refreshed read-only with provenance.
- Không edit `tasks.md`, không commit.

**Status**: `[x]`

---

### [#P96T11] [production period actions] `exercisePeriodTransition(): LifecycleEvidence`

**Goal**: Nếu được re-enable, close old Active + create exact test period trong maintenance window.

**Depends on**: `[#P96T10]`.

**Parallel-safe**: `no`.

**Independent**: `no`.

**Dispatch wave**: `P96E-PAUSED`.

**New interface**: none.

**Context hiện có**:
- Exact rollback manifest bắt buộc trước mutation.

**Concrete changes**:
1. Verify maintenance + zero concurrent evaluator write.
2. Close old period; create test period.
3. Capture exact IDs/affected rows/audit after each mutation.

**Constraints**:
- Explicit production approval.
- Partial/mismatch → STOP.

**Definition of Done**:
- Exactly 1 Active; no orphan/duplicate; exact run IDs recorded.
- Không edit `tasks.md`, không commit.

**Status**: `[ ]`

---

### [#P96T12] [browser contexts + DB readback] `verifyStaleAndClosedBehavior(): E2EEvidence`

**Goal**: Verify stale-tab/no-Active/Closed-write behavior chỉ trên run-created safe data.

**Depends on**: `[#P96T11]`.

**Parallel-safe**: `no`.

**Independent**: `no`.

**Dispatch wave**: `P96E-PAUSED`.

**New interface**: none.

**Context hiện có**:
- Active resolver + Closed-write guard đã có source path.

**Concrete changes**:
1. Verify current/old contexts across dashboard/reports/detail/compare.
2. Close test period.
3. Attempt Closed write only on safe run-created evaluation.

**Constraints**:
- Không submit/approve/AI.
- Không dùng baseline business evaluation nếu safe fixture vắng.

**Definition of Done**:
- Closed write rejected with no unexpected DB/audit delta; stale state resolves correctly.
- Không edit `tasks.md`, không commit.

**Status**: `[ ]`

---

### [#P96T13] [exact-ID production rollback] `rollbackLifecycleRun(manifest): IntegrityResult`

**Goal**: Restore old-period snapshot và delete exact run-created test graph trong một FK-safe transaction.

**Depends on**: `[#P96T12]`.

**Parallel-safe**: `no`.

**Independent**: `no`.

**Dispatch wave**: `P96E-PAUSED`.

**New interface**: none.

**Context hiện có**:
- Exact run IDs từ previous lifecycle steps là authority.

**Concrete changes**:
1. Delete exact children theo FK order.
2. Delete exact test/audit/AI rows.
3. Restore exact old-period fields.
4. Assert hashes/counts/affected rows.

**Constraints**:
- Explicit approval.
- Cấm prefix/LIKE/time-range broad delete.
- Assertion fail → rollback transaction + STOP.

**Definition of Done**:
- Baseline restored exactly; test residue absent; duplicate/orphan=0.
- Không edit `tasks.md`, không commit.

**Status**: `[ ]`
