import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
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
  '20260907000200_login_rate_limit.sql'
);
const ROLLBACK_PATH = path.join(
  projectRoot,
  'db',
  'rollback-login-rate-limit.sql'
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
  throw new Error(`LOGIN_RATE_LIMIT_INTEGRATION_GUARD: ${message}`);
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

function assertSqlError(psql, target, sql, expectedFragment, caseDescription, executedCases) {
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
  if (executedCases && caseDescription) {
    executedCases.push(caseDescription);
  }
}

async function runConcurrentAttempts(psql, target, schema, employeeCode, ip, count) {
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
      child.stdin.write(
        `SELECT allowed, account_attempts, ip_attempts, coalesce(locked_by, '') FROM ${quoteIdentifier(schema)}.record_failed_login_transaction('${employeeCode}', '${ip}');\n`
      );
      child.stdin.end();
    }));
  }
  return Promise.all(promises);
}

// ============================================================
// SOURCE-LEVEL ALGORITHMIC TEST HELPERS (WHERE APPLICATION CODE CANNOT RUN INSIDE SQL)
// ============================================================

function simIsLoopbackIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim().toLowerCase();
  return (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === '::ffff:127.0.0.1' ||
    clean === 'localhost' ||
    clean.startsWith('127.') ||
    clean.startsWith('::ffff:127.')
  );
}

function simIsPrivateIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim().toLowerCase();
  if (simIsLoopbackIp(clean)) return true;

  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    return false;
  }

  if (net.isIPv6(clean)) {
    return clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80:');
  }

  return false;
}

function simIsValidIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  return net.isIP(ip.trim()) !== 0;
}

function simNormalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return '127.0.0.1';
  let clean = ip.trim();
  if (clean.startsWith('[') && clean.includes(']')) {
    clean = clean.slice(1, clean.indexOf(']'));
  } else if (clean.includes(':') && !clean.includes('::') && clean.split(':').length === 2) {
    clean = clean.split(':')[0];
  }
  return simIsValidIp(clean) ? clean : '127.0.0.1';
}

function simResolveClientNetwork(headers, config) {
  const getHeader = (name) => {
    if (!headers) return null;
    const lower = name.toLowerCase();
    if (typeof headers.get === 'function') return headers.get(lower) ?? headers.get(name) ?? null;
    return headers[lower] ?? headers[name] ?? null;
  };

  const xForwardedFor = getHeader('x-forwarded-for');
  const xRealIp = getHeader('x-real-ip');
  const cfConnectingIp = getHeader('cf-connecting-ip');

  const trustedProxies = config?.trustedProxies ?? [];
  const configuredHops = config?.trustedHops;

  if (xForwardedFor) {
    const hops = xForwardedFor
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (hops.length > 0) {
      if (configuredHops && Number.isInteger(configuredHops) && configuredHops > 0) {
        const targetIndex = Math.max(0, hops.length - configuredHops);
        return { clientIp: simNormalizeIp(hops[targetIndex]), isTrustedProxy: true, proxyChain: hops };
      }

      if (trustedProxies.length > 0) {
        let selectedIp = hops[0];
        let foundUntrusted = false;
        for (let i = hops.length - 1; i >= 0; i--) {
          const hop = hops[i];
          const hopLower = hop.toLowerCase();
          const isTrusted =
            trustedProxies.includes(hopLower) ||
            (trustedProxies.includes('loopback') && simIsLoopbackIp(hop)) ||
            (trustedProxies.includes('private') && simIsPrivateIp(hop));
          if (!isTrusted) {
            selectedIp = hop;
            foundUntrusted = true;
            break;
          }
        }
        return { clientIp: simNormalizeIp(selectedIp), isTrustedProxy: foundUntrusted, proxyChain: hops };
      }

      // Default compatibility: rightmost hop (nearest proxy)
      return { clientIp: simNormalizeIp(hops[hops.length - 1]), isTrustedProxy: false, proxyChain: hops };
    }
  }

  if (cfConnectingIp && simIsValidIp(cfConnectingIp)) {
    return { clientIp: simNormalizeIp(cfConnectingIp), isTrustedProxy: true, proxyChain: [cfConnectingIp] };
  }

  if (xRealIp && simIsValidIp(xRealIp)) {
    return { clientIp: simNormalizeIp(xRealIp), isTrustedProxy: false, proxyChain: [xRealIp] };
  }

  return { clientIp: '127.0.0.1', isTrustedProxy: false, proxyChain: ['127.0.0.1'] };
}

// ============================================================
// MAIN INTEGRATION RUNNER
// ============================================================

