import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';

const rootDir = process.cwd();

register(`data:text/javascript,
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/types" || specifier.startsWith("@/types/")) {
    return {
      url: "data:text/javascript,export const Role={};export const Grade={};export const EvalStatus={};export const RoundNumber={};export const User={};export const Evaluation={};export const EvaluationRound={};export const EvaluationAccessState={};export const ViewerScope={};export const Team={};export const EvaluationPeriod={};export const PeriodStatus={};export const EvaluationRoundStatus={};export const buildViewerScopeKey=()=>{};",
      shortCircuit: true,
      format: "module"
    };
  }
  if (specifier === "@/lib/auth") {
    return {
      url: "data:text/javascript,export let mockAuthRoleResult = { error: null, user: { id: 'm-1', role: 'Manager', teamId: 't-1' } }; export function setMockAuth(res) { mockAuthRoleResult = res; }; export const requireRole = async () => mockAuthRoleResult; export const requireAuth = async () => mockAuthRoleResult;",
      shortCircuit: true,
      format: "module"
    };
  }
  if (specifier === "@/lib/db/evaluations-admin") {
    return {
      url: "data:text/javascript,export let mockEvals = []; export let shouldThrow = null; export function setMockEvals(e) { mockEvals = e; }; export function setDbError(err) { shouldThrow = err; }; export const getEvaluationsByPeriodAdmin = async () => { if (shouldThrow) throw shouldThrow; return mockEvals; };",
      shortCircuit: true,
      format: "module"
    };
  }
  if (specifier === "@/lib/db/users-admin") {
    return {
      url: "data:text/javascript,export let mockUsers = []; export function setMockUsers(u) { mockUsers = u; }; export const getUsersAdmin = async () => mockUsers;",
      shortCircuit: true,
      format: "module"
    };
  }
  if (specifier === "@/lib/db/teams-admin") {
    return {
      url: "data:text/javascript,export let mockTeams = [{ id: 't-1', name: 'Team 1', leaderId: 'l-1' }]; export function setMockTeams(t) { mockTeams = t; }; export const getTeamsAdmin = async () => mockTeams;",
      shortCircuit: true,
      format: "module"
    };
  }
  if (specifier === "@/lib/db/criteria") {
    return {
      url: "data:text/javascript,export let mockCrit = [{ code: 'A', criteria: [{ id: 'c-1', levels: [{ points: 10 }, { points: 20 }] }] }]; export const getAllCriteriaGroups = async () => mockCrit;",
      shortCircuit: true,
      format: "module"
    };
  }
  if (specifier.startsWith("@/")) {
    const sub = specifier.slice(2);
    const basePath = path.join(rootDir, "src", sub);
    const candidates = [
      basePath + ".ts",
      basePath + ".tsx",
      path.join(basePath, "index.ts"),
      path.join(basePath, "index.tsx"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return nextResolve(pathToFileURL(c).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
`);

// -------------------------------------------------------------
// Load real implementations
// -------------------------------------------------------------
const {
  canViewEvaluation,
  canReadEvaluationHistory,
  getEvaluationAccessState,
} = await import('../src/data/workflow.ts');

const authMockModule = await import('@/lib/auth');
const evalsMockModule = await import('@/lib/db/evaluations-admin');
const usersMockModule = await import('@/lib/db/users-admin');

const { getReportAggregation } = await import('../src/actions/reports.ts');

console.log('=== P104M1T01 FOCUSED REGRESSION TEST SUITE ===\n');

// =============================================================
// SECTION 1: Finding F09 — In-Progress Evaluation Access & Revoked Leader
// =============================================================
console.log('--- Section 1: Finding F09 (In-Progress Evaluation Access) ---');

