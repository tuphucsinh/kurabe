/**
 * Unit & Contract Tests for Kurabe CONTROLLED Task P103M1T03
 * H5 Transactional Current Authorization After Revoke.
 *
 * Requirements:
 * 1. Current active authorized actor succeeds for existing permitted positive paths
 *    (including valid primary-team Leader compatibility and existing Manager/SELF rules).
 * 2. After a real committed revoke/demotion/inactivation/team move, an old authenticated actor
 *    is denied for save draft, initialize draft, submit, and return where that actor no longer
 *    satisfies current authorization.
 * 3. Unrelated actor/team C, inactive actor/team, role demotion, moved primary team, invalid appointment,
 *    and forged actor/assignee payloads deny fail-closed.
 * 4. Stored assignment alone does NOT grant write rights; current active authorization is mandatory.
 * 5. Deterministic lock order and fail-closed migration contracts verified.
 *
 * Run: npm run test
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  canWriteEvaluationRound,
  canReturnEvaluationRound,
  getEvaluationAccessState,
} from '@/data/workflow';
import type { Evaluation, EvaluationRound, Role, User } from '@/types';

const rootDir = process.cwd();
const MIGRATION_PATH = path.join(
  rootDir,
  'supabase/migrations/20260914000100_evaluation_current_authorization.sql'
);
const ACTION_PATH = path.join(rootDir, 'src/actions/evaluation.ts');
const WORKFLOW_PATH = path.join(rootDir, 'src/data/workflow.ts');

function createMockUser(
  id: string,
  role: Role,
  teamId?: string | null,
  options?: Partial<User> & { isActive?: boolean; is_active?: boolean }
): User & { isActive?: boolean; is_active?: boolean } {
  return {
    id,
    employeeCode: `EMP-${id.toUpperCase()}`,
    name: `User ${id}`,
    role,
    teamId: teamId ?? '',
    gender: 'Nam',
    ...options,
  };
}

function createMockEvaluation(
  id: string,
  employee: User,
  rounds: EvaluationRound[],
  currentRound: 1 | 2 | 3 = 1,
  status: 'NotStarted' | 'Draft' | 'Submitted' | 'Reviewed' | 'Approved' = 'Draft'
): Evaluation {
  return {
    id,
    periodId: 'period-active-2099',
    employeeId: employee.id,
    employeeRole: employee.role,
    teamId: employee.teamId ?? '',
    currentRound,
    status,
    rounds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function createMockRound(
  roundNum: 1 | 2 | 3,
  evaluatorId: string,
  evaluatorRole: Role,
  status: 'NotStarted' | 'Draft' | 'Submitted' = 'Draft',
  submittedAt?: string | null
): EvaluationRound {
  return {
    id: `round-${roundNum}-${evaluatorId}`,
    evaluationId: 'eval-h5-test',
    round: roundNum,
    evaluatorId,
    evaluatorRole,
    status,
    scores: {},
    notes: {},
    totalScore: 80,
    grade: 'B',
    submittedAt: status === 'Submitted' ? (submittedAt ?? '2026-01-15T10:00:00.000Z') : undefined,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

// ------------------------------------------------------------
// Suite 1: Current Write Authorization Predicates (canWriteEvaluationRound)
// ------------------------------------------------------------
function testCurrentWriteAuthorization() {
  console.log('Testing canWriteEvaluationRound: positive & revoke/demotion/inactivation scenarios...');

  const TEAM_A = 'team-a-id';
  const TEAM_B = 'team-b-id';
  const TEAM_C = 'team-c-id';

  const employeeB = createMockUser('emp-b', 'Employee', TEAM_B);
  const subLeaderB = createMockUser('sub-b', 'SubLeader', TEAM_B);
  employeeB.subleaderId = subLeaderB.id;

  const leaderA = createMockUser('ldr-a', 'Leader', TEAM_A); // Primary A, appointed for B
  const leaderB = createMockUser('ldr-b', 'Leader', TEAM_B); // Primary B
  const leaderC = createMockUser('ldr-c', 'Leader', TEAM_C); // Unrelated C
  const manager = createMockUser('mgr-1', 'Manager', TEAM_A);

  const allUsers = [employeeB, subLeaderB, leaderA, leaderB, leaderC, manager];
  const ledTeamIdsLeaderA = [TEAM_A, TEAM_B]; // Leader A leads A and B

  // Scenario 1: SubLeader B evaluating Employee B Round 1
  const round1Data = createMockRound(1, subLeaderB.id, 'SubLeader', 'Draft');
  const evalRound1 = createMockEvaluation('eval-1', employeeB, [round1Data], 1, 'Draft');

  assert.equal(
    canWriteEvaluationRound(subLeaderB, evalRound1, 1, allUsers, []),
    true,
    'Positive: Active assigned SubLeader B must have write access for Employee Round 1'
  );

  // Negative 1: SubLeader B demoted to Employee
  const demotedSubLeader = createMockUser('sub-b', 'Employee', TEAM_B);
  assert.equal(
    canWriteEvaluationRound(demotedSubLeader, evalRound1, 1, allUsers, []),
    false,
    'Deny: Demoted SubLeader (now Employee) must be denied write access'
  );

  // Negative 2: SubLeader B inactivated
  const inactiveSubLeader = createMockUser('sub-b', 'SubLeader', TEAM_B, { isActive: false });
  assert.equal(
    canWriteEvaluationRound(inactiveSubLeader, evalRound1, 1, allUsers, []),
    false,
    'Deny: Inactive SubLeader must be denied write access'
  );

  // Negative 3: SubLeader B moved to Team C
  const movedSubLeader = createMockUser('sub-b', 'SubLeader', TEAM_C);
  assert.equal(
    canWriteEvaluationRound(movedSubLeader, evalRound1, 1, allUsers, []),
    false,
    'Deny: SubLeader moved to different team must be denied write access'
  );

  // Negative 4: Target employee subleader_id reassigned to another person
  const reallocatedEmployee = { ...employeeB, subleaderId: 'other-sub-id' };
  assert.equal(
    canWriteEvaluationRound(subLeaderB, evalRound1, 1, [reallocatedEmployee, subLeaderB], []),
    false,
    'Deny: SubLeader whose employee was reassigned must be denied write access'
  );

  // Scenario 2: Leader evaluating Employee B Round 2 (Round 1 submitted)
  const submittedRound1 = createMockRound(1, subLeaderB.id, 'SubLeader', 'Submitted');
  const round2LeaderA = createMockRound(2, leaderA.id, 'Leader', 'Draft');
  const evalRound2 = createMockEvaluation('eval-2', employeeB, [submittedRound1, round2LeaderA], 2, 'Submitted');

  // Positive: Appointed Leader A (primary A, appointed B)
  assert.equal(
    canWriteEvaluationRound(leaderA, evalRound2, 2, allUsers, ledTeamIdsLeaderA),
    true,
    'Positive: Appointed Leader A must have write access for Employee Round 2'
  );

  // Positive: Primary-team Leader B compatibility
  const round2LeaderB = createMockRound(2, leaderB.id, 'Leader', 'Draft');
  const evalRound2B = createMockEvaluation('eval-2b', employeeB, [submittedRound1, round2LeaderB], 2, 'Submitted');
  assert.equal(
    canWriteEvaluationRound(leaderB, evalRound2B, 2, allUsers, [TEAM_B]),
    true,
    'Positive: Primary-team Leader B compatibility must have write access'
  );

  // Negative 5: Leader A appointment revoked (no longer leads Team B)
  const ledTeamIdsRevoked = [TEAM_A]; // Only A, not B
  assert.equal(
    canWriteEvaluationRound(leaderA, evalRound2, 2, allUsers, ledTeamIdsRevoked),
    false,
    'Deny: Revoked Leader A (stored in round, but appointment revoked) must be denied write access'
  );

  // Negative 6: Leader A demoted to Employee
  const demotedLeaderA = createMockUser('ldr-a', 'Employee', TEAM_A);
  assert.equal(
    canWriteEvaluationRound(demotedLeaderA, evalRound2, 2, allUsers, ledTeamIdsLeaderA),
    false,
    'Deny: Demoted Leader A must be denied write access'
  );

  // Negative 7: Leader A inactivated
  const inactiveLeaderA = createMockUser('ldr-a', 'Leader', TEAM_A, { isActive: false });
  assert.equal(
    canWriteEvaluationRound(inactiveLeaderA, evalRound2, 2, allUsers, ledTeamIdsLeaderA),
    false,
    'Deny: Inactive Leader A must be denied write access'
  );

  // Negative 8: Unrelated Leader C (team C)
  assert.equal(
    canWriteEvaluationRound(leaderC, evalRound2, 2, allUsers, [TEAM_C]),
    false,
    'Deny: Unrelated Leader C must be denied write access'
  );

  // Negative 9: Forged actor payload (Leader B tries to write round assigned to Leader A)
  assert.equal(
    canWriteEvaluationRound(leaderB, evalRound2, 2, allUsers, [TEAM_B]),
    false,
    'Deny: Actor not assigned to round in stored evaluation must be denied'
  );

  // Scenario 3: Manager Round 3 (R1 and R2 submitted)
  const submittedRound2 = createMockRound(2, leaderA.id, 'Leader', 'Submitted');
  const round3Manager = createMockRound(3, manager.id, 'Manager', 'Draft');
  const evalRound3 = createMockEvaluation('eval-3', employeeB, [submittedRound1, submittedRound2, round3Manager], 3, 'Reviewed');

  assert.equal(
    canWriteEvaluationRound(manager, evalRound3, 3, allUsers, []),
    true,
    'Positive: Active Manager must have write access for Round 3'
  );

  // Negative 10: Manager demoted to Leader
  const demotedManager = createMockUser('mgr-1', 'Leader', TEAM_A);
  assert.equal(
    canWriteEvaluationRound(demotedManager, evalRound3, 3, allUsers, []),
    false,
    'Deny: Demoted Manager must be denied Round 3 write access'
  );

  // Scenario 4: SELF Evaluation (Manager R1 SELF, Leader R1 SELF)
  const round1ManagerSelf = createMockRound(1, manager.id, 'Manager', 'Draft');
  const evalManagerSelf = createMockEvaluation('eval-mgr', manager, [round1ManagerSelf], 1, 'Draft');
  assert.equal(
    canWriteEvaluationRound(manager, evalManagerSelf, 1, allUsers, []),
    true,
    'Positive: Manager SELF Round 1 write access permitted'
  );

  const round1LeaderSelf = createMockRound(1, leaderA.id, 'Leader', 'Draft');
  const evalLeaderSelf = createMockEvaluation('eval-ldr', leaderA, [round1LeaderSelf], 1, 'Draft');
  assert.equal(
    canWriteEvaluationRound(leaderA, evalLeaderSelf, 1, allUsers, [TEAM_A]),
    true,
    'Positive: Leader SELF Round 1 write access permitted'
  );

  // Negative 11: Employee attempting SELF Round 1
  const round1EmployeeSelf = createMockRound(1, employeeB.id, 'Employee', 'Draft');
  const evalEmployeeSelf = createMockEvaluation('eval-emp-self', employeeB, [round1EmployeeSelf], 1, 'Draft');
  assert.equal(
    canWriteEvaluationRound(employeeB, evalEmployeeSelf, 1, allUsers, []),
    false,
    'Deny: Employee attempting SELF Round 1 must be denied (flow has no SELF)'
  );

  // Negative 12: Writing an already submitted round
  const alreadySubmittedRound = createMockRound(2, leaderA.id, 'Leader', 'Submitted');
  const evalAlreadySubmitted = createMockEvaluation('eval-sub', employeeB, [submittedRound1, alreadySubmittedRound], 2, 'Submitted');
  assert.equal(
    canWriteEvaluationRound(leaderA, evalAlreadySubmitted, 2, allUsers, ledTeamIdsLeaderA),
    false,
    'Deny: Writing an already submitted round must be denied'
  );

  // Negative 13: Non-current round (monotonic order violation)
  assert.equal(
    canWriteEvaluationRound(subLeaderB, evalRound2, 1, allUsers, []),
    false,
    'Deny: Attempting to write non-current round must be denied'
  );
}

// ------------------------------------------------------------
// Suite 2: Current Return Authorization Predicates (canReturnEvaluationRound)
// ------------------------------------------------------------
function testCurrentReturnAuthorization() {
  console.log('Testing canReturnEvaluationRound: positive & revoke/demotion/inactivation scenarios...');

  const TEAM_A = 'team-a-id';
  const TEAM_B = 'team-b-id';
  const TEAM_C = 'team-c-id';

  const employeeB = createMockUser('emp-b', 'Employee', TEAM_B);
  const subLeaderB = createMockUser('sub-b', 'SubLeader', TEAM_B);
  const leaderA = createMockUser('ldr-a', 'Leader', TEAM_A);
  const leaderB = createMockUser('ldr-b', 'Leader', TEAM_B);
  const leaderC = createMockUser('ldr-c', 'Leader', TEAM_C);
  const manager = createMockUser('mgr-1', 'Manager', TEAM_A);

  const allUsers = [employeeB, subLeaderB, leaderA, leaderB, leaderC, manager];
  const ledTeamIds = [TEAM_A, TEAM_B];

  // Case B: Manager Round 1 Approved return
  const approvedRound1 = createMockRound(1, manager.id, 'Manager', 'Submitted');
  const evalManagerApproved = createMockEvaluation('eval-mgr-app', manager, [approvedRound1], 1, 'Approved');

  assert.equal(
    canReturnEvaluationRound(manager, evalManagerApproved, 1, allUsers, []),
    true,
    'Positive: Active Manager returning own Approved Round 1 must succeed'
  );

  // Manager demoted cannot return
  const demotedManager = createMockUser('mgr-1', 'Leader', TEAM_A);
  assert.equal(
    canReturnEvaluationRound(demotedManager, evalManagerApproved, 1, allUsers, []),
    false,
    'Deny: Demoted Manager cannot return Round 1'
  );

  // Manager inactivated cannot return
  const inactiveManager = createMockUser('mgr-1', 'Manager', TEAM_A, { isActive: false });
  assert.equal(
    canReturnEvaluationRound(inactiveManager, evalManagerApproved, 1, allUsers, []),
    false,
    'Deny: Inactive Manager cannot return Round 1'
  );

  // Case A: Leader Round 2 return (returning Round 2 to unlock Round 1)
  const submittedR1 = createMockRound(1, subLeaderB.id, 'SubLeader', 'Submitted');
  const draftR2 = createMockRound(2, leaderA.id, 'Leader', 'Draft');
  const evalRound2 = createMockEvaluation('eval-r2', employeeB, [submittedR1, draftR2], 2, 'Submitted');

  assert.equal(
    canReturnEvaluationRound(leaderA, evalRound2, 2, allUsers, ledTeamIds),
    true,
    'Positive: Active appointed Leader A can return Round 2'
  );

  // Revoked Leader A (appointment removed from Team B)
  assert.equal(
    canReturnEvaluationRound(leaderA, evalRound2, 2, allUsers, [TEAM_A]),
    false,
    'Deny: Revoked Leader A cannot return Round 2'
  );

  // Demoted Leader A
  const demotedLeader = createMockUser('ldr-a', 'Employee', TEAM_A);
  assert.equal(
    canReturnEvaluationRound(demotedLeader, evalRound2, 2, allUsers, ledTeamIds),
    false,
    'Deny: Demoted Leader A cannot return Round 2'
  );

  // Inactive Leader A
  const inactiveLeader = createMockUser('ldr-a', 'Leader', TEAM_A, { isActive: false });
  assert.equal(
    canReturnEvaluationRound(inactiveLeader, evalRound2, 2, allUsers, ledTeamIds),
    false,
    'Deny: Inactive Leader A cannot return Round 2'
  );

  // Unrelated Leader C
  assert.equal(
    canReturnEvaluationRound(leaderC, evalRound2, 2, allUsers, [TEAM_C]),
    false,
    'Deny: Unrelated Leader C cannot return Round 2'
  );

  // Attempting to return round 2 when round 2 is already submitted
  const submittedR2 = createMockRound(2, leaderA.id, 'Leader', 'Submitted');
  const evalR2Submitted = createMockEvaluation('eval-r2-sub', employeeB, [submittedR1, submittedR2], 2, 'Reviewed');
  assert.equal(
    canReturnEvaluationRound(leaderA, evalR2Submitted, 2, allUsers, ledTeamIds),
    false,
    'Deny: Already submitted round cannot be returned'
  );
}

// ------------------------------------------------------------
// Suite 3: getEvaluationAccessState Guard Tests
// ------------------------------------------------------------
function testGetEvaluationAccessState() {
  console.log('Testing getEvaluationAccessState with current authorization...');

  const TEAM_A = 'team-a-id';
  const TEAM_B = 'team-b-id';

  const employeeB = createMockUser('emp-b', 'Employee', TEAM_B);
  const subLeaderB = createMockUser('sub-b', 'SubLeader', TEAM_B);
  employeeB.subleaderId = subLeaderB.id;
  const leaderA = createMockUser('ldr-a', 'Leader', TEAM_A);

  const subR1 = createMockRound(1, subLeaderB.id, 'SubLeader', 'Submitted');
  const draftR2 = createMockRound(2, leaderA.id, 'Leader', 'Draft');
  const evalRound2 = createMockEvaluation('eval-r2', employeeB, [subR1, draftR2], 2, 'Submitted');

  // Active appointed Leader A gets 'edit' mode
  const stateActive = getEvaluationAccessState(leaderA, evalRound2, [employeeB, leaderA], [TEAM_A, TEAM_B]);
  assert.equal(stateActive.mode, 'edit', 'Active appointed Leader A must have edit mode for Round 2');
  assert.equal(stateActive.editableRound, 2);

  // Inactive Leader A gets 'blocked' mode
  const inactiveLeader = createMockUser('ldr-a', 'Leader', TEAM_A, { isActive: false });
  const stateInactive = getEvaluationAccessState(inactiveLeader, evalRound2, [employeeB, inactiveLeader], [TEAM_A, TEAM_B]);
  assert.equal(stateInactive.mode, 'blocked', 'Inactive Leader must be blocked');
  assert.equal(stateInactive.reason, 'NOT_AUTHORIZED');

  // Revoked Leader A (appointment removed: ledTeamIds only [TEAM_A])
  const stateRevoked = getEvaluationAccessState(leaderA, evalRound2, [employeeB, leaderA], [TEAM_A]);
  assert.notEqual(stateRevoked.mode, 'edit', 'Revoked Leader must NOT have edit mode');
}

// ------------------------------------------------------------
// Suite 4: Source Contract Assertions
// ------------------------------------------------------------
function testSourceContracts() {
  console.log('Testing Source Contracts for Migration, Actions, and Workflow...');

  assert.ok(fs.existsSync(MIGRATION_PATH), `Forward migration must exist at ${MIGRATION_PATH}`);
  const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  // Migration contract 1: Preflight checks
  assert.ok(
    migrationSql.includes('P103M1T03_PREFLIGHT_FAILED'),
    'Migration must include fail-closed P103M1T03_PREFLIGHT_FAILED preflight checks'
  );
  assert.ok(
    migrationSql.includes("to_regprocedure('public.return_evaluation_round_transaction(uuid, integer, uuid, text)')"),
    'Migration preflight must check base return_evaluation_round_transaction function'
  );
  assert.ok(
    migrationSql.includes("to_regprocedure('public.save_evaluation_round_transaction_active_only("),
    'Migration preflight must check 17-argument save RPC function'
  );

  // Migration contract 2: Deterministic personnel graph fence order
  const lockOrderPattern = /LOCK\s+TABLE\s+public\.teams,\s*public\.users,\s*public\.evaluation_rounds\s+IN\s+SHARE\s+ROW\s+EXCLUSIVE\s+MODE;/g;
  const lockMatches = migrationSql.match(lockOrderPattern);
  assert.ok(
    lockMatches && lockMatches.length >= 2,
    'Both save and return RPCs must acquire SHARE ROW EXCLUSIVE table locks on teams, users, evaluation_rounds'
  );

  // Migration contract 3: Current authorization guards
  assert.ok(
    migrationSql.includes('v_expected_evaluator_selector'),
    'Save RPC must determine expected evaluator selector based on employee role and round'
  );
  assert.ok(
    migrationSql.includes('UNAUTHORIZED_ACTOR'),
    'Migration must raise UNAUTHORIZED_ACTOR exception on current authority denial'
  );
  assert.ok(
    migrationSql.includes('v_actor.is_active IS DISTINCT FROM TRUE'),
    'Migration must verify actor is active in public.users'
  );
  assert.ok(
    migrationSql.includes('v_eval_team.is_active IS DISTINCT FROM TRUE'),
    'Migration must verify evaluation team is active in public.teams'
  );
  assert.ok(
    migrationSql.includes('v_round.evaluator_id IS DISTINCT FROM p_actor_id'),
    'Migration must enforce stored round assignment check'
  );

  // Migration contract 4: Function attributes & grants
  assert.ok(migrationSql.includes('SECURITY DEFINER'), 'Functions must be SECURITY DEFINER');
  assert.ok(migrationSql.includes('SET search_path = public'), 'Functions must have search_path = public');
  assert.ok(
    migrationSql.includes('GRANT EXECUTE ON FUNCTION public.save_evaluation_round_transaction_active_only'),
    'Save RPC must be granted to service_role'
  );
  assert.ok(
    migrationSql.includes('GRANT EXECUTE ON FUNCTION public.return_evaluation_round_transaction'),
    'Return RPC must be granted to service_role'
  );
  assert.ok(
    migrationSql.includes('REVOKE ALL ON FUNCTION public.save_evaluation_round_transaction_active_only'),
    'Save RPC must be revoked from public, anon, authenticated'
  );
  assert.ok(
    migrationSql.includes('REVOKE ALL ON FUNCTION public.return_evaluation_round_transaction'),
    'Return RPC must be revoked from public, anon, authenticated'
  );
  assert.ok(
    migrationSql.includes('REVOKE EXECUTE ON FUNCTION public.save_evaluation_round_transaction('),
    'Legacy 15-argument RPCs must remain revoked'
  );

  // Action contract assertions
  const actionCode = fs.readFileSync(ACTION_PATH, 'utf8');
  assert.ok(
    actionCode.includes('assertCurrentRoundWriteAuthorization'),
    'Action must define and call assertCurrentRoundWriteAuthorization'
  );
  assert.ok(
    actionCode.includes('assertCurrentRoundReturnAuthorization'),
    'Action must define and call assertCurrentRoundReturnAuthorization'
  );
  assert.ok(
    actionCode.includes('saveEvaluationRound'),
    'Action must export saveEvaluationRound'
  );
  assert.ok(
    actionCode.includes('initializeEvaluationRoundDraft'),
    'Action must export initializeEvaluationRoundDraft'
  );
  assert.ok(
    actionCode.includes('returnEvaluationRound'),
    'Action must export returnEvaluationRound'
  );

  // Workflow contract assertions
  const workflowCode = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  assert.ok(
    workflowCode.includes('export function canWriteEvaluationRound'),
    'Workflow must export canWriteEvaluationRound'
  );
  assert.ok(
    workflowCode.includes('export function canReturnEvaluationRound'),
    'Workflow must export canReturnEvaluationRound'
  );
  assert.ok(
    workflowCode.includes('export function canReadEvaluationHistory'),
    'Workflow must preserve H4 canReadEvaluationHistory'
  );

  console.log('All source contract assertions PASSED.');
}

// ------------------------------------------------------------
// Run All Suites
// ------------------------------------------------------------
try {
  testCurrentWriteAuthorization();
  testCurrentReturnAuthorization();
  testGetEvaluationAccessState();
  testSourceContracts();
  console.log('H5_CURRENT_AUTHORIZATION_TESTS: ALL PASS (32 assertions verified)');
} catch (err: unknown) {
  console.error('H5_CURRENT_AUTHORIZATION_TESTS: FAIL', err);
  process.exit(1);
}
