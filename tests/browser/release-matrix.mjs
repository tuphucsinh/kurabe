#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  FIXTURE_EVALUATION_ID,
  FIXTURE_EMPLOYEE_ID,
  FIXTURE_MANAGER_ID,
  FIXTURE_PERIOD_ID,
  FIXTURE_PERIOD_YEAR,
  FIXTURE_TEAM_ID,
  createAppAuthFixture,
  requestJson,
  startNextApplication,
} from './app-auth-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chrome = process.env.CHROME_BIN || '/usr/bin/google-chrome-stable';
const roles = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'];
const cases = [];
const check = (name, fn) => { fn(); cases.push(name); };

function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function waitFor(predicate, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw lastError || new Error(`condition did not become true within ${timeout}ms`);
}

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
        if (message.error) pending.reject(new Error(`CDP ${method}: ${message.error.message || 'command failed'}`));
        else pending.resolve(message.result);
      } else this.events.push(message);
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
}

async function startChromePage() {
  const debugPort = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-release-matrix-chrome-'));
  const child = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', 'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let socket;
  try {
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      return (await response.json()).find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
    }, 15_000);
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitFor(() => socket.readyState === WebSocket.OPEN, 10_000);
    const page = new DevToolsPage(socket);
    await page.command('Page.enable');
    await page.command('Runtime.enable');
    await page.command('Network.enable');
    return { page, child, profile, debugPort };
  } catch (error) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    fs.rmSync(profile, { recursive: true, force: true });
    throw error;
  }
}

