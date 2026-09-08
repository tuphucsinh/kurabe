import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverSuiteModules, validateSuiteResult, writeEvidence } from '../scripts/verify-release.mjs';
import { run as runDatabaseHarness } from './integration/harness.mjs';
import { run as runBrowserHarness } from './browser/harness.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifyScript = path.join(projectRoot, 'scripts/verify-release.mjs');
const scannerScript = path.join(projectRoot, 'scripts/scan-source-secrets.mjs');
const cleanFixture = path.join(projectRoot, 'tests/fixtures/release/security/clean-source.mjs');
const seededFixture = path.join(projectRoot, 'tests/fixtures/release/security/seeded-secret.env');

function runNode(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
  });
}

assert.equal(discoverSuiteModules('harness').length, 2, 'harness must discover exactly the integration and browser suites');
assert.equal(discoverSuiteModules('does-not-exist').length, 0, 'unknown suite must have no matching modules');
assert.throws(
  () => validateSuiteResult({ real: true, cases: [] }, 'synthetic-zero-case-suite'),
  /zero executable cases/,
  'zero-case suites must fail closed'
);
assert.throws(
  () => validateSuiteResult({ real: false, cases: ['mock'] }, 'synthetic-mock-suite'),
  /mock substitution is forbidden/,
  'mock results must never be accepted'
);

const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-release-evidence-'));
const evidencePath = path.join(evidenceDir, 'report.json');
try {
  writeEvidence(evidencePath, {
    suite: 'harness',
    totalCases: 1,
    reports: [{ modulePath: '/worktree/tests/integration/harness.mjs', count: 1, target: 'loopback:5432/kurabe_harness' }],
  });
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.format, 'kurabe-release-evidence/v1');
  assert.equal(evidence.totalCases, 1);
  assert.equal(evidence.reports[0].target, 'loopback:5432/kurabe_harness');
} finally {
  fs.rmSync(evidenceDir, { recursive: true, force: true });
}

const unknownSuite = runNode(verifyScript, ['--suite', 'does-not-exist']);
assert.notEqual(unknownSuite.status, 0, 'unknown suite command must fail nonzero');
assert.match(`${unknownSuite.stdout}${unknownSuite.stderr}`, /unknown or zero-case suite/);

const forbiddenRemoteTarget = await assert.rejects(
  () => runDatabaseHarness({ options: { dbHost: '198.51.100.10', dbName: 'kurabe_harness' } }),
  /database host must be loopback/,
  'remote database targets must be refused before any connection attempt'
);
assert.equal(forbiddenRemoteTarget, undefined);

const cleanScan = runNode(scannerScript, ['--path', path.relative(projectRoot, cleanFixture)]);
assert.equal(cleanScan.status, 0, cleanScan.stderr);
assert.match(cleanScan.stdout, /SOURCE_SECRET_SCAN PASS/);

const seededScan = runNode(scannerScript, ['--path', path.relative(projectRoot, seededFixture)]);
assert.notEqual(seededScan.status, 0, 'seeded secret fixture must be detected');
assert.match(`${seededScan.stdout}${seededScan.stderr}`, /SOURCE_SECRET_SCAN FAIL/);
assert.doesNotMatch(`${seededScan.stdout}${seededScan.stderr}`, /synthetic-service-role-key-0123456789abcdef/);

const defaultScan = runNode(scannerScript);
assert.equal(defaultScan.status, 0, defaultScan.stderr);
assert.match(defaultScan.stdout, /findings=0/);

const browserReport = await runBrowserHarness();
assert.equal(browserReport.real, true, 'browser suite must use a real Chrome process');
assert.equal(browserReport.cases.length, 2);

const fixtureSql = fs.readFileSync(path.join(projectRoot, 'tests/fixtures/release/minimal-auth-evaluation.sql'), 'utf8');
assert.match(fixtureSql, /auth_users/);
assert.match(fixtureSql, /evaluation_rounds/);

const harnessRun = runNode(verifyScript, ['--suite', 'harness', '--db-host', '198.51.100.10']);
assert.notEqual(harnessRun.status, 0, 'harness must fail closed for a forbidden target');
assert.match(`${harnessRun.stdout}${harnessRun.stderr}`, /loopback/);
assert.doesNotMatch(`${harnessRun.stdout}${harnessRun.stderr}`, /mock|fallback/i);

console.log('verification harness contract checks passed; real Chrome assertion and fail-closed DB/security checks exercised');
