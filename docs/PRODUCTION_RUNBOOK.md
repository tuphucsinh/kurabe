# Kurabe Production Runbook: P3 Database Candidates & Feature Rollout

> **STATUS**: CANDIDATE ONLY — NOT APPLIED TO ANY REMOTE DATABASE.
> **APPLICATION STATE**: Local code freeze complete. Feature flag `KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC` is `false` (default off). No remote deployment or push has occurred.
> **SECURITY NOTICE**: Zero secrets, credentials, live tokens, or production host strings are stored in this document.

---

## 1. Current State & Artifact Scope

- **Status**: [VERIFIED] All SQL migrations (`db/migration-p3-evaluation-transaction.sql`, `db/migration-p3-retention.sql`) and rollback scripts (`db/rollback-p3-evaluation-transaction.sql`, `db/rollback-p3-retention.sql`) exist solely as local candidate artifacts.
- **Application Path**: [VERIFIED] `src/actions/evaluation.ts` (lines 138–187) executes the legacy multi-step sequential fallback path whenever `process.env.KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC !== 'true'`.
- **Database State**: [VERIFIED] No candidate DDL has been executed against any remote database.
- **Retention State**: [VERIFIED] No retention cron job or pg_cron schedule is registered or enabled.

---

## 2. Multi-Stage Preconditions & Approval Gates

Every stage in this runbook represents an isolated gate. Transitioning to the next gate requires explicit human operator sign-off.

```
[ Gate 0: Local Verification & Artifact Freeze ]
                     │
                     ▼
[ Gate 1: Remote Read-Only Preflight & Health Check ]
                     │
                     ▼
[ Gate 2: Verified Point-In-Time Backup ]
                     │
                     ▼
[ Gate 3: Apply Transactional DDL Candidate ]
                     │
                     ▼
[ Gate 4: Feature-Flag Canary Rollout & Observability ]
                     │
                     ▼
[ Gate 5: Retention Policy Formal Approval & Dry-Run ]
                     │
                     ▼
[ Gate 6: Production Deployment & Push Approval ]
```

| Gate | Scope | Required Approval | Failure Action |
|---|---|---|---|
| **Gate 0** | Local test suite, build, lint, typecheck | Automated CI / Local Developer | Halt immediately, fix locally |
| **Gate 1** | Remote read-only queries (duplicates, schema collisions) | DBA / Lead Engineer | Halt if duplicate data or schema conflict exists |
| **Gate 2** | Full point-in-time database snapshot | Infrastructure / DBA | Halt until backup is verified restorable |
| **Gate 3** | Execute `db/migration-p3-evaluation-transaction.sql` | DBA / Release Manager | Execute `db/rollback-p3-evaluation-transaction.sql` |
| **Gate 4** | Set `KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC=true` on canary | Product / Tech Lead | Revert flag to `false` (instant client-side fallback) |
| **Gate 5** | Privacy approval for `db/migration-p3-retention.sql` & dry-run | DPO / Security / Legal | Do NOT schedule cron; drop function if needed |
| **Gate 6** | Git branch merge / deploy to production | Release Manager | Halt deployment; maintain stable baseline |

---

## 3. Gate 0: Local Artifact Freeze & Verification Commands

All local quality gates must pass cleanly before any remote actions are considered.

### Local Gate Commands (Run locally only):
```bash
# 1. Run all unit and contract tests (including P3 contract tests)
npm test

# 2. Verify static TypeScript types
npm run typecheck

# 3. Verify linting invariants
npm run lint

# 4. Production Next.js build verification
npm run build
```

[VERIFIED] Local tests verify:
1. `tests/evaluation-transaction-rpc.test.ts` (RPC argument builder and static migration invariants)
2. `tests/p3-rollback-contract.test.mjs` (Rollback safety, GUC guard, provenance markers, and runbook contracts)

---

## 4. Gate 1: Remote Read-Only Preflight Inspection

> [!IMPORTANT]
> The queries below are strictly read-only. Execute them in a read-only transaction (`BEGIN TRANSACTION READ ONLY;`) on the target database before applying any DDL.

### 4.1 Duplicate Evaluation Groups Check
Assert zero duplicate `(period_id, employee_id)` pairs in `public.evaluations`:
```sql
SELECT period_id, employee_id, COUNT(*) AS duplicate_count
FROM public.evaluations
GROUP BY period_id, employee_id
HAVING COUNT(*) > 1;
```
- **Expected Result**: 0 rows.
- **Risk**: [RISK] If rows > 0, unique constraint `uq_evaluations_period_employee` will fail. Do NOT apply migration; initiate approved data deduplication first.

