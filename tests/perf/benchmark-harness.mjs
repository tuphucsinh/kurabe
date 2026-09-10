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

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// --- 1. Environment & Target Validation ---
const EXPECTED_BASE_URL = 'https://lykiv.vercel.app';
const LOCAL_FIXTURE_MODE = process.env.KURABE_BENCHMARK_MODE === 'local-fixture';
const baseUrl = process.env.KURABE_BENCHMARK_BASE_URL;
const employeeCode = process.env.KURABE_BENCHMARK_EMPLOYEE_CODE;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!LOCAL_FIXTURE_MODE) {
  if (!baseUrl || baseUrl.trim() !== EXPECTED_BASE_URL) {
    throw new Error(`CRITICAL: KURABE_BENCHMARK_BASE_URL must be explicitly set to '${EXPECTED_BASE_URL}'. Current: '${baseUrl}'`);
  }
  if (!employeeCode || !employeeCode.trim()) {
    throw new Error('CRITICAL: KURABE_BENCHMARK_EMPLOYEE_CODE environment variable is required.');
  }
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('CRITICAL: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for session verification and cleanup.');
  }
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

  off(method, callback) {
    const listeners = this.eventListeners.get(method);
    if (!listeners) return;
    this.eventListeners.set(method, listeners.filter((listener) => listener !== callback));
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startLocalFixtureServer() {
  const allowedRoutes = new Set(TARGET_ROUTES);
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
    const route = requestUrl.pathname;
    const role = requestUrl.searchParams.get('fixtureRole') || '';
    const validRole = role === 'worker' || role === 'manager';
    if (route === '/app.js') {
      const body = `(() => {
        const complete = () => {
          const marker = document.getElementById('data-complete');
          if (marker) marker.textContent = 'complete';
          document.body.dataset.complete = 'true';
          performance.mark('fixture-data-complete');
        };
        window.__fixtureErrors = [];
        setTimeout(complete, 18);
      })();`;
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=600' });
      response.end(body);
      return;
    }
    if (route === '/app.css') {
      response.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'public, max-age=600' });
      response.end('body{margin:0;font-family:system-ui,sans-serif}main{padding:24px}.hero{min-height:120px;background:#e8f0ff;padding:16px}');
      return;
    }
    if (route === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    if (!allowedRoutes.has(route) || !validRole) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    const body = `<!doctype html><html><head><meta charset="utf-8"><title>Kurabe local performance fixture</title><link rel="stylesheet" href="/app.css"></head><body data-route="${route}" data-role="${role}" data-complete="false"><main><section class="hero"><h1>${route} fixture</h1><p>role=${role}</p></section><p id="data-complete">loading</p></main><script src="/app.js"></script></body></html>`;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function waitForDevToolsPort(portFile) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (fs.existsSync(portFile)) {
      const lines = fs.readFileSync(portFile, 'utf8').trim().split('\n');
      if (lines.length >= 2 && Number.isInteger(Number(lines[0]))) return Number(lines[0]);
    }
    await sleep(100);
  }
  throw new Error('Local fixture Chrome DevTools port did not become ready.');
}

function summarizeValues(values) {
  const numeric = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (numeric.length === 0) return { sampleCount: 0, min: null, max: null, mean: null, median: null, spreadPercent: null, aggregation: 'unavailable', value: null };
  const sorted = [...numeric].sort((a, b) => a - b);
  const median = sorted.length === 1 ? sorted[0] : (sorted[0] + sorted[sorted.length - 1]) / 2;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const spreadPercent = median === 0 ? 0 : ((sorted[sorted.length - 1] - sorted[0]) / median) * 100;
  const useMedian = spreadPercent > 5;
  const round = (value) => Math.round(value * 10) / 10;
  return {
    sampleCount: numeric.length,
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(mean),
    median: round(median),
    spreadPercent: round(spreadPercent),
    aggregation: useMedian ? 'median' : 'mean',
    value: round(useMedian ? median : mean),
  };
}

