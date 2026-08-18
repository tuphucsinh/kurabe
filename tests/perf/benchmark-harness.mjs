#!/usr/bin/env node
/**
 * KURABE Production Read-Only Performance Benchmark Harness (P84.1)
 *
 * Requirements:
 * - Read-only business benchmark against production endpoint: https://lykiv.vercel.app
 * - Browser: /usr/bin/google-chrome-stable (headless)
 * - CDP Client: Native Node 24 WebSocket (zero third-party dependencies)
 * - Auth: One UI login using KURABE_BENCHMARK_EMPLOYEE_CODE, reusing auth_session cookie
 * - Cleanup: Exact session row deletion by token_hash in try/finally, before/after DB snapshot verification
 * - Routes: /dashboard, /employees, /reports (N=10 cold, N=10 warm)
 * - Metrics: TTFB, FCP, LCP, DOMContentLoaded, Load, Route-specific Data-Complete marker
 * - Statistical computations: min, max, mean, p50, p95, stdDev
 * - Redacted output stored in tests/perf/perf-report.json
 */

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// --- 1. Environment & Target Validation ---
const EXPECTED_BASE_URL = 'https://lykiv.vercel.app';
const baseUrl = process.env.KURABE_BENCHMARK_BASE_URL;
if (!baseUrl || baseUrl.trim() !== EXPECTED_BASE_URL) {
  throw new Error(`CRITICAL: KURABE_BENCHMARK_BASE_URL must be explicitly set to '${EXPECTED_BASE_URL}'. Current: '${baseUrl}'`);
}

const employeeCode = process.env.KURABE_BENCHMARK_EMPLOYEE_CODE;
if (!employeeCode || !employeeCode.trim()) {
  throw new Error('CRITICAL: KURABE_BENCHMARK_EMPLOYEE_CODE environment variable is required.');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('CRITICAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for session verification and cleanup.');
}

const TARGET_ROUTES = ['/dashboard', '/employees', '/reports'];
const SAMPLE_SIZE = 10;
const REPORT_FILE = path.join(process.cwd(), 'tests', 'perf', 'perf-report.json');

// --- 2. Database Helper (Production Read-Only + Exact Session Cleanup) ---
async function supabaseRest(endpoint, options = {}) {
  const url = `${supabaseUrl}/rest/v1/${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': supabaseServiceRoleKey,
      'Authorization': `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res;
}

async function getTableCount(tableName) {
  const res = await supabaseRest(`${tableName}?select=id`, {
    headers: { 'Prefer': 'count=exact', 'Range': '0-0' },
  });
  if (!res.ok) {
    throw new Error(`Failed to query count for ${tableName}: HTTP ${res.status}`);
  }
  const range = res.headers.get('content-range');
  const match = range?.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

// --- 3. Statistical Helpers ---
function quantile(sorted, q) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return Math.round((sorted[base] + rest * (sorted[base + 1] - sorted[base])) * 10) / 10;
  }
  return Math.round(sorted[base] * 10) / 10;
}

function computeMetricStats(values) {
  const numeric = values.filter(v => typeof v === 'number' && !isNaN(v));
  if (numeric.length === 0) {
    return { count: 0, min: null, max: null, mean: null, p50: null, p95: null, stdDev: null };
  }
  const sorted = [...numeric].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = Math.round((sum / sorted.length) * 10) / 10;
  const variance = sorted.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / sorted.length;
  const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    stdDev,
  };
}

// --- 4. CDP Client Implementation (Node 24 Native WebSocket) ---
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.callbacks.has(msg.id)) {
            const { resolve, reject } = this.callbacks.get(msg.id);
            this.callbacks.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            else resolve(msg.result);
          } else if (msg.method) {
            const listeners = this.eventListeners.get(msg.method) || [];
            for (const fn of listeners) {
              try { fn(msg.params); } catch (e) { console.error('CDP listener error:', e); }
            }
          }
        } catch (e) {
          console.error('CDP message parse error:', e);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, callback) {
    if (!this.eventListeners.has(method)) {
      this.eventListeners.set(method, []);
    }
    this.eventListeners.get(method).push(callback);
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
  }
}

