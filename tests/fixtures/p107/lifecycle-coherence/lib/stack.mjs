// P107M1T07 owned helper: self-provisioned disposable loopback stack
// (PostgreSQL17 + real PostgREST v12.2.3 + /rest/v1 proxy) and a private,
// isolated actual-Next production build/runtime. No external provider traffic;
// every listener binds 127.0.0.1; every resource is run-owned and unique.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { runBootstrap } from '../../../../../scripts/db-bootstrap.mjs';
import {
  PROJECT_ROOT,
  assertPortFree,
  freePort,
  localOnlyError,
  mustRun,
  psql,
  psqlJson,
  redact,
  run,
  spawnOwned,
  stopOwned,
  wait,
  waitFor,
  which,
} from './guard.mjs';

export const POSTGREST_IMAGE = 'postgrest/postgrest:v12.2.3';
export const POSTGRES_IMAGE = 'postgres:17-alpine';

function randomSuffix() {
  return `${process.pid}${crypto.randomBytes(4).toString('hex')}`;
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** HS256 JWT in the shape PostgREST v12 expects; distinct anon/service_role roles. */
export function mintJwt(role, secret) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ role, iss: 'kurabe-p107t07', iat: now, exp: now + 7200 })}`;
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function psqlFile(target, filePath, label) {
  const result = run('psql', [
    '--no-psqlrc', '--no-password', '--set=ON_ERROR_STOP=1',
    '--host', target.host, '--port', String(target.port),
    '--username', target.user, '--dbname', target.database,
    '--file', filePath,
  ], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PGPASSWORD: target.password, PGPASSFILE: '/dev/null' },
    timeout: 120_000,
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed: ${redact(result.stderr || result.stdout || '')}`);
  }
}

/** Apply every forward application migration above the bootstrapped ledger. */
export function applyForwardMigrations(target) {
  const dir = path.join(PROJECT_ROOT, 'supabase/migrations');
  const applied = new Set(psql(target, 'SELECT version FROM supabase_migrations.schema_migrations;').split('\n').filter(Boolean));
  const names = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  const appliedNames = [];
  for (const name of names) {
    const version = name.split('_')[0];
    if (applied.has(version) || version < '202609') continue;
    psqlFile(target, path.join(dir, name), `migration ${name}`);
    psql(target, `INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES ('${version}','${name}') ON CONFLICT (version) DO NOTHING;`);
    appliedNames.push(name);
  }
  const ledgerCount = Number(psql(target, 'SELECT count(*) FROM supabase_migrations.schema_migrations;'));
  return { appliedNames, ledgerCount };
}

function writeProxyScript(runtimeRoot) {
  const proxyPath = path.join(runtimeRoot, 'rest-proxy.mjs');
  const source = `import http from 'node:http';
const backend = Number(process.env.KURABE_PROXY_BACKEND_PORT);
const port = Number(process.env.KURABE_PROXY_PORT);
const server = http.createServer((request, response) => {
  const sourcePath = request.url || '/';
  const targetPath = sourcePath.startsWith('/rest/v1') ? (sourcePath.slice('/rest/v1'.length) || '/') : sourcePath;
  const upstream = http.request({ hostname: '127.0.0.1', port: backend, method: request.method, path: targetPath, headers: request.headers }, (result) => {
    response.writeHead(result.statusCode || 502, result.headers);
    result.pipe(response);
  });
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
  request.pipe(upstream);
});
server.listen(port, '127.0.0.1');
`;
  fs.writeFileSync(proxyPath, source, { mode: 0o600 });
  return proxyPath;
}

