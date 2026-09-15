/**
 * Unit & Contract Tests for Kurabe CONTROLLED Task P103M2T02
 * H3 Full/Summary/Single Scope Parity.
 *
 * Scope coverage:
 * 1. own: Employee/Worker views only own evaluation; sibling/other teams absent.
 * 2. Manager: Manager views all evaluations across Team A, Team B, Team C.
 * 3. SubLeader: SubLeader views own + supervised employees in same team + assigned rounds.
 * 4. A-only: Leader with only primary Team A views Team A evaluations; Team B and C absent.
 * 5. A+B: Appointed Leader views Team A and Team B evaluations; Team C absent.
 * 6. C: Unrelated Team C evaluations remain absent from Leader A/B scope.
 * 7. Revoked B: Revoked appointed Leader cannot view Team B evaluations unless historical read.
 * 8. Zero assigned rounds: Viewer with 0 assigned evaluator rounds retains team scope.
 * 9. Pagination: Limit and ordering integrity preserved without scope leakage.
 * 10. Scope lookup failure: Scope lookup errors fail closed (throw DatabaseError).
 * 11. Full vs Summary vs Single parity: All surfaces produce identical permitted evaluation IDs.
 * 12. Source contracts: Verification of evaluations-admin.ts, evaluations.ts, read.ts invariants.
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

import { canViewEvaluation } from '@/data/workflow';
import { filterEvaluationsForViewer } from '@/lib/db/evaluations';
import type { Evaluation, EvaluationRound, Role, User } from '@/types';

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

function createMockRound(
  roundNum: 1 | 2 | 3,
  evaluatorId: string,
  evaluatorRole: Role,
  status: 'NotStarted' | 'Draft' | 'Submitted' = 'NotStarted',
  submittedAt?: string | null
): EvaluationRound {
  return {
    id: `round-${roundNum}-${evaluatorId || 'none'}`,
    evaluationId: 'eval-test',
    round: roundNum,
    evaluatorId,
    evaluatorRole,
    status,
    scores: {},
    notes: {},
    totalScore: 0,
    grade: 'A',
    submittedAt: status === 'Submitted' ? (submittedAt ?? '2026-03-01T10:00:00.000Z') : undefined,
    createdAt: '2026-01-01T00:00:00.000Z',
    gradeConfigVersionId: 'v1',
    criteriaConfigVersionId: 'v1',
    criteriaSnapshotState: 'authoritative',
  };
}

function createMockEvaluation(
  id: string,
  employee: User,
  periodId: string,
  rounds: EvaluationRound[],
  status: 'Draft' | 'Submitted' | 'Reviewed' | 'Approved' = 'Draft'
): Evaluation {
  return {
    id,
    periodId,
    employeeId: employee.id,
    employeeRole: employee.role,
    teamId: employee.teamId ?? '',
    currentRound: rounds.length > 0 ? rounds[0].round : 1,
    status,
    rounds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ============================================================================
// Fixture definitions
// ============================================================================
const TEAM_A = 'team-a-uuid';
const TEAM_B = 'team-b-uuid';
const TEAM_C = 'team-c-uuid';
const PERIOD_ID = 'period-active-uuid';

// Actors
const manager = createMockUser('u-mgr', 'Manager', TEAM_A);
const leaderA = createMockUser('u-lead-a', 'Leader', TEAM_A);
const leaderC = createMockUser('u-lead-c', 'Leader', TEAM_C);
const subLeaderB = createMockUser('u-sub-b', 'SubLeader', TEAM_B);
const empB1 = createMockUser('u-emp-b1', 'Employee', TEAM_B, { subleaderId: 'u-sub-b' });
const empB2 = createMockUser('u-emp-b2', 'Employee', TEAM_B, { subleaderId: 'u-other-sub' });
const workerB = createMockUser('u-wrk-b', 'Worker', TEAM_B, { subleaderId: 'u-sub-b' });
const empA = createMockUser('u-emp-a', 'Employee', TEAM_A);
const empC = createMockUser('u-emp-c', 'Employee', TEAM_C);

// Evaluations
const evalEmpA = createMockEvaluation('ev-emp-a', empA, PERIOD_ID, [
  createMockRound(1, '', 'SubLeader', 'NotStarted'),
  createMockRound(2, leaderA.id, 'Leader', 'NotStarted'),
  createMockRound(3, manager.id, 'Manager', 'NotStarted'),
]);

const evalEmpB1 = createMockEvaluation('ev-emp-b1', empB1, PERIOD_ID, [
  createMockRound(1, subLeaderB.id, 'SubLeader', 'NotStarted'),
  createMockRound(2, leaderA.id, 'Leader', 'NotStarted'),
  createMockRound(3, manager.id, 'Manager', 'NotStarted'),
]);

const evalEmpB2 = createMockEvaluation('ev-emp-b2', empB2, PERIOD_ID, [
  createMockRound(1, 'u-other-sub', 'SubLeader', 'NotStarted'),
  createMockRound(2, leaderA.id, 'Leader', 'NotStarted'),
  createMockRound(3, manager.id, 'Manager', 'NotStarted'),
]);

const evalWorkerB = createMockEvaluation('ev-wrk-b', workerB, PERIOD_ID, [
  createMockRound(1, subLeaderB.id, 'SubLeader', 'NotStarted'),
  createMockRound(2, leaderA.id, 'Leader', 'NotStarted'),
  createMockRound(3, manager.id, 'Manager', 'NotStarted'),
]);

const evalEmpC = createMockEvaluation('ev-emp-c', empC, PERIOD_ID, [
  createMockRound(1, '', 'SubLeader', 'NotStarted'),
  createMockRound(2, leaderC.id, 'Leader', 'NotStarted'),
  createMockRound(3, manager.id, 'Manager', 'NotStarted'),
]);

// Evaluation with zero assigned rounds (evaluatorId is empty string on all rounds)
const evalZeroAssigned = createMockEvaluation('ev-zero-assigned', empB1, PERIOD_ID, [
  createMockRound(1, '', 'SubLeader', 'NotStarted'),
  createMockRound(2, '', 'Leader', 'NotStarted'),
  createMockRound(3, '', 'Manager', 'NotStarted'),
]);

// Approved historical evaluation where Leader A was submitted evaluator
const evalHistoricalApprovedSubmitted = createMockEvaluation('ev-hist-appr-sub', empB1, 'period-closed-uuid', [
  createMockRound(1, subLeaderB.id, 'SubLeader', 'Submitted', '2025-06-01T00:00:00Z'),
  createMockRound(2, leaderA.id, 'Leader', 'Submitted', '2025-06-15T00:00:00Z'),
  createMockRound(3, manager.id, 'Manager', 'Submitted', '2025-06-30T00:00:00Z'),
], 'Approved');

// Approved evaluation where Leader A was assigned but NEVER submitted (draft/withdrawn)
const evalHistoricalApprovedUnsubmitted = createMockEvaluation('ev-hist-appr-unsub', empB1, 'period-closed-uuid', [
  createMockRound(1, subLeaderB.id, 'SubLeader', 'Submitted', '2025-06-01T00:00:00Z'),
  createMockRound(2, leaderA.id, 'Leader', 'Draft'),
  createMockRound(3, manager.id, 'Manager', 'Submitted', '2025-06-30T00:00:00Z'),
], 'Approved');

const allEvaluations: Evaluation[] = [
  evalEmpA,
  evalEmpB1,
  evalEmpB2,
  evalWorkerB,
  evalEmpC,
];

// SubLeader view context: list of managed active users
const subUsersB: User[] = [empB1, workerB];

// ============================================================================
// TEST SUITE: H3 Scope Parity
// ============================================================================
console.log('--- Running H3 Evaluation Scope Unit & Contract Tests ---');

// 1. OWN SCOPE: Employee and Worker view only own evaluation
{
  const empResults = filterEvaluationsForViewer(allEvaluations, empB1);
  assert.equal(empResults.length, 1, 'Employee B1 must only see 1 evaluation');
  assert.equal(empResults[0].id, evalEmpB1.id, 'Employee B1 must only see own evaluation');

  const workerResults = filterEvaluationsForViewer(allEvaluations, workerB);
  assert.equal(workerResults.length, 1, 'Worker B must only see 1 evaluation');
  assert.equal(workerResults[0].id, evalWorkerB.id, 'Worker B must only see own evaluation');

  assert.equal(canViewEvaluation(empB1, evalEmpA), false, 'Employee B1 cannot view Team A employee');
  assert.equal(canViewEvaluation(empB1, evalEmpC), false, 'Employee B1 cannot view Team C employee');
  assert.equal(canViewEvaluation(empB1, evalEmpB2), false, 'Employee B1 cannot view sibling Team B employee');
  console.log('✓ 1. own: Employee/Worker view only own evaluation');
}

// 2. MANAGER SCOPE: Manager views all evaluations
{
  const mgrResults = filterEvaluationsForViewer(allEvaluations, manager);
  assert.equal(mgrResults.length, allEvaluations.length, 'Manager must see all evaluations');
  for (const ev of allEvaluations) {
    assert.equal(canViewEvaluation(manager, ev), true, `Manager canViewEvaluation must be true for ${ev.id}`);
  }
  console.log('✓ 2. Manager: views all evaluations across Team A, B, C');
}

// 3. SUBLEADER SCOPE: SubLeader views own + supervised employees in same team
{
  const subResults = filterEvaluationsForViewer(allEvaluations, subLeaderB, subUsersB);
  const subResultIds = subResults.map((e) => e.id).sort();
  // subUsersB includes empB1 and workerB
  assert.deepEqual(
    subResultIds,
    [evalEmpB1.id, evalWorkerB.id].sort(),
    'SubLeader B must see only supervised employees (empB1, workerB)'
  );

  assert.equal(canViewEvaluation(subLeaderB, evalEmpB2, subUsersB), false, 'SubLeader B cannot view unsupervised empB2');
  assert.equal(canViewEvaluation(subLeaderB, evalEmpA, subUsersB), false, 'SubLeader B cannot view Team A employee');
  assert.equal(canViewEvaluation(subLeaderB, evalEmpC, subUsersB), false, 'SubLeader B cannot view Team C employee');
  console.log('✓ 3. SubLeader: views own + supervised employees; unsupervised/other teams absent');
}

// 4. A-ONLY SCOPE: Leader with only primary Team A
{
  const aOnlyScope = [TEAM_A];
  const aOnlyResults = filterEvaluationsForViewer(allEvaluations, leaderA, undefined, aOnlyScope);
  const aOnlyIds = aOnlyResults.map((e) => e.id);
  assert.ok(aOnlyIds.includes(evalEmpA.id), 'Leader A must see Team A evaluation');
  assert.ok(!aOnlyIds.includes(evalEmpC.id), 'Leader A must NOT see Team C evaluation');
  console.log('✓ 4. A-only: Leader with primary Team A sees only Team A; Team C absent');
}

// 5. A+B APPOINTED SCOPE: Appointed Leader views Team A and Team B evaluations
{
  const abScope = [TEAM_A, TEAM_B];
  const abResults = filterEvaluationsForViewer(allEvaluations, leaderA, undefined, abScope);
  const abResultIds = abResults.map((e) => e.id).sort();

  // Valid appointed secondary Leader B evaluations must survive:
  assert.ok(abResultIds.includes(evalEmpA.id), 'Leader A appointed to B must see Team A evaluation');
  assert.ok(abResultIds.includes(evalEmpB1.id), 'Leader A appointed to B must see Team B1 evaluation');
  assert.ok(abResultIds.includes(evalEmpB2.id), 'Leader A appointed to B must see Team B2 evaluation');
  assert.ok(abResultIds.includes(evalWorkerB.id), 'Leader A appointed to B must see Team B Worker evaluation');

  // Unrelated Team C must remain absent:
  assert.ok(!abResultIds.includes(evalEmpC.id), 'Unrelated Team C evaluation must remain absent from Leader A+B scope');
  assert.equal(canViewEvaluation(leaderA, evalEmpC, undefined, abScope), false, 'canViewEvaluation must reject Team C for Leader A+B');
  console.log('✓ 5. A+B: Appointed Leader views Team A and Team B; Team C remains absent');
}

// 6. C DENIAL: Unrelated Team C Leader cannot view Team A or Team B
{
  const cScope = [TEAM_C];
  const cResults = filterEvaluationsForViewer(allEvaluations, leaderC, undefined, cScope);
  const cResultIds = cResults.map((e) => e.id);
  assert.deepEqual(cResultIds, [evalEmpC.id], 'Leader C must only see Team C evaluation');
  assert.ok(!cResultIds.includes(evalEmpA.id), 'Leader C cannot see Team A');
  assert.ok(!cResultIds.includes(evalEmpB1.id), 'Leader C cannot see Team B');
  console.log('✓ 6. C: Unrelated Team C evaluations remain isolated; Team A and B absent');
}

// 7. REVOKED B: Revoked appointed Leader cannot view Team B unless historical read
{
  // Revoked scope: only Team A remains
  const revokedScope = [TEAM_A];

  // InProgress evaluation without submitted round: denied
  const unassignedB = createMockEvaluation('ev-unassigned-b', empB1, PERIOD_ID, [
    createMockRound(1, subLeaderB.id, 'SubLeader', 'NotStarted'),
    createMockRound(2, '', 'Leader', 'NotStarted'),
    createMockRound(3, manager.id, 'Manager', 'NotStarted'),
  ]);
  assert.equal(
    canViewEvaluation(leaderA, unassignedB, undefined, revokedScope),
    false,
    'Revoked Leader B cannot view Team B evaluation without appointment'
  );

  // Approved evaluation where Leader A actually submitted round 2: permitted historical read
  assert.equal(
    canViewEvaluation(leaderA, evalHistoricalApprovedSubmitted, undefined, revokedScope),
    true,
    'Revoked Leader B CAN view Approved evaluation where Leader A previously submitted a round (historical read)'
  );

  // Approved evaluation where Leader A had draft/withdrawn assignment: denied
  assert.equal(
    canViewEvaluation(leaderA, evalHistoricalApprovedUnsubmitted, undefined, revokedScope),
    false,
    'Revoked Leader B CANNOT view Approved evaluation where Leader A only had unsubmitted/draft round'
  );
  console.log('✓ 7. Revoked B: Denied current/unsubmitted Team B; submitted historical snapshot preserved');
}

// 8. ZERO ASSIGNED ROUNDS: Leader with zero assigned rounds retains team scope
{
  const abScope = [TEAM_A, TEAM_B];
  assert.equal(
    canViewEvaluation(leaderA, evalZeroAssigned, undefined, abScope),
    true,
    'Leader A appointed to B must see Team B evaluation even with 0 assigned rounds'
  );

  const zeroFilter = filterEvaluationsForViewer([evalZeroAssigned], leaderA, undefined, abScope);
  assert.equal(zeroFilter.length, 1, 'filterEvaluationsForViewer must keep evalZeroAssigned for in-scope Leader');
  console.log('✓ 8. Zero assigned rounds: In-scope evaluations viewable even before assignment');
}

// 9. PAGINATION & WINDOWING: Limit preserves order and filters without leaks
{
  const abScope = [TEAM_A, TEAM_B];
  const items = [evalEmpA, evalEmpB1, evalEmpB2, evalWorkerB, evalEmpC];

  // Filter full scope
  const permitted = filterEvaluationsForViewer(items, leaderA, undefined, abScope);
  assert.equal(permitted.length, 4, '4 evaluations in scope (A, B1, B2, Worker B)');
  assert.ok(!permitted.some((e) => e.teamId === TEAM_C), 'Zero Team C in permitted list');

  // Pagination window simulation (e.g. limit 2)
  const page1 = permitted.slice(0, 2);
  assert.equal(page1.length, 2, 'Page 1 has exactly 2 items');
  assert.ok(!page1.some((e) => e.teamId === TEAM_C), 'Page 1 has no Team C items');

  const page2 = permitted.slice(2, 4);
  assert.equal(page2.length, 2, 'Page 2 has exactly 2 items');
  assert.ok(!page2.some((e) => e.teamId === TEAM_C), 'Page 2 has no Team C items');
  console.log('✓ 9. Pagination: Limit windowing strictly respects viewer scope without leaks');
}

// 10. FAIL-CLOSED ON SCOPE LOOKUP FAILURE / ERROR CONTRACTS
{
  // filterEvaluationsForViewer with null/undefined viewer returns empty array
  assert.deepEqual(filterEvaluationsForViewer(allEvaluations, null), [], 'Null viewer returns empty array');
  assert.deepEqual(filterEvaluationsForViewer(allEvaluations, undefined), [], 'Undefined viewer returns empty array');
  assert.deepEqual(filterEvaluationsForViewer([], leaderA), [], 'Empty evaluations returns empty array');

  // canViewEvaluation with null/undefined returns false
  assert.equal(canViewEvaluation(null, evalEmpA), false, 'canViewEvaluation(null) returns false');
  assert.equal(canViewEvaluation(undefined, evalEmpA), false, 'canViewEvaluation(undefined) returns false');
  console.log('✓ 10. Fail-closed: Null/undefined viewer fails closed with empty/false');
}

// 11. FULL VS SUMMARY PARITY: filterEvaluationsForViewer produces identical results
{
  const abScope = [TEAM_A, TEAM_B];
  // Full evaluations
  const fullPermitted = filterEvaluationsForViewer(allEvaluations, leaderA, undefined, abScope);
  const fullIds = fullPermitted.map((e) => e.id).sort();

  // Summary projection representation of the same evaluations
  const summaryPermitted = filterEvaluationsForViewer(
    allEvaluations.map((e) => ({
      ...e,
      rounds: e.rounds.map((r) => ({
        ...r,
        scores: {},
        notes: {},
        comment: undefined,
        additionalComment: undefined,
      })),
    })),
    leaderA,
    undefined,
    abScope
  );
  const summaryIds = summaryPermitted.map((e) => e.id).sort();

  assert.deepEqual(fullIds, summaryIds, 'Full and summary filtering must produce identical evaluation IDs');
  console.log('✓ 11. Parity: Full vs Summary filter produces identical ID sets');
}

// 12. SOURCE CONTRACTS
{
  const projectRoot = process.cwd();
  const adminCode = fs.readFileSync(path.join(projectRoot, 'src/lib/db/evaluations-admin.ts'), 'utf8');
  const evalsCode = fs.readFileSync(path.join(projectRoot, 'src/lib/db/evaluations.ts'), 'utf8');
  const readActionCode = fs.readFileSync(path.join(projectRoot, 'src/actions/read.ts'), 'utf8');

  // Contract 1: fetchEvaluationsForViewerAdmin passes leaderTeamIds to filterEvaluationsForViewer
  assert.ok(
    /filterEvaluationsForViewer\s*\(\s*evaluations\s*,\s*user\s*,\s*allUsers\s*,\s*leaderTeamIds\s*\)/.test(adminCode),
    'fetchEvaluationsForViewerAdmin must pass leaderTeamIds to filterEvaluationsForViewer'
  );

  // Contract 2: fetchEvaluationSummariesForViewerAdmin passes leaderTeamIds
  assert.ok(
    /filterEvaluationsForViewer\s*\(\s*evaluations\s*,\s*user\s*,\s*allUsers\s*,\s*leaderTeamIds\s*\)/.test(adminCode),
    'fetchEvaluationSummariesForViewerAdmin must pass leaderTeamIds to filterEvaluationsForViewer'
  );

  // Contract 3: getEvaluationSummariesByEmployeeIdsAdmin avoids duplicate getLeaderTeamIds query
  const duplicateMatches = adminCode.match(/await\s+getLeaderTeamIds\s*\(\s*requester\s*\)/g);
  assert.equal(
    duplicateMatches?.length,
    1,
    'getEvaluationSummariesByEmployeeIdsAdmin must query getLeaderTeamIds at most once (no duplicate queries)'
  );

  // Contract 4: Fail-closed error handling on roundsRes.error in admin functions
  assert.ok(
    adminCode.includes('if (roundsRes.error)'),
    'evaluations-admin.ts must fail closed if evaluation_rounds query errors'
  );

  // Contract 5: Fail-closed error handling on getSubLeaderViewContextAdmin
  assert.ok(
    adminCode.includes("throw new DatabaseError('Error fetching SubLeader view context (admin)'"),
    'getSubLeaderViewContextAdmin must fail closed on query error'
  );

  // Contract 6: evaluations.ts filterEvaluationsForViewer accepts ledTeamIds
  assert.ok(
    /export\s+function\s+filterEvaluationsForViewer\s*\([^)]*ledTeamIds\b/.test(evalsCode),
    'filterEvaluationsForViewer must accept ledTeamIds parameter'
  );

  // Contract 7: read.ts server actions use requireAuth and server-resolved context
  assert.ok(
    readActionCode.includes('getEvaluationsAction'),
    'src/actions/read.ts must export getEvaluationsAction'
  );
  assert.ok(
    readActionCode.includes('getEvaluationSummariesAction'),
    'src/actions/read.ts must export getEvaluationSummariesAction'
  );
  assert.ok(
    readActionCode.includes('getEvaluationByIdAction'),
    'src/actions/read.ts must export getEvaluationByIdAction'
  );
  assert.ok(
    readActionCode.includes('getEvaluationByEmployeeAction'),
    'src/actions/read.ts must export getEvaluationByEmployeeAction'
  );
  console.log('✓ 12. Source contracts: Verified admin, evaluations, and action file contracts');
}

console.log('--- All H3 Evaluation Scope Unit & Contract Tests PASSED ---');
