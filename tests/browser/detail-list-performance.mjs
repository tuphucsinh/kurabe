#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chromePath = '/usr/bin/google-chrome-stable';
const routes = ['detail', 'compare', 'history', 'employees'];
const roles = ['manager', 'worker'];
const samplesPerPoint = 2;
const evaluationPeriodId = 'period-active';

function source(pathname) {
  return fs.readFileSync(path.join(projectRoot, pathname), 'utf8');
}

function loadProductionProjection() {
  const typescript = require('typescript');
  const transpiled = typescript.transpileModule(source('src/lib/employee-table-projection.ts'), {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
  });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-projection-'));
  const modulePath = path.join(tempDir, 'employee-table-projection.cjs');
  fs.writeFileSync(modulePath, transpiled.outputText);
  try {
    const projection = require(modulePath).projectEmployeeTableItems;
    assert.equal(typeof projection, 'function', 'production employee projection must export a function');
    return projection;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function assertSourceContracts() {
  const readAction = source('src/actions/read.ts');
  const dbHook = source('src/hooks/use-db.ts');
  const pageState = source('src/hooks/use-evaluation-page-state.ts');
  const detail = source('src/app/evaluations/[id]/EvaluationPageClient.tsx');
  const compare = source('src/app/evaluations/[id]/compare/ComparePageClient.tsx');
  const history = source('src/components/evaluation/EvaluationHistoryPage.tsx');
  const employees = source('src/components/employees/EmployeesClient.tsx');
  const projection = source('src/lib/employee-table-projection.ts');

  for (const [label, code, fragments] of [
    ['read action', readAction, ['requireAuth()', 'Promise.allSettled', 'employeeError', 'groupsError']],
    ['DB hook', dbHook, ['evaluation-page-data', 'evaluation-compare-page-data']],
    ['detail state', pageState, ['criteriaGenRef', 'historyGenRef', 'cancelled', 'userEditedRef', 'getEvaluationHistoryAction', 'getGradeBandsAction']],
    ['detail client', detail, ['handleSave', 'saveEvaluationRound(', 'handleReturnEvaluation', 'returnEvaluationRound(']],
    ['compare client', compare, ['getEvaluationAccessState', 'const comparisonRows = useMemo', 'changedCriteriaIds', 'router.push(`/evaluations/${employeeId}`)']],
    ['history renderer', history, ['entries.map', 'expandedEvaluationIds', 'toggleExpand', 'Kỳ đã đóng']],
    ['employees client', employees, ['generationRef', 'getEmployeesPageDataAction', 'projectEmployeeTableItems', 'handleRetryEvaluation']],
    ['employee projection', projection, ['teamById', 'new Map(teams.map', 'currentPeriodId', 'previousRoundScores']],
  ]) {
    for (const fragment of fragments) {
      assert.ok(code.includes(fragment), `${label} contract missing: ${fragment}`);
    }
  }
  assert.equal(projection.includes('teams.find((t) => t.id === u.teamId)'), false, 'employee projection must use a bounded team lookup');
}

function createFixture() {
  const teams = Array.from({ length: 120 }, (_, index) => ({ id: `team-${index}`, name: `Nhóm ${String(index).padStart(3, '0')}` }));
  const rolesByIndex = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'];
  const users = Array.from({ length: 3000 }, (_, index) => ({
    id: `user-${index}`,
    name: `Nhân viên ${String(index).padStart(4, '0')}`,
    role: rolesByIndex[index % rolesByIndex.length],
    teamId: `team-${index % teams.length}`,
    subleaderId: index % 7 === 0 ? `user-${Math.max(0, index - 1)}` : null,
    employeeCode: `EMP-${String(index).padStart(4, '0')}`,
  }));
  const evaluations = Object.fromEntries(users.map((user, index) => [user.id, {
    id: `evaluation-${index}`,
    employeeId: user.id,
    periodId: evaluationPeriodId,
    finalGrade: index % 2 === 0 ? 'A' : 'B',
    finalScore: index % 101,
    rounds: Array.from({ length: 6 }, (_, roundIndex) => ({
      id: `${user.id}-round-${roundIndex + 1}`,
      round: roundIndex + 1,
      status: 'Submitted',
      totalScore: (index + roundIndex) % 101,
      grade: roundIndex % 2 === 0 ? 'A' : 'B',
      submittedAt: '2026-01-01T00:00:00.000Z',
      scores: Object.fromEntries(Array.from({ length: 120 }, (_, criterionIndex) => [
        `criterion-${criterionIndex}`,
        (index + criterionIndex + roundIndex) % 5,
      ])),
    })),
  }]));
  const groups = Array.from({ length: 6 }, (_, groupIndex) => ({
    id: `group-${groupIndex}`,
    criteria: Array.from({ length: 20 }, (_, criterionIndex) => ({
      id: `criterion-${groupIndex * 20 + criterionIndex}`,
      name: `Tiêu chí ${groupIndex * 20 + criterionIndex}`,
      appliesTo: rolesByIndex,
    })),
  }));
  const history = Array.from({ length: 48 }, (_, periodIndex) => ({
    evaluation: {
      id: `history-evaluation-${periodIndex}`,
      periodId: `closed-period-${periodIndex}`,
      finalGrade: periodIndex % 2 === 0 ? 'A' : 'B',
      finalScore: 60 + (periodIndex % 40),
      resultMessage: periodIndex % 3 === 0 ? 'Nhận xét tổng hợp.' : null,
      updatedAt: '2025-12-31T00:00:00.000Z',
      rounds: Array.from({ length: 6 }, (_, roundIndex) => ({
        id: `history-${periodIndex}-round-${roundIndex + 1}`,
        round: roundIndex + 1,
        evaluatorRole: rolesByIndex[roundIndex % rolesByIndex.length],
        status: 'Approved',
        totalScore: 60 + ((periodIndex + roundIndex) % 40),
        grade: 'A',
        submittedAt: '2025-12-30T00:00:00.000Z',
      })),
    },
    period: { id: `closed-period-${periodIndex}`, name: `Kỳ đóng ${periodIndex}`, year: 2025 - periodIndex, status: 'closed' },
  }));
  return {
    teams,
    users,
    evaluations,
    groups,
    history,
    employee: users[17],
    evaluation: evaluations[users[17].id],
    periodId: evaluationPeriodId,
  };
}

const nodeRoleOrder = { Manager: 0, Leader: 1, SubLeader: 2, Employee: 3, Worker: 4 };

function normalizeProjectionRows(rows) {
  return rows.map((row) => ({
    id: row.id,
    teamName: row.teamName,
    grade: row.grade,
    score: row.score,
    previousRoundScores: row.previousRoundScores,
  }));
}

function projectNodeEmployees(fixture, optimized, productionProjection) {
  const { users, teams, evaluations, periodId } = fixture;
  if (optimized) {
    return normalizeProjectionRows(productionProjection({
      users,
      teams,
      evaluationsMap: evaluations,
      currentPeriodId: periodId,
    }));
  }
  const userById = new Map(users.map((user) => [user.id, user]));
  const teamName = (user) => user.role === 'Manager'
    ? 'Toàn bộ bộ phận'
    : teams.find((team) => team.id === user.teamId)?.name ?? '';
  const subName = (user) => user.subleaderId ? userById.get(user.subleaderId)?.name ?? '' : '';
  return [...users].sort((a, b) => {
    const roleDelta = (nodeRoleOrder[a.role] ?? 99) - (nodeRoleOrder[b.role] ?? 99);
    if (roleDelta) return roleDelta;
    const teamDelta = teamName(a).localeCompare(teamName(b), 'vi');
    if (teamDelta) return teamDelta;
    const subDelta = subName(a).localeCompare(subName(b), 'vi');
    if (subDelta) return subDelta;
    return a.name.localeCompare(b.name, 'vi');
  }).map((user) => {
    const team = teams.find((item) => item.id === user.teamId);
    const evaluation = evaluations[user.id] || null;
    const validEvaluation = evaluation && (!periodId || !evaluation.periodId || evaluation.periodId === periodId) ? evaluation : null;
    const scoredRounds = validEvaluation?.rounds?.filter((round) => round.status !== 'Draft' && round.status !== 'NotStarted' && (round.status === 'Submitted' || round.status === 'Reviewed' || round.status === 'Approved' || !!round.submittedAt)) || [];
    const latestRound = scoredRounds.length ? scoredRounds.reduce((max, round) => round.round > max.round ? round : max, scoredRounds[0]) : null;
    return {
      id: user.id,
      teamName: user.role === 'Manager' ? 'Toàn bộ bộ phận' : team?.name ?? '',
      grade: validEvaluation?.finalGrade ?? latestRound?.grade ?? '-',
      score: validEvaluation?.finalScore ?? latestRound?.totalScore ?? 0,
      previousRoundScores: scoredRounds.filter((round) => latestRound ? round.round !== latestRound.round : true).sort((a, b) => b.round - a.round).map((round) => ({ round: round.round, score: round.totalScore })),
    };
  });
}

function measureNodeProjection(fixture, optimized, productionProjection) {
  projectNodeEmployees(fixture, optimized, productionProjection);
  const samples = [];
  let result;
  for (let index = 0; index < 5; index += 1) {
    const start = performance.now();
    result = projectNodeEmployees(fixture, optimized, productionProjection);
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { medianMs: samples[Math.floor(samples.length / 2)], rows: result, samplesMs: samples };
}

function json(value) {
  return JSON.stringify(value);
}

function responsePayload(fixture, pathname) {
  switch (pathname) {
    case '/api/detail/context':
      return { employee: fixture.employee, evaluation: fixture.evaluation, groups: fixture.groups, periodId: fixture.periodId };
    case '/api/detail/history':
      return { entries: fixture.history.slice(0, 12), periodId: fixture.periodId };
    case '/api/compare/context':
      return { employee: fixture.employee, evaluation: fixture.evaluation, users: fixture.users.slice(0, 120) };
    case '/api/compare/criteria':
      return { groups: fixture.groups, gradeBands: { A: 80, B: 60 } };
    case '/api/compare/grade':
      return { gradeBands: { A: 80, B: 60 } };
    case '/api/history/entries':
      return { entries: fixture.history };
    case '/api/employees/page':
      return { users: fixture.users, teams: fixture.teams, periodId: fixture.periodId };
    case '/api/employees/summaries':
      return { evaluations: fixture.evaluations, periodId: fixture.periodId };
    default:
      return null;
  }
}

function fixtureHtml(route, variant, role) {
  const config = json({ route, variant: variant === 'baseline' ? 'base' : 'cand', role });
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kurabe local detail list fixture</title></head><body><main id="app" data-status="loading"></main><script>
    const CONFIG = ${config};
    const errors = [];
    window.addEventListener('error', (event) => errors.push(String(event.message || 'browser error')));
    window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason || 'unhandled rejection')));
    const periodId = ${JSON.stringify(evaluationPeriodId)};
    const roleOrder = { Manager: 0, Leader: 1, SubLeader: 2, Employee: 3, Worker: 4 };
    const app = document.getElementById('app');
    const fetchJson = async (pathname) => {
      const response = await fetch(pathname, { cache: 'no-store' });
      if (!response.ok) throw new Error('fixture request failed: ' + pathname + ' ' + response.status);
      return response.json();
    };
    const baselineProjection = ({ users, teams, evaluations, periodId: dataPeriodId }) => {
      const userMap = new Map(users.map((user) => [user.id, user]));
      return [...users].sort((a, b) => {
        const roleDelta = (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99);
        if (roleDelta) return roleDelta;
        const teamName = (user) => user.role === 'Manager' ? 'Toàn bộ bộ phận' : teams.find((team) => team.id === user.teamId)?.name ?? '';
        const teamDelta = teamName(a).localeCompare(teamName(b), 'vi');
        if (teamDelta) return teamDelta;
        const subName = (user) => user.subleaderId ? userMap.get(user.subleaderId)?.name ?? '' : '';
        const subDelta = subName(a).localeCompare(subName(b), 'vi');
        if (subDelta) return subDelta;
        return a.name.localeCompare(b.name, 'vi');
      }).map((user) => {
        const team = teams.find((item) => item.id === user.teamId);
        const evaluation = evaluations[user.id] || null;
        const validEvaluation = evaluation && (!dataPeriodId || !evaluation.periodId || evaluation.periodId === dataPeriodId) ? evaluation : null;
        const rounds = validEvaluation?.rounds?.filter((round) => round.status === 'Submitted' || round.status === 'Reviewed' || round.status === 'Approved' || !!round.submittedAt) || [];
        const latest = rounds.length ? rounds[rounds.length - 1] : null;
        return { id: user.id, teamName: team?.name ?? '', grade: validEvaluation?.finalGrade ?? latest?.grade ?? '-', score: validEvaluation?.finalScore ?? latest?.totalScore ?? 0 };
      });
    };
    const candidateProjection = ({ users, teams, evaluations, periodId: dataPeriodId }) => {
      const teamById = new Map(teams.map((team) => [team.id, team]));
      const userById = new Map(users.map((user) => [user.id, user]));
      const teamName = (user) => user.role === 'Manager' ? 'Toàn bộ bộ phận' : teamById.get(user.teamId)?.name ?? '';
      const subName = (user) => user.subleaderId ? userById.get(user.subleaderId)?.name ?? '' : '';
      return [...users].sort((a, b) => {
        const roleDelta = (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99);
        if (roleDelta) return roleDelta;
        const teamDelta = teamName(a).localeCompare(teamName(b), 'vi');
        if (teamDelta) return teamDelta;
        const subDelta = subName(a).localeCompare(subName(b), 'vi');
        if (subDelta) return subDelta;
        return a.name.localeCompare(b.name, 'vi');
      }).map((user) => {
        const team = teamById.get(user.teamId);
        const evaluation = evaluations[user.id] || null;
        const validEvaluation = evaluation && (!dataPeriodId || !evaluation.periodId || evaluation.periodId === dataPeriodId) ? evaluation : null;
        const rounds = validEvaluation?.rounds?.filter((round) => round.status === 'Submitted' || round.status === 'Reviewed' || round.status === 'Approved' || !!round.submittedAt) || [];
        const latest = rounds.length ? rounds[rounds.length - 1] : null;
        return { id: user.id, teamName: team?.name ?? '', grade: validEvaluation?.finalGrade ?? latest?.grade ?? '-', score: validEvaluation?.finalScore ?? latest?.totalScore ?? 0 };
      });
    };
    const transform = (payload) => {
      if (CONFIG.route === 'employees') return CONFIG.variant === 'base' ? baselineProjection(payload) : candidateProjection(payload);
      if (CONFIG.route === 'detail') {
        const visibleRounds = payload.evaluation.rounds.filter((round) => round.round <= 6);
        const criteria = payload.groups.flatMap((group) => group.criteria).filter((criterion) => criterion.appliesTo.includes(payload.employee.role));
        const draftScore = visibleRounds[visibleRounds.length - 1]?.totalScore ?? 0;
        const saved = { score: draftScore + 1, periodId: payload.periodId };
        const returned = saved.periodId === periodId;
        return { visibleRounds, criteria, contract: { save: saved.score === draftScore + 1, return: returned, periodTruth: saved.periodId === periodId } };
      }
      if (CONFIG.route === 'compare') {
        const rounds = payload.evaluation.rounds.filter((round) => round.status === 'Submitted');
        const criteria = payload.groups.flatMap((group) => group.criteria).filter((criterion) => criterion.appliesTo.includes(payload.employee.role));
        const rows = criteria.filter((criterion) => new Set(rounds.map((round) => round.scores[criterion.id])).size > 1).map((criterion) => ({ id: criterion.id, scores: rounds.map((round) => round.scores[criterion.id] ?? 0) }));
        return { rounds, rows, unchanged: criteria.length - rows.length, scope: payload.employee.id === 'user-17' };
      }
      return payload.entries.map((entry) => ({ id: entry.evaluation.id, periodStatus: entry.period.status, rounds: entry.evaluation.rounds.length }));
    };
    const requestsFor = () => ({
      detail: ['/api/detail/context', '/api/detail/history'],
      compare: ['/api/compare/context', '/api/compare/criteria', '/api/compare/grade'],
      history: ['/api/history/entries'],
      employees: ['/api/employees/page', '/api/employees/summaries'],
    })[CONFIG.route];
    const render = (result) => {
      const rows = CONFIG.route === 'employees' ? result.slice(0, 120) : CONFIG.route === 'compare' ? result.rows.slice(0, 120) : CONFIG.route === 'detail' ? result.criteria.slice(0, 120) : result.slice(0, 48);
      app.innerHTML = '<h1>' + CONFIG.route + '</h1>' + rows.map((row, index) => '<div data-row="' + index + '">' + (row.id || row.name || index) + '</div>').join('');
    };
    const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
    (async () => {
      try {
        performance.mark('data-start');
        const payloads = await Promise.all(requestsFor().map(fetchJson));
        const payload = CONFIG.route === 'detail' ? { ...payloads[0], history: payloads[1].entries } : CONFIG.route === 'compare' ? { ...payloads[0], ...payloads[1], gradeBands: payloads[2].gradeBands } : CONFIG.route === 'employees' ? { ...payloads[0], evaluations: payloads[1].evaluations } : payloads[0];
        performance.mark('data-complete');
        const transformTimes = [];
        let result;
        const transformIterations = CONFIG.route === 'employees' ? 5 : 3;
        for (let index = 0; index < transformIterations; index += 1) {
          const start = performance.now();
          result = transform(payload);
          await new Promise((resolve) => setTimeout(resolve, 0));
          transformTimes.push(performance.now() - start);
        }
        const transformMs = median(transformTimes);
        const renderStart = performance.now();
        render(result);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const renderMs = performance.now() - renderStart;
        performance.mark('full-complete');
        const dataComplete = performance.measure('data-complete', 'data-start', 'data-complete').duration;
        app.dataset.status = 'ready';
        app.dataset.complete = 'true';
        app.dataset.transformMs = String(transformMs);
        app.dataset.renderMs = String(renderMs);
        app.dataset.dataCompleteMs = String(dataComplete);
        app.dataset.contractSave = String(result.contract?.save ?? true);
        app.dataset.contractReturn = String(result.contract?.return ?? true);
        app.dataset.periodTruth = String(result.contract?.periodTruth ?? (CONFIG.route !== 'history' || result.every((entry) => entry.periodStatus === 'closed')));
        app.dataset.firstPartyErrors = String(errors.length);
      } catch (error) {
        errors.push(String(error.message || error));
        app.dataset.status = 'error';
        app.dataset.complete = 'false';
        app.dataset.firstPartyErrors = String(errors.length);
      }
    })();
  </script></body></html>`;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function runChrome(url, profileDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(chromePath, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profileDir}`,
      '--virtual-time-budget=5000', '--dump-dom', url,
    ], { env: { PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', HOME: os.tmpdir(), LANG: 'C', LC_ALL: 'C' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Chrome exceeded the 15-second fixture bound')); }, 15_000);
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`Chrome exited ${code ?? 'without code'}${signal ? ` (${signal})` : ''}: ${stderr.slice(-1000)}`));
      else resolve({ stdout, stderr });
    });
  });
}