{
  // Test 1.1: Revoked Leader with stale unfinished assignment on in-progress evaluation MUST BE DENIED
  const revokedLeader = {
    id: 'leader-revoked',
    name: 'Revoked Leader',
    role: 'Leader',
    teamId: 'team-other', // Primary team changed or not the evaluation team
    isActive: true,
  };

  const targetEmployee = {
    id: 'emp-1',
    name: 'Employee 1',
    role: 'Employee',
    teamId: 'team-target',
    subleaderId: 'sub-1',
  };

  const inProgressEvaluation = {
    id: 'eval-1',
    periodId: 'period-2026',
    employeeId: 'emp-1',
    employeeRole: 'Employee',
    teamId: 'team-target',
    currentRound: 2,
    status: 'Draft', // In-progress
    rounds: [
      {
        round: 1,
        evaluatorId: 'sub-1',
        status: 'Submitted',
        submittedAt: '2026-09-01T00:00:00Z',
        totalScore: 80,
        grade: 'A',
      },
      {
        round: 2,
        evaluatorId: 'leader-revoked', // Stale unfinished evaluator assignment
        status: 'Draft', // Unfinished
        submittedAt: undefined,
        totalScore: 0,
      },
    ],
  };

  const allUsersContext = [targetEmployee, revokedLeader];
  const ledTeamIds = []; // No longer leads 'team-target'!

  const canRead = canViewEvaluation(revokedLeader, inProgressEvaluation, allUsersContext, ledTeamIds);
  assert.strictEqual(
    canRead,
    false,
    'F09 NEGATIVE: Revoked Leader with stale unfinished evaluator assignment must NOT fresh-read an in-progress evaluation'
  );

  const accessState = getEvaluationAccessState(revokedLeader, inProgressEvaluation, allUsersContext, ledTeamIds);
  assert.strictEqual(
    accessState.mode,
    'blocked',
    'F09 NEGATIVE: Access state for revoked Leader must be blocked'
  );
  console.log('  ✓ 1.1 Revoked Leader with stale unfinished assignment denied fresh-read');
}

{
  // Test 1.2: Positive control — Submitted historical evaluator still has read access
  const historicalEvaluator = {
    id: 'leader-historical',
    name: 'Historical Leader',
    role: 'Leader',
    teamId: 'team-other',
    isActive: true,
  };

  const targetEmployee = {
    id: 'emp-2',
    name: 'Employee 2',
    role: 'Employee',
    teamId: 'team-target',
  };

  // Evaluation where historicalEvaluator actually SUBMITTED round 2
  const evaluationWithSubmittedRound = {
    id: 'eval-2',
    periodId: 'period-2026',
    employeeId: 'emp-2',
    employeeRole: 'Employee',
    teamId: 'team-target',
    currentRound: 3,
    status: 'InProgress',
    rounds: [
      {
        round: 1,
        evaluatorId: 'sub-1',
        status: 'Submitted',
        submittedAt: '2026-09-01T00:00:00Z',
        totalScore: 75,
        grade: 'B',
      },
      {
        round: 2,
        evaluatorId: 'leader-historical',
        status: 'Submitted', // Submitted!
        submittedAt: '2026-09-05T00:00:00Z',
        totalScore: 85,
        grade: 'A',
      },
      {
        round: 3,
        evaluatorId: 'manager-1',
        status: 'Draft',
      },
    ],
  };

  const ledTeamIds = []; // revoked from team-target, but submitted round 2 in the past
  const canRead = canViewEvaluation(historicalEvaluator, evaluationWithSubmittedRound, [targetEmployee], ledTeamIds);
  assert.strictEqual(
    canRead,
    true,
    'F09 POSITIVE: Historical evaluator who actually submitted a round must retain read access'
  );

  const canReadHistory = canReadEvaluationHistory(historicalEvaluator, targetEmployee, evaluationWithSubmittedRound, ledTeamIds);
  assert.strictEqual(
    canReadHistory,
    true,
    'F09 POSITIVE: canReadEvaluationHistory must allow historical evaluator with submitted round'
  );
  console.log('  ✓ 1.2 Historical evaluator with submitted round retains read access');
}

