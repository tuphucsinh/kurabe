#!/usr/bin/env node
// P107M1T07 authentic browser acceptance producer.
//
// Provisions a fresh disposable loopback PostgreSQL17 + real PostgREST v12.2.3
// + compatible /rest/v1 proxy + an isolated actual-Next production runtime and
// drives Chromium through the REAL application UI. Every assertion is
// manifested and fail-closed; a partial lane can never report passed=true.
//
// Usage:
//   node tests/fixtures/p107/lifecycle-coherence/browser-acceptance.mjs \
//     --evidence /absolute/path.json --expected-sha <frozen-head-sha> \
//     [--runtime-root <dir>] [--chrome <binary>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CaseLedger, PROJECT_ROOT,
  assertResourceBudget, captureDiagnosticIdentity, captureHarnessSourceHashes, captureSourceIdentity,
  captureResourceReadback, countLockWaiters, openPsqlSession, pgLocks, pgStatActivity, psql,
  readStartTicks, resolveRuntimeRoot, safeError, wait, waitFor, hashString,
} from './lib/guard.mjs';
import { provisionStack, startIsolatedNext } from './lib/stack.mjs';
import { launchChromium } from './lib/browser.mjs';
import {
  ACTOR_ROLES, browserAction, buildFixtureIds, closePeriodViaUi,
  createPeriodViaUi, criteriaSnapshotReadback, decodeFlight, deletePeriodViaUi, evaluationCountForPeriod, evaluationDigest,
  expectedProjectionBasis, openPeriodsTab, periodRowExists, restProbe,
  listPeriods, loadActionManifest, loginAs, logoutViaUi, makeRunSeed, openEvaluation,
  periodRowSelected, policyCounts, readEvaluation, readRound, readRounds, retireScratchUser,
  returnRoundViaUi, saveDraftViaUi, seedBaseConfig, seedConcurrencyScratch,
  seedConcurrencyScratchPeriod, seedDeclaredEmptyClosedPeriod, seedOrg, seedPreMigrationConfig,
  selectPeriodViaUi, selectTopLevel, submitViaUi, subjectId,
} from './lib/org.mjs';

const FILE = fileURLToPath(import.meta.url);
const POLL_WAIT_MS = 33_000; // strictly above the app's 30s same-identity poll cadence

// P110M2T01: phase progress on stderr (redaction-free ids/durations only) so the
// wrapper can forward live visibility into the CI step log instead of 40 silent
// minutes ending in one opaque line.
const PROGRESS_T0 = Date.now();
function progress(message) {
  console.error(`[p107-browser +${Math.round((Date.now() - PROGRESS_T0) / 1000)}s] ${message}`);
}

const CASE_MANIFEST = [
  { id: 'src:frozen-head-expected-sha', group: 'identity', expected: 'git HEAD equals the caller-supplied expected SHA' },
  { id: 'src:harness-source-hashes', group: 'identity', expected: 'all owned harness sources hashed in evidence' },
  { id: 'infra:resource-budget', group: 'infra', expected: 'MemAvailable >= 3145728 KiB before provision/build/browser' },
  { id: 'infra:loopback-stack-owned', group: 'infra', expected: 'db+rest bound loopback, run-owned names' },
  { id: 'infra:migrations-applied-ledger', group: 'infra', expected: 'forward migrations applied and ledger counted' },
  { id: 'infra:rest-postgrest-real', group: 'infra', expected: 'PostgREST v12.2.3 answers under /rest/v1 through the proxy' },
  { id: 'infra:next-isolated-build', group: 'infra', expected: 'isolated actual-Next production build with private .next' },
  { id: 'org:single-active-manager', group: 'personnel', expected: 'exactly one active Manager' },
  { id: 'org:appointed-leader', group: 'personnel', expected: 'team has an appointed Leader pointer' },
  { id: 'org:subleader-pointers', group: 'personnel', expected: 'Employee/Worker point at the SubLeader' },
  { id: 'org:no-progressed-rounds-seeded', group: 'personnel', expected: 'no progressed rounds inserted before the app creates the period' },
  { id: 'config:active-criteria-and-grade', group: 'personnel', expected: 'active criteria and grade snapshot versions exist' },
  { id: 'period:create-via-ui', group: 'period', expected: 'Manager creates the active period through the real UI' },
  { id: 'period:evaluations-seeded-for-five-subjects', group: 'period', expected: 'period creation yields five NotStarted subjects with round 1' },
  { id: 'flow:manager-round1-self-final-approve', group: 'flow', expected: 'Manager subject: save draft, submit round 1, final Approved' },
  { id: 'flow:leader-round1-self', group: 'flow', expected: 'Leader subject: self round 1 submit advances to round 2' },
  { id: 'flow:leader-round2-manager-approve', group: 'flow', expected: 'Manager final-approves Leader round 2' },
  { id: 'flow:subleader-round1-self', group: 'flow', expected: 'SubLeader subject: self round 1 submit advances to round 2' },
  { id: 'flow:subleader-round2-leader', group: 'flow', expected: 'Leader evaluates SubLeader round 2' },
  { id: 'flow:subleader-round3-manager-approve', group: 'flow', expected: 'Manager final-approves SubLeader round 3' },
  { id: 'flow:employee-round1-subleader', group: 'flow', expected: 'SubLeader evaluates Employee round 1' },
  { id: 'flow:employee-round2-leader', group: 'flow', expected: 'Leader evaluates Employee round 2' },
  { id: 'flow:employee-round3-manager-return', group: 'flow', expected: 'Manager returns Employee round 3; round 2 reopens' },
  { id: 'flow:employee-resubmit-round2', group: 'flow', expected: 'Leader resubmits Employee round 2 after the return' },
  { id: 'flow:employee-round3-manager-final-approve', group: 'flow', expected: 'Manager final-approves Employee round 3' },
  { id: 'flow:worker-round1-subleader', group: 'flow', expected: 'SubLeader evaluates Worker round 1' },
  { id: 'flow:worker-round2-leader', group: 'flow', expected: 'Leader evaluates Worker round 2' },
  { id: 'flow:worker-round3-manager-approve', group: 'flow', expected: 'Manager final-approves Worker round 3' },
  { id: 'flow:employee-login-own-view', group: 'flow', expected: 'Employee logs in and reads own evaluation' },
  { id: 'flow:worker-login-own-view', group: 'flow', expected: 'Worker logs in and reads own evaluation' },
  { id: 'flow:immutable-closed-history', group: 'flow', expected: 'Approved digests unchanged after later mutations' },
  { id: 'period:close-clean-approved', group: 'period', expected: 'a fully-approved period closes without the frozen label' },
  { id: 'period:close-frozen-unfinished', group: 'period', expected: 'close with unfinished rounds is allowed and shows the frozen label' },
  { id: 'period:new-period-created', group: 'period', expected: 'a new period is created after the previous one closes' },
  { id: 'deny:http-business-vs-transport-separated', group: 'deny', expected: 'business denial is HTTP-ok; bogus transport is HTTP-fail' },
  { id: 'deny:zero-graph-delta-on-deny', group: 'deny', expected: 'denied writes leave the policy graph unchanged' },
  { id: 'deny:closed-period-write-denied', group: 'deny', expected: 'writing into a closed period is refused by the period guard' },
  { id: 'deny:revoked-session-cannot-restore', group: 'deny', expected: 'revoked session cannot restore the resident payload' },
  { id: 'race:close-save-concurrent', group: 'race', expected: 'close racing an in-flight save converges without corruption' },
  { id: 'race:return-submit-concurrent', group: 'race', expected: 'return racing a submit converges on one terminal state' },
  { id: 'fault:version-edit-resubmit-reconcile', group: 'race', expected: 'active-period config edit is denied; resubmit reconciles under the current active version' },
  { id: 'fault:duplicate-response-loss-retry', group: 'race', expected: 'duplicate/response-loss retry is idempotent' },
  { id: 'tab:shared-context-create-select-convergence', group: 'tab', expected: 'second tab converges to created/selected period without reload' },
  { id: 'tab:shared-context-close-convergence', group: 'tab', expected: 'second tab converges to closed period state without reload' },
  { id: 'tab:cookie-provider-rsc-consistency', group: 'tab', expected: 'cookie, provider state and RSC props agree after convergence' },
  { id: 'tab:delete-empty-refused-convergence', group: 'tab', expected: 'a non-empty closed period delete is refused and both tabs stay consistent' },
  { id: 'poll:unchanged-scope-30s-no-blink', group: 'poll', expected: '>30s same-identity poll never blanks the resident content' },
  { id: 'cdp:delayed-response-no-stale-resident', group: 'cdp', expected: 'paused response preserves resident payload then applies on release' },
  { id: 'dto:approved-only-projection', group: 'dto', expected: 'result projection is Approved-only with coverage counts' },
  { id: 'dto:minimization-no-internal-fields', group: 'dto', expected: 'browser readbacks expose no internal fields' },
  { id: 'diag:desktop-1440x900-console-network', group: 'diag', expected: 'desktop viewport captured with console/network counts' },
  { id: 'diag:mobile-390x844-console-network', group: 'diag', expected: 'mobile viewport captured with console/network counts' },
  { id: 'diag:loading-empty-error-retry-behavior', group: 'diag', expected: 'loading/empty/error/retry surfaces rendered' },
  { id: 'diag:screenshots-captured', group: 'diag', expected: 'real screenshots captured for both viewports' },

  // ---- Prefreeze semantic repair (P107M1T07, pre-candidate): supplemental
  // manifested cases. Each carries real assertions/readback — never a label.
  { id: 'infra:owned-resource-identity', group: 'infra', expected: 'owned Next/proxy/Chrome PID+startticks, containers, network and loopback ports read back while alive' },
  { id: 'dto:approved-only-projection-mixed', group: 'dto', expected: 'a mixed Approved/unapproved period projects only Approved rows with exact ids/score/grade/basis' },
  { id: 'tab:delete-empty-success-convergence', group: 'tab', expected: 'a declared empty closed period deletes successfully and both resident tabs reconcile the exact absent id (no reload)' },
  { id: 'race:close-save-db-concurrent', group: 'race', expected: 'close/save overlap proven by a competing PostgreSQL connection + direct same-RPC interleave with pg_locks readback' },
  { id: 'race:return-submit-db-concurrent', group: 'race', expected: 'return/submit overlap proven by a competing PostgreSQL connection + direct same-RPC interleave with pg_locks readback' },
  { id: 'race:version-edit-resubmit-concurrent', group: 'race', expected: 'version edit/resubmit overlap proven by a competing PostgreSQL connection + direct same-RPC interleave with pg_locks readback' },
  { id: 'fault:reader-transport-retry-recovery', group: 'fault', expected: 'exact local reader transport fault renders loading/error/Retry then recovers against the real backend' },
  { id: 'scope:no-active-period-fail-closed', group: 'scope', expected: 'with no Active period the authenticated metadata refresh is fail-closed and the UI stays bounded' },
  { id: 'scope:malformed-active-metadata-fail-closed', group: 'scope', expected: 'malformed/duplicate-Active metadata fails closed; DB uniqueness is stated, the invariant is never weakened' },
  { id: 'fault:stale-read-cannot-resurrect-after-revocation', group: 'fault', expected: 'a paused old authenticated read released after logout cannot resurrect the protected payload' },
  { id: 'diag:console-exception-first-party-gates', group: 'diag', expected: 'distinct window-scoped consoleError / exception / first-party-failure gates are asserted separately' },
];

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help') { options.help = true; continue; }
    if (arg === '--evidence') { options.evidence = argv[++i]; continue; }
    if (arg === '--expected-sha') { options.expectedSha = argv[++i]; continue; }
    if (arg === '--runtime-root') { options.runtimeRoot = argv[++i]; continue; }
    if (arg === '--chrome') { options.chrome = argv[++i]; continue; }
    // Explicit diagnostic mode: tolerates an uncommitted (dirty) worktree and
    // produces evidence that can never be qualified as the frozen candidate.
    if (arg === '--diagnostic') { options.diagnostic = true; continue; }
  }
  return options;
}

function failClosed(message, code) {
  const error = new Error(message);
  error.code = code || 'SUBSTANTIVE_FAILURE';
  return error;
}

async function subjectEvaluationId(target, periodId, employeeId) {
  const found = psql(target, `SELECT id FROM public.evaluations WHERE period_id='${periodId}' AND employee_id='${employeeId}';`);
  assert.ok(/^[0-9a-f-]{36}$/i.test(found), `no evaluation for subject ${employeeId}`);
  return found;
}

function latestPeriodId(target) {
  const rows = listPeriods(target);
  assert.ok(rows.length > 0, 'no periods exist');
  return rows[rows.length - 1].id;
}

// ---------------------------------------------------------------------------
// Prefreeze semantic-repair helpers: real concurrency + transport-seam probes.
// ---------------------------------------------------------------------------
const SAVE_RPC = 'save_evaluation_round_transaction_active_only';
const RETURN_RPC = 'return_evaluation_round_transaction';

function actionIdFor(manifest, name) {
  const item = manifest.find((entry) => entry.exportedName === name);
  assert.ok(item, `ACTION_NOT_COMPILED ${name}`);
  return item.id;
}

function transitionContextCount(target) {
  return Number(psql(target, 'SELECT count(*) FROM public.evaluation_transition_context;'));
}

/** Complete graph digest over the given evaluations and all their rounds. */
function raceGraphDigest(target, evaluationIds) {
  const ids = evaluationIds.map((id) => `'${id}'`).join(',');
  const text = psql(target, `
    SELECT COALESCE(string_agg(line, E'\\n' ORDER BY line), '') FROM (
      SELECT 'e|' || id || '|' || current_round || '|' || status || '|' || COALESCE(final_grade,'') || '|' || COALESCE(final_score::text,'') || '|' || COALESCE(return_note,'') AS line
      FROM public.evaluations WHERE id IN (${ids})
      UNION ALL
      SELECT 'r|' || id || '|' || round || '|' || status || '|' || COALESCE(evaluator_id::text,'') || '|' || evaluator_role || '|' || COALESCE(total_score::text,'') || '|' || COALESCE(grade,'') || '|' || scores::text || '|' || notes::text || '|' || COALESCE(submitted_at::text,'') || '|' || COALESCE(criteria_config_version_id::text,'') || '|' || COALESCE(grade_config_version_id::text,'') AS line
      FROM public.evaluation_rounds WHERE evaluation_id IN (${ids})
    ) s;`);
  return hashString(text);
}

function saveRpcSql({ evaluationId, round, actor, scores = {}, notes = {}, comment = '', total = 0, grade = 'Pending', isSubmit = false, nextRound = null, nextEvaluator = null, nextRole = null, nextStatus = null, isFinal = false, ccv = null, gbv = null, label }) {
  const u = (v) => (v === null || v === undefined ? 'NULL' : `'${v}'::uuid`);
  const t = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
  return `SELECT '${label}|' || round_id || '|' || COALESCE(next_round_id::text,'') || '|' || final_status FROM public.${SAVE_RPC}(
    '${evaluationId}'::uuid, ${round}, '${actor}'::uuid,
    '${JSON.stringify(scores)}'::jsonb, '${JSON.stringify(notes)}'::jsonb, ${t(comment)}, ${total}, ${t(grade)},
    ${isSubmit}, now(), ${nextRound === null ? 'NULL' : nextRound}, ${u(nextEvaluator)}, ${t(nextRole)}, ${t(nextStatus)}, ${isFinal},
    ${u(ccv)}, ${u(gbv)});`;
}

