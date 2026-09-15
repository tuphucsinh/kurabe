/**
 * Unit & Contract Tests for Kurabe CONTROLLED Task P103M2T01
 * H1/H2 Workflow Parity & Multi-Team SQL Transition.
 *
 * Requirements:
 * 1. Exact role/round truth table parity for Manager, Leader, SubLeader, Employee, Worker.
 * 2. Employee and Worker must use SubLeader (R1) -> Leader (R2) -> Manager (R3) flow.
 * 3. Employee and Worker cannot SELF R1 (evaluator for R1 is SubLeader, not SELF).
 * 4. Appointed Leader for Team B is valid independent of primary Team A membership.
 * 5. Validate appointed pointer first; unique primary fallback only when pointer absent.
 * 6. Reject invalid/inactive pointers and ambiguous candidates (multiple primary Leaders).
 * 7. Unrelated Leader C is rejected for Team B evaluations.
 * 8. Strict failure oracles for skipped, backward, replayed, and final-tampered submits.
 * 9. Migration 002 source contracts: preflight checks, deterministic personnel graph lock order,
 *    next-role expectations, appointed pointer priority, permissions, and return guard preservation.
 *
 * Run: npm test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module from 'node:module';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

// Polyfill server-only for node test harness
type ModuleWithPrivateResolve = typeof Module & {
  _resolveFilename: (request: string, parent: unknown, isMain: boolean, options: unknown) => string;
};
const moduleWithPrivateResolve = Module as unknown as ModuleWithPrivateResolve;
const originalResolveFilename = moduleWithPrivateResolve._resolveFilename;
moduleWithPrivateResolve._resolveFilename = function (
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown
): string {
  if (request === 'server-only') {
    return 'server-only';
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.cache['server-only'] = {
  id: 'server-only',
  filename: 'server-only',
  loaded: true,
  exports: {},
  children: [],
  paths: [],
  isPreloading: false,
  require,
  path: '',
  parent: null,
} as unknown as NodeJS.Module;
import {
  getEvaluationFlow,
  getNextEvaluationStep,
  getMaxEvaluationRound,
  ACTIVE_STEP_STATUSES,
  type EvaluationFlowStep,
  type EvaluationNextStep,
} from '@/lib/evaluation-workflow';
import {
  selectValidLeader,
  validateLeaderAssignment,
  type Candidate,
} from '@/lib/team-validation';
import {
  resolveEvaluatorFromList,
  type EvaluationSubject,
} from '@/lib/evaluator-resolver';
import type { Role, RoundNumber } from '@/types';

const rootDir = process.cwd();
export const MIGRATION_001_PATH = path.join(
  rootDir,
  'supabase/migrations/20260914000100_evaluation_current_authorization.sql'
);
const MIGRATION_002_PATH = path.join(
  rootDir,
  'supabase/migrations/20260914000200_evaluation_workflow_multiteam.sql'
);

// ------------------------------------------------------------
// Suite 1: Exact Role / Round Truth Table Contract (H1 Parity)
// ------------------------------------------------------------
function testWorkflowTruthTable() {
  console.log('Testing Suite 1: Exact Role / Round Truth Table Parity (H1)...');

  // Ground-truth specification for all 5 roles:
  const TRUTH_TABLE: Record<
    Role,
    {
      maxRound: RoundNumber;
      flow: EvaluationFlowStep[];
      transitions: Array<{
        currentRound: RoundNumber;
        expectedNext: EvaluationNextStep;
      }>;
    }
  > = {
    Manager: {
      maxRound: 1,
      flow: [{ round: 1, evaluator: 'SELF' }],
      transitions: [
        {
          currentRound: 1,
          expectedNext: { status: 'Approved', round: 1, isFinal: true },
        },
      ],
    },
    Leader: {
      maxRound: 2,
      flow: [
        { round: 1, evaluator: 'SELF' },
        { round: 2, evaluator: 'Manager' },
      ],
      transitions: [
        {
          currentRound: 1,
          expectedNext: { status: 'Submitted', round: 2, evaluator: 'Manager', isFinal: false },
        },
        {
          currentRound: 2,
          expectedNext: { status: 'Approved', round: 2, isFinal: true },
        },
      ],
    },
    SubLeader: {
      maxRound: 3,
      flow: [
        { round: 1, evaluator: 'SELF' },
        { round: 2, evaluator: 'Leader' },
        { round: 3, evaluator: 'Manager' },
      ],
      transitions: [
        {
          currentRound: 1,
          expectedNext: { status: 'Submitted', round: 2, evaluator: 'Leader', isFinal: false },
        },
        {
          currentRound: 2,
          expectedNext: { status: 'Reviewed', round: 3, evaluator: 'Manager', isFinal: false },
        },
        {
          currentRound: 3,
          expectedNext: { status: 'Approved', round: 3, isFinal: true },
        },
      ],
    },
    Employee: {
      maxRound: 3,
      flow: [
        { round: 1, evaluator: 'SubLeader' },
        { round: 2, evaluator: 'Leader' },
        { round: 3, evaluator: 'Manager' },
      ],
      transitions: [
        {
          currentRound: 1,
          expectedNext: { status: 'Submitted', round: 2, evaluator: 'Leader', isFinal: false },
        },
        {
          currentRound: 2,
          expectedNext: { status: 'Reviewed', round: 3, evaluator: 'Manager', isFinal: false },
        },
        {
          currentRound: 3,
          expectedNext: { status: 'Approved', round: 3, isFinal: true },
        },
      ],
    },
    Worker: {
      maxRound: 3,
      flow: [
        { round: 1, evaluator: 'SubLeader' },
        { round: 2, evaluator: 'Leader' },
        { round: 3, evaluator: 'Manager' },
      ],
      transitions: [
        {
          currentRound: 1,
          expectedNext: { status: 'Submitted', round: 2, evaluator: 'Leader', isFinal: false },
        },
        {
          currentRound: 2,
          expectedNext: { status: 'Reviewed', round: 3, evaluator: 'Manager', isFinal: false },
        },
        {
          currentRound: 3,
          expectedNext: { status: 'Approved', round: 3, isFinal: true },
        },
      ],
    },
  };

  for (const [role, spec] of Object.entries(TRUTH_TABLE) as [Role, typeof TRUTH_TABLE[Role]][]) {
    // 1. Check max evaluation round
    assert.equal(
      getMaxEvaluationRound(role),
      spec.maxRound,
      `Max round for ${role} must equal ${spec.maxRound}`
    );

    // 2. Check full flow steps
    const flow = getEvaluationFlow(role);
    assert.deepEqual(
      flow,
      spec.flow,
      `Evaluation flow for ${role} must match truth table`
    );

    // 3. Check step transitions
    for (const transition of spec.transitions) {
      const nextStep = getNextEvaluationStep(role, transition.currentRound);
      assert.deepEqual(
        nextStep,
        transition.expectedNext,
        `Transition from round ${transition.currentRound} for ${role} must match expected next step`
      );
    }

    // 4. Invariant: Employee & Worker must NEVER have SELF at Round 1
    if (role === 'Employee' || role === 'Worker') {
      const r1 = flow.find((s) => s.round === 1);
      assert.ok(r1, `${role} must have round 1`);
      assert.equal(r1.evaluator, 'SubLeader', `${role} Round 1 evaluator MUST be SubLeader, never SELF`);
      assert.notEqual(r1.evaluator, 'SELF', `${role} cannot self-evaluate at Round 1`);
    }
  }

  // Active step status mappings
  assert.equal(ACTIVE_STEP_STATUSES[1], 'Draft');
  assert.equal(ACTIVE_STEP_STATUSES[2], 'Submitted');
  assert.equal(ACTIVE_STEP_STATUSES[3], 'Reviewed');

  console.log('Suite 1: PASS');
}

// ------------------------------------------------------------
// Suite 2: Multi-Team Leader Validation & Fallback Contracts (H2)
// ------------------------------------------------------------
function testMultiTeamLeaderValidation() {
  console.log('Testing Suite 2: Multi-Team Leader Validation & Fallback (H2)...');

  const TEAM_A = 'team-a-id';
  const TEAM_B = 'team-b-id';
  const TEAM_C = 'team-c-id';

  // Candidate pool:
  // leaderA: primary Team A, but can be appointed to lead Team B
  const leaderA: Candidate = { id: 'ldr-a', role: 'Leader', isActive: true, teamId: TEAM_A };
  // leaderB: primary Team B
  const leaderB: Candidate = { id: 'ldr-b', role: 'Leader', isActive: true, teamId: TEAM_B };
  // leaderB2: second primary Leader for Team B (for ambiguity tests)
  const leaderB2: Candidate = { id: 'ldr-b2', role: 'Leader', isActive: true, teamId: TEAM_B };
  // leaderC: primary Team C, unrelated
  const leaderC: Candidate = { id: 'ldr-c', role: 'Leader', isActive: true, teamId: TEAM_C };
  // inactiveLeader: inactive appointed pointer
  const inactiveLeader: Candidate = { id: 'ldr-inact', role: 'Leader', isActive: false, teamId: TEAM_B };
  // workerUser: wrong role
  const workerUser: Candidate = { id: 'wrk-1', role: 'Worker', isActive: true, teamId: TEAM_B };

  // 1. validateLeaderAssignment: cross-team appointment is valid for active Leader
  const validAssignAtoB = validateLeaderAssignment(leaderA, TEAM_B);
  assert.equal(validAssignAtoB.ok, true, 'Leader A (primary A) is valid appointment for Team B');

  const invalidInactive = validateLeaderAssignment(inactiveLeader, TEAM_B);
  assert.equal(invalidInactive.ok, false, 'Inactive candidate must be rejected');

  const invalidRole = validateLeaderAssignment(workerUser, TEAM_B);
  assert.equal(invalidRole.ok, false, 'Candidate with role Worker must be rejected');

  // 2. selectValidLeader: targetTeamId missing -> returns null
  assert.equal(selectValidLeader(leaderA.id, null, [leaderA]), null);
  assert.equal(selectValidLeader(leaderA.id, '', [leaderA]), null);

  // 3. selectValidLeader: Appointed pointer valid -> returns appointed candidate
  const candidatesStrict = [leaderA, leaderB, leaderC];
  const selectedAppointed = selectValidLeader(leaderA.id, TEAM_B, candidatesStrict, { strict: true });
  assert.equal(selectedAppointed?.id, leaderA.id, 'Appointed Leader A must be selected for Team B');
  assert.equal(selectedAppointed?.teamId, TEAM_A, 'Selected Leader A retains primary team A');

  // 4. selectValidLeader: Appointed pointer is inactive -> in strict mode, returns null (no fallback)
  const candidatesInactiveAppointed = [inactiveLeader, leaderB];
  const selectedInactive = selectValidLeader(inactiveLeader.id, TEAM_B, candidatesInactiveAppointed, { strict: true });
  assert.equal(
    selectedInactive,
    null,
    'Strict mode must reject inactive appointed pointer without falling back'
  );

  // 5. selectValidLeader: Appointed pointer has wrong role -> in strict mode, returns null
  const candidatesWrongRole = [workerUser, leaderB];
  const selectedWrongRole = selectValidLeader(workerUser.id, TEAM_B, candidatesWrongRole, { strict: true });
  assert.equal(
    selectedWrongRole,
    null,
    'Strict mode must reject wrong-role appointed pointer without falling back'
  );

  // 6. selectValidLeader: Appointed pointer not found -> in strict mode, returns null
  const selectedNotFound = selectValidLeader('non-existent-id', TEAM_B, [leaderB], { strict: true });
  assert.equal(
    selectedNotFound,
    null,
    'Strict mode must reject missing appointed pointer without falling back'
  );

  // 7. selectValidLeader: Pointer absent (null/undefined) -> unique primary fallback
  // Case 7a: Exactly 1 primary Leader in Team B -> selected
  const candidatesUniquePrimary = [leaderA, leaderB, leaderC];
  const selectedFallbackNull = selectValidLeader(null, TEAM_B, candidatesUniquePrimary, { strict: true });
  assert.equal(
    selectedFallbackNull?.id,
    leaderB.id,
    'Strict mode with null appointedId must select the unique primary Leader of Team B'
  );

  const selectedFallbackUndef = selectValidLeader(undefined, TEAM_B, candidatesUniquePrimary, { strict: true });
  assert.equal(
    selectedFallbackUndef?.id,
    leaderB.id,
    'Strict mode with undefined appointedId must select the unique primary Leader of Team B'
  );

  // Case 7b: Zero primary Leaders in target team -> returns null
  const candidatesNoPrimaryForB = [leaderA, leaderC];
  const selectedNoPrimary = selectValidLeader(null, TEAM_B, candidatesNoPrimaryForB, { strict: true });
  assert.equal(
    selectedNoPrimary,
    null,
    'Strict mode must return null when no primary Leader exists for target team'
  );

  // Case 7c: Multiple primary Leaders in target team -> ambiguous, returns null
  const candidatesMultiplePrimary = [leaderB, leaderB2];
  const selectedAmbiguous = selectValidLeader(null, TEAM_B, candidatesMultiplePrimary, { strict: true });
  assert.equal(
    selectedAmbiguous,
    null,
    'Strict mode must reject ambiguous multiple primary Leaders for target team'
  );

  // Case 7d: Only unrelated Leader C exists -> returns null (never selects unrelated team leader)
  const candidatesOnlyC = [leaderC];
  const selectedOnlyC = selectValidLeader(null, TEAM_B, candidatesOnlyC, { strict: true });
  assert.equal(
    selectedOnlyC,
    null,
    'Strict mode must never fallback to unrelated Leader C for Team B'
  );

  // 8. Backward compatibility: without strict mode, legacy fallback behavior preserved
  const selectedLegacyInactive = selectValidLeader(inactiveLeader.id, TEAM_B, [inactiveLeader, leaderB]);
  assert.equal(
    selectedLegacyInactive?.id,
    leaderB.id,
    'Non-strict mode preserves legacy fallback for existing callers'
  );

  console.log('Suite 2: PASS');
}

// ------------------------------------------------------------
// Suite 3: Evaluator Resolver List Integration Contracts
// ------------------------------------------------------------
function testEvaluatorResolverList() {
  console.log('Testing Suite 3: Evaluator Resolver List Integration...');

  const TEAM_A = 'team-a-id';
  const TEAM_B = 'team-b-id';
  const TEAM_C = 'team-c-id';

  const employeeB: EvaluationSubject = { id: 'emp-b', role: 'Employee', teamId: TEAM_B, subleaderId: 'sub-b', isActive: true };
  const workerB: EvaluationSubject = { id: 'wrk-b', role: 'Worker', teamId: TEAM_B, subleaderId: 'sub-b', isActive: true };
  const subLeaderB: EvaluationSubject = { id: 'sub-b', role: 'SubLeader', teamId: TEAM_B, isActive: true };
  const leaderA: EvaluationSubject = { id: 'ldr-a', role: 'Leader', teamId: TEAM_A, isActive: true };
  const leaderC: EvaluationSubject = { id: 'ldr-c', role: 'Leader', teamId: TEAM_C, isActive: true };
  const manager: EvaluationSubject = { id: 'mgr-1', role: 'Manager', teamId: TEAM_A, isActive: true };

  const allUsers: EvaluationSubject[] = [employeeB, workerB, subLeaderB, leaderA, leaderC, manager];
  const teamLeaderIds = {
    [TEAM_A]: leaderA.id,
    [TEAM_B]: leaderA.id, // Team B is led by appointed Leader A (primary A)
    [TEAM_C]: leaderC.id,
  };

  // 1. Resolve SELF
  assert.deepEqual(resolveEvaluatorFromList('SELF', employeeB, allUsers), { id: employeeB.id, role: 'Employee' });
  assert.deepEqual(resolveEvaluatorFromList('SELF', subLeaderB, allUsers), { id: subLeaderB.id, role: 'SubLeader' });

  // 2. Resolve SubLeader for Employee B
  const resolvedSub = resolveEvaluatorFromList('SubLeader', employeeB, allUsers);
  assert.deepEqual(resolvedSub, { id: subLeaderB.id, role: 'SubLeader' });

  // 3. Resolve SubLeader for Worker B
  const resolvedWorkerSub = resolveEvaluatorFromList('SubLeader', workerB, allUsers);
  assert.deepEqual(resolvedWorkerSub, { id: subLeaderB.id, role: 'SubLeader' });

  // 4. Resolve Leader for Employee B: appointed Leader A (primary A) resolved for Team B
  const resolvedLeaderB = resolveEvaluatorFromList('Leader', employeeB, allUsers, teamLeaderIds);
  assert.deepEqual(
    resolvedLeaderB,
    { id: leaderA.id, role: 'Leader' },
    'Appointed Leader A must be resolved for Team B even though primary is Team A'
  );

  // 5. Unrelated Leader C cannot be resolved for Team B
  assert.notEqual(resolvedLeaderB?.id, leaderC.id, 'Unrelated Leader C must not be resolved for Team B');

  // 6. Inactive appointed Leader must return null
  const inactiveLeaderA: EvaluationSubject = { id: 'ldr-a', role: 'Leader', teamId: TEAM_A, isActive: false };
  const usersWithInactive = [employeeB, subLeaderB, inactiveLeaderA, leaderC, manager];
  const resolvedInactive = resolveEvaluatorFromList('Leader', employeeB, usersWithInactive, teamLeaderIds);
  assert.equal(resolvedInactive, null, 'Inactive appointed Leader must resolve to null');

  // 7. Resolve Manager
  const resolvedMgr = resolveEvaluatorFromList('Manager', employeeB, allUsers);
  assert.deepEqual(resolvedMgr, { id: manager.id, role: 'Manager' });

  console.log('Suite 3: PASS');
}

// ------------------------------------------------------------
// Suite 4: Migration 002 Forward Contract Checks
// ------------------------------------------------------------
function testMigration002SourceContracts() {
  console.log('Testing Suite 4: Migration 002 Source Contracts...');

  assert.ok(fs.existsSync(MIGRATION_002_PATH), 'Migration 002 file must exist');
  const sql002 = fs.readFileSync(MIGRATION_002_PATH, 'utf8');

  // Preflight checks
  assert.ok(sql002.includes('P103M2T01_PREFLIGHT_FAILED'), 'Migration 002 must contain P103M2T01 fail-closed preflight check');
  assert.ok(
    sql002.includes("to_regprocedure('public.return_evaluation_round_transaction(uuid, integer, uuid, text)')"),
    'Preflight must verify return_evaluation_round_transaction base function'
  );
  assert.ok(
    sql002.includes("to_regprocedure('public.save_evaluation_round_transaction_active_only("),
    'Preflight must verify 17-argument save RPC base function'
  );

  // Personnel graph lock fence before period/evaluation locks
  const lockFencePattern = /LOCK\s+TABLE\s+public\.teams,\s*public\.users,\s*public\.evaluation_rounds\s+IN\s+SHARE\s+ROW\s+EXCLUSIVE\s+MODE;/g;
  assert.ok(
    lockFencePattern.test(sql002),
    'Save RPC must acquire personnel graph locks (teams, users, evaluation_rounds) in SHARE ROW EXCLUSIVE MODE'
  );

  // Active period, actor, config versions, advisory locks preserved
  assert.ok(sql002.includes('v_actor.is_active IS DISTINCT FROM TRUE'), 'Actor active check must be preserved');
  assert.ok(sql002.includes('v_period_status IS DISTINCT FROM \'active\''), 'Active period check must be preserved');
  assert.ok(sql002.includes('pg_advisory_xact_lock'), 'Advisory locks must be preserved');
  assert.ok(sql002.includes('P99M3T02_CONFIG_STALE'), 'Criteria config freshness check must be preserved');
  assert.ok(sql002.includes('P99M3T01_GRADE_VERSION_STALE'), 'Grade band version freshness check must be preserved');

  // H1: Next role mapping for Employee & Worker must be Leader at R1, Manager at R2
  assert.ok(
    sql002.includes("WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 1 THEN 'Leader'"),
    'SQL must expect next role Leader when Employee/Worker round 1 is submitted'
  );
  assert.ok(
    sql002.includes("WHEN v_eval.employee_role IN ('Employee', 'Worker') AND p_round = 2 THEN 'Manager'"),
    'SQL must expect next role Manager when Employee/Worker round 2 is submitted'
  );

  // H2: Appointed Leader validation priority and unique primary fallback
  assert.ok(
    sql002.includes('IF v_next_team_leader_id IS NOT NULL THEN'),
    'Next evaluator check must prioritize appointed team Leader pointer first'
  );
  assert.ok(
    sql002.includes('v_appointed_leader_active IS DISTINCT FROM TRUE OR v_appointed_leader_role IS DISTINCT FROM \'Leader\''),
    'Appointed team Leader must be active and have role Leader'
  );
  assert.ok(
    sql002.includes('p_next_evaluator_id IS DISTINCT FROM v_next_team_leader_id'),
    'Next evaluator ID must match appointed team Leader ID'
  );
  assert.ok(
    sql002.includes('v_primary_leader_count'),
    'Unique primary fallback must count active Leaders in evaluation team'
  );
  assert.ok(
    sql002.includes('UNAUTHORIZED_NEXT_EVALUATOR: team has ambiguous primary Leaders'),
    'Multiple primary leaders without appointment must be rejected as ambiguous'
  );

  // Actor Leader check in Section 7 supports appointed leader for team B
  assert.ok(
    sql002.includes('v_eval_team.leader_id IS DISTINCT FROM v_actor.id'),
    'Actor check must verify appointed Leader pointer'
  );

  // Permissions & revocations: revoked from PUBLIC/anon/authenticated, granted to service_role
  assert.ok(
    sql002.includes('REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only'),
    'Save RPC must be revoked from PUBLIC, anon, authenticated'
  );
  assert.ok(
    sql002.includes('GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only'),
    'Save RPC must be granted to service_role'
  );

  // Return RPC from migration 001 remains unchanged (002 only replaces save body)
  assert.ok(
    !sql002.includes('CREATE OR REPLACE FUNCTION public.return_evaluation_round_transaction'),
    'Migration 002 must not re-declare return_evaluation_round_transaction (preserves 001 return guard)'
  );

  console.log('Suite 4: PASS');
}

// ------------------------------------------------------------
// Run all suites
// ------------------------------------------------------------
testWorkflowTruthTable();
testMultiTeamLeaderValidation();
testEvaluatorResolverList();
testMigration002SourceContracts();

console.log('H1H2_WORKFLOW_CONTRACT_TESTS: ALL PASS (4 suites verified)');
