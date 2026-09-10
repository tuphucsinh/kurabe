#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASELINE_PATH = path.join(projectRoot, 'db/bootstrap/baseline.sql');
const MIGRATION_PATH = path.join(projectRoot, 'supabase/migrations/20260907000800_ai_quota.sql');
const ROLLBACK_PATH = path.join(projectRoot, 'db/rollback-ai-quota.sql');
const AI_LIMIT_PATH = path.join(projectRoot, 'src/lib/ai-limit.ts');
const CHAT_ACTION_PATH = path.join(projectRoot, 'src/actions/chat.ts');

const IDS = Object.freeze({
  userA: '00000000-0000-0000-0000-000000000001',
  userB: '00000000-0000-0000-0000-000000000002',
  userC: '00000000-0000-0000-0000-000000000003',
  userD: '00000000-0000-0000-0000-000000000004',
});

const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: '/tmp',
  LANG: 'C',
  LC_ALL: 'C',
  PGPASSFILE: '/dev/null',
  PGSERVICEFILE: '/dev/null',
  PGCONNECT_TIMEOUT: '5',
};

function redact(value) {
  return String(value ?? '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[redacted-db-target]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[redacted]');
}

function command(file, args, options = {}) {
  return spawnSync(file, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function docker(args) {
  const result = command('docker', args, { timeout: 30_000 });
  if (result.error || result.status !== 0) {
    throw new Error(`docker failed: ${redact(result.stderr || result.error?.message || result.status)}`);
  }
  return String(result.stdout || '').trim();
}

function targetArgs(target) {
  return [
    '--no-password', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
    '--host', target.host, '--port', String(target.port),
    '--username', target.user, '--dbname', target.database,
  ];
}

function psqlResult(target, sql, timeout = 60_000) {
  const result = spawnSync(
    'psql',
    [...targetArgs(target), '--tuples-only', '--no-align', '--field-separator', '|', '--command', sql],
    {
      cwd: projectRoot,
      env: { ...SAFE_ENV, PGPASSWORD: target.password },
      encoding: 'utf8',
      timeout,
      maxBuffer: 1024 * 1024,
    },
  );
  return {
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    error: result.error,
  };
}

function runPsql(target, sql, timeout = 60_000) {
  const result = psqlResult(target, sql, timeout);
  if (result.error || result.status !== 0) {
    throw new Error(`psql failed: ${redact(result.stderr || result.error?.message || result.status)}`);
  }
  return result.stdout.trim();
}

function expectPsqlFailure(target, sql, marker) {
  const result = psqlResult(target, sql);
  assert.notEqual(result.status, 0, `expected psql failure: ${marker}`);
  assert.match(redact(`${result.stdout}\n${result.stderr}`), new RegExp(marker));
}

function applyFile(target, file) {
  const result = spawnSync(
    'psql',
    [...targetArgs(target), '--file', file],
    {
      cwd: projectRoot,
      env: { ...SAFE_ENV, PGPASSWORD: target.password },
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(`psql ${path.basename(file)} failed: ${redact(result.stderr || result.error?.message || result.status)}`);
  }
}

function startContainer() {
  const name = `kurabe-p100m1t01-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const password = crypto.randomBytes(24).toString('hex');
  docker([
    'run', '--detach', '--rm', '--name', name,
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', 'POSTGRES_DB=postgres',
    '--publish', '127.0.0.1::5432',
    'postgres:17-alpine',
  ]);
  try {
    let port;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const mapping = docker(['port', name, '5432/tcp']);
      const match = mapping.match(/127\.0\.0\.1:(\d+)/);
      if (match) {
        port = Number(match[1]);
        const ready = command('pg_isready', [
          '--host', '127.0.0.1', '--port', String(port), '--username', 'postgres', '--dbname', 'postgres',
        ], { env: { ...SAFE_ENV, PGPASSWORD: password }, timeout: 2_000 });
        if (ready.status === 0) {
          const target = { host: '127.0.0.1', port, user: 'postgres', database: 'postgres', password };
          for (let connectionAttempt = 0; connectionAttempt < 20; connectionAttempt += 1) {
            const connection = psqlResult(target, 'SELECT 1;');
            if (connection.status === 0) return { name, target };
            spawnSync('sleep', ['0.25']);
          }
        }
      }
      spawnSync('sleep', ['0.25']);
    }
    throw new Error('disposable PostgreSQL did not become ready');
  } catch (error) {
    command('docker', ['rm', '--force', name], { timeout: 30_000 });
    throw error;
  }
}

function stopContainer(container) {
  if (container) command('docker', ['rm', '--force', container.name], { timeout: 30_000 });
}

function scalar(target, sql) {
  const lines = runPsql(target, sql).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  assert.equal(lines.length, 1, `expected one scalar row, got ${lines.length}`);
  return lines[0];
}

function quotaCall(target, kind, userId, requestId, windowSeconds, maxRequests, retentionDays = 30) {
  const action = kind === 'ai' ? 'test-action' : 'chat';
  const row = scalar(target, `SELECT allowed::text || '|' || coalesce(error, '') FROM public.ai_quota_reserve('${kind}', '${userId}', '${requestId}', ${windowSeconds}, ${maxRequests}, ${retentionDays}, '${action}');`);
  const [allowed, error = ''] = row.split('|');
  return { allowed: allowed === 't' || allowed === 'true', error };
}

function lifecycleCall(target, operation, kind, userId, requestId) {
  const column = operation === 'consume' ? 'consumed' : 'refunded';
  const functionName = operation === 'consume' ? 'ai_quota_consume' : 'ai_quota_refund';
  const row = scalar(target, `SELECT ${column}::text || '|' || coalesce(error, '') FROM public.${functionName}('${kind}', '${userId}', '${requestId}');`);
  const [value, error = ''] = row.split('|');
  return { value: value === 't' || value === 'true', error };
}

function asyncPsql(target, sql) {
  return new Promise((resolve) => {
    const child = spawn(
      'psql',
      [...targetArgs(target), '--tuples-only', '--no-align', '--field-separator', '|', '--command', sql],
      { cwd: projectRoot, env: { ...SAFE_ENV, PGPASSWORD: target.password }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', (error) => resolve({ status: null, stdout, stderr, error }));
    child.once('close', (status) => resolve({ status, stdout, stderr, error: null }));
  });
}

function bootstrapRoles(target) {
  runPsql(target, `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $$;`);
}

function assertSourceContract() {
  const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');
  const rollback = fs.readFileSync(ROLLBACK_PATH, 'utf8');
  const aiLimit = fs.readFileSync(AI_LIMIT_PATH, 'utf8');
  const chat = fs.readFileSync(CHAT_ACTION_PATH, 'utf8');

  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /uq_ai_usage_user_request/);
  assert.match(migration, /uq_chat_usage_user_request/);
  assert.match(migration, /EXCEPTION WHEN OTHERS/);
  assert.match(migration, /SET search_path = public, pg_temp/);
  assert.match(migration, /REVOKE ALL ON FUNCTION/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION .* TO service_role/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS request_id/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS status/);
  assert.match(rollback, /kurabe\.p100_rollback_approved/);
  assert.match(rollback, /P100_ROLLBACK_PREFLIGHT_FAILED/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.ai_quota_reserve/);
  assert.match(aiLimit, /AbortSignal\.timeout/);
  assert.match(aiLimit, /reserveChatQuota/);
  assert.match(aiLimit, /consumeChatQuota/);
  assert.match(aiLimit, /refundChatQuota/);
  assert.match(chat, /reserveChatQuota/);
  assert.match(chat, /consumeChatQuota/);
  assert.match(chat, /refundChatQuota/);
  assert.doesNotMatch(chat, /\.from\(['"]chat_usage['"]\)/);
}

async function runMainCases(cases) {
  const container = startContainer();
  try {
    bootstrapRoles(container.target);
    applyFile(container.target, BASELINE_PATH);
    applyFile(container.target, MIGRATION_PATH);
    applyFile(container.target, MIGRATION_PATH);
    runPsql(container.target, `
      INSERT INTO public.users (id, employee_code, name, role, gender)
      VALUES
        ('${IDS.userA}', 'P100-A', 'Quota A', 'Manager', 'Nữ'),
        ('${IDS.userB}', 'P100-B', 'Quota B', 'Manager', 'Nữ'),
        ('${IDS.userC}', 'P100-C', 'Quota C', 'Manager', 'Nữ'),
        ('${IDS.userD}', 'P100-D', 'Quota D', 'Manager', 'Nữ');`);
    cases.push('source-contract-and-idempotent-migration');

    assert.equal(scalar(container.target, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_usage' AND column_name IN ('request_id','status');"), '2');
    assert.equal(scalar(container.target, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_usage' AND column_name IN ('request_id','status');"), '2');
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname IN ('uq_ai_usage_user_request','uq_chat_usage_user_request');"), '2');
    assert.equal(scalar(container.target, "SELECT has_function_privilege('service_role', 'public.ai_quota_reserve(text,uuid,text,integer,integer,integer,text)', 'EXECUTE')::text;"), 'true');
    assert.equal(scalar(container.target, "SELECT has_function_privilege('authenticated', 'public.ai_quota_reserve(text,uuid,text,integer,integer,integer,text)', 'EXECUTE')::text;"), 'false');
    cases.push('schema-and-service-role-boundary');

    assert.deepEqual(quotaCall(container.target, 'ai', IDS.userA, 'ai-a-1', 3600, 30), { allowed: true, error: '' });
    assert.deepEqual(quotaCall(container.target, 'ai', IDS.userA, 'ai-a-1', 3600, 30), { allowed: true, error: '' });
    assert.equal(scalar(container.target, `SELECT count(*) FROM public.ai_usage WHERE user_id='${IDS.userA}' AND request_id='ai-a-1';`), '1');
    cases.push('under-quota-and-idempotent-deduplication');

    assert.deepEqual(lifecycleCall(container.target, 'consume', 'ai', IDS.userA, 'ai-a-1'), { value: true, error: '' });
    assert.deepEqual(lifecycleCall(container.target, 'consume', 'ai', IDS.userA, 'ai-a-1'), { value: true, error: '' });
    assert.equal(scalar(container.target, `SELECT status FROM public.ai_usage WHERE user_id='${IDS.userA}' AND request_id='ai-a-1';`), 'consumed');
    cases.push('consume-terminal-and-retry-idempotency');

    assert.deepEqual(quotaCall(container.target, 'chat', IDS.userA, 'chat-a-refund', 7200, 15), { allowed: true, error: '' });
    assert.deepEqual(lifecycleCall(container.target, 'refund', 'chat', IDS.userA, 'chat-a-refund'), { value: true, error: '' });
    assert.deepEqual(lifecycleCall(container.target, 'refund', 'chat', IDS.userA, 'chat-a-refund'), { value: false, error: 'NOT_FOUND' });
    assert.equal(scalar(container.target, `SELECT count(*) FROM public.chat_usage WHERE user_id='${IDS.userA}' AND request_id='chat-a-refund';`), '0');

    assert.deepEqual(quotaCall(container.target, 'chat', IDS.userA, 'chat-a-consume', 7200, 15), { allowed: true, error: '' });
    assert.deepEqual(lifecycleCall(container.target, 'consume', 'chat', IDS.userA, 'chat-a-consume'), { value: true, error: '' });
    assert.deepEqual(lifecycleCall(container.target, 'refund', 'chat', IDS.userA, 'chat-a-consume'), { value: false, error: 'ALREADY_CONSUMED' });
    cases.push('provider-failure-refund-and-consumed-no-refund');

    for (let index = 0; index < 3; index += 1) {
      assert.equal(quotaCall(container.target, 'ai', IDS.userB, `ai-b-${index}`, 3600, 3).allowed, true);
    }
    assert.deepEqual(quotaCall(container.target, 'ai', IDS.userB, 'ai-b-limit', 3600, 3), { allowed: false, error: 'LIMIT_REACHED' });
    assert.equal(scalar(container.target, `SELECT count(*) FROM public.ai_usage WHERE user_id='${IDS.userB}' AND created_at >= now() - interval '1 hour';`), '3');
    assert.equal(quotaCall(container.target, 'ai', IDS.userC, 'ai-c-1', 3600, 3).allowed, true);
    cases.push('at-quota-reject-and-user-isolation');

    const contenders = Array.from({ length: 10 }, (_, index) => asyncPsql(
      container.target,
      `SELECT allowed FROM public.ai_quota_reserve('ai', '${IDS.userD}', 'race-${index}', 3600, 5, 30, 'race');`,
    ));
    const results = await Promise.all(contenders);
    assert.equal(results.filter((result) => result.status === 0).length, 10);
    const outcomes = results.map((result) => result.stdout.trim()).sort();
    assert.equal(outcomes.filter((value) => value === 't').length, 5);
    assert.equal(outcomes.filter((value) => value === 'f').length, 5);
    assert.equal(scalar(container.target, `SELECT count(*) FROM public.ai_usage WHERE user_id='${IDS.userD}' AND created_at >= now() - interval '1 hour';`), '5');
    cases.push('concurrent-boundary-cannot-overrun');

    assert.deepEqual(quotaCall(container.target, 'ai', IDS.userA, 'ai-retention', 3600, 30), { allowed: true, error: '' });
    runPsql(container.target, `INSERT INTO public.ai_usage (user_id, action, request_id, status, created_at) VALUES ('${IDS.userA}', 'old', 'ai-old', 'consumed', now() - interval '40 days');`);
    assert.equal(scalar(container.target, `SELECT count(*) FROM public.ai_usage WHERE request_id='ai-old';`), '1');
    assert.equal(quotaCall(container.target, 'ai', IDS.userA, 'ai-retention-trigger', 3600, 30).allowed, true);
    assert.equal(scalar(container.target, `SELECT count(*) FROM public.ai_usage WHERE request_id='ai-old';`), '0');
    cases.push('bounded-retention-cleanup');

    const beforeUnavailable = scalar(container.target, 'SELECT count(*) FROM public.chat_usage;');
    runPsql(container.target, 'ALTER TABLE public.chat_usage RENAME TO chat_usage_unexpected_state;');
    const unavailable = quotaCall(container.target, 'chat', IDS.userA, 'chat-db-failure', 7200, 15);
    assert.equal(unavailable.allowed, false);
    assert.match(unavailable.error, /^QUOTA_UNAVAILABLE/);
    runPsql(container.target, 'ALTER TABLE public.chat_usage_unexpected_state RENAME TO chat_usage;');
    assert.equal(scalar(container.target, 'SELECT count(*) FROM public.chat_usage;'), beforeUnavailable);
    cases.push('unexpected-schema-fails-closed-without-partial-row');

    const rowsBeforeRollback = scalar(container.target, 'SELECT count(*) FROM public.ai_usage;');
    expectPsqlFailure(container.target, fs.readFileSync(ROLLBACK_PATH, 'utf8'), 'ROLLBACK_UNAPPROVED');
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('public.ai_quota_reserve(text,uuid,text,integer,integer,integer,text)');"), '1');
    runPsql(container.target, "COMMENT ON FUNCTION public.ai_quota_consume(text, uuid, text) IS 'foreign:unrecognized';");
    expectPsqlFailure(container.target, `SET kurabe.p100_rollback_approved='true';\n${fs.readFileSync(ROLLBACK_PATH, 'utf8')}`, 'P100_ROLLBACK_PREFLIGHT_FAILED');
    runPsql(container.target, "COMMENT ON FUNCTION public.ai_quota_consume(text, uuid, text) IS 'kurabe:p100:candidate:v1:function:ai_quota_consume';");
    runPsql(container.target, `SET kurabe.p100_rollback_approved='true';\n${fs.readFileSync(ROLLBACK_PATH, 'utf8')}`);
    assert.equal(scalar(container.target, 'SELECT count(*) FROM public.ai_usage;'), rowsBeforeRollback);
    assert.equal(scalar(container.target, "SELECT count(*) FROM pg_proc WHERE oid = to_regprocedure('public.ai_quota_reserve(text,uuid,text,integer,integer,integer,text)');"), '0');
    assert.equal(scalar(container.target, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_usage' AND column_name IN ('request_id','status');"), '0');
    cases.push('approval-and-provenance-gated-rollback-preserves-history');
  } finally {
    stopContainer(container);
  }
}

async function runMigrationPreflightFailureCase(cases) {
  const container = startContainer();
  try {
    bootstrapRoles(container.target);
    applyFile(container.target, BASELINE_PATH);
    runPsql(container.target, 'DROP TABLE public.users CASCADE;');
    expectPsqlFailure(container.target, fs.readFileSync(MIGRATION_PATH, 'utf8'), 'P100M1T01_PREFLIGHT_FAILED');
    assert.equal(scalar(container.target, "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='ai_usage' AND column_name IN ('request_id','status');"), '0');
    cases.push('migration-preflight-zero-partial-mutation');
  } finally {
    stopContainer(container);
  }
}

export async function run() {
  const cases = [];
  assertSourceContract();
  await runMainCases(cases);
  await runMigrationPreflightFailureCase(cases);
  return { real: true, passed: true, cases, target: 'disposable-postgresql-17-loopback' };
}
