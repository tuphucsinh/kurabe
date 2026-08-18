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
  const regex = new RegExp(`(?:export\\s+(?:async\\s+)?)?function\\s+${functionName}\\s*\\([^)]*\\)[^{]*\\{`);
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

// 1. Verify src/actions/read.ts imports
{
  const code = readProjectFile('src/actions/read.ts');
  const cleanCode = stripComments(code);

  assert.ok(
    /import\s*\{[^}]*\bgetActivePeriod\b[^}]*\}\s*from\s*['"]@\/lib\/db\/evaluations['"]/.test(cleanCode),
    'src/actions/read.ts must import getActivePeriod from @/lib/db/evaluations'
  );

  assert.ok(
    /import\s*\{[^}]*\bgetEvaluationByEmployeeAdmin\b[^}]*\}\s*from\s*['"]@\/lib\/db\/evaluations-admin['"]/.test(cleanCode),
    'src/actions/read.ts must import getEvaluationByEmployeeAdmin from @/lib/db/evaluations-admin'
  );

  assert.ok(
    /import\s*\{[^}]*\brequireAuth\b[^}]*\}\s*from\s*['"]@\/lib\/auth['"]/.test(cleanCode),
    'src/actions/read.ts must import requireAuth from @/lib/auth'
  );
}

