#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

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
    try {
      const probe = spawnSync(candidate, ['--version'], {
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: 2000,
      });
      if (probe.status === 0 && !probe.error) return candidate;
    } catch {}
  }
  return null;
}

export async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export function readRuntimeConfig() {
  const runtimeRoot = process.env.KURABE_CI_RUNTIME_ROOT || path.join(os.tmpdir(), 'kurabe-ci-runtime');
  const statePath = path.join(runtimeRoot, 'runtime-state.json');
  let state = {};
  if (fs.existsSync(statePath)) {
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {}
  }
  return {
    runtimeRoot,
    state,
    supabaseUrl: process.env.KURABE_SUPABASE_URL || state.supabaseUrl || 'http://127.0.0.1:8000',
    anonKey: process.env.KURABE_SUPABASE_ANON_KEY || state.anonKey || '',
    serviceRoleKey: process.env.KURABE_SUPABASE_SERVICE_ROLE_KEY || state.serviceRoleKey || '',
    dbHost: process.env.KURABE_DB_HOST || '127.0.0.1',
    dbPort: Number(process.env.KURABE_DB_PORT || state.dbPort || 5432),
    dbName: process.env.KURABE_DB_NAME || state.db || 'kurabe_harness',
    dbUser: process.env.KURABE_DB_USER || 'postgres',
    dbPassword: process.env.KURABE_DB_PASSWORD || state.password || '',
    fixturePassword: process.env.KURABE_FIXTURE_PASSWORD || state.fixturePassword || '',
    fixtureRunId: process.env.KURABE_FIXTURE_RUN_ID || state.fixtureRunId || '',
    stackName: process.env.KURABE_SUPABASE_STACK_NAME || state.name || '',
  };
}

export function executeSql(config, sqlText) {
  const psqlBin = locatePsql();
  if (psqlBin && config.dbPassword && config.dbName) {
    const res = spawnSync(psqlBin, [
      '-X', '-h', config.dbHost || '127.0.0.1', '-p', String(config.dbPort || 5432),
      '-U', config.dbUser || 'postgres', '-d', config.dbName, '-qAt', '-v', 'ON_ERROR_STOP=1',
    ], {
      cwd: projectRoot,
      input: sqlText,
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: config.dbPassword, PGPASSFILE: '/dev/null' },
      timeout: 10000,
    });
    if (res.status === 0) return String(res.stdout || '').trim();
  }

  if (config.stackName) {
    const containerName = `${config.stackName}-db`;
    const res = spawnSync('docker', [
      'exec', '-i', containerName,
      'psql', '-X', '-U', config.dbUser || 'postgres', '-d', config.dbName,
      '-qAt', '-v', 'ON_ERROR_STOP=1',
    ], {
      input: sqlText,
      encoding: 'utf8',
      timeout: 10000,
    });
    if (res.status === 0) return String(res.stdout || '').trim();
  }
  return null;
}

export async function getManagerUser(config) {
  // Method 1: Query via PostgREST HTTP using service_role key
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const url = `${config.supabaseUrl}/rest/v1/users?role=eq.Manager&is_active=eq.true&select=id,credential_revision&limit=1`;
      const res = await fetch(url, {
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return { id: data[0].id, credentialRevision: data[0].credential_revision || 0 };
        }
      }
    } catch {}
  }

  // Method 2: Direct SQL query via psql or docker exec
  const sqlQuery = "SELECT json_build_object('id', id, 'credential_revision', coalesce(credential_revision, 0))::text FROM public.users WHERE role = 'Manager' AND is_active = true LIMIT 1;";
  const result = executeSql(config, sqlQuery);
  if (result) {
    try {
      const parsed = JSON.parse(result);
      return { id: parsed.id, credentialRevision: parsed.credential_revision || 0 };
    } catch {}
  }

  return { id: '00000000-0000-0000-0000-000000000001', credentialRevision: 0 };
}

