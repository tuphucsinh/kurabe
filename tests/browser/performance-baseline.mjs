#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

function gitHead(rootDir) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`could not resolve candidate SHA: ${result.stderr}`);
  return result.stdout.trim();
}

export function run({ rootDir }) {
  const candidateSha = process.env.KURABE_PERF_CANDIDATE_SHA || gitHead(rootDir);
  const reportPath = path.join(rootDir, 'tests', 'perf', 'perf-report.json');
  const env = { ...process.env, KURABE_BENCHMARK_MODE: 'local-fixture', KURABE_PERF_CANDIDATE_SHA: candidateSha };
  for (const name of ['KURABE_BENCHMARK_BASE_URL', 'KURABE_BENCHMARK_EMPLOYEE_CODE', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete env[name];
  const child = spawnSync(process.execPath, [path.join(rootDir, 'tests', 'perf', 'benchmark-harness.mjs')], {
    cwd: rootDir,
    env,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`local performance harness failed: ${child.stderr || child.stdout}`);
  assert.match(child.stdout, /LOCAL_PERF_PASS runs=48 routes=3 viewports=2 roles=2 samples=2/);
  assert.equal(fs.existsSync(reportPath), true, 'local performance report must exist');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.schema, 'kurabe-performance-baseline/v1');
  assert.equal(report.provenance.mode, 'local-fixture');
  assert.equal(report.provenance.target, 'loopback-only');
  assert.equal(report.provenance.candidateSha, candidateSha);
  assert.equal(report.provenance.unauthorizedRouteSamples, 0);
  assert.equal(report.provenance.samplesPerPoint, 2);
  assert.equal(report.runs.length, 48);
  assert.equal(report.summary.length, 24);
  assert.equal(report.runs.some((run) => run.browserErrors.length > 0), false);
  for (const item of report.summary) {
    assert.equal(item.sampleCount, 2);
    for (const metric of ['ttfb', 'fcp', 'lcp', 'domContentLoaded', 'load', 'dataComplete', 'resourceBytes', 'resourceCount']) {
      assert.equal(typeof item.metrics[metric].value, 'number', `${item.route}/${item.viewport}/${item.role}/${item.state} ${metric}`);
    }
  }
  return {
    real: true,
    passed: true,
    target: 'loopback local fixture with real google-chrome-stable/CDP',
    live_browser: 'NOT_RUN_AUTH_REQUIRED',
    real_provider: 'NOT_RUN_NO_CREDENTIALS',
    cases: [
      'real Chrome route/viewport/role matrix: 48 samples',
      'cold and warm cache samples: 2 per point',
      'TTFB/FCP/LCP/DOMContentLoaded/load/data-complete milestones',
      'request bytes/resource counts and spread >5% median rule',
      'browser/runtime/failed-resource errors: zero',
      'unauthorized-route samples: zero',
      'redacted report schema/provenance validated',
      'authenticated live flows explicitly not run',
    ],
  };
}
