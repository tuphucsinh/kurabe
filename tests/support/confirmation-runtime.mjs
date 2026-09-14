#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE_SHA,
  TASK_ID,
  FIXTURE_ACTORS,
  FIXTURE_TEAMS,
  FIXTURE_PERIODS,
  FIXTURE_ACTIVE_EVAL_ID,
  FIXTURE_CLOSED_EVAL_ID,
  FIXTURE_LEADER_A_ID,
  FIXTURE_RUN_ID,
  locatePsql,
  psql,
  psqlJson,
  seedConfirmationFixtures,
  cleanupConfirmationFixtures,
  createActorSession,
  verifyActorSessions,
  createH2PrerequisiteWorkaround,
} from './confirmation-fixtures.mjs';
import { runBootstrap } from '../../scripts/db-bootstrap.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
function isPrivatePeerAddress(value) {
  if (!value) return false;
  if (LOOPBACK_HOSTS.has(value)) return true;
  if (/^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(value)) return true;
  if (/^192\.168\.(?:\d{1,3}\.)\d{1,3}$/.test(value)) return true;
  const match = value.match(/^172\.(\d{1,3})\.(?:\d{1,3}\.)\d{1,3}$/);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}
const DATABASE_PATTERN = /^kurabe_harness_[a-z0-9_]+$/;

export const REQUIRED_RUNTIME_ENV_VARS = [
  'KURABE_LOCAL_STACK_OWNED',
  'KURABE_SUPABASE_URL',
  'KURABE_SUPABASE_ANON_KEY',
  'KURABE_SUPABASE_SERVICE_ROLE_KEY',
  'KURABE_DB_HOST',
  'KURABE_DB_PORT',
  'KURABE_DB_NAME',
  'KURABE_DB_USER',
  'KURABE_DB_PASSWORD',
  'KURABE_SUPABASE_STACK_NAME',
  'KURABE_SUPABASE_NETWORK_ID',
  'KURABE_CONFIRMATION_CANDIDATE_SHA',
  'KURABE_CONFIRMATION_CHANGED_FILES_SHA256',
];