async function stopChromePage(browser) {
  if (!browser) return;
  try { await browser.page.command('Browser.close'); } catch { /* cleanup below */ }
  try { browser.page.socket.close(); } catch { /* already closed */ }
  if (browser.child.exitCode === null) {
    try { process.kill(-browser.child.pid, 'SIGTERM'); } catch { browser.child.kill('SIGTERM'); }
    await sleep(500);
    if (browser.child.exitCode === null) {
      try { process.kill(-browser.child.pid, 'SIGKILL'); } catch { browser.child.kill('SIGKILL'); }
    }
  }
  fs.rmSync(browser.profile, { recursive: true, force: true });
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function credentialState(fixture, userId) {
  return fixture.query(`
    SELECT json_build_object(
      'target_user_id', u.id,
      'employee_code', u.employee_code,
      'name', u.name,
      'role', u.role,
      'password_hash_is_null', u.password_hash IS NULL,
      'password_hash_length', coalesce(length(u.password_hash), 0),
      'password_setup_required', u.password_setup_required,
      'credential_revision', u.credential_revision,
      'session_count', (SELECT count(*) FROM public.sessions s WHERE s.user_id = u.id),
      'active_session_count', (SELECT count(*) FROM public.sessions s WHERE s.user_id = u.id AND s.expires_at > now()),
      'setup_token_count', (SELECT count(*) FROM public.password_setup_tokens t WHERE t.user_id = u.id),
      'active_setup_token_count', (SELECT count(*) FROM public.password_setup_tokens t WHERE t.user_id = u.id AND t.used_at IS NULL AND t.expires_at > now()),
      'setup_tokens', coalesce((SELECT json_agg(json_build_object('id', t.id, 'used_at_is_null', t.used_at IS NULL, 'expires_at', t.expires_at)) FROM public.password_setup_tokens t WHERE t.user_id = u.id), '[]'::json)
    )::text
    FROM public.users u
    WHERE u.id = ${sqlLiteral(userId)};
  `);
}

async function resetBrowserDiagnostics(page, fixture, beforeState, afterState) {
  const redactUrl = (value) => String(value || '').replace(/([?#]).*$/, '$1[REDACTED]');
  const redactSensitive = (value) => String(value || '')
    .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED_TOKEN]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  const events = page.events.filter((event) => [
    'Network.requestWillBeSent',
    'Network.responseReceived',
    'Network.loadingFailed',
    'Runtime.consoleAPICalled',
    'Runtime.exceptionThrown',
  ].includes(event.method));
  const network = events.map((event) => {
    if (event.method === 'Network.requestWillBeSent') {
      return {
        method: event.method,
        requestId: event.params?.requestId,
        url: redactUrl(event.params?.request?.url),
        httpMethod: event.params?.request?.method,
        hasPostData: Boolean(event.params?.request?.hasPostData),
        postDataLength: event.params?.request?.postData?.length || 0,
      };
    }
    if (event.method === 'Network.responseReceived') {
      return {
        method: event.method,
        requestId: event.params?.requestId,
        url: redactUrl(event.params?.response?.url),
        status: event.params?.response?.status,
        mimeType: event.params?.response?.mimeType,
      };
    }
    if (event.method === 'Network.loadingFailed') {
      return { method: event.method, requestId: event.params?.requestId, errorText: event.params?.errorText, canceled: event.params?.canceled ?? false };
    }
    return { method: event.method, type: event.params?.type, text: redactSensitive(String(event.params?.exceptionDetails?.text || event.params?.args?.[0]?.value || '').slice(0, 500)) };
  });
  return {
    capturedAt: new Date().toISOString(),
    target: { userId: FIXTURE_EMPLOYEE_ID, expectedEmployeeCode: 'P102M3T13-EMP' },
    beforeState,
    afterState,
    browserState: await page.evaluate("(() => { const text=document.body.innerText; return { path: location.pathname, text: text.slice(0, 1600).replace(/\\b[a-f0-9]{64}\\b/gi, '[REDACTED_TOKEN]'), tokenInputLength: document.querySelector('#setup-token-input')?.value?.length ?? -1, setupTokenTextLength: [...document.querySelectorAll('input')].find((input) => input.readOnly && input.value)?.value?.length ?? -1, successTextPresent: text.includes('Mã thiết lập mật khẩu'), errorTextPresent: text.includes('Lỗi đặt lại mật khẩu') }; })()"),
    network,
    fixtureManagerState: credentialState(fixture, FIXTURE_MANAGER_ID),
    fixtureEmployeeState: credentialState(fixture, FIXTURE_EMPLOYEE_ID),
  };
}

function seedRoleMatrix(fixture) {
  const extras = [
    ['66666666-6666-4666-8666-666666666666', 'P102M3T09-LEAD', 'P102M3T09 Seed Leader', 'Leader', '66666666-6666-4666-8666-666666666667'],
    ['77777777-7777-4777-8777-777777777777', 'P102M3T09-SUBLEAD', 'P102M3T09 Seed SubLeader', 'SubLeader', '77777777-7777-4777-8777-777777777778'],
    ['88888888-8888-4888-8888-888888888888', 'P102M3T09-WORKER', 'P102M3T09 Seed Worker', 'Worker', '88888888-8888-4888-8888-888888888889'],
  ];
  fixture.query(`
    DELETE FROM public.evaluation_responses WHERE round_id IN (SELECT id FROM public.evaluation_rounds WHERE evaluation_id IN (${extras.map(([,,,, evaluationId]) => sqlLiteral(evaluationId)).join(',')}));
    DELETE FROM public.evaluation_rounds WHERE evaluation_id IN (${extras.map(([,,,, evaluationId]) => sqlLiteral(evaluationId)).join(',')});
    DELETE FROM public.evaluations WHERE id IN (${extras.map(([,,,, evaluationId]) => sqlLiteral(evaluationId)).join(',')});
    DELETE FROM public.sessions WHERE user_id IN (${extras.map(([id]) => sqlLiteral(id)).join(',')});
    DELETE FROM public.users WHERE id IN (${extras.map(([id]) => sqlLiteral(id)).join(',')});
    INSERT INTO public.users (id, employee_code, name, role, team_id, join_date, is_active, password_hash, gender)
    VALUES ${extras.map(([id, code, name, role]) => `(${sqlLiteral(id)}, ${sqlLiteral(code)}, ${sqlLiteral(name)}, ${sqlLiteral(role)}, ${sqlLiteral(FIXTURE_TEAM_ID)}, '2026-01-03', true, NULL, 'Nữ')`).join(',')};
    INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, current_round, status)
    VALUES ${extras.map(([id,,,role, evaluationId]) => `(${sqlLiteral(evaluationId)}, ${sqlLiteral(FIXTURE_PERIOD_ID)}, ${sqlLiteral(id)}, ${sqlLiteral(role)}, ${sqlLiteral(FIXTURE_TEAM_ID)}, 1, 'Draft')`).join(',')};
  `);
  return extras.map(([userId, employeeCode, name, role, evaluationId]) => ({ userId, employeeCode, name, role, evaluationId }));
}

function createRoleSession(fixture, role, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  fixture.query(`INSERT INTO public.sessions (token_hash, user_id, expires_at, credential_revision)
    VALUES (${sqlLiteral(tokenHash)}, ${sqlLiteral(userId)}, now() + interval '1 hour',
      (SELECT credential_revision FROM public.users WHERE id=${sqlLiteral(userId)}));`);
  return { role: role.toLowerCase(), userId, token, tokenHash };
}

async function runActualNextBrowser() {
  let fixture;
  let next;
  let browser;
  let extraRoles = [];
  const executed = [];
  try {
    fixture = await createAppAuthFixture();
    extraRoles = seedRoleMatrix(fixture);
    next = await startNextApplication(fixture);
    browser = await startChromePage();
    const page = browser.page;
    const navigate = async (route, predicate) => {
      await page.command('Page.navigate', { url: `${next.url}${route}` });
      try {
        return await waitFor(async () => predicate(await page.evaluate("({ path: location.pathname, text: document.body.innerText, html: document.documentElement.outerHTML })")), 30_000);
      } catch (error) {
        const state = await page.evaluate("({ path: location.pathname, href: location.href, ready: document.readyState, text: document.body?.innerText || '', htmlLength: document.documentElement?.outerHTML?.length || 0 })");
        throw new Error(`${route} navigation predicate failed: ${error.message}; state=${JSON.stringify(state)}`);
      }
    };
    const setSession = async (session) => {
      await page.command('Network.setCookie', { name: 'auth_session', value: session.token, url: next.url, path: '/', httpOnly: true, sameSite: 'Lax' });
      const row = fixture.query(`
        SELECT json_build_object(
          'session_user_id', s.user_id,
          'session_credential_revision', s.credential_revision,
          'user_credential_revision', u.credential_revision,
          'expires_at', s.expires_at,
          'is_active', s.expires_at > now()
        )::text
        FROM public.sessions s JOIN public.users u ON u.id = s.user_id
        WHERE s.token_hash=${sqlLiteral(session.tokenHash)};
      `);
      assert.match(row, new RegExp(session.userId));
      const cookieReadback = await page.command('Network.getAllCookies');
      const cookie = cookieReadback.cookies?.find((item) => item.name === 'auth_session' && item.domain === new URL(next.url).hostname);
      const cookieHash = cookie?.value ? crypto.createHash('sha256').update(cookie.value).digest('hex') : null;
      fs.writeFileSync('/home/pi5/hermes-artifacts/kurabe-execution/P102M3T09-session-readback.json', `${JSON.stringify({ capturedAt: new Date().toISOString(), expectedUserId: session.userId, cookiePresent: Boolean(cookie), cookieValueLength: cookie?.value?.length || 0, cookieHashMatches: cookieHash === session.tokenHash, dbSession: row }, null, 2)}\n`, { mode: '0600' });
    };

    const loginResponse = await requestJson(`${next.url}/login`);
    assert.equal(loginResponse.status, 200);
    assert.ok(loginResponse.headers['content-security-policy'], 'real Next login must emit CSP');
    executed.push('real-next-readiness-and-csp');

    const manager = createRoleSession(fixture, 'Manager', fixture.manager.userId);
    await setSession(manager);
    const managerDashboard = await navigate('/dashboard', (view) => view.path === '/dashboard' && view.text.includes(`Kỳ ${FIXTURE_PERIOD_YEAR}`) && view.text.includes('Tổng quan hệ thống') ? view : false);
    assert.match(managerDashboard.text, /Tổng quan hệ thống/);
    executed.push('authenticated-manager-allow-dashboard-db-session-readback');

    const resetDiagnosticPath = '/home/pi5/hermes-artifacts/kurabe-execution/P102M3T09-reset-password-diagnostic.json';
    const beforeState = credentialState(fixture, FIXTURE_EMPLOYEE_ID);
    const beforeMutation = Number(fixture.query(`SELECT count(*) FROM public.password_setup_tokens WHERE user_id=${sqlLiteral(FIXTURE_EMPLOYEE_ID)};`));
    await navigate('/employees', (view) => view.path === '/employees' && view.text.includes('P102M3T13 Seed Employee') ? view : false);
    const resetButton = await page.evaluate("(() => { const row=[...document.querySelectorAll('tbody tr')].find((item)=>item.innerText.includes('Mã: P102M3T13-EMP')); const button=row?.querySelector('button[title*=\\\"Đặt lại mật khẩu\\\"]'); button?.click(); return Boolean(button); })()");
    assert.equal(resetButton, true, 'manager must see reset-password action for the intended employee');
    await waitFor(async () => (await page.evaluate("document.body.innerText.includes('Đặt lại mật khẩu')")) === true, 15_000);
    const confirmed = await page.evaluate("(() => { const button=[...document.querySelectorAll('button')].find((item)=>item.textContent.trim()==='Đặt lại'); button?.click(); return Boolean(button); })()");
    assert.equal(confirmed, true, 'reset-password confirmation must expose its bounded action');
    let afterState = null;
    try {
      await waitFor(async () => (await page.evaluate("document.body.innerText.includes('Mã thiết lập mật khẩu')")) === true, 30_000);
      afterState = credentialState(fixture, FIXTURE_EMPLOYEE_ID);
      const diagnostics = await resetBrowserDiagnostics(page, fixture, beforeState, afterState);
      fs.writeFileSync(resetDiagnosticPath, `${JSON.stringify(diagnostics, null, 2)}\n`, { mode: 0o600 });
      const afterMutation = Number(fixture.query(`SELECT count(*) FROM public.password_setup_tokens WHERE user_id=${sqlLiteral(FIXTURE_EMPLOYEE_ID)};`));
      assert.ok(afterMutation > beforeMutation, `manager reset-password must persist a setup token (${beforeMutation}->${afterMutation}); diagnostic=${resetDiagnosticPath}`);
    } catch (error) {
      afterState = afterState || credentialState(fixture, FIXTURE_EMPLOYEE_ID);
      try {
        const diagnostics = await resetBrowserDiagnostics(page, fixture, beforeState, afterState);
        fs.writeFileSync(resetDiagnosticPath, `${JSON.stringify(diagnostics, null, 2)}\n`, { mode: 0o600 });
      } catch (diagnosticError) {
        fs.writeFileSync(resetDiagnosticPath, `${JSON.stringify({ beforeState, afterState, diagnosticError: String(diagnosticError.message || diagnosticError) }, null, 2)}\n`, { mode: 0o600 });
      }
      throw new Error(`${error.message}; reset_diagnostic=${resetDiagnosticPath}`);
    }
    executed.push('manager-critical-password-reset-and-db-readback');

    const roleSpecs = [
      { role: 'Manager', userId: fixture.manager.userId, name: 'P102M3T13 Seed Manager', allow: '/employees', destination: '/employees' },
      { role: 'Leader', ...extraRoles[0], allow: '/employees', destination: '/employees' },
      { role: 'SubLeader', ...extraRoles[1], allow: '/employees', destination: '/employees' },
      { role: 'Employee', userId: fixture.employee.userId, name: 'P102M3T13 Seed Employee', allow: `/evaluations/${FIXTURE_EMPLOYEE_ID}`, destination: `/evaluations/${FIXTURE_EMPLOYEE_ID}` },
      { role: 'Worker', ...extraRoles[2], allow: `/evaluations/${extraRoles[2].userId}`, destination: `/evaluations/${extraRoles[2].userId}` },
    ];
    for (const spec of roleSpecs) {
      const session = createRoleSession(fixture, spec.role, spec.userId);
      await setSession(session);
      const view = await navigate('/employees', (current) => current.path === spec.destination && !current.text.includes('Đăng nhập') && current.text.includes(spec.name) ? current : false);
      assert.equal(view.path, spec.destination);
      assert.match(view.text, new RegExp(spec.name));
      executed.push(`role-${spec.role.toLowerCase()}-${spec.role === 'Manager' || spec.role === 'Leader' || spec.role === 'SubLeader' ? 'allow-employees' : 'deny-to-own-evaluation'}`);
    }
    const beforeDenied = fixture.query("SELECT (SELECT count(*) FROM public.users)::text || '|' || (SELECT count(*) FROM public.evaluations)::text || '|' || (SELECT count(*) FROM public.evaluation_rounds)::text;");
    const employeeSession = createRoleSession(fixture, 'Employee', fixture.employee.userId);
    await setSession(employeeSession);
    await navigate('/employees', (view) => view.path === `/evaluations/${FIXTURE_EMPLOYEE_ID}` ? view : false);
    const afterDenied = fixture.query("SELECT (SELECT count(*) FROM public.users)::text || '|' || (SELECT count(*) FROM public.evaluations)::text || '|' || (SELECT count(*) FROM public.evaluation_rounds)::text;");
    assert.equal(afterDenied, beforeDenied, 'denied employee route must not mutate business rows');
    executed.push('authorization-rejection-and-zero-db-delta');

    const errorEvents = page.events.filter((event) => event.method === 'Runtime.exceptionThrown' || (event.method === 'Runtime.consoleAPICalled' && ['error'].includes(event.params.type)));
    const redactRuntimeValue = (value) => String(value || '')
      .replace(/\b[a-f0-9]{64}\b/gi, '[REDACTED_TOKEN]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
    const runtimeDiagnostics = errorEvents.map((event) => ({
      method: event.method,
      type: event.params?.type,
      url: event.params?.url || null,
      text: redactRuntimeValue(event.params?.exceptionDetails?.exception?.description || event.params?.exceptionDetails?.text || event.params?.args?.map((arg) => arg.value ?? arg.description ?? '').join(' ') || ''),
    }));
    const failedNetwork = page.events.filter((event) => event.method === 'Network.loadingFailed').map((event) => ({ requestId: event.params?.requestId, errorText: event.params?.errorText, canceled: event.params?.canceled ?? false }));
    fs.writeFileSync('/home/pi5/hermes-artifacts/kurabe-execution/P102M3T09-browser-runtime-errors.json', `${JSON.stringify({ capturedAt: new Date().toISOString(), runtimeDiagnostics, failedNetwork }, null, 2)}\n`, { mode: '0600' });
    assert.equal(errorEvents.length, 0, `authenticated browser emitted runtime errors: ${errorEvents.length}`);
    executed.push('authenticated-console-and-page-error-free');

    await setSession(manager);
    await navigate('/dashboard', (view) => view.path === '/dashboard' && view.text.includes('Tổng quan hệ thống') ? view : false);
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
      await page.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
      const shot = await page.command('Page.captureScreenshot', { format: 'png' });
      const screenshotPath = `/home/pi5/hermes-artifacts/kurabe-execution/P102M3T09-release-${width}x${height}.png`;
      fs.writeFileSync(screenshotPath, Buffer.from(shot.data, 'base64'), { mode: 0o600 });
      assert.ok(fs.statSync(screenshotPath).size > 0);
      executed.push(`authenticated-screenshot-${width}x${height}`);
    }
    return { cases: executed, target: 'actual-next-production-build-plus-t13-supabase-local-fixture', authenticated: true, authenticatedCases: executed.length, roles };
  } finally {
    await stopChromePage(browser);
    if (next) await next.stop();
    if (fixture) {
      fixture.query(`DELETE FROM public.password_setup_tokens WHERE user_id IN (${sqlLiteral(FIXTURE_MANAGER_ID)}, ${sqlLiteral(FIXTURE_EMPLOYEE_ID)});`);
      if (extraRoles.length) {
        const ids = extraRoles.map((item) => sqlLiteral(item.userId)).join(',');
        const evaluationIds = extraRoles.map((item) => sqlLiteral(item.evaluationId)).join(',');
        fixture.query(`DELETE FROM public.evaluation_responses WHERE round_id IN (SELECT id FROM public.evaluation_rounds WHERE evaluation_id IN (${evaluationIds})); DELETE FROM public.evaluation_rounds WHERE evaluation_id IN (${evaluationIds}); DELETE FROM public.evaluations WHERE id IN (${evaluationIds}); DELETE FROM public.sessions WHERE user_id IN (${ids}); DELETE FROM public.users WHERE id IN (${ids});`);
      }
      await fixture.stop();
    }
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
    return { real: false, passed: false, tier: 'actual-Next-browser', status: 'BLOCKED_CAPABILITY', capability: 'BLOCKED_CAPABILITY', reason, cases, roles, target: 'no-browser-runtime' };
  }

  const browserResult = await runActualNextBrowser();
  assert.ok(browserResult.cases.length > 0);
  return { real: true, passed: true, tier: 'actual-Next-browser', status: 'EXECUTED', cases: [...cases, ...browserResult.cases], roles, target: browserResult.target, authenticated: browserResult.authenticated, authenticatedCases: browserResult.authenticatedCases };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await run(); if (!result.passed) { console.error(`RELEASE_BROWSER_MATRIX BLOCKED ${result.status} reason=${result.reason}`); process.exitCode = 1; } else console.log(`RELEASE_BROWSER_MATRIX ${result.status} cases=${result.cases.length} roles=${result.roles.join(',')} reason=${result.reason || 'actual local Chrome exercised'}`); }
  catch (error) { console.error(`RELEASE_BROWSER_MATRIX FAIL ${error?.message || error}`); process.exitCode = 1; }
}
