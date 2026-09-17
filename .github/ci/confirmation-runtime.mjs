#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { runBootstrap } from '../../scripts/db-bootstrap.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const statePath = path.join(process.env.KURABE_CI_RUNTIME_ROOT || path.join(os.tmpdir(), 'kurabe-ci-runtime'), 'runtime-state.json');
const runtimeRoot = path.dirname(statePath);
const safeError = (error) => String(error?.stderr || error?.message || error)
  .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
  .replace(/(password|secret|token|key)(?:\s*[:=]\s*|\s+)[^\s,;]+/gi, '$1=[REDACTED]')
  .replace(/[A-Za-z0-9_-]{64,}/g, '[REDACTED_LONG_VALUE]');
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options }).trim();
const sleep = (seconds) => execFileSync('sleep', [String(seconds)]);
const readState = () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
const writeState = (state) => fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function assertPortFree(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise((resolve) => server.close(resolve));
}

function token(role, secret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'kurabe-ci', iat: now, exp: now + 7200 })}`;
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
}

function waitFor(command, args, label, attempts = 90) {
  for (let i = 0; i < attempts; i += 1) {
    try { run(command, args); return; } catch (error) {
      if (i === attempts - 1) throw new Error(`${label}: ${safeError(error)}`);
      sleep(1);
    }
  }
}

function startNext(state) {
  const nextLog = fs.openSync(path.join(runtimeRoot, 'next.log'), 'a');
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: state.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: state.anonKey,
    SUPABASE_URL: state.supabaseUrl,
    SUPABASE_ANON_KEY: state.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: state.serviceRoleKey,
    KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC: 'true',
    NODE_ENV: 'development',
  };
  const next = spawn(path.join(projectRoot, 'node_modules/.bin/next'), ['dev', '--hostname', '127.0.0.1', '--port', String(state.nextPort)], {
    cwd: projectRoot,
    env,
    stdio: ['ignore', nextLog, nextLog],
    detached: true,
  });
  next.unref();
  state.nextPid = next.pid;
}

function startProxy(state) {
  const proxyLog = fs.openSync(path.join(runtimeRoot, 'rest-proxy.log'), 'a');
  const proxy = spawn(process.execPath, [fileURLToPath(import.meta.url), 'proxy'], {
    cwd: projectRoot,
    env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
    stdio: ['ignore', proxyLog, proxyLog],
    detached: true,
  });
  proxy.unref();
  state.proxyPid = proxy.pid;
}

async function start() {
  if (fs.existsSync(statePath)) throw new Error(`RUNTIME_STATE_EXISTS path=${statePath}`);
  fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  const sha = run('git', ['rev-parse', 'HEAD'], { cwd: projectRoot });
  if (process.env.KURABE_CI_EXPECTED_SHA && sha !== process.env.KURABE_CI_EXPECTED_SHA) throw new Error(`CANDIDATE_SHA_CHANGED ${sha}`);
  const suffix = `${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  const state = {
    root: runtimeRoot,
    repo: projectRoot,
    sha,
    name: `kurabe-ci-${suffix}`,
    db: `kurabe_harness_ci_${suffix.replaceAll('_', '')}`,
    password: crypto.randomBytes(24).toString('hex'),
    fixturePassword: `KurabeCI-${crypto.randomBytes(18).toString('hex')}`,
    fixtureRunId: crypto.randomUUID(),
    jwtSecret: crypto.randomBytes(36).toString('hex'),
    dbPort: 5432,
    backendRestPort: await freePort(),
    restPort: await freePort(),
    nextPort: await freePort(),
  };
  state.anonKey = token('anon', state.jwtSecret);
  state.serviceRoleKey = token('service_role', state.jwtSecret);
  state.supabaseUrl = `http://127.0.0.1:${state.restPort}`;
  state.networkId = state.name;
  await assertPortFree(state.dbPort);
  writeState(state);
  try {
    run('docker', ['network', 'create', '--label', `kurabe.confirm=${state.name}`, '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', state.networkId]);
    run('docker', [
      'run', '-d', '--name', `${state.name}-db`, '--network', state.networkId, '--network-alias', 'db', '--restart=no',
      '--label', `kurabe.confirm=${state.name}`, '--memory', '512m', '--cpus', '1', '--tmpfs', '/var/lib/postgresql/data:rw',
      '-e', `POSTGRES_PASSWORD=${state.password}`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', `POSTGRES_DB=${state.db}`, '-p', `127.0.0.1:${state.dbPort}:5432`, 'postgres:17-alpine',
    ]);
    waitFor('pg_isready', ['-h', '127.0.0.1', '-p', String(state.dbPort), '-U', 'postgres', '-d', state.db], 'POSTGRES_NOT_READY');
    startNext(state);
    writeState(state);
  } catch (error) {
    try { cleanup(); } catch { /* preserve the original bootstrap failure */ }
    throw error;
  }
  console.log(JSON.stringify({ candidateSha: state.sha, runtimeRoot, next: `http://127.0.0.1:${state.nextPort}`, database: 'redacted-disposable-db' }));
}

