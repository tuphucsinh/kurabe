import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

// ============================================================================
// P110M5T01 — Chromium launch resilience for the CI browser lane.
// Root-caused 2026-10-25 (run 40149899462, diagnostics artifact): trên một phần
// runner fleet, Chrome không mở được DevTools port (cùng image/Chrome/Node với
// run xanh ngày trước) VÀ child treo giữ producer sống ~39 phút sau lỗi.
// Fix: launch retry bounded + kill child mỗi lần fail; wrapper SIGKILL escalate;
// pin runner image.
// ============================================================================

const browserModule = await import('../tests/fixtures/p107/lifecycle-coherence/lib/browser.mjs');
const { launchChromium } = browserModule;

// --- 1. Behavioral: a binary that never opens the DevTools port is retried
//        bounded times, children are killed, profiles cleaned, and the final
//        error is the devtools timeout (NOT a 40-minute hang).
{
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p110-chromium-'));
  // Giả lập đúng failure mode đã quan sát trên runner: process SỐNG, bỏ qua mọi
  // args, không bao giờ mở DevTools port (không phải exit-sớm).
  const fakeBinary = path.join(runtimeRoot, 'fake-chromium');
  fs.writeFileSync(fakeBinary, '#!/usr/bin/env node\nif (process.argv.includes("--version")) { console.log("Fake Chromium 156.0.0.0"); process.exit(0); }\nsetInterval(() => {}, 1000);\n');
  fs.chmodSync(fakeBinary, 0o755);
  const t0 = Date.now();
  let rejected = null;
  const seen = [];
  const origError = console.error;
  console.error = (...args) => { seen.push(args.map(String).join(' ')); };
  try {
    await launchChromium({ runtimeRoot, binary: fakeBinary });
  } catch (error) {
    rejected = error;
  } finally {
    console.error = origError;
  }
  const elapsedMs = Date.now() - t0;

  assert.ok(rejected, 'must reject when the endpoint never opens');
  assert.match(String(rejected.message || rejected), /devtools endpoint/,
    'final error names the devtools endpoint');
  const attempts = seen.filter((line) => /chromium launch attempt [123]\/3 failed/.test(line));
  assert.equal(attempts.length, 3, `exactly 3 bounded attempts (saw ${attempts.length})`);
  assert.ok(elapsedMs < 120_000, `bounded total time (took ${elapsedMs}ms)`);
  const leftover = fs.readdirSync(runtimeRoot).filter((name) => name.startsWith('chrome-profile'));
  assert.deepEqual(leftover, [], 'failed attempt profiles are removed');
  fs.rmSync(runtimeRoot, { recursive: true, force: true });
  console.log(`retry path: 3 attempts in ${Math.round(elapsedMs / 1000)}s, children killed, profiles cleaned`);
}

// --- 2. Behavioral: happy path on the REAL local chromium still works ---
{
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p110-chromium-ok-'));
  const handle = await launchChromium({ runtimeRoot });
  try {
    assert.ok(handle.connection, 'cdp connection established');
    const page = await handle.newPage('smoke', { origin: null });
    await page.setViewport(390, 844);
    const ua = await page.evaluate('navigator.userAgent');
    assert.match(String(ua), /HeadlessChrome|Chrome/, 'page evaluates in the real browser');
  } finally {
    const stopped = await handle.stop();
    assert.equal(stopped.processStopped, true, 'chromium process stopped');
    assert.equal(stopped.profileRemoved, true, 'profile removed on clean stop');
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
  console.log('happy path: real chromium launched, drove a page, stopped cleanly');
}

// --- 3. Source contracts: wrapper escalation + pinned runner image ---
const wrapperSource = fs.readFileSync(path.join(projectRoot, 'tests/browser/p107-qualification.mjs'), 'utf8');
assert.match(wrapperSource, /child\.kill\('SIGKILL'\)/, 'wrapper escalates to SIGKILL after the budget SIGTERM');
assert.match(wrapperSource, /LIFECYCLE_BROWSER_TIMEOUT_MS = 2_400_000/, 'wall-clock budget unchanged');

const browserSource = fs.readFileSync(path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/browser.mjs'), 'utf8');
assert.match(browserSource, /CHROMIUM_LAUNCH_ATTEMPTS = 3/, 'bounded retry constant');
assert.match(browserSource, /await stopOwned\(child, \{ graceMs: 3000 \}\)/, 'failed attempts kill the child');
assert.match(browserSource, /chrome-profile-\$\{attempt\}/, 'each attempt uses a fresh profile');

const workflow = fs.readFileSync(path.join(projectRoot, '.github/workflows/ci.yml'), 'utf8');
assert.match(workflow, /runs-on: ubuntu-24\.04/, 'runner image pinned to the verified ubuntu-24.04');
assert.doesNotMatch(workflow, /runs-on: ubuntu-latest/, 'no unpinned ubuntu-latest remains');
assert.doesNotMatch(workflow, /continue-on-error:\s*true/i, 'no continue-on-error introduced');

console.log('P110M5T01 chromium launch resilience: ALL PASS');