function safeError(error) {
  return String(error?.message || error)
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

export function verifyCandidateFiles(rootDir, expectedHashes) {
  const allowed = new Set([
    'tests/confirmation-harness-contract.test.ts',
    'tests/support/confirmation-fixtures.mjs',
    'tests/support/confirmation-runtime.mjs',
  ]);
  const paths = Object.keys(expectedHashes);
  if (paths.length !== allowed.size || paths.some((filePath) => !allowed.has(filePath))) {
    const error = new Error('INVALID_CANDIDATE_BINDING: changed-file manifest does not match the task allowlist');
    error.code = 'INVALID_CANDIDATE_BINDING';
    throw error;
  }
  const actual = {};
  for (const filePath of paths) {
    const absolutePath = path.resolve(rootDir, filePath);
    if (!absolutePath.startsWith(`${path.resolve(rootDir)}${path.sep}`)) {
      const error = new Error('INVALID_CANDIDATE_BINDING: changed-file path escapes project root');
      error.code = 'INVALID_CANDIDATE_BINDING';
      throw error;
    }
    actual[filePath] = crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
    if (actual[filePath] !== expectedHashes[filePath]) {
      const error = new Error(`INVALID_CANDIDATE_BINDING: changed-file hash mismatch path=${filePath}`);
      error.code = 'INVALID_CANDIDATE_BINDING';
      throw error;
    }
  }
  return actual;
}

/**
 * Validates disposable database target properties.
 * Enforces loopback, non-production, disposable name pattern.
 */
export function validateConfirmationTarget(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('REFUSE_INVALID_TARGET: options must be an object');
  }

  // 1. Host loopback guard
  const host = options.host || options.dbHost;
  if (!host || !LOOPBACK_HOSTS.has(host)) {
    const error = new Error(`REFUSE_NON_LOOPBACK_HOST host=${host}`);
    error.code = 'REFUSE_NON_LOOPBACK_HOST';
    throw error;
  }

  // 2. Port guard
  const rawPort = options.port || options.dbPort;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error(`INVALID_DB_PORT port=${rawPort}`);
    error.code = 'INVALID_DB_PORT';
    throw error;
  }

  // 3. Database name guard
  const database = options.database || options.dbName;
  if (!database) {
    const error = new Error('REFUSE_MISSING_DATABASE: database is required');
    error.code = 'REFUSE_MISSING_DATABASE';
    throw error;
  }
  if (/production|prod/i.test(database)) {
    const error = new Error(`REFUSE_PRODUCTION_DATABASE database=${database}`);
    error.code = 'REFUSE_PRODUCTION_DATABASE';
    throw error;
  }
  if (!DATABASE_PATTERN.test(database)) {
    const error = new Error(`REFUSE_NON_DISPOSABLE_DATABASE database=${database}`);
    error.code = 'REFUSE_NON_DISPOSABLE_DATABASE';
    throw error;
  }

  // 4. User guard
  const user = options.user || options.dbUser;
  if (user && user !== 'postgres' && !/^[a-z_][a-z0-9_]*$/i.test(user)) {
    const error = new Error(`REFUSE_NON_DISPOSABLE_USER user=${user}`);
    error.code = 'REFUSE_NON_DISPOSABLE_USER';
    throw error;
  }

  // 5. Supabase URL egress guard (if provided)
  const supabaseUrl = options.supabaseUrl;
  if (supabaseUrl) {
    let parsed;
    try {
      parsed = new URL(supabaseUrl);
    } catch {
      const error = new Error(`INVALID_SUPABASE_URL url=${supabaseUrl}`);
      error.code = 'INVALID_SUPABASE_URL';
      throw error;
    }
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
      const error = new Error(`REFUSE_NON_LOOPBACK_URL host=${parsed.hostname}`);
      error.code = 'REFUSE_NON_LOOPBACK_URL';
      throw error;
    }
    if (/supabase\.co|amazonaws\.com|azure\.com|neon\.tech|vercel\.app/i.test(supabaseUrl)) {
      const error = new Error(`REFUSE_PRODUCTION_URL url=${supabaseUrl}`);
      error.code = 'REFUSE_PRODUCTION_URL';
      throw error;
    }
  }

  return {
    host,
    port,
    database,
    user: user || 'postgres',
    password: options.password || options.dbPassword,
  };
}

/**
 * Validates the runtime environment. Fails closed with MISSING_RUNTIME_CAPABILITY
 * when local stack environment is missing or unverified.
 */
export function validateRuntimeEnvironment(env = process.env) {
  const missing = [];
  for (const varName of REQUIRED_RUNTIME_ENV_VARS) {
    if (!env[varName]) {
      missing.push(varName);
    }
  }

  if (env.KURABE_LOCAL_STACK_OWNED !== '1' && !missing.includes('KURABE_LOCAL_STACK_OWNED')) {
    missing.push('KURABE_LOCAL_STACK_OWNED=1');
  }

  if (missing.length > 0) {
    const error = new Error(`MISSING_RUNTIME_CAPABILITY: local Supabase stack runtime env is missing (${missing.join(', ')})`);
    error.code = 'MISSING_RUNTIME_CAPABILITY';
    error.missing = missing;
    throw error;
  }

  if (!/^[0-9a-f]{40}$/i.test(env.KURABE_CONFIRMATION_CANDIDATE_SHA)) {
    const error = new Error('INVALID_CANDIDATE_BINDING: candidate SHA must be 40 hexadecimal characters');
    error.code = 'INVALID_CANDIDATE_BINDING';
    throw error;
  }

  let changedFileSha256;
  try {
    changedFileSha256 = JSON.parse(env.KURABE_CONFIRMATION_CHANGED_FILES_SHA256);
  } catch {
    const error = new Error('INVALID_CANDIDATE_BINDING: changed-file hash manifest is not valid JSON');
    error.code = 'INVALID_CANDIDATE_BINDING';
    throw error;
  }
  if (!changedFileSha256 || typeof changedFileSha256 !== 'object' || Array.isArray(changedFileSha256)) {
    const error = new Error('INVALID_CANDIDATE_BINDING: changed-file hash manifest must be an object');
    error.code = 'INVALID_CANDIDATE_BINDING';
    throw error;
  }
  for (const [filePath, digest] of Object.entries(changedFileSha256)) {
    if (path.isAbsolute(filePath) || filePath.includes('..') || !/^[0-9a-f]{64}$/i.test(digest)) {
      const error = new Error('INVALID_CANDIDATE_BINDING: changed-file manifest contains an unsafe path or digest');
      error.code = 'INVALID_CANDIDATE_BINDING';
      throw error;
    }
  }

  const dbTarget = validateConfirmationTarget({
    host: env.KURABE_DB_HOST,
    port: env.KURABE_DB_PORT,
    database: env.KURABE_DB_NAME,
    user: env.KURABE_DB_USER,
    password: env.KURABE_DB_PASSWORD,
    supabaseUrl: env.KURABE_SUPABASE_URL,
  });

  return {
    stackName: env.KURABE_SUPABASE_STACK_NAME,
    networkId: env.KURABE_SUPABASE_NETWORK_ID,
    supabaseUrl: env.KURABE_SUPABASE_URL,
    anonKey: env.KURABE_SUPABASE_ANON_KEY,
    serviceRoleKey: env.KURABE_SUPABASE_SERVICE_ROLE_KEY,
    dbTarget,
    candidateSha: env.KURABE_CONFIRMATION_CANDIDATE_SHA,
    changedFileSha256,
  };
}

