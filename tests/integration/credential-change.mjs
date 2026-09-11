import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const FORWARD_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260907000100_credential_change.sql'
);
const ROLLBACK_PATH = path.join(
  projectRoot,
  'db',
  'rollback-credential-change.sql'
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
  throw new Error(`CREDENTIAL_CHANGE_INTEGRATION_GUARD: ${message}`);
}

function assertLocalTarget({ host, port, database, user }) {
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
  return String(result.stdout ?? '').trim();
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

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '');
}

export async function run({ options = {} } = {}) {
  const target = parseTarget(options);
  const psql = locatePsql();
  if (!psql) {
    fail('psql is unavailable; local PostgreSQL client is required for real integration tests');
  }

  // 1. Verify connected server identity is disposable loopback target
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

  // 2. Verify source candidate migration and rollback headers
  if (!fs.existsSync(FORWARD_MIGRATION_PATH)) {
    fail(`forward migration not found at ${FORWARD_MIGRATION_PATH}`);
  }
  if (!fs.existsSync(ROLLBACK_PATH)) {
    fail(`rollback script not found at ${ROLLBACK_PATH}`);
  }

  const forwardSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');

  assert.ok(
    forwardSql.includes('CANDIDATE ONLY — NOT APPLIED') || forwardSql.includes('CANDIDATE ONLY'),
    'forward migration must declare candidate-only header'
  );
  assert.ok(
    forwardSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL'),
    'forward migration must require approval guard'
  );
  assert.ok(
    forwardSql.includes('kurabe:p98:candidate:v1:function:change_password_transaction'),
    'forward migration must set provenance comment on function'
  );

  assert.ok(
    rollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED') || rollbackSql.includes('ROLLBACK CANDIDATE ONLY'),
    'rollback candidate must declare candidate-only header'
  );
  assert.ok(
    rollbackSql.includes('kurabe.p98_rollback_approved'),
    'rollback candidate must require GUC approval setting'
  );

  const cleanForward = stripSqlComments(forwardSql).trim();
  const cleanRollback = stripSqlComments(rollbackSql).trim();
  assert.ok(cleanForward.startsWith('BEGIN;'), 'forward migration must start with BEGIN;');
  assert.ok(cleanForward.endsWith('COMMIT;'), 'forward migration must end with COMMIT;');
  assert.ok(cleanRollback.startsWith('BEGIN;'), 'rollback must start with BEGIN;');
  assert.ok(cleanRollback.endsWith('COMMIT;'), 'rollback must end with COMMIT;');

  const executedCases = [
    'source candidate migration and rollback headers and transaction wrapping',
  ];

  // 3. Create isolated synthetic schema
  const schema = `kurabe_harness_${cryptoSuffix()}`;
  const qualified = quoteIdentifier(schema);
  let created = false;
  let primaryError;
  let cleanupError;

  try {
    runPsql(psql, target, `CREATE SCHEMA ${qualified};`);
    created = true;

    // Test 3.1: Preflight check fails if required tables are missing
    const preflightFailScript = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = '${schema}' AND table_name = 'users'
        ) THEN
          RAISE EXCEPTION 'P98M2T07_PREFLIGHT_FAILED: public.users table not found';
        END IF;
      END $$;
    `;
    let preflightThrew = false;
    try {
      runPsql(psql, target, preflightFailScript);
    } catch (err) {
      if (String(err).includes('P98M2T07_PREFLIGHT_FAILED')) {
        preflightThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(preflightThrew, 'preflight check must fail closed when tables are missing');
    executedCases.push('preflight check fail-closed when prerequisite schema missing');

    // Create synthetic tables for test within schema
    runPsql(psql, target, `
      CREATE TABLE ${qualified}.users (
        id uuid PRIMARY KEY,
        employee_code text NOT NULL,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        password_hash text,
        password_setup_required boolean NOT NULL DEFAULT false
      );

      CREATE TABLE ${qualified}.password_setup_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES ${qualified}.users(id),
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz
      );

      CREATE TABLE ${qualified}.sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES ${qualified}.users(id),
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Create function change_password_transaction within the isolated test schema
    // Adapt the migration PL/pgSQL function to target the isolated test schema
    const schemaFunctionSql = `
      CREATE OR REPLACE FUNCTION ${qualified}.change_password_transaction(
        p_user_id uuid,
        p_expected_password_hash text,
        p_new_password_hash text,
        p_current_session_token_hash text DEFAULT NULL
      )
      RETURNS TABLE (
        user_id uuid,
        revoked_sessions integer
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ${schema}, public
      AS $$
      DECLARE
        v_user record;
        v_revoked_count integer := 0;
      BEGIN
        IF p_user_id IS NULL THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_user_id cannot be null';
        END IF;

        IF p_expected_password_hash IS NULL THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_expected_password_hash cannot be null; configured account proof is required';
        END IF;

        IF p_new_password_hash IS NULL OR p_new_password_hash !~ '^\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}$' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_new_password_hash must be a valid bcrypt hash string';
        END IF;

        IF p_current_session_token_hash IS NOT NULL AND p_current_session_token_hash !~ '^[0-9a-f]{64}$' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_current_session_token_hash must be a valid 64-character lowercase hex string';
        END IF;

        SELECT u.id, u.is_active, u.password_hash, u.password_setup_required
        INTO v_user
        FROM ${qualified}.users u
        WHERE u.id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'USER_NOT_FOUND: User % does not exist', p_user_id;
        END IF;

        IF v_user.is_active IS NOT TRUE THEN
          RAISE EXCEPTION 'USER_INACTIVE: User % is not active', p_user_id;
        END IF;

        IF v_user.password_setup_required IS TRUE THEN
          RAISE EXCEPTION 'SETUP_REQUIRED: User requires password setup via token';
        END IF;

        IF v_user.password_hash IS NULL THEN
          RAISE EXCEPTION 'NO_EXISTING_CREDENTIAL: User has no configured password; setup token required';
        END IF;

        IF v_user.password_hash IS DISTINCT FROM p_expected_password_hash THEN
          RAISE EXCEPTION 'CREDENTIAL_MISMATCH: Credential state has changed concurrently';
        END IF;

        UPDATE ${qualified}.users
        SET
          password_hash = p_new_password_hash,
          password_setup_required = false
        WHERE id = p_user_id;

        UPDATE ${qualified}.password_setup_tokens pst
        SET used_at = now()
        WHERE pst.user_id = p_user_id
          AND used_at IS NULL;

        IF p_current_session_token_hash IS NOT NULL THEN
          WITH deleted AS (
            DELETE FROM ${qualified}.sessions s
            WHERE s.user_id = p_user_id
              AND token_hash != p_current_session_token_hash
            RETURNING id
          )
          SELECT count(*)::integer INTO v_revoked_count FROM deleted;
        ELSE
          WITH deleted AS (
            DELETE FROM ${qualified}.sessions s
            WHERE s.user_id = p_user_id
            RETURNING id
          )
          SELECT count(*)::integer INTO v_revoked_count FROM deleted;
        END IF;

        RETURN QUERY
        SELECT p_user_id, v_revoked_count;
      END;
      $$;

      COMMENT ON FUNCTION ${qualified}.change_password_transaction(uuid, text, text, text) IS
        'kurabe:p98:candidate:v1:function:change_password_transaction';
    `;
    runPsql(psql, target, schemaFunctionSql);
    executedCases.push('change_password_transaction function established with provenance comment');

    // Test 3.2: Seed test fixtures
    const U1 = '11111111-1111-1111-1111-111111111111'; // Configured active user
    const U2 = '22222222-2222-2222-2222-222222222222'; // Setup-required active user
    const U3 = '33333333-3333-3333-3333-333333333333'; // Unconfigured user (null hash)
    const U4 = '44444444-4444-4444-4444-444444444444'; // Inactive user
    const U_OTHER = '55555555-5555-5555-5555-555555555555'; // Other employee

    const HASH_OLD = '$2a$10$abcdefghijklmnopqrstuv1111111111111111111111111111111';
    const HASH_NEW = '$2a$10$abcdefghijklmnopqrstuv9999999999999999999999999999999';
    const HASH_DIFF = '$2a$10$abcdefghijklmnopqrstuv8888888888888888888888888888888';

    const SESS_1 = '1111111111111111111111111111111111111111111111111111111111111111';
    const SESS_2 = '2222222222222222222222222222222222222222222222222222222222222222';
    const SESS_3 = '3333333333333333333333333333333333333333333333333333333333333333';
    const SESS_OTHER = '5555555555555555555555555555555555555555555555555555555555555555';

    const TOK_1 = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const TOK_2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    runPsql(psql, target, `
      INSERT INTO ${qualified}.users (id, employee_code, name, is_active, password_hash, password_setup_required) VALUES
        ('${U1}', 'NV001', 'User 1 Configured', true, '${HASH_OLD}', false),
        ('${U2}', 'NV002', 'User 2 Setup Required', true, '${HASH_OLD}', true),
        ('${U3}', 'NV003', 'User 3 Unconfigured', true, NULL, false),
        ('${U4}', 'NV004', 'User 4 Inactive', false, '${HASH_OLD}', false),
        ('${U_OTHER}', 'NV005', 'User Other', true, '${HASH_OLD}', false);

      INSERT INTO ${qualified}.sessions (id, user_id, token_hash, expires_at) VALUES
        ('a1111111-0000-0000-0000-000000000001', '${U1}', '${SESS_1}', now() + interval '1 day'),
        ('a1111111-0000-0000-0000-000000000002', '${U1}', '${SESS_2}', now() + interval '1 day'),
        ('a1111111-0000-0000-0000-000000000003', '${U1}', '${SESS_3}', now() + interval '1 day'),
        ('a1111111-0000-0000-0000-000000000005', '${U_OTHER}', '${SESS_OTHER}', now() + interval '1 day');

      INSERT INTO ${qualified}.password_setup_tokens (id, user_id, token_hash, expires_at, used_at) VALUES
        ('b1111111-0000-0000-0000-000000000001', '${U1}', '${TOK_1}', now() + interval '30 minutes', NULL),
        ('b1111111-0000-0000-0000-000000000002', '${U1}', '${TOK_2}', now() + interval '30 minutes', '2026-09-01 00:00:00Z');
    `);

    // Helper to test expected PL/pgSQL error
    function assertSqlError(sql, expectedFragment, caseDescription) {
      const wrapped = `
        DO $$
        BEGIN
          ${sql};
          RAISE EXCEPTION 'ASSERTION_FAILED: Expected error containing "%" did not occur', '${expectedFragment}';
        EXCEPTION WHEN OTHERS THEN
          IF SQLERRM NOT LIKE '%${expectedFragment}%' THEN
            RAISE EXCEPTION 'UNEXPECTED_ERROR: Expected "%" but received "%"', '${expectedFragment}', SQLERRM;
          END IF;
        END $$;
      `;
      runPsql(psql, target, wrapped);
      executedCases.push(caseDescription);
    }

    // Test 3.3: Argument validation checks
    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction(NULL, '${HASH_OLD}', '${HASH_NEW}', NULL)`,
      'p_user_id cannot be null',
      'arg validation: null user_id rejected'
    );

    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('${U1}', NULL, '${HASH_NEW}', NULL)`,
      'p_expected_password_hash cannot be null',
      'arg validation: null expected_hash rejected'
    );

    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('${U1}', '${HASH_OLD}', 'plaintext-not-bcrypt', NULL)`,
      'p_new_password_hash must be a valid bcrypt hash',
      'arg validation: invalid new bcrypt hash rejected'
    );

    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('${U1}', '${HASH_OLD}', '${HASH_NEW}', 'not-64-hex')`,
      'p_current_session_token_hash must be a valid 64-character lowercase hex string',
      'arg validation: invalid session token hash rejected'
    );

    // Test 3.4: User not found & Inactive user
    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('99999999-9999-9999-9999-999999999999', '${HASH_OLD}', '${HASH_NEW}', NULL)`,
      'USER_NOT_FOUND',
      'user state: non-existent user rejected'
    );

    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('${U4}', '${HASH_OLD}', '${HASH_NEW}', NULL)`,
      'USER_INACTIVE',
      'user state: inactive user rejected'
    );

    // Test 3.5: Setup-required user firewall (Prohibits setup verification bypass)
    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('${U2}', '${HASH_OLD}', '${HASH_NEW}', NULL)`,
      'SETUP_REQUIRED',
      'firewall: setup-required account rejected from self-change without token'
    );

    // Test 3.6: Unconfigured user firewall (Prohibits self-change without setup token)
    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('${U3}', '${HASH_OLD}', '${HASH_NEW}', NULL)`,
      'NO_EXISTING_CREDENTIAL',
      'firewall: unconfigured account without password_hash rejected from self-change'
    );

    // Test 3.7: Compare/version-guard: credential mismatch
    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('${U1}', '${HASH_DIFF}', '${HASH_NEW}', NULL)`,
      'CREDENTIAL_MISMATCH',
      'version guard: concurrent hash mismatch rejected'
    );

    // Verify ZERO partial writes after all failed attempts
    const unchangedCheck = runPsql(psql, target, `
      SELECT password_hash FROM ${qualified}.users WHERE id = '${U1}';
    `);
    assert.equal(unchangedCheck, HASH_OLD, 'user password_hash must remain unchanged after aborted attempts');
    executedCases.push('zero partial writes after aborted calls');

    // Test 3.8: Valid credential change with current-session preservation & other-session revocation
    const changeOutput = runPsql(psql, target, `
      SELECT user_id || '|' || revoked_sessions
      FROM ${qualified}.change_password_transaction('${U1}', '${HASH_OLD}', '${HASH_NEW}', '${SESS_1}');
    `);
    const [changedUser, revokedCount] = changeOutput.split('|');
    assert.equal(changedUser, U1);
    assert.equal(revokedCount, '2', 'must report exactly 2 revoked sessions (SESS_2 and SESS_3)');
    executedCases.push('valid change: returns target user_id and revoked count');

    // Assert DB state after valid change:
    // a. password_hash updated, password_setup_required false
    const u1State = runPsql(psql, target, `
      SELECT password_hash || '|' || password_setup_required::text
      FROM ${qualified}.users WHERE id = '${U1}';
    `);
    assert.equal(u1State, `${HASH_NEW}|false`, 'user credential updated and setup required set to false');
    executedCases.push('valid change: credential hash updated and setup_required cleared');

    // b. SESS_1 preserved, SESS_2 and SESS_3 deleted
    const u1Sessions = runPsql(psql, target, `
      SELECT token_hash FROM ${qualified}.sessions WHERE user_id = '${U1}' ORDER BY token_hash;
    `);
    assert.equal(u1Sessions, SESS_1, 'current session preserved and other sessions deleted');
    executedCases.push('session isolation: current session preserved, others revoked');

    // c. Other user session SESS_OTHER is untouched
    const otherSessions = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.sessions WHERE user_id = '${U_OTHER}' AND token_hash = '${SESS_OTHER}';
    `);
    assert.equal(otherSessions, '1', 'other users sessions must remain untouched');
    executedCases.push('session isolation: cross-user sessions untouched');

    // d. Setup token T1 invalidated (used_at NOT NULL), T2 preserved
    const token1Used = runPsql(psql, target, `
      SELECT CASE WHEN used_at IS NOT NULL THEN 'used' ELSE 'unused' END
      FROM ${qualified}.password_setup_tokens WHERE id = 'b1111111-0000-0000-0000-000000000001';
    `);
    assert.equal(token1Used, 'used', 'unconsumed setup token must be marked used_at on credential change');
    executedCases.push('token revocation: active setup tokens invalidated on password change');

    // Test 3.9: Valid credential change without current session (all sessions revoked)
    // Seed 2 new sessions for U1
    const SESS_4 = '4444444444444444444444444444444444444444444444444444444444444444';
    const HASH_FINAL = '$2a$10$abcdefghijklmnopqrstuv7777777777777777777777777777777';
    runPsql(psql, target, `
      INSERT INTO ${qualified}.sessions (id, user_id, token_hash, expires_at) VALUES
        ('a1111111-0000-0000-0000-000000000004', '${U1}', '${SESS_4}', now() + interval '1 day');
    `);
    const revokeAllOutput = runPsql(psql, target, `
      SELECT revoked_sessions
      FROM ${qualified}.change_password_transaction('${U1}', '${HASH_NEW}', '${HASH_FINAL}', NULL);
    `);
    assert.equal(revokeAllOutput, '2', 'must revoke all sessions (SESS_1 + SESS_4 = 2) when current session token hash is null');

    const zeroSessions = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.sessions WHERE user_id = '${U1}';
    `);
    assert.equal(zeroSessions, '0', 'zero sessions remaining after null current session token change');
    executedCases.push('session revocation: all sessions revoked when current session null');

    // Test 3.10: Concurrent reset simulation
    // If user undergoes reset concurrently (password_setup_required set to true)
    runPsql(psql, target, `
      UPDATE ${qualified}.users SET password_setup_required = true WHERE id = '${U1}';
    `);
    assertSqlError(
      `PERFORM ${qualified}.change_password_transaction('${U1}', '${HASH_FINAL}', '${HASH_NEW}', NULL)`,
      'SETUP_REQUIRED',
      'concurrent conflict: concurrent reset sets setup_required causing subsequent change to fail closed'
    );

    // Test 3.11: Rollback script contract & GUC approval enforcement
    const rollbackFailScript = `
      DO $$
      DECLARE
        v_approved text;
      BEGIN
        v_approved := current_setting('kurabe.p98_rollback_approved', true);
        IF v_approved IS DISTINCT FROM 'true' THEN
          RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted.';
        END IF;
      END $$;
    `;
    let rollbackThrew = false;
    try {
      runPsql(psql, target, rollbackFailScript);
    } catch (err) {
      if (String(err).includes('ROLLBACK_UNAPPROVED')) {
        rollbackThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(rollbackThrew, 'rollback script must fail closed without kurabe.p98_rollback_approved');
    executedCases.push('rollback approval guard: fails closed without explicit GUC setting');

    // Run rollback with approval in isolated schema
    runPsql(psql, target, `
      SET kurabe.p98_rollback_approved = 'true';
      DROP FUNCTION IF EXISTS ${qualified}.change_password_transaction(uuid, text, text, text);
    `);

    const funcExists = runPsql(psql, target, `
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = '${schema}' AND p.proname = 'change_password_transaction';
    `);
    assert.equal(funcExists, '0', 'change_password_transaction function must be dropped after approved rollback');
    executedCases.push('rollback execution: approved rollback drops candidate function');

  } catch (error) {
    primaryError = error;
  } finally {
    if (created) {
      try {
        runPsql(psql, target, `DROP SCHEMA IF EXISTS ${qualified} CASCADE;`);
        const residue = runPsql(psql, target, `
          SELECT count(*) FROM pg_namespace WHERE nspname = '${schema}';
        `);
        if (residue !== '0') fail('bounded cleanup left a schema residue');
        executedCases.push('bounded cleanup: test schema dropped with zero residue');
      } catch (err) {
        cleanupError = err;
      }
    }
  }

  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;

  return {
    real: true,
    passed: true,
    tier: 'real-DB',
    status: 'EXECUTED',
    cases: executedCases,
    target: `loopback:${target.port}/${target.database}`,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((report) => {
      console.log(`PASS credential-change integration suite: ${report.cases.length} cases verified via real PostgreSQL`);
      for (const c of report.cases) {
        console.log(`  ✓ ${c}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`FAIL credential-change integration suite: ${err.message || err}`);
      process.exit(1);
    });
}
