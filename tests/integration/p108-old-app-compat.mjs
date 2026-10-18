#!/usr/bin/env node
/**
 * Kurabe Task P108M1T10 — Old-App Compatibility Matrix & Regression Integration Suite
 *
 * Verifies:
 * S1: Old app + old schema + legacy catalog (baseline worktree confirmation runtime).
 *     Records GOLDEN numbers (reports, history, final scores) into evidence.
 * S2: Old app + NEW schema (candidate runtime with KURABE_CI_APP_ROOT=baseline).
 *     Full baseline UI/server actions (Draft -> Submit -> Return -> Approved).
 *     Reports match S1 golden. Criteria save rejected with ZERO DB mutation.
 * S3: NEW app + new schema + LEGACY catalog (no import).
 *     Flows pass, /criteria read-only. Import (T04) then revert-import (a) via
 *     documented SQL. Legacy flows pass and report numbers equal golden.
 * S4: NEW app + new schema + P108 3-set catalog.
 *     Asserts 18 groups / 93 criteria. Legacy history and golden numbers unchanged.
 * Isolated Builds:
 *     `npm run build` of BASELINE and candidate sequentially with placeholder env.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const candidateRoot = path.resolve(moduleDir, '../..');
const baselineExpectedSha = '701256ec222eb3e0cb0bdbbefd0041ce698a0e49';

const REQUIRED_CASES = [
  'preflight-baseline-worktree-clean-and-head-verified',
  'build-baseline-worktree-success',
  'build-candidate-worktree-success',
  's1-baseline-runtime-started-and-bootstrapped',
  's1-baseline-golden-report-aggregates-recorded',
  's1-baseline-golden-history-recorded',
  's1-baseline-runtime-cleaned',
  's2-old-app-new-schema-runtime-started-and-bootstrapped',
  's2-old-app-new-schema-login-manager-and-leader',
  's2-old-app-new-schema-evaluation-draft-submit-return-approved',
  's2-old-app-new-schema-history-matches-golden',
  's2-old-app-new-schema-reports-match-golden',
  's2-old-app-new-schema-export-projection-matches-golden',
  's2-old-app-new-schema-criteria-save-rejected-zero-mutation',
  's2-old-app-new-schema-runtime-cleaned',
  's3-new-app-legacy-catalog-runtime-started-and-bootstrapped',
  's3-new-app-legacy-catalog-login-and-evaluation-flow',
  's3-new-app-legacy-catalog-history-and-reports-match-golden',
  's3-new-app-legacy-catalog-criteria-page-read-only-ui-and-sql',
  's3-new-app-legacy-catalog-import-applied',
  's3-new-app-legacy-catalog-revert-import-a-executed',
  's3-new-app-legacy-catalog-post-revert-flows-and-golden-match',
  's3-new-app-legacy-catalog-runtime-cleaned',
  's3-cleanup-restores-tracked-agents-drift',
  's4-new-app-p108-sets-runtime-started-and-bootstrapped',
  's4-new-app-p108-sets-import-18-groups-93-criteria',
  's4-new-app-p108-sets-legacy-history-and-reports-golden-unchanged',
  's4-new-app-p108-sets-runtime-cleaned',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let evidencePath = path.join(candidateRoot, '.tmp/p108-old-app-compat-evidence.json');
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--evidence' && args[i + 1]) {
      evidencePath = path.resolve(args[++i]);
    }
  }
  return { evidencePath };
}

function redact(text) {
  return String(text || '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(\b(?:POSTGRES_PASSWORD|PGPASSWORD|password|secret|key|service_role|token)\b\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,"';]+)/gi, '$1[redacted]')
    .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]*/g, '[REDACTED_JWT]');
}

function hashString(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function runGit(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function restoreRootDrift(root) {
  try {
    const status = runGit(['status', '--porcelain=v1', '--untracked-files=all'], root);
    // runGit() trims the whole output, which eats the leading status column of the first line: take the last field instead of slice(3).
    const drifted = status.split('\n').map((l) => l.trim().split(/\s+/).pop()).filter((p) => p === 'AGENTS.md' || p === 'CLAUDE.md');
    if (drifted.length > 0) runGit(['checkout', '--', ...drifted], root);
  } catch {}
}

function runPsql(dbTarget, sql) {
  const res = spawnSync('psql', [
    '-X', '-h', dbTarget.host, '-p', String(dbTarget.port), '-U', dbTarget.user, '-d', dbTarget.database,
    '-qAt', '-v', 'ON_ERROR_STOP=1',
  ], {
    cwd: candidateRoot,
    input: sql,
    env: { ...process.env, PGPASSWORD: dbTarget.password, PGPASSFILE: '/dev/null' },
    encoding: 'utf8',
    timeout: 30000,
  });
  if (res.status !== 0) throw new Error(`psql error: ${redact(res.stderr || res.stdout)}`);
  return String(res.stdout || '').trim();
}

const CRITERIA_TABLES = [
  'criteria_groups',
  'criteria',
  'criterion_levels',
  'criterion_audiences',
  'criteria_config_versions',
  'criteria_group_versions',
  'criterion_versions',
  'criterion_level_versions',
  'criterion_audience_versions',
];

function criteriaDigest(dbTarget) {
  const parts = [];
  for (const tbl of CRITERIA_TABLES) {
    const res = runPsql(dbTarget, `
      SELECT COALESCE(string_agg(row_data, E'\\n' ORDER BY row_data), '') FROM (
        SELECT md5(t::text) AS row_data FROM public.${tbl} t
      ) s;
    `);
    parts.push(`tbl:${tbl}=${res}`);
  }
  return hashString(parts.join('\n'));
}

function prepareDbUsers(dbTarget) {
  runPsql(dbTarget, `
    UPDATE public.users SET is_active = true, password_hash = NULL;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_setup_required') THEN
        UPDATE public.users SET password_setup_required = false;
      END IF;
    END $$;
    UPDATE public.users SET subleader_id = (SELECT id FROM public.users WHERE employee_code = 'P103-SLB' LIMIT 1)
      WHERE employee_code IN ('P103-EMB', 'P103-WKB');
  `);
}

function queryFixturePointers(dbTarget) {
  const managerId = runPsql(dbTarget, "SELECT id FROM public.users WHERE employee_code = 'P103-MGR' LIMIT 1;");
  const leaderAId = runPsql(dbTarget, "SELECT id FROM public.users WHERE employee_code = 'P103-LDA' LIMIT 1;");
  const subleaderBId = runPsql(dbTarget, "SELECT id FROM public.users WHERE employee_code = 'P103-SLB' LIMIT 1;");
  const employeeBId = runPsql(dbTarget, "SELECT id FROM public.users WHERE employee_code = 'P103-EMB' LIMIT 1;");
  const workerBId = runPsql(dbTarget, "SELECT id FROM public.users WHERE employee_code = 'P103-WKB' LIMIT 1;");
  const closedPeriodId = runPsql(dbTarget, "SELECT id FROM public.evaluation_periods WHERE year = 2098 LIMIT 1;");
  const activePeriodId = runPsql(dbTarget, "SELECT id FROM public.evaluation_periods WHERE year = 2099 LIMIT 1;");
  const closedEvalId = runPsql(dbTarget, `SELECT id FROM public.evaluations WHERE period_id = '${closedPeriodId}' AND employee_id = '${employeeBId}' LIMIT 1;`);
  const activeEvalId = runPsql(dbTarget, `SELECT id FROM public.evaluations WHERE period_id = '${activePeriodId}' AND employee_id = '${employeeBId}' LIMIT 1;`);
  return {
    managerId, leaderAId, subleaderBId, employeeBId, workerBId,
    closedPeriodId, activePeriodId, closedEvalId, activeEvalId,
  };
}

function runRuntimeLifecycle(scriptPath, action, runtimeRoot, extraEnv = {}) {
  if (action === 'start') {
    // Next 16 dev regenerates the Server Action manifest with new ids on every run; drop any previous copy.
    const appRoot = extraEnv.KURABE_CI_APP_ROOT || path.dirname(path.dirname(path.dirname(scriptPath)));
    fs.rmSync(path.join(appRoot, '.next', 'dev', 'server', 'server-reference-manifest.json'), { force: true });
  }
  const res = spawnSync(process.execPath, [scriptPath, action], {
    cwd: path.dirname(path.dirname(path.dirname(scriptPath))),
    stdio: 'inherit',
    env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot, ...extraEnv },
    timeout: 120000,
  });
  if (res.error) throw new Error(`${action} spawn failed: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${action} exited with code ${res.status}`);
}

function performCleanup(scriptPath, runtimeRoot, extraEnv = {}) {
  const res = spawnSync(process.execPath, [scriptPath, 'cleanup'], {
    cwd: path.dirname(path.dirname(path.dirname(scriptPath))),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot, ...extraEnv },
    timeout: 60000,
    encoding: 'utf8',
  });
  if (res.error) throw new Error(`cleanup spawn error: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`cleanup exit ${res.status}: ${res.stderr || res.stdout}`);
  const lines = String(res.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const jsonLine = lines.reverse().find((l) => l.startsWith('{') && l.endsWith('}'));
  if (!jsonLine) throw new Error(`cleanup missing json summary: ${res.stdout}`);
  const parsed = JSON.parse(jsonLine);
  assert.equal(parsed.cleaned, true, 'cleanup cleaned must be true');
  assert.equal(parsed.residue, 0, 'cleanup residue must be 0');
  return parsed;
}

function runIsolatedBuild(rootDir, label) {
  console.log(`[Build] Running sequential build for ${label} at ${rootDir}...`);
  const logDir = path.join(candidateRoot, '.tmp');
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `build-${label}-${process.pid}.log`);
  const logFd = fs.openSync(logPath, 'w');
  const buildEnv = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_URL: 'http://127.0.0.1:9',
    SUPABASE_ANON_KEY: 'placeholder-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-role-key',
    NODE_ENV: 'production',
  };

  const res = spawnSync('npm', ['run', 'build'], {
    cwd: rootDir,
    env: buildEnv,
    stdio: ['ignore', logFd, logFd],
    timeout: 180000,
  });
  fs.closeSync(logFd);
  restoreRootDrift(rootDir);
  if (res.error) throw new Error(`Build ${label} spawn error: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`Build ${label} failed with code ${res.status}. Log: ${logPath}`);
  console.log(`[Build] Build for ${label} completed with code ${res.status}`);
  return { status: res.status, logPath };
}


