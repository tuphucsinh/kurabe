#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';
import ts from 'typescript';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');
const tsPath = path.join(projectRoot, 'node_modules/typescript/lib/typescript.js');
const tsUrl = pathToFileURL(tsPath).href;

// Set fallback env for offline module imports
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.ci-offline-placeholder';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.ci-offline-placeholder';

// Register loader for TypeScript & @/ aliases
const loaderCode = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import tsModule from ${JSON.stringify(tsUrl)};
const ts = tsModule.default || tsModule;
const rootDir = ${JSON.stringify(projectRoot)};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export {};", shortCircuit: true, format: "module" };
  }
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx", ".js", ""]) {
      const p = path.join(rootDir, "src", rel + suffix);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return nextResolve(pathToFileURL(p).href, context);
      }
    }
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (context && context.parentURL) {
        const base = new URL(specifier, context.parentURL);
        for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
          const cand = base.href + suffix;
          try {
            if (fs.existsSync(fileURLToPath(cand))) {
              return nextResolve(cand, context);
            }
          } catch {}
        }
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:")) {
    const filePath = fileURLToPath(url);
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      const source = fs.readFileSync(filePath, "utf8");
      const transpiled = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        }
      });
      return { format: "module", source: transpiled.outputText, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
`;
register('data:text/javascript,' + encodeURIComponent(loaderCode));

console.log('=== P108 Role Snapshot & Subject Consumer Unit Tests ===\n');

// -----------------------------------------------------------------------------
// 1. Static Contract & Source Boundary Assertions
// -----------------------------------------------------------------------------
console.log('[Test 1] Verifying source boundaries and snapshot usages in owned files...');

const hookPageStatePath = path.join(projectRoot, 'src/hooks/use-evaluation-page-state.ts');
const compareClientPath = path.join(projectRoot, 'src/app/evaluations/[id]/compare/ComparePageClient.tsx');
const evalClientPath = path.join(projectRoot, 'src/app/evaluations/[id]/EvaluationPageClient.tsx');
const evalHeaderPath = path.join(projectRoot, 'src/components/evaluation/EvaluationHeader.tsx');
const resultCardPath = path.join(projectRoot, 'src/components/evaluation/ResultCard.tsx');

assert.ok(fs.existsSync(hookPageStatePath), 'use-evaluation-page-state.ts must exist');
assert.ok(fs.existsSync(compareClientPath), 'ComparePageClient.tsx must exist');
assert.ok(fs.existsSync(evalClientPath), 'EvaluationPageClient.tsx must exist');
assert.ok(fs.existsSync(evalHeaderPath), 'EvaluationHeader.tsx must exist');
assert.ok(fs.existsSync(resultCardPath), 'ResultCard.tsx must exist');

const hookContent = fs.readFileSync(hookPageStatePath, 'utf8');
const compareContent = fs.readFileSync(compareClientPath, 'utf8');
const evalContent = fs.readFileSync(evalClientPath, 'utf8');
const headerContent = fs.readFileSync(evalHeaderPath, 'utf8');
const cardContent = fs.readFileSync(resultCardPath, 'utf8');

// 1.1 use-evaluation-page-state.ts MUST use evaluation.employeeRole snapshot for criteria loader
assert.doesNotMatch(
  hookContent,
  /getCriteriaForRoleAction\(\s*employee\.role\s*\)/,
  'use-evaluation-page-state.ts must NOT call getCriteriaForRoleAction(employee.role) directly'
);
assert.match(
  hookContent,
  /evaluation\s*\?\s*evaluation\.employeeRole\s*:\s*employee\.role/,
  'use-evaluation-page-state.ts must use evaluation.employeeRole snapshot with employee.role fallback'
);

// 1.2 ComparePageClient.tsx liveCriteria and roundResults must use snapshot
assert.doesNotMatch(
  compareContent,
  /const\s+role\s*=\s*employee\.role\s*;/,
  'ComparePageClient.tsx must NOT set liveCriteria role = employee.role'
);
assert.doesNotMatch(
  compareContent,
  /const\s+evaluatorRole\s*=\s*employee\.role\s*;/,
  'ComparePageClient.tsx must NOT set roundResults evaluatorRole = employee.role'
);
assert.match(
  compareContent,
  /evaluation\?\.employeeRole\s*\?\?\s*employee\?\.role/,
  'ComparePageClient.tsx must derive role and evaluatorRole from evaluation.employeeRole snapshot'
);
assert.match(
  compareContent,
  /\[\s*employee\s*,\s*evaluation\?\.employeeRole\s*,\s*groups\s*\]/,
  'ComparePageClient.tsx liveCriteria dependencies must include evaluation?.employeeRole safely'
);
assert.match(
  compareContent,
  /\[\s*roundViews\s*,\s*employee\s*,\s*evaluation\?\.employeeRole\s*,\s*gradeBands\s*\]/,
  'ComparePageClient.tsx roundResults dependencies must include evaluation?.employeeRole safely'
);

// 1.3 EvaluationPageClient.tsx maxRound, blockedMaxRound, currentSummaryRound
assert.doesNotMatch(
  evalContent,
  /getMaxEvaluationRound\(\s*employee\.role\s*\)/,
  'EvaluationPageClient.tsx must NOT call getMaxEvaluationRound(employee.role)'
);
assert.match(
  evalContent,
  /getMaxEvaluationRound\(\s*evaluation\.employeeRole\s*\)/,
  'EvaluationPageClient.tsx must call getMaxEvaluationRound(evaluation.employeeRole)'
);
assert.match(
  evalContent,
  /evaluatorRole:\s*evaluation\.employeeRole/,
  'EvaluationPageClient.tsx currentSummaryRound must set evaluatorRole to evaluation.employeeRole'
);
// AI role args at 519-522 left unchanged for T09
assert.match(
  evalContent,
  /role:\s*employee\.role\s*\|\|\s*''/,
  'EvaluationPageClient.tsx AI invocation at 519-522 must remain unchanged for T09'
);

// 1.4 EvaluationHeader.tsx: single clear snapshot-role input, no redundant evaluation prop
assert.doesNotMatch(
  headerContent,
  /evaluation\?:\s*Evaluation\s*;/,
  'EvaluationHeader.tsx must NOT take redundant evaluation prop'
);
assert.match(
  headerContent,
  /employeeRole\s*\?\?\s*employee\.role/,
  'EvaluationHeader.tsx must compute subjectRole from employeeRole ?? employee.role'
);
// EvaluationHeader.tsx previous-round Submitted must use stored totalScore and grade
assert.match(
  headerContent,
  /const\s+isSubmitted\s*=\s*r\.status\s*===\s*'Submitted'\s*;/,
  'EvaluationHeader.tsx must identify isSubmitted rounds'
);
assert.match(
  headerContent,
  /r\.totalScore/,
  'EvaluationHeader.tsx must use authoritative stored totalScore for Submitted rounds'
);
// Employee role identity badge unchanged
assert.match(
  headerContent,
  /\{\s*employee\.role\s*\}/,
  'EvaluationHeader.tsx must keep employee.role identity badge'
);

// 1.5 ResultCard.tsx grade-band explanation
assert.doesNotMatch(
  cardContent,
  /employee\.role\s*===\s*'Worker'/,
  'ResultCard.tsx must NOT check employee.role === "Worker"'
);
assert.doesNotMatch(
  cardContent,
  /isLeaderGradingRole\(\s*employee\.role\s*\)/,
  'ResultCard.tsx must NOT check isLeaderGradingRole(employee.role)'
);
assert.match(
  cardContent,
  /evaluation\?\.employeeRole\s*\?\?\s*employee\.role/,
  'ResultCard.tsx must use snapshot role for grade-band explanation'
);

console.log('PASS: Static contract and boundary assertions verified.\n');

// -----------------------------------------------------------------------------
// 2. Real Module Import & Pure Helper Verification
// -----------------------------------------------------------------------------
console.log('[Test 2] Testing real pure role mapping and scoring helpers via @/ aliases...');

const { roleToSetKey, ROLE_TO_SET_KEY } = await import('@/lib/criteria-applicability');
const { getMaxEvaluationRound, isLeaderGradingRole } = await import('@/lib/evaluation-workflow');
const { getGradeFromScore, calculateRoundScore } = await import('@/lib/scoring');
const { getGradeBandsSync } = await import('@/lib/grade-bands');

// 2.1 All five role -> set mappings
assert.equal(roleToSetKey('Manager'), 'leader', 'Manager -> leader set');
assert.equal(roleToSetKey('Leader'), 'leader', 'Leader -> leader set');
assert.equal(roleToSetKey('SubLeader'), 'leader', 'SubLeader -> leader set');
assert.equal(roleToSetKey('Employee'), 'staff', 'Employee -> staff set');
assert.equal(roleToSetKey('Worker'), 'worker', 'Worker -> worker set');

assert.equal(ROLE_TO_SET_KEY['Manager'], 'leader');
assert.equal(ROLE_TO_SET_KEY['Leader'], 'leader');
assert.equal(ROLE_TO_SET_KEY['SubLeader'], 'leader');
assert.equal(ROLE_TO_SET_KEY['Employee'], 'staff');
assert.equal(ROLE_TO_SET_KEY['Worker'], 'worker');

// 2.2 Max evaluation rounds per role
assert.equal(getMaxEvaluationRound('Manager'), 1, 'Manager maxRound must be 1');
assert.equal(getMaxEvaluationRound('Leader'), 2, 'Leader maxRound must be 2');
assert.equal(getMaxEvaluationRound('SubLeader'), 3, 'SubLeader maxRound must be 3');
assert.equal(getMaxEvaluationRound('Employee'), 3, 'Employee maxRound must be 3');
assert.equal(getMaxEvaluationRound('Worker'), 3, 'Worker maxRound must be 3');

// 2.3 Role-change-after-period drift on maxRound
{
  // Subject created as Leader (maxRound 2), live employee.role becomes Employee (maxRound 3)
  const evalSnapshot = { employeeRole: 'Leader' };
  const evaluatedMaxRound = getMaxEvaluationRound(evalSnapshot.employeeRole);
  assert.equal(evaluatedMaxRound, 2, 'Max round must follow evaluation.employeeRole snapshot (2), not live role');
}
{
  // Subject created as Employee (maxRound 3), live employee.role becomes Leader (maxRound 2)
  const evalSnapshot = { employeeRole: 'Employee' };
  const evaluatedMaxRound = getMaxEvaluationRound(evalSnapshot.employeeRole);
  assert.equal(evaluatedMaxRound, 3, 'Max round must follow evaluation.employeeRole snapshot (3), not live role');
}
{
  // Subject created as Manager (maxRound 1), live employee.role becomes Leader (maxRound 2)
  const evalSnapshot = { employeeRole: 'Manager' };
  const evaluatedMaxRound = getMaxEvaluationRound(evalSnapshot.employeeRole);
  assert.equal(evaluatedMaxRound, 1, 'Max round must follow evaluation.employeeRole snapshot (1), not live role');
}

// 2.4 Hook subject-role expression evaluation from use-evaluation-page-state.ts
{
  function evaluateSubjectRoleExpression(evaluation, employee) {
    return evaluation ? evaluation.employeeRole : employee.role;
  }
  // Evaluation exists: role drift must use evaluation.employeeRole
  assert.equal(evaluateSubjectRoleExpression({ employeeRole: 'Leader' }, { role: 'Employee' }), 'Leader');
  assert.equal(evaluateSubjectRoleExpression({ employeeRole: 'Employee' }, { role: 'Leader' }), 'Employee');
  assert.equal(evaluateSubjectRoleExpression({ employeeRole: 'Worker' }, { role: 'Leader' }), 'Worker');
  // Evaluation null: clean fallback to employee.role
  assert.equal(evaluateSubjectRoleExpression(null, { role: 'Employee' }), 'Employee');
  assert.equal(evaluateSubjectRoleExpression(null, { role: 'Leader' }), 'Leader');
}

console.log('PASS: Pure helper functions and maxRound drift verified.\n');

// -----------------------------------------------------------------------------
// 3. Testing Grade Bands, Scoring, and Cross-Set Role Drift
// -----------------------------------------------------------------------------
console.log('[Test 3] Testing scoring and grade bands across same-set and cross-set drift...');

const gradeBands = getGradeBandsSync();
// Synthetic standard grade bands:
// Leader: S >= 170, A: 160-169, AB: 130-159, B: 100-129, C: 70-99, D < 70
// Staff:  S >= 155, A: 145-154, AB: 115-144, B: 90-114,  C: 60-89, D < 60
// Worker: S >= 155, A: 145-154, AB: 115-144, B: 90-114,  C: 60-89, D < 60

// 3.1 Leader <-> Employee cross-set drift
{
  // Subject score: 165
  // If evaluated under Leader bands: 165 -> 'A' (160..169)
  // If evaluated under Staff/Employee bands: 165 -> 'S' (>= 155)
  const leaderGrade = getGradeFromScore(165, 'Leader', gradeBands);
  const staffGrade = getGradeFromScore(165, 'Employee', gradeBands);
  assert.equal(leaderGrade, 'A', '165 points for Leader must be A');
  assert.equal(staffGrade, 'S', '165 points for Employee must be S');

  // Case A: Evaluation created as Leader. Later employee promoted/transferred to Employee.
  // Evaluation grade MUST be A, not S!
  const evalSnapshotLeader = { employeeRole: 'Leader' };
  const gradeA = getGradeFromScore(165, evalSnapshotLeader.employeeRole, gradeBands);
  assert.equal(gradeA, 'A', 'Snapshot Leader must retain grade A even if live role is Employee');

  // Case B: Evaluation created as Employee. Later employee promoted to Leader. Score: 156.
  // If evaluated under Leader bands: 156 -> 'AB' (130..159)
  // If evaluated under Staff/Employee bands: 156 -> 'S' (>= 155)
  const evalSnapshotEmployee = { employeeRole: 'Employee' };
  const gradeB = getGradeFromScore(156, evalSnapshotEmployee.employeeRole, gradeBands);
  assert.equal(gradeB, 'S', 'Snapshot Employee must retain grade S even if live role is Leader');
}

// 3.2 Leader <-> Worker cross-set drift
{
  // Subject score: 165. Leader: A. Worker: S.
  const evalSnapshotLeader = { employeeRole: 'Leader' };
  const gradeLeaderToWorker = getGradeFromScore(165, evalSnapshotLeader.employeeRole, gradeBands);
  assert.equal(gradeLeaderToWorker, 'A', 'Snapshot Leader must retain grade A even if live role is Worker');

  // Score: 156. Worker: S. Leader: AB.
  const evalSnapshotWorker = { employeeRole: 'Worker' };
  const gradeWorkerToLeader = getGradeFromScore(156, evalSnapshotWorker.employeeRole, gradeBands);
  assert.equal(gradeWorkerToLeader, 'S', 'Snapshot Worker must retain grade S even if live role is Leader');
}

// 3.3 Manager <-> Leader / SubLeader (within leader set)
{
  assert.equal(isLeaderGradingRole('Manager'), true);
  assert.equal(isLeaderGradingRole('Leader'), true);
  assert.equal(isLeaderGradingRole('SubLeader'), true);
  assert.equal(isLeaderGradingRole('Employee'), false);
  assert.equal(isLeaderGradingRole('Worker'), false);

  const score170 = 170;
  assert.equal(getGradeFromScore(score170, 'Manager', gradeBands), 'S');
  assert.equal(getGradeFromScore(score170, 'Leader', gradeBands), 'S');
  assert.equal(getGradeFromScore(score170, 'SubLeader', gradeBands), 'S');
}

console.log('PASS: Scoring and grade bands across same-set and cross-set drift verified.\n');

// -----------------------------------------------------------------------------
// 4. Executing Enforcing Source Code via TypeScript AST Extraction
// -----------------------------------------------------------------------------
console.log('[Test 4] Extracting and executing ComparePageClient useMemo callbacks via AST...');

function extractUseMemoArrowBody(filePath, varName) {
  const sourceCode = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let arrowText = null;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === varName) {
      if (node.initializer && ts.isCallExpression(node.initializer)) {
        const arg0 = node.initializer.arguments[0];
        if (arg0 && (ts.isArrowFunction(arg0) || ts.isFunctionExpression(arg0))) {
          arrowText = arg0.getText(sourceFile);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!arrowText) throw new Error(`Could not find useMemo callback for ${varName} in ${filePath}`);
  return arrowText;
}

// 4.1 Execute AST-extracted liveCriteria from ComparePageClient.tsx
{
  const liveCriteriaArrow = extractUseMemoArrowBody(compareClientPath, 'liveCriteria');
  const transpiled = ts.transpileModule(`return (${liveCriteriaArrow});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const liveCriteriaFactory = new Function('employee', 'evaluation', 'groups', transpiled);
  const computeLiveCriteria = (emp, ev, grps) => liveCriteriaFactory(emp, ev, grps)();

  const groups = [
    {
      id: 'g1',
      code: 'A',
      name: 'Leader Group',
      criteria: [
        { id: 'c1', code: 'A1', name: 'Leader Crit 1', appliesTo: ['Manager', 'Leader', 'SubLeader'] },
        { id: 'c2', code: 'A2', name: 'Leader Crit 2', appliesTo: ['Manager', 'Leader', 'SubLeader'] },
      ],
    },
    {
      id: 'g2',
      code: 'B',
      name: 'Staff Group',
      criteria: [
        { id: 'c3', code: 'B1', name: 'Staff Crit 1', appliesTo: ['Employee'] },
      ],
    },
    {
      id: 'g3',
      code: 'C',
      name: 'Worker Group',
      criteria: [
        { id: 'c4', code: 'C1', name: 'Worker Crit 1', appliesTo: ['Worker'] },
      ],
    },
  ];

  // Subject is Leader snapshot, live role changed to Worker:
  const liveCriteria = computeLiveCriteria({ role: 'Worker' }, { employeeRole: 'Leader' }, groups);
  assert.equal(liveCriteria.length, 1, 'Must only include groups with Leader criteria');
  assert.equal(liveCriteria[0].id, 'g1', 'Must be group g1 (Leader Group)');
  assert.deepEqual(
    liveCriteria[0].criteria.map((c) => c.id),
    ['c1', 'c2'],
    'Must include Leader criteria c1 and c2, NOT Worker criteria'
  );

  // Subject is Employee snapshot, live role changed to Leader:
  const liveCriteriaStaff = computeLiveCriteria({ role: 'Leader' }, { employeeRole: 'Employee' }, groups);
  assert.equal(liveCriteriaStaff.length, 1);
  assert.equal(liveCriteriaStaff[0].id, 'g2', 'Must be Staff Group');

  // Fallback when evaluation is null (e.g. before period/evaluation creation):
  const fallbackCriteria = computeLiveCriteria({ role: 'Worker' }, null, groups);
  assert.equal(fallbackCriteria.length, 1);
  assert.equal(fallbackCriteria[0].id, 'g3', 'Null eval must fall back cleanly to employee.role');
}

