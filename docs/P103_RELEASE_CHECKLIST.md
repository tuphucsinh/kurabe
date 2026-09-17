# P103 Release Package & Deployment Checklist

> **Authority Notice**: This document is application release documentation and an operational checklist; it is **NOT** a control authority. Tracked execution truth and workflow status reside exclusively in `tasks.md`, `HANDOFF.md`, `.state/agent-state.json`, and canonical Git history per `AGENTS.md` (`mika-v3`).
> **Task Scope**: Task `P103M4T03` packages the verified candidate application and migrations 001 and 002 as an inseparable release set with disposable rollback rehearsal. **No deployment, push, production write, or production service restart is performed by this task.**

---

## 1. Release Package Identity & Provenance

The P103 release comprises the already verified application code paired with PostgreSQL migrations `001` and `002`. This is an **inseparable release set**; neither the application nor the database migrations may be deployed in isolation.

### 1.1 Source & Base Provenance
- **Task ID**: `P103M4T03`
- **Tier**: `CONTROLLED`
- **BASE_SHA**: `e9e753bbd6369e168dbc02362941fa3a381ecf5c`
- **Canonical Repository**: `/home/pi5/projects/kurabe`
- **Candidate Scope**: `package.json,next.config.ts,src/**` at the exact `candidateSha` recorded by the release-set manifest; M4T03 does not modify application paths.
- **Application tree SHA-256**: derived from `git ls-tree -r candidateSha -- package.json next.config.ts src` by `buildP103ReleaseSet()`; this binds the matched application tree without copying application source into the package.
- **`package.json` SHA-256**: `413fffbc6c319356b93cb0e4aec2ba86f5a14473b6077daaeec1b5fd27103cc6`
- **`next.config.ts` SHA-256**: `ee8d1c46a883cce7b2c5a433c9bdb85d28b224a775c442adf2b3c71e44769aa3`

### 1.2 Database Migrations in Release Set
1. **Migration 001**: `supabase/migrations/20260914000100_evaluation_current_authorization.sql`
   - **SHA-256**: `7a503f3d61e50941e3ebba6b3be8e771a35690117c6c1e43b0961a9da6359935`
   - **Objective**: Transactional current authorization guard (closes H5). Enforces that stored assignee must have current active actor, valid role, team, and appointment at transaction commit.
   - **Target Functions**:
     - `public.return_evaluation_round_transaction(uuid, integer, uuid, text)`
       - Provenance Comment: `'kurabe:p103m1t03:candidate:v1:function:return_evaluation_round_transaction'`
     - `public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)` (17 arguments)
       - Provenance Comment: `'kurabe:p103m1t03:candidate:v1:function:save_evaluation_round_transaction_active_only'`
   - **ACL & Grants**:
     - `REVOKE ALL ON FUNCTION public.return_evaluation_round_transaction(...) FROM PUBLIC, anon, authenticated;`
     - `REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only(...) FROM PUBLIC, anon, authenticated;`
     - `GRANT EXECUTE ON FUNCTION public.return_evaluation_round_transaction(...) TO service_role;`
     - `GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(...) TO service_role;`
     - Revocation of legacy 15-argument `save_evaluation_round_transaction` overloads.

2. **Migration 002**: `supabase/migrations/20260914000200_evaluation_workflow_multiteam.sql`
   - **SHA-256**: `d43159a7a76074528ede053a728f6c25cec1cc25a64a1c70470d785c2a667834`
   - **Objective**: Multi-team Leader workflow resolution and transition contract (closes H1/H2). Synchronizes next-step evaluator resolution across SubLeader, Leader, and Manager, ensuring appointed Leaders evaluate cross-team members while preserving H5 current authorization.
   - **Target Functions**:
     - `public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid)` (17 arguments)
       - Provenance Comment: `'kurabe:p103m2t01:candidate:v1:function:save_evaluation_round_transaction_active_only'`
   - **ACL & Grants**:
     - `REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only(...) FROM PUBLIC, anon, authenticated;`
     - `GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only(...) TO service_role;`

---

## 2. Release Gate & Authorization Status

| Gate | Status | Detail / Condition |
|---|---|---|
| **IMPLEMENTATION_READY** | **READY** | Matched package, preflight suite, compatibility rehearsal, and checklist verified locally. |
| **PRODUCTION_APPROVED** | **PENDING / BLOCKED** | Requires explicit, separate owner authorization. No deploy is executed by P103 tasks. |
| **REMOTE_CI** | **UNKNOWN / PENDING** | Remote CI workflow not executed in local worktree; remains UNKNOWN until approved publication envelope. |
| **PRODUCTION_CATALOG** | **UNKNOWN / BLOCKED** | Live production database was not contacted. Drift gate remains UNKNOWN and blocks release until live readback. |