export async function run({ rootDir = projectRoot, suite = 'login-rate-limit', options = {} } = {}) {
  const executedCases = [];

  // 1. Verify source candidate migration and rollback headers and contracts
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
  const rateLimitCode = fs.readFileSync(LOGIN_RATE_LIMIT_PATH, 'utf8');
  const authCode = fs.readFileSync(AUTH_ACTIONS_PATH, 'utf8');

  // Forward migration contracts
  assert.ok(
    forwardSql.includes('CANDIDATE ONLY — NOT APPLIED') || forwardSql.includes('CANDIDATE ONLY'),
    'forward migration must declare candidate-only header'
  );
  assert.ok(
    forwardSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL'),
    'forward migration must require approval guard'
  );
  assert.ok(
    forwardSql.includes('kurabe:p98:candidate:v1:function:check_login_rate_limit'),
    'forward migration must set provenance comment on check_login_rate_limit'
  );
  assert.ok(
    forwardSql.includes('kurabe:p98:candidate:v1:function:record_failed_login_transaction'),
    'forward migration must set provenance comment on record_failed_login_transaction'
  );
  assert.ok(
    forwardSql.includes('kurabe:p98:candidate:v1:function:clear_login_attempts'),
    'forward migration must set provenance comment on clear_login_attempts'
  );

  const cleanForward = stripSqlComments(forwardSql).trim();
  const leadingStrippedForward = stripLeadingSqlComments(forwardSql);
  assert.ok(leadingStrippedForward.startsWith('BEGIN;') && cleanForward.startsWith('BEGIN;'), 'forward migration must start with BEGIN;');
  assert.ok(cleanForward.endsWith('COMMIT;'), 'forward migration must end with COMMIT;');

  // Security grants
  assert.ok(
    cleanForward.includes('REVOKE ALL ON FUNCTION public.check_login_rate_limit') &&
    cleanForward.includes('GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text, text, integer, integer, integer) TO service_role'),
    'forward migration must restrict check_login_rate_limit to service_role'
  );
  assert.ok(
    cleanForward.includes('REVOKE ALL ON FUNCTION public.record_failed_login_transaction') &&
    cleanForward.includes('GRANT EXECUTE ON FUNCTION public.record_failed_login_transaction(text, text, integer, integer, integer) TO service_role'),
    'forward migration must restrict record_failed_login_transaction to service_role'
  );
  assert.ok(
    cleanForward.includes('REVOKE ALL ON FUNCTION public.clear_login_attempts') &&
    cleanForward.includes('GRANT EXECUTE ON FUNCTION public.clear_login_attempts(text, text) TO service_role'),
    'forward migration must restrict clear_login_attempts to service_role'
  );
  executedCases.push('source-contract: forward migration candidate header, hermetic transaction, and service_role grants');

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
  assert.ok(
    rollbackSql.includes('DROP FUNCTION IF EXISTS public.check_login_rate_limit') &&
    rollbackSql.includes('DROP FUNCTION IF EXISTS public.record_failed_login_transaction') &&
    rollbackSql.includes('DROP FUNCTION IF EXISTS public.clear_login_attempts'),
    'rollback candidate must drop candidate functions'
  );
  assert.ok(
    !/\bDROP\s+TABLE\b/i.test(rollbackSql) &&
    !/\bDELETE\s+FROM\b/i.test(rollbackSql) &&
    !/\bTRUNCATE\b/i.test(rollbackSql),
    'rollback candidate must not drop tables or delete audit data'
  );

  const cleanRollback = stripSqlComments(rollbackSql).trim();
  const leadingStrippedRollback = stripLeadingSqlComments(rollbackSql);
  assert.ok(leadingStrippedRollback.startsWith('BEGIN;') && cleanRollback.startsWith('BEGIN;'), 'rollback must start with BEGIN;');
  assert.ok(cleanRollback.endsWith('COMMIT;'), 'rollback must end with COMMIT;');
  executedCases.push('source-contract: rollback candidate header, GUC approval guard, and scoped function drop');

  // Source-level application invariants & proxy resolution assertions
  assert.ok(rateLimitCode.includes("import 'server-only'"), 'login-rate-limit.ts must import server-only');
  assert.ok(rateLimitCode.includes('MAX_LOGIN_ATTEMPTS = 5'), 'login-rate-limit.ts must define MAX_LOGIN_ATTEMPTS = 5');
  assert.ok(rateLimitCode.includes('MAX_NETWORK_ATTEMPTS = 25'), 'login-rate-limit.ts must define MAX_NETWORK_ATTEMPTS = 25');
  assert.ok(
    rateLimitCode.includes('LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60') || rateLimitCode.includes('LOGIN_ATTEMPT_WINDOW_SECONDS = 900'),
    'login-rate-limit.ts must define 15-minute sliding window'
  );
  assert.ok(rateLimitCode.includes('LOGIN_ATTEMPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000'), 'login-rate-limit.ts must define 30-day retention');
  assert.ok(rateLimitCode.includes('lockedBy: \'db_error\''), 'login-rate-limit.ts must fail closed with db_error on database errors');
  assert.ok(authCode.includes('resolveClientIp'), 'auth.ts must wire resolveClientIp');
  assert.ok(authCode.includes('checkLoginRateLimit'), 'auth.ts must wire checkLoginRateLimit before authentication');
  assert.ok(authCode.includes('recordFailedLoginAttempt'), 'auth.ts must wire recordFailedLoginAttempt');
  assert.ok(authCode.includes('clearLoginAttempts'), 'auth.ts must wire clearLoginAttempts upon successful login');
  assert.ok(authCode.includes('GENERIC_AUTH_ERROR'), 'auth.ts must use generic error message to prevent user enumeration');
  executedCases.push('source-contract: application-level rate limiting, server-only isolation, and generic error wiring');

  // Source-level trusted forwarded header & proxy tests
  assert.equal(simIsLoopbackIp('127.0.0.1'), true, '127.0.0.1 is loopback');
  assert.equal(simIsLoopbackIp('::1'), true, '::1 is loopback');
  assert.equal(simIsLoopbackIp('localhost'), true, 'localhost is loopback');
  assert.equal(simIsLoopbackIp('192.168.1.1'), false, '192.168.1.1 is not loopback');

  assert.equal(simIsPrivateIp('10.0.0.1'), true, '10.0.0.1 is RFC1918 private');
  assert.equal(simIsPrivateIp('172.16.5.5'), true, '172.16.5.5 is RFC1918 private');
  assert.equal(simIsPrivateIp('192.168.0.100'), true, '192.168.0.100 is RFC1918 private');
  assert.equal(simIsPrivateIp('203.0.113.195'), false, '203.0.113.195 is public');

  // Spoofed header defense: default config takes rightmost hop, ignoring spoofed leftmost IP
  const defaultProxyRes = simResolveClientNetwork({
    'x-forwarded-for': '203.0.113.195, 198.51.100.5',
  });
  assert.equal(defaultProxyRes.clientIp, '198.51.100.5', 'default resolution takes rightmost hop to resist spoofed prefix');

  // Configured trusted hops:
  const hops1Res = simResolveClientNetwork(
    { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
    { trustedHops: 1 }
  );
  assert.equal(hops1Res.clientIp, '3.3.3.3', 'trustedHops=1 selects rightmost hop');

  const hops2Res = simResolveClientNetwork(
    { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' },
    { trustedHops: 2 }
  );
  assert.equal(hops2Res.clientIp, '2.2.2.2', 'trustedHops=2 selects 2nd from right hop');

  // Configured trusted proxies list: skips reverse proxies from right to find first untrusted client IP
  const proxyListRes = simResolveClientNetwork(
    { 'x-forwarded-for': 'attacker.spoof.ip, 198.51.100.22, 10.0.0.1, 127.0.0.1' },
    { trustedProxies: ['loopback', 'private'] }
  );
  assert.equal(proxyListRes.clientIp, '198.51.100.22', 'trusted proxy list skips loopback/private proxies to isolate client IP');

  // Header fallbacks:
  assert.equal(simResolveClientNetwork({ 'cf-connecting-ip': '203.0.113.88' }).clientIp, '203.0.113.88', 'fallback to CF-Connecting-IP');
  assert.equal(simResolveClientNetwork({ 'x-real-ip': '203.0.113.99' }).clientIp, '203.0.113.99', 'fallback to X-Real-IP');
  assert.equal(simResolveClientNetwork({}).clientIp, '127.0.0.1', 'fallback to loopback default');
  executedCases.push('source-contract: trusted forwarded-header resolution, multi-hop parsing, and proxy spoofing resistance');

  // 2. Local target identity and server verification (before any schema mutation)
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

  // 3. Create isolated synthetic schema
  const schema = `kurabe_harness_${cryptoSuffix()}`;
  const qualified = quoteIdentifier(schema);
  let created = false;
  let primaryError;
  let cleanupError;

  try {
    runPsql(psql, target, `CREATE SCHEMA ${qualified};`);
    created = true;

    // Test 3.1: Preflight check fails closed when users table is missing
    const preflightFailScript = `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = '${schema}' AND table_name = 'users'
        ) THEN
          RAISE EXCEPTION 'P98M2T08_PREFLIGHT_FAILED: public.users table not found';
        END IF;
      END $$;
    `;
    let preflightThrew = false;
    try {
      runPsql(psql, target, preflightFailScript);
    } catch (err) {
      if (String(err).includes('P98M2T08_PREFLIGHT_FAILED')) {
        preflightThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(preflightThrew, 'preflight check must fail closed when prerequisite users table is missing');
    executedCases.push('preflight check: fails closed (P98M2T08_PREFLIGHT_FAILED) when users table is missing');

    // Create synthetic users and login_attempts tables
    runPsql(psql, target, `
      CREATE TABLE ${qualified}.users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_code text NOT NULL UNIQUE,
        name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        password_hash text,
        password_setup_required boolean NOT NULL DEFAULT false
      );

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

      CREATE INDEX idx_login_attempts_attempted_at
        ON ${qualified}.login_attempts (attempted_at);
    `);
    executedCases.push('schema initialization: synthetic users and indexed login_attempts tables created');

    // Preflight succeeds once users table is created
    runPsql(psql, target, `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = '${schema}' AND table_name = 'users'
        ) THEN
          RAISE EXCEPTION 'P98M2T08_PREFLIGHT_FAILED: public.users table not found';
        END IF;
      END $$;
    `);
    executedCases.push('preflight check: succeeds when prerequisite tables exist');

    // Test 3.2: Create candidate RPC functions inside isolated schema
    const schemaFunctionsSql = `
      -- Function: check_login_rate_limit
      CREATE OR REPLACE FUNCTION ${qualified}.check_login_rate_limit(
        p_employee_code text,
        p_ip text,
        p_window_seconds integer DEFAULT 900,
        p_max_account_attempts integer DEFAULT 5,
        p_max_ip_attempts integer DEFAULT 25
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
      BEGIN
        IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
        END IF;

        IF p_ip IS NULL OR trim(p_ip) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
        END IF;

        v_clean_code := trim(p_employee_code);
        v_clean_ip := trim(p_ip);

        IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
          p_window_seconds := 900;
        END IF;

        IF p_max_account_attempts IS NULL OR p_max_account_attempts <= 0 THEN
          p_max_account_attempts := 5;
        END IF;

        IF p_max_ip_attempts IS NULL OR p_max_ip_attempts <= 0 THEN
          p_max_ip_attempts := 25;
        END IF;

        v_window_start := now() - (p_window_seconds || ' seconds')::interval;

        -- 1. Account-level failure count within sliding window
        SELECT count(*)::integer, min(attempted_at)
        INTO v_account_count, v_oldest_account_attempt
        FROM ${qualified}.login_attempts
        WHERE employee_code = v_clean_code
          AND attempted_at >= v_window_start;

        -- 2. Network-level failure count within sliding window
        SELECT count(*)::integer, min(attempted_at)
        INTO v_ip_count, v_oldest_ip_attempt
        FROM ${qualified}.login_attempts
        WHERE ip = v_clean_ip
          AND attempted_at >= v_window_start;

        -- 3. Threshold evaluation (account priority over network)
        IF v_account_count >= p_max_account_attempts THEN
          v_locked := true;
          v_locked_by := 'account';
          IF v_oldest_account_attempt IS NOT NULL THEN
            v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_account_attempt + (p_window_seconds || ' seconds')::interval - now())))::integer);
          ELSE
            v_retry_after := p_window_seconds;
          END IF;
        ELSIF v_ip_count >= p_max_ip_attempts THEN
          v_locked := true;
          v_locked_by := 'ip';
          IF v_oldest_ip_attempt IS NOT NULL THEN
            v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_ip_attempt + (p_window_seconds || ' seconds')::interval - now())))::integer);
          ELSE
            v_retry_after := p_window_seconds;
          END IF;
        END IF;

        RETURN QUERY
        SELECT
          NOT v_locked AS allowed,
          v_account_count,
          v_ip_count,
          v_locked_by,
          v_retry_after;
      END;
      $$;

      -- Function: record_failed_login_transaction
      CREATE OR REPLACE FUNCTION ${qualified}.record_failed_login_transaction(
        p_employee_code text,
        p_ip text,
        p_window_seconds integer DEFAULT 900,
        p_max_account_attempts integer DEFAULT 5,
        p_max_ip_attempts integer DEFAULT 25
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
      BEGIN
        IF p_employee_code IS NULL OR trim(p_employee_code) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_employee_code cannot be null or empty';
        END IF;

        IF p_ip IS NULL OR trim(p_ip) = '' THEN
          RAISE EXCEPTION 'INVALID_ARGUMENT: p_ip cannot be null or empty';
        END IF;

        v_clean_code := trim(p_employee_code);
        v_clean_ip := trim(p_ip);

        IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
          p_window_seconds := 900;
        END IF;

        IF p_max_account_attempts IS NULL OR p_max_account_attempts <= 0 THEN
          p_max_account_attempts := 5;
        END IF;

        IF p_max_ip_attempts IS NULL OR p_max_ip_attempts <= 0 THEN
          p_max_ip_attempts := 25;
        END IF;

        -- Concurrency control: acquire transactional advisory locks per account and IP
        PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_limit:account:' || v_clean_code));
        PERFORM pg_advisory_xact_lock(hashtext('kurabe:login_limit:ip:' || v_clean_ip));

        -- Insert new failure record
        INSERT INTO ${qualified}.login_attempts (employee_code, ip, attempted_at)
        VALUES (v_clean_code, v_clean_ip, now());

        -- Bounded retention: opportunistically prune entries older than 30 days
        DELETE FROM ${qualified}.login_attempts
        WHERE attempted_at < (now() - interval '30 days');

        v_window_start := now() - (p_window_seconds || ' seconds')::interval;

        -- Count updated attempts within window
        SELECT count(*)::integer, min(attempted_at)
        INTO v_account_count, v_oldest_account_attempt
        FROM ${qualified}.login_attempts
        WHERE employee_code = v_clean_code
          AND attempted_at >= v_window_start;

        SELECT count(*)::integer, min(attempted_at)
        INTO v_ip_count, v_oldest_ip_attempt
        FROM ${qualified}.login_attempts
        WHERE ip = v_clean_ip
          AND attempted_at >= v_window_start;

        IF v_account_count >= p_max_account_attempts THEN
          v_locked := true;
          v_locked_by := 'account';
          IF v_oldest_account_attempt IS NOT NULL THEN
            v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_account_attempt + (p_window_seconds || ' seconds')::interval - now())))::integer);
          ELSE
            v_retry_after := p_window_seconds;
          END IF;
        ELSIF v_ip_count >= p_max_ip_attempts THEN
          v_locked := true;
          v_locked_by := 'ip';
          IF v_oldest_ip_attempt IS NOT NULL THEN
            v_retry_after := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_oldest_ip_attempt + (p_window_seconds || ' seconds')::interval - now())))::integer);
          ELSE
            v_retry_after := p_window_seconds;
          END IF;
        END IF;

        RETURN QUERY
        SELECT
          NOT v_locked AS allowed,
          v_account_count,
          v_ip_count,
          v_locked_by,
          v_retry_after;
      END;
      $$;

      -- Function: clear_login_attempts
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

        IF v_clean_ip IS NOT NULL THEN
          WITH deleted AS (
            DELETE FROM ${qualified}.login_attempts
            WHERE employee_code = v_clean_code
              AND ip = v_clean_ip
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

      -- Set provenance comments
      COMMENT ON FUNCTION ${qualified}.check_login_rate_limit(text, text, integer, integer, integer) IS
        'kurabe:p98:candidate:v1:function:check_login_rate_limit';

      COMMENT ON FUNCTION ${qualified}.record_failed_login_transaction(text, text, integer, integer, integer) IS
        'kurabe:p98:candidate:v1:function:record_failed_login_transaction';

      COMMENT ON FUNCTION ${qualified}.clear_login_attempts(text, text) IS
        'kurabe:p98:candidate:v1:function:clear_login_attempts';
    `;
    runPsql(psql, target, schemaFunctionsSql);
    executedCases.push('rpc deployment: candidate rate limiting functions established with provenance comments');

    // Test 3.3: Argument validation checks (fail-closed)
    assertSqlError(
      psql, target,
      `PERFORM ${qualified}.check_login_rate_limit(NULL, '127.0.0.1')`,
      'p_employee_code cannot be null or empty',
      'arg validation: check_login_rate_limit rejects null employee_code',
      executedCases
    );
    assertSqlError(
      psql, target,
      `PERFORM ${qualified}.check_login_rate_limit('   ', '127.0.0.1')`,
      'p_employee_code cannot be null or empty',
      'arg validation: check_login_rate_limit rejects whitespace employee_code',
      executedCases
    );
    assertSqlError(
      psql, target,
      `PERFORM ${qualified}.check_login_rate_limit('EMP01', NULL)`,
      'p_ip cannot be null or empty',
      'arg validation: check_login_rate_limit rejects null ip',
      executedCases
    );
    assertSqlError(
      psql, target,
      `PERFORM ${qualified}.record_failed_login_transaction(NULL, '127.0.0.1')`,
      'p_employee_code cannot be null or empty',
      'arg validation: record_failed_login_transaction rejects null employee_code',
      executedCases
    );
    assertSqlError(
      psql, target,
      `PERFORM ${qualified}.record_failed_login_transaction('EMP01', NULL)`,
      'p_ip cannot be null or empty',
      'arg validation: record_failed_login_transaction rejects null ip',
      executedCases
    );
    assertSqlError(
      psql, target,
      `PERFORM ${qualified}.clear_login_attempts(NULL)`,
      'p_employee_code cannot be null or empty',
      'arg validation: clear_login_attempts rejects null employee_code',
      executedCases
    );

    // Test 3.4: Account-level threshold and IP rotation resistance
    runPsql(psql, target, `
      INSERT INTO ${qualified}.users (id, employee_code, name, is_active)
      VALUES ('11111111-1111-1111-1111-111111111111', 'EMP_ACC_TEST', 'Account Test User', true);
    `);

    // Initial check: 0 attempts, allowed
    const initialCheck = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts || '|' || ip_attempts || '|' || coalesce(locked_by, 'none')
      FROM ${qualified}.check_login_rate_limit('EMP_ACC_TEST', '192.168.10.1');
    `);
    assert.match(initialCheck, /^(?:true|t)\|0\|0\|none$/, 'clean account has 0 attempts and is allowed');

    // 4 failed attempts from 4 distinct IPs (simulating distributed brute-force against 1 account)
    for (let i = 1; i <= 4; i++) {
      const out = runPsql(psql, target, `
        SELECT allowed || '|' || account_attempts || '|' || ip_attempts || '|' || coalesce(locked_by, 'none')
        FROM ${qualified}.record_failed_login_transaction('EMP_ACC_TEST', '192.168.10.${i}');
      `);
      assert.equal(out, `t|${i}|1|none`, `attempt ${i} from rotating IP must be allowed with account count ${i}`);
    }
    executedCases.push('account threshold: 4 failed attempts from rotating IPs allowed with incrementing count');

    // 5th attempt from a 5th IP trips the account threshold (default max 5)
    const fifthOut = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts || '|' || ip_attempts || '|' || locked_by || '|' || (retry_after_seconds > 0)::text
      FROM ${qualified}.record_failed_login_transaction('EMP_ACC_TEST', '192.168.10.5');
    `);
    assert.equal(fifthOut, 'f|5|1|account|true', '5th attempt must trip account lockout');
    executedCases.push('account threshold: 5th failure triggers account lockout (allowed=false, locked_by=account)');

    // Subsequent pre-auth check from a brand-new 6th IP remains blocked
    const sixthCheck = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts || '|' || locked_by || '|' || (retry_after_seconds > 0)::text
      FROM ${qualified}.check_login_rate_limit('EMP_ACC_TEST', '192.168.10.6');
    `);
    assert.equal(sixthCheck, 'f|5|account|true', 'check_login_rate_limit from fresh IP must remain blocked by account lockout');
    executedCases.push('account threshold: IP rotation attack defeated by account-level rate limiting');

    // Test 3.5: Network-level threshold and Account rotation resistance (credential stuffing from single IP)
    const NET_IP = '198.51.100.77';
    for (let i = 1; i <= 24; i++) {
      const code = `STUFF_${String(i).padStart(2, '0')}`;
      const out = runPsql(psql, target, `
        SELECT allowed || '|' || account_attempts || '|' || ip_attempts || '|' || coalesce(locked_by, 'none')
        FROM ${qualified}.record_failed_login_transaction('${code}', '${NET_IP}');
      `);
      assert.equal(out, `t|1|${i}|none`, `network attempt ${i} across accounts allowed with ip count ${i}`);
    }
    executedCases.push('network threshold: 24 attempts from single IP across rotating accounts permitted');

    // 25th attempt from same IP trips the network threshold (default max 25)
    const netTwentyFifth = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts || '|' || ip_attempts || '|' || locked_by || '|' || (retry_after_seconds > 0)::text
      FROM ${qualified}.record_failed_login_transaction('STUFF_25', '${NET_IP}');
    `);
    assert.equal(netTwentyFifth, 'f|1|25|ip|true', '25th attempt from same IP must trip network lockout');
    executedCases.push('network threshold: 25th failure from same IP triggers network lockout (allowed=false, locked_by=ip)');

    // Subsequent pre-auth check for brand-new account from that locked IP is blocked
    const freshFromLockedIp = runPsql(psql, target, `
      SELECT allowed || '|' || ip_attempts || '|' || locked_by || '|' || (retry_after_seconds > 0)::text
      FROM ${qualified}.check_login_rate_limit('BRAND_NEW_ACC', '${NET_IP}');
    `);
    assert.equal(freshFromLockedIp, 'f|25|ip|true', 'fresh account from locked IP is blocked');
    executedCases.push('network threshold: account rotation stuffing attack defeated by network-level rate limiting');

    // Check same fresh account from a clean IP is allowed
    const freshFromCleanIp = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts || '|' || ip_attempts || '|' || coalesce(locked_by, 'none')
      FROM ${qualified}.check_login_rate_limit('BRAND_NEW_ACC', '10.99.99.1');
    `);
    assert.equal(freshFromCleanIp, 't|0|0|none', 'fresh account from clean IP is permitted');
    executedCases.push('network threshold: clean IP is permitted for fresh account (isolation)');

    // Test 3.6: Threshold precedence (account priority over network)
    // EMP_ACC_TEST has 5 failures, NET_IP has 25 failures
    const dualLockCheck = runPsql(psql, target, `
      SELECT allowed || '|' || locked_by
      FROM ${qualified}.check_login_rate_limit('EMP_ACC_TEST', '${NET_IP}');
    `);
    assert.equal(dualLockCheck, 'f|account', 'when both account and network thresholds are breached, account priority prevails');
    executedCases.push('threshold priority: account lockout takes precedence over network lockout');

    // Test 3.7: Concurrent attempt recording via transactional advisory locks
    const CONCUR_EMP = 'EMP_CONCURRENT';
    const CONCUR_IP = '10.20.30.40';
    const rawConcur = await runConcurrentAttempts(psql, target, schema, CONCUR_EMP, CONCUR_IP, 5);
    const parsedConcur = rawConcur.map((line) => {
      const parts = line.split('|');
      return {
        allowed: parts[0] === 't',
        accountAttempts: Number(parts[1]),
        ipAttempts: Number(parts[2]),
        lockedBy: parts[3] || null,
      };
    });
    parsedConcur.sort((a, b) => a.accountAttempts - b.accountAttempts);

    assert.deepEqual(
      parsedConcur.map((p) => p.accountAttempts),
      [1, 2, 3, 4, 5],
      'concurrent attempts must serialize cleanly into sequence 1..5 via advisory locks'
    );
    assert.equal(parsedConcur[0].allowed, true, 'attempt 1 allowed');
    assert.equal(parsedConcur[1].allowed, true, 'attempt 2 allowed');
    assert.equal(parsedConcur[2].allowed, true, 'attempt 3 allowed');
    assert.equal(parsedConcur[3].allowed, true, 'attempt 4 allowed');
    assert.equal(parsedConcur[4].allowed, false, 'attempt 5 locked');
    assert.equal(parsedConcur[4].lockedBy, 'account', 'attempt 5 locked by account');

    const concurDbCount = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts WHERE employee_code = '${CONCUR_EMP}';
    `);
    assert.equal(concurDbCount, '5', 'concurrent execution must record exactly 5 rows with zero lost writes');
    executedCases.push('concurrency control: transactional advisory locks serialize concurrent attempts without race conditions');

    // Test 3.8: Retention & Recovery window
    // 3.8.1 Sliding window recovery: attempts older than 900s do not block
    runPsql(psql, target, `
      INSERT INTO ${qualified}.login_attempts (employee_code, ip, attempted_at)
      SELECT 'EMP_EXPIRED', '10.50.0.1', now() - interval '950 seconds'
      FROM generate_series(1, 5);
    `);
    const expiredCheck = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts || '|' || coalesce(locked_by, 'none')
      FROM ${qualified}.check_login_rate_limit('EMP_EXPIRED', '10.50.0.1', 900);
    `);
    assert.equal(expiredCheck, 't|0|none', 'attempts older than 900s window must expire and not lock account');
    executedCases.push('recovery window: attempts outside sliding window expire cleanly');

    // 3.8.2 Retry-after calculation from oldest attempt in window
    runPsql(psql, target, `
      INSERT INTO ${qualified}.login_attempts (employee_code, ip, attempted_at)
      VALUES ('EMP_RETRY_CALC', '10.50.0.2', now() - interval '300 seconds');
      INSERT INTO ${qualified}.login_attempts (employee_code, ip, attempted_at)
      SELECT 'EMP_RETRY_CALC', '10.50.0.2', now() - interval '200 seconds'
      FROM generate_series(1, 4);
    `);
    const retryCheck = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts || '|' || locked_by || '|' || retry_after_seconds
      FROM ${qualified}.check_login_rate_limit('EMP_RETRY_CALC', '10.50.0.2', 900);
    `);
    const [rAllowed, rAcc, rLocked, rSecondsStr] = retryCheck.split('|');
    assert.equal(rAllowed, 'f', 'account is throttled');
    assert.equal(rAcc, '5', '5 attempts recorded');
    assert.equal(rLocked, 'account', 'locked by account');
    const rSeconds = Number(rSecondsStr);
    assert.ok(rSeconds >= 580 && rSeconds <= 610, `retry_after_seconds should be ~600, received ${rSeconds}`);
    executedCases.push('recovery window: retry_after_seconds accurately computed from oldest attempt in window');

    // 3.8.3 Opportunistic retention pruning (> 30 days)
    runPsql(psql, target, `
      INSERT INTO ${qualified}.login_attempts (id, employee_code, ip, attempted_at) VALUES
        ('a0000000-0000-0000-0000-000000000035', 'EMP_PRUNE_TEST', '10.60.0.1', now() - interval '35 days'),
        ('a0000000-0000-0000-0000-000000000010', 'EMP_PRUNE_TEST', '10.60.0.1', now() - interval '10 days');
    `);
    runPsql(psql, target, `
      SELECT * FROM ${qualified}.record_failed_login_transaction('EMP_PRUNE_TEST', '10.60.0.1');
    `);
    const oldRowExists = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts WHERE id = 'a0000000-0000-0000-0000-000000000035';
    `);
    assert.equal(oldRowExists, '0', 'record older than 30 days must be pruned');
    const recentRowExists = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts WHERE id = 'a0000000-0000-0000-0000-000000000010';
    `);
    assert.equal(recentRowExists, '1', 'record within 30 days must be preserved');
    executedCases.push('bounded retention: records older than 30 days opportunistically pruned on record');

    // Test 3.9: Clear on successful login (selective and total reset)
    const CLEAR_EMP = 'EMP_CLEAR_TEST';
    const OTHER_EMP = 'EMP_OTHER_STABLE';
    runPsql(psql, target, `
      INSERT INTO ${qualified}.login_attempts (employee_code, ip) VALUES
        ('${CLEAR_EMP}', '10.70.0.1'),
        ('${CLEAR_EMP}', '10.70.0.1'),
        ('${CLEAR_EMP}', '10.70.0.1'),
        ('${CLEAR_EMP}', '10.70.0.2'),
        ('${CLEAR_EMP}', '10.70.0.2'),
        ('${OTHER_EMP}', '10.70.0.1'),
        ('${OTHER_EMP}', '10.70.0.1');
    `);

    // Selective clear by employee_code + ip
    const selectiveDeleted = runPsql(psql, target, `
      SELECT ${qualified}.clear_login_attempts('${CLEAR_EMP}', '10.70.0.1');
    `);
    assert.equal(selectiveDeleted, '3', 'selective clear must delete matching IP attempts (3 rows)');
    const remainingClear = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts WHERE employee_code = '${CLEAR_EMP}';
    `);
    assert.equal(remainingClear, '2', '2 rows from other IP must remain after selective clear');
    executedCases.push('clear-on-success: selective clear removes attempts matching IP only');

    // Account-wide clear
    const allDeleted = runPsql(psql, target, `
      SELECT ${qualified}.clear_login_attempts('${CLEAR_EMP}');
    `);
    assert.equal(allDeleted, '2', 'account-wide clear must delete remaining rows (2 rows)');
    const zeroRemaining = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts WHERE employee_code = '${CLEAR_EMP}';
    `);
    assert.equal(zeroRemaining, '0', 'zero rows remaining for cleared account');

    // Other account attempts untouched
    const otherCount = runPsql(psql, target, `
      SELECT count(*) FROM ${qualified}.login_attempts WHERE employee_code = '${OTHER_EMP}';
    `);
    assert.equal(otherCount, '2', 'attempts for other account must remain untouched');
    executedCases.push('clear-on-success: account-wide clear clears all attempts with cross-account isolation');

    // Account is allowed immediately after clear
    const allowedAfterClear = runPsql(psql, target, `
      SELECT allowed || '|' || account_attempts
      FROM ${qualified}.check_login_rate_limit('${CLEAR_EMP}', '10.70.0.1');
    `);
    assert.equal(allowedAfterClear, 't|0', 'account rate limit immediately resets to allowed with 0 attempts');
    executedCases.push('clear-on-success: account rate limit immediately unlocks upon clear');

    // Test 3.10: Rollback approval guard & provenance enforcement
    const unapprovedScript = `
      DO $$
      DECLARE
        v_approved text;
      BEGIN
        v_approved := current_setting('kurabe.p98_rollback_approved', true);
        IF v_approved IS DISTINCT FROM 'true' THEN
          RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted. Custom GUC kurabe.p98_rollback_approved must be set to ''true'' in this session prior to running rollback candidate.';
        END IF;
      END $$;
    `;
    let unapprovedThrew = false;
    try {
      runPsql(psql, target, unapprovedScript);
    } catch (err) {
      if (String(err).includes('ROLLBACK_UNAPPROVED')) {
        unapprovedThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(unapprovedThrew, 'rollback must fail closed without kurabe.p98_rollback_approved');
    executedCases.push('rollback approval guard: fails closed with ROLLBACK_UNAPPROVED without custom GUC');

    // Tampered provenance causes preflight rollback failure
    runPsql(psql, target, `
      COMMENT ON FUNCTION ${qualified}.check_login_rate_limit(text, text, integer, integer, integer) IS 'tampered_comment';
    `);
    const provenanceCheckScript = `
      DO $$
      DECLARE
        v_approved text;
        v_check_oid oid;
        v_comment text;
      BEGIN
        v_approved := current_setting('kurabe.p98_rollback_approved', true);
        IF v_approved IS DISTINCT FROM 'true' THEN
          RAISE EXCEPTION 'ROLLBACK_UNAPPROVED: Execution aborted.';
        END IF;

        v_check_oid := to_regprocedure('${schema}.check_login_rate_limit(text, text, integer, integer, integer)')::oid;
        IF v_check_oid IS NOT NULL THEN
          SELECT description INTO v_comment
          FROM pg_description
          WHERE objoid = v_check_oid AND classoid = 'pg_proc'::regclass AND objsubid = 0;

          IF v_comment IS NULL OR v_comment != 'kurabe:p98:candidate:v1:function:check_login_rate_limit' THEN
            RAISE EXCEPTION 'P98_ROLLBACK_PREFLIGHT_FAILED: Function check_login_rate_limit provenance marker missing or mismatched';
          END IF;
        END IF;
      END $$;
    `;
    let provenanceThrew = false;
    try {
      runPsql(psql, target, `
        SET kurabe.p98_rollback_approved = 'true';
        ${provenanceCheckScript}
      `);
    } catch (err) {
      if (String(err).includes('P98_ROLLBACK_PREFLIGHT_FAILED')) {
        provenanceThrew = true;
      } else {
        throw err;
      }
    }
    assert.ok(provenanceThrew, 'rollback must fail closed on mismatched provenance comment');
    executedCases.push('rollback provenance guard: fails closed with P98_ROLLBACK_PREFLIGHT_FAILED on tampered provenance');

    // Restore provenance comment
    runPsql(psql, target, `
      COMMENT ON FUNCTION ${qualified}.check_login_rate_limit(text, text, integer, integer, integer) IS 'kurabe:p98:candidate:v1:function:check_login_rate_limit';
    `);

    // Execute approved rollback
    runPsql(psql, target, `
      SET kurabe.p98_rollback_approved = 'true';
      DROP FUNCTION IF EXISTS ${qualified}.check_login_rate_limit(text, text, integer, integer, integer);
      DROP FUNCTION IF EXISTS ${qualified}.record_failed_login_transaction(text, text, integer, integer, integer);
      DROP FUNCTION IF EXISTS ${qualified}.clear_login_attempts(text, text);
    `);
    const procCount = runPsql(psql, target, `
      SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = '${schema}'
        AND p.proname IN ('check_login_rate_limit', 'record_failed_login_transaction', 'clear_login_attempts');
    `);
    assert.equal(procCount, '0', 'candidate functions must be dropped after approved rollback');
    executedCases.push('rollback execution: approved rollback drops candidate functions');

    const tableExists = runPsql(psql, target, `
      SELECT count(*) FROM information_schema.tables
      WHERE table_schema = '${schema}' AND table_name = 'login_attempts';
    `);
    assert.equal(tableExists, '1', 'login_attempts table must be preserved after rollback');
    executedCases.push('rollback safety: login_attempts table and audit logs preserved after rollback');

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
      console.log(`PASS login-rate-limit integration suite: ${report.cases.length} cases verified via real PostgreSQL`);
      for (const c of report.cases) {
        console.log(`  ✓ ${c}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`FAIL login-rate-limit integration suite: ${err.message || err}`);
      process.exit(1);
    });
}
