/**
 * Focused Contract Test for P96T05: Closed-Period Write Firewall Candidate
 *
 * NOTE: Direct live database integration, migration execution, and live failure
 * injection testing are BLOCKED because direct pg_catalog/information_schema access
 * is unknown/blocked pending Management API privileges.
 * This test performs hermetic, side-effect-free contract assertions over SQL candidate
 * artifacts, rollback scripts, and TypeScript application action invariants.
 *
 * Run: node tests/p96t05-closed-period-write-firewall.test.mjs
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const GUARD_PATH = path.join(projectRoot, 'src', 'lib', 'db', 'evaluation-period-write-guard.ts');
const ACTIONS_EVALUATION_PATH = path.join(projectRoot, 'src', 'actions', 'evaluation.ts');
const ACTIONS_AI_PATH = path.join(projectRoot, 'src', 'actions', 'ai.ts');
const ACTIONS_AI_SUMMARY_PATH = path.join(projectRoot, 'src', 'actions', 'ai-summary.ts');
const EVALUATIONS_WRITE_PATH = path.join(projectRoot, 'src', 'lib', 'db', 'evaluations-write.ts');
const MIGRATION_PATH = path.join(projectRoot, 'supabase', 'migrations', '20260826020000_p96t05_closed_period_write_firewall.sql');
const ROLLBACK_PATH = path.join(projectRoot, 'db', 'rollback-p96t05-closed-period-write-firewall.sql');

console.log('[BLOCKED] Direct live database integration, migration execution, and race/failure injection are BLOCKED pending Management API catalog privileges.');
console.log('[NOTE] Executing deterministic source-contract test for P96T05 artifacts & application invariants...');

// ============================================================
// 1. ARTIFACT EXISTENCE & CANDIDATE HEADERS
// ============================================================
assert.ok(fs.existsSync(GUARD_PATH), `Shared guard must exist at: ${GUARD_PATH}`);
assert.ok(fs.existsSync(ACTIONS_EVALUATION_PATH), `Actions evaluation.ts must exist at: ${ACTIONS_EVALUATION_PATH}`);
assert.ok(fs.existsSync(ACTIONS_AI_PATH), `Actions ai.ts must exist at: ${ACTIONS_AI_PATH}`);
assert.ok(fs.existsSync(ACTIONS_AI_SUMMARY_PATH), `Actions ai-summary.ts must exist at: ${ACTIONS_AI_SUMMARY_PATH}`);
assert.ok(fs.existsSync(EVALUATIONS_WRITE_PATH), `Evaluations write must exist at: ${EVALUATIONS_WRITE_PATH}`);
assert.ok(fs.existsSync(MIGRATION_PATH), `Migration candidate must exist at: ${MIGRATION_PATH}`);
assert.ok(fs.existsSync(ROLLBACK_PATH), `Rollback candidate must exist at: ${ROLLBACK_PATH}`);

const guardCode = fs.readFileSync(GUARD_PATH, 'utf8');
const evaluationCode = fs.readFileSync(ACTIONS_EVALUATION_PATH, 'utf8');
const aiCode = fs.readFileSync(ACTIONS_AI_PATH, 'utf8');
const aiSummaryCode = fs.readFileSync(ACTIONS_AI_SUMMARY_PATH, 'utf8');
const evaluationsWriteCode = fs.readFileSync(EVALUATIONS_WRITE_PATH, 'utf8');
const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');

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
  migrationSql.includes('P3') && (migrationSql.includes('prerequisite') || migrationSql.includes('Prerequisite Ordering')),
  'Migration SQL must note P3 transactional RPC prerequisite ordering'
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
// 2. SHARED GUARD FILE CONTRACTS (src/lib/db/evaluation-period-write-guard.ts)
// ============================================================
assert.ok(
  guardCode.startsWith("import 'server-only';") || guardCode.includes("import 'server-only';"),
  'Shared guard module must be marked server-only'
);
assert.ok(
  guardCode.includes('export const CLOSED_PERIOD_WRITE_ERROR'),
  'Shared guard module must export CLOSED_PERIOD_WRITE_ERROR'
);
assert.ok(
  guardCode.includes('export async function assertEvaluationPeriodActive'),
  'Shared guard module must export assertEvaluationPeriodActive helper'
);
assert.ok(
  guardCode.includes('export async function assertEvaluationPeriodActiveForEvaluation'),
  'Shared guard module must export assertEvaluationPeriodActiveForEvaluation helper'
);
assert.ok(
  guardCode.includes(".eq('status', 'active')") || guardCode.includes("data.status !== 'active'") || guardCode.includes("data.status === 'active'"),
  'Shared guard must strictly check lowercase raw active status'
);
assert.ok(
  guardCode.includes('supabaseAdmin'),
  'Shared guard must use supabaseAdmin service client'
);

// ============================================================
// 3. APPLICATION CALLER COVERAGE CONTRACTS
// ============================================================

// 3.1 src/actions/evaluation.ts
assert.ok(
  evaluationCode.includes("from '@/lib/db/evaluation-period-write-guard'") ||
  evaluationCode.includes('assertEvaluationPeriodActiveForEvaluation'),
  'evaluation.ts must import evaluation-period-write-guard'
);

// saveEvaluationRound
const saveRoundChunk = getFunctionChunk(evaluationCode, 'saveEvaluationRound');
assert.ok(saveRoundChunk.length > 0, 'saveEvaluationRound must exist');
assert.ok(
  saveRoundChunk.includes('assertEvaluationPeriodActiveForEvaluation(evaluationId)'),
  'saveEvaluationRound must guard period before direct write or RPC'
);
assert.ok(
  saveRoundChunk.includes("'save_evaluation_round_transaction_active_only'"),
  'saveEvaluationRound must call save_evaluation_round_transaction_active_only RPC in feature flag branch'
);
assert.ok(
  !saveRoundChunk.includes("'save_evaluation_round_transaction',"),
  'saveEvaluationRound must NOT call unguarded old save_evaluation_round_transaction RPC directly'
);
// Guard must precede updates
const guardPosInSave = saveRoundChunk.indexOf('assertEvaluationPeriodActiveForEvaluation');
const updatePosInSave = saveRoundChunk.indexOf('.update(');
assert.ok(
  guardPosInSave !== -1 && guardPosInSave < updatePosInSave,
  'saveEvaluationRound guard must precede any .update() calls'
);

// initializeEvaluationRoundDraft
const initDraftChunk = getFunctionChunk(evaluationCode, 'initializeEvaluationRoundDraft');
assert.ok(initDraftChunk.length > 0, 'initializeEvaluationRoundDraft must exist');
assert.ok(
  initDraftChunk.includes('assertEvaluationPeriodActiveForEvaluation(evaluationId)'),
  'initializeEvaluationRoundDraft must guard period before draft initialization'
);
const guardPosInInit = initDraftChunk.indexOf('assertEvaluationPeriodActiveForEvaluation');
const updatePosInInit = initDraftChunk.indexOf('.update(');
assert.ok(
  guardPosInInit !== -1 && guardPosInInit < updatePosInInit,
  'initializeEvaluationRoundDraft guard must precede any .update() calls'
);
assert.ok(
  initDraftChunk.includes('return { success: false, error: periodGuard.error };') ||
  initDraftChunk.includes('return { success: false, error:'),
  'initializeEvaluationRoundDraft must return fail-closed error on period failure'
);

// returnEvaluationRound
const returnRoundChunk = getFunctionChunk(evaluationCode, 'returnEvaluationRound');
assert.ok(returnRoundChunk.length > 0, 'returnEvaluationRound must exist');
assert.ok(
  returnRoundChunk.includes('assertEvaluationPeriodActiveForEvaluation(evaluationId)'),
  'returnEvaluationRound must guard period before any update or unlock'
);
const guardPosInReturn = returnRoundChunk.indexOf('assertEvaluationPeriodActiveForEvaluation');
const updatePosInReturn = returnRoundChunk.indexOf('.update(');
assert.ok(
  guardPosInReturn !== -1 && guardPosInReturn < updatePosInReturn,
  'returnEvaluationRound guard must precede any .update() calls'
);

// 3.2 src/actions/ai.ts
assert.ok(
  aiCode.includes("from '@/lib/db/evaluation-period-write-guard'") ||
  aiCode.includes('assertEvaluationPeriodActiveForEvaluation'),
  'ai.ts must import evaluation-period-write-guard'
);

// saveResultMessageAction
const saveResultMsgChunk = getFunctionChunk(aiCode, 'saveResultMessageAction');
assert.ok(saveResultMsgChunk.length > 0, 'saveResultMessageAction must exist');
assert.ok(
  saveResultMsgChunk.includes('assertEvaluationPeriodActiveForEvaluation(input.evaluationId)'),
  'saveResultMessageAction must guard period before update'
);
const guardPosInSaveMsg = saveResultMsgChunk.indexOf('assertEvaluationPeriodActiveForEvaluation');
const updatePosInSaveMsg = saveResultMsgChunk.indexOf('.update(');
assert.ok(
  guardPosInSaveMsg !== -1 && guardPosInSaveMsg < updatePosInSaveMsg,
  'saveResultMessageAction guard must precede .update() call'
);

// Read-only functions in ai.ts must NOT write
const explainChunk = getFunctionChunk(aiCode, 'explainAnomalyAction');
assert.ok(!explainChunk.includes('.update(') && !explainChunk.includes('.insert(') && !explainChunk.includes('.upsert('), 'explainAnomalyAction must remain read-only');

const draftChunk = getFunctionChunk(aiCode, 'draftResultMessageAction');
assert.ok(!draftChunk.includes('.update(') && !draftChunk.includes('.insert(') && !draftChunk.includes('.upsert('), 'draftResultMessageAction must remain read-only');

const minutesChunk = getFunctionChunk(aiCode, 'generatePeriodMinutesAction');
assert.ok(!minutesChunk.includes('.update(') && !minutesChunk.includes('.insert(') && !minutesChunk.includes('.upsert('), 'generatePeriodMinutesAction must remain read-only');

// 3.3 src/actions/ai-summary.ts
assert.ok(
  aiSummaryCode.includes("from '@/lib/db/evaluation-period-write-guard'") ||
  aiSummaryCode.includes('assertEvaluationPeriodActive'),
  'ai-summary.ts must import evaluation-period-write-guard'
);

// generatePeriodSummary
const genSummaryChunk = getFunctionChunk(aiSummaryCode, 'generatePeriodSummary');
assert.ok(genSummaryChunk.length > 0, 'generatePeriodSummary must exist');
assert.ok(
  genSummaryChunk.includes('assertEvaluationPeriodActive(periodId)'),
  'generatePeriodSummary must guard active period'
);
const upsertPosInGenSummary = genSummaryChunk.indexOf('.upsert(');
assert.ok(
  upsertPosInGenSummary !== -1,
  'generatePeriodSummary must contain upsert'
);
const guardCountInSummary = (genSummaryChunk.match(/assertEvaluationPeriodActive/g) || []).length;
assert.ok(
  guardCountInSummary >= 1,
  'generatePeriodSummary must invoke assertEvaluationPeriodActive'
);

// getPeriodSummary must remain read-only
const getSummaryChunk = getFunctionChunk(aiSummaryCode, 'getPeriodSummary');
assert.ok(!getSummaryChunk.includes('.upsert(') && !getSummaryChunk.includes('.insert(') && !getSummaryChunk.includes('.update(') && !getSummaryChunk.includes('.delete('), 'getPeriodSummary must remain read-only');

// 3.4 src/lib/db/evaluations-write.ts
assert.ok(
  evaluationsWriteCode.includes("from './evaluation-period-write-guard'") ||
  evaluationsWriteCode.includes('assertEvaluationPeriodActive'),
  'evaluations-write.ts must import evaluation-period-write-guard'
);
assert.ok(
  evaluationsWriteCode.includes('result.errors.push'),
  'ensureEvaluationsForUsers must push errors on missing or closed active period'
);
assert.ok(
  evaluationsWriteCode.includes('resolveEvaluatorFromList'),
  'ensureEvaluationsForUsers must preserve evaluator resolution in TypeScript'
);
assert.ok(
  evaluationsWriteCode.includes('.limit(2)') && evaluationsWriteCode.includes('activePeriods.length !== 1'),
  'ensureEvaluationsForUsers must fail closed on zero or multiple Active periods'
);

// ============================================================
// 4. MIGRATION SQL CONTRACTS
// ============================================================
const cleanMigrationSql = stripSqlComments(migrationSql).trim();

// 4.1 Transaction wrapping
assert.ok(cleanMigrationSql.startsWith('BEGIN;'), 'Migration must start with BEGIN;');
assert.ok(cleanMigrationSql.endsWith('COMMIT;'), 'Migration must end with COMMIT;');

// 4.2 Preflight checks
assert.ok(/DO\s+\$\$/i.test(cleanMigrationSql), 'Migration must contain explicit preflight collision check DO $$ block');
assert.ok(
  cleanMigrationSql.includes('public.save_evaluation_round_transaction(') &&
  cleanMigrationSql.includes('kurabe:p3:candidate:v1:function:save_evaluation_round_transaction'),
  'Migration preflight must verify prerequisite P3 function existence and provenance marker'
);
assert.ok(
  cleanMigrationSql.includes('COLLISION: Function public.save_evaluation_round_transaction_active_only already exists'),
  'Migration preflight must check wrapper collision fail-closed'
);

// 4.3 Exact function signature and shape
const WRAPPER_FN_DECL = 'CREATE FUNCTION public.save_evaluation_round_transaction_active_only';
assert.ok(cleanMigrationSql.includes(WRAPPER_FN_DECL), `Migration must contain ${WRAPPER_FN_DECL}`);

const WRAPPER_TYPED_SIGNATURE = 'public.save_evaluation_round_transaction_active_only(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)';
const WRAPPER_PROVENANCE = 'kurabe:p96t05:candidate:v1:function:save_evaluation_round_transaction_active_only';

assert.ok(migrationSql.includes(WRAPPER_PROVENANCE), `Migration must attach provenance marker: ${WRAPPER_PROVENANCE}`);
assert.ok(/SECURITY\s+DEFINER/i.test(cleanMigrationSql), 'Wrapper function must declare SECURITY DEFINER');
assert.ok(/SET\s+search_path\s*=\s*public/i.test(cleanMigrationSql), 'Wrapper function must declare SET search_path = public');

// 4.4 Lock and active check logic
assert.ok(
  /FOR\s+UPDATE\s+OF\s+ep/i.test(cleanMigrationSql),
  'Wrapper function must lock parent period row with FOR UPDATE OF ep'
);
assert.ok(
  /v_period_status\s+IS\s+DISTINCT\s+FROM\s+'active'/i.test(cleanMigrationSql),
  "Wrapper function must fail closed unless status is exact 'active'"
);
assert.ok(
  cleanMigrationSql.includes('P96T05_PERIOD_NOT_ACTIVE'),
  'Wrapper function must raise stable exception P96T05_PERIOD_NOT_ACTIVE'
);

// 4.5 Delegation to P3 function
assert.ok(
  /RETURN\s+QUERY\s+SELECT\s+\*\s+FROM\s+public\.save_evaluation_round_transaction\s*\(/is.test(cleanMigrationSql),
  'Wrapper function must delegate in-transaction to public.save_evaluation_round_transaction'
);

// 4.6 Zero evaluator workflow duplication in SQL
assert.ok(
  !/CASE\s+WHEN\s+.*?(?:role|evaluator).*?THEN/i.test(cleanMigrationSql),
  'Wrapper RPC must NOT duplicate evaluator workflow resolution in SQL'
);

// 4.7 Permissions
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
  compactMigrationSql.includes(`REVOKE EXECUTE ON FUNCTION ${WRAPPER_TYPED_SIGNATURE} FROM PUBLIC, anon, authenticated;`),
  'Migration must revoke execution on wrapper from PUBLIC, anon, authenticated'
);
assert.ok(
  compactMigrationSql.includes(`GRANT EXECUTE ON FUNCTION ${WRAPPER_TYPED_SIGNATURE} TO service_role;`),
  'Migration must grant execution on wrapper to service_role'
);

// ============================================================
// 5. ROLLBACK SQL CONTRACTS
// ============================================================
const cleanRollbackSql = stripSqlComments(rollbackSql).trim();

// 5.1 Transaction wrapping
assert.ok(cleanRollbackSql.startsWith('BEGIN;'), 'Rollback must start with BEGIN;');
assert.ok(cleanRollbackSql.endsWith('COMMIT;'), 'Rollback must end with COMMIT;');

// 5.2 GUC approval guard
assert.ok(
  /current_setting\(\s*'kurabe\.p96t05_rollback_approved'\s*,\s*true\s*\)/i.test(cleanRollbackSql),
  'Rollback must inspect custom GUC kurabe.p96t05_rollback_approved'
);
assert.ok(cleanRollbackSql.includes('ROLLBACK_UNAPPROVED'), 'Rollback must fail closed on unapproved execution');
assert.ok(
  !/SET\s+kurabe\.p96t05_rollback_approved/i.test(cleanRollbackSql),
  'Rollback must NEVER set kurabe.p96t05_rollback_approved internally'
);

// 5.3 Provenance inspection & exact signature drop
assert.ok(rollbackSql.includes(WRAPPER_PROVENANCE), 'Rollback must verify wrapper provenance marker');
assert.ok(rollbackSql.includes('PROVENANCE_MISMATCH'), 'Rollback must raise PROVENANCE_MISMATCH on unowned objects');
assert.ok(
  rollbackSql.includes(`DROP FUNCTION ${WRAPPER_TYPED_SIGNATURE}`),
  `Rollback must drop exact typed signature: ${WRAPPER_TYPED_SIGNATURE}`
);
assert.ok(!/DROP\s+FUNCTION\s+IF\s+EXISTS/i.test(cleanRollbackSql), 'Rollback must not use unverified DROP FUNCTION IF EXISTS');

// 5.4 Zero data mutation
assert.ok(!/\bDELETE\s+FROM\b/i.test(cleanRollbackSql), 'Rollback must NOT delete from any table');
assert.ok(!/\bUPDATE\b/i.test(cleanRollbackSql), 'Rollback must NOT update any table');
assert.ok(!/\bTRUNCATE\b/i.test(cleanRollbackSql), 'Rollback must NOT truncate any table');
assert.ok(!/\bDROP\s+TABLE\b/i.test(cleanRollbackSql), 'Rollback must NOT drop any table');

// ============================================================
// 6. ARCHITECTURAL / CONCURRENCY INVARIANT NOTES
// ============================================================
// REST prechecks in TypeScript fail closed before mutations, but do not provide
// PostgreSQL transactional row locking. Only the RPC wrapper with `FOR UPDATE OF ep`
// serializes atomically against concurrent period closures.
console.log('[PASS] All deterministic contract assertions verified for P96T05 candidate artifacts and application action invariants.');