{
  // Test 1.3: Positive control — Approved evaluation read by legitimate historical evaluator vs stale unfinished
  const evaluatorSubmitted = { id: 'eval-sub', role: 'Leader', teamId: 'team-x', isActive: true };
  const evaluatorUnfinished = { id: 'eval-unfin', role: 'Leader', teamId: 'team-x', isActive: true };

  const approvedEvaluation = {
    id: 'eval-app',
    periodId: 'period-2026',
    employeeId: 'emp-3',
    employeeRole: 'Employee',
    teamId: 'team-target',
    currentRound: 2,
    status: 'Approved',
    rounds: [
      {
        round: 1,
        evaluatorId: 'eval-sub',
        status: 'Submitted',
        submittedAt: '2026-09-01T00:00:00Z',
      },
      {
        round: 2,
        evaluatorId: 'eval-unfin',
        status: 'Draft', // was never submitted
      },
    ],
  };

  assert.strictEqual(
    canViewEvaluation(evaluatorSubmitted, approvedEvaluation, [], []),
    true,
    'F09 POSITIVE: Evaluator who submitted round can view Approved evaluation'
  );
  assert.strictEqual(
    canViewEvaluation(evaluatorUnfinished, approvedEvaluation, [], []),
    false,
    'F09 NEGATIVE: Stale unfinished evaluator cannot view Approved evaluation'
  );
  console.log('  ✓ 1.3 Approved evaluation permits submitted evaluator, denies unfinished evaluator');
}

{
  // Test 1.4: Active current Leader of the team retains current-team access
  const activeLeader = {
    id: 'leader-active',
    role: 'Leader',
    teamId: 'team-active',
    isActive: true,
  };

  const employee = {
    id: 'emp-active',
    role: 'Employee',
    teamId: 'team-active',
  };

  const draftEvaluation = {
    id: 'eval-draft',
    periodId: 'period-2026',
    employeeId: 'emp-active',
    employeeRole: 'Employee',
    teamId: 'team-active',
    currentRound: 1,
    status: 'Draft',
    rounds: [
      {
        round: 1,
        evaluatorId: 'sub-active',
        status: 'Draft',
      },
    ],
  };

  assert.strictEqual(
    canViewEvaluation(activeLeader, draftEvaluation, [employee], ['team-active']),
    true,
    'F09 POSITIVE: Active current Leader retains current-team read access'
  );
  console.log('  ✓ 1.4 Active current Leader retains current-team read access');
}

{
  // Test 1.5: Positive and Negative Controls across roles
  const manager = { id: 'mgr-1', role: 'Manager', teamId: null, isActive: true };
  const owner = { id: 'emp-target', role: 'Employee', teamId: 't-1', isActive: true };
  const unrelatedEmployee = { id: 'emp-other', role: 'Employee', teamId: 't-2', isActive: true };
  const deactivatedManager = { id: 'mgr-inactive', role: 'Manager', teamId: null, isActive: false };

  const evalTest = {
    id: 'eval-roles',
    periodId: 'p-1',
    employeeId: 'emp-target',
    employeeRole: 'Employee',
    teamId: 't-1',
    currentRound: 1,
    status: 'Draft',
    rounds: [],
  };

  assert.strictEqual(canViewEvaluation(manager, evalTest, [], []), true, 'Manager can view');
  assert.strictEqual(canViewEvaluation(owner, evalTest, [], []), true, 'Self/owner can view');
  assert.strictEqual(canViewEvaluation(unrelatedEmployee, evalTest, [], []), false, 'Unrelated employee cannot view');
  assert.strictEqual(canViewEvaluation(deactivatedManager, evalTest, [], []), false, 'Deactivated user cannot view');
  assert.strictEqual(canViewEvaluation(null, evalTest, [], []), false, 'Null user cannot view');
  console.log('  ✓ 1.5 Positive and negative role controls verified (Manager, Owner, Other, Inactive)');
}

// =============================================================
// SECTION 2: Finding F05 — Report Failures vs Truthful Empty State & Score 0
// =============================================================
console.log('\n--- Section 2: Finding F05 (Report Failures vs Truthful Empty State) ---');

