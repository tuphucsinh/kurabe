import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

function readProjectFile(relPath) {
  const fullPath = path.join(projectRoot, relPath);
  assert.ok(fs.existsSync(fullPath), `File must exist: ${relPath}`);
  return fs.readFileSync(fullPath, 'utf8');
}

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeWhitespace(code) {
  return code.replace(/\s+/g, ' ').trim();
}

function extractFunction(code, functionName) {
  const cleanCode = stripComments(code);
  const regex = new RegExp(`(?:export\\s+(?:default\\s+)?)?(?:async\\s+)?function\\s+${functionName}\\s*\\([^)]*\\)[^{]*\\{`);
  const match = cleanCode.match(regex);
  assert.ok(match, `Function declaration not found: ${functionName}`);

  const startIndex = match.index;
  const bodyStartIndex = startIndex + match[0].length - 1;

  let depth = 0;
  let endIndex = bodyStartIndex;
  for (let i = bodyStartIndex; i < cleanCode.length; i++) {
    if (cleanCode[i] === '{') depth++;
    else if (cleanCode[i] === '}') {
      depth--;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  assert.strictEqual(depth, 0, `Unbalanced braces in function: ${functionName}`);
  return cleanCode.slice(startIndex, endIndex);
}

function extractInterface(code, interfaceName) {
  const cleanCode = stripComments(code);
  const regex = new RegExp(`(?:export\\s+)?interface\\s+${interfaceName}\\b[^{]*\\{`);
  const match = cleanCode.match(regex);
  assert.ok(match, `Interface declaration not found: ${interfaceName}`);

  const startIndex = match.index;
  const bodyStartIndex = startIndex + match[0].length - 1;

  let depth = 0;
  let endIndex = bodyStartIndex;
  for (let i = bodyStartIndex; i < cleanCode.length; i++) {
    if (cleanCode[i] === '{') depth++;
    else if (cleanCode[i] === '}') {
      depth--;
      if (depth === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  assert.strictEqual(depth, 0, `Unbalanced braces in interface: ${interfaceName}`);
  return cleanCode.slice(startIndex, endIndex);
}

// -------------------------------------------------------------
// 1. Verify src/app/employees/page.tsx
// -------------------------------------------------------------
{
  const pageCode = readProjectFile('src/app/employees/page.tsx');
  const normPage = normalizeWhitespace(stripComments(pageCode));

  assert.ok(
    normPage.includes('initialViewer={viewer}'),
    'EmployeesPage must pass initialViewer={viewer} to EmployeesClient'
  );
  assert.ok(
    normPage.includes("redirect('/login')") && normPage.includes("redirect(`/evaluations/${viewer.id}`)"),
    'EmployeesPage must keep server auth guard and individual role redirects intact'
  );
}

// -------------------------------------------------------------
// 2. Verify src/components/employees/EmployeesClient.tsx
// -------------------------------------------------------------
{
  const code = readProjectFile('src/components/employees/EmployeesClient.tsx');
  const cleanCode = stripComments(code);

  // 2.1 Interface EmployeesClientProps must declare initialViewer: User
  const propsInterface = extractInterface(code, 'EmployeesClientProps');
  const propsBody = normalizeWhitespace(propsInterface);
  assert.ok(
    propsBody.includes('initialViewer: User'),
    'EmployeesClientProps must declare initialViewer: User'
  );

  // 2.2 Interface EmployeeTableItem must include evaluationLoading
  const interfaceCode = extractInterface(code, 'EmployeeTableItem');
  const interfaceBody = normalizeWhitespace(interfaceCode);
  assert.ok(
    interfaceBody.includes('evaluationLoading: boolean'),
    'EmployeeTableItem must declare evaluationLoading: boolean'
  );

  // 2.3 EmployeesClient function & bootstrap snapshot
  const componentFn = extractFunction(code, 'EmployeesClient');
  const normFn = normalizeWhitespace(componentFn);

  // Bootstrap effective viewer definition
  assert.ok(
    /effectiveViewer\s*=\s*authLoading\s*\?\s*\(contextUser\s*\?\?\s*initialViewer\)\s*:\s*contextUser/.test(normFn),
    'EmployeesClient must define bootstrap-only effectiveViewer (inactive after auth resolves)'
  );

  // Mount must use the aggregated employees page-data action (P88); load-more/retry still use per-action fetches
  assert.ok(
    normFn.includes('getEmployeesPageDataAction'),
    'EmployeesClient must call getEmployeesPageDataAction (aggregate) on initial mount'
  );
  assert.ok(
    normFn.includes('getUsersBatchAction'),
    'EmployeesClient must call getUsersBatchAction for users load-more'
  );
  assert.ok(
    normFn.includes('getEvaluationSummariesBatchAction'),
    'EmployeesClient must call getEvaluationSummariesBatchAction for evaluation summaries batch'
  );

  // 2.4 Static Shell Gate: NO whole-page early return replacing the shell
  assert.ok(
    !/if\s*\(\s*(?:isLoading|isInitialLoading|teamsLoading)\s*\)\s*return\s*\(/.test(normFn),
    'EmployeesClient must not have a whole-page early return; static shell must render immediately'
  );

  // 2.5 teamsLoading and currentPeriod must not block shell or user rows
  assert.ok(
    normFn.includes("teamsLoading ? 'Đang tải...' : 'Chưa gán'"),
    'teamsLoading must gracefully show placeholder team name without blocking rows'
  );

  // 2.6 Viewer state reconciliation: clear state on viewer logout or scope mismatch
  assert.ok(
    normFn.includes('prevViewerRef') &&
      normFn.includes('setUsers([])') &&
      normFn.includes('setEvaluationsMap({})') &&
      normFn.includes('setEvalLoadingMap({})') &&
      normFn.includes('setEvalErrorMap({})') &&
      normFn.includes('setTotalCount(0)') &&
      normFn.includes('setHasMore(false)'),
    'EmployeesClient must clear users, evaluationsMap, evalLoadingMap, evalErrorMap, counts/hasMore on viewer logout/mismatch'
  );

  // 2.7 employeesData useMemo must populate evaluationLoading
  assert.ok(
    /evaluationLoading\s*:\s*isEvalLoading/.test(normFn) || /evaluationLoading\s*:/.test(normFn),
    'employeesData map must set evaluationLoading'
  );

  // 2.8 Evaluation column render must delegate to EmployeeEvaluationCell with proper props
  assert.ok(
    normFn.includes('EmployeeEvaluationCell'),
    'EmployeesClient must import and render EmployeeEvaluationCell'
  );
  const gradeColumnMatch = cleanCode.match(/key\s*:\s*['"]grade['"][\s\S]*?render\s*:\s*\((?:item|[^)]+)\)\s*=>\s*([\s\S]*?)(?:,\s*\{|\s*\}\s*,\s*\]|\s*\])/);
  assert.ok(gradeColumnMatch, 'grade column render function must exist');
  const gradeRenderBody = normalizeWhitespace(gradeColumnMatch[1]);

  assert.ok(
    gradeRenderBody.includes('<EmployeeEvaluationCell') || gradeRenderBody.includes('EmployeeEvaluationCell'),
    'grade column render must render EmployeeEvaluationCell'
  );
  assert.ok(
    gradeRenderBody.includes('grade={item.grade}') || gradeRenderBody.includes('grade: item.grade') || gradeRenderBody.includes('item.grade'),
    'EmployeeEvaluationCell must receive item.grade'
  );
  assert.ok(
    gradeRenderBody.includes('score={item.score}') || gradeRenderBody.includes('item.score'),
    'EmployeeEvaluationCell must receive item.score'
  );
  assert.ok(
    gradeRenderBody.includes('evaluationLoading={item.evaluationLoading}') || gradeRenderBody.includes('item.evaluationLoading'),
    'EmployeeEvaluationCell must receive item.evaluationLoading'
  );
  assert.ok(
    gradeRenderBody.includes('evaluationError={item.evaluationError}') || gradeRenderBody.includes('item.evaluationError'),
    'EmployeeEvaluationCell must receive item.evaluationError'
  );
  assert.ok(
    gradeRenderBody.includes('employeeId={item.id}') || gradeRenderBody.includes('item.id'),
    'EmployeeEvaluationCell must receive employeeId'
  );
  assert.ok(
    gradeRenderBody.includes('onRetry={handleRetryEvaluation}') || gradeRenderBody.includes('handleRetryEvaluation'),
    'EmployeeEvaluationCell must receive onRetry handler'
  );

  // 2.9 Observability Markers (data-load-layer)
  assert.ok(
    normFn.includes('data-load-layer="shell"'),
    'EmployeesClient must render data-load-layer="shell" on the outer frame element'
  );
  assert.ok(
    normFn.includes('data-load-layer="light"'),
    'EmployeesClient must render data-load-layer="light" on the table/data region'
  );
  assert.ok(
    normFn.includes('data-load-layer="heavy"'),
    'EmployeesClient placeholder skeleton must include data-load-layer="heavy"'
  );

  // 2.10 Table placeholders & EmptyState separation
  assert.ok(
    normFn.includes('isInitialLoading ?') && normFn.includes('EmptyState'),
    'Table placeholders must be rendered while isInitialLoading is true, distinct from EmptyState'
  );

  // 2.11 Capability flags reconciled to effectiveViewer
  assert.ok(
    /canManageEmployees\s*=\s*effectiveViewer\?\.role === 'Manager' \|\| effectiveViewer\?\.role === 'Leader'/.test(normFn),
    'canManageEmployees must be reconciled from effectiveViewer'
  );
  assert.ok(
    /canDeleteEmployees\s*=\s*effectiveViewer\?\.role === 'Manager'/.test(normFn),
    'canDeleteEmployees must be reconciled from effectiveViewer'
  );
  assert.ok(
    normFn.includes('restrictToTeamId={isLeader ? effectiveViewer?.teamId || null : null}'),
    'EmployeeModal restrictToTeamId must use effectiveViewer.teamId'
  );

  // 2.12 Preservation of links and actions
  assert.ok(
    /href=\{`\/evaluations\/\$\{item\.id\}`\}/.test(normFn),
    'Link to evaluation detail must remain preserved'
  );
  assert.ok(
    /DataTable/.test(normFn) && /EmptyState/.test(normFn) && /EmployeeModal/.test(normFn),
    'Core UI components (DataTable, EmptyState, EmployeeModal) must remain present'
  );
}

// -------------------------------------------------------------
// 3. Verify src/components/employees/EmployeeEvaluationCell.tsx
// -------------------------------------------------------------
{
  const code = readProjectFile('src/components/employees/EmployeeEvaluationCell.tsx');
  const cleanCode = stripComments(code);
  const normCode = normalizeWhitespace(cleanCode);

  // 3.1 Interface EmployeeEvaluationCellProps
  const propsInterface = extractInterface(code, 'EmployeeEvaluationCellProps');
  const propsBody = normalizeWhitespace(propsInterface);

  assert.ok(propsBody.includes('grade: string'), 'EmployeeEvaluationCellProps must declare grade: string');
  assert.ok(propsBody.includes('score: number'), 'EmployeeEvaluationCellProps must declare score: number');
  assert.ok(propsBody.includes('gradeRound: number | null'), 'EmployeeEvaluationCellProps must declare gradeRound: number | null');
  assert.ok(propsBody.includes('previousRoundScores:'), 'EmployeeEvaluationCellProps must declare previousRoundScores');
  assert.ok(propsBody.includes('hasFinalResult: boolean'), 'EmployeeEvaluationCellProps must declare hasFinalResult: boolean');
  assert.ok(propsBody.includes('evaluationLoading: boolean'), 'EmployeeEvaluationCellProps must declare evaluationLoading: boolean');
  assert.ok(propsBody.includes('evaluationError?: boolean'), 'EmployeeEvaluationCellProps must declare evaluationError?: boolean');
  assert.ok(propsBody.includes('employeeId: string'), 'EmployeeEvaluationCellProps must declare employeeId: string');
  assert.ok(propsBody.includes('onRetry?:'), 'EmployeeEvaluationCellProps must declare onRetry');

  // 3.2 Memoization & Client presentational
  assert.ok(
    normCode.includes("'use client'") || normCode.includes('"use client"'),
    'EmployeeEvaluationCell must be a client component'
  );
  assert.ok(
    normCode.includes('React.memo') || normCode.includes('memo('),
    'EmployeeEvaluationCell must be wrapped in React.memo'
  );

  // 3.3 Heavy marker
  assert.ok(
    normCode.includes('data-load-layer="heavy"'),
    'EmployeeEvaluationCell must render data-load-layer="heavy"'
  );

  // 3.4 Loading branch with Skeleton
  assert.ok(
    /if\s*\(\s*evaluationLoading\s*\)/.test(normCode),
    'EmployeeEvaluationCell must branch on evaluationLoading'
  );
  assert.ok(
    normCode.includes('<Skeleton') || normCode.includes('Skeleton'),
    'EmployeeEvaluationCell loading branch must render Skeleton'
  );

  // 3.5 Error branch with Retry
  assert.ok(
    /if\s*\(\s*evaluationError\s*\)/.test(normCode),
    'EmployeeEvaluationCell must branch on evaluationError'
  );
  assert.ok(
    normCode.includes('onRetry?.(employeeId)') || normCode.includes('onRetry(employeeId)'),
    'EmployeeEvaluationCell error branch must invoke onRetry with employeeId'
  );
  assert.ok(
    normCode.includes('Thử lại') && normCode.includes('Lỗi tải'),
    'EmployeeEvaluationCell error branch must render retry button and error text'
  );

  // 3.6 Loaded branch with GradeBadge and score display
  assert.ok(
    normCode.includes('<GradeBadge') && normCode.includes('grade={grade}'),
    'EmployeeEvaluationCell must render GradeBadge with grade'
  );
  assert.ok(
    normCode.includes('hasFinalResult') && normCode.includes('Check'),
    'EmployeeEvaluationCell must render checkmark when hasFinalResult is true'
  );
  assert.ok(
    normCode.includes('gradeRound') && normCode.includes('previousRoundScores'),
    'EmployeeEvaluationCell must render gradeRound and previousRoundScores'
  );

  // 3.7 Pure presentational: No data fetching hooks/actions
  assert.ok(
    !normCode.includes('useAuth') &&
      !normCode.includes('getUsersBatchAction') &&
      !normCode.includes('getEvaluationSummariesBatchAction') &&
      !normCode.includes('fetch('),
    'EmployeeEvaluationCell must be purely presentational without direct data fetching'
  );
}

console.log('Employee users-first regression tests: ALL PASS');
