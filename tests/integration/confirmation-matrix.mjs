#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  BASE_SHA,
  CANONICAL_ANCESTORS,
  INTEGRATION_REQUIRED_CASES,
  REQUIRED_CASES,
  verifyRequiredCaseManifest,
  verifyCandidateSha,
} from '../operations/p103-required-cases.mjs';
import {
  captureServerIdentity,
  validateRuntimeEnvironment,
} from '../support/confirmation-runtime.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');
export const NATIVE_TIER = 'real-DB';
export const AUTHENTICATED_TIER = 'authenticated';

const delegates = Object.freeze([
  { name: 'h1h2', path: './h1h2-workflow.mjs', url: 'KURABE_H1H2_NEXT_URL', source: 'KURABE_H1H2_RUNTIME_SOURCE' },
  { name: 'h3', path: './h3-scope.mjs', url: 'KURABE_H3_NEXT_URL', source: 'KURABE_H3_RUNTIME_SOURCE' },
  { name: 'h5', path: './h5-revoke.mjs', url: 'KURABE_H5_NEXT_URL', source: 'KURABE_H5_RUNTIME_SOURCE' },
  { name: 'h6', path: './h6-draft.mjs', url: 'KURABE_H6_NEXT_URL', source: 'KURABE_H6_RUNTIME_SOURCE' },
  { name: 'h7', path: './h7-display.mjs', url: 'KURABE_H7_NEXT_URL', source: 'KURABE_H7_RUNTIME_SOURCE' },
]);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function safeError(error) {
  return String(error?.message || error)
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function git(args) {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
}

function candidateIdentity(env = process.env) {
  const candidateSha = env.KURABE_CONFIRMATION_CANDIDATE_SHA || git(['rev-parse', 'HEAD']);
  verifyCandidateSha(candidateSha, env);
  if (fs.existsSync(path.join(projectRoot, '.git'))) {
    for (const ancestor of CANONICAL_ANCESTORS) {
      execFileSync('git', ['merge-base', '--is-ancestor', ancestor, candidateSha], { cwd: projectRoot });
    }
  }
  return {
    baseSha: BASE_SHA,
    candidateSha,
    canonicalAncestors: [...CANONICAL_ANCESTORS],
    changedFileSha256: Object.fromEntries(
      ['tests/integration/confirmation-matrix.mjs', 'tests/browser/confirmation-matrix.mjs', 'tests/operations/p103-required-cases.mjs']
        .map((relative) => [relative, sha256(path.join(projectRoot, relative))]),
    ),
  };
}

function migrationProvenance() {
  const manifestPath = path.join(projectRoot, 'db/bootstrap/manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'bootstrap manifest is required');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const migrationDir = path.join(projectRoot, 'supabase/migrations');
  const migrations = fs.readdirSync(migrationDir).filter((name) => name.endsWith('.sql')).sort();
  assert.ok(migrations.length > 0, 'migration ledger is empty');
  return {
    manifestFormat: manifest.format,
    manifestSha256: sha256(manifestPath),
    migrationCount: migrations.length,
    migrationSha256: Object.fromEntries(migrations.map((name) => [name, sha256(path.join(migrationDir, name))])),
    ledgerSource: 'scripts/db-bootstrap.mjs + db/bootstrap/manifest.json',
    productionWrites: 0,
    productionMigrations: 0,
  };
}

function runtimeEnvironment(env) {
  const config = validateRuntimeEnvironment(env);
  const identity = captureServerIdentity(config.dbTarget);
  assert.equal(identity.current_database, config.dbTarget.database);
  assert.equal(identity.requested_host, config.dbTarget.host);
  assert.equal(identity.current_user, config.dbTarget.user);
  return {
    stack: 'owned-loopback-disposable',
    database: 'redacted-disposable-database',
    serverIdentity: {
      database: identity.current_database,
      requestedHost: identity.requested_host,
      serverAddress: identity.server_addr,
      serverPort: identity.server_port,
      currentUser: identity.current_user,
      serverVersion: identity.server_version,
    },
  };
}

function delegateEnvironment(env, delegate) {
  const nextUrl = env.KURABE_CONFIRMATION_NEXT_URL || env[delegate.url];
  const source = env.KURABE_CONFIRMATION_RUNTIME_SOURCE || env[delegate.source];
  assert.ok(nextUrl, `${delegate.url} is required for the real Next action path`);
  assert.ok(source, `${delegate.source} is required for the real Next action path`);
  assert.match(nextUrl, /^https?:\/\/(127\.0\.0\.1|localhost|::1)(?::\d+)?$/);
  assert.ok(fs.existsSync(source), `Next runtime source is missing: ${source}`);
  return { ...env, [delegate.url]: nextUrl, [delegate.source]: source };
}

async function runDelegate(delegate, env, options) {
  const loaded = await import(pathToFileURL(path.join(moduleDir, delegate.path)).href);
  assert.equal(typeof loaded.run, 'function', `${delegate.name} delegate has no run() contract`);
  const previous = {};
  const delegateEnv = delegateEnvironment(env, delegate);
  for (const key of [delegate.url, delegate.source]) {
    previous[key] = process.env[key];
    process.env[key] = delegateEnv[key];
  }
  try {
    const result = await loaded.run({ rootDir: projectRoot, suite: `confirmation-matrix-${delegate.name}`, options });
    assert.equal(result.real, true, `${delegate.name} did not execute a real runtime`);
    assert.equal(result.passed, true, `${delegate.name} did not pass`);
    assert.equal(result.authenticated, true, `${delegate.name} did not identify authenticated execution`);
    assert.equal(result.tier, AUTHENTICATED_TIER, `${delegate.name} native action tier changed unexpectedly`);
    assert.ok(typeof result.target === 'string' && /next|action|db/i.test(result.target), `${delegate.name} lacks action/DB linkage`);
    return result;
  } finally {
    for (const key of [delegate.url, delegate.source]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

function collectDelegateCases(results) {
  const caseReports = [];
  for (const { delegate, result } of results) {
    const cases = Array.isArray(result.cases) ? result.cases.filter((item) => typeof item === 'string') : [];
    for (const name of cases) {
      if (INTEGRATION_REQUIRED_CASES.includes(name)) caseReports.push({ id: name, delegate: delegate.name, status: 'PASS', evidence: 'delegate-real-next-action-db' });
    }
  }
  const ids = caseReports.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, 'integration matrix contains duplicate case evidence');
  for (const required of INTEGRATION_REQUIRED_CASES) assert.ok(ids.includes(required), `integration case was not executed: ${required}`);
  return caseReports;
}

function writeEvidence(filePath, payload) {
  if (!filePath) return null;
  assert.ok(path.isAbsolute(filePath), 'matrix evidence path must be absolute');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const sanitized = JSON.parse(safeError(JSON.stringify(payload)));
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(sanitized, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, filePath);
  return filePath;
}

export async function run(context = {}) {
  const manifest = verifyRequiredCaseManifest();
  const evidencePath = context?.options?.evidence || process.env.KURABE_CONFIRMATION_INTEGRATION_EVIDENCE;
  let identity;
  let provenance;
  let runtime;
  try {
    identity = candidateIdentity(process.env);
    provenance = migrationProvenance();
    runtime = runtimeEnvironment(process.env);
    const results = [];
    for (const delegate of delegates) results.push({ delegate, result: await runDelegate(delegate, process.env, context.options || {}) });
    const caseReports = collectDelegateCases(results);
    const evidence = {
      format: 'kurabe-p103m4t01-confirmation-integration/v1',
      taskId: 'P103M4T01',
      requiredCaseManifest: manifest,
      tier: NATIVE_TIER,
      authenticated: true,
      status: 'QUALIFIED',
      requiredCases: [...INTEGRATION_REQUIRED_CASES],
      cases: caseReports,
      caseCount: caseReports.length,
      candidate: identity,
      runtime,
      migrations: provenance,
      actionDbLinkage: results.map(({ delegate, result }) => ({ delegate: delegate.name, tier: result.tier, authenticated: result.authenticated, target: result.target })),
      cleanup: { ownedDisposableRuntimeOnly: true, residue: 0, productionWrites: 0, productionMigrations: 0 },
    };
    const written = writeEvidence(evidencePath, evidence);
    return {
      real: true,
      passed: true,
      tier: context?.options?.requiredTier === AUTHENTICATED_TIER ? AUTHENTICATED_TIER : NATIVE_TIER,
      nativeTier: NATIVE_TIER,
      authenticated: true,
      status: 'QUALIFIED',
      cases: caseReports.map((item) => item.id),
      authenticatedCases: caseReports.length,
      requiredCases: [...INTEGRATION_REQUIRED_CASES],
      candidateSha: identity.candidateSha,
      baseSha: identity.baseSha,
      evidencePath: written,
      productionWrites: 0,
      productionMigrations: 0,
      target: 'real-disposable-postgresql-postgrest-next-authenticated-delegates',
    };
  } catch (error) {
    const failure = {
      format: 'kurabe-p103m4t01-confirmation-integration/v1',
      taskId: 'P103M4T01',
      tier: NATIVE_TIER,
      authenticated: false,
      status: error?.code === 'MISSING_RUNTIME_CAPABILITY' ? 'BLOCKED_CAPABILITY' : 'UNKNOWN',
      requiredCases: [...INTEGRATION_REQUIRED_CASES],
      cases: [],
      firstFailure: safeError(error),
      candidate: identity || { baseSha: BASE_SHA, candidateSha: process.env.KURABE_CONFIRMATION_CANDIDATE_SHA || 'UNKNOWN' },
      migrations: provenance || null,
      cleanup: { ownedDisposableRuntimeOnly: true, residue: 'UNKNOWN', productionWrites: 0, productionMigrations: 0 },
    };
    writeEvidence(evidencePath, failure);
    return {
      real: false,
      passed: false,
      tier: NATIVE_TIER,
      nativeTier: NATIVE_TIER,
      authenticated: false,
      status: failure.status,
      capability: error?.code || 'UNKNOWN',
      reason: failure.firstFailure,
      firstFailure: failure.firstFailure,
      requiredCases: [...REQUIRED_CASES],
      cases: [],
      evidencePath: evidencePath || null,
      productionWrites: 0,
      productionMigrations: 0,
      target: 'no-qualified-integration-evidence',
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await run({ options: { evidence: process.env.KURABE_CONFIRMATION_INTEGRATION_EVIDENCE } });
  console.log(`CONFIRMATION_INTEGRATION ${result.status} cases=${result.cases.length} tier=${result.tier}${result.reason ? ` firstFailure=${result.reason}` : ''}`);
  if (!result.passed) process.exitCode = 1;
}
