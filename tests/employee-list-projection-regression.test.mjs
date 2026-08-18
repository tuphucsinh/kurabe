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

// -------------------------------------------------------------
// 1. src/lib/db/evaluations-admin.ts
// -------------------------------------------------------------
{
  const code = readProjectFile('src/lib/db/evaluations-admin.ts');
  const cleanCode = stripComments(code);

  // 1.1 Must export summary functions
  assert.ok(
    /export\s+async\s+function\s+fetchEvaluationSummariesForViewerAdmin\b/.test(cleanCode),
    'src/lib/db/evaluations-admin.ts must export fetchEvaluationSummariesForViewerAdmin'
  );
  assert.ok(
    /export\s+async\s+function\s+getEvaluationSummariesAdmin\b/.test(cleanCode),
    'src/lib/db/evaluations-admin.ts must export getEvaluationSummariesAdmin'
  );
  assert.ok(
    /export\s+async\s+function\s+getEvaluationSummariesByPeriodAdmin\b/.test(cleanCode),
    'src/lib/db/evaluations-admin.ts must export getEvaluationSummariesByPeriodAdmin'
  );

  // 1.2 Summary query must NOT use wildcards
  const summaryFn = extractFunction(code, 'fetchEvaluationSummariesForViewerAdmin');
  const selectDeclMatch = cleanCode.match(
    /(?:const|let|var)\s+EVALUATION_SUMMARY_SELECT\s*=\s*['"`]([\s\S]*?)['"`];?/
  );
  assert.ok(
    selectDeclMatch,
    'src/lib/db/evaluations-admin.ts must declare EVALUATION_SUMMARY_SELECT constant'
  );
  const summarySelect = selectDeclMatch[1];

  assert.ok(
    !summaryFn.includes("select('*, evaluation_rounds(*)')") &&
      !summaryFn.includes("select('*')") &&
      !summaryFn.includes('evaluation_rounds(*)'),
    'fetchEvaluationSummariesForViewerAdmin must NOT use select("*") or evaluation_rounds(*)'
  );
  assert.ok(
    !summarySelect.includes('*') && !summarySelect.includes('evaluation_rounds(*)'),
    'EVALUATION_SUMMARY_SELECT must NOT include wildcard or evaluation_rounds(*)'
  );

  // 1.3 Must have explicit top-level and round summary projection
  const requiredTopColumns = [
    'id',
    'period_id',
    'employee_id',
    'employee_role',
    'team_id',
    'current_round',
    'status',
    'final_grade',
    'final_score',
    'updated_at',
  ];
  for (const col of requiredTopColumns) {
    assert.ok(
      summarySelect.includes(col),
      `Summary query projection must explicitly include top-level column: ${col}`
    );
  }

  const requiredRoundColumns = [
    'round',
    'evaluator_id',
    'evaluator_role',
    'status',
    'total_score',
    'grade',
    'submitted_at',
  ];
  for (const col of requiredRoundColumns) {
    assert.ok(
      summarySelect.includes(col),
      `Summary query projection must explicitly include round column: ${col}`
    );
  }

  // 1.4 Must NOT download round scores or notes in the summary query
  const roundMatch = summarySelect.match(/evaluation_rounds\(([^)]+)\)/);
  assert.ok(roundMatch, 'Summary query must specify explicit evaluation_rounds(...) projection');
  const roundFields = roundMatch[1];
  assert.ok(!/\bscores\b/.test(roundFields), 'evaluation_rounds projection must NOT include scores');
  assert.ok(!/\bnotes\b/.test(roundFields), 'evaluation_rounds projection must NOT include notes');

  // 1.5 Full evaluation paths remain intact
  assert.ok(
    /export\s+async\s+function\s+fetchEvaluationsForViewerAdmin\b/.test(cleanCode),
    'src/lib/db/evaluations-admin.ts must keep fetchEvaluationsForViewerAdmin for full reads'
  );
  assert.ok(
    /export\s+async\s+function\s+getEvaluationByIdAdmin\b/.test(cleanCode),
    'src/lib/db/evaluations-admin.ts must keep getEvaluationByIdAdmin for full detail reads'
  );
}

