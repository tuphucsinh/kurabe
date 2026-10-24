#!/usr/bin/env node
/**
 * P107M1T10 integrated exact-candidate qualification (browser lane).
 *
 * Real-browser closure over the accepted master-plan matrix. It delegates, unchanged, to
 * the existing T07 frozen-candidate producer
 * (tests/fixtures/p107/lifecycle-coherence/browser-acceptance.mjs), which provisions its
 * own disposable loopback PostgreSQL 17 + PostgREST v12.2.3 + /rest/v1 proxy + an isolated
 * actual-Next production build and drives Chromium CDP through the REAL application UI:
 * five role flows, return/resubmit, close/frozen, two-tab provider-freshness convergence,
 * named browser + DB races, approved-only/minimization DTO, and desktop(1440x900) /
 * mobile(390x844) DOM/console/network cases.
 *
 * The producer is self-contained (no shared runtime state) and enforces a clean frozen
 * candidate worktree; qualification therefore requires the committed candidate. It never
 * edits product src, never substitutes a mock for the browser, and reports 0/0.
 *
 * Run: node scripts/verify-release.mjs --suite p107-qualification --tier authenticated \
 *        --evidence "$EVIDENCE/p107.json"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { P107_LIFECYCLE_BROWSER_CASES } from '../fixtures/p107/qualification/required-cases.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');
export const TASK_ID = 'P107M1T10';
export const NATIVE_TIER = 'authenticated';
export const LIFECYCLE_BROWSER_PRODUCER = 'tests/fixtures/p107/lifecycle-coherence/browser-acceptance.mjs';

export const REQUIRED_CASES = Object.freeze([...P107_LIFECYCLE_BROWSER_CASES]);

function safeError(error) {
  return String(error?.stderr || error?.message || error)
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function candidateSha() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).stdout.trim();
  const sha = process.env.KURABE_CONFIRMATION_CANDIDATE_SHA || head;
  assert.match(sha, /^[0-9a-f]{40}$/i, 'candidate SHA must be a full commit SHA');
  assert.equal(sha, head, `P107_CANDIDATE_SHA_MISMATCH candidate=${sha} head=${head}`);
  return sha;
}

/**
 * The delegated producer requires a CLEAN worktree. Next 16 `next dev` (started by the
 * disposable confirmation runtime) re-adds a managed agent-rules block to AGENTS.md, and a
 * CI runner may carry further toolchain-generated drift. HEAD is the REVIEWED commit, so any
 * drift at this point is toolchain-generated: restore tracked files to HEAD and drop
 * untracked non-ignored files (ignored build output such as node_modules/.next is kept),
 * then require a clean tree. If drift still remains, surface it instead of swallowing it.
 */
function restoreToolchainDrift() {
  const read = () => spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: projectRoot, encoding: 'utf8' }).stdout.trim();
  let status = read();
  if (status !== '') {
    console.error(`P107_BROWSER_DRIFT_BEFORE_RESTORE ${JSON.stringify(status)}`);
    spawnSync('git', ['checkout', '--', '.'], { cwd: projectRoot, encoding: 'utf8' });
    spawnSync('git', ['clean', '-fd'], { cwd: projectRoot, encoding: 'utf8' });
    status = read();
  }
  if (status !== '') {
    console.error(`P107_BROWSER_DRIFT_AFTER_RESTORE ${JSON.stringify(status)}`);
    throw new Error(`P107 browser lane requires a clean frozen candidate; residual drift: ${status}`);
  }
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

// P110M2T01: unchanged wall-clock budget for the producer run. Deliberately NOT
// raised: a stalled lane must fail loudly with diagnostics, not wait longer.
export const LIFECYCLE_BROWSER_TIMEOUT_MS = 2_400_000;

/** Forward one producer output line live, redacted, so a stalled lane is visible in the CI step log. */
function forwardProducerLine(line) {
  const trimmed = String(line).replace(/\r?\n$/, '');
  if (!trimmed) return;
  process.stderr.write(`[p107-browser-lane] ${safeError(trimmed)}\n`);
}

/**
 * P110M2T01: redacted failure diagnostics for a failed lifecycle browser run.
 * Every error-shaped field crosses safeError; ids/status/durations are the only
 * fields taken as-is. Exported for focused testing.
 */
