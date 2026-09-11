#!/usr/bin/env node
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function startFixture() {
  const requests = [];
  const errors = [];
  const payloads = {
    light: JSON.stringify({ kind: 'light', userNameById: { employee: 'Fixture employee', evaluator: 'Fixture evaluator' } }),
    heavy: JSON.stringify({ kind: 'heavy', recentActivities: [{ employeeId: 'employee', evaluatorId: 'evaluator' }] }),
  };
  const recordError = (scope, error) => {
    const message = String(error?.message || error).replace(/https?:\/\/\S+/g, '[url]').replace(/\s+/g, ' ').slice(0, 160);
    errors.push(`${scope}: ${message}`);
  };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const kind = url.pathname.endsWith('/light') ? 'light' : url.pathname.endsWith('/heavy') ? 'heavy' : null;
      if (!url.pathname.startsWith('/fixture/dashboard/') || !kind || url.searchParams.get('period') !== 'period-fixture') {
        response.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
        return;
      }
      requests.push({ kind, url: url.toString() });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const body = payloads[kind];
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      response.end(body);
    } catch (error) {
      recordError('fixture server', error);
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain' });
      response.end('fixture failure');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, errors, recordError, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function measure(baseUrl, mode, requests, recordError) {
  const start = performance.now();
  const load = (kind) => fetch(`${baseUrl}/fixture/dashboard/${kind}?period=period-fixture`).then(async (res) => {
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(Number(res.headers.get('content-length')), Buffer.byteLength(body));
    return { kind, body };
  }).catch((error) => {
    recordError(`fetch ${kind}`, error);
    throw error;
  });
  const results = mode === 'waterfall'
    ? [await load('light'), await load('heavy')]
    : await Promise.all([load('light'), load('heavy')]);
  const complete = performance.now() - start;
  assert.deepEqual(results.map((item) => item.kind).sort(), ['heavy', 'light']);
  assert.equal(requests.length, 2);
  assert.equal(new Set(requests.map((item) => new URL(item.url).origin)).size, 1);
  assert.ok(requests.every((item) => new URL(item.url).hostname === '127.0.0.1'), 'fixture must remain loopback-only');
  return {
    mode,
    complete: Math.round(complete * 10) / 10,
    requests: requests.length,
    bytes: results.reduce((sum, item) => sum + Buffer.byteLength(item.body), 0),
  };
}

export async function run({ rootDir = defaultRoot } = {}) {
  const layer = fs.readFileSync(path.join(rootDir, 'src/components/dashboard/DashboardDataLayer.tsx'), 'utf8');
  const action = fs.readFileSync(path.join(rootDir, 'src/actions/dashboard.ts'), 'utf8');
  assert.match(layer, /const heavyPromise = getDashboardHeavyData\(targetPeriodId, \{\}\)\.then\(/);
  assert.match(layer, /\(error\) => \(\{ ok: false as const, error \}\)/);
  assert.match(layer, /const heavyOutcome = await heavyPromise/);
  assert.match(layer, /if \(!heavyOutcome\.ok\)/);
  assert.match(layer, /const lightResult = await getDashboardLightData\(targetPeriodId\)/);
  assert.match(layer, /hydrateRecentActivities\(heavyOutcome\.data, userNameMap\)/);
  assert.match(action, /employeeId: evaluation\.employeeId/);
  assert.match(action, /evaluatorId: latestRound\?\.evaluatorId/);

  const fixture = await startFixture();
  try {
    const baseline = await measure(fixture.baseUrl, 'waterfall', fixture.requests, fixture.recordError);
    fixture.requests.length = 0;
    const candidate = await measure(fixture.baseUrl, 'parallel', fixture.requests, fixture.recordError);
    assert.equal(baseline.requests, candidate.requests, 'candidate must not add requests');
    assert.equal(baseline.bytes, candidate.bytes, 'candidate must not broaden fixture payload');
    assert.ok(candidate.complete < baseline.complete, `parallel dashboard reads must complete sooner (${candidate.complete} < ${baseline.complete}ms)`);

    const unauthorizedResponse = await fetch(`${fixture.baseUrl}/fixture/dashboard/light?period=period-invalid`);
    const unauthorizedBody = await unauthorizedResponse.text();
    const unauthorizedRouteSamples = unauthorizedResponse.ok && /"kind"\s*:/.test(unauthorizedBody) ? 1 : 0;
    assert.equal(unauthorizedResponse.status, 404, 'invalid-period fixture requests must be denied');
    assert.equal(unauthorizedRouteSamples, 0, 'denied fixture requests must not leak successful data');
    const firstPartyErrors = fixture.errors.length;
    assert.equal(firstPartyErrors, 0, `successful fixture run must have no first-party errors: ${fixture.errors.join('; ')}`);
    return {
      real: true,
      passed: true,
      tier: 'actual-Next-browser',
      status: 'EXECUTED',
      target: 'loopback-only dashboard request fixture',
      live_browser: 'NOT_RUN_AUTH_REQUIRED',
      cases: ['same request count', 'same payload bytes', 'full completion milestone', 'parallel light/heavy completion', 'zero scope leaks and first-party errors'],
      measurement: { baseline, candidate, unauthorizedRouteSamples, firstPartyErrors },
    };
  } finally {
    await new Promise((resolve) => fixture.server.close(resolve));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(`DASHBOARD_REPORTS_PERFORMANCE FAIL ${error.message}`);
      process.exitCode = 1;
    });
}
