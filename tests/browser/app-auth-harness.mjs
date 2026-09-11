#!/usr/bin/env node
/**
 * P102M3T13 reusable local authenticated-fixture API.
 *
 * Public API:
 *   createAppAuthFixture(options) -> disposable DB + loopback REST handle
 *   startNextApplication(options) -> isolated actual-Next process handle
 *   createBrowserSession(fixture, role) -> real opaque session backed by seeded DB
 *   requestJson(url, options) -> redacted loopback HTTP helper
 *
 * This module deliberately exposes only disposable loopback handles. It never
 * contacts a provider, changes project configuration, or accepts a fake browser.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');
export const BASE_SHA = '177dbd7c4d12344cbab806d53b77ba9022d014a0';
export const EXPECTED_GIT_HEAD = process.env.KURABE_EXPECTED_GIT_HEAD || BASE_SHA;
export const EXPECTED_DIFF_BASE = process.env.KURABE_EXPECTED_DIFF_BASE || BASE_SHA;
export const TASK_ID = 'P102M3T13';
export const FIXTURE_EMPLOYEE_CODE = 'P102M3T13-MGR';
export const FIXTURE_MANAGER_ID = '22222222-2222-4222-8222-222222222222';
export const FIXTURE_EMPLOYEE_ID = '44444444-4444-4444-8444-444444444444';
export const FIXTURE_TEAM_ID = '11111111-1111-4111-8111-111111111111';
export const FIXTURE_PERIOD_ID = '33333333-3333-4333-8333-333333333333';
export const FIXTURE_PERIOD_YEAR = 2099;
export const FIXTURE_EVALUATION_ID = '55555555-5555-4555-8555-555555555555';

function safeError(error) {
  return String(error?.message || error)
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/apikey\s*[=:]\s*[^\s,;]+/gi, 'apikey=[REDACTED]');
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}


export function locatePsql() {
  const candidates = [
    '/usr/lib/postgresql/17/bin/psql',
    '/usr/bin/psql',
    'psql',
    '/usr/local/bin/psql',
    '/usr/lib/postgresql/16/bin/psql',
    '/usr/lib/postgresql/15/bin/psql',
  ];
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], {
      stdio: ['ignore', 'ignore', 'ignore'],
      timeout: 2000,
    });
    if (probe.status === 0 && !probe.error) return candidate;
  }
  return null;
}

function psqlArgs(target) {
  return [
    '--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1',
    '--tuples-only', '--no-align',
    '--host', target.host, '--port', String(target.port),
    '--username', target.user, '--dbname', target.database,
  ];
}

export function psql(target, sql, options = {}) {
  const psqlBin = locatePsql();
  if (!psqlBin) {
    const err = new Error('psql binary not found');
    err.code = 'MISSING_RUNTIME_CAPABILITY';
    throw err;
  }
  const result = spawnSync(psqlBin, psqlArgs(target), {
    cwd: options.cwd || projectRoot,
    env: { ...process.env, PGPASSWORD: target.password, PGPASSFILE: '/dev/null', PGCONNECT_TIMEOUT: '5' },
    input: sql,
    encoding: 'utf8',
    timeout: options.timeout || 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`psql query failed: ${safeError(result.error?.message || result.stderr || result.stdout || '')}`);
  }
  return String(result.stdout || '').trim();
}

export function psqlJson(target, sql, options = {}) {
  const output = psql(target, sql, options);
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`fixture query returned invalid JSON: ${safeError(output)}`);
  }
}

async function listen(server, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const onError = (error) => { server.off('listening', onListening); reject(error); };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') return reject(new Error('loopback server did not expose a TCP address'));
      resolve(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, host);
  });
}

async function closeServer(server) {
  if (!server) return;
  await new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
  });
}

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

export function validateRuntimeEnvironment() {
  const missing = [];
  if (process.env.KURABE_LOCAL_STACK_OWNED !== '1') missing.push('KURABE_LOCAL_STACK_OWNED=1');
  const supabaseUrl = process.env.KURABE_SUPABASE_URL;
  if (!supabaseUrl) missing.push('KURABE_SUPABASE_URL');
  if (!process.env.KURABE_SUPABASE_ANON_KEY) missing.push('KURABE_SUPABASE_ANON_KEY');
  if (!process.env.KURABE_SUPABASE_SERVICE_ROLE_KEY) missing.push('KURABE_SUPABASE_SERVICE_ROLE_KEY');
  const dbHost = process.env.KURABE_DB_HOST;
  if (!dbHost) missing.push('KURABE_DB_HOST');
  const dbPort = process.env.KURABE_DB_PORT;
  if (!dbPort) missing.push('KURABE_DB_PORT');
  const dbName = process.env.KURABE_DB_NAME;
  if (!dbName) missing.push('KURABE_DB_NAME');
  const dbUser = process.env.KURABE_DB_USER;
  if (!dbUser) missing.push('KURABE_DB_USER');
  if (!process.env.KURABE_DB_PASSWORD) missing.push('KURABE_DB_PASSWORD');
  if (!process.env.KURABE_SUPABASE_STACK_NAME) missing.push('KURABE_SUPABASE_STACK_NAME');
  if (!process.env.KURABE_SUPABASE_NETWORK_ID) missing.push('KURABE_SUPABASE_NETWORK_ID');

  if (missing.length > 0) {
    const error = new Error(`MISSING_RUNTIME_CAPABILITY: local Supabase stack runtime env is missing (${missing.join(', ')})`);
    error.code = 'MISSING_RUNTIME_CAPABILITY';
    error.missing = missing;
    throw error;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    const error = new Error('KURABE_SUPABASE_URL is not a valid URL');
    error.code = 'INVALID_RUNTIME_TARGET';
    throw error;
  }
  if (!['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname)) {
    const error = new Error(`KURABE_SUPABASE_URL must be loopback, received: ${parsedUrl.hostname}`);
    error.code = 'REFUSE_NON_LOOPBACK_URL';
    throw error;
  }
  if (/supabase\.co|amazonaws\.com|azure\.com|neon\.tech/i.test(supabaseUrl)) {
    const error = new Error('KURABE_SUPABASE_URL must not point to external/cloud services');
    error.code = 'REFUSE_PRODUCTION_URL';
    throw error;
  }

  if (!['127.0.0.1', 'localhost', '::1'].includes(dbHost)) {
    const error = new Error(`KURABE_DB_HOST must be loopback, received: ${dbHost}`);
    error.code = 'REFUSE_NON_LOOPBACK_HOST';
    throw error;
  }
  const portNum = Number(dbPort);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    const error = new Error(`KURABE_DB_PORT must be a valid integer port, received: ${dbPort}`);
    error.code = 'INVALID_DB_PORT';
    throw error;
  }
  if (/production|prod/i.test(dbName)) {
    const error = new Error(`KURABE_DB_NAME must not be production database, received: ${dbName}`);
    error.code = 'REFUSE_PRODUCTION_DATABASE';
    throw error;
  }
  if (!/^[a-z_][a-z0-9_]*$/i.test(dbUser)) {
    const error = new Error(`KURABE_DB_USER must be a plain role identifier, received: ${dbUser}`);
    error.code = 'INVALID_DB_USER';
    throw error;
  }

  return {
    stackName: process.env.KURABE_SUPABASE_STACK_NAME,
    networkId: process.env.KURABE_SUPABASE_NETWORK_ID,
    supabaseUrl,
    anonKey: process.env.KURABE_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.KURABE_SUPABASE_SERVICE_ROLE_KEY,
    dbTarget: {
      host: dbHost,
      port: portNum,
      database: dbName,
      user: dbUser,
      password: process.env.KURABE_DB_PASSWORD,
    },
  };
}

export function captureServerIdentity(target) {
  const sql = `
    SELECT json_build_object(
      'current_database', current_database(),
      'host_bind', ${sqlLiteral(target.host)},
      'server_addr', coalesce(host(inet_server_addr()), ''),
      'server_port', inet_server_port(),
      'current_user', current_user,
      'server_version', current_setting('server_version'),
      'is_superuser', current_setting('is_superuser')
    )::text;
  `;
  return psqlJson(target, sql);
}

export function cleanupDatabase(target) {
  const cleanupSql = `
    DELETE FROM public.sessions WHERE user_id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)});
    DELETE FROM public.login_attempts WHERE employee_code IN (${sqlLiteral(FIXTURE_EMPLOYEE_CODE)}, 'P102M3T13-EMP');
    DELETE FROM public.evaluation_responses WHERE round_id IN (
      SELECT id FROM public.evaluation_rounds WHERE evaluation_id IN (
        SELECT id FROM public.evaluations WHERE id = ${sqlLiteral(FIXTURE_EVALUATION_ID)} OR period_id = ${sqlLiteral(FIXTURE_PERIOD_ID)} OR employee_id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)})
      )
    );
    DELETE FROM public.evaluation_rounds WHERE evaluation_id IN (
      SELECT id FROM public.evaluations WHERE id = ${sqlLiteral(FIXTURE_EVALUATION_ID)} OR period_id = ${sqlLiteral(FIXTURE_PERIOD_ID)} OR employee_id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)})
    );
    DELETE FROM public.evaluations WHERE id = ${sqlLiteral(FIXTURE_EVALUATION_ID)} OR period_id = ${sqlLiteral(FIXTURE_PERIOD_ID)} OR employee_id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)});
    DELETE FROM public.evaluation_periods WHERE id = ${sqlLiteral(FIXTURE_PERIOD_ID)};
    DELETE FROM public.users WHERE id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)});
    DELETE FROM public.teams WHERE id = ${sqlLiteral(FIXTURE_TEAM_ID)};
  `;
  psql(target, cleanupSql);

  const checkSql = `
    SELECT json_build_object(
      'sessions', (SELECT count(*) FROM public.sessions WHERE user_id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)})),
      'login_attempts', (SELECT count(*) FROM public.login_attempts WHERE employee_code IN (${sqlLiteral(FIXTURE_EMPLOYEE_CODE)}, 'P102M3T13-EMP')),
      'evaluations', (SELECT count(*) FROM public.evaluations WHERE id = ${sqlLiteral(FIXTURE_EVALUATION_ID)} OR period_id = ${sqlLiteral(FIXTURE_PERIOD_ID)}),
      'evaluation_periods', (SELECT count(*) FROM public.evaluation_periods WHERE id = ${sqlLiteral(FIXTURE_PERIOD_ID)}),
      'users', (SELECT count(*) FROM public.users WHERE id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)})),
      'teams', (SELECT count(*) FROM public.teams WHERE id = ${sqlLiteral(FIXTURE_TEAM_ID)})
    )::text;
  `;
  const residue = psqlJson(target, checkSql);
  const totalResidue = Number(residue.sessions) + Number(residue.login_attempts) + Number(residue.evaluations) + Number(residue.evaluation_periods) + Number(residue.users) + Number(residue.teams);
  assert.equal(totalResidue, 0, `fixture cleanup left residue: ${JSON.stringify(residue)}`);
  return { exactResidueZero: true, residue, containersStopped: 0 };
}

export function seedDatabase(target) {
  cleanupDatabase(target);

  const seedSql = `
    INSERT INTO public.teams (id, name, is_active)
    VALUES (${sqlLiteral(FIXTURE_TEAM_ID)}, 'P102M3T13 Fixture Team', true);

    INSERT INTO public.users (id, employee_code, name, role, team_id, join_date, is_active, password_hash, gender)
    VALUES
      (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_CODE)}, 'P102M3T13 Seed Manager', 'Manager', ${sqlLiteral(FIXTURE_TEAM_ID)}, '2026-01-01', true, ${sqlLiteral(null)}, 'Nữ'),
      (${sqlLiteral(FIXTURE_EMPLOYEE_ID)}, 'P102M3T13-EMP', 'P102M3T13 Seed Employee', 'Employee', ${sqlLiteral(FIXTURE_TEAM_ID)}, '2026-01-02', true, NULL, 'Nữ');

    INSERT INTO public.evaluation_periods (id, year, name, status, created_by, target_rate, target_grade)
    VALUES (${sqlLiteral(FIXTURE_PERIOD_ID)}, ${FIXTURE_PERIOD_YEAR}, 'P102M3T13 Seed Period', 'active', ${sqlLiteral(FIXTURE_MANAGER_ID)}, 75, 'AB');

    INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, current_round, status)
    VALUES (${sqlLiteral(FIXTURE_EVALUATION_ID)}, ${sqlLiteral(FIXTURE_PERIOD_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)}, 'Employee', ${sqlLiteral(FIXTURE_TEAM_ID)}, 1, 'Draft');
  `;
  psql(target, seedSql);

  const verifySql = `
    SELECT json_build_object(
      'teams', (SELECT count(*) FROM public.teams WHERE id = ${sqlLiteral(FIXTURE_TEAM_ID)}),
      'users', (SELECT count(*) FROM public.users WHERE id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)})),
      'evaluation_periods', (SELECT count(*) FROM public.evaluation_periods WHERE id = ${sqlLiteral(FIXTURE_PERIOD_ID)}),
      'evaluations', (SELECT count(*) FROM public.evaluations WHERE id = ${sqlLiteral(FIXTURE_EVALUATION_ID)})
    )::text;
  `;
  const counts = psqlJson(target, verifySql);
  assert.equal(counts.teams, 1, 'team row not seeded');
  assert.equal(counts.users, 2, 'user rows not seeded');
  assert.equal(counts.evaluation_periods, 1, 'evaluation period not seeded');
  assert.equal(counts.evaluations, 1, 'evaluation not seeded');
  return counts;
}

/** Create authentic local Supabase fixture lifecycle handles. */
export async function createAppAuthFixture() {
  const envConfig = validateRuntimeEnvironment();
  const target = envConfig.dbTarget;
  const serverIdentity = captureServerIdentity(target);

  assert.equal(serverIdentity.current_database, target.database, 'connected database name mismatch');
  assert.equal(serverIdentity.host_bind, target.host, 'connected client host mismatch');
  assert.equal(serverIdentity.current_user, target.user, 'connected user mismatch');

  const seedCounts = seedDatabase(target);

  const stackHandle = {
    stackName: envConfig.stackName,
    networkId: envConfig.networkId,
    ownership: {
      owned: true,
      localStackOwned: true,
      containerOwnership: 'disposable-stack-preserved',
    },
    restUrl: envConfig.supabaseUrl,
    dbTarget: {
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.user,
    },
    localOnlyValidation: {
      restLoopback: true,
      dbLoopback: true,
      nonProduction: true,
    },
    serverIdentity: {
      database: serverIdentity.current_database,
      hostBind: serverIdentity.host_bind,
      serverAddress: serverIdentity.server_addr,
      serverPort: serverIdentity.server_port,
      currentUser: serverIdentity.current_user,
      serverVersion: serverIdentity.server_version,
      isSuperuser: serverIdentity.is_superuser,
    },
  };

  const seedHandle = {
    seededAt: new Date().toISOString(),
    seedIdentity: {
      managerUserId: FIXTURE_MANAGER_ID,
      employeeUserId: FIXTURE_EMPLOYEE_ID,
      teamId: FIXTURE_TEAM_ID,
      periodId: FIXTURE_PERIOD_ID,
      periodYear: FIXTURE_PERIOD_YEAR,
      periodStatus: 'active',
      evaluationId: FIXTURE_EVALUATION_ID,
    },
    exactRows: seedCounts,
  };

  const periodReadback = await requestJson(
    `${envConfig.supabaseUrl}/rest/v1/evaluation_periods?select=id,year,name,status&id=eq.${FIXTURE_PERIOD_ID}`,
    {
      headers: {
        apikey: envConfig.serviceRoleKey,
        authorization: `Bearer ${envConfig.serviceRoleKey}`,
      },
    }
  );
  assert.equal(periodReadback.status, 200, `PostgREST readback failed: ${periodReadback.status}`);
  assert.ok(Array.isArray(periodReadback.body) && periodReadback.body.length === 1, 'PostgREST did not see seeded period');
  assert.equal(periodReadback.body[0].id, FIXTURE_PERIOD_ID);

  const readbackHandle = {
    postgrestVerified: true,
    periodId: periodReadback.body[0].id,
    periodName: periodReadback.body[0].name,
    periodYear: periodReadback.body[0].year,
  };

  let stopped = false;
  return {
    kind: 'P102M3T13-authentic-local-supabase-fixture',
    baseSha: BASE_SHA,
    dbTarget: {
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.user,
    },
    restUrl: envConfig.supabaseUrl,
    anonKey: envConfig.anonKey,
    serviceRoleKey: envConfig.serviceRoleKey,
    stackHandle,
    seedHandle,
    readbackHandle,
    manager: {
      employeeCode: FIXTURE_EMPLOYEE_CODE,
      password: '',
      userId: FIXTURE_MANAGER_ID,
      role: 'Manager',
    },
    employee: {
      employeeCode: 'P102M3T13-EMP',
      userId: FIXTURE_EMPLOYEE_ID,
      role: 'Employee',
    },
    readSeed() {
      return {
        period: psqlJson(target, `SELECT row_to_json(x)::text FROM (SELECT id, year, name, status FROM public.evaluation_periods WHERE id=${sqlLiteral(FIXTURE_PERIOD_ID)}) x;`),
        manager: psqlJson(target, `SELECT row_to_json(x)::text FROM (SELECT id, employee_code, name, role FROM public.users WHERE id=${sqlLiteral(FIXTURE_MANAGER_ID)}) x;`),
      };
    },
    query(sql) {
      return psql(target, sql);
    },
    getAuthHeaders(role = 'service_role') {
      const key = role === 'service_role' ? envConfig.serviceRoleKey : envConfig.anonKey;
      return {
        apikey: key,
        authorization: `Bearer ${key}`,
      };
    },
    async stop() {
      if (stopped) return { alreadyStopped: true, containersStopped: 0 };
      stopped = true;
      const cleanupResult = cleanupDatabase(target);
      return {
        databaseCleaned: cleanupResult.exactResidueZero,
        exactResidueZero: cleanupResult.exactResidueZero,
        containersStopped: 0,
        residue: cleanupResult.residue,
      };
    },
    async isClean() {
      const checkSql = `
        SELECT (
          (SELECT count(*) FROM public.sessions WHERE user_id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)})) +
          (SELECT count(*) FROM public.evaluation_periods WHERE id = ${sqlLiteral(FIXTURE_PERIOD_ID)}) +
          (SELECT count(*) FROM public.users WHERE id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)}))
        )::integer AS remaining;
      `;
      const result = psql(target, checkSql);
      return Number(result) === 0;
    },
  };
}

