import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

// ============================================================================
// P110M2T01 — when the P107 browser qualification lane fails, the wrapper must
// (a) surface the REAL producer error (redacted), (b) persist a redacted
// diagnostics JSON beside the evidence for the CI artifact upload, and
// (c) keep the producer's wall-clock budget unchanged. Deliberate-failure
// behavioral test: canary secrets are composed at runtime so the committed test
// source carries no live-looking credential.
// ============================================================================

const wrapper = await import('../tests/browser/p107-qualification.mjs');
const { run, buildFailureDiagnostics, LIFECYCLE_BROWSER_TIMEOUT_MS } = wrapper;

// --- Contract: budget unchanged, live forwarding present ---
assert.equal(LIFECYCLE_BROWSER_TIMEOUT_MS, 2_400_000, 'producer wall-clock budget must stay 2_400_000ms');

const wrapperSource = fs.readFileSync(path.join(projectRoot, 'tests/browser/p107-qualification.mjs'), 'utf8');
assert.match(wrapperSource, /const child = spawn\(process\.execPath, args,/, 'producer must run via async spawn');
assert.match(wrapperSource, /forwardProducerLine/, 'producer output must be live-forwarded');
assert.match(wrapperSource, /function forwardProducerLine[\s\S]*?safeError\(/, 'forwarded lines must be redacted');
assert.doesNotMatch(wrapperSource, /spawnSync\(process\.execPath/, 'no silent spawnSync producer run remains');

// Canary secrets (runtime-composed, never committed)
const CANARY_TOKEN = 't' + 'ok' + '_' + 'c'.repeat(28);
const CANARY_DB = 'postgres' + 'ql://postgres:p' + 'w'.repeat(20) + '@127.0.0.1:5555/kurabe_x';
const canaryText = (kind) => `${kind} failed token=${CANARY_TOKEN} db=${CANARY_DB}`;

function captureConsole(fn) {
  const errors = [];
  const original = console.error;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  try {
    return { errors, result: fn() };
  } finally {
    console.error = original;
  }
}

// --- 1. Unit: buildFailureDiagnostics redacts and structures ---
{
  const evidence = {
    meta: { status: 'FAIL', failureKind: 'SUBSTANTIVE_FAILURE', failureError: canaryText('journey') },
    summary: { firstFailure: 'period:create-via-ui', real: false, unasserted: ['period:create-via-ui'] },
    firstFailure: {
      id: 'period:create-via-ui',
      status: 'NOT_RUN',
      durationMs: null,
      error: canaryText('case'),
    },
    cases: [
      { id: 'infra:next-isolated-build', status: 'PASS', durationMs: 480_000 },
      { id: 'infra:rest-postgrest-real', status: 'PASS', durationMs: 80 },
      { id: 'src:frozen-head-expected-sha', status: 'PASS', durationMs: 119 },
    ],
  };
  const diag = buildFailureDiagnostics(evidence, `BROWSER_ACCEPTANCE FAIL ${canaryText('stderr')}`, {
    spawnStatus: 1,
    timedOut: false,
  });

  assert.equal(diag.producer.spawnStatus, 1);
  assert.equal(diag.producer.timedOut, false);
  assert.equal(diag.meta.failureKind, 'SUBSTANTIVE_FAILURE');
  assert.equal(diag.firstFailure.id, 'period:create-via-ui');
  assert.equal(diag.slowestCases[0].id, 'infra:next-isolated-build');
  assert.equal(diag.slowestCases[0].durationMs, 480_000);
  assert.equal(diag.failedCaseCount, 0);
  assert.equal(diag.notRunCaseCount, 0); // cases array has no NOT_RUN entries here

  const serialized = JSON.stringify(diag);
  for (const canary of [CANARY_TOKEN, CANARY_DB]) {
    assert.ok(!serialized.includes(canary), `diagnostics must not leak canary: ${canary.slice(0, 6)}…`);
  }
  assert.ok(serialized.includes('[REDACTED]'), 'redaction marker present');
  assert.ok(diag.stderrTail.includes('[REDACTED]'), 'stderr tail is the redacted variant');
}

// --- 2. Unit: no evidence (timeout kill) still yields diagnostics ---
{
  const diag = buildFailureDiagnostics(null, '', { spawnStatus: null, timedOut: true });
  assert.equal(diag.producer.timedOut, true);
  assert.equal(diag.meta, null);
  assert.equal(diag.firstFailure, null);
  assert.deepEqual(diag.slowestCases, []);
  assert.equal(diag.stderrTail, null);
}

// --- 3. Behavioral: deliberate FAIL through the real run() with injected seams ---
{
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p107-diag-'));
  const evidencePath = path.join(tmpDir, 'p107-qualification.json');
  const detailPath = `${evidencePath}.p107-browser.json`;
  const lifecyclePath = `${evidencePath}.lifecycle-browser.json`;

  const failingEvidence = {
    meta: { status: 'FAIL', failureKind: 'SUBSTANTIVE_FAILURE', failureError: canaryText('loginAs') },
    summary: { manifestSize: 55, asserted: 10, real: false, unasserted: ['period:create-via-ui', 'flow:leader-round1-self'], firstFailure: 'period:create-via-ui' },
    firstFailure: { id: 'period:create-via-ui', status: 'NOT_RUN', durationMs: null, error: canaryText('notRun') },
    cases: [
      { id: 'infra:next-isolated-build', status: 'PASS', durationMs: 2_100_000 },
      { id: 'infra:owned-resource-identity', status: 'PASS', durationMs: 900 },
    ],
  };

  const fakeLifecycleRunner = async (sha, targetPath) => {
    assert.equal(sha, 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'candidate sha flows to the lifecycle runner');
    assert.equal(targetPath, lifecyclePath, 'lifecycle evidence path derived from options.evidence');
    fs.writeFileSync(targetPath, JSON.stringify(failingEvidence));
    const { runLifecycleBrowser } = { runLifecycleBrowser: null }; void runLifecycleBrowser;
    const error = new Error(
      `P107_LIFECYCLE_BROWSER_NOT_QUALIFIED status=FAIL real=false unasserted=period:create-via-ui,flow:leader-round1-self firstFailure=period:create-via-ui stderrTail=${canaryText('wrapped')}`,
    );
    error.diagnostics = buildFailureDiagnostics(failingEvidence, `BROWSER_ACCEPTANCE FAIL ${canaryText('producer')}`, { spawnStatus: 1, timedOut: false });
    throw error;
  };

  const hooks = {
    candidateSha: () => 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
    restoreToolchainDrift: () => { /* noop: test must not mutate the workspace */ },
  };

  let result;
  const { errors } = captureConsole(() => { result = null; });
  const originalError = console.error;
  const seen = [];
  console.error = (...args) => { seen.push(args.map(String).join(' ')); };
  try {
    result = await run({ options: { evidence: evidencePath }, lifecycleRunner: fakeLifecycleRunner, hooks });
  } finally {
    console.error = originalError;
  }
  void errors;

  assert.equal(result.real, false);
  assert.equal(result.status, 'UNKNOWN');

  const output = seen.join('\n');
  assert.match(output, /P107_QUALIFICATION_BROWSER_FAILURE/, 'failure line printed');
  assert.match(output, /P107_QUALIFICATION_DIAGNOSTICS \{/, 'diagnostics printed');
  for (const canary of [CANARY_TOKEN, CANARY_DB]) {
    assert.ok(!output.includes(canary), `console output must not leak canary: ${canary.slice(0, 6)}…`);
  }
  assert.ok(output.includes('[REDACTED]'), 'printed diagnostics carry the redaction marker');
  assert.match(output, /period:create-via-ui/, 'diagnostics name the attributed first failure');
  assert.match(output, /2_?100_?000|"durationMs":2100000/, 'slowest case duration surfaces');

  const diagnosticsPath = `${detailPath}.diagnostics.json`;
  assert.ok(fs.existsSync(diagnosticsPath), 'diagnostics JSON persisted beside the evidence');
  const persisted = fs.readFileSync(diagnosticsPath, 'utf8');
  for (const canary of [CANARY_TOKEN, CANARY_DB]) {
    assert.ok(!persisted.includes(canary), 'persisted diagnostics must not leak canaries');
  }
  const parsed = JSON.parse(persisted);
  assert.equal(parsed.meta.status, 'FAIL');
  assert.equal(parsed.slowestCases[0].id, 'infra:next-isolated-build');
  assert.equal(parsed.producer.spawnStatus, 1);

  // Detail evidence written by run() even on failure (existing behavior retained)
  assert.ok(fs.existsSync(detailPath), 'wrapper detail evidence still written');
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// --- 4. Source contracts: producer progress + CI artifact upload ---
const producerSource = fs.readFileSync(
  path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/browser-acceptance.mjs'), 'utf8');
assert.match(producerSource, /function progress\(message\)/, 'producer emits phase progress');
assert.match(producerSource, /\[p107-browser \+/, 'producer progress lines carry elapsed seconds');
assert.match(producerSource, /failureError: safeError\(error\)/, 'terminal meta keeps the real thrown error');

const guardSource = fs.readFileSync(
  path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/guard.mjs'), 'utf8');
assert.match(guardSource, /\[caseledger\] PASS \$\{id\}/, 'ledger logs passing cases with durations');
assert.match(guardSource, /\[caseledger\] FAIL \$\{id\}/, 'ledger logs failing cases with durations');

const workflow = fs.readFileSync(path.join(projectRoot, '.github/workflows/ci.yml'), 'utf8');
assert.match(workflow, /Upload qualification diagnostics on failure/, 'CI has the failure-upload step');
assert.match(workflow, /if: cancelled\(\) \|\| failure\(\)/, 'upload step is cancellation/failure-gated');
assert.match(workflow, /uses: actions\/upload-artifact@v4/, 'uses the pinned v4 action');
// JSON-only glob: the unredacted `.runtime` tree (app copy, node_modules, chrome
// profile) must never be swept into the artifact.
assert.match(workflow, /path: \$\{\{ runner\.temp \}\}\/p107-qualification\*\.json/, 'uploads only the redacted JSON artifacts');
assert.ok(!/p107-qualification\*(?!\.json)/.test(workflow), 'no unbounded p107-qualification* glob remains');
assert.doesNotMatch(workflow, /continue-on-error:\s*true/i, 'no continue-on-error introduced');
assert.doesNotMatch(workflow, /allow-failure/i, 'no allow-failure introduced');

console.log('P110M2T01 qualification diagnostics contract: ALL PASS');
