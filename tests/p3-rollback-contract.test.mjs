/**
 * Deterministic source-contract tests for P3 rollback candidates & production runbook.
 * Verifies structural invariants, fail-closed approval guards, provenance markers,
 * schema safety, and runbook contracts without remote DB or network execution.
 *
 * Run: node tests/p3-rollback-contract.test.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const TX_MIGRATION_PATH = path.join(projectRoot, 'db', 'migration-p3-evaluation-transaction.sql');
const RETENTION_MIGRATION_PATH = path.join(projectRoot, 'db', 'migration-p3-retention.sql');
const TX_ROLLBACK_PATH = path.join(projectRoot, 'db', 'rollback-p3-evaluation-transaction.sql');
const RETENTION_ROLLBACK_PATH = path.join(projectRoot, 'db', 'rollback-p3-retention.sql');
const RUNBOOK_PATH = path.join(projectRoot, 'docs', 'PRODUCTION_RUNBOOK.md');

// ============================================================
// 1. FILE EXISTENCE & CANDIDATE STATUS
// ============================================================
const requiredFiles = [
  { path: TX_MIGRATION_PATH, label: 'db/migration-p3-evaluation-transaction.sql' },
  { path: RETENTION_MIGRATION_PATH, label: 'db/migration-p3-retention.sql' },
  { path: TX_ROLLBACK_PATH, label: 'db/rollback-p3-evaluation-transaction.sql' },
  { path: RETENTION_ROLLBACK_PATH, label: 'db/rollback-p3-retention.sql' },
  { path: RUNBOOK_PATH, label: 'docs/PRODUCTION_RUNBOOK.md' },
];

for (const { path: filePath, label } of requiredFiles) {
  assert.ok(fs.existsSync(filePath), `Required artifact must exist: ${label}`);
}

const txMigrationSql = fs.readFileSync(TX_MIGRATION_PATH, 'utf8');
const retentionMigrationSql = fs.readFileSync(RETENTION_MIGRATION_PATH, 'utf8');
const txRollbackSql = fs.readFileSync(TX_ROLLBACK_PATH, 'utf8');
const retentionRollbackSql = fs.readFileSync(RETENTION_ROLLBACK_PATH, 'utf8');
const runbookMarkdown = fs.readFileSync(RUNBOOK_PATH, 'utf8');

// Candidate safety headers
assert.ok(
  txMigrationSql.includes('CANDIDATE ONLY — NOT APPLIED'),
  'Transaction migration must have CANDIDATE ONLY header'
);
assert.ok(
  retentionMigrationSql.includes('CANDIDATE ONLY — NOT APPLIED'),
  'Retention migration must have CANDIDATE ONLY header'
);
assert.ok(
  txRollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED'),
  'Transaction rollback must have ROLLBACK CANDIDATE ONLY header'
);
assert.ok(
  retentionRollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED'),
  'Retention rollback must have ROLLBACK CANDIDATE ONLY header'
);

// Helper to strip comments and expose executable SQL
function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

// ============================================================
// 2. TRANSACTION BOUNDARIES & ENCAPSULATION
// ============================================================
function verifyTransactionBoundaries(sqlContent, label) {
  assert.ok(/^\s*BEGIN\s*;/m.test(sqlContent), `${label} must contain BEGIN;`);
  assert.ok(/COMMIT\s*;\s*$/m.test(sqlContent), `${label} must contain COMMIT;`);

  const executableSql = stripSqlComments(sqlContent).trim();
  assert.ok(
    executableSql.startsWith('BEGIN;'),
    `${label} must have BEGIN; as the first executable statement`
  );
  assert.ok(
    executableSql.endsWith('COMMIT;'),
    `${label} must have COMMIT; as the final executable statement`
  );
}

// 2.1 Verify both up migrations and both rollbacks are transaction-wrapped
verifyTransactionBoundaries(txMigrationSql, 'Transaction up migration SQL');
verifyTransactionBoundaries(retentionMigrationSql, 'Retention up migration SQL');
verifyTransactionBoundaries(txRollbackSql, 'Transaction rollback SQL');
verifyTransactionBoundaries(retentionRollbackSql, 'Retention rollback SQL');

// 2.2 Verify COMMIT follows all GRANT, REVOKE, and COMMENT statements in up migrations
for (const { sql, label } of [
  { sql: txMigrationSql, label: 'Transaction up migration' },
  { sql: retentionMigrationSql, label: 'Retention up migration' },
]) {
  const commitIndex = sql.lastIndexOf('COMMIT;');
  const lastGrantIndex = sql.lastIndexOf('GRANT');
  const lastRevokeIndex = sql.lastIndexOf('REVOKE');
  const lastCommentIndex = sql.lastIndexOf('COMMENT ON');

  assert.ok(commitIndex > lastGrantIndex, `${label}: COMMIT; must be after all GRANT statements`);
  assert.ok(commitIndex > lastRevokeIndex, `${label}: COMMIT; must be after all REVOKE statements`);
  assert.ok(commitIndex > lastCommentIndex, `${label}: COMMIT; must be after all COMMENT ON statements`);
}

// ============================================================
// 3. EXTERNAL GUC APPROVAL GUARD INVARIANT
// ============================================================

function verifyGucApprovalGuard(sqlContent, label) {
  // Must check current_setting('kurabe.p3_rollback_approved', true)
  assert.ok(
    /current_setting\(\s*'kurabe\.p3_rollback_approved'\s*,\s*true\s*\)/i.test(sqlContent),
    `${label} must inspect custom GUC kurabe.p3_rollback_approved`
  );

  // Must fail closed with ROLLBACK_UNAPPROVED if not approved
  assert.ok(
    sqlContent.includes('ROLLBACK_UNAPPROVED'),
    `${label} must raise exception on unapproved execution`
  );

  // MUST NOT set the GUC internally (prevents self-authorizing script)
  const executableSql = stripSqlComments(sqlContent);
  const setGucRegex = /SET\s+kurabe\.p3_rollback_approved\s*=/i;
  const setConfigRegex = /set_config\(\s*'kurabe\.p3_rollback_approved'/i;
  assert.ok(
    !setGucRegex.test(executableSql) && !setConfigRegex.test(executableSql),
    `${label} must NEVER set kurabe.p3_rollback_approved internally`
  );
}

verifyGucApprovalGuard(txRollbackSql, 'Transaction rollback SQL');
verifyGucApprovalGuard(retentionRollbackSql, 'Retention rollback SQL');

// ============================================================
// 4. PROVENANCE MARKERS & 1-TO-1 MAPPING INVARIANTS
// ============================================================
const P3_TX_TARGET_OBJECTS = [
  {
    type: 'constraint',
    name: 'uq_evaluations_period_employee',
    table: 'public.evaluations',
    marker: 'kurabe:p3:candidate:v1:constraint:uq_evaluations_period_employee',
  },
  {
    type: 'index',
    name: 'idx_evaluations_period_employee',
    table: 'public.evaluations',
    marker: 'kurabe:p3:candidate:v1:index:idx_evaluations_period_employee',
  },
  {
    type: 'constraint',
    name: 'uq_evaluation_rounds_eval_round',
    table: 'public.evaluation_rounds',
    marker: 'kurabe:p3:candidate:v1:constraint:uq_evaluation_rounds_eval_round',
  },
  {
    type: 'index',
    name: 'idx_evaluation_rounds_eval_round',
    table: 'public.evaluation_rounds',
    marker: 'kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round',
  },
  {
    type: 'constraint',
    name: 'chk_evaluation_rounds_round_range',
    table: 'public.evaluation_rounds',
    marker: 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_round_range',
  },
  {
    type: 'constraint',
    name: 'chk_evaluations_current_round_range',
    table: 'public.evaluations',
    marker: 'kurabe:p3:candidate:v1:constraint:chk_evaluations_current_round_range',
  },
  {
    type: 'constraint',
    name: 'chk_evaluations_status_valid',
    table: 'public.evaluations',
    marker: 'kurabe:p3:candidate:v1:constraint:chk_evaluations_status_valid',
  },
  {
    type: 'constraint',
    name: 'chk_evaluation_rounds_status_valid',
    table: 'public.evaluation_rounds',
    marker: 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_status_valid',
  },
  {
    type: 'constraint',
    name: 'chk_evaluation_rounds_total_score_non_negative',
    table: 'public.evaluation_rounds',
    marker: 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_total_score_non_negative',
  },
  {
    type: 'constraint',
    name: 'chk_evaluations_final_score_non_negative',
    table: 'public.evaluations',
    marker: 'kurabe:p3:candidate:v1:constraint:chk_evaluations_final_score_non_negative',
  },
  {
    type: 'function',
    name: 'save_evaluation_round_transaction',
    marker: 'kurabe:p3:candidate:v1:function:save_evaluation_round_transaction',
  },
];

for (const target of P3_TX_TARGET_OBJECTS) {
  // 1. Up migration must set COMMENT ON
  assert.ok(
    txMigrationSql.includes(target.marker),
    `Transaction up migration must declare provenance marker: ${target.marker}`
  );

  // 2. Rollback script must verify the exact marker before drop
  assert.ok(
    txRollbackSql.includes(target.marker),
    `Transaction rollback must verify provenance marker: ${target.marker}`
  );

  // 3. Object identifier must appear in both files
  assert.ok(
    txMigrationSql.includes(target.name),
    `Transaction up migration must contain object name: ${target.name}`
  );
  assert.ok(
    txRollbackSql.includes(target.name),
    `Transaction rollback must contain object name: ${target.name}`
  );
}

// Retention function marker checks
const RETENTION_MARKER = 'kurabe:p3:candidate:v1:function:purge_kurabe_retention';
assert.ok(
  retentionMigrationSql.includes(RETENTION_MARKER),
  'Retention up migration must declare provenance marker for purge_kurabe_retention'
);
assert.ok(
  retentionRollbackSql.includes(RETENTION_MARKER),
  'Retention rollback must verify provenance marker for purge_kurabe_retention'
);
assert.ok(
  retentionRollbackSql.includes('purge_kurabe_retention'),
  'Retention rollback must reference function name purge_kurabe_retention'
);

// Provenance mismatch abort check
assert.ok(
  txRollbackSql.includes('PROVENANCE_MISMATCH'),
  'Transaction rollback must fail closed with PROVENANCE_MISMATCH on unowned objects'
);
assert.ok(
  retentionRollbackSql.includes('PROVENANCE_MISMATCH'),
  'Retention rollback must fail closed with PROVENANCE_MISMATCH on unowned objects'
);

// ============================================================
// 5. SAFETY & DESTRUCTIVE OPERATION PROHIBITION INVARIANTS
// ============================================================
const rollbackFiles = [
  { sql: txRollbackSql, name: 'db/rollback-p3-evaluation-transaction.sql' },
  { sql: retentionRollbackSql, name: 'db/rollback-p3-retention.sql' },
];

for (const { sql, name } of rollbackFiles) {
  const executableSql = stripSqlComments(sql);
  // Prohibit DELETE FROM
  assert.ok(!/DELETE\s+FROM/i.test(executableSql), `${name} must NOT contain DELETE FROM statements`);
  // Prohibit TRUNCATE
  assert.ok(!/TRUNCATE/i.test(executableSql), `${name} must NOT contain TRUNCATE statements`);
  // Prohibit broad DROP TABLE
  assert.ok(!/DROP\s+TABLE/i.test(executableSql), `${name} must NOT contain DROP TABLE statements`);
  // Prohibit broad DROP SCHEMA
  assert.ok(!/DROP\s+SCHEMA/i.test(executableSql), `${name} must NOT contain DROP SCHEMA statements`);
  // Prohibit CASCADE drops
  assert.ok(!/\bCASCADE\b/i.test(executableSql), `${name} must NOT use CASCADE drops`);
}

// ============================================================
// 6. EXACT FUNCTION SIGNATURES CONTRACT
// ============================================================
const TX_EXPECTED_NAMED_PARAMS = [
  'p_evaluation_id uuid',
  'p_round integer',
  'p_actor_id uuid',
  'p_scores jsonb',
  'p_notes jsonb',
  'p_comment text',
  'p_total_score numeric',
  'p_grade text',
  'p_is_submit boolean',
  'p_submitted_at timestamptz',
  'p_next_round integer',
  'p_next_evaluator_id uuid',
  'p_next_evaluator_role text',
  'p_next_status text',
  'p_is_final boolean',
];

// 6.1 Up migration: CREATE FUNCTION declaration and ordered named parameters
assert.ok(
  txMigrationSql.includes('CREATE FUNCTION public.save_evaluation_round_transaction'),
  'Transaction up migration must contain CREATE FUNCTION public.save_evaluation_round_transaction'
);

const funcDeclIndex = txMigrationSql.indexOf('CREATE FUNCTION public.save_evaluation_round_transaction');
const paramOpenIndex = txMigrationSql.indexOf('(', funcDeclIndex);

let paramCloseIndex = -1;
if (paramOpenIndex !== -1) {
  let depth = 0;
  for (let i = paramOpenIndex; i < txMigrationSql.length; i++) {
    if (txMigrationSql[i] === '(') {
      depth++;
    } else if (txMigrationSql[i] === ')') {
      depth--;
      if (depth === 0) {
        paramCloseIndex = i;
        break;
      }
    }
  }
}

assert.ok(
  paramOpenIndex !== -1 && paramCloseIndex !== -1 && paramCloseIndex > paramOpenIndex,
  'Transaction up migration must declare function parameter list'
);

const declaredParamsSubstring = txMigrationSql.slice(paramOpenIndex + 1, paramCloseIndex);
const normalizedDeclaredParams = declaredParamsSubstring.replace(/\s+/g, ' ').trim();

const declaredParamList = declaredParamsSubstring
  .split(',')
  .map((p) => p.trim())
  .filter(Boolean);

assert.strictEqual(
  declaredParamList.length,
  TX_EXPECTED_NAMED_PARAMS.length,
  `Transaction up migration must declare exactly ${TX_EXPECTED_NAMED_PARAMS.length} parameters, got ${declaredParamList.length}`
);

let currentOffset = 0;
for (const param of TX_EXPECTED_NAMED_PARAMS) {
  const [name, type] = param.split(/\s+/);
  const paramRegex = new RegExp(
    `\\b${name}\\s+${type}(?:\\s+DEFAULT\\s+[^,]+)?(?:\\s*,|\\s*$)`,
    'i'
  );
  const match = normalizedDeclaredParams.slice(currentOffset).match(paramRegex);
  assert.ok(
    match && match.index !== undefined,
    `Transaction up migration parameter list must contain '${param}' in declared order at offset >= ${currentOffset}`
  );
  currentOffset += match.index + match[0].length;
}

// 6.2 Rollback script: Type-only PostgreSQL identity signature
const TX_ROLLBACK_IDENTITY_SIGNATURE =
  'public.save_evaluation_round_transaction(uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean)';

assert.ok(
  txRollbackSql.includes(TX_ROLLBACK_IDENTITY_SIGNATURE),
  `Transaction rollback must contain typed identity signature: ${TX_ROLLBACK_IDENTITY_SIGNATURE}`
);

const RETENTION_SIGNATURE = 'public.purge_kurabe_retention(timestamptz)';
assert.ok(
  retentionMigrationSql.includes(RETENTION_SIGNATURE),
  `Retention up migration must contain typed signature: ${RETENTION_SIGNATURE}`
);
assert.ok(
  retentionRollbackSql.includes(RETENTION_SIGNATURE),
  `Retention rollback must contain typed signature: ${RETENTION_SIGNATURE}`
);

// 6.3 Fail-closed one-shot creation: Prohibit CREATE OR REPLACE FUNCTION in candidates
assert.ok(
  !/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(txMigrationSql),
  'Transaction up migration must NOT use CREATE OR REPLACE FUNCTION (must be one-shot fail-closed CREATE FUNCTION)'
);
assert.ok(
  !/CREATE\s+OR\s+REPLACE\s+FUNCTION/i.test(retentionMigrationSql),
  'Retention up migration must NOT use CREATE OR REPLACE FUNCTION (must be one-shot fail-closed CREATE FUNCTION)'
);

// ============================================================
// 7. RETENTION IRREVERSIBILITY CONTRACT
// ============================================================
assert.ok(
  /cannot\s+restore|cannot\s+resurrect|irreversib/i.test(retentionRollbackSql),
  'Retention rollback must document that dropping the function cannot restore purged rows'
);
assert.ok(
  /backup/i.test(retentionRollbackSql),
  'Retention rollback must document that data recovery requires point-in-time backup'
);

// ============================================================
// 8. PRODUCTION RUNBOOK INVARIANTS
// ============================================================
assert.ok(
  runbookMarkdown.includes('CANDIDATE ONLY — NOT APPLIED'),
  'Runbook must state candidate-only status'
);
assert.ok(
  runbookMarkdown.includes('KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC'),
  'Runbook must reference feature flag KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC'
);
assert.ok(
  runbookMarkdown.includes('Gate 1') && runbookMarkdown.includes('Gate 2') && runbookMarkdown.includes('Gate 3'),
  'Runbook must define multi-stage precondition gates'
);
assert.ok(
  /point-in-time\s+backup|verified\s+backup/i.test(runbookMarkdown),
  'Runbook must require verified database backup'
);
assert.ok(
  /no\s+cron|no\s+automatic\s+schedule|do\s+not\s+schedule/i.test(runbookMarkdown),
  'Runbook must mandate no retention cron scheduling prior to explicit approval'
);
assert.ok(
  /no\s+automatic\s+push|manual/i.test(runbookMarkdown),
  'Runbook must specify manual push / deployment gate'
);
assert.ok(
  runbookMarkdown.includes('Stop Conditions') || runbookMarkdown.includes('STOP TRIGGER') || runbookMarkdown.includes('Stop Trigger'),
  'Runbook must define explicit stop conditions'
);
assert.ok(
  runbookMarkdown.includes('kurabe.p3_rollback_approved'),
  'Runbook must document external GUC approval requirement for rollback execution'
);
assert.ok(
  /one-shot/i.test(runbookMarkdown),
  'Runbook must state that P3 migrations are one-shot fail-closed'
);
assert.ok(
  /collision|mismatch/i.test(runbookMarkdown),
  'Runbook must document object collisions and marker mismatches as stop conditions'
);
assert.ok(
  /atomic\s+transaction|transaction-wrapped/i.test(runbookMarkdown),
  'Runbook must state that up migrations are transaction-wrapped and atomic'
);
assert.ok(
  /verify\s+rollback/i.test(runbookMarkdown),
  'Runbook must require verifying rollback / absence of objects if a transaction fails'
);

// ============================================================
// 9. FAIL-CLOSED PROVENANCE OWNERSHIP & COLLISION INVARIANTS
// ============================================================

// 9.1 Transaction migration collision & provenance mismatch exceptions
assert.ok(
  txMigrationSql.includes('PROVENANCE_MISMATCH'),
  'Transaction up migration must fail closed with PROVENANCE_MISMATCH on unowned/mismatched existing objects'
);
assert.ok(
  txMigrationSql.includes('COLLISION'),
  'Transaction up migration must fail closed with COLLISION if save_evaluation_round_transaction already exists'
);

// 9.2 Retention migration collision exception
assert.ok(
  retentionMigrationSql.includes('COLLISION'),
  'Retention up migration must fail closed with COLLISION if purge_kurabe_retention already exists'
);

// 9.3 Every constraint and index in transaction migration must inspect catalog before creation
for (const target of P3_TX_TARGET_OBJECTS) {
  if (target.type === 'constraint') {
    assert.ok(
      txMigrationSql.includes(`conname = '${target.name}'`),
      `Transaction up migration must inspect pg_constraint for ${target.name}`
    );
    assert.ok(
      txMigrationSql.includes(target.marker),
      `Transaction up migration must attach provenance marker ${target.marker}`
    );
  } else if (target.type === 'index') {
    assert.ok(
      txMigrationSql.includes(`relname = '${target.name}'`),
      `Transaction up migration must inspect pg_class for index ${target.name}`
    );
    assert.ok(
      txMigrationSql.includes(target.marker),
      `Transaction up migration must attach provenance marker ${target.marker}`
    );
  }
}

// 9.4 Ensure no bare/unconditional COMMENT ON statements outside DO blocks
const bareConstraintCommentRegex = /^COMMENT\s+ON\s+CONSTRAINT/im;
const bareIndexCommentRegex = /^COMMENT\s+ON\s+INDEX/im;
assert.ok(
  !bareConstraintCommentRegex.test(txMigrationSql),
  'Transaction up migration must NOT have bare unconditional COMMENT ON CONSTRAINT statements'
);
assert.ok(
  !bareIndexCommentRegex.test(txMigrationSql),
  'Transaction up migration must NOT have bare unconditional COMMENT ON INDEX statements'
);

console.log('p3-rollback-contract tests: ALL PASS');