function psql(state, sql) {
  return run('psql', ['-X', '-h', '127.0.0.1', '-p', String(state.dbPort), '-U', 'postgres', '-d', state.db, '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    cwd: projectRoot,
    input: sql,
    env: { ...process.env, PGPASSWORD: state.password, PGPASSFILE: '/dev/null' },
  });
}

function seedPreMigrationData(state) {
  psql(state, `
INSERT INTO public.grade_bands(role_group,grade,min_score,max_score,sort_order) VALUES
('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);
INSERT INTO public.criteria_groups(id,code,name,short_name,sort_order)
VALUES ('00000000-0000-4000-8000-000000000201','A','Confirmation quality','Q',0);
INSERT INTO public.criteria(id,code,name,description,applies_to,weight,group_id,sort_order,default_level_index)
VALUES ('00000000-0000-4000-8000-000000000211','A1','Confirmation criterion V1','Synthetic','employee',100,'00000000-0000-4000-8000-000000000201',0,0);
INSERT INTO public.criterion_levels(criterion_id,points,label,description,sort_order)
VALUES ('00000000-0000-4000-8000-000000000211',170,'Excellent','V1 excellent',0),('00000000-0000-4000-8000-000000000211',100,'Standard','V1 standard',1);
INSERT INTO public.criterion_audiences(criterion_id,audience)
VALUES ('00000000-0000-4000-8000-000000000211','employee'),('00000000-0000-4000-8000-000000000211','worker'),('00000000-0000-4000-8000-000000000211','management');
`);
}

function applyForwardMigrations(state) {
  const migrationDir = path.join(projectRoot, 'supabase/migrations');
  const applied = new Set(psql(state, 'SELECT version FROM supabase_migrations.schema_migrations;').split('\n').filter(Boolean));
  const migrations = [];
  for (const name of fs.readdirSync(migrationDir).filter((entry) => entry.endsWith('.sql')).sort()) {
    const version = name.split('_')[0];
    if (applied.has(version) || version < '202609') continue;
    psql(state, fs.readFileSync(path.join(migrationDir, name), 'utf8'));
    psql(state, `INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${name}');`);
    migrations.push(name);
  }
  return migrations;
}