{
  // Test 2.1: Auth failure in getReportAggregation must throw explicit Error
  authMockModule.setMockAuth({ error: 'Chưa đăng nhập', user: null });
  await assert.rejects(
    async () => {
      await getReportAggregation('period-1');
    },
    /Chưa đăng nhập|Unauthorized/i,
    'F05: Auth failure in getReportAggregation must throw explicit Error instead of returning null'
  );
  console.log('  ✓ 2.1 Auth failure throws explicit Error (does not collapse to empty null)');

  // Reset auth to Manager for remaining tests
  authMockModule.setMockAuth({ error: null, user: { id: 'm-1', role: 'Manager', teamId: 't-1' } });
}

{
  // Test 2.2: DB failure in getReportAggregation must throw explicit Error
  evalsMockModule.setDbError(new Error('Connection terminated unexpectedly'));
  await assert.rejects(
    async () => {
      await getReportAggregation('period-1');
    },
    /Connection terminated unexpectedly/i,
    'F05: DB failure in getReportAggregation must throw explicit Error instead of returning null'
  );
  evalsMockModule.setDbError(null);
  console.log('  ✓ 2.2 DB failure throws explicit Error (does not collapse to empty null)');
}

{
  // Test 2.3: Truthful zero-row empty state
  evalsMockModule.setMockEvals([]);
  usersMockModule.setMockUsers([]);

  const res = await getReportAggregation('period-1', 'all');
  assert.ok(res !== null, 'F05: Successful query with 0 evaluations must return structured result, not null');
  assert.strictEqual(res.stats.totalEmployees, 0, 'Total employees must be 0 in empty state');
  assert.strictEqual(res.stats.avgScore, 0, 'Average score must be 0 in empty state');
  assert.strictEqual(res.stats.pendingCount, 0, 'Pending count must be 0 in empty state');
  assert.strictEqual(res.topPerformers.length, 0, 'Top performers must be empty array');
  console.log('  ✓ 2.3 Truthful zero-row query returns structured empty state with totalEmployees=0');
}

{
  // Test 2.4: Score-zero nullish semantics (finalScore: 0 is valid, not skipped or fallen back)
  const testUsers = [
    { id: 'u-zero', name: 'Zero Score User', role: 'Employee', teamId: 't-1' },
    { id: 'u-pos', name: 'Positive Score User', role: 'Employee', teamId: 't-1' },
  ];
  usersMockModule.setMockUsers(testUsers);

  const testEvals = [
    {
      id: 'e-zero',
      employeeId: 'u-zero',
      teamId: 't-1',
      status: 'Approved',
      finalScore: 0, // Valid numeric 0!
      finalGrade: 'D',
      rounds: [
        {
          round: 1,
          totalScore: 50, // Should NOT fall back to 50 when finalScore is 0!
          grade: 'B',
          scores: { 'c-1': 0 },
        },
      ],
    },
    {
      id: 'e-pos',
      employeeId: 'u-pos',
      teamId: 't-1',
      status: 'Approved',
      finalScore: 80,
      finalGrade: 'A',
      rounds: [
        {
          round: 1,
          totalScore: 80,
          grade: 'A',
          scores: { 'c-1': 20 },
        },
      ],
    },
  ];
  evalsMockModule.setMockEvals(testEvals);

  const res = await getReportAggregation('period-1', 'all');
  assert.ok(res !== null);
  assert.strictEqual(res.stats.totalEmployees, 2);
  // Average score must be (0 + 80) / 2 = 40.0. If 0 was falsy, it would have used 50 -> (50 + 80) / 2 = 65.0!
  assert.strictEqual(
    res.stats.avgScore,
    40,
    'F03/F05: Numeric score 0 must be honored with nullish semantics; avgScore must be (0 + 80) / 2 = 40'
  );

  const zeroUserPerformer = res.topPerformers.find((p) => p.id === 'u-zero');
  assert.ok(zeroUserPerformer, 'Zero score user must appear in performers list');
  assert.strictEqual(zeroUserPerformer.score, 0, 'Zero score must be 0, not fallen back to 50');

  console.log('  ✓ 2.4 Score 0 handled with nullish semantics (avgScore=40, finalScore=0 preserved)');
}

