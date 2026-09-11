import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  createAppAuthFixture,
  createBrowserSession,
  startNextApplication,
} from './app-auth-harness.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationPath = path.join(projectRoot, 'supabase/migrations/20260911000100_session_credential_guard.sql');
const prerequisitePaths = [
  path.join(projectRoot, 'supabase/migrations/20260905070000_p98_password_setup.sql'),
  path.join(projectRoot, 'supabase/migrations/20260905072000_p98_password_setup_transaction.sql'),
];
const ownedSourcePaths = [
  'src/actions/auth.ts',
  'src/actions/account.ts',
  'src/lib/auth-password-setup.ts',
  'src/lib/auth.ts',
  'src/components/account/PasswordSetupForm.tsx',
  'src/components/settings/AccountTab.tsx',
];
function redact(value) {
  return String(value ?? '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(?:password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}
function sourceContracts() {
  const source = Object.fromEntries(ownedSourcePaths.map((file) => [file, fs.readFileSync(path.join(projectRoot, file), 'utf8')]));
  assert.match(source['src/actions/auth.ts'], /executeIssueSessionRpc/);
  assert.match(source['src/actions/auth.ts'], /credential_revision/);
  assert.match(source['src/actions/auth.ts'], /password_setup_required/);
  assert.match(source['src/actions/account.ts'], /bcrypt\.compare/);
  assert.match(source['src/actions/account.ts'], /executeChangePasswordRpc/);
  assert.match(source['src/actions/account.ts'], /SETUP_REQUIRED/);
  assert.match(source['src/lib/auth-password-setup.ts'], /Buffer\.byteLength/);
  assert.match(source['src/lib/auth-password-setup.ts'], /issue_session_transaction/);
  assert.match(source['src/lib/auth-password-setup.ts'], /p_expected_credential_revision/);
  assert.match(source['src/lib/auth-password-setup.ts'], /complete_password_setup_transaction/);
  assert.doesNotMatch(source['src/actions/account.ts'], /console\.(?:log|info|debug|warn|error)\([^)]*(?:password|token|secret)/i);
  const migration = fs.readFileSync(migrationPath, 'utf8');
  assert.match(migration, /BEGIN;[\s\S]*COMMIT;/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.issue_session_transaction/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.change_password_transaction/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.reset_password_transaction/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_password_setup_transaction/);
  assert.match(migration, /credential_revision = credential_revision \+ 1/);
  return ['source call-path and candidate migration contracts'];
}
function chromeDump(url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-p102m3t02-chrome-'));
  try {
    const result = spawnSync('/usr/bin/google-chrome-stable', [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
      '--virtual-time-budget=2500', '--dump-dom', url,
    ], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
    if (result.status !== 0) throw new Error(redact(result.stderr || `Chrome exit ${result.status}`));
    return String(result.stdout || '');
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

function wait(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function waitFor(predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) { lastError = error; }
    await wait(250);
  }
  throw lastError || new Error('actual browser assertion timed out');
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
      if (!message.id && message.method) this.events.push(message);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || 'CDP command failed'));
        else pending.resolve(message.result);
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
}

async function setupFailureDiagnostics(page, fixture, nextApplication) {
  let browserState;
  try {
    browserState = await page.evaluate("(() => ({ href: location.href.replace(/#.*$/, ''), readyState: document.readyState, body: document.body.innerText.slice(0, 1200), tokenLength: document.getElementById('setupToken')?.value?.length ?? -1, newPasswordLength: document.getElementById('newPassword')?.value?.length ?? -1, confirmPasswordLength: document.getElementById('confirmPassword')?.value?.length ?? -1, submitDisabled: document.querySelector('button[type=submit]')?.disabled ?? null, successCard: document.querySelector('[data-testid=setup-success-card]') !== null }))()");
  } catch (error) {
    browserState = { error: redact(error.message) };
  }
  let dbState;
  try {
    dbState = fixture.query(`SELECT password_setup_required::text || '|' || (password_hash IS NOT NULL)::text || '|' || credential_revision::text || '|' || (SELECT count(*) FROM public.password_setup_tokens WHERE user_id='${fixture.manager.userId}' AND used_at IS NULL) FROM public.users WHERE id='${fixture.manager.userId}';`);
  } catch (error) {
    dbState = `query-error:${redact(error.message)}`;
  }
  const network = page.events
    .filter((event) => event.method === 'Network.responseReceived')
    .map((event) => ({ url: String(event.params?.response?.url || '').replace(/#.*$/, ''), status: event.params?.response?.status, mimeType: event.params?.response?.mimeType }))
    .slice(-12);
  return { browserState, dbState, network, next: nextApplication?.diagnostics?.() ?? null };
}

async function runActualPasswordLifecycle(nextUrl, fixture, nextApplication) {
  const setupToken = crypto.randomBytes(32).toString('hex');
  const setupHash = crypto.createHash('sha256').update(setupToken).digest('hex');
  const newPassword = 'KuraBe!123';
  const changedPassword = 'KuraBe!456';
  let stage = 'reset-rpc';

  const debugPortResult = spawnSync(process.execPath, ['-e', "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"], { encoding: 'utf8' });
  assert.equal(debugPortResult.status, 0, 'loopback debug port allocation failed');
  const debugPort = Number(String(debugPortResult.stdout).trim());
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-p102m3t02-lifecycle-'));
  const chrome = spawn('/usr/bin/google-chrome-stable', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', 'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let socket;
  try {
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const pages = await response.json();
      return pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 15_000);
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitFor(() => socket.readyState === WebSocket.OPEN, 10_000);
    const page = new DevToolsPage(socket);
    await page.command('Page.enable');
    await page.command('Runtime.enable');
    await page.command('Network.enable');

    stage = 'navigate-login-legacy-optional';
    await page.command('Page.navigate', { url: `${nextUrl}/login` });
    await waitFor(async () => (await page.evaluate("document.readyState === 'complete' && document.querySelector('#employeeCode') !== null")) === true);
    await page.evaluate("(() => { document.getElementById('employeeCode')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: fixture.manager.employeeCode });
    await wait(500);
    stage = 'submit-legacy-optional-login';
    await page.evaluate("(() => { document.querySelector('form')?.requestSubmit(); return true; })()");
    stage = 'wait-legacy-optional-login-success';
    await waitFor(async () => {
      const state = await page.evaluate("({ href: location.pathname, text: document.body.innerText })");
      return state.href === '/dashboard' && state.text.includes('Tổng quan hệ thống') ? state : false;
    });
    assert.equal(fixture.query(`SELECT password_hash IS NULL FROM public.users WHERE id='${fixture.manager.userId}';`), 't');
    assert.ok(Number(fixture.query(`SELECT count(*) FROM public.sessions WHERE user_id='${fixture.manager.userId}' AND credential_revision=0;`)) >= 1);

    stage = 'reset-rpc';
    fixture.query(`SELECT * FROM public.reset_password_transaction('${fixture.manager.userId}', '${setupHash}', now() + interval '30 minutes', 0);`);
    assert.equal(
      fixture.query(`SELECT (password_hash IS NULL)::text || '|' || password_setup_required::text || '|' || credential_revision::text FROM public.users WHERE id='${fixture.manager.userId}';`),
      'true|true|1',
      'real reset RPC must enter reset-pending state'
    );
    assert.equal(
      fixture.query(`SELECT count(*) FROM public.sessions WHERE user_id='${fixture.manager.userId}';`),
      '0',
      'real reset RPC must invalidate existing sessions'
    );

    stage = 'navigate-login-reset-pending';
    await page.command('Page.navigate', { url: `${nextUrl}/login` });
    await waitFor(async () => (await page.evaluate("document.querySelector('#employeeCode') !== null")) === true);
    await waitFor(async () => (await page.evaluate("document.readyState === 'complete' && document.querySelector('form') !== null")) === true);
    await wait(500);
    await page.evaluate("(() => { document.getElementById('employeeCode')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: fixture.manager.employeeCode });
    stage = 'submit-reset-pending-login';
    await page.evaluate("(() => { document.querySelector('form')?.requestSubmit(); return true; })()");
    stage = 'wait-reset-pending-rejection';
    await wait(3_000);
    const resetLoginState = await page.evaluate("({ href: location.pathname, text: document.body.innerText.slice(0, 800), html: document.documentElement.outerHTML.includes('Mã nhân viên hoặc mật khẩu không đúng.') })");
    assert.equal(resetLoginState.href, '/login', `reset-pending login navigated unexpectedly: ${JSON.stringify(resetLoginState)}`);
    assert.ok(resetLoginState.html || resetLoginState.text.includes('Mã nhân viên hoặc mật khẩu không đúng.'), `reset-pending rejection was not rendered: ${JSON.stringify(resetLoginState)}`);

    stage = 'navigate-password-setup';
    await page.command('Page.navigate', { url: `${nextUrl}/setup-password#token=${setupToken}` });
    await waitFor(async () => (await page.evaluate("document.readyState === 'complete' && document.querySelector('form') !== null")) === true);
    await waitFor(async () => (await page.evaluate(`document.getElementById('setupToken')?.value === ${JSON.stringify(setupToken)}`)) === true);
    await wait(500);
    await page.evaluate("(() => { document.getElementById('newPassword')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: newPassword });
    await page.evaluate("(() => { document.getElementById('confirmPassword')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: newPassword });
    await wait(500);
    stage = 'submit-password-setup';
    await page.evaluate("(() => { document.querySelector('form')?.requestSubmit(); return true; })()");
    stage = 'wait-password-setup-success';
    try {
      await waitFor(async () => (await page.evaluate("document.querySelector('[data-testid=setup-success-card]') !== null")) === true);
    } catch (error) {
      const diagnostics = await setupFailureDiagnostics(page, fixture, nextApplication);
      throw new Error(`${error.message}; setup_diagnostics=${JSON.stringify(diagnostics)}`);
    }

    assert.equal(
      fixture.query(`SELECT password_setup_required::text || '|' || (password_hash IS NOT NULL)::text || '|' || credential_revision::text FROM public.users WHERE id='${fixture.manager.userId}';`),
      'false|true|2',
      'actual setup must persist configured credential and revision'
    );
    assert.equal(fixture.query(`SELECT count(*) FROM public.password_setup_tokens WHERE user_id='${fixture.manager.userId}' AND used_at IS NULL;`), '0');

    const navigateLogin = async () => {
      await page.command('Page.navigate', { url: `${nextUrl}/login` });
      await waitFor(async () => (await page.evaluate("document.readyState === 'complete' && document.querySelector('#employeeCode') !== null")) === true);
      await wait(500);
    };
    const fillLogin = async (password = null) => {
      await page.evaluate("(() => { document.getElementById('employeeCode')?.focus(); return true; })()");
      await page.command('Input.insertText', { text: fixture.manager.employeeCode });
      if (password !== null) {
        await page.evaluate("(() => { document.getElementById('password')?.focus(); return true; })()");
        await page.command('Input.insertText', { text: password });
      }
      await wait(500);
      await page.evaluate("(() => { document.querySelector('form')?.requestSubmit(); return true; })()");
    };
    const waitForLoginError = async (stageName) => {
      stage = stageName;
      return waitFor(async () => {
        const state = await page.evaluate("({ href: location.pathname, text: document.body.innerText })");
        return state.href === '/login' && state.text.includes('Mã nhân viên hoặc mật khẩu không đúng.') ? state : false;
      });
    };
    const waitForDashboard = async (stageName) => {
      stage = stageName;
      return waitFor(async () => {
        const state = await page.evaluate("({ href: location.pathname, text: document.body.innerText })");
        return state.href === '/dashboard' && state.text.includes('Tổng quan hệ thống') ? state : false;
      });
    };

    stage = 'navigate-password-setup-replay';
    await page.command('Page.navigate', { url: `${nextUrl}/setup-password?replay=1#token=${setupToken}` });
    try {
      await waitFor(async () => (await page.evaluate("document.readyState === 'complete' && document.querySelector('form') !== null")) === true);
      await waitFor(async () => (await page.evaluate(`document.getElementById('setupToken')?.value === ${JSON.stringify(setupToken)}`)) === true);
    } catch (error) {
      const diagnostics = await setupFailureDiagnostics(page, fixture);
      throw new Error(`${error.message}; replay_diagnostics=${JSON.stringify(diagnostics)}`);
    }
    await page.evaluate("(() => { document.getElementById('newPassword')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: changedPassword });
    await page.evaluate("(() => { document.getElementById('confirmPassword')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: changedPassword });
    await wait(500);
    stage = 'submit-password-setup-replay';
    await page.evaluate("(() => { document.querySelector('form')?.requestSubmit(); return true; })()");
    stage = 'wait-password-setup-replay-rejection';
    await waitFor(async () => {
      const state = await page.evaluate("({ href: location.pathname, text: document.body.innerText, success: document.querySelector('[data-testid=setup-success-card]') !== null })");
      return state.href === '/setup-password' && !state.success && state.text.includes('không hợp lệ') ? state : false;
    });

    stage = 'navigate-login-configured-missing';
    await navigateLogin();
    await fillLogin();
    await waitForLoginError('wait-configured-missing-password-rejection');

    stage = 'navigate-login-configured-wrong';
    await navigateLogin();
    await fillLogin('wrong-password');
    await waitForLoginError('wait-wrong-configured-password-rejection');

    stage = 'navigate-login-configured-correct';
    await navigateLogin();
    await fillLogin(newPassword);
    await waitForDashboard('wait-configured-login-success');
    assert.equal(fixture.query(`SELECT count(*) FROM public.sessions WHERE user_id='${fixture.manager.userId}' AND credential_revision=2;`), '1');

    const staleToken = crypto.randomBytes(32).toString('hex');
    const staleTokenHash = crypto.createHash('sha256').update(staleToken).digest('hex');
    fixture.query(`INSERT INTO public.sessions (token_hash, user_id, expires_at, credential_revision) VALUES ('${staleTokenHash}', '${fixture.manager.userId}', now() + interval '1 hour', 2);`);

    stage = 'navigate-account-change-password';
    await page.command('Page.navigate', { url: `${nextUrl}/settings` });
    await waitFor(async () => (await page.evaluate("document.readyState === 'complete' && document.querySelector('#tab-account') !== null")) === true);
    await page.evaluate("(() => { document.getElementById('tab-account')?.click(); return true; })()");
    await waitFor(async () => (await page.evaluate("document.querySelector('#old-password') !== null")) === true);
    await page.evaluate("(() => { document.getElementById('old-password')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: newPassword });
    await page.evaluate("(() => { document.getElementById('new-password')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: changedPassword });
    await page.evaluate("(() => { document.getElementById('confirm-password')?.focus(); return true; })()");
    await page.command('Input.insertText', { text: changedPassword });
    await wait(500);
    stage = 'submit-account-change-password';
    await page.evaluate("(() => { const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('Đổi mật khẩu')); button?.click(); return Boolean(button); })()");
    stage = 'wait-account-change-password-success';
    await waitFor(async () => (await page.evaluate("document.body.innerText.includes('Đã đổi mật khẩu thành công.')")) === true);
    assert.equal(fixture.query(`SELECT credential_revision FROM public.users WHERE id='${fixture.manager.userId}';`), '3');
    assert.equal(fixture.query(`SELECT count(*) FROM public.sessions WHERE user_id='${fixture.manager.userId}' AND credential_revision=3;`), '1');
    const staleCookie = await page.command('Network.setCookie', {
      name: 'auth_session', value: staleToken, url: nextUrl, path: '/', httpOnly: true, sameSite: 'Lax',
    });
    assert.equal(staleCookie.success, true, 'Chrome must accept the synthetic stale session cookie');
    stage = 'navigate-stale-session-settings';
    await page.command('Page.navigate', { url: `${nextUrl}/settings?stale=1` });
    await waitFor(async () => (await page.evaluate("new URL(window.location.href).pathname")) === '/login');

    stage = 'navigate-login-old-password';
    await navigateLogin();
    await fillLogin(newPassword);
    await waitForLoginError('wait-old-password-rejection');

    stage = 'navigate-login-new-password';
    await navigateLogin();
    await fillLogin(changedPassword);
    await waitForDashboard('wait-new-password-login-success');
    assert.ok(Number(fixture.query(`SELECT count(*) FROM public.sessions WHERE user_id='${fixture.manager.userId}' AND credential_revision=3;`)) >= 1);
    return [
      'actual browser logs in with NULL legacy account without a password',
      'actual reset RPC enters reset-pending and revokes sessions',
      'actual browser rejects missing password while reset-pending',
      'actual setup-password route consumes one-time token and persists revision',
      'actual setup token replay is rejected',
      'actual browser rejects missing configured password',
      'actual browser rejects wrong configured password',
      'actual browser logs in with configured password after setup',
      'actual browser changes configured credential through Account UI',
      'actual stale session is rejected after credential change',
      'actual browser rejects old credential after change',
      'actual browser logs in with new credential after change',
    ];
  } catch (error) {
    throw new Error(`actual password lifecycle stage=${stage}: ${redact(error.message)}`);
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

export async function run() {
  const cases = sourceContracts();
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' });
  const tree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: projectRoot, encoding: 'utf8' });
  assert.equal(head.status, 0, 'candidate git HEAD must be readable');
  assert.equal(tree.status, 0, 'candidate git tree must be readable');
  const candidateSha = head.stdout.trim();
  const candidateTreeSha = tree.stdout.trim();
  let fixture;
  let next;
  try {
    fixture = await createAppAuthFixture();
    for (const prerequisitePath of prerequisitePaths) {
      fixture.query(fs.readFileSync(prerequisitePath, 'utf8'));
    }
    fixture.query(fs.readFileSync(migrationPath, 'utf8'));
    const revisionColumns = fixture.query(`
      SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND column_name='credential_revision';
    `);
    assert.equal(revisionColumns, '2', 'T02 migration must add both revision columns');
    cases.push('real disposable DB applied prerequisite and T02 migration');

    const session = createBrowserSession(fixture, 'manager');
    const sessionRevision = fixture.query(`SELECT credential_revision FROM public.sessions WHERE token_hash='${session.tokenHash}';`);
    assert.equal(sessionRevision, '0', 'new legacy session must capture revision 0');
    cases.push('real DB-backed opaque session captures credential revision');

    next = await startNextApplication(fixture);
    cases.push('actual Next production build/startup');
    const dom = chromeDump(`${next.url}/login`);
    assert.match(dom, /Đăng nhập|employeeCode|Mã nhân viên/i, 'actual Chrome must render login surface');
    assert.doesNotMatch(dom, /Application error|Internal Server Error/i, 'actual Chrome must not render an application error');
    cases.push('actual Chrome renders login route without runtime error');

    cases.push(...await runActualPasswordLifecycle(next.url, fixture, next));

    assert.equal(fixture.query(`SELECT count(*) FROM public.sessions WHERE token_hash='${session.tokenHash}';`), '0');
    cases.push('revoked legacy session is absent from the real session store');
    return {
      real: true,
      passed: true,
      tier: 'actual-Next-browser',
      authenticated: true,
      authenticatedCases: 1,
      status: 'EXECUTED',
      target: 'loopback-disposable-next-and-postgresql',
      browserIdentity: 'actual Chrome DevTools Protocol browser against isolated Next production build',
      dbIdentity: {
        database: fixture.stackHandle.serverIdentity.database,
        hostBind: fixture.stackHandle.serverIdentity.hostBind,
        serverPort: fixture.stackHandle.serverIdentity.serverPort,
        currentUser: fixture.stackHandle.serverIdentity.currentUser,
        stackName: fixture.stackHandle.stackName,
        networkId: fixture.stackHandle.networkId,
      },
      candidateSha,
      candidateTreeSha,
      cases,
    };
  } finally {
    if (next) await next.stop().catch(() => {});
    if (fixture) await fixture.stop().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((result) => {
    const evidencePath = process.env.KURABE_BROWSER_EVIDENCE_PATH;
    if (evidencePath) {
      const evidence = {
        evidenceType: 'actual-browser-auth-lifecycle',
        status: result.status,
        tier: result.tier,
        candidateSha: result.candidateSha,
        candidateTreeSha: result.candidateTreeSha,
        caseCount: result.cases.length,
        cases: result.cases,
        target: result.target,
        browserIdentity: result.browserIdentity,
        dbIdentity: result.dbIdentity,
        artifactPath: evidencePath,
      };
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
      const readback = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
      assert.equal(readback.candidateSha, result.candidateSha);
      assert.equal(readback.candidateTreeSha, result.candidateTreeSha);
      assert.equal(readback.caseCount, result.cases.length);
      assert.ok(readback.caseCount > 0 && readback.cases.length === readback.caseCount);
    }
    console.log(`SESSION_CREDENTIAL_GUARD_BROWSER EXECUTED cases=${result.cases.length} tier=${result.tier} candidate_sha=${result.candidateSha} tree_sha=${result.candidateTreeSha}`);
  }).catch((error) => {
    console.error(`SESSION_CREDENTIAL_GUARD_BROWSER FAIL ${redact(error.message)}`);
    process.exitCode = 1;
  });
}
