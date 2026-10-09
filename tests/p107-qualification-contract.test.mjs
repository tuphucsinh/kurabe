#!/usr/bin/env node
/**
 * P107M1T10 qualification contract (source-contract, runs under `npm test`).
 *
 * Pins the frozen wiring of the NEW `p107-qualification` suite: the shared required-case
 * manifest, the CI suite manifest entry, the CI workflow producer step, and the Step 1
 * alignment of the stale h1h2 pointer-absent case to the OWNER-APPROVED DENY policy.
 * It performs no runtime work; it only reads the checked-in sources.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INTEGRATION_REQUIRED_CASES } from './operations/p103-required-cases.mjs';
import { CI_SUITE_MANIFEST } from './operations/ci-suite-manifest.mjs';
import {
  ACCEPTANCE_PRODUCERS,
  P107_PRODUCER_CASES,
  P107_HTTP_CASES,
  P107_LIFECYCLE_BROWSER_CASES,
} from './fixtures/p107/qualification/required-cases.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const INTEGRATION_MODULE = 'tests/integration/p107-qualification.mjs';
const BROWSER_MODULE = 'tests/browser/p107-qualification.mjs';

// ---- 1. Shared required-case manifest ----
assert.ok(P107_PRODUCER_CASES.length > 0, 'P107 producer case list must not be empty');
assert.equal(new Set(P107_PRODUCER_CASES).size, P107_PRODUCER_CASES.length, 'P107 producer case ids must be unique');
for (const id of P107_PRODUCER_CASES) {
  assert.match(id, /^p107-[a-z-]+:[a-z0-9][a-z0-9+_.:-]*$/, `producer case id must be namespaced: ${id}`);
}
assert.equal(P107_HTTP_CASES.length, 4, 'P107 must pin four real HTTP/PostgREST probe cases');
assert.equal(new Set(P107_HTTP_CASES).size, P107_HTTP_CASES.length, 'P107 HTTP case ids must be unique');
for (const id of P107_HTTP_CASES) assert.match(id, /^http:[a-z0-9-]+$/, `HTTP case id must be namespaced: ${id}`);
assert.equal(P107_LIFECYCLE_BROWSER_CASES.length, 65, 'lifecycle browser manifest must pin 65 cases');
assert.equal(new Set(P107_LIFECYCLE_BROWSER_CASES).size, P107_LIFECYCLE_BROWSER_CASES.length, 'lifecycle browser case ids must be unique');
for (const id of P107_LIFECYCLE_BROWSER_CASES) {
  assert.match(id, /^[a-z]+:[a-z0-9-]+$/, `lifecycle browser case id must be namespaced: ${id}`);
}

// The P107 case spaces must be disjoint from each other and from the P103 integration set.
const p107All = [...P107_PRODUCER_CASES, ...P107_HTTP_CASES, ...P107_LIFECYCLE_BROWSER_CASES];
assert.equal(new Set(p107All).size, p107All.length, 'P107 case spaces must be disjoint and unique');
const integrationSet = new Set(INTEGRATION_REQUIRED_CASES);
for (const id of p107All) assert.ok(!integrationSet.has(id), `P107 case collides with a P103 integration case: ${id}`);

// ---- 2. Producers resolve to real, self-contained scripts ----
assert.equal(ACCEPTANCE_PRODUCERS.length, 4, 'exactly four P107 DB producers are declared');
const areas = ACCEPTANCE_PRODUCERS.map((producer) => producer.area);
assert.equal(new Set(areas).size, areas.length, 'producer areas must be unique');
const markers = ACCEPTANCE_PRODUCERS.map((producer) => producer.marker);
assert.equal(new Set(markers).size, markers.length, 'producer markers must be unique');
for (const producer of ACCEPTANCE_PRODUCERS) {
  assert.ok(fs.existsSync(path.join(root, producer.script)), `producer script missing: ${producer.script}`);
  assert.match(producer.taskId, /^P107M1T0[0-9]$/, `producer task id invalid: ${producer.taskId}`);
}

// ---- 3. Suite modules export run() and reuse the existing verified plumbing ----
const integrationSource = read(INTEGRATION_MODULE);
const browserSource = read(BROWSER_MODULE);
for (const [label, source] of [['integration', integrationSource], ['browser', browserSource]]) {
  assert.match(source, /export async function run\(/, `${label} suite must export run(context)`);
  assert.match(source, /qualification-(integration|browser)\/v1/, `${label} suite must use the P107-owned evidence format`);
  // The own format must NOT be mistaken for the P103-only confirmation validator.
  assert.doesNotMatch(source, /format: 'kurabe-[^']*confirmation/, `${label} suite format must not embed "confirmation"`);
  assert.doesNotMatch(source, /google-chrome-stable'/, `${label} suite must not hardcode an absolute host chrome path`);
}
// The integration lane must not re-run the (non-idempotent) P103 confirmation matrix.
assert.doesNotMatch(integrationSource, /from '\.\/confirmation-matrix\.mjs'/, 'integration lane must not re-run confirmation-matrix');
assert.doesNotMatch(integrationSource, /runConfirmationMatrix/, 'integration lane must not re-run confirmation-matrix');
assert.match(integrationSource, /P107_PRODUCER_CASES/, 'integration lane must consume the shared producer case manifest');
assert.match(integrationSource, /P107_HTTP_CASES/, 'integration lane must consume the HTTP probe case manifest');
assert.match(integrationSource, /await fetch\(/, 'integration lane must exercise real local HTTP');
assert.match(integrationSource, /validateRuntimeEnvironment/, 'integration lane must bind to the real runtime env');
// The browser lane consumes the self-contained lifecycle producer.
assert.match(browserSource, /P107_LIFECYCLE_BROWSER_CASES/, 'browser lane must consume the lifecycle browser manifest');
assert.match(browserSource, /tests\/fixtures\/p107\/lifecycle-coherence\/browser-acceptance\.mjs/, 'browser lane must delegate to the T07 lifecycle producer');

// ---- 4. CI suite manifest entry ----
const entry = CI_SUITE_MANIFEST.find((item) => item.id === 'p107-qualification');
assert.ok(entry, 'ci-suite-manifest must declare the p107-qualification suite');
assert.deepEqual(entry.modules, [INTEGRATION_MODULE, BROWSER_MODULE], 'p107-qualification modules must be the two new lanes');
assert.deepEqual(entry.tiers, ['authenticated'], 'p107-qualification must be authenticated tier');
assert.equal(entry.localQualification, 'required-before-CI-enforcement');
assert.match(entry.command, /--suite p107-qualification --tier authenticated/, 'p107-qualification command must pin authenticated tier');

// ---- 5. CI workflow producer step ----
const workflow = read('.github/workflows/ci.yml');
assert.match(workflow, /node scripts\/verify-release\.mjs --suite p107-qualification --tier authenticated/, 'CI workflow must run the p107-qualification suite');
assert.doesNotMatch(workflow, /continue-on-error:\s*true/i, 'CI workflow must not permit continue-on-error');
assert.doesNotMatch(workflow, /allow-failure/i, 'CI workflow must not permit allow-failure');

// ---- 6. Step 1 alignment: stale fallback case is gone; DENY case is required ----
const h1h2Source = read('tests/integration/h1h2-workflow.mjs');
assert.doesNotMatch(h1h2Source, /pointer-absent-unique-primary-fallback/, 'stale primary-fallback case must be removed');
assert.match(h1h2Source, /h1h2:pointer-absent-unique-primary-denial/, 'h1h2 must require the pointer-absent DENY case');
assert.ok(INTEGRATION_REQUIRED_CASES.includes('h1h2:pointer-absent-unique-primary-denial'), 'P103 integration manifest must require the pointer-absent DENY case');
assert.ok(!INTEGRATION_REQUIRED_CASES.includes('h1h2:pointer-absent-unique-primary-fallback'), 'P103 integration manifest must not require the stale fallback case');

console.log('P107_QUALIFICATION_CONTRACT PASS');
console.log(`  p107-producer-cases=${P107_PRODUCER_CASES.length} p107-http-cases=${P107_HTTP_CASES.length} lifecycle-browser-cases=${P107_LIFECYCLE_BROWSER_CASES.length} p103-integration=${INTEGRATION_REQUIRED_CASES.length}`);
