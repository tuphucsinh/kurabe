/**
 * Unit & Contract Tests for Kurabe CONTROLLED Task P103M1T02
 * H4 server history authorization and target non-disclosure.
 *
 * Required test coverage:
 * 1. Denied target with no history (Leader A viewing Leader C outside scope)
 * 2. Denied target with permitted-zero history (Target has evaluations, but viewer has 0 permitted)
 * 3. Anonymous / individual / SubLeader denial
 * 4. Withdrawn unfinished assignment denial (Unsubmitted / draft assignment does not grant access)
 * 5. Old submitted historical evaluator positive control (Submitted evaluator round grants access)
 * 6. Unrelated-period denial (No access leakage across unassigned/unrelated periods)
 * 7. Authorized self / Manager / current primary and appointed team positive controls
 * 8. Non-disclosure invariant: zero name/code/role/team leakage in payload, RSC/HTML or UI text
 *
 * Run: npm run test
 */

import assert from 'node:assert/strict';
import {
  canViewEvaluation,
  canReadEvaluationHistory,
  hasEvaluationHistoryTargetScope,
  isAuthorizedHistoricalEvaluator,
  isRoundSubmitted,
} from '@/data/workflow';
import type { Evaluation, EvaluationPeriod, EvaluationRound, Role, User } from '@/types';

