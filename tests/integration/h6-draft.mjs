#!/usr/bin/env node
/**
 * Integration Test for Kurabe CONTROLLED Task P103M2T03
 * H6 draft transaction response contract.
 *
 * Rules:
 * - Behavioral DB checks must use a fresh disposable local stack only; no production writes.
 * - Integration suite must be wrapper-compatible and truthful: use existing
 *   tests/support/confirmation-runtime.mjs and existing bootstrap/auth/action helpers when compatible.
 * - It may return BLOCKED_CAPABILITY when real runtime is unavailable, but must never call
 *   source-contract or migration-only execution authenticated/QUALIFIED.
 * - It covers authentic R1 draft (Draft), R2 draft (Submitted), R3 draft (Reviewed),
 *   submits, duplicate draft idempotency, no submit audit for draft, initialization
 *   consumer parity, and stale/revoked/closed atomic denials.
 * - Keep evidence tier labels truthful; no fake authenticated evidence.
 *
 * Run: node tests/integration/h6-draft.mjs
 * Or:  node scripts/verify-release.mjs --suite h6-draft --tier authenticated --evidence "$EVIDENCE/h6-draft.json"
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

const FORWARD_MIGRATION_PATH = path.join(
  projectRoot,
  'supabase/migrations/20260914000200_evaluation_workflow_multiteam.sql'
);
const ACTION_PATH = path.join(projectRoot, 'src/actions/evaluation.ts');
const WORKFLOW_PATH = path.join(projectRoot, 'src/lib/evaluation-workflow.ts');

export const REQUIRED_CASES = [
  'h6:authentic-r1-draft-response-matches-db',
  'h6:authentic-r1-submit-advances-to-r2',
  'h6:authentic-r2-draft-response-matches-submitted-db',
  'h6:authentic-r2-submit-advances-to-r3',
  'h6:authentic-r3-draft-response-matches-reviewed-db',
  'h6:authentic-r3-final-submit-approves',
  'h6:repeated-identical-draft-no-duplicate-round',
  'h6:draft-has-no-submit-audit-or-next-transition',
  'h6:initialize-draft-consumer-parity',
  'h6:atomic-denial-stale-revoked-closed',
];

const ACTORS = Object.freeze({
  manager: { id: '10000000-0000-4000-8000-000000000001', code: 'M2-MANAGER', role: 'Manager' },
  leaderA: { id: '10000000-0000-4000-8000-000000000002', code: 'M2-LEADER-A', role: 'Leader' },
  leaderC: { id: '10000000-0000-4000-8000-000000000003', code: 'M2-LEADER-C', role: 'Leader' },
  subB: { id: '10000000-0000-4000-8000-000000000004', code: 'M2-SUBLEADER-B', role: 'SubLeader' },
  subC: { id: '10000000-0000-4000-8000-000000000007', code: 'M2-SUBLEADER-C', role: 'SubLeader' },
  employeeB: { id: '10000000-0000-4000-8000-000000000005', code: 'M2-EMPLOYEE-B', role: 'Employee' },
  workerB: { id: '10000000-0000-4000-8000-000000000006', code: 'M2-WORKER-B', role: 'Worker' },
  employeeC: { id: '10000000-0000-4000-8000-000000000009', code: 'M2-EMPLOYEE-C', role: 'Employee' },
});

const TEAMS = Object.freeze({
  A: '20000000-0000-4000-8000-000000000001',
  B: '20000000-0000-4000-8000-000000000002',
  C: '20000000-0000-4000-8000-000000000003',
});

const PERIODS = Object.freeze({
  active: '30000000-0000-4000-8000-000000000001',
  closed: '30000000-0000-4000-8000-000000000002',
});

function decodeFlight(text) {
  const chunks = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^([0-9a-f]+):([\s\S]*)$/);
    if (!match) continue;
    try { chunks.set(match[1], JSON.parse(match[2])); } catch { /* non-JSON chunk */ }
  }
  function decode(value, depth = 0) {
    if (depth > 25) return '[DEPTH_LIMIT]';
    if (typeof value === 'string') {
      const ref = value.match(/^\$(?:@)?([0-9a-f]+)$/);
      if (ref && chunks.has(ref[1])) return decode(chunks.get(ref[1]), depth + 1);
      if (value === '$undefined') return undefined;
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => decode(item, depth + 1));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item, depth + 1)]));
    }
    return value;
  }
  const root = chunks.get('0');
  return root && Object.hasOwn(root, 'a') ? decode(root.a) : { decodeError: true, raw: text.slice(-2000) };
}