async function seedH7BaseFixtures(state) {
  process.env.KURABE_FIXTURE_RUN_ID = state.fixtureRunId;
  const fixtureModule = await import('../../tests/support/confirmation-fixtures.mjs');
  const {
    FIXTURE_ACTORS, FIXTURE_TEAM_A_ID, FIXTURE_TEAM_B_ID, FIXTURE_TEAM_C_ID,
    FIXTURE_LEADER_A_ID, FIXTURE_LEADER_C_ID, FIXTURE_ACTIVE_PERIOD_ID,
    FIXTURE_CLOSED_PERIOD_ID, FIXTURE_MANAGER_ID, FIXTURE_ACTIVE_EVAL_ID,
    FIXTURE_CLOSED_EVAL_ID, FIXTURE_EMPLOYEE_B_ID, FIXTURE_ACTIVE_ROUND_1_ID,
    FIXTURE_CLOSED_ROUND_1_ID, FIXTURE_CLOSED_ROUND_2_ID, FIXTURE_CLOSED_ROUND_3_ID,
    sqlLiteral, psqlJson,
  } = fixtureModule;
  const userRows = Object.values(FIXTURE_ACTORS).map((actor) => `
    (${sqlLiteral(actor.id)}, ${sqlLiteral(actor.employeeCode)}, ${sqlLiteral(actor.name)}, ${sqlLiteral(actor.role)}, ${sqlLiteral(actor.teamId)}, '2026-01-01', true, NULL, ${sqlLiteral(actor.gender)})
  `).join(',\n    ');
  psql(state, `
    BEGIN;
    INSERT INTO public.teams (id, name, is_active, leader_id)
    VALUES
      (${sqlLiteral(FIXTURE_TEAM_A_ID)}, 'P103 Team A', true, NULL),
      (${sqlLiteral(FIXTURE_TEAM_B_ID)}, 'P103 Team B', true, NULL),
      (${sqlLiteral(FIXTURE_TEAM_C_ID)}, 'P103 Team C', true, NULL);
    INSERT INTO public.users (id, employee_code, name, role, team_id, join_date, is_active, password_hash, gender)
    VALUES ${userRows};
    UPDATE public.teams SET leader_id = ${sqlLiteral(FIXTURE_LEADER_A_ID)}
      WHERE id IN (${sqlLiteral(FIXTURE_TEAM_A_ID)}, ${sqlLiteral(FIXTURE_TEAM_B_ID)});
    UPDATE public.teams SET leader_id = ${sqlLiteral(FIXTURE_LEADER_C_ID)}
      WHERE id = ${sqlLiteral(FIXTURE_TEAM_C_ID)};
    INSERT INTO public.evaluation_periods (id, year, name, status, created_by, target_rate, target_grade)
    VALUES
      (${sqlLiteral(FIXTURE_ACTIVE_PERIOD_ID)}, 2099, 'P103 Active Period', 'active', ${sqlLiteral(FIXTURE_MANAGER_ID)}, 75, 'AB'),
      (${sqlLiteral(FIXTURE_CLOSED_PERIOD_ID)}, 2098, 'P103 Closed Period', 'closed', ${sqlLiteral(FIXTURE_MANAGER_ID)}, 75, 'AB');
    INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, current_round, status)
    VALUES
      (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_ACTIVE_PERIOD_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_B_ID)}, 'Employee', ${sqlLiteral(FIXTURE_TEAM_B_ID)}, 1, 'Draft'),
      (${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_PERIOD_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_B_ID)}, 'Employee', ${sqlLiteral(FIXTURE_TEAM_B_ID)}, 3, 'Approved');
    INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status)
    VALUES
      (${sqlLiteral(FIXTURE_ACTIVE_ROUND_1_ID)}, ${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, 1, ${sqlLiteral(FIXTURE_EMPLOYEE_B_ID)}, 'SubLeader', 'NotStarted'),
      (${sqlLiteral(FIXTURE_CLOSED_ROUND_1_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}, 1, ${sqlLiteral(FIXTURE_EMPLOYEE_B_ID)}, 'SubLeader', 'NotStarted'),
      (${sqlLiteral(FIXTURE_CLOSED_ROUND_2_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}, 2, ${sqlLiteral(FIXTURE_LEADER_A_ID)}, 'Leader', 'NotStarted'),
      (${sqlLiteral(FIXTURE_CLOSED_ROUND_3_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}, 3, ${sqlLiteral(FIXTURE_MANAGER_ID)}, 'Manager', 'NotStarted');
    COMMIT;
  `);
  const counts = psqlJson({ host: '127.0.0.1', port: String(state.dbPort), database: state.db, user: 'postgres', password: state.password }, `
    SELECT json_build_object(
      'teams', (SELECT count(*) FROM public.teams WHERE id IN (${sqlLiteral(FIXTURE_TEAM_A_ID)}, ${sqlLiteral(FIXTURE_TEAM_B_ID)}, ${sqlLiteral(FIXTURE_TEAM_C_ID)})),
      'users', (SELECT count(*) FROM public.users WHERE id IN (${Object.values(FIXTURE_ACTORS).map((actor) => sqlLiteral(actor.id)).join(', ')})),
      'periods', (SELECT count(*) FROM public.evaluation_periods WHERE id IN (${sqlLiteral(FIXTURE_ACTIVE_PERIOD_ID)}, ${sqlLiteral(FIXTURE_CLOSED_PERIOD_ID)})),
      'evaluations', (SELECT count(*) FROM public.evaluations WHERE id IN (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)})),
      'rounds', (SELECT count(*) FROM public.evaluation_rounds WHERE id IN (${sqlLiteral(FIXTURE_ACTIVE_ROUND_1_ID)}, ${sqlLiteral(FIXTURE_CLOSED_ROUND_1_ID)}, ${sqlLiteral(FIXTURE_CLOSED_ROUND_2_ID)}, ${sqlLiteral(FIXTURE_CLOSED_ROUND_3_ID)}))
    )::text;
  `);
  if (counts.teams !== 3 || counts.users !== 6 || counts.periods !== 2 || counts.evaluations !== 2 || counts.rounds !== 4) {
    throw new Error(`H7_FIXTURE_COUNTS_MISMATCH: ${JSON.stringify(counts)}`);
  }
  const snapshotTables = [
    'criteria_config_versions', 'criteria_group_versions', 'criterion_versions',
    'criterion_level_versions', 'criterion_audience_versions', 'grade_band_versions',
  ];
  psql(state, `GRANT SELECT ON TABLE ${snapshotTables.map((table) => `public.${table}`).join(', ')} TO anon, authenticated, service_role;`);
  return { counts, actorCount: Object.keys(FIXTURE_ACTORS).length };
}

