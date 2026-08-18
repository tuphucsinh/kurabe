import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

import {
  sanitizeSearchTerm,
  validateAndDedupeUuids,
  isUuid,
  normalizeBatchParams,
  computeBatchResult,
  mergeUserBatches,
} from '../src/lib/employee-batch-helpers.ts';

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

// =========================================================================
// 1. Pure Helper Unit Tests
// =========================================================================

// 1.1 sanitizeSearchTerm
{
  assert.strictEqual(sanitizeSearchTerm(undefined), '');
  assert.strictEqual(sanitizeSearchTerm(null), '');
  assert.strictEqual(sanitizeSearchTerm('   '), '');
  assert.strictEqual(sanitizeSearchTerm('Nguyễn Văn A'), 'Nguyễn Văn A');
  assert.strictEqual(sanitizeSearchTerm('EMP-001'), 'EMP-001');

  // Strip PostgREST metacharacters
  assert.strictEqual(sanitizeSearchTerm('test,role.eq.Manager'), 'test role eq Manager');
  assert.strictEqual(sanitizeSearchTerm('user%name*(test)'), 'user name test');
  assert.strictEqual(sanitizeSearchTerm('drop table "users";--'), 'drop table users --');

  // Max 50 characters
  const longString = 'a'.repeat(80);
  assert.strictEqual(sanitizeSearchTerm(longString).length, 50);
}

