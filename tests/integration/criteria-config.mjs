#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const baseline = path.join(projectRoot, 'db/bootstrap/baseline.sql');
const gradeMigration = path.join(projectRoot, 'supabase/migrations/20260907000500_grade_config_version.sql');
const migration = path.join(projectRoot, 'supabase/migrations/20260907000600_criteria_config_version.sql');
const rollback = path.join(projectRoot, 'db/rollback-criteria-config-version.sql');

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
    const result = command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', database]);
    if (result.status === 0) { ready = true; break; }
  }
  assert.ok(ready, 'disposable PostgreSQL did not become ready');
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(port, 'could not determine loopback port');
  let connectionReady = false;
  for (let i = 0; i < 60; i += 1) {
    const readyConnection = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--command', 'SELECT 1;'], { env: { ...process.env, PGPASSWORD: password } });
    if (readyConnection.status === 0) { connectionReady = true; break; }
  }
  assert.ok(connectionReady, 'loopback PostgreSQL connection failed');
  return port;
}
function psql(port, password, database, sql, expectPass = true) {
  const result = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--tuples-only', '--no-align', '--command', sql], { env: { ...process.env, PGPASSWORD: password } });
  if (expectPass && result.status !== 0) throw new Error(`psql failed [${sql.slice(0, 100)}]: ${String(result.stderr || '').trim()}`);
  return { out: String(result.stdout || '').trim(), err: String(result.stderr || '').trim(), status: result.status };
}
function applyFile(port, password, database, file) {
  const result = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', file], { env: { ...process.env, PGPASSWORD: password } });
  if (result.status !== 0) throw new Error(`psql ${path.basename(file)} failed: ${String(result.stderr || '').trim()}`);
}
function bootstrap(port, password, database) {
  psql(port, password, database, "DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;");
  applyFile(port, password, database, baseline);
  psql(port, password, database, `
    COMMENT ON CONSTRAINT uq_evaluations_period_employee ON public.evaluations IS 'kurabe:p3:candidate:v1:constraint:uq_evaluations_period_employee';
    COMMENT ON CONSTRAINT uq_evaluation_rounds_eval_round ON public.evaluation_rounds IS 'kurabe:p3:candidate:v1:constraint:uq_evaluation_rounds_eval_round';
    COMMENT ON CONSTRAINT chk_evaluation_rounds_round_range ON public.evaluation_rounds IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_round_range';
    COMMENT ON CONSTRAINT chk_evaluations_current_round_range ON public.evaluations IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_current_round_range';
    COMMENT ON CONSTRAINT chk_evaluations_status_valid ON public.evaluations IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_status_valid';
    COMMENT ON CONSTRAINT chk_evaluation_rounds_status_valid ON public.evaluation_rounds IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_status_valid';
    COMMENT ON CONSTRAINT chk_evaluation_rounds_total_score_non_negative ON public.evaluation_rounds IS 'kurabe:p3:candidate:v1:constraint:chk_evaluation_rounds_total_score_non_negative';
    COMMENT ON CONSTRAINT chk_evaluations_final_score_non_negative ON public.evaluations IS 'kurabe:p3:candidate:v1:constraint:chk_evaluations_final_score_non_negative';
    COMMENT ON INDEX idx_evaluations_period_employee IS 'kurabe:p3:candidate:v1:index:idx_evaluations_period_employee';
    COMMENT ON INDEX idx_evaluation_rounds_eval_round IS 'kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round';`);
  psql(port, password, database, `
    INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
      ('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
      ('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
      ('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);`);
  psql(port, password, database, `
    INSERT INTO public.criteria_groups (id, code, name, short_name, sort_order) VALUES
      ('00000000-0000-0000-0000-000000000201', 'quality', 'Quality', 'Q', 0),
      ('00000000-0000-0000-0000-000000000202', 'teamwork', 'Teamwork', 'T', 1);
    INSERT INTO public.criteria (id, code, name, description, applies_to, weight, group_id, sort_order, default_level_index) VALUES
      ('00000000-0000-0000-0000-000000000211', 'quality-result', 'Result quality', 'Quality of output', 'employee', 60, '00000000-0000-0000-0000-000000000201', 0, 0),
      ('00000000-0000-0000-0000-000000000212', 'team-cooperation', 'Cooperation', 'Works with team', 'employee', 40, '00000000-0000-0000-0000-000000000202', 0, 0);
    INSERT INTO public.criterion_levels (id, criterion_id, points, label, description, sort_order) VALUES
      ('00000000-0000-0000-0000-000000000221', '00000000-0000-0000-0000-000000000211', 5, 'Excellent', 'Excellent', 0),
      ('00000000-0000-0000-0000-000000000222', '00000000-0000-0000-0000-000000000211', 3, 'Good', 'Good', 1),
      ('00000000-0000-0000-0000-000000000223', '00000000-0000-0000-0000-000000000212', 5, 'Excellent', 'Excellent', 0),
      ('00000000-0000-0000-0000-000000000224', '00000000-0000-0000-0000-000000000212', 3, 'Good', 'Good', 1);
    INSERT INTO public.criterion_audiences (criterion_id, audience) VALUES
      ('00000000-0000-0000-0000-000000000211', 'employee'),
      ('00000000-0000-0000-0000-000000000212', 'employee');`);
  applyFile(port, password, database, gradeMigration);
  applyFile(port, password, database, migration);
}
function jsonResult(raw) {
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  return JSON.parse(lines.at(-1));
}
function asyncPsql(port, password, database, sql) {
  return new Promise((resolve) => {
    const child = spawn('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--tuples-only', '--no-align', '--command', sql], {
      cwd: projectRoot,
      env: { ...process.env, PGPASSWORD: password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (status) => resolve({ out: out.trim(), err: err.trim(), status }));
  });
}
function seedEvaluation(port, password, database, suffix, round = 1, status = 'Draft', criteriaVersion = null) {
  const baseId = Number(suffix);
  const uuidFor = (offset) => `00000000-0000-0000-0000-${String(baseId + offset).padStart(12, '0')}`;
  const evaluationId = uuidFor(0);
  const employeeId = uuidFor(1);
  const actorId = '00000000-0000-0000-0000-000000000401';
  psql(port, password, database, `
    INSERT INTO public.users (id, employee_code, name, role, gender)
    VALUES ('${employeeId}', 'P99M3T02-${suffix}', 'Criteria Test ${suffix}', 'Employee', 'Other');
    INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, status, current_round)
    VALUES ('${evaluationId}', '00000000-0000-0000-0000-000000000301', '${employeeId}', 'Employee', 'NotStarted', ${round});
    INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, criteria_config_version_id)
    VALUES ('${uuidFor(2)}', '${evaluationId}', ${round}, '${actorId}', 'Employee', '${status}', ${criteriaVersion ? `'${criteriaVersion}'` : 'NULL'});`);
  return { evaluationId, roundId: uuidFor(2), actorId };
}
export async function run() {
  const name = `kurabe-p99m3t02-${process.pid}`;
  const rollbackName = `kurabe-p99m3t02-rb-${process.pid}`;
  const password = crypto.randomBytes(24).toString('base64url');
  const rollbackPassword = crypto.randomBytes(24).toString('base64url');
  const database = 'kurabe_harness_p99m3t02';
  const cases = [];
  try {
    const port = start(name, password, database);
    bootstrap(port, password, database);
    psql(port, password, database, `INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade) VALUES ('00000000-0000-0000-0000-000000000301', 2099, 'P99M3T02', 'active', 75, 'AB');
      INSERT INTO public.users (id, employee_code, name, role, gender) VALUES ('00000000-0000-0000-0000-000000000401', 'P99M3T02-ACTOR', 'Criteria Actor', 'Employee', 'Other');`);

    const initial = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    assert.equal(initial.version, 1);
    assert.equal(initial.groups.length, 2);
    const versionOne = initial.version_id;
    cases.push('initial-version-created');

    const legacy = seedEvaluation(port, password, database, '411', 1, 'Draft', versionOne);
    assert.equal(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${legacy.roundId}';`).out, versionOne);
    cases.push('legacy-evaluation-pins-version');

    const rpc = seedEvaluation(port, password, database, '412', 1, 'Draft', versionOne);
    const rpcResult = psql(port, password, database, `SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
      '${rpc.evaluationId}', 1, '${rpc.actorId}', '{}'::jsonb, '{}'::jsonb, 'rpc', 80, 'A', true,
      '2099-01-01T00:00:00Z'::timestamptz, NULL, NULL, NULL, NULL, true, '${versionOne}'::uuid
    ) result;`).out;
    assert.ok(rpcResult.includes(rpc.evaluationId));
    assert.equal(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${rpc.roundId}';`).out, versionOne);
    assert.match(psql(port, password, database, `SELECT grade_config_version_id FROM public.evaluation_rounds WHERE id='${rpc.roundId}';`).out, /^[0-9a-f-]{36}$/);
    cases.push('rpc-pins-criteria-and-grade-version');

    const changed = structuredClone(initial);
    changed.groups[0].name = 'Quality v2';
    changed.groups[0].criteria[0].name = 'Result quality v2';
    const saved = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(changed)}$json$::jsonb, 1);`).out);
    assert.equal(saved.version, 2);
    const versionTwo = saved.version_id;
    assert.notEqual(versionTwo, versionOne);
    cases.push('new-version-and-current-selection');

    const stale = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(changed)}$json$::jsonb, 1);`, false);
    assert.notEqual(stale.status, 0);
    assert.match(stale.err, /P99M3T02_CONFIG_STALE/);
    assert.equal(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out, '2');
    cases.push('expected-version-stale-write-rejected');

    const emptyLevels = structuredClone(changed);
    emptyLevels.groups[0].criteria[0].levels = [];
    const emptyLevelsResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(emptyLevels)}$json$::jsonb, 2);`, false);
    assert.notEqual(emptyLevelsResult.status, 0);
    assert.match(emptyLevelsResult.err, /P99M3T02_INVALID_CONFIG/);
    assert.equal(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out, '2');
    cases.push('empty-levels-rejected-without-partial-write');

    const invalidLevel = structuredClone(changed);
    invalidLevel.groups[0].criteria[0].levels[0].points = -1000001;
    const invalidLevelResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(invalidLevel)}$json$::jsonb, 2);`, false);
    assert.notEqual(invalidLevelResult.status, 0);
    assert.match(invalidLevelResult.err, /P99M3T02_INVALID_CONFIG/);
    assert.equal(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out, '2');
    cases.push('invalid-level-value-rejected-without-partial-write');

    const invalidIndex = structuredClone(changed);
    invalidIndex.groups[0].criteria[0].default_level_index = 2;
    const invalidIndexResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(invalidIndex)}$json$::jsonb, 2);`, false);
    assert.notEqual(invalidIndexResult.status, 0);
    assert.match(invalidIndexResult.err, /P99M3T02_INVALID_CONFIG/);
    assert.equal(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out, '2');
    cases.push('invalid-default-index-rejected-without-partial-write');

    psql(port, password, database, 'UPDATE public.criteria_config_versions SET is_active=false;');
    const corruptStateResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(changed)}$json$::jsonb, 2);`, false);
    assert.notEqual(corruptStateResult.status, 0);
    assert.match(corruptStateResult.err, /P99M3T02_CONFIG_UNAVAILABLE/);
    assert.equal(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out, '2');
    psql(port, password, database, "UPDATE public.criteria_config_versions SET is_active=true WHERE version_no=2;");
    cases.push('missing-active-version-fails-closed-without-partial-write');

    assert.equal(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${rpc.roundId}';`).out, versionOne);
    assert.equal(psql(port, password, database, `SELECT c.name FROM public.criterion_versions c WHERE c.version_id='${versionOne}' AND c.criterion_id='00000000-0000-0000-0000-000000000211';`).out, 'Result quality');
    assert.equal(psql(port, password, database, `SELECT c.name FROM public.criterion_versions c WHERE c.version_id='${versionTwo}' AND c.criterion_id='00000000-0000-0000-0000-000000000211';`).out, 'Result quality v2');
    cases.push('historical-snapshot-immutable-after-new-version');

    const newLegacy = seedEvaluation(port, password, database, '413', 1, 'Draft', versionTwo);
    psql(port, password, database, `UPDATE public.evaluation_rounds SET status='Submitted', submitted_at=now() WHERE id='${newLegacy.roundId}';`);
    assert.equal(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${newLegacy.roundId}';`).out, versionTwo);
    cases.push('legacy-submit-retains-current-version');

    const staleRpc = seedEvaluation(port, password, database, '414', 1, 'Draft', versionOne);
    const staleRpcResult = psql(port, password, database, `SELECT * FROM public.save_evaluation_round_transaction_active_only(
      '${staleRpc.evaluationId}', 1, '${staleRpc.actorId}', '{}'::jsonb, '{}'::jsonb, 'stale', 80, 'A', true,
      '2099-01-02T00:00:00Z'::timestamptz, NULL, NULL, NULL, NULL, true, '${versionOne}'::uuid
    );`, false);
    assert.notEqual(staleRpcResult.status, 0);
    assert.match(staleRpcResult.err, /P99M3T02_CONFIG_STALE/);
    assert.equal(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${staleRpc.roundId}';`).out, 'Draft');
    cases.push('rpc-stale-version-fails-closed');

    const concurrentConfig = structuredClone(saved);
    concurrentConfig.groups[1].name = 'Teamwork concurrent';
    const concurrentPayload = JSON.stringify(concurrentConfig);
    const concurrent = await Promise.all([
      asyncPsql(port, password, database, `SELECT public.save_criteria_config($json$${concurrentPayload}$json$::jsonb, 2);`),
      asyncPsql(port, password, database, `SELECT public.save_criteria_config($json$${concurrentPayload}$json$::jsonb, 2);`),
    ]);
    assert.equal(concurrent.filter((result) => result.status === 0).length, 1);
    assert.equal(concurrent.filter((result) => result.status !== 0 && /P99M3T02_CONFIG_STALE/.test(result.err)).length, 1);
    assert.equal(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out, '3');
    cases.push('concurrent-writers-one-commit-one-stale');

    const unapprovedRollback = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', rollback], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(unapprovedRollback.status, 0);
    assert.equal(psql(port, password, database, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='criteria_config_versions';").out, '1');
    cases.push('rollback-without-approval-rejected');

    const rollbackPort = start(rollbackName, rollbackPassword, database);
    bootstrap(rollbackPort, rollbackPassword, database);
    const rollbackResult = command('psql', ['--host', '127.0.0.1', '--port', rollbackPort, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', "SET kurabe.p99m3t02_rollback_approved='true';", '--file', rollback], { env: { ...process.env, PGPASSWORD: rollbackPassword } });
    if (rollbackResult.status !== 0) throw new Error(`rollback failed: ${String(rollbackResult.stderr || '').trim()}`);
    assert.equal(psql(rollbackPort, rollbackPassword, database, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='criteria_config_versions';").out, '0');
    assert.equal(psql(rollbackPort, rollbackPassword, database, 'SELECT count(*) FROM public.criteria_groups;').out, '2');
    assert.equal(psql(rollbackPort, rollbackPassword, database, 'SELECT count(*) FROM public.criteria;').out, '2');
    cases.push('approved-rollback-removes-versioned-layer-preserves-baseline');

    return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', cases, target: 'disposable-postgresql-17' };
  } finally {
    command('docker', ['rm', '--force', name]);
    command('docker', ['rm', '--force', rollbackName]);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`CRITERIA_CONFIG PASS cases=${result.cases.length} target=${result.target}`);
  } catch (error) {
    console.error(`CRITERIA_CONFIG FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