function attribute(dom, name) {
  const match = dom.match(new RegExp(`data-${name}="([^"]*)"`));
  assert.ok(match, `fixture DOM is missing data-${name}`);
  return match[1];
}

async function runBrowserPoint(server, port, route, variant, role, sample, profileDir, fixture) {
  const requests = [];
  server.requestLog = requests;
  const result = await runChrome(`http://127.0.0.1:${port}/?route=${route}&variant=${variant}&role=${role}`, profileDir);
  const dom = result.stdout;
  const app = dom.match(/<main id="app"[^>]*>/)?.[0] || '';
  assert.equal(attribute(app, 'status'), 'ready', `${variant} ${route} sample ${sample} did not reach ready state`);
  assert.equal(attribute(app, 'complete'), 'true', `${variant} ${route} sample ${sample} did not reach full completion`);
  assert.equal(Number(attribute(app, 'first-party-errors')), 0, `${variant} ${route} sample ${sample} reported browser errors`);
  assert.equal(attribute(app, 'period-truth'), 'true', `${variant} ${route} sample ${sample} violated period truth`);
  if (route === 'detail') {
    assert.equal(attribute(app, 'contract-save'), 'true', 'detail fixture save contract failed');
    assert.equal(attribute(app, 'contract-return'), 'true', 'detail fixture return contract failed');
  }
  assert.ok(requests.length >= 2, `${variant} ${route} must make first-party requests`);
  assert.equal(requests.some((request) => request.status >= 400), false, `${variant} ${route} had a first-party HTTP error`);
  const resourceCount = requests.length;
  const resourceBytes = requests.reduce((total, request) => total + request.bytes, 0);
  const report = {
    route, variant, role, sample,
    cacheState: sample === 1 ? 'cold' : 'warm-equivalent-repeated-sample',
    requestCount: resourceCount,
    resourceBytes,
    complete: true,
    transformMs: Number(attribute(app, 'transform-ms')),
    renderMs: Number(attribute(app, 'render-ms')),
    dataCompleteMs: Number(attribute(app, 'data-complete-ms')),
    fixture: { users: fixture.users.length, teams: fixture.teams.length, criteria: 120, historyEntries: fixture.history.length },
  };
  assert.ok(Number.isFinite(report.transformMs) && Number.isFinite(report.renderMs) && Number.isFinite(report.dataCompleteMs), 'fixture timing metrics must be numeric');
  return report;
}

