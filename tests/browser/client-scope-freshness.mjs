#!/usr/bin/env node
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
const expectedHead = process.env.KURABE_EXPECTED_GIT_HEAD;

const safeError = (error) => String(error?.message || error)
  .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
  .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(predicate, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw lastError || new Error('browser assertion timed out');
}

export class CdpPage {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.pausedFetchRequests = new Set();
    this.releasePausedFetchRequests = false;
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.method) {
        this.events.push(message);
        if (message.method === 'Fetch.requestPaused') {
          const requestId = message.params?.requestId;
          if (requestId && this.releasePausedFetchRequests) {
            void this.command('Fetch.continueRequest', { requestId }).catch(() => {});
          } else if (requestId) {
            this.pausedFetchRequests.add(requestId);
          }
        }
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'CDP command failed'));
      else pending.resolve(message.result);
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
    const result = await this.command('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(`browser expression failed: ${result.exceptionDetails.text || 'exception'}`);
    return result.result?.value;
  }

  async close() {
    try { await this.command('Browser.close'); } catch { /* process cleanup remains owned by caller */ }
    try { this.socket.close(); } catch { /* already closed */ }
  }

  async releaseFetchRequests() {
    this.releasePausedFetchRequests = true;
    const requests = [...this.pausedFetchRequests];
    this.pausedFetchRequests.clear();
    await Promise.all(requests.map((requestId) => this.command('Fetch.continueRequest', { requestId }).catch(() => {})));
  }
}

export async function openChrome() {
  const portProbe = spawnSync(process.execPath, ['-e', "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"], { encoding: 'utf8' });
  assert.equal(portProbe.status, 0);
  const debugPort = Number(String(portProbe.stdout).trim());
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-p102m3t08-chrome-'));
  const chrome = spawn('/usr/bin/google-chrome-stable', [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`, '--remote-allow-origins=*', 'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const target = await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      const pages = await response.json();
      return pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl);
    }, 15_000);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await waitFor(() => socket.readyState === WebSocket.OPEN, 10_000);
    const page = new CdpPage(socket);
    await page.command('Page.enable');
    await page.command('Runtime.enable');
    await page.command('Network.enable');
    return {
      page,
      debugPort,
      profile,
      chrome,
      async stop() {
        await page.close();
        if (chrome.exitCode === null) {
          try { process.kill(-chrome.pid, 'SIGTERM'); } catch { try { chrome.kill('SIGTERM'); } catch {} }
          await wait(500);
          if (chrome.exitCode === null) {
            try { process.kill(-chrome.pid, 'SIGKILL'); } catch { try { chrome.kill('SIGKILL'); } catch {} }
          }
        }
        fs.rmSync(profile, { recursive: true, force: true });
      },
    };
  } catch (error) {
    try { process.kill(-chrome.pid, 'SIGTERM'); } catch { try { chrome.kill('SIGTERM'); } catch {} }
    fs.rmSync(profile, { recursive: true, force: true });
    throw error;
  }
}

export async function navigate(page, url, readyExpression = null) {
  await page.command('Page.navigate', { url });
  await waitFor(async () => (await page.evaluate("document.readyState === 'complete'")) === true);
  if (readyExpression) await waitFor(async () => (await page.evaluate(readyExpression)) === true);
  return page.evaluate("({ href: location.href, text: document.body.innerText, html: document.documentElement.outerHTML })");
}

export async function setSessionCookie(page, baseUrl, token) {
  await page.command('Network.setCookie', {
    name: 'auth_session',
    value: token,
    url: baseUrl,
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  });
}

async function clickButton(page, label) {
  const encodedLabel = JSON.stringify(label);
  await page.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(${encodedLabel}));
    if (!button) throw new Error('button not found: ' + ${encodedLabel});
    button.click();
    return true;
  })()`);
}

async function fillInput(page, id, value) {
  const encodedId = JSON.stringify(id);
  await page.evaluate(`(() => {
    const input = document.getElementById(${encodedId});
    if (!(input instanceof HTMLInputElement)) throw new Error('input not found: ' + ${encodedId});
    input.focus();
    input.select();
    return true;
  })()`);
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', modifiers: 2 });
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft' });
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace' });
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace' });
  for (const character of value) {
    const upper = character.toUpperCase();
    const code = /^[A-Z]$/.test(upper) ? `Key${upper}` : (/^[0-9]$/.test(character) ? `Digit${character}` : (character === '-' ? 'Minus' : undefined));
    await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: upper, code, text: character, unmodifiedText: character });
    await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: upper, code });
  }
  await wait(150);
}