---

## 3. Application × Database Compatibility Matrix

The following table details the factual compatibility analysis across application versions and database states:

| Application Version | Database State | Release Eligible? | Safe Fallback? | Risk & Incompatibility Analysis |
|---|---|---|---|---|
| **Old App** (pre-P103) | **Baseline DB** (pre-001) | ❌ **NO** | ❌ **NO** | Vulnerable to H1 (workflow desync), H2 (multi-team Leader failure), H3 (evaluations list/summary scope desync), H4 (target employee leak), H5 (revoked actor write bypass), H6 (draft status conflation), and H7 (historical values dynamically overwritten by live config). |
| **Old App** (pre-P103) | **DB after 001** | ❌ **NO** | ❌ **NO** | **Old app must NOT be treated as a safe fallback.** While migration 001 enforces current authorization in SQL, the old app still leaks target employee data on `/history/[employeeId]` (H4), client query cache retains stale data for revoked users (M3T03), and compare views recalculate historical grades dynamically (H7). |
| **Old App** (pre-P103) | **DB after 002** | ❌ **NO** | ❌ **NO** | Old app client workflow diverges from the migration 002 multi-team SQL resolver. Additionally carries all H4, M3T03, and H7 client vulnerabilities. |
| **New App** (P103 candidate) | **Baseline DB** (pre-001) | ❌ **NO** | ❌ **NO** | New app expects 17-argument save RPC with transactional current authorization and multi-team resolver. Baseline DB allows unauthorized writes on revoked users and cannot resolve appointed Leader steps. |
| **New App** (P103 candidate) | **DB after 001** | ❌ **NO** | ❌ **NO** | Intermediate state only. DB lacks migration 002 multi-team resolution; appointed Leader transitions diverge between app client logic and DB save transaction. |
| **New App** (P103 candidate) | **DB after 002** | ✅ **YES** | N/A | **Matched Release Set.** Full H1–H7 client/server parity, transactional current authorization (H5), and multi-team workflow alignment (H1/H2). Only release-eligible combination. |

---

## 4. Rollback Limitations & Critical Invariants

1. **Security Downgrade is NEVER a Safe Rollback**:
   - Reverting database migrations `001` and `002` restores the H5 vulnerability where revoked evaluators can commit evaluations, and re-introduces H1/H2 workflow failures.
   - Downward SQL migration files are intentionally omitted for 001 and 002. Reverting functions to baseline definitions strips security controls.

2. **No Wholesale DB Restore After User Writes**:
   - Once the release is deployed to production and users have submitted evaluations, drafts, or scores, restoring an earlier database backup or snapshot is **strictly forbidden**.
   - Wholesale restore causes catastrophic data loss, destroying intervening legitimate employee evaluations and audit history.

3. **Disposable Interrupted-Apply Simulation vs Production Reality**:
   - Local rehearsal uses disposable function capture and restore to prove that interrupted applies can return to pre-migration function definitions without corrupting existing evaluations data.
   - In production, if an issue arises post-migration, containment must be achieved via **Write-Pause** and **Forward-Fix**, not by wiping or rolling back the database.

---

## 5. Containment & Forward-Fix Strategy

If an unexpected anomaly is detected during or after production rollout, the following containment procedures must be used:

### 5.1 Immediate Write-Pause Fallback
To halt mutations without taking down the read interface or dropping security protections:
1. **Engage Write-Pause via Active Period Control**:
   ```sql
   -- Pauses evaluation submission by marking the active evaluation period closed
   UPDATE public.evaluation_periods
   SET status = 'closed'
   WHERE status = 'active';
   ```
2. **Result**:
   - All write RPCs (`save_evaluation_round_transaction_active_only`, `return_evaluation_round_transaction`) immediately fail closed with active-period firewall exceptions.
   - All read routes (`/dashboard`, `/evaluations`, `/reports`, `/history`) remain fully accessible for inspection, audit, and reporting.
   - Zero database records are destroyed or overwritten.

### 5.2 Forward-Fix Protocol
1. Revert or patch only the offending component via an approved task candidate in a fresh, isolated worktree.
2. Verify the forward fix against the exact production schema and run full confirmation matrix suites.
3. Deploy the verified forward candidate through the canonical pipeline.
4. Re-open the evaluation period:
   ```sql
   UPDATE public.evaluation_periods
   SET status = 'active'
   WHERE id = '<period-id>' AND status = 'closed';
   ```