function returnRpcSql({ evaluationId, round, actor, reason, label = 'RET' }) {
  return `SELECT '${label}|' || evaluation_id || '|' || restored_round || '|' || restored_status FROM public.${RETURN_RPC}('${evaluationId}'::uuid, ${round}, '${actor}'::uuid, '${String(reason).replaceAll("'", "''")}');`;
}

/**
 * Advance a freshly seeded scratch round from NotStarted to Draft through the
 * REAL save RPC (the only permitted path). A direct progressed-round INSERT is
 * rejected by guard_evaluation_round_mutations(); the real UI drafts on first
 * open, so the fixture must do the same before an isSubmit RPC.
 */
function draftScratchViaRpc(target, { evaluationId, round, actor, ccv, gbv }) {
  const out = psql(target, saveRpcSql({ evaluationId, round, actor, scores: {}, notes: {}, comment: 'draft-seed', total: 0, grade: 'Pending', isSubmit: false, nextRound: null, nextEvaluator: null, nextRole: null, nextStatus: null, isFinal: false, ccv, gbv, label: 'DRAFT_DONE' }));
  assert.match(out, /\|Draft$/, `draft seed via RPC must land Draft: ${out}`);
}

/**
 * Authenticated-browser tier: a real competing PostgreSQL connection holds a
 * conflicting lock (the same lock the RPC itself acquires) while genuine browser
 * calls are issued. pg_stat_activity/pg_locks prove the browser RPC backends are
 * actually blocked, i.e. real overlap — not merely two client-side promises.
 */
async function withCompetingPgLock(target, lockSql, produceBrowserCalls, { label }) {
  const holder = openPsqlSession(target);
  try {
    holder.sql("BEGIN;\nSELECT 'P107T07_HOLDER_READY:' || pg_backend_pid();");
    await holder.waitForOutput(/P107T07_HOLDER_READY:\d+/, { timeout: 15_000, label: `${label} holder ready` });
    const holderPid = Number(holder.take().match(/P107T07_HOLDER_READY:(\d+)/)?.[1]);
    holder.sql(lockSql);
    await waitFor(() => pgLocks(target).some((lock) => lock.pid === holderPid && lock.granted === true),
      { timeout: 10_000, interval: 100, label: `${label} holder lock granted` });
    const browserPromise = produceBrowserCalls();
    const waiters = await waitFor(() => {
      const n = countLockWaiters(target);
      return n >= 1 ? n : false;
    }, { timeout: 25_000, interval: 100, label: `${label} browser overlap` });
    const locksDuring = pgLocks(target).filter((lock) => lock.relation === 'evaluation_rounds' || lock.relation === 'evaluation_periods' || lock.granted === false);
    const activityDuring = pgStatActivity(target).filter((row) => row.wait_event_type === 'Lock');
    holder.sql('COMMIT;');
    const results = await browserPromise;
    return { holderPid, waiters, locksDuring, activityDuring, results };
  } finally {
    try { holder.sql('ROLLBACK;'); } catch { /* ignore */ }
    await holder.close();
  }
}

/**
 * Direct-DB tier: two separate PostgreSQL connections invoke the SAME actual RPC
 * in competing transactions. A holds its transaction-level table lock; B's
 * identical RPC genuinely blocks on it (pg_locks readback), then completes once A
 * commits. Deterministic lock-based interleave — no browser Promise.all.
 */
async function directRpcInterleave(target, { sqlA, sqlB, label }) {
  const a = openPsqlSession(target);
  const b = openPsqlSession(target);
  try {
    a.sql("BEGIN;\nSELECT 'A_READY';");
    await a.waitForOutput(/A_READY/, { timeout: 15_000, label: `${label} A ready` });
    a.sql(sqlA);
    await a.waitForOutput(/A_DONE\|/, { timeout: 20_000, label: `${label} A completed` });
    const outA = a.take();

    b.sql("BEGIN;\nSELECT 'B_READY';");
    await b.waitForOutput(/B_READY/, { timeout: 15_000, label: `${label} B ready` });
    b.sql(sqlB);
    const blocked = await waitFor(() => countLockWaiters(target) >= 1, { timeout: 20_000, interval: 100, label: `${label} B blocked` });
    const locksDuring = pgLocks(target).filter((lock) => lock.granted === false || lock.relation === 'evaluation_rounds');

    a.sql('COMMIT;');
    await b.waitForOutput(/B_DONE\|/, { timeout: 20_000, label: `${label} B completed` });
    const outB = b.take();
    b.sql('COMMIT;');
    return { blocked, locksDuring, outA: outA.trim(), outB: outB.trim() };
  } finally {
    await a.close();
    await b.close();
  }
}


