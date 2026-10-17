#!/usr/bin/env node
/**
 * Kurabe Task P108M1T10 — Acceptance Gate Orchestrator
 *
 * Sequentially spawns existing P108 qualification suites on the exact candidate:
 * 1. tests/integration/p108-criteria-sets.mjs
 * 2. tests/integration/p108-import.mjs
 * 3. tests/p108-criteria-admin.test.mjs --browser
 * 4. tests/integration/p108-evaluation-flow.mjs --evidence <child>
 * 5. tests/p108-snapshot-reader.test.mjs
 * 6. tests/p108-report-projection.test.mjs
 * 7. tests/p108-ai-export.test.mjs
 * 8. tests/p107-official-results.test.mjs
 * 9. tests/p108-role-snapshot.test.mjs
 *
 * Plus NEW own assertions for uncovered gates:
 * (i) Compare page and history for a pre-P108 (legacy) Approved evaluation after
 *     import render only the subject's set and the same numbers.
 * (ii) Catalog-size smoke: with the 93-criteria catalog active, /criteria, /reports,
 *      and /dashboard each load under a generous bounded timeout (recording timings).
 *
 * Final evidence aggregates child evidence.
 * Signed-manifest dry-run records status BLOCKED_NA with reason:
 * "T02/G1 not signed; synthetic manifest only; not business sign-off, not production-ready".
 * Overall status: PASS_TECHNICAL_WITH_NA.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');

function parseArgs() {
  const args = process.argv.slice(2);
  let evidencePath = path.join(projectRoot, '.tmp/p108-acceptance-evidence.json');
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

function runGit(args, cwd = projectRoot) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function runPsql(dbTarget, sql) {
  const res = spawnSync('psql', [
    '-X', '-h', dbTarget.host, '-p', String(dbTarget.port), '-U', dbTarget.user, '-d', dbTarget.database,
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

function performCleanup(scriptPath, runtimeRoot) {
  const res = spawnSync(process.execPath, [scriptPath, 'cleanup'], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
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

async function main() {
  console.log('=== P108 Acceptance Gate Orchestrator ===\n');

  const { evidencePath } = parseArgs();
  const runId = crypto.randomUUID();
  const candidateSha = runGit(['rev-parse', 'HEAD']);
  console.log(`[Orchestrator] Candidate SHA: ${candidateSha}`);

  const childEvidenceDir = path.join(projectRoot, '.tmp', `acceptance-children-${process.pid}`);
  fs.mkdirSync(childEvidenceDir, { recursive: true });

  const flowChildEvidencePath = path.join(childEvidenceDir, 'p108-evaluation-flow-evidence.json');

  const CHILD_SUITES = [
    { id: 'p108-criteria-sets', script: 'tests/integration/p108-criteria-sets.mjs', args: [] },
    { id: 'p108-import', script: 'tests/integration/p108-import.mjs', args: [] },
    { id: 'p108-criteria-admin-browser', script: 'tests/p108-criteria-admin.test.mjs', args: ['--browser'] },
    { id: 'p108-evaluation-flow', script: 'tests/integration/p108-evaluation-flow.mjs', args: ['--evidence', flowChildEvidencePath] },
    { id: 'p108-snapshot-reader', script: 'tests/p108-snapshot-reader.test.mjs', args: [] },
    { id: 'p108-report-projection', script: 'tests/p108-report-projection.test.mjs', args: [] },
    { id: 'p108-ai-export', script: 'tests/p108-ai-export.test.mjs', args: [] },
    { id: 'p107-official-results', script: 'tests/p107-official-results.test.mjs', args: [] },
    { id: 'p108-role-snapshot', script: 'tests/p108-role-snapshot.test.mjs', args: [] },
  ];

  const childResults = [];
  const caseResults = [];
  let overallError = null;

  // ---------------------------------------------------------------------------
  // 1. Sequentially Spawn Existing Test Suites
  // ---------------------------------------------------------------------------
  for (const suite of CHILD_SUITES) {
    console.log(`\n>>> Spawning Suite: ${suite.id} (${suite.script} ${suite.args.join(' ')})`);
    const scriptPath = path.join(projectRoot, suite.script);
    assert.ok(fs.existsSync(scriptPath), `Suite script must exist: ${suite.script}`);

    const res = spawnSync(process.execPath, [scriptPath, ...suite.args], {
      cwd: projectRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 600000,
    });

    const combinedOutput = `${res.stdout || ''}\n${res.stderr || ''}`;
    const logSha256 = hashString(combinedOutput);
    const passed = res.status === 0;

    let childEvidence = null;
    if (suite.id === 'p108-evaluation-flow' && fs.existsSync(flowChildEvidencePath)) {
      try {
        childEvidence = JSON.parse(fs.readFileSync(flowChildEvidencePath, 'utf8'));
      } catch (err) {
        console.error('Failed to parse evaluation flow child evidence:', err.message);
      }
    }

    const suiteRecord = {
      id: suite.id,
      script: suite.script,
      exitCode: res.status,
      status: passed ? 'PASS' : 'FAIL',
      logSha256,
      childEvidence,
    };
    childResults.push(suiteRecord);

    if (passed) {
      console.log(`[PASS] Suite ${suite.id} (exit 0, log sha256: ${logSha256.slice(0, 16)}...)`);
      caseResults.push({ name: suite.id, status: 'PASS' });
    } else {
      console.error(`[FAIL] Suite ${suite.id} exited with code ${res.status}`);
      console.error(redact(combinedOutput.slice(-2000)));
      caseResults.push({ name: suite.id, status: 'FAIL', error: redact(res.stderr || res.stdout) });
      overallError = new Error(`Suite ${suite.id} failed with exit code ${res.status}`);
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // 2. NEW Own Assertions: (i) Legacy Compare & History, (ii) Catalog-Size Smoke
  // ---------------------------------------------------------------------------
  if (!overallError) {
    console.log('\n>>> Executing NEW own assertions in dedicated disposable runtime...');
    const confirmationRuntimeScript = path.join(projectRoot, '.github/ci/confirmation-runtime.mjs');
    const importScriptPath = path.join(projectRoot, 'scripts/p108-import-criteria.mjs');
    const syntheticManifestPath = path.join(projectRoot, 'tests/fixtures/p108/synthetic-manifest.json');
    const browserHelperPath = path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/browser.mjs');
    const orgHelperPath = path.join(projectRoot, 'tests/fixtures/p107/lifecycle-coherence/lib/org.mjs');

    const runtimeRoot = path.join(projectRoot, '.tmp', `kurabe-acceptance-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
    let browser = null;

    try {
      // Child suites left their own Next dev Server Action manifest (ids change per run): drop it before this runtime starts.
      fs.rmSync(path.join(projectRoot, '.next', 'dev', 'server', 'server-reference-manifest.json'), { force: true });
      console.log('[Acceptance Runtime] Starting runtime...');
      const startRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'start'], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
        timeout: 120000,
      });
      if (startRes.status !== 0) throw new Error('confirmation-runtime start failed');

      console.log('[Acceptance Runtime] Bootstrapping runtime...');
      const bootRes = spawnSync(process.execPath, [confirmationRuntimeScript, 'bootstrap'], {
        cwd: projectRoot,
        stdio: 'inherit',
        env: { ...process.env, KURABE_CI_RUNTIME_ROOT: runtimeRoot },
        timeout: 120000,
      });
      if (bootRes.status !== 0) throw new Error('confirmation-runtime bootstrap failed');

      const runtimeState = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'runtime-state.json'), 'utf8'));
      const origin = `http://127.0.0.1:${runtimeState.nextPort}`;
      const dbTarget = { host: '127.0.0.1', port: runtimeState.dbPort, database: runtimeState.db, user: 'postgres', password: runtimeState.password };

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

      const employeeBId = runPsql(dbTarget, "SELECT id FROM public.users WHERE employee_code = 'P103-EMB' LIMIT 1;");
      const closedPeriodId = runPsql(dbTarget, "SELECT id FROM public.evaluation_periods WHERE year = 2098 LIMIT 1;");
      const closedEvalId = runPsql(dbTarget, `SELECT id FROM public.evaluations WHERE period_id = '${closedPeriodId}' AND employee_id = '${employeeBId}' LIMIT 1;`);

      // Make the legacy Approved evaluation a real graded one (3 Submitted rounds, scores, final score/grade) so the checks are not vacuous.
      const { legacyGradedApprovedSql } = await import(`file://${confirmationRuntimeScript}`);
      runPsql(dbTarget, legacyGradedApprovedSql(closedEvalId));
      assert.equal(runPsql(dbTarget, `SELECT status || '|' || (final_score > 0) || '|' || (final_grade IS NOT NULL) FROM public.evaluations WHERE id = '${closedEvalId}';`), 'Approved|true|true', 'seeded legacy evaluation must be graded');
      assert.equal(runPsql(dbTarget, `SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id = '${closedEvalId}' AND status = 'Submitted' AND total_score > 0 AND scores <> '{}'::jsonb;`), '3', 'all three legacy rounds must be Submitted with scores');

      // Two labelled legacy shapes: (1) PINNED legacy evaluation (closed 2098, pinned to the legacy v1 criteria/grade versions, the realistic shape);
      // (2) UNPINNED legacy evaluation (fixture 2099, NULL pins) which the app must render fail-closed without labelling it from the live catalog.
      assert.equal(runPsql(dbTarget, `SELECT count(*) FROM public.evaluation_rounds r WHERE r.evaluation_id = '${closedEvalId}' AND (r.criteria_config_version_id IS NULL OR r.grade_config_version_id IS NULL);`), '0', 'pinned legacy fixture rounds must keep their pins');
      const unpinnedPeriodId = runPsql(dbTarget, "SELECT id FROM public.evaluation_periods WHERE year = 2099 LIMIT 1;");
      const unpinnedEvalId = runPsql(dbTarget, `SELECT id FROM public.evaluations WHERE period_id = '${unpinnedPeriodId}' AND employee_id = '${employeeBId}' LIMIT 1;`);
      runPsql(dbTarget, legacyGradedApprovedSql(unpinnedEvalId, { pins: false }));
      assert.equal(runPsql(dbTarget, `SELECT count(*) FROM public.evaluation_rounds r WHERE r.evaluation_id = '${unpinnedEvalId}' AND (r.criteria_config_version_id IS NOT NULL OR r.grade_config_version_id IS NOT NULL);`), '0', 'unpinned legacy fixture rounds must have NULL pins');
      const digestOfEval = (id) => runPsql(dbTarget, `SELECT (SELECT md5(e::text) FROM public.evaluations e WHERE e.id = '${id}') || '|' || COALESCE((SELECT string_agg(md5(r::text), ',' ORDER BY r.round) FROM public.evaluation_rounds r WHERE r.evaluation_id = '${id}'), '');`);
      const unpinnedDigestBefore = digestOfEval(unpinnedEvalId);
      // Complete evaluation + round digest (every column: scores, notes, evaluator ids, pins, timestamps).
      const legacyDigest = () => runPsql(dbTarget, `SELECT (SELECT md5(e::text) FROM public.evaluations e WHERE e.id = '${closedEvalId}') || '|' || COALESCE((SELECT string_agg(md5(r::text), ',' ORDER BY r.round) FROM public.evaluation_rounds r WHERE r.evaluation_id = '${closedEvalId}'), '');`);
      const legacyDigestBefore = legacyDigest();
      // Read baseline legacy evaluation row and rounds before import
      const baselineDbEval = runPsql(dbTarget, `SELECT id, status, current_round, final_grade, final_score FROM public.evaluations WHERE id = '${closedEvalId}';`);
      const baselineDbRounds = runPsql(dbTarget, `SELECT round, evaluator_role, status, total_score, grade FROM public.evaluation_rounds WHERE evaluation_id = '${closedEvalId}' ORDER BY round;`);

      const { launchChromium } = await import(`file://${browserHelperPath}`);
      const { loginAs, loadActionManifest, browserAction, openEvaluation, createPeriodViaUi } = await import(`file://${orgHelperPath}`);

      browser = await launchChromium({ runtimeRoot, headless: true });
      const page = await browser.newPage('acceptance-assertions');
      await page.setViewport(1440, 900);
      await loginAs(page, origin, 'P103-MGR');

      const requiredActions = ['getEvaluationComparePageDataAction', 'getEvaluationHistoryAction'];
      const loadAcceptanceManifest = async () => {
        // Next dev compiles Server Actions per visited route: visit the real pages until both actions are in the manifest.
        let manifest = [];
        for (const route of [`/evaluations/${employeeBId}/compare`, '/dashboard', '/reports', '/history', '/employees', '/criteria']) {
          await page.goto(`${origin}${route}`);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          try { manifest = loadActionManifest(path.join(projectRoot, '.next', 'dev')); } catch { manifest = []; }
          if (requiredActions.every((n) => manifest.some((entry) => entry.exportedName === n))) return manifest;
        }
        throw new Error(`ACTIONS_NOT_COMPILED ${requiredActions.filter((n) => !manifest.some((entry) => entry.exportedName === n)).join(',')}`);
      };
      const captureLegacyViews = async (manifest) => {
        const compare = await browserAction(page, { manifest, name: 'getEvaluationComparePageDataAction', args: [employeeBId] });
        const history = await browserAction(page, { manifest, name: 'getEvaluationHistoryAction', args: [employeeBId] });
        assert.ok(compare.value, 'Compare page data must return a value');
        assert.ok(Array.isArray(history.value), 'History action must return an array');
        const item = history.value.find((e) => e.id === closedEvalId);
        assert.ok(item, 'Legacy closed evaluation must exist in history');
        assert.equal(item.status, 'Approved');
        assert.ok(Number(item.finalScore) > 0 && item.finalGrade, 'history item must carry the real final score and grade');
        assert.equal((item.rounds || []).length, 3, 'history item must carry three rounds');
        assert.ok(item.rounds.every((r) => Number(r.totalScore) > 0 && r.scores && Object.keys(r.scores).length > 0), 'every history round must carry real scores');
        return { compare: JSON.parse(JSON.stringify(compare.value)), item: JSON.parse(JSON.stringify(item)) };
      };
      const preManifest = await loadAcceptanceManifest();
      const preViews = await captureLegacyViews(preManifest);
      const preCompareText = JSON.stringify(preViews.compare);
      assert.ok(preCompareText.length > 200, 'pre-import compare data must not be empty');

      // Import the 93-criteria synthetic catalog
      console.log('[Acceptance Runtime] Applying 93-criteria catalog import...');
      // Criteria config cannot change while a period is active (P108_PERIOD_ACTIVE): close the disposable fixture period first.
      runPsql(dbTarget, "UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");
      const preImportVersionNo = runPsql(dbTarget, "SELECT COALESCE(max(version_no)::text, '1') FROM public.criteria_config_versions;");
      const importRes = spawnSync(process.execPath, [
        importScriptPath,
        '--apply',
        '--expected-version', preImportVersionNo,
        '--manifest', syntheticManifestPath,
        '--disposable',
      ], {
        cwd: projectRoot,
        env: { ...process.env, KURABE_SUPABASE_URL: runtimeState.supabaseUrl, KURABE_SUPABASE_SERVICE_ROLE_KEY: runtimeState.serviceRoleKey },
        encoding: 'utf8',
        timeout: 30000,
      });
      if (importRes.status !== 0) throw new Error(`Import failed: ${importRes.stderr || importRes.stdout}`);

      // (i) Assertion: Compare page and history for pre-P108 Approved evaluation after import
      // render only the subject's set and the same numbers
      console.log('[Acceptance (i)] Verifying legacy Approved evaluation compare and history post-import...');
      await page.goto(`${origin}/history/${employeeBId}`);
      await page.waitFor("document.body.innerText.toLowerCase().includes('lịch sử') || document.body.innerText.toLowerCase().includes('đánh giá')", { timeout: 30000 });

      // Compare page for Employee B
      await page.goto(`${origin}/evaluations/${employeeBId}/compare`);
      await page.waitFor("document.body.innerText.toLowerCase().includes('so sánh') || document.body.innerText.toLowerCase().includes('vòng') || document.body.innerText.toLowerCase().includes('tiêu chí')", { timeout: 30000 });

      const postManifest = await loadAcceptanceManifest();
      const postViews = await captureLegacyViews(postManifest);
      assert.deepEqual(postViews.item, preViews.item, 'history item (scores, grades, rounds) must be identical before and after the 3-set import');
      // The compare page also carries the ACTIVE catalog filtered by the subject's set: that part legitimately changes with the import,
      // so everything else (subject, evaluation with rounds and scores, users) must be identical and the catalog part must be exactly the Staff set.
      const { groups: preGroups, ...preCompareRest } = preViews.compare;
      const { groups: postGroups, ...postCompareRest } = postViews.compare;
      assert.ok(Array.isArray(preGroups) && preGroups.length > 0, 'pre-import compare must carry the legacy catalog groups');
      assert.deepEqual(postCompareRest, preCompareRest, 'compare page data (subject, evaluation, rounds, scores) must be identical before and after the 3-set import');
      // The action returns the whole active catalog (18 groups / 93 criteria); ComparePageClient renders only criteria whose appliesTo contains the
      // subject's role (ComparePageClient.tsx:194-195). Apply that same rule here and require exactly the Staff set.
      assert.equal(postGroups.length, 18, 'compare action must carry the full 18-group active catalog');
      assert.equal(postGroups.reduce((n, g) => n + (g.criteria || []).length, 0), 93, 'compare action must carry the full 93-criteria active catalog');
      const subjectGroups = postGroups
        .map((g) => ({ ...g, criteria: (g.criteria || []).filter((c) => (c.appliesTo || []).includes('Employee')) }))
        .filter((g) => g.criteria.length > 0);
      assert.equal(subjectGroups.length, 6, 'an Employee subject must see exactly 6 groups');
      assert.equal(subjectGroups.reduce((n, g) => n + g.criteria.length, 0), 30, 'an Employee subject must see exactly 30 criteria');
      assert.ok(subjectGroups.every((g) => g.setKey === 'staff' && g.criteria.every((c) => c.setKey === 'staff')), 'no leader/worker criterion may leak into the Staff view');

      // Assert DB rows for legacy closed evaluation are unchanged
      const postImportDbEval = runPsql(dbTarget, `SELECT id, status, current_round, final_grade, final_score FROM public.evaluations WHERE id = '${closedEvalId}';`);
      const postImportDbRounds = runPsql(dbTarget, `SELECT round, evaluator_role, status, total_score, grade FROM public.evaluation_rounds WHERE evaluation_id = '${closedEvalId}' ORDER BY round;`);
      assert.equal(postImportDbEval, baselineDbEval, 'Legacy evaluation DB row must remain identical');
      assert.equal(postImportDbRounds, baselineDbRounds, 'Legacy evaluation rounds DB rows must remain identical');
      assert.equal(legacyDigest(), legacyDigestBefore, 'Legacy evaluation and rounds must be byte-identical (all columns, incl. scores, notes, evaluator ids, pins)');

      // ---- DOM-level proof of what the compare page renders (not just action data). The page shows the ACTIVE period, so activate the one under test.
      const staffNames = runPsql(dbTarget, "SELECT name FROM public.criteria WHERE is_active AND set_key = 'staff' ORDER BY code;").split('\n').filter(Boolean);
      const otherNames = runPsql(dbTarget, "SELECT name FROM public.criteria WHERE is_active AND set_key <> 'staff' ORDER BY code;").split('\n').filter(Boolean);
      assert.equal(staffNames.length, 30);
      assert.equal(otherNames.length, 63);
      const activatePeriod = (periodId) => runPsql(dbTarget, `UPDATE public.evaluation_periods SET status = CASE WHEN id = '${periodId}' THEN 'active' ELSE 'closed' END;`);

      const compareMainText = async () => {
        await page.evaluate("document.querySelectorAll('main details:not([open]) > summary').forEach((n) => n.click())");
        await new Promise((resolve) => setTimeout(resolve, 500));
        return page.evaluate("document.querySelector('main')?.innerText || ''");
      };
      // (a1) PINNED legacy Approved evaluation (2098): real scores/grade, labelled from its pinned LEGACY snapshot, never from the imported 3-set catalog.
      const pinnedLegacyNames = runPsql(dbTarget, `SELECT cv.name FROM public.criterion_versions cv WHERE cv.version_id = (SELECT criteria_config_version_id FROM public.evaluation_rounds WHERE evaluation_id = '${closedEvalId}' AND round = 1) ORDER BY cv.code;`).split('\n').filter(Boolean);
      assert.ok(pinnedLegacyNames.length > 0, 'pinned legacy snapshot must hold criteria');
      activatePeriod(closedPeriodId);
      await page.goto(`${origin}/evaluations/${employeeBId}/compare`);
      await page.waitFor("(document.querySelector('main')?.innerText || '').includes('P103-EMB') && (document.querySelector('main')?.innerText || '').includes('170')", { timeout: 30000, label: 'pinned legacy compare page rendered' });
      const pinnedText = await compareMainText();
      assert.ok((pinnedText.match(/170/g) || []).length >= 3, 'pinned legacy compare must show the real score of the three rounds');
      assert.ok(pinnedText.toLowerCase().includes('hạng s'), 'pinned legacy compare must show the real grade');
      assert.ok(!pinnedText.includes('Không có phiên bản tiêu chí lịch sử'), 'pinned legacy compare must not report a missing criteria version');
      assert.ok(pinnedLegacyNames.some((n) => pinnedText.includes(n)), 'pinned legacy compare must render criteria from its pinned legacy snapshot');
      for (const n of [...staffNames, ...otherNames]) assert.ok(!pinnedText.includes(n), `pinned legacy compare must not render imported-catalog criterion ${n}`);
      assert.equal(legacyDigest(), legacyDigestBefore, 'rendering the pinned legacy compare page must not change the legacy evaluation/rounds');

      // (a2) UNPINNED legacy Approved evaluation (fixture 2099, NULL pins): real scores shown, fail-closed message, zero live-catalog labels.
      activatePeriod(unpinnedPeriodId);
      await page.goto(`${origin}/evaluations/${employeeBId}/compare`);
      await page.waitFor("(document.querySelector('main')?.innerText || '').includes('Không có phiên bản tiêu chí lịch sử')", { timeout: 30000, label: 'unpinned legacy compare page rendered' });
      const unpinnedText = await compareMainText();
      assert.ok(unpinnedText.includes('170') && unpinnedText.toLowerCase().includes('hạng s'), 'unpinned legacy compare must show the real score and grade of its (single) submitted round');
      for (const n of [...staffNames, ...otherNames, ...pinnedLegacyNames]) assert.ok(!unpinnedText.includes(n), `unpinned legacy compare must not label from any catalog: ${n}`);
      assert.equal(digestOfEval(unpinnedEvalId), unpinnedDigestBefore, 'rendering the unpinned legacy compare page must not change the unpinned evaluation/rounds');

      // (b) New-catalog evaluation: create a period through the UI AFTER the import (the app initialises every employee with the 3-set catalog),
      // open the Employee's evaluation as the SubLeader so the app initialises the Draft round, then compare as Manager.
      // After a real click on every collapsed <details>, the page must show all 30 Staff criteria and no Leader/Worker criterion.
      runPsql(dbTarget, "UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");
      await loginAs(page, origin, 'P103-MGR');
      await createPeriodViaUi(page, origin, 2100);
      const newPeriodId = runPsql(dbTarget, "SELECT id FROM public.evaluation_periods WHERE year = 2100 AND status = 'active' LIMIT 1;");
      assert.ok(newPeriodId, 'post-import period must be created active through the UI');
      const newEvalId = runPsql(dbTarget, `SELECT id FROM public.evaluations WHERE period_id = '${newPeriodId}' AND employee_id = '${employeeBId}' LIMIT 1;`);
      assert.ok(newEvalId, 'Employee evaluation must exist in the post-import period');
      await loginAs(page, origin, 'P103-SLB');
      await openEvaluation(page, origin, employeeBId);
      const draftDeadline = Date.now() + 30000;
      while (runPsql(dbTarget, `SELECT status FROM public.evaluation_rounds WHERE evaluation_id = '${newEvalId}' AND round = 1;`) !== 'Draft') {
        if (Date.now() > draftDeadline) throw new Error('Employee draft round was not initialised by the app within 30s');
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await loginAs(page, origin, 'P103-MGR');
      await page.goto(`${origin}/evaluations/${employeeBId}/compare`);
      await page.waitFor(`(() => { document.querySelectorAll('main details:not([open]) > summary').forEach((n) => n.click()); return (document.querySelector('main')?.textContent || '').includes(${JSON.stringify(staffNames[0])}); })()`, { timeout: 30000, label: 'new-catalog compare criteria rendered' });
      const mainText = await page.evaluate("document.querySelector('main')?.textContent || ''");
      const renderedStaff = staffNames.filter((n) => mainText.includes(n));
      const renderedOther = otherNames.filter((n) => mainText.includes(n));
      assert.equal(renderedStaff.length, 30, `compare DOM must show all 30 Staff criteria, got ${renderedStaff.length}`);
      assert.deepEqual(renderedOther, [], 'compare DOM must show NO Leader/Worker criterion');
      assert.equal(legacyDigest(), legacyDigestBefore, 'new-catalog flows must not change the legacy evaluation/rounds');
      runPsql(dbTarget, "UPDATE public.evaluation_periods SET status = 'closed' WHERE status = 'active';");

      console.log('[PASS] (i) Legacy approved evaluation compare and history fidelity verified');
      caseResults.push({ name: 'legacy-approved-evaluation-compare-and-history-fidelity', status: 'PASS' });

      // (ii) Assertion: Catalog-size smoke: with 93-criteria active, /criteria, /reports, and /dashboard
      // each load under a generous bounded timeout (e.g. 45000ms)
      console.log('[Acceptance (ii)] Executing catalog-size smoke: /criteria, /reports, /dashboard bounded loads...');
      const timings = {};
      const smokeTeams = runPsql(dbTarget, "SELECT name FROM public.teams WHERE is_active ORDER BY name;").split('\n').filter(Boolean);
      const smokeHeadcount = runPsql(dbTarget, "SELECT count(*) FROM public.users WHERE is_active;");
      const smokePeriodLabel = `Kỳ ${runPsql(dbTarget, "SELECT year FROM public.evaluation_periods ORDER BY created_at DESC LIMIT 1;")}`;
      assert.ok(smokeTeams.length === 3 && Number(smokeHeadcount) === 6, 'smoke runtime must hold the 3 seeded teams and 6 users');
      const assertHealthyPage = (text, route) => {
        for (const bad of ['Đã xảy ra lỗi', 'Application error', 'Something went wrong', 'Không thể tải', 'Lỗi:']) assert.ok(!text.includes(bad), `${route} must not render an error state (${bad})`);
      };
      const smokeCatalog = runPsql(dbTarget, "SELECT (SELECT count(*) FROM public.criteria_groups WHERE is_active) || '/' || (SELECT count(*) FROM public.criteria WHERE is_active) || '/' || (SELECT count(*) FROM public.criteria_config_versions WHERE is_active) || '/' || (SELECT string_agg(set_key || '=' || n, ',' ORDER BY set_key) FROM (SELECT set_key, count(*)::text AS n FROM public.criteria WHERE is_active GROUP BY set_key) q);");
      assert.equal(smokeCatalog, '18/93/1/leader=33,staff=30,worker=30', 'smoke must run against the 18-group / 93-criteria / one-active-version catalog of this very runtime');
      // /criteria opens on the Leader tab with its first group active: that group's name and first criterion must render.
      const sampleGroupName = runPsql(dbTarget, "SELECT name FROM public.criteria_groups WHERE is_active AND set_key = 'leader' ORDER BY sort_order, code LIMIT 1;");
      const sampleCriterionName = runPsql(dbTarget, "SELECT c.name FROM public.criteria c JOIN public.criteria_groups g ON g.id = c.group_id WHERE c.is_active AND g.is_active AND g.set_key = 'leader' ORDER BY g.sort_order, g.code, c.sort_order, c.code LIMIT 1;");
      assert.ok(sampleGroupName.length > 2, 'sample group name must exist');
      const firstLeaderGroupCriteria = runPsql(dbTarget, "SELECT c.name FROM public.criteria c WHERE c.is_active AND c.group_id = (SELECT g.id FROM public.criteria_groups g WHERE g.is_active AND g.set_key = 'leader' ORDER BY g.sort_order, g.code LIMIT 1) ORDER BY c.sort_order, c.code;").split('\n').filter(Boolean);
      assert.ok(firstLeaderGroupCriteria.length >= 3, 'the first leader group must hold its imported criteria');
      assert.ok(sampleCriterionName.length > 2, 'sample criterion name must exist');

      const BOUND_MS = 45000;

      // Measure /criteria
      const t0Criteria = performance.now();
      await page.goto(`${origin}/criteria`);
      await page.waitFor("document.body.innerText.toLowerCase().includes('tiêu chí') || document.body.innerText.toLowerCase().includes('tiêu chuẩn')", { timeout: BOUND_MS });
      // The catalog loads asynchronously: wait (bounded) for the imported Leader group and its first criterion to render.
      await page.waitFor(`location.pathname === '/criteria' && document.body.innerText.includes(${JSON.stringify(sampleGroupName)}) && ${JSON.stringify(firstLeaderGroupCriteria)}.every((n) => document.body.innerText.includes(n))`, { timeout: BOUND_MS, label: 'imported catalog rendered' });
      timings.criteriaMs = Math.round(performance.now() - t0Criteria);
      assert.ok(await page.evaluate(`document.body.innerText.includes(${JSON.stringify(sampleGroupName)})`), '/criteria must render the imported Leader group name');
      assert.ok(await page.evaluate(`document.body.innerText.includes(${JSON.stringify(sampleCriterionName)})`), '/criteria must render the imported Leader first criterion');
      assert.ok(timings.criteriaMs < BOUND_MS, `/criteria load must complete within ${BOUND_MS}ms, took ${timings.criteriaMs}ms`);

      // Measure /reports
      const t0Reports = performance.now();
      await page.goto(`${origin}/reports`);
      // Runtime-backed proof: the period label, every seeded team and the employee headcount of THIS runtime must be rendered by the report.
      await page.waitFor(`(() => { const t = document.body.innerText; return location.pathname === '/reports' && ${JSON.stringify(smokeTeams)}.every((n) => t.includes(n)) && t.includes(${JSON.stringify(smokePeriodLabel)}) && t.includes(${JSON.stringify(`${smokeHeadcount}\nnhân sự`)}); })()`, { timeout: BOUND_MS, label: 'reports runtime data rendered' });
      assertHealthyPage(await page.evaluate('document.body.innerText'), '/reports');
      assert.ok((await page.evaluate('document.body.innerText')).includes(`${smokeHeadcount}\nnhân sự`), '/reports must show the headcount of this runtime');
      timings.reportsMs = Math.round(performance.now() - t0Reports);
      assert.ok(timings.reportsMs < BOUND_MS, `/reports load must complete within ${BOUND_MS}ms, took ${timings.reportsMs}ms`);

      // Measure /dashboard
      const t0Dashboard = performance.now();
      await page.goto(`${origin}/dashboard`);
      await page.waitFor(`(() => { const t = document.body.innerText; return location.pathname === '/dashboard' && ${JSON.stringify(smokeTeams)}.every((n) => t.includes(n)) && t.includes(${JSON.stringify(smokePeriodLabel)}) && t.includes(${JSON.stringify(`${smokeHeadcount}\nnhân sự`)}); })()`, { timeout: BOUND_MS, label: 'dashboard runtime data rendered' });
      const dashboardText = await page.evaluate('document.body.innerText');
      assertHealthyPage(dashboardText, '/dashboard');
      assert.ok(dashboardText.includes(`${smokeHeadcount}\nnhân sự`) && dashboardText.includes(`0/${smokeHeadcount}`), '/dashboard must show this runtime headcount and 0 evaluated');
      timings.dashboardMs = Math.round(performance.now() - t0Dashboard);
      assert.ok(timings.dashboardMs < BOUND_MS, `/dashboard load must complete within ${BOUND_MS}ms, took ${timings.dashboardMs}ms`);

      console.log(`[PASS] (ii) Catalog-size smoke timings: criteria=${timings.criteriaMs}ms, reports=${timings.reportsMs}ms, dashboard=${timings.dashboardMs}ms`);
      caseResults.push({
        name: 'catalog-size-smoke-bounded-load',
        status: 'PASS',
        timings,
        catalog: smokeCatalog,
      });
    } catch (err) {
      overallError = err;
      console.error('[Error during acceptance own assertions]:', err);
    } finally {
      if (browser) {
        try { await browser.stop(); } catch {}
      }
      performCleanup(confirmationRuntimeScript, runtimeRoot);
    }
  }

  // ---------------------------------------------------------------------------
  // 3. Special Case: Signed Manifest Dry-Run (BLOCKED_NA)
  // ---------------------------------------------------------------------------
  const signedManifestCase = {
    name: 'signed-manifest-dry-run',
    status: 'BLOCKED_NA',
    reason: 'T02/G1 not signed; synthetic manifest only; not business sign-off, not production-ready',
  };
  caseResults.push(signedManifestCase);

  // ---------------------------------------------------------------------------
  // 4. Evidence Report & Verdict
  // ---------------------------------------------------------------------------
  const allSubTestsPassed = childResults.every((c) => c.status === 'PASS')
    && caseResults.some((c) => c.name === 'legacy-approved-evaluation-compare-and-history-fidelity' && c.status === 'PASS')
    && caseResults.some((c) => c.name === 'catalog-size-smoke-bounded-load' && c.status === 'PASS');

  const finalStatus = (!overallError && allSubTestsPassed) ? 'PASS_TECHNICAL_WITH_NA' : 'FAIL';

  const evidenceReport = {
    format: 'kurabe-p108-acceptance-evidence/v1',
    runId,
    task: 'P108M1T10',
    tier: 'CONTROLLED',
    timestamp: new Date().toISOString(),
    candidateSha,
    status: finalStatus,
    children: childResults,
    cases: caseResults,
    cleanup: {
      runtimeResidue: 0,
      noDockerResidue: true,
    },
    error: overallError ? redact(overallError.message) : null,
  };

  try {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidenceReport, null, 2)}\n`, { mode: 0o600 });
    console.log(`\n[Evidence] Saved acceptance evidence report to ${evidencePath}`);
  } catch (err) {
    throw new Error(`FAIL_CLOSED: evidence report could not be written: ${err.message}`);
  }

  if (overallError) throw overallError;
  if (!allSubTestsPassed) throw new Error('Not all acceptance child suites or own assertions passed');

  console.log('\n======================================================');
  console.log(`P108 ACCEPTANCE GATES OVERALL STATUS: ${finalStatus}`);
  console.log('======================================================');
}

main().catch((err) => {
  console.error('\nFATAL_ERROR in p108-acceptance:', err);
  process.exit(1);
});