const EXPECTED_SAVE_REJECTION = /Danh mục tiêu chuẩn cũ chưa phân bổ theo bộ tiêu chí/;

function normalizeReport(v) {
  const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));
  return JSON.parse(JSON.stringify({
    stats: pick(v.stats, ['totalEmployees', 'avgScore', 'highGradeRate', 'pendingCount', 'approvedCount', 'invalidCount', 'legacyCount', 'sampleCount', 'mixedBasis']),
    gradeDistribution: (v.gradeDistribution || []).map(({ grade, count }) => ({ grade, count })),
    teamStats: (v.teamStats || []).map(({ name, avgScore, progress }) => ({ name, avgScore, progress })),
    criteriaAnalysis: (v.criteriaAnalysis || []).map(({ group, avgScore, percentage }) => ({ group, avgScore, percentage })),
    topPerformers: (v.topPerformers || []).map(({ name, teamName, score, grade }) => ({ name, teamName, score, grade })),
  }));
}

function normalizeHistory(list, closedPeriodId) {
  return JSON.parse(JSON.stringify((list || []).filter((e) => e.periodId === closedPeriodId).map((e) => ({
    status: e.status,
    employeeRole: e.employeeRole,
    currentRound: e.currentRound,
    finalScore: e.finalScore,
    finalGrade: e.finalGrade,
    rounds: (e.rounds || []).slice().sort((a, b) => a.round - b.round).map((r) => ({
      round: r.round,
      evaluatorRole: r.evaluatorRole,
      status: r.status,
      totalScore: r.totalScore,
      grade: r.grade,
      scores: r.scores,
    })),
  }))));
}

function normalizeProjection(p) {
  const r = p.result || {};
  return JSON.parse(JSON.stringify({
    result: {
      approvedCount: r.approvedCount, invalidCount: r.invalidCount, legacyCount: r.legacyCount, average: r.average,
      highGradeRate: r.highGradeRate, gradeDistribution: r.gradeDistribution, mixedBasis: r.mixedBasis, sampleCount: r.sampleCount,
      top: (r.top || []).map(({ score, grade, employeeRole }) => ({ score, grade, employeeRole })),
    },
    criteriaBreakdown: (p.criteriaBreakdown || []).map(({ group, avgScore, percentage }) => ({ group, avgScore, percentage })),
    coverage: p.coverage,
  }));
}

// Catalog digests. Revert-import (a) reactivates the previous version; it deliberately keeps the imported rows
// (inactive) and the imported version row for audit, so "exact revert" is proven on (1) the ACTIVE live projection,
// (2) the previous version's pinned snapshot rows and (3) the version pointer, while the full live digest is only
// used to prove that the import really changed the catalog.
function catalogState(db) {
  const digestOf = (queries) => hashString(queries.map(([label, sql]) => `${label}=${runPsql(db, sql)}`).join('\n'));
  const agg = (sql) => `SELECT COALESCE(string_agg(h, ',' ORDER BY h), '') FROM (${sql}) q(h)`;
  const live = ['criteria_groups', 'criteria', 'criterion_levels', 'criterion_audiences'];
  const activeVersionId = runPsql(db, 'SELECT id FROM public.criteria_config_versions WHERE is_active;');
  const pinned = ['criteria_group_versions', 'criterion_versions', 'criterion_level_versions', 'criterion_audience_versions'];
  return {
    liveDigest: digestOf(live.map((t) => [t, agg(`SELECT md5(t::text) FROM public.${t} t`)])),
    activeLiveDigest: digestOf(live.map((t) => [t, agg(`SELECT md5(t::text) FROM public.${t} t WHERE t.is_active IS TRUE`)])),
    pinnedActiveDigest: digestOf([
      ['config', agg(`SELECT md5(t::text) FROM public.criteria_config_versions t WHERE t.id = '${activeVersionId}'`)],
      ...pinned.map((t) => [t, agg(`SELECT md5(t::text) FROM public.${t} t WHERE t.version_id = '${activeVersionId}'`)]),
    ]),
    versionCount: runPsql(db, 'SELECT count(*) FROM public.criteria_config_versions;'),
    activeVersionId,
    activeVersionNo: runPsql(db, 'SELECT version_no FROM public.criteria_config_versions WHERE is_active;'),
    activeVersionCount: runPsql(db, 'SELECT count(*) FROM public.criteria_config_versions WHERE is_active;'),
    maxVersionNo: runPsql(db, "SELECT COALESCE(max(version_no)::text, '1') FROM public.criteria_config_versions;"),
    activeGroups: runPsql(db, 'SELECT count(*) FROM public.criteria_groups WHERE is_active;'),
    activeCriteria: runPsql(db, 'SELECT count(*) FROM public.criteria WHERE is_active;'),
  };
}