/**
 * Captures the server identity for the disposable target.
 */
export function captureServerIdentity(target) {
  const sql = `
    SELECT json_build_object(
      'current_database', current_database(),
      'requested_host', '${target.host}',
      'client_addr', coalesce(host(inet_client_addr()), ''),
      'server_addr', coalesce(host(inet_server_addr()), ''),
      'server_port', inet_server_port(),
      'current_user', current_user,
      'server_version', current_setting('server_version'),
      'is_superuser', current_setting('is_superuser')
    )::text;
  `;
  return psqlJson(target, sql);
}

/**
 * Ensures the target database has the manifest and ledger applied.
 */
export function ensureDatabaseBootstrap(target, rootDir = projectRoot) {
  const relationCount = psql(target, `
    SELECT count(*)::int
    FROM information_schema.tables
    WHERE table_schema = 'public';
  `);

  if (Number(relationCount) !== 0) {
    const error = new Error(`REFUSE_NON_EMPTY_PUBLIC_SCHEMA relations=${relationCount}`);
    error.code = 'REFUSE_NON_EMPTY_PUBLIC_SCHEMA';
    throw error;
  }
  return runBootstrap({
    host: target.host,
    port: String(target.port),
    database: target.database,
    user: target.user,
    rootDir,
  });
}

/**
 * Core reusable confirmation runtime fixture lifecycle:
 * withConfirmationRuntime(options, callback) -> Promise<T>
 */