async function captureBrowserDiagnostics(page) {
  const state = await page.evaluate("({ href: location.href, readyState: document.readyState, text: document.body?.innerText?.slice(0, 1000) || '', forms: [...document.querySelectorAll('form')].map((form) => form.id || form.getAttribute('aria-label') || 'form'), inputs: [...document.querySelectorAll('input')].map((input) => ({ id: input.id, valueLength: input.value.length, type: input.type })), buttons: [...document.querySelectorAll('button')].map((button) => button.textContent?.trim()).filter(Boolean) })").catch((error) => ({ evaluateError: safeError(error) }));
  const events = page.events
    .filter((event) => ['Page.frameNavigated', 'Page.frameStoppedLoading', 'Network.requestWillBeSent', 'Network.responseReceived', 'Network.loadingFailed', 'Runtime.exceptionThrown', 'Runtime.consoleAPICalled'].includes(event.method))
    .slice(-60)
    .map((event) => ({
      method: event.method,
      url: event.params?.frame?.url || event.params?.request?.url || event.params?.response?.url || event.params?.url || event.params?.errorText || null,
      status: event.params?.response?.status || null,
      type: event.params?.type || event.params?.response?.mimeType || null,
      text: event.params?.args?.map((arg) => arg.value || arg.description || '').join(' ') || null,
    }));
  return { state, events };
}

function verifySourceIdentity() {
  const head = String(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).stdout).trim();
  if (expectedHead && head !== expectedHead) throw new Error(`candidate SHA mismatch: expected ${expectedHead}, received ${head}`);
  return { head, expectedHead: expectedHead || null };
}

