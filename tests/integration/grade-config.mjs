#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migration = path.join(projectRoot, 'supabase/migrations/20260907000500_grade_config_version.sql');
const rollback = path.join(projectRoot, 'db/rollback-grade-config-version.sql');
const baseline = path.join(projectRoot, 'db/bootstrap/baseline.sql');

function command(file, args, options = {}) {
  return spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}
function must(file, args, options = {}) {
  const result = command(file, args, options);
  if (result.status !== 0) throw new Error(`${file} failed (${result.status}): ${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}
function start(name, password, database) {
  const id = must('docker', ['run', '--detach', '--rm', '--name', name, '--env', `POSTGRES_PASSWORD=${password}`, '--env', `POSTGRES_DB=${database}`, '--publish', '127.0.0.1::5432', 'postgres:17-alpine']);
  assert.ok(id.length > 10);
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', 'postgres']);
    if (result.status === 0) { ready = true; break; }
  }
  assert.ok(ready, 'disposable PostgreSQL did not become ready');
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(port, 'could not determine loopback port');
  let targetReady = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', database]);
    if (result.status === 0) { targetReady = true; break; }
  }
  assert.ok(targetReady, 'target PostgreSQL database did not become ready');
  let connectionReady = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--command', 'SELECT 1;',
    ], { env: { ...process.env, PGPASSWORD: password } });
    if (result.status === 0) { connectionReady = true; break; }
  }
  assert.ok(connectionReady, 'target PostgreSQL connection did not stabilize');
  return port;
}
function psql(port, password, sql, expectPass = true) {
  const result = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', 'kurabe_harness_p99m3', '--no-psqlrc', '--tuples-only', '--no-align', '--command', sql], { env: { ...process.env, PGPASSWORD: password } });
  if (expectPass && result.status !== 0) throw new Error(`psql failed [${sql.slice(0, 80)}]: ${String(result.stderr || '').trim()}`);
  return { out: String(result.stdout || '').trim(), err: String(result.stderr || '').trim(), status: result.status };
}
function applyFile(port, password, file) {
  const result = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', 'kurabe_harness_p99m3', '--no-psqlrc', '--file', file], { env: { ...process.env, PGPASSWORD: password } });
  if (result.status !== 0) throw new Error(`psql ${path.basename(file)} failed: ${String(result.stderr || '').trim()}`);
}
function bootstrap(port, password) {
  psql(port, password, 'SELECT 1;');
  psql(port, password, "DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  applyFile(port, password, baseline);
  psql(port, password, `INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
    ('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
    ('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
    ('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);`);
  applyFile(port, password, migration);
}
function jsonResult(raw) {
  return JSON.parse(raw.split('\n').filter(Boolean).at(-1));
}
async function run() {
  const first = `kurabe-p99m3t01-a-${process.pid}`;
  const second = `kurabe-p99m3t01-b-${process.pid}`;
  const firstPassword = crypto.randomBytes(24).toString('base64url');
  const secondPassword = crypto.randomBytes(24).toString('base64url');
  const cases = [];
  try {
    const port = start(first, firstPassword, 'kurabe_harness_p99m3');
    bootstrap(port, firstPassword);
    const initial = jsonResult(psql(port, firstPassword, 'SELECT public.get_active_grade_config();').out);
    assert.equal(initial.version, 1);
    assert.equal(initial.bands.length, 18);
    assert.equal(psql(port, firstPassword, "SELECT count(*) FROM public.grade_bands WHERE version_id = (SELECT id FROM public.grade_band_versions WHERE is_active);").out, '18');
    cases.push('migration-seeds-authoritative-version');

    const valid = initial.bands.map((band) => ({ ...band }));
    valid.find((band) => band.role_group === 'leader' && band.grade === 'S').min_score = 171;
    valid.find((band) => band.role_group === 'leader' && band.grade === 'A').max_score = 170;
    const saved = jsonResult(psql(port, firstPassword, `SELECT public.save_grade_config($json$${JSON.stringify(valid)}$json$::jsonb, 1);`).out);
    assert.equal(saved.version, 2);
    assert.equal(saved.bands.length, 18);
    cases.push('atomic-versioned-replace');

    const stale = psql(port, firstPassword, `SELECT public.save_grade_config($json$${JSON.stringify(valid)}$json$::jsonb, 1);`, false);
    assert.notEqual(stale.status, 0);
    assert.match(stale.err, /P99M3T01_CONFIG_STALE/);
    assert.equal(psql(port, firstPassword, 'SELECT version_no FROM public.grade_band_versions WHERE is_active;').out, '2');
    cases.push('stale-writer-rejected');

    const invalid = valid.map((band) => ({ ...band }));
    invalid.find((band) => band.role_group === 'leader' && band.grade === 'A').max_score = 168;
    const bad = psql(port, firstPassword, `SELECT public.save_grade_config($json$${JSON.stringify(invalid)}$json$::jsonb, 2);`, false);
    assert.notEqual(bad.status, 0);
    assert.match(bad.err, /P99M3T01_INVALID_CONFIG/);
    assert.equal(psql(port, firstPassword, 'SELECT count(*) FROM public.grade_band_versions;').out, '2');
    cases.push('gap-overlap-rejected-without-partial-write');

    const initialId = psql(port, firstPassword, "SELECT id FROM public.grade_band_versions WHERE version_no=1;").out;
    psql(port, firstPassword, `INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade) VALUES ('00000000-0000-0000-0000-000000000101', 2099, 'P99M3', 'Active', 75, 'AB');`);
    psql(port, firstPassword, `INSERT INTO public.users (id, employee_code, name, role, gender) VALUES ('00000000-0000-0000-0000-000000000102', 'P99M3-EMP', 'P99M3 Employee', 'Employee', 'Other');`);
    psql(port, firstPassword, `INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, status) VALUES ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000102', 'Employee', 'NotStarted');`);
    const pinned = psql(port, firstPassword, "INSERT INTO public.evaluation_rounds (evaluation_id, round, evaluator_role, status) VALUES ('00000000-0000-0000-0000-000000000103', 1, 'Employee', 'Submitted') RETURNING grade_config_version_id;").out.split(String.fromCharCode(10))[0];
    assert.match(pinned, /^[0-9a-f-]{36}$/);
    assert.equal(pinned, psql(port, firstPassword, 'SELECT id FROM public.grade_band_versions WHERE is_active;').out);
    cases.push('submit-pins-active-version');

    const staleSubmit = psql(port, firstPassword, `INSERT INTO public.evaluation_rounds (evaluation_id, round, evaluator_role, status, grade_config_version_id) VALUES ('00000000-0000-0000-0000-000000000103', 2, 'Employee', 'Submitted', '${initialId}');`, false);
    assert.notEqual(staleSubmit.status, 0);
    assert.match(staleSubmit.err, /P99M3T01_GRADE_VERSION_STALE/);
    cases.push('stale-submit-rejected');

    const rollbackPort = start(second, secondPassword, 'kurabe_harness_p99m3');
    bootstrap(rollbackPort, secondPassword);
    const before = psql(rollbackPort, secondPassword, 'SELECT count(*) FROM public.grade_bands;').out;
    const rollbackResult = command('psql', ['--host', '127.0.0.1', '--port', rollbackPort, '--username', 'postgres', '--dbname', 'kurabe_harness_p99m3', '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', "SET kurabe.p99m3t01_rollback_approved='true';", '--file', rollback], { env: { ...process.env, PGPASSWORD: secondPassword } });
    if (rollbackResult.status !== 0) throw new Error(`rollback failed: ${String(rollbackResult.stderr || '').trim()}`);
    assert.equal(psql(rollbackPort, secondPassword, 'SELECT count(*) FROM public.grade_bands;').out, before);
    assert.equal(psql(rollbackPort, secondPassword, "SELECT count(*) FROM information_schema.columns WHERE table_name='grade_band_versions';").out, '0');
    cases.push('approved-rollback-preserves-baseline-data');

    return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', cases, target: 'disposable-postgresql-17' };
  } finally {
    command('docker', ['rm', '--force', first]);
    command('docker', ['rm', '--force', second]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`GRADE_CONFIG_VERSION PASS cases=${result.cases.length} target=${result.target}`);
  } catch (error) {
    console.error(`GRADE_CONFIG_VERSION FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