export function buildFailureDiagnostics(evidence, stderr, { spawnStatus = null, timedOut = false } = {}) {
  const records = Array.isArray(evidence?.cases) ? evidence.cases : [];
  const slowestCases = [...records]
    .sort((a, b) => (b?.durationMs ?? 0) - (a?.durationMs ?? 0))
    .slice(0, 5)
    .map((record) => ({ id: record?.id ?? null, status: record?.status ?? null, durationMs: record?.durationMs ?? null }));
  const failureRecord = evidence?.firstFailure && typeof evidence.firstFailure === 'object'
    ? evidence.firstFailure
    : null;
  return {
    generatedAt: new Date().toISOString(),
    producer: { spawnStatus, timedOut },
    meta: evidence?.meta
      ? {
          status: evidence.meta.status ?? null,
          failureKind: evidence.meta.failureKind ?? null,
          failureError: evidence.meta.failureError ? safeError(evidence.meta.failureError) : null,
        }
      : null,
    summary: evidence?.summary ?? null,
    firstFailure: failureRecord
      ? {
          id: failureRecord.id ?? null,
          status: failureRecord.status ?? null,
          durationMs: failureRecord.durationMs ?? null,
          error: failureRecord.error ? safeError(failureRecord.error) : null,
        }
      : (evidence?.summary?.firstFailure ?? null),
    failedCaseCount: records.filter((record) => record?.status === 'FAIL').length,
    notRunCaseCount: records.filter((record) => record?.status === 'NOT_RUN').length,
    slowestCases,
    stderrTail: stderr ? safeError(stderr.slice(-4000)) : null,
  };
}

function lifecycleError(message, diagnostics) {
  const error = new Error(message);
  error.diagnostics = diagnostics;
  return error;
}

/**
 * Run the T07 lifecycle browser producer as a child process and read back its frozen
 * evidence. P110M2T01: spawns async and live-forwards the producer's stderr (each line
 * redacted) so the CI step log shows phase/case progress instead of 40 silent minutes;
 * the same 2_400_000ms budget is enforced and the captured stderr feeds diagnostics.
 */
async function runLifecycleBrowser(sha, evidencePath) {
  const scriptPath = path.join(projectRoot, LIFECYCLE_BROWSER_PRODUCER);
  assert.ok(fs.existsSync(scriptPath), `lifecycle browser producer missing: ${LIFECYCLE_BROWSER_PRODUCER}`);
  fs.rmSync(evidencePath, { force: true });
  // The producer refuses a runtime root under /tmp (REFUSE_TMP_RUNTIME_ROOT); CI's
  // os.tmpdir() resolves under /tmp, so pin a task-owned runtime root beside the evidence.
  const runtimeRoot = `${evidencePath}.runtime`;
  const args = [scriptPath, '--evidence', evidencePath, '--expected-sha', sha, '--runtime-root', runtimeRoot];
  if (process.env.KURABE_P107_CHROME) args.push('--chrome', process.env.KURABE_P107_CHROME);

  let stderr = '';
  let timedOut = false;
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: projectRoot, env: { ...process.env } });
    let settled = false;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGTERM'); } catch { /* already gone */ }
    }, LIFECYCLE_BROWSER_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', () => { /* captured nowhere: producer prints only to stderr */ });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-4 * 1024 * 1024);
      for (const line of String(chunk).split('\n')) forwardProducerLine(line);
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => finish(code));
  });

  let evidence = null;
  if (fs.existsSync(evidencePath)) {
    try {
      evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    } catch {
      evidence = null;
    }
  }
  const diagnostics = buildFailureDiagnostics(evidence, stderr, { spawnStatus: result.status, timedOut });

  if (!evidence) {
    throw lifecycleError(`P107_LIFECYCLE_BROWSER_NO_EVIDENCE status=${result.status} timedOut=${timedOut} stderr=${safeError(stderr).slice(-700)}`, diagnostics);
  }
  const meta = evidence.meta || {};
  const summary = evidence.summary || {};
  if (meta.status !== 'QUALIFIED' || summary.real !== true) {
    throw lifecycleError(`P107_LIFECYCLE_BROWSER_NOT_QUALIFIED status=${meta.status} real=${summary.real} unasserted=${(summary.unasserted || []).join(',') || 'none'} firstFailure=${summary.firstFailure || safeError(stderr).slice(-400)}`, diagnostics);
  }
  if (result.status !== 0) {
    throw lifecycleError(`P107_LIFECYCLE_BROWSER_NONZERO status=${result.status} stderr=${safeError(stderr).slice(-400)}`, diagnostics);
  }
  return evidence;
}

