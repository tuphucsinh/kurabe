#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  VALID_EVIDENCE_TIERS,
  discoverSuiteModules,
  parseArgs,
  validateSuiteResult,
  writeEvidence,
} from '../scripts/verify-release.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verifyScript = path.join(projectRoot, 'scripts/verify-release.mjs');
const testRunnerScript = path.join(projectRoot, 'scripts/run-tests.mjs');
const scannerScript = path.join(projectRoot, 'scripts/scan-source-secrets.mjs');
const seededFixture = path.join(projectRoot, 'tests/fixtures/release/security/seeded-secret.env');

function runNode(script, args = [], env = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    env: { ...process.env, ...env },
  });
}

// ---------------------------------------------------------------------------
// 1. Zero Discovery Rejection
// ---------------------------------------------------------------------------
// A: run-tests.mjs rejects zero test discovery with exit code 1
const emptyTestsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-empty-tests-'));
try {
  const runnerZeroResult = runNode(testRunnerScript, [], { KURABE_TESTS_DIR: emptyTestsDir });
  assert.equal(runnerZeroResult.status, 1, 'run-tests.mjs must exit 1 on empty test discovery');
  assert.match(
    `${runnerZeroResult.stdout}${runnerZeroResult.stderr}`,
    /nonzero empty discovery required/i,
    'run-tests.mjs must log nonzero empty discovery error'
  );
} finally {
  fs.rmSync(emptyTestsDir, { recursive: true, force: true });
}

// B: verify-release.mjs rejects zero-case suite / nonexistent suite
assert.equal(discoverSuiteModules('nonexistent-suite-xyz').length, 0, 'discoverSuiteModules returns empty for unknown suite');
const verifyUnknown = runNode(verifyScript, ['--suite', 'nonexistent-suite-xyz']);
assert.equal(verifyUnknown.status, 1, 'verify-release.mjs must exit 1 for nonexistent suite');
assert.match(
  `${verifyUnknown.stdout}${verifyUnknown.stderr}`,
  /unknown or zero-case suite/,
  'verify-release.mjs must reject unknown or zero-case suite'
);

// C: validateSuiteResult rejects zero executable cases
assert.throws(
  () => validateSuiteResult({ real: true, passed: true, tier: 'source-contract', cases: [] }, 'zero-cases-mod'),
  /zero executable cases/,
  'validateSuiteResult must reject empty cases array'
);

// ---------------------------------------------------------------------------
// 2. Missing / Null / False / Non-boolean Passed Rejection
// ---------------------------------------------------------------------------
assert.throws(
  () => validateSuiteResult({ real: true, tier: 'source-contract', cases: ['c1'] }, 'missing-passed'),
  /passed === true \(missing, null, or false is forbidden\)/,
  'missing passed property must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: null, tier: 'source-contract', cases: ['c1'] }, 'null-passed'),
  /passed === true \(missing, null, or false is forbidden\)/,
  'null passed property must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: false, tier: 'source-contract', cases: ['c1'] }, 'false-passed'),
  /passed === true \(missing, null, or false is forbidden\)/,
  'false passed property must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: 'true', tier: 'source-contract', cases: ['c1'] }, 'string-passed'),
  /passed === true \(missing, null, or false is forbidden\)/,
  'string "true" passed property must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: 1, tier: 'source-contract', cases: ['c1'] }, 'numeric-passed'),
  /passed === true \(missing, null, or false is forbidden\)/,
  'numeric 1 passed property must be rejected'
);

// ---------------------------------------------------------------------------
// 3. NaN / Zero / Fractional / Negative Cases Rejection
// ---------------------------------------------------------------------------
assert.throws(
  () => validateSuiteResult({ real: true, passed: true, tier: 'source-contract', cases: 0 }, 'zero-count'),
  /non-positive, non-integer, or NaN case count: 0/,
  'zero case count must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: true, tier: 'source-contract', cases: NaN }, 'nan-count'),
  /non-positive, non-integer, or NaN case count: NaN/,
  'NaN case count must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: true, tier: 'source-contract', cases: 2.5 }, 'fractional-count'),
  /non-positive, non-integer, or NaN case count: NaN/,
  'fractional case count must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: true, tier: 'source-contract', cases: -5 }, 'negative-count'),
  /non-positive, non-integer, or NaN case count: -5/,
  'negative case count must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: true, tier: 'source-contract', cases: 'two' }, 'string-count'),
  /non-positive, non-integer, or NaN case count: NaN/,
  'non-numeric string case count must be rejected'
);