// -------------------------------------------------------------
// 2. src/actions/read.ts
// -------------------------------------------------------------
{
  const code = readProjectFile('src/actions/read.ts');
  const cleanCode = stripComments(code);

  // 2.1 Imports
  assert.ok(
    /import\s*\{[^}]*\bgetEvaluationSummariesByPeriodAdmin\b[^}]*\}\s*from\s*['"]@\/lib\/db\/evaluations-admin['"]/.test(cleanCode),
    'src/actions/read.ts must import getEvaluationSummariesByPeriodAdmin from @/lib/db/evaluations-admin'
  );

  // 2.2 Export getEvaluationSummariesAction
  assert.ok(
    /export\s+async\s+function\s+getEvaluationSummariesAction\b/.test(cleanCode),
    'src/actions/read.ts must export getEvaluationSummariesAction'
  );

  const actionFn = extractFunction(code, 'getEvaluationSummariesAction');
  const normAction = normalizeWhitespace(actionFn);

  assert.ok(
    /requireAuth\(\)/.test(normAction),
    'getEvaluationSummariesAction must call requireAuth()'
  );
  assert.ok(
    /getEvaluationSummariesByPeriodAdmin\s*\(\s*periodId\s*,\s*auth\.user\s*,\s*opts\s*\)/.test(normAction),
    'getEvaluationSummariesAction must delegate to getEvaluationSummariesByPeriodAdmin with periodId, user, opts'
  );
}

// -------------------------------------------------------------
// 3. src/hooks/use-db.ts
// -------------------------------------------------------------
{
  const code = readProjectFile('src/hooks/use-db.ts');
  const cleanCode = stripComments(code);

  assert.ok(
    /import\s*\{[^}]*\bgetEvaluationSummariesAction\b[^}]*\}\s*from\s*['"]@\/actions\/read['"]/.test(cleanCode),
    'src/hooks/use-db.ts must import getEvaluationSummariesAction from @/actions/read'
  );

  assert.ok(
    /export\s+const\s+useEvaluationSummaries\s*=/.test(cleanCode),
    'src/hooks/use-db.ts must export useEvaluationSummaries'
  );

  assert.ok(
    /export\s+const\s+useEvaluations\s*=/.test(cleanCode),
    'src/hooks/use-db.ts must keep useEvaluations exported'
  );
}

// -------------------------------------------------------------
// 4. src/components/employees/EmployeesClient.tsx
// -------------------------------------------------------------
{
  const code = readProjectFile('src/components/employees/EmployeesClient.tsx');
  const cleanCode = stripComments(code);

  // 4.1 Must NOT import old full list hooks (useEvaluations / useEvaluationSummaries)
  assert.ok(
    !/import\s*\{[^}]*\buseEvaluationSummaries\b[^}]*\}\s*from\s*['"]@\/hooks\/use-db['"]/.test(cleanCode),
    'EmployeesClient.tsx must NOT import old useEvaluationSummaries from @/hooks/use-db'
  );

  assert.ok(
    !/import\s*\{[^}]*\buseEvaluations\b[^}]*\}\s*from\s*['"]@\/hooks\/use-db['"]/.test(cleanCode),
    'EmployeesClient.tsx must NOT import useEvaluations from @/hooks/use-db'
  );

  // 4.2 Must import and use batch actions from @/actions/read
  assert.ok(
    /import\s*\{[^}]*\bgetUsersBatchAction\b[^}]*\}\s*from\s*['"]@\/actions\/read['"]/.test(cleanCode),
    'EmployeesClient.tsx must import getUsersBatchAction from @/actions/read'
  );

  assert.ok(
    /import\s*\{[^}]*\bgetEvaluationSummariesBatchAction\b[^}]*\}\s*from\s*['"]@\/actions\/read['"]/.test(cleanCode),
    'EmployeesClient.tsx must import getEvaluationSummariesBatchAction from @/actions/read'
  );

  const normCode = normalizeWhitespace(cleanCode);
  assert.ok(
    normCode.includes('getUsersBatchAction'),
    'EmployeesClient.tsx must call getUsersBatchAction'
  );
  assert.ok(
    normCode.includes('getEvaluationSummariesBatchAction'),
    'EmployeesClient.tsx must call getEvaluationSummariesBatchAction'
  );
}

console.log('Employee list projection regression tests: ALL PASS');
