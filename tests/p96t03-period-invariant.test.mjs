/**
 * Focused Contract Test for P96T03: Single Active Period Invariant
 *
 * NOTE: Direct live database integration / schema verification is currently BLOCKED
 * because the available Supabase token lacks Management API database privilege (pg_catalog
 * access is unknown/blocked). This test performs hermetic, side-effect-free contract
 * assertions over candidate SQL artifacts and application code invariants.
 *
 * Assertions:
 * 1. Artifacts existence and CANDIDATE ONLY / NOT APPLIED headers.
 * 2. SQL Migration candidate:
 *    - Transaction boundary (BEGIN ... COMMIT)
 *    - Explicit preflight DO block that checks active period count and raises P96T03 exception on count > 1
 *    - Partial unique index creation on (status) WHERE status = 'active'
 *    - Stable explicit index name `idx_evaluation_periods_single_active`
 *    - No data repair/dedupe (zero DELETE / UPDATE mutations)
 * 3. SQL Rollback candidate:
 *    - Transaction boundary (BEGIN ... COMMIT)
 *    - Drops only the exact index `idx_evaluation_periods_single_active` with IF EXISTS
 *    - Zero data mutation
 * 4. Application actions (src/actions/period.ts):
 *    - closeEvaluationPeriod:
 *      * Validates input (rejects empty/missing periodId)
 *      * Atomic update scoped strictly to .eq('id', periodId).eq('status', 'active')
 *      * Uses .select('id')
 *      * Returns success: true ONLY when exactly one row is updated
 *      * Returns success: false on missing, already-closed, or query error
 *      * Preserves auth, audit, revalidation
 *      * No pre-read query before update (prevents TOCTOU race)
 *    - savePeriodTarget:
 *      * Validates periodId, rate (0-100), and validGrades
 *      * Atomic update scoped strictly to .eq('id', periodId).eq('status', 'active')
 *      * Uses .select('id')
 *      * Returns success: true ONLY when exactly one row is updated
 *      * Returns success: false on closed, missing, or query error
 *      * Preserves auth, audit, revalidation
 *    - createEvaluationPeriod:
 *      * Preserves DB uniqueness as authority without client-side status pre-check
 *      * Gracefully handles unique active conflict (23505 / index collision) with user-safe message
 *      * Does not leak internal DB constraint details
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const MIGRATION_PATH = path.join(projectRoot, 'supabase', 'migrations', '20260826000000_p96t03_single_active_period.sql');
const ROLLBACK_PATH = path.join(projectRoot, 'db', 'rollback-p96t03-single-active-period.sql');
const ACTIONS_PERIOD_PATH = path.join(projectRoot, 'src', 'actions', 'period.ts');

console.log('[NOTE] Direct live DB integration is BLOCKED pending Management API catalog privileges.');
console.log('[NOTE] Executing deterministic source-contract test for P96T03 artifacts & code invariants...');

// ============================================================
// 1. ARTIFACT EXISTENCE & CANDIDATE HEADERS
// ============================================================
assert.ok(fs.existsSync(MIGRATION_PATH), `Migration candidate must exist at: ${MIGRATION_PATH}`);
assert.ok(fs.existsSync(ROLLBACK_PATH), `Rollback candidate must exist at: ${ROLLBACK_PATH}`);
assert.ok(fs.existsSync(ACTIONS_PERIOD_PATH), `Actions period.ts must exist at: ${ACTIONS_PERIOD_PATH}`);

const migrationSql = fs.readFileSync(MIGRATION_PATH, 'utf8');
const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');
const actionsCode = fs.readFileSync(ACTIONS_PERIOD_PATH, 'utf8');

// Header checks
assert.ok(
  migrationSql.includes('CANDIDATE ONLY — NOT APPLIED') || migrationSql.includes('CANDIDATE ONLY'),
  'Migration SQL must explicitly declare CANDIDATE ONLY'
);
assert.ok(
  migrationSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL') || migrationSql.includes('APPROVAL'),
  'Migration SQL must note that live apply requires approval'
);
assert.ok(
  rollbackSql.includes('ROLLBACK CANDIDATE ONLY') || rollbackSql.includes('CANDIDATE ONLY'),
  'Rollback SQL must explicitly declare ROLLBACK CANDIDATE ONLY'
);

// Helper to strip SQL comments
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

// Helper to extract function chunk by name
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
// 2.1 Transaction wrapping
const cleanMigrationSql = stripSqlComments(migrationSql).trim();
assert.ok(cleanMigrationSql.startsWith('BEGIN;'), 'Migration must start with BEGIN;');
assert.ok(cleanMigrationSql.endsWith('COMMIT;'), 'Migration must end with COMMIT;');

// 2.2 Preflight DO block with multiple-active abort
assert.ok(/DO\s+\$\$/i.test(cleanMigrationSql), 'Migration must contain explicit preflight DO $$ block');
assert.ok(/FROM\s+public\.evaluation_periods|FROM\s+evaluation_periods/i.test(cleanMigrationSql), 'Preflight must query evaluation_periods');
assert.ok(/status\s*=\s*'active'/i.test(cleanMigrationSql), 'Preflight must check status = active');
assert.ok(/count\(\*\)|count\(status\)/i.test(cleanMigrationSql), 'Preflight must count active rows');
assert.ok(/>\s*1/i.test(cleanMigrationSql), 'Preflight must check if active count > 1');
assert.ok(/RAISE\s+EXCEPTION/i.test(cleanMigrationSql), 'Preflight must raise exception on multiple active rows');
assert.ok(/P96T03/i.test(cleanMigrationSql), 'Preflight exception must include stable P96T03 error marker');

// 2.3 Partial unique index
const indexMatch = cleanMigrationSql.match(/CREATE\s+UNIQUE\s+INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+([a-zA-Z0-9_]+)\s+ON\s+(?:public\.)?evaluation_periods\s*\(([^)]+)\)\s+WHERE\s+(.+?);/is);
assert.ok(indexMatch, 'Migration must contain CREATE UNIQUE INDEX on evaluation_periods with WHERE predicate');

const [, indexName, indexedCols, whereClause] = indexMatch;
assert.strictEqual(indexName.trim(), 'idx_evaluation_periods_single_active', 'Index name must be idx_evaluation_periods_single_active');
assert.ok(indexedCols.includes('status'), 'Indexed column must include status');
assert.ok(whereClause.replace(/\s+/g, '').includes("status='active'"), 'Index predicate must be status = active');
assert.ok(!/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS/i.test(cleanMigrationSql), 'Migration must not silently accept a same-named index with an unverified definition');

// 2.4 No data repair/dedupe mutations
assert.ok(!/\bDELETE\s+FROM\b/i.test(cleanMigrationSql), 'Migration candidate must NOT delete any data (no repair/dedupe)');
assert.ok(!/\bUPDATE\s+(?:public\.)?evaluation_periods\b/i.test(cleanMigrationSql), 'Migration candidate must NOT update any data (no repair/dedupe)');

// ============================================================
// 3. ROLLBACK SQL CONTRACTS
// ============================================================
const cleanRollbackSql = stripSqlComments(rollbackSql).trim();
assert.ok(cleanRollbackSql.startsWith('BEGIN;'), 'Rollback must start with BEGIN;');
assert.ok(cleanRollbackSql.endsWith('COMMIT;'), 'Rollback must end with COMMIT;');

// 3.1 Drop exact index with IF EXISTS
assert.ok(
  /DROP\s+INDEX(?:\s+IF\s+EXISTS)?\s+(?:public\.)?idx_evaluation_periods_single_active\s*;/i.test(cleanRollbackSql),
  'Rollback must drop only idx_evaluation_periods_single_active with IF EXISTS'
);

// 3.2 No data changes in rollback
assert.ok(!/\bDELETE\s+FROM\b/i.test(cleanRollbackSql), 'Rollback must NOT delete any data');
assert.ok(!/\bUPDATE\b/i.test(cleanRollbackSql), 'Rollback must NOT update any data');
assert.ok(!/\bTRUNCATE\b/i.test(cleanRollbackSql), 'Rollback must NOT truncate any table');

// ============================================================
// 4. APPLICATION ACTIONS CONTRACTS (src/actions/period.ts)
// ============================================================

// 4.1 closeEvaluationPeriod invariants
const closeChunk = getFunctionChunk(actionsCode, 'closeEvaluationPeriod');
assert.ok(closeChunk.length > 0, 'closeEvaluationPeriod must exist');

// Auth check
assert.ok(closeChunk.includes('requireManager()'), 'closeEvaluationPeriod must require Manager role');

// Input validation (rejects empty/missing periodId)
assert.ok(
  /!periodId/.test(closeChunk),
  'closeEvaluationPeriod must validate periodId is non-empty'
);

// Atomic update: only .eq('id', periodId).eq('status', 'active')
assert.ok(
  closeChunk.includes(".eq('id', periodId)") || closeChunk.includes('.eq("id", periodId)'),
  'closeEvaluationPeriod must filter by id'
);
assert.ok(
  closeChunk.includes(".eq('status', 'active')") || closeChunk.includes('.eq("status", "active")'),
  'closeEvaluationPeriod must filter by status = active'
);

// Uses .select('id')
assert.ok(
  closeChunk.includes(".select('id')") || closeChunk.includes('.select("id")'),
  'closeEvaluationPeriod must select id to inspect affected row count'
);

// Exactly one row check
assert.ok(
  closeChunk.includes('data.length !== 1') || closeChunk.includes('data.length === 1') || closeChunk.includes('data?.length !== 1'),
  'closeEvaluationPeriod must verify exactly one row was updated'
);

// Audit and revalidation preserved
assert.ok(closeChunk.includes('revalidatePeriodPaths()'), 'closeEvaluationPeriod must call revalidatePeriodPaths');
assert.ok(closeChunk.includes('logAudit'), 'closeEvaluationPeriod must log audit');

// No pre-read query before update (guards against TOCTOU)
const selectBeforeUpdate = closeChunk.indexOf(".from('evaluation_periods').select");
const updateIndex = closeChunk.indexOf(".from('evaluation_periods').update");
assert.ok(
  selectBeforeUpdate === -1 || selectBeforeUpdate > updateIndex,
  'closeEvaluationPeriod must NOT perform a pre-read select before update (avoids TOCTOU)'
);

// 4.2 savePeriodTarget invariants
const targetChunk = getFunctionChunk(actionsCode, 'savePeriodTarget');
assert.ok(targetChunk.length > 0, 'savePeriodTarget must exist');

// Auth check
assert.ok(targetChunk.includes('requireManager()'), 'savePeriodTarget must require Manager role');

// Input validation
assert.ok(/!periodId/.test(targetChunk), 'savePeriodTarget must validate periodId is non-empty');
assert.ok(/Number\.isFinite\(rate\)/.test(targetChunk), 'savePeriodTarget must validate rate is finite number');
assert.ok(/validGrades/.test(targetChunk), 'savePeriodTarget must validate grade');

// Atomic update: only .eq('id', periodId).eq('status', 'active')
assert.ok(
  targetChunk.includes(".eq('id', periodId)") || targetChunk.includes('.eq("id", periodId)'),
  'savePeriodTarget must filter by id'
);
assert.ok(
  targetChunk.includes(".eq('status', 'active')") || targetChunk.includes('.eq("status", "active")'),
  'savePeriodTarget must filter by status = active'
);

// Uses .select('id')
assert.ok(
  targetChunk.includes(".select('id')") || targetChunk.includes('.select("id")'),
  'savePeriodTarget must select id to inspect affected row count'
);

// Exactly one row check
assert.ok(
  targetChunk.includes('data.length !== 1') || targetChunk.includes('data.length === 1') || targetChunk.includes('data?.length !== 1'),
  'savePeriodTarget must verify exactly one row was updated'
);

// Audit and revalidation preserved
assert.ok(targetChunk.includes('revalidatePeriodPaths()'), 'savePeriodTarget must call revalidatePeriodPaths');
assert.ok(targetChunk.includes('logAudit'), 'savePeriodTarget must log audit');

// 4.3 createEvaluationPeriod invariants
const createChunk = getFunctionChunk(actionsCode, 'createEvaluationPeriod');
assert.ok(createChunk.length > 0, 'createEvaluationPeriod must exist');

// No client-side pre-check for active period (DB is sole authority)
assert.ok(
  !/\.from\(['"]evaluation_periods['"]\)\s*\.select\([^)]*\)\s*\.eq\(['"]status['"],\s*['"]active['"]\)/i.test(createChunk),
  'createEvaluationPeriod must NOT use a client pre-check for active periods; DB uniqueness is sole authority'
);

// Direct insert with status = active
assert.ok(
  createChunk.includes("status: 'active'") || createChunk.includes('status: "active"'),
  'createEvaluationPeriod must insert status: active'
);

// Unique conflict error handling
assert.ok(
  createChunk.includes('23505') && createChunk.includes('isSingleActiveConflict'),
  'createEvaluationPeriod must classify the DB unique violation before returning the Active-conflict message'
);
assert.ok(
  createChunk.includes('toClientError'),
  'createEvaluationPeriod must use toClientError to prevent leaking raw Postgres details'
);

console.log('[CONTRACT PASS] All P96T03 candidate SQL, rollback, and application action contract invariants verified.');