// Loops [role="tablist"][aria-label="Nhóm tiêu chí"] button[role="tab"], clicks each tab,
// and clicks all enabled level buttons matching topLabel per group.
async function selectAllCriteriaAcrossGroups(page, topLabel = 'Excellent') {
  // Editable controls precede Layer-2 criteria; retain the old helper's readiness contract.
  await page.waitFor(`(() => {
    const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
    return tabs.length > 0 && [...document.querySelectorAll('button:not(:disabled) p')].some(n => n.textContent.trim() === ${JSON.stringify(topLabel)});
  })()`, { timeout: 30000, label: 'all-group criteria ready' });
  const groupCount = await page.evaluate(`(() => {
    const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
    return tabs.length;
  })()`);
  assert.ok(groupCount > 0, 'Must have at least one group tab');

  let totalClicked = 0;
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
    await page.evaluate(`(() => {
      const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
      if (tabs[${groupIndex}]) tabs[${groupIndex}].click();
    })()`);

    await page.waitFor(
      `(() => {
        const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
        return tabs[${groupIndex}] && tabs[${groupIndex}].getAttribute('aria-selected') === 'true';
      })()`,
      { timeout: 10000, label: `Group tab ${groupIndex} selected` }
    );

    const clickedInGroup = await page.evaluate(`(() => {
      let count = 0;
      const buttons = Array.from(document.querySelectorAll('button:not(:disabled)'));
      for (const btn of buttons) {
        const pTag = btn.querySelector('p');
        if (pTag && pTag.textContent.trim() === ${JSON.stringify(topLabel)}) {
          btn.click();
          count++;
        }
      }
      return count;
    })()`);
    assert.ok(clickedInGroup > 0, `Must click at least one criterion with label "${topLabel}" in group tab ${groupIndex}`);
    totalClicked += clickedInGroup;

    const selectedCountInGroup = await page.evaluate(`(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.filter(b => b.className.includes('ring-brand')).length;
    })()`);
    assert.ok(selectedCountInGroup > 0, `Current selected count in group ${groupIndex} must be positive`);
  }

  assert.ok(totalClicked > 0, 'Total clicked criteria across all groups must be positive');

  // Return to FIRST group after selection
  await page.evaluate(`(() => {
    const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
    if (tabs[0]) tabs[0].click();
  })()`);
  await page.waitFor(
    `(() => {
      const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
      return tabs[0] && tabs[0].getAttribute('aria-selected') === 'true';
    })()`,
    { timeout: 10000, label: 'First group tab re-selected' }
  );

  return totalClicked;
}

// Real Employee lifecycle through the UI of whichever app is running: a fresh UI-created period, SubLeader -> Leader
// -> Manager, Manager RETURN, Leader resubmit, Manager approve; DB state asserted after each transition.
async function runEmployeeReturnResubmitLifecycle({ page, origin, db, pointers, year, deps }) {
  const { loginAs, openEvaluation, submitViaUi, returnRoundViaUi, createPeriodViaUi } = deps;
  const LEVEL = 'Excellent';
  runPsql(db, "UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");
  await loginAs(page, origin, 'P103-MGR');
  await createPeriodViaUi(page, origin, year);
  const periodId = runPsql(db, `SELECT id FROM public.evaluation_periods WHERE year = ${year} AND status = 'active' LIMIT 1;`);
  assert.ok(periodId, `period ${year} must be created active through the UI`);
  const evalId = runPsql(db, `SELECT id FROM public.evaluations WHERE period_id = '${periodId}' AND employee_id = '${pointers.employeeBId}' LIMIT 1;`);
  assert.ok(evalId, 'Employee evaluation must exist in the new period');
  const ev = (col) => runPsql(db, `SELECT ${col} FROM public.evaluations WHERE id = '${evalId}';`);
  const rd = (round, col) => runPsql(db, `SELECT ${col} FROM public.evaluation_rounds WHERE evaluation_id = '${evalId}' AND round = ${round};`);
  assert.equal(runPsql(db, `SELECT string_agg(round || ':' || evaluator_role, '|' ORDER BY round) FROM public.evaluation_rounds WHERE evaluation_id = '${evalId}';`), '1:SubLeader');

  // Authorization: a Leader of another team must not get an editable form for this subject.
  await loginAs(page, origin, 'P103-LDC');
  await openEvaluation(page, origin, pointers.employeeBId, { expectEdit: false });
  assert.ok(!(await page.evaluate("document.body.innerText.toLowerCase().includes('gửi đánh giá') || document.body.innerText.toLowerCase().includes('lưu bản nháp')")), 'other-team Leader must not see an editable evaluation form');

  await loginAs(page, origin, 'P103-SLB');
  await openEvaluation(page, origin, pointers.employeeBId);
  await selectAllCriteriaAcrossGroups(page, LEVEL);
  await submitViaUi(page);
  assert.equal(ev('status'), 'Submitted');
  assert.equal(ev('current_round'), '2');
  assert.equal(rd(1, 'status'), 'Submitted');

  await loginAs(page, origin, 'P103-LDA');
  await openEvaluation(page, origin, pointers.employeeBId);
  await selectAllCriteriaAcrossGroups(page, LEVEL);
  await submitViaUi(page);
  assert.equal(ev('status'), 'Reviewed');
  assert.equal(ev('current_round'), '3');

  await loginAs(page, origin, 'P103-MGR');
  await openEvaluation(page, origin, pointers.employeeBId);
  await returnRoundViaUi(page, `Return for resubmit ${year}`);
  assert.equal(ev('status'), 'Submitted');
  assert.equal(ev('current_round'), '2');
  assert.equal(rd(2, 'status'), 'Draft');
  assert.equal(rd(3, 'status'), 'NotStarted');
  assert.ok(ev('return_note'), 'return reason must be stored');

  await loginAs(page, origin, 'P103-LDA');
  await openEvaluation(page, origin, pointers.employeeBId);
  await selectAllCriteriaAcrossGroups(page, LEVEL);
  await submitViaUi(page);
  assert.equal(ev('status'), 'Reviewed');
  assert.equal(ev('current_round'), '3');

  await loginAs(page, origin, 'P103-MGR');
  await openEvaluation(page, origin, pointers.employeeBId);
  await selectAllCriteriaAcrossGroups(page, LEVEL);
  await submitViaUi(page);
  assert.equal(ev('status'), 'Approved');
  assert.ok(Number(ev('final_score')) > 0 && ev('final_grade'), 'Approved evaluation must carry final score and grade');
  return { periodId, evalId };
}