// 2. Scoped assertions on getEvaluationByEmployeeAction
{
  const code = readProjectFile('src/actions/read.ts');
  const fnCode = extractFunction(code, 'getEvaluationByEmployeeAction');
  const normFn = normalizeWhitespace(fnCode);

  // 2.1 Function signature check: employeeId (string), optional periodId (string)
  assert.ok(
    /function\s+getEvaluationByEmployeeAction\s*\(\s*employeeId\s*:\s*string\s*,\s*periodId\s*\?\s*:\s*string\s*\)/.test(normFn),
    'getEvaluationByEmployeeAction signature must accept (employeeId: string, periodId?: string)'
  );

  // 2.2 Must preserve requireAuth check and return null on error
  assert.ok(
    /const\s+auth\s*=\s*await\s+requireAuth\(\)/.test(normFn),
    'getEvaluationByEmployeeAction must call await requireAuth()'
  );
  assert.ok(
    /if\s*\(\s*auth\.error\s*!==\s*null\s*\)\s*\{\s*return\s+null;\s*\}/.test(normFn) ||
      /if\s*\(\s*auth\.error\s*\)\s*\{\s*return\s+null;\s*\}/.test(normFn),
    'getEvaluationByEmployeeAction must return null on auth error'
  );

  // 2.3 Must compute effectivePeriodId falling back to active period
  assert.ok(
    /effectivePeriodId\s*=\s*periodId\s*\?\?\s*\(await\s+getActivePeriod\(\)\)\?\.id/.test(normFn) ||
      /effectivePeriodId\s*=\s*periodId\s*\|\|\s*\(await\s+getActivePeriod\(\)\)\?\.id/.test(normFn),
    'getEvaluationByEmployeeAction must compute effectivePeriodId using periodId ?? (await getActivePeriod())?.id'
  );

  // 2.4 Must return null safely when no active period exists and periodId is omitted
  assert.ok(
    /if\s*\(\s*!effectivePeriodId\s*\)\s*\{\s*return\s+null;\s*\}/.test(normFn),
    'getEvaluationByEmployeeAction must return null when effectivePeriodId is falsy'
  );

  // 2.5 Must call getEvaluationByEmployeeAdmin with exact argument order: (employeeId, effectivePeriodId, auth.user)
  assert.ok(
    /return\s+getEvaluationByEmployeeAdmin\s*\(\s*employeeId\s*,\s*effectivePeriodId\s*,\s*auth\.user\s*\)/.test(normFn),
    'getEvaluationByEmployeeAction must return getEvaluationByEmployeeAdmin(employeeId, effectivePeriodId, auth.user)'
  );

  // 2.6 Must not pass raw unvalidated periodId to getEvaluationByEmployeeAdmin
  assert.ok(
    !/getEvaluationByEmployeeAdmin\s*\(\s*employeeId\s*,\s*periodId\s*,/.test(normFn),
    'getEvaluationByEmployeeAction must not pass raw unvalidated periodId to getEvaluationByEmployeeAdmin'
  );

  // 2.7 Strict execution order check
  const authIdx = normFn.indexOf('requireAuth()');
  const authGuardIdx = normFn.indexOf('return null', authIdx);
  const activePeriodIdx = normFn.indexOf('getActivePeriod()');
  const periodGuardIdx = normFn.indexOf('!effectivePeriodId');
  const periodGuardReturnIdx = normFn.indexOf('return null', periodGuardIdx);
  const adminCallIdx = normFn.indexOf('getEvaluationByEmployeeAdmin(');

  assert.ok(authIdx !== -1, 'requireAuth must exist in getEvaluationByEmployeeAction');
  assert.ok(authGuardIdx !== -1, 'auth error guard must return null');
  assert.ok(activePeriodIdx !== -1, 'getActivePeriod must exist in getEvaluationByEmployeeAction');
  assert.ok(periodGuardIdx !== -1, 'effectivePeriodId null check must exist');
  assert.ok(periodGuardReturnIdx !== -1, 'missing period guard must return null');
  assert.ok(adminCallIdx !== -1, 'getEvaluationByEmployeeAdmin call must exist');

  assert.ok(
    authIdx < authGuardIdx,
    'requireAuth must precede auth error guard'
  );
  assert.ok(
    authGuardIdx < activePeriodIdx,
    'auth guard must return before resolving active period'
  );
  assert.ok(
    activePeriodIdx < periodGuardIdx,
    'active period resolution must precede effectivePeriodId null check'
  );
  assert.ok(
    periodGuardIdx < periodGuardReturnIdx,
    'period check must precede period guard return null'
  );
  assert.ok(
    periodGuardReturnIdx < adminCallIdx,
    'effectivePeriodId guard must return before calling getEvaluationByEmployeeAdmin'
  );
}

// 3. Verify all other read actions remain intact without unintended alterations
{
  const code = readProjectFile('src/actions/read.ts');

  // Verify all exported actions exist
  const expectedActions = [
    'getCurrentUserAction',
    'getUsersAction',
    'getUserByIdAction',
    'getUsersByTeamAction',
    'getTeamsAction',
    'getTeamByIdAction',
    'getEvaluationsAction',
    'getEvaluationByIdAction',
    'getEvaluationByEmployeeAction',
    'getEvaluationHistoryAction',
    'getAuditLogsAction',
    'getGradeBandsAction',
    'getCriteriaForRoleAction'
  ];

  for (const actionName of expectedActions) {
    const fn = extractFunction(code, actionName);
    assert.ok(fn.length > 0, `Action ${actionName} must be present`);
  }

  // Specific contracts for sensitive actions
  const idFn = normalizeWhitespace(extractFunction(code, 'getEvaluationByIdAction'));
  assert.ok(
    /return\s+getEvaluationByIdAdmin\s*\(\s*id\s*,\s*auth\.user\s*\)/.test(idFn),
    'getEvaluationByIdAction must call getEvaluationByIdAdmin(id, auth.user)'
  );

  const historyFn = normalizeWhitespace(extractFunction(code, 'getEvaluationHistoryAction'));
  assert.ok(
    /return\s+getEvaluationHistoryByEmployeeAdmin\s*\(\s*employeeId\s*,\s*auth\.user\s*\)/.test(historyFn),
    'getEvaluationHistoryAction must call getEvaluationHistoryByEmployeeAdmin(employeeId, auth.user)'
  );

  const listFn = normalizeWhitespace(extractFunction(code, 'getEvaluationsAction'));
  assert.ok(
    /getEvaluationsByPeriodAdmin\s*\(\s*periodId\s*,\s*auth\.user\s*,\s*opts\s*\)/.test(listFn) &&
      /getEvaluationsAdmin\s*\(\s*auth\.user\s*,\s*opts\s*\)/.test(listFn),
    'getEvaluationsAction must preserve period-based and all-evaluations admin dispatch'
  );

  const auditCode = normalizeWhitespace(stripComments(code));
  assert.ok(
    /requireRole\s*\(\s*\[\s*['"]Manager['"]\s*\]\s*\)/.test(auditCode),
    'getAuditLogsAction must require Manager role'
  );
}

console.log('Evaluation read regression tests: ALL PASS');