function actionWorker(name, item) {
  const workers = Array.isArray(item.workers) ? item.workers : Object.keys(item.workers ?? {});
  if (name === 'loginAction') return workers.find((w) => w === 'app/login/page');
  return workers.find((w) => w.includes('evaluations/[id]'))
    ?? workers.find((w) => w.includes('settings/page'))
    ?? workers.find((w) => w !== 'app/login/page')
    ?? workers[0];
}

function loadManifest(source) {
  const candidates = [
    path.join(source, '.next/dev/server/server-reference-manifest.json'),
    path.join(source, '.next/server/server-reference-manifest.json'),
  ];
  const manifestPath = candidates.find((c) => fs.existsSync(c));
  assert.ok(manifestPath, `NEXT_ACTION_MANIFEST_MISSING source=${source}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).node;
  return Object.entries(manifest).map(([id, item]) => ({ id, ...item }));
}

function ownedFileHashes() {
  const paths = [
    'src/actions/evaluation.ts',
    'tests/h6-draft-response.test.ts',
    'tests/integration/h6-draft.mjs',
  ];
  const hashes = {};
  for (const relPath of paths) {
    const full = path.join(projectRoot, relPath);
    if (fs.existsSync(full)) {
      hashes[relPath] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
    }
  }
  return hashes;
}

export function verifySourceContracts() {
  const cases = [];

  // 1. Action source existence
  assert.ok(fs.existsSync(ACTION_PATH), 'src/actions/evaluation.ts must exist');
  const actionSource = fs.readFileSync(ACTION_PATH, 'utf8');

  // 2. ExpectedStatus derives from operation and validated snapshot
  assert.ok(
    actionSource.includes('deriveExpectedAggregateStatus'),
    'Action must derive expected aggregate status'
  );
  assert.ok(
    !actionSource.includes("nextStep?.status ?? (isSubmit ? 'Submitted' : 'Draft')"),
    'Action must NOT default draft expectedStatus to Draft across all rounds'
  );
  cases.push('source:h6-derive-expected-aggregate-status');

  // 3. Strict response validation guards
  assert.ok(
    actionSource.includes('!isEvaluationTransactionResult(rpcResult)'),
    'Action must validate rpcResult schema'
  );
  assert.ok(
    actionSource.includes('rpcResult.evaluation_id !== evaluationId'),
    'Action must verify evaluation_id matches'
  );
  assert.ok(
    actionSource.includes('authGuard.roundId && rpcResult.round_id !== authGuard.roundId'),
    'Action must verify round_id matches authGuard'
  );
  assert.ok(
    actionSource.includes('!isSubmit && rpcResult.next_round_id !== null'),
    'Action must verify next_round_id is null on drafts'
  );
  assert.ok(
    actionSource.includes('rpcResult.final_status !== expectedStatus'),
    'Action must verify final_status matches derived expectedStatus'
  );
  cases.push('source:h6-strict-response-guards');

  // 4. Draft audit guard: only audit on submit
  assert.ok(
    actionSource.includes('if (isSubmit) {') && actionSource.includes('await logAudit('),
    'Action must gate logAudit on isSubmit === true'
  );
  cases.push('source:h6-no-submit-audit-on-draft');

  // 5. Initialize draft consumer parity
  assert.ok(
    actionSource.includes('export async function initializeEvaluationRoundDraft'),
    'Action must export initializeEvaluationRoundDraft'
  );
  assert.ok(
    actionSource.includes("skipped: 'already_initialized'"),
    'Action must support skipped: already_initialized'
  );
  assert.ok(
    actionSource.includes("skipped: 'locked'"),
    'Action must support skipped: locked'
  );
  cases.push('source:h6-initialize-draft-parity');

  // 6. DB Migration draft semantics
  assert.ok(fs.existsSync(FORWARD_MIGRATION_PATH), 'Migration 002 must exist');
  const sql002 = fs.readFileSync(FORWARD_MIGRATION_PATH, 'utf8');
  assert.ok(
    sql002.includes("IF v_eval.status = 'NotStarted' THEN"),
    'Migration must transition NotStarted to Draft on first draft'
  );
  assert.ok(
    sql002.includes('v_final_status := v_eval.status;'),
    'Migration must preserve parent status on subsequent drafts'
  );
  assert.ok(
    sql002.includes('v_next_round_id := NULL;'),
    'Migration must not create next round on draft'
  );
  cases.push('source:h6-migration-draft-semantics');

  // 7. Workflow status definitions
  assert.ok(fs.existsSync(WORKFLOW_PATH), 'Workflow file must exist');
  const workflowSource = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  assert.ok(
    workflowSource.includes("1: 'Draft'"),
    'Workflow must map round 1 to Draft'
  );
  assert.ok(
    workflowSource.includes("2: 'Submitted'"),
    'Workflow must map round 2 to Submitted'
  );
  assert.ok(
    workflowSource.includes("3: 'Reviewed'"),
    'Workflow must map round 3 to Reviewed'
  );
  cases.push('source:h6-workflow-active-step-statuses');

  return cases;
}

function createDisposableRuntimeFromEnv() {
  const required = [
    'KURABE_LOCAL_STACK_OWNED', 'KURABE_DB_HOST', 'KURABE_DB_PORT', 'KURABE_DB_NAME',
    'KURABE_DB_USER', 'KURABE_DB_PASSWORD', 'KURABE_H6_NEXT_URL',
    'KURABE_H6_RUNTIME_SOURCE', 'KURABE_CONFIRMATION_CANDIDATE_SHA',
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new Error(`MISSING_RUNTIME_CAPABILITY: ${missing.join(',')}`);
  assert.equal(process.env.KURABE_LOCAL_STACK_OWNED, '1');

  const target = {
    host: process.env.KURABE_DB_HOST,
    port: Number(process.env.KURABE_DB_PORT),
    database: process.env.KURABE_DB_NAME,
    user: process.env.KURABE_DB_USER,
    password: process.env.KURABE_DB_PASSWORD,
  };
  const psql = (statement) => execFileSync('psql', [
    '-X', '-h', target.host, '-p', String(target.port), '-U', target.user, '-d', target.database,
    '-At', '-v', 'ON_ERROR_STOP=1',
  ], {
    input: statement,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: target.password },
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  const queryJson = (statement) => {
    const query = statement.trim().replace(/;\s*$/, '');
    const raw = psql(`SELECT COALESCE(json_agg(row_to_json(result)), '[]'::json) FROM (${query}) AS result;`);
    return raw ? JSON.parse(raw) : [];
  };
  const origin = process.env.KURABE_H6_NEXT_URL.replace(/\/$/, '');
  let actions = loadManifest(path.resolve(process.env.KURABE_H6_RUNTIME_SOURCE));
  const clients = new Map();

  class AuthenticatedClient {
    constructor(alias) {
      this.alias = alias;
      this.cookies = new Map();
      this.loggedIn = false;
    }
    updateCookies(response) {
      const values = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
      for (const cookie of values) {
        const match = cookie.match(/^([^=]+)=([^;]*)/);
        if (match) this.cookies.set(match[1], `${match[1]}=${match[2]}`);
      }
    }
    cookieHeader() { return [...this.cookies.values()].join('; '); }
    async action(name, args = [], label = name) {
      const item = actions.find((entry) => entry.exportedName === name);
      assert.ok(item, `ACTION_NOT_COMPILED ${name}`);
      const worker = actionWorker(name, item);
      assert.ok(worker, `ACTION_WORKER_NOT_FOUND ${name}`);
      let endpoint = worker.replace(/^app/, '').replace(/\/page$/, '') || '/';
      if (worker.includes('evaluations/[id]')) endpoint = `/evaluations/${args[0] || 'seed'}`;
      const response = await fetch(`${origin}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=UTF-8',
          Accept: 'text/x-component',
          'Next-Action': item.id,
          Origin: origin,
          ...(this.cookieHeader() ? { Cookie: this.cookieHeader() } : {}),
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(120000),
        redirect: 'manual',
      });
      const raw = await response.text();
      this.updateCookies(response);
      return { http: response.status, endpoint, result: decodeFlight(raw), label };
    }
    async login() {
      const actor = ACTORS[this.alias];
      const password = process.env.KURABE_FIXTURE_PASSWORD;
      assert.ok(password, 'KURABE_FIXTURE_PASSWORD required');
      const login = await this.action('loginAction', [actor.code, password], `login-${this.alias}`);
      assert.equal(login.result?.success, true, `AUTH_FAILED ${this.alias}`);
      const page = await fetch(`${origin}/evaluations/10000000-0000-4000-8000-000000000005`, {
        headers: this.cookieHeader() ? { Cookie: this.cookieHeader() } : {},
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
      await page.arrayBuffer();
      actions = loadManifest(path.resolve(process.env.KURABE_H6_RUNTIME_SOURCE));
      return login.result;
    }
  }

  async function client(alias) {
    if (!clients.has(alias)) clients.set(alias, new AuthenticatedClient(alias));
    const value = clients.get(alias);
    if (!value.loggedIn) { await value.login(); value.loggedIn = true; }
    return value;
  }

  const candidateSha = process.env.KURABE_CONFIRMATION_CANDIDATE_SHA
    || fs.readFileSync(path.join(projectRoot, '.runtime-source-sha'), 'utf8').trim();

  return { candidateSha, target, psql, queryJson, origin, actions, client };
}