const REQUIRED_ACTIONS = ['getReportAggregation', 'getEvaluationResultProjectionAction', 'getEvaluationHistoryAction', 'upsertCriteriaGroupAction'];
// Next dev compiles Server Actions per visited route: visit the real pages until every required action is in the manifest.
async function loadManifestWithActions(loadActionManifest, page, origin, root, names = REQUIRED_ACTIONS) {
  const buildDir = path.join(root, '.next', 'dev');
  let manifest = [];
  for (const route of ['/dashboard', '/reports', '/history', '/employees', '/criteria']) {
    await page.goto(`${origin}${route}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try { manifest = loadActionManifest(buildDir); } catch { manifest = []; }
    if (names.every((n) => manifest.some((entry) => entry.exportedName === n))) return manifest;
  }
  const missing = names.filter((n) => !manifest.some((entry) => entry.exportedName === n));
  throw new Error(`ACTIONS_NOT_COMPILED_AFTER_ROUTE_VISITS ${missing.join(',')}`);
}

async function main() {
  console.log('=== P108 Old-App Compatibility & Four-State Matrix Suite ===\n');

  const { evidencePath } = parseArgs();
  const runId = crypto.randomUUID();
  const caseResults = [];
  const recordedGolden = {};
  const buildResults = {};
  let overallError = null;

  function recordPass(caseName, meta = {}) {
    console.log(`[PASS] Case: ${caseName}`);
    caseResults.push({ name: caseName, status: 'PASS', ...meta });
  }

  // ---------------------------------------------------------------------------
  // Preflight: Validate KURABE_P108_BASELINE_ROOT
  // ---------------------------------------------------------------------------
  console.log('[Preflight] Checking baseline worktree and candidate repository...');
  const rawBaseline = process.env.KURABE_P108_BASELINE_ROOT;
  if (!rawBaseline) {
    throw new Error('FAIL_CLOSED: KURABE_P108_BASELINE_ROOT environment variable is required');
  }
  const baselineRoot = path.resolve(rawBaseline);
  if (!path.isAbsolute(rawBaseline) || !fs.existsSync(baselineRoot) || !fs.statSync(baselineRoot).isDirectory()) {
    throw new Error(`FAIL_CLOSED: KURABE_P108_BASELINE_ROOT must be an existing absolute directory: ${rawBaseline}`);
  }
  if (!fs.existsSync(path.join(baselineRoot, 'node_modules/.bin/next'))) {
    throw new Error(`FAIL_CLOSED: KURABE_P108_BASELINE_ROOT missing node_modules/.bin/next: ${baselineRoot}`);
  }

  const baselineHead = runGit(['rev-parse', 'HEAD'], baselineRoot);
  if (baselineHead !== baselineExpectedSha) {
    throw new Error(`FAIL_CLOSED: baseline HEAD mismatch: expected ${baselineExpectedSha}, got ${baselineHead}`);
  }
  // A previous disposable `next dev` may have appended its generated agent-rules block to AGENTS.md/CLAUDE.md.
  restoreRootDrift(baselineRoot);
  const baselineStatus = runGit(['status', '--porcelain=v1'], baselineRoot);
  if (baselineStatus.length > 0) {
    throw new Error(`FAIL_CLOSED: baseline worktree is dirty before start:\n${baselineStatus}`);
  }

  const candidateHead = runGit(['rev-parse', 'HEAD'], candidateRoot);
  console.log(`[Preflight] Baseline SHA: ${baselineHead}`);
  console.log(`[Preflight] Candidate SHA: ${candidateHead}`);
  recordPass('preflight-baseline-worktree-clean-and-head-verified', { baselineHead, candidateHead });

  // Load browser and org helpers from lifecycle-coherence fixtures
  const browserHelperPath = path.join(candidateRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/browser.mjs');
  const orgHelperPath = path.join(candidateRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/org.mjs');
  const { launchChromium } = await import(`file://${browserHelperPath}`);
  const {
    loginAs,
    openEvaluation,
    selectTopLevel,
    saveDraftViaUi,
    submitViaUi,
    returnRoundViaUi,
    loadActionManifest,
    browserAction,
    createPeriodViaUi,
  } = await import(`file://${orgHelperPath}`);

  const { legacyGradedApprovedSql } = await import(`file://${path.join(candidateRoot, '.github/ci/confirmation-runtime.mjs')}`);
  const candidateRuntimeScript = path.join(candidateRoot, '.github/ci/confirmation-runtime.mjs');
  const baselineRuntimeScript = path.join(baselineRoot, '.github/ci/confirmation-runtime.mjs');
  const importScriptPath = path.join(candidateRoot, 'scripts/p108-import-criteria.mjs');
  const syntheticManifestPath = path.join(candidateRoot, 'tests/fixtures/p108/synthetic-manifest.json');
  const rollbackSqlPath = path.join(candidateRoot, 'db/rollback-p108-criteria-sets.sql');

  try {
    // -------------------------------------------------------------------------
    // Isolated Builds: Sequential build of baseline and candidate worktrees
    // -------------------------------------------------------------------------
    const bBuild = runIsolatedBuild(baselineRoot, 'baseline');
    buildResults.baseline = bBuild;
    recordPass('build-baseline-worktree-success', { exitCode: bBuild.status });

    const cBuild = runIsolatedBuild(candidateRoot, 'candidate');
    buildResults.candidate = cBuild;
    recordPass('build-candidate-worktree-success', { exitCode: cBuild.status });


    // -------------------------------------------------------------------------
    // Shared state helpers (closures over the loaded browser/org helpers)
    // -------------------------------------------------------------------------
    const deps = { loginAs, openEvaluation, selectTopLevel, saveDraftViaUi, submitViaUi, returnRoundViaUi, createPeriodViaUi };
    const captureSemantics = async (page, manifest, pointers) => {
      const report = await browserAction(page, { manifest, name: 'getReportAggregation', args: [pointers.closedPeriodId, 'all'] });
      const history = await browserAction(page, { manifest, name: 'getEvaluationHistoryAction', args: [pointers.employeeBId] });
      const projection = await browserAction(page, { manifest, name: 'getEvaluationResultProjectionAction', args: [pointers.closedPeriodId] });
      assert.ok(report.value && history.value && projection.value, 'report, history and projection actions must all return values');
      return {
        report: normalizeReport(report.value),
        history: normalizeHistory(history.value, pointers.closedPeriodId),
        projection: normalizeProjection(projection.value),
      };
    };
    const assertSemanticsEqualGolden = (semantics, label) => {
      assert.deepEqual(semantics.report, recordedGolden.report, `${label}: report aggregate must equal golden`);
      assert.deepEqual(semantics.history, recordedGolden.history, `${label}: history rounds/scores/grades must equal golden`);
      assert.deepEqual(semantics.projection, recordedGolden.projection, `${label}: official-result projection (export source) must equal golden`);
    };
    // The legacy fixture is pinned to the active (legacy v1) criteria + grade versions: Submitted rounds cannot exist unpinned under the P99 guards,
    // and the baseline app/schema behave identically (S1 golden). The unpinned (NULL pin) shape is covered separately in the acceptance suite.
    const seedLegacyFixture = (db, pointers) => {
      runPsql(db, legacyGradedApprovedSql(pointers.closedEvalId));
      assertLegacyPinned(db, pointers.closedEvalId);
    };
    const assertLegacyPinned = (db, evalId) => {
      assert.equal(runPsql(db, `SELECT count(*) FROM public.evaluation_rounds r WHERE r.evaluation_id = '${evalId}' AND (r.criteria_config_version_id IS NULL OR r.grade_config_version_id IS NULL);`), '0', 'legacy fixture rounds must keep their configuration pins');
    };
    // Complete evaluation + round digest: every column (scores, notes, evaluator ids, pins, timestamps), so any rewrite by import/revert is caught.
    const legacyEvalDigest = (db, evalId) => hashString(runPsql(db, `SELECT (SELECT md5(e::text) FROM public.evaluations e WHERE e.id = '${evalId}') || '|' || COALESCE((SELECT string_agg(md5(r::text), ',' ORDER BY r.round) FROM public.evaluation_rounds r WHERE r.evaluation_id = '${evalId}'), '');`));
    const criteriaUiControls = (page) => page.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('button, a, [role="button"]')];
      const hit = (n) => [n.textContent || '', n.getAttribute('title') || '', n.getAttribute('aria-label') || ''].join(' ');
      return {
        banner: document.body.innerText.includes('chế độ chỉ đọc'),
        add: nodes.filter((n) => /Thêm tiêu chuẩn|Thêm nhóm tiêu chuẩn/.test(hit(n))).length,
        editDelete: nodes.filter((n) => /Sửa nhóm|Xóa nhóm|Sửa tiêu chí|Xóa tiêu chí/.test(hit(n))).length,
      };
    })()`);
    const rejectionOf = async (page, manifest, db, request, label) => {
      const before = criteriaDigest(db);
      const res = await browserAction(page, { manifest, name: 'upsertCriteriaGroupAction', args: request });
      assert.ok(res.value && res.value.success === false, `${label}: save must be rejected with success=false, got ${JSON.stringify(res.value)}`);
      assert.equal(typeof res.value.error, 'string', `${label}: rejection must carry an error string`);
      assert.equal(criteriaDigest(db), before, `${label}: rejected save must cause ZERO criteria mutation`);
      return res.value.error;
    };

    // -------------------------------------------------------------------------
    // STATE S1: Old app + old schema + legacy catalog (baseline confirmation runtime)
    // -------------------------------------------------------------------------
    console.log('\n--- [STATE S1] Starting baseline app + old schema + legacy catalog ---');
    const s1RuntimeRoot = path.join(candidateRoot, '.tmp', `kurabe-compat-s1-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    let s1Browser = null;
    try {
      runRuntimeLifecycle(baselineRuntimeScript, 'start', s1RuntimeRoot);
      runRuntimeLifecycle(baselineRuntimeScript, 'bootstrap', s1RuntimeRoot);
      const s1State = JSON.parse(fs.readFileSync(path.join(s1RuntimeRoot, 'runtime-state.json'), 'utf8'));
      const s1Origin = `http://127.0.0.1:${s1State.nextPort}`;
      const s1Db = { host: '127.0.0.1', port: s1State.dbPort, database: s1State.db, user: 'postgres', password: s1State.password };
      prepareDbUsers(s1Db);
      const s1Pointers = queryFixturePointers(s1Db);
      seedLegacyFixture(s1Db, s1Pointers);
      recordPass('s1-baseline-runtime-started-and-bootstrapped', { runtimeRoot: s1RuntimeRoot });

      s1Browser = await launchChromium({ runtimeRoot: s1RuntimeRoot, headless: true });
      const page = await s1Browser.newPage('s1-baseline');
      await page.setViewport(1440, 900);
      await loginAs(page, s1Origin, 'P103-MGR');
      const baselineManifest = await loadManifestWithActions(loadActionManifest, page, s1Origin, baselineRoot);

      console.log('[S1] Recording semantic golden (report + history + projection) for the graded legacy Approved evaluation...');
      const golden = await captureSemantics(page, baselineManifest, s1Pointers);
      // The golden is only meaningful when the fixture is a real graded Approved evaluation: refuse a vacuous golden.
      assert.equal(golden.report.stats.approvedCount, 1, 'fixture must hold exactly one Approved evaluation');
      assert.equal(golden.report.stats.invalidCount, 0, 'fixture Approved evaluation must be valid (final score+grade present)');
      assert.ok(golden.report.stats.avgScore > 0, 'golden avgScore must be > 0');
      assert.ok(golden.report.criteriaAnalysis.length >= 1, 'golden criteria analysis must not be empty');
      assert.equal(golden.history.length, 1, 'golden history must hold the legacy Approved evaluation');
      assert.ok(Number(golden.history[0].finalScore) > 0 && golden.history[0].finalGrade, 'golden history must carry a real final score and grade');
      assert.deepEqual(golden.history[0].rounds.map((r) => [r.round, r.evaluatorRole, r.status]),
        [[1, 'SubLeader', 'Submitted'], [2, 'Leader', 'Submitted'], [3, 'Manager', 'Submitted']]);
      assert.ok(golden.history[0].rounds.every((r) => Number(r.totalScore) === Number(golden.history[0].finalScore) && r.grade === golden.history[0].finalGrade && Object.keys(r.scores || {}).length > 0), 'every golden round must carry the real score, grade and per-criterion scores');
      assert.equal(golden.projection.result.approvedCount, 1);
      assert.equal(golden.projection.result.invalidCount, 0);
      assert.equal(golden.projection.coverage.valid, 1);
      Object.assign(recordedGolden, golden);
      recordedGolden.goldenSha256 = hashString(JSON.stringify(golden));
      recordPass('s1-baseline-golden-report-aggregates-recorded', { avgScore: golden.report.stats.avgScore, approvedCount: golden.report.stats.approvedCount });
      recordPass('s1-baseline-golden-history-recorded', { goldenSha256: recordedGolden.goldenSha256 });

      // Control: the same lifecycle that S2/S3 run (incl. Return -> Resubmit -> Approved) must work on old app + old schema.
      await runEmployeeReturnResubmitLifecycle({ page, origin: s1Origin, db: s1Db, pointers: s1Pointers, year: 2100, deps });
      assertSemanticsEqualGolden(await captureSemantics(page, baselineManifest, s1Pointers), 'S1 after lifecycle');
      recordPass('s1-baseline-control-evaluation-editable');

      // Control for the S2 negative test: with NO active period, the same old-app criteria save succeeds on the OLD schema.
      // Without this control, an S2 rejection could be blamed on the schema when it is only the active-period guard.
      runPsql(s1Db, "UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");
      const s1DigestBefore = criteriaDigest(s1Db);
      const s1Save = await browserAction(page, { manifest: baselineManifest, name: 'upsertCriteriaGroupAction', args: [{ code: 'CTRL', name: 'Control Group' }, 1] });
      assert.ok(s1Save.value && s1Save.value.success === true, `S1 control: old-app criteria save must succeed on the old schema, got ${JSON.stringify(s1Save.value)}`);
      assert.notEqual(criteriaDigest(s1Db), s1DigestBefore, 'S1 control: the successful save must change the criteria tables');
      recordPass('s1-baseline-control-old-app-criteria-save-succeeds-on-old-schema');
    } finally {
      if (s1Browser) {
        try { await s1Browser.stop(); } catch {}
      }
      performCleanup(baselineRuntimeScript, s1RuntimeRoot);
      recordPass('s1-baseline-runtime-cleaned');
    }

    // -------------------------------------------------------------------------
    // STATE S2: Old app + NEW schema (candidate runtime with KURABE_CI_APP_ROOT=baseline)
    // -------------------------------------------------------------------------
    console.log('\n--- [STATE S2] Starting old app + NEW schema (candidate runtime with baseline app root) ---');
    const s2RuntimeRoot = path.join(candidateRoot, '.tmp', `kurabe-compat-s2-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    let s2Browser = null;
    const s2ExtraEnv = { KURABE_CI_APP_ROOT: baselineRoot };
    try {
      runRuntimeLifecycle(candidateRuntimeScript, 'start', s2RuntimeRoot, s2ExtraEnv);
      runRuntimeLifecycle(candidateRuntimeScript, 'bootstrap', s2RuntimeRoot, s2ExtraEnv);
      const s2State = JSON.parse(fs.readFileSync(path.join(s2RuntimeRoot, 'runtime-state.json'), 'utf8'));
      const s2Origin = `http://127.0.0.1:${s2State.nextPort}`;
      const s2Db = { host: '127.0.0.1', port: s2State.dbPort, database: s2State.db, user: 'postgres', password: s2State.password };
      prepareDbUsers(s2Db);
      const s2Pointers = queryFixturePointers(s2Db);
      seedLegacyFixture(s2Db, s2Pointers);
      recordPass('s2-old-app-new-schema-runtime-started-and-bootstrapped');

      s2Browser = await launchChromium({ runtimeRoot: s2RuntimeRoot, headless: true });
      const page = await s2Browser.newPage('s2-old-app-new-schema');
      await page.setViewport(1440, 900);
      await loginAs(page, s2Origin, 'P103-MGR');
      await loginAs(page, s2Origin, 'P103-LDA');
      recordPass('s2-old-app-new-schema-login-manager-and-leader');

      console.log('[S2] Executing evaluation Draft -> Submit -> Return -> Resubmit -> Approved through the OLD app UI...');
      await runEmployeeReturnResubmitLifecycle({ page, origin: s2Origin, db: s2Db, pointers: s2Pointers, year: 2100, deps });
      recordPass('s2-old-app-new-schema-evaluation-draft-submit-return-approved');

      await loginAs(page, s2Origin, 'P103-MGR');
      const baselineManifest = await loadManifestWithActions(loadActionManifest, page, s2Origin, baselineRoot);
      const s2Semantics = await captureSemantics(page, baselineManifest, s2Pointers);
      assert.deepEqual(s2Semantics.history, recordedGolden.history, 'S2: history rounds/scores/grades must equal golden');
      recordPass('s2-old-app-new-schema-history-matches-golden');
      assert.deepEqual(s2Semantics.report, recordedGolden.report, 'S2: report aggregate must equal golden');
      recordPass('s2-old-app-new-schema-reports-match-golden');
      assert.deepEqual(s2Semantics.projection, recordedGolden.projection, 'S2: projection (export source) must equal golden');
      recordPass('s2-old-app-new-schema-export-projection-matches-golden');

      console.log('[S2] Verifying criteria save from old app is rejected by the NEW schema (no active period) with ZERO DB mutation...');
      runPsql(s2Db, "UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");
      assert.equal(runPsql(s2Db, "SELECT count(*) FROM public.evaluation_periods WHERE status = 'active';"), '0', 'S2 negative test must run with no active period so the period guard cannot be the cause');
      const s2Reason = await rejectionOf(page, baselineManifest, s2Db, [{ code: 'X', name: 'Reject Group' }, 1], 'S2 old-app criteria save');
      console.log(`[S2] rejection reason: ${s2Reason}`);
      assert.equal(s2Reason, 'Lỗi khi lưu nhóm tiêu chí. Vui lòng thử lại.', 'S2: the old app can only surface its generic save error because the new schema rejected its legacy payload');
      recordPass('s2-old-app-new-schema-criteria-save-rejected-zero-mutation', { reason: s2Reason });
    } finally {
      if (s2Browser) {
        try { await s2Browser.stop(); } catch {}
      }
      performCleanup(candidateRuntimeScript, s2RuntimeRoot, s2ExtraEnv);
      recordPass('s2-old-app-new-schema-runtime-cleaned');
    }

    // -------------------------------------------------------------------------
    // STATE S3: NEW app + new schema + LEGACY catalog, then import and revert-import (a)
    // -------------------------------------------------------------------------
    console.log('\n--- [STATE S3] Starting NEW app + new schema + LEGACY catalog ---');
    const s3RuntimeRoot = path.join(candidateRoot, '.tmp', `kurabe-compat-s3-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    let s3Browser = null;
    try {
      runRuntimeLifecycle(candidateRuntimeScript, 'start', s3RuntimeRoot);
      runRuntimeLifecycle(candidateRuntimeScript, 'bootstrap', s3RuntimeRoot);
      const s3State = JSON.parse(fs.readFileSync(path.join(s3RuntimeRoot, 'runtime-state.json'), 'utf8'));
      const s3Origin = `http://127.0.0.1:${s3State.nextPort}`;
      const s3Db = { host: '127.0.0.1', port: s3State.dbPort, database: s3State.db, user: 'postgres', password: s3State.password };
      prepareDbUsers(s3Db);
      const s3Pointers = queryFixturePointers(s3Db);
      seedLegacyFixture(s3Db, s3Pointers);
      recordPass('s3-new-app-legacy-catalog-runtime-started-and-bootstrapped');

      s3Browser = await launchChromium({ runtimeRoot: s3RuntimeRoot, headless: true });
      const page = await s3Browser.newPage('s3-new-app-legacy-catalog');
      await page.setViewport(1440, 900);
      await loginAs(page, s3Origin, 'P103-MGR');
      const candidateManifest = await loadManifestWithActions(loadActionManifest, page, s3Origin, candidateRoot);

      await runEmployeeReturnResubmitLifecycle({ page, origin: s3Origin, db: s3Db, pointers: s3Pointers, year: 2100, deps });
      recordPass('s3-new-app-legacy-catalog-login-and-evaluation-flow');

      assertSemanticsEqualGolden(await captureSemantics(page, candidateManifest, s3Pointers), 'S3 legacy catalog');
      recordPass('s3-new-app-legacy-catalog-history-and-reports-match-golden');

      console.log('[S3] Verifying /criteria read-only behavior with legacy catalog...');
      await page.goto(`${s3Origin}/criteria`);
      await page.waitFor("document.body.innerText.toLowerCase().includes('tiêu chí') || document.body.innerText.toLowerCase().includes('tiêu chuẩn')", { timeout: 30000 });
      await page.waitFor("document.body.innerText.includes('chế độ chỉ đọc')", { timeout: 30000, label: 'legacy read-only banner rendered' });
      const s3Ui = await criteriaUiControls(page);
      assert.deepEqual(s3Ui, { banner: true, add: 0, editDelete: 0 }, `legacy catalog /criteria must render the read-only banner and NO add/edit/delete/save controls, got ${JSON.stringify(s3Ui)}`);
      const s3Reason = await rejectionOf(page, candidateManifest, s3Db, [{ code: 'Y', name: 'New Group', setKey: 'leader' }, 1], 'S3 legacy-catalog criteria save');
      console.log(`[S3] rejection reason: ${s3Reason}`);
      assert.match(s3Reason, EXPECTED_SAVE_REJECTION, 'S3 rejection must come from the criteria-config write guard');
      recordPass('s3-new-app-legacy-catalog-criteria-page-read-only-ui-and-sql', { reason: s3Reason });

      // Import P108 3-set synthetic criteria (T04 script) with full catalog digests around import and revert.
      console.log('[S3] Applying synthetic criteria import...');
      runPsql(s3Db, "UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");
      const s3Before = catalogState(s3Db);
      const s3LegacyDigest = legacyEvalDigest(s3Db, s3Pointers.closedEvalId);
      const s3PreImportVersionNo = s3Before.maxVersionNo;
      const importRes = spawnSync(process.execPath, [
        importScriptPath,
        '--apply',
        '--expected-version', s3PreImportVersionNo,
        '--manifest', syntheticManifestPath,
        '--disposable',
      ], {
        cwd: candidateRoot,
        env: { ...process.env, KURABE_SUPABASE_URL: s3State.supabaseUrl, KURABE_SUPABASE_SERVICE_ROLE_KEY: s3State.serviceRoleKey },
        encoding: 'utf8',
        timeout: 30000,
      });
      if (importRes.status !== 0) throw new Error(`Import failed: ${importRes.stderr || importRes.stdout}`);
      const s3Imported = catalogState(s3Db);
      assert.equal(s3Imported.activeGroups, '18');
      assert.equal(s3Imported.activeCriteria, '93');
      assert.notEqual(s3Imported.liveDigest, s3Before.liveDigest, 'import must change the live catalog');
      assert.equal(legacyEvalDigest(s3Db, s3Pointers.closedEvalId), s3LegacyDigest, 'import must not change one byte of the legacy evaluation/rounds');
      assertLegacyPinned(s3Db, s3Pointers.closedEvalId);
      const importVersionId = s3Imported.activeVersionId;
      recordPass('s3-new-app-legacy-catalog-import-applied', { importVersionId });

      console.log('[S3] Executing revert-import (a) via db/rollback-p108-criteria-sets.sql...');
      const revertRes = spawnSync('psql', [
        '-X', '-h', s3Db.host, '-p', String(s3Db.port), '-U', s3Db.user, '-d', s3Db.database,
        '-v', 'ON_ERROR_STOP=1',
        '-c', `
          SET kurabe.p108_rollback_approved = 'true';
          SET kurabe.p108_rollback_action = 'revert-import';
          SET kurabe.p108_expected_import_version_id = '${importVersionId}';
          SET kurabe.p108_expected_previous_version_no = ${s3PreImportVersionNo};
        `,
        '-f', rollbackSqlPath,
      ], {
        cwd: candidateRoot,
        env: { ...process.env, PGPASSWORD: s3Db.password, PGPASSFILE: '/dev/null' },
        encoding: 'utf8',
        timeout: 30000,
      });
      if (revertRes.status !== 0) throw new Error(`Revert-import failed: ${redact(revertRes.stderr || revertRes.stdout)}`);
      const s3Reverted = catalogState(s3Db);
      assert.equal(s3Reverted.activeVersionNo, s3Before.activeVersionNo, 'active version number after revert');
      assert.equal(s3Reverted.activeVersionId, s3Before.activeVersionId, 'active version id after revert');
      assert.equal(s3Reverted.activeVersionCount, '1', 'exactly one active version after revert');
      assert.equal(s3Reverted.activeLiveDigest, s3Before.activeLiveDigest, 'ACTIVE live catalog digest after revert must equal the pre-import digest');
      assert.equal(s3Reverted.pinnedActiveDigest, s3Before.pinnedActiveDigest, 'pinned snapshot digest of the restored version must equal the pre-import digest');
      assert.equal(s3Reverted.activeGroups, s3Before.activeGroups, 'active group count after revert');
      assert.equal(s3Reverted.activeCriteria, s3Before.activeCriteria, 'active criteria count after revert');
      assert.equal(s3Reverted.versionCount, String(Number(s3Before.versionCount) + 1), 'imported version row must be retained (audit) and not deleted');
      assert.notEqual(s3Reverted.liveDigest, s3Before.liveDigest, 'imported rows are retained inactive: full live digest differs by design');
      recordPass('s3-new-app-legacy-catalog-revert-import-a-executed', { activeLiveDigest: s3Reverted.activeLiveDigest, pinnedActiveDigest: s3Reverted.pinnedActiveDigest });

      assert.equal(legacyEvalDigest(s3Db, s3Pointers.closedEvalId), s3LegacyDigest, 'revert-import must leave the legacy evaluation/rounds byte-identical');
      assertLegacyPinned(s3Db, s3Pointers.closedEvalId);
      // Full legacy flow again after rollback: lifecycle, semantics, read-only behavior.
      await runEmployeeReturnResubmitLifecycle({ page, origin: s3Origin, db: s3Db, pointers: s3Pointers, year: 2101, deps });
      assertSemanticsEqualGolden(await captureSemantics(page, candidateManifest, s3Pointers), 'S3 post-revert');
      const s3PostReason = await rejectionOf(page, candidateManifest, s3Db, [{ code: 'Z', name: 'Post revert group', setKey: 'leader' }, 1], 'S3 post-revert criteria save');
      assert.match(s3PostReason, EXPECTED_SAVE_REJECTION, 'post-revert rejection must come from the criteria-config write guard');
      recordPass('s3-new-app-legacy-catalog-post-revert-flows-and-golden-match');
    } finally {
      if (s3Browser) {
        try { await s3Browser.stop(); } catch {}
      }
      // Tracked-file drift: a generated block appended to AGENTS.md/CLAUDE.md must be removed by the runtime's own cleanup (no coordinator help).
      for (const name of ['AGENTS.md', 'CLAUDE.md']) {
        if (fs.existsSync(path.join(candidateRoot, name)) && runGit(['ls-files', name], candidateRoot) === name) fs.appendFileSync(path.join(candidateRoot, name), '\n<!-- BEGIN:nextjs-agent-rules -->\ndrift\n<!-- END:nextjs-agent-rules -->\n');
      }
      performCleanup(candidateRuntimeScript, s3RuntimeRoot);
      assert.equal(runGit(['status', '--porcelain=v1', '--', 'AGENTS.md', 'CLAUDE.md'], candidateRoot), '', 'runtime cleanup must restore tracked AGENTS.md/CLAUDE.md drift by itself');
      recordPass('s3-new-app-legacy-catalog-runtime-cleaned');
      recordPass('s3-cleanup-restores-tracked-agents-drift');
    }

    // -------------------------------------------------------------------------
    // STATE S4: NEW app + new schema + P108 3-set catalog
    // -------------------------------------------------------------------------
    console.log('\n--- [STATE S4] Starting NEW app + new schema + P108 3-set catalog ---');
    const s4RuntimeRoot = path.join(candidateRoot, '.tmp', `kurabe-compat-s4-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    let s4Browser = null;
    try {
      runRuntimeLifecycle(candidateRuntimeScript, 'start', s4RuntimeRoot);
      runRuntimeLifecycle(candidateRuntimeScript, 'bootstrap', s4RuntimeRoot);
      const s4State = JSON.parse(fs.readFileSync(path.join(s4RuntimeRoot, 'runtime-state.json'), 'utf8'));
      const s4Origin = `http://127.0.0.1:${s4State.nextPort}`;
      const s4Db = { host: '127.0.0.1', port: s4State.dbPort, database: s4State.db, user: 'postgres', password: s4State.password };
      prepareDbUsers(s4Db);
      const s4Pointers = queryFixturePointers(s4Db);
      seedLegacyFixture(s4Db, s4Pointers);
      recordPass('s4-new-app-p108-sets-runtime-started-and-bootstrapped');

      const s4LegacyDigest = legacyEvalDigest(s4Db, s4Pointers.closedEvalId);
      console.log('[S4] Importing P108 3-set synthetic criteria manifest...');
      runPsql(s4Db, "UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");
      const s4PreImportVersionNo = catalogState(s4Db).maxVersionNo;
      const s4ImportRes = spawnSync(process.execPath, [
        importScriptPath,
        '--apply',
        '--expected-version', s4PreImportVersionNo,
        '--manifest', syntheticManifestPath,
        '--disposable',
      ], {
        cwd: candidateRoot,
        env: { ...process.env, KURABE_SUPABASE_URL: s4State.supabaseUrl, KURABE_SUPABASE_SERVICE_ROLE_KEY: s4State.serviceRoleKey },
        encoding: 'utf8',
        timeout: 30000,
      });
      if (s4ImportRes.status !== 0) throw new Error(`S4 Import failed: ${s4ImportRes.stderr || s4ImportRes.stdout}`);
      const s4Catalog = catalogState(s4Db);
      assert.equal(s4Catalog.activeGroups, '18', 'P108 active groups count must be exactly 18');
      assert.equal(s4Catalog.activeCriteria, '93', 'P108 active criteria count must be exactly 93');
      assert.equal(runPsql(s4Db, "SELECT string_agg(set_key || '=' || n, ',' ORDER BY set_key) FROM (SELECT set_key, count(*)::text AS n FROM public.criteria WHERE is_active GROUP BY set_key) s;"), 'leader=33,staff=30,worker=30', 'per-set criteria counts');
      recordPass('s4-new-app-p108-sets-import-18-groups-93-criteria', { groups: 18, criteria: 93 });

      assert.equal(legacyEvalDigest(s4Db, s4Pointers.closedEvalId), s4LegacyDigest, 'S4 import must leave the legacy evaluation/rounds byte-identical');
      assertLegacyPinned(s4Db, s4Pointers.closedEvalId);
      s4Browser = await launchChromium({ runtimeRoot: s4RuntimeRoot, headless: true });
      const page = await s4Browser.newPage('s4-new-app-p108-sets');
      await page.setViewport(1440, 900);
      await loginAs(page, s4Origin, 'P103-MGR');
      const s4Manifest = await loadManifestWithActions(loadActionManifest, page, s4Origin, candidateRoot);
      assertSemanticsEqualGolden(await captureSemantics(page, s4Manifest, s4Pointers), 'S4 3-set catalog');
      // Positive control for the read-only assertion in S3: with the 3-set catalog and no active period the same page DOES expose the edit controls.
      await page.goto(`${s4Origin}/criteria`);
      await page.waitFor("document.body.innerText.toLowerCase().includes('tiêu chuẩn')", { timeout: 30000 });
      await page.waitFor(`[...document.querySelectorAll('button')].some((n) => /Thêm tiêu chuẩn/.test(n.textContent || ''))`, { timeout: 30000, label: 'S4 edit controls rendered' });
      const s4Ui = await criteriaUiControls(page);
      assert.ok(s4Ui.add > 0 && s4Ui.banner === false, `S4 /criteria must expose the add control and no read-only banner, got ${JSON.stringify(s4Ui)}`);
      recordPass('s4-new-app-p108-sets-legacy-history-and-reports-golden-unchanged');
    } finally {
      if (s4Browser) {
        try { await s4Browser.stop(); } catch {}
      }
      performCleanup(candidateRuntimeScript, s4RuntimeRoot);
      recordPass('s4-new-app-p108-sets-runtime-cleaned');
    }
  } catch (err) {
    overallError = err;
    console.error('\n[Error in p108-old-app-compat]:', err);
  }

  // ---------------------------------------------------------------------------
  // Evidence Generation
  // ---------------------------------------------------------------------------
  const allRequiredPassed = REQUIRED_CASES.every((req) => caseResults.some((c) => c.name === req && c.status === 'PASS'));
  const finalStatus = (!overallError && allRequiredPassed) ? 'PASS' : 'FAIL';

  const evidenceReport = {
    format: 'kurabe-p108-old-app-compat-evidence/v1',
    runId,
    task: 'P108M1T10',
    tier: 'CONTROLLED',
    timestamp: new Date().toISOString(),
    baselineSha: baselineExpectedSha,
    candidateSha: candidateHead,
    builds: buildResults,
    goldenLiterals: recordedGolden,
    goldenSha256: recordedGolden.goldenSha256 || null,
    requiredCasesCount: REQUIRED_CASES.length,
    executedCasesCount: caseResults.length,
    cases: caseResults,
    cleanup: {
      runtimeResidue: 0,
      noDockerResidue: true,
    },
    status: finalStatus,
    error: overallError ? redact(overallError.message) : null,
  };

  try {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidenceReport, null, 2)}\n`, { mode: 0o600 });
    console.log(`\n[Evidence] Saved compatibility evidence report to ${evidencePath}`);
  } catch (err) {
    throw new Error(`FAIL_CLOSED: evidence report could not be written: ${err.message}`);
  }

  if (overallError) throw overallError;
  if (!allRequiredPassed) throw new Error('Not all required cases passed');

  console.log('\n======================================================');
  console.log('ALL P108 OLD-APP COMPATIBILITY MATRIX CASES PASSED!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('\nFATAL_ERROR in p108-old-app-compat:', err);
  process.exit(1);
});
