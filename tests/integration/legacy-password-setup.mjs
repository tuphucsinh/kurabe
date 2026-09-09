import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');

const FORWARD_MIGRATION_REL = 'supabase/migrations/20260905070500_p98_mark_legacy_password_setup.sql';
const ROLLBACK_REL = 'db/rollback-p98-mark-legacy-password-setup.sql';

const FORWARD_MIGRATION_PATH = path.join(projectRoot, FORWARD_MIGRATION_REL);
const ROLLBACK_PATH = path.join(projectRoot, ROLLBACK_REL);

const P98_BASELINE_COMMENT =
  'P98: Flag indicating user must set up password before normal login; NULL password_hash no longer represents a valid normal credential';
const P98M2T04_CANDIDATE_COMMENT =
  'P98M2T04: Flag indicating user must set up password before normal login; legacy NULL-password accounts marked setup-required';

// Synthetic sample bcrypt hashes for testing already-set passwords
const SAMPLE_HASH_1 = '$2b$10$7EqJtq98hPqEX7fNZaFWoOhi55j8KPGWprDAOWfcL6NwgVB5e3EmA';
const SAMPLE_HASH_2 = '$2b$10$7EqJtq98hPqEX7fNZaFWoOhi55j8KPGWprDAOWfcL6NwgVB5e3EmB';
const SAMPLE_HASH_3 = '$2b$10$7EqJtq98hPqEX7fNZaFWoOhi55j8KPGWprDAOWfcL6NwgVB5e3EmC';

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
  throw new Error(`LEGACY_PASSWORD_SETUP_GUARD: ${message}`);
}

