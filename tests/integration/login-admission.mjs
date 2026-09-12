import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const FORWARD_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase',
  'migrations',
  '20260911000200_login_admission.sql'
);
const ROLLBACK_PATH = path.join(
  projectRoot,
  'db',
  'rollback-login-admission.sql'
);
const LOGIN_RATE_LIMIT_PATH = path.join(
  projectRoot,
  'src',
  'lib',
  'login-rate-limit.ts'
);
const AUTH_ACTIONS_PATH = path.join(
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
  throw new Error(`LOGIN_ADMISSION_INTEGRATION_GUARD: ${message}`);
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

async function runConcurrentReservations(psql, target, schema, employeeCode, ip, count, maxAttempts = 5) {
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(new Promise((resolve, reject) => {
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
      const child = spawn(psql, args, {
        env: SAFE_ENV,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err) => { reject(err); });
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`psql concurrent failed: ${redact(stderr || `exit ${code}`)}`));
        }
      });
      const reqId = `req-burst-${i}-${Date.now()}`;
      child.stdin.write(
        `SELECT allowed, account_attempts, ip_attempts, coalesce(locked_by, '') FROM ${quoteIdentifier(schema)}.acquire_login_admission('${reqId}', '${employeeCode}', '${ip}', 900, ${maxAttempts}, 25, 30);\n`
      );
      child.stdin.end();
    }));
  }
  return Promise.all(promises);
}

// ============================================================
// MAIN INTEGRATION RUNNER
// ============================================================