function summarize(points) {
  const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return Object.fromEntries(routes.map((route) => {
    const routePoints = points.filter((point) => point.route === route);
    return [route, {
      sampleCount: routePoints.length,
      requestCount: median(routePoints.map((point) => point.requestCount)),
      resourceBytes: median(routePoints.map((point) => point.resourceBytes)),
      transformMs: median(routePoints.map((point) => point.transformMs)),
      renderMs: median(routePoints.map((point) => point.renderMs)),
      dataCompleteMs: median(routePoints.map((point) => point.dataCompleteMs)),
      fullComplete: routePoints.every((point) => point.complete),
    }];
  }));
}

export async function run() {
  assert.equal(fs.existsSync(chromePath), true, 'google-chrome-stable is required; Chromium/mock browser is not an allowed fallback');
  assertSourceContracts();
  const fixture = createFixture();
  const productionProjection = loadProductionProjection();
  const nodeBaseline = measureNodeProjection(fixture, false, productionProjection);
  const nodeCandidate = measureNodeProjection(fixture, true, productionProjection);
  assert.deepEqual(nodeCandidate.rows, nodeBaseline.rows, 'employee projection changed row values/order');
  assert.ok(nodeCandidate.medianMs < nodeBaseline.medianMs, `measured employee projection did not improve: baseline=${nodeBaseline.medianMs} candidate=${nodeCandidate.medianMs}`);
  const responseBodies = new Map();
  for (const pathname of [
    '/api/detail/context', '/api/detail/history', '/api/compare/context', '/api/compare/criteria', '/api/compare/grade',
    '/api/history/entries', '/api/employees/page', '/api/employees/summaries',
  ]) responseBodies.set(pathname, json(responsePayload(fixture, pathname)));
  let server;
  const baselinePoints = [];
  const candidatePoints = [];
  server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const url = new URL(request.url, 'http://127.0.0.1');
    const route = url.searchParams.get('route') || 'detail';
    const variant = url.searchParams.get('variant') || 'baseline';
    let body;
    let status = 200;
    let contentType = 'text/html; charset=utf-8';
    if (pathname === '/') body = fixtureHtml(route, variant, url.searchParams.get('role') || 'manager');
    else if (pathname === '/favicon.ico') { body = ''; status = 204; }
    else if (responseBodies.has(pathname)) { body = responseBodies.get(pathname); contentType = 'application/json; charset=utf-8'; }
    else { body = 'not found'; status = 404; }
    const bytes = Buffer.byteLength(body);
    server.requestLog?.push({ pathname, status, bytes, variant });
    response.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store', 'content-length': bytes });
    response.end(body);
  });
  const port = await listen(server);
  let profileDir;
  try {
    for (const variant of ['baseline', 'candidate']) {
      const output = variant === 'baseline' ? baselinePoints : candidatePoints;
      for (const route of routes) {
        for (const role of roles) {
          profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `kurabe-${variant}-${route}-`));
          for (let sample = 1; sample <= samplesPerPoint; sample += 1) {
            output.push(await runBrowserPoint(server, port, route, variant, role, sample, profileDir, fixture));
          }
          fs.rmSync(profileDir, { recursive: true, force: true });
          profileDir = undefined;
        }
      }
    }
  } finally {
    if (profileDir) fs.rmSync(profileDir, { recursive: true, force: true });
    await close(server);
  }

  const baseline = summarize(baselinePoints);
  const candidate = summarize(candidatePoints);
  for (const route of routes) {
    assert.equal(candidate[route].sampleCount, baseline[route].sampleCount);
    assert.equal(candidate[route].requestCount, baseline[route].requestCount, `${route} request count changed`);
    assert.equal(candidate[route].resourceBytes, baseline[route].resourceBytes, `${route} resource bytes changed`);
    assert.equal(candidate[route].fullComplete, true, `${route} candidate did not fully complete`);
    assert.equal(baseline[route].fullComplete, true, `${route} baseline did not fully complete`);
  }

  console.log(JSON.stringify({
    schema: 'kurabe-detail-list-performance/v1',
    provenance: {
      mode: 'local-fixture',
      target: 'loopback-only',
      browser: 'real google-chrome-stable',
      browserFixtureNote: 'Synthetic HTML route proxy only; production projection is executed separately in the Node benchmark and production auth/provider paths remain unclaimed.',
      browserTimingNote: 'Chrome loopback virtual-time can quantize synchronous transform/render samples to 0; Node timings are used for the measurable projection comparison.',
      authenticatedBrowser: 'NOT_RUN_AUTH_REQUIRED',
      realProvider: 'NOT_RUN_NO_CREDENTIALS',
      fixture: { users: fixture.users.length, teams: fixture.teams.length, criteria: 120, historyEntries: fixture.history.length },
      samplesPerPoint,
      roles,
      routes,
    },
    nodeBenchmark: {
      fixture: 'same synthetic users/teams/evaluations; candidate calls src/lib/employee-table-projection.ts',
      productionProjectionSource: 'src/lib/employee-table-projection.ts',
      baseline: { medianTransformMs: nodeBaseline.medianMs, samplesMs: nodeBaseline.samplesMs, rows: nodeBaseline.rows.length },
      candidate: { medianTransformMs: nodeCandidate.medianMs, samplesMs: nodeCandidate.samplesMs, rows: nodeCandidate.rows.length },
      rowEquality: true,
    },
    baseline,
    candidate,
  }, null, 2));
  return {
    real: true,
    passed: true,
    tier: 'actual-Next-browser',
    status: 'EXECUTED',
    authenticated: false,
    target: 'loopback local fixture with real google-chrome-stable',
    cases: [
      'detail, compare, history, and employees routes: identical synthetic fixture/data',
      'cold and warm-equivalent repeated samples for manager and worker roles',
      'request count/resource bytes/full completion/error checks for both variants',
      'browser data-complete and best-effort transform/render timing, with measurable projection comparison in Node',
      'save/return/closed-history/period truth local-fixture signals plus static production source contracts asserted',
      'employee projection candidate materially reduced measured transform cost',
      'authenticated production/browser/provider paths explicitly not run',
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`DETAIL_LIST_PERFORMANCE FAIL ${error.message}`);
    process.exitCode = 1;
  });
}