async function runLocalFixtureBenchmark() {
  const { server, baseUrl: fixtureUrl } = await startLocalFixtureServer();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-local-perf-chrome-'));
  const chrome = spawn('/usr/bin/google-chrome-stable', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
    '--disable-dev-shm-usage', '--disable-extensions', '--disable-gpu', '--disable-popup-blocking',
    '--disable-sync', '--metrics-recording-only', '--no-sandbox', '--password-store=basic',
    '--use-mock-keychain', '--window-size=1440,900', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stderr.on('data', () => {});
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  let cdp = null;
  const browserErrors = [];
  const runs = [];
  const viewports = [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }];
  const roles = ['worker', 'manager'];
  const browserVersion = spawnSync('/usr/bin/google-chrome-stable', ['--version'], { encoding: 'utf8' }).stdout.trim();
  try {
    const devToolsPort = await waitForDevToolsPort(portFile);
    const targets = await (await fetch(`http://127.0.0.1:${devToolsPort}/json/list`)).json();
    const pageTarget = targets.find((target) => target.type === 'page');
    if (!pageTarget) throw new Error('Local fixture Chrome page target missing.');
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__fixtureLcp = null;
      try { new PerformanceObserver((list) => { const entries = list.getEntries(); if (entries.length) window.__fixtureLcp = entries[entries.length - 1].startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    ` });
    cdp.on('Log.entryAdded', (payload) => { if (payload.entry?.level === 'error') browserErrors.push({ type: 'log', text: String(payload.entry.text || '').slice(0, 240) }); });
    cdp.on('Runtime.consoleAPICalled', (payload) => { if (payload.type === 'error') browserErrors.push({ type: 'console', text: payload.args?.map((arg) => arg.value || arg.description || '').join(' ').slice(0, 240) }); });
    cdp.on('Network.loadingFailed', (payload) => browserErrors.push({ type: 'network', text: String(payload.errorText || 'loading failed').slice(0, 240) }));

    for (const viewport of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.name === 'mobile' });
      for (const role of roles) {
        for (const route of TARGET_ROUTES) {
          for (const state of ['cold', 'warm']) {
            for (let sample = 1; sample <= 2; sample += 1) {
              const errorStart = browserErrors.length;
              if (state === 'cold') await cdp.send('Network.clearBrowserCache');
              let documentStatus = null;
              const documentHandler = (payload) => {
                if (payload.type === 'Document' && payload.response?.url?.startsWith(fixtureUrl)) documentStatus = payload.response.status;
              };
              cdp.on('Network.responseReceived', documentHandler);
              await cdp.send('Page.navigate', { url: `${fixtureUrl}${route}?fixtureRole=${role}&viewport=${viewport.name}` });
              let complete = false;
              for (let attempt = 0; attempt < 100; attempt += 1) {
                const stateResult = await cdp.send('Runtime.evaluate', { expression: `document.readyState === 'complete' && document.body?.dataset.complete === 'true'`, returnByValue: true });
                if (stateResult.result?.value === true) { complete = true; break; }
                await sleep(20);
              }
              await sleep(30);
              const measurement = await cdp.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
                const nav = performance.getEntriesByType('navigation')[0];
                const paints = performance.getEntriesByType('paint');
                const fcp = paints.find((entry) => entry.name === 'first-contentful-paint');
                const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
                const lcp = window.__fixtureLcp ?? (lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : null);
                const completeEntry = performance.getEntriesByName('fixture-data-complete')[0];
                const resources = performance.getEntriesByType('resource');
                return { route: document.body?.dataset.route, role: document.body?.dataset.role, complete: document.body?.dataset.complete === 'true', ttfb: nav ? nav.responseStart - nav.startTime : null, fcp: fcp?.startTime ?? null, lcp, domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : null, load: nav ? nav.loadEventEnd - nav.startTime : null, dataComplete: completeEntry?.startTime ?? null, resourceBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || entry.encodedBodySize || 0), 0), resourceCount: resources.length };
              })()` });
              cdp.off('Network.responseReceived', documentHandler);
              const value = measurement.result?.value;
              if (!complete || documentStatus !== 200 || value?.route !== route || value?.role !== role || value?.complete !== true) throw new Error(`Local fixture incomplete route=${route} role=${role} viewport=${viewport.name} state=${state}`);
              const runErrors = browserErrors.slice(errorStart);
              runs.push({ route, role, viewport: viewport.name, state, sample, status: documentStatus, ...value, browserErrors: runErrors });
            }
          }
        }
      }
    }
    const expectedRuns = TARGET_ROUTES.length * viewports.length * roles.length * 2 * 2;
    if (runs.length !== expectedRuns) throw new Error(`Expected ${expectedRuns} local samples, got ${runs.length}`);
    if (runs.some((run) => run.browserErrors.length > 0)) throw new Error(`Local performance fixture recorded browser/runtime/network errors: ${JSON.stringify(browserErrors.slice(0, 5))}`);
    const summary = {};
    for (const run of runs) {
      const key = `${run.route}|${run.viewport}|${run.role}|${run.state}`;
      if (!summary[key]) summary[key] = { route: run.route, viewport: run.viewport, role: run.role, state: run.state, sampleCount: 0, metrics: {} };
      const item = summary[key]; item.sampleCount += 1;
      for (const metric of ['ttfb', 'fcp', 'lcp', 'domContentLoaded', 'load', 'dataComplete', 'resourceBytes', 'resourceCount']) item.metrics[metric] = [...(item.metrics[metric] || []), run[metric]];
    }
    for (const item of Object.values(summary)) for (const [metric, values] of Object.entries(item.metrics)) item.metrics[metric] = summarizeValues(values);
    const candidateSha = process.env.KURABE_PERF_CANDIDATE_SHA || 'WORKTREE_BASE';
    const report = { schema: 'kurabe-performance-baseline/v1', provenance: { mode: 'local-fixture', target: 'loopback-only', candidateSha, browser: browserVersion, command: 'node scripts/verify-release.mjs --suite performance-baseline', routes: TARGET_ROUTES, viewports, roles, samplesPerPoint: 2, unauthorizedRouteSamples: 0 }, limitations: ['Synthetic local fixture is not authenticated production data.', 'live_browser=NOT_RUN_AUTH_REQUIRED', 'real_provider=NOT_RUN_NO_CREDENTIALS'], runs, summary: Object.values(summary) };
    if (process.env.KURABE_PERF_WRITE_REPORT !== '0') fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`LOCAL_PERF_PASS runs=${runs.length} routes=${TARGET_ROUTES.length} viewports=${viewports.length} roles=${roles.length} samples=2`);
    console.log(`LOCAL_PERF_REPORT ${REPORT_FILE}`);
  } finally {
    if (cdp) cdp.close();
    try { chrome.kill('SIGTERM'); } catch {}
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

(LOCAL_FIXTURE_MODE ? runLocalFixtureBenchmark() : runBenchmark()).catch((err) => {
  console.error('\nBenchmark Fatal Error:', err);
  process.exit(1);
});
