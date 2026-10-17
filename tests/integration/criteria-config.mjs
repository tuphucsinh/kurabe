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
const p108Migration = path.join(projectRoot, 'supabase/migrations/20261017093100_p108_criteria_sets.sql');
const p108Rollback = path.join(projectRoot, 'db/rollback-p108-criteria-sets.sql');

export function redact(text) {
  return String(text || '')
    .replace(/(\b(?:POSTGRES_PASSWORD|PGPASSWORD|password|secret|key)\b\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,"';]+)/gi, '$1[redacted]');
}

function command(file, args, options = {}) {
  const timeoutMs = options.timeout ?? 30000;
  const stdio = [options.input ? 'pipe' : 'ignore', 'pipe', 'pipe'];
  const result = spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', timeout: timeoutMs, ...options, stdio });
  result.out = String(result.stdout || '').trim();
  result.err = redact(String(result.stderr || '').trim());
  return result;
}

function must(file, args, options = {}) {
  const result = command(file, args, options);
  if (result.status !== 0) throw new Error(`${file} failed (${result.status}): ${redact(String(result.stderr || '').trim())}`);
  return String(result.stdout || '').trim();
}

function cleanupContainer(containerId) {
  if (!containerId) return;
  const rmResult = command('docker', ['rm', '--force', '--volumes', containerId]);
  if (rmResult.status !== 0) {
    throw new Error(`docker rm failed (${rmResult.status}) for ${containerId}: ${rmResult.err}`);
  }
  const psResult = command('docker', ['ps', '-a', '--filter', `id=${containerId}`, '--format', '{{.ID}}']);
  if (psResult.status !== 0) {
    throw new Error(`docker ps check failed (${psResult.status}) for ${containerId}: ${psResult.err}`);
  }
  const remaining = String(psResult.stdout || psResult.out || '').trim();
  if (remaining !== '') {
    throw new Error(`container ${containerId} still exists after teardown: ${remaining}`);
  }
}

async function start(name, password, database, onCreated) {
  const id = must('docker', [
    'run', '--detach', '--rm', '--name', name,
    '--env', `POSTGRES_PASSWORD=${password}`,
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust',
    '--env', `POSTGRES_DB=${database}`,
    '--publish', '127.0.0.1::5432',
    'postgres:17-alpine',
  ]);
  assert.ok(id.length > 10);
  if (typeof onCreated === 'function') {
    onCreated(id);
  }
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const result = command('docker', ['exec', name, 'pg_isready', '--username', 'postgres', '--dbname', database]);
    if (result.status === 0) { ready = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(ready, 'disposable PostgreSQL did not become ready');
  const port = must('docker', ['port', name, '5432/tcp']).match(/127\.0\.0\.1:(\d+)/)?.[1];
  assert.ok(port, 'could not determine loopback port');
  let connectionReady = false;
  for (let i = 0; i < 60; i += 1) {
    const readyConnection = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--command', 'SELECT 1;'], { env: { ...process.env, PGPASSWORD: password } });
    if (readyConnection.status === 0) { connectionReady = true; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(connectionReady, 'loopback PostgreSQL connection failed');
  return { port, id };
}

function psql(port, password, database, sql, expectPass = true) {
  const result = command('psql', [
    '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
    '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--command', sql,
  ], { env: { ...process.env, PGPASSWORD: password } });
  if (expectPass && result.status !== 0) throw new Error(`psql failed [${sql.slice(0, 100)}]: ${redact(String(result.stderr || '').trim())}`);
  return { out: String(result.stdout || '').trim(), err: redact(String(result.stderr || '').trim()), status: result.status };
}

function applyFile(port, password, database, file) {
  const result = command('psql', [
    '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
    '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', file,
  ], { env: { ...process.env, PGPASSWORD: password } });
  if (result.status !== 0) throw new Error(`psql ${path.basename(file)} failed: ${redact(String(result.stderr || '').trim())}`);
}

function bootstrap(port, password, database) {
  psql(port, password, database, `
    DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    ALTER ROLE service_role BYPASSRLS;
  `);
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
    COMMENT ON INDEX idx_evaluation_rounds_eval_round IS 'kurabe:p3:candidate:v1:index:idx_evaluation_rounds_eval_round';
  `);
  psql(port, password, database, `
    INSERT INTO public.grade_bands (role_group, grade, min_score, max_score, sort_order) VALUES
      ('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
      ('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
      ('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);
  `);
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
      ('00000000-0000-0000-0000-000000000212', 'employee');
  `);
  applyFile(port, password, database, gradeMigration);
  applyFile(port, password, database, migration);
}

const PSQL_COMMAND_TAG_REGEX = /^(?:SET|RESET|BEGIN|COMMIT|ROLLBACK|DO|LOCK TABLE|LISTEN|NOTIFY|SHOW|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|CREATE \w+|DROP \w+|ALTER \w+|TRUNCATE TABLE)$/i;

export function isCommandTag(line) {
  return PSQL_COMMAND_TAG_REGEX.test(String(line || '').trim());
}

export function extractScalar(raw) {
  const lines = String(raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isCommandTag(l));
  if (lines.length === 0) {
    throw new Error(`No scalar found in output: ${JSON.stringify(raw)}`);
  }
  if (lines.length > 1) {
    throw new Error(`Expected single scalar output, got ${lines.length} rows: ${JSON.stringify(lines)}`);
  }
  return lines[0];
}

export function jsonResult(raw) {
  const lines = String(raw ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isCommandTag(l));
  if (lines.length === 0) {
    throw new Error(`No JSON content found in output: ${JSON.stringify(raw)}`);
  }
  if (lines.length > 1) {
    throw new Error(`Expected single JSON result line, got ${lines.length} rows: ${JSON.stringify(lines)}`);
  }
  return JSON.parse(lines[0]);
}

function asyncPsql(port, password, database, sql, activeChildren = [], appName = 'p99_async') {
  return new Promise((resolve) => {
    const wrappedSql = `SET statement_timeout = '15s'; SET lock_timeout = '10s'; ${sql}`;
    const child = spawn('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--command', wrappedSql], {
      cwd: projectRoot,
      env: { ...process.env, PGPASSWORD: password, PGAPPNAME: appName },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeChildren.push(child);
    let out = '';
    let err = '';
    let exited = false;
    const timer = setTimeout(() => {
      if (!exited) {
        try { child.kill('SIGKILL'); } catch {}
      }
    }, 20000);
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', (e) => { err += `\n${e.message}`; });
    child.on('close', (status) => {
      exited = true;
      clearTimeout(timer);
      resolve({ out: out.trim(), err: redact(err.trim()), status });
    });
  });
}

const CRITERIA_FUNCTIONS = [
  'validate_criteria_config(jsonb)',
  'get_active_criteria_config()',
  'save_criteria_config(jsonb,bigint)',
];

function captureFunctionAcls(port, password, database) {
  const lines = [];
  for (const fn of CRITERIA_FUNCTIONS) {
    const proacl = psql(port, password, database, `SELECT COALESCE(p.proacl::text, 'DEFAULT') FROM pg_proc p WHERE p.oid = 'public.${fn}'::regprocedure;`).out;
    lines.push(`fn:${fn}:proacl=${proacl}`);
    for (const role of ['anon', 'authenticated', 'service_role', 'postgres']) {
      const hasPriv = psql(port, password, database, `SELECT has_function_privilege('${role}', 'public.${fn}', 'EXECUTE');`).out;
      lines.push(`fn:${fn}:${role}=${hasPriv}`);
    }
  }
  return lines.sort().join('\n');
}

function captureTableAclsJson(port, password, database) {
  const sql = `
    SELECT COALESCE(json_agg(json_build_object(
      'table_name', table_name,
      'privilege_type', privilege_type,
      'grantee', grantee
    ) ORDER BY table_name, grantee, privilege_type), '[]'::json)
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN (
        'criteria', 'criteria_groups', 'criterion_audiences', 'criterion_levels',
        'criteria_config_versions', 'criteria_group_versions', 'criterion_versions',
        'criterion_level_versions', 'criterion_audience_versions'
      )
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC');
  `;
  return psql(port, password, database, sql).out;
}

function criteriaConfigDigest(port, password, database) {
  const tables = [
    'criteria', 'criteria_groups', 'criterion_audiences', 'criterion_levels',
    'criteria_config_versions', 'criteria_group_versions', 'criterion_versions',
    'criterion_level_versions', 'criterion_audience_versions'
  ];
  const parts = [];
  for (const tbl of tables) {
    const rows = psql(port, password, database, `
      SELECT COALESCE(string_agg(row_data, E'\\n' ORDER BY row_data), '') FROM (
        SELECT md5(t::text) AS row_data FROM public.${tbl} t
      ) s;
    `).out;
    parts.push(`tbl:${tbl}=${rows}`);
  }
  for (const fn of CRITERIA_FUNCTIONS) {
    const fnDef = psql(port, password, database, `
      SELECT md5(pg_get_functiondef(p.oid)) || '|' || COALESCE(obj_description(p.oid, 'pg_proc'), 'none')
      FROM pg_proc p WHERE p.oid = 'public.${fn}'::regprocedure;
    `).out;
    parts.push(`fn:${fn}=${fnDef}`);
  }
  parts.push(captureFunctionAcls(port, password, database));
  parts.push(captureTableAclsJson(port, password, database));
  return crypto.createHash('sha256').update(parts.join('\n')).digest('hex');
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
    VALUES ('${uuidFor(2)}', '${evaluationId}', ${round}, '${actorId}', 'Employee', 'NotStarted', ${criteriaVersion ? `'${criteriaVersion}'` : 'NULL'});
  `);
  if (status !== 'NotStarted') {
    psql(port, password, database, `
      UPDATE public.evaluation_rounds SET status = '${status}' WHERE id = '${uuidFor(2)}';
    `);
  }
  return { evaluationId, roundId: uuidFor(2), actorId };
}

export async function run() {
  const name = `kurabe-p99m3t02-${process.pid}`;
  const rollbackName = `kurabe-p99m3t02-rb-${process.pid}`;
  const password = crypto.randomBytes(24).toString('base64url');
  const rollbackPassword = crypto.randomBytes(24).toString('base64url');
  const database = 'kurabe_harness_p99m3t02';
  const cases = [];
  const activeChildren = [];
  let mainContainerId = null;
  let rollbackContainerId = null;
  let primaryError = null;

  try {
    const started = await start(name, password, database, (id) => { mainContainerId = id; });
    mainContainerId = started.id;
    const port = started.port;

    bootstrap(port, password, database);
    psql(port, password, database, `
      INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade) VALUES ('00000000-0000-0000-0000-000000000301', 2099, 'P99M3T02', 'active', 75, 'AB');
      INSERT INTO public.users (id, employee_code, name, role, gender) VALUES ('00000000-0000-0000-0000-000000000401', 'P99M3T02-ACTOR', 'Criteria Actor', 'Employee', 'Other');
    `);

    const initial = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    assert.equal(initial.version, 1);
    assert.equal(initial.groups.length, 2);
    const versionOne = initial.version_id;
    cases.push('initial-version-created');

    const legacy = seedEvaluation(port, password, database, '411', 1, 'Draft', versionOne);
    assert.equal(extractScalar(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${legacy.roundId}';`).out), versionOne);
    cases.push('legacy-evaluation-pins-version');

    const rpc = seedEvaluation(port, password, database, '412', 1, 'Draft', versionOne);
    const rpcResult = psql(port, password, database, `SELECT row_to_json(result) FROM public.save_evaluation_round_transaction_active_only(
      '${rpc.evaluationId}', 1, '${rpc.actorId}', '{}'::jsonb, '{}'::jsonb, 'rpc', 80, 'A', true,
      '2099-01-01T00:00:00Z'::timestamptz, NULL, NULL, NULL, NULL, true, '${versionOne}'::uuid
    ) result;`).out;
    assert.ok(rpcResult.includes(rpc.evaluationId));
    assert.equal(extractScalar(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${rpc.roundId}';`).out), versionOne);
    assert.match(extractScalar(psql(port, password, database, `SELECT grade_config_version_id FROM public.evaluation_rounds WHERE id='${rpc.roundId}';`).out), /^[0-9a-f-]{36}$/);
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
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '2');
    cases.push('expected-version-stale-write-rejected');

    const emptyLevels = structuredClone(changed);
    emptyLevels.groups[0].criteria[0].levels = [];
    const emptyLevelsResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(emptyLevels)}$json$::jsonb, 2);`, false);
    assert.notEqual(emptyLevelsResult.status, 0);
    assert.match(emptyLevelsResult.err, /P99M3T02_INVALID_CONFIG/);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '2');
    cases.push('empty-levels-rejected-without-partial-write');

    const invalidLevel = structuredClone(changed);
    invalidLevel.groups[0].criteria[0].levels[0].points = -1000001;
    const invalidLevelResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(invalidLevel)}$json$::jsonb, 2);`, false);
    assert.notEqual(invalidLevelResult.status, 0);
    assert.match(invalidLevelResult.err, /P99M3T02_INVALID_CONFIG/);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '2');
    cases.push('invalid-level-value-rejected-without-partial-write');

    const invalidIndex = structuredClone(changed);
    invalidIndex.groups[0].criteria[0].default_level_index = 2;
    const invalidIndexResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(invalidIndex)}$json$::jsonb, 2);`, false);
    assert.notEqual(invalidIndexResult.status, 0);
    assert.match(invalidIndexResult.err, /P99M3T02_INVALID_CONFIG/);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '2');
    cases.push('invalid-default-index-rejected-without-partial-write');

    psql(port, password, database, 'UPDATE public.criteria_config_versions SET is_active=false;');
    const corruptStateResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(changed)}$json$::jsonb, 2);`, false);
    assert.notEqual(corruptStateResult.status, 0);
    assert.match(corruptStateResult.err, /P99M3T02_CONFIG_UNAVAILABLE/);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '2');
    psql(port, password, database, 'UPDATE public.criteria_config_versions SET is_active=true WHERE version_no=2;');
    cases.push('missing-active-version-fails-closed-without-partial-write');

    assert.equal(extractScalar(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${rpc.roundId}';`).out), versionOne);
    assert.equal(extractScalar(psql(port, password, database, `SELECT c.name FROM public.criterion_versions c WHERE c.version_id='${versionOne}' AND c.criterion_id='00000000-0000-0000-0000-000000000211';`).out), 'Result quality');
    assert.equal(extractScalar(psql(port, password, database, `SELECT c.name FROM public.criterion_versions c WHERE c.version_id='${versionTwo}' AND c.criterion_id='00000000-0000-0000-0000-000000000211';`).out), 'Result quality v2');
    cases.push('historical-snapshot-immutable-after-new-version');

    const newLegacy = seedEvaluation(port, password, database, '413', 1, 'Draft', versionTwo);
    psql(port, password, database, `UPDATE public.evaluation_rounds SET status='Submitted', submitted_at=now() WHERE id='${newLegacy.roundId}';`);
    assert.equal(extractScalar(psql(port, password, database, `SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE id='${newLegacy.roundId}';`).out), versionTwo);
    cases.push('legacy-submit-retains-current-version');

    const staleRpc = seedEvaluation(port, password, database, '414', 1, 'Draft', versionOne);
    const staleRpcResult = psql(port, password, database, `SELECT * FROM public.save_evaluation_round_transaction_active_only(
      '${staleRpc.evaluationId}', 1, '${staleRpc.actorId}', '{}'::jsonb, '{}'::jsonb, 'stale', 80, 'A', true,
      '2099-01-02T00:00:00Z'::timestamptz, NULL, NULL, NULL, NULL, true, '${versionOne}'::uuid
    );`, false);
    assert.notEqual(staleRpcResult.status, 0);
    assert.match(staleRpcResult.err, /P99M3T02_CONFIG_STALE/);
    assert.equal(extractScalar(psql(port, password, database, `SELECT status FROM public.evaluation_rounds WHERE id='${staleRpc.roundId}';`).out), 'Draft');
    cases.push('rpc-stale-version-fails-closed');

    const concurrentConfig = structuredClone(saved);
    concurrentConfig.groups[1].name = 'Teamwork concurrent';
    const concurrentPayload = JSON.stringify(concurrentConfig);
    const concurrent = await Promise.all([
      asyncPsql(port, password, database, `SELECT public.save_criteria_config($json$${concurrentPayload}$json$::jsonb, 2);`, activeChildren, 'p99_concurrent_1'),
      asyncPsql(port, password, database, `SELECT public.save_criteria_config($json$${concurrentPayload}$json$::jsonb, 2);`, activeChildren, 'p99_concurrent_2'),
    ]);
    assert.equal(concurrent.filter((result) => result.status === 0).length, 1);
    assert.equal(concurrent.filter((result) => result.status !== 0 && /P99M3T02_CONFIG_STALE/.test(result.err)).length, 1);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '3');

    // ========================================================
    // P108 Criteria Sets Contract Lane (P99 compatibility baseline)
    // ========================================================
    const p99FnAclBefore = captureFunctionAcls(port, password, database);
    const p99TableAclBefore = captureTableAclsJson(port, password, database);

    applyFile(port, password, database, p108Migration);
    cases.push('p108-migration-applied');

    // Prove RPC ACL parity in P99 baseline lane
    const p99FnAclAfter = captureFunctionAcls(port, password, database);
    assert.equal(p99FnAclAfter, p99FnAclBefore, 'RPC EXECUTE ACL parity must be preserved in P99 lane');
    cases.push('p108-rpc-acl-parity-preserved-in-p99-lane');

    // Close the legacy active evaluation period from P99 lane before testing missing set_key rejection
    psql(port, password, database, "UPDATE public.evaluation_periods SET status = 'closed' WHERE id = '00000000-0000-0000-0000-000000000301';");

    // 1. Prove legacy payload without set_key is rejected under P108
    const legacyWithoutSetKey = structuredClone(saved);
    legacyWithoutSetKey.groups[0].name = 'Legacy Without Set Key';
    const legacySaveResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(legacyWithoutSetKey)}$json$::jsonb, 3);`, false);
    assert.notEqual(legacySaveResult.status, 0);
    assert.match(legacySaveResult.err, /P99M3T02_INVALID_CONFIG/);
    cases.push('p108-legacy-payload-without-set-key-rejected');

    // 2. Define NEW synthetic deterministic UUIDs for P108 (preserving legacy UUID history)
    const p108StaffG1Id = '00000000-0000-0000-0000-000000000601';
    const p108StaffC1Id = '00000000-0000-0000-0000-000000000611';
    const p108StaffL11Id = '00000000-0000-0000-0000-000000000621';
    const p108StaffL12Id = '00000000-0000-0000-0000-000000000622';

    const p108StaffG2Id = '00000000-0000-0000-0000-000000000602';
    const p108StaffC2Id = '00000000-0000-0000-0000-000000000612';
    const p108StaffL21Id = '00000000-0000-0000-0000-000000000623';
    const p108StaffL22Id = '00000000-0000-0000-0000-000000000624';

    const validP108Payload = {
      groups: [
        {
          id: p108StaffG1Id,
          set_key: 'staff',
          code: 'quality',
          name: 'Quality Staff',
          short_name: 'Q',
          sort_order: 0,
          criteria: [
            {
              id: p108StaffC1Id,
              set_key: 'staff',
              code: 'quality-result',
              name: 'Result quality',
              description: 'Quality of output',
              default_level_index: 0,
              sort_order: 0,
              levels: [
                { id: p108StaffL11Id, points: 5, label: 'Excellent', description: 'Excellent', sort_order: 0 },
                { id: p108StaffL12Id, points: 3, label: 'Good', description: 'Good', sort_order: 1 },
              ],
            },
          ],
        },
        {
          id: p108StaffG2Id,
          set_key: 'staff',
          code: 'teamwork',
          name: 'Teamwork Staff',
          short_name: 'T',
          sort_order: 1,
          criteria: [
            {
              id: p108StaffC2Id,
              set_key: 'staff',
              code: 'team-cooperation',
              name: 'Cooperation',
              description: 'Works with team',
              default_level_index: 0,
              sort_order: 0,
              levels: [
                { id: p108StaffL21Id, points: 5, label: 'Excellent', description: 'Excellent', sort_order: 0 },
                { id: p108StaffL22Id, points: 3, label: 'Good', description: 'Good', sort_order: 1 },
              ],
            },
          ],
        },
      ],
    };

    // Separately activate a valid fixture period to prove Active lock denial under P108
    const activeLockPeriodId = '00000000-0000-0000-0000-000000000302';
    psql(port, password, database, `
      INSERT INTO public.evaluation_periods (id, year, name, status, target_rate, target_grade)
      VALUES ('${activeLockPeriodId}', 2100, 'P108-ACTIVE-LOCK', 'active', 80, 'A');
    `);

    const activeSave = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(validP108Payload)}$json$::jsonb, 3);`, false);
    assert.notEqual(activeSave.status, 0);
    assert.match(activeSave.err, /P108_PERIOD_ACTIVE/);
    cases.push('p108-active-period-rejects-save');

    // 3. Close the active evaluation period before successful save
    psql(port, password, database, `UPDATE public.evaluation_periods SET status = 'closed' WHERE id = '${activeLockPeriodId}';`);

    // 4. Save succeeds on closed period and writes counts
    const p108Saved = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(validP108Payload)}$json$::jsonb, 3);`).out);
    assert.equal(p108Saved.version, 4);
    assert.equal(p108Saved.group_count, 2);
    assert.equal(p108Saved.criterion_count, 2);
    assert.equal(p108Saved.level_count, 4);
    assert.equal(p108Saved.audience_count, 2);
    assert.equal(p108Saved.groups[0].set_key, 'staff');
    cases.push('p108-valid-save-writes-version-counts');

    // 5. Canonical checksum no-op: unchanged save creates no version
    const noopSave = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(validP108Payload)}$json$::jsonb, 4);`).out);
    assert.equal(noopSave.version, 4);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '4');
    cases.push('p108-unchanged-save-noop');

    // 6. Stale version rejected under P108
    const staleP108 = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(validP108Payload)}$json$::jsonb, 3);`, false);
    assert.notEqual(staleP108.status, 0);
    assert.match(staleP108.err, /P99M3T02_CONFIG_STALE/);
    cases.push('p108-stale-version-rejected');

    // 7. Cross-set group link rejected
    const crossSetPayload = structuredClone(validP108Payload);
    crossSetPayload.groups[0].criteria[0].set_key = 'leader';
    const crossSetResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(crossSetPayload)}$json$::jsonb, 4);`, false);
    assert.notEqual(crossSetResult.status, 0);
    assert.match(crossSetResult.err, /P99M3T02_INVALID_CONFIG/);
    cases.push('p108-cross-set-group-link-rejected');

    // 8. Set immutability per UUID rejected
    const immutableSetPayload = structuredClone(validP108Payload);
    immutableSetPayload.groups[0].set_key = 'leader';
    immutableSetPayload.groups[0].criteria[0].set_key = 'leader';
    const immutableResult = psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(immutableSetPayload)}$json$::jsonb, 4);`, false);
    assert.notEqual(immutableResult.status, 0);
    assert.match(immutableResult.err, /P108_SET_IMMUTABLE/);
    cases.push('p108-set-immutability-per-uuid-rejected');

    // 9. Empty groups allowed under P108
    const emptyGroupPayload = structuredClone(validP108Payload);
    emptyGroupPayload.groups.push({
      id: '00000000-0000-0000-0000-000000000603',
      set_key: 'leader',
      code: 'leadership',
      name: 'Leadership Group',
      sort_order: 2,
      criteria: [],
    });
    const emptyGroupSave = jsonResult(psql(port, password, database, `SELECT public.save_criteria_config($json$${JSON.stringify(emptyGroupPayload)}$json$::jsonb, 4);`).out);
    assert.equal(emptyGroupSave.version, 5);
    assert.equal(emptyGroupSave.group_count, 3);
    assert.equal(emptyGroupSave.criterion_count, 2);
    cases.push('p108-empty-group-allowed');

    // 10. Concurrency under P108: one commits, one stale
    const concurrentP108Payload = structuredClone(emptyGroupPayload);
    concurrentP108Payload.groups[0].name = 'Quality Staff Concurrent';
    const concurrentP108Json = JSON.stringify(concurrentP108Payload);
    const concurrentP108 = await Promise.all([
      asyncPsql(port, password, database, `SELECT public.save_criteria_config($json$${concurrentP108Json}$json$::jsonb, 5);`, activeChildren, 'p108_concurrent_1'),
      asyncPsql(port, password, database, `SELECT public.save_criteria_config($json$${concurrentP108Json}$json$::jsonb, 5);`, activeChildren, 'p108_concurrent_2'),
    ]);
    assert.equal(concurrentP108.filter((r) => r.status === 0).length, 1);
    assert.equal(concurrentP108.filter((r) => r.status !== 0 && /P99M3T02_CONFIG_STALE/.test(r.err)).length, 1);
    assert.equal(extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out), '6');
    cases.push('p108-concurrent-writers-one-commit-one-stale');

    // 11. Direct write ACL closure verification across app roles
    const serviceRoleInsert = psql(port, password, database, "SET ROLE service_role; INSERT INTO public.criteria (code, name, set_key) VALUES ('hack', 'hack', 'staff'); RESET ROLE;", false);
    assert.notEqual(serviceRoleInsert.status, 0);
    assert.match(serviceRoleInsert.err, /permission denied/i);

    const authTruncate = psql(port, password, database, "SET ROLE authenticated; TRUNCATE public.criteria; RESET ROLE;", false);
    assert.notEqual(authTruncate.status, 0);
    assert.match(authTruncate.err, /permission denied/i);
    cases.push('p108-direct-dml-denied-for-service-role-and-authenticated');

    // 12. P108 Rollback tests:
    // (a) unapproved rollback rejected
    const unapprovedP108Rollback = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', p108Rollback], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(unapprovedP108Rollback.status, 0);
    assert.match(redact(unapprovedP108Rollback.stderr), /P108_ROLLBACK_UNAPPROVED/);
    cases.push('p108-unapproved-rollback-rejected');

    // (b) revert-import (a) restores previous version pointer with explicit expected version
    const revertImportResult = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', "SET kurabe.p108_rollback_approved = 'true'; SET kurabe.p108_rollback_action = 'revert-import'; SET kurabe.p108_expected_import_version_no = 6; SET kurabe.p108_expected_previous_version_no = 5;",
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.equal(revertImportResult.status, 0, `revert-import failed: ${redact(revertImportResult.stderr)}`);
    const activeVersionAfterRevert = jsonResult(psql(port, password, database, 'SELECT public.get_active_criteria_config();').out);
    assert.equal(activeVersionAfterRevert.version, 5);
    cases.push('p108-revert-import-reactivates-previous-version');

    // (c) schema rollback (b) after import is refused with zero mutation (proven via complete digest)
    const digestBeforeRefused = criteriaConfigDigest(port, password, database);
    const countBeforeRefused = extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out);
    const schemaRollbackRefused = command('psql', [
      '--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database,
      '--no-psqlrc', '--set', 'ON_ERROR_STOP=1',
      '--command', `SET kurabe.p108_rollback_approved = 'true'; SET kurabe.p108_rollback_action = 'schema-rollback'; SET kurabe.p108_pre_migration_acl = '${p99TableAclBefore}';`,
      '--file', p108Rollback,
    ], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(schemaRollbackRefused.status, 0);
    assert.match(redact(schemaRollbackRefused.stderr), /P108_SCHEMA_ROLLBACK_REFUSED/);
    const countAfterRefused = extractScalar(psql(port, password, database, 'SELECT count(*) FROM public.criteria_config_versions;').out);
    assert.equal(countBeforeRefused, countAfterRefused, 'zero version count change on refused schema rollback');
    const digestAfterRefused = criteriaConfigDigest(port, password, database);
    assert.equal(digestBeforeRefused, digestAfterRefused, 'zero mutation verified via complete digest on refused schema rollback');
    cases.push('p108-schema-rollback-refused-after-import-with-zero-mutation');

    // 13. P99 Rollback verification
    const unapprovedRollback = command('psql', ['--host', '127.0.0.1', '--port', port, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--file', rollback], { env: { ...process.env, PGPASSWORD: password } });
    assert.notEqual(unapprovedRollback.status, 0);
    assert.equal(extractScalar(psql(port, password, database, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='criteria_config_versions';").out), '1');
    cases.push('rollback-without-approval-rejected');

    const rollbackStarted = await start(rollbackName, rollbackPassword, database, (id) => { rollbackContainerId = id; });
    rollbackContainerId = rollbackStarted.id;
    const rollbackPort = rollbackStarted.port;

    bootstrap(rollbackPort, rollbackPassword, database);
    const rollbackResult = command('psql', ['--host', '127.0.0.1', '--port', rollbackPort, '--username', 'postgres', '--dbname', database, '--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--command', "SET kurabe.p99m3t02_rollback_approved='true';", '--file', rollback], { env: { ...process.env, PGPASSWORD: rollbackPassword } });
    if (rollbackResult.status !== 0) throw new Error(`rollback failed: ${redact(String(rollbackResult.stderr || '').trim())}`);
    assert.equal(extractScalar(psql(rollbackPort, rollbackPassword, database, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='criteria_config_versions';").out), '0');
    assert.equal(extractScalar(psql(rollbackPort, rollbackPassword, database, 'SELECT count(*) FROM public.criteria_groups;').out), '2');
    assert.equal(extractScalar(psql(rollbackPort, rollbackPassword, database, 'SELECT count(*) FROM public.criteria;').out), '2');
    cases.push('approved-rollback-removes-versioned-layer-preserves-baseline');

    return { real: true, passed: true, tier: 'real-DB', status: 'EXECUTED', cases, target: 'disposable-postgresql-17' };
  } catch (err) {
    primaryError = err;
    throw err;
  } finally {
    for (const ch of activeChildren) {
      try {
        if (!ch.killed) ch.kill('SIGKILL');
      } catch {}
    }
    const cleanupErrors = [];
    try {
      cleanupContainer(mainContainerId);
    } catch (cleanupErr) {
      cleanupErrors.push(cleanupErr);
    }
    try {
      cleanupContainer(rollbackContainerId);
    } catch (cleanupErr) {
      cleanupErrors.push(cleanupErr);
    }

    if (cleanupErrors.length > 0) {
      for (const err of cleanupErrors) {
        console.error(`Container cleanup failed${primaryError ? ' after primary error' : ''}: ${err.message || err}`);
      }
      if (primaryError) {
        try {
          primaryError.cleanupErrors = cleanupErrors;
        } catch {}
      } else {
        if (cleanupErrors.length === 1) {
          throw cleanupErrors[0];
        }
        throw new AggregateError(cleanupErrors, `Container cleanup failed: ${cleanupErrors.map((e) => e.message || e).join('; ')}`);
      }
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`CRITERIA_CONFIG PASS cases=${result.cases.length} target=${result.target}`);
  } catch (error) {
    console.error(`CRITERIA_CONFIG FAIL ${redact(error?.message || error)}`);
    process.exitCode = 1;
  }
}