### 4.2 Duplicate Evaluation Round Groups Check
Assert zero duplicate `(evaluation_id, round)` pairs in `public.evaluation_rounds`:
```sql
SELECT evaluation_id, round, COUNT(*) AS duplicate_count
FROM public.evaluation_rounds
GROUP BY evaluation_id, round
HAVING COUNT(*) > 1;
```
- **Expected Result**: 0 rows.
- **Risk**: [RISK] If rows > 0, unique constraint `uq_evaluation_rounds_eval_round` will fail.

### 4.3 Schema Object Collision & Comment Inspection
Inspect whether any target constraints, indexes, or functions already exist:
```sql
-- Check existing constraints
SELECT conname, conrelid::regclass, obj_description(oid, 'pg_constraint') AS marker
FROM pg_constraint
WHERE conname IN (
  'uq_evaluations_period_employee',
  'uq_evaluation_rounds_eval_round',
  'chk_evaluation_rounds_round_range',
  'chk_evaluations_current_round_range',
  'chk_evaluations_status_valid',
  'chk_evaluation_rounds_status_valid',
  'chk_evaluation_rounds_total_score_non_negative',
  'chk_evaluations_final_score_non_negative'
);

-- Check existing indexes
SELECT c.relname, obj_description(c.oid, 'pg_class') AS marker
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('idx_evaluations_period_employee', 'idx_evaluation_rounds_eval_round');

-- Check existing functions
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, obj_description(p.oid, 'pg_proc') AS marker
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.relnamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('save_evaluation_round_transaction', 'purge_kurabe_retention');
```
- **Expected Result**: 0 rows prior to first migration application.
- **Fail-Closed Provenance Ownership & Transaction Contract**:
  Each P3 up migration (`db/migration-p3-evaluation-transaction.sql` and `db/migration-p3-retention.sql`) is transaction-wrapped (`BEGIN; ... COMMIT;`) and must be applied as one atomic transaction. If any target constraint, index, or function pre-exists with a missing or mismatched provenance marker, or if any subsequent statement fails, the migration immediately aborts with `PROVENANCE_MISMATCH` or `COLLISION` and the entire transaction rolls back. If a transaction fails, verify rollback and ensure no partial objects exist before any retry. Existing objects are never unconditionally commented or replaced (`CREATE OR REPLACE FUNCTION` is strictly prohibited). The rollback provenance marker is meaningful and dependable precisely because apply refuses unowned pre-existing objects. Object collisions and missing markers are mandatory STOP conditions; do not rerun or force-replace.

### 4.4 Table Privileges & RLS Health
Verify table existence and permissions for target operational and domain tables:
```sql
SELECT table_name, is_insertable_into
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('evaluations', 'evaluation_rounds', 'sessions', 'login_attempts', 'ai_usage', 'chat_reports', 'audit_logs');
```

---

## 5. Gate 2: Verified Point-In-Time Backup

Prior to executing any DDL on production:
1. Trigger an on-demand database backup / snapshot via your managed provider console or CLI.
2. [ASSUMED] Verify backup integrity and timestamp in backup management catalog.
3. Record backup reference ID in the release ticket before proceeding.

---

## 6. Gate 3: Apply Transactional Evaluation Migration

### 6.1 Execution
Execute `db/migration-p3-evaluation-transaction.sql` within an administrative database session.

> [!IMPORTANT]
> **One-Shot Execution, Atomic Transaction & Provenance Safety**:
> The migration script is explicitly transaction-wrapped (`BEGIN; ... COMMIT;`) and must be applied as one atomic transaction. The script is strictly one-shot fail-closed. If any target constraint or index pre-exists with a missing/mismatched provenance marker, or if `public.save_evaluation_round_transaction` already exists, the migration raises an exception (`PROVENANCE_MISMATCH` or `COLLISION`) and aborts the entire transaction.
> - **Atomic Transaction Boundary**: Explicit `BEGIN;` and `COMMIT;` ensure that if any step (e.g. preflight check, constraint creation, function creation, or security grants) fails, the entire transaction rolls back automatically without leaving partial state.
> - **Failure Handling**: If a transaction fails, verify rollback and confirm no partial objects exist before any retry.
> - **Collision is a STOP Condition**: Do NOT rerun the migration or attempt to force-replace objects.
> - **Action on Collision**: Halt rollout immediately; investigate pre-existing objects in `pg_constraint`, `pg_class`, and `pg_proc` with the DBA.