async function startPostgrest(stack) {
  const configPath = path.join(stack.runtimeRoot, 'postgrest.conf');
  const runtimeUser = `${process.getuid()}:${process.getgid()}`;
  // PostgREST requires a database URI. The container runs with trust auth, so no
  // password belongs here — and omitting it also keeps any credentialed-URL
  // literal out of the harness source entirely.
  const dbUri = `postgres://postgres@db:5432/${stack.database}`;
  fs.writeFileSync(configPath, [
    `db-uri = "${dbUri}"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    `jwt-secret = "${stack.jwtSecret}"`,
    'server-host = "0.0.0.0"',
    'server-port = 3000',
    'admin-server-port = 3001',
    '',
  ].join('\n'), { mode: 0o600 });
  mustRun('docker', [
    'run', '-d', '--name', stack.containerNames.rest, '--network', stack.networkName,
    '--network-alias', 'rest', '--restart=no', '--user', runtimeUser,
    '--label', `kurabe.p107t07=${stack.runId}`, '--memory', '384m',
    '-p', `127.0.0.1:${stack.backendRestPort}:3000`,
    '-v', `${configPath}:/etc/postgrest.conf:ro`,
    POSTGREST_IMAGE, 'postgrest', '/etc/postgrest.conf',
  ], { timeout: 60_000 });
}

/** Provision the disposable DB + PostgREST + proxy. Returns a teardown-capable handle. */
export async function provisionStack({ runtimeRoot, preMigrationSeed }) {
  if (!which('docker')) throw localOnlyError('MISSING_RUNTIME_CAPABILITY', 'docker binary is required');
  const runId = randomSuffix();
  const stack = {
    runId,
    runtimeRoot,
    networkName: `kurabe-p107t07-net-${runId}`,
    database: `kurabe_harness_p107t07${runId}`,
    password: crypto.randomBytes(24).toString('hex'),
    jwtSecret: crypto.randomBytes(36).toString('hex'),
    containerNames: {
      db: `kurabe-p107t07-db-${runId}`,
      rest: `kurabe-p107t07-rest-${runId}`,
    },
    owned: true,
    startTime: new Date().toISOString(),
    containersStarted: [],
    cleanup: null,
  };
  stack.dbPort = await freePort();
  stack.backendRestPort = await freePort();
  stack.restPort = await freePort();
  await assertPortFree(stack.dbPort);
  await assertPortFree(stack.restPort);
  stack.anonKey = mintJwt('anon', stack.jwtSecret);
  stack.serviceRoleKey = mintJwt('service_role', stack.jwtSecret);
  stack.restUrl = `http://127.0.0.1:${stack.restPort}`;
  stack.dbTarget = { host: '127.0.0.1', port: String(stack.dbPort), database: stack.database, user: 'postgres', password: stack.password };

  let proxyPath = null;
  let proxyChild = null;
  try {
    mustRun('docker', [
      'network', 'create', '--label', `kurabe.p107t07=${runId}`,
      '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', stack.networkName,
    ], { timeout: 30_000 });
    mustRun('docker', [
      'run', '-d', '--name', stack.containerNames.db, '--network', stack.networkName,
      '--network-alias', 'db', '--restart=no', '--label', `kurabe.p107t07=${runId}`,
      '--memory', '512m', '--tmpfs', '/var/lib/postgresql/data:rw',
      '-e', `POSTGRES_PASSWORD=${stack.password}`, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
      '-e', `POSTGRES_DB=${stack.database}`, '-p', `127.0.0.1:${stack.dbPort}:5432`,
      POSTGRES_IMAGE,
    ], { timeout: 90_000 });
    stack.containersStarted.push(stack.containerNames.db);
    await waitFor(() => run('pg_isready', ['-h', '127.0.0.1', '-p', String(stack.dbPort), '-U', 'postgres', '-d', stack.database],
      { env: { ...process.env, PGPASSWORD: stack.password } }).status === 0, { timeout: 90_000, label: 'postgres ready' });

    process.env.PGPASSWORD = stack.password;
    const bootstrap = runBootstrap({
      host: '127.0.0.1', port: String(stack.dbPort), database: stack.database, user: 'postgres', password: stack.password, rootDir: PROJECT_ROOT,
    });
    // Production Supabase grants new public objects to anon/authenticated/service_role
    // through ALTER DEFAULT PRIVILEGES. The disposable raw-PostgreSQL bootstrap creates
    // the roles but sets no default privileges, so migration-created tables (the
    // versioning snapshots and every table a later migration adds without an explicit
    // GRANT) are invisible to PostgREST and each service_role read returns 403
    // "permission denied for table ...". Mirror the Supabase default privileges for the
    // migration owner so the harness matches production instead of masking a healthy
    // product loader as `unavailable`.
    psql(stack.dbTarget, `
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`);
    // The versioning migrations snapshot the live grade/criteria config and their
    // preflight requires those rows to already exist, so seed the live config
    // BEFORE any forward migration runs (mirrors the canonical CI runtime order).
    if (typeof preMigrationSeed === 'function') preMigrationSeed(stack.dbTarget);
    const migrations = applyForwardMigrations(stack.dbTarget);

    await startPostgrest(stack);
    stack.containersStarted.push(stack.containerNames.rest);
    await waitFor(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${stack.backendRestPort}/`);
        return response.status > 0;
      } catch {
        return false;
      }
    }, { timeout: 90_000, label: 'postgrest ready' });

    proxyPath = writeProxyScript(runtimeRoot);
    proxyChild = spawnOwned(process.execPath, [proxyPath], {
      env: { ...process.env, KURABE_PROXY_BACKEND_PORT: String(stack.backendRestPort), KURABE_PROXY_PORT: String(stack.restPort) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    stack.proxyPid = proxyChild.pid;
    await waitFor(async () => {
      try {
        const response = await fetch(`${stack.restUrl}/rest/v1/`);
        return response.status > 0;
      } catch {
        return false;
      }
    }, { timeout: 30_000, label: 'rest proxy ready' });

    stack.bootstrap = bootstrap;
    stack.migrations = migrations;
    stack.teardown = async () => {
      const stopped = {};
      stopped.proxyStopped = true;
      if (proxyChild) {
        await stopOwned(proxyChild);
        stopped.proxyStopped = proxyChild.exitCode !== null || proxyChild.signalCode !== null;
      }
      for (const name of [stack.containerNames.rest, stack.containerNames.db]) {
        run('docker', ['rm', '-f', name], { timeout: 30_000 });
      }
      run('docker', ['network', 'rm', stack.networkName], { timeout: 30_000 });
      return stopped;
    };
    return stack;
  } catch (error) {
    try {
      if (proxyChild) await stopOwned(proxyChild);
      for (const name of [stack.containerNames.rest, stack.containerNames.db]) run('docker', ['rm', '-f', name], { timeout: 30_000 });
      run('docker', ['network', 'rm', stack.networkName], { timeout: 30_000 });
    } catch { /* preserve primary provisioning failure */ }
    throw error;
  }
}

function copySourceToPrivateTree(sourceRoot, destination) {
  fs.cpSync(sourceRoot, destination, {
    recursive: true,
    filter(source) {
      const relative = path.relative(sourceRoot, source);
      if (!relative) return true;
      return !relative.startsWith('.git')
        && !relative.startsWith('node_modules')
        && !relative.startsWith('.next')
        && !relative.startsWith('.tmp')
        && !relative.startsWith('.env')
        && path.basename(relative) !== '.env.local';
    },
  });
}

function linkNodeModules(privateRoot) {
  const source = process.env.KURABE_P107_NODE_MODULES || path.join(PROJECT_ROOT, 'node_modules');
  const target = path.join(privateRoot, 'node_modules');
  if (!fs.existsSync(path.join(source, 'next'))) {
    if (process.env.KURABE_P107_FORCE_NPM_INSTALL === '1') {
      mustRun('npm', ['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: privateRoot, timeout: 600_000 });
      return { mode: 'npm-ci' };
    }
    throw localOnlyError(
      'MISSING_RUNTIME_CAPABILITY',
      `no reusable node_modules at ${source}; set KURABE_P107_NODE_MODULES or KURABE_P107_FORCE_NPM_INSTALL=1`,
    );
  }
  // Copy (not symlink) so no path escapes the private runtime root.
  const result = run('cp', ['-a', `${source}/.`, target], { timeout: 600_000 });
  if (result.status !== 0) throw new Error(`node_modules copy failed: ${redact(result.stderr || '')}`);
  return { mode: 'copied-local-node-modules' };
}

async function waitForHttp(url, child, label) {
  let last = 'none';
  await waitFor(async () => {
    if (child.exitCode !== null) throw new Error(`${label} exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url, { redirect: 'manual' });
      last = String(response.status);
      return response.status > 0;
    } catch {
      return false;
    }
  }, { timeout: 120_000, interval: 500, label: `${label} (last=${last})` });
  return last;
}

