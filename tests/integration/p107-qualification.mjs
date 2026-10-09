#!/usr/bin/env node
/**
 * P107M1T10 integrated exact-candidate qualification (integration lane).
 *
 * Proves the P107 deliverables against REAL local services on one frozen candidate:
 *   - the P107 DB producers (T03 read/appointed-Leader authority, T04 seed CAS,
 *     T05 roster/personnel + named races, T07 lifecycle/return-resubmit + rollback/reapply)
 *     are re-executed through their existing self-contained disposable-PostgreSQL producers;
 *   - the integrated candidate's SQL catalog/ACL/function/trigger fingerprints are read
 *     back from the running runtime DB and bound to the evidence artifact;
 *   - real local HTTP/Next + actual PostgREST ACL probes (anon denied / service_role
 *     allowed on the revoked config reader) run read-only against the shared runtime.
 *
 * It intentionally does NOT re-run the P103 confirmation-matrix (that is a separate
 * required suite whose delegates are not idempotent within one runtime); it also never
 * mutates the shared runtime fixture graph, so it is order-safe next to that suite.
 * It never edits product src, never touches production, and reports 0/0.
 *
 * Run: node scripts/verify-release.mjs --suite p107-qualification --tier authenticated \
 *        --evidence "$EVIDENCE/p107.json"
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateRuntimeEnvironment } from '../support/confirmation-runtime.mjs';
import { ACCEPTANCE_PRODUCERS, P107_PRODUCER_CASES, P107_HTTP_CASES } from '../fixtures/p107/qualification/required-cases.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');
export const TASK_ID = 'P107M1T10';
export const NATIVE_TIER = 'authenticated';

export const REQUIRED_CASES = Object.freeze([...P107_PRODUCER_CASES, ...P107_HTTP_CASES]);

const CANDIDATE_RPC_NAMES = [
  'save_evaluation_round_transaction_active_only',
  'return_evaluation_round_transaction',
  'get_active_criteria_config',
  'get_active_grade_config',
  'apply_personnel_transaction',
  'create_evaluation_period_transaction',
];

function safeError(error) {
  return String(error?.stderr || error?.message || error)
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function git(args) {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
}

function candidateIdentity(env = process.env) {
  const gitHead = git(['rev-parse', 'HEAD']);
  const candidateSha = env.KURABE_CONFIRMATION_CANDIDATE_SHA || gitHead;
  assert.match(candidateSha, /^[0-9a-f]{40}$/i, 'candidate SHA must be a full commit SHA');
  assert.equal(candidateSha, gitHead, `P107_CANDIDATE_SHA_MISMATCH candidate=${candidateSha} head=${gitHead}`);
  return { candidateSha, baseSha: env.KURABE_P107_BASE_SHA || null, head: gitHead };
}

function sha256File(relative) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(projectRoot, relative))).digest('hex');
}

function migrationFingerprints() {
  const dir = path.join(projectRoot, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();
  return {
    count: files.length,
    sha256: Object.fromEntries(files.map((name) => [name, sha256File(path.join('supabase/migrations', name))])),
  };
}

function psqlJson(target, sql) {
  const raw = execFileSync('psql', [
    '-X', '-h', target.host, '-p', String(target.port), '-U', target.user, '-d', target.database,
    '-At', '-v', 'ON_ERROR_STOP=1',
  ], {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: target.password, PGPASSFILE: '/dev/null' },
  }).trim();
  return raw ? JSON.parse(raw) : null;
}

/** Real readback of the integrated candidate catalog: function signatures + effective
 *  ACLs + trigger definitions, captured from the running disposable runtime DB. */