// 1.2 validateAndDedupeUuids & isUuid
{
  const validUuid1 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const validUuid2 = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  const invalidUuid = 'not-a-uuid-123';

  assert.strictEqual(isUuid(validUuid1), true);
  assert.strictEqual(isUuid(invalidUuid), false);
  assert.strictEqual(isUuid(null), false);
  assert.strictEqual(isUuid(123), false);

  assert.deepStrictEqual(validateAndDedupeUuids([]), []);
  assert.deepStrictEqual(validateAndDedupeUuids([invalidUuid, '123']), []);
  assert.deepStrictEqual(
    validateAndDedupeUuids([validUuid1, validUuid1.toUpperCase(), validUuid2, invalidUuid]),
    [validUuid1.toLowerCase(), validUuid2.toLowerCase()]
  );

  // Cap at 20 UUIDs
  const manyUuids = Array.from({ length: 30 }, (_, i) =>
    `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  );
  const validatedMany = validateAndDedupeUuids(manyUuids);
  assert.strictEqual(validatedMany.length, 20);
}

// 1.3 normalizeBatchParams
{
  const p1 = normalizeBatchParams();
  assert.strictEqual(p1.limit, 20);
  assert.strictEqual(p1.offset, 0);
  assert.strictEqual(p1.search, undefined);
  assert.strictEqual(p1.teamId, undefined);
  assert.strictEqual(p1.role, undefined);

  // Hard cap limit at 20
  const p2 = normalizeBatchParams({ limit: 100, offset: -5 });
  assert.strictEqual(p2.limit, 20);
  assert.strictEqual(p2.offset, 0);

  const p3 = normalizeBatchParams({ limit: 15, offset: 40 });
  assert.strictEqual(p3.limit, 15);
  assert.strictEqual(p3.offset, 40);

  // Filter 'all'
  const p4 = normalizeBatchParams({ teamId: 'all', role: 'all', search: '  John Doe  ' });
  assert.strictEqual(p4.teamId, undefined);
  assert.strictEqual(p4.role, undefined);
  assert.strictEqual(p4.search, 'John Doe');

  const p5 = normalizeBatchParams({ teamId: 'team-uuid-1', role: 'Leader' });
  assert.strictEqual(p5.teamId, 'team-uuid-1');
  assert.strictEqual(p5.role, 'Leader');
}

// 1.4 computeBatchResult
{
  const items21 = Array.from({ length: 21 }, (_, i) => ({ id: `user-${i}` }));
  const res1 = computeBatchResult(items21, 20, 100, 0);
  assert.strictEqual(res1.hasMore, true);
  assert.strictEqual(res1.items.length, 20);
  assert.strictEqual(res1.totalCount, 100);

  const items15 = Array.from({ length: 15 }, (_, i) => ({ id: `user-${i}` }));
  const res2 = computeBatchResult(items15, 20, 15, 0);
  assert.strictEqual(res2.hasMore, false);
  assert.strictEqual(res2.items.length, 15);
  assert.strictEqual(res2.totalCount, 15);
}

// 1.5 mergeUserBatches
{
  const u1 = { id: 'u1', name: 'User 1', role: 'Employee', teamId: 't1', gender: 'Nữ', employeeCode: 'E1' };
  const u2 = { id: 'u2', name: 'User 2', role: 'Leader', teamId: 't1', gender: 'Nam', employeeCode: 'E2' };
  const u3 = { id: 'u3', name: 'User 3', role: 'SubLeader', teamId: 't1', gender: 'Nữ', employeeCode: 'E3' };

  const merged = mergeUserBatches([u1, u2], [u2, u3]);
  assert.strictEqual(merged.length, 3);
  assert.deepStrictEqual(merged.map((u) => u.id), ['u1', 'u2', 'u3']);
}

// =========================================================================
// 2. Structural & Contract Tests
// =========================================================================

// 2.1 src/lib/db/users-admin.ts
{
  const code = readProjectFile('src/lib/db/users-admin.ts');
  const fnCode = extractFunction(code, 'getUsersBatchAdmin');
  const normFn = normalizeWhitespace(fnCode);

  assert.ok(
    normFn.includes('normalizeBatchParams'),
    'getUsersBatchAdmin must normalize query parameters'
  );
  assert.ok(
    normFn.includes("order('name', { ascending: true })") &&
      normFn.includes("order('id', { ascending: true })"),
    'getUsersBatchAdmin must use stable fixed sort: name ASC, id ASC'
  );
  assert.ok(
    normFn.includes('range(offset, offset + limit)'),
    'getUsersBatchAdmin must query range(offset, offset + limit) to probe limit+1 rows'
  );
  assert.ok(
    normFn.includes('computeBatchResult'),
    'getUsersBatchAdmin must compute items, hasMore, totalCount'
  );
  assert.ok(
    normFn.includes("requester.role !== 'Manager'"),
    'getUsersBatchAdmin must enforce RBAC for non-Manager roles'
  );
  assert.ok(
    normFn.includes('!requester.teamId'),
    'getUsersBatchAdmin must fail closed for Leader/SubLeader missing teamId'
  );
}

// 2.2 src/lib/db/evaluations-admin.ts
{
  const code = readProjectFile('src/lib/db/evaluations-admin.ts');
  const fnCode = extractFunction(code, 'getEvaluationSummariesByEmployeeIdsAdmin');
  const normFn = normalizeWhitespace(fnCode);
  const normFullCode = normalizeWhitespace(stripComments(code));

  assert.ok(
    normFn.includes('validateAndDedupeUuids'),
    'getEvaluationSummariesByEmployeeIdsAdmin must validate and deduplicate employee IDs'
  );
  assert.ok(
    normFn.includes('EVALUATION_BATCH_SUMMARY_SELECT'),
    'getEvaluationSummariesByEmployeeIdsAdmin must use EVALUATION_BATCH_SUMMARY_SELECT batch projection'
  );
  assert.ok(
    normFn.includes('mapEvaluationBatchSummaryFromDb'),
    'getEvaluationSummariesByEmployeeIdsAdmin must map with mapEvaluationBatchSummaryFromDb'
  );
  assert.ok(
    normFn.includes('!requester.teamId'),
    'getEvaluationSummariesByEmployeeIdsAdmin must fail closed when Leader/SubLeader has no teamId'
  );
  assert.ok(
    normFn.includes('filterEvaluationsForViewer'),
    'getEvaluationSummariesByEmployeeIdsAdmin must run defense-in-depth viewer filtering'
  );
  assert.ok(
    normFullCode.includes('EVALUATION_SUMMARY_SELECT') &&
      normFullCode.includes('return_note'),
    'EVALUATION_SUMMARY_SELECT must remain intact and include return_note for full summary queries'
  );
  assert.ok(
    !normFullCode.match(/EVALUATION_BATCH_SUMMARY_SELECT[^;]*return_note/),
    'EVALUATION_BATCH_SUMMARY_SELECT must exclude return_note'
  );
  assert.ok(
    normFullCode.includes('mapEvaluationBatchSummaryFromDb') &&
      normFullCode.includes('returnNote: undefined'),
    'mapEvaluationBatchSummaryFromDb must not expose returnNote'
  );
}

// 2.3 src/actions/read.ts
{
  const code = readProjectFile('src/actions/read.ts');
  const getUsersBatchFn = extractFunction(code, 'getUsersBatchAction');
  const normUsersBatch = normalizeWhitespace(getUsersBatchFn);
  assert.ok(
    normUsersBatch.includes('requireAuth()'),
    'getUsersBatchAction must enforce requireAuth()'
  );
  assert.ok(
    normUsersBatch.includes('getUsersBatchAdmin'),
    'getUsersBatchAction must delegate to getUsersBatchAdmin'
  );

  const getEvalSummariesBatchFn = extractFunction(code, 'getEvaluationSummariesBatchAction');
  const normEvalBatch = normalizeWhitespace(getEvalSummariesBatchFn);
  assert.ok(
    normEvalBatch.includes('requireAuth()'),
    'getEvaluationSummariesBatchAction must enforce requireAuth()'
  );
  assert.ok(
    normEvalBatch.includes('getEvaluationSummariesByEmployeeIdsAdmin'),
    'getEvaluationSummariesByEmployeeIdsAdmin must delegate to getEvaluationSummariesByEmployeeIdsAdmin'
  );
}

// 2.4 src/components/employees/EmployeesClient.tsx
{
  const code = readProjectFile('src/components/employees/EmployeesClient.tsx');
  const normCode = normalizeWhitespace(stripComments(code));

  // Verify batch actions usage
  assert.ok(
    normCode.includes('getUsersBatchAction'),
    'EmployeesClient must call getUsersBatchAction for user batches'
  );
  assert.ok(
    normCode.includes('getEvaluationSummariesBatchAction'),
    'EmployeesClient must call getEvaluationSummariesBatchAction for evaluations batch'
  );

  // Verify effective viewer bootstrap snapshot & static shell (no whole-page loading gate)
  assert.ok(
    /effectiveViewer\s*=\s*authLoading\s*\?\s*\(contextUser\s*\?\?\s*initialViewer\)\s*:\s*contextUser/.test(normCode),
    'EmployeesClient must define bootstrap-only effectiveViewer from authLoading, contextUser, and initialViewer'
  );
  assert.ok(
    !/if\s*\(\s*(?:isLoading|isInitialLoading|teamsLoading)\s*\)\s*return\s*\(/.test(normCode),
    'EmployeesClient must render static shell unconditionally without whole-page loading return'
  );

  // Verify generation token usage
  assert.ok(
    normCode.includes('generationRef.current'),
    'EmployeesClient must use generation token to discard stale async responses'
  );

  // Verify period change / batch reset clears evaluation maps
  assert.ok(
    normCode.includes('setEvaluationsMap({})') &&
      normCode.includes('setEvalLoadingMap({})') &&
      normCode.includes('setEvalErrorMap({})'),
    'EmployeesClient must clear evaluationsMap, evalLoadingMap, and evalErrorMap before fetching initial batch on period/filter change'
  );

  // Verify Load More button and no numbered pagination
  assert.ok(
    normCode.includes('handleLoadMore'),
    'EmployeesClient must have handleLoadMore handler'
  );
  assert.ok(
    !normCode.includes('totalPages'),
    'EmployeesClient must not use numbered page pagination'
  );
  assert.ok(
    !normCode.includes('currentPage'),
    'EmployeesClient must not maintain currentPage numbered state'
  );

  // Verify evaluation cell & retry wiring
  assert.ok(
    normCode.includes('item.evaluationLoading'),
    'EmployeesClient grade column must pass item.evaluationLoading'
  );
  assert.ok(
    normCode.includes('item.evaluationError'),
    'EmployeesClient grade column must pass item.evaluationError'
  );
  assert.ok(
    normCode.includes('handleRetryEvaluation'),
    'EmployeesClient must provide evaluation retry function'
  );
  assert.ok(
    normCode.includes('EmployeeEvaluationCell'),
    'EmployeesClient must render EmployeeEvaluationCell'
  );

  // Verify observability markers
  assert.ok(
    normCode.includes('data-load-layer="shell"'),
    'EmployeesClient must include data-load-layer="shell"'
  );
  assert.ok(
    normCode.includes('data-load-layer="light"'),
    'EmployeesClient must include data-load-layer="light"'
  );
}

// 2.5 src/components/modals/EmployeeModal.tsx
{
  const code = readProjectFile('src/components/modals/EmployeeModal.tsx');
  const normCode = normalizeWhitespace(stripComments(code));

  assert.ok(
    normCode.includes('useTeamUsers'),
    'EmployeeModal must use useTeamUsers hook for authorized team member lookup'
  );
  assert.ok(
    normCode.includes('isTeamUsersLoading'),
    'EmployeeModal must handle loading state when fetching team users'
  );
}

console.log('Employee batch regression tests: ALL PASS');