// ---------------------------------------------------------------------------
// 4. Wrong Tier & Prohibit Source Regex Promotion to Browser / DB PASS
// ---------------------------------------------------------------------------
assert.ok(VALID_EVIDENCE_TIERS.has('source-contract'));
assert.ok(VALID_EVIDENCE_TIERS.has('real-DB'));
assert.ok(VALID_EVIDENCE_TIERS.has('actual-Next-browser'));
assert.throws(
  () => validateSuiteResult({ real: true, passed: true, cases: ['c1'] }, 'missing-tier'),
  /invalid or missing evidence tier/,
  'missing tier must be rejected'
);
assert.throws(
  () => validateSuiteResult({ real: true, passed: true, tier: 'unsupported-tier', cases: ['c1'] }, 'bad-tier'),
  /invalid or missing evidence tier/,
  'unsupported tier name must be rejected'
);
// Prohibit source-contract from satisfying real-DB or actual-Next-browser
assert.throws(
  () => validateSuiteResult(
    { real: true, passed: true, tier: 'source-contract', cases: ['regex-1'] },
    'source-mod',
    { requiredTier: 'real-DB' }
  ),
  /is source-contract and cannot satisfy required tier "real-DB"/,
  'source-contract must not satisfy real-DB tier'
);
assert.throws(
  () => validateSuiteResult(
    { real: true, passed: true, tier: 'source-contract', cases: ['regex-1'] },
    'source-mod',
    { requiredTier: 'actual-Next-browser' }
  ),
  /is source-contract and cannot satisfy required tier "actual-Next-browser"/,
  'source-contract must not satisfy actual-Next-browser tier'
);
assert.throws(
  () => validateSuiteResult(
    { real: true, passed: true, tier: 'mocked-action', cases: ['mock-1'] },
    'mocked-mod',
    { requiredTier: 'real-DB' }
  ),
  /reported tier "mocked-action", but required tier is "real-DB"/,
  'mocked-action must not satisfy real-DB tier'
);

// CLI level: attempting to satisfy real-DB with period-freshness (source-contract) must fail
const sourcePromotionAttempt = runNode(verifyScript, ['--suite', 'period-freshness', '--tier', 'real-DB']);
assert.equal(sourcePromotionAttempt.status, 1, 'source-contract suite cannot satisfy --tier real-DB');
assert.match(
  `${sourcePromotionAttempt.stdout}${sourcePromotionAttempt.stderr}`,
  /cannot satisfy required tier "real-DB"/,
  'CLI must reject source-contract promotion to real-DB'
);

// ---------------------------------------------------------------------------
// 5. Claimed Auth Without Execution Rejection
// ---------------------------------------------------------------------------
// Claiming auth on source-contract tier is strictly forbidden
assert.throws(
  () => validateSuiteResult(
    { real: true, passed: true, tier: 'source-contract', cases: ['c1'], authenticated: true },
    'auth-source-mod'
  ),
  /claimed authenticated scope on source-contract tier without runtime execution/,
  'authenticated === true on source-contract must be rejected'
);
// Claiming auth without positive integer authenticatedCases
assert.throws(
  () => validateSuiteResult(
    { real: true, passed: true, tier: 'real-DB', cases: ['c1'], authenticated: true },
    'auth-missing-cases'
  ),
  /claimed authenticated === true without finite positive executed authenticatedCases/,
  'authenticated === true without authenticatedCases must be rejected'
);
assert.throws(
  () => validateSuiteResult(
    { real: true, passed: true, tier: 'real-DB', cases: ['c1'], authenticated: true, authenticatedCases: 0 },
    'auth-zero-cases'
  ),
  /claimed authenticated === true without finite positive executed authenticatedCases/,
  'authenticated === true with 0 authenticatedCases must be rejected'
);
assert.throws(
  () => validateSuiteResult(
    { real: true, passed: true, tier: 'real-DB', cases: ['c1'], authenticated: true, authenticatedCases: NaN },
    'auth-nan-cases'
  ),
  /claimed authenticated === true without finite positive executed authenticatedCases/,
  'authenticated === true with NaN authenticatedCases must be rejected'
);

// ---------------------------------------------------------------------------
// 6. Unknown Suite Rejection & Argument Parsing
// ---------------------------------------------------------------------------
assert.throws(
  () => parseArgs(['--suite', 'invalid/suite/path']),
  /--suite must be an exact simple suite name/,
  'parseArgs must reject suite with path characters'
);
assert.throws(
  () => parseArgs(['--tier', 'non-existent-tier']),
  /--tier must be one of:/,
  'parseArgs must reject invalid tier'
);
assert.throws(
  () => parseArgs(['--evidence', 'relative/path.json']),
  /--evidence must be an absolute path/,
  'parseArgs must reject relative evidence path'
);