function catalogFingerprints(dbTarget) {
  const names = CANDIDATE_RPC_NAMES.map((name) => `'${name}'`).join(',');
  const functions = psqlJson(dbTarget, `
    SELECT COALESCE(json_agg(row_to_json(f) ORDER BY f.signature), '[]'::json)::text FROM (
      SELECT p.oid::regprocedure::text AS signature,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
             has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role,
             EXISTS (
               SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
               WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
             ) AS public_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN (${names})
    ) f;
  `);
  const triggers = psqlJson(dbTarget, `
    SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.table_name, t.name), '[]'::json)::text FROM (
      SELECT tr.tgname AS name, c.relname AS table_name, pg_get_triggerdef(tr.oid) AS definition
      FROM pg_trigger tr JOIN pg_class c ON c.oid = tr.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND NOT tr.tgisinternal
    ) t;
  `);
  return {
    candidateFunctions: functions,
    candidateTriggers: triggers,
    functionDigest: crypto.createHash('sha256').update(JSON.stringify(functions)).digest('hex'),
    triggerDigest: crypto.createHash('sha256').update(JSON.stringify(triggers)).digest('hex'),
  };
}

function producerToken(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0].split('=')[0];
}

/** Spawn one self-contained disposable-PostgreSQL acceptance producer and collect its cases. */
function runProducer(producer) {
  const scriptPath = path.join(projectRoot, producer.script);
  assert.ok(fs.existsSync(scriptPath), `P107_PRODUCER_MISSING ${producer.script}`);
  const started = Date.now();
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 900_000,
    env: { ...process.env },
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const markerLine = stdout.split('\n').find((line) => line.startsWith(producer.marker));
  const passed = result.status === 0 && markerLine && / PASS /.test(markerLine);
  if (!passed) {
    throw new Error(`P107_PRODUCER_FAILED ${producer.area} status=${result.status} marker=${markerLine ? 'present' : 'missing'} stderr=${safeError(stderr).slice(-700)}`);
  }
  const cases = [];
  let inCases = false;
  let preDigest = null;
  let postDigest = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith(producer.marker)) { inCases = true; continue; }
    if (!inCases) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('PRE_DIGEST=')) { preDigest = trimmed.slice('PRE_DIGEST='.length); continue; }
    if (trimmed.startsWith('POST_DIGEST=')) { postDigest = trimmed.slice('POST_DIGEST='.length); continue; }
    const token = producerToken(trimmed);
    if (token && /^[A-Za-z0-9][A-Za-z0-9+_.:-]*$/.test(token)) cases.push(token);
  }
  return {
    area: producer.area,
    taskId: producer.taskId,
    script: producer.script,
    status: 'PASS',
    declaredCases: Number((markerLine.match(/cases=(\d+)/) || [])[1] || NaN),
    cases,
    preDigest,
    postDigest,
    durationMs: Date.now() - started,
  };
}

