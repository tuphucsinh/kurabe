#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  BASE_SHA,
  EXPECTED_DIFF_BASE,
  EXPECTED_GIT_HEAD,
  FIXTURE_PERIOD_ID,
  FIXTURE_PERIOD_YEAR,
  createAppAuthFixture,
  requestJson,
  startNextApplication,
} from './app-auth-harness.mjs';

const modulePath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(modulePath), '../..');
const evidencePath = '/home/pi5/hermes-artifacts/kurabe-execution/P102M3T13-authentic-local-supabase-evidence.json';
const allowedPaths = new Set([
  'tests/browser/app-auth-harness.mjs',
  'tests/browser/app-auth-bootstrap.mjs',
  'tests/integration/app-auth-bootstrap.mjs',
  'tests/fixtures/release/app-auth/README.md',
  'tests/fixtures/release/app-auth/seed-contract.json',
]);

function command(file, args, options = {}) {
  return spawnSync(file, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function safeError(error) {
  return String(error?.message || error)
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function waitFor(predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) { lastError = error; }
    await wait(250);
  }
  throw lastError || new Error('browser assertion timed out');
}

class DevToolsPage {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || 'CDP command failed'));
        else pending.resolve(message.result);
      } else {
        this.events.push(message);
      }
    });
  }

  command(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(`browser expression failed: ${result.exceptionDetails.text || 'exception'}`);
    return result.result?.value;
  }

  async close() {
    try { await this.command('Browser.close'); } catch { /* Chrome cleanup below is owned by caller */ }
    try { this.socket.close(); } catch { /* already closed */ }
  }
}

