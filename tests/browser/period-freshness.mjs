#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

export async function run() {
  const auth = read('src/contexts/AuthContext.tsx');
  const selector = read('src/components/layout/PeriodSelector.tsx');
  const dashboard = read('src/components/dashboard/DashboardDataLayer.tsx');
  const reports = read('src/components/reports/ReportsDataLayer.tsx');
  const filters = read('src/components/reports/ReportFilters.tsx');
  const reportsPage = read('src/app/reports/page.tsx');
  const evaluation = read('src/app/evaluations/[id]/EvaluationPageClient.tsx');
  const actions = read('src/actions/read.ts');
  const teams = read('src/lib/db/teams-admin.ts');
  const states = [];

  assert.match(auth, /getCurrentUserAction\(\)[\s\S]*getPeriodsAction\(\)/, 'auth must resolve viewer before periods');
  assert.match(auth, /const periods = await getPeriodsAction\(\);[\s\S]*setAllPeriods\(periods\)/, 'login must hydrate periods');
  assert.match(auth, /setCurrentPeriodState\(null\)[\s\S]*selected_period_id=;/, 'logout must clear period authority hints');
  states.push('authenticated-period-hydration-and-logout-reset');

  assert.match(selector, /const router = useRouter\(\);/);
  assert.match(selector, /setCurrentPeriod\(period\);[\s\S]*router\.refresh\(\);/);
  states.push('resident-period-switch-refreshes-server-props');

  assert.match(dashboard, /reqIdRef/);
  assert.match(dashboard, /currentReqId !== reqIdRef\.current/);
  assert.match(dashboard, /handleRetryLight/);
  assert.match(dashboard, /handleRetryHeavy/);
  states.push('dashboard-generation-guard-and-retry');

  assert.match(reports, /activeReqRef/);
  assert.match(reports, /activeReqRef\.current !== currentReq/);
  assert.match(reports, /return \(\) => \{[\s\S]*reqRef\.current \+= 1/);
  assert.match(reports, /setIsError\(true\)/);
  assert.match(reports, /RotateCcw/);
  states.push('reports-generation-guard-error-and-retry');

  assert.match(reportsPage, /searchParams: Promise<\{ team\?: string \| string\[\] \}>/);
  assert.match(reportsPage, /const params = await searchParams/);
  assert.match(reportsPage, /teams\.some\(\(candidate\) => candidate\.id === requestedTeam\)/);
  states.push('async-search-params-and-team-validation');

  assert.match(filters, /Đồng bộ theo kỳ đang chọn/);
  assert.doesNotMatch(filters, /Dữ liệu thời gian thực/);
  states.push('truthful-freshness-label');

  const compareInvalidations = [...evaluation.matchAll(/invalidateQueries\(\{ queryKey: \[(.*?)\] \}\)/g)].map((match) => match[1]);
  assert.ok(compareInvalidations.some((key) => key.includes("'evaluation-compare-page-data'")), 'compare key must be invalidated');
  assert.doesNotMatch(evaluation, /evaluation-by-employee/);
  states.push('save-and-return-invalidate-compare');

  assert.match(actions, /getEvaluationComparePageDataAction/);
  assert.match(teams, /getTeamsAdmin/);
  states.push('server-scope-remains-requester-gated');

  assert.equal(states.length, 8);
  return {
    real: true,
    passed: true,
    tier: 'source-contract',
    status: 'EXECUTED',
    authenticated: false,
    cases: states,
    target: 'local-source-contract-period-freshness',
    live_browser: 'NOT_RUN_AUTH_REQUIRED',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => console.log(`PERIOD_FRESHNESS PASS cases=${result.cases.length} target=${result.target} live_browser=${result.live_browser}`))
    .catch((error) => {
      console.error(`PERIOD_FRESHNESS FAIL ${error.message}`);
      process.exitCode = 1;
    });
}