/** Insert a real opaque session row and return a browser-ready cookie handle. */
export function createBrowserSession(fixture, role = 'manager') {
  const userId = role === 'employee' ? FIXTURE_EMPLOYEE_ID : FIXTURE_MANAGER_ID;
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  fixture.query(`INSERT INTO public.sessions (token_hash, user_id, expires_at) VALUES (${sqlLiteral(tokenHash)}, ${sqlLiteral(userId)}, ${sqlLiteral(expiresAt)});`);
  return { role, userId, token, tokenHash, expiresAt };
}

function copySourceToTemp() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-p102m3t13-next-'));
  fs.cpSync(projectRoot, tempRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(projectRoot, source);
      if (!relative) return true;
      return !relative.startsWith('.git') && !relative.startsWith('node_modules') && !relative.startsWith('.next') && !relative.startsWith('.tmp') && !relative.startsWith('.env');
    },
  });
  const lockPath = path.join(tempRoot, 'package-lock.json');
  const lockHash = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
  const install = spawnSync('npm', ['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: tempRoot,
    env: { ...process.env, HOME: os.tmpdir(), NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 300_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (install.error || install.status !== 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error(`private dependency install failed: ${safeError(install.error || install.stderr || install.stdout)}`);
  }
  const installedLockHash = crypto.createHash('sha256').update(fs.readFileSync(lockPath)).digest('hex');
  if (installedLockHash !== lockHash) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw new Error('private dependency install changed package-lock.json');
  }
  return tempRoot;
}

function processGroupSignal(child, signal) {
  if (child.pid) {
    try { process.kill(-child.pid, signal); return; } catch { /* fall through to owned child */ }
  }
  try { child.kill(signal); } catch { /* already exited */ }
}

async function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  processGroupSignal(child, 'SIGTERM');
  await Promise.race([closed, wait(5_000)]);
  if (child.exitCode === null) {
    processGroupSignal(child, 'SIGKILL');
    await Promise.race([closed, wait(2_000)]);
  }
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await closeServer(server);
  return port;
}

