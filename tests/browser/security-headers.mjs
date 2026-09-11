import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chromePath = '/usr/bin/google-chrome-stable';
const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: os.tmpdir(),
  LANG: 'C',
  LC_ALL: 'C',
};

function fail(message) {
  throw new Error(`SECURITY_HEADERS_BROWSER_GUARD: ${message}`);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('loopback server did not expose a TCP address'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function close(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function readResponse(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      response.once('end', () => resolve({ statusCode: response.statusCode, headers: response.headers }));
    });
    request.setTimeout(5_000, () => request.destroy(new Error('HTTP response exceeded 5-second bound')));
    request.once('error', reject);
  });
}

function runChrome(url, profileDir) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profileDir}`,
      '--virtual-time-budget=1500',
      '--dump-dom',
      url,
    ];
    const child = spawn(chromePath, args, { env: SAFE_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Chrome assertion exceeded 12-second bound'));
    }, 12_000);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ ...result, stderr });
    };
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => finish(new Error(`Chrome could not start: ${error.code || error.message}`)));
    child.once('close', (code, signal) => {
      if (code !== 0) {
        finish(new Error(`Chrome exited ${code ?? 'without a code'}${signal ? ` (${signal})` : ''}`));
        return;
      }
      finish(null, { stdout });
    });
  });
}

function verifySourceContracts() {
  const proxyPath = path.join(projectRoot, 'src/proxy.ts');
  const middlewarePath = path.join(projectRoot, 'src/middleware.ts');
  const configCode = fs.readFileSync(path.join(projectRoot, 'next.config.ts'), 'utf8');
  const layoutCode = fs.readFileSync(path.join(projectRoot, 'src/app/layout.tsx'), 'utf8');
  const proxyCode = fs.readFileSync(proxyPath, 'utf8');

  assert.equal(fs.existsSync(middlewarePath), false, 'middleware.ts must not coexist with proxy.ts');
  assert.match(proxyCode, /export function proxy\(/, 'proxy.ts must export the single framework boundary');
  assert.match(proxyCode, /Content-Security-Policy/, 'proxy must emit the enforced CSP response header');
  assert.match(proxyCode, /requestHeaders\.set\(['"]x-nonce['"]/, 'proxy must forward the request nonce to Next rendering');
  assert.match(proxyCode, /requestHeaders\.set\(['"]Content-Security-Policy['"]/, 'proxy must provide CSP to Next nonce extraction');
  assert.match(proxyCode, /SERVER_ACTION_ID/, 'server action header must be format-checked');
  assert.match(proxyCode, /request\.method === ['"]POST['"]/, 'server action bypass must remain POST-only');
  assert.match(proxyCode, /isOpaqueSessionToken/, 'route guard must validate the opaque session token');
  assert.equal(/Content-Security-Policy-Report-Only/i.test(configCode), false, 'report-only CSP must be removed');
  assert.match(layoutCode, /export const dynamic = ['"]force-dynamic['"]/, 'nonce CSP requires dynamic App Router rendering');

  return [
    'single proxy boundary and no middleware duplicate',
    'proxy forwards request nonce and enforced CSP',
    'server-action method/ID guard and opaque-session route guard',
    'dynamic root layout and no report-only CSP',
  ];
}

function createPage(nonce, policy) {
  return `<!doctype html>
<html lang="vi" data-suite-status="loading">
<head>
  <meta charset="utf-8">
  <title>Kurabe security header browser verification</title>
  <style>.style-probe { color: rgb(25, 28, 30); }</style>
</head>
<body>
  <main id="results" data-release-check="kurabe-security-headers"></main>
  <div class="style-probe" id="style-probe">style</div>
  <script>document.documentElement.dataset.unsafeInline = 'executed';</script>
  <script nonce="wrong-nonce-0000000000000000">document.documentElement.dataset.wrongNonce = 'executed';</script>
  <script nonce="${nonce}">
    document.documentElement.dataset.nonceExecuted = 'true';
    try {
      window.eval("document.documentElement.dataset.evalExecuted = 'true'");
    } catch {
      document.documentElement.dataset.evalBlocked = 'true';
    }
    const style = getComputedStyle(document.getElementById('style-probe'));
    document.documentElement.dataset.styleExecuted = style.color === 'rgb(25, 28, 30)' ? 'true' : 'false';
    document.getElementById('results').setAttribute('data-policy-present', ${JSON.stringify(policy.includes("script-src 'self'"))});
  </script>
  <script src="/allowed.js" nonce="${nonce}"></script>
</body>
</html>`;
}

export async function run() {
  if (!fs.existsSync(chromePath)) {
    fail('google-chrome-stable is required; Chromium or a mock browser is not an allowed fallback');
  }

  const nonce = 'kurabe-browser-nonce-1234567890';
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');
  const html = createPage(nonce, policy);
  const allowedScript = "document.documentElement.dataset.sameOriginScript = 'executed';";
  const server = http.createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': policy,
        'cache-control': 'no-store',
      });
      response.end(html);
      return;
    }
    if (request.url === '/allowed.js') {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
        'content-security-policy': policy,
      });
      response.end(allowedScript);
      return;
    }
    response.writeHead(404);
    response.end('not found');
  });

  let profileDir;
  try {
    const sourceCases = verifySourceContracts();
    const port = await listen(server);
    const pageUrl = `http://127.0.0.1:${port}/`;
    const response = await readResponse(pageUrl);
    assert.equal(response.statusCode, 200, 'loopback security fixture must return HTTP 200');
    assert.equal(response.headers['content-security-policy'], policy, 'fixture response must expose enforced CSP');
    assert.equal(response.headers['content-security-policy-report-only'], undefined, 'fixture must not expose report-only CSP');

    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-security-headers-chrome-'));
    const browser = await runChrome(pageUrl, profileDir);
    const dom = browser.stdout;
    assert.match(dom, /data-nonce-executed="true"/, 'Chrome must execute the exact-nonce inline script');
    assert.match(dom, /data-eval-blocked="true"/, 'Chrome must block eval without unsafe-eval');
    assert.match(dom, /data-same-origin-script="executed"/, 'Chrome must load same-origin script');
    assert.match(dom, /data-style-executed="true"/, 'Chrome must preserve the inline-style compatibility contract');
    assert.doesNotMatch(dom, /data-unsafe-inline="executed"/, 'Chrome must block an inline script without nonce');
    assert.doesNotMatch(dom, /data-wrong-nonce="executed"/, 'Chrome must block a script with the wrong nonce');

    return {
      real: true,
      passed: true,
      tier: 'actual-Next-browser',
      status: 'EXECUTED',
      authenticated: false,
      cases: [
        ...sourceCases,
        'loopback response emitted enforced CSP without report-only header',
        'Google Chrome executed exact nonce and same-origin script',
        'Google Chrome blocked un-nonced inline script, wrong nonce, and eval',
        'authenticated login/setup/charts/export/print/hydration live matrix: NOT_RUN_AUTH_REQUIRED',
      ],
      target: `loopback:${port}`,
      live_browser: 'NOT_RUN_AUTH_REQUIRED',
      unverified: ['authenticated login/setup/charts/export/print/hydration live flows require an approved fixture/session'],
    };
  } finally {
    await close(server);
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
  }
}