function browserResidue() {
  const containers = spawnSync('docker', ['ps', '-a', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .stdout.split('\n').map((line) => line.trim()).filter((name) => /-p107t0/.test(name));
  const networks = spawnSync('docker', ['network', 'ls', '--format', '{{.Name}}'], { encoding: 'utf8' })
    .stdout.split('\n').map((line) => line.trim()).filter((name) => /p107t0/.test(name));
  return { containers, networks };
}

export async function run(context = {}) {
  const options = context?.options || {};
  // P110M2T01: injectable seams (defaults keep the production path identical) so the
  // failure-reporting path is behaviorally testable without a real producer run or
  // workspace mutation.
  const hooks = context?.hooks || {};
  const runLifecycle = typeof context?.lifecycleRunner === 'function' ? context.lifecycleRunner : runLifecycleBrowser;
  const evidencePath = options.evidence || process.env.KURABE_P107_BROWSER_EVIDENCE;
  const detailPath = evidencePath ? `${evidencePath}.p107-browser.json` : null;
  let sha = null;
  try {
    sha = typeof hooks.candidateSha === 'function' ? hooks.candidateSha() : candidateSha();
    const lifecycleEvidencePath = evidencePath ? `${evidencePath}.lifecycle-browser.json` : path.join(projectRoot, '.tmp', `p107-lifecycle-${process.pid}.json`);
    if (typeof hooks.restoreToolchainDrift === 'function') hooks.restoreToolchainDrift();
    else restoreToolchainDrift();
    const lifecycle = await runLifecycle(sha, lifecycleEvidencePath);
    const lifecycleRecords = Array.isArray(lifecycle.cases) ? lifecycle.cases : [];
    const lifecycleById = new Map(lifecycleRecords.map((record) => [record.id, record]));
    for (const required of P107_LIFECYCLE_BROWSER_CASES) {
      const record = lifecycleById.get(required);
      assert.ok(record, `lifecycle browser case was not executed: ${required}`);
      assert.equal(record.status, 'PASS', `lifecycle browser case ${required} status=${record.status}`);
    }

    const residue = browserResidue();
    assert.deepEqual(residue.containers, [], `P107 browser container residue: ${residue.containers.join(',')}`);
    assert.deepEqual(residue.networks, [], `P107 browser network residue: ${residue.networks.join(',')}`);

    const cases = lifecycleRecords.map((record) => record.id);
    assert.equal(new Set(cases).size, cases.length, 'P107 browser produced duplicate case ids');
    for (const required of REQUIRED_CASES) assert.ok(cases.includes(required), `P107 browser required case missing: ${required}`);

    const evidence = {
      format: 'kurabe-p107m1t10-qualification-browser/v1',
      taskId: TASK_ID,
      tier: NATIVE_TIER,
      authenticated: true,
      status: 'QUALIFIED',
      generatedAt: new Date().toISOString(),
      candidateSha: sha,
      lifecycleBrowser: {
        status: lifecycle.meta?.status,
        qualification: lifecycle.meta?.qualification,
        manifestSize: lifecycle.summary?.manifestSize,
        asserted: lifecycle.summary?.asserted,
        chrome: lifecycle.meta?.chrome || null,
      },
      requiredCases: [...REQUIRED_CASES],
      cases,
      caseCount: cases.length,
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
      cases,
      authenticatedCases: cases.length,
      requiredCases: [...REQUIRED_CASES],
      candidateSha: sha,
      taskId: TASK_ID,
      evidencePath: detailPath,
      richEvidence: evidence,
      productionWrites: 0,
      productionMigrations: 0,
      target: 'actual-next-production-build-chrome-cdp-authenticated',
    };
  } catch (error) {
    // Surface the real reason: verify-release imports run() and only reports a generic
    // "did not report a real local run", so without this the CI log shows nothing useful.
    console.error(`P107_QUALIFICATION_BROWSER_FAILURE ${safeError(error)}`);
    // P110M2T01: surface the real producer failure (already redacted at build time)
    // and persist it beside the evidence so the CI artifact upload keeps it.
    if (error?.diagnostics) {
      console.error(`P107_QUALIFICATION_DIAGNOSTICS ${JSON.stringify(error.diagnostics)}`);
      if (detailPath) {
        try {
          fs.mkdirSync(path.dirname(detailPath), { recursive: true });
          fs.writeFileSync(`${detailPath}.diagnostics.json`, `${JSON.stringify(error.diagnostics, null, 2)}\n`, { mode: 0o600 });
        } catch (writeError) {
          console.error(`P107_QUALIFICATION_DIAGNOSTICS_WRITE_FAILED ${safeError(writeError)}`);
        }
      }
    }
    const failure = {
      format: 'kurabe-p107m1t10-qualification-browser/v1',
      taskId: TASK_ID,
      tier: NATIVE_TIER,
      authenticated: false,
      status: error?.code === 'MISSING_RUNTIME_CAPABILITY' ? 'BLOCKED_CAPABILITY' : 'UNKNOWN',
      generatedAt: new Date().toISOString(),
      requiredCases: [...REQUIRED_CASES],
      cases: [],
      firstFailure: safeError(error),
      candidateSha: sha || process.env.KURABE_CONFIRMATION_CANDIDATE_SHA || 'UNKNOWN',
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
      target: 'no-qualified-p107-browser-evidence',
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await run({ options: { evidence: process.env.KURABE_P107_BROWSER_EVIDENCE } });
  console.log(`P107_QUALIFICATION_BROWSER ${result.status} cases=${(result.cases || []).length} tier=${result.tier}${result.reason ? ` firstFailure=${result.reason}` : ''}`);
  if (!result.passed) process.exitCode = 1;
}