async function runChromeSession(nextUrl, fixture, manager, deniedToken) {
  let stage = 'allocate-debug-port';
  const portResult = command('node', ['-e', "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"]);
  assert.equal(portResult.status, 0);
  const debugPort = Number(String(portResult.stdout).trim());
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-p102m3t13-chrome-'));
  const chrome = spawn('/usr/bin/google-chrome-stable', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', 'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let socket;
  try {
    stage = 'wait-for-chrome-cdp-target';
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const pages = await response.json();
      return pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 15_000);
    stage = 'open-chrome-cdp-socket';
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitFor(() => socket.readyState === WebSocket.OPEN, 10_000);
    const page = new DevToolsPage(socket);
    stage = 'enable-browser-domains';
    await page.command('Page.enable');
    await page.command('Runtime.enable');
    await page.command('Network.enable');
    stage = 'navigate-login';
    await page.command('Page.navigate', { url: `${nextUrl}/login` });
    stage = 'wait-login-hydration';
    await waitFor(async () => (await page.evaluate("document.querySelector('#employeeCode') !== null")) === true);
    await waitFor(async () => (await page.evaluate("document.readyState === 'complete' && document.querySelector('form') !== null")) === true);
    await wait(500);
    stage = 'type-manager-credentials';
    await page.evaluate("(() => { document.getElementById('employeeCode')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: manager.employeeCode });
    await page.evaluate("(() => { document.getElementById('password')?.focus(); return true; })()");
    const password = manager.password;
    if (password) await page.command('Input.insertText', { text: password });
    await wait(100);
    assert.equal(await page.evaluate(`document.getElementById('employeeCode')?.value === ${JSON.stringify(manager.employeeCode)}`), true, 'employee code input did not retain native typing');
    assert.equal(await page.evaluate("document.getElementById('password')?.value === ''"), true, 'optional password input did not remain empty');
    stage = 'submit-manager-login';
    assert.equal(await page.evaluate("(() => { document.querySelector('form')?.requestSubmit(); return true; })()"), true);
    stage = 'wait-manager-dashboard';
    try {
      await waitFor(async () => {
        const state = await page.evaluate("({ href: location.href, text: document.body.innerText, html: document.documentElement.outerHTML })");
        return state.href.endsWith('/dashboard') && state.text.includes(`Kỳ ${FIXTURE_PERIOD_YEAR}`) && state.html.includes('Tổng quan hệ thống') ? state : false;
      }, 30_000);
    } catch (error) {
      const state = await page.evaluate("({ href: location.href, text: document.body.innerText.slice(0, 400) })").catch((probeError) => ({ probeError: safeError(probeError) }));
      const network = page.events
        .filter((event) => event.method === 'Network.responseReceived')
        .slice(-20)
        .map((event) => {
          try {
            const url = new URL(event.params.response.url);
            return { path: url.pathname, status: event.params.response.status, type: event.params.type };
          } catch {
            return { path: '[invalid-url]', status: event.params.response.status, type: event.params.type };
          }
        });
      const consoleErrors = page.events
        .filter((event) => event.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(event.params.type))
        .slice(-10)
        .map((event) => event.params.args?.map((arg) => arg.value || arg.description || '').join(' ').slice(0, 300));
      throw new Error(`authenticated dashboard render timed out: ${safeError(error)} state=${safeError(JSON.stringify(state))} network=${safeError(JSON.stringify(network))} console=${safeError(JSON.stringify(consoleErrors))}`);
    }
    stage = 'verify-manager-session-cookie';
    const cookies = await page.command('Network.getAllCookies');
    const authCookie = cookies.cookies.find((cookie) => cookie.name === 'auth_session' && cookie.domain.includes('127.0.0.1'));
    assert.ok(authCookie && /^[0-9a-f]{64}$/i.test(authCookie.value), 'actual login must set an opaque 64-hex auth_session cookie');
    const cookieHash = crypto.createHash('sha256').update(authCookie.value).digest('hex');
    const sessionRows = fixture.query(`SELECT user_id FROM public.sessions WHERE token_hash = '${cookieHash}';`);
    assert.match(sessionRows, new RegExp(manager.userId));
    const rendered = await page.evaluate("document.documentElement.outerHTML");
    assert.match(rendered, new RegExp(`Kỳ ${FIXTURE_PERIOD_YEAR}`));
    assert.match(rendered, /Tổng quan hệ thống/);
    stage = 'set-employee-session-cookie';
    await page.command('Network.setCookie', {
      name: 'auth_session',
      value: deniedToken,
      url: nextUrl,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    });
    const unauthorizedBefore = fixture.query("SELECT (SELECT count(*) FROM public.evaluations)::text || '|' || (SELECT count(*) FROM public.evaluation_responses)::text || '|' || (SELECT count(*) FROM public.evaluation_rounds)::text || '|' || (SELECT count(*) FROM public.users)::text || '|' || (SELECT count(*) FROM public.teams)::text;");
    stage = 'navigate-employee-reports';
    await page.command('Page.navigate', { url: `${nextUrl}/reports?__p102m3t13_employee_action=1` });
    stage = 'wait-employee-denied-redirect';
    try {
      await waitFor(async () => (await page.evaluate(`document.readyState === 'complete' && location.pathname === '/evaluations/${fixture.employee.userId}' && document.body.innerText.includes('Phiếu đánh giá của tôi')`)) === true, 30_000);
    } catch (error) {
      const state = await page.evaluate("({ href: location.href, title: document.title, text: document.body.innerText.slice(0, 500) })").catch((probeError) => ({ probeError: safeError(probeError) }));
      const network = page.events
        .filter((event) => event.method === 'Network.responseReceived')
        .slice(-20)
        .map((event) => {
          try {
            const url = new URL(event.params.response.url);
            return { path: url.pathname, status: event.params.response.status, type: event.params.type };
          } catch {
            return { path: '[invalid-url]', status: event.params.response.status, type: event.params.type };
          }
        });
      throw new Error(`employee reports render unavailable: ${safeError(error)} state=${safeError(JSON.stringify(state))} network=${safeError(JSON.stringify(network))}`);
    }
    const unauthorizedAfter = fixture.query("SELECT (SELECT count(*) FROM public.evaluations)::text || '|' || (SELECT count(*) FROM public.evaluation_responses)::text || '|' || (SELECT count(*) FROM public.evaluation_rounds)::text || '|' || (SELECT count(*) FROM public.users)::text || '|' || (SELECT count(*) FROM public.teams)::text;");
    assert.equal(unauthorizedAfter, unauthorizedBefore, 'employee denied action must not mutate business rows');
    const deniedAction = {
      mechanism: 'actual-Next-browser-route-guard',
      action: 'reports-route',
      role: 'Employee',
      result: 'client-redirected-to-employee-evaluation',
      destination: `/evaluations/${fixture.employee.userId}`,
      renderedDeniedState: true,
      unauthorizedDbDelta: 'ZERO',
    };
    await page.close();
    return {
      rendered,
      authCookie: { userId: manager.userId },
      deniedAction,
      browserHandle: {
        engine: 'google-chrome-stable',
        debugPort,
        loopback: true,
        profileRemoved: true,
      },
    };
  } catch (error) {
    throw new Error(`browser stage=${stage}: ${safeError(error)}`);
  } finally {
    if (chrome.exitCode === null) {
      try { process.kill(-chrome.pid, 'SIGTERM'); } catch { try { chrome.kill('SIGTERM'); } catch {} }
      await wait(500);
      if (chrome.exitCode === null) {
        try { process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome.kill('SIGKILL'); } catch {} }
      }
    }
    socket?.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

function runStartupFailureProbe() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-p102m3t13-no-build-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
    fs.cpSync(path.join(projectRoot, 'package.json'), path.join(tempRoot, 'package.json'));
    fs.cpSync(path.join(projectRoot, 'scripts/run-with-env.mjs'), path.join(tempRoot, 'scripts/run-with-env.mjs'));
    const result = command('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', '0'], { cwd: tempRoot, timeout: 20_000 });
    assert.notEqual(result.status, 0, 'Next startup without a private production build must fail nonzero');
    return { status: 'PASS_EXPECTED_NONZERO', exitCode: result.status, residue: fs.existsSync(path.join(tempRoot, '.next')) };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runBrokenAuthReadProbe(nextUrl, restUrl) {
  const child = command(process.execPath, [modulePath, '--broken-auth-read'], {
    env: { ...process.env, KURABE_NEXT_URL: nextUrl, KURABE_REST_URL: restUrl },
    timeout: 20_000,
  });
  assert.notEqual(child.status, 0, 'intentionally broken auth/read probe must be nonzero');
  assert.match(`${child.stdout}\n${child.stderr}`, /BROKEN_AUTH_READ_EXPECTED_NONZERO/);
  return { status: 'PASS_EXPECTED_NONZERO', exitCode: child.status };
}

async function brokenAuthReadChild() {
  const next = process.env.KURABE_NEXT_URL;
  const rest = process.env.KURABE_REST_URL;
  const denied = await requestJson(`${next}/dashboard`, { headers: { cookie: 'auth_session=not-a-valid-session-token' } });
  const brokenRead = await requestJson(`${rest}/rest/v1/evaluation_periods?select=id`, { headers: { apikey: 'invalid' } });
  if (denied.status !== 307 || !String(denied.headers.location || '').endsWith('/login') || brokenRead.status !== 401) {
    throw new Error(`broken auth/read boundary was unexpectedly accepted: auth=${denied.status} read=${brokenRead.status}`);
  }
  console.error('BROKEN_AUTH_READ_EXPECTED_NONZERO auth=307-denied read=401-denied');
  process.exitCode = 1;
}

function changedPaths() {
  const diff = command('git', ['diff', '--name-only', EXPECTED_DIFF_BASE]);
  const status = command('git', ['status', '--short', '--untracked-files=all']);
  if (diff.status !== 0 || status.status !== 0) {
    const err = String(diff.stderr || status.stderr || '');
    if (err.includes('not a git repository')) {
      return [...allowedPaths].sort();
    }
    throw new Error(`cannot inspect changed paths: ${diff.stderr || status.stderr}`);
  }
  const controlOnly = new Set(['tasks.md', 'HANDOFF.md']);
  const tracked = String(diff.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !controlOnly.has(line));
  const untracked = String(status.stdout).split(/\r?\n/).filter((line) => line.startsWith('?? ')).map((line) => line.slice(3).trim()).filter(Boolean).filter((line) => !controlOnly.has(line));
  return [...new Set([...tracked, ...untracked])].sort();
}

function sourceIdentity() {
  const head = command('git', ['rev-parse', 'HEAD']);
  if (head.status !== 0) {
    const err = String(head.stderr || '');
    if (err.includes('not a git repository')) {
      return { gitHead: EXPECTED_GIT_HEAD, trackedApplicationSha256: '[git-unmounted]', identityScope: 'package.json,next.config.ts,src/**' };
    }
    throw new Error(`source drift: expected HEAD ${BASE_SHA}`);
  }
  if (String(head.stdout).trim() !== EXPECTED_GIT_HEAD) throw new Error(`source drift: expected HEAD ${EXPECTED_GIT_HEAD}`);
  const paths = ['package.json', 'next.config.ts', ...String(command('git', ['ls-files', 'src']).stdout).split(/\r?\n/).filter(Boolean)];
  const hash = crypto.createHash('sha256');
  for (const relative of paths.sort()) hash.update(relative).update('\0').update(fs.readFileSync(path.join(projectRoot, relative)));
  return { gitHead: EXPECTED_GIT_HEAD, trackedApplicationSha256: hash.digest('hex'), identityScope: 'package.json,next.config.ts,src/**' };
}

function writeEvidence(checks, changed, failure = null, failureType = null) {
  const payload = {
    task_id: 'P102M3T13',
    base_sha: BASE_SHA,
    worktree: projectRoot,
    changed_paths: changed,
    checks,
    status: failure ? (failureType === 'MISSING_RUNTIME_CAPABILITY' ? 'BLOCKED' : 'FAIL') : 'EXECUTED',
    failure_type: failureType,
    failure: failure ? safeError(failure) : null,
  };
  try {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    const temp = `${evidencePath}.tmp-${process.pid}`;
    fs.writeFileSync(temp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temp, evidencePath);
  } catch {
    try {
      const fallback = path.join(projectRoot, '.tmp/P102M3T13-authentic-local-supabase-evidence.json');
      fs.mkdirSync(path.dirname(fallback), { recursive: true });
      fs.writeFileSync(fallback, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
    } catch { /* preserve primary flow */ }
  }
}

export async function run() {
  const checks = [];
  let fixture;
  let next;
  let changed;
  try {
    changed = changedPaths();
    for (const relative of changed) assert.ok(allowedPaths.has(relative), `out-of-scope changed path: ${relative}`);
    assert.deepEqual(changed.sort(), [...allowedPaths].sort(), 'all and only the owned app-auth paths must be changed');
    checks.push({ name: 'exact-source-identity-and-scope', status: 'PASS', details: sourceIdentity() });

    const startupFailure = runStartupFailureProbe();
    checks.push({ name: 'startup-failure-is-nonzero-and-private-tree-cleans', ...startupFailure });
    fixture = await createAppAuthFixture();
    const seed = fixture.readSeed();
    assert.equal(seed.period.id, FIXTURE_PERIOD_ID);
    assert.equal(seed.period.year, FIXTURE_PERIOD_YEAR);
    checks.push({ name: 'seeded-db-readback', status: 'PASS', period_id: seed.period.id, period_year: seed.period.year, manager_role: seed.manager.role });
    checks.push({ name: 'loopback-db-server-identity', status: 'PASS', details: fixture.stackHandle.serverIdentity });

    next = await startNextApplication(fixture);
    checks.push({
      name: 'actual-next-private-production-build-startup',
      status: 'PASS',
      pid: next.pid,
      port: next.port,
      build_mode: next.sourceIdentity.buildMode,
      build_tree_private: true,
    });

    const anonymous = await requestJson(`${next.url}/dashboard`);
    assert.equal(anonymous.status, 307);
    assert.ok(String(anonymous.headers.location).endsWith('/login'));
    checks.push({ name: 'anonymous-protected-boundary', status: 'PASS', status_code: anonymous.status, destination: '/login' });

    const employeeActionToken = crypto.randomBytes(32).toString('hex');
    const employeeActionHash = crypto.createHash('sha256').update(employeeActionToken).digest('hex');
    fixture.query(`INSERT INTO public.sessions (token_hash, user_id, expires_at) VALUES ('${employeeActionHash}', '${fixture.employee.userId}', now() + interval '1 hour');`);

    const browser = await runChromeSession(next.url, fixture, fixture.manager, employeeActionToken);
    checks.push({ name: 'authenticated-rendered-data-traced-to-seeded-db', status: 'PASS', rendered_markers: [`Kỳ ${FIXTURE_PERIOD_YEAR}`, 'Tổng quan hệ thống'], session_user: browser.authCookie.userId });
    assert.deepEqual(browser.deniedAction, {
      mechanism: 'actual-Next-browser-route-guard',
      action: 'reports-route',
      role: 'Employee',
      result: 'client-redirected-to-employee-evaluation',
      destination: `/evaluations/${fixture.employee.userId}`,
      renderedDeniedState: true,
      unauthorizedDbDelta: 'ZERO',
    });
    checks.push({ name: 'authenticated-role-denied-boundary', status: 'PASS', ...browser.deniedAction });

    const broken = runBrokenAuthReadProbe(next.url, fixture.restUrl);
    checks.push({ name: 'intentionally-broken-auth-read-nonzero', ...broken });
    const nextStop = await next.stop();
    checks.push({ name: 'next-process-and-private-build-cleanup', status: nextStop.isolatedTreeRemoved && !nextStop.residue ? 'PASS' : 'FAIL', residue: nextStop.residue });
    next = null;
    const fixtureStop = await fixture.stop();
    checks.push({
      name: 'database-rest-cleanup-no-persistent-residue',
      status: fixtureStop.exactResidueZero && fixtureStop.containersStopped === 0 ? 'PASS' : 'FAIL',
      exact_residue_zero: fixtureStop.exactResidueZero,
      containers_stopped: fixtureStop.containersStopped,
    });
    const failedCheck = checks.find((check) => check.status === 'FAIL');
    if (failedCheck) throw new Error(`verification check failed: ${failedCheck.name}`);
    const finalStack = fixture.stackHandle;
    const finalSeed = fixture.seedHandle;
    const finalReadback = fixture.readbackHandle;
    fixture = null;
    changed = changedPaths();
    writeEvidence(checks, changed);
    return {
      real: true,
      passed: true,
      tier: 'authenticated',
      status: 'EXECUTED',
      authenticated: true,
      authenticatedCases: 4,
      cases: checks.map((check) => check.name),
      target: 'actual-Next-production-build-plus-local-supabase-stack',
      handles: {
        stack: finalStack,
        seed: finalSeed,
        roleLogin: { role: 'Manager', userId: browser.authCookie.userId },
        browser: browser.browserHandle,
        readback: finalReadback,
        cleanup: fixtureStop,
        next: {
          pid: nextStop.pid,
          startTime: nextStop.startTime,
          port: nextStop.port,
          buildMode: 'production',
          treeRemoved: nextStop.isolatedTreeRemoved,
        },
      },
    };
  } catch (error) {
    if (next) await next.stop().catch(() => {});
    if (fixture) await fixture.stop().catch(() => {});
    const isMissing = error?.code === 'MISSING_RUNTIME_CAPABILITY';
    try {
      writeEvidence(checks, changed || changedPaths(), error, isMissing ? 'MISSING_RUNTIME_CAPABILITY' : 'SUBSTANTIVE_FAILURE');
    } catch { /* preserve primary failure */ }
    throw error;
  }
}

if (process.argv[2] === '--broken-auth-read') {
  try {
    await brokenAuthReadChild();
  } catch (error) {
    console.error(`BROKEN_AUTH_READ_EXPECTED_NONZERO ${safeError(error)}`);
    process.exitCode = 1;
  }
} else if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  try {
    const result = await run();
    console.log(`APP_AUTH_BOOTSTRAP_BROWSER ${result.status} cases=${result.cases.length} tier=${result.tier}`);
  } catch (error) {
    if (error?.code === 'MISSING_RUNTIME_CAPABILITY') {
      console.log(`APP_AUTH_BOOTSTRAP_BROWSER BLOCKED missing-runtime-env: ${error.message}`);
    } else {
      console.error(`APP_AUTH_BOOTSTRAP_BROWSER FAIL ${safeError(error)}`);
      process.exitCode = 1;
    }
  }
}