/** Read-only real HTTP/Next + actual PostgREST ACL probes against the shared runtime. */
async function httpQualification(runtime) {
  const nextUrl = (process.env.KURABE_CONFIRMATION_NEXT_URL || process.env.KURABE_P107_NEXT_URL || '').replace(/\/$/, '');
  assert.ok(nextUrl, 'KURABE_CONFIRMATION_NEXT_URL is required for the real HTTP/Next probe');
  assert.match(nextUrl, /^https?:\/\/(127\.0\.0\.1|localhost|::1)(?::\d+)?$/, 'Next probe must target a loopback origin');
  const supabaseUrl = String(runtime.supabaseUrl || '').replace(/\/$/, '');
  const anonKey = runtime.anonKey;
  const serviceRoleKey = runtime.serviceRoleKey;
  assert.ok(supabaseUrl && anonKey && serviceRoleKey, 'PostgREST probe requires the runtime Supabase URL + keys');
  const cases = [];
  const timeout = { signal: AbortSignal.timeout(20_000) };

  const login = await fetch(`${nextUrl}/login`, { redirect: 'manual', ...timeout });
  assert.ok([200, 302, 307].includes(login.status), `NEXT_LOGIN_UNREACHABLE status=${login.status}`);
  await login.arrayBuffer().catch(() => {});
  cases.push('http:next-login-reachable');

  const root = await fetch(`${supabaseUrl}/rest/v1/`, { headers: { apikey: anonKey }, ...timeout });
  assert.ok(root.status > 0 && root.status < 500, `POSTGREST_ROOT_UNREACHABLE status=${root.status}`);
  await root.arrayBuffer().catch(() => {});
  cases.push('http:postgrest-rest-root-reachable');

  const anonRpc = await fetch(`${supabaseUrl}/rest/v1/rpc/get_active_criteria_config`, {
    method: 'POST',
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
    body: '{}',
    ...timeout,
  });
  assert.ok(anonRpc.status >= 400, `ANON_RPC_MUST_BE_DENIED status=${anonRpc.status}`);
  await anonRpc.arrayBuffer().catch(() => {});
  cases.push('http:postgrest-anon-rpc-denied');

  const serviceRpc = await fetch(`${supabaseUrl}/rest/v1/rpc/get_active_criteria_config`, {
    method: 'POST',
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, 'Content-Type': 'application/json' },
    body: '{}',
    ...timeout,
  });
  assert.ok(serviceRpc.status >= 200 && serviceRpc.status < 300, `SERVICE_RPC_MUST_BE_ALLOWED status=${serviceRpc.status}`);
  await serviceRpc.arrayBuffer().catch(() => {});
  cases.push('http:postgrest-service-rpc-allowed');

  return { cases, anonRpcStatus: anonRpc.status, serviceRpcStatus: serviceRpc.status, nextStatus: login.status, restRootStatus: root.status };
}

function producerResidue() {
  const containers = execFileSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n').map((line) => line.trim()).filter((name) => /-p107t0/.test(name));
  const networks = execFileSync('docker', ['network', 'ls', '--format', '{{.Name}}'], { encoding: 'utf8' })
    .split('\n').map((line) => line.trim()).filter((name) => /p107t0/.test(name));
  return { containers, networks };
}

function writeEvidence(filePath, payload) {
  if (!filePath) return null;
  assert.ok(path.isAbsolute(filePath), 'evidence path must be absolute');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sanitized = JSON.parse(safeError(JSON.stringify(payload)));
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  return filePath;
}