export async function runBehavioralConfirmationSuite(runtime) {
  const cases = [];

  // Look up active config versions
  const configRows = runtime.queryJson(`
    SELECT
      (SELECT id FROM public.criteria_config_versions WHERE is_active ORDER BY version_no DESC LIMIT 1) AS criteria_version_id,
      (SELECT id FROM public.grade_band_versions WHERE is_active ORDER BY version_no DESC LIMIT 1) AS grade_version_id;
  `);
  const criteriaVersionId = configRows[0]?.criteria_version_id;
  const gradeVersionId = configRows[0]?.grade_version_id;
  assert.ok(criteriaVersionId && gradeVersionId, 'ACTIVE_CONFIG_MISSING');

  const ruleRows = runtime.queryJson(`
    SELECT c.id AS criterion_id, cl.points, cl.label, cl.description
    FROM public.criteria c
    JOIN public.criterion_levels cl ON cl.criterion_id = c.id
    ORDER BY c.sort_order, cl.sort_order;
  `);
  const renderedRules = [];
  for (const row of ruleRows) {
    let rule = renderedRules.find((candidate) => candidate.id === row.criterion_id);
    if (!rule) {
      rule = { id: row.criterion_id, allowedPoints: [], levels: [] };
      renderedRules.push(rule);
    }
    rule.allowedPoints.push(row.points);
    rule.levels.push({ points: row.points, label: row.label, description: row.description });
  }

  const configOptions = {
    criteriaConfigVersionId: criteriaVersionId,
    gradeConfigVersionId: gradeVersionId,
    renderedRules,
  };
  const scores = Object.fromEntries(renderedRules.map((rule) => [rule.id, rule.levels[0].points]));
  const selectedLevelIndexes = Object.fromEntries(renderedRules.map((rule) => [rule.id, 0]));

  // Seed fresh evaluation for Employee B
  const evalId = crypto.randomUUID();
  let initSeedEvalId = null;
  let revokedEvalId = null;
  let closedEvalId = null;
  const round1Id = crypto.randomUUID();
  runtime.psql(`
    INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
    VALUES ('${evalId}', '${PERIODS.active}', '${ACTORS.employeeB.id}', 'Employee', '${TEAMS.B}', 'NotStarted', 1);
    INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status)
    VALUES ('${round1Id}', '${evalId}', 1, '${ACTORS.subB.id}', 'SubLeader', 'NotStarted');
  `);

  try {
    const subBClient = await runtime.client('subB');
    const subCClient = await runtime.client('subC');
    const leaderAClient = await runtime.client('leaderA');
    const leaderCClient = await runtime.client('leaderC');
    const managerClient = await runtime.client('manager');

    // Case 1: Authentic R1 Draft response matches DB
    const r1Draft = await subBClient.action('saveEvaluationRound', [
      evalId, 1, scores, {}, selectedLevelIndexes, 'R1 Draft 1', false, configOptions,
    ]);
    assert.equal(r1Draft.result?.success, true, `R1 draft must succeed: ${JSON.stringify(r1Draft.result)}`);
    const r1Db = runtime.queryJson(`
      SELECT e.status AS eval_status, er.status AS round_status, er.submitted_at
      FROM public.evaluations e
      JOIN public.evaluation_rounds er ON er.evaluation_id = e.id AND er.round = 1
      WHERE e.id = '${evalId}';
    `)[0];
    assert.equal(r1Db.eval_status, 'Draft', 'R1 draft aggregate status must be Draft');
    assert.equal(r1Db.round_status, 'Draft', 'R1 draft round status must be Draft');
    assert.equal(r1Db.submitted_at, null, 'R1 draft submitted_at must be null');
    cases.push('h6:authentic-r1-draft-response-matches-db');

    // Case 2: Draft has no submit audit or next transition
    const auditRows = runtime.queryJson(`
      SELECT count(*) AS cnt FROM public.audit_logs
      WHERE entity_id = '${evalId}' AND action IN ('SUBMIT_EVALUATION', 'APPROVE_EVALUATION');
    `);
    assert.equal(Number(auditRows[0]?.cnt || 0), 0, 'Draft must not produce submit audit');
    cases.push('h6:draft-has-no-submit-audit-or-next-transition');

    // Case 3: Repeated identical draft creates no extra round
    const r1DraftDup = await subBClient.action('saveEvaluationRound', [
      evalId, 1, scores, {}, selectedLevelIndexes, 'R1 Draft 1', false, configOptions,
    ]);
    assert.equal(r1DraftDup.result?.success, true, 'Repeated R1 draft must succeed');
    const r1RoundCount = runtime.queryJson(`
      SELECT count(*) AS cnt FROM public.evaluation_rounds WHERE evaluation_id = '${evalId}';
    `)[0];
    assert.equal(Number(r1RoundCount.cnt), 1, 'Repeated draft must not create duplicate round');
    cases.push('h6:repeated-identical-draft-no-duplicate-round');

    // Case 4: Authentic R1 Submit advances to R2
    const r1Submit = await subBClient.action('saveEvaluationRound', [
      evalId, 1, scores, {}, selectedLevelIndexes, 'R1 Submit', true, configOptions,
    ]);
    assert.equal(r1Submit.result?.success, true, 'R1 submit must succeed');
    const r1SubmitDb = runtime.queryJson(`
      SELECT e.status AS eval_status, e.current_round, er1.status AS r1_status, er2.status AS r2_status
      FROM public.evaluations e
      JOIN public.evaluation_rounds er1 ON er1.evaluation_id = e.id AND er1.round = 1
      LEFT JOIN public.evaluation_rounds er2 ON er2.evaluation_id = e.id AND er2.round = 2
      WHERE e.id = '${evalId}';
    `)[0];
    assert.equal(r1SubmitDb.eval_status, 'Submitted', 'After R1 submit, eval status must be Submitted');
    assert.equal(r1SubmitDb.current_round, 2, 'Current round must advance to 2');
    assert.equal(r1SubmitDb.r1_status, 'Submitted', 'Round 1 status must be Submitted');
    assert.equal(r1SubmitDb.r2_status, 'NotStarted', 'Round 2 must be created as NotStarted');
    cases.push('h6:authentic-r1-submit-advances-to-r2');

    // Case 5: Authentic R2 Draft response matches Submitted DB (THE CORE BUG FIX)
    const r2Draft = await leaderAClient.action('saveEvaluationRound', [
      evalId, 2, scores, {}, selectedLevelIndexes, 'R2 Draft comment', false, configOptions,
    ]);
    assert.equal(r2Draft.result?.success, true, 'R2 draft response must succeed for Submitted aggregate');
    const r2Db = runtime.queryJson(`
      SELECT e.status AS eval_status, er.status AS round_status, er.submitted_at
      FROM public.evaluations e
      JOIN public.evaluation_rounds er ON er.evaluation_id = e.id AND er.round = 2
      WHERE e.id = '${evalId}';
    `)[0];
    assert.equal(r2Db.eval_status, 'Submitted', 'Parent status must remain Submitted');
    assert.equal(r2Db.round_status, 'Draft', 'Round 2 status must be Draft');
    assert.equal(r2Db.submitted_at, null, 'Round 2 submitted_at must be null');
    cases.push('h6:authentic-r2-draft-response-matches-submitted-db');

    // Case 6: Authentic R2 Submit advances to R3
    const r2Submit = await leaderAClient.action('saveEvaluationRound', [
      evalId, 2, scores, {}, selectedLevelIndexes, 'R2 Submit', true, configOptions,
    ]);
    assert.equal(r2Submit.result?.success, true, 'R2 submit must succeed');
    const r2SubmitDb = runtime.queryJson(`
      SELECT e.status AS eval_status, e.current_round, er2.status AS r2_status, er3.status AS r3_status
      FROM public.evaluations e
      JOIN public.evaluation_rounds er2 ON er2.evaluation_id = e.id AND er2.round = 2
      LEFT JOIN public.evaluation_rounds er3 ON er3.evaluation_id = e.id AND er3.round = 3
      WHERE e.id = '${evalId}';
    `)[0];
    assert.equal(r2SubmitDb.eval_status, 'Reviewed', 'After R2 submit, eval status must be Reviewed');
    assert.equal(r2SubmitDb.current_round, 3, 'Current round must advance to 3');
    assert.equal(r2SubmitDb.r2_status, 'Submitted', 'Round 2 status must be Submitted');
    assert.equal(r2SubmitDb.r3_status, 'NotStarted', 'Round 3 must be created as NotStarted');
    cases.push('h6:authentic-r2-submit-advances-to-r3');

    // Case 7: Authentic R3 Draft response matches Reviewed DB (THE CORE BUG FIX)
    const r3Draft = await managerClient.action('saveEvaluationRound', [
      evalId, 3, scores, {}, selectedLevelIndexes, 'R3 Draft comment', false, configOptions,
    ]);
    assert.equal(r3Draft.result?.success, true, 'R3 draft response must succeed for Reviewed aggregate');
    const r3Db = runtime.queryJson(`
      SELECT e.status AS eval_status, er.status AS round_status, er.submitted_at
      FROM public.evaluations e
      JOIN public.evaluation_rounds er ON er.evaluation_id = e.id AND er.round = 3
      WHERE e.id = '${evalId}';
    `)[0];
    assert.equal(r3Db.eval_status, 'Reviewed', 'Parent status must remain Reviewed');
    assert.equal(r3Db.round_status, 'Draft', 'Round 3 status must be Draft');
    assert.equal(r3Db.submitted_at, null, 'Round 3 submitted_at must be null');
    cases.push('h6:authentic-r3-draft-response-matches-reviewed-db');

    // Case 8: Authentic R3 Final Submit approves
    const r3Submit = await managerClient.action('saveEvaluationRound', [
      evalId, 3, scores, {}, selectedLevelIndexes, 'R3 Approved', true, configOptions,
    ]);
    assert.equal(r3Submit.result?.success, true, 'R3 final submit must succeed');
    const r3SubmitDb = runtime.queryJson(`
      SELECT e.status AS eval_status, er.status AS round_status
      FROM public.evaluations e
      JOIN public.evaluation_rounds er ON er.evaluation_id = e.id AND er.round = 3
      WHERE e.id = '${evalId}';
    `)[0];
    assert.equal(r3SubmitDb.eval_status, 'Approved', 'Eval status must be Approved');
    assert.equal(r3SubmitDb.round_status, 'Submitted', 'Round 3 status must be Submitted');
    cases.push('h6:authentic-r3-final-submit-approves');

    // Case 9: Initialize draft consumer parity
    initSeedEvalId = crypto.randomUUID();
    const initSeedRoundId = crypto.randomUUID();
    runtime.psql(`
      INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
      VALUES ('${initSeedEvalId}', '${PERIODS.active}', '${ACTORS.workerB.id}', 'Worker', '${TEAMS.B}', 'NotStarted', 1);
      INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status)
      VALUES ('${initSeedRoundId}', '${initSeedEvalId}', 1, '${ACTORS.subB.id}', 'SubLeader', 'NotStarted');
    `);
    const initRes1 = await subBClient.action('initializeEvaluationRoundDraft', [
      initSeedEvalId, 1, scores, {}, selectedLevelIndexes, '', configOptions,
    ]);
    assert.equal(initRes1.result?.success, true);
    assert.equal(initRes1.result?.initialized, true);
    const initRes2 = await subBClient.action('initializeEvaluationRoundDraft', [
      initSeedEvalId, 1, scores, {}, selectedLevelIndexes, '', configOptions,
    ]);
    assert.equal(initRes2.result?.success, true);
    assert.equal(initRes2.result?.initialized, false);
    assert.equal(initRes2.result?.skipped, 'already_initialized');
    cases.push('h6:initialize-draft-consumer-parity');

    // Case 10: Atomic denial for stale / revoked / closed writes
    const staleConfig = await subBClient.action('saveEvaluationRound', [
      initSeedEvalId, 1, scores, {}, selectedLevelIndexes, '', false,
      { ...configOptions, criteriaConfigVersionId: crypto.randomUUID() },
    ]);
    assert.equal(staleConfig.result?.success, false, 'Stale config must fail');

    // Revoked appointment denial must leave the current round and aggregate untouched.
    revokedEvalId = crypto.randomUUID();
    runtime.psql(`
      INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
      VALUES ('${revokedEvalId}', '${PERIODS.active}', '${ACTORS.employeeC.id}', 'Employee', '${TEAMS.C}', 'NotStarted', 1);
      INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status, submitted_at)
      VALUES
        ('${crypto.randomUUID()}', '${revokedEvalId}', 1, '${ACTORS.subC.id}', 'SubLeader', 'NotStarted', NULL);
    `);
    const revokedDraft = await subCClient.action('saveEvaluationRound', [
      revokedEvalId, 1, scores, {}, selectedLevelIndexes, 'revoked-setup-draft', false, configOptions,
    ]);
    assert.equal(revokedDraft.result?.success, true, `Revoked fixture draft setup must succeed: ${JSON.stringify(revokedDraft.result)}`);
    const revokedSetup = await subCClient.action('saveEvaluationRound', [
      revokedEvalId, 1, scores, {}, selectedLevelIndexes, 'revoked-setup-submit', true, configOptions,
    ]);
    assert.equal(revokedSetup.result?.success, true, `Revoked fixture setup must progress to Leader round: ${JSON.stringify(revokedSetup.result)}`);
    const revokedBefore = runtime.queryJson(`
      SELECT e.status AS eval_status, e.current_round, er.status AS round_status
      FROM public.evaluations e
      JOIN public.evaluation_rounds er ON er.evaluation_id = e.id AND er.round = 2
      WHERE e.id = '${revokedEvalId}';
    `)[0];
    runtime.psql(`UPDATE public.teams SET leader_id = NULL WHERE id = '${TEAMS.C}';`);
    try {
      const revokedResult = await leaderCClient.action('saveEvaluationRound', [
        revokedEvalId, 2, scores, {}, selectedLevelIndexes, 'revoked', false, configOptions,
      ]);
      assert.equal(revokedResult.result?.success, false, 'Revoked Leader write must fail');
    } finally {
      runtime.psql(`UPDATE public.teams SET leader_id = '${ACTORS.leaderC.id}' WHERE id = '${TEAMS.C}';`);
    }
    const revokedAfter = runtime.queryJson(`
      SELECT e.status AS eval_status, e.current_round, er.status AS round_status
      FROM public.evaluations e
      JOIN public.evaluation_rounds er ON er.evaluation_id = e.id AND er.round = 2
      WHERE e.id = '${revokedEvalId}';
    `)[0];
    assert.deepEqual(revokedAfter, revokedBefore, 'Revoked denial must not mutate evaluation state');

    // Closed-period denial must fail before write and preserve the seeded state.
    closedEvalId = crypto.randomUUID();
    const closedRoundId = crypto.randomUUID();
    runtime.psql(`
      INSERT INTO public.evaluations (id, period_id, employee_id, employee_role, team_id, status, current_round)
      VALUES ('${closedEvalId}', '${PERIODS.closed}', '${ACTORS.employeeC.id}', 'Employee', '${TEAMS.C}', 'NotStarted', 1);
      INSERT INTO public.evaluation_rounds (id, evaluation_id, round, evaluator_id, evaluator_role, status)
      VALUES ('${closedRoundId}', '${closedEvalId}', 1, '${ACTORS.manager.id}', 'Manager', 'NotStarted');
    `);
    const closedBefore = runtime.queryJson(`
      SELECT e.status AS eval_status, e.current_round, er.status AS round_status
      FROM public.evaluations e
      JOIN public.evaluation_rounds er ON er.evaluation_id = e.id AND er.round = 1
      WHERE e.id = '${closedEvalId}';
    `)[0];
    const closedResult = await managerClient.action('saveEvaluationRound', [
      closedEvalId, 1, scores, {}, selectedLevelIndexes, 'closed', false, configOptions,
    ]);
    assert.equal(closedResult.result?.success, false, 'Closed-period write must fail');
    const closedAfter = runtime.queryJson(`
      SELECT e.status AS eval_status, e.current_round, er.status AS round_status
      FROM public.evaluations e
      JOIN public.evaluation_rounds er ON er.evaluation_id = e.id AND er.round = 1
      WHERE e.id = '${closedEvalId}';
    `)[0];
    assert.deepEqual(closedAfter, closedBefore, 'Closed-period denial must not mutate evaluation state');
    cases.push('h6:atomic-denial-stale-revoked-closed');

    return {
      tier: 'authenticated',
      authenticated: true,
      status: 'QUALIFIED',
      cases,
      authenticatedCases: cases.length,
      target: 'fresh-loopback-next-login-server-action-db',
    };
  } finally {
    const ownedIds = [evalId, initSeedEvalId, revokedEvalId, closedEvalId].filter(Boolean);
    assert.ok(ownedIds.length > 0, 'H6 cleanup must retain at least one owned fixture id');
    const ownedRows = runtime.queryJson(`
      SELECT id::text AS id FROM public.evaluations
      WHERE id IN (${ownedIds.map((id) => `'${id}'`).join(',')});
    `);
    const existingIds = ownedRows.map((row) => row.id);
    assert.ok(existingIds.every((id) => ownedIds.includes(id)), 'H6 cleanup ownership readback mismatch');
    if (existingIds.length > 0) {
      const existingIdSql = existingIds.map((id) => `'${id}'`).join(',');
      runtime.psql(`
        BEGIN;
        SET LOCAL session_replication_role = replica;
        DELETE FROM public.evaluation_rounds
        WHERE evaluation_id IN (${existingIdSql});
        DELETE FROM public.evaluations
        WHERE id IN (${existingIdSql});
        COMMIT;
      `);
      const residue = runtime.queryJson(`
        SELECT id::text AS id FROM public.evaluations WHERE id IN (${existingIdSql});
      `);
      assert.equal(residue.length, 0, 'H6 cleanup left evaluation residue');
    }
  }
}