// ---------------------------------------------------------------------------
// 7. Seeded Detection & Scanner Tracked Surface Contract
// ---------------------------------------------------------------------------
// Seeded fixture detection
const seededScan = runNode(scannerScript, ['--path', path.relative(projectRoot, seededFixture)]);
assert.equal(seededScan.status, 1, 'seeded fixture must fail secret scan with exit 1');
assert.match(`${seededScan.stdout}${seededScan.stderr}`, /SOURCE_SECRET_SCAN FAIL/);

// Clean scan with scope reporting
const defaultScan = runNode(scannerScript);
assert.equal(defaultScan.status, 0, 'default scan must pass with exit 0');
assert.match(defaultScan.stdout, /SOURCE_SECRET_SCAN PASS/);
assert.match(defaultScan.stdout, /findings=0/);
assert.match(defaultScan.stdout, /scanned=\d+/);
assert.match(defaultScan.stdout, /omitted=\d+/);
assert.match(defaultScan.stdout, /binary=\d+/);
assert.match(defaultScan.stdout, /oversize=\d+/);

// ---------------------------------------------------------------------------
// 8. Valid Structured Real-Local and Source-Only Results Retain Actual Scope
// ---------------------------------------------------------------------------
// Valid source-contract result
const sourceCount = validateSuiteResult(
  { real: true, passed: true, tier: 'source-contract', cases: ['p96t03-code-ast-check'] },
  'valid-source',
  { requiredTier: 'source-contract' }
);
assert.equal(sourceCount, 1);

// Valid real-DB result
const realDbCount = validateSuiteResult(
  { real: true, passed: true, tier: 'real-DB', cases: ['db-migration-up', 'db-migration-down'] },
  'valid-real-db',
  { requiredTier: 'real-DB' }
);
assert.equal(realDbCount, 2);

// Valid actual-Next-browser result
const browserCount = validateSuiteResult(
  { real: true, passed: true, tier: 'actual-Next-browser', cases: ['render-table', 'click-tab'] },
  'valid-browser',
  { requiredTier: 'actual-Next-browser' }
);
assert.equal(browserCount, 2);

// Valid authenticated result with positive executed authenticatedCases
const authCount = validateSuiteResult(
  {
    real: true,
    passed: true,
    tier: 'real-DB',
    cases: ['auth-session-init', 'auth-role-check'],
    authenticated: true,
    authenticatedCases: 2,
  },
  'valid-auth-db'
);
assert.equal(authCount, 2);

// WriteEvidence retains tier, status, capability, authenticated, target, and case provenance
const tempEvidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-evidence-scope-'));
const tempEvidenceFile = path.join(tempEvidenceDir, 'evidence.json');
try {
  writeEvidence(tempEvidenceFile, {
    suite: 'period-freshness',
    totalCases: 2,
    reports: [
      {
        modulePath: '/home/pi5/projects/kurabe-task-wt/P102M3T01/tests/browser/period-freshness.mjs',
        count: 2,
        tier: 'source-contract',
        status: 'EXECUTED',
        capability: null,
        authenticated: false,
        target: 'source-contract-period-freshness',
        cases: ['period-freshness-action-contract', 'period-freshness-client-hook-contract'],
      },
    ],
  });

  const savedEvidence = JSON.parse(fs.readFileSync(tempEvidenceFile, 'utf8'));
  assert.equal(savedEvidence.format, 'kurabe-release-evidence/v1');
  assert.equal(savedEvidence.suite, 'period-freshness');
  assert.equal(savedEvidence.mode, 'source-contract');
  assert.deepEqual(savedEvidence.tiers, ['source-contract']);
  assert.equal(savedEvidence.totalCases, 2);
  assert.equal(savedEvidence.reports.length, 1);

  const report0 = savedEvidence.reports[0];
  assert.equal(report0.tier, 'source-contract');
  assert.equal(report0.status, 'EXECUTED');
  assert.equal(report0.authenticated, false);
  assert.equal(report0.target, 'source-contract-period-freshness');
  assert.deepEqual(report0.cases, [
    'period-freshness-action-contract',
    'period-freshness-client-hook-contract',
  ]);
} finally {
  fs.rmSync(tempEvidenceDir, { recursive: true, force: true });
}

console.log('ALL verification evidence contract assertions PASSED.');