async function waitForHttp(url, child) {
  let last = 'none';
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      last = String(response.status);
      if ([200, 307, 308].includes(response.status)) return response.status;
    } catch { /* startup in progress */ }
    if (child.exitCode !== null) break;
    await wait(500);
  }
  throw new Error(`actual Next server did not become ready (status=${last})`);
}

/** Build and run the exact source in a private temp tree; no shared .next is used. */
export async function startNextApplication(fixture) {
  const isolatedRoot = copySourceToTemp();
  const buildEnv = {
    PATH: process.env.PATH,
    HOME: os.tmpdir(),
    LANG: 'C',
    LC_ALL: 'C',
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: fixture.restUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: fixture.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: fixture.serviceRoleKey,
    KURABE_REQUIRE_PASSWORD_LOGIN: 'false',
    KURABE_TRUSTED_PROXIES: 'loopback',
    OPENAI_API_KEY: '',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
  };
  const build = spawnSync('npm', ['run', 'build'], {
    cwd: isolatedRoot,
    env: buildEnv,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (build.error || build.status !== 0) {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
    throw new Error(`actual Next production build failed: ${safeError(build.error || build.stderr || build.stdout)}`);
  }
  const port = await freePort();
  const startTime = new Date().toISOString();
  const child = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: isolatedRoot,
    env: buildEnv,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout = (stdout + String(chunk)).slice(-32 * 1024); });
  child.stderr.on('data', (chunk) => { stderr = (stderr + String(chunk)).slice(-32 * 1024); });
  try {
    await waitForHttp(`http://127.0.0.1:${port}/login`, child);
  } catch (error) {
    await stopOwnedProcess(child);
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
    throw new Error(`${error.message}; next=${safeError(stderr || stdout)}`);
  }
  let stopped = false;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    pid: child.pid,
    startTime,
    isolatedRoot,
    sourceIdentity: {
      baseSha: BASE_SHA,
      appRoot: 'src',
      nextConfig: 'next.config.ts',
      buildMode: 'production',
      buildDir: path.join(isolatedRoot, '.next'),
    },
    async stop() {
      if (stopped) return { alreadyStopped: true };
      stopped = true;
      await stopOwnedProcess(child);
      const existedBeforeCleanup = fs.existsSync(isolatedRoot);
      fs.rmSync(isolatedRoot, { recursive: true, force: true });
      const residue = fs.existsSync(isolatedRoot);
      return {
        pid: child.pid,
        startTime,
        port,
        processStopped: child.exitCode !== null,
        isolatedTreeRemoved: !fs.existsSync(isolatedRoot),
        residue,
        existedBeforeCleanup,
      };
    },
  };
}

export async function requestJson(url, options = {}) {
  const response = await fetch(url, { redirect: 'manual', ...options });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, headers: Object.fromEntries(response.headers), body };
}

export function redactHandle(handle) {
  if (!handle) return null;
  return {
    role: handle.role,
    userId: handle.userId,
    expiresAt: handle.expiresAt,
    token: '[redacted-token]',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('APP_AUTH_HARNESS API createAppAuthFixture startNextApplication createBrowserSession requestJson');
}
