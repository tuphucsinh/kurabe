#!/usr/bin/env node
/**
 * Integration Test for Kurabe CONTROLLED Task P103M1T03
 * H5 transactional current authorization after revoke.
 *
 * Rules:
 * - Behavioral DB checks must use a fresh disposable local stack only; no production writes.
 * - Integration suite must be wrapper-compatible and truthful: use existing
 *   tests/support/confirmation-runtime.mjs and existing bootstrap/auth/action helpers when compatible.
 * - It may return BLOCKED_CAPABILITY when real runtime is unavailable, but must never call
 *   source-contract or migration-only execution authenticated/QUALIFIED.
 * - It covers save, initialize, submit, return, immutable before/after hashes, and bounded race cases
 *   when runtime is available.
 * - Keep evidence tier labels truthful; no fake authenticated evidence.
 *
 * Run: node tests/integration/h5-revoke.mjs
 * Or:  node scripts/verify-release.mjs --suite h5-revoke --tier authenticated --evidence "$EVIDENCE/h5-revoke.json"
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRuntimeEnvironment } from '../support/confirmation-runtime.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const FORWARD_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase/migrations/20260914000100_evaluation_current_authorization.sql'
);
const ACTION_PATH = path.join(projectRoot, 'src/actions/evaluation.ts');
const WORKFLOW_PATH = path.join(projectRoot, 'src/data/workflow.ts');

export const REQUIRED_CASES = [
  'h5:fixture-notstarted-to-draft-to-submitted',
  'h5:positive-appointed-leader-save',
  'h5:revoke-appointment-save-denial',
  'h5:revoke-appointment-submit-denial',
  'h5:revoke-appointment-return-denial',
  'h5:atomic-graph-unchanged-on-deny',
  'h5:historical-submitted-data-unchanged',
  'h5:manager-authenticated-revoke-readback',
  'h5:current-authorized-leader-positive-control',
];

export function verifySourceContracts() {
  const cases = [];

  assert.ok(fs.existsSync(FORWARD_MIGRATION_PATH), 'Forward migration file must exist');
  const migrationSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');

  // Contract 1: Preflight checks and table requirements
  assert.ok(
    migrationSql.includes('P103M1T03_PREFLIGHT_FAILED'),
    'Migration must include fail-closed preflight check'
  );
  assert.ok(
    migrationSql.includes("to_regprocedure('public.return_evaluation_round_transaction(uuid, integer, uuid, text)')"),
    'Preflight must verify return base function'
  );
  assert.ok(
    migrationSql.includes("to_regprocedure('public.save_evaluation_round_transaction_active_only("),
    'Preflight must verify 17-arg save RPC'
  );
  cases.push('source:migration-fail-closed-preflight');

  // Contract 2: Deterministic personnel graph lock order before period/config/eval locks
  const lockPattern = /LOCK\s+TABLE\s+public\.teams,\s*public\.users,\s*public\.evaluation_rounds\s+IN\s+SHARE\s+ROW\s+EXCLUSIVE\s+MODE;/g;
  const lockMatches = migrationSql.match(lockPattern);
  assert.ok(
    lockMatches && lockMatches.length >= 2,
    'Both save and return RPCs must acquire deterministic personnel graph table locks'
  );
  cases.push('source:deterministic-graph-lock-order');

  // Contract 3: Current authorization guards
  assert.ok(
    migrationSql.includes('v_expected_evaluator_selector'),
    'Save RPC must determine expected evaluator selector'
  );
  assert.ok(
    migrationSql.includes('v_actor.is_active IS DISTINCT FROM TRUE'),
    'Save RPC must check actor is active'
  );
  assert.ok(
    migrationSql.includes('v_eval_team.is_active IS DISTINCT FROM TRUE'),
    'Save RPC must check evaluation team is active'
  );
  assert.ok(
    migrationSql.includes('v_round.evaluator_id IS DISTINCT FROM p_actor_id'),
    'Save RPC must enforce stored round assignment'
  );
  assert.ok(
    migrationSql.includes('UNAUTHORIZED_ACTOR'),
    'Save RPC must raise UNAUTHORIZED_ACTOR exception'
  );
  cases.push('source:migration-current-authorization-guard');

  // Contract 4: Return authorization guard
  assert.ok(
    migrationSql.includes('v_expected_return_selector'),
    'Return RPC must determine expected return selector'
  );
  cases.push('source:return-rpc-current-authorization-guard');

  // Contract 5: Permissions and legacy RPC revocations
  assert.ok(
    migrationSql.includes('GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only'),
    'Save RPC granted to service_role'
  );
  assert.ok(
    migrationSql.includes('GRANT EXECUTE ON FUNCTION public.return_evaluation_round_transaction'),
    'Return RPC granted to service_role'
  );
  assert.ok(
    migrationSql.includes('REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only'),
    'Save RPC revoked from public/anon/authenticated'
  );
  assert.ok(
    migrationSql.includes('REVOKE ALL ON FUNCTION public.return_evaluation_round_transaction'),
    'Return RPC revoked from public/anon/authenticated'
  );
  assert.ok(
    migrationSql.includes('REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction('),
    'Legacy 15-arg RPCs remain revoked'
  );
  cases.push('source:migration-permissions-and-revocations');

  // Contract 6: Server action preflight checks
  assert.ok(fs.existsSync(ACTION_PATH), 'evaluation.ts must exist');
  const actionCode = fs.readFileSync(ACTION_PATH, 'utf8');
  assert.ok(
    actionCode.includes('assertCurrentRoundWriteAuthorization'),
    'evaluation.ts must define assertCurrentRoundWriteAuthorization'
  );
  assert.ok(
    actionCode.includes('assertCurrentRoundReturnAuthorization'),
    'evaluation.ts must define assertCurrentRoundReturnAuthorization'
  );
  assert.ok(
    actionCode.includes('saveEvaluationRound'),
    'evaluation.ts must export saveEvaluationRound'
  );
  assert.ok(
    actionCode.includes('initializeEvaluationRoundDraft'),
    'evaluation.ts must export initializeEvaluationRoundDraft'
  );
  assert.ok(
    actionCode.includes('returnEvaluationRound'),
    'evaluation.ts must export returnEvaluationRound'
  );
  cases.push('source:action-preflight-guards');

  // Contract 7: Workflow predicates
  assert.ok(fs.existsSync(WORKFLOW_PATH), 'workflow.ts must exist');
  const workflowCode = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  assert.ok(
    workflowCode.includes('export function canWriteEvaluationRound'),
    'workflow.ts must export canWriteEvaluationRound'
  );
  assert.ok(
    workflowCode.includes('export function canReturnEvaluationRound'),
    'workflow.ts must export canReturnEvaluationRound'
  );
  assert.ok(
    workflowCode.includes('canReadEvaluationHistory'),
    'workflow.ts must preserve H4 read policy'
  );
  cases.push('source:workflow-current-authorization-predicates');

  return cases;
}

/**
 * Executes full behavioral qualification matrix when real confirmation runtime is available.
 */