function startPostgrest(state) {
  const configPath = path.join(runtimeRoot, 'postgrest.conf');
  const dbUri = ['postgres', ':', '/', '/', 'postgres', ':', state.password, '@db:5432/', state.db].join('');
  fs.writeFileSync(configPath, `db-uri = "${dbUri}"\ndb-schemas = "public"\ndb-anon-role = "anon"\njwt-secret = "${state.jwtSecret}"\nserver-host = "0.0.0.0"\nserver-port = 3000\nadmin-server-port = 3001\n`, { mode: 0o600 });
  run('docker', ['run', '-d', '--name', `${state.name}-rest`, '--network', state.networkId, '--network-alias', 'rest', '--restart=no', '--label', `kurabe.confirm=${state.name}`, '-p', `127.0.0.1:${state.backendRestPort}:3000`, '-v', `${configPath}:/etc/postgrest.conf:ro`, 'postgrest/postgrest:v12.2.3', 'postgrest', '/etc/postgrest.conf']);
}

function waitHttp(url, label, attempts = 90) {
  waitFor('curl', ['--fail', '--silent', '--show-error', '--max-time', '3', url], label, attempts);
}

function waitTcp(port, label, attempts = 90) {
  waitFor('curl', ['--silent', '--output', '/dev/null', '--max-time', '3', `http://127.0.0.1:${port}/`], label, attempts);
}

function postgrestState(state) {
  try {
    return run('docker', [
      'inspect', '--format', '{{.State.Status}}|{{.State.ExitCode}}|{{.State.OOMKilled}}|{{.State.Error}}',
      `${state.name}-rest`,
    ]);
  } catch {
    return 'missing';
  }
}

function postgrestDiagnostics(state) {
  try {
    return safeError(run('docker', ['logs', '--tail', '80', `${state.name}-rest`])).replace(/\s+/g, ' ').slice(-2000);
  } catch {
    return 'unavailable';
  }
}

async function bootstrap() {
  const state = readState();
  if (run('git', ['rev-parse', 'HEAD'], { cwd: projectRoot }) !== state.sha) throw new Error('RUNTIME_CANDIDATE_SHA_MISMATCH');
  const target = { host: '127.0.0.1', port: String(state.dbPort), database: state.db, user: 'postgres', password: state.password, rootDir: projectRoot };
  process.env.PGPASSWORD = state.password;
  runBootstrap(target);
  seedPreMigrationData(state);
  const migrations = applyForwardMigrations(state);
  const seeded = await seedH7BaseFixtures(state);
  startPostgrest(state);
  try {
    waitTcp(state.backendRestPort, 'POSTGREST_BACKEND_NOT_READY');
    startProxy(state);
    waitHttp(`${state.supabaseUrl}/rest/v1/`, 'POSTGREST_NOT_READY');
  } catch (error) {
    throw new Error(`${safeError(error)} container_state=${postgrestState(state)} container_logs=${postgrestDiagnostics(state)}`);
  }
  waitHttp(`http://127.0.0.1:${state.nextPort}/login`, 'NEXT_NOT_READY');
  const bootstrapResult = path.join(runtimeRoot, 'bootstrap-result.json');
  fs.writeFileSync(bootstrapResult, `${JSON.stringify({
    format: 'kurabe-ci-confirmation-bootstrap/v1',
    candidateSha: state.sha,
    fixtureRunId: state.fixtureRunId,
    target: 'redacted-disposable-db',
    baseline: { passed: true, cases: ['identity-guard', 'empty-to-full', 'normalized-catalog', 'ordered-ledger-replay'] },
    migrations,
    migrationCount: migrations.length,
    seededActors: seeded.actorCount,
    seededCounts: seeded.counts,
  }, null, 2)}\n`, { mode: 0o600 });
  state.restContainer = `${state.name}-rest`;
  state.bootstrapResult = bootstrapResult;
  writeState(state);
  console.log(JSON.stringify({ candidateSha: state.sha, migrations: migrations.length, authenticatedRuntime: true }));
}