export async function run() {
  verifySourceIdentity();
  let fixture;
  let next;
  let browser;
  const cases = [];
  try {
    fixture = await createAppAuthFixture();
    next = await startNextApplication(fixture);
    const manager = createBrowserSession(fixture, 'manager');
    const employee = createBrowserSession(fixture, 'employee');
    browser = await openChrome();

    await navigate(browser.page, `${next.url}/login`);
    await setSessionCookie(browser.page, next.url, manager.token);
    let managerView;
    try {
      managerView = await navigate(browser.page, `${next.url}/dashboard`, "document.body.innerText.includes('Tổng quan hệ thống')");
    } catch (error) {
      const state = await browser.page.evaluate("({ href: location.href, title: document.title, text: document.body.innerText.slice(0, 500), loading: document.body.innerText.includes('Đang tải dữ liệu') })").catch((probeError) => ({ probeError: safeError(probeError) }));
      throw new Error(`manager view unavailable: ${safeError(error)} state=${safeError(JSON.stringify(state))}`);
    }
    assert.match(managerView.html, /Tổng quan hệ thống/);
    const documentToken = crypto.randomUUID();
    await browser.page.evaluate(`(() => {
      window.__p102m3t08ScopeProof = {
        documentToken: ${JSON.stringify(documentToken)},
        oldScopePayloadFlash: false,
        oldScopePayloadFlashEvents: [],
        observingTransition: false,
      };
      const observer = new MutationObserver(() => {
        const proof = window.__p102m3t08ScopeProof;
        if (
          proof?.observingTransition
          && localStorage.getItem('auth_user_id') === null
          && document.body.innerText.includes('Tổng quan hệ thống')
        ) {
          proof.oldScopePayloadFlash = true;
          proof.oldScopePayloadFlashEvents.push({
            at: performance.now(),
            href: location.href,
            text: document.body.innerText.slice(0, 240),
          });
        }
      });
      observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
      window.__p102m3t08ScopeProofObserver = observer;
      return true;
    })()`);
    cases.push('actual-next-authenticated-manager-view');

    await browser.page.evaluate(`(() => {
      window.__p102m3t08ScopeProof.observingTransition = true;
      const button = [...document.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('Đăng xuất'));
      if (!button) throw new Error('logout button not found');
      button.click();
      return true;
    })()`);
    try {
      await waitFor(async () => (await browser.page.evaluate("location.pathname === '/login' && document.getElementById('employeeCode') !== null")) === true);
    } catch (error) {
      const diagnostics = await captureBrowserDiagnostics(browser.page);
      throw new Error(`resident logout transition assertion failed: ${safeError(error)} diagnostics=${safeError(JSON.stringify(diagnostics))}`);
    }
    const loginView = await browser.page.evaluate(`({
      href: location.href,
      sameDocument: window.__p102m3t08ScopeProof?.documentToken === ${JSON.stringify(documentToken)},
      oldScopePayloadFlash: Boolean(window.__p102m3t08ScopeProof?.oldScopePayloadFlash),
      oldScopePayloadFlashEvents: window.__p102m3t08ScopeProof?.oldScopePayloadFlashEvents || [],
      text: document.body.innerText,
    })`);
    assert.equal(loginView.sameDocument, true, 'logout must be a resident client transition');
    assert.equal(loginView.oldScopePayloadFlash, false, `old manager payload flashed during logout transition: ${JSON.stringify(loginView.oldScopePayloadFlashEvents)}`);
    assert.doesNotMatch(loginView.text, /Tổng quan hệ thống/);
    cases.push('resident-manager-to-anonymous-transition-clears-old-scope');

    await fillInput(browser.page, 'employeeCode', 'P102M3T13-EMP');
    await fillInput(browser.page, 'password', '');
    await clickButton(browser.page, 'Đăng nhập');
    let restrictedView;
    try {
      restrictedView = await waitFor(async () => {
        const state = await browser.page.evaluate(`({
          href: location.href,
          sameDocument: window.__p102m3t08ScopeProof?.documentToken === ${JSON.stringify(documentToken)},
          text: document.body.innerText,
          html: document.documentElement.outerHTML,
        })`);
        if (new URL(state.href).pathname !== `/evaluations/${employee.userId}`) return null;
        if (!state.text.includes('Phiếu đánh giá của tôi')) return null;
        return state;
      });
    } catch (error) {
      const diagnostics = await captureBrowserDiagnostics(browser.page);
      throw new Error(`resident employee login assertion failed: ${safeError(error)} diagnostics=${safeError(JSON.stringify(diagnostics))}`);
    }
    assert.equal(restrictedView.sameDocument, true, 'login must be a resident client transition');
    assert.equal(new URL(restrictedView.href).pathname, `/evaluations/${employee.userId}`);
    assert.doesNotMatch(restrictedView.html, /Tổng quan hệ thống/);
    assert.match(restrictedView.text, /Phiếu đánh giá của tôi/);
    assert.match(restrictedView.text, /P102M3T13 Seed Employee/);
    cases.push('resident-employee-login-replaces-manager-scope-with-restricted-viewer');

    const before = fixture.query("SELECT (SELECT count(*) FROM public.evaluations)::text || '|' || (SELECT count(*) FROM public.evaluation_responses)::text || '|' || (SELECT count(*) FROM public.evaluation_rounds)::text;");
    const denied = await navigate(browser.page, `${next.url}/teams?__p102m3t08_denied_mutation=1`);
    assert.doesNotMatch(denied.html, /Tổng quan hệ thống/);
    const after = fixture.query("SELECT (SELECT count(*) FROM public.evaluations)::text || '|' || (SELECT count(*) FROM public.evaluation_responses)::text || '|' || (SELECT count(*) FROM public.evaluation_rounds)::text;");
    assert.equal(after, before, 'restricted viewer route must not mutate evaluation rows');
    cases.push('actual-next-restricted-route-no-business-row-mutation');

    return {
      real: true,
      passed: true,
      tier: 'authenticated',
      status: 'EXECUTED',
      authenticated: true,
      authenticatedCases: cases.length,
      cases,
      target: 'actual-next-production-build-plus-authentic-local-supabase-session',
      handles: {
        next: { pid: next.pid, port: next.port, buildMode: next.sourceIdentity.buildMode },
        browser: { engine: 'google-chrome-stable', debugPort: browser.debugPort, loopback: true },
        users: { manager: manager.userId, employee: employee.userId },
      },
    };
  } catch (error) {
    throw error;
  } finally {
    if (browser) await browser.stop().catch(() => {});
    if (next) await next.stop().catch(() => {});
    if (fixture) await fixture.stop().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => console.log(`CLIENT_SCOPE_FRESHNESS ${result.status} cases=${result.cases.length} tier=${result.tier}`))
    .catch((error) => {
      if (error?.code === 'MISSING_RUNTIME_CAPABILITY') {
        console.error(`CLIENT_SCOPE_FRESHNESS BLOCKED_CAPABILITY ${safeError(error)}`);
      } else {
        console.error(`CLIENT_SCOPE_FRESHNESS FAIL ${safeError(error)}`);
      }
      process.exitCode = 1;
    });
}