---

## 6. Production No-Write / Read-Only Smoke Query Template

Execute the following transactional, strictly read-only script against production after applying migrations to verify installation integrity without mutating application state:

```sql
-- ============================================================
-- P103 PRODUCTION READ-ONLY SMOKE VERIFICATION TEMPLATE
-- MUST BE EXECUTED INSIDE A READ-ONLY TRANSACTION
-- ============================================================

BEGIN TRANSACTION READ ONLY;

-- 1. Verify connection context and target database
SELECT
  current_database() AS db_name,
  current_user AS session_user,
  inet_server_addr() AS server_ip,
  version() AS pg_version;

-- 2. Verify target functions exist with 17-arg and 4-arg signatures
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS is_security_definer,
  p.provolatile AS volatility
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('save_evaluation_round_transaction_active_only', 'return_evaluation_round_transaction')
ORDER BY p.proname;

-- 3. Verify exact provenance comments on target functions
SELECT
  p.proname AS function_name,
  obj_description(p.oid, 'pg_proc') AS provenance_comment
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('save_evaluation_round_transaction_active_only', 'return_evaluation_round_transaction')
ORDER BY p.proname;

-- Expected Provenance Values:
-- save_evaluation_round_transaction_active_only:
--   'kurabe:p103m2t01:candidate:v1:function:save_evaluation_round_transaction_active_only'
-- return_evaluation_round_transaction:
--   'kurabe:p103m1t03:candidate:v1:function:return_evaluation_round_transaction'

-- 4. Verify explicit function permissions (service_role ONLY; retains PUBLIC grantee=0 via LEFT JOIN)
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
  a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f'::"char", p.proowner))) a
LEFT JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public'
  AND p.proname IN ('save_evaluation_round_transaction_active_only', 'return_evaluation_round_transaction')
ORDER BY p.proname, arguments, grantee;

-- 4b. Verify effective exact-overload EXECUTE privileges (anon=false, authenticated=false, service_role=true)
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('save_evaluation_round_transaction_active_only', 'return_evaluation_round_transaction')
ORDER BY p.proname, arguments;

-- 5. Read-only sanity read of evaluation periods and evaluations
SELECT id, year, name, status, created_at, closed_at
FROM public.evaluation_periods
WHERE status = 'active'
LIMIT 5;

SELECT id, period_id, employee_id, status, current_round
FROM public.evaluations
LIMIT 5;

-- 6. Confirm zero rows mutated
COMMIT;
```

---

## 7. Operational Pre-Flight & Execution Steps

### Pre-Deployment (Staging / Verification)
- [ ] Verify candidate tree SHA and commit hash match `P103M4T03` verified candidate.
- [ ] Run `node scripts/verify-release.mjs --suite release-manifest-integrity`.
- [ ] Run `node scripts/verify-release.mjs --suite p103-release-preflight` in disposable test harness.
- [ ] Check production catalog drift: perform live catalog readback and verify zero unexpected schema drift before proceeding.
- [ ] Obtain explicit written Owner Approval for production deployment envelope.

### Deployment Phase
- [ ] **Step 1**: Apply migration `001` (`20260914000100_evaluation_current_authorization.sql`) to production database.
- [ ] **Step 2**: Apply migration `002` (`20260914000200_evaluation_workflow_multiteam.sql`) to production database.
- [ ] **Step 3**: Deploy matched application package (`New App P103`).

### Post-Deployment Verification
- [ ] Run Production Read-Only Smoke Query Template (Section 6) inside `BEGIN TRANSACTION READ ONLY;`.
- [ ] Verify provenance comments match exact P103 hashes.
- [ ] Verify explicit function permissions retain `PUBLIC` (`grantee=0`) via `LEFT JOIN` and confirm zero public/anon/authenticated grants.
- [ ] Verify effective exact-overload `EXECUTE` privileges: `anon=false`, `authenticated=false`, `service_role=true` for both target functions.
- [ ] Confirm disposable rehearsal cleanup truth: verified container absence with no swallowed removal errors.
- [ ] Perform non-mutating UI smoke test (Dashboard, Evaluation list, History page).
- [ ] Confirm no 5xx errors or unexpected RLS rejections in operational logs.
- [ ] Keep write-pause fallback command accessible in event of anomaly.