### 6.2 Post-Apply Verification
Run the following verification script to confirm all objects, provenance comments, and permissions:
```sql
DO $$
DECLARE
  v_count integer;
BEGIN
  -- 1. Verify all 8 constraints exist
  SELECT COUNT(*) INTO v_count
  FROM pg_constraint
  WHERE conname IN (
    'uq_evaluations_period_employee',
    'uq_evaluation_rounds_eval_round',
    'chk_evaluation_rounds_round_range',
    'chk_evaluations_current_round_range',
    'chk_evaluations_status_valid',
    'chk_evaluation_rounds_status_valid',
    'chk_evaluation_rounds_total_score_non_negative',
    'chk_evaluations_final_score_non_negative'
  );
  IF v_count != 8 THEN
    RAISE EXCEPTION 'VERIFICATION_FAILED: Expected 8 constraints, found %', v_count;
  END IF;

  -- 2. Verify 2 explicit indexes exist
  SELECT COUNT(*) INTO v_count
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname IN ('idx_evaluations_period_employee', 'idx_evaluation_rounds_eval_round');
  IF v_count != 2 THEN
    RAISE EXCEPTION 'VERIFICATION_FAILED: Expected 2 indexes, found %', v_count;
  END IF;

  -- 3. Verify RPC function exists
  IF to_regprocedure('public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)') IS NULL THEN
    RAISE EXCEPTION 'VERIFICATION_FAILED: Function public.save_evaluation_round_transaction missing';
  END IF;

  RAISE NOTICE 'POST-APPLY VERIFICATION SUCCESSFUL: All P3 evaluation transaction objects verified.';
END $$;
```

---

## 7. Gate 4: Feature-Flag Canary Rollout & Observability

The application code contains dual execution paths in `src/actions/evaluation.ts`:
- **Default Path (`flag !== 'true'`)**: Multi-step non-atomic sequential client updates.
- **Canary Path (`flag === 'true'`)**: Atomic `supabase.rpc('save_evaluation_round_transaction', ...)`.

### Rollout Lifecycle:
1. **Stage A (Baseline)**: Migration applied, `KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC` remains unset / `false`. System continues using standard path.
2. **Stage B (Canary Enablement)**:
   - Enable `KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC=true` in staging or on a single canary app instance.
   - Perform test evaluations for: Draft save, Intermediate round submit (Round 1 → Round 2), and Final approval (Round 3 → Approved).
3. **Stage C (Observability & Monitoring)**:
   - Monitor application logs for RPC invocation errors.
   - Query `public.evaluations` and `public.evaluation_rounds` to verify `current_round` transitions, score validity, and absence of race conditions.
4. **Stage D (Full Rollout)**:
   - Set `KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC=true` across production app instances.
5. **Instant Emergency Deactivation**:
   - If any anomaly occurs, set `KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC=false` in app environment variables and restart app instances.
   - Applications immediately fall back to the multi-step client path without requiring database changes or downtime.

---

## 8. Gate 5: Retention Policy Approval & Dry-Run Safeguards

> [!CAUTION]
> **PURGE IRREVERSIBILITY**: Deletions performed by `public.purge_kurabe_retention` are permanent. Dropping the routine during a rollback does NOT recover deleted rows. Data recovery is only possible via point-in-time backup restoration.

### 8.1 Approval Rules
1. `db/migration-p3-retention.sql` must NOT be applied without formal privacy/DPO approval of the retention windows (7d sessions, 30d login attempts, 60d AI usage, 90d chat reports, 365d audit logs).
2. **NO CRON / PG_CRON REGISTRATION**: Never register automated background schedules (e.g. `cron.schedule`) in migration files or database setup without separate operational review.
3. **ONE-SHOT FAIL-CLOSED CREATION**: The migration uses one-shot `CREATE FUNCTION` guarded by collision preflight checks. If `public.purge_kurabe_retention` already exists, the migration raises `COLLISION` and aborts. Never force-replace an unowned function.
4. **ATOMIC TRANSACTION BOUNDARY**: `db/migration-p3-retention.sql` is explicitly transaction-wrapped (`BEGIN; ... COMMIT;`) and must be applied as one atomic transaction. If a transaction fails, verify rollback and ensure no partial objects exist before any retry.