// --- 5. Main Benchmark Execution ---
async function runBenchmark() {
  console.log('================================================================');
  console.log(' KURABE PRODUCTION PERFORMANCE BENCHMARK (P84.1 READ-ONLY)');
  console.log('================================================================');
  console.log(`Target URL: ${baseUrl}`);
  console.log(`Routes: ${TARGET_ROUTES.join(', ')}`);
  console.log(`Sample Size: N=${SAMPLE_SIZE} cold + N=${SAMPLE_SIZE} warm per route (Total 60 runs)`);
  console.log('');

  // 5.1 DB Snapshot Before
  console.log('--- Step 1: Capturing Initial Database Snapshot ---');
  const [sessionsBefore, attemptsBefore] = await Promise.all([
    getTableCount('sessions'),
    getTableCount('login_attempts'),
  ]);
  console.log(`Snapshot Before: sessions=${sessionsBefore}, login_attempts=${attemptsBefore}`);

  const tmpUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-bench-chrome-'));
  let chromeProcess = null;
  let cdp = null;
  let capturedTokenHash = null;

  const benchmarkResults = {
    metadata: {
      timestamp: new Date().toISOString(),
      baseUrl,
      targetRoutes: TARGET_ROUTES,
      sampleSizePerState: SAMPLE_SIZE,
      browser: 'google-chrome-stable (headless)',
      environment: 'production-readonly',
    },
    snapshot: {
      before: {
        sessionsCount: sessionsBefore,
        loginAttemptsCount: attemptsBefore,
      },
      after: null,
      exactSessionDeleted: false,
    },
    summary: {},
    runs: [],
    consoleErrors: [],
    failedResources: [],
  };

  try {
    // 5.2 Launch Headless Chrome
    console.log('\n--- Step 2: Launching Headless Chrome & CDP ---');
    chromeProcess = spawn('/usr/bin/google-chrome-stable', [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${tmpUserDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints',
      '--disable-gpu',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--force-color-profile=srgb',
      '--metrics-recording-only',
      '--no-sandbox',
      '--password-store=basic',
      '--use-mock-keychain',
      '--window-size=1440,900',
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    const portFile = path.join(tmpUserDataDir, 'DevToolsActivePort');
    let devToolsPort = null;
    for (let i = 0; i < 60; i++) {
      if (fs.existsSync(portFile)) {
        const content = fs.readFileSync(portFile, 'utf8').trim().split('\n');
        if (content.length >= 2) {
          devToolsPort = parseInt(content[0].trim(), 10);
          break;
        }
      }
      await new Promise(r => setTimeout(r, 100));
    }

    if (!devToolsPort) {
      throw new Error('Failed to obtain DevTools port from Chrome startup.');
    }

    const listRes = await fetch(`http://127.0.0.1:${devToolsPort}/json/list`);
    const targets = await listRes.json();
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) {
      throw new Error('No page target found in Chrome DevTools.');
    }

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');

    // Global performance observer injection
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        window.__perf_entries = {
          fcp: null,
          lcp: null
        };
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.name === 'first-contentful-paint') {
                window.__perf_entries.fcp = entry.startTime;
              }
            }
          }).observe({ type: 'paint', buffered: true });
        } catch (e) {}
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            if (entries.length > 0) {
              window.__perf_entries.lcp = entries[entries.length - 1].startTime;
            }
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch (e) {}
      `,
    });

    // 5.3 UI Authentication (Single Login, Reuse Session Cookie)
    console.log('\n--- Step 3: Performing UI Login ---');
    await cdp.send('Page.navigate', { url: `${baseUrl}/login` });
    await new Promise(r => setTimeout(r, 1500));

    // Wait for employeeCode input
    let loginFormReady = false;
    for (let i = 0; i < 50; i++) {
      const check = await cdp.send('Runtime.evaluate', {
        expression: `!!document.getElementById('employeeCode')`,
        returnByValue: true,
      });
      if (check?.result?.value === true) {
        loginFormReady = true;
        break;
      }
      await new Promise(r => setTimeout(r, 100));
    }

    if (!loginFormReady) {
      throw new Error('Login form input #employeeCode did not become available.');
    }

    // Type employee code using CDP key events (triggers React synthetic handlers)
    await cdp.send('Runtime.evaluate', {
      expression: `document.getElementById('employeeCode').focus()`,
    });

    for (const char of employeeCode.trim()) {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', text: char, unmodifiedText: char });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp' });
    }

    // Click submit button
    await cdp.send('Runtime.evaluate', {
      expression: `document.querySelector('button[type="submit"]').click()`,
    });

    // Capture auth_session cookie
    let authSessionToken = null;
    for (let i = 0; i < 60; i++) {
      const cookiesRes = await cdp.send('Network.getCookies', { urls: [baseUrl] });
      const cookie = cookiesRes.cookies.find(c => c.name === 'auth_session');
      if (cookie && /^[0-9a-f]{64}$/i.test(cookie.value)) {
        authSessionToken = cookie.value;
        break;
      }
      await new Promise(r => setTimeout(r, 200));
    }

    if (!authSessionToken) {
      throw new Error('Failed to acquire valid auth_session cookie after UI login.');
    }

    capturedTokenHash = crypto.createHash('sha256').update(authSessionToken).digest('hex');
    console.log('UI login successful: auth_session cookie acquired.');

    // Verify session row exists in production DB
    const sessVerifyRes = await supabaseRest(`sessions?token_hash=eq.${capturedTokenHash}`);
    const sessVerifyRows = await sessVerifyRes.json();
    if (!Array.isArray(sessVerifyRows) || sessVerifyRows.length !== 1) {
      throw new Error(`Production session verification failed: expected 1 row, got ${sessVerifyRows?.length}`);
    }
    console.log('Verified exact session row exists in production DB public.sessions.');

    // 5.4 Benchmark Execution Loop
    console.log('\n--- Step 4: Executing Benchmark Runs ---');

    let consecutiveFailures = 0;
    let totalRunIndex = 0;
    const totalRunsTarget = TARGET_ROUTES.length * 2 * SAMPLE_SIZE;

    // Track console errors and failed network resources across runs
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry.level === 'error') {
        const sanitizedText = (p.entry.text || '').replace(/[0-9a-f]{64}/gi, '[REDACTED_HASH]');
        benchmarkResults.consoleErrors.push({
          source: 'Log.entryAdded',
          text: sanitizedText,
          timestamp: new Date().toISOString(),
        });
      }
    });

    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        const text = p.args.map(a => a.value || a.description || '').join(' ');
        const sanitized = text.replace(/[0-9a-f]{64}/gi, '[REDACTED_HASH]');
        benchmarkResults.consoleErrors.push({
          source: 'console.error',
          text: sanitized,
          timestamp: new Date().toISOString(),
        });
      }
    });

    cdp.on('Network.responseReceived', (p) => {
      if (p.response.status >= 400) {
        benchmarkResults.failedResources.push({
          url: p.response.url.split('?')[0],
          status: p.response.status,
          statusText: p.response.statusText,
        });
      }
    });

    for (const route of TARGET_ROUTES) {
      benchmarkResults.summary[route] = { cold: {}, warm: {} };

      for (const state of ['cold', 'warm']) {
        const routeRuns = [];

        for (let iter = 1; iter <= SAMPLE_SIZE; iter++) {
          totalRunIndex++;
          const runLabel = `[${totalRunIndex}/${totalRunsTarget}] ${route} (${state} #${iter})`;

          try {
            if (state === 'cold') {
              // Clear browser HTTP cache for cold run (cookies/session preserved)
              await cdp.send('Network.clearBrowserCache');
            }

            let docStatus = 200;
            const docResponseHandler = (p) => {
              if (p.type === 'Document' && p.response.url.includes(route)) {
                docStatus = p.response.status;
              }
            };
            cdp.on('Network.responseReceived', docResponseHandler);

            // Navigate to route
            await cdp.send('Page.navigate', { url: `${baseUrl}${route}` });

            // Poll route-specific data-complete predicate
            // Predicates:
            // 1. /dashboard: Confirms title 'Tổng quan hệ thống', rendered KPI metrics/progress or empty state, and no loading spinners/pulse.
            // 2. /employees: Confirms title 'Quản lý Nhân sự QAQC', no table skeleton (.animate-pulse), and rendered table rows or summary.
            // 3. /reports: Confirms title 'Báo cáo QAQC', rendered KPI pill metrics or empty state, and no loading indicators.
            let dataCompleteMs = null;
            for (let pIdx = 0; pIdx < 150; pIdx++) {
              try {
                const evalState = await cdp.send('Runtime.evaluate', {
                  expression: `(() => {
                    const route = ${JSON.stringify(route)};
                    const bodyText = document.body ? document.body.innerText : '';
                    if (route === '/dashboard') {
                      const hasTitle = bodyText.includes('Tổng quan hệ thống');
                      const hasKpis = (bodyText.includes('nhân sự') && (bodyText.includes('tiến độ') || bodyText.includes('đã đánh giá'))) || bodyText.includes('Chưa có dữ liệu đánh giá');
                      const isLoading = document.querySelectorAll('.animate-spin, .animate-pulse').length > 0;
                      return hasTitle && hasKpis && !isLoading;
                    } else if (route === '/employees') {
                      const hasTitle = bodyText.includes('Quản lý Nhân sự QAQC');
                      const hasSkeleton = document.querySelectorAll('.animate-pulse').length > 0;
                      const hasRowsOrSummary = document.querySelectorAll('table tbody tr').length > 0 || bodyText.includes('Không tìm thấy nhân viên') || bodyText.includes('nhân viên trong hệ thống');
                      return hasTitle && !hasSkeleton && hasRowsOrSummary;
                    } else if (route === '/reports') {
                      const hasTitle = bodyText.includes('Báo cáo QAQC');
                      const hasKpis = bodyText.includes('điểm TB') || bodyText.includes('nhân sự') || bodyText.includes('Không có dữ liệu báo cáo');
                      const isLoading = document.querySelectorAll('.animate-spin, .animate-pulse').length > 0;
                      return hasTitle && hasKpis && !isLoading;
                    }
                    return false;
                  })()`,
                  returnByValue: true,
                });

                if (evalState?.result?.value === true) {
                  const nowRes = await cdp.send('Runtime.evaluate', {
                    expression: `performance.now()`,
                    returnByValue: true,
                  });
                  dataCompleteMs = nowRes?.result?.value ?? null;
                  break;
                }
              } catch {
                // Navigation context transition; retry next tick
              }
              await new Promise(r => setTimeout(r, 100));
            }

            // Extract Navigation Timing & Paint Metrics
            const perfRes = await cdp.send('Runtime.evaluate', {
              expression: `(() => {
                const nav = performance.getEntriesByType('navigation')[0];
                const paintEntries = performance.getEntriesByType('paint');
                const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');
                const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
                const lastLcp = lcpEntries && lcpEntries.length > 0 ? lcpEntries[lcpEntries.length - 1] : null;

                const fcp = window.__perf_entries?.fcp ?? (fcpEntry ? fcpEntry.startTime : null);
                const lcp = window.__perf_entries?.lcp ?? (lastLcp ? lastLcp.startTime : null);

                return nav ? {
                  ttfb: Math.round((nav.responseStart - nav.startTime) * 10) / 10,
                  domContentLoaded: Math.round((nav.domContentLoadedEventEnd - nav.startTime) * 10) / 10,
                  load: Math.round((nav.loadEventEnd - nav.startTime) * 10) / 10,
                  fcp: fcp != null ? Math.round(fcp * 10) / 10 : null,
                  lcp: lcp != null ? Math.round(lcp * 10) / 10 : null
                } : null;
              })()`,
              returnByValue: true,
            });

            const metrics = perfRes?.result?.value || {};
            const runData = {
              route,
              state,
              iteration: iter,
              status: docStatus,
              ttfb: metrics.ttfb ?? null,
              fcp: metrics.fcp ?? null,
              lcp: metrics.lcp ?? null,
              domContentLoaded: metrics.domContentLoaded ?? null,
              load: metrics.load ?? null,
              dataComplete: dataCompleteMs != null ? Math.round(dataCompleteMs * 10) / 10 : 'UNKNOWN',
            };

            routeRuns.push(runData);
            benchmarkResults.runs.push(runData);
            consecutiveFailures = 0; // reset on success

            console.log(`${runLabel} -> Status=${runData.status} TTFB=${runData.ttfb}ms FCP=${runData.fcp}ms LCP=${runData.lcp}ms Load=${runData.load}ms Complete=${runData.dataComplete}ms`);

          } catch (runErr) {
            consecutiveFailures++;
            console.error(`${runLabel} FAILED:`, runErr.message);
            if (consecutiveFailures >= 2) {
              console.error('\nCRITICAL: 2 consecutive run failures encountered. Halting benchmark per 2-Strike rule.');
              break;
            }
          }
        }

        if (consecutiveFailures >= 2) break;

        // Compute summary for this route and state
        const ttfbVals = routeRuns.map(r => r.ttfb);
        const fcpVals = routeRuns.map(r => r.fcp);
        const lcpVals = routeRuns.map(r => r.lcp);
        const dclVals = routeRuns.map(r => r.domContentLoaded);
        const loadVals = routeRuns.map(r => r.load);
        const dcVals = routeRuns.map(r => (typeof r.dataComplete === 'number' ? r.dataComplete : null));

        benchmarkResults.summary[route][state] = {
          sampleCount: routeRuns.length,
          ttfb: computeMetricStats(ttfbVals),
          fcp: computeMetricStats(fcpVals),
          lcp: computeMetricStats(lcpVals),
          domContentLoaded: computeMetricStats(dclVals),
          load: computeMetricStats(loadVals),
          dataComplete: computeMetricStats(dcVals),
        };
      }

      if (consecutiveFailures >= 2) break;
    }

  } finally {
    // 5.5 Guaranteed Production Cleanup in try/finally
    console.log('\n--- Step 5: Production Session Cleanup & Verification ---');
    if (capturedTokenHash) {
      try {
        const delRes = await supabaseRest(`sessions?token_hash=eq.${capturedTokenHash}`, {
          method: 'DELETE',
          headers: { 'Prefer': 'return=representation' },
        });
        const deletedRows = await delRes.json();
        const deleteCount = Array.isArray(deletedRows) ? deletedRows.length : 0;
        console.log(`Exact session row deleted from public.sessions (deleted count: ${deleteCount}).`);

        // Verify row absence
        const checkRes = await supabaseRest(`sessions?token_hash=eq.${capturedTokenHash}`);
        const checkRows = await checkRes.json();
        const isAbsent = Array.isArray(checkRows) && checkRows.length === 0;
        console.log(`Session row absence verification: ${isAbsent ? 'CONFIRMED (0 rows found)' : 'FAILED'}`);
        benchmarkResults.snapshot.exactSessionDeleted = isAbsent && deleteCount === 1;

      } catch (cleanupErr) {
        console.error('CRITICAL: Error during exact session cleanup:', cleanupErr);
      }
    }

    // Capture Snapshot After
    try {
      const [sessionsAfter, attemptsAfter] = await Promise.all([
        getTableCount('sessions'),
        getTableCount('login_attempts'),
      ]);
      console.log(`Snapshot After: sessions=${sessionsAfter}, login_attempts=${attemptsAfter}`);
      console.log(`Sessions count delta: ${sessionsAfter - sessionsBefore}`);
      console.log(`Login attempts delta: ${attemptsAfter - attemptsBefore}`);

      benchmarkResults.snapshot.after = {
        sessionsCount: sessionsAfter,
        loginAttemptsCount: attemptsAfter,
      };
    } catch (snapErr) {
      console.error('Error capturing post-benchmark snapshot:', snapErr);
    }

    // Close CDP and Chrome
    if (cdp) cdp.close();
    if (chromeProcess) {
      try { chromeProcess.kill('SIGTERM'); } catch {}
    }
    try {
      fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
    } catch {}
  }

  // 5.6 Save Redacted Perf Report
  console.log('\n--- Step 6: Writing Redacted Perf Report ---');
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(benchmarkResults, null, 2), 'utf8');
  console.log(`Report successfully written to ${REPORT_FILE}`);

  // Print Summary Table
  console.log('\n================================================================');
  console.log(' BENCHMARK SUMMARY METRICS (ms)');
  console.log('================================================================');
  for (const route of TARGET_ROUTES) {
    console.log(`\nRoute: ${route}`);
    for (const state of ['cold', 'warm']) {
      const stats = benchmarkResults.summary[route]?.[state];
      if (!stats || !stats.sampleCount) {
        console.log(`  ${state.toUpperCase()} (N=0): INCOMPLETE/BLOCKED`);
        continue;
      }
      console.log(`  ${state.toUpperCase()} (N=${stats.sampleCount}):`);
      console.log(`    TTFB:          p50=${stats.ttfb.p50}ms  p95=${stats.ttfb.p95}ms  [min=${stats.ttfb.min}ms, max=${stats.ttfb.max}ms, sd=${stats.ttfb.stdDev}ms]`);
      console.log(`    FCP:           p50=${stats.fcp.p50}ms  p95=${stats.fcp.p95}ms  [min=${stats.fcp.min}ms, max=${stats.fcp.max}ms, sd=${stats.fcp.stdDev}ms]`);
      console.log(`    LCP:           p50=${stats.lcp.p50}ms  p95=${stats.lcp.p95}ms  [min=${stats.lcp.min}ms, max=${stats.lcp.max}ms, sd=${stats.lcp.stdDev}ms]`);
      console.log(`    Load:          p50=${stats.load.p50}ms  p95=${stats.load.p95}ms  [min=${stats.load.min}ms, max=${stats.load.max}ms, sd=${stats.load.stdDev}ms]`);
      console.log(`    Data-Complete: p50=${stats.dataComplete.p50}ms  p95=${stats.dataComplete.p95}ms  [min=${stats.dataComplete.min}ms, max=${stats.dataComplete.max}ms, sd=${stats.dataComplete.stdDev}ms]`);
    }
  }

  console.log('\n================================================================');
  console.log(' PRODUCTION READ-ONLY BENCHMARK FINISHED');
  console.log('================================================================');
}

runBenchmark().catch((err) => {
  console.error('\nBenchmark Fatal Error:', err);
  process.exit(1);
});