export async function run(options, ctx) {
  const ledger = ctx.ledger;
  const evidencePath = options.evidence ? path.resolve(options.evidence) : null;
  if (!evidencePath) throw failClosed('--evidence <absolute path> is required', 'INSUFFICIENT_INPUT');
  if (!path.isAbsolute(evidencePath)) throw failClosed('--evidence must be an absolute path', 'INSUFFICIENT_INPUT');

  // Populate the SHARED ctx so the caller's cleanup owns every resource this run
  // starts. (The previous version built a private ctx here, so runWithCleanup's
  // teardown saw null handles and left detached Next + Chromium processes alive.)
  ctx.evidencePath = evidencePath;
  ctx.stack = null;
  ctx.next = null;
  ctx.browser = null;
  ctx.screenshots = [];
  const runtimeRoot = resolveRuntimeRoot({ explicit: options.runtimeRoot });

  try {
    fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
    ledger.setMeta({ runtimeRoot, worktree: PROJECT_ROOT, mode: 'implement-and-run' });

    // ---- identity / infra guards (no runtime yet) ----
    await ledger.run('src:frozen-head-expected-sha', () => {
      const expectedSha = options.expectedSha || process.env.KURABE_P107_EXPECTED_SHA;
      if (options.diagnostic) {
        // Diagnostic lane: HEAD must still equal the caller-supplied SHA, but an
        // uncommitted worktree is tolerated and pinned by a dirty digest. Evidence
        // is explicitly non-qualifying (see ledger.setMeta below).
        const identity = captureDiagnosticIdentity({ expectedSha });
        ledger.setMeta({
          qualification: 'DIAGNOSTIC',
          diagnosticIdentity: {
            head: identity.head,
            expectedSha: identity.expectedSha,
            worktreeDirty: identity.worktreeDirty,
            dirtyEntries: identity.dirtyEntries,
            dirtyDigest: identity.dirtyDigest,
          },
        });
        return {
          actual: { head: identity.head, expectedSha: identity.expectedSha, diagnostic: true, dirtyEntries: identity.dirtyEntries },
          readback: { dirtyDigest: identity.dirtyDigest },
        };
      }
      const identity = captureSourceIdentity({ expectedSha });
      return { actual: { head: identity.head, expectedSha: identity.expectedSha }, readback: { worktreeStatus: identity.worktreeStatus.split('\n').filter(Boolean).length } };
    }, 'HEAD matches expected SHA');
    await ledger.run('src:harness-source-hashes', () => {
      const hashes = captureHarnessSourceHashes();
      return { actual: { files: Object.keys(hashes).length }, readback: hashes };
    }, 'harness source hashes recorded');
    await ledger.run('infra:resource-budget', () => {
      const budget = assertResourceBudget();
      return { actual: budget, readback: budget.memAvailableKiB >= budget.requiredKiB };
    }, 'MemAvailable >= floor');

    // ---- provision disposable loopback DB + PostgREST + proxy + isolated Next ----
    const ids = buildFixtureIds(makeRunSeed());
    ctx.stack = await provisionStack({ runtimeRoot, preMigrationSeed: (target) => seedPreMigrationConfig(target, ids) });
    ctx.ledger.setMeta({ db: { host: ctx.stack.dbTarget.host, port: ctx.stack.dbTarget.port, database: ctx.stack.dbTarget.database }, restUrl: ctx.stack.restUrl });
    await ledger.run('infra:loopback-stack-owned', () => ({
      actual: { dbHost: ctx.stack.dbTarget.host, restUrl: ctx.stack.restUrl, network: ctx.stack.networkName, owned: ctx.stack.owned },
      readback: { containers: ctx.stack.containersStarted },
    }), 'loopback + run-owned');
    await ledger.run('infra:migrations-applied-ledger', () => ({
      actual: { applied: ctx.stack.migrations.appliedNames.length, ledgerCount: ctx.stack.migrations.ledgerCount },
      readback: { appliedNames: ctx.stack.migrations.appliedNames },
    }), 'forward migrations applied');
    await ledger.run('infra:rest-postgrest-real', async () => {
      const response = await fetch(`${ctx.stack.restUrl}/rest/v1/`, { headers: { apikey: ctx.stack.anonKey } });
      assert.ok(response.status > 0, 'rest proxy did not answer');
      const container = (await import('./lib/guard.mjs')).run('docker', ['inspect', '--format', '{{.Config.Image}}', ctx.stack.containerNames.rest]);
      return { actual: { status: response.status }, readback: { image: container.stdout.trim() } };
    }, 'PostgREST reachable under /rest/v1');

    // ---- seed prerequisites then build the isolated Next runtime ----
    const config = seedBaseConfig(ctx.stack.dbTarget, ids);
    const org = seedOrg(ctx.stack.dbTarget, ids);
    ctx.ids = ids;
    ctx.config = config;

    progress('isolated next build starting');
    assertResourceBudget(); // re-check the budget immediately before the build
    ctx.next = await startIsolatedNext({
      runtimeRoot, restUrl: ctx.stack.restUrl, anonKey: ctx.stack.anonKey,
      serviceRoleKey: ctx.stack.serviceRoleKey, runId: ctx.stack.runId,
    });
    progress(`isolated next ready at ${ctx.next.url}`);
    const manifest = loadActionManifest(ctx.next.buildDir);
    ctx.manifest = manifest;
    ctx.origin = ctx.next.url;

    await ledger.run('infra:next-isolated-build', () => ({
      actual: { url: ctx.next.url, buildDir: ctx.next.buildDir },
      readback: { nodeModules: ctx.next.nodeModules, actions: manifest.length },
    }), 'isolated Next production build');

    await ledger.run('org:single-active-manager', () => ({ actual: { managers: org.managers }, readback: { managerId: ids.manager } }), 'one active Manager');
    await ledger.run('org:appointed-leader', () => ({ actual: { appointedLeaderId: org.appointedLeaderId }, readback: { leaderId: ids.leader } }), 'appointed Leader');
    await ledger.run('org:subleader-pointers', () => ({ actual: { subPointers: org.subPointers }, readback: { subleaderId: ids.subleader } }), 'subleader pointers');
    await ledger.run('org:no-progressed-rounds-seeded', async () => {
      const { psql } = await import('./lib/guard.mjs');
      const rounds = Number(psql(ctx.stack.dbTarget, 'SELECT count(*) FROM public.evaluation_rounds;'));
      const evals = Number(psql(ctx.stack.dbTarget, 'SELECT count(*) FROM public.evaluations;'));
      assert.equal(rounds, 0, 'no rounds may be pre-seeded');
      assert.equal(evals, 0, 'no evaluations may be pre-seeded');
      return { actual: { rounds, evals }, readback: { basis: 'prerequisites only' } };
    }, 'zero progressed rounds at start');
    await ledger.run('config:active-criteria-and-grade', () => ({ actual: { criteriaVersion: config.criteriaVersion, gradeVersion: config.gradeVersion }, readback: { criteriaConfigVersionId: config.criteriaConfigVersionId, gradeConfigVersionId: config.gradeConfigVersionId } }), 'active config snapshots');

    // ---- launch browser + primary tab ----
    assertResourceBudget(); // re-check the budget immediately before Chromium
    ctx.browser = await launchChromium({ runtimeRoot, binary: options.chrome });
    progress('chromium launched; starting primary UI journey');
    const pageA = await ctx.browser.newPage('primary', { origin: ctx.origin });
    ctx.pageA = pageA;
    // The lifecycle journeys are desktop journeys (the Manager mutation cluster in
    // PeriodsTab is desktop-only); the mobile viewport is exercised explicitly by
    // the diag lane, so pin the primary tab to the desktop viewport up front.
    await pageA.setViewport(1440, 900);
    pageA.appLogTail = () => ctx.next.appLogTail();
    await pageA.installFetchLogger();
    const shotsDir = path.join(runtimeRoot, 'screenshots');
    ctx.shotsDir = shotsDir;

    // Owned-resource identity: prove the FULL live graph (not a count) before
    // driving the UI: both containers, the network, and every owned process
    // (Next/proxy/Chrome) by PID + Linux starttime, plus the owned loopback ports.
    await ledger.run('infra:owned-resource-identity', () => {
      const readback = captureResourceReadback({
        containerNames: [ctx.stack.containerNames.db, ctx.stack.containerNames.rest],
        networkName: ctx.stack.networkName,
        pids: [ctx.next.pid, ctx.stack.proxyPid, ctx.browser.pid],
        ports: [ctx.next.port, Number(ctx.stack.dbPort), ctx.stack.restPort, ctx.stack.backendRestPort],
      });
      assert.equal(readback.containers.length, 2, 'both owned containers must be read back');
      assert.equal(readback.containers.every((c) => c.present && /running|created|restarting/.test(c.state)), true, `owned containers must be alive: ${JSON.stringify(readback.containers)}`);
      assert.equal(readback.networkPresent, true, 'owned docker network must be present');
      assert.equal(readback.processAlive.length, 3, 'Next/proxy/Chrome PIDs must all be read back');
      assert.equal(readback.processAlive.every((p) => p.alive === true), true, `owned processes must be alive: ${JSON.stringify(readback.processAlive)}`);
      assert.equal(readback.processAlive.every((p) => typeof p.startTicks === 'string' && /^\d+$/.test(p.startTicks)), true, 'every owned PID must carry a numeric starttime');
      const listening = readback.portState.filter((p) => p.listenerPresent).length;
      assert.equal(listening, readback.portState.length, `all owned loopback ports must have listeners: ${JSON.stringify(readback.portState)}`);
      return { actual: { containers: readback.containers.length, pids: readback.processAlive.length, ports: readback.portState.length }, readback };
    }, 'owned resource identity');

    // -------------------------------------------------------------------
    // Period creation via the real UI.
    // -------------------------------------------------------------------
    const codesMap = org.userCodes;
    progress('primary journey: login manager');
    await loginAs(pageA, ctx.origin, codesMap.manager);
    let periodCount = listPeriods(ctx.stack.dbTarget).length;
    await ledger.run('period:create-via-ui', async () => {
      await createPeriodViaUi(pageA, ctx.origin, 2099);
      periodCount = listPeriods(ctx.stack.dbTarget).length;
      assert.equal(periodCount, 1, 'exactly one period must exist after create');
      return { actual: { periods: periodCount }, readback: { years: listPeriods(ctx.stack.dbTarget).map((p) => p.year) } };
    }, 'period created via UI');
    const periodP1 = latestPeriodId(ctx.stack.dbTarget);

    await ledger.run('period:evaluations-seeded-for-five-subjects', async () => {
      const count = evaluationCountForPeriod(ctx.stack.dbTarget, periodP1);
      assert.equal(count, 5, `expected five subjects, received ${count}`);
      for (const alias of Object.keys(ACTOR_ROLES)) {
        const evaluationId = await subjectEvaluationId(ctx.stack.dbTarget, periodP1, subjectId(ids, alias));
        const round1 = readRound(ctx.stack.dbTarget, evaluationId, 1);
        assert.equal(round1.status, 'NotStarted', `${alias} round 1 must start NotStarted`);
      }
      return { actual: { evaluations: count }, readback: { periodId: periodP1 } };
    }, 'five NotStarted subjects with round 1');

    const evalId = {};
    for (const alias of Object.keys(ACTOR_ROLES)) {
      evalId[alias] = await subjectEvaluationId(ctx.stack.dbTarget, periodP1, subjectId(ids, alias));
    }
    ctx.evalId = evalId;
    ctx.periodP1 = periodP1;

    const evaluated = []; // digests for immutability

    // -------------------------------------------------------------------
    // Manager subject: save draft, submit round 1 (final).
    // -------------------------------------------------------------------
    await ledger.run('flow:manager-round1-self-final-approve', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await openEvaluation(pageA, ctx.origin, ids.manager);
      await selectTopLevel(pageA);
      const saveText = await saveDraftViaUi(pageA);
      assert.match(saveText, /Đã lưu bản nháp/, 'draft save toast missing');
      const afterDraft = readEvaluation(ctx.stack.dbTarget, evalId.manager);
      assert.equal(afterDraft.status, 'Draft', 'draft save must set aggregate Draft');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.manager, 1).status, 'Draft', 'draft save must set round 1 Draft');
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.manager);
      const round1 = readRound(ctx.stack.dbTarget, evalId.manager, 1);
      assert.equal(evaluation.status, 'Approved', 'Manager self round 1 must finish Approved');
      assert.equal(evaluation.current_round, 1, 'Manager current_round stays 1');
      assert.equal(round1.status, 'Submitted', 'Manager round 1 committed as Submitted');
      assert.equal(round1.evaluator_id, ids.manager, 'Manager round 1 evaluator is the Manager');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { evaluator: round1.evaluator_id, grade: round1.grade, total: round1.total_score } };
    }, 'Manager final approve');
    evaluated.push({ alias: 'manager', digest: evaluationDigest(ctx.stack.dbTarget, evalId.manager) });

    // -------------------------------------------------------------------
    // Leader subject: self round 1 -> Manager round 2 final.
    // -------------------------------------------------------------------
    await ledger.run('flow:leader-round1-self', async () => {
      await loginAs(pageA, ctx.origin, codesMap.leader);
      await openEvaluation(pageA, ctx.origin, ids.leader);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.leader);
      const round2 = readRound(ctx.stack.dbTarget, evalId.leader, 2);
      assert.equal(evaluation.status, 'Submitted', 'Leader round 1 submit sets Submitted');
      assert.equal(evaluation.current_round, 2, 'Leader advances to round 2');
      assert.equal(round2.status, 'NotStarted', 'Leader round 2 created NotStarted');
      assert.equal(round2.evaluator_id, ids.manager, 'Leader round 2 evaluator is the Manager');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.leader, 1).evaluator_id, ids.leader, 'Leader round 1 evaluator is the Leader (SELF)');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { round2Evaluator: round2.evaluator_id } };
    }, 'Leader self round 1');
    await ledger.run('flow:leader-round2-manager-approve', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await openEvaluation(pageA, ctx.origin, ids.leader);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.leader);
      assert.equal(evaluation.status, 'Approved', 'Manager round 2 submit final-approves Leader');
      assert.equal(evaluation.current_round, 2, 'Leader final current_round stays 2');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.leader, 2).status, 'Submitted', 'Leader round 2 committed');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { evaluator: readRound(ctx.stack.dbTarget, evalId.leader, 2).evaluator_id } };
    }, 'Leader final approve');
    evaluated.push({ alias: 'leader', digest: evaluationDigest(ctx.stack.dbTarget, evalId.leader) });

    // -------------------------------------------------------------------
    // SubLeader subject: self round 1 -> Leader round 2 -> Manager round 3.
    // -------------------------------------------------------------------
    await ledger.run('flow:subleader-round1-self', async () => {
      await loginAs(pageA, ctx.origin, codesMap.subleader);
      await openEvaluation(pageA, ctx.origin, ids.subleader);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.subleader);
      assert.equal(evaluation.status, 'Submitted', 'SubLeader round 1 submit sets Submitted');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.subleader, 2).evaluator_id, ids.leader, 'SubLeader round 2 evaluator is the Leader');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { round2Evaluator: ids.leader } };
    }, 'SubLeader self round 1');
    await ledger.run('flow:subleader-round2-leader', async () => {
      await loginAs(pageA, ctx.origin, codesMap.leader);
      await openEvaluation(pageA, ctx.origin, ids.subleader);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.subleader);
      assert.equal(evaluation.status, 'Reviewed', 'SubLeader round 2 submit sets Reviewed');
      assert.equal(evaluation.current_round, 3, 'SubLeader advances to round 3');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.subleader, 3).evaluator_id, ids.manager, 'SubLeader round 3 evaluator is the Manager');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { round3Evaluator: ids.manager } };
    }, 'SubLeader round 2 by Leader');
    await ledger.run('flow:subleader-round3-manager-approve', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await openEvaluation(pageA, ctx.origin, ids.subleader);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.subleader);
      assert.equal(evaluation.status, 'Approved', 'Manager round 3 final-approves SubLeader');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.subleader, 3).status, 'Submitted', 'SubLeader round 3 committed');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { evaluator: readRound(ctx.stack.dbTarget, evalId.subleader, 3).evaluator_id } };
    }, 'SubLeader final approve');
    evaluated.push({ alias: 'subleader', digest: evaluationDigest(ctx.stack.dbTarget, evalId.subleader) });

    // -------------------------------------------------------------------
    // Employee subject: SubLeader r1 -> Leader r2 -> Manager return r3 ->
    // Leader resubmit r2 -> Manager approve r3.
    // -------------------------------------------------------------------
    await ledger.run('flow:employee-round1-subleader', async () => {
      await loginAs(pageA, ctx.origin, codesMap.subleader);
      await openEvaluation(pageA, ctx.origin, ids.employee);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.employee);
      assert.equal(evaluation.status, 'Submitted', 'Employee round 1 submit sets Submitted');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.employee, 1).evaluator_id, ids.subleader, 'Employee round 1 evaluator is the SubLeader');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.employee, 2).evaluator_id, ids.leader, 'Employee round 2 evaluator is the Leader');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { r1Evaluator: ids.subleader } };
    }, 'Employee round 1 by SubLeader');
    await ledger.run('flow:employee-round2-leader', async () => {
      await loginAs(pageA, ctx.origin, codesMap.leader);
      await openEvaluation(pageA, ctx.origin, ids.employee);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.employee);
      assert.equal(evaluation.status, 'Reviewed', 'Employee round 2 submit sets Reviewed');
      assert.equal(evaluation.current_round, 3, 'Employee advances to round 3');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { round3Evaluator: ids.manager } };
    }, 'Employee round 2 by Leader');
    await ledger.run('flow:employee-round3-manager-return', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await openEvaluation(pageA, ctx.origin, ids.employee);
      await returnRoundViaUi(pageA, 'P107M1T07 return for resubmit');
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.employee);
      // A round-3 return restores current_round to 2, whose workflow-stage aggregate
      // is 'Submitted' (return RPC sets f(p_round - 1); f(2) = 'Submitted'). The
      // reopened round 2 is Draft and round 3 is reset NotStarted (asserted below).
      assert.equal(evaluation.status, 'Submitted', 'returning round 3 restores the round-2 stage aggregate');
      assert.equal(evaluation.current_round, 2, 'return restores current_round to 2');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.employee, 3).status, 'NotStarted', 'returned round 3 resets to NotStarted');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.employee, 2).status, 'Draft', 'round 2 reopens to Draft');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { round3: 'NotStarted', round2: 'Draft' } };
    }, 'Employee round 3 returned');
    await ledger.run('flow:employee-resubmit-round2', async () => {
      await loginAs(pageA, ctx.origin, codesMap.leader);
      await openEvaluation(pageA, ctx.origin, ids.employee);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.employee);
      assert.equal(evaluation.status, 'Reviewed', 'resubmit restores Reviewed');
      assert.equal(evaluation.current_round, 3, 'resubmit returns to round 3');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.employee, 3).status, 'NotStarted', 'round 3 is mutable again');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { rounds: readRounds(ctx.stack.dbTarget, evalId.employee).length } };
    }, 'Employee round 2 resubmit');
    await ledger.run('flow:employee-round3-manager-final-approve', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await openEvaluation(pageA, ctx.origin, ids.employee);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.employee);
      assert.equal(evaluation.status, 'Approved', 'Manager round 3 final-approves Employee');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { rounds: readRounds(ctx.stack.dbTarget, evalId.employee) } };
    }, 'Employee final approve');
    evaluated.push({ alias: 'employee', digest: evaluationDigest(ctx.stack.dbTarget, evalId.employee) });

    // -------------------------------------------------------------------
    // Worker subject: SubLeader r1 -> Leader r2 -> Manager r3.
    // -------------------------------------------------------------------
    await ledger.run('flow:worker-round1-subleader', async () => {
      await loginAs(pageA, ctx.origin, codesMap.subleader);
      await openEvaluation(pageA, ctx.origin, ids.worker);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.worker);
      assert.equal(evaluation.status, 'Submitted', 'Worker round 1 submit sets Submitted');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.worker, 1).evaluator_id, ids.subleader, 'Worker round 1 evaluator is the SubLeader');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { r1Evaluator: ids.subleader } };
    }, 'Worker round 1 by SubLeader');
    await ledger.run('flow:worker-round2-leader', async () => {
      await loginAs(pageA, ctx.origin, codesMap.leader);
      await openEvaluation(pageA, ctx.origin, ids.worker);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.worker);
      assert.equal(evaluation.status, 'Reviewed', 'Worker round 2 submit sets Reviewed');
      assert.equal(evaluation.current_round, 3, 'Worker advances to round 3');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { round3Evaluator: ids.manager } };
    }, 'Worker round 2 by Leader');
    await ledger.run('flow:worker-round3-manager-approve', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await openEvaluation(pageA, ctx.origin, ids.worker);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const evaluation = readEvaluation(ctx.stack.dbTarget, evalId.worker);
      assert.equal(evaluation.status, 'Approved', 'Manager round 3 final-approves Worker');
      return { actual: { status: evaluation.status, currentRound: evaluation.current_round }, readback: { rounds: readRounds(ctx.stack.dbTarget, evalId.worker) } };
    }, 'Worker final approve');
    evaluated.push({ alias: 'worker', digest: evaluationDigest(ctx.stack.dbTarget, evalId.worker) });

    await ledger.run('flow:employee-login-own-view', async () => {
      const landed = await loginAs(pageA, ctx.origin, codesMap.employee, { expectUserId: ids.employee });
      assert.equal(landed.path, `/evaluations/${ids.employee}`, 'Employee login must land on own evaluation');
      await openEvaluation(pageA, ctx.origin, ids.employee, { expectEdit: false });
      const text = await pageA.evaluate("document.body ? document.body.innerText : ''");
      assert.match(text, /Đánh giá|Phiếu đánh giá|Kết quả/i, 'Employee own view must render evaluation content');
      return { actual: { path: landed.path }, readback: { employeeId: ids.employee } };
    }, 'Employee own view');
    await ledger.run('flow:worker-login-own-view', async () => {
      const landed = await loginAs(pageA, ctx.origin, codesMap.worker, { expectUserId: ids.worker });
      assert.equal(landed.path, `/evaluations/${ids.worker}`, 'Worker login must land on own evaluation');
      await openEvaluation(pageA, ctx.origin, ids.worker, { expectEdit: false });
      const text = await pageA.evaluate("document.body ? document.body.innerText : ''");
      assert.match(text, /Đánh giá|Phiếu đánh giá|Kết quả/i, 'Worker own view must render evaluation content');
      return { actual: { path: landed.path }, readback: { workerId: ids.worker } };
    }, 'Worker own view');

    // -------------------------------------------------------------------
    // DTO / T06 Approved-only projection in browser readback.
    // -------------------------------------------------------------------
    await loginAs(pageA, ctx.origin, codesMap.manager);
    await ledger.run('dto:approved-only-projection', async () => {
      const result = await browserAction(pageA, { manifest, name: 'getEvaluationResultProjectionAction', args: [periodP1] });
      const projection = result.value;
      assert.ok(projection && projection.coverage, 'projection missing coverage');
      // T06 DTO shape: Approved rows live on `result.approved` (ResultEntry[]);
      // there is no top-level `results` array.
      assert.ok(projection.result && Array.isArray(projection.result.approved), 'projection result.approved array missing');
      const approved = projection.result.approved;
      const expectedEvalIds = Object.values(evalId).slice().sort();
      assert.equal(projection.coverage.total, 5, 'P1 roster total must be five');
      assert.equal(projection.coverage.approved, 5, 'all five P1 subjects must be Approved');
      assert.equal(projection.coverage.valid, 5, 'all five Approved rows must be valid');
      assert.equal(projection.coverage.invalid, 0, 'no Approved row may be invalid in P1');
      assert.equal(projection.coverage.pending, 0, 'a fully Approved period has no pending rows');
      assert.equal(approved.length, 5, 'result.approved must carry exactly five rows');
      // Exact ids + golden score/grade/basis are asserted from the RAW server-action
      // response text, so a partial flight decode can never silently weaken the check.
      for (const id of expectedEvalIds) {
        assert.ok(result.text.includes(id), `raw projection response must carry Approved evaluation id ${id}`);
      }
      assert.match(result.text, /"score"\s*:\s*170/, 'raw projection must carry the golden score');
      assert.match(result.text, /"grade"\s*:\s*"S"/, 'raw projection must carry the golden grade');
      // The projection basis is asserted against DB ground truth, not a
      // hard-coded literal: the approved round must pin a fully materialized
      // snapshot (=> authoritative), and the observed basis must equal that.
      const goldenPinned = readRound(ctx.stack.dbTarget, evalId.manager, 1).criteria_config_version_id;
      const goldenSnapshot = criteriaSnapshotReadback(ctx.stack.dbTarget, goldenPinned);
      const goldenProbes = {
        configVersions: await restProbe(ctx.stack, `criteria_config_versions?select=id&id=eq.${goldenPinned}`),
        groups: await restProbe(ctx.stack, `criteria_group_versions?select=group_id&version_id=eq.${goldenPinned}`),
        audiences: await restProbe(ctx.stack, `criterion_audience_versions?select=criterion_id&version_id=eq.${goldenPinned}`),
      };
      const expectedBasis = expectedProjectionBasis(goldenPinned, goldenSnapshot);
      const observedBasis = (result.text.match(/"basis"\s*:\s*"([a-z_]+)"/) || [])[1] ?? null;
      const goldenDiag = `pinned=${goldenPinned}, snapshot=${JSON.stringify(goldenSnapshot)}, probes=${JSON.stringify(goldenProbes)}`;
      assert.equal(observedBasis, expectedBasis, `projection basis must equal DB ground truth (observed=${observedBasis}, expected=${expectedBasis}, ${goldenDiag})`);
      assert.equal(expectedBasis, 'authoritative', `the harness must submit an Approved evaluation pinned to a fully materialized snapshot (${goldenDiag})`);
      assert.equal(projection.result.invalid.length, 0, 'no invalid Approved row may appear in P1');
      return { actual: { total: projection.coverage.total, approved: projection.coverage.approved, results: approved.length }, readback: { ids: expectedEvalIds, score: 170, grade: 'S', basis: observedBasis, pinnedVersion: goldenPinned, snapshot: goldenSnapshot, probes: goldenProbes, decodedRowShape: approved.length ? JSON.stringify(approved[0]).slice(0, 160) : 'none' } };
    }, 'Approved-only projection');
    await ledger.run('dto:minimization-no-internal-fields', async () => {
      const result = await browserAction(pageA, { manifest, name: 'getEvaluationResultProjectionAction', args: [periodP1] });
      const serialized = JSON.stringify(result.value);
      for (const forbidden of ['password', 'token', 'scores', 'notes', 'evaluator_id']) {
        assert.equal(serialized.includes(forbidden), false, `projection leaked internal field ${forbidden}`);
      }
      return { actual: { bytes: serialized.length }, readback: { fields: Object.keys(result.value || {}) } };
    }, 'DTO minimized');

    // -------------------------------------------------------------------
    // Immutable closed history (digests must not change under later errors).
    // -------------------------------------------------------------------
    await ledger.run('flow:immutable-closed-history', async () => {
      for (const entry of evaluated) {
        assert.equal(evaluationDigest(ctx.stack.dbTarget, evalId[entry.alias]), entry.digest, `${entry.alias} history must be immutable`);
      }
      const approvedRounds = listPeriods(ctx.stack.dbTarget);
      void approvedRounds;
      return { actual: { subjects: evaluated.length }, readback: { digests: evaluated } };
    }, 'approved history immutable');

    // -------------------------------------------------------------------
    // Deny: closed-period write refused, business vs transport separated.
    // -------------------------------------------------------------------
    await ledger.run('period:close-clean-approved', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      const beforeClose = evaluationDigest(ctx.stack.dbTarget, evalId.employee);
      const closeText = await closePeriodViaUi(pageA, ctx.origin);
      const periods = listPeriods(ctx.stack.dbTarget);
      assert.equal(periods.find((p) => p.id === periodP1)?.status, 'closed', 'P1 must be closed');
      assert.doesNotMatch(closeText, /Frozen/, 'a fully-approved close is not frozen');
      assert.equal(evaluationDigest(ctx.stack.dbTarget, evalId.employee), beforeClose, 'closing must not rewrite approved history');
      return { actual: { status: 'closed' }, readback: { frozenLabel: false } };
    }, 'clean close of fully-approved period');
    await ledger.run('deny:closed-period-write-denied', async () => {
      const before = policyCounts(ctx.stack.dbTarget);
      const result = await browserAction(pageA, {
        manifest,
        name: 'saveEvaluationRound',
        args: [evalId.employee, 1, { [config.criterionIds.staff]: config.topLevelPoints }, { [config.criterionIds.staff]: 'x' }, { [config.criterionIds.staff]: 0 }, 'closed-period probe', false, { criteriaConfigVersionId: config.criteriaConfigVersionId, gradeConfigVersionId: config.gradeConfigVersionId, renderedRules: [{ id: config.criterionIds.staff, allowedPoints: [config.topLevelPoints, config.lowLevelPoints], levels: [] }] }],
      });
      const value = result.value;
      assert.ok(value && value.success === false, 'write into a closed period must be refused generically');
      assert.match(String(value.error || ''), /đóng|hoạt động|từ chối/i, `expected closed-period error, received: ${value.error}`);
      assert.equal(policyCounts(ctx.stack.dbTarget), before, 'closed-period denial must not change the graph');
      return { actual: { ok: result.status, success: value.success }, readback: { graphUnchanged: true } };
    }, 'closed-period write denied');
    await ledger.run('deny:zero-graph-delta-on-deny', async () => {
      const before = policyCounts(ctx.stack.dbTarget);
      const result = await browserAction(pageA, {
        manifest,
        name: 'saveEvaluationRound',
        args: [evalId.manager, 1, {}, {}, {}, '', false, { criteriaConfigVersionId: config.criteriaConfigVersionId, gradeConfigVersionId: config.gradeConfigVersionId, renderedRules: [] }],
      });
      assert.ok(result.value && result.value.success === false, 'illegal write must be denied');
      assert.equal(policyCounts(ctx.stack.dbTarget), before, 'denied write changed the graph');
      return { actual: { denied: true }, readback: { policyCounts: before } };
    }, 'zero graph delta on deny');
    await ledger.run('deny:http-business-vs-transport-separated', async () => {
      // Business denial: HTTP 200 with success:false.
      const business = await browserAction(pageA, {
        manifest,
        name: 'saveEvaluationRound',
        args: [evalId.manager, 1, {}, {}, {}, '', false, { criteriaConfigVersionId: config.criteriaConfigVersionId, gradeConfigVersionId: config.gradeConfigVersionId, renderedRules: [] }],
      });
      assert.equal(business.status, 200, 'business denial must be an HTTP-success response');
      assert.equal(business.value.success, false, 'business denial carries success:false');
      // Transport failure: a bogus action endpoint must be a non-OK HTTP response.
      const transport = await pageA.evaluate(`(async () => {
        const response = await fetch(location.origin + '/__p107t07_missing_action__', {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', 'Next-Action': '0000000000000000000000000000000000000000', Origin: location.origin },
          body: '[]',
          credentials: 'include',
        });
        return { ok: response.ok, status: response.status };
      })()`);
      assert.equal(transport.ok, false, 'bogus action must be a transport/HTTP failure');
      return { actual: { businessStatus: business.status, transportStatus: transport.status, transportOk: transport.ok }, readback: { separated: true } };
    }, 'business vs transport separated');

    // -------------------------------------------------------------------
    // Deny: revoked session cannot restore the resident payload.
    // -------------------------------------------------------------------
    await ledger.run('deny:revoked-session-cannot-restore', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await pageA.goto(`${ctx.origin}/dashboard`, "document.body.innerText.toLowerCase().includes('tổng quan hệ thống')");
      const resident = await pageA.evaluate("document.body.innerText");
      assert.match(resident, /Tổng quan hệ thống/, 'resident dashboard payload required');
      assert.equal((await pageA.cookies()).some((c) => c.name === 'auth_session'), true, 'manager cookie expected');

      // Real logout revokes the DB session and clears the cookie.
      await pageA.clickText('Đăng xuất');
      await pageA.waitFor("location.pathname === '/login'", { timeout: 30_000, label: 'logout' });
      const cookies = await pageA.cookies();
      assert.equal(cookies.some((c) => c.name === 'auth_session'), false, 'logout must clear the session cookie');
      const loginText = await pageA.evaluate("document.body ? document.body.innerText : ''");
      assert.doesNotMatch(loginText, /Tổng quan hệ thống/, 'revoked session must not expose the resident payload');

      // A stale navigation back to a protected route must redirect, not restore.
      const after = await pageA.goto(`${ctx.origin}/dashboard`, null).catch(() => null);
      const finalText = after ? after.text : await pageA.evaluate("document.body ? document.body.innerText : ''");
      assert.doesNotMatch(finalText, /Tổng quan hệ thống/, 'revoked session must not restore the resident payload');
      return { actual: { cookieCleared: true }, readback: { residentRemoved: true } };
    }, 'revoked session restore denied');

    // -------------------------------------------------------------------
    // New period + frozen-unfinished close.
    // -------------------------------------------------------------------
    let periodP2 = null;
    await ledger.run('period:new-period-created', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await createPeriodViaUi(pageA, ctx.origin, 2098);
      const periods = listPeriods(ctx.stack.dbTarget);
      assert.equal(periods.length, 2, 'a second period must exist');
      periodP2 = periods.find((p) => p.year === 2098)?.id || null;
      assert.ok(periodP2, 'new period id missing');
      const unfinished = evaluationCountForPeriod(ctx.stack.dbTarget, periodP2);
      assert.ok(unfinished > 0, 'a fresh period has unfinished evaluations');
      return { actual: { periods: periods.length }, readback: { periodP2, unfinished } };
    }, 'new period created');
    await ledger.run('period:close-frozen-unfinished', async () => {
      // Open the periods tab ONCE, then set a resident sentinel: surviving it until
      // the frozen label renders proves the label appears WITHOUT a navigation or
      // reload after the close (the epoch/refresh path, not a fresh page load).
      await openPeriodsTab(pageA, ctx.origin);
      await pageA.evaluate('window.__p107FrozenResident = true; true');
      const closeText = await closePeriodViaUi(pageA, ctx.origin, { skipOpen: true });
      const periods = listPeriods(ctx.stack.dbTarget);
      assert.equal(periods.find((p) => p.id === periodP2)?.status, 'closed', 'P2 must be closed');
      assert.match(closeText, /đóng băng|frozen/i, 'closing with unfinished rounds must surface the frozen state');
      const resident = await pageA.evaluate('window.__p107FrozenResident === true');
      assert.equal(resident, true, 'frozen label must appear resident: no navigation/reload after the close');
      const frozen = await pageA.evaluate("document.querySelector('[data-period-frozen=\\\"true\\\"]') !== null");
      assert.equal(frozen, true, 'frozen label data-period-frozen must render');
      return { actual: { status: 'closed', frozenLabel: true, resident: true }, readback: { frozenCount: evaluationCountForPeriod(ctx.stack.dbTarget, periodP2) } };
    }, 'frozen unfinished close');

    // -------------------------------------------------------------------
    // Two-tab shared-context convergence (no manual reload).
    // -------------------------------------------------------------------
    const pageB = await ctx.browser.newPage('secondary', { origin: ctx.origin });
    ctx.pageB = pageB;
    let periodP3 = null;
    await ledger.run('tab:shared-context-create-select-convergence', async () => {
      await pageB.goto(`${ctx.origin}/settings`, "document.body.innerText.toLowerCase().includes('thao tác kỳ đánh giá')");
      // Resident sentinel: surviving it proves the second tab never navigated/reloaded.
      await pageB.evaluate('window.__p107Resident = true; true');
      const beforeText = await pageB.evaluate("document.body ? document.body.innerText : ''");
      assert.doesNotMatch(beforeText, /Kỳ 2097/, 'second tab must not know P3 yet');
      await createPeriodViaUi(pageA, ctx.origin, 2097);
      periodP3 = listPeriods(ctx.stack.dbTarget).find((p) => p.year === 2097)?.id || null;
      assert.ok(periodP3, 'P3 id missing');
      // No reload on pageB: the storage event must drive convergence.
      const converged = await waitFor(async () => {
        const text = await pageB.evaluate("document.body ? document.body.innerText : ''");
        return text.includes('Kỳ 2097') ? text : false;
      }, { timeout: 30_000, interval: 500, label: 'second-tab create convergence' });
      assert.match(converged, /Kỳ 2097/, 'second tab must converge to the created period');
      const resident = await pageB.evaluate('window.__p107Resident === true');
      assert.equal(resident, true, 'second tab must converge WITHOUT navigation/reload');
      return { actual: { converged: true, resident: true }, readback: { periodP3 } };
    }, 'two-tab create/select convergence');
    await ledger.run('tab:cookie-provider-rsc-consistency', async () => {
      // Resident convergence on the SAME document (no goto/F5). Cookie, the
      // provider-selected marker and the refreshed server scope must all agree on
      // the EXACT new period id — not merely a non-null value.
      const resident = await pageB.evaluate('window.__p107Resident === true');
      assert.equal(resident, true, 'consistency must be observed on the resident document (no navigation/F5)');
      const selectedId = await pageB.evaluate(`(document.cookie.match(/selected_period_id=([^;]+)/) || [])[1] || null`);
      assert.equal(selectedId, periodP3, 'selected_period_id cookie must equal the exact new period id');
      const providerSelected = await periodRowSelected(pageB, 2097);
      assert.equal(providerSelected, true, 'the provider must mark the exact new period as selected');
      // Extra parity check only (explicitly allowed, never the primary proof): a
      // fresh render of the resident route must agree with the reconciled cookie.
      const parity = await pageB.goto(`${ctx.origin}/settings`, "document.body.innerText.toLowerCase().includes('thao tác kỳ đánh giá')");
      assert.match(parity.text, /Kỳ 2097/, 'server props parity: a fresh render must show the reconciled period');
      const paritySelected = await periodRowSelected(pageB, 2097);
      assert.equal(paritySelected, true, 'server props parity: the refreshed scope must select the exact period');
      return { actual: { selectedId, providerSelected, residenceVerified: resident }, readback: { parityAgrees: true, periodP3 } };
    }, 'cookie/provider/RSC consistency');
    await ledger.run('tab:shared-context-close-convergence', async () => {
      await closePeriodViaUi(pageA, ctx.origin);
      const converged = await waitFor(async () => {
        const text = await pageB.evaluate("document.body ? document.body.innerText : ''");
        return /2097/.test(text) && /Đã đóng/.test(text) ? text : false;
      }, { timeout: 30_000, interval: 500, label: 'second-tab close convergence' });
      assert.match(converged, /Đã đóng/, 'second tab must converge to the closed period');
      const status = listPeriods(ctx.stack.dbTarget).find((p) => p.id === periodP3)?.status;
      assert.equal(status, 'closed', 'P3 must be closed in the DB');
      return { actual: { status }, readback: { converged: true } };
    }, 'two-tab close convergence');
    await ledger.run('tab:delete-empty-refused-convergence', async () => {
      const before = policyCounts(ctx.stack.dbTarget);
      const deleteText = await deletePeriodViaUi(pageA, ctx.origin);
      assert.match(deleteText, /Không thể xóa|Lỗi/i, 'deleting a non-empty closed period must be refused');
      assert.equal(policyCounts(ctx.stack.dbTarget), before, 'refused delete must not change the graph');
      const converged = await waitFor(async () => {
        const text = await pageB.evaluate("document.body ? document.body.innerText : ''");
        return text.includes('2097') ? text : false;
      }, { timeout: 20_000, interval: 500, label: 'second-tab delete denial convergence' });
      assert.match(converged, /2097/, 'second tab must remain consistent after the refused delete');
      return { actual: { refused: true }, readback: { graphUnchanged: true } };
    }, 'delete-empty refused and converged');
    await ledger.run('tab:delete-empty-success-convergence', async () => {
      // Declared business-valid EMPTY/CLOSED disposable prerequisite: the real
      // create-period action always seeds one evaluation per active roster member,
      // so an empty period cannot be produced through the UI. We seed exactly ONE
      // empty CLOSED period (asserted zero evaluations) and then drive the real
      // Manager delete action/UI against it. No business round is deleted to
      // manufacture emptiness.
      const emptyYear = 2094;
      const emptyId = seedDeclaredEmptyClosedPeriod(ctx.stack.dbTarget, { year: emptyYear });
      assert.equal(evaluationCountForPeriod(ctx.stack.dbTarget, emptyId), 0, 'prerequisite period must hold zero evaluations');
      await selectPeriodViaUi(pageA, ctx.origin, emptyYear);
      const cookieA = await pageA.evaluate(`(document.cookie.match(/selected_period_id=([^;]+)/) || [])[1] || null`);
      assert.equal(cookieA, emptyId, 'selecting the empty period must reconcile the exact cookie id');
      await pageB.evaluate('window.__p107ResidentDelete = true; true');
      const deleteText = await deletePeriodViaUi(pageA, ctx.origin);
      assert.match(deleteText, /Đã xóa|đã xóa/i, `deleting an empty closed period must succeed: ${deleteText.slice(0, 200)}`);
      assert.doesNotMatch(deleteText, /Không thể xóa/i, 'an empty closed period must not be refused');
      assert.equal(listPeriods(ctx.stack.dbTarget).some((p) => p.id === emptyId), false, 'the deleted period id must be absent from the DB');
      await waitFor(async () => (await periodRowExists(pageA, emptyYear)) === false, { timeout: 20_000, interval: 300, label: 'first-tab delete convergence' });
      assert.equal(await periodRowExists(pageA, emptyYear), false, 'first tab must drop the deleted period row');
      await waitFor(async () => (await periodRowExists(pageB, emptyYear)) === false, { timeout: 20_000, interval: 300, label: 'second-tab delete convergence' });
      assert.equal(await periodRowExists(pageB, emptyYear), false, 'second tab must drop the deleted period row');
      assert.equal(await pageB.evaluate('window.__p107ResidentDelete === true'), true, 'second tab must reconcile without a reload');
      await waitFor(async () => (await pageA.evaluate("document.body.innerText.toLowerCase().includes('đang chọn')")), { timeout: 20_000, interval: 300, label: 'first-tab fallback selection' });
      await waitFor(async () => (await pageB.evaluate("document.body.innerText.toLowerCase().includes('đang chọn')")), { timeout: 20_000, interval: 300, label: 'second-tab fallback selection' });
      assert.equal(await pageA.evaluate("document.body.innerText.toLowerCase().includes('đang chọn')"), true, 'first tab must fall back to a remaining selected period');
      assert.equal(await pageB.evaluate("document.body.innerText.toLowerCase().includes('đang chọn')"), true, 'second tab must fall back to a remaining selected period');
      return { actual: { deletedId: emptyId, absent: true, fallback: true }, readback: { pageBResidenceVerified: true } };
    }, 'delete-empty success + two-tab convergence');

    // -------------------------------------------------------------------
    // Races + fault probes on a fresh active period (P4).
    // -------------------------------------------------------------------
    await loginAs(pageA, ctx.origin, codesMap.manager);
    await createPeriodViaUi(pageA, ctx.origin, 2096);
    const periodP4 = listPeriods(ctx.stack.dbTarget).find((p) => p.year === 2096)?.id || null;
    assert.ok(periodP4, 'race period P4 missing');
    const p4Eval = {};
    for (const alias of Object.keys(ACTOR_ROLES)) {
      p4Eval[alias] = await subjectEvaluationId(ctx.stack.dbTarget, periodP4, subjectId(ids, alias));
    }
    const criterionForRole = (alias) => config.criterionIds[alias === 'worker' ? 'worker' : ['leader', 'manager'].includes(alias) ? 'leader' : 'staff'];
    const renderedRules = (alias = 'staff') => [{
      id: criterionForRole(alias),
      allowedPoints: [config.topLevelPoints, config.lowLevelPoints],
      levels: [
        { points: config.topLevelPoints, label: config.topLevelLabel, description: 'top' },
        { points: config.lowLevelPoints, label: config.lowLevelLabel, description: 'low' },
      ],
    }];
    const configArgs = (alias = 'staff') => ({
      criteriaConfigVersionId: config.criteriaConfigVersionId,
      gradeConfigVersionId: config.gradeConfigVersionId,
      renderedRules: renderedRules(alias),
    });

    await ledger.run('fault:duplicate-response-loss-retry', async () => {
      await loginAs(pageA, ctx.origin, codesMap.subleader);
      const submitArgs = [p4Eval.worker, 1, { [config.criterionIds.worker]: config.topLevelPoints }, { [config.criterionIds.worker]: 'p107t07-dup' }, { [config.criterionIds.worker]: 0 }, 'p107t07-dup', true, configArgs('worker')];
      const saveActionId = actionIdFor(manifest, 'saveEvaluationRound');
      const graphIds = [p4Eval.worker];
      const zeroContext = () => assert.equal(transitionContextCount(ctx.stack.dbTarget), 0, 'no transition-context row may leak on the success/retry path');

      // 1. First logical submit: reaches the REAL backend and genuinely commits,
      //    but its response is explicitly discarded at the client transport seam.
      //    The enforced status machine is NotStarted -> Draft -> Submitted (the
      //    P102M3T04 guard rejects a direct NotStarted->Submitted skip); the real
      //    UI auto-saves a draft on first open, so mirror that here.
      const draftRes = await browserAction(pageA, { manifest, name: 'saveEvaluationRound', args: [p4Eval.worker, 1, { [config.criterionIds.worker]: config.topLevelPoints }, { [config.criterionIds.worker]: 'p107t07-dup-draft' }, { [config.criterionIds.worker]: 0 }, 'p107t07-dup', false, configArgs('worker')] });
      assert.equal(draftRes.value?.success, true, `draft pre-save must succeed: ${JSON.stringify(draftRes.value)?.slice(0, 200)}`);
      assert.equal(readRound(ctx.stack.dbTarget, p4Eval.worker, 1).status, 'Draft', 'pre-save must move round 1 to Draft');
      await pageA.armActionResponseDrop(saveActionId);
      let droppedError = null;
      try {
        await browserAction(pageA, { manifest, name: 'saveEvaluationRound', args: submitArgs });
        assert.fail('the first response must be discarded at the transport seam');
      } catch (error) {
        droppedError = error;
      }
      assert.equal(droppedError?.errorKind, 'TRANSPORT_ERROR', `injected response loss must surface as a client transport failure: ${safeError(droppedError)}`);
      assert.equal(await pageA.dropCount(), 1, 'exactly one action response must have been dropped');
      const captured = await pageA.readDroppedActionResponse();
      assert.ok(captured && captured.status === 200, `the discarded response must be the real 200 server-action result: ${JSON.stringify(captured)?.slice(0, 200)}`);
      const firstBusiness = decodeFlight(captured.text);
      if (!(firstBusiness && firstBusiness.success === true)) {
        console.log('DUP_FIRST_ACTION_FAIL ' + JSON.stringify({
          firstBusiness,
          raw: String(captured.text).slice(0, 600),
          nextlog: typeof ctx.next.appLogTail === 'function' ? ctx.next.appLogTail().slice(-3000) : 'n/a',
        }));
      }
      assert.ok(firstBusiness && firstBusiness.success === true, `the first action's REAL business result must be success:true — received: ${JSON.stringify(firstBusiness) ?? String(captured.text).slice(0, 160)}`);

      // 2. Prove the first commit landed, then pin the complete graph.
      const committed = raceGraphDigest(ctx.stack.dbTarget, graphIds);
      const afterFirst = readEvaluation(ctx.stack.dbTarget, p4Eval.worker);
      assert.equal(afterFirst.status, 'Submitted', 'the first submit must have committed Submitted');
      assert.equal(afterFirst.current_round, 2, 'the first submit must advance to round 2');
      assert.equal(readRounds(ctx.stack.dbTarget, p4Eval.worker).length, 2, 'the first submit must create exactly the next round');
      zeroContext();

      // 3. Retry the EXACT same logical payload. The server must fail closed (or
      //    idempotently no-op); the complete graph must be unchanged.
      let retry;
      try {
        retry = await browserAction(pageA, { manifest, name: 'saveEvaluationRound', args: submitArgs });
      } catch (error) {
        retry = { transportFailure: true, errorKind: error.errorKind, message: safeError(error) };
      }
      assert.equal(retry.transportFailure, undefined, `the retry must not be a transport failure: ${JSON.stringify(retry).slice(0, 200)}`);
      assert.equal(typeof retry.value?.success, 'boolean', `the retry must return a real business result: ${JSON.stringify(retry.value).slice(0, 200)}`);
      const retried = raceGraphDigest(ctx.stack.dbTarget, graphIds);
      assert.equal(retried, committed, 'an idempotent retry must not change the complete graph');
      assert.equal(readRounds(ctx.stack.dbTarget, p4Eval.worker).length, 2, 'the retry must never create a third round');
      zeroContext();
      return {
        actual: { firstBusinessSuccess: firstBusiness.success, retrySuccess: retry.value.success, retryError: retry.value.error ?? null },
        readback: { injectedLosses: await pageA.dropCount(), graphUnchanged: retried === committed, rounds: readRounds(ctx.stack.dbTarget, p4Eval.worker).length },
      };
    }, 'duplicate/response-loss retry idempotent');

    await ledger.run('race:return-submit-concurrent', async () => {
      // ---- Authenticated browser journey ----
      await loginAs(pageA, ctx.origin, codesMap.subleader);
      await openEvaluation(pageA, ctx.origin, ids.employee);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      assert.equal(readEvaluation(ctx.stack.dbTarget, p4Eval.employee).current_round, 2, 'setup submit must advance to round 2');
      await loginAs(pageA, ctx.origin, codesMap.leader);
      // A real competing PostgreSQL connection holds the very table lock the RPC
      // acquires, so both browser calls genuinely block on the server (overlap is
      // proven by pg_stat_activity/pg_locks, not by Promise.all alone).
      const browserTier = await withCompetingPgLock(
        ctx.stack.dbTarget,
        'LOCK TABLE public.evaluation_rounds IN SHARE ROW EXCLUSIVE MODE;',
        () => Promise.all([
          browserAction(pageA, { manifest, name: 'returnEvaluationRound', args: [p4Eval.employee, 2, 'race return'] }).catch((error) => ({ transportFailure: true, message: safeError(error) })),
          browserAction(pageA, { manifest, name: 'saveEvaluationRound', args: [p4Eval.employee, 2, { [config.criterionIds.staff]: config.topLevelPoints }, { [config.criterionIds.staff]: 'race submit' }, { [config.criterionIds.staff]: 0 }, 'race submit', true, configArgs('employee')] }).catch((error) => ({ transportFailure: true, message: safeError(error) })),
        ]),
        { label: 'return/submit' },
      );
      assert.ok(browserTier.waiters >= 1, `browser return/submit race must genuinely overlap a competing connection: ${JSON.stringify(browserTier.activityDuring)}`);
      const evaluation = readEvaluation(ctx.stack.dbTarget, p4Eval.employee);
      const round1 = readRound(ctx.stack.dbTarget, p4Eval.employee, 1);
      const round2 = readRound(ctx.stack.dbTarget, p4Eval.employee, 2);
      const coherent =
        (evaluation.status === 'Draft' && evaluation.current_round === 1 && round1.status === 'Draft')
        || (evaluation.status === 'Reviewed' && evaluation.current_round === 3 && round2.status === 'Submitted');
      assert.equal(coherent, true, `return/submit race landed in an incoherent state: ${evaluation.status}/${evaluation.current_round} r1=${round1.status} r2=${round2.status}`);
      assert.equal(transitionContextCount(ctx.stack.dbTarget), 0, 'return/submit browser race must leave zero transition-context rows');
      return {
        actual: { browserStatus: evaluation.status, overlapWaiters: browserTier.waiters },
        readback: { browserRound1: round1.status, browserRound2: round2.status, activeWaiters: browserTier.activityDuring.length },
      };
    }, 'return/submit race coherent');

    await ledger.run('race:return-submit-db-concurrent', async () => {
      // ---- Direct DB concurrency proof (two competing PostgreSQL connections on
      //      the SAME actual RPC functions; deterministic lock-based interleave) ----
      const before = raceGraphDigest(ctx.stack.dbTarget, [p4Eval.employee]);
      const scratch = seedConcurrencyScratch(ctx.stack.dbTarget, { periodId: periodP4, teamId: ids.team, subleaderId: ids.subleader, code: `P107T07-SCRATCH-RS-${makeRunSeed().slice(0, 6)}` });
      draftScratchViaRpc(ctx.stack.dbTarget, { evaluationId: scratch.evalId, round: 1, actor: ids.subleader, ccv: config.criteriaConfigVersionId, gbv: config.gradeConfigVersionId });
      const dbTier = await directRpcInterleave(ctx.stack.dbTarget, {
        label: 'return/submit db',
        sqlA: saveRpcSql({ evaluationId: scratch.evalId, round: 1, actor: ids.subleader, scores: {}, notes: {}, comment: 'db return/submit', total: 170, grade: 'S', isSubmit: true, nextRound: 2, nextEvaluator: ids.leader, nextRole: 'Leader', nextStatus: 'Submitted', isFinal: false, ccv: config.criteriaConfigVersionId, gbv: config.gradeConfigVersionId, label: 'A_DONE' }),
        sqlB: returnRpcSql({ evaluationId: scratch.evalId, round: 2, actor: ids.leader, reason: 'db race', label: 'B_DONE' }),
      });
      assert.equal(dbTier.blocked, true, 'direct DB tier: the competing RPC must genuinely block on the held transaction lock');
      assert.match(dbTier.outA, /A_DONE\|[0-9a-f-]{36}\|[0-9a-f-]{36}\|Submitted/, `direct DB A (submit) result: ${dbTier.outA}`);
      assert.match(dbTier.outB, /B_DONE\|[0-9a-f-]{36}\|1\|Draft/, `direct DB B (return) result: ${dbTier.outB}`);
      const dbEval = readEvaluation(ctx.stack.dbTarget, scratch.evalId);
      assert.equal(dbEval.status, 'Draft', 'direct DB tier must end Draft after the return wins');
      assert.equal(dbEval.current_round, 1, 'direct DB tier must restore round 1');
      assert.equal(readRounds(ctx.stack.dbTarget, scratch.evalId).length, 2, 'direct DB tier must not leak a third round');
      assert.equal(transitionContextCount(ctx.stack.dbTarget), 0, 'direct DB tier must leave zero transition-context rows');
      assert.equal(raceGraphDigest(ctx.stack.dbTarget, [p4Eval.employee]), before, 'the direct DB tier must not perturb the browser comparison graph');
      retireScratchUser(ctx.stack.dbTarget, scratch.userId);
      return {
        actual: { dbStatus: dbEval.status, dbBlocked: dbTier.blocked },
        readback: { dbA: dbTier.outA, dbB: dbTier.outB, pendingLocks: dbTier.locksDuring.length },
      };
    }, 'return/submit direct-DB concurrency');

    await ledger.run('fault:version-edit-resubmit-reconcile', async () => {
      await loginAs(pageA, ctx.origin, codesMap.subleader);
      await openEvaluation(pageA, ctx.origin, ids.subleader);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const round1AfterFirst = readRound(ctx.stack.dbTarget, p4Eval.subleader, 1);
      assert.equal(round1AfterFirst.criteria_config_version_id, config.criteriaConfigVersionId, 'round 1 must pin V1');

      // A Manager config edit is explicitly denied while P4 is ACTIVE. The action
      // must leave both the active version and the evaluation/config graph intact.
      await loginAs(pageA, ctx.origin, codesMap.manager);
      const activeVersionBefore = psql(ctx.stack.dbTarget, "SELECT public.get_active_criteria_config() ->> 'version_id';");
      assert.equal(activeVersionBefore, config.criteriaConfigVersionId, 'P4 must begin on fixture V1');
      const activeSnapshotBefore = criteriaSnapshotReadback(ctx.stack.dbTarget, activeVersionBefore);
      const activeChecksumBefore = psql(ctx.stack.dbTarget, `SELECT checksum FROM public.criteria_config_versions WHERE id='${activeVersionBefore}';`);
      const activeGraphBefore = policyCounts(ctx.stack.dbTarget);
      const deniedEdit = await browserAction(pageA, {
        manifest,
        name: 'upsertCriterionAction',
        args: [{ id: config.criterionId, name: 'P107T07 Criterion v2' }, config.criteriaGroupId, config.criteriaVersion],
      });
      assert.equal(deniedEdit.value?.success, false, `P108_PERIOD_ACTIVE must deny the real Manager config action: ${JSON.stringify(deniedEdit.value)}`);
      assert.match(String(deniedEdit.value?.error || ''), /đang có kỳ đánh giá đang hoạt động/i, `expected explicit P108_PERIOD_ACTIVE denial: ${JSON.stringify(deniedEdit.value)}`);
      assert.equal(psql(ctx.stack.dbTarget, "SELECT public.get_active_criteria_config() ->> 'version_id';"), activeVersionBefore, 'active denial must preserve the active criteria version');
      assert.deepEqual(criteriaSnapshotReadback(ctx.stack.dbTarget, activeVersionBefore), activeSnapshotBefore, 'active denial must preserve the active criteria snapshot');
      assert.equal(psql(ctx.stack.dbTarget, `SELECT checksum FROM public.criteria_config_versions WHERE id='${activeVersionBefore}';`), activeChecksumBefore, 'active denial must preserve the active criteria checksum');
      assert.equal(policyCounts(ctx.stack.dbTarget), activeGraphBefore, 'active denial must leave the DB policy graph unchanged');
      const activeVersionForResubmit = activeVersionBefore;

      // The active-period Manager config edit was denied, so Leader returns
      // round 2 and SubLeader resubmits round 1 under the current active V1;
      // no config mutation is allowed in this ACTIVE-period journey.
      await loginAs(pageA, ctx.origin, codesMap.leader);
      const returned = await browserAction(pageA, { manifest, name: 'returnEvaluationRound', args: [p4Eval.subleader, 2, 'version reconcile'] });
      assert.ok(!returned.value || returned.value.success !== false, 'return before reconcile failed');
      const afterReturn = readEvaluation(ctx.stack.dbTarget, p4Eval.subleader);
      assert.equal(afterReturn.status, 'Draft', 'return must reset to Draft');

      await loginAs(pageA, ctx.origin, codesMap.subleader);
      const resubmit = await browserAction(pageA, {
        manifest,
        name: 'saveEvaluationRound',
        args: [p4Eval.subleader, 1, { [config.criterionIds.leader]: config.topLevelPoints }, { [config.criterionIds.leader]: 'v1' }, { [config.criterionIds.leader]: 0 }, 'v1 resubmit after denied active edit', true, { criteriaConfigVersionId: activeVersionForResubmit, gradeConfigVersionId: config.gradeConfigVersionId, renderedRules: renderedRules('leader') }],
      });
      assert.ok(!resubmit.value || resubmit.value.success !== false, `resubmit under the current active version must reconcile, received: ${JSON.stringify(resubmit.value)}`);
      const rounds = readRounds(ctx.stack.dbTarget, p4Eval.subleader);
      const r1 = rounds.find((r) => r.round === 1);
      const r2 = rounds.find((r) => r.round === 2);
      assert.equal(rounds.length, 2, 'reconcile must not create a third round');
      assert.equal(r1.criteria_config_version_id, activeVersionForResubmit, 'resubmitted round 1 must retain the active criteria version');
      assert.equal(r2.criteria_config_version_id, activeVersionForResubmit, 'mutable next round must reconcile to the active criteria version');
      assert.equal(r2.status, 'NotStarted', 'reconciled next round keeps NotStarted');
      return { actual: { rounds: rounds.length, reconciled: true }, readback: { activeCriteriaVersion: activeVersionForResubmit, r2Pins: r2.criteria_config_version_id } };
    }, 'active-period edit denied; resubmit retains the current active version');

    await ledger.run('race:version-edit-resubmit-concurrent', async () => {
      const activeCrit = psql(ctx.stack.dbTarget, "SELECT public.get_active_criteria_config() ->> 'version_id';")
      const activeGrade = psql(ctx.stack.dbTarget, "SELECT public.get_active_grade_config() ->> 'version_id';")
      // (The sequential reconcile case already proved a real version roll; here we
      //  only need the currently-active version ids to drive the concurrent resubmit.)
      // ---- Authenticated browser journey: self submit -> manager return -> locked resubmit ----
      await loginAs(pageA, ctx.origin, codesMap.leader);
      await openEvaluation(pageA, ctx.origin, ids.leader);
      await selectTopLevel(pageA);
      await submitViaUi(pageA);
      const afterSubmit = readEvaluation(ctx.stack.dbTarget, p4Eval.leader);
      assert.equal(afterSubmit.status, 'Submitted', 'leader self round 1 submit must commit');
      assert.equal(afterSubmit.current_round, 2, 'leader must advance to round 2');
      await loginAs(pageA, ctx.origin, codesMap.manager);
      const returned = await browserAction(pageA, { manifest, name: 'returnEvaluationRound', args: [p4Eval.leader, 2, 'version concurrent'] });
      assert.ok(!returned.value || returned.value.success !== false, `manager return failed: ${JSON.stringify(returned.value)}`);
      assert.equal(readEvaluation(ctx.stack.dbTarget, p4Eval.leader).status, 'Draft', 'return must reset to Draft');
      await loginAs(pageA, ctx.origin, codesMap.leader);
      const browserTier = await withCompetingPgLock(
        ctx.stack.dbTarget,
        'LOCK TABLE public.evaluation_rounds IN SHARE ROW EXCLUSIVE MODE;',
        () => browserAction(pageA, { manifest, name: 'saveEvaluationRound', args: [p4Eval.leader, 1, { [config.criterionIds.leader]: config.topLevelPoints }, { [config.criterionIds.leader]: 'v2 concurrent' }, { [config.criterionIds.leader]: 0 }, 'v2 concurrent', true, { criteriaConfigVersionId: activeCrit, gradeConfigVersionId: activeGrade, renderedRules: renderedRules('leader') }] }).catch((error) => ({ transportFailure: true, message: safeError(error) })),
        { label: 'version-edit/resubmit' },
      );
      assert.ok(browserTier.waiters >= 1, `version-edit/resubmit browser resubmit must genuinely overlap a competing connection: ${JSON.stringify(browserTier.activityDuring)}`);
      const resubmitValue = browserTier.results;
      assert.ok(!resubmitValue.transportFailure && (!resubmitValue.value || resubmitValue.value.success !== false), `resubmit under a competing connection must reconcile: ${JSON.stringify(resubmitValue).slice(0, 220)}`);
      const rounds = readRounds(ctx.stack.dbTarget, p4Eval.leader);
      const r1o = rounds.find((r) => r.round === 1);
      const r2o = rounds.find((r) => r.round === 2);
      assert.equal(rounds.length, 2, 'concurrent resubmit must not create a third round');
      assert.equal(r1o.criteria_config_version_id, activeCrit, 'resubmitted round 1 must pin the active V2 criteria');
      assert.equal(r2o.criteria_config_version_id, activeCrit, 'mutable next round must reconcile to V2 under concurrency');
      assert.equal(r2o.status, 'NotStarted', 'reconciled next round keeps NotStarted');
      assert.equal(transitionContextCount(ctx.stack.dbTarget), 0, 'concurrent resubmit must leave zero transition-context rows');

      // ---- Direct DB concurrency proof (two connections, same save RPC) ----
      const scratchA = seedConcurrencyScratch(ctx.stack.dbTarget, { periodId: periodP4, teamId: ids.team, subleaderId: ids.subleader, code: `P107T07-SCRATCH-VE1-${makeRunSeed().slice(0, 6)}` });
      const scratchB = seedConcurrencyScratch(ctx.stack.dbTarget, { periodId: periodP4, teamId: ids.team, subleaderId: ids.subleader, code: `P107T07-SCRATCH-VE2-${makeRunSeed().slice(0, 6)}` });
      draftScratchViaRpc(ctx.stack.dbTarget, { evaluationId: scratchA.evalId, round: 1, actor: ids.subleader, ccv: activeCrit, gbv: activeGrade });
      draftScratchViaRpc(ctx.stack.dbTarget, { evaluationId: scratchB.evalId, round: 1, actor: ids.subleader, ccv: activeCrit, gbv: activeGrade });
      const dbTier = await directRpcInterleave(ctx.stack.dbTarget, {
        label: 'version-edit/resubmit db',
        sqlA: saveRpcSql({ evaluationId: scratchA.evalId, round: 1, actor: ids.subleader, scores: {}, notes: {}, comment: 'db ve A', total: 170, grade: 'S', isSubmit: true, nextRound: 2, nextEvaluator: ids.leader, nextRole: 'Leader', nextStatus: 'Submitted', isFinal: false, ccv: activeCrit, gbv: activeGrade, label: 'A_DONE' }),
        sqlB: saveRpcSql({ evaluationId: scratchB.evalId, round: 1, actor: ids.subleader, scores: {}, notes: {}, comment: 'db ve B', total: 170, grade: 'S', isSubmit: true, nextRound: 2, nextEvaluator: ids.leader, nextRole: 'Leader', nextStatus: 'Submitted', isFinal: false, ccv: activeCrit, gbv: activeGrade, label: 'B_DONE' }),
      });
      assert.equal(dbTier.blocked, true, 'direct DB tier: the second same-RPC call must genuinely block on the first');
      assert.match(dbTier.outA, /A_DONE\|[0-9a-f-]{36}\|[0-9a-f-]{36}\|Submitted/, `direct DB A result: ${dbTier.outA}`);
      assert.match(dbTier.outB, /B_DONE\|[0-9a-f-]{36}\|[0-9a-f-]{36}\|Submitted/, `direct DB B result: ${dbTier.outB}`);
      assert.equal(readRounds(ctx.stack.dbTarget, scratchB.evalId).find((r) => r.round === 1).criteria_config_version_id, activeCrit, 'direct DB B round 1 must pin the active criteria version');
      assert.equal(transitionContextCount(ctx.stack.dbTarget), 0, 'direct DB tier must leave zero transition-context rows');
      retireScratchUser(ctx.stack.dbTarget, scratchA.userId);
      retireScratchUser(ctx.stack.dbTarget, scratchB.userId);
      return {
        actual: { browserRounds: rounds.length, overlapWaiters: browserTier.waiters },
        readback: { r1Pin: r1o.criteria_config_version_id, r2Pin: r2o.criteria_config_version_id, dbBlocked: dbTier.blocked },
      };
    }, 'version edit + resubmit concurrent reconcile');

    await ledger.run('race:close-save-concurrent', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await openEvaluation(pageA, ctx.origin, ids.manager);
      await selectTopLevel(pageA);
      // A competing connection row-locks the period, so BOTH the close update and
      // the save RPC's FOR UPDATE OF ep genuinely block on the server.
      const browserTier = await withCompetingPgLock(
        ctx.stack.dbTarget,
        `SELECT 1 FROM public.evaluation_periods WHERE id = '${periodP4}' FOR UPDATE;`,
        () => Promise.all([
          browserAction(pageA, { manifest, name: 'closeEvaluationPeriod', args: [periodP4] }).catch((error) => ({ transportFailure: true, message: safeError(error) })),
          browserAction(pageA, { manifest, name: 'saveEvaluationRound', args: [p4Eval.manager, 1, { [config.criterionIds.leader]: config.topLevelPoints }, { [config.criterionIds.leader]: 'close race' }, { [config.criterionIds.leader]: 0 }, 'close race', true, configArgs('manager')] }).catch((error) => ({ transportFailure: true, message: safeError(error) })),
        ]),
        { label: 'close/save' },
      );
      assert.ok(browserTier.waiters >= 1, `close/save browser race must genuinely overlap a competing connection: ${JSON.stringify(browserTier.activityDuring)}`);
      const period = listPeriods(ctx.stack.dbTarget).find((p) => p.id === periodP4);
      assert.equal(period.status, 'closed', 'the close must win the terminal state');
      const evaluation = readEvaluation(ctx.stack.dbTarget, p4Eval.manager);
      const rounds = readRounds(ctx.stack.dbTarget, p4Eval.manager);
      // Coherent terminal graph for a closed period: the Manager single-round flow
      // is frozen at EITHER untouched (NotStarted, no round) OR a single Draft round
      // — the two legitimate race outcomes, never a progressed/extra round. This is
      // a tight two-value invariant tied to the round-count guard, not an open-ended
      // status enumeration.
      assert.ok(rounds.length <= 1, 'manager single-round flow must not gain extra rounds');
      assert.ok(['NotStarted', 'Draft'].includes(evaluation.status), `a closed period must freeze the manager evaluation at NotStarted/Draft, received ${evaluation.status}`);
      assert.equal(transitionContextCount(ctx.stack.dbTarget), 0, 'close/save race must leave zero transition-context rows');
      return {
        actual: { periodStatus: period.status, evaluationStatus: evaluation.status, overlapWaiters: browserTier.waiters },
        readback: { browserRounds: rounds.length, activeWaiters: browserTier.activityDuring.length },
      };
    }, 'close/save race coherent');

    await ledger.run('race:close-save-db-concurrent', async () => {
      // ---- Direct DB concurrency proof: the real save RPC vs the real close UPDATE
      //      from two competing connections, interleaved by the period row lock. ----
      const activeCrit = psql(ctx.stack.dbTarget, "SELECT public.get_active_criteria_config() ->> 'version_id';")
      const activeGrade = psql(ctx.stack.dbTarget, "SELECT public.get_active_grade_config() ->> 'version_id';")
      const scratchPeriod = seedConcurrencyScratchPeriod(ctx.stack.dbTarget, { year: 2093, teamId: ids.team, subleaderId: ids.subleader, code: `P107T07-SCRATCH-CS-${makeRunSeed().slice(0, 6)}` });
      draftScratchViaRpc(ctx.stack.dbTarget, { evaluationId: scratchPeriod.evalId, round: 1, actor: ids.subleader, ccv: activeCrit, gbv: activeGrade });
      const dbTier = await directRpcInterleave(ctx.stack.dbTarget, {
        label: 'close/save db',
        sqlA: saveRpcSql({ evaluationId: scratchPeriod.evalId, round: 1, actor: ids.subleader, scores: {}, notes: {}, comment: 'db close/save', total: 170, grade: 'S', isSubmit: true, nextRound: 2, nextEvaluator: ids.leader, nextRole: 'Leader', nextStatus: 'Submitted', isFinal: false, ccv: activeCrit, gbv: activeGrade, label: 'A_DONE' }),
        sqlB: `UPDATE public.evaluation_periods SET status='closed', closed_at=now() WHERE id='${scratchPeriod.periodId}'; SELECT 'B_DONE|closed';`,
      });
      assert.equal(dbTier.blocked, true, 'direct DB tier: the close update must genuinely block on the save RPC period row lock');
      assert.match(dbTier.outA, /A_DONE\|[0-9a-f-]{36}\|[0-9a-f-]{36}\|Submitted/, `direct DB A (save) result: ${dbTier.outA}`);
      assert.match(dbTier.outB, /B_DONE\|closed/, `direct DB B (close) result: ${dbTier.outB}`);
      assert.equal(listPeriods(ctx.stack.dbTarget).find((p) => p.id === scratchPeriod.periodId)?.status, 'closed', 'direct DB tier must close its period');
      assert.equal(readEvaluation(ctx.stack.dbTarget, scratchPeriod.evalId).status, 'Submitted', 'direct DB tier must keep the committed save coherent');
      assert.equal(transitionContextCount(ctx.stack.dbTarget), 0, 'direct DB tier must leave zero transition-context rows');
      retireScratchUser(ctx.stack.dbTarget, scratchPeriod.userId);
      return {
        actual: { dbBlocked: dbTier.blocked, scratchClosed: true },
        readback: { dbA: dbTier.outA, dbB: dbTier.outB, pendingLocks: dbTier.locksDuring.length },
      };
    }, 'close/save direct-DB concurrency');

    // -------------------------------------------------------------------
    // Fail-closed scope boundaries (no Active period / duplicate Active).
    // -------------------------------------------------------------------
    await ledger.run('scope:no-active-period-fail-closed', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      const noActiveCount = Number(psql(ctx.stack.dbTarget, "SELECT count(*) FROM public.evaluation_periods WHERE status = 'active';"));
      assert.equal(noActiveCount, 0, 'the valid criteria edit setup must have no ACTIVE evaluation period');
      const historicalV1Before = criteriaSnapshotReadback(ctx.stack.dbTarget, config.criteriaConfigVersionId);
      const historicalChecksumBefore = psql(ctx.stack.dbTarget, `SELECT checksum FROM public.criteria_config_versions WHERE id='${config.criteriaConfigVersionId}';`);
      assert.equal(readRound(ctx.stack.dbTarget, evalId.manager, 1).criteria_config_version_id, config.criteriaConfigVersionId, 'P1 approved history must still pin immutable V1');
      const validEdit = await browserAction(pageA, {
        manifest,
        name: 'upsertCriterionAction',
        args: [{ id: config.criterionId, name: 'P107T07 Criterion v2' }, config.criteriaGroupId, config.criteriaVersion],
      });
      assert.ok(validEdit.value && validEdit.value.success === true, `the real Manager config edit must succeed with no ACTIVE period: ${JSON.stringify(validEdit.value)}`);
      const activeV2 = psql(ctx.stack.dbTarget, "SELECT public.get_active_criteria_config() ->> 'version_id';");
      assert.notEqual(activeV2, config.criteriaConfigVersionId, 'valid no-active edit must activate a new immutable version');
      assert.deepEqual(criteriaSnapshotReadback(ctx.stack.dbTarget, config.criteriaConfigVersionId), historicalV1Before, 'historical V1 snapshot rows must remain unchanged after V2 activation');
      assert.equal(psql(ctx.stack.dbTarget, `SELECT checksum FROM public.criteria_config_versions WHERE id='${config.criteriaConfigVersionId}';`), historicalChecksumBefore, 'historical V1 checksum must remain unchanged');
      assert.equal(readRound(ctx.stack.dbTarget, evalId.manager, 1).criteria_config_version_id, config.criteriaConfigVersionId, 'approved P1 history must continue to pin V1 after V2 activation');
      const meta = await browserAction(pageA, { manifest, name: 'getPeriodMetadataAction', args: [] });
      assert.ok(meta.value && Array.isArray(meta.value.periods), `metadata must be a real snapshot: ${JSON.stringify(meta.value).slice(0, 160)}`);
      assert.equal(meta.value.activePeriod, null, 'with no Active period the snapshot must report activePeriod null (fail-closed, never invented)');
      assert.equal(meta.value.periods.some((p) => p.status === 'Active'), false, 'no period may report Active');
      const state = await pageA.goto(`${ctx.origin}/dashboard`, null).catch(() => null);
      const text = state ? state.text : await pageA.evaluate("document.body ? document.body.innerText : ''");
      assert.equal(typeof text === 'string' && text.length > 0, true, 'the UI must render a bounded surface with no Active period');
      return { actual: { activePeriod: null, periods: meta.value.periods.length }, readback: { bounded: true } };
    }, 'no Active period fail-closed');

    await ledger.run('scope:malformed-active-metadata-fail-closed', async () => {
      // The single-Active invariant is enforced by a UNIQUE partial index; it is
      // asserted here (by shape, not by a hardcoded name) and NEVER weakened.
      // Natural multiple-Active is impossible.
      const idx = psql(ctx.stack.dbTarget, `SELECT COALESCE(string_agg(indexdef, ' | '), '') FROM pg_indexes WHERE tablename = 'evaluation_periods' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%status%';`);
      assert.match(idx, /UNIQUE INDEX/i, `single-active invariant must be a unique index: ${idx}`);
      assert.match(idx, /active/i, 'the unique index must be partial on status = active');
      const tempId = makeRunSeed();
      psql(ctx.stack.dbTarget, `INSERT INTO public.evaluation_periods(id, year, name, status) VALUES ('${tempId}', 2092, 'Kỳ 2092', 'active');`);
      let duplicateRejected = false;
      try {
        psql(ctx.stack.dbTarget, `INSERT INTO public.evaluation_periods(year, name, status) VALUES (2091, 'Kỳ 2091', 'active');`);
      } catch (error) {
        duplicateRejected = /duplicate key|unique/i.test(String(error.message));
      }
      psql(ctx.stack.dbTarget, `DELETE FROM public.evaluation_periods WHERE id = '${tempId}';`);
      assert.equal(duplicateRejected, true, 'a second Active period must be rejected by the DB invariant');
      const meta = await browserAction(pageA, { manifest, name: 'getPeriodMetadataAction', args: [] });
      assert.equal(meta.value.activePeriod, null, 'malformed/empty metadata must be reported fail-closed (null), never fabricated');
      assert.equal(meta.value.periods.some((p) => p.status === 'Active'), false, 'the real list must not claim an Active period');
      return { actual: { duplicateActiveRejected: duplicateRejected, activePeriod: meta.value.activePeriod }, readback: { index: idx.slice(0, 90) } };
    }, 'malformed/duplicate-active metadata fail-closed');

    // -------------------------------------------------------------------
    // Mixed Approved/unapproved projection (supplemental).
    // -------------------------------------------------------------------
    await loginAs(pageA, ctx.origin, codesMap.manager);
    await createPeriodViaUi(pageA, ctx.origin, 2095);
    const periodMixed = listPeriods(ctx.stack.dbTarget).find((p) => p.year === 2095)?.id || null;
    assert.ok(periodMixed, 'mixed period P5 missing');
    await openEvaluation(pageA, ctx.origin, ids.manager);
    await selectTopLevel(pageA);
    await submitViaUi(pageA);
    const mixedEvalIds = {};
    for (const alias of Object.keys(ACTOR_ROLES)) {
      mixedEvalIds[alias] = await subjectEvaluationId(ctx.stack.dbTarget, periodMixed, subjectId(ids, alias));
    }
    const mixedApprovedId = mixedEvalIds.manager;
    await ledger.run('dto:approved-only-projection-mixed', async () => {
      const result = await browserAction(pageA, { manifest, name: 'getEvaluationResultProjectionAction', args: [periodMixed] });
      const projection = result.value;
      const approved = projection.result.approved;
      assert.equal(projection.coverage.total, 5, 'mixed roster total must be five');
      assert.equal(projection.coverage.approved, 1, 'exactly one subject is Approved');
      assert.ok(projection.coverage.pending >= 1, 'unapproved subjects must remain pending');
      assert.equal(projection.coverage.approved + projection.coverage.pending, projection.coverage.total, 'coverage must partition the roster');
      assert.equal(approved.length, 1, 'result.approved must contain only the single Approved row');
      // Exact id + golden score/grade/basis from the RAW response text.
      assert.ok(result.text.includes(mixedApprovedId), 'raw projection must carry the exact Approved id');
      assert.match(result.text, /"score"\s*:\s*170/, 'Approved row must carry the golden score');
      assert.match(result.text, /"grade"\s*:\s*"S"/, 'Approved row must carry the golden grade');
      const mixedPinned = readRound(ctx.stack.dbTarget, mixedApprovedId, 1).criteria_config_version_id;
      const mixedSnapshot = criteriaSnapshotReadback(ctx.stack.dbTarget, mixedPinned);
      const mixedExpected = expectedProjectionBasis(mixedPinned, mixedSnapshot);
      const mixedObserved = (result.text.match(/"basis"\s*:\s*"([a-z_]+)"/) || [])[1] ?? null;
      assert.equal(mixedObserved, mixedExpected, `mixed projection basis must equal DB ground truth (observed=${mixedObserved}, expected=${mixedExpected}, pinned=${mixedPinned}, snapshot=${JSON.stringify(mixedSnapshot)})`);
      assert.equal(mixedExpected, 'authoritative', `the mixed harness must submit an Approved evaluation pinned to a fully materialized snapshot (pinned=${mixedPinned}, snapshot=${JSON.stringify(mixedSnapshot)})`);
      for (const [alias, id] of Object.entries(mixedEvalIds)) {
        if (alias === 'manager') continue;
        assert.equal(result.text.includes(id), false, `unapproved ${alias} evaluation ${id} must not leak into the projection`);
      }
      assert.equal(projection.result.invalid.length, 0, 'no invalid approved row in the mixed set');
      return { actual: { total: projection.coverage.total, approved: projection.coverage.approved, pending: projection.coverage.pending }, readback: { approvedId: mixedApprovedId, score: 170, grade: 'S' } };
    }, 'Approved-only mixed projection');

    // -------------------------------------------------------------------
    // Reader transport fault at the local CDP request boundary (loading/error/
    // Retry + recovery against the REAL backend). The unknown-id path is a
    // separate empty/access test, never counted as the reader-error surface.
    // -------------------------------------------------------------------
    await ledger.run('fault:reader-transport-retry-recovery', async () => {
      // The criteria reader only runs on an EDITABLE round for its assigned
      // evaluator; a submitted/read-only view never calls getCriteriaForRoleAction,
      // so the injected fault would be a no-op there.
      await loginAs(pageA, ctx.origin, codesMap.subleader);
      const criteriaActionId = actionIdFor(manifest, 'getCriteriaForRoleAction');
      await pageA.enableFetchFail((params) => {
        const headers = params.request?.headers || {};
        return headers['Next-Action'] === criteriaActionId || headers['next-action'] === criteriaActionId;
      });
      await pageA.send('Page.navigate', { url: `${ctx.origin}/evaluations/${ids.worker}` }).catch(() => {});
      let errorText;
      try {
        errorText = await waitFor(async () => {
          const text = await pageA.evaluate("document.body ? document.body.innerText : ''");
          return /Không thể tải tiêu chí đánh giá/.test(text) ? text : false;
        }, { timeout: 45_000, interval: 300, label: 'criteria reader error surface' });
      } catch (error) {
        const diag = typeof pageA.diagnostics === 'function' ? await pageA.diagnostics().catch(() => null) : null;
        const body = await pageA.evaluate("document.body ? document.body.innerText : ''");
        throw new Error(`${error.message} | path=${await pageA.evaluate('location.pathname')} | text=${JSON.stringify(String(body).slice(0, 300))} | diag=${JSON.stringify(diag).slice(0, 1500)}`);
      }
      assert.match(errorText, /Không thể tải tiêu chí đánh giá/, 'an injected reader transport fault must render the criteria error surface');
      const retryRendered = await pageA.evaluate("(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Thử lại')))()");
      assert.equal(retryRendered, true, 'the error surface must expose a Retry control');
      // Recovery: disarm the fault and retry against the REAL backend.
      await pageA.disableFetchFiltered();
      await pageA.clickText('Thử lại');
      await waitFor(async () => (await pageA.evaluate("document.querySelector('[data-load-state=\\\"criteria\\\"]') !== null")) === true,
        { timeout: 45_000, interval: 300, label: 'criteria recovery' });
      const recovered = await pageA.evaluate("document.body ? document.body.innerText : ''");
      assert.doesNotMatch(recovered, /Không thể tải tiêu chí đánh giá/, 'retry against the real backend must recover the criteria');
      return { actual: { errorSurface: true, recovered: true }, readback: { retryRendered } };
    }, 'reader transport fault + retry recovery');

    // -------------------------------------------------------------------
    // A paused OLD authenticated read released after logout must not resurrect
    // the protected payload (real revocation, not a mere navigation pause).
    // -------------------------------------------------------------------
    await ledger.run('fault:stale-read-cannot-resurrect-after-revocation', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await pageA.goto(`${ctx.origin}/dashboard`, "document.body.innerText.toLowerCase().includes('tổng quan hệ thống')");
      const periodMetadataActionId = actionIdFor(manifest, 'getPeriodMetadataAction');
      await pageA.enableFetchFiltered((params) => {
        const headers = params.request?.headers || {};
        return headers['Next-Action'] === periodMetadataActionId || headers['next-action'] === periodMetadataActionId;
      });
      // Trigger a real period-metadata refresh via the app's own storage listener.
      await pageA.evaluate("window.dispatchEvent(new StorageEvent('storage', { key: 'selected_period_id', newValue: 'p107t07-stale' }))");
      await waitFor(() => pageA.heldRequestIds().length >= 1, { timeout: 20_000, interval: 200, label: 'scoped read held' });
      // The app's UI logout handler awaits its own in-flight period-metadata refresh,
      // which this probe deliberately holds paused — invoking the SAME real logout
      // server action directly performs the real revocation without that self-deadlock.
      const logoutResult = await browserAction(pageA, { manifest, name: 'logoutAction', args: [] }).catch((error) => ({ transportFailure: true, message: safeError(error) }));
      assert.equal(logoutResult.transportFailure, undefined, `logout action must not be a transport failure: ${JSON.stringify(logoutResult).slice(0, 160)}`);
      await pageA.goto(`${ctx.origin}/login`).catch(() => {});
      await pageA.waitFor("location.pathname === '/login'", { timeout: 20_000, label: 'logout landing' });
      const revokedCookies = await pageA.cookies();
      assert.equal(revokedCookies.some((c) => c.name === 'auth_session'), false, 'logout must clear the session cookie');
      // Release the OLD authenticated read AFTER revocation.
      await pageA.releasePaused();
      await pageA.disableFetchFiltered();
      await wait(1500);
      const finalPath = await pageA.evaluate('location.pathname');
      const finalText = await pageA.evaluate("document.body ? document.body.innerText : ''");
      assert.equal(finalPath, '/login', 'a released stale read must never restore an authenticated route');
      assert.doesNotMatch(finalText, /Tổng quan hệ thống|Phiếu đánh giá|Đánh giá năng lực/i, 'a released stale read must not resurrect the protected payload');
      return { actual: { released: true, finalPath }, readback: { stalePayloadSuppressed: true } };
    }, 'stale read cannot resurrect after revocation');

    // -------------------------------------------------------------------
    // Poll no-blink (>30s same-identity poll with a live DOM observer).
    // -------------------------------------------------------------------
    await ledger.run('poll:unchanged-scope-30s-no-blink', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await pageA.goto(`${ctx.origin}/dashboard`, "document.body.innerText.toLowerCase().includes('tổng quan hệ thống')");
      await pageA.send('Page.bringToFront').catch(() => {});
      const visibility = await pageA.evaluate('document.visibilityState');
      assert.equal(visibility, 'visible', 'poll tab must be visible for the interval to fire');
      await pageA.evaluate(`(() => {
        window.__p107Poll = { blink: false, events: [], ticks: 0 };
        const observer = new MutationObserver(() => {
          const text = document.body ? document.body.innerText : '';
          if (!text.includes('Tổng quan hệ thống')) {
            window.__p107Poll.blink = true;
            window.__p107Poll.events.push({ at: performance.now(), text: text.slice(0, 160) });
          }
        });
        observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
        window.__p107PollObserver = observer;
        return true;
      })()`);
      const started = Date.now();
      while (Date.now() - started < POLL_WAIT_MS) {
        await pageA.evaluate("window.dispatchEvent(new Event('focus')); window.__p107Poll.ticks += 1;").catch(() => {});
        await wait(3000);
      }
      const proof = await pageA.evaluate("(() => { window.__p107PollObserver?.disconnect(); return window.__p107Poll; })()");
      assert.equal(proof.blink, false, `same-identity poll blanked the resident content: ${JSON.stringify(proof.events)}`);
      const stillThere = await pageA.evaluate("document.body.innerText.toLowerCase().includes('tổng quan hệ thống')");
      assert.equal(stillThere, true, 'resident content must persist across the poll window');
      return { actual: { waitedMs: Date.now() - started, ticks: proof.ticks }, readback: { blink: proof.blink } };
    }, 'no blink across >30s poll');

    // -------------------------------------------------------------------
    // Delayed real response via CDP pause/release (resident payload preserved).
    // -------------------------------------------------------------------
    await ledger.run('cdp:delayed-response-no-stale-resident', async () => {
      await loginAs(pageA, ctx.origin, codesMap.manager);
      await pageA.goto(`${ctx.origin}/dashboard`, "document.body.innerText.toLowerCase().includes('tổng quan hệ thống')");
      const beforeCount = pageA.connection.eventsFor(pageA.sessionId, ['Fetch.requestPaused']).length;
      const beforeIndex = (await pageA.send('Page.getNavigationHistory')).currentIndex;
      await pageA.enableFetch('*');
      await pageA.send('Page.navigate', { url: `${ctx.origin}/evaluations/${ids.employee}` }).catch(() => {});
      const paused = await waitFor(() => pageA.connection.eventsFor(pageA.sessionId, ['Fetch.requestPaused']).length > beforeCount, { timeout: 15_000, label: 'response paused' });
      // Browser-level check while the navigation request is held: the paused
      // response must not have committed a navigation, so the resident page is
      // preserved. (Reading the page context here would hang: the pending
      // navigation invalidates the execution context.)
      const during = await pageA.send('Page.getNavigationHistory');
      assert.equal(during.currentIndex, beforeIndex, 'a paused response must not commit a navigation (resident payload preserved)');
      await pageA.releasePaused();
      await pageA.disableFetch();
      await waitFor(async () => {
        const text = await pageA.evaluate("document.body ? document.body.innerText : ''");
        return /Đánh giá|Quyền truy cập|Phiếu đánh giá/.test(text);
      }, { timeout: 30_000, label: 'delayed response applied' });
      return { actual: { paused: Boolean(paused) }, readback: { residentPreserved: true } };
    }, 'paused response preserves resident payload');

    // -------------------------------------------------------------------
    // Diagnostics: desktop + mobile viewports, console/network, screenshots.
    // -------------------------------------------------------------------
    await loginAs(pageA, ctx.origin, codesMap.manager);
    // Window-scoped fault-gate baseline: the intentional fault probes above are
    // excluded by EXACT absolute CDP-event position (never a blanket filter). The
    // diag navigation window must add zero new exceptions / first-party failures /
    // console errors.
    const diagBase = { marker: pageA.consoleEventMarker() };
    const desktopShot = await (async () => {
      await pageA.setViewport(1440, 900);
      const state = await pageA.goto(`${ctx.origin}/dashboard`, "document.body.innerText.toLowerCase().includes('tổng quan hệ thống')");
      const shot = await pageA.screenshot('desktop-1440x900', { dir: shotsDir });
      ctx.screenshots.push(shot);
      return { state, shot };
    })();
    await ledger.run('diag:desktop-1440x900-console-network', async () => {
      const errors = pageA.consoleErrors(diagBase.marker);
      const failures = pageA.firstPartyFailures(diagBase.marker);
      const exceptions = pageA.exceptions(diagBase.marker);
      assert.equal(exceptions.length, 0, `unexpected desktop exceptions: ${JSON.stringify(exceptions)}`);
      assert.equal(failures.length, 0, `unexpected desktop first-party failures: ${JSON.stringify(failures)}`);
      assert.equal(errors.filter((entry) => entry.level === 'error').length, 0, `unexpected desktop console errors: ${JSON.stringify(errors)}`);
      return { actual: { consoleErrors: errors.length, networkFailures: failures.length, exceptions: exceptions.length }, readback: { status: 'rendered', viewport: '1440x900' } };
    }, 'desktop diagnostics');

    const mobileShot = await (async () => {
      await pageA.setViewport(390, 844, { mobile: true });
      const state = await pageA.goto(`${ctx.origin}/dashboard`, "document.body.innerText.toLowerCase().includes('tổng quan hệ thống')");
      const shot = await pageA.screenshot('mobile-390x844', { dir: shotsDir });
      ctx.screenshots.push(shot);
      return { state, shot };
    })();
    await ledger.run('diag:mobile-390x844-console-network', async () => {
      const errors = pageA.consoleErrors(diagBase.marker);
      const failures = pageA.firstPartyFailures(diagBase.marker);
      const exceptions = pageA.exceptions(diagBase.marker);
      assert.equal(exceptions.length, 0, `unexpected mobile exceptions: ${JSON.stringify(exceptions)}`);
      assert.equal(failures.length, 0, `unexpected mobile first-party failures: ${JSON.stringify(failures)}`);
      assert.equal(errors.filter((entry) => entry.level === 'error').length, 0, `unexpected mobile console errors: ${JSON.stringify(errors)}`);
      return { actual: { consoleErrors: errors.length, networkFailures: failures.length, exceptions: exceptions.length }, readback: { status: 'rendered', viewport: '390x844' } };
    }, 'mobile diagnostics');

    await ledger.run('diag:console-exception-first-party-gates', async () => {
      // Three DISTINCT, separately-asserted gates over the exact diag window (an
      // absolute event-position marker is the whitelist: every earlier intentional
      // fault is excluded by position, never by a blanket suppression filter).
      const exceptions = pageA.exceptions(diagBase.marker);
      const failures = pageA.firstPartyFailures(diagBase.marker);
      const errors = pageA.consoleErrors(diagBase.marker);
      const consoleErrorEntries = errors.filter((entry) => entry.level === 'error');
      assert.equal(exceptions.length, 0, `gate[exceptions] must be zero in the diag window: ${JSON.stringify(exceptions)}`);
      assert.equal(failures.length, 0, `gate[first-party-failures] must be zero in the diag window: ${JSON.stringify(failures)}`);
      assert.equal(consoleErrorEntries.length, 0, `gate[console-errors] must be zero in the diag window: ${JSON.stringify(consoleErrorEntries)}`);
      return {
        actual: { exceptions: exceptions.length, firstPartyFailures: failures.length, consoleErrors: consoleErrorEntries.length },
        readback: { windowMarker: diagBase.marker, warningsAllowed: errors.length - consoleErrorEntries.length },
      };
    }, 'distinct console/exception/first-party gates');

    await ledger.run('diag:loading-empty-error-retry-behavior', async () => {
      await pageA.setViewport(1440, 900);
      // Loading surface: sample with a BOUNDED wait until the document materializes,
      // then require either a real loading frame (EvaluationStaticFrame skeleton /
      // any data-load-layer) or ready content — never an empty frame.
      await pageA.send('Page.navigate', { url: `${ctx.origin}/evaluations/${ids.employee}` });
      const loadingMarkers = await waitFor(async () => {
        const m = await pageA.evaluate("({ hasBody: document.body !== null, frame: document.querySelector('[data-load-layer]') !== null || !!document.querySelector('.animate-pulse'), ready: document.body ? document.body.innerText.trim().length > 0 : false })");
        return (m.hasBody && (m.frame || m.ready)) ? m : false;
      }, { timeout: 30_000, interval: 100, label: 'loading frame or ready content' });
      assert.ok(loadingMarkers.frame === true || loadingMarkers.ready === true, 'no loading frame and no ready content observed after navigation');
      // Empty/access surface ONLY: an unknown evaluation id must render a bounded
      // route body, never a blank crash. Assertions are scoped to <main> (the route
      // content container); the global sidebar/chrome is a SIBLING of <main>, so it
      // can no longer satisfy these assertions. Deliberately NOT the reader-error
      // matrix (proven separately by fault:reader-transport-retry-recovery).
      const unknown = await pageA.goto(`${ctx.origin}/evaluations/00000000-0000-4000-8000-00000000dead`, "document.readyState === 'complete'");
      // The route body is client-rendered: poll <main> (bounded) until the bounded
      // access/empty/error surface appears, so a slow render is never misread as a
      // blank crash. <main> excludes the global sidebar/chrome (a sibling of <main>).
      const routeBody = await waitFor(async () => {
        const text = await pageA.evaluate("(() => { const m = document.querySelector('main'); return m ? m.innerText : ''; })()");
        return /Quyền truy cập|Chưa có dữ liệu|Không thể|Không tìm thấy|Đã xảy ra lỗi|Không có|không được phép/i.test(text) ? text : false;
      }, { timeout: 30_000, interval: 250, label: 'unknown route bounded surface' });
      assert.ok(routeBody.trim().length > 0, 'unknown evaluation route rendered an empty <main> body');
      assert.ok(!/KỲ ĐÁNH GIÁ/.test(routeBody), 'unknown route <main> must not fall back to the global chrome');
      return { actual: { loadingShellObserved: loadingMarkers.shell === true || loadingMarkers.ready === true, emptySurface: true }, readback: { routeBody: routeBody.slice(0, 160), readerErrorCoveredElsewhere: true } };
    }, 'loading/empty/access surfaces');

    await ledger.run('diag:screenshots-captured', async () => {
      assert.ok(ctx.screenshots.length >= 2, 'expected at least desktop and mobile screenshots');
      for (const shot of ctx.screenshots) assert.ok(/^[0-9a-f]{64}$/.test(shot.sha256), 'screenshot hash missing');
      return { actual: { count: ctx.screenshots.length }, readback: { screenshots: ctx.screenshots } };
    }, 'screenshots captured');
    void desktopShot; void mobileShot;

    return ledger.snapshot();
  } finally {
    void ctx;
  }
}

