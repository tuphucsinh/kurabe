// P107M1T07 owned helper: a dependency-free Chrome DevTools Protocol driver over
// the built-in WebSocket. Supports shared-context multi-tab, real screenshots,
// first-party network/console capture, and Fetch pause/release for delayed real
// responses. Chromium path is configurable (no stale fixed path).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { hashFile, localOnlyError, run, wait, waitFor } from './guard.mjs';

const CHROME_CANDIDATES = [
  process.env.KURABE_P107_CHROME,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].filter(Boolean);

export function resolveChromiumBinary(explicit) {
  const candidates = explicit ? [explicit, ...CHROME_CANDIDATES] : CHROME_CANDIDATES;
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (probe.status === 0 && !probe.error) {
      return { binary: candidate, version: String(probe.stdout || probe.stderr || '').trim() };
    }
  }
  throw localOnlyError('MISSING_RUNTIME_CAPABILITY', 'no Chromium/Chrome binary found (set KURABE_P107_CHROME)');
}

// Bounded per-command timeout so a dropped/silent CDP command can never hang the
// producer forever (the previous socket had no timeout and left runs stuck).
const CDP_SEND_TIMEOUT_MS = 60_000;

export class CdpConnection {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.totalEvents = 0;
    this.maxEvents = 20000;
    this.closed = false;
    this.closeError = null;
  }

  pushEvent(event) {
    this.totalEvents += 1;
    this.events.push(event);
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  rejectPending(error) {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const entry of pending) entry.reject(error);
  }

  async connect({ timeout = 15_000 } = {}) {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || 'CDP command failed'));
        else pending.resolve(message.result);
        return;
      }
      if (message.method) this.pushEvent(message);
    });
    // A close/error must surface as a rejection on every in-flight command instead
    // of leaving send() promises pending forever.
    this.socket.addEventListener('close', () => {
      this.closed = true;
      this.closeError = new Error('cdp socket closed before the command resolved');
      this.rejectPending(this.closeError);
    });
    this.socket.addEventListener('error', () => {
      this.closeError = this.closeError || new Error('cdp socket error');
    });
    await waitFor(() => this.socket.readyState === WebSocket.OPEN, { timeout, label: 'cdp socket open' });
    return this;
  }

  send(method, params = {}, sessionId, { timeout = CDP_SEND_TIMEOUT_MS } = {}) {
    if (this.closed) return Promise.reject(this.closeError || new Error('cdp socket closed'));
    const id = this.nextId++;
    const frame = { id, method, params };
    if (sessionId) frame.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeout}ms`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); },
        reject: (error) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); },
      });
      try { this.socket.send(JSON.stringify(frame)); }
      catch (error) { this.pending.delete(id); clearTimeout(timer); settled = true; reject(error); }
    });
  }

  eventsFor(sessionId, methods = null) {
    return this.events.filter((event) => (sessionId ? event.sessionId === sessionId : true)
      && (!methods || methods.includes(event.method)));
  }

  close() {
    try { this.socket?.close(); } catch { /* already closed */ }
  }
}

/**
 * Exact source of the in-page fetch logger. It records non-GET (server-action)
 * responses WITHOUT awaiting/consuming the returned response body: the cloned body
 * is read out-of-band and never delays handing the original streamed response back
 * to the app. The previous implementation awaited `response.clone().text()` before
 * returning, which stalled streamed RSC/server-action delivery and contributed to
 * the Next "destination stream closed early" abort. Exported so a focused self-test
 * can exercise the exact injected source against a streamed delayed response.
 */
export function fetchLoggerSource() {
  return `(() => {
      if (window.__p107FetchLog) return;
      window.__p107FetchLog = [];
      const original = window.fetch;
      window.fetch = async (...args) => {
        const response = await original(...args);
        try {
          const request = args[0];
          const url = typeof request === 'string' ? request : (request && request.url) || '';
          const method = (args[1] && args[1].method) || 'GET';
          if (method !== 'GET') {
            const entry = { url: String(url).slice(0, 80), method, status: response.status, body: '' };
            window.__p107FetchLog.push(entry);
            if (window.__p107FetchLog.length > 24) window.__p107FetchLog.shift();
            // Out-of-band body read: NEVER block/await the caller's stream.
            try {
              response.clone().text().then((text) => { entry.body = String(text || '').slice(0, 260); }).catch(() => {});
            } catch { /* clone unsupported / opaque response */ }
          }
        } catch { /* never break the app */ }
        return response;
      };
    })();`;
}

export class CdpPage {
  constructor(connection, sessionId, meta = {}) {
    this.connection = connection;
    this.sessionId = sessionId;
    this.meta = meta;
    this.nextOrigin = meta.origin || null;
    this.heldRequests = new Set();
    this.releaseHeld = false;
    this.fetchEnabled = false;
  }

  send(method, params = {}) {
    return this.connection.send(method, params, this.sessionId);
  }

  async enable() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable');
    await this.send('Log.enable').catch(() => {});
    return this;
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description
        || result.exceptionDetails.exception?.value
        || result.exceptionDetails.text
        || 'exception';
      throw new Error(`browser expression failed: ${String(detail).slice(0, 500)}`);
    }
    return result.result?.value;
  }

  async goto(url, readyExpression = null, { timeout = 45_000 } = {}) {
    await this.send('Page.navigate', { url });
    await waitFor(async () => (await this.evaluate("document.readyState === 'complete'")) === true, { timeout, label: `navigate ${url}` });
    if (readyExpression) {
      try {
        await waitFor(async () => (await this.evaluate(readyExpression)) === true, { timeout, label: `ready ${url}` });
      } catch (error) {
        const snapshot = await this.state().catch(() => null);
        const detail = snapshot
          ? `path=${snapshot.path} title=${JSON.stringify(snapshot.title)} text=${JSON.stringify((snapshot.text || '').slice(0, 500))}`
          : 'page state unavailable';
        throw new Error(`${error.message} | ${detail}`);
      }
    }
    return this.state();
  }

  async waitFor(expression, { timeout = 30_000, label = null } = {}) {
    return waitFor(async () => (await this.evaluate(expression)) === true, { timeout, label: label || expression });
  }

  async state() {
    return this.evaluate(`(() => ({
      href: location.href,
      path: location.pathname,
      title: document.title,
      text: document.body ? document.body.innerText : '',
      html: document.documentElement ? document.documentElement.outerHTML : '',
    }))()`);
  }

  /** Bounded failure diagnostics: console errors, first-party failures, exceptions. */
  async diagnostics() {
    return {
      consoleErrors: this.consoleErrors().slice(0, 6),
      firstPartyFailures: this.firstPartyFailures().slice(0, 6),
      exceptions: this.exceptions().slice(0, 6),
      requests: this.requests(14),
      fetchLog: await this.fetchLog().catch(() => []),
      appLogTail: typeof this.appLogTail === 'function' ? this.appLogTail() : null,
    };
  }

  /** Recent first-party requests with method/status, so a never-issued action is visible. */
  requests(limit = 12) {
    const nextOrigin = this.nextOrigin;
    const seen = new Map();
    for (const event of this.connection.eventsFor(this.sessionId, ['Network.requestWillBeSent', 'Network.responseReceived'])) {
      if (event.method === 'Network.requestWillBeSent') {
        const url = event.params?.request?.url || '';
        if (!/^https?:/.test(url)) continue;
        if (nextOrigin && !url.startsWith(nextOrigin)) continue;
        seen.set(event.params.requestId, {
          url: url.split('?')[0].slice(0, 110),
          method: event.params?.request?.method || 'GET',
          status: null,
        });
      } else {
        const entry = seen.get(event.params?.requestId);
        if (entry) entry.status = event.params?.response?.status ?? null;
      }
    }
    return [...seen.values()].slice(-limit);
  }

  /** Record server-action responses (method+status+body snippet) across navigations. */
  async installFetchLogger() {
    const source = fetchLoggerSource();
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source });
    await this.evaluate(source);
    return true;
  }

  async fetchLog() {
    return (await this.evaluate("window.__p107FetchLog ? window.__p107FetchLog.slice(-8) : []")) || [];
  }

  async clickText(text, { selector = 'button,a', exact = false } = {}) {
    const encoded = JSON.stringify(text);
    const selectorJson = JSON.stringify(selector);
    const expression = `(() => {
      const nodes = [...document.querySelectorAll(${selectorJson})];
      const match = nodes.find((node) => ${exact ? `node.textContent?.trim() === ${encoded}` : `node.textContent?.includes(${encoded})`});
      if (!match) throw new Error('interactive node not found: ' + ${encoded});
      match.click();
      return true;
    })()`;
    return this.evaluate(expression);
  }

  /** Click a criterion level button by its visible label text. */
  async clickLevelButton(label) {
    const encoded = JSON.stringify(label);
    return this.evaluate(`(() => {
      const buttons = [...document.querySelectorAll('button')];
      const match = buttons.find((node) => node.textContent?.includes(${encoded}));
      if (!match) {
        const seen = buttons.map((node) => (node.textContent || '').trim().slice(0, 40)).filter(Boolean).slice(0, 25);
        throw new Error('level button not found: ' + ${encoded} + ' | buttons=' + JSON.stringify(seen));
      }
      match.click();
      return true;
    })()`);
  }

  async fill(selector, value) {
    const selectorJson = JSON.stringify(selector);
    await this.evaluate(`(() => {
      const el = document.querySelector(${selectorJson});
      if (!el) throw new Error('field not found: ' + ${selectorJson});
      el.focus();
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) { el.select(); }
      return true;
    })()`);
    // Clear any existing content via select-all + delete, then insert natively so React sees real input events.
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Backspace', code: 'Backspace' });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace' });
    if (value) await this.send('Input.insertText', { text: value });
    await wait(80);
    return this.evaluate(`document.querySelector(${selectorJson})?.value ?? null`);
  }

  async submit(selector = 'form') {
    const selectorJson = JSON.stringify(selector);
    return this.evaluate(`(() => {
      const form = document.querySelector(${selectorJson});
      if (!form) throw new Error('form not found: ' + ${selectorJson});
      form.requestSubmit();
      return true;
    })()`);
  }

  async setViewport(width, height, { mobile = false } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile,
    });
    return { width, height, mobile };
  }

  async cookies() {
    // Session-scoped read: `Network.getAllCookies` is a browser-domain command
    // that is not available on every headless CDP target (it errored
    // "'Network.getAllCookies' wasn't found" here). `Network.getCookies` on the
    // page session returns the cookies for the current document and is universal.
    const result = await this.send('Network.getCookies', {});
    return result.cookies || [];
  }

  async setCookie(cookie) {
    await this.send('Network.setCookie', cookie);
  }

  async clearCookies() {
    await this.send('Network.clearBrowserCookies');
  }

  async screenshot(label, { dir, fullPage = true } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${label}.png`);
    const params = { format: 'png', captureBeyondViewport: fullPage };
    const result = await this.send('Page.captureScreenshot', params);
    fs.writeFileSync(target, Buffer.from(result.data, 'base64'));
    return { label, path: target, sha256: hashFile(target) };
  }

  firstPartyHttp() {
    const nextOrigin = this.nextOrigin;
    return this.connection.eventsFor(this.sessionId, ['Network.responseReceived'])
      .map((event) => event.params.response)
      .filter((response) => !nextOrigin || response.url.startsWith(nextOrigin))
      .map((response) => ({ url: response.url.split('?')[0], status: response.status, type: response.type }));
  }

  /** Monotonic marker of the last CDP event index (used for exact diag windows). */
  consoleEventMarker() {
    return this.connection.totalEvents;
  }

  /** [absoluteIndex, event] pairs for this session matching the given methods. */
  eventsWithIndex(methods) {
    const events = this.connection.events;
    const base = this.connection.totalEvents - events.length;
    const out = [];
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      if (event.sessionId !== this.sessionId) continue;
      if (methods && !methods.includes(event.method)) continue;
      out.push([base + i, event]);
    }
    return out;
  }

  firstPartyFailures(fromAbsolute = 0) {
    const nextOrigin = this.nextOrigin;
    return this.eventsWithIndex(['Network.loadingFailed'])
      .filter(([abs]) => abs >= fromAbsolute)
      .filter(([, event]) => {
        const url = event.params?.request?.url || '';
        return !nextOrigin || url.startsWith(nextOrigin);
      })
      .map(([, event]) => ({ url: (event.params?.request?.url || '').split('?')[0], errorText: event.params?.errorText || null }));
  }

  consoleErrors(fromAbsolute = 0) {
    return this.eventsWithIndex(['Runtime.consoleAPICalled'])
      .filter(([abs]) => abs >= fromAbsolute)
      .filter(([, event]) => event.params.type === 'error' || event.params.type === 'warning')
      .map(([, event]) => ({
        level: event.params.type,
        text: (event.params.args || []).map((arg) => arg.value ?? arg.description ?? '').join(' ').slice(0, 400),
      }));
  }

  exceptions(fromAbsolute = 0) {
    return this.eventsWithIndex(['Runtime.exceptionThrown'])
      .filter(([abs]) => abs >= fromAbsolute)
      .map(([, event]) => event.params.exceptionDetails?.exception?.description
        || event.params.exceptionDetails?.text || 'exception');
  }

  /** Enable Fetch interception; matching requests are held until released. */
  async enableFetch(pattern = '*') {
    await this.send('Fetch.enable', { patterns: [{ urlPattern: pattern, requestStage: 'Request' }] });
    this.fetchEnabled = true;
  }

  heldRequestIds() {
    return this.connection.eventsFor(this.sessionId, ['Fetch.requestPaused']).map((event) => event.params.requestId);
  }

  /** Continue every currently-paused request (used on release). */
  async releasePaused() {
    const ids = new Set([...this.heldRequests, ...this.heldRequestIds()]);
    this.heldRequests.clear();
    for (const requestId of ids) {
      await this.send('Fetch.continueRequest', { requestId }).catch(() => {});
    }
    return ids.size;
  }

  async disableFetch() {
    // Disable interception FIRST, then release every still-paused request: doing it
    // the other way leaves a window where a request paused between the release and
    // Fetch.disable stays paused forever, freezing the page.
    await this.send('Fetch.disable').catch(() => {});
    await this.releasePaused();
    this.fetchEnabled = false;
  }

  /**
   * Selective Fetch hold: continue every paused request except those for which
   * `hold(params)` is true; matching requests stay paused until releasePaused().
   * Used for the scoped stale-read-after-revocation probe without globally
   * freezing unrelated requests (a blank blanket hold would block logout itself).
   */
  async enableFetchFiltered(hold) {
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    this.fetchEnabled = true;
    this.filterHold = hold;
    this.filterHandled = new Set();
    this.filterActive = true;
    this.filterLoop = (async () => {
      while (this.filterActive) {
        for (const event of this.connection.eventsFor(this.sessionId, ['Fetch.requestPaused'])) {
          const requestId = event.params.requestId;
          if (this.filterHandled.has(requestId)) continue;
          this.filterHandled.add(requestId);
          if (this.filterHold(event.params)) {
            this.heldRequests.add(requestId);
          } else {
            await this.send('Fetch.continueRequest', { requestId }).catch(() => {});
          }
        }
        await wait(40);
      }
    })();
  }

  async disableFetchFiltered() {
    this.filterActive = false;
    await this.filterLoop?.catch(() => {});
    await this.send('Fetch.disable').catch(() => {});
    await this.releasePaused();
    this.fetchEnabled = false;
  }

  /**
   * Selective Fetch failure: continue every paused request except those for which
   * `fail(params)` is true; matching requests are FAILED at the network boundary
   * (a real transport error for the reader), then the fault is disarmed by
   * disableFetchFiltered(). Used for the reader transport-fault probe without a
   * blanket request freeze.
   */
  async enableFetchFail(fail) {
    await this.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    this.fetchEnabled = true;
    this.filterHold = () => false;
    this.filterHandled = new Set();
    this.filterActive = true;
    this.failedRequests = [];
    this.filterLoop = (async () => {
      while (this.filterActive) {
        for (const event of this.connection.eventsFor(this.sessionId, ['Fetch.requestPaused'])) {
          const requestId = event.params.requestId;
          if (this.filterHandled.has(requestId)) continue;
          this.filterHandled.add(requestId);
          if (fail(event.params)) {
            this.failedRequests.push(requestId);
            await this.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
          } else {
            await this.send('Fetch.continueRequest', { requestId }).catch(() => {});
          }
        }
        await wait(40);
      }
    })();
  }

  failedRequestCount() {
    return Array.isArray(this.failedRequests) ? this.failedRequests.length : 0;
  }

  /**
   * One-shot client transport-seam response loss: the FIRST POST whose
   * `Next-Action` header equals `actionId` is allowed to reach the real backend
   * (so it genuinely commits), its real response body is captured into a page
   * global, and only THEN is the response discarded by throwing a transport
   * error to the caller. This is real response loss, not a speculative comment.
   */
  async armActionResponseDrop(actionId) {
    const encoded = JSON.stringify(String(actionId));
    await this.evaluate(`(() => {
      window.__p107Drop = { actionId: ${encoded}, armed: true, count: 0, captured: null };
      if (!window.__p107DropWrapped) {
        window.__p107DropWrapped = true;
        const original = window.fetch;
        window.fetch = async (...args) => {
          const response = await original(...args);
          try {
            const request = args[0];
            const url = typeof request === 'string' ? request : (request && request.url) || '';
            const init = args[1] || {};
            const method = init.method || 'GET';
            let actionHeader = null;
            try {
              const headers = init.headers || {};
              if (headers && typeof headers.get === 'function') actionHeader = headers.get('Next-Action');
              else if (headers && typeof headers === 'object') actionHeader = headers['Next-Action'] || headers['next-action'] || null;
            } catch { /* ignore */ }
            const state = window.__p107Drop;
            if (state && state.armed && method === 'POST' && actionHeader === state.actionId) {
              let text = '';
              try { text = await response.clone().text(); } catch { text = ''; }
              state.captured = { status: response.status, text, url: String(url).slice(0, 120) };
              state.armed = false;
              state.count += 1;
              throw new Error('P107T07_INJECTED_RESPONSE_LOSS');
            }
          } catch (error) {
            if (String(error && error.message || error).includes('P107T07_INJECTED_RESPONSE_LOSS')) throw error;
          }
          return response;
        };
      }
      return true;
    })()`);
    return true;
  }

  async readDroppedActionResponse() {
    return this.evaluate('window.__p107Drop ? window.__p107Drop.captured : null');
  }

  async dropCount() {
    return this.evaluate('window.__p107Drop ? window.__p107Drop.count : 0');
  }
}