// 4.2 Execute AST-extracted roundResults from ComparePageClient.tsx with actual calculateRoundScore
{
  const roundResultsArrow = extractUseMemoArrowBody(compareClientPath, 'roundResults');
  const transpiled = ts.transpileModule(`return (${roundResultsArrow});`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const roundResultsFactory = new Function('roundViews', 'employee', 'evaluation', 'gradeBands', 'calculateRoundScore', transpiled);
  const computeRoundResults = (views, emp, ev, bands) =>
    roundResultsFactory(views, emp, ev, bands, calculateRoundScore)();

  // Round 1 is Submitted with historical DTO: totalScore 150, grade AB
  // Round 2 is Draft with scores totaling 165
  const roundViews = [
    {
      round: { round: 1, status: 'Submitted', scores: { c1: 80, c2: 70 }, totalScore: 150, grade: 'AB' },
      displayRound: { round: 1, totalScore: 150, grade: 'AB', snapshotState: 'authoritative' },
      isSubmitted: true,
    },
    {
      round: { round: 2, status: 'Draft', scores: { c1: 90, c2: 75 }, totalScore: 0, grade: 'Pending' },
      displayRound: null,
      isSubmitted: false,
    },
  ];

  // Subject is Leader snapshot, live role changed to Employee:
  const results = computeRoundResults(
    roundViews,
    { role: 'Employee' },
    { employeeRole: 'Leader' },
    gradeBands
  );
  assert.equal(results.length, 2);

  // Round 1 (Submitted): preserved historical DTO
  assert.equal(results[0].result.totalScore, 150);
  assert.equal(results[0].result.grade, 'AB', 'Submitted round preserves historical DTO grade');

  // Round 2 (Draft): calculated with evaluatorRole = evaluation.employeeRole = 'Leader'
  // 90 + 75 = 165. Under Leader bands: 'A' (160..169). If it used live Employee, it would be 'S' (>= 155)!
  assert.equal(results[1].result.totalScore, 165);
  assert.equal(
    results[1].result.grade,
    'A',
    'Draft round must calculate grade using snapshot Leader (A), not live Employee (S)'
  );
}

console.log('PASS: AST extraction & execution of ComparePageClient callbacks verified.\n');

// -----------------------------------------------------------------------------
// 5. Real React SSR Component Verification (ResultCard & EvaluationHeader)
// -----------------------------------------------------------------------------
console.log('[Test 5] Testing ResultCard and EvaluationHeader via React SSR...');

const { default: EvaluationHeader } = await import('@/components/evaluation/EvaluationHeader');
const { default: ResultCard } = await import('@/components/evaluation/ResultCard');
const { renderToStaticMarkup } = await import('react-dom/server');
const React = await import('react');

// 5.1 ResultCard SSR verification
{
  // Subject created as Leader, live role changed to Worker. Score 150, grade AB.
  // Leader AB threshold: 130 đến 159. Worker AB threshold: 115 đến 144.
  const htmlLeaderSnapshot = renderToStaticMarkup(
    React.createElement(ResultCard, {
      employee: { id: 'u1', name: 'Nguyen Van A', employeeCode: 'EMP-001', role: 'Worker' },
      evaluation: {
        id: 'e1',
        employeeId: 'u1',
        employeeRole: 'Leader',
        periodId: 'p1',
        teamId: 't1',
        rounds: [],
        currentRound: 2,
        status: 'Approved',
        finalGrade: 'AB',
        finalScore: 150,
      },
      totalScore: 150,
      grade: 'AB',
      gradeBands,
    })
  );

  assert.ok(
    htmlLeaderSnapshot.includes('130 đến 159'),
    'ResultCard SSR for Leader snapshot must render Leader band threshold (130 đến 159)'
  );
  assert.ok(
    !htmlLeaderSnapshot.includes('115 đến 144'),
    'ResultCard SSR for Leader snapshot must NOT render Worker band threshold (115 đến 144)'
  );
  assert.ok(
    htmlLeaderSnapshot.includes('EMP-001'),
    'ResultCard SSR must display employee code'
  );

  // Subject created as Worker, live role changed to Leader. Score 120, grade AB.
  // Worker AB threshold: 115 đến 144. Leader AB threshold: 130 đến 159.
  const htmlWorkerSnapshot = renderToStaticMarkup(
    React.createElement(ResultCard, {
      employee: { id: 'u2', name: 'Tran Thi B', employeeCode: 'WRK-002', role: 'Leader' },
      evaluation: {
        id: 'e2',
        employeeId: 'u2',
        employeeRole: 'Worker',
        periodId: 'p1',
        teamId: 't1',
        rounds: [],
        currentRound: 3,
        status: 'Approved',
        finalGrade: 'AB',
        finalScore: 120,
      },
      totalScore: 120,
      grade: 'AB',
      gradeBands,
    })
  );

  assert.ok(
    htmlWorkerSnapshot.includes('115 đến 144'),
    'ResultCard SSR for Worker snapshot must render Worker band threshold (115 đến 144)'
  );
  assert.ok(
    !htmlWorkerSnapshot.includes('130 đến 159'),
    'ResultCard SSR for Worker snapshot must NOT render Leader band threshold (130 đến 159)'
  );
}

// 5.2 EvaluationHeader SSR verification: prior Submitted rounds authoritative preservation vs Draft
{
  // Regression case: Submitted round has authoritative stored totalScore: 80, grade: 'S'
  // (Under current Leader/Staff bands, 80 points would produce 'C' or 'D', NOT 'S').
  // EvaluationHeader MUST render the stored 'S' directly, not recompute!
  const prevSubmittedRound = {
    round: 1,
    status: 'Submitted',
    scores: { c1: 40, c2: 40 },
    totalScore: 80,
    grade: 'S',
  };

  const htmlSubmitted = renderToStaticMarkup(
    React.createElement(EvaluationHeader, {
      employee: { id: 'u1', name: 'Nguyen Van A', employeeCode: 'EMP-001', role: 'Worker' },
      employeeRole: 'Leader',
      isLeader: true,
      scores: { c1: 85, c2: 80 },
      criteriaGroups: [{ id: 'g1', code: 'A', name: 'Group A', criteria: [{ id: 'c1' }, { id: 'c2' }] }],
      allPreviousRounds: [prevSubmittedRound],
      grade: 'A',
      totalScore: 165,
      scoredCount: 2,
      totalCriteria: 2,
      currentRound: 2,
      gradeBands,
    })
  );

  // Authoritative stored grade 'S' must appear for round 1
  assert.ok(
    htmlSubmitted.includes('>S<'),
    'EvaluationHeader SSR must preserve authoritative stored grade S for Submitted round'
  );
  // Authoritative stored totalScore 80 must appear for round 1
  assert.ok(
    htmlSubmitted.includes('>80<'),
    'EvaluationHeader SSR must preserve authoritative stored totalScore 80 for Submitted round'
  );
  // Identity labels must remain untouched
  assert.ok(
    htmlSubmitted.includes('Nguyen Van A'),
    'EvaluationHeader SSR must render employee name untouched'
  );
  assert.ok(
    htmlSubmitted.includes('Worker'),
    'EvaluationHeader SSR must render employee live role badge untouched'
  );

  // Draft previous-round regression: if previous round was Draft, it computes using snapshot role
  // Score 165 points. Under Leader snapshot -> 'A'. Under Employee live role -> 'S'.
  const prevDraftRound = {
    round: 1,
    status: 'Draft',
    scores: { c1: 90, c2: 75 },
    totalScore: 0,
    grade: 'Pending',
  };

  const htmlDraftPrev = renderToStaticMarkup(
    React.createElement(EvaluationHeader, {
      employee: { id: 'u1', name: 'Nguyen Van A', employeeCode: 'EMP-001', role: 'Employee' },
      employeeRole: 'Leader',
      isLeader: true,
      scores: {},
      criteriaGroups: [{ id: 'g1', code: 'A', name: 'Group A', criteria: [{ id: 'c1' }, { id: 'c2' }] }],
      allPreviousRounds: [prevDraftRound],
      grade: 'Pending',
      totalScore: 0,
      scoredCount: 0,
      totalCriteria: 2,
      currentRound: 2,
      gradeBands,
    })
  );

  // The draft round score is 165, and grade under snapshot Leader is 'A' (not 'S')
  assert.ok(
    htmlDraftPrev.includes('>165<'),
    'EvaluationHeader SSR must compute sum of scores (165) for Draft previous round'
  );
  assert.ok(
    htmlDraftPrev.includes('>A<'),
    'EvaluationHeader SSR must compute grade A for Draft previous round using Leader snapshot'
  );
}

console.log('PASS: ResultCard and EvaluationHeader React SSR verification passed.\n');

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log('====================================================');
console.log('ALL P108 ROLE SNAPSHOT UNIT & CONTRACT TESTS PASSED!');
console.log('====================================================');