export async function createSmokeSession(config, user) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  let inserted = false;

  // Try PostgREST insert
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      const url = `${config.supabaseUrl}/rest/v1/sessions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          token_hash: tokenHash,
          user_id: user.id,
          credential_revision: user.credentialRevision,
          expires_at: expiresAt,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) inserted = true;
    } catch {}
  }

  // Fallback to SQL insert
  if (!inserted) {
    const insertSql = `INSERT INTO public.sessions (token_hash, user_id, expires_at, credential_revision) VALUES ('${tokenHash}', '${user.id}', now() + interval '2 hours', ${user.credentialRevision});`;
    executeSql(config, insertSql);
  }

  return {
    token,
    tokenHash,
    cookie: `auth_session=${token}`,
  };
}

export async function deleteSmokeSession(config, tokenHash) {
  if (!tokenHash) return;
  if (config.supabaseUrl && config.serviceRoleKey) {
    try {
      await fetch(`${config.supabaseUrl}/rest/v1/sessions?token_hash=eq.${tokenHash}`, {
        method: 'DELETE',
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      return;
    } catch {}
  }
  try {
    executeSql(config, `DELETE FROM public.sessions WHERE token_hash = '${tokenHash}';`);
  } catch {}
}

// R4 preflight: NEXT_PUBLIC_* is inlined into .next/server at build time, and
// scripts/run-with-env.mjs deliberately forces .env.local over shell env. A
// bundle inlined against a different Supabase URL can never pass the auth
// cases, so fail with an explicit diagnostic instead of marker=absent.
export function assertInlinedBuildUrl(config) {
  if (!config.supabaseUrl) return;
  const serverDir = path.join(projectRoot, '.next', 'server');
  if (!fs.existsSync(serverDir)) {
    throw new Error('smoke preflight: .next/server missing — run the production build first');
  }
  let found = false;
  const walk = (dir) => {
    if (found) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (found) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js') && fs.readFileSync(full, 'utf8').includes(config.supabaseUrl)) {
        found = true;
        return;
      }
    }
  };
  walk(serverDir);
  if (!found) {
    throw new Error(
      `smoke preflight: build-url-mismatch — .next/server does not contain disposable URL ${config.supabaseUrl} ` +
      '(inlined NEXT_PUBLIC_SUPABASE_URL differs; check scripts/run-with-env.mjs/.env.local override)'
    );
  }
}

// R4 fail-closed: a silently failed session INSERT (PostgREST or SQL fallback)
// would make every auth case fail as an opaque marker=absent. Verify the row
// through the same PostgREST path getSessionUser reads before spawning Next.
export async function verifySmokeSessionRow(config, tokenHash) {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw new Error('smoke preflight: session-insert-verify skipped — missing supabaseUrl/serviceRoleKey');
  }
  const res = await fetch(
    `${config.supabaseUrl}/rest/v1/sessions?token_hash=eq.${tokenHash}&select=token_hash`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      signal: AbortSignal.timeout(5000),
    }
  );
  const rows = res.ok ? await res.json() : null;
  if (!res.ok || !Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`smoke preflight: session-insert-failed (verify HTTP ${res.status}, rows=${JSON.stringify(rows)})`);
  }
}

export function findNextBin() {
  const localBin = path.join(projectRoot, 'node_modules/.bin/next');
  if (fs.existsSync(localBin)) return localBin;
  const distBin = path.join(projectRoot, 'node_modules/next/dist/bin/next');
  if (fs.existsSync(distBin)) return distBin;
  return 'next';
}

export function stopServer(child) {
  if (!child || child.killed) return;
  try {
    child.kill('SIGTERM');
  } catch {}
  try {
    if (child.pid) process.kill(-child.pid, 'SIGTERM');
  } catch {}
}

export async function waitForServer(port, timeoutMs = 45000) {
  const url = `http://127.0.0.1:${port}/login`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status === 200 || res.status === 307 || res.status === 302) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Production server failed to respond at ${url} within ${timeoutMs}ms`);
}