async function cleanup(ctx) {
  // Full owned-graph teardown readback: containers (state+pid), network (id),
  // every owned process (Next/proxy/Chrome) by PID + Linux starttime, and the
  // owned loopback ports. A pure count is never accepted as proof of the graph.
  const readback = captureResourceReadback({
    containerNames: ctx.stack ? [ctx.stack.containerNames.rest, ctx.stack.containerNames.db] : [],
    networkName: ctx.stack ? ctx.stack.networkName : null,
    pids: [ctx.next?.pid, ctx.stack?.proxyPid, ctx.browser?.pid].filter(Boolean),
    ports: [
      ctx.next?.port,
      ctx.stack?.dbPort ? Number(ctx.stack.dbPort) : null,
      ctx.stack?.restPort,
      ctx.stack?.backendRestPort,
    ].filter(Boolean),
  });
  return readback;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node tests/fixtures/p107/lifecycle-coherence/browser-acceptance.mjs --evidence /absolute/path.json --expected-sha <sha> [--runtime-root <dir>] [--chrome <binary>] [--diagnostic]');
    console.log('  --diagnostic  tolerate an uncommitted (dirty) worktree; evidence is pinned by a dirty digest and can never be qualified as the frozen candidate');
    return;
  }
  const evidencePath = options.evidence ? path.resolve(options.evidence) : null;
  const ledger = new CaseLedger({ manifest: CASE_MANIFEST, evidencePath });
  const ctx = { ledger };
  try {
    const snapshot = await runWithCleanup(options, ctx);
    const summary = ctx.ledger.summary();
    const qualified = summary.real && !options.diagnostic;
    ctx.ledger.setMeta({
      status: options.diagnostic ? (summary.real ? 'DIAGNOSTIC_PASS' : 'DIAGNOSTIC_FAIL') : (qualified ? 'QUALIFIED' : 'FAIL'),
      qualification: options.diagnostic ? 'DIAGNOSTIC' : 'FROZEN',
      summary,
    });
    ctx.ledger.write();
    if (options.diagnostic) {
      if (summary.real) {
        console.log(`BROWSER_ACCEPTANCE DIAGNOSTIC cases=${summary.asserted}/${summary.manifestSize} qualified=false evidence=${evidencePath}`);
      } else {
        console.error(`BROWSER_ACCEPTANCE DIAGNOSTIC_FAIL unasserted=${summary.unasserted.join(',') || 'none'} firstFailure=${summary.firstFailure}`);
        process.exitCode = 1;
      }
    } else if (qualified) {
      console.log(`BROWSER_ACCEPTANCE PASS cases=${summary.asserted}/${summary.manifestSize} evidence=${evidencePath}`);
    } else {
      console.error(`BROWSER_ACCEPTANCE FAIL unasserted=${summary.unasserted.join(',') || 'none'} firstFailure=${summary.firstFailure}`);
      process.exitCode = 1;
    }
    void snapshot;
  } catch (error) {
    // Fail-closed: unasserted required cases stay NOT_RUN; first failure retained.
    const asserted = new Set(ledger.records.map((record) => record.id));
    for (const entry of CASE_MANIFEST) {
      if (!asserted.has(entry.id)) ledger.notRun(entry.id, 'aborted before assertion');
    }
    const blocked = ['MISSING_RUNTIME_CAPABILITY', 'MISSING_EXPECTED_SHA', 'REFUSE_TMP_RUNTIME_ROOT', 'RESOURCE_BUDGET_INSUFFICIENT', 'INSUFFICIENT_INPUT'].includes(error?.code);
    ledger.setMeta({ status: blocked ? 'BLOCKED' : 'FAIL', failureKind: error?.code || 'SUBSTANTIVE_FAILURE', failureError: safeError(error) });
    ledger.write();
    if (blocked) {
      console.error(`BROWSER_ACCEPTANCE BLOCKED ${safeError(error)}`);
    } else {
      console.error(`BROWSER_ACCEPTANCE FAIL ${safeError(error)}`);
    }
    process.exitCode = 1;
  }
}

async function runWithCleanup(options, ctx) {
  let result;
  let failure;
  try {
    result = await run(options, ctx);
  } catch (error) {
    failure = error;
  }
  // Fail/timeout teardown: attempt EVERY owned resource independently so a single
  // teardown error cannot orphan the rest, then record the resource readback. The
  // FIRST failure (kept by the ledger) is preserved: ctx is the same object run()
  // populated, so browser/Next/stack handles are all reachable here now.
  const teardown = { stack: null, next: null, browser: null };
  try { if (ctx.stack) teardown.stack = await ctx.stack.teardown?.(); } catch (error) { teardown.stack = { error: safeError(error) }; }
  try { if (ctx.next) teardown.next = await ctx.next.stop?.(); } catch (error) { teardown.next = { error: safeError(error) }; }
  try { if (ctx.browser) teardown.browser = await ctx.browser.stop?.(); } catch (error) { teardown.browser = { error: safeError(error) }; }
  const resourceReadback = await cleanup(ctx).catch((error) => ({ error: safeError(error) }));
  ctx.ledger.setMeta({ cleanup: resourceReadback, teardown });
  ctx.ledger.write();
  if (failure) throw failure;
  void result;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === FILE) {
  await main();
}
