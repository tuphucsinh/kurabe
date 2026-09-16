#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const CI_SUITE_MANIFEST = Object.freeze([
  {
    id: 'confirmation-matrix',
    command: 'node scripts/verify-release.mjs --suite confirmation-matrix --tier authenticated --evidence "$EVIDENCE/ci-local-matrix.json"',
    modules: ['tests/integration/confirmation-matrix.mjs'],
    tiers: ['real-DB', 'authenticated'],
    roles: ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'],
    localQualification: 'workflow-baseline',
  },
  {
    id: 'release-matrix',
    command: 'node scripts/verify-release.mjs --suite release-matrix',
    modules: ['tests/integration/release-matrix.mjs', 'tests/browser/release-matrix.mjs'],
    tiers: ['real-DB', 'actual-Next-browser'],
    roles: ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'],
    localQualification: 'required-before-CI-enforcement',
  },
  {
    id: 'release-preflight',
    command: 'node scripts/verify-release.mjs --suite release-preflight',
    modules: ['tests/operations/release-preflight.mjs'],
    tiers: ['real-DB'],
    roles: [],
    localQualification: 'required-before-CI-enforcement',
  },
  {
    id: 'unit-regression',
    command: 'npm test',
    modules: ['scripts/run-tests.mjs'],
    tiers: ['source-contract'],
    roles: [],
    localQualification: 'workflow-baseline',
  },
  {
    id: 'lint',
    command: 'npm run lint',
    modules: [],
    tiers: ['source-contract'],
    roles: [],
    localQualification: 'workflow-baseline',
  },
  {
    id: 'typecheck',
    command: 'npm run typecheck',
    modules: [],
    tiers: ['source-contract'],
    roles: [],
    localQualification: 'workflow-baseline',
  },
  {
    id: 'build',
    command: 'npm run build',
    modules: [],
    tiers: ['source-contract'],
    roles: [],
    localQualification: 'workflow-baseline',
  },
  {
    id: 'source-secret-scan',
    command: 'node scripts/scan-source-secrets.mjs',
    modules: [],
    tiers: ['source-contract'],
    roles: [],
    localQualification: 'workflow-baseline',
  },
]);

function verifyManifestContract() {
  assert.ok(CI_SUITE_MANIFEST.length > 0, 'CI suite manifest must not be empty');
  const ids = CI_SUITE_MANIFEST.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length, 'CI suite manifest IDs must be unique');
  for (const entry of CI_SUITE_MANIFEST) {
    assert.match(entry.id, /^[a-z0-9][a-z0-9-]+$/);
    assert.match(entry.command, /\S/);
    assert.ok(Array.isArray(entry.modules));
    assert.ok(Array.isArray(entry.tiers) && entry.tiers.length > 0);
    assert.ok(Array.isArray(entry.roles));
    assert.match(entry.localQualification, /^(required-before-CI-enforcement|workflow-baseline)$/);
    for (const modulePath of entry.modules) {
      assert.ok(fs.existsSync(path.join(root, modulePath)), `${entry.id} module is missing: ${modulePath}`);
    }
    assert.equal(new Set(entry.modules).size, entry.modules.length, `${entry.id} modules must not repeat`);
  }
  const release = CI_SUITE_MANIFEST.find((entry) => entry.id === 'release-matrix');
  assert.deepEqual(release.roles, ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker']);
  assert.ok(release.modules.includes('tests/integration/release-matrix.mjs'));
  assert.ok(release.modules.includes('tests/browser/release-matrix.mjs'));
  assert.deepEqual(release.tiers, ['real-DB', 'actual-Next-browser']);
  return ids;
}

function verifyCiWorkflow() {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /node scripts\/verify-release\.mjs --suite ci-suite-manifest/);
  assert.match(workflow, /node scripts\/verify-release\.mjs --suite confirmation-matrix --tier authenticated/);
  for (const command of ['npm run lint', 'npm run typecheck', 'npm test', 'npm run build', 'node scripts/scan-source-secrets.mjs']) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `CI workflow is missing ${command}`);
  }
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/i, 'CI workflow must not permit continue-on-error');
  assert.doesNotMatch(workflow, /allow-failure/i, 'CI workflow must not permit allow-failure');
  assert.doesNotMatch(workflow, /(?:prod_password|prod_key|production_url|production_key)/i, 'CI workflow must not reference production credentials');
  return true;
}

export async function run() {
  const ids = verifyManifestContract();
  verifyCiWorkflow();
  return {
    real: true,
    passed: true,
    tier: 'source-contract',
    status: 'EXECUTED',
    cases: [
      ...ids.map((id) => `manifest-entry:${id}`),
      'workflow-invokes-checked-in-manifest',
      'workflow-baseline-gates-present',
      'workflow-invokes-confirmation-matrix',
      'workflow-disallows-bypass-or-failure',
    ],
    target: 'checked-in-CI-suite-manifest-and-existing-workflow',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    console.log(`CI_SUITE_MANIFEST ${result.status} cases=${result.cases.length} entries=${CI_SUITE_MANIFEST.length}`);
  } catch (error) {
    console.error(`CI_SUITE_MANIFEST FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