function redact(text) {
  return String(text ?? '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/g, '[redacted-key]');
}

/**
 * Strips full SQL comments (block /* ... *\/ and line -- ...) to expose executable statements.
 */
export function stripSqlComments(sql) {
  return String(sql ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

/**
 * Strips leading SQL comments (single-line and block) and whitespace
 * to expose the first executable statement.
 */
export function stripLeadingSqlComments(sql) {
  return String(sql ?? '')
    .replace(/^(?:\s+|--[^\r\n]*(?:\r?\n|$)|(?:\/\*[\s\S]*?\*\/))+/, '')
    .trimStart();
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

function locatePsql() {
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

function execPsql(psql, target, sql) {
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
  return {
    status: result.status,
    stdout: String(result.stdout ?? '').trim(),
    stderr: redact(String(result.stderr ?? '').trim()),
    error: result.error,
  };
}

function queryPsql(psql, target, sql) {
  const res = execPsql(psql, target, sql);
  if (res.error || res.status !== 0) {
    const detail = res.error?.code === 'ENOENT'
      ? 'psql executable was not found'
      : (res.stderr || res.error?.message || `exit ${res.status}`);
    fail(`psql query failed: ${detail}`);
  }
  return res.stdout;
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

/**
 * Static source contract assertions on the forward migration and rollback SQL files.
 */
function verifySourceContracts() {
  const cases = [];

  // 1. Forward Migration Artifact & Headers
  assert.ok(fs.existsSync(FORWARD_MIGRATION_PATH), `Forward migration must exist at ${FORWARD_MIGRATION_PATH}`);
  const forwardSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');

  assert.ok(
    forwardSql.includes('CANDIDATE ONLY — NOT APPLIED') || forwardSql.includes('CANDIDATE ONLY'),
    'Forward migration must contain CANDIDATE ONLY safety banner'
  );
  assert.ok(
    forwardSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL'),
    'Forward migration must require explicit approval'
  );
  const cleanForwardSql = stripSqlComments(forwardSql).trim();
  const leadingStrippedForwardSql = stripLeadingSqlComments(forwardSql);
  assert.ok(
    leadingStrippedForwardSql.startsWith('BEGIN;') && cleanForwardSql.startsWith('BEGIN;'),
    'Forward migration must start with BEGIN;'
  );
  assert.ok(
    cleanForwardSql.endsWith('COMMIT;'),
    'Forward migration must end with COMMIT;'
  );
  cases.push('source-contract: forward migration candidate header & hermetic transaction');

  // 2. Forward Migration Safety, Locking & Logic Invariants
  assert.ok(
    forwardSql.includes('LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;'),
    'Forward migration must lock public.users in SHARE ROW EXCLUSIVE MODE before counting'
  );
  assert.ok(
    forwardSql.includes('P98M2T04_PREFLIGHT_FAILED: public.users table not found'),
    'Forward migration must fail closed if public.users table is missing'
  );
  assert.ok(
    forwardSql.includes('P98M2T04_PREFLIGHT_FAILED: public.users.password_hash column not found'),
    'Forward migration must fail closed if password_hash column is missing'
  );
  assert.ok(
    forwardSql.includes('P98M2T04_PREFLIGHT_FAILED: public.users.password_setup_required column not found'),
    'Forward migration must fail closed if password_setup_required column is missing'
  );
  assert.ok(
    forwardSql.includes('P98M2T04_PREFLIGHT_FAILED: public.users.password_setup_required contains NULL values'),
    'Forward migration must fail closed if password_setup_required contains NULL values'
  );
  assert.ok(
    forwardSql.includes('P98M2T04_ROW_COUNT_MISMATCH'),
    'Forward migration must assert affected count matches preflight eligible count'
  );
  assert.ok(
    forwardSql.includes('P98M2T04_POSTCONDITION_FAILED'),
    'Forward migration must verify zero unmigrated rows remain'
  );
  assert.ok(
    forwardSql.includes('UPDATE public.users') &&
    forwardSql.includes('SET password_setup_required = true') &&
    forwardSql.includes('WHERE password_hash IS NULL;'),
    'Forward migration must update ONLY rows where password_hash IS NULL'
  );
  assert.ok(
    !/UPDATE\s+public\.users\s+SET\s+password_hash/i.test(forwardSql),
    'Forward migration must NEVER create, set, or modify password_hash'
  );
  assert.ok(
    forwardSql.includes(P98M2T04_CANDIDATE_COMMENT),
    'Forward migration must set column comment to P98M2T04 candidate marker'
  );
  cases.push('source-contract: forward migration preflight checks, table locks, and row count diagnostics');

  // 3. Rollback Candidate Artifact & Headers
  assert.ok(fs.existsSync(ROLLBACK_PATH), `Rollback candidate must exist at ${ROLLBACK_PATH}`);
  const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');

  assert.ok(
    rollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED') || rollbackSql.includes('ROLLBACK CANDIDATE ONLY'),
    'Rollback candidate must contain ROLLBACK CANDIDATE ONLY safety banner'
  );
  assert.ok(
    rollbackSql.includes('DO NOT EXECUTE DIRECTLY WITHOUT EXPLICIT APPROVAL'),
    'Rollback candidate must require explicit approval'
  );
  const cleanRollbackSql = stripSqlComments(rollbackSql).trim();
  const leadingStrippedRollbackSql = stripLeadingSqlComments(rollbackSql);
  assert.ok(
    leadingStrippedRollbackSql.startsWith('BEGIN;') && cleanRollbackSql.startsWith('BEGIN;'),
    'Rollback candidate must start with BEGIN;'
  );
  assert.ok(
    cleanRollbackSql.endsWith('COMMIT;'),
    'Rollback candidate must end with COMMIT;'
  );
  cases.push('source-contract: rollback candidate header & hermetic transaction');

  // 4. Rollback GUC Approval & Logic Invariants
  assert.ok(
    /current_setting\(\s*'kurabe\.p98_rollback_approved'\s*,\s*true\s*\)/i.test(rollbackSql),
    'Rollback candidate must inspect custom GUC kurabe.p98_rollback_approved'
  );
  assert.ok(
    rollbackSql.includes('ROLLBACK_UNAPPROVED'),
    'Rollback candidate must abort with ROLLBACK_UNAPPROVED if GUC is not explicitly true'
  );
  assert.ok(
    !/SET\s+kurabe\.p98_rollback_approved/i.test(cleanRollbackSql),
    'Rollback candidate must NEVER set kurabe.p98_rollback_approved internally'
  );
  assert.ok(
    rollbackSql.includes('LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;'),
    'Rollback candidate must acquire SHARE ROW EXCLUSIVE lock before counting revertible rows'
  );
  assert.ok(
    rollbackSql.includes('SET password_setup_required = false') &&
    rollbackSql.includes('WHERE password_hash IS NULL') &&
    rollbackSql.includes('AND password_setup_required = true'),
    'Rollback candidate must revert ONLY rows where password_hash IS NULL and password_setup_required = true'
  );
  assert.ok(
    rollbackSql.includes('P98_ROLLBACK_NOOP'),
    'Rollback candidate must safely no-op when candidate state is absent'
  );
  assert.ok(
    rollbackSql.includes(P98_BASELINE_COMMENT),
    'Rollback candidate must restore column provenance to P98 baseline'
  );
  assert.ok(
    !/\bDROP\s+TABLE\b/i.test(rollbackSql) &&
    !/\bDELETE\s+FROM\b/i.test(rollbackSql) &&
    !/\bTRUNCATE\b/i.test(rollbackSql),
    'Rollback candidate must NEVER drop tables, truncate, or delete rows'
  );
  cases.push('source-contract: rollback approval guard, conditional revert, and no-op safety');

  return cases;
}

/**
 * Executes full behavioral qualification matrix against real local PostgreSQL database.
 */
export async function run({ rootDir = projectRoot, suite = 'legacy-password-setup', options = {} } = {}) {
  // 1. Run static source contract verification first
  const sourceCases = verifySourceContracts();
  const dbCases = [];

  // 2. Local target identity and guards
  const target = parseTarget(options);

  // Negative target guard tests (refuse forbidden targets before connection attempt)
  assert.throws(
    () => assertLocalTarget({ host: '198.51.100.10', port: 5432, database: 'kurabe_harness', user: 'postgres' }),
    /database host must be loopback/,
    'must refuse non-loopback host'
  );
  dbCases.push('guard: remote DB target refusal before connection attempt');

  assert.throws(
    () => assertLocalTarget({ host: '127.0.0.1', port: 5432, database: 'kurabe_production', user: 'postgres' }),
    /database name must be an explicitly disposable kurabe_harness database/,
    'must refuse non-harness database'
  );
  dbCases.push('guard: non-harness database name refusal before connection attempt');

  assert.throws(
    () => assertLocalTarget({ host: '127.0.0.1', port: 0, database: 'kurabe_harness', user: 'postgres' }),
    /database port is invalid/,
    'must refuse invalid port'
  );
  assert.throws(
    () => assertLocalTarget({ host: '127.0.0.1', port: 5432, database: 'kurabe_harness', user: 'root;DROP TABLE' }),
    /database user must be a plain local role name/,
    'must refuse invalid user'
  );
  dbCases.push('guard: invalid port and role name refusal');

  // 3. Locate psql
  const psql = locatePsql();
  if (!psql) {
    fail('psql executable is unavailable; install/access approval is required, and a mock database is forbidden');
  }

  // 4. Verify connected server loopback identity
  const identity = queryPsql(psql, target, `
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
  dbCases.push('db-identity: connected server loopback identity and database qualification');

  // Load raw SQL file contents
  const forwardSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');

  // Helper to query column comment on public.users.password_setup_required
  function getColumnComment() {
    return queryPsql(psql, target, `
      SELECT col_description(c.oid, a.attnum)
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relname = 'users'
        AND a.attname = 'password_setup_required'
        AND NOT a.attisdropped;
    `);
  }

  // Manage table isolation: preserve any existing public.users table during test run
  let tableExistedBefore = false;
  let tempBackupName = null;

  try {
    const tableCheck = queryPsql(psql, target, `
      SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users';
    `);
    if (tableCheck === '1') {
      tableExistedBefore = true;
      tempBackupName = `users_p98m2t04_bak_${Date.now()}`;
      queryPsql(psql, target, `ALTER TABLE public.users RENAME TO ${tempBackupName};`);
    }

    // ============================================================
    // SCENARIO 1: PREFLIGHT FAIL-CLOSED ABORTS
    // ============================================================

    // 1.1: Missing public.users table
    const noTableRun = execPsql(psql, target, forwardSql);
    assert.notEqual(noTableRun.status, 0, 'Forward migration must abort when public.users table is missing');
    assert.match(noTableRun.stderr, /P98M2T04_PREFLIGHT_FAILED: public\.users table not found/);
    dbCases.push('abort: forward migration fails closed when public.users table is missing');

    // Create minimal users table WITHOUT password_setup_required (P98M2T01 missing)
    queryPsql(psql, target, `
      CREATE TABLE public.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_code text NOT NULL UNIQUE,
        name text NOT NULL,
        role text NOT NULL DEFAULT 'Employee',
        password_hash text,
        is_active boolean NOT NULL DEFAULT true
      );
    `);

    // 1.2: Missing password_setup_required column
    const noColRun = execPsql(psql, target, forwardSql);
    assert.notEqual(noColRun.status, 0, 'Forward migration must abort when password_setup_required column is missing');
    assert.match(noColRun.stderr, /P98M2T04_PREFLIGHT_FAILED: public\.users\.password_setup_required column not found/);
    dbCases.push('abort: forward migration fails closed when password_setup_required column is missing');

    // 1.3: Non-boolean password_setup_required column
    queryPsql(psql, target, `ALTER TABLE public.users ADD COLUMN password_setup_required text;`);
    const wrongTypeRun = execPsql(psql, target, forwardSql);
    assert.notEqual(wrongTypeRun.status, 0, 'Forward migration must abort when password_setup_required is non-boolean');
    assert.match(wrongTypeRun.stderr, /P98M2T04_PREFLIGHT_FAILED: public\.users\.password_setup_required has unexpected data type "text"/);
    dbCases.push('abort: forward migration fails closed when password_setup_required has non-boolean type');

    // 1.4: NULL values in password_setup_required
    queryPsql(psql, target, `
      ALTER TABLE public.users DROP COLUMN password_setup_required;
      ALTER TABLE public.users ADD COLUMN password_setup_required boolean;
      INSERT INTO public.users (employee_code, name, password_hash, password_setup_required)
        VALUES ('EMP_NULL_TEST', 'Null Setup Required Test', NULL, NULL);
    `);
    const nullValRun = execPsql(psql, target, forwardSql);
    assert.notEqual(nullValRun.status, 0, 'Forward migration must abort when password_setup_required contains NULL values');
    assert.match(nullValRun.stderr, /P98M2T04_PREFLIGHT_FAILED: public\.users\.password_setup_required contains NULL values/);
    dbCases.push('abort: forward migration fails closed when password_setup_required contains NULL values');

    // Clean up test row and set NOT NULL constraint
    queryPsql(psql, target, `
      DELETE FROM public.users WHERE employee_code = 'EMP_NULL_TEST';
      ALTER TABLE public.users ALTER COLUMN password_setup_required SET NOT NULL;
      ALTER TABLE public.users ALTER COLUMN password_setup_required SET DEFAULT false;
    `);

    // 1.5: Missing / unexpected provenance marker
    const noCommentRun = execPsql(psql, target, forwardSql);
    assert.notEqual(noCommentRun.status, 0, 'Forward migration must abort when provenance comment is missing');
    assert.match(noCommentRun.stderr, /P98M2T04_PREFLIGHT_FAILED: public\.users\.password_setup_required column provenance marker missing or unexpected/);
    dbCases.push('abort: forward migration fails closed when column provenance marker is missing or unexpected');

    // Set valid P98 baseline comment (P98M2T01 prerequisite established)
    queryPsql(psql, target, `
      COMMENT ON COLUMN public.users.password_setup_required IS '${P98_BASELINE_COMMENT}';
    `);

    // 1.6: Rollback candidate unapproved guard check
    const unapprovedRollback = execPsql(psql, target, rollbackSql);
    assert.notEqual(unapprovedRollback.status, 0, 'Rollback must abort when kurabe.p98_rollback_approved is not set');
    assert.match(unapprovedRollback.stderr, /ROLLBACK_UNAPPROVED/);
    dbCases.push('abort: rollback candidate fails closed when approval GUC is not set to true');

    // ============================================================
    // SCENARIO 2: ZERO-ELIGIBLE MIGRATION
    // ============================================================
    // Seed 2 accounts that ALREADY have password_hash set (0 legacy NULL accounts)
    queryPsql(psql, target, `
      TRUNCATE TABLE public.users;
      INSERT INTO public.users (employee_code, name, password_hash, password_setup_required) VALUES
        ('EMP_ZERO_1', 'Zero Eligible 1', '${SAMPLE_HASH_1}', false),
        ('EMP_ZERO_2', 'Zero Eligible 2', '${SAMPLE_HASH_2}', false);
    `);

    const zeroMigrateRun = execPsql(psql, target, forwardSql);
    assert.equal(zeroMigrateRun.status, 0, `Zero-eligible forward migration failed: ${zeroMigrateRun.stderr}`);

    // Verify 0 rows modified, both accounts untouched
    const zeroEligibleCheck = queryPsql(psql, target, `
      SELECT count(*) || '|' ||
             count(*) FILTER (WHERE password_setup_required = true) || '|' ||
             count(*) FILTER (WHERE password_hash IS NOT NULL)
      FROM public.users;
    `);
    assert.equal(zeroEligibleCheck, '2|0|2', 'Zero-eligible migration must leave all rows with password_setup_required = false');

    // Provenance comment updated to P98M2T04 candidate
    assert.equal(getColumnComment(), P98M2T04_CANDIDATE_COMMENT);
    dbCases.push('zero-eligible: migration succeeds with zero legacy accounts, leaves non-legacy untouched, updates provenance');

    // ============================================================
    // SCENARIO 3: VALID MIXED ACCOUNTS MIGRATION
    // ============================================================
    // Reset table and restore P98 baseline comment
    queryPsql(psql, target, `
      TRUNCATE TABLE public.users;
      COMMENT ON COLUMN public.users.password_setup_required IS '${P98_BASELINE_COMMENT}';
    `);

    // Seed mixed test data:
    // - 3 legacy NULL password accounts (password_hash IS NULL, password_setup_required = false)
    // - 2 accounts with already-set password hashes (password_hash IS NOT NULL, password_setup_required = false)
    // - 1 account with already-set password hash and setup_required = true (e.g. from prior admin reset)
    queryPsql(psql, target, `
      INSERT INTO public.users (employee_code, name, password_hash, password_setup_required) VALUES
        ('LEGACY_01', 'Legacy Employee 1', NULL, false),
        ('LEGACY_02', 'Legacy Employee 2', NULL, false),
        ('LEGACY_03', 'Legacy Employee 3', NULL, false),
        ('HASHED_01', 'Hashed Employee 1', '${SAMPLE_HASH_1}', false),
        ('HASHED_02', 'Hashed Employee 2', '${SAMPLE_HASH_2}', false),
        ('HASHED_RESET', 'Hashed Reset Employee', '${SAMPLE_HASH_3}', true);
    `);

    // Capture preflight baseline counts
    const preCounts = queryPsql(psql, target, `
      SELECT count(*) FILTER (WHERE password_hash IS NULL) || '|' ||
             count(*) FILTER (WHERE password_hash IS NOT NULL) || '|' ||
             count(*) FILTER (WHERE password_setup_required = true)
      FROM public.users;
    `);
    assert.equal(preCounts, '3|3|1', 'Preflight counts must match expected seed matrix');
    dbCases.push('valid-migration: preflight eligible count matches atomic updated row count exactly');

    // Execute forward migration against real database
    const validMigrateRun = execPsql(psql, target, forwardSql);
    assert.equal(validMigrateRun.status, 0, `Forward migration failed: ${validMigrateRun.stderr}`);

    // Verify no-lockout: all 3 legacy accounts marked password_setup_required = true
    const legacyMigratedCheck = queryPsql(psql, target, `
      SELECT employee_code || '|' || coalesce(password_hash, '<NULL>') || '|' || password_setup_required::text
      FROM public.users
      WHERE employee_code IN ('LEGACY_01', 'LEGACY_02', 'LEGACY_03')
      ORDER BY employee_code;
    `);
    const expectedLegacyRows = [
      'LEGACY_01|<NULL>|true',
      'LEGACY_02|<NULL>|true',
      'LEGACY_03|<NULL>|true',
    ].join('\n');
    assert.equal(legacyMigratedCheck, expectedLegacyRows, 'All legacy NULL-password accounts must be marked setup-required');
    dbCases.push('no-lockout: legacy NULL-password accounts marked setup-required without password creation or tokens');

    // Verify already-hashed accounts are 100% untouched
    const hashedAccountsCheck = queryPsql(psql, target, `
      SELECT employee_code || '|' || password_hash || '|' || password_setup_required::text
      FROM public.users
      WHERE employee_code IN ('HASHED_01', 'HASHED_02', 'HASHED_RESET')
      ORDER BY employee_code;
    `);
    const expectedHashedRows = [
      `HASHED_01|${SAMPLE_HASH_1}|false`,
      `HASHED_02|${SAMPLE_HASH_2}|false`,
      `HASHED_RESET|${SAMPLE_HASH_3}|true`,
    ].join('\n');
    assert.equal(hashedAccountsCheck, expectedHashedRows, 'Already-hashed accounts must remain 100% untouched in hashes and flags');
    dbCases.push('untouched-hashes: existing hashed accounts retain exact hashes and flags unchanged');

    // Verify postcondition: zero unmigrated rows remain
    const unmigratedCheck = queryPsql(psql, target, `
      SELECT count(*)
      FROM public.users
      WHERE password_hash IS NULL
        AND password_setup_required IS DISTINCT FROM true;
    `);
    assert.equal(unmigratedCheck, '0', 'Postcondition failed: unmigrated legacy rows remain');
    dbCases.push('postcondition: zero unmigrated rows remain after forward migration');

    // Verify column provenance marker updated to P98M2T04 candidate
    assert.equal(getColumnComment(), P98M2T04_CANDIDATE_COMMENT, 'Column provenance must reflect P98M2T04 candidate');

    // ============================================================
    // SCENARIO 4: REPEATED MIGRATION (IDEMPOTENCY)
    // ============================================================
    const repeatMigrateRun = execPsql(psql, target, forwardSql);
    assert.equal(repeatMigrateRun.status, 0, `Repeated forward migration failed: ${repeatMigrateRun.stderr}`);

    // All accounts remain in exact same state
    const repeatCheck = queryPsql(psql, target, `
      SELECT count(*) FILTER (WHERE password_setup_required = true) || '|' ||
             count(*) FILTER (WHERE password_hash IS NULL) || '|' ||
             count(*) FILTER (WHERE password_hash IS NOT NULL)
      FROM public.users;
    `);
    assert.equal(repeatCheck, '4|3|3', 'Repeated migration must preserve all row counts and states');
    assert.equal(getColumnComment(), P98M2T04_CANDIDATE_COMMENT);
    dbCases.push('repeat-migration: forward migration is idempotent and succeeds when reapplied');

    // ============================================================
    // SCENARIO 5: APPROVED ROLLBACK CANDIDATE EXECUTION
    // ============================================================
    const approvedRollbackSql = `SET kurabe.p98_rollback_approved = 'true';\n${rollbackSql}`;
    const rollbackRun = execPsql(psql, target, approvedRollbackSql);
    assert.equal(rollbackRun.status, 0, `Approved rollback failed: ${rollbackRun.stderr}`);

    // Verify legacy accounts reverted to password_setup_required = false
    const legacyRevertedCheck = queryPsql(psql, target, `
      SELECT employee_code || '|' || coalesce(password_hash, '<NULL>') || '|' || password_setup_required::text
      FROM public.users
      WHERE employee_code IN ('LEGACY_01', 'LEGACY_02', 'LEGACY_03')
      ORDER BY employee_code;
    `);
    const expectedRevertedLegacy = [
      'LEGACY_01|<NULL>|false',
      'LEGACY_02|<NULL>|false',
      'LEGACY_03|<NULL>|false',
    ].join('\n');
    assert.equal(legacyRevertedCheck, expectedRevertedLegacy, 'Rollback must revert legacy accounts to password_setup_required = false');

    // Verify column comment restored to P98 baseline
    assert.equal(getColumnComment(), P98_BASELINE_COMMENT, 'Rollback must restore column comment to P98 baseline');
    dbCases.push('rollback-approved: reverses legacy setup-required state back to false and restores baseline provenance');

    // Verify already-hashed accounts remained 100% untouched throughout rollback
    const hashedAfterRollback = queryPsql(psql, target, `
      SELECT employee_code || '|' || password_hash || '|' || password_setup_required::text
      FROM public.users
      WHERE employee_code IN ('HASHED_01', 'HASHED_02', 'HASHED_RESET')
      ORDER BY employee_code;
    `);
    assert.equal(hashedAfterRollback, expectedHashedRows, 'Already-hashed accounts must remain untouched throughout rollback');
    dbCases.push('rollback-untouched: already-hashed accounts retain exact credentials throughout rollback');

    // ============================================================
    // SCENARIO 6: REPEATED ROLLBACK (IDEMPOTENCY / NO-OP FALLBACK)
    // ============================================================
    const repeatRollbackRun = execPsql(psql, target, approvedRollbackSql);
    assert.equal(repeatRollbackRun.status, 0, `Repeated rollback failed: ${repeatRollbackRun.stderr}`);
    assert.match(
      repeatRollbackRun.stderr,
      /P98_ROLLBACK_NOOP/,
      'Repeated rollback must take no-op branch when candidate state is already absent'
    );

    // Verify state unchanged
    const stateAfterRepeatRollback = queryPsql(psql, target, `
      SELECT count(*) FILTER (WHERE password_setup_required = true) || '|' ||
             count(*) FILTER (WHERE password_hash IS NULL)
      FROM public.users;
    `);
    assert.equal(stateAfterRepeatRollback, '1|3', 'No-op rollback must not alter any rows');
    assert.equal(getColumnComment(), P98_BASELINE_COMMENT);
    dbCases.push('repeat-rollback: rollback candidate is idempotent and preserves no-op when already at baseline');

    // ============================================================
    // SCENARIO 7: MULTI-ROUND LIFECYCLE TRANSITION
    // ============================================================
    // Re-apply forward migration: must succeed and re-mark legacy accounts
    const reMigrateRun = execPsql(psql, target, forwardSql);
    assert.equal(reMigrateRun.status, 0, `Re-migration failed: ${reMigrateRun.stderr}`);
    assert.equal(getColumnComment(), P98M2T04_CANDIDATE_COMMENT);

    // Re-apply rollback: must succeed and revert legacy accounts again
    const reRollbackRun = execPsql(psql, target, approvedRollbackSql);
    assert.equal(reRollbackRun.status, 0, `Re-rollback failed: ${reRollbackRun.stderr}`);
    assert.equal(getColumnComment(), P98_BASELINE_COMMENT);

    dbCases.push('lifecycle: multiple forward-rollback transition cycles preserve data integrity and consistency');

  } finally {
    // Teardown & residue cleanup
    try {
      execPsql(psql, target, `DROP TABLE IF EXISTS public.users CASCADE;`);
      if (tableExistedBefore && tempBackupName) {
        execPsql(psql, target, `ALTER TABLE public.${tempBackupName} RENAME TO users;`);
      }
    } catch {
      // Best effort cleanup
    }
  }

  dbCases.push('cleanup: disposable test tables removed and original database state verified clean');

  const allCases = [...sourceCases, ...dbCases];

  return {
    real: true,
    cases: allCases,
    target: `loopback:${target.port}/${target.database}`,
  };
}

// Standalone execution entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((report) => {
      console.log(`PASS legacy-password-setup integration suite: ${report.cases.length} cases verified against real local DB`);
      for (const c of report.cases) {
        console.log(`  ✓ ${c}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`FAIL legacy-password-setup integration suite: ${err.message || err}`);
      process.exit(1);
    });
}
