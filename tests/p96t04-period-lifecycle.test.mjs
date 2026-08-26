/**
 * Focused Contract Test for P96T04: Atomic Period Lifecycle Candidates
 *
 * NOTE: Direct live database integration, migration execution, and live failure
 * injection testing are BLOCKED because direct pg_catalog/information_schema access
 * is unknown/blocked pending Management API privileges.
 * This test performs hermetic, side-effect-free contract assertions over SQL candidate
 * artifacts, rollback scripts, and TypeScript application action invariants.
 *
 * Run: node tests/p96t04-period-lifecycle.test.mjs
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const MIGRATION_PATH = path.join(projectRoot, 'supabase', 'migrations', '20260826010000_p96t04_atomic_period_lifecycle.sql');
const ROLLBACK_PATH = path.join(projectRoot, 'db', 'rollback-p96t04-atomic-period-lifecycle.sql');
const ACTIONS_PERIOD_PATH = path.join(projectRoot, 'src', 'actions', 'period.ts');

console.log('[BLOCKED] Direct live database integration and failure injection are BLOCKED pending Management API catalog privileges.');
console.log('[NOTE] Executing deterministic source-contract test for P96T04 artifacts & application invariants...');

// ============================================================
// 1. ARTIFACT EXISTENCE & CANDIDATE HEADERS
// ============================================================
assert.ok(fs.existsSync(MIGRATION_PATH), `Migration candidate must exist at: ${MIGRATION_PATH}`);
assert.ok(fs.existsSync(ROLLBACK_PATH), `Rollback candidate must exist at: ${ROLLBACK_PATH}`);
assert.ok(fs.existsSync(ACTIONS_PERIOD_PATH), `Actions period.ts must exist at: ${ACTIONS_PERIOD_PATH}`);

const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');
const actionsCode = fs.readFileSync(ACTIONS_PERIOD_PATH, 'utf8');

// Candidate markers
assert.ok(
  migrationSql.includes('CANDIDATE ONLY — NOT APPLIED') || migrationSql.includes('CANDIDATE ONLY'),
  'Migration SQL must explicitly declare CANDIDATE ONLY'
);
assert.ok(
  migrationSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL') || migrationSql.includes('APPROVAL'),
  'Migration SQL must note that live apply requires approval'
);
assert.ok(
  migrationSql.includes('P96T03') && (migrationSql.includes('prerequisite') || migrationSql.includes('Prerequisite Ordering')),
  'Migration SQL must note P96T03 single-active candidate prerequisite ordering'
);
assert.ok(
  rollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED') || rollbackSql.includes('ROLLBACK CANDIDATE ONLY'),
  'Rollback SQL must explicitly declare ROLLBACK CANDIDATE ONLY'
);

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

function getFunctionChunk(source, functionName) {
  const marker = `export async function ${functionName}`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  const nextExport = source.indexOf('export ', start + marker.length);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
}

// ============================================================
// 2. MIGRATION SQL CONTRACTS
// ============================================================
const cleanMigrationSql = stripSqlComments(migrationSql).trim();

// 2.1 Transaction wrapping
assert.ok(cleanMigrationSql.startsWith('BEGIN;'), 'Migration must start with BEGIN;');
assert.ok(cleanMigrationSql.endsWith('COMMIT;'), 'Migration must end with COMMIT;');

// 2.2 Collision checks & one-shot fail-closed creation
assert.ok(/DO\s+\$\$/i.test(cleanMigrationSql), 'Migration must contain explicit preflight collision check DO $$ block');
assert.ok(cleanMigrationSql.includes('COLLISION: Function public.create_evaluation_period_atomic already exists'), 'Preflight must check create_evaluation_period_atomic collision');
assert.ok(cleanMigrationSql.includes('COLLISION: Function public.delete_empty_evaluation_period_atomic already exists'), 'Preflight must check delete_empty_evaluation_period_atomic collision');
assert.ok(!/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(cleanMigrationSql), 'Migration must use fail-closed CREATE FUNCTION (NOT CREATE OR REPLACE FUNCTION)');

// 2.3 Exact function signatures
assert.ok(
  /CREATE\s+FUNCTION\s+public\.create_evaluation_period_atomic\s*\(\s*p_name\s+text\s*,\s*p_year\s+integer\s*,\s*p_created_by\s+uuid\s*,\s*p_created_at\s+timestamptz\s*,\s*p_evaluations\s+jsonb\s*,\s*p_rounds\s+jsonb\s*\)\s*RETURNS\s+uuid/i.test(cleanMigrationSql),
  'Migration must declare public.create_evaluation_period_atomic with exact parameter types and RETURNS uuid'
);
assert.ok(
  /CREATE\s+FUNCTION\s+public\.delete_empty_evaluation_period_atomic\s*\(\s*p_period_id\s+uuid\s*\)\s*RETURNS\s+jsonb/i.test(cleanMigrationSql),
  'Migration must declare public.delete_empty_evaluation_period_atomic(p_period_id uuid) RETURNS jsonb'
);

// 2.4 SECURITY DEFINER & fixed search_path = public
const funcBlocks = cleanMigrationSql.split(/CREATE\s+FUNCTION/i).slice(1);
assert.strictEqual(funcBlocks.length, 2, 'Migration must contain exactly 2 functions');

for (const block of funcBlocks) {
  assert.ok(/SECURITY\s+DEFINER/i.test(block), 'Both functions must declare SECURITY DEFINER');
  assert.ok(/SET\s+search_path\s*=\s*public/i.test(block), 'Both functions must declare SET search_path = public');
}

// 2.5 Permissions & Provenance markers
const CREATE_FN_TYPED = 'public.create_evaluation_period_atomic(text, integer, uuid, timestamptz, jsonb, jsonb)';
const DELETE_FN_TYPED = 'public.delete_empty_evaluation_period_atomic(uuid)';

const CREATE_PROVENANCE = 'kurabe:p96t04:candidate:v1:function:create_evaluation_period_atomic';
const DELETE_PROVENANCE = 'kurabe:p96t04:candidate:v1:function:delete_empty_evaluation_period_atomic';

assert.ok(migrationSql.includes(CREATE_PROVENANCE), `Migration must attach provenance marker: ${CREATE_PROVENANCE}`);
assert.ok(migrationSql.includes(DELETE_PROVENANCE), `Migration must attach provenance marker: ${DELETE_PROVENANCE}`);

function compactSqlWhitespace(sql) {
  return sql
    .replace(/\s+/g, ' ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

const compactMigrationSql = compactSqlWhitespace(cleanMigrationSql);
assert.ok(
  compactMigrationSql.includes(`REVOKE EXECUTE ON FUNCTION ${CREATE_FN_TYPED} FROM PUBLIC, anon, authenticated;`),
  'Migration must revoke execution on create_evaluation_period_atomic from PUBLIC, anon, authenticated'
);
assert.ok(
  compactMigrationSql.includes(`GRANT EXECUTE ON FUNCTION ${CREATE_FN_TYPED} TO service_role;`),
  'Migration must grant execution on create_evaluation_period_atomic to service_role'
);
assert.ok(
  compactMigrationSql.includes(`REVOKE EXECUTE ON FUNCTION ${DELETE_FN_TYPED} FROM PUBLIC, anon, authenticated;`),
  'Migration must revoke execution on delete_empty_evaluation_period_atomic from PUBLIC, anon, authenticated'
);
assert.ok(
  compactMigrationSql.includes(`GRANT EXECUTE ON FUNCTION ${DELETE_FN_TYPED} TO service_role;`),
  'Migration must grant execution on delete_empty_evaluation_period_atomic to service_role'
);

// 2.6 create_evaluation_period_atomic logic contracts
const createFnBody = funcBlocks[0];

// Input validations
assert.ok(/p_name\s+IS\s+NULL/i.test(createFnBody), 'create RPC must validate p_name');
assert.ok(/p_year\s+IS\s+NULL/i.test(createFnBody), 'create RPC must validate p_year');
assert.ok(/p_created_by\s+IS\s+NULL/i.test(createFnBody), 'create RPC must validate p_created_by');
assert.ok(/p_evaluations\s+IS\s+NULL/i.test(createFnBody) && /jsonb_typeof\(p_evaluations\)/i.test(createFnBody), 'create RPC must validate p_evaluations is jsonb array');
assert.ok(/p_rounds\s+IS\s+NULL/i.test(createFnBody) && /jsonb_typeof\(p_rounds\)/i.test(createFnBody), 'create RPC must validate p_rounds is jsonb array');

// Array count & duplicate employee validations
assert.ok(/jsonb_array_length/i.test(createFnBody), 'create RPC must check jsonb_array_length');
assert.ok(/P96T04_MISMATCH/i.test(createFnBody), 'create RPC must raise P96T04_MISMATCH on evaluation/round count difference');
assert.ok(/count\s*\(\s*DISTINCT/i.test(createFnBody), 'create RPC must check for duplicate employee IDs');
assert.ok(/P96T04_DUPLICATE_OR_NULL_EMPLOYEE_ID/i.test(createFnBody), 'create RPC must raise stable error on duplicate/null employee_id');
assert.ok(/EXCEPT/i.test(createFnBody) && /P96T04_EMPLOYEE_SET_MISMATCH/i.test(createFnBody), 'create RPC must verify exact match of employee IDs between evaluations and rounds');

// Period insert with status = active
assert.ok(/INSERT\s+INTO\s+public\.evaluation_periods/i.test(createFnBody), 'create RPC must insert into evaluation_periods');
assert.ok(/'active'/i.test(createFnBody), 'create RPC must insert period with status = active');
assert.ok(/RETURNING\s+id\s+INTO\s+v_period_id/i.test(createFnBody), 'create RPC must capture newly generated period id');

// Server-side assignment of period_id to evaluations and evaluations before rounds
assert.ok(
  /WITH\s+inserted_evals\s+AS\s*\(\s*INSERT\s+INTO\s+public\.evaluations/is.test(createFnBody),
  'create RPC must insert evaluations and pipe to rounds via CTE'
);
assert.ok(
  /INSERT\s+INTO\s+public\.evaluation_rounds/i.test(createFnBody),
  'create RPC must insert evaluation_rounds'
);
assert.ok(
  /JOIN\s+inserted_evals/i.test(createFnBody),
  'create RPC must join rounds with inserted evaluations'
);

// Zero direct evaluator workflow SQL (no role-branching SQL logic)
assert.ok(
  !/CASE\s+WHEN\s+.*?(?:role|evaluator).*?THEN/i.test(createFnBody),
  'create RPC must NOT reimplement evaluator workflow resolution in SQL'
);

// 2.7 delete_empty_evaluation_period_atomic logic contracts
const deleteFnBody = funcBlocks[1];

// Row-level lock FOR UPDATE
assert.ok(
  /SELECT\s+id,\s*status\s+INTO\s+v_period\s+FROM\s+public\.evaluation_periods\s+WHERE\s+id\s*=\s*p_period_id\s+FOR\s+UPDATE/i.test(deleteFnBody),
  'delete RPC must lock exact period row FOR UPDATE'
);
assert.ok(deleteFnBody.includes("'NOT_FOUND'"), 'delete RPC must return NOT_FOUND on missing period');
assert.ok(deleteFnBody.includes("'NOT_CLOSED'"), 'delete RPC must return NOT_CLOSED on non-closed period');

// Under lock count evaluations and ai_summaries
assert.ok(
  /SELECT\s+count\(\*\)\s+INTO\s+v_eval_count\s+FROM\s+public\.evaluations\s+WHERE\s+period_id\s*=\s*p_period_id/i.test(deleteFnBody),
  'delete RPC must count evaluations for period'
);
assert.ok(
  /SELECT\s+count\(\*\)\s+INTO\s+v_ai_count\s+FROM\s+public\.ai_summaries\s+WHERE\s+period_id\s*=\s*p_period_id/i.test(deleteFnBody),
  'delete RPC must count ai_summaries for period'
);
assert.ok(deleteFnBody.includes("'HAS_DATA'"), 'delete RPC must return HAS_DATA when evaluation_count > 0 or ai_summary_count > 0');

// Exact empty period delete and row count check
assert.ok(
  /DELETE\s+FROM\s+public\.evaluation_periods\s+WHERE\s+id\s*=\s*p_period_id/i.test(deleteFnBody),
  'delete RPC must delete from evaluation_periods'
);
assert.ok(
  /GET\s+DIAGNOSTICS\s+v_deleted_count\s*=\s*ROW_COUNT/i.test(deleteFnBody),
  'delete RPC must verify affected row count'
);
assert.ok(
  /v_deleted_count\s*!=\s*1/i.test(deleteFnBody),
  'delete RPC must fail closed if affected row count is not exactly 1'
);

// Zero child table deletes in RPC
assert.ok(!/DELETE\s+FROM\s+public\.evaluations/i.test(deleteFnBody), 'delete RPC must NOT delete from evaluations');
assert.ok(!/DELETE\s+FROM\s+public\.evaluation_rounds/i.test(deleteFnBody), 'delete RPC must NOT delete from evaluation_rounds');
assert.ok(!/DELETE\s+FROM\s+public\.ai_summaries/i.test(deleteFnBody), 'delete RPC must NOT delete from ai_summaries');

// ============================================================
// 3. ROLLBACK SQL CONTRACTS
// ============================================================
const cleanRollbackSql = stripSqlComments(rollbackSql).trim();

// 3.1 Transaction wrapping
assert.ok(cleanRollbackSql.startsWith('BEGIN;'), 'Rollback must start with BEGIN;');
assert.ok(cleanRollbackSql.endsWith('COMMIT;'), 'Rollback must end with COMMIT;');

// 3.2 External GUC Approval Guard
assert.ok(
  /current_setting\(\s*'kurabe\.p96t04_rollback_approved'\s*,\s*true\s*\)/i.test(cleanRollbackSql),
  'Rollback must inspect custom GUC kurabe.p96t04_rollback_approved'
);
assert.ok(cleanRollbackSql.includes('ROLLBACK_UNAPPROVED'), 'Rollback must fail closed on unapproved execution');
assert.ok(
  !/SET\s+kurabe\.p96t04_rollback_approved/i.test(cleanRollbackSql),
  'Rollback must NEVER set kurabe.p96t04_rollback_approved internally'
);

// 3.3 Provenance inspection & exact signatures
assert.ok(rollbackSql.includes(CREATE_PROVENANCE), 'Rollback must verify create function provenance marker');
assert.ok(rollbackSql.includes(DELETE_PROVENANCE), 'Rollback must verify delete function provenance marker');
assert.ok(rollbackSql.includes('PROVENANCE_MISMATCH'), 'Rollback must raise PROVENANCE_MISMATCH on unowned objects');

assert.ok(
  rollbackSql.includes(`DROP FUNCTION ${CREATE_FN_TYPED}`),
  `Rollback must drop exact typed signature: ${CREATE_FN_TYPED}`
);
assert.ok(
  rollbackSql.includes(`DROP FUNCTION ${DELETE_FN_TYPED}`),
  `Rollback must drop exact typed signature: ${DELETE_FN_TYPED}`
);

// 3.4 Prohibit silent unowned IF EXISTS in drop statements
assert.ok(
  !/DROP\s+FUNCTION\s+IF\s+EXISTS/i.test(cleanRollbackSql),
  'Rollback must not use DROP FUNCTION IF EXISTS which bypasses provenance verification'
);

// 3.5 Prohibit destructive data mutations
assert.ok(!/\bDELETE\s+FROM\b/i.test(cleanRollbackSql), 'Rollback must NOT delete from any table');
assert.ok(!/\bUPDATE\b/i.test(cleanRollbackSql), 'Rollback must NOT update any table');
assert.ok(!/\bTRUNCATE\b/i.test(cleanRollbackSql), 'Rollback must NOT truncate any table');
assert.ok(!/\bDROP\s+TABLE\b/i.test(cleanRollbackSql), 'Rollback must NOT drop any table');
assert.ok(!/\bDROP\s+SCHEMA\b/i.test(cleanRollbackSql), 'Rollback must NOT drop any schema');

// ============================================================
// 4. APPLICATION ACTIONS CONTRACTS (src/actions/period.ts)
// ============================================================

// 4.1 createEvaluationPeriod invariants
const createChunk = getFunctionChunk(actionsCode, 'createEvaluationPeriod');
assert.ok(createChunk.length > 0, 'createEvaluationPeriod must exist in src/actions/period.ts');

assert.ok(createChunk.includes('requireManager()'), 'createEvaluationPeriod must require Manager role');
assert.ok(createChunk.includes('resolveEvaluatorFromList'), 'createEvaluationPeriod must preserve evaluator resolution in TypeScript');
assert.ok(createChunk.includes('getEvaluationFlow'), 'createEvaluationPeriod must preserve workflow flow resolution in TypeScript');
assert.ok(createChunk.includes('loadTeamLeaderIds'), 'createEvaluationPeriod must load team leader IDs in TypeScript');

// Typed RPC invocation
assert.ok(
  createChunk.includes("'create_evaluation_period_atomic'"),
  'createEvaluationPeriod must call create_evaluation_period_atomic RPC'
);
assert.ok(createChunk.includes('p_name: periodName'), 'create RPC payload must pass p_name');
assert.ok(createChunk.includes('p_year: year'), 'create RPC payload must pass p_year');
assert.ok(createChunk.includes('p_created_by: managerId'), 'create RPC payload must pass p_created_by');
assert.ok(createChunk.includes('p_evaluations: evaluationsPayload'), 'create RPC payload must pass p_evaluations');
assert.ok(createChunk.includes('p_rounds: roundsPayload'), 'create RPC payload must pass p_rounds');

// RPC error handling & single active conflict classification
assert.ok(
  createChunk.includes('23505') && createChunk.includes('isSingleActiveConflict'),
  'createEvaluationPeriod must handle 23505 unique conflict for active periods'
);
assert.ok(
  createChunk.includes('toClientError'),
  'createEvaluationPeriod must sanitize errors with toClientError'
);
assert.ok(
  createChunk.includes('!periodId') && createChunk.includes("typeof periodId !== 'string'"),
  'createEvaluationPeriod must validate returned periodId UUID'
);

// Empty employees handling
assert.ok(
  createChunk.includes('periodEmployees.length === 0') && createChunk.includes('Kỳ đánh giá đã được tạo nhưng không có nhân viên nào để khởi tạo.'),
  'createEvaluationPeriod must preserve empty-period user message'
);

// Revalidation & Audit
assert.ok(createChunk.includes('revalidatePeriodPaths()'), 'createEvaluationPeriod must revalidate paths');
assert.ok(createChunk.includes("logAudit(auth.user, 'CREATE_PERIOD', 'period', periodId"), 'createEvaluationPeriod must log audit');

// Zero independent insert sequences in createEvaluationPeriod
assert.ok(
  !/\.from\(['"]evaluation_periods['"]\)\s*\.insert/i.test(createChunk),
  'createEvaluationPeriod must NOT call evaluation_periods.insert directly'
);
assert.ok(
  !/\.from\(['"]evaluations['"]\)\s*\.insert/i.test(createChunk),
  'createEvaluationPeriod must NOT call evaluations.insert directly'
);
assert.ok(
  !/\.from\(['"]evaluation_rounds['"]\)\s*\.insert/i.test(createChunk),
  'createEvaluationPeriod must NOT call evaluation_rounds.insert directly'
);

// 4.2 deleteEvaluationPeriod invariants
const deleteChunk = getFunctionChunk(actionsCode, 'deleteEvaluationPeriod');
assert.ok(deleteChunk.length > 0, 'deleteEvaluationPeriod must exist in src/actions/period.ts');

assert.ok(deleteChunk.includes('requireManager()'), 'deleteEvaluationPeriod must require Manager role');
assert.ok(/!periodId/.test(deleteChunk), 'deleteEvaluationPeriod must validate periodId input');

// Calls atomic delete RPC
assert.ok(
  deleteChunk.includes("'delete_empty_evaluation_period_atomic'"),
  'deleteEvaluationPeriod must call delete_empty_evaluation_period_atomic RPC'
);

// Reason mappings
assert.ok(
  deleteChunk.includes("rpcData.reason === 'NOT_FOUND'") && deleteChunk.includes('Không tìm thấy kỳ đánh giá.'),
  'deleteEvaluationPeriod must map NOT_FOUND to stable Vietnamese message'
);
assert.ok(
  deleteChunk.includes("rpcData.reason === 'NOT_CLOSED'") && deleteChunk.includes('Kỳ đang Active — hãy "Đóng kỳ" trước khi xóa để tránh mất dữ liệu đang chấm.'),
  'deleteEvaluationPeriod must map NOT_CLOSED to stable Vietnamese message'
);
assert.ok(
  deleteChunk.includes("rpcData.reason === 'HAS_DATA'") && deleteChunk.includes('Không thể xóa kỳ đánh giá đã có dữ liệu'),
  'deleteEvaluationPeriod must map HAS_DATA to stable Vietnamese message'
);

// Revalidation & Audit
assert.ok(deleteChunk.includes('revalidatePeriodPaths()'), 'deleteEvaluationPeriod must revalidate paths');
assert.ok(deleteChunk.includes("logAudit(auth.user, 'DELETE_PERIOD', 'period', periodId)"), 'deleteEvaluationPeriod must log audit');

// Zero direct table deletes in deleteEvaluationPeriod
assert.ok(
  !/\.from\([^)]+\)\s*\.delete\(\)/i.test(deleteChunk),
  'deleteEvaluationPeriod must NOT perform any direct .delete() database queries'
);
assert.ok(
  !/\.from\(['"]evaluation_periods['"]\)\s*\.select/i.test(deleteChunk),
  'deleteEvaluationPeriod must NOT perform pre-read select queries (lock and check belong in RPC)'
);

// 4.3 Preserved exports
assert.ok(
  actionsCode.includes('export const deleteEvaluationPeriodAction = deleteEvaluationPeriod;'),
  'period.ts must export deleteEvaluationPeriodAction alias'
);
assert.ok(
  actionsCode.includes('export async function closeEvaluationPeriod'),
  'period.ts must preserve closeEvaluationPeriod'
);
assert.ok(
  actionsCode.includes('export async function savePeriodTarget'),
  'period.ts must preserve savePeriodTarget'
);

console.log('[PASS] Deterministic source/SQL contract tests passed for all P96T04 artifacts and application action invariants.');