function exportEnv() {
  const state = readState();
  const envPath = process.env.GITHUB_ENV || path.join(runtimeRoot, 'runtime.env');
  const values = {
    KURABE_LOCAL_STACK_OWNED: '1',
    KURABE_SUPABASE_URL: state.supabaseUrl,
    KURABE_SUPABASE_ANON_KEY: state.anonKey,
    KURABE_SUPABASE_SERVICE_ROLE_KEY: state.serviceRoleKey,
    KURABE_DB_HOST: '127.0.0.1',
    KURABE_DB_PORT: String(state.dbPort),
    KURABE_DB_NAME: state.db,
    KURABE_DB_USER: 'postgres',
    KURABE_DB_PASSWORD: state.password,
    KURABE_FIXTURE_RUN_ID: state.fixtureRunId,
    KURABE_SUPABASE_STACK_NAME: state.name,
    KURABE_SUPABASE_NETWORK_ID: state.networkId,
    KURABE_CONFIRMATION_CANDIDATE_SHA: state.sha,
    KURABE_FIXTURE_PASSWORD: state.fixturePassword,
    KURABE_CONFIRMATION_NEXT_URL: `http://127.0.0.1:${state.nextPort}`,
    KURABE_CONFIRMATION_RUNTIME_SOURCE: projectRoot,
    KURABE_H5_ARTIFACT_ROOT: path.join(runtimeRoot, 'h5-auth'),
    KURABE_H7_PREBOOTSTRAPPED: '1',
    KURABE_H7_BOOTSTRAP_RESULT: state.bootstrapResult,
  };
  for (const name of ['H1H2', 'H3', 'H5', 'H6', 'H7']) {
    values[`KURABE_${name}_NEXT_URL`] = values.KURABE_CONFIRMATION_NEXT_URL;
    values[`KURABE_${name}_RUNTIME_SOURCE`] = projectRoot;
  }
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`).join('\n') + '\n';
  fs.appendFileSync(envPath, lines, { mode: 0o600 });
  console.log(JSON.stringify({ envPath, exported: Object.keys(values).filter((name) => !name.includes('KEY') && !name.includes('PASSWORD')).length }));
}

function proxy() {
  const state = readState();
  const server = http.createServer((request, response) => {
    const sourcePath = request.url || '/';
    const targetPath = sourcePath.startsWith('/rest/v1') ? (sourcePath.slice('/rest/v1'.length) || '/') : sourcePath;
    const upstream = http.request({ hostname: '127.0.0.1', port: state.backendRestPort, method: request.method, path: targetPath, headers: request.headers }, (result) => {
      response.writeHead(result.statusCode || 502, result.headers);
      result.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    request.pipe(upstream);
  });
  server.listen(state.restPort, '127.0.0.1');
}

function cleanup() {
  if (!fs.existsSync(statePath)) { console.log(JSON.stringify({ cleaned: true, residue: 0 })); return; }
  const state = readState();
  for (const pid of [state.nextPid, state.proxyPid]) {
    if (Number.isInteger(pid) && pid > 1) {
      try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch {} }
    }
  }
  for (const container of [`${state.name}-rest`, `${state.name}-db`]) {
    try { run('docker', ['rm', '-f', container]); } catch {}
  }
  try { run('docker', ['network', 'rm', state.networkId]); } catch {}
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  const containerResidue = run('docker', ['ps', '-a', '--format', '{{.Names}}']).split('\n').filter((name) => name === `${state.name}-rest` || name === `${state.name}-db`);
  let networkResidue = true;
  try { run('docker', ['network', 'inspect', state.networkId]); } catch { networkResidue = false; }
  if (containerResidue.length > 0 || networkResidue) throw new Error('CLEANUP_RESIDUE');
  console.log(JSON.stringify({ cleaned: true, residue: 0 }));
}

const action = process.argv[2];
try {
  if (action === 'start') await start();
  else if (action === 'bootstrap') await bootstrap();
  else if (action === 'export-env') exportEnv();
  else if (action === 'proxy') proxy();
  else if (action === 'cleanup') cleanup();
  else throw new Error('Usage: confirmation-runtime.mjs <start|bootstrap|export-env|cleanup>');
} catch (error) {
  console.error(`CI_RUNTIME_FAIL ${safeError(error)}`);
  process.exitCode = 1;
}