export async function run(runOptions = {}) {
  const config = readRuntimeConfig();
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const user = await getManagerUser(config);
  const session = await createSmokeSession(config, user);
  // R4: fail closed before spawning anything.
  await verifySmokeSessionRow(config, session.tokenHash);
  assertInlinedBuildUrl(config);

  const nextBin = findNextBin();
  const nextEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: config.anonKey,
    SUPABASE_URL: config.supabaseUrl,
    SUPABASE_ANON_KEY: config.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: config.serviceRoleKey,
    KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC: 'true',
  };

  let nextProcess = null;
  const cleanUp = async () => {
    if (nextProcess) {
      stopServer(nextProcess);
      nextProcess = null;
    }
    if (session?.tokenHash) {
      await deleteSmokeSession(config, session.tokenHash);
    }
  };

  const onSignal = () => {
    void cleanUp().then(() => process.exit(1));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    nextProcess = spawn(nextBin, ['start', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: projectRoot,
      env: nextEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForServer(port);

    const results = [];

    // Case (a): Login page reachable
    {
      const res = await fetch(`${baseUrl}/login`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      const status = res.status;
      const marker = (status === 200 && (html.includes('KURABE') || html.includes('Đăng nhập') || html.includes('Mã nhân viên')))
        ? 'present'
        : 'absent';
      console.log(`route=/login status=${status} marker=${marker}`);
      if (status !== 200 || marker !== 'present') {
        throw new Error(`Smoke case (a) login failed: status=${status} marker=${marker}`);
      }
      results.push({ name: 'login-page-reachable', route: '/login', status, marker, passed: true });
    }

    // Case (b): Dashboard loads with rendered marker
    {
      const res = await fetch(`${baseUrl}/dashboard`, {
        headers: { Cookie: session.cookie },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      const status = res.status;
      // R4: distinguish auth rejection (redirect / streamed NEXT_REDIRECT) from a marker miss.
      if (status === 302 || status === 303 || status === 307 || status === 308 || html.includes('NEXT_REDIRECT')) {
        throw new Error(`Smoke case (b) dashboard failed: auth-rejected session (status=${status}, flightRedirect=${html.includes('NEXT_REDIRECT')})`);
      }
      // R4: Next16 loading-boundary pages deliver resolved content via the RSC
      // flight payload instead of body markup — accept either as the marker.
      // Flight escapes quotes (\"viewer\":), so flatten before matching props.
      const flatHtml = html.replaceAll('\\', '');
      const flightResolved = flatHtml.includes('"viewer":') && flatHtml.includes('"periodId":');
      const marker = (status === 200 && (html.includes('Tổng quan hệ thống') || html.includes('data-load-layer="shell"') || flightResolved))
        ? 'present'
        : 'absent';
      console.log(`route=/dashboard status=${status} marker=${marker} flightResolved=${flightResolved}`);
      if (status !== 200 || marker !== 'present') {
        throw new Error(`Smoke case (b) dashboard failed: status=${status} marker=${marker} flightResolved=${flightResolved}`);
      }
      results.push({ name: 'dashboard-loads-with-marker', route: '/dashboard', status, marker, passed: true });
    }

    // Case (c): Employees loads
    {
      const res = await fetch(`${baseUrl}/employees`, {
        headers: { Cookie: session.cookie },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      const status = res.status;
      if (status === 302 || status === 303 || status === 307 || status === 308 || html.includes('NEXT_REDIRECT')) {
        throw new Error(`Smoke case (c) employees failed: auth-rejected session (status=${status}, flightRedirect=${html.includes('NEXT_REDIRECT')})`);
      }
      const flatHtml = html.replaceAll('\\', '');
      const flightResolved = flatHtml.includes('"initialViewer":');
      const marker = (status === 200 && (html.includes('Quản lý Nhân sự QAQC') || html.includes('data-load-layer="shell"') || flightResolved))
        ? 'present'
        : 'absent';
      console.log(`route=/employees status=${status} marker=${marker} flightResolved=${flightResolved}`);
      if (status !== 200 || marker !== 'present') {
        throw new Error(`Smoke case (c) employees failed: status=${status} marker=${marker} flightResolved=${flightResolved}`);
      }
      results.push({ name: 'employees-loads', route: '/employees', status, marker, passed: true });
    }

    // Case (d): Reports loads
    {
      const res = await fetch(`${baseUrl}/reports`, {
        headers: { Cookie: session.cookie },
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();
      const status = res.status;
      if (status === 302 || status === 303 || status === 307 || status === 308 || html.includes('NEXT_REDIRECT')) {
        throw new Error(`Smoke case (d) reports failed: auth-rejected session (status=${status}, flightRedirect=${html.includes('NEXT_REDIRECT')})`);
      }
      const flatHtml = html.replaceAll('\\', '');
      const flightResolved = flatHtml.includes('"viewer":') && flatHtml.includes('"periodId":');
      const marker = (status === 200 && (html.includes('Báo cáo QAQC') || html.includes('data-load-layer="shell"') || flightResolved))
        ? 'present'
        : 'absent';
      console.log(`route=/reports status=${status} marker=${marker} flightResolved=${flightResolved}`);
      if (status !== 200 || marker !== 'present') {
        throw new Error(`Smoke case (d) reports failed: status=${status} marker=${marker} flightResolved=${flightResolved}`);
      }
      results.push({ name: 'reports-loads', route: '/reports', status, marker, passed: true });
    }

    // Case (e): One protected route redirect for an unauthenticated session.
    // R4: /dashboard has a loading.tsx boundary, so Next flushes the shell first
    // and the redirect streams as NEXT_REDIRECT inside an HTTP 200 — an HTTP 307
    // header can never arrive. Accept either transport of the same redirect.
    {
      const res = await fetch(`${baseUrl}/dashboard`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      });
      const status = res.status;
      const location = res.headers.get('location') || '';
      const html = status === 200 ? await res.text() : '';
      const httpRedirect = status === 307 || status === 302 || status === 303 || status === 308;
      const flightRedirect = !httpRedirect && html.includes('NEXT_REDIRECT') && html.includes('/login');
      const locationOk = location === '/login' || location.endsWith('/login') || location.includes('/login');
      const isRedirect = (httpRedirect && locationOk) || flightRedirect;
      const marker = isRedirect ? 'present' : 'absent';
      console.log(`route=/dashboard status=${status} mode=${httpRedirect ? 'http' : flightRedirect ? 'flight' : 'none'} marker=${marker}`);
      if (!isRedirect) {
        throw new Error(`Smoke case (e) protected redirect failed: status=${status} location=${location} flightRedirect=${flightRedirect} marker=${marker}`);
      }
      results.push({ name: 'protected-route-redirect-unauthenticated', route: '/dashboard', status, marker, passed: true });
    }

    assert.equal(results.length, 5, 'Must execute exactly 5 smoke cases');

    return {
      real: true,
      passed: true,
      tier: 'real-DB',
      status: 'EXECUTED',
      cases: results.map((r) => r.name),
      target: `127.0.0.1:${port}`,
      count: results.length,
    };
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await cleanUp();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    if (!result.passed) {
      console.error('PRODUCTION_SMOKE FAIL');
      process.exit(1);
    }
    console.log(`PRODUCTION_SMOKE PASS cases=${result.cases.length}`);
  } catch (error) {
    console.error(`PRODUCTION_SMOKE FAIL: ${error?.message || error}`);
    process.exit(1);
  }
}
