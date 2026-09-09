import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

export const FORWARD_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260909000100_p98_reconcile_login_attempts.sql'
);
export const ROLLBACK_PATH = path.join(
  projectRoot,
  'db',
  'rollback-p98-reconcile-login-attempts.sql'
);
export const REVIEWED_T08_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260907000200_login_rate_limit.sql'
);
export const REVIEWED_T08_ROLLBACK_PATH = path.join(
  projectRoot,
  'db',
  'rollback-login-rate-limit.sql'
);
export const LOGIN_RATE_LIMIT_PATH = path.join(
  projectRoot,
  'src',
  'lib',
  'login-rate-limit.ts'
);
export const AUTH_ACTIONS_PATH = path.join(
  projectRoot,
  'src',
  'actions',
  'auth.ts'
);

const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: os.tmpdir(),
  LANG: 'C',
  LC_ALL: 'C',
  PGPASSFILE: '/dev/null',
  PGSERVICEFILE: '/dev/null',
  PGCONNECT_TIMEOUT: '5',
};

function fail(message) {
  throw new Error(`LOGIN_ATTEMPTS_RECONCILIATION_GUARD: ${message}`);
}

export function assertLocalTarget({ host, port, database, user }) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
    fail(`database host must be loopback, received ${JSON.stringify(host)}`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail('database port is invalid');
  }
  if (!/^kurabe_harness(?:_[a-z0-9_]+)?$/.test(database)) {
    fail('database name must be an explicitly disposable kurabe_harness database');
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(user)) {
    fail('database user must be a plain local role name');
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function redact(text) {
  return String(text ?? '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/g, '[redacted-key]');
}

export function locatePsql() {
  const candidates = [
    'psql',
    '/usr/bin/psql',
    '/usr/local/bin/psql',
    '/usr/lib/postgresql/17/bin/psql',
    '/usr/lib/postgresql/16/bin/psql',
    '/usr/lib/postgresql/15/bin/psql',
  ];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], {
      env: SAFE_ENV,
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 1500,
    });
    if (probe.status === 0 && !probe.error) return candidate;
  }
  return null;
}

function runPsql(psql, target, sql) {
  const args = [
    '--no-password',
    '--set=ON_ERROR_STOP=1',
    '--tuples-only',
    '--no-align',
    '--field-separator=|',
    '--host', target.host,
    '--port', String(target.port),
    '--username', target.user,
    '--dbname', target.database,
  ];
  const result = spawnSync(psql, args, {
    env: SAFE_ENV,
    input: sql,
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 256 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.code === 'ENOENT'
      ? 'psql executable was not found'
      : redact(result.stderr || result.error?.message || `exit ${result.status}`);
    fail(`psql execution failed: ${detail}`);
  }
  const raw = String(result.stdout ?? '').trim();
  if (!raw) return raw;
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^(true|false)(\||$)/, (_, val, sep) => (val === 'true' ? 't' : 'f') + sep))
    .join('\n');
}

function parseTarget(options = {}) {
  const target = {
    host: options.dbHost ?? '127.0.0.1',
    port: Number(options.dbPort ?? 5432),
    database: options.dbName ?? 'kurabe_harness',
    user: options.dbUser ?? 'postgres',
  };
  assertLocalTarget(target);
  return target;
}

function cryptoSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

const SUPABASE_COMPATIBLE_ROLES = Object.freeze(['anon', 'authenticated', 'service_role']);

function bootstrapSupabaseCompatibleRoles(psql, target) {
  const existingRoles = runPsql(
    psql,
    target,
    `SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname;`
  );
  const existing = new Set(existingRoles ? existingRoles.split(/\r?\n/) : []);
  const createdRoles = SUPABASE_COMPATIBLE_ROLES.filter((role) => !existing.has(role));

  if (createdRoles.length > 0) {
    const createStatements = createdRoles
      .map((role) => `CREATE ROLE ${quoteIdentifier(role)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;`)
      .join('\n');
    runPsql(psql, target, `BEGIN;\n${createStatements}\nCOMMIT;`);
  }

  return createdRoles;
}

function cleanupHarnessRoles(psql, target, createdRoles) {
  if (createdRoles.length === 0) return;
  const dropStatements = [...createdRoles]
    .reverse()
    .map((role) => `DROP ROLE IF EXISTS ${quoteIdentifier(role)};`)
    .join('\n');
  runPsql(psql, target, dropStatements);
}

