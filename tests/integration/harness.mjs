import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');
const fixturePath = path.join(projectRoot, 'tests/fixtures/release/minimal-auth-evaluation.sql');
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
  throw new Error(`LOCAL_DB_GUARD: ${message}`);
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
    timeout: 10_000,
    maxBuffer: 128 * 1024,
  });
  if (result.error || result.status !== 0) {
    const detail = result.error?.code === 'ENOENT'
      ? 'psql executable was not found'
      : redact(result.stderr || result.error?.message || `exit ${result.status}`);
    fail(`psql failed without fallback: ${detail}`);
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

export async function run({ options = {} } = {}) {
  const target = parseTarget(options);
  const psql = locatePsql();
  if (!psql) {
    fail('psql is unavailable; install/access approval is required, and a mock database is forbidden');
  }

  const identity = runPsql(psql, target, `
    SELECT current_database() || '|' ||
           coalesce(host(inet_server_addr()), '') || '|' ||
           inet_server_port()::text || '|' ||
           current_setting('is_superuser') || '|' || current_user;
  `);
  const [database, address, serverPort, isSuperuser, currentUser] = identity.split('|');
  const serverAddressIsLoopback = ['127.0.0.1', '::1'].includes(address);
  const serverAddressIsDockerBridge = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(address);
  if (
    database !== target.database ||
    (!serverAddressIsLoopback && !(serverAddressIsDockerBridge && /^kurabe_harness(?:_[a-z0-9_]+)?$/.test(target.database))) ||
    serverPort !== String(target.port) ||
    currentUser !== target.user ||
    !['on', 'off'].includes(isSuperuser)
  ) {
    fail('connected server identity is not the requested loopback disposable target');
  }

  if (!fs.existsSync(fixturePath)) fail('synthetic schema fixture is missing');
  const schema = `kurabe_harness_${cryptoSuffix()}`;
  const qualified = quoteIdentifier(schema);
  const fixture = fs.readFileSync(fixturePath, 'utf8').replaceAll('__SCHEMA__', schema);
  let primaryError;
  let cleanupError;
  let created = false;

  try {
    runPsql(psql, target, `CREATE SCHEMA ${qualified};\n${fixture}`);
    created = true;

    const transactionOutput = runPsql(psql, target, `
      BEGIN;
      INSERT INTO ${qualified}.auth_users (id, email, password_setup_required)
        VALUES ('00000000-0000-0000-0000-000000000001', 'synthetic@example.invalid', true);
      INSERT INTO ${qualified}.evaluations (id, employee_id, evaluator_id, status, score)
        VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', NULL, 'draft', NULL);
      INSERT INTO ${qualified}.evaluation_rounds (id, evaluation_id, round_number, evaluator_id, status)
        VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 1, NULL, 'open');
      ROLLBACK;
      SELECT 'rollback_counts=' ||
        (SELECT count(*) FROM ${qualified}.auth_users) || ',' ||
        (SELECT count(*) FROM ${qualified}.evaluations) || ',' ||
        (SELECT count(*) FROM ${qualified}.evaluation_rounds);
    `);
    if (!transactionOutput.split(/\r?\n/).includes('rollback_counts=0,0,0')) {
      fail('transaction rollback marker did not prove all synthetic rows were removed');
    }

    const remaining = runPsql(psql, target, `
      SELECT 'fixture_tables=' || count(*)
      FROM information_schema.tables
      WHERE table_schema = '${schema}'
        AND table_name IN ('auth_users', 'evaluations', 'evaluation_rounds');
    `);
    if (remaining !== 'fixture_tables=3') fail('minimal auth/evaluation fixture was not created as expected');
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
      } catch (error) {
        cleanupError = error;
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
    cases: [
      'loopback database identity guard',
      'synthetic auth/evaluation transaction rollback',
      'bounded schema cleanup and residue check',
    ],
    target: `loopback:${target.port}/${target.database}`,
  };
}

function cryptoSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
