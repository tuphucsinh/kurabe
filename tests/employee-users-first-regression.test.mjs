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
  const regex = new RegExp(`(?:export\\s+(?:default\\s+)?)?function\\s+${functionName}\\s*\\([^)]*\\)[^{]*\\{`);
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

  // Must call useTeams with effectiveViewer
  assert.ok(
    /useTeams\s*\(\s*effectiveViewer\s*\)/.test(normFn),
    'EmployeesClient must call useTeams(effectiveViewer)'
  );
  assert.ok(
    normFn.includes('getUsersBatchAction'),
    'EmployeesClient must call getUsersBatchAction for users batch'
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

  // 2.8 Evaluation column render branch must handle evaluationLoading
  const gradeColumnMatch = cleanCode.match(/key\s*:\s*['"]grade['"][\s\S]*?render\s*:\s*\((?:item|[^)]+)\)\s*=>\s*\{([\s\S]*?)\}\s*,/);
  assert.ok(gradeColumnMatch, 'grade column with block body render function must exist');
  const gradeRenderBody = normalizeWhitespace(gradeColumnMatch[1]);

  // Must branch on item.evaluationLoading
  assert.ok(
    /if\s*\(\s*item\.evaluationLoading\s*\)/.test(gradeRenderBody),
    'grade column render must branch on item.evaluationLoading'
  );

  // Loading branch must render Skeleton and not fake data
  const loadingBranchMatch = gradeRenderBody.match(/if\s*\(\s*item\.evaluationLoading\s*\)\s*\{([\s\S]*?)\}/);
  assert.ok(loadingBranchMatch, 'item.evaluationLoading branch body must exist');
  const loadingBranchBody = loadingBranchMatch[1];

  assert.ok(
    loadingBranchBody.includes('<Skeleton') || loadingBranchBody.includes('Skeleton'),
    'Loading branch must render Skeleton component'
  );
  assert.ok(
    !loadingBranchBody.includes('<GradeBadge'),
    'Loading branch must not render loaded GradeBadge'
  );

  // Loaded/fallback branch must render GradeBadge and scores
  assert.ok(
    gradeRenderBody.includes('<GradeBadge'),
    'Non-loading branch must render GradeBadge'
  );
  assert.ok(
    gradeRenderBody.includes('item.grade'),
    'GradeBadge must receive item.grade'
  );
  assert.ok(
    gradeRenderBody.includes('item.score'),
    'Non-loading branch must render item.score'
  );

  // 2.9 Table placeholders & EmptyState separation
  assert.ok(
    normFn.includes('isInitialLoading ?') && normFn.includes('EmptyState'),
    'Table placeholders must be rendered while isInitialLoading is true, distinct from EmptyState'
  );

  // 2.10 Capability flags reconciled to effectiveViewer
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

  // 2.11 Preservation of links and actions
  assert.ok(
    /href=\{`\/evaluations\/\$\{item\.id\}`\}/.test(normFn),
    'Link to evaluation detail must remain preserved'
  );
  assert.ok(
    /DataTable/.test(normFn) && /EmptyState/.test(normFn) && /EmployeeModal/.test(normFn),
    'Core UI components (DataTable, EmptyState, EmployeeModal) must remain present'
  );
}

console.log('Employee users-first regression tests: ALL PASS');
