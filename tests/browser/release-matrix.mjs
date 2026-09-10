#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chrome = '/usr/bin/google-chrome-stable';
const roles = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'];
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); };

function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => { server.close((error) => (error ? reject(error) : resolve())); });
  return port;
}

async function waitForHttp(url, child) {
  let lastStatus = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      lastStatus = response.status;
      if ([200, 307, 308].includes(response.status)) return response.status;
    } catch { /* server is still starting */ }
    if (child.exitCode !== null) break;
    await sleep(500);
  }
  throw new Error(`local Next server did not become ready (status=${lastStatus ?? 'none'})`);
}

function runChrome(url, profile, windowSize) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
      `--window-size=${windowSize}`, '--dump-dom', url,
    ], { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { signalProcessGroup(child, 'SIGKILL'); reject(new Error(`Chrome timed out for ${url}`)); }, 30_000);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Chrome failed for ${url} (exit=${code}): ${stderr.trim().split(/\r?\n/).find(Boolean) || 'no diagnostic'}`));
      else resolve(stdout);
    });
  });
}

function signalProcessGroup(child, signal) {
  try { process.kill(-child.pid, signal); } catch { child.kill(signal); }
}

async function stopProcess(child) {
  if (child.exitCode !== null) return;
  const closed = new Promise((resolve) => child.once('close', resolve));
  signalProcessGroup(child, 'SIGTERM');
  await Promise.race([closed, sleep(5_000)]);
  if (child.exitCode === null) {
    signalProcessGroup(child, 'SIGKILL');
    await Promise.race([closed, sleep(2_000)]);
  }
}

async function runActualNextBrowser() {
  const port = await freePort();
  const child = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: os.tmpdir(),
      LANG: 'C',
      LC_ALL: 'C',
      NODE_ENV: 'production',
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${port}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'release-browser-placeholder',
      SUPABASE_SERVICE_ROLE_KEY: 'release-browser-placeholder',
      OPENAI_API_KEY: '',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
    },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  try {
    const loginStatus = await waitForHttp(`http://127.0.0.1:${port}/login`, child);
    assert.equal(loginStatus, 200);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-release-matrix-chrome-'));
    try {
      const checks = [
        ['/login', 'desktop', '1440,900', /employee|login/i],
        ['/login', 'mobile', '390,844', /employee|login/i],
        ['/dashboard', 'auth-boundary', '1440,900', /employee|login/i],
        ['/reports', 'auth-boundary', '390,844', /employee|login/i],
      ];
      const executed = [];
      for (const [route, viewport, windowSize, marker] of checks) {
        const dom = await runChrome(`http://127.0.0.1:${port}${route}`, profile, windowSize);
        assert.match(dom, marker, `${route} did not render the real auth boundary`);
        executed.push(`next-${route.slice(1)}-${viewport}`);
      }
      return { cases: executed, target: 'loopback-next-production-build-with-google-chrome', authenticated: false };
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
  } catch (error) {
    const detail = stderr.trim().split(/\r?\n/).find(Boolean);
    throw new Error(`${error.message}${detail ? `; next=${detail}` : ''}`);
  } finally {
    await stopProcess(child);
  }
}

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
    return { real: false, passed: false, status: 'BLOCKED_CAPABILITY', capability: 'BLOCKED_CAPABILITY', reason, cases, roles, target: 'no-browser-runtime' };
  }

  const browserResult = await runActualNextBrowser();
  assert.ok(browserResult.cases.length > 0);
  return { real: true, passed: true, status: 'EXECUTED', cases: [...cases, ...browserResult.cases], roles, target: browserResult.target, authenticated: browserResult.authenticated };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await run(); if (!result.passed) { console.error(`RELEASE_BROWSER_MATRIX BLOCKED ${result.status} reason=${result.reason}`); process.exitCode = 1; } else console.log(`RELEASE_BROWSER_MATRIX ${result.status} cases=${result.cases.length} roles=${result.roles.join(',')} reason=${result.reason || 'actual local Chrome exercised'}`); }
  catch (error) { console.error(`RELEASE_BROWSER_MATRIX FAIL ${error?.message || error}`); process.exitCode = 1; }
}