// =============================================================
// SECTION 3: Finding F01 — Client Scope Identity & Late-Response Guards
// =============================================================
console.log('\n--- Section 3: Finding F01 (Client Scope Identity & State Transitions) ---');

{
  // Test 3.1: Verify AuthContext scopeKey / scopeEpoch / clearScopedQueries contract
  const authSource = fs.readFileSync(path.join(rootDir, 'src/contexts/AuthContext.tsx'), 'utf8');

  assert.match(authSource, /viewerScope\?\.scopeKey/, 'AuthContext must track viewerScope.scopeKey in scopeFingerprint');
  assert.match(authSource, /setScopeEpoch\(\(epoch\) => epoch \+ 1\)/, 'AuthContext must increment scopeEpoch on scope change');
  assert.match(authSource, /clearScopedQueries/, 'AuthContext must clear scoped queries on scope change');
  assert.match(authSource, /refreshViewerScope/, 'AuthContext must provide refreshViewerScope');

  console.log('  ✓ 3.1 AuthContext tracks viewerScope.scopeKey and increments scopeEpoch on transition');
}

{
  // Test 3.2: Verify EmployeesClient uses viewerScope.scopeKey and scopeEpoch
  const employeesClientSource = fs.readFileSync(path.join(rootDir, 'src/components/employees/EmployeesClient.tsx'), 'utf8');

  // Must consume viewerScope and scopeEpoch from useAuth
  assert.match(
    employeesClientSource,
    /const\s*\{\s*[^}]*\bviewerScope\b[^}]*\bscopeEpoch\b[^}]*\}\s*=\s*useAuth\(\)/,
    'EmployeesClient must consume viewerScope and scopeEpoch from useAuth'
  );

  // Must track activeScopeKey from viewerScope.scopeKey
  assert.match(
    employeesClientSource,
    /viewerScope\?\.scopeKey/,
    'EmployeesClient must derive activeScopeKey from viewerScope.scopeKey'
  );

  // Must detect scope change when scopeKey or scopeEpoch changes (covering same-tab secondary-team revoke)
  assert.match(
    employeesClientSource,
    /prev\.scopeKey\s*!==\s*current\.scopeKey\s*\|\|\s*prev\.scopeEpoch\s*!==\s*current\.scopeEpoch/,
    'EmployeesClient must detect scope change when scopeKey or scopeEpoch changes'
  );

  // Must clear resident sensitive data on scope change
  assert.match(
    employeesClientSource,
    /setUsers\(\[\]\);[\s\S]*setEvaluationsMap\(\{\}\);/,
    'EmployeesClient must clear users and evaluationsMap resident data on scope change'
  );

  // Must stop loading and clear state when scope is unknown or denied (!viewerScope)
  assert.match(
    employeesClientSource,
    /if\s*\(!effectiveViewer\s*\|\|\s*!viewerScope\)\s*\{\s*setIsInitialLoading\(false\);/,
    'EmployeesClient must clear and halt loading when viewerScope is unknown or denied'
  );

  // Late response rejection: generationRef, scopeKey, and scopeEpoch checks
  assert.match(
    employeesClientSource,
    /viewerScope\?\.scopeKey\s*!==\s*currentScopeKey\s*\|\|\s*scopeEpoch\s*!==\s*currentEpoch/,
    'EmployeesClient loadInitialBatch must reject late response from old scope'
  );

  console.log('  ✓ 3.2 EmployeesClient resets resident data on secondary-team revoke and rejects late responses');
}