export async function withConfirmationRuntime(options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  if (typeof callback !== 'function') {
    throw new Error('withConfirmationRuntime requires a callback function');
  }

  const opts = options || {};
  const env = opts.env || process.env;
  const rootDir = opts.rootDir || projectRoot;

  // 1. Enforce ownership and runtime environment guards
  const envConfig = validateRuntimeEnvironment(env);
  const target = envConfig.dbTarget;
  const candidateFileHashes = verifyCandidateFiles(rootDir, envConfig.changedFileSha256);

  // 2. Ensure psql binary is available
  const psqlBin = locatePsql();
  if (!psqlBin) {
    const error = new Error('psql binary not found');
    error.code = 'MISSING_RUNTIME_CAPABILITY';
    throw error;
  }

  // 3. Verify server identity
  const serverIdentity = captureServerIdentity(target);
  assert.equal(serverIdentity.current_database, target.database, 'connected database name mismatch');
  assert.equal(serverIdentity.requested_host, target.host, 'requested database host is not loopback');
  assert.ok(isPrivatePeerAddress(serverIdentity.client_addr), 'connected client is not a private disposable peer');
  assert.ok(isPrivatePeerAddress(serverIdentity.server_addr), 'connected server is not a private disposable peer');
  assert.equal(serverIdentity.current_user, target.user, 'connected user mismatch');

  // 4. Ensure schema baseline and ledger replay
  const bootstrap = ensureDatabaseBootstrap(target, rootDir);

  // 5. Seed confirmation fixtures (six actors, three teams, two periods, controls)
  const ownership = {
    owned: true,
    localStackOwned: true,
    runId: FIXTURE_RUN_ID,
  };
  const h2Workaround = createH2PrerequisiteWorkaround(target);
  let runtime;
  try {
  const seedInfo = seedConfirmationFixtures(target, { ownership });

  // 6. Create sessions for all six synthetic actors and verify them
  const sessions = {};
  for (const alias of Object.keys(FIXTURE_ACTORS)) {
    sessions[alias] = createActorSession(target, alias);
  }
  const verifiedActors = await verifyActorSessions(target, sessions, {
    restUrl: envConfig.supabaseUrl,
    serviceRoleKey: envConfig.serviceRoleKey,
  });

  runtime = {
    kind: 'kurabe-confirmation-runtime',
    taskId: TASK_ID,
    baseSha: BASE_SHA,
    dbTarget: {
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.user,
    },
    restUrl: envConfig.supabaseUrl,
    candidateSha: envConfig.candidateSha,
    changedFileSha256: candidateFileHashes,
    bootstrap,
    ownership,
    serverIdentity,
    fixtures: {
      actors: FIXTURE_ACTORS,
      teams: FIXTURE_TEAMS,
      periods: FIXTURE_PERIODS,
      evaluations: {
        activeId: FIXTURE_ACTIVE_EVAL_ID,
        closedId: FIXTURE_CLOSED_EVAL_ID,
      },
      seedInfo,
    },
    verifiedActors,
    query(sql) {
      return psql(target, sql);
    },
    queryJson(sql) {
      return psqlJson(target, sql);
    },
    login(actorAlias) {
      const session = sessions[actorAlias];
      if (!session) throw new Error(`unknown actor alias: ${actorAlias}`);
      return { ...session };
    },
    createSession(actorAlias) {
      return createActorSession(target, actorAlias);
    },
    withH2PrerequisiteWorkaround(operation) {
      return h2Workaround(operation);
    },
    async cleanup() {
      return cleanupConfirmationFixtures(target, { ownership });
    },
    async isClean() {
      const allActorIds = Object.values(FIXTURE_ACTORS).map((a) => `'${a.id}'`).join(', ');
      const remaining = psql(target, `
        SELECT (
          (SELECT count(*) FROM public.sessions WHERE user_id IN (${allActorIds})) +
          (SELECT count(*) FROM public.users WHERE id IN (${allActorIds}))
        )::int AS remaining;
      `);
      return Number(remaining) === 0;
    },
  };

  return await callback(runtime);
  } finally {
    if (!opts.skipCleanup) {
      cleanupConfirmationFixtures(target, { ownership });
    }
  }
}

function parseCliArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') {
      options.help = true;
    } else if (arg === '--mode') {
      options.mode = argv[++i];
    } else if (arg === '--evidence') {
      options.evidence = argv[++i];
    }
  }
  return options;
}