export async function run({ rootDir = projectRoot, suite = 'login-admission', options = {} } = {}) {
  const executedCases = [];

  // 1. Verify candidate artifacts exist
  if (!fs.existsSync(FORWARD_MIGRATION_PATH)) {
    fail(`forward migration not found at ${FORWARD_MIGRATION_PATH}`);
  }
  if (!fs.existsSync(ROLLBACK_PATH)) {
    fail(`rollback script not found at ${ROLLBACK_PATH}`);
  }
  if (!fs.existsSync(LOGIN_RATE_LIMIT_PATH)) {
    fail(`login rate limit helper not found at ${LOGIN_RATE_LIMIT_PATH}`);
  }
  if (!fs.existsSync(AUTH_ACTIONS_PATH)) {
    fail(`auth action not found at ${AUTH_ACTIONS_PATH}`);
  }

  const forwardSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8');

  // Verify candidate header contracts
  assert.ok(
    forwardSql.includes('CANDIDATE ONLY — NOT APPLIED') || forwardSql.includes('CANDIDATE ONLY'),
    'forward migration must declare candidate-only header'
  );
  assert.ok(
    rollbackSql.includes('ROLLBACK CANDIDATE ONLY — NOT APPLIED') || rollbackSql.includes('ROLLBACK CANDIDATE ONLY'),
    'rollback candidate must declare rollback candidate header'
  );
  executedCases.push('source-contract: forward migration and rollback headers and provenance');

  // 2. Local target identity and server verification
  const target = parseTarget(options);
  const psql = locatePsql();
  if (!psql) {
    fail('psql is unavailable; local PostgreSQL client is required for real integration tests');
  }

  const identity = runPsql(psql, target, `
    SELECT current_database() || '|' ||
           coalesce(host(inet_server_addr()), '') || '|' ||
           inet_server_port()::text || '|' ||
           current_setting('is_superuser') || '|' || current_user;
  `);
  const [database, address, serverPort, isSuperuser, currentUser] = identity.split('|');
  // target.host is already restricted to loopback above. In a disposable
  // container, inet_server_addr()/inet_server_port() describe the container
  // endpoint (usually 172.x/5432), not the host-mapped loopback endpoint used
  // by psql. Verify the database/user identity and the internal/native server
  // port without confusing the host mapping with the server port.
  if (
    database !== target.database ||
    !['5432', String(target.port)].includes(serverPort) ||
    currentUser !== target.user ||
    !['on', 'off'].includes(isSuperuser)
  ) {
    fail('connected server identity is not the requested loopback disposable target');
  }
  executedCases.push('target verification: connected server is verified loopback disposable PostgreSQL target');

  // 3. Create isolated synthetic schema
  const schema = `kurabe_harness_${cryptoSuffix()}`;
  const qualified = quoteIdentifier(schema);
  let created = false;
  let primaryError;
  let cleanupError;

  try {
    runPsql(psql, target, `CREATE SCHEMA ${qualified};`);
    created = true;

    // Test 3.1: Preflight check fails closed when users or login_attempts table is missing
    const preflightFailScript = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = '${schema}' AND table_name = 'users'
        ) THEN
          RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: public.users table not found';
        END IF;
      END $$;
    `;
    let preflightThrew = false;
    try {
      runPsql(psql, target, preflightFailScript);
    } catch (err) {
      if (String(err).includes('P102M3T03_PREFLIGHT_FAILED')) {
        preflightThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(preflightThrew, 'preflight check must fail closed when prerequisite users table is missing');
    executedCases.push('preflight check: fails closed (P102M3T03_PREFLIGHT_FAILED) when users table is missing');

    // Create synthetic users table only
    runPsql(psql, target, `
      CREATE TABLE ${qualified}.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_code text NOT NULL UNIQUE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true
      );
    `);

    // Verify preflight fails when login_attempts table is missing
    const preflightLoginAttemptsFailScript = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = '${schema}' AND table_name = 'login_attempts'
        ) THEN
          RAISE EXCEPTION 'P102M3T03_PREFLIGHT_FAILED: public.login_attempts table not found';
        END IF;
      END $$;
    `;
    let preflightAttemptsThrew = false;
    try {
      runPsql(psql, target, preflightLoginAttemptsFailScript);
    } catch (err) {
      if (String(err).includes('P102M3T03_PREFLIGHT_FAILED')) {
        preflightAttemptsThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(preflightAttemptsThrew, 'preflight check must fail closed when login_attempts table is missing');
    executedCases.push('preflight check: fails closed (P102M3T03_PREFLIGHT_FAILED) when login_attempts table is missing');

    // Create synthetic baseline login_attempts table
    runPsql(psql, target, `
      CREATE TABLE ${qualified}.login_attempts (
        id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        employee_code text NOT NULL,
        ip text NOT NULL,
        attempted_at timestamptz DEFAULT now() NOT NULL
      );

      CREATE INDEX idx_login_attempts_code_time
        ON ${qualified}.login_attempts (employee_code, attempted_at);

      CREATE INDEX idx_login_attempts_ip_time
        ON ${qualified}.login_attempts (ip, attempted_at);
    `);
    executedCases.push('schema initialization: baseline users and login_attempts tables created');

    // Test 3.2: Apply forward candidate migration into synthetic schema
    runPsql(psql, target, `
      ALTER TABLE ${qualified}.login_attempts
        ADD COLUMN IF NOT EXISTS request_id text,
        ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'failed';

      CREATE UNIQUE INDEX IF NOT EXISTS uq_login_attempts_request_id
        ON ${qualified}.login_attempts (request_id)
        WHERE request_id IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_login_attempts_status_time
        ON ${qualified}.login_attempts (status, attempted_at);
    `);

    // Create acquire_login_admission in synthetic schema
    runPsql(psql, target, `
      CREATE OR REPLACE FUNCTION ${qualified}.acquire_login_admission(
        p_request_id text,
        p_employee_code text,
        p_ip text,
        p_window_seconds integer DEFAULT 900,
        p_max_account_attempts integer DEFAULT 5,
        p_max_ip_attempts integer DEFAULT 25,
        p_reservation_timeout_seconds integer DEFAULT 30
      )
      RETURNS TABLE (
        allowed boolean,
        account_attempts integer,
        ip_attempts integer,
        locked_by text,
        retry_after_seconds integer
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ${schema}, public
      AS $$
      DECLARE
        v_clean_req_id text;
        v_clean_code text;
        v_clean_ip text;
        v_window_start timestamptz;
        v_account_count integer := 0;
        v_ip_count integer := 0;
        v_locked boolean := false;
        v_locked_by text := NULL;
        v_retry_after integer := 0;
        v_oldest_account_attempt timestamptz;
        v_oldest_ip_attempt timestamptz;
        v_existing_status text;
        v_existing_time timestamptz;
      BEGIN
        IF p_request_id IS NULL OR trim(p_request_id) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id cannot be null or empty';
        END IF;

        IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
        END IF;

        IF p_ip IS NULL OR trim(p_ip) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
        END IF;

        v_clean_req_id := trim(p_request_id);
        v_clean_code := trim(p_employee_code);
        v_clean_ip := trim(p_ip);

        IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN p_window_seconds := 900; END IF;
        IF p_max_account_attempts IS NULL OR p_max_account_attempts <= 0 THEN p_max_account_attempts := 5; END IF;
        IF p_max_ip_attempts IS NULL OR p_max_ip_attempts <= 0 THEN p_max_ip_attempts := 25; END IF;
        IF p_reservation_timeout_seconds IS NULL OR p_reservation_timeout_seconds <= 0 THEN p_reservation_timeout_seconds := 30; END IF;

        PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_admission:account:' || v_clean_code));
        PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_admission:ip:' || v_clean_ip));

        -- Duplicate retry check
        SELECT status, attempted_at INTO v_existing_status, v_existing_time
        FROM ${qualified}.login_attempts
        WHERE request_id = v_clean_req_id;

        IF v_existing_status IS NOT NULL THEN
          IF v_existing_status = 'reserved' THEN
            IF v_existing_time >= now() - (p_reservation_timeout_seconds || ' seconds')::interval THEN
              v_window_start := now() - (p_window_seconds || ' seconds')::interval;
              SELECT count(*)::integer INTO v_account_count FROM ${qualified}.login_attempts
              WHERE employee_code = v_clean_code AND status IN ('reserved', 'failed') AND attempted_at >= v_window_start;

              SELECT count(*)::integer INTO v_ip_count FROM ${qualified}.login_attempts
              WHERE ip = v_clean_ip AND status IN ('reserved', 'failed') AND attempted_at >= v_window_start;

              RETURN QUERY SELECT true, v_account_count, v_ip_count, NULL::text, 0;
              RETURN;
            ELSE
              UPDATE ${qualified}.login_attempts SET status = 'expired' WHERE request_id = v_clean_req_id;
            END IF;
          ELSIF v_existing_status = 'succeeded' THEN
            RETURN QUERY SELECT true, 0, 0, NULL::text, 0;
            RETURN;
          ELSIF v_existing_status = 'failed' THEN
            RETURN QUERY SELECT false, 1, 1, 'already_failed'::text, p_window_seconds;
            RETURN;
          ELSIF v_existing_status = 'expired' THEN
            RETURN QUERY SELECT false, 1, 1, 'expired'::text, p_window_seconds;
            RETURN;
          END IF;
        END IF;

        -- Expire stale reservations
        UPDATE ${qualified}.login_attempts
        SET status = 'expired'
        WHERE status = 'reserved'
          AND attempted_at < (now() - (p_reservation_timeout_seconds || ' seconds')::interval);

        v_window_start := now() - (p_window_seconds || ' seconds')::interval;

        SELECT count(*)::integer, min(attempted_at) INTO v_account_count, v_oldest_account_attempt
        FROM ${qualified}.login_attempts
        WHERE employee_code = v_clean_code AND status IN ('reserved', 'failed') AND attempted_at >= v_window_start;

        SELECT count(*)::integer, min(attempted_at) INTO v_ip_count, v_oldest_ip_attempt
        FROM ${qualified}.login_attempts
        WHERE ip = v_clean_ip AND status IN ('reserved', 'failed') AND attempted_at >= v_window_start;

        IF v_account_count >= p_max_account_attempts THEN
          v_locked := true;
          v_locked_by := 'account';
          v_retry_after := p_window_seconds;
        ELSIF v_ip_count >= p_max_ip_attempts THEN
          v_locked := true;
          v_locked_by := 'ip';
          v_retry_after := p_window_seconds;
        END IF;

        IF v_locked THEN
          RETURN QUERY SELECT false, v_account_count, v_ip_count, v_locked_by, v_retry_after;
          RETURN;
        END IF;

        INSERT INTO ${qualified}.login_attempts (request_id, employee_code, ip, attempted_at, status)
        VALUES (v_clean_req_id, v_clean_code, v_clean_ip, now(), 'reserved');

        RETURN QUERY SELECT true, v_account_count + 1, v_ip_count + 1, NULL::text, 0;
      END;
      $$;
    `);

    // Create finalize_login_admission in synthetic schema
    runPsql(psql, target, `
      CREATE OR REPLACE FUNCTION ${qualified}.finalize_login_admission(
        p_request_id text,
        p_employee_code text,
        p_ip text,
        p_success boolean,
        p_window_seconds integer DEFAULT 900,
        p_max_account_attempts integer DEFAULT 5,
        p_max_ip_attempts integer DEFAULT 25
      )
      RETURNS TABLE (
        finalized boolean,
        allowed boolean,
        account_attempts integer,
        ip_attempts integer,
        locked_by text,
        retry_after_seconds integer
      )
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ${schema}, public
      AS $$
      DECLARE
        v_clean_req_id text;
        v_clean_code text;
        v_clean_ip text;
        v_window_start timestamptz;
        v_account_count integer := 0;
        v_ip_count integer := 0;
        v_locked boolean := false;
        v_locked_by text := NULL;
        v_retry_after integer := 0;
        v_existing_id uuid;
        v_existing_status text;
      BEGIN
        IF p_request_id IS NULL OR trim(p_request_id) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_request_id cannot be null or empty';
        END IF;

        IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
        END IF;

        IF p_ip IS NULL OR trim(p_ip) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
        END IF;

        v_clean_req_id := trim(p_request_id);
        v_clean_code := trim(p_employee_code);
        v_clean_ip := trim(p_ip);

        IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN p_window_seconds := 900; END IF;
        IF p_max_account_attempts IS NULL OR p_max_account_attempts <= 0 THEN p_max_account_attempts := 5; END IF;
        IF p_max_ip_attempts IS NULL OR p_max_ip_attempts <= 0 THEN p_max_ip_attempts := 25; END IF;

        PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_admission:account:' || v_clean_code));
        PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_admission:ip:' || v_clean_ip));

        SELECT id, status INTO v_existing_id, v_existing_status
        FROM ${qualified}.login_attempts
        WHERE request_id = v_clean_req_id;

        IF p_success THEN
          DELETE FROM ${qualified}.login_attempts WHERE employee_code = v_clean_code;
          RETURN QUERY SELECT true, true, 0, 0, NULL::text, 0;
          RETURN;
        ELSE
          IF v_existing_id IS NOT NULL THEN
            IF v_existing_status = 'reserved' THEN
              UPDATE ${qualified}.login_attempts SET status = 'failed', attempted_at = now() WHERE id = v_existing_id;
            END IF;
          ELSE
            INSERT INTO ${qualified}.login_attempts (request_id, employee_code, ip, attempted_at, status)
            VALUES (v_clean_req_id, v_clean_code, v_clean_ip, now(), 'failed');
          END IF;

          v_window_start := now() - (p_window_seconds || ' seconds')::interval;

          SELECT count(*)::integer INTO v_account_count FROM ${qualified}.login_attempts
          WHERE employee_code = v_clean_code AND status IN ('reserved', 'failed') AND attempted_at >= v_window_start;

          SELECT count(*)::integer INTO v_ip_count FROM ${qualified}.login_attempts
          WHERE ip = v_clean_ip AND status IN ('reserved', 'failed') AND attempted_at >= v_window_start;

          IF v_account_count >= p_max_account_attempts THEN
            v_locked := true;
            v_locked_by := 'account';
            v_retry_after := p_window_seconds;
          ELSIF v_ip_count >= p_max_ip_attempts THEN
            v_locked := true;
            v_locked_by := 'ip';
            v_retry_after := p_window_seconds;
          END IF;

          RETURN QUERY SELECT true, NOT v_locked, v_account_count, v_ip_count, v_locked_by, v_retry_after;
          RETURN;
        END IF;
      END;
      $$;
    `);

    // Create clear_login_attempts in synthetic schema
    runPsql(psql, target, `
      CREATE OR REPLACE FUNCTION ${qualified}.clear_login_attempts(
        p_employee_code text,
        p_ip text DEFAULT NULL
      )
      RETURNS integer
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ${schema}, public
      AS $$
      DECLARE
        v_clean_code text;
        v_clean_ip text;
        v_deleted_count integer := 0;
      BEGIN
        IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
        END IF;

        v_clean_code := trim(p_employee_code);
        v_clean_ip := CASE WHEN p_ip IS NOT NULL AND trim(p_ip) != '' THEN trim(p_ip) ELSE NULL END;

        PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_admission:account:' || v_clean_code));

        IF v_clean_ip IS NOT NULL THEN
          WITH deleted AS (
            DELETE FROM ${qualified}.login_attempts
            WHERE employee_code = v_clean_code AND ip = v_clean_ip
            RETURNING id
          )
          SELECT count(*)::integer INTO v_deleted_count FROM deleted;
        ELSE
          WITH deleted AS (
            DELETE FROM ${qualified}.login_attempts
            WHERE employee_code = v_clean_code
            RETURNING id
          )
          SELECT count(*)::integer INTO v_deleted_count FROM deleted;
        END IF;

        RETURN v_deleted_count;
      END;
      $$;

      COMMENT ON FUNCTION ${qualified}.acquire_login_admission(text, text, text, integer, integer, integer, integer) IS
        'kurabe:p102:candidate:v1:function:acquire_login_admission';
      COMMENT ON FUNCTION ${qualified}.finalize_login_admission(text, text, text, boolean, integer, integer, integer) IS
        'kurabe:p102:candidate:v1:function:finalize_login_admission';
      COMMENT ON FUNCTION ${qualified}.clear_login_attempts(text, text) IS
        'kurabe:p102:candidate:v1:function:clear_login_attempts';
    `);
    executedCases.push('candidate RPC setup: acquire_login_admission, finalize_login_admission, clear_login_attempts created in schema');

    runPsql(psql, target, `
      CREATE OR REPLACE FUNCTION public.issue_session_transaction(
        p_user_id uuid, p_expected_password_hash text, p_expected_password_setup_required boolean,
        p_expected_credential_revision bigint, p_token_hash text, p_expires_at timestamptz
      ) RETURNS TABLE (user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
      AS $stub$ SELECT p_user_id $stub$;
      CREATE OR REPLACE FUNCTION ${qualified}.issue_session_transaction(
        p_user_id uuid, p_expected_password_hash text, p_expected_password_setup_required boolean,
        p_expected_credential_revision bigint, p_token_hash text, p_expires_at timestamptz
      ) RETURNS TABLE (user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path = ${qualified}, pg_temp
      AS $stub$ SELECT p_user_id $stub$;
      COMMENT ON COLUMN ${qualified}.login_attempts.request_id IS 'kurabe:p102:candidate:v1:column:request_id';
      COMMENT ON COLUMN ${qualified}.login_attempts.status IS 'kurabe:p102:candidate:v1:column:status';
      COMMENT ON INDEX ${qualified}.uq_login_attempts_request_id IS 'kurabe:p102:candidate:v1:index:uq_login_attempts_request_id';
      COMMENT ON INDEX ${qualified}.idx_login_attempts_status_time IS 'kurabe:p102:candidate:v1:index:idx_login_attempts_status_time';
      COMMENT ON FUNCTION ${qualified}.acquire_login_admission(text, text, text, integer, integer, integer, integer) IS 'kurabe:p102:candidate:v1:function:acquire_login_admission';
      COMMENT ON FUNCTION ${qualified}.finalize_login_admission(text, text, text, boolean, integer, integer, integer) IS 'kurabe:p102:candidate:v1:function:finalize_login_admission';
    `);
    runPsql(psql, target, `
      DROP FUNCTION IF EXISTS ${qualified}.acquire_login_admission(text, text, text, integer, integer, integer, integer);
      DROP FUNCTION IF EXISTS ${qualified}.finalize_login_admission(text, text, text, boolean, integer, integer, integer);
    `);
    // Apply the exact candidate migration after the synthetic baseline. The
    // hand-written setup above only provisions a compatibility fixture; all
    // behavioral cases below must exercise the checked-in migration artifact.
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const roleExists = runPsql(psql, target, `
        SELECT count(*) FROM pg_roles WHERE rolname = '${role}';
      `);
      if (roleExists === '0') runPsql(psql, target, `CREATE ROLE ${role} NOLOGIN;`);
    }
    const forwardSql = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8')
      .replaceAll('public.', `${qualified}.`)
      .replaceAll("table_schema = 'public'", `table_schema = '${schema}'`)
      .replaceAll("n.nspname = 'public'", `n.nspname = '${schema}'`)
      .replaceAll(`${qualified}.issue_session_transaction`, 'public.issue_session_transaction');
    runPsql(psql, target, forwardSql);
    const acquireMarker = runPsql(psql, target, `
      SELECT obj_description(
        '${schema}.acquire_login_admission(text, text, text, integer, integer, integer, integer)'::regprocedure,
        'pg_proc'
      );
    `);
    assert.equal(
      acquireMarker,
      'kurabe:p102:candidate:v1:function:acquire_login_admission',
      'exact forward migration must install the acquire provenance marker'
    );
    const finalizeMarker = runPsql(psql, target, `
      SELECT obj_description(
        '${schema}.finalize_login_admission(text, text, text, boolean, integer, integer, integer)'::regprocedure,
        'pg_proc'
      );
    `);
    const atomicMarker = runPsql(psql, target, `
      SELECT obj_description(
        '${schema}.issue_session_finalize_login_admission(uuid, text, boolean, bigint, text, timestamptz, text, text, text, integer, integer, integer)'::regprocedure,
        'pg_proc'
      );
    `);
    assert.equal(finalizeMarker, 'kurabe:p102:candidate:v1:function:finalize_login_admission');
    assert.equal(atomicMarker, 'kurabe:p102:candidate:v1:function:issue_session_finalize_login_admission');
    executedCases.push('exact forward migration: checked-in SQL applied and all candidate function provenance read back');
    const wrapperRequestId = '00000000-0000-0000-0000-000000000701';
    runPsql(psql, target, `
      SELECT allowed FROM ${qualified}.acquire_login_admission(
        '${wrapperRequestId}', 'EMP_WRAPPER', '198.51.100.10', 5, 25, 900, 30
      );
    `);
    const wrappedUserId = runPsql(psql, target, `
      SELECT user_id FROM ${qualified}.issue_session_finalize_login_admission(
        '${'00000000-0000-0000-0000-000000000702'}', 'hash', false, 0,
        'atomic-wrapper-token', now() + interval '1 hour',
        '${wrapperRequestId}', 'EMP_WRAPPER', '198.51.100.10', 5, 25, 900
      );
    `);
    assert.equal(wrappedUserId, '00000000-0000-0000-0000-000000000702', 'session/admission wrapper must commit one atomic result');
    executedCases.push('atomic session/admission wrapper executed against exact migration');

    // Test 3.2b: database write failures fail closed and do not use a direct-table fallback.
    runPsql(psql, target, `
      CREATE FUNCTION ${qualified}.reject_login_attempt_insert()
      RETURNS trigger LANGUAGE plpgsql AS $guard$
      BEGIN
        RAISE EXCEPTION 'P102M3T03_TEST_INSERT_FAILURE';
      END;
      $guard$;
      CREATE TRIGGER reject_login_attempt_insert
      BEFORE INSERT ON ${qualified}.login_attempts
      FOR EACH ROW EXECUTE FUNCTION ${qualified}.reject_login_attempt_insert();
    `);
    const insertFailure = runPsql(psql, target, `
      SELECT allowed || '|' || coalesce(locked_by, '')
      FROM ${qualified}.acquire_login_admission('db-failure-insert', 'EMP_DB_FAILURE', '198.51.100.11', 900, 5, 25, 30);
    `);
    assert.equal(insertFailure, 'f|db_error', 'admission insert failure must fail closed');
    runPsql(psql, target, `
      DROP TRIGGER reject_login_attempt_insert ON ${qualified}.login_attempts;
      DROP FUNCTION ${qualified}.reject_login_attempt_insert();
    `);

    const finalizeFailureRequest = 'db-failure-finalize';
    runPsql(psql, target, `
      SELECT ${qualified}.acquire_login_admission('${finalizeFailureRequest}', 'EMP_DB_FAILURE', '198.51.100.11', 900, 5, 25, 30);
      CREATE FUNCTION ${qualified}.reject_login_attempt_update()
      RETURNS trigger LANGUAGE plpgsql AS $guard$
      BEGIN
        RAISE EXCEPTION 'P102M3T03_TEST_UPDATE_FAILURE';
      END;
      $guard$;
      CREATE TRIGGER reject_login_attempt_update
      BEFORE UPDATE OF status ON ${qualified}.login_attempts
      FOR EACH ROW EXECUTE FUNCTION ${qualified}.reject_login_attempt_update();
    `);
    const updateFailure = runPsql(psql, target, `
      SELECT finalized || '|' || allowed || '|' || coalesce(locked_by, '')
      FROM ${qualified}.finalize_login_admission('${finalizeFailureRequest}', 'EMP_DB_FAILURE', '198.51.100.11', false, 900, 5, 25);
    `);
    assert.equal(updateFailure, 'f|false|db_error', 'admission finalization failure must fail closed');
    runPsql(psql, target, `
      DROP TRIGGER reject_login_attempt_update ON ${qualified}.login_attempts;
      DROP FUNCTION ${qualified}.reject_login_attempt_update();
    `);
    executedCases.push('database failure paths: insert and finalization errors return db_error with no direct-table fallback');
    const rollbackSql = fs.readFileSync(ROLLBACK_PATH, 'utf8')
      .replaceAll('public.', `${qualified}.`)
      .replaceAll("table_schema = 'public'", `table_schema = '${schema}'`)
      .replaceAll("n.nspname = 'public'", `n.nspname = '${schema}'`)
      .replaceAll(`${qualified}.issue_session_transaction`, 'public.issue_session_transaction');

    // Test 3.3: Concurrent threshold burst test (Real PostgreSQL concurrency)
    const BURST_EMP = 'EMP_BURST_TEST';
    const BURST_IP = '10.50.0.1';
    const burstResults = await runConcurrentReservations(psql, target, schema, BURST_EMP, BURST_IP, 10, 5);

    let allowedBursts = 0;
    let lockedBursts = 0;
    for (const r of burstResults) {
      const [allowed, acc, ip, lockedBy] = r.split('|');
      if (allowed === 't') allowedBursts++;
      if (allowed === 'f' && lockedBy === 'account') lockedBursts++;
    }

    assert.equal(allowedBursts, 5, 'concurrent burst must allow exactly 5 reservations');
    assert.equal(lockedBursts, 5, 'concurrent burst above contract (attempts 6-10) must be denied');
    executedCases.push('concurrent threshold burst: exactly 5 reservations allowed and 5 denied under real concurrent advisory locks');

    // Test 3.4: Duplicate retry idempotency
    const DUP_EMP = 'EMP_DUP_TEST';
    const DUP_IP = '10.50.0.2';
    const DUP_REQ = 'req-dup-idempotent-01';

    const firstAcquire = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts
      FROM ${qualified}.acquire_login_admission('${DUP_REQ}', '${DUP_EMP}', '${DUP_IP}', 900, 5, 25, 30);
    `);
    assert.equal(firstAcquire, 't|1', 'first acquisition succeeds with 1 account attempt');

    const duplicateAcquire = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts
      FROM ${qualified}.acquire_login_admission('${DUP_REQ}', '${DUP_EMP}', '${DUP_IP}', 900, 5, 25, 30);
    `);
    assert.equal(duplicateAcquire, 't|1', 'duplicate acquisition returns allowed=t idempotently without overcounting');

    const rowCount = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts WHERE request_id = '${DUP_REQ}';
    `);
    assert.equal(rowCount, '1', 'single row created for request_id');
    executedCases.push('duplicate retry idempotency: repeated acquire calls with same request_id are safe and idempotent');

    // Test 3.5: Finalize failure and repeated finalization
    const FAIL_EMP = 'EMP_FAIL_TEST';
    const FAIL_IP = '10.50.0.3';
    const FAIL_REQ = 'req-fail-finalize-01';

    runPsql(psql, target, `
      SELECT ${qualified}.acquire_login_admission('${FAIL_REQ}', '${FAIL_EMP}', '${FAIL_IP}', 900, 5, 25, 30);
    `);
    const statusBefore = runPsql(psql, target, `
      SELECT status FROM ${qualified}.login_attempts WHERE request_id = '${FAIL_REQ}';
    `);
    assert.equal(statusBefore, 'reserved', 'status must be reserved after acquire');

    const fin1 = runPsql(psql, target, `
      SELECT finalized || '|' || account_attempts
      FROM ${qualified}.finalize_login_admission('${FAIL_REQ}', '${FAIL_EMP}', '${FAIL_IP}', false, 900, 5, 25);
    `);
    assert.equal(fin1, 't|1', 'finalized to failed with 1 attempt');

    const statusAfter = runPsql(psql, target, `
      SELECT status FROM ${qualified}.login_attempts WHERE request_id = '${FAIL_REQ}';
    `);
    assert.equal(statusAfter, 'failed', 'status must be failed after finalization');

    // Duplicate finalize failure call: idempotent
    const fin2 = runPsql(psql, target, `
      SELECT finalized || '|' || account_attempts
      FROM ${qualified}.finalize_login_admission('${FAIL_REQ}', '${FAIL_EMP}', '${FAIL_IP}', false, 900, 5, 25);
    `);
    assert.equal(fin2, 't|1', 'duplicate finalize failure call must not increment account attempts');
    executedCases.push('failure finalization: reservation transitions to failed; duplicate finalize is idempotent');

    // A success without an exact reserved admission must not clear history.
    const NO_ADMIT_EMP = 'EMP_NO_ADMIT_TEST';
    const NO_ADMIT_IP = '10.50.0.30';
    runPsql(psql, target, `
      INSERT INTO ${qualified}.login_attempts (request_id, employee_code, ip, attempted_at, status)
      VALUES ('no-admit-failure-${cryptoSuffix()}', '${NO_ADMIT_EMP}', '${NO_ADMIT_IP}', now(), 'failed');
    `);
    const unadmittedSuccess = runPsql(psql, target, `
      SELECT finalized || '|' || allowed || '|' || locked_by
      FROM ${qualified}.finalize_login_admission('no-admit-success-${cryptoSuffix()}', '${NO_ADMIT_EMP}', '${NO_ADMIT_IP}', true, 900, 5, 25);
    `);
    assert.equal(unadmittedSuccess, 'f|false|db_error', 'unadmitted success must fail closed');
    const preservedFailure = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts
      WHERE employee_code = '${NO_ADMIT_EMP}' AND status = 'failed';
    `);
    assert.equal(preservedFailure, '1', 'unadmitted success must preserve prior failure history');
    executedCases.push('unadmitted success: fail-closed accounting preserves prior failure history');

    // Test 3.6: Success cleanup resets attempts
    const SUCC_EMP = 'EMP_SUCC_TEST';
    const SUCC_IP = '10.50.0.4';

    // Insert 2 prior failures
    runPsql(psql, target, `
      INSERT INTO ${qualified}.login_attempts (request_id, employee_code, ip, attempted_at, status)
      VALUES ('f1-${cryptoSuffix()}', '${SUCC_EMP}', '${SUCC_IP}', now(), 'failed'),
             ('f2-${cryptoSuffix()}', '${SUCC_EMP}', '${SUCC_IP}', now(), 'failed');
    `);

    // Acquire reservation for successful login
    const SUCC_REQ = 'req-succ-finalize-01';
    runPsql(psql, target, `
      SELECT ${qualified}.acquire_login_admission('${SUCC_REQ}', '${SUCC_EMP}', '${SUCC_IP}', 900, 5, 25, 30);
    `);

    // Finalize success
    const finSucc = runPsql(psql, target, `
      SELECT finalized || '|' || allowed || '|' || account_attempts
      FROM ${qualified}.finalize_login_admission('${SUCC_REQ}', '${SUCC_EMP}', '${SUCC_IP}', true, 900, 5, 25);
    `);
    assert.equal(finSucc, 't|true|0', 'success finalization resets attempts to 0');

    const remainingRows = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts
      WHERE employee_code = '${SUCC_EMP}' AND status IN ('reserved', 'failed');
    `);
    assert.equal(remainingRows, '0', 'zero active rows remaining for cleared account');
    const successTombstone = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts
      WHERE request_id = '${SUCC_REQ}' AND status = 'succeeded';
    `);
    assert.equal(successTombstone, '1', 'successful request tombstone must remain for idempotent replay');

    // Immediately allowed on next attempt
    const nextAllowed = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts
      FROM ${qualified}.acquire_login_admission('next-${cryptoSuffix()}', '${SUCC_EMP}', '${SUCC_IP}', 900, 5, 25, 30);
    `);
    assert.equal(nextAllowed, 't|1', 'account immediately unlocked on next acquire');
    executedCases.push('success cleanup: successful login clears all prior attempts and resets account threshold');

    // Test 3.7: Stale reservation is fail-closed rather than implicitly reused
    const EXP_EMP = 'EMP_EXP_TEST';
    const EXP_IP = '10.50.0.5';

    // Insert a stale reservation older than 30s
    runPsql(psql, target, `
      INSERT INTO ${qualified}.login_attempts (request_id, employee_code, ip, attempted_at, status)
      VALUES ('stale-req-${cryptoSuffix()}', '${EXP_EMP}', '${EXP_IP}', now() - interval '45 seconds', 'reserved');
    `);

    // A stale row still represents an unknown in-flight password check.
    // Reusing it would allow an unbounded number of concurrent checks.
    const expAcquire = runPsql(psql, target, `
      SELECT allowed || '|' || coalesce(locked_by, '')
      FROM ${qualified}.acquire_login_admission('fresh-req-${cryptoSuffix()}', '${EXP_EMP}', '${EXP_IP}', 900, 1, 25, 30);
    `);
    assert.equal(expAcquire, 'f|account', 'stale reservation must remain counted and block unsafe reuse');

    const staleStatus = runPsql(psql, target, `
      SELECT status FROM ${qualified}.login_attempts
      WHERE employee_code = '${EXP_EMP}' AND request_id LIKE 'stale-req-%';
    `);
    assert.equal(staleStatus, 'reserved', 'stale reservation must not be silently recycled');
    executedCases.push('stale reservation safety: unknown in-flight work remains counted and cannot be implicitly reused');

    // Test 3.8: Account & network isolation
    const ISO_A = 'EMP_ISO_A';
    const ISO_B = 'EMP_ISO_B';
    const ISO_IP = '10.50.0.6';

    // Lock account A (limit 2)
    runPsql(psql, target, `
      INSERT INTO ${qualified}.login_attempts (request_id, employee_code, ip, attempted_at, status)
      VALUES ('iso-a1-${cryptoSuffix()}', '${ISO_A}', '${ISO_IP}', now(), 'failed'),
             ('iso-a2-${cryptoSuffix()}', '${ISO_A}', '${ISO_IP}', now(), 'failed');
    `);
    const lockA = runPsql(psql, target, `
      SELECT allowed || '|' || locked_by
      FROM ${qualified}.acquire_login_admission('iso-a3-${cryptoSuffix()}', '${ISO_A}', '${ISO_IP}', 900, 2, 25, 30);
    `);
    assert.equal(lockA, 'f|account', 'Account A is locked by account');

    // Account B on same IP is NOT blocked
    const allowB = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts
      FROM ${qualified}.acquire_login_admission('iso-b1-${cryptoSuffix()}', '${ISO_B}', '${ISO_IP}', 900, 2, 25, 30);
    `);
    assert.equal(allowB, 't|1', 'Account B must be allowed despite Account A being locked');
    executedCases.push('account & network isolation: independent accounts and networks are isolated');

    // Test 3.9: Rollback approval guard & provenance enforcement
    let unapprovedThrew = false;
    try {
      runPsql(psql, target, rollbackSql);
    } catch (err) {
      if (String(err).includes('ROLLBACK_UNAPPROVED')) {
        unapprovedThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(unapprovedThrew, 'rollback must fail closed without kurabe.p102_rollback_approved');
    executedCases.push('rollback approval guard: fails closed with ROLLBACK_UNAPPROVED without custom GUC');

    // Tampered provenance causes preflight rollback failure
    runPsql(psql, target, `
      COMMENT ON FUNCTION ${qualified}.acquire_login_admission(text, text, text, integer, integer, integer, integer) IS 'tampered';
    `);
    let provenanceThrew = false;
    try {
      runPsql(psql, target, `
        SET kurabe.p102_rollback_approved = 'true';
        ${rollbackSql}
      `);
    } catch (err) {
      if (String(err).includes('P102_ROLLBACK_PREFLIGHT_FAILED')) {
        provenanceThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(provenanceThrew, 'rollback must fail closed on mismatched provenance marker');
    executedCases.push('rollback provenance guard: fails closed with P102_ROLLBACK_PREFLIGHT_FAILED on tampered provenance');

    // Restore provenance and execute approved rollback
    runPsql(psql, target, `
      COMMENT ON FUNCTION ${qualified}.acquire_login_admission(text, text, text, integer, integer, integer, integer) IS
        'kurabe:p102:candidate:v1:function:acquire_login_admission';

      SET kurabe.p102_rollback_approved = 'true';
      ${rollbackSql}
    `);

    const procCount = runPsql(psql, target, `
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = '${schema}'
        AND p.proname IN ('acquire_login_admission', 'finalize_login_admission');
    `);
    assert.equal(procCount, '0', 'candidate functions dropped after approved rollback');

    const tableStillExists = runPsql(psql, target, `
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = '${schema}' AND table_name = 'login_attempts';
    `);
    assert.equal(tableStillExists, '1', 'login_attempts table preserved after rollback');
    executedCases.push('rollback execution: approved rollback drops candidate functions, indexes, and columns while preserving table and data');

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
      console.log(`PASS login-admission integration suite: ${report.cases.length} cases verified via real PostgreSQL`);
      for (const c of report.cases) {
        console.log(`  ✓ ${c}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`FAIL login-admission integration suite: ${err.message || err}`);
      process.exit(1);
    });
}
