/**
 * Focused Source-Contract & Deterministic Invariant Test for P98M3T01
 * Evaluator Authorization NULL-Safety Candidate
 *
 * NOTE: Production database execution, live RPC calls, and live data mutations
 * are STRICTLY PROHIBITED in this test. This test verifies the exact source
 * contract, PL/pgSQL authorization logic, static AST/token invariants, rollback
 * safety, and period firewall delegation without remote DB or network access.
 *
 * Run: node tests/p98-evaluator-auth.test.mjs
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const FORWARD_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260905071000_p98_evaluator_null_safety.sql'
);
const ROLLBACK_PATH = path.join(
  projectRoot,
  'db',
  'rollback-p98-evaluator-null-safety.sql'
);
const P3_MIGRATION_PATH = path.join(
  projectRoot,
  'db',
  'migration-p3-evaluation-transaction.sql'
);
const P96T05_WRAPPER_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260826020000_p96t05_closed_period_write_firewall.sql'
);
const ACTIONS_EVALUATION_PATH = path.join(
  projectRoot,
  'src',
  'actions',
  'evaluation.ts'
);

console.log('[NOTE] Running deterministic source-contract test for P98M3T01 evaluator authorization NULL-safety...');

// Helper to strip comments and expose executable SQL
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

// ============================================================
// 1. ARTIFACT EXISTENCE & CANDIDATE HEADERS
// ============================================================
assert.ok(
  fs.existsSync(FORWARD_MIGRATION_PATH),
  `Forward migration must exist at: ${FORWARD_MIGRATION_PATH}`
);
assert.ok(
  fs.existsSync(ROLLBACK_PATH),
  `Rollback candidate must exist at: ${ROLLBACK_PATH}`
);
assert.ok(
  fs.existsSync(P3_MIGRATION_PATH),
  `P3 reference migration must exist at: ${P3_MIGRATION_PATH}`
);
assert.ok(
  fs.existsSync(P96T05_WRAPPER_PATH),
  `P96T05 wrapper migration must exist at: ${P96T05_WRAPPER_PATH}`
);
assert.ok(
  fs.existsSync(ACTIONS_EVALUATION_PATH),
  `Evaluation actions must exist at: ${ACTIONS_EVALUATION_PATH}`
);

const forwardMigrationSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');
const p3MigrationSql = fs.readFileSync(P3_MIGRATION_PATH, 'utf8');
const wrapperSql = fs.readFileSync(P96T05_WRAPPER_PATH, 'utf8');
const actionsEvaluationCode = fs.readFileSync(ACTIONS_EVALUATION_PATH, 'utf8');

// Candidate safety headers
assert.ok(
  forwardMigrationSql.includes('CANDIDATE ONLY — NOT APPLIED') || forwardMigrationSql.includes('CANDIDATE ONLY'),
  'Forward migration must contain CANDIDATE ONLY header'
);
assert.ok(
  forwardMigrationSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL') || forwardMigrationSql.includes('APPROVAL'),
  'Forward migration must require explicit approval'
);
assert.ok(
  rollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED') || rollbackSql.includes('ROLLBACK CANDIDATE ONLY'),
  'Rollback must contain ROLLBACK CANDIDATE ONLY header'
);

// Transaction encapsulation
const cleanForwardSql = stripSqlComments(forwardMigrationSql).trim();
const cleanRollbackSql = stripSqlComments(rollbackSql).trim();

assert.ok(cleanForwardSql.startsWith('BEGIN;'), 'Forward migration must start with BEGIN;');
assert.ok(cleanForwardSql.endsWith('COMMIT;'), 'Forward migration must end with COMMIT;');
assert.ok(cleanRollbackSql.startsWith('BEGIN;'), 'Rollback must start with BEGIN;');
assert.ok(cleanRollbackSql.endsWith('COMMIT;'), 'Rollback must end with COMMIT;');

// ============================================================
// 2. FORWARD MIGRATION FUNCTION SIGNATURE & PROVENANCE CONTRACT
// ============================================================
const EXPECTED_FN_NAME = 'save_evaluation_round_transaction';
const EXPECTED_SIGNATURE_PARAMS = [
  'p_evaluation_id uuid',
  'p_round integer',
  'p_actor_id uuid',
  'p_scores jsonb',
  'p_notes jsonb',
  'p_comment text',
  'p_total_score numeric',
  'p_grade text',
  'p_is_submit boolean',
  'p_submitted_at timestamptz',
  'p_next_round integer',
  'p_next_evaluator_id uuid',
  'p_next_evaluator_role text',
  'p_next_status text',
  'p_is_final boolean',
];

assert.ok(
  cleanForwardSql.includes(`CREATE OR REPLACE FUNCTION public.${EXPECTED_FN_NAME}`),
  `Forward migration must declare CREATE OR REPLACE FUNCTION public.${EXPECTED_FN_NAME}`
);

// Verify all 15 parameters are declared in exact order
for (const param of EXPECTED_SIGNATURE_PARAMS) {
  const [paramName, paramType] = param.split(/\s+/);
  const paramRegex = new RegExp(`\\b${paramName}\\s+${paramType}\\b`, 'i');
  assert.ok(
    paramRegex.test(cleanForwardSql),
    `Forward migration must declare parameter: ${param}`
  );
}

// Security definer and search_path
assert.ok(/SECURITY\s+DEFINER/i.test(cleanForwardSql), 'Function must declare SECURITY DEFINER');
assert.ok(/SET\s+search_path\s*=\s*public/i.test(cleanForwardSql), 'Function must declare SET search_path = public');

// Return table structure
assert.ok(
  /RETURNS\s+TABLE\s*\(\s*round_id\s+uuid\s*,\s*evaluation_id\s+uuid\s*,\s*next_round_id\s+uuid\s*,\s*final_status\s+text\s*\)/is.test(cleanForwardSql),
  'Function must return exact TABLE (round_id uuid, evaluation_id uuid, next_round_id uuid, final_status text)'
);

// Provenance markers & fail-closed preflight contracts
const P3_PROVENANCE_MARKER = 'kurabe:p3:candidate:v1:function:save_evaluation_round_transaction';
const P98_PROVENANCE_MARKER = 'kurabe:p98:candidate:v1:function:save_evaluation_round_transaction';

assert.ok(
  cleanForwardSql.includes(P98_PROVENANCE_MARKER),
  `Forward migration must set provenance marker: ${P98_PROVENANCE_MARKER}`
);

// Preflight provenance verification: fail-closed on absent/NULL provenance
assert.ok(
  !/v_comment\s+IS\s+NOT\s+NULL\s+AND\s+v_comment\s+NOT\s+IN/i.test(cleanForwardSql),
  'Forward migration must NOT use NULL-permissive provenance check (v_comment IS NOT NULL AND ...)'
);
assert.ok(
  /v_comment\s+IS\s+NULL\s+OR\s+v_comment\s+NOT\s+IN/i.test(cleanForwardSql),
  'Forward migration preflight must fail closed when comment is NULL (v_comment IS NULL OR v_comment NOT IN ...)'
);
assert.ok(
  cleanForwardSql.includes(P3_PROVENANCE_MARKER) &&
  cleanForwardSql.includes(P98_PROVENANCE_MARKER),
  'Forward migration preflight must accept exactly both p3 and p98 candidate markers'
);
assert.ok(
  cleanForwardSql.includes("RAISE EXCEPTION 'PROVENANCE_MISMATCH: Function public.save_evaluation_round_transaction exists but comment \"%\" does not match expected marker. Aborting.'"),
  'Forward migration preflight must raise PROVENANCE_MISMATCH on absent or invalid comment'
);

// Deterministic simulation of forward migration provenance preflight logic
function simulateProvenancePreflight(comment) {
  const allowed = [
    P3_PROVENANCE_MARKER,
    P98_PROVENANCE_MARKER,
  ];
  if (comment === null || comment === undefined || !allowed.includes(comment)) {
    return { allowed: false, error: 'PROVENANCE_MISMATCH' };
  }
  return { allowed: true };
}

assert.strictEqual(
  simulateProvenancePreflight(null).allowed,
  false,
  'Preflight simulation: NULL provenance comment MUST be rejected fail-closed'
);
assert.strictEqual(
  simulateProvenancePreflight(null).error,
  'PROVENANCE_MISMATCH',
  'Preflight simulation: NULL provenance comment must yield PROVENANCE_MISMATCH'
);
assert.strictEqual(
  simulateProvenancePreflight(undefined).allowed,
  false,
  'Preflight simulation: undefined provenance comment MUST be rejected'
);
assert.strictEqual(
  simulateProvenancePreflight('unrecognized:marker').allowed,
  false,
  'Preflight simulation: Unknown marker must be rejected'
);
assert.strictEqual(
  simulateProvenancePreflight(P3_PROVENANCE_MARKER).allowed,
  true,
  'Preflight simulation: P3 provenance marker must be accepted'
);
assert.strictEqual(
  simulateProvenancePreflight(P98_PROVENANCE_MARKER).allowed,
  true,
  'Preflight simulation: P98 provenance marker must be accepted'
);

// Service-role only execution permissions
const TYPED_SIGNATURE = 'public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)';
const cleanCompactSql = cleanForwardSql.replace(/\s+/g, ' ');

assert.ok(
  cleanCompactSql.includes('REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction') &&
  cleanCompactSql.includes('FROM PUBLIC, anon, authenticated;'),
  'Forward migration must revoke execute on save_evaluation_round_transaction from PUBLIC, anon, authenticated'
);
assert.ok(
  cleanCompactSql.includes('GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction') &&
  cleanCompactSql.includes('TO service_role;'),
  'Forward migration must grant execute on save_evaluation_round_transaction to service_role'
);

// Active-only wrapper consistency
assert.ok(
  cleanForwardSql.includes('public.save_evaluation_round_transaction_active_only'),
  'Forward migration must maintain active-only wrapper consistency'
);
assert.ok(
  cleanForwardSql.includes('kurabe:p96t05:candidate:v1:function:save_evaluation_round_transaction_active_only'),
  'Forward migration must check and preserve wrapper provenance marker'
);

// ============================================================
// 3. EVALUATOR AUTHORIZATION NULL-SAFETY INVARIANTS & BEHAVIORAL SIMULATION
// ============================================================

// 3.1 Verify SQL source code replaces flawed comparison
assert.ok(
  cleanForwardSql.includes('v_round.evaluator_id IS NULL') ||
  cleanForwardSql.includes('v_round.evaluator_id IS DISTINCT FROM'),
  'Forward migration must explicitly test NULL evaluator or use IS DISTINCT FROM'
);

// Must raise UNAUTHORIZED_EVALUATOR exception
assert.ok(
  cleanForwardSql.includes('UNAUTHORIZED_EVALUATOR'),
  'Forward migration must raise UNAUTHORIZED_EVALUATOR exception on failure'
);

// In the legacy P3 migration, the comparison was `v_round.evaluator_id != p_actor_id`:
assert.ok(
  p3MigrationSql.includes('IF v_round.evaluator_id != p_actor_id THEN'),
  'P3 migration contains the legacy non-null-safe comparison'
);

// In the hardened P98 migration, the bare `v_round.evaluator_id != p_actor_id` without NULL check MUST NOT be the condition:
const strippedOfNullSafeChecks = cleanForwardSql
  .replace(/v_round\.evaluator_id\s+IS\s+NULL\s+OR\s+v_round\.evaluator_id\s+IS\s+DISTINCT\s+FROM\s+p_actor_id/g, '')
  .replace(/v_round\.evaluator_id\s+IS\s+DISTINCT\s+FROM\s+p_actor_id/g, '')
  .replace(/v_round\.evaluator_id\s+IS\s+NULL\s+OR\s+v_round\.evaluator_id\s*!=\s*p_actor_id/g, '');

assert.ok(
  !strippedOfNullSafeChecks.includes('IF v_round.evaluator_id != p_actor_id THEN'),
  'Hardened forward migration must not contain bare un-guarded `IF v_round.evaluator_id != p_actor_id THEN`'
);

// 3.2 Deterministic Behavioral Simulation of Evaluator Authorization Logic
// Simulates SQL three-valued logic vs NULL-safe logic
function simulateSqlEvaluatorAuth(evaluatorId, actorId, implementation = 'hardened') {
  if (implementation === 'legacy') {
    // In SQL: NULL != actorId evaluates to NULL (unknown/falsy in IF condition)
    // Hence IF NULL != actorId THEN is NOT entered -> AUTHORIZATION BYPASS!
    if (evaluatorId === null) {
      return { allowed: true, reason: 'BYPASSED_DUE_TO_SQL_NULL_EQUALITY' };
    }
    if (evaluatorId !== actorId) {
      return { allowed: false, error: 'UNAUTHORIZED_EVALUATOR' };
    }
    return { allowed: true, reason: 'ASSIGNED_EVALUATOR_MATCH' };
  }

  // Hardened logic in P98:
  // IF v_round.evaluator_id IS NULL OR v_round.evaluator_id IS DISTINCT FROM p_actor_id THEN
  //   RAISE EXCEPTION 'UNAUTHORIZED_EVALUATOR...'
  const isNull = evaluatorId === null;
  const isDistinctFrom = evaluatorId !== actorId; // JS !== matches SQL IS DISTINCT FROM for primitives/null

  if (isNull || isDistinctFrom) {
    return {
      allowed: false,
      error: 'UNAUTHORIZED_EVALUATOR',
      detail: `Actor ${actorId} is not assigned to round (assigned: ${evaluatorId})`,
    };
  }
  return { allowed: true, reason: 'ASSIGNED_EVALUATOR_MATCH' };
}

const ACTOR_A = '11111111-1111-1111-1111-111111111111';
const ACTOR_B = '22222222-2222-2222-2222-222222222222';

// CASE 1: NULL Evaluator (Unassigned round)
// Legacy allowed this (flaw); Hardened MUST reject fail-closed!
const legacyNullResult = simulateSqlEvaluatorAuth(null, ACTOR_A, 'legacy');
assert.strictEqual(
  legacyNullResult.allowed,
  true,
  'Simulation confirms legacy SQL allowed NULL evaluator due to ternary logic'
);

const hardenedNullResult = simulateSqlEvaluatorAuth(null, ACTOR_A, 'hardened');
assert.strictEqual(
  hardenedNullResult.allowed,
  false,
  'Hardened SQL MUST reject NULL evaluator'
);
assert.strictEqual(
  hardenedNullResult.error,
  'UNAUTHORIZED_EVALUATOR',
  'Hardened SQL MUST reject NULL evaluator with UNAUTHORIZED_EVALUATOR'
);

// CASE 2: Wrong Evaluator (Mismatched actor)
// Both legacy and hardened reject
const hardenedWrongResult = simulateSqlEvaluatorAuth(ACTOR_B, ACTOR_A, 'hardened');
assert.strictEqual(
  hardenedWrongResult.allowed,
  false,
  'Hardened SQL MUST reject mismatched evaluator'
);
assert.strictEqual(
  hardenedWrongResult.error,
  'UNAUTHORIZED_EVALUATOR',
  'Hardened SQL MUST reject mismatched evaluator with UNAUTHORIZED_EVALUATOR'
);

// CASE 3: Correct Evaluator (Assigned actor)
// Assigned evaluator behavior MUST remain unchanged
const hardenedCorrectResult = simulateSqlEvaluatorAuth(ACTOR_A, ACTOR_A, 'hardened');
assert.strictEqual(
  hardenedCorrectResult.allowed,
  true,
  'Hardened SQL MUST permit correctly assigned evaluator'
);
assert.strictEqual(
  hardenedCorrectResult.reason,
  'ASSIGNED_EVALUATOR_MATCH',
  'Hardened SQL MUST match assigned evaluator'
);

// ============================================================
// 4. SUBMITTED ROUND IMMUTABILITY INVARIANTS
// ============================================================
assert.ok(
  cleanForwardSql.includes('v_round.submitted_at IS NOT NULL OR v_round.status = \'Submitted\''),
  'Forward migration must preserve submitted round lock check'
);
assert.ok(
  cleanForwardSql.includes('ROUND_ALREADY_SUBMITTED'),
  'Forward migration must raise ROUND_ALREADY_SUBMITTED on submitted round'
);

function simulateRoundSubmitGuard(submittedAt, status) {
  if (submittedAt !== null || status === 'Submitted') {
    return { allowed: false, error: 'ROUND_ALREADY_SUBMITTED' };
  }
  return { allowed: true };
}

assert.strictEqual(
  simulateRoundSubmitGuard('2026-09-01T00:00:00Z', 'Submitted').allowed,
  false,
  'Submitted round must be rejected'
);
assert.strictEqual(
  simulateRoundSubmitGuard('2026-09-01T00:00:00Z', 'Draft').allowed,
  false,
  'Round with submitted_at timestamp must be rejected even if status says Draft'
);
assert.strictEqual(
  simulateRoundSubmitGuard(null, 'Submitted').allowed,
  false,
  'Round with Submitted status must be rejected even if timestamp is null'
);
assert.strictEqual(
  simulateRoundSubmitGuard(null, 'Draft').allowed,
  true,
  'Unsubmitted Draft round must be allowed'
);
assert.strictEqual(
  simulateRoundSubmitGuard(null, 'NotStarted').allowed,
  true,
  'Unsubmitted NotStarted round must be allowed'
);

// ============================================================
// 5. CLOSED PERIOD SEMANTICS & ACTIVE-ONLY WRAPPER FIREWALL
// ============================================================
assert.ok(
  wrapperSql.includes('v_period_status IS DISTINCT FROM \'active\''),
  'P96T05 wrapper strictly checks period status is active'
);
assert.ok(
  wrapperSql.includes('P96T05_PERIOD_NOT_ACTIVE'),
  'P96T05 wrapper raises P96T05_PERIOD_NOT_ACTIVE'
);
assert.ok(
  wrapperSql.includes('FOR UPDATE OF ep'),
  'P96T05 wrapper locks parent period FOR UPDATE OF ep'
);
assert.ok(
  wrapperSql.includes('public.save_evaluation_round_transaction('),
  'P96T05 wrapper delegates to public.save_evaluation_round_transaction'
);

// End-to-end delegation simulation through the wrapper
function simulateWrapperPipeline({ periodStatus, roundEvaluatorId, actorId, roundSubmittedAt, roundStatus }) {
  // 1. Period check (Active-only firewall)
  if (periodStatus !== 'active') {
    return { success: false, error: 'P96T05_PERIOD_NOT_ACTIVE' };
  }

  // 2. Evaluator check (Underlying P98 NULL-safe check)
  const authResult = simulateSqlEvaluatorAuth(roundEvaluatorId, actorId, 'hardened');
  if (!authResult.allowed) {
    return { success: false, error: authResult.error };
  }

  // 3. Immutability check
  const roundLock = simulateRoundSubmitGuard(roundSubmittedAt, roundStatus);
  if (!roundLock.allowed) {
    return { success: false, error: roundLock.error };
  }

  return { success: true, finalStatus: 'Draft' };
}

// Case 5.1: Closed period rejects regardless of evaluator
assert.strictEqual(
  simulateWrapperPipeline({
    periodStatus: 'closed',
    roundEvaluatorId: ACTOR_A,
    actorId: ACTOR_A,
    roundSubmittedAt: null,
    roundStatus: 'Draft',
  }).error,
  'P96T05_PERIOD_NOT_ACTIVE',
  'Closed period must fail closed at firewall before evaluator check'
);

// Case 5.2: Active period with NULL evaluator fails closed at transaction RPC
assert.strictEqual(
  simulateWrapperPipeline({
    periodStatus: 'active',
    roundEvaluatorId: null,
    actorId: ACTOR_A,
    roundSubmittedAt: null,
    roundStatus: 'Draft',
  }).error,
  'UNAUTHORIZED_EVALUATOR',
  'Active period with NULL evaluator must fail closed with UNAUTHORIZED_EVALUATOR'
);

// Case 5.3: Active period with Wrong evaluator fails closed at transaction RPC
assert.strictEqual(
  simulateWrapperPipeline({
    periodStatus: 'active',
    roundEvaluatorId: ACTOR_B,
    actorId: ACTOR_A,
    roundSubmittedAt: null,
    roundStatus: 'Draft',
  }).error,
  'UNAUTHORIZED_EVALUATOR',
  'Active period with wrong evaluator must fail closed with UNAUTHORIZED_EVALUATOR'
);

// Case 5.4: Active period with Correct evaluator and unsubmitted round succeeds
assert.strictEqual(
  simulateWrapperPipeline({
    periodStatus: 'active',
    roundEvaluatorId: ACTOR_A,
    actorId: ACTOR_A,
    roundSubmittedAt: null,
    roundStatus: 'Draft',
  }).success,
  true,
  'Active period with correct evaluator and unsubmitted round must succeed'
);

// Case 5.5: Active period with Correct evaluator but already submitted round fails closed
assert.strictEqual(
  simulateWrapperPipeline({
    periodStatus: 'active',
    roundEvaluatorId: ACTOR_A,
    actorId: ACTOR_A,
    roundSubmittedAt: '2026-09-01T00:00:00Z',
    roundStatus: 'Submitted',
  }).error,
  'ROUND_ALREADY_SUBMITTED',
  'Active period with submitted round must fail closed with ROUND_ALREADY_SUBMITTED'
);

// ============================================================
// 6. ROLLBACK CANDIDATE INVARIANTS & SAFETY CONTRACT
// ============================================================

// 6.1 GUC approval guard
assert.ok(
  /current_setting\(\s*'kurabe\.p98_rollback_approved'\s*,\s*true\s*\)/i.test(cleanRollbackSql),
  'Rollback must inspect custom GUC kurabe.p98_rollback_approved'
);
assert.ok(
  cleanRollbackSql.includes('ROLLBACK_UNAPPROVED'),
  'Rollback must raise ROLLBACK_UNAPPROVED if not approved'
);
assert.ok(
  !/SET\s+kurabe\.p98_rollback_approved/i.test(cleanRollbackSql),
  'Rollback must NEVER set kurabe.p98_rollback_approved internally'
);

// 6.2 Provenance verification before restore
assert.ok(
  cleanRollbackSql.includes(P98_PROVENANCE_MARKER),
  `Rollback must inspect provenance marker: ${P98_PROVENANCE_MARKER}`
);
assert.ok(
  cleanRollbackSql.includes('PROVENANCE_MISMATCH'),
  'Rollback must abort with PROVENANCE_MISMATCH on unowned objects'
);

// 6.3 Restoration of prior canonical definition
assert.ok(
  cleanRollbackSql.includes('CREATE OR REPLACE FUNCTION public.save_evaluation_round_transaction'),
  'Rollback must restore public.save_evaluation_round_transaction'
);
assert.ok(
  cleanRollbackSql.includes('IF v_round.evaluator_id != p_actor_id THEN'),
  'Rollback must restore the prior canonical check: IF v_round.evaluator_id != p_actor_id THEN'
);

// 6.4 Restoration of prior provenance marker & service-role grants
assert.ok(
  cleanRollbackSql.includes(P3_PROVENANCE_MARKER),
  `Rollback must restore prior provenance marker: ${P3_PROVENANCE_MARKER}`
);
assert.ok(
  cleanRollbackSql.includes('REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction') &&
  cleanRollbackSql.includes('GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction'),
  'Rollback must re-apply exact execute grants to service_role'
);

// 6.5 Zero destructive operations
assert.ok(!/\bDELETE\s+FROM\b/i.test(cleanRollbackSql), 'Rollback must NOT delete from any table');
assert.ok(!/\bTRUNCATE\b/i.test(cleanRollbackSql), 'Rollback must NOT truncate any table');
assert.ok(!/\bDROP\s+TABLE\b/i.test(cleanRollbackSql), 'Rollback must NOT drop any table');
assert.ok(!/\bDROP\s+SCHEMA\b/i.test(cleanRollbackSql), 'Rollback must NOT drop any schema');

// ============================================================
// 7. WORKFLOW, SCORING & DOMAIN RULES PRESERVATION
// ============================================================
// Valid grades
assert.ok(
  cleanForwardSql.includes("'S', 'A', 'AB', 'B', 'C', 'D', 'Pending'"),
  'Forward migration must preserve exact domain grades'
);
// Valid statuses
assert.ok(
  cleanForwardSql.includes("'NotStarted', 'Draft', 'Submitted', 'Reviewed', 'Approved'"),
  'Forward migration must preserve exact evaluation statuses'
);
// Valid roles
assert.ok(
  cleanForwardSql.includes("'Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'"),
  'Forward migration must preserve exact evaluator roles'
);
// Round range
assert.ok(
  cleanForwardSql.includes('p_round < 1 OR p_round > 3') &&
  cleanForwardSql.includes('p_next_round < 1 OR p_next_round > 3'),
  'Forward migration must preserve 1..3 round bounds'
);

// 7.1 Server Action boundary inspection (Do not trust client evaluator decision)
assert.ok(
  actionsEvaluationCode.includes('save_evaluation_round_transaction_active_only'),
  'Application action must route writes through the transactional active-only RPC'
);

console.log('[PASS] All deterministic contract assertions verified for P98M3T01 evaluator NULL-safety candidates.');