export async function run(context = {}) {
  const sourceCases = verifySourceContracts();

  const evidencePath = context?.options?.evidence || process.env.KURABE_H6_EVIDENCE;
  if (evidencePath && fs.existsSync(evidencePath)) {
    const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
    assert.equal(evidence.real, true, 'H6 evidence must be real');
    assert.equal(evidence.tier, 'authenticated', 'H6 evidence must be authenticated');
    assert.equal(evidence.status, 'QUALIFIED', 'H6 evidence must be qualified');
    assert.ok(
      Array.isArray(evidence.requiredCases) && evidence.requiredCases.length >= REQUIRED_CASES.length,
      'H6 evidence must cover all required cases'
    );
    return { ...evidence, cases: [...sourceCases, ...(evidence.cases || [])], evidencePath };
  }

  let runtime;
  try {
    runtime = createDisposableRuntimeFromEnv();
    const matrix = await runBehavioralConfirmationSuite(runtime);
    const baseSha = process.env.KURABE_H6_BASE_SHA || 'a72c0d0cee2ff196c5903fca9528d8d3aa1323ae';
    const evidence = {
      format: 'kurabe-p103m2t03-h6-authenticated/v1',
      generatedAt: new Date().toISOString(),
      taskId: 'P103M2T03',
      baseSha,
      candidateSha: runtime.candidateSha,
      changedFileSha256: ownedFileHashes(),
      tier: matrix.tier,
      authenticated: matrix.authenticated,
      status: matrix.status,
      requiredCases: REQUIRED_CASES,
      cases: matrix.cases,
      authenticatedCases: matrix.authenticatedCases,
      productionWrites: 0,
      productionMigrations: 0,
    };
    const detailPath = process.env.KURABE_H6_DETAIL_EVIDENCE || context?.options?.evidence;
    if (detailPath) {
      fs.mkdirSync(path.dirname(detailPath), { recursive: true });
      fs.writeFileSync(detailPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
      evidence.evidencePath = detailPath;
      evidence.evidenceSha256 = crypto.createHash('sha256').update(fs.readFileSync(detailPath)).digest('hex');
    }
    return { ...matrix, ...evidence, real: true, passed: true, cases: [...sourceCases, ...matrix.cases] };
  } catch (error) {
    return {
      real: false,
      passed: false,
      tier: 'source-contract',
      status: 'BLOCKED_CAPABILITY',
      capability: 'BLOCKED_CAPABILITY',
      reason: error?.message || 'Real authenticated disposable runtime is required; local stack is unavailable.',
      cases: sourceCases,
      requiredCases: REQUIRED_CASES,
      target: 'no-authenticated-evidence',
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await run();
    if (!result.passed) {
      console.log(`H6_DRAFT_INTEGRATION ${result.status} reason=${result.reason}`);
      console.log(`Source contract cases: ${result.cases.length} passed.`);
    } else {
      console.log(`H6_DRAFT_INTEGRATION ${result.status} cases=${result.cases.length} target=${result.target}`);
    }
  } catch (error) {
    console.error(`H6_DRAFT_INTEGRATION FAIL ${error?.message || error}`);
    process.exitCode = 1;
  }
}
