#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run as runBrowserHarness } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chrome = '/usr/bin/google-chrome-stable';
const roles = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'];
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); };

function sourceText(relativeRoot) {
  const base = path.join(root, relativeRoot);
  return fs.readdirSync(base, { recursive: true }).filter((name) => String(name).endsWith('.tsx') || String(name).endsWith('.ts'))
    .map((name) => fs.readFileSync(path.join(base, name), 'utf8')).join('\n');
}

export async function run() {
  const pageSource = sourceText('src/app');
  const components = sourceText('src/components');
  check('browser-visible role and boundary routes are production routes', () => {
    for (const route of ['/dashboard', '/reports', '/teams', '/employees', '/criteria', '/evaluations', '/settings']) {
      assert.ok(fs.existsSync(path.join(root, 'src/app', route.slice(1))), `missing route ${route}`);
    }
    assert.match(pageSource + components, /role|permission|canView/i);
    for (const role of roles) assert.match(pageSource + components, new RegExp(role), `${role} is not represented in UI boundary code`);
  });
  check('period, evaluation, report/history/export and AI-stub UI paths are present', () => {
    for (const marker of ['period', 'evaluation', 'report', 'history', 'export']) assert.match((pageSource + components).toLowerCase(), new RegExp(marker));
    assert.match((pageSource + components).toLowerCase(), /ai|summary|chat/);
  });

  if (!fs.existsSync(chrome)) {
    const reason = 'BLOCKED_CAPABILITY: /usr/bin/google-chrome-stable is unavailable; no Chromium, mock browser, or synthetic PASS fallback is allowed.';
    return { real: true, passed: false, status: 'BLOCKED_CAPABILITY', capability: 'BLOCKED_CAPABILITY', reason, cases, roles, target: 'no-browser-runtime' };
  }

  const fixture = path.join(root, 'tests/fixtures/release/browser-page.html');
  assert.ok(fs.existsSync(fixture), 'release browser fixture is missing');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-release-matrix-chrome-'));
  try {
    const browserResult = await runBrowserHarness();
    assert.equal(browserResult.real, true);
    assert.ok(browserResult.cases.length > 0);
    return { real: true, passed: true, status: 'EXECUTED', cases: [...cases, ...browserResult.cases], roles, target: browserResult.target, profile_cleanup: profile };
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await run(); if (!result.passed) { console.error(`RELEASE_BROWSER_MATRIX BLOCKED ${result.status} reason=${result.reason}`); process.exitCode = 1; } else console.log(`RELEASE_BROWSER_MATRIX ${result.status} cases=${result.cases.length} roles=${result.roles.join(',')} reason=${result.reason || 'actual local Chrome exercised'}`); }
  catch (error) { console.error(`RELEASE_BROWSER_MATRIX FAIL ${error?.message || error}`); process.exitCode = 1; }
}