{
  // Test 3.3: Verify DashboardDataLayer scope identity and unknown/denied clearing
  const dashboardSource = fs.readFileSync(path.join(rootDir, 'src/components/dashboard/DashboardDataLayer.tsx'), 'utf8');

  assert.match(
    dashboardSource,
    /const\s*\{\s*[^}]*\bviewerScope\b[^}]*\bscopeEpoch\b[^}]*\}\s*=\s*useAuth\(\)/,
    'DashboardDataLayer must consume viewerScope and scopeEpoch from useAuth'
  );

  // Must derive empty visible state on unknown/denied scope without synchronous
  // setState in an effect (the React hooks lint rule rejects that pattern).
  assert.match(
    dashboardSource,
    /const\s*\[renderScope,\s*setRenderScope\]\s*=\s*useState/,
    'DashboardDataLayer must track the scope for render-safe state projection'
  );
  assert.match(
    dashboardSource,
    /effectiveViewer\s*&&\s*viewerScope\s*&&\s*hasCurrentLightState\s*\?\s*lightState\s*:\s*\{[^}]*data:\s*null/,
    'DashboardDataLayer must hide light resident data when viewerScope is unknown/denied'
  );
  assert.match(
    dashboardSource,
    /effectiveViewer\s*&&\s*viewerScope\s*&&\s*hasCurrentHeavyState\s*\?\s*heavyState\s*:\s*\{[^}]*data:\s*null/,
    'DashboardDataLayer must hide heavy resident data when viewerScope is unknown/denied'
  );
  assert.match(
    dashboardSource,
    /data:\s*scopeChanged\s*\?\s*null\s*:\s*prev\.data/,
    'DashboardDataLayer must clear resident data for a changed scope while preserving data for an unchanged scope'
  );

  // Late response rejection
  assert.match(
    dashboardSource,
    /viewerScope\?\.scopeKey\s*!==\s*expectedScopeKey/,
    'DashboardDataLayer must reject late response when scopeKey changes'
  );
  assert.match(
    dashboardSource,
    /scopeEpoch\s*!==\s*expectedEpoch/,
    'DashboardDataLayer must reject late response when scopeEpoch changes'
  );

  console.log('  ✓ 3.3 DashboardDataLayer clears resident data on denied scope and rejects late responses');
}

{
  // Test 3.4: Verify ReportsDataLayer scope identity, failure retry, and truthful empty state
  const reportsSource = fs.readFileSync(path.join(rootDir, 'src/components/reports/ReportsDataLayer.tsx'), 'utf8');

  assert.match(
    reportsSource,
    /const\s*\{\s*[^}]*\bviewerScope\b[^}]*\bscopeEpoch\b[^}]*\}\s*=\s*useAuth\(\)/,
    'ReportsDataLayer must consume viewerScope and scopeEpoch from useAuth'
  );

  // Must clear reportData on unknown/denied scope
  assert.match(
    reportsSource,
    /if\s*\(!periodId\s*\|\|\s*!effectiveViewer\s*\|\|\s*!viewerScope\)\s*\{\s*setReportData\(null\);/,
    'ReportsDataLayer must clear reportData on unknown or denied scope'
  );

  // Late response rejection
  assert.match(
    reportsSource,
    /viewerScope\?\.scopeKey\s*===\s*currentScopeKey/,
    'ReportsDataLayer must ensure responses are only accepted if scopeKey still matches'
  );
  assert.match(
    reportsSource,
    /scopeEpoch\s*===\s*currentEpoch/,
    'ReportsDataLayer must ensure responses are only accepted if scopeEpoch still matches'
  );

  // Explicit error state distinguishes from empty state
  assert.match(reportsSource, /setIsError\(true\)/, 'ReportsDataLayer sets isError=true on failure');
  assert.match(reportsSource, /isError\s*\?/, 'ReportsDataLayer renders explicit error container on failure');
  assert.match(reportsSource, /RotateCcw/, 'ReportsDataLayer renders retry icon/button in error container');
  assert.match(
    reportsSource,
    /!\s*reportData\s*\|\|\s*reportData\.stats\.totalEmployees\s*===\s*0/,
    'ReportsDataLayer renders truthful empty state only when not in error'
  );

  console.log('  ✓ 3.4 ReportsDataLayer separates explicit error with retry from truthful empty state');
}

console.log('\n=============================================================');
console.log('ALL P104M1T01 FOCUSED REGRESSION TESTS PASS (Exit 0)');
console.log('=============================================================');
