#!/usr/bin/env node
/**
 * Integration Test for Kurabe STANDARD Task P108M1T07
 * Subject Role Snapshot substitution verification across full evaluation & compare flows.
 *
 * Rules:
 * - Real disposable PG/PostgREST+Next via .github/ci/confirmation-runtime.mjs.
 * - MUST run confirmation-runtime start then bootstrap within same try/finally.
 * - Real browser automation via tests/fixtures/p107/lifecycle-coherence/lib/browser.mjs.
 * - Real UI login/flow via tests/fixtures/p107/lifecycle-coherence/lib/org.mjs.
 * - DoD: ALL FIVE subject roles through valid P107 flow over their OWN set.
 * - Complete 8-direction drift matrix with fresh unappointed synthetic subjects.
 * - Pinned criteria UUID set, DRAFT score/grade bands/max round.
 * - Real saveEvaluationRound action with positive control & forged criterion negative test.
 * - Grader authorization remains based on grader's real current role.
 * - Full evaluation digest verification and robust cleanup via AggregateError.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');

const confirmationRuntimeScript = path.join(projectRoot, '.github/ci/confirmation-runtime.mjs');
const browserHelperPath = path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/browser.mjs');
const orgHelperPath = path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/org.mjs');
const manifestPath = path.join(projectRoot, 'db/seed/p108-criteria-manifest.json');
const importScriptPath = path.join(projectRoot, 'scripts/p108-import-criteria.mjs');
const p108MigrationPath = path.join(projectRoot, 'supabase/migrations/20261017093100_p108_criteria_sets.sql');

const REQUIRED_CASES = [
  'period-2100-created-and-snapshot-roles-assigned',
  'flow-1-initial-open-unselected-empty-scores-and-metadata',
  'flow-1-note-comment-only-empty-score-draft',
  'flow-1-explicit-zero-partial-draft-and-submit-validation',
  'flow-1-manager-self-approved-leader-set',
  'flow-2-round-2-no-carry-forward-empty-selection',
  'flow-2-leader-two-rounds-approved-leader-set',
  'flow-3-subleader-three-rounds-approved-leader-set',
  'flow-4-return-resubmit-retained-data',
  'flow-4-employee-three-rounds-return-resubmit-staff-set',
  'flow-5-worker-three-rounds-approved-worker-set',
  'historical-preservation-approved-rounds-digest-unaltered',
  'drift-setup-period-2101-seeded',
  'drift-1-leader-to-employee',
  'drift-2-employee-to-leader',
  'drift-3-leader-to-worker',
  'drift-4-worker-to-leader',
  'drift-5-manager-to-leader',
  'drift-6-leader-to-manager',
  'drift-7-manager-to-subleader',
  'drift-8-subleader-to-manager',
  'grader-real-role-authorization-preserved-across-drift',
  'forged-cross-set-criterion-rejected-and-full-digest-preserved',
];

function parseArgs() {
  const args = process.argv.slice(2);
  let evidencePath = process.env.EVIDENCE_PATH || path.join(projectRoot, '.tmp/p108-evaluation-flow-evidence.json');
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--evidence' && args[i + 1]) {
      evidencePath = args[++i];
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

async function main() {
  console.log('=== P108 Evaluation Flow & Role Snapshot Integration Test ===\n');

  const { evidencePath } = parseArgs();
  const runId = crypto.randomUUID();
  const runSuffix = `${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
  const runtimeRoot = path.join(projectRoot, '.tmp', `kurabe-p108-flow-${runSuffix}`);
  const evidenceDir = path.join(projectRoot, '.tmp', `evidence-p108-flow-${runSuffix}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  let browser = null;
  let runtimeStarted = false;
  let mainError = null;
  const cleanupErrors = [];
  const recordedScreenshots = [];
  const caseResults = [];
  let runtimeState = null;
  let diagnosticPage = null;
  let diagnosticDb = null;

  function recordPass(caseName, meta = {}) {
    console.log(`[PASS] Case: ${caseName}`);
    caseResults.push({ name: caseName, status: 'PASS', ...meta });
  }

  try {
    // -------------------------------------------------------------------------
    // 1. Start then Bootstrap Disposable Confirmation Runtime
    // -------------------------------------------------------------------------
    // Next 16 `next dev` writes its Server Action manifest under .next/dev with ids that
    // change per run; drop any previous run's generated copy so only this run's is read.
    fs.rmSync(path.join(projectRoot, '.next', 'dev', 'server', 'server-reference-manifest.json'), { force: true });
    console.log(`[Runtime] Starting confirmation runtime at ${runtimeRoot}...`);
    const startRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'start'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
      timeout: 120000,
    });
    if (startRes.error) {
      throw new Error(`confirmation-runtime start spawn failed: ${startRes.error.message}`);
    }
    if (startRes.status !== 0) {
      throw new Error(`confirmation-runtime start failed with code ${startRes.status}`);
    }
    runtimeStarted = true;

    console.log('[Runtime] Bootstrapping confirmation runtime...');
    const bootRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'bootstrap'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
      timeout: 120000,
    });
    if (bootRes.error) {
      throw new Error(`confirmation-runtime bootstrap spawn failed: ${bootRes.error.message}`);
    }
    if (bootRes.status !== 0) {
      throw new Error(`confirmation-runtime bootstrap failed with code ${bootRes.status}`);
    }

    const statePath = path.join(runtimeRoot, 'runtime-state.json');
    assert.ok(fs.existsSync(statePath), 'runtime-state.json must exist');
    runtimeState = JSON.parse(fs.readFileSync(statePath, 'utf8'));

    const origin = `http://127.0.0.1:${runtimeState.nextPort}`;
    const dbTarget = {
      host: '127.0.0.1',
      port: String(runtimeState.dbPort),
      database: runtimeState.db,
      user: 'postgres',
      password: runtimeState.password,
    };

    function runPsql(sql) {
      const res = spawnSync('psql', [
        '-X', '-h', dbTarget.host, '-p', dbTarget.port, '-U', dbTarget.user, '-d', dbTarget.database,
        '-qAt', '-v', 'ON_ERROR_STOP=1',
      ], {
        cwd: projectRoot,
        input: sql,
        env: { ...process.env, PGPASSWORD: dbTarget.password, PGPASSFILE: '/dev/null' },
        encoding: 'utf8',
        timeout: 30000,
      });
      if (res.status !== 0) throw new Error(`psql error: ${redact(res.stderr || res.stdout)}`);
      return String(res.stdout || '').trim();
    }

    diagnosticDb = runPsql;

    function fullEvaluationLines(evaluationId) {
      return runPsql(`
        SELECT COALESCE(string_agg(line, E'\\n' ORDER BY line), '') FROM (
          SELECT 'e|' || e.id || '|' || e.status || '|' || COALESCE(e.current_round::text,'') || '|' || COALESCE(e.final_grade,'') || '|' || COALESCE(e.final_score::text,'') || '|' || COALESCE(e.return_note,'') AS line
          FROM public.evaluations e WHERE e.id = '${evaluationId}'
          UNION ALL
          SELECT 'r|' || r.id || '|' || r.evaluation_id || '|' || r.round || '|' || r.status || '|' || COALESCE(r.evaluator_id::text,'') || '|' || r.evaluator_role || '|' || COALESCE(r.total_score::text,'') || '|' || COALESCE(r.grade,'') || '|' || COALESCE(r.scores::text,'') || '|' || COALESCE(r.notes::text,'') || '|' || COALESCE(r.notes ->> '__meta_selected_level_indexes__','') || '|' || COALESCE(r.criteria_config_version_id::text,'') || '|' || COALESCE(r.grade_config_version_id::text,'') || '|' || COALESCE(r.comment,'') || '|' || COALESCE(r.additional_comment,'') || '|' || COALESCE(r.submitted_at::text,'') AS line
          FROM public.evaluation_rounds r WHERE r.evaluation_id = '${evaluationId}'
        ) s;
      `);
    }
    function fullEvaluationDigest(evaluationId) {
      return hashString(fullEvaluationLines(evaluationId));
    }

    console.log('[Runtime] Setting up fixture users and pointers in DB...');
    runPsql(`
      UPDATE public.users SET is_active = true, password_hash = NULL;
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'password_setup_required') THEN
          UPDATE public.users SET password_setup_required = false;
        END IF;
      END $$;
      UPDATE public.users SET subleader_id = (SELECT id FROM public.users WHERE employee_code = 'P103-SLB' LIMIT 1)
        WHERE employee_code IN ('P103-EMB', 'P103-WKB');
      UPDATE public.evaluation_periods SET status = 'closed';
    `);

    // -------------------------------------------------------------------------
    // 2. Import P108 3-Set G1 Criteria Manifest Unchanged
    // -------------------------------------------------------------------------
    console.log('[Runtime] Verifying criteria set_key column and running criteria import...');
    const setKeyCheck = runPsql("SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'criteria' AND column_name = 'set_key';");
    if (setKeyCheck !== '1' && fs.existsSync(p108MigrationPath)) {
      const migSql = fs.readFileSync(p108MigrationPath, 'utf8');
      runPsql(migSql);
    }

    // Unchanged G1 manifest (SHA-256 043ef0fd688c59664fea4e6209448e775ea7e4b7f797b5b40bfcdb6a2026caea)
    const g1Manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const leaderGroupA = g1Manifest.groups.find((g) => g.set_key === 'leader' && g.code === 'A');
    assert.ok(leaderGroupA, 'Leader Group A must exist in manifest');
    const leaderCritZero = leaderGroupA.criteria.find((c) => c.levels.some((l) => l.points === 0));
    assert.ok(leaderCritZero, 'Leader criterion with 0 points must exist');
    const leaderZeroLevel = leaderCritZero.levels.find((l) => l.points === 0);
    const leaderZeroCritId = leaderCritZero.id;
    const leaderZeroCritName = leaderCritZero.name;
    const leaderZeroIndex = leaderZeroLevel.sort_order ?? 0;
    const leaderZeroLabel = leaderZeroLevel.label;

    const leaderCritFive = leaderGroupA.criteria.find((c) => c.levels.some((l) => l.points === 5));
    assert.ok(leaderCritFive, 'Leader criterion with score 5 must exist');
    const leaderFiveLevel = leaderCritFive.levels.find((l) => l.points === 5);
    const leaderFiveCritId = leaderCritFive.id;
    const leaderFiveCritName = leaderCritFive.name;
    const leaderFiveIndex = leaderFiveLevel.sort_order ?? 0;
    const leaderFiveLabel = leaderFiveLevel.label;

    const leaderCritNeg = leaderGroupA.criteria.find((c) => c.levels.some((l) => l.points < 0));
    assert.ok(leaderCritNeg, 'Leader criterion with negative points must exist');
    const leaderNegLevel = leaderCritNeg.levels.find((l) => l.points < 0);
    const leaderNegCritId = leaderCritNeg.id;
    const leaderNegCritName = leaderCritNeg.name;
    const leaderNegIndex = leaderNegLevel.sort_order ?? 1;
    const leaderNegLabel = leaderNegLevel.label;

    const leaderCritNa = leaderGroupA.criteria.find((c) => c.levels.some((l) => l.label.toUpperCase() === 'N/A'));
    const leaderNaLevel = leaderCritNa?.levels.find((l) => l.label.toUpperCase() === 'N/A');
    const leaderNaCritId = leaderCritNa?.id;
    const leaderNaCritName = leaderCritNa?.name;
    const leaderNaIndex = leaderNaLevel?.sort_order ?? 2;
    const leaderNaLabel = leaderNaLevel?.label;

    const staffGroupA = g1Manifest.groups.find((g) => g.set_key === 'staff' && g.code === 'A');
    assert.ok(staffGroupA, 'Staff Group A must exist in manifest');
    const staffCritZero = staffGroupA.criteria.find((c) => c.levels.some((l) => l.points === 0));
    assert.ok(staffCritZero, 'Staff criterion with 0 points must exist');
    const staffZeroLevel = staffCritZero.levels.find((l) => l.points === 0);
    const staffZeroCritId = staffCritZero.id;
    const staffZeroCritName = staffCritZero.name;
    const staffZeroIndex = staffZeroLevel.sort_order ?? 0;
    const staffZeroLabel = staffZeroLevel.label;

    const currentVer = runPsql("SELECT COALESCE(max(version_no)::text, '1') FROM public.criteria_config_versions;");
    const importRes = spawnSync(process.execPath, [
      importScriptPath,
      '--apply',
      '--expected-version', currentVer,
      '--manifest', manifestPath,
      '--disposable',
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        KURABE_SUPABASE_URL: runtimeState.supabaseUrl,
        KURABE_SUPABASE_SERVICE_ROLE_KEY: runtimeState.serviceRoleKey,
      },
      encoding: 'utf8',
      timeout: 30000,
    });
    if (importRes.status !== 0) {
      throw new Error(`Criteria import failed: ${importRes.stderr || importRes.stdout}`);
    }
    console.log('[Runtime] Criteria import successful.');

    // Parse every late digest/version query against the migrated schema before
    // browser journeys. Selected indexes are JSON metadata inside notes.
    const absentFixtureId = '00000000-0000-0000-0000-000000000000';
    assert.equal(fullEvaluationDigest(absentFixtureId), hashString(''));
    assert.equal(computePeriodHistoryDigest(absentFixtureId), '');
    for (const relation of ['criteria_config_versions', 'grade_band_versions']) {
      assert.match(runPsql(`SELECT id FROM public.${relation} WHERE is_active IS TRUE;`),
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
        `${relation} must expose exactly one active version`);
    }

    // Read DB zero level back with deterministic criterionID from that clone, active criterion/version filters.
    // Do not modify any stored snapshot or level after importer.
    const leaderZeroCritRow = runPsql(`
      SELECT c.id || '|' || cl.sort_order || '|' || cl.points || '|' || cl.label
      FROM public.criterion_levels cl
      JOIN public.criteria c ON c.id = cl.criterion_id
      WHERE c.id = '${leaderZeroCritId}' AND cl.sort_order = ${leaderZeroIndex}
        AND c.is_active IS TRUE AND cl.is_active IS TRUE;
    `);
    assert.ok(leaderZeroCritRow, 'Leader zero-point level must be found in active DB criteria');
    const [, leaderZeroIdxStr, leaderZeroPointsStr, readLeaderZeroLabel] = leaderZeroCritRow.split('|');
    assert.equal(Number(leaderZeroPointsStr), 0, 'Leader zero-point level must have 0 points in DB');
    assert.equal(Number(leaderZeroIdxStr), leaderZeroIndex, 'Leader zero-point level sort_order must match');
    assert.equal(readLeaderZeroLabel, leaderZeroLabel, 'Leader zero-point level label must match');

    const staffZeroCritRow = runPsql(`
      SELECT c.id || '|' || cl.sort_order || '|' || cl.points || '|' || cl.label
      FROM public.criterion_levels cl
      JOIN public.criteria c ON c.id = cl.criterion_id
      WHERE c.id = '${staffZeroCritId}' AND cl.sort_order = ${staffZeroIndex}
        AND c.is_active IS TRUE AND cl.is_active IS TRUE;
    `);
    assert.ok(staffZeroCritRow, 'Staff zero-point level must be found in active DB criteria');
    const [, staffZeroIdxStr, staffZeroPointsStr, readStaffZeroLabel] = staffZeroCritRow.split('|');
    assert.equal(Number(staffZeroPointsStr), 0, 'Staff zero-point level must have 0 points in DB');
    assert.equal(Number(staffZeroIdxStr), staffZeroIndex, 'Staff zero-point level sort_order must match');
    assert.equal(readStaffZeroLabel, staffZeroLabel, 'Staff zero-point level label must match');

    // Immutable versions use version_id, unlike live rows' is_active flags.
    assert.equal(runPsql(`
      SELECT count(*) FROM public.criterion_level_versions lv
      JOIN public.criteria_config_versions v ON v.id = lv.version_id
      WHERE v.is_active IS TRUE AND lv.criterion_id IN ('${leaderZeroCritId}', '${staffZeroCritId}')
        AND lv.sort_order = ${leaderZeroIndex} AND lv.points = 0;
    `), '2', 'Both zero levels must also exist in the active immutable snapshot');

    // Counts 18/93 unchanged, criteria defaults are NULL in unchanged G1 manifest
    const totalGroupsDb = runPsql("SELECT count(*) FROM public.criteria_groups WHERE is_active IS TRUE;");
    const totalCriteriaDb = runPsql("SELECT count(*) FROM public.criteria WHERE is_active IS TRUE;");
    assert.equal(totalGroupsDb, '18', 'Active criteria groups count must be 18');
    assert.equal(totalCriteriaDb, '93', 'Active criteria count must be 93');

    const nullDefaultsCount = Number(runPsql(`
      SELECT count(*) FROM public.criteria c
      WHERE c.is_active IS TRUE AND c.default_level_index IS NULL;
    `));
    assert.equal(nullDefaultsCount, 93, 'All 93 criteria in G1 manifest must have default_level_index IS NULL in DB');

    async function countCurrentUiSelections(p) {
      return p.evaluate(`(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.filter(b => b.className.includes('ring-brand') && b.querySelector('.rounded-full') !== null).length;
      })()`);
    }

    async function selectAllCriteriaAcrossGroups(p, maybeLabelOrOptions = {}, maybeOptions = {}) {
      const options = (typeof maybeLabelOrOptions === 'object' && maybeLabelOrOptions !== null)
        ? maybeLabelOrOptions
        : maybeOptions;
      const expectedGroupCount = options.expectedGroupCount ?? 6;

      // Like the original selectTopLevel helper, wait for independently loaded criteria.
      await p.waitFor(`(() => {
        const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
        const h3s = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.parentElement?.querySelectorAll('h3') || [];
        return tabs.length === ${expectedGroupCount} && h3s.length > 0;
      })()`, { timeout: 30000, label: 'all-group criteria ready' });
      const groupCount = await p.evaluate(`(() => {
        const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
        return tabs.length;
      })()`);
      assert.equal(groupCount, expectedGroupCount, `P108 must have exactly ${expectedGroupCount} criteria group tabs`);

      // The first navigation owns the actual criteria region; the second is a footer shortcut.
      // Derive expected set from the subject snapshot, never the viewer or live role.
      const subjectId = (await p.evaluate('location.pathname')).split('/')[2];
      assert.match(subjectId, /^[0-9a-f-]{36}$/i);
      const snapshotRole = runPsql(`SELECT e.employee_role FROM public.evaluations e
        JOIN public.evaluation_periods ep ON ep.id=e.period_id
        WHERE e.employee_id='${subjectId}' AND ep.status='active';`);
      const setKey = {Manager:'leader',Leader:'leader',SubLeader:'leader',Employee:'staff',Worker:'worker'}[snapshotRole];
      assert.ok(setKey, `Known snapshot role required: ${snapshotRole}`);
      const expectedGroups = g1Manifest.groups.filter(g => g.set_key === setKey);
      assert.equal(expectedGroups.length, expectedGroupCount);
      const actualGroupIds = await p.evaluate(`Array.from(document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]').querySelectorAll('button[role="tab"]')).map(b => b.id.replace(/^tab-/,''))`);
      assert.deepEqual(actualGroupIds, expectedGroups.map(g => g.id), 'Primary navigation must cover exactly the pinned subject set groups');
      const expectedTotal = expectedGroups.reduce((n,g) => n + g.criteria.length, 0);
      assert.equal(expectedTotal, setKey === 'leader' ? 33 : 30);
      let totalClicked = 0;
      for (let groupIndex = 0; groupIndex < groupCount; groupIndex++) {
        await p.evaluate(`(() => {
          const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
          if (tabs[${groupIndex}]) tabs[${groupIndex}].click();
        })()`);

        await p.waitFor(
          `(() => {
            const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
            return tabs[${groupIndex}] && tabs[${groupIndex}].getAttribute('aria-selected') === 'true';
          })()`,
          { timeout: 10000, label: `Group tab ${groupIndex} selected` }
        );

        const expectedNames = expectedGroups[groupIndex].criteria.map(c => c.name).sort();
        const actualNames = await p.evaluate(`Array.from(document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]').parentElement.querySelectorAll('h3')).map(h => h.lastElementChild.textContent.trim()).sort()`);
        assert.deepEqual(actualNames, expectedNames, 'Every visible criterion must belong to the exact expected group/set');
        const clickedInGroup = await p.evaluate(`(() => {
          let count = 0;
          const region = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]').parentElement;
          const h3s = Array.from(region.querySelectorAll('h3'));
          for (const h3 of h3s) {
            const card = h3.closest('div.border') || h3.closest('.rounded-2xl') || h3.parentElement.parentElement.parentElement;
            if (!card) continue;
            const grid = card.querySelector('.grid');
            const buttons = grid
              ? Array.from(grid.querySelectorAll('button:not(:disabled)'))
              : Array.from(card.querySelectorAll('button:not(:disabled)')).filter(b => !b.textContent.includes('Ghi chú'));
            if (buttons.length > 0) {
              buttons[0].click();
              count++;
            }
          }
          return count;
        })()`);
        assert.ok(clickedInGroup > 0, `Must click criteria in group tab ${groupIndex}`);
        totalClicked += clickedInGroup;

        assert.equal(clickedInGroup, expectedNames.length, 'Choose one explicit level for every criterion, not merely one per group');
        await p.waitFor(`(() => {
          const region = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]').parentElement;
          return [...region.querySelectorAll('button')].filter(b => b.className.includes('ring-brand') && b.querySelector('.rounded-full')).length === ${expectedNames.length};
        })()`, {timeout:10000,label:'all criterion choices rendered'});
        const selectedCountInGroup = await countCurrentUiSelections(p);
        assert.equal(selectedCountInGroup, expectedNames.length);
        assert.ok(selectedCountInGroup > 0, `Current selected count in group ${groupIndex} must be positive`);
      }

      assert.ok(totalClicked > 0, 'Total clicked criteria across all groups must be positive');
      assert.equal(totalClicked, expectedTotal, 'All 33/30 criteria of the exact subject set must be explicitly chosen');
      console.log('GROUP_COVERAGE '+JSON.stringify({subjectId,setKey,groups:actualGroupIds,criteria:totalClicked}));

      // Return to FIRST group after selection so zero/note tests use first criterion
      await p.evaluate(`(() => {
        const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
        if (tabs[0]) tabs[0].click();
      })()`);
      await p.waitFor(
        `(() => {
          const tabs = document.querySelector('[role="tablist"][aria-label="Nhóm tiêu chí"]')?.querySelectorAll('button[role="tab"]') || [];
          return tabs[0] && tabs[0].getAttribute('aria-selected') === 'true';
        })()`,
        { timeout: 10000, label: 'First group tab re-selected' }
      );

      return totalClicked;
    }

    async function clickCriterionLevelByCriterionName(p, criterionName, levelLabel) {
      const clicked = await p.evaluate(`(() => {
        const h3s = Array.from(document.querySelectorAll('h3'));
        const h3 = h3s.find(el => el.textContent && el.textContent.includes(${JSON.stringify(criterionName)}));
        if (!h3) return false;
        const card = h3.closest('div.border') || h3.closest('.rounded-2xl') || h3.parentElement.parentElement.parentElement;
        if (!card) return false;
        const buttons = Array.from(card.querySelectorAll('button:not(:disabled)'));
        const targetBtn = buttons.find(b => {
          const p = b.querySelector('p');
          return p && p.textContent.trim() === ${JSON.stringify(levelLabel)};
        });
        if (targetBtn) {
          targetBtn.click();
          return true;
        }
        return false;
      })()`);
      assert.ok(clicked, `Must find and click level button "${levelLabel}" row-scoped to criterion "${criterionName}"`);
    }

    async function pollDbRound(psqlFn, evalId, roundNo, predicate, { timeout = 15000, interval = 200, label = 'DB round poll' } = {}) {
      const start = Date.now();
      let lastRow = null;
      while (Date.now() - start < timeout) {
        const raw = psqlFn(`
          SELECT json_build_object(
            'status', status,
            'scores', scores,
            'comment', COALESCE(comment, ''),
            'notes', notes,
            'metaIndexes', COALESCE(notes ->> '__meta_selected_level_indexes__', '{}')
          ) FROM public.evaluation_rounds WHERE evaluation_id = '${evalId}' AND round = ${roundNo};
        `);
        if (raw && raw !== '{}') {
          try {
            lastRow = JSON.parse(raw);
            if (typeof lastRow.metaIndexes === 'string') {
              lastRow.metaIndexes = JSON.parse(lastRow.metaIndexes);
            }
            if (predicate(lastRow)) {
              return lastRow;
            }
          } catch {}
        }
        await new Promise((r) => setTimeout(r, interval));
      }
      throw new Error(`Timed out waiting for ${label} on eval ${evalId} round ${roundNo}: last data=${JSON.stringify(lastRow)}`);
    }

    // -------------------------------------------------------------------------
    // 3. Launch Headless Chromium at Desktop Viewport (1440x900)
    // -------------------------------------------------------------------------
    console.log('[Browser] Launching Chromium...');
    const { launchChromium } = await import(`file://${browserHelperPath}`);
    const {
      loginAs,
      openEvaluation,
      returnRoundViaUi,
      createPeriodViaUi,
      loadActionManifest,
      browserAction,
    } = await import(`file://${orgHelperPath}`);
    const { waitFor: waitForCondition } = await import(`file://${path.join(path.dirname(browserHelperPath), 'guard.mjs')}`);

    // Positive Submit must await this action's success, not the previous negative-test toast.
    // Keep the shared helper's 40s deadline and leave the P107 helper untouched.
    async function submitViaUi(p) {
      await p.clickText('Gửi Đánh giá');
      await p.waitFor("document.body.innerText.toLowerCase().includes('đánh giá đã được gửi thành công') || location.pathname === '/employees'",
        {timeout:40000,label:'current Submit completed'});
      return p.evaluate('document.body.innerText');
    }

    // The shared P107 helper can accept a prior transient toast as completion.
    // Observe a new first-party POST response for this click instead of using toast freshness.
    async function saveDraftViaUiFresh(p) {
      await p.waitFor(
        "[...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Lưu bản nháp') && !b.disabled)",
        { timeout: 30000, label: 'draft save button enabled' },
      );
      const actionUrl = `${origin}${await p.evaluate('location.pathname')}`;
      const priorPosts = p.requests(5000).filter((request) => request.method === 'POST' && request.url === actionUrl);
      assert.equal(priorPosts.filter((request) => request.status === null).length, 0,
        'No prior draft POST may still be pending before a new save');
      await p.clickText('Lưu bản nháp');
      const currentPost = await waitForCondition(() => {
        const posts = p.requests(5000).filter((request) => request.method === 'POST' && request.url === actionUrl);
        if (posts.length <= priorPosts.length) return false;
        return posts[priorPosts.length].status === null ? false : posts[priorPosts.length];
      }, { timeout: 40000, interval: 150, label: 'current draft POST response received' });
      assert.equal(currentPost.status, 200, 'Current draft server action must return HTTP 200');
      await p.waitFor(
        "[...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Lưu bản nháp') && !b.disabled)",
        { timeout: 15000, label: 'current draft save button re-enabled' },
      );
      return p.evaluate('document.body.innerText');
    }

    browser = await launchChromium({ runtimeRoot, headless: true });
    const page = await browser.newPage('p108-evaluation-flow');
    diagnosticPage = page;
    await page.setViewport(1440, 900);

    // -------------------------------------------------------------------------
    // 4. Create Active Period 2100 via Manager UI & Verify Snapshot Roles
    // -------------------------------------------------------------------------
    console.log('[Flow] Logging in as Manager (P103-MGR) to create period 2100...');
    await loginAs(page, origin, 'P103-MGR');
    await createPeriodViaUi(page, origin, 2100);

    const period2100Id = runPsql("SELECT id FROM public.evaluation_periods WHERE year = 2100 AND status = 'active' LIMIT 1;");
    assert.ok(period2100Id, 'Created period 2100 must exist in active state');

    const managerId = runPsql("SELECT id FROM public.users WHERE employee_code = 'P103-MGR';");
    const leaderAId = runPsql("SELECT id FROM public.users WHERE employee_code = 'P103-LDA';");
    const leaderCId = runPsql("SELECT id FROM public.users WHERE employee_code = 'P103-LDC';");
    const subleaderBId = runPsql("SELECT id FROM public.users WHERE employee_code = 'P103-SLB';");
    const employeeBId = runPsql("SELECT id FROM public.users WHERE employee_code = 'P103-EMB';");
    const workerBId = runPsql("SELECT id FROM public.users WHERE employee_code = 'P103-WKB';");

    const getEvalId = (userId, periodId = period2100Id) =>
      runPsql(`SELECT id FROM public.evaluations WHERE period_id = '${periodId}' AND employee_id = '${userId}';`);

    const evalManager = getEvalId(managerId);
    const evalLeaderA = getEvalId(leaderAId);
    const evalLeaderC = getEvalId(leaderCId);
    const evalSubLeaderB = getEvalId(subleaderBId);
    const evalEmployeeB = getEvalId(employeeBId);
    const evalWorkerB = getEvalId(workerBId);

    assert.equal(runPsql(`SELECT employee_role FROM public.evaluations WHERE id = '${evalManager}';`), 'Manager');
    assert.equal(runPsql(`SELECT employee_role FROM public.evaluations WHERE id = '${evalLeaderA}';`), 'Leader');
    assert.equal(runPsql(`SELECT employee_role FROM public.evaluations WHERE id = '${evalLeaderC}';`), 'Leader');
    assert.equal(runPsql(`SELECT employee_role FROM public.evaluations WHERE id = '${evalSubLeaderB}';`), 'SubLeader');
    assert.equal(runPsql(`SELECT employee_role FROM public.evaluations WHERE id = '${evalEmployeeB}';`), 'Employee');
    assert.equal(runPsql(`SELECT employee_role FROM public.evaluations WHERE id = '${evalWorkerB}';`), 'Worker');

    recordPass('period-2100-created-and-snapshot-roles-assigned');

    // -------------------------------------------------------------------------
    // 5. Valid Five-Flow UI Journeys over their Own Sets (Period 2100)
    // -------------------------------------------------------------------------
    console.log('\n[Flow 1/5] Testing Manager subject (Leader Set, 1 round self-approve)...');
    {
      await loginAs(page, origin, 'P103-MGR');
      await openEvaluation(page, origin, managerId);
      await page.waitFor("document.body.innerText.includes('Tỷ lệ hiện diện')", {
        timeout: 20000,
        label: 'Leader criteria rendered',
      });

      // 1. Wait DB round 1 status Draft (first-open autosave)
      const round1DbInit = await pollDbRound(runPsql, evalManager, 1,
        (r) => r.status === 'Draft',
        { label: 'Round 1 Draft status settled for Manager' }
      );
      assert.deepEqual(round1DbInit.scores, {}, 'Round 1 DB scores must be {} on initial open');
      assert.deepEqual(round1DbInit.metaIndexes, {}, 'Round 1 DB meta indexes must be {} on initial open');

      // Assert UI current selection count 0 despite configured defaults
      const initialUiSelections = await countCurrentUiSelections(page);
      assert.equal(initialUiSelections, 0, 'UI current selection count must be 0 on initial open despite configured defaults');

      // Reopen/idle/save Draft unselected, prove same DB maps
      const saveUnselectedRes = await saveDraftViaUiFresh(page);
      assert.match(saveUnselectedRes, /Đã lưu bản nháp/i);

      const round1DbAfterSave = await pollDbRound(runPsql, evalManager, 1,
        (r) => r.status === 'Draft',
        { label: 'Round 1 Draft after unselected save' }
      );
      assert.deepEqual(round1DbAfterSave.scores, {}, 'Round 1 DB scores must remain {} after saving unselected Draft');
      assert.deepEqual(round1DbAfterSave.metaIndexes, {}, 'Round 1 DB meta indexes must remain {} after saving unselected Draft');

      await page.goto(`${origin}/evaluations/${managerId}`);
      await page.waitFor("document.body.innerText.includes('Tỷ lệ hiện diện')", { timeout: 20000 });
      const reopenedUiSelections = await countCurrentUiSelections(page);
      assert.equal(reopenedUiSelections, 0, 'Reopened unselected Draft must have selection count 0');
      recordPass('flow-1-initial-open-unselected-empty-scores-and-metadata');

      // 2. Note/comment-only empty-score Draft: set real controlled fields, save UI, read DB and reopen
      await page.fill('textarea[placeholder="Nhập nhận xét tổng quát cho kỳ đánh giá này..."]', 'Bản nháp nhận xét tổng quát P108 G1');
      await page.evaluate(`(() => {
        const noteBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Ghi chú'));
        if (noteBtn) noteBtn.click();
      })()`);
      await page.waitFor("document.querySelector(\"input[placeholder*='Ghi chú cho']\") !== null", { timeout: 10000, label: 'note input visible' });
      await page.fill("input[placeholder*='Ghi chú cho']", 'Ghi chú tiêu chí thử nghiệm');

      const saveNoteDraftRes = await saveDraftViaUiFresh(page);
      assert.match(saveNoteDraftRes, /Đã lưu bản nháp/i);

      const round1DbNote = await pollDbRound(runPsql, evalManager, 1,
        (r) => r.comment === 'Bản nháp nhận xét tổng quát P108 G1' &&
               r.notes && Object.values(r.notes).includes('Ghi chú tiêu chí thử nghiệm'),
        { label: 'Round 1 comment and note persisted' }
      );
      assert.deepEqual(round1DbNote.scores, {}, 'Note/comment-only Draft must have scores {}');
      assert.deepEqual(round1DbNote.metaIndexes, {}, 'Note/comment-only Draft must have meta indexes {}');
      assert.equal(round1DbNote.comment, 'Bản nháp nhận xét tổng quát P108 G1');
      assert.ok(Object.values(round1DbNote.notes).some(v => v === 'Ghi chú tiêu chí thử nghiệm'));

      await page.goto(`${origin}/evaluations/${managerId}`);
      await page.waitFor(
        "document.querySelector(\"textarea[placeholder='Nhập nhận xét tổng quát cho kỳ đánh giá này...']\") !== null && document.querySelector(\"textarea[placeholder='Nhập nhận xét tổng quát cho kỳ đánh giá này...']\").value === 'Bản nháp nhận xét tổng quát P108 G1'",
        { timeout: 20000, label: 'comment hydrated' }
      );
      await page.waitFor(
        "document.querySelector(\"input[placeholder*='Ghi chú cho']\") !== null && document.querySelector(\"input[placeholder*='Ghi chú cho']\").value === 'Ghi chú tiêu chí thử nghiệm'",
        { timeout: 20000, label: 'note hydrated' }
      );
      const restoredComment = await page.evaluate("document.querySelector('textarea[placeholder=\"Nhập nhận xét tổng quát cho kỳ đánh giá này...\"]')?.value");
      assert.equal(restoredComment, 'Bản nháp nhận xét tổng quát P108 G1', 'Comment must be restored upon reopen');
      const restoredNote = await page.evaluate("document.querySelector('input[placeholder*=\"Ghi chú cho\"]')?.value");
      assert.equal(restoredNote, 'Ghi chú tiêu chí thử nghiệm', 'Criterion note must be restored upon reopen');
      recordPass('flow-1-note-comment-only-empty-score-draft');

      // 3. User explicit zero on a single criterion via UI: pick real zero-point level ROW-SCOPED
      await clickCriterionLevelByCriterionName(page, leaderZeroCritName, leaderZeroLabel);
      const saveZeroRes = await saveDraftViaUiFresh(page);
      assert.match(saveZeroRes, /Đã lưu bản nháp/i);

      const round1DbZero = await pollDbRound(runPsql, evalManager, 1,
        (r) => Object.keys(r.scores).length === 1 && r.scores[leaderZeroCritId] === 0,
        { label: 'Round 1 zero score persisted' }
      );
      assert.equal(Object.keys(round1DbZero.scores).length, 1, 'Must have exactly ONE score key in partial draft');
      assert.equal(round1DbZero.scores[leaderZeroCritId], 0, 'Score for chosen criterion must be 0');
      assert.equal(Object.keys(round1DbZero.metaIndexes).length, 1, 'Must have exactly ONE meta index key in partial draft');
      assert.equal(round1DbZero.metaIndexes[leaderZeroCritId], leaderZeroIndex, 'Meta index must match zero level index');

      // Reopen and assert retained UI+DB
      await page.goto(`${origin}/evaluations/${managerId}`);
      await page.waitFor("document.body.innerText.includes('Tỷ lệ hiện diện')", { timeout: 20000 });
      const reopenedZeroSelections = await countCurrentUiSelections(page);
      assert.equal(reopenedZeroSelections, 1, 'Reopened partial draft must retain exactly 1 selection in UI');

      // Exercise page reload to verify refetch race safety
      await page.goto(`${origin}/evaluations/${managerId}`);
      await page.waitFor(
        `(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.filter(b => b.className.includes('ring-brand') && b.querySelector('.rounded-full') !== null).length === 1;
        })()`,
        { timeout: 20000, label: 'partial draft selection restored (1)' }
      );
      const reloadedZeroSelections = await countCurrentUiSelections(page);
      assert.equal(reloadedZeroSelections, 1, 'Reloaded partial draft must retain selection without refetch race wipe');

      // Incomplete submit by UI must show exact completeness reason from validator.ts:276 and no DB mutation
      const linesBeforeIncomplete = fullEvaluationLines(evalManager);
      const digestBeforeIncomplete = hashString(linesBeforeIncomplete);
      await page.clickText('Gửi Đánh giá');
      await page.waitFor(
        "document.body && document.body.innerText.includes('Vui lòng hoàn thành đánh giá cho tất cả các tiêu chí trước khi gửi.')",
        { timeout: 10000, label: 'exact incomplete submit validation reason' }
      );
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalManager}';`), 'Draft', 'Evaluation status must remain Draft after incomplete submit');
      assert.equal(hashString(fullEvaluationLines(evalManager)), digestBeforeIncomplete, 'Zero DB mutation on incomplete submit attempt');
      recordPass('flow-1-explicit-zero-partial-draft-and-submit-validation');

      // Complete ALL required criteria across all groups with real UI choices
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });

      // In Group A (returned to by helper): explicitly exercise score 5, actual 0, negative value, and N/A level
      await clickCriterionLevelByCriterionName(page, leaderFiveCritName, leaderFiveLabel);
      await clickCriterionLevelByCriterionName(page, leaderZeroCritName, leaderZeroLabel);
      await clickCriterionLevelByCriterionName(page, leaderNegCritName, leaderNegLabel);
      if (leaderCritNa && leaderNaLabel) {
        await clickCriterionLevelByCriterionName(page, leaderNaCritName, leaderNaLabel);
      }

      // Save complete draft via UI, read back from DB, reload page
      const saveCompleteDraftRes = await saveDraftViaUiFresh(page);
      assert.match(saveCompleteDraftRes, /Đã lưu bản nháp/i);

      const round1DbCompleteDraft = await pollDbRound(runPsql, evalManager, 1,
        (r) => Object.keys(r.scores).length === 33 &&
               r.scores[leaderFiveCritId] === 5 &&
               r.scores[leaderZeroCritId] === 0 &&
               r.scores[leaderNegCritId] === leaderNegLevel.points,
        { label: 'Round 1 complete draft with 5, 0, neg persisted' }
      );
      assert.equal(round1DbCompleteDraft.scores[leaderFiveCritId], 5, 'Must retain score 5 in Draft');
      assert.equal(round1DbCompleteDraft.scores[leaderZeroCritId], 0, 'Must retain actual 0 score in Draft');
      assert.equal(round1DbCompleteDraft.scores[leaderNegCritId], leaderNegLevel.points, 'Must retain negative score in Draft');
      if (leaderCritNa) {
        assert.equal(round1DbCompleteDraft.scores[leaderNaCritId], 0, 'Must retain N/A score 0 in Draft');
        assert.equal(round1DbCompleteDraft.metaIndexes[leaderNaCritId], leaderNaIndex, 'Must retain N/A meta index in Draft');
      }

      // Reload page and verify selections retained in UI
      await page.goto(`${origin}/evaluations/${managerId}`);
      await page.waitFor(
        `(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.filter(b => b.className.includes('ring-brand') && b.querySelector('.rounded-full') !== null).length === 8;
        })()`,
        { timeout: 20000, label: 'complete Group A selections restored (8)' }
      );
      const reloadedGroupSelections = await countCurrentUiSelections(page);
      assert.equal(reloadedGroupSelections, 8, 'Group A must retain all 8 selections after reload');

      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalManager}';`), 'Approved');
      assert.equal(runPsql(`SELECT status FROM public.evaluation_rounds WHERE evaluation_id = '${evalManager}' AND round = 1;`), 'Submitted');
      const finalManagerScores = JSON.parse(runPsql(`SELECT scores FROM public.evaluation_rounds WHERE evaluation_id = '${evalManager}' AND round = 1;`));
      assert.equal(finalManagerScores[leaderFiveCritId], 5, 'Submitted round must retain score 5');
      assert.equal(finalManagerScores[leaderZeroCritId], 0, 'Submitted round must retain explicit zero score');
      assert.equal(finalManagerScores[leaderNegCritId], leaderNegLevel.points, 'Submitted round must retain negative score');
      if (leaderCritNa) {
        assert.equal(finalManagerScores[leaderNaCritId], 0, 'Submitted round must retain N/A level score');
      }
      recordPass('flow-1-manager-self-approved-leader-set');
    }

    console.log('[Flow 2/5] Testing Leader subject (Leader Set, 2 rounds: self -> Manager approve)...');
    {
      await loginAs(page, origin, 'P103-LDA');
      await openEvaluation(page, origin, leaderAId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);

      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalLeaderA}';`), 'Submitted');
      assert.equal(runPsql(`SELECT current_round FROM public.evaluations WHERE id = '${evalLeaderA}';`), '2');
      assert.equal(runPsql(`SELECT evaluator_id FROM public.evaluation_rounds WHERE evaluation_id = '${evalLeaderA}' AND round = 2;`), managerId);

      // Prior round 1 is submitted and nonempty
      const r1Scores = JSON.parse(runPsql(`SELECT scores FROM public.evaluation_rounds WHERE evaluation_id = '${evalLeaderA}' AND round = 1;`));
      assert.ok(Object.keys(r1Scores).length > 0, 'Round 1 must be submitted and nonempty');

      await loginAs(page, origin, 'P103-MGR');
      await openEvaluation(page, origin, leaderAId);

      // Wait new autosave Draft for round 2
      const r2DbInit = await pollDbRound(runPsql, evalLeaderA, 2, (r) => r.status === 'Draft', { label: 'Round 2 Draft status settled' });
      assert.deepEqual(r2DbInit.scores, {}, 'Round 2 DB scores must be {} (no carry-forward)');
      assert.deepEqual(r2DbInit.metaIndexes, {}, 'Round 2 DB meta indexes must be {} (no carry-forward)');

      const r2UiSelections = await countCurrentUiSelections(page);
      assert.equal(r2UiSelections, 0, 'Round 2 UI current selection count must be 0 (no carry-forward)');

      // Previous-round reference data still present
      const hasL1Badge = await page.evaluate("document.body.innerText.includes('L1:')");
      assert.equal(hasL1Badge, true, 'Previous-round L1 reference badges must be present in UI');
      recordPass('flow-2-round-2-no-carry-forward-empty-selection');

      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);

      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalLeaderA}';`), 'Approved');
      assert.equal(runPsql(`SELECT status FROM public.evaluation_rounds WHERE evaluation_id = '${evalLeaderA}' AND round = 2;`), 'Submitted');
      recordPass('flow-2-leader-two-rounds-approved-leader-set');
    }

    console.log('[Flow 3/5] Testing SubLeader subject (Leader Set, 3 rounds: self -> Leader -> Manager)...');
    {
      await loginAs(page, origin, 'P103-SLB');
      await openEvaluation(page, origin, subleaderBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalSubLeaderB}';`), 'Submitted');

      await loginAs(page, origin, 'P103-LDA');
      await openEvaluation(page, origin, subleaderBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalSubLeaderB}';`), 'Reviewed');
      assert.equal(runPsql(`SELECT current_round FROM public.evaluations WHERE id = '${evalSubLeaderB}';`), '3');

      await loginAs(page, origin, 'P103-MGR');
      await openEvaluation(page, origin, subleaderBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalSubLeaderB}';`), 'Approved');
      recordPass('flow-3-subleader-three-rounds-approved-leader-set');
    }

    console.log('[Flow 4/5] Testing Employee subject (Staff Set, 3 rounds + return/resubmit)...');
    {
      await loginAs(page, origin, 'P103-SLB');
      await openEvaluation(page, origin, employeeBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalEmployeeB}';`), 'Submitted');

      await loginAs(page, origin, 'P103-LDA');
      await openEvaluation(page, origin, employeeBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });

      // Change one round 2 criterion to explicit zero row-scoped before original submit to distinguish from round 1
      await clickCriterionLevelByCriterionName(page, staffZeroCritName, staffZeroLabel);

      // Create NONEMPTY criterion note in addition to existing distinct zero/comment before first submit
      await page.evaluate(`(() => {
        const noteBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Ghi chú'));
        if (noteBtn) noteBtn.click();
      })()`);
      await page.waitFor("document.querySelector(\"input[placeholder*='Ghi chú cho']\") !== null", { timeout: 10000, label: 'note input visible' });
      await page.fill("input[placeholder*='Ghi chú cho']", 'Ghi chú vòng 2 trước khi trả lại');

      await page.fill('textarea[placeholder="Nhập nhận xét tổng quát cho kỳ đánh giá này..."]', 'Round 2 review note before return');

      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalEmployeeB}';`), 'Reviewed');
      assert.equal(runPsql(`SELECT current_round FROM public.evaluations WHERE id = '${evalEmployeeB}';`), '3');

      // Capture score + selected metadata + notes/comment of round 2 BEFORE Return
      const r2BeforeReturn = JSON.parse(runPsql(`
        SELECT json_build_object(
          'scores', scores,
          'metaIndexes', COALESCE(notes ->> '__meta_selected_level_indexes__', '{}'),
          'notes', notes,
          'comment', COALESCE(comment, '')
        ) FROM public.evaluation_rounds WHERE evaluation_id = '${evalEmployeeB}' AND round = 2;
      `));
      if (typeof r2BeforeReturn.metaIndexes === 'string') {
        r2BeforeReturn.metaIndexes = JSON.parse(r2BeforeReturn.metaIndexes);
      }
      assert.equal(r2BeforeReturn.scores[staffZeroCritId], 0, 'Round 2 before return must contain explicit zero score');
      assert.equal(r2BeforeReturn.comment, 'Round 2 review note before return');
      assert.ok(
        Object.values(r2BeforeReturn.notes).includes('Ghi chú vòng 2 trước khi trả lại'),
        'Round 2 before return must contain non-empty criterion note'
      );

      // Manager executes Return
      await loginAs(page, origin, 'P103-MGR');
      await openEvaluation(page, origin, employeeBId);
      await returnRoundViaUi(page, 'P108 return for resubmit');
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalEmployeeB}';`), 'Submitted');
      assert.equal(runPsql(`SELECT current_round FROM public.evaluations WHERE id = '${evalEmployeeB}';`), '2');
      assert.equal(runPsql(`SELECT status FROM public.evaluation_rounds WHERE evaluation_id = '${evalEmployeeB}' AND round = 2;`), 'Draft');
      assert.equal(runPsql(`SELECT status FROM public.evaluation_rounds WHERE evaluation_id = '${evalEmployeeB}' AND round = 3;`), 'NotStarted');

      // Reopen SAME round 2 by Leader P103-LDA
      await loginAs(page, origin, 'P103-LDA');
      await openEvaluation(page, origin, employeeBId);

      // Verify UI renders hydrated fields
      await page.waitFor(
        "document.querySelector(\"textarea[placeholder='Nhập nhận xét tổng quát cho kỳ đánh giá này...']\") !== null && document.querySelector(\"textarea[placeholder='Nhập nhận xét tổng quát cho kỳ đánh giá này...']\").value === 'Round 2 review note before return'",
        { timeout: 20000, label: 'reopened round 2 comment hydrated' }
      );
      await page.waitFor(
        "document.querySelector(\"input[placeholder*='Ghi chú cho']\") !== null && document.querySelector(\"input[placeholder*='Ghi chú cho']\").value === 'Ghi chú vòng 2 trước khi trả lại'",
        { timeout: 20000, label: 'reopened round 2 note hydrated' }
      );
      const reopenedComment = await page.evaluate("document.querySelector('textarea[placeholder=\"Nhập nhận xét tổng quát cho kỳ đánh giá này...\"]')?.value");
      assert.equal(reopenedComment, r2BeforeReturn.comment, 'Reopened round 2 comment must match before-return data');
      const reopenedNote = await page.evaluate("document.querySelector('input[placeholder*=\"Ghi chú cho\"]')?.value");
      assert.equal(reopenedNote, 'Ghi chú vòng 2 trước khi trả lại', 'Reopened round 2 note must match before-return data');

      // Verify DB round 2 fields match before-return across all 4 payload fields
      const r2ReopenedDb = JSON.parse(runPsql(`
        SELECT json_build_object(
          'scores', scores,
          'metaIndexes', COALESCE(notes ->> '__meta_selected_level_indexes__', '{}'),
          'notes', notes,
          'comment', COALESCE(comment, '')
        ) FROM public.evaluation_rounds WHERE evaluation_id = '${evalEmployeeB}' AND round = 2;
      `));
      if (typeof r2ReopenedDb.metaIndexes === 'string') {
        r2ReopenedDb.metaIndexes = JSON.parse(r2ReopenedDb.metaIndexes);
      }
      assert.deepEqual(r2ReopenedDb.scores, r2BeforeReturn.scores, 'Reopened round 2 scores must match before-return data');
      assert.deepEqual(r2ReopenedDb.metaIndexes, r2BeforeReturn.metaIndexes, 'Reopened round 2 meta indexes must match before-return data');
      assert.deepEqual(r2ReopenedDb.notes, r2BeforeReturn.notes, 'Reopened round 2 notes must match before-return data');
      assert.equal(r2ReopenedDb.comment, r2BeforeReturn.comment, 'Reopened round 2 comment must match before-return data');

      // Submit retained answers directly (WITHOUT reselecting answers!)
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalEmployeeB}';`), 'Reviewed');
      assert.equal(runPsql(`SELECT current_round FROM public.evaluations WHERE id = '${evalEmployeeB}';`), '3');

      // Check ALL FOUR payload fields, not scores alone!
      const r2PostResubmitDb = JSON.parse(runPsql(`
        SELECT json_build_object(
          'scores', scores,
          'metaIndexes', COALESCE(notes ->> '__meta_selected_level_indexes__', '{}'),
          'notes', notes,
          'comment', COALESCE(comment, '')
        ) FROM public.evaluation_rounds WHERE evaluation_id = '${evalEmployeeB}' AND round = 2;
      `));
      if (typeof r2PostResubmitDb.metaIndexes === 'string') {
        r2PostResubmitDb.metaIndexes = JSON.parse(r2PostResubmitDb.metaIndexes);
      }
      assert.deepEqual(r2PostResubmitDb.scores, r2BeforeReturn.scores, 'Post-resubmit round 2 scores must match retained evidence');
      assert.deepEqual(r2PostResubmitDb.metaIndexes, r2BeforeReturn.metaIndexes, 'Post-resubmit round 2 meta indexes must match retained evidence');
      assert.deepEqual(r2PostResubmitDb.notes, r2BeforeReturn.notes, 'Post-resubmit round 2 notes must match retained evidence');
      assert.equal(r2PostResubmitDb.comment, r2BeforeReturn.comment, 'Post-resubmit round 2 comment must match retained evidence');
      recordPass('flow-4-return-resubmit-retained-data');

      await loginAs(page, origin, 'P103-MGR');
      await openEvaluation(page, origin, employeeBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalEmployeeB}';`), 'Approved');
      recordPass('flow-4-employee-three-rounds-return-resubmit-staff-set');
    }

    console.log('[Flow 5/5] Testing Worker subject (Worker Set, 3 rounds)...');
    {
      await loginAs(page, origin, 'P103-SLB');
      await openEvaluation(page, origin, workerBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalWorkerB}';`), 'Submitted');

      await loginAs(page, origin, 'P103-LDA');
      await openEvaluation(page, origin, workerBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalWorkerB}';`), 'Reviewed');

      await loginAs(page, origin, 'P103-MGR');
      await openEvaluation(page, origin, workerBId);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      await submitViaUi(page);
      assert.equal(runPsql(`SELECT status FROM public.evaluations WHERE id = '${evalWorkerB}';`), 'Approved');
      recordPass('flow-5-worker-three-rounds-approved-worker-set');
    }

    // Capture pre-drift historical digest of completed period 2100
    function computePeriodHistoryDigest(periodId) {
      return runPsql(`
        SELECT COALESCE(string_agg(line, E'\\n' ORDER BY line), '') FROM (
          SELECT 'e|' || id || '|' || status || '|' || COALESCE(final_score::text, '') || '|' || COALESCE(final_grade, '') AS line
          FROM public.evaluations WHERE period_id = '${periodId}'
          UNION ALL
          SELECT 'r|' || r.round || '|' || r.status || '|' || r.total_score || '|' || r.grade AS line
          FROM public.evaluation_rounds r
          JOIN public.evaluations e ON e.id = r.evaluation_id
          WHERE e.period_id = '${periodId}'
        ) s;
      `);
    }
    const preDriftHistoryDigest = computePeriodHistoryDigest(period2100Id);
    assert.ok(preDriftHistoryDigest.length > 50, 'Historical digest of completed period must exist');

    // -------------------------------------------------------------------------
    // 6. Complete 8-Direction Role Drift Matrix in Period 2101
    // -------------------------------------------------------------------------
    console.log('\n[Role Drift Matrix] Seeding isolated teams and stable same-team SubLeaders before Period 2101...');

    // Close period 2100; its completed evaluations remain the historical baseline.
    runPsql(`UPDATE public.evaluation_periods SET status = 'closed' WHERE id = '${period2100Id}';`);

    // Eight unappointed synthetic subjects with deterministic UUIDs sorting after P103-MGR
    const driftScenarios = [
      { id: 'ff000000-0000-4000-8000-000000000001', code: 'SYN-LDE', name: 'Drift LeaderToEmp', initialRole: 'Leader', driftedRole: 'Employee', setKey: 'leader', maxRound: 2, caseName: 'drift-1-leader-to-employee' },
      { id: 'ff000000-0000-4000-8000-000000000002', code: 'SYN-EDL', name: 'Drift EmpToLeader', initialRole: 'Employee', driftedRole: 'Leader', setKey: 'staff', maxRound: 3, caseName: 'drift-2-employee-to-leader' },
      { id: 'ff000000-0000-4000-8000-000000000003', code: 'SYN-LDW', name: 'Drift LeaderToWorker', initialRole: 'Leader', driftedRole: 'Worker', setKey: 'leader', maxRound: 2, caseName: 'drift-3-leader-to-worker' },
      { id: 'ff000000-0000-4000-8000-000000000004', code: 'SYN-WDL', name: 'Drift WorkerToLeader', initialRole: 'Worker', driftedRole: 'Leader', setKey: 'worker', maxRound: 3, caseName: 'drift-4-worker-to-leader' },
      { id: 'ff000000-0000-4000-8000-000000000005', code: 'SYN-MDL', name: 'Drift MgrToLeader', initialRole: 'Manager', driftedRole: 'Leader', setKey: 'leader', maxRound: 1, caseName: 'drift-5-manager-to-leader' },
      { id: 'ff000000-0000-4000-8000-000000000006', code: 'SYN-LDM', name: 'Drift LeaderToMgr', initialRole: 'Leader', driftedRole: 'Manager', setKey: 'leader', maxRound: 2, caseName: 'drift-6-leader-to-manager' },
      { id: 'ff000000-0000-4000-8000-000000000007', code: 'SYN-MDS', name: 'Drift MgrToSubLeader', initialRole: 'Manager', driftedRole: 'SubLeader', setKey: 'leader', maxRound: 1, caseName: 'drift-7-manager-to-subleader' },
      { id: 'ff000000-0000-4000-8000-000000000008', code: 'SYN-SDM', name: 'Drift SubLeaderToMgr', initialRole: 'SubLeader', driftedRole: 'Manager', setKey: 'leader', maxRound: 3, caseName: 'drift-8-subleader-to-manager' },
    ];

    // One primary team per subject permits every Leader transition without
    // violating idx_users_active_leader_team. Appointments and SubLeader actors
    // never drift; no subject is referenced as somebody else's graph parent.
    for (const [index, sc] of driftScenarios.entries()) {
      const suffix = String(index + 1).padStart(12, '0');
      sc.teamId = `ff100000-0000-4000-8000-${suffix}`;
      sc.subleaderId = `ff200000-0000-4000-8000-${suffix}`;
      sc.subleaderCode = `SYN-SUPPORT-${index + 1}`;
      runPsql(`
        INSERT INTO public.teams (id, name, leader_id, is_active)
        VALUES ('${sc.teamId}', 'Drift Team ${index + 1}', '${leaderAId}', true);
        INSERT INTO public.users (id, employee_code, name, role, team_id, is_active, password_hash, password_setup_required)
        VALUES ('${sc.subleaderId}', '${sc.subleaderCode}', 'Stable Drift SubLeader ${index + 1}', 'SubLeader', '${sc.teamId}', true, NULL, false);
        INSERT INTO public.users (id, employee_code, name, role, team_id, subleader_id, is_active, password_hash, password_setup_required)
        VALUES ('${sc.id}', '${sc.code}', '${sc.name}', '${sc.initialRole}', '${sc.teamId}', '${sc.subleaderId}', true, NULL, false);
      `);
    }

    function assertDriftFixtureGraph() {
      assert.equal(runPsql(`
        SELECT count(*) FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.oid = 'public.idx_users_active_leader_team'::regclass AND i.indisunique AND i.indisvalid;
      `), '1', 'The real unique active-primary-Leader index remains valid');
      assert.equal(runPsql(`
        SELECT count(*) FROM (
          SELECT team_id FROM public.users
          WHERE is_active IS TRUE AND role = 'Leader' AND team_id IS NOT NULL
          GROUP BY team_id HAVING count(*) > 1
        ) duplicates;
      `), '0', 'Every state has at most one active primary Leader per team');
      assert.equal(runPsql(`
        SELECT count(*) FROM public.users u LEFT JOIN public.users s ON s.id = u.subleader_id
        WHERE u.is_active IS TRUE AND u.subleader_id IS NOT NULL
          AND (s.id IS NULL OR s.is_active IS DISTINCT FROM TRUE OR s.role IS DISTINCT FROM 'SubLeader'
               OR u.team_id IS NULL OR s.team_id IS DISTINCT FROM u.team_id);
      `), '0', 'Every active SubLeader relation stays valid and same-team');
      assert.equal(runPsql(`
        SELECT count(*) FROM public.teams t LEFT JOIN public.users u ON u.id = t.leader_id
        WHERE t.leader_id IS NOT NULL
          AND (u.id IS NULL OR u.is_active IS DISTINCT FROM TRUE OR u.role IS DISTINCT FROM 'Leader');
      `), '0', 'Every appointed team Leader stays active and Leader');
    }
    assertDriftFixtureGraph();

    // Create period 2101
    await loginAs(page, origin, 'P103-MGR');
    await createPeriodViaUi(page, origin, 2101);

    const period2101Id = runPsql("SELECT id FROM public.evaluation_periods WHERE year = 2101 AND status = 'active' LIMIT 1;");
    assert.ok(period2101Id, 'Created period 2101 must exist in active state');

    recordPass('drift-setup-period-2101-seeded');

    // Apply role drift and verify each scenario
    for (const sc of driftScenarios) {
      console.log(`[Role Drift] Executing ${sc.caseName}: ${sc.initialRole} -> ${sc.driftedRole}...`);

      const evalId = runPsql(`SELECT id FROM public.evaluations WHERE period_id = '${period2101Id}' AND employee_id = '${sc.id}';`);
      assert.ok(evalId, `Evaluation for ${sc.code} must exist in period 2101`);

      // Verify snapshot before drift
      assert.equal(
        runPsql(`SELECT employee_role FROM public.evaluations WHERE id = '${evalId}';`),
        sc.initialRole,
        `Evaluation snapshot for ${sc.code} must initially be ${sc.initialRole}`
      );

      // Materialize a genuine Draft before drift, so Manager readonly probes
      // cannot pass on an empty/unauthorized route. Graders keep their real role.
      const initialGraderCode = ['Employee', 'Worker'].includes(sc.initialRole)
        ? sc.subleaderCode : sc.code;
      await loginAs(page, origin, initialGraderCode);
      await openEvaluation(page, origin, sc.id);
      await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
      assert.match(await saveDraftViaUiFresh(page), /Đã lưu bản nháp/i);
      const initialRound = JSON.parse(runPsql(`
        SELECT json_build_object('totalScore', total_score, 'grade', grade, 'scores', scores,
          'evaluatorId', evaluator_id, 'criteriaVersionId', criteria_config_version_id)
        FROM public.evaluation_rounds WHERE evaluation_id = '${evalId}' AND round = 1 AND status = 'Draft';
      `));
      assert.ok(Object.keys(initialRound.scores).length > 0, 'Drift starts with scored, persisted Draft');
      const beforeRoleDigest = fullEvaluationDigest(evalId);
      await loginAs(page, origin, 'P103-MGR');

      // Only the subject role changes: membership, appointments and grader stay fixed.
      runPsql(`UPDATE public.users SET role = '${sc.driftedRole}' WHERE id = '${sc.id}';`);
      assertDriftFixtureGraph();
      assert.equal(fullEvaluationDigest(evalId), beforeRoleDigest, 'Role drift must not rewrite persisted evaluation/round data');

      // Assert evaluation snapshot unchanged while user live role has drifted
      const currentSnapshot = runPsql(`SELECT employee_role FROM public.evaluations WHERE id = '${evalId}';`);
      const currentLiveRole = runPsql(`SELECT role FROM public.users WHERE id = '${sc.id}';`);
      assert.equal(currentSnapshot, sc.initialRole, `evaluations.employee_role must strictly remain ${sc.initialRole}`);
      assert.equal(currentLiveRole, sc.driftedRole, `users.role must reflect drifted role ${sc.driftedRole}`);

      const expectedCriteria = JSON.parse(runPsql(`
        SELECT json_agg(json_build_object('id', id, 'name', name) ORDER BY sort_order, id)
        FROM public.criteria WHERE is_active IS TRUE AND set_key = '${sc.setKey}';
      `));
      assert.equal(expectedCriteria.length, sc.setKey === 'leader' ? 33 : 30);
      const expectedRoundLabel = `Lần 1 / ${sc.maxRound}`;
      // Manager readonly view must actually render the pinned Draft, not chrome.
      await page.goto(`${origin}/evaluations/${sc.id}`);
      await page.waitFor(
        `document.querySelector('main')?.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(expectedRoundLabel)}) && document.querySelector('main')?.innerText.includes(${JSON.stringify(expectedCriteria[0].name)})`,
        { timeout: 30000, label: `pinned Draft rendered for ${sc.code}` }
      );
      const renderedRound = await page.evaluate(`(() => {
        const row = [...document.querySelectorAll('main tr')].find(r => r.cells[0]?.innerText.trim() === 'L1');
        return row ? { grade: row.cells[1].innerText.trim(), totalScore: Number(row.cells[2].innerText.trim()) } : null;
      })()`);
      assert.deepEqual(renderedRound, { grade: initialRound.grade, totalScore: initialRound.totalScore }, 'Draft score/grade stay on the pinned subject basis after drift');
      // The page renders `Lần {round} / {maxRound}` (spaced), so a `/N` regexp can never
      // see it: assert every other snapshot-inconsistent label is absent instead.
      const roundLabelText = (await page.evaluate("document.querySelector('main').innerText")).replace(/\s+/g, ' ');
      for (const otherMax of [1, 2, 3].filter((n) => n !== sc.maxRound)) {
        assert.ok(!roundLabelText.includes(`Lần 1 / ${otherMax}`), `Max round for snapshot ${sc.initialRole} must not display Lần 1 / ${otherMax}`);
      }

      // Check Compare page filters criteria according to snapshot set
      await page.goto(`${origin}/evaluations/${sc.id}/compare`);
      // A single Draft round has no changed criteria: the full pinned set lives in the
      // collapsed "Tiêu chí giữ nguyên (N)" <details>, which innerText omits while closed
      // (the summary is CSS-uppercase, so read it via textContent).
      const unchangedSummary = 'main details > summary';
      await page.waitFor(
        `document.querySelector(${JSON.stringify(unchangedSummary)})?.textContent.replace(/\\s+/g, ' ').includes(${JSON.stringify(`Tiêu chí giữ nguyên (${expectedCriteria.length})`)})`,
        { timeout: 30000, label: `pinned unchanged-criteria count ${expectedCriteria.length} for ${sc.code}` }
      );
      if (await page.evaluate("document.querySelector('main details').open") !== true) {
        await page.clickText('Tiêu chí giữ nguyên', { selector: unchangedSummary });
      }
      await page.waitFor("document.querySelector('main details')?.open === true", {
        timeout: 10000, label: `unchanged-criteria details opened for ${sc.code}`,
      });
      await page.waitFor(
        `${JSON.stringify(expectedCriteria.map(c => c.name))}.every(name => document.querySelector('main')?.innerText.includes(name))`,
        { timeout: 30000, label: `all pinned compare criteria for ${sc.code}` }
      );

      const compareText = await page.evaluate("document.querySelector('main').innerText");
      const renderedCriterionIds = expectedCriteria.filter(c => compareText.includes(c.name)).map(c => c.id).sort();
      assert.deepEqual(renderedCriterionIds, expectedCriteria.map(c => c.id).sort(), 'Compare must render the complete expected criterion UUID set');
      const otherExclusiveCriteria = JSON.parse(runPsql(`
        SELECT json_agg(DISTINCT name) FROM public.criteria
        WHERE is_active IS TRUE AND set_key <> '${sc.setKey}'
          AND name NOT IN (SELECT name FROM public.criteria WHERE is_active IS TRUE AND set_key = '${sc.setKey}');
      `));
      if (otherExclusiveCriteria && otherExclusiveCriteria.length > 0) {
        assert.ok(otherExclusiveCriteria.every(name => !compareText.includes(name)), 'Compare must not add exclusive criteria from other sets');
      }

      recordPass(sc.caseName, {
        subjectId: sc.id, teamId: sc.teamId, graderId: initialRound.evaluatorId,
        snapshotRole: currentSnapshot, liveRole: currentLiveRole, setKey: sc.setKey,
        maxRound: sc.maxRound, draft: renderedRound, criteriaVersionId: initialRound.criteriaVersionId,
        renderedCriterionIds, beforeRoleDigest, afterRoleDigest: fullEvaluationDigest(evalId),
      });
    }

    // -------------------------------------------------------------------------
    // 7. Grader Real-Role Authorization Preserved Across Drift
    // -------------------------------------------------------------------------
    console.log('\n[Authorization] Verifying grader real-role authorization across subject drift...');

    // Scenario A: Subject SYN-EDL drifted from Employee to Leader.
    // The assigned grader is the subject's stable same-team fixture SubLeader.
    // Its role never drifts; only SYN-EDL changes from Employee to Leader.
    const synEdlFixture = driftScenarios.find(sc => sc.code === 'SYN-EDL');
    const synEdlId = synEdlFixture.id;
    const evalSynEdl = runPsql(`SELECT id FROM public.evaluations WHERE period_id = '${period2101Id}' AND employee_id = '${synEdlId}';`);

    await loginAs(page, origin, synEdlFixture.subleaderCode);
    await openEvaluation(page, origin, synEdlId);
    await selectAllCriteriaAcrossGroups(page, { expectedGroupCount: 6 });
    const draftSaveRes = await saveDraftViaUiFresh(page);
    assert.match(draftSaveRes, /Đã lưu bản nháp/i, 'Authorized SubLeader must successfully save draft');

    const draftRoundStatus = runPsql(`SELECT status FROM public.evaluation_rounds WHERE evaluation_id = '${evalSynEdl}' AND round = 1;`);
    assert.equal(draftRoundStatus, 'Draft', 'Round 1 status in DB must be Draft');

    // Scenario B: Subject SYN-LDE drifted from Leader to Employee.
    // Round 1 was SELF. Now user's role is Employee, but evaluation.employee_role is Leader.
    // Subject's self-save must be rejected due to role mismatch.
    const synLdeId = 'ff000000-0000-4000-8000-000000000001';
    const evalSynLde = runPsql(`SELECT id FROM public.evaluations WHERE period_id = '${period2101Id}' AND employee_id = '${synLdeId}';`);
    const initialSynLdeDigest = fullEvaluationDigest(evalSynLde);

    await loginAs(page, origin, 'SYN-LDE');
    await openEvaluation(page, origin, synLdeId, { expectEdit: false });

    // Try server action saveEvaluationRound directly via browserAction
    const buildDir = path.join(projectRoot, '.next', 'dev');
    const manifest = loadActionManifest(buildDir);
    const activeCriteriaVerId = runPsql("SELECT id FROM public.criteria_config_versions WHERE is_active IS TRUE;");
    const activeGradeVerId = runPsql("SELECT id FROM public.grade_band_versions WHERE is_active IS TRUE;");
    const firstActiveCriterion = (setKey) => {
      const id = runPsql(`SELECT id FROM public.criteria WHERE is_active IS TRUE AND set_key = '${setKey}' ORDER BY sort_order, id LIMIT 1;`);
      const points = Number(runPsql(`SELECT points FROM public.criterion_levels WHERE criterion_id = '${id}' ORDER BY sort_order, id LIMIT 1;`));
      assert.ok(id && Number.isInteger(points), `active ${setKey} criterion with a first level must exist`);
      return { id, points };
    };
    const validLeaderCrit = firstActiveCriterion('leader');
    const validLeaderCritId = validLeaderCrit.id;

    // Same shape the UI sends as `renderedRules` (use-evaluation-page-state.ts renderedCriteriaRules):
    // { id, allowedPoints, levels:[{points,label,description}] } per active criterion of the set,
    // levels in sort order. The server compares it with the authoritative rules; no scoring is invented.
    const renderedRulesFor = (setKey) => {
      const rules = JSON.parse(runPsql(`
        SELECT json_agg(json_build_object('id', c.id, 'allowedPoints', lv.points, 'levels', lv.levels) ORDER BY c.sort_order, c.id)
        FROM public.criteria c
        CROSS JOIN LATERAL (
          SELECT json_agg(l.points ORDER BY l.sort_order, l.id) AS points,
                 json_agg(json_build_object('points', l.points, 'label', l.label, 'description', l.description) ORDER BY l.sort_order, l.id) AS levels
          FROM public.criterion_levels l WHERE l.criterion_id = c.id AND l.is_active IS TRUE
        ) lv
        WHERE c.is_active IS TRUE AND c.set_key = '${setKey}';
      `));
      assert.equal(rules.length, setKey === 'leader' ? 33 : 30, `${setKey} rendered rules must cover the whole active set`);
      assert.ok(rules.every((rule) => rule.allowedPoints.length > 0 && rule.allowedPoints.length === rule.levels.length));
      return rules;
    };
    const leaderRenderedRules = renderedRulesFor('leader');

    const selfMismatchedRes = await browserAction(page, {
      manifest,
      name: 'saveEvaluationRound',
      args: [
        evalSynLde,
        1,
        { [validLeaderCritId]: validLeaderCrit.points },
        {},
        { [validLeaderCritId]: 0 },
        'Attempted self evaluation after drift',
        false,
        {
          criteriaConfigVersionId: activeCriteriaVerId,
          gradeConfigVersionId: activeGradeVerId,
          renderedRules: leaderRenderedRules,
        },
      ],
    });

    assert.equal(selfMismatchedRes.ok, true, 'Transport for self-mismatch action call succeeded');
    assert.equal(selfMismatchedRes.value?.success, false, `Self-evaluator with drifted role must be rejected (error: ${selfMismatchedRes.value?.error})`);
    assert.match(
      selfMismatchedRes.value?.error || '',
      /không có quyền tự đánh giá/i,
      'Must return specific self-evaluation authorization rejection error'
    );

    const postSynLdeDigest = fullEvaluationDigest(evalSynLde);
    assert.equal(postSynLdeDigest, initialSynLdeDigest, 'Zero DB mutation on unauthorized self-evaluation attempt');

    recordPass('grader-real-role-authorization-preserved-across-drift');

    // -------------------------------------------------------------------------
    // 8. Forged Cross-Set Criterion Negative Test with Real Action
    // -------------------------------------------------------------------------
    console.log('\n[Security] Exercising real saveEvaluationRound with positive control and forged criterion...');

    // Use Leader A evaluation in period 2101 with authorized actor P103-LDA
    const evalLeaderA2101 = runPsql(`SELECT id FROM public.evaluations WHERE period_id = '${period2101Id}' AND employee_id = '${leaderAId}';`);
    const forgedWorkerCrit = firstActiveCriterion('worker');
    const forgedWorkerCritId = forgedWorkerCrit.id;

    await loginAs(page, origin, 'P103-LDA');
    await page.goto(`${origin}/evaluations/${leaderAId}`);
    await page.waitFor("document.body.innerText.includes('Tỷ lệ hiện diện')", { timeout: 15000 });

    // 8.0 Contract probe: without the UI's `renderedRules` the real action refuses with its
    // own exact error (src/actions/evaluation.ts) and writes nothing.
    // Settle on a DB condition, not a sleep: the page's first-open autosave
    // (initializeEvaluationRoundDraft) turns the pre-created NotStarted round into Draft
    // asynchronously after load; a NotStarted row existing is not settled.
    const settleDeadline = Date.now() + 30000;
    while (runPsql(`SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id = '${evalLeaderA2101}' AND round = 1 AND status = 'Draft';`) === '0') {
      assert.ok(Date.now() < settleDeadline, 'first-open autosave Draft round must appear for Leader A');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const linesBeforeMissingRules = fullEvaluationLines(evalLeaderA2101);
    const digestBeforeMissingRules = hashString(linesBeforeMissingRules);
    const missingRulesRes = await browserAction(page, {
      manifest,
      name: 'saveEvaluationRound',
      args: [
        evalLeaderA2101,
        1,
        { [validLeaderCritId]: validLeaderCrit.points },
        {},
        { [validLeaderCritId]: 0 },
        'Payload without renderedRules',
        false,
        { criteriaConfigVersionId: activeCriteriaVerId, gradeConfigVersionId: activeGradeVerId },
      ],
    });
    assert.equal(missingRulesRes.ok, true, 'Missing-renderedRules transport succeeded');
    assert.equal(missingRulesRes.value?.success, false, 'Payload without renderedRules must be refused');
    assert.equal(missingRulesRes.value?.error, 'Thiếu snapshot tiêu chí đã render để lưu đánh giá.', 'Must report the exact renderedRules contract error');
    const linesAfterMissingRules = fullEvaluationLines(evalLeaderA2101);
    const changedLines = linesAfterMissingRules === linesBeforeMissingRules ? [] : [
      ...linesBeforeMissingRules.split('\n').filter((l) => !linesAfterMissingRules.split('\n').includes(l)).map((l) => `- ${l}`),
      ...linesAfterMissingRules.split('\n').filter((l) => !linesBeforeMissingRules.split('\n').includes(l)).map((l) => `+ ${l}`),
    ];
    assert.equal(hashString(linesAfterMissingRules), digestBeforeMissingRules, `Refused payload must not write; changed rows:\n${changedLines.join('\n')}`);

    // 8.1 Positive Control: valid same-set draft under authorized actor
    console.log('[Security] Executing positive control draft save...');
    const posRes = await browserAction(page, {
      manifest,
      name: 'saveEvaluationRound',
      args: [
        evalLeaderA2101,
        1,
        { [validLeaderCritId]: validLeaderCrit.points },
        {},
        { [validLeaderCritId]: 0 },
        'Positive control valid draft',
        false,
        {
          criteriaConfigVersionId: activeCriteriaVerId,
          gradeConfigVersionId: activeGradeVerId,
          renderedRules: leaderRenderedRules,
        },
      ],
    });
    assert.equal(posRes.ok, true, 'Positive control transport succeeded');
    assert.equal(posRes.value?.success, true, `Positive control valid draft save must succeed (error: ${posRes.value?.error})`);

    const digestBeforeForgery = fullEvaluationDigest(evalLeaderA2101);

    // 8.2 Negative Control: forged Worker criterion on Leader snapshot
    console.log('[Security] Executing forged Worker criterion negative test...');
    const negRes = await browserAction(page, {
      manifest,
      name: 'saveEvaluationRound',
      args: [
        evalLeaderA2101,
        1,
        { [forgedWorkerCritId]: forgedWorkerCrit.points },
        {},
        { [forgedWorkerCritId]: 0 },
        'Forged worker criterion on leader',
        false,
        {
          criteriaConfigVersionId: activeCriteriaVerId,
          gradeConfigVersionId: activeGradeVerId,
          renderedRules: leaderRenderedRules,
        },
      ],
    });

    assert.equal(negRes.ok, true, 'Forged action invocation transport succeeded');
    assert.equal(negRes.value?.success, false, `Forged criterion payload must return success === false (error: ${negRes.value?.error})`);
    assert.equal(negRes.value?.error, 'Tiêu chí đánh giá không hợp lệ.', 'Must return exact criterion validation error');

    const digestAfterForgery = fullEvaluationDigest(evalLeaderA2101);
    assert.equal(digestAfterForgery, digestBeforeForgery, 'Full evaluation + rounds digest must be strictly identical after rejected forgery');

    recordPass('forged-cross-set-criterion-rejected-and-full-digest-preserved');

    // -------------------------------------------------------------------------
    // 9. Historical Preservation Verification Across Role Drift
    // -------------------------------------------------------------------------
    console.log('\n[Historical Preservation] Checking approved rounds digest in period 2100 across role drifts...');
    const postDriftHistoryDigest = computePeriodHistoryDigest(period2100Id);
    assert.equal(postDriftHistoryDigest, preDriftHistoryDigest, 'Historical period 2100 evaluations & rounds must remain byte-identical');

    // Verify Approved employee final grade format allows 'AB' and other valid grades
    const employeeFinalGrade = runPsql(`SELECT grade FROM public.evaluation_rounds WHERE evaluation_id = '${evalEmployeeB}' AND round = 3;`);
    assert.match(employeeFinalGrade, /^(?:S|AB|A|B|C|D)$/, 'Approved round must have valid grade (including AB)');

    recordPass('historical-preservation-approved-rounds-digest-unaltered');

    // -------------------------------------------------------------------------
    // 10. Assert Completeness of All Required Test Cases
    // -------------------------------------------------------------------------
    for (const reqId of REQUIRED_CASES) {
      const match = caseResults.find((c) => c.name === reqId);
      assert.ok(match, `Required test case ${reqId} was not executed`);
      assert.equal(match.status, 'PASS', `Required test case ${reqId} did not pass`);
    }

  } catch (err) {
    mainError = err;
    console.error('\n[FATAL TEST FAILURE]:', err);
    // Preserve the failed predicate's real DOM/DB inputs before existing teardown.
    if (diagnosticPage) {
      try {
        const page = diagnosticPage;
        const observed = await page.evaluate(`(() => ({path:location.pathname,text:document.querySelector('main')?.innerText,
          navs:[...document.querySelectorAll('[role="tablist"][aria-label="Nhóm tiêu chí"]')].map(nav=>({
            ids:[...nav.querySelectorAll('button[role="tab"]')].map(b=>b.id),
            selected:[...nav.querySelectorAll('[aria-selected="true"]')].map(b=>b.id),
            criteria:[...nav.parentElement.querySelectorAll('h3')].map(h=>h.textContent)})),
          levels:[...document.querySelectorAll('button p')].map(p=>({label:p.textContent,disabled:p.closest('button').disabled}))
        }))()`);
        observed.console = page.consoleErrors();
        observed.exceptions = page.exceptions();
        observed.requests = page.requests(20);
        const subjectId = observed.path.split('/')[2];
        if (diagnosticDb && /^[0-9a-f-]{36}$/i.test(subjectId)) {
          observed.rounds = JSON.parse(diagnosticDb(`SELECT COALESCE(json_agg(json_build_object(
            'evaluationId',e.id,'snapshotRole',e.employee_role,'currentRound',e.current_round,'evaluationStatus',e.status,
            'round',r.round,'status',r.status,'scores',r.scores,'notes',r.notes,'comment',r.comment,
            'criteriaVersion',r.criteria_config_version_id,'gradeVersion',r.grade_config_version_id)), '[]')
            FROM public.evaluations e JOIN public.evaluation_periods ep ON ep.id=e.period_id
            LEFT JOIN public.evaluation_rounds r ON r.evaluation_id=e.id
            WHERE e.employee_id='${subjectId}' AND ep.status='active';`));
        }
        fs.writeFileSync(path.join(evidenceDir,'failure-observed.json'),redact(JSON.stringify(observed,null,2)));
        await page.screenshot('failure-observed',{dir:evidenceDir});
        console.log('FAILURE_OBSERVED='+path.join(evidenceDir,'failure-observed.json'));
      } catch (diagnosticError) { console.error('Failure observation unavailable:',String(diagnosticError)); }
    }
  } finally {
    // -------------------------------------------------------------------------
    // 11. Deterministic Teardown & Resource Cleanup
    // -------------------------------------------------------------------------
    console.log('\n[Teardown] Stopping browser and cleaning up disposable runtime...');
    let browserCleaned = false;
    let browserProfileRemoved = false;
    let runtimeCleaned = false;
    let runtimeResidue = -1;

    if (browser) {
      try {
        const stopRes = await browser.stop();
        assert.equal(stopRes.processStopped, true, 'browser.stop() must stop browser process');
        assert.equal(stopRes.profileRemoved, true, 'browser.stop() must remove chrome profile directory');
        browserCleaned = true;
        browserProfileRemoved = true;
      } catch (err) {
        cleanupErrors.push(err);
      }
    }

    if (runtimeStarted) {
      try {
        const cleanRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'cleanup'], {
          cwd: projectRoot,
          env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
          encoding: 'utf8',
          timeout: 60000,
        });
        if (cleanRes.error) {
          throw new Error(`cleanup spawn failed: ${cleanRes.error.message}`);
        }
        if (cleanRes.status !== 0) {
          throw new Error(`cleanup exited with code ${cleanRes.status}: ${cleanRes.stderr || cleanRes.stdout}`);
        }
        const stdout = String(cleanRes.stdout || '').trim();
        const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
        const jsonLine = lines.reverse().find((l) => l.startsWith('{') && l.endsWith('}'));
        if (!jsonLine) {
          throw new Error(`cleanup output did not contain valid JSON summary: ${stdout}`);
        }
        const cleanupParsed = JSON.parse(jsonLine);
        assert.equal(cleanupParsed.cleaned, true, 'cleanup output must have cleaned: true');
        assert.equal(cleanupParsed.residue, 0, 'cleanup output must have residue: 0');
        runtimeCleaned = true;
        runtimeResidue = cleanupParsed.residue;
      } catch (err) {
        cleanupErrors.push(err);
      }
    }

    // Write Evidence JSON
    const allCasesPassed = REQUIRED_CASES.every((req) => caseResults.some((c) => c.name === req && c.status === 'PASS'));
    const evidenceReport = {
      format: 'kurabe-p108-evaluation-flow-evidence/v1',
      runId,
      task: 'P108M1T07',
      tier: 'STANDARD',
      timestamp: new Date().toISOString(),
      requiredCasesCount: REQUIRED_CASES.length,
      executedCasesCount: caseResults.length,
      cases: caseResults,
      screenshots: recordedScreenshots,
      cleanup: {
        browserCleaned,
        browserProfileRemoved,
        runtimeCleaned,
        runtimeResidue,
      },
      status: (!mainError && cleanupErrors.length === 0 && allCasesPassed) ? 'PASS' : 'FAIL',
      error: mainError ? redact(mainError.message) : (cleanupErrors.length > 0 ? redact(cleanupErrors[0].message) : null),
    };

    try {
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, `${JSON.stringify(evidenceReport, null, 2)}\n`, { mode: 0o600 });
      console.log(`[Evidence] Saved evidence report to ${evidencePath}`);
    } catch (err) {
      cleanupErrors.push(new Error(`Failed to write evidence report: ${err.message}`));
    }

    // Preserve main error and cleanup errors via AggregateError
    if (mainError && cleanupErrors.length > 0) {
      throw new AggregateError([mainError, ...cleanupErrors], `Execution and cleanup failed: ${mainError.message}`);
    } else if (mainError) {
      throw mainError;
    } else if (cleanupErrors.length > 0) {
      if (cleanupErrors.length === 1) throw cleanupErrors[0];
      throw new AggregateError(cleanupErrors, `Cleanup failed: ${cleanupErrors[0].message}`);
    }
  }

  console.log('\n======================================================');
  console.log('ALL P108 EVALUATION FLOW INTEGRATION CASES PASSED!');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('\nFATAL_ERROR in p108-evaluation-flow:', err);
  process.exit(1);
});