export async function runBehavioralConfirmationSuite(runtime) {
  // Fixture creation belongs to the disposable harness. It must create the
  // initial evaluation and progress round 1 through the transactional business
  // RPC; this suite must never insert a progressed round directly.
  const configRows = runtime.queryJson(`
    SELECT
      (SELECT id FROM public.criteria_config_versions WHERE is_active ORDER BY version_no DESC LIMIT 1) AS criteria_version_id,
      (SELECT id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1) AS grade_version_id;
  `);
  const criteriaVersionId = configRows[0]?.criteria_version_id;
  const gradeVersionId = configRows[0]?.grade_version_id;
  assert.ok(criteriaVersionId && gradeVersionId, 'ACTIVE_EVALUATION_CONFIG_MISSING');
  assert.equal(
    typeof runtime.runAuthenticatedH5Matrix,
    'function',
    'Authenticated Next/action matrix must be supplied by the disposable harness'
  );

  const matrix = await runtime.runAuthenticatedH5Matrix({
    criteriaVersionId,
    gradeVersionId,
    requiredCases: REQUIRED_CASES,
  });
  assert.equal(matrix.tier, 'authenticated', 'H5 matrix must be authenticated');
  assert.equal(matrix.authenticated, true, 'H5 matrix must identify authenticated execution');
  assert.equal(matrix.status, 'QUALIFIED', 'H5 matrix must be qualified');
  for (const requiredCase of REQUIRED_CASES) {
    assert.ok(matrix.cases?.includes(requiredCase), `Missing H5 case: ${requiredCase}`);
  }
  return matrix;
}

export async function run(context = {}) {
  const sourceCases = verifySourceContracts();

  const evidencePath = context?.options?.evidence || process.env.KURABE_H5_EVIDENCE;
  if (evidencePath && fs.existsSync(evidencePath)) {
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    assert.equal(evidence.real, true, 'H5 evidence must be real');
    assert.equal(
      evidence.tier,
      'authenticated',
      'H5 evidence tier must be authenticated for the populated Next/auth/action matrix'
    );
    assert.equal(evidence.authenticated, true, 'H5 evidence must explicitly identify authenticated execution');
    assert.ok(
      Number.isInteger(evidence.authenticatedCases) && evidence.authenticatedCases >= REQUIRED_CASES.length,
      'H5 evidence must enumerate authenticated cases'
    );
    assert.equal(evidence.status, 'QUALIFIED', 'H5 evidence must be qualified');
    assert.ok(
      Array.isArray(evidence.requiredCases) && evidence.requiredCases.length >= REQUIRED_CASES.length,
      'H5 evidence must cover all required cases'
    );
    return { ...evidence, cases: sourceCases, evidencePath };
  }

  // A DB-only confirmation is deliberately insufficient for H5. The required
  // proof must bind real loginAction/getCurrentUserAction/Server Action calls
  // to the same disposable database and candidate. Do not turn the reusable
  // SQL fixture substrate into an authenticated PASS by itself.
  let runtimeEnvVerified = false;
  let runtimeBlocker = 'Local Supabase stack environment is missing or unverified';
  try {
    validateRuntimeEnvironment(process.env);
    runtimeEnvVerified = true;
  } catch (err) {
    runtimeBlocker = err?.message || String(err);
  }

  return {
    real: false,
    passed: false,
    tier: 'source-contract',
    status: 'BLOCKED_CAPABILITY',
    capability: 'BLOCKED_CAPABILITY',
    reason: runtimeEnvVerified
      ? 'A disposable DB substrate is available, but authenticated Next/loginAction/Server Action evidence is missing; DB-only execution cannot qualify H5.'
      : 'Real authenticated disposable runtime is required; local Supabase stack and confirmation runtime capability are unavailable.',
    firstFailure: runtimeBlocker,
    cases: sourceCases,
    target: runtimeEnvVerified ? 'db-substrate-only-no-authenticated-evidence' : 'no-authenticated-evidence',
    requiredCases: REQUIRED_CASES,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    if (!result.passed) {
      console.error(`H5_REVOKE_INTEGRATION ${result.status} reason=${result.reason}`);
      process.exitCode = 1;
    } else {
      console.log(`H5_REVOKE_INTEGRATION ${result.status} cases=${result.cases.length} target=${result.target}`);
    }
  } catch (error) {
    console.error(`H5_REVOKE_INTEGRATION FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
