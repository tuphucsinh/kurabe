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
// 1. Verify src/components/employees/EmployeesClient.tsx
// -------------------------------------------------------------
{
  const code = readProjectFile('src/components/employees/EmployeesClient.tsx');
  const cleanCode = stripComments(code);

  // 1.1 Interface EmployeeTableItem must include evaluationLoading
  const interfaceCode = extractInterface(code, 'EmployeeTableItem');
  const interfaceBody = normalizeWhitespace(interfaceCode);
  assert.ok(
    interfaceBody.includes('evaluationLoading: boolean'),
    'EmployeeTableItem must declare evaluationLoading: boolean'
  );

  // 1.2 EmployeesClient hook calls & loading gate
  const componentFn = extractFunction(code, 'EmployeesClient');
  const normFn = normalizeWhitespace(componentFn);

  // Must call useUsers, useTeams, useEvaluationSummaries
  assert.ok(
    /const\s*\{[^}]*data\s*:\s*users[^}]*isLoading\s*:\s*usersLoading[^}]*\}\s*=\s*useUsers\s*\(\s*user\s*\)/.test(normFn),
    'EmployeesClient must call useUsers(user) binding usersLoading'
  );
  assert.ok(
    /const\s*\{[^}]*data\s*:\s*teams[^}]*isLoading\s*:\s*teamsLoading[^}]*\}\s*=\s*useTeams\s*\(\s*user\s*\)/.test(normFn),
    'EmployeesClient must call useTeams(user) binding teamsLoading'
  );
  assert.ok(
    /const\s*\{[^}]*data\s*:\s*evaluations[^}]*isLoading\s*:\s*evalsLoading[^}]*\}\s*=\s*useEvaluationSummaries\s*\(\s*currentPeriod\?\.id\s*,\s*user\s*\)/.test(normFn),
    'EmployeesClient must call useEvaluationSummaries(currentPeriod?.id, user) binding evalsLoading'
  );

  // 1.3 Gate check: isLoading must block on usersLoading/teamsLoading/!user, but NOT on evalsLoading
  const isLoadingMatch = normFn.match(/const\s+isLoading\s*=\s*([^;]+);/);
  assert.ok(isLoadingMatch, 'EmployeesClient must declare const isLoading = ...');
  const isLoadingExpr = isLoadingMatch[1];

  assert.ok(
    isLoadingExpr.includes('usersLoading'),
    'isLoading must include usersLoading'
  );
  assert.ok(
    isLoadingExpr.includes('teamsLoading'),
    'isLoading must include teamsLoading'
  );
  assert.ok(
    isLoadingExpr.includes('!user'),
    'isLoading must include !user'
  );
  assert.ok(
    !isLoadingExpr.includes('evalsLoading'),
    'isLoading must NOT include evalsLoading (evaluation query must not block table render)'
  );

  // 1.4 employeesData useMemo must populate evaluationLoading and react to evalsLoading
  assert.ok(
    /evaluationLoading\s*:\s*evalsLoading/.test(normFn),
    'employeesData map must set evaluationLoading: evalsLoading'
  );

  const employeesDataMatch = cleanCode.match(/const\s+employeesData\s*=\s*useMemo\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\},\s*\[([\s\S]*?)\]\s*\);/);
  assert.ok(employeesDataMatch, 'employeesData useMemo declaration must exist');
  const employeesDataDeps = normalizeWhitespace(employeesDataMatch[1]);

  assert.ok(employeesDataDeps.includes('users'), 'employeesData deps must include users');
  assert.ok(employeesDataDeps.includes('teams'), 'employeesData deps must include teams');
  assert.ok(employeesDataDeps.includes('evaluations'), 'employeesData deps must include evaluations');
  assert.ok(employeesDataDeps.includes('evalsLoading'), 'employeesData deps must include evalsLoading');

  // 1.5 Evaluation column render branch must handle evaluationLoading
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

  // 1.6 Preservation of links and actions
  assert.ok(
    /href=\{`\/evaluations\/\$\{item\.id\}`\}/.test(normFn),
    'Link to evaluation detail must remain preserved'
  );
  assert.ok(
    /DataTable/.test(normFn) && /TableSkeleton/.test(normFn) && /EmptyState/.test(normFn),
    'Core UI components (DataTable, TableSkeleton, EmptyState) must remain present'
  );
}

console.log('Employee users-first regression tests: ALL PASS');