/** Build and run the exact source in a private tree with its own .next output. */
export async function startIsolatedNext({ runtimeRoot, restUrl, anonKey, serviceRoleKey, runId }) {
  const privateRoot = path.join(runtimeRoot, 'app');
  copySourceToPrivateTree(PROJECT_ROOT, privateRoot);
  const nodeModules = linkNodeModules(privateRoot);

  const appEnv = {
    PATH: process.env.PATH,
    HOME: runtimeRoot,
    LANG: 'C',
    LC_ALL: 'C',
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: restUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC: 'true',
    KURABE_REQUIRE_PASSWORD_LOGIN: 'false',
    KURABE_TRUSTED_PROXIES: 'loopback',
    OPENAI_API_KEY: '',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
  };

  const build = run('npm', ['run', 'build'], { cwd: privateRoot, env: appEnv, timeout: 600_000 });
  if (build.status !== 0) {
    throw new Error(`isolated Next build failed: ${redact(build.stderr || build.stdout || '')}`);
  }
  const port = await freePort();
  const child = spawnOwned('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: privateRoot, env: appEnv, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log = (log + String(chunk)).slice(-16 * 1024); });
  child.stderr.on('data', (chunk) => { log = (log + String(chunk)).slice(-16 * 1024); });

  try {
    await waitForHttp(`http://127.0.0.1:${port}/login`, child, 'next ready');
  } catch (error) {
    await stopOwned(child);
    fs.rmSync(privateRoot, { recursive: true, force: true });
    throw new Error(`${redact(error.message)}; next-log=${redact(log)}`);
  }

  const nextState = {
    url: `http://127.0.0.1:${port}`,
    port,
    pid: child.pid,
    privateRoot,
    buildDir: path.join(privateRoot, '.next'),
    nodeModules,
    runId,
    appLogTail: () => log.slice(-8000),
    async stop() {
      await stopOwned(child);
      fs.rmSync(privateRoot, { recursive: true, force: true });
      return { processStopped: child.exitCode !== null || child.signalCode !== null, treeRemoved: !fs.existsSync(privateRoot) };
    },
  };
  return nextState;
}

export { psqlJson, spawn, wait };