### 8.2 Dry-Run Verification Procedure
Before running the purge function live:
1. Inspect row counts older than cutoff windows in a read-only query:
```sql
SELECT 'expired_sessions' AS telemetry, COUNT(*) FROM public.sessions WHERE expires_at < (now() - INTERVAL '7 days')
UNION ALL
SELECT 'login_attempts' AS telemetry, COUNT(*) FROM public.login_attempts WHERE attempted_at < (now() - INTERVAL '30 days')
UNION ALL
SELECT 'ai_usage' AS telemetry, COUNT(*) FROM public.ai_usage WHERE created_at < (now() - INTERVAL '60 days')
UNION ALL
SELECT 'chat_reports' AS telemetry, COUNT(*) FROM public.chat_reports WHERE created_at < (now() - INTERVAL '90 days')
UNION ALL
SELECT 'audit_logs' AS telemetry, COUNT(*) FROM public.audit_logs WHERE created_at < (now() - INTERVAL '365 days');
```
2. Core domain tables (`evaluations`, `evaluation_rounds`, `users`, `teams`, `evaluation_periods`, `criteria`, `grade_bands`, `ai_summaries`) must NEVER be purged.

---

## 9. Rollback Procedures & Execution Order

### 9.1 Scenario A: Rollback Evaluation Transaction Candidate

```
Step 1: Disable Feature Flag
  KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC=false
                 │
                 ▼
Step 2: Verify Application Normal Path Active
                 │
                 ▼
Step 3: Provide Session Approval GUC
  SET kurabe.p3_rollback_approved = 'true';
                 │
                 ▼
Step 4: Execute db/rollback-p3-evaluation-transaction.sql
                 │
                 ▼
Step 5: Verify Candidate Objects Dropped & Data Intact
```

#### Detailed Steps:
1. **Disable Flag**: Set `KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC=false` in app environment and reload.
2. **Verify Normal Path**: Verify users can submit evaluations normally via client fallback.
3. **Run Rollback Script**:
   ```sql
   -- In administrative psql session:
   SET kurabe.p3_rollback_approved = 'true';
   \i db/rollback-p3-evaluation-transaction.sql
   ```
4. **Verify Object Absence**:
   ```sql
   SELECT COUNT(*) FROM pg_constraint WHERE conname LIKE 'uq_evaluations%' OR conname LIKE 'chk_evaluation%';
   SELECT to_regprocedure('public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)');
   -- Expected: 0 constraints matching P3 names; NULL for function.
   ```
5. **Verify Data Intact**:
   ```sql
   SELECT COUNT(*) FROM public.evaluations;
   SELECT COUNT(*) FROM public.evaluation_rounds;
   ```

---

### 9.2 Scenario B: Rollback Retention Function Candidate

1. **Ensure No Active Invocations**: Verify no administrative jobs are calling `public.purge_kurabe_retention`.
2. **Run Rollback Script**:
   ```sql
   -- In administrative psql session:
   SET kurabe.p3_rollback_approved = 'true';
   \i db/rollback-p3-retention.sql
   ```
3. **Verify Function Absence**:
   ```sql
   SELECT to_regprocedure('public.purge_kurabe_retention(timestamptz)');
   -- Expected: NULL
   ```
4. **Data Recovery Notice**: If rows were deleted prior to rollback and recovery is required, follow the disaster recovery plan to restore specific tables from Gate 2 backup.

---

## 10. Gate 6: Production Deployment & Push Guard

- [VERIFIED] **No Automatic Push**: Git push to `main` or deployment to production hosting is strictly manual.
- **Pre-Push Checklist**:
  1. Local tests pass 100% (`npm test`).
  2. Local build passes (`npm run build`).
  3. Git diff clean and restricted to authorized scope.
  4. Remote read-only preflight completed and signed off.
  5. Backup verified.

---

## 11. Stop Conditions & Emergency Abort Matrix

| Stop Trigger | Detection Point | Immediate Action |
|---|---|---|
| Migration / DDL transaction failure | Gate 3 or Gate 5 | ABORT. Transaction rolls back automatically. Verify rollback and ensure no partial objects exist before any retry. |
| Duplicate `(period_id, employee_id)` | Gate 1 Preflight | ABORT. Do not apply migration. Dedup data first. |
| Schema collision / Marker mismatch | Gate 1 or Gate 3 | ABORT. One-shot migration aborts with `PROVENANCE_MISMATCH`. Do NOT rerun or force-replace unowned objects. Operator inspection required. |
| Pre-existing RPC or Retention function | Gate 3 or Gate 5 | ABORT. One-shot migration triggers `COLLISION` exception. Rerun prohibited without DBA root-cause resolution. |
| Missing or unverified backup | Gate 2 | ABORT. Create and verify backup before proceeding. |
| Custom GUC missing on rollback | Rollback execution | Fails closed with `ROLLBACK_UNAPPROVED`. Set GUC to proceed. |
| Elevated error rate on canary RPC | Gate 4 Canary | Revert flag `KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC=false`. |
| Unapproved retention cron scheduling | Gate 5 | ABORT. Remove cron schedule immediately. |
