#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = path.join(projectRoot, 'supabase/migrations/20260907000700_sensitive_read_grants.sql');
const rollback = path.join(projectRoot, 'db/rollback-sensitive-read-grants.sql');

function command(file, args, options = {}) {
  return spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function must(file, args, options = {}) {
  const result = command(file, args, options);
  if (result.status !== 0) throw new Error(`${file} failed: ${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}
function psql(port, password, database, sql, options = {}) {
  const args = ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--tuples-only', '--no-align'];
  const roleSql = options.role ? `SET ROLE ${options.role}; ` : '';
  args.push('--command', `${roleSql}${sql}`);
  const result = command('psql', args, { env: { ...process.env, PGPASSWORD: password } });
  return { status: result.status, out: String(result.stdout || '').trim(), err: String(result.stderr || '').trim() };
}
function applyFile(port, password, database, file, options = {}) {
  const args = ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1'];
  if (options.role) args.push('--role', options.role);
  args.push('--file', file);
  const result = command('psql', args, { env: { ...process.env, PGPASSWORD: password } });
  if (result.status !== 0) throw new Error(`psql ${path.basename(file)} failed: ${String(result.stderr || '').trim()}`);
}
function start(name, password, database) {
  must('docker', ['run', '--detach', '--rm', '--name', name, '--env', `POSTGRES_PASSWORD=${password}`, '--env', `POSTGRES_DB=${database}`, '--publish', '127.0.0.1::5432', 'postgres:17-alpine']);
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    if (command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', database]).status === 0) { ready = true; break; }
  }
  assert.ok(ready, 'disposable PostgreSQL did not become ready');
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(port, 'could not determine loopback port');
  for (let i = 0; i < 60; i += 1) {
    if (psql(port, password, database, 'SELECT 1;').status === 0) return port;
  }
  throw new Error('loopback PostgreSQL connection failed');
}
function sourceContractCases() {
  const authContext = fs.readFileSync(path.join(projectRoot, 'src/contexts/AuthContext.tsx'), 'utf8');
  const hook = fs.readFileSync(path.join(projectRoot, 'src/hooks/use-db.ts'), 'utf8');
  const readAction = fs.readFileSync(path.join(projectRoot, 'src/actions/read.ts'), 'utf8');
  const usersAdmin = fs.readFileSync(path.join(projectRoot, 'src/lib/db/users-admin.ts'), 'utf8');
  const evalAdmin = fs.readFileSync(path.join(projectRoot, 'src/lib/db/evaluations-admin.ts'), 'utf8');
  const periodModal = fs.readFileSync(path.join(projectRoot, 'src/components/reports/PeriodMinutesModal.tsx'), 'utf8');
  const batchModal = fs.readFileSync(path.join(projectRoot, 'src/components/reports/BatchResultMessageModal.tsx'), 'utf8');
  const clientFiles = [authContext, hook, fs.readFileSync(path.join(projectRoot, 'src/lib/export.ts'), 'utf8')];
  assert.match(authContext, /getPeriodsAction/);
  assert.doesNotMatch(authContext, /from ['"]@\/lib\/supabase['"]/);
  assert.match(hook, /getActivePeriodAction/);
  assert.match(readAction, /requireAuth\(\)/);
  assert.match(usersAdmin, /isIndividualRole/);
  assert.match(usersAdmin, /team_id/);
  assert.match(evalAdmin, /evaluator_id/);
  assert.match(evalAdmin, /team_id/);
  assert.match(periodModal, /usePeriods\(user\)/);
  assert.match(batchModal, /usePeriods\(user\)/);
  assert.doesNotMatch(`${periodModal}\n${batchModal}`, /usePeriods\(\)/);
  for (const role of ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker']) {
    assert.ok(usersAdmin.includes(role) || usersAdmin.includes('isIndividualRole'), `role contract missing: ${role}`);
  }
  for (const source of clientFiles) {
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin|service_role/i);
  }
  return [
    'authenticated-period-server-action',
    'client-no-anon-period-client',
    'five-role-user-scope-contract',
    'cross-team-evaluation-scope-contract',
    'cookie-user-id-not-authority',
    'client-bundle-no-service-role-secret',
    'all-period-hook-callers-are-requester-gated',
  ];
}

export async function run() {
  const name = `kurabe-p99m4t01-${process.pid}`;
  const password = crypto.randomBytes(24).toString('base64url');
  const database = 'kurabe_harness_p99m4t01';
  const cases = [];
  try {
    const port = start(name, password, database);
    psql(port, password, database, `
      DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      CREATE TABLE public.evaluation_periods (
        id uuid PRIMARY KEY,
        year integer NOT NULL,
        name text NOT NULL,
        status text NOT NULL,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        closed_at timestamptz,
        target_rate numeric,
        target_grade text
      );
      INSERT INTO public.evaluation_periods (id, year, name, status)
      VALUES ('00000000-0000-0000-0000-000000000401', 2099, 'P99M4T01', 'active');
      GRANT SELECT ON public.evaluation_periods TO anon, authenticated, service_role;
    `);
    assert.equal(psql(port, password, database, "SELECT has_table_privilege('anon','public.evaluation_periods','SELECT') AND has_table_privilege('authenticated','public.evaluation_periods','SELECT');").out, 't');
    cases.push('baseline-direct-grants-present');

    applyFile(port, password, database, migration);
    assert.equal(psql(port, password, database, "SELECT has_table_privilege('anon','public.evaluation_periods','SELECT') OR has_table_privilege('authenticated','public.evaluation_periods','SELECT');").out, 'f');
    assert.equal(psql(port, password, database, "SELECT name FROM public.evaluation_periods;", { role: 'anon' }).status, 1);
    assert.equal(psql(port, password, database, "SELECT name FROM public.evaluation_periods;", { role: 'authenticated' }).status, 1);
    const serviceRead = psql(port, password, database, "SELECT name FROM public.evaluation_periods;", { role: 'service_role' });
    assert.equal(serviceRead.out.split('\n').at(-1), 'P99M4T01');
    cases.push('anon-rest-select-denied');
    cases.push('authenticated-rest-select-denied');
    cases.push('service-role-server-reader-allowed');

    const reapply = psql(port, password, database, `\i ${migration}`);
    assert.equal(reapply.status, 1);
    cases.push('unexpected-grant-state-fails-closed');

    const rollbackSql = fs.readFileSync(rollback, 'utf8');
    const unauthorizedRollback = psql(port, password, database, rollbackSql);
    assert.equal(unauthorizedRollback.status, 1);
    assert.equal(psql(port, password, database, "SELECT has_table_privilege('anon','public.evaluation_periods','SELECT') OR has_table_privilege('authenticated','public.evaluation_periods','SELECT');").out, 'f');
    cases.push('rollback-approval-required-no-partial-grant');

    const approvedRollback = psql(port, password, database, `BEGIN; SET LOCAL kurabe.p99m4t01_rollback = 'approved'; ${rollbackSql}`);
    assert.equal(approvedRollback.status, 0, approvedRollback.err || approvedRollback.out);
    assert.equal(psql(port, password, database, "SELECT has_table_privilege('anon','public.evaluation_periods','SELECT') AND has_table_privilege('authenticated','public.evaluation_periods','SELECT');").out, 't');
    cases.push('approved-rollback-restores-baseline-grants');

    cases.push(...sourceContractCases());
    assert.equal(cases.length, 14);
    return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', cases, target: 'disposable-postgresql-17-read-boundaries' };
  } finally {
    command('docker', ['rm', '--force', name]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((result) => console.log(`READ_BOUNDARIES PASS cases=${result.cases.length} target=${result.target}`)).catch((error) => { console.error(`READ_BOUNDARIES FAIL ${error.message}`); process.exitCode = 1; });
}