export function stripSqlComments(sql) {
  return String(sql ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

export function stripLeadingSqlComments(sql) {
  return String(sql ?? '')
    .replace(/^(?:\s+|--[^\r\n]*(?:\r?\n|$)|(?:\/\*[\s\S]*?\*\/))+/, '')
    .trimStart();
}

/**
 * Adapts public-schema targeting SQL to an isolated test schema
 */
export function adaptSqlToSchema(sql, schema) {
  return String(sql ?? '')
    .replaceAll('public.', `${schema}.`)
    .replaceAll("'public'", `'${schema}'`)
    .replaceAll('SET search_path = public', `SET search_path = ${schema}, public`);
}

export async function run({ options = {} } = {}) {
  const executedCases = [];

  // ============================================================
  // 1. STATIC SOURCE CONTRACT AUDITS
  // ============================================================
  assert.ok(fs.existsSync(FORWARD_MIGRATION_PATH), 'forward migration file must exist');
  assert.ok(fs.existsSync(ROLLBACK_PATH), 'rollback file must exist');
  assert.ok(fs.existsSync(REVIEWED_T08_MIGRATION_PATH), 'reviewed T08 migration file must exist');
  assert.ok(fs.existsSync(REVIEWED_T08_ROLLBACK_PATH), 'reviewed T08 rollback file must exist');

  const forwardSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');

  // Forward migration contracts
  assert.ok(
    forwardSql.includes('CANDIDATE ONLY — NOT APPLIED') || forwardSql.includes('CANDIDATE ONLY'),
    'forward migration must declare candidate-only header'
  );
  assert.ok(
    forwardSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL'),
    'forward migration must require separate approval and catalog gate'
  );

  const cleanForward = stripSqlComments(forwardSql).trim();
  const leadingStrippedForward = stripLeadingSqlComments(forwardSql);
  assert.ok(
    leadingStrippedForward.startsWith('BEGIN;') && cleanForward.startsWith('BEGIN;'),
    'forward migration must start with hermetic BEGIN;'
  );
  assert.ok(
    cleanForward.endsWith('COMMIT;'),
    'forward migration must end with hermetic COMMIT;'
  );

  // Exact provenance markers
  assert.ok(
    forwardSql.includes('kurabe:p98:reconcile:v1:table:login_attempts'),
    'forward migration must declare exact table provenance marker'
  );
  assert.ok(
    forwardSql.includes('kurabe:p98:candidate:v1:function:check_login_rate_limit'),
    'forward migration must declare provenance comment on check_login_rate_limit'
  );
  assert.ok(
    forwardSql.includes('kurabe:p98:candidate:v1:function:record_failed_login_transaction'),
    'forward migration must declare provenance comment on record_failed_login_transaction'
  );
  assert.ok(
    forwardSql.includes('kurabe:p98:candidate:v1:function:clear_login_attempts'),
    'forward migration must declare provenance comment on clear_login_attempts'
  );

  // Function execute boundaries
  assert.ok(
    cleanForward.includes('REVOKE ALL ON FUNCTION public.check_login_rate_limit') &&
    cleanForward.includes('GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text, text, integer, integer, integer) TO service_role'),
    'forward migration must restrict check_login_rate_limit execution strictly to service_role'
  );
  assert.ok(
    cleanForward.includes('REVOKE ALL ON FUNCTION public.record_failed_login_transaction') &&
    cleanForward.includes('GRANT EXECUTE ON FUNCTION public.record_failed_login_transaction(text, text, integer, integer, integer) TO service_role'),
    'forward migration must restrict record_failed_login_transaction execution strictly to service_role'
  );
  assert.ok(
    cleanForward.includes('REVOKE ALL ON FUNCTION public.clear_login_attempts') &&
    cleanForward.includes('GRANT EXECUTE ON FUNCTION public.clear_login_attempts(text, text) TO service_role'),
    'forward migration must restrict clear_login_attempts execution strictly to service_role'
  );

  // Safe operations: no executable destructive actions. Strip comments first so
  // prose describing preserved production grants cannot satisfy these guards.
  // Require a relation identifier after each command so privilege-name literals
  // such as 'TRUNCATE' do not look like executable SQL.
  assert.ok(
    !/\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:"?[A-Za-z_][\w$]*"?\s*(?:\.\s*"?[A-Za-z_][\w$]*"?)?)/i.test(cleanForward),
    'forward migration must never execute DROP TABLE'
  );
  assert.ok(
    !/\bTRUNCATE\s+(?:TABLE\s+)?(?:"?[A-Za-z_][\w$]*"?\s*(?:\.\s*"?[A-Za-z_][\w$]*"?)?)/i.test(cleanForward),
    'forward migration must never execute TRUNCATE'
  );
  assert.ok(
    !/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:public\.)?idx_login_attempts_code_ip_time/i.test(cleanForward),
    'forward migration must never drop legacy index idx_login_attempts_code_ip_time'
  );
  assert.ok(
    !/REVOKE\s+.*ON\s+TABLE\s+(?:public\.)?login_attempts\s+FROM\s+authenticated/i.test(cleanForward),
    'forward migration must not revoke broad authenticated table grants'
  );
  assert.ok(
    !/ALTER\s+TABLE\s+(?:public\.)?login_attempts\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(cleanForward),
    'forward migration must not disable RLS on existing table'
  );
  executedCases.push('source-contract: forward migration candidate header, hermetic transaction, provenance, grants, and safe non-destructive DDL');

  // Rollback contracts
  assert.ok(
    rollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED') || rollbackSql.includes('ROLLBACK CANDIDATE ONLY'),
    'rollback candidate must declare candidate-only header'
  );
  assert.ok(
    rollbackSql.includes('DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL AND GUC CONFIRMATION'),
    'rollback candidate must require GUC approval confirmation'
  );
  assert.ok(
    /current_setting\(\s*'kurabe\.p98_rollback_approved'\s*,\s*true\s*\)/i.test(rollbackSql),
    'rollback candidate must inspect custom GUC kurabe.p98_rollback_approved'
  );
  assert.ok(
    rollbackSql.includes('ROLLBACK_UNAPPROVED'),
    'rollback candidate must abort with ROLLBACK_UNAPPROVED if GUC is not true'
  );
  assert.ok(
    !/SET\s+kurabe\.p98_rollback_approved/i.test(stripSqlComments(rollbackSql)),
    'rollback candidate must never set kurabe.p98_rollback_approved internally'
  );

  const cleanRollback = stripSqlComments(rollbackSql).trim();
  const leadingStrippedRollback = stripLeadingSqlComments(rollbackSql);
  assert.ok(
    leadingStrippedRollback.startsWith('BEGIN;') && cleanRollback.startsWith('BEGIN;'),
    'rollback must start with hermetic BEGIN;'
  );
  assert.ok(
    cleanRollback.endsWith('COMMIT;'),
    'rollback must end with hermetic COMMIT;'
  );

  // Rollback safe teardown
  assert.ok(
    !/\bDROP\s+TABLE\b/i.test(cleanRollback) &&
    !/\bDELETE\s+FROM\b/i.test(cleanRollback) &&
    !/\bTRUNCATE\b/i.test(cleanRollback),
    'rollback candidate must not drop tables or delete audit data'
  );
  assert.ok(
    rollbackSql.includes('DROP FUNCTION IF EXISTS public.check_login_rate_limit') &&
    rollbackSql.includes('DROP FUNCTION IF EXISTS public.record_failed_login_transaction') &&
    rollbackSql.includes('DROP FUNCTION IF EXISTS public.clear_login_attempts'),
    'rollback candidate must drop candidate functions'
  );
  assert.ok(
    rollbackSql.includes('DROP INDEX IF EXISTS public.idx_login_attempts_code_time') &&
    rollbackSql.includes('DROP INDEX IF EXISTS public.idx_login_attempts_ip_time') &&
    rollbackSql.includes('DROP INDEX IF EXISTS public.idx_login_attempts_attempted_at'),
    'rollback candidate must drop candidate indexes'
  );
  assert.ok(
    !/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:public\.)?idx_login_attempts_code_ip_time/i.test(rollbackSql),
    'rollback candidate must never drop legacy index idx_login_attempts_code_ip_time'
  );
  assert.ok(
    rollbackSql.includes('P98_ROLLBACK_PREFLIGHT_FAILED'),
    'rollback candidate must fail closed with P98_ROLLBACK_PREFLIGHT_FAILED on unexpected fingerprint/provenance'
  );
  executedCases.push('source-contract: rollback candidate GUC approval guard, ownership/fingerprint guards, and non-destructive reversal');

  // ============================================================
  // 2. POSTGRESQL REAL INTEGRATION TEST SUITE
  // ============================================================
  const target = parseTarget(options);
  const psql = locatePsql();
  if (!psql) {
    fail('psql is unavailable; local PostgreSQL client is required for real integration tests');
  }

  // Verify server identity
  const identity = runPsql(psql, target, `
    SELECT current_database() || '|' ||
           coalesce(host(inet_server_addr()), '') || '|' ||
           inet_server_port()::text || '|' ||
           current_setting('is_superuser') || '|' || current_user;
  `);
  const [database, address, serverPort, isSuperuser, currentUser] = identity.split('|');
  if (
    database !== target.database ||
    !['127.0.0.1', '::1'].includes(address) ||
    serverPort !== String(target.port) ||
    currentUser !== target.user ||
    !['on', 'off'].includes(isSuperuser)
  ) {
    fail('connected server identity is not the requested loopback disposable target');
  }
  executedCases.push('target verification: connected server is verified loopback disposable PostgreSQL target');

  const createdHarnessRoles = bootstrapSupabaseCompatibleRoles(psql, target);
  let suiteError;

  try {
  // Helper to run assertions expecting SQL failure
  function assertSqlFails(sql, expectedFragment, caseDesc) {
    let failed = false;
    let receivedError = '';
    try {
      runPsql(psql, target, sql);
    } catch (err) {
      failed = true;
      receivedError = String(err?.message ?? err);
    }
    assert.ok(failed, `Expected error containing "${expectedFragment}" for: ${caseDesc}`);
    assert.ok(
      receivedError.includes(expectedFragment),
      `Expected error to contain "${expectedFragment}", received: "${receivedError}"`
    );
    executedCases.push(`fail-closed: ${caseDesc}`);
  }

  // ------------------------------------------------------------
  // SCENARIO 1: CLEAN BASELINE CONVERGENCE & REVERSAL
  // ------------------------------------------------------------
  const cleanSchema = `kurabe_harness_clean_${cryptoSuffix()}`;
  const cleanQualified = quoteIdentifier(cleanSchema);
  let cleanCreated = false;

  try {
    runPsql(psql, target, `CREATE SCHEMA ${cleanQualified};`);
    cleanCreated = true;

    // Prerequisite: users table exists
    runPsql(psql, target, `
      CREATE TABLE ${cleanQualified}.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_code text NOT NULL UNIQUE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        password_hash text,
        password_setup_required boolean NOT NULL DEFAULT false
      );
    `);

    // Execute forward migration on clean baseline
    const adaptedCleanForward = adaptSqlToSchema(forwardSql, cleanSchema);
    runPsql(psql, target, adaptedCleanForward);

    // Verify table creation
    const tableInfo = runPsql(psql, target, `
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = '${cleanSchema}' AND table_name = 'login_attempts';
    `);
    assert.equal(tableInfo, '1', 'login_attempts table must be created on clean baseline');

    // Verify candidate indexes exist
    const idxCount = runPsql(psql, target, `
      SELECT count(*) FROM pg_indexes
      WHERE schemaname = '${cleanSchema}' AND tablename = 'login_attempts'
        AND indexname IN ('idx_login_attempts_code_time', 'idx_login_attempts_ip_time', 'idx_login_attempts_attempted_at');
    `);
    assert.equal(idxCount, '3', 'all 3 candidate indexes must exist on clean baseline');

    // Verify candidate RPC functions exist with provenance
    const funcCount = runPsql(psql, target, `
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = '${cleanSchema}'
        AND p.proname IN ('check_login_rate_limit', 'record_failed_login_transaction', 'clear_login_attempts');
    `);
    assert.equal(funcCount, '3', 'all 3 candidate RPC functions must exist on clean baseline');

    // Test RPC execution on clean baseline
    const recordResult = runPsql(psql, target, `
      SELECT allowed, account_attempts, ip_attempts, coalesce(locked_by, '')
      FROM ${cleanQualified}.record_failed_login_transaction('EMP_CLEAN_01', '192.0.2.1');
    `);
    assert.equal(recordResult, 't|1|1|', 'first failed attempt must be allowed with count 1');

    const checkResult = runPsql(psql, target, `
      SELECT allowed, account_attempts, ip_attempts
      FROM ${cleanQualified}.check_login_rate_limit('EMP_CLEAN_01', '192.0.2.1');
    `);
    assert.equal(checkResult, 't|1|1', 'check_login_rate_limit must report attempt');

    const clearResult = runPsql(psql, target, `
      SELECT ${cleanQualified}.clear_login_attempts('EMP_CLEAN_01');
    `);
    assert.equal(clearResult, '1', 'clear_login_attempts must return 1 deleted attempt');
    executedCases.push('clean baseline: converged to reviewed contract and verified RPC execution');

    // Execute rollback on clean baseline
    const adaptedCleanRollback = adaptSqlToSchema(rollbackSql, cleanSchema);
    runPsql(psql, target, `SET kurabe.p98_rollback_approved = 'true';\n${adaptedCleanRollback}`);

    // Verify functions and candidate indexes dropped, table preserved
    const funcRemaining = runPsql(psql, target, `
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = '${cleanSchema}'
        AND p.proname IN ('check_login_rate_limit', 'record_failed_login_transaction', 'clear_login_attempts');
    `);
    assert.equal(funcRemaining, '0', 'candidate functions must be dropped on rollback');

    const idxRemaining = runPsql(psql, target, `
      SELECT count(*) FROM pg_indexes
      WHERE schemaname = '${cleanSchema}' AND tablename = 'login_attempts'
        AND indexname IN ('idx_login_attempts_code_time', 'idx_login_attempts_ip_time', 'idx_login_attempts_attempted_at');
    `);
    assert.equal(idxRemaining, '0', 'candidate indexes must be dropped on rollback');

    const tablePreserved = runPsql(psql, target, `
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = '${cleanSchema}' AND table_name = 'login_attempts';
    `);
    assert.equal(tablePreserved, '1', 'table must be preserved after rollback');
    executedCases.push('clean baseline: rollback reversed candidate objects and preserved table');
  } finally {
    if (cleanCreated) {
      runPsql(psql, target, `DROP SCHEMA IF EXISTS ${cleanQualified} CASCADE;`);
    }
  }

  // ------------------------------------------------------------
  // SCENARIO 2: EXACT PRODUCTION-LIKE COLLISION BASELINE
  // ------------------------------------------------------------
  const prodSchema = `kurabe_harness_prod_${cryptoSuffix()}`;
  const prodQualified = quoteIdentifier(prodSchema);
  let prodCreated = false;

  try {
    runPsql(psql, target, `CREATE SCHEMA ${prodQualified};`);
    prodCreated = true;

    // Prerequisite: users table
    runPsql(psql, target, `
      CREATE TABLE ${prodQualified}.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_code text NOT NULL UNIQUE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        password_hash text,
        password_setup_required boolean NOT NULL DEFAULT false
      );
    `);

    // Production-like table public.login_attempts fingerprint:
    // - ordinary table, owner postgres/current_user
    // - RLS enabled, forced false, 0 policies
    // - columns: id uuid default gen_random_uuid() pkey, employee_code text not null, ip text not null, attempted_at timestamptz not null default now()
    // - legacy index: idx_login_attempts_code_ip_time on (employee_code, ip, attempted_at)
    // - 43 synthetic rows
    runPsql(psql, target, `
      CREATE TABLE ${prodQualified}.login_attempts (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        employee_code text NOT NULL,
        ip text NOT NULL,
        attempted_at timestamptz DEFAULT now() NOT NULL
      );

      ALTER TABLE ${prodQualified}.login_attempts ENABLE ROW LEVEL SECURITY;

      CREATE INDEX idx_login_attempts_code_ip_time
        ON ${prodQualified}.login_attempts (employee_code, ip, attempted_at);

      -- Reproduce the exact reviewed T09 table grant fingerprint expected by preflight.
      GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
        ON ${prodQualified}.login_attempts TO authenticated;
      GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
        ON ${prodQualified}.login_attempts TO service_role;

      -- Insert exactly 43 synthetic production-like records
      INSERT INTO ${prodQualified}.login_attempts (employee_code, ip, attempted_at)
      SELECT
        'EMP_' || lpad((g % 10 + 1)::text, 4, '0'),
        '198.51.100.' || (g % 20 + 1)::text,
        now() - ((g * 10) || ' minutes')::interval
      FROM generate_series(1, 43) AS g;
    `);

    const initialRows = runPsql(psql, target, `
      SELECT count(*) FROM ${prodQualified}.login_attempts;
    `);
    assert.equal(initialRows, '43', 'preflight must contain exactly 43 rows');

    // Execute forward migration on exact production collision baseline
    const adaptedProdForward = adaptSqlToSchema(forwardSql, prodSchema);
    runPsql(psql, target, adaptedProdForward);

    // Verify row preservation
    const postMigRows = runPsql(psql, target, `
      SELECT count(*) FROM ${prodQualified}.login_attempts;
    `);
    assert.equal(postMigRows, '43', 'all 43 existing rows must be preserved exactly');

    // Verify legacy index is retained
    const legacyIdx = runPsql(psql, target, `
      SELECT indisvalid FROM pg_index i
      JOIN pg_class ic ON i.indexrelid = ic.oid
      JOIN pg_namespace n ON ic.relnamespace = n.oid
      WHERE n.nspname = '${prodSchema}' AND ic.relname = 'idx_login_attempts_code_ip_time';
    `);
    assert.equal(legacyIdx, 't', 'legacy index idx_login_attempts_code_ip_time must be retained and valid');

    // Verify 3 candidate indexes added
    const candidateIdxs = runPsql(psql, target, `
      SELECT count(*) FROM pg_indexes
      WHERE schemaname = '${prodSchema}' AND tablename = 'login_attempts'
        AND indexname IN ('idx_login_attempts_code_time', 'idx_login_attempts_ip_time', 'idx_login_attempts_attempted_at');
    `);
    assert.equal(candidateIdxs, '3', 'all 3 candidate indexes must be created');

    // Verify 3 candidate RPCs exist with candidate provenance
    const prodFuncCount = runPsql(psql, target, `
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = '${prodSchema}'
        AND p.proname IN ('check_login_rate_limit', 'record_failed_login_transaction', 'clear_login_attempts');
    `);
    assert.equal(prodFuncCount, '3', 'candidate RPC functions created on production baseline');

    // Verify table provenance marker
    const tableComment = runPsql(psql, target, `
      SELECT description FROM pg_description d
      JOIN pg_class c ON d.objoid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE n.nspname = '${prodSchema}' AND c.relname = 'login_attempts' AND d.objsubid = 0;
    `);
    assert.equal(tableComment, 'kurabe:p98:reconcile:v1:table:login_attempts', 'table provenance marker must match');
    executedCases.push('production baseline: reconciled successfully, preserved all 43 rows, retained legacy index');

    // Execute rollback on production collision baseline
    const adaptedProdRollback = adaptSqlToSchema(rollbackSql, prodSchema);
    runPsql(psql, target, `SET kurabe.p98_rollback_approved = 'true';\n${adaptedProdRollback}`);

    // Verify post-rollback invariants
    const postRollbackRows = runPsql(psql, target, `
      SELECT count(*) FROM ${prodQualified}.login_attempts;
    `);
    assert.equal(postRollbackRows, '43', 'all 43 existing rows must remain intact after rollback');

    const legacyIdxAfterRollback = runPsql(psql, target, `
      SELECT indisvalid FROM pg_index i
      JOIN pg_class ic ON i.indexrelid = ic.oid
      JOIN pg_namespace n ON ic.relnamespace = n.oid
      WHERE n.nspname = '${prodSchema}' AND ic.relname = 'idx_login_attempts_code_ip_time';
    `);
    assert.equal(legacyIdxAfterRollback, 't', 'legacy index must remain valid after rollback');

    const candidateIdxsAfterRollback = runPsql(psql, target, `
      SELECT count(*) FROM pg_indexes
      WHERE schemaname = '${prodSchema}' AND tablename = 'login_attempts'
        AND indexname IN ('idx_login_attempts_code_time', 'idx_login_attempts_ip_time', 'idx_login_attempts_attempted_at');
    `);
    assert.equal(candidateIdxsAfterRollback, '0', 'candidate indexes must be dropped by rollback');

    const funcsAfterRollback = runPsql(psql, target, `
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = '${prodSchema}'
        AND p.proname IN ('check_login_rate_limit', 'record_failed_login_transaction', 'clear_login_attempts');
    `);
    assert.equal(funcsAfterRollback, '0', 'candidate functions must be dropped by rollback');
    executedCases.push('production baseline: rollback preserved all 43 rows, retained legacy index, and dropped candidate objects');
  } finally {
    if (prodCreated) {
      runPsql(psql, target, `DROP SCHEMA IF EXISTS ${prodQualified} CASCADE;`);
    }
  }

  // ------------------------------------------------------------
  // SCENARIO 3: UNEXPECTED BASELINE FAIL-CLOSED & ZERO PARTIAL MUTATION
  // ------------------------------------------------------------
  const unexpSchema = `kurabe_harness_unexp_${cryptoSuffix()}`;
  const unexpQualified = quoteIdentifier(unexpSchema);
  let unexpCreated = false;

  try {
    runPsql(psql, target, `CREATE SCHEMA ${unexpQualified};`);
    unexpCreated = true;

    // Subcase 3a: Prerequisite users table missing
    const missingUsersForward = adaptSqlToSchema(forwardSql, unexpSchema);
    assertSqlFails(
      missingUsersForward,
      `P98M2T10_PREFLIGHT_FAILED: ${unexpSchema}.users table not found`,
      'fails closed when prerequisite users table is missing'
    );

    // Create users table for subsequent subcases
    runPsql(psql, target, `
      CREATE TABLE ${unexpQualified}.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_code text NOT NULL UNIQUE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        password_hash text,
        password_setup_required boolean NOT NULL DEFAULT false
      );
    `);

    // Subcase 3b: Table has unexpected extra column
    runPsql(psql, target, `
      CREATE TABLE ${unexpQualified}.login_attempts (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        employee_code text NOT NULL,
        ip text NOT NULL,
        attempted_at timestamptz DEFAULT now() NOT NULL,
        unexpected_extra_col text NOT NULL DEFAULT 'invalid'
      );
      ALTER TABLE ${unexpQualified}.login_attempts ENABLE ROW LEVEL SECURITY;
      CREATE INDEX idx_login_attempts_code_ip_time ON ${unexpQualified}.login_attempts (employee_code, ip, attempted_at);
    `);

    assertSqlFails(
      adaptSqlToSchema(forwardSql, unexpSchema),
      `P98M2T10_PREFLIGHT_FAILED: ${unexpSchema}.login_attempts column count mismatch`,
      'fails closed on extra unexpected column'
    );

    // Verify zero partial mutation: candidate functions were NOT created
    const funcsAfterFail = runPsql(psql, target, `
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = '${unexpSchema}'
        AND p.proname IN ('check_login_rate_limit', 'record_failed_login_transaction', 'clear_login_attempts');
    `);
    assert.equal(funcsAfterFail, '0', 'zero candidate functions created after fail-closed preflight');
    executedCases.push('zero partial mutation: no candidate functions created after unexpected column preflight failure');

    // Subcase 3c: Column type mismatch (ip is inet instead of text)
    runPsql(psql, target, `DROP TABLE ${unexpQualified}.login_attempts CASCADE;`);
    runPsql(psql, target, `
      CREATE TABLE ${unexpQualified}.login_attempts (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        employee_code text NOT NULL,
        ip inet NOT NULL,
        attempted_at timestamptz DEFAULT now() NOT NULL
      );
      ALTER TABLE ${unexpQualified}.login_attempts ENABLE ROW LEVEL SECURITY;
      CREATE INDEX idx_login_attempts_code_ip_time ON ${unexpQualified}.login_attempts (employee_code, ip, attempted_at);
    `);

    assertSqlFails(
      adaptSqlToSchema(forwardSql, unexpSchema),
      `P98M2T10_PREFLIGHT_FAILED: column ${unexpSchema}.login_attempts.ip fingerprint mismatch`,
      'fails closed on column type mismatch'
    );

    // Subcase 3d: Missing legacy index idx_login_attempts_code_ip_time
    runPsql(psql, target, `DROP TABLE ${unexpQualified}.login_attempts CASCADE;`);
    runPsql(psql, target, `
      CREATE TABLE ${unexpQualified}.login_attempts (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        employee_code text NOT NULL,
        ip text NOT NULL,
        attempted_at timestamptz DEFAULT now() NOT NULL
      );
      ALTER TABLE ${unexpQualified}.login_attempts ENABLE ROW LEVEL SECURITY;
    `);

    assertSqlFails(
      adaptSqlToSchema(forwardSql, unexpSchema),
      'P98M2T10_PREFLIGHT_FAILED: legacy index idx_login_attempts_code_ip_time missing or invalid',
      'fails closed when legacy index is absent'
    );

    // Subcase 3e: Unexpected foreign key constraint
    runPsql(psql, target, `
      CREATE INDEX idx_login_attempts_code_ip_time ON ${unexpQualified}.login_attempts (employee_code, ip, attempted_at);
      ALTER TABLE ${unexpQualified}.login_attempts
        ADD CONSTRAINT fk_login_attempts_user FOREIGN KEY (employee_code) REFERENCES ${unexpQualified}.users(employee_code);
    `);

    assertSqlFails(
      adaptSqlToSchema(forwardSql, unexpSchema),
      'P98M2T10_PREFLIGHT_FAILED: unexpected foreign keys',
      'fails closed on unexpected foreign key constraint'
    );

    // Subcase 3f: Unexpected RLS policy
    runPsql(psql, target, `
      ALTER TABLE ${unexpQualified}.login_attempts DROP CONSTRAINT fk_login_attempts_user;
      CREATE POLICY p_unexp ON ${unexpQualified}.login_attempts FOR SELECT USING (true);
    `);

    assertSqlFails(
      adaptSqlToSchema(forwardSql, unexpSchema),
      `P98M2T10_PREFLIGHT_FAILED: ${unexpSchema}.login_attempts has unexpected row security policies`,
      'fails closed on unexpected RLS policy'
    );

    // Subcase 3g: Unexpected user trigger
    runPsql(psql, target, `
      DROP POLICY p_unexp ON ${unexpQualified}.login_attempts;
      CREATE OR REPLACE FUNCTION ${unexpQualified}.dummy_trigger_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
      CREATE TRIGGER tr_unexp BEFORE INSERT ON ${unexpQualified}.login_attempts FOR EACH ROW EXECUTE FUNCTION ${unexpQualified}.dummy_trigger_fn();
    `);

    assertSqlFails(
      adaptSqlToSchema(forwardSql, unexpSchema),
      'P98M2T10_PREFLIGHT_FAILED: unexpected user triggers',
      'fails closed on unexpected trigger'
    );

    // Subcase 3h: Table is a view instead of an ordinary table
    runPsql(psql, target, `
      DROP TRIGGER tr_unexp ON ${unexpQualified}.login_attempts;
      DROP TABLE ${unexpQualified}.login_attempts CASCADE;
      CREATE VIEW ${unexpQualified}.login_attempts AS SELECT 1 AS id;
    `);

    assertSqlFails(
      adaptSqlToSchema(forwardSql, unexpSchema),
      `P98M2T10_PREFLIGHT_FAILED: ${unexpSchema}.login_attempts is not an ordinary table`,
      'fails closed when login_attempts is a view'
    );
  } finally {
    if (unexpCreated) {
      runPsql(psql, target, `DROP SCHEMA IF EXISTS ${unexpQualified} CASCADE;`);
    }
  }

  // ------------------------------------------------------------
  // SCENARIO 4: ROLLBACK FAIL-CLOSED GUARDS
  // ------------------------------------------------------------
  const rbGuardSchema = `kurabe_harness_rb_${cryptoSuffix()}`;
  const rbGuardQualified = quoteIdentifier(rbGuardSchema);
  let rbGuardCreated = false;

  try {
    runPsql(psql, target, `CREATE SCHEMA ${rbGuardQualified};`);
    rbGuardCreated = true;

    // Prerequisite: users & valid reconciled schema
    runPsql(psql, target, `
      CREATE TABLE ${rbGuardQualified}.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_code text NOT NULL UNIQUE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        password_hash text,
        password_setup_required boolean NOT NULL DEFAULT false
      );
    `);

    // Run forward migration
    runPsql(psql, target, adaptSqlToSchema(forwardSql, rbGuardSchema));

    // Subcase 4a: Rollback without approval GUC -> fails closed
    assertSqlFails(
      adaptSqlToSchema(rollbackSql, rbGuardSchema),
      'ROLLBACK_UNAPPROVED',
      'rollback fails closed without explicit kurabe.p98_rollback_approved = true GUC'
    );

    // Subcase 4b: Rollback with tampered function provenance -> fails closed
    runPsql(psql, target, `
      COMMENT ON FUNCTION ${rbGuardQualified}.check_login_rate_limit(text, text, integer, integer, integer) IS 'tampered_comment';
    `);

    assertSqlFails(
      `SET kurabe.p98_rollback_approved = 'true';\n` + adaptSqlToSchema(rollbackSql, rbGuardSchema),
      `P98_ROLLBACK_PREFLIGHT_FAILED: Function ${rbGuardSchema}.check_login_rate_limit provenance marker missing or mismatched`,
      'rollback fails closed on tampered function provenance'
    );

    // Restore provenance and tamper table provenance
    runPsql(psql, target, `
      COMMENT ON FUNCTION ${rbGuardQualified}.check_login_rate_limit(text, text, integer, integer, integer) IS 'kurabe:p98:candidate:v1:function:check_login_rate_limit';
      COMMENT ON TABLE ${rbGuardQualified}.login_attempts IS 'tampered_table_marker';
    `);

    // Subcase 4c: Rollback with tampered table provenance -> fails closed
    assertSqlFails(
      `SET kurabe.p98_rollback_approved = 'true';\n` + adaptSqlToSchema(rollbackSql, rbGuardSchema),
      `P98_ROLLBACK_PREFLIGHT_FAILED: ${rbGuardSchema}.login_attempts table provenance marker missing or mismatched`,
      'rollback fails closed on tampered table provenance'
    );
  } finally {
    if (rbGuardCreated) {
      runPsql(psql, target, `DROP SCHEMA IF EXISTS ${rbGuardQualified} CASCADE;`);
    }
  }

  } catch (error) {
    suiteError = error;
    throw error;
  } finally {
    try {
      cleanupHarnessRoles(psql, target, createdHarnessRoles);
    } catch (cleanupError) {
      if (suiteError) {
        console.error(`LOGIN_ATTEMPTS_RECONCILIATION_CLEANUP: ${cleanupError.message || cleanupError}`);
      } else {
        throw cleanupError;
      }
    }
  }

  return {
    real: true,
    cases: executedCases,
    target: `loopback:${target.port}/${target.database}`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((report) => {
      console.log(`PASS login-attempts-reconciliation integration suite: ${report.cases.length} cases verified via real PostgreSQL`);
      for (const c of report.cases) {
        console.log(`  ✓ ${c}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`FAIL login-attempts-reconciliation integration suite: ${err.message || err}`);
      process.exit(1);
    });
}