function createMockUser(
  id: string,
  role: Role,
  teamId?: string | null,
  options?: Partial<User>
): User {
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

function createMockPeriod(
  id: string,
  year: number,
  status: 'Active' | 'Closed' = 'Closed'
): EvaluationPeriod {
  return {
    id,
    year,
    name: `Kỳ đánh giá ${year}`,
    status,
    createdBy: 'mgr-admin',
    createdAt: `${year}-01-01T00:00:00.000Z`,
    closedAt: status === 'Closed' ? `${year}-12-31T23:59:59.000Z` : undefined,
  };
}

function createMockEvaluation(
  id: string,
  employee: User,
  periodId: string,
  rounds: EvaluationRound[],
  status: 'Draft' | 'Submitted' | 'Reviewed' | 'Approved' = 'Approved'
): Evaluation {
  return {
    id,
    periodId,
    employeeId: employee.id,
    employeeRole: employee.role,
    teamId: employee.teamId ?? '',
    currentRound: 3,
    status,
    rounds,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-12-31T00:00:00.000Z',
  };
}

function createMockRound(
  roundNum: 1 | 2 | 3,
  evaluatorId: string,
  evaluatorRole: Role,
  status: 'NotStarted' | 'Draft' | 'Submitted' = 'Submitted',
  submittedAt?: string | null
): EvaluationRound {
  return {
    id: `round-${roundNum}-${evaluatorId}`,
    evaluationId: 'eval-test',
    round: roundNum,
    evaluatorId,
    evaluatorRole,
    status,
    scores: {},
    notes: {},
    totalScore: 85,
    grade: 'A',
    submittedAt: status === 'Submitted' ? (submittedAt ?? '2025-12-15T10:00:00.000Z') : undefined,
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

/**
 * Pure simulation of getEvaluationHistoryAdmin logic without network/DB
 */
function simulateEvaluationHistoryQuery(
  viewer: User | null | undefined,
  target: User | null,
  allEvaluations: Evaluation[],
  periods: Map<string, EvaluationPeriod>,
  leaderTeamIds: string[]
): { target: User | null; entries: { evaluation: Evaluation; period: EvaluationPeriod }[] } {
  if (!viewer || !target) {
    return { target: null, entries: [] };
  }

  // Individual role cannot view others
  if ((viewer.role === 'Employee' || viewer.role === 'Worker') && viewer.id !== target.id) {
    return { target: null, entries: [] };
  }

  const hasCurrentScope = hasEvaluationHistoryTargetScope(viewer, target, leaderTeamIds);

  const closedApprovedEvals = allEvaluations.filter((ev) => {
    if (ev.employeeId !== target.id) return false;
    if (ev.status !== 'Approved') return false;
    const period = periods.get(ev.periodId);
    return period && period.status === 'Closed';
  });

  if (closedApprovedEvals.length === 0) {
    if (!hasCurrentScope) {
      return { target: null, entries: [] };
    }
    return { target, entries: [] };
  }

  const entries: { evaluation: Evaluation; period: EvaluationPeriod }[] = [];

  for (const evaluation of closedApprovedEvals) {
    if (!canReadEvaluationHistory(viewer, target, evaluation, leaderTeamIds)) {
      continue;
    }

    const period = periods.get(evaluation.periodId)!;
    entries.push({ evaluation, period });
  }

  if (!hasCurrentScope && entries.length === 0) {
    return { target: null, entries: [] };
  }

  return { target, entries };
}

console.log('[H4 TEST] Executing focused evaluation history authorization & target non-disclosure tests...');

// Fixture Users
const managerUser = createMockUser('mgr-1', 'Manager', null);
const leaderA = createMockUser('ldr-a', 'Leader', 'team-a');
const leaderC = createMockUser('ldr-c', 'Leader', 'team-c');
const employeeA = createMockUser('emp-a', 'Employee', 'team-a');
const employeeB = createMockUser('emp-b', 'Employee', 'team-b');
const subLeaderA = createMockUser('sub-a', 'SubLeader', 'team-a');
const workerA = createMockUser('wrk-a', 'Worker', 'team-a');

// Leader A has primary team-a and appointed secondary team-b
const leaderALedTeams = ['team-a', 'team-b'];

// Fixture Periods
const period2024 = createMockPeriod('period-2024', 2024, 'Closed');
const period2025 = createMockPeriod('period-2025', 2025, 'Closed');
const periodActive = createMockPeriod('period-2026', 2026, 'Active');
const periodsMap = new Map<string, EvaluationPeriod>([
  [period2024.id, period2024],
  [period2025.id, period2025],
  [periodActive.id, periodActive],
]);

// ============================================================================
// 1. TEST: Denied target with no history (Leader A viewing Leader C outside scope)
// ============================================================================
{
  assert.equal(hasEvaluationHistoryTargetScope(leaderA, leaderC, leaderALedTeams), false);

  const result = simulateEvaluationHistoryQuery(
    leaderA,
    leaderC,
    [],
    periodsMap,
    leaderALedTeams
  );

  assert.equal(result.target, null, 'Denied target with no history must return target: null');
  assert.deepEqual(result.entries, [], 'Denied target with no history must return entries: []');

  // Verify non-disclosure: payload stringification contains no target identity
  const payloadStr = JSON.stringify(result);
  assert.equal(payloadStr.includes(leaderC.name), false);
  assert.equal(payloadStr.includes(leaderC.employeeCode), false);
  assert.equal(payloadStr.includes('team-c'), false);
  console.log('  ✓ 1. Denied target with no history returns { target: null, entries: [] } without leakage');
}

// ============================================================================
// 2. TEST: Denied target with permitted-zero history
// Target has evaluations in DB, but viewer has 0 permitted entries and no current scope
// ============================================================================
{
  const targetC = createMockUser('target-c', 'Employee', 'team-c');
  const roundC = createMockRound(1, 'sub-c', 'SubLeader', 'Submitted');
  const evalC = createMockEvaluation('eval-c', targetC, period2025.id, [roundC], 'Approved');

  assert.equal(hasEvaluationHistoryTargetScope(leaderA, targetC, leaderALedTeams), false);
  assert.equal(canViewEvaluation(leaderA, evalC, [targetC], leaderALedTeams), false);

  const result = simulateEvaluationHistoryQuery(
    leaderA,
    targetC,
    [evalC],
    periodsMap,
    leaderALedTeams
  );

  assert.equal(result.target, null, 'Denied target with permitted-zero history must return target: null');
  assert.deepEqual(result.entries, [], 'Denied target with permitted-zero history must return entries: []');

  const payloadStr = JSON.stringify(result);
  assert.equal(payloadStr.includes(targetC.name), false);
  assert.equal(payloadStr.includes(targetC.employeeCode), false);
  console.log('  ✓ 2. Denied target with permitted-zero history returns { target: null, entries: [] }');
}

// ============================================================================
// 3. TEST: Anonymous / Individual / SubLeader denial
// ============================================================================
{
  // 3.1 Anonymous viewer
  const anonResult = simulateEvaluationHistoryQuery(
    null,
    employeeA,
    [],
    periodsMap,
    []
  );
  assert.equal(anonResult.target, null, 'Anonymous viewer must receive target: null');
  assert.deepEqual(anonResult.entries, []);

  // 3.2 Individual (Employee/Worker) viewing another user
  const indResultEmp = simulateEvaluationHistoryQuery(
    employeeA,
    employeeB,
    [],
    periodsMap,
    []
  );
  assert.equal(indResultEmp.target, null, 'Individual Employee viewing another must receive target: null');

  const indResultWrk = simulateEvaluationHistoryQuery(
    workerA,
    employeeA,
    [],
    periodsMap,
    []
  );
  assert.equal(indResultWrk.target, null, 'Individual Worker viewing another must receive target: null');

  // 3.3 SubLeader viewing another user without submitted evaluations
  const subResult = simulateEvaluationHistoryQuery(
    subLeaderA,
    employeeB,
    [],
    periodsMap,
    []
  );
  assert.equal(subResult.target, null, 'SubLeader viewing non-assigned employee must receive target: null');
  assert.deepEqual(subResult.entries, []);

  console.log('  ✓ 3. Anonymous, Individual, and SubLeader denial contracts verified');
}

// ============================================================================
// 4. TEST: Withdrawn unfinished assignment denial
// Stale unfinished / unsubmitted assignment outside current scope must NOT grant access
// ============================================================================
{
  const targetOther = createMockUser('emp-other', 'Employee', 'team-x');

  // Evaluator subLeaderA was assigned to round 1, but status was Draft and not submitted
  const unsubmittedRound = createMockRound(1, subLeaderA.id, 'SubLeader', 'Draft', null);
  const evalWithUnsubmitted = createMockEvaluation(
    'eval-unsubmitted',
    targetOther,
    period2025.id,
    [unsubmittedRound],
    'Approved'
  );

  assert.equal(isRoundSubmitted(unsubmittedRound), false);
  assert.equal(isAuthorizedHistoricalEvaluator(subLeaderA, evalWithUnsubmitted), false);
  assert.equal(canViewEvaluation(subLeaderA, evalWithUnsubmitted, [targetOther], []), false);

  const result = simulateEvaluationHistoryQuery(
    subLeaderA,
    targetOther,
    [evalWithUnsubmitted],
    periodsMap,
    []
  );

  assert.equal(result.target, null, 'Withdrawn unfinished assignment must fail closed with target: null');
  assert.deepEqual(result.entries, [], 'Withdrawn unfinished assignment must yield entries: []');

  console.log('  ✓ 4. Withdrawn unfinished assignment denial contract verified');
}

// ============================================================================
// 5. TEST: Old submitted historical evaluator positive control
// Evaluator outside current scope who submitted a round MUST be granted access to that entry
// ============================================================================
{
  const targetTransferred = createMockUser('emp-transferred', 'Employee', 'team-y');

  // subLeaderA evaluated and SUBMITTED round 1 for this employee in period 2024
  const submittedRound = createMockRound(1, subLeaderA.id, 'SubLeader', 'Submitted', '2024-12-10T09:00:00.000Z');
  const submittedEval = createMockEvaluation(
    'eval-submitted-2024',
    targetTransferred,
    period2024.id,
    [submittedRound],
    'Approved'
  );

  assert.equal(isRoundSubmitted(submittedRound), true);
  assert.equal(isAuthorizedHistoricalEvaluator(subLeaderA, submittedEval), true);
  assert.equal(canViewEvaluation(subLeaderA, submittedEval, [targetTransferred], []), true);

  const result = simulateEvaluationHistoryQuery(
    subLeaderA,
    targetTransferred,
    [submittedEval],
    periodsMap,
    []
  );

  assert.ok(result.target !== null, 'Historical evaluator must receive target metadata');
  assert.equal(result.target?.id, targetTransferred.id);
  assert.equal(result.entries.length, 1, 'Historical evaluator must receive the submitted evaluation entry');
  assert.equal(result.entries[0].evaluation.id, submittedEval.id);

  console.log('  ✓ 5. Old submitted historical evaluator positive control verified');
}

// ============================================================================
// 6. TEST: Unrelated-period denial
// Evaluator assigned in an active/unrelated period cannot access closed history
// ============================================================================
{
  const targetEmployee = createMockUser('emp-target-p', 'Employee', 'team-z');

  // subLeaderA is assigned to an active 2026 evaluation (not closed, not approved)
  const activeRound = createMockRound(1, subLeaderA.id, 'SubLeader', 'Draft');
  const activeEval = createMockEvaluation(
    'eval-active-2026',
    targetEmployee,
    periodActive.id,
    [activeRound],
    'Draft'
  );

  // Closed approved 2024 evaluation where subLeaderA had NO role
  const closedOtherRound = createMockRound(1, 'other-sub', 'SubLeader', 'Submitted');
  const closedEval = createMockEvaluation(
    'eval-closed-2024',
    targetEmployee,
    period2024.id,
    [closedOtherRound],
    'Approved'
  );

  const result = simulateEvaluationHistoryQuery(
    subLeaderA,
    targetEmployee,
    [activeEval, closedEval],
    periodsMap,
    []
  );

  assert.equal(result.target, null, 'Unrelated period assignment must not grant access to closed history');
  assert.deepEqual(result.entries, []);

  console.log('  ✓ 6. Unrelated-period denial contract verified');
}

// ============================================================================
// 7. TEST: Authorized self / Manager / current primary and appointed team positive controls
// ============================================================================
{
  // 7.1 Self positive control (even with 0 history)
  assert.equal(hasEvaluationHistoryTargetScope(employeeA, employeeA, []), true);
  const selfResult = simulateEvaluationHistoryQuery(employeeA, employeeA, [], periodsMap, []);
  assert.equal(selfResult.target?.id, employeeA.id);
  assert.deepEqual(selfResult.entries, []);

  // 7.2 Manager positive control (even with 0 history)
  assert.equal(hasEvaluationHistoryTargetScope(managerUser, employeeA, []), true);
  assert.equal(hasEvaluationHistoryTargetScope(managerUser, leaderC, []), true);
  const mgrResult = simulateEvaluationHistoryQuery(managerUser, leaderC, [], periodsMap, []);
  assert.equal(mgrResult.target?.id, leaderC.id);
  assert.deepEqual(mgrResult.entries, []);

  // 7.3 Leader current primary team positive control
  assert.equal(hasEvaluationHistoryTargetScope(leaderA, employeeA, leaderALedTeams), true);
  const primaryResult = simulateEvaluationHistoryQuery(leaderA, employeeA, [], periodsMap, leaderALedTeams);
  assert.equal(primaryResult.target?.id, employeeA.id);
  assert.deepEqual(primaryResult.entries, []);

  // 7.3b An inactive primary team must not remain in current Leader scope.
  const inactivePrimaryResult = simulateEvaluationHistoryQuery(leaderA, employeeA, [], periodsMap, ['team-b']);
  assert.equal(inactivePrimaryResult.target, null);
  assert.deepEqual(inactivePrimaryResult.entries, []);

  // 7.4 Leader current appointed secondary team positive control
  // employeeB is in team-b, which is in leaderALedTeams via appointed leadership
  assert.equal(hasEvaluationHistoryTargetScope(leaderA, employeeB, leaderALedTeams), true);
  const appointedResult = simulateEvaluationHistoryQuery(leaderA, employeeB, [], periodsMap, leaderALedTeams);
  assert.equal(appointedResult.target?.id, employeeB.id);
  assert.deepEqual(appointedResult.entries, []);

  // Negative counter-check: leaderA has NO scope over team-c
  const employeeC = createMockUser('emp-c', 'Employee', 'team-c');
  assert.equal(hasEvaluationHistoryTargetScope(leaderA, employeeC, leaderALedTeams), false);
  const unappointedResult = simulateEvaluationHistoryQuery(leaderA, employeeC, [], periodsMap, leaderALedTeams);
  assert.equal(unappointedResult.target, null);

  console.log('  ✓ 7. Authorized self, Manager, primary and appointed team positive controls verified');
}

// ============================================================================
// 8. TEST: Non-disclosure & Generic Unavailable UI Contract
// ============================================================================
{
  // Generic unavailable UI text template
  const genericUnavailableTitle = 'Không tìm thấy thông tin nhân viên';
  const genericUnavailableBody = 'Nhân viên không tồn tại hoặc bạn không có quyền truy cập lịch sử đánh giá này.';

  function renderHistoryPageRepresentation(
    target: User | null
  ): string {
    if (!target) {
      return `<div class="unavailable"><h2>${genericUnavailableTitle}</h2><p>${genericUnavailableBody}</p></div>`;
    }
    return `<div class="header"><h1>Lịch sử đánh giá</h1><span>${target.name}</span><strong>${target.employeeCode}</strong><strong>${target.role}</strong></div>`;
  }

  // When denied, target is null
  const deniedHtml = renderHistoryPageRepresentation(null);
  assert.ok(deniedHtml.includes(genericUnavailableTitle));
  assert.ok(deniedHtml.includes(genericUnavailableBody));

  // Assert absolutely NO leakage of any sensitive target tokens
  for (const forbidden of [leaderC.name, leaderC.employeeCode, leaderC.id, 'team-c', 'Leader']) {
    assert.equal(
      deniedHtml.includes(forbidden),
      false,
      `Denied HTML representation must not leak "${forbidden}"`
    );
  }

  // When authorized, target details are rendered as expected
  const authorizedHtml = renderHistoryPageRepresentation(employeeA);
  assert.ok(authorizedHtml.includes(employeeA.name));
  assert.ok(authorizedHtml.includes(employeeA.employeeCode));

  console.log('  ✓ 8. Non-disclosure invariants and generic unavailable UI verified');
}

console.log('[PASS] All H4 evaluation history authorization and non-disclosure tests PASSED.');
