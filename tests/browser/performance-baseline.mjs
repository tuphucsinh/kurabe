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
  const env = { ...process.env, KURABE_BENCHMARK_MODE: 'actual-local', KURABE_PERF_CANDIDATE_SHA: candidateSha };
  for (const name of ['KURABE_BENCHMARK_BASE_URL', 'KURABE_BENCHMARK_EMPLOYEE_CODE']) delete env[name];
  const child = spawnSync(process.execPath, [path.join(rootDir, 'tests', 'perf', 'benchmark-harness.mjs')], {
    cwd: rootDir,
    env,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`local performance harness failed: ${child.stderr || child.stdout}`);
  assert.match(child.stdout, /ACTUAL_LOCAL_PERF_PASS runs=32 routes=3 viewports=2 manager=3-routes employee=denied-reports samples=2/);
  assert.equal(fs.existsSync(reportPath), true, 'local performance report must exist');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.schema, 'kurabe-performance-baseline/v1');
  assert.equal(report.provenance.mode, 'actual-local');
  assert.equal(report.provenance.target, 'loopback-owned-supabase-plus-private-next-production');
  assert.equal(report.provenance.candidateSha, candidateSha);
  assert.equal(report.provenance.liveBrowser, true);
  assert.equal(report.provenance.authenticated, true);
  assert.equal(report.provenance.deniedRouteSamples, 8);
  assert.equal(report.provenance.samplesPerPoint, 2);
  assert.equal(report.runs.length, 32);
  assert.equal(report.summary.length, 16);
  assert.equal(report.runs.some((run) => run.browserErrors.length > 0), false);
  for (const item of report.summary) {
    assert.equal(item.sampleCount, 2);
    for (const metric of ['ttfb', 'domContentLoaded', 'load', 'dataComplete', 'resourceBytes', 'resourceCount']) {
      assert.equal(typeof item.metrics[metric].value, 'number', `${item.route}/${item.viewport}/${item.role}/${item.state} ${metric}`);
    }
    for (const metric of ['fcp', 'lcp']) {
      assert.ok(item.metrics[metric].value === null || typeof item.metrics[metric].value === 'number', `${item.route}/${item.viewport}/${item.role}/${item.state} ${metric} must be numeric or explicit UNKNOWN`);
    }
  }
  return {
    real: true,
    passed: true,
    tier: 'actual-Next-browser',
    status: 'EXECUTED',
    authenticated: true,
    authenticatedCases: report.runs.length,
    target: 'loopback-owned Supabase-compatible runtime with private production Next build and real Chrome/CDP',
    live_browser: true,
    cases: [
      'authenticated real Chrome route/viewport matrix: 32 samples',
      'cold and warm cache samples: 2 per point',
      'TTFB/FCP/LCP/DOMContentLoaded/load/data-complete milestones',
      'FCP/LCP availability is recorded without fabricated fallback values',
      'request bytes/resource counts and spread >5% median rule',
      'browser/runtime/failed-resource errors: zero',
      'employee denied /reports route: 8 samples with rendered evaluation destination',
      'redacted report schema/provenance validated',
      'local stack ownership, seed identity, and cleanup readback validated',
    ],
  };
}