async function runQualification(options) {
  const evidencePath = options.evidence ? path.resolve(options.evidence) : null;
  const cases = [];

  const result = await withConfirmationRuntime({ mode: 'qualify' }, async (runtime) => {
    // Case 1: Loopback & ownership guard
    assert.equal(runtime.ownership.owned, true);
    assert.equal(runtime.ownership.localStackOwned, true);
    cases.push('loopback-and-ownership-guard');

    // Case 2: Server identity verified
    assert.equal(runtime.serverIdentity.current_database, runtime.dbTarget.database);
    assert.equal(runtime.serverIdentity.requested_host, runtime.dbTarget.host);
    assert.ok(isPrivatePeerAddress(runtime.serverIdentity.client_addr));
    assert.ok(isPrivatePeerAddress(runtime.serverIdentity.server_addr));
    cases.push('loopback-db-server-identity-verified');

    // Case 3: Schema and manifest ledger boot verified
    assert.equal(runtime.bootstrap.passed, true, 'bootstrap must pass on a fresh target');
    assert.ok(runtime.bootstrap.ledgerCount > 0, 'migration ledger must be populated');
    assert.equal(runtime.candidateSha.length, 40, 'candidate SHA binding missing');
    assert.equal(Object.keys(runtime.changedFileSha256).length, 3, 'changed-file hash binding missing');
    const tablesCount = runtime.query(`
      SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public';
    `);
    assert.ok(Number(tablesCount) > 0, 'public tables must exist');
    cases.push('schema-and-manifest-ledger-boot');

    // Case 4: Six synthetic actors seeded
    assert.equal(runtime.verifiedActors.length, 6, 'expected exactly 6 verified actors');
    cases.push('six-synthetic-actors-seeded');

    // Case 5: Six sessions verified by actor ID
    for (const verified of runtime.verifiedActors) {
      assert.equal(verified.verified, true);
      assert.ok(verified.userId);
    }
    cases.push('six-sessions-verified-by-actor-id');

    // Case 6: Active and closed controls verified
    const activeEval = runtime.queryJson(`
      SELECT row_to_json(e)::text FROM (
        SELECT id, period_id, status FROM public.evaluations WHERE id = '${FIXTURE_ACTIVE_EVAL_ID}'
      ) e;
    `);
    assert.equal(activeEval.status, 'Draft');
    const closedEval = runtime.queryJson(`
      SELECT row_to_json(e)::text FROM (
        SELECT id, period_id, status FROM public.evaluations WHERE id = '${FIXTURE_CLOSED_EVAL_ID}'
      ) e;
    `);
    assert.equal(closedEval.status, 'Approved');
    cases.push('active-and-closed-controls-created');

    // Case 7: H2 prerequisite workaround verified
    await runtime.withH2PrerequisiteWorkaround(async () => {
      const leaderTeam = runtime.query(`
        SELECT team_id FROM public.users WHERE id = '${FIXTURE_LEADER_A_ID}';
      `);
      assert.equal(leaderTeam, FIXTURE_TEAMS.team_b.id, 'temporary primary B not set');
    });
    const restoredTeam = runtime.query(`
      SELECT team_id FROM public.users WHERE id = '${FIXTURE_LEADER_A_ID}';
    `);
    assert.equal(restoredTeam, FIXTURE_TEAMS.team_a.id, 'primary A not restored');
    cases.push('h2-prerequisite-workaround-verified');

    // Case 8: Exact residue zero verified on explicit cleanup
    const cleanupResult = await runtime.cleanup();
    assert.equal(cleanupResult.exactResidueZero, true);
    cases.push('exact-residue-zero-cleanup-verified');

    return {
      real: true,
      passed: true,
      tier: 'real-DB',
      status: 'QUALIFIED',
      taskId: TASK_ID,
      baseSha: BASE_SHA,
      candidateSha: runtime.candidateSha,
      changedFileSha256: runtime.changedFileSha256,
      bootstrap: runtime.bootstrap,
      cases,
      serverIdentity: runtime.serverIdentity,
      actors: runtime.verifiedActors.map((a) => ({ alias: a.alias, role: a.role, verified: true })),
      cleanup: cleanupResult,
    };
  });

  if (evidencePath) {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, JSON.stringify(result, null, 2), 'utf8');
  }

  return result;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));

  if (options.help) {
    console.log('Usage: node tests/support/confirmation-runtime.mjs --mode qualify [--evidence <absolute-path>]');
    return;
  }

  if (options.mode === 'qualify') {
    try {
      const result = await runQualification(options);
      console.log(`CONFIRMATION_RUNTIME PASS cases=${result.cases.length} status=${result.status} tier=${result.tier}`);
    } catch (error) {
      if (error?.code === 'MISSING_RUNTIME_CAPABILITY') {
        console.error(`CONFIRMATION_RUNTIME BLOCKED missing-runtime-env: ${error.message}`);
        process.exitCode = 1;
      } else {
        console.error(`CONFIRMATION_RUNTIME FAIL ${safeError(error)}`);
        process.exitCode = 1;
      }
    }
    return;
  }

  console.log('CONFIRMATION_RUNTIME API withConfirmationRuntime validateRuntimeEnvironment validateConfirmationTarget');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
