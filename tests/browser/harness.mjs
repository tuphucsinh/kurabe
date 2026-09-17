import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');
const fixturePath = path.join(projectRoot, 'tests/fixtures/release/browser-page.html');
const chromePath = '/usr/bin/google-chrome-stable';
const CHROME_ASSERTION_TIMEOUT_MS = 30_000;
const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: os.tmpdir(),
  LANG: 'C',
  LC_ALL: 'C',
};

function fail(message) {
  throw new Error(`LOCAL_BROWSER_GUARD: ${message}`);
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

function removeProfile(profileDir) {
  if (profileDir) {
    fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
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
      '--virtual-time-budget=1000',
      '--dump-dom',
      url,
    ];
    const child = spawn(chromePath, args, {
      env: SAFE_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error(`Chrome assertion exceeded ${CHROME_ASSERTION_TIMEOUT_MS / 1000}-second bound`));
    }, CHROME_ASSERTION_TIMEOUT_MS);
    const append = (current, chunk) => (current + chunk.toString()).slice(-128 * 1024);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve({ ...result, stderr });
      }
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
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

export async function run() {
  if (!fs.existsSync(chromePath)) {
    fail('google-chrome-stable is required; Chromium or a mock browser is not an allowed fallback');
  }
  if (!fs.existsSync(fixturePath)) fail('synthetic browser fixture is missing');
  const html = fs.readFileSync(fixturePath, 'utf8');
  const server = http.createServer((request, response) => {
    if (request.url !== '/') {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-length': Buffer.byteLength(html),
    });
    response.end(html);
  });
  let profileDir;
  try {
    const port = await listen(server);
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-release-chrome-'));
    const result = await runChrome(`http://127.0.0.1:${port}/`, profileDir);
    const dom = result.stdout;
    if (!dom.includes('data-release-check="kurabe-local-browser"')) {
      fail('real Chrome output did not contain the release assertion marker');
    }
    if (!dom.includes('data-release-status="ready"')) {
      fail('real Chrome did not execute the fixture assertion script');
    }
    if (!dom.includes('data-assertion="executed-by-chrome"')) {
      fail('browser assertion marker was not produced by Chrome');
    }
    return {
      real: true,
      passed: true,
      tier: 'actual-Next-browser',
      status: 'EXECUTED',
      cases: ['loopback HTTP fixture served', 'google-chrome-stable DOM assertion'],
      target: `loopback:${port}`,
    };
  } finally {
    await close(server);
    removeProfile(profileDir);
  }
}