/** Launch headless Chromium and return a connection + shared-context tab factory. */
export async function launchChromium({ runtimeRoot, binary, headless = true } = {}) {
  const resolved = resolveChromiumBinary(binary);
  const debugPort = await new Promise((resolve, reject) => {
    const probe = spawnSync(process.execPath, ['-e', "const s=require('node:net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"], { encoding: 'utf8' });
    if (probe.status !== 0) return reject(new Error('failed to allocate debug port'));
    resolve(Number(String(probe.stdout).trim()));
  });
  const profileDir = path.join(runtimeRoot, 'chrome-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [
    headless ? '--headless=new' : '--headless',
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    `--user-data-dir=${profileDir}`, `--remote-debugging-port=${debugPort}`,
    '--remote-allow-origins=*', 'about:blank',
  ];
  const { spawn } = await import('node:child_process');
  const child = spawn(resolved.binary, args, { detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (chunk) => { log = (log + String(chunk)).slice(-8000); });
  child.stderr.on('data', (chunk) => { log = (log + String(chunk)).slice(-8000); });

  const versionInfo = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return response.ok ? response.json() : false;
    } catch {
      if (child.exitCode !== null) throw new Error(`chromium exited early (${child.exitCode}): ${log}`);
      return false;
    }
  }, { timeout: 20_000, label: 'chromium devtools endpoint' });

  const connection = await new CdpConnection(versionInfo.webSocketDebuggerUrl).connect();

  async function newPage(name, { origin = null } = {}) {
    const { targetId } = await connection.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await connection.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new CdpPage(connection, sessionId, { name, origin, targetId });
    await page.enable();
    return page;
  }

  return {
    binary: resolved.binary,
    version: resolved.version,
    debugPort,
    profileDir,
    pid: child.pid,
    connection,
    newPage,
    async stop() {
      const { signalOwned, stopOwned } = await import('./guard.mjs');
      try { await connection.send('Browser.close'); } catch { /* ignore */ }
      await stopOwned(child);
      connection.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
      void signalOwned;
      return { processStopped: child.exitCode !== null || child.signalCode !== null, profileRemoved: !fs.existsSync(profileDir) };
    },
  };
}

export { run };