export async function run(context = {}) {
  const options = context?.options || {};
  const evidencePath = options.evidence || process.env.KURABE_P107_INTEGRATION_EVIDENCE;
  const detailPath = evidencePath ? `${evidencePath}.p107-integration.json` : null;
  let identity = null;
  try {
    identity = candidateIdentity(process.env);
    const runtime = validateRuntimeEnvironment(process.env);
    const migrations = migrationFingerprints();

    // ---- 1. P107 DB acceptance producers (real disposable PostgreSQL, each self-owned) ----
    const producerResults = [];
    const cases = [];
    for (const producer of ACCEPTANCE_PRODUCERS) {
      const result = runProducer(producer);
      producerResults.push(result);
      for (const token of result.cases) cases.push(`p107-${producer.area}:${token}`);
    }
    const observed = new Set(cases);
    for (const required of P107_PRODUCER_CASES) {
      assert.ok(observed.has(required), `P107 producer case was not executed: ${required}`);
    }

    // ---- 2. Real HTTP/Next + actual PostgREST ACL probes (read-only, order-safe) ----
    const http = await httpQualification(runtime);
    for (const name of http.cases) cases.push(name);

    // ---- 3. Catalog/ACL/function/trigger fingerprints bound to the artifact ----
    const catalog = catalogFingerprints(runtime.dbTarget);
    assert.ok(catalog.candidateFunctions.length > 0, 'candidate function fingerprints are empty');
    assert.ok(catalog.candidateTriggers.length > 0, 'candidate trigger fingerprints are empty');

    // ---- 4. Crash-safe ownership + residue readback ----
    const residue = producerResidue();
    assert.deepEqual(residue.containers, [], `P107 producer container residue: ${residue.containers.join(',')}`);
    assert.deepEqual(residue.networks, [], `P107 producer network residue: ${residue.networks.join(',')}`);

    const caseIds = cases.filter((item) => typeof item === 'string');
    assert.equal(new Set(caseIds).size, caseIds.length, 'P107 integration produced duplicate case ids');
    for (const required of REQUIRED_CASES) {
      assert.ok(caseIds.includes(required), `P107 integration required case missing: ${required}`);
    }

    const evidence = {
      format: 'kurabe-p107m1t10-qualification-integration/v1',
      taskId: TASK_ID,
      tier: NATIVE_TIER,
      authenticated: true,
      status: 'QUALIFIED',
      generatedAt: new Date().toISOString(),
      candidate: identity,
      runtime: {
        stack: 'owned-loopback-disposable',
        database: 'redacted-disposable-database',
        target: 'real-disposable-postgresql-postgrest-next-authenticated',
      },
      migrations,
      catalogFingerprints: catalog,
      httpProbes: {
        nextStatus: http.nextStatus,
        restRootStatus: http.restRootStatus,
        anonRpcStatus: http.anonRpcStatus,
        serviceRpcStatus: http.serviceRpcStatus,
      },
      producers: producerResults,
      requiredCases: [...REQUIRED_CASES],
      cases: caseIds,
      caseCount: caseIds.length,
      residue,
      cleanup: { ownedDisposableRuntimeOnly: true, residue: 0, productionWrites: 0, productionMigrations: 0 },
      productionWrites: 0,
      productionMigrations: 0,
    };
    writeEvidence(detailPath, evidence);

    return {
      real: true,
      passed: true,
      tier: NATIVE_TIER,
      authenticated: true,
      status: 'QUALIFIED',
      cases: caseIds,
      authenticatedCases: caseIds.length,
      requiredCases: [...REQUIRED_CASES],
      candidateSha: identity.candidateSha,
      baseSha: identity.baseSha,
      taskId: TASK_ID,
      evidencePath: detailPath,
      richEvidence: evidence,
      productionWrites: 0,
      productionMigrations: 0,
      target: 'real-disposable-postgresql-postgrest-next-authenticated-integrated',
    };
  } catch (error) {
    const failure = {
      format: 'kurabe-p107m1t10-qualification-integration/v1',
      taskId: TASK_ID,
      tier: NATIVE_TIER,
      authenticated: false,
      status: error?.code === 'MISSING_RUNTIME_CAPABILITY' ? 'BLOCKED_CAPABILITY' : 'UNKNOWN',
      generatedAt: new Date().toISOString(),
      requiredCases: [...REQUIRED_CASES],
      cases: [],
      firstFailure: safeError(error),
      candidate: identity || { baseSha: null, candidateSha: process.env.KURABE_CONFIRMATION_CANDIDATE_SHA || 'UNKNOWN' },
      cleanup: { ownedDisposableRuntimeOnly: true, residue: 'UNKNOWN', productionWrites: 0, productionMigrations: 0 },
    };
    writeEvidence(detailPath, failure);
    return {
      real: false,
      passed: false,
      tier: NATIVE_TIER,
      authenticated: false,
      status: failure.status,
      capability: error?.code || 'UNKNOWN',
      reason: failure.firstFailure,
      firstFailure: failure.firstFailure,
      cases: [],
      requiredCases: [...REQUIRED_CASES],
      evidencePath: detailPath,
      productionWrites: 0,
      productionMigrations: 0,
      target: 'no-qualified-p107-integration-evidence',
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await run({ options: { evidence: process.env.KURABE_P107_INTEGRATION_EVIDENCE } });
  console.log(`P107_QUALIFICATION_INTEGRATION ${result.status} cases=${(result.cases || []).length} tier=${result.tier}${result.reason ? ` firstFailure=${result.reason}` : ''}`);
  if (!result.passed) process.exitCode = 1;
}
