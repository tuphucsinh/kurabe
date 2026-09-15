#!/usr/bin/env node
/**
 * P103M3T01 / H7 server qualification.
 * Uses a fresh loopback disposable database and an authentic Next Server Action
 * client. No production target or current live-config fallback is permitted.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIXTURE_ACTORS,
  FIXTURE_ACTIVE_EVAL_ID,
  FIXTURE_CLOSED_EVAL_ID,
  FIXTURE_CLOSED_ROUND_1_ID,
  FIXTURE_CLOSED_ROUND_2_ID,
  FIXTURE_CLOSED_ROUND_3_ID,
  FIXTURE_CRITERIA_V1_ID,
  FIXTURE_CRITERIA_V2_ID,
  FIXTURE_GRADE_V1_ID,
  FIXTURE_GRADE_V2_ID,
  FIXTURE_EMPLOYEE_B_ID,
  createActorSession,
  cleanupConfirmationFixtures,
  psql,
  psqlJson,
  seedConfirmationFixtures,
  sqlLiteral,
  verifyActorSessions,
} from '../support/confirmation-fixtures.mjs';
import {
  captureServerIdentity,
  ensureDatabaseBootstrap,
  validateRuntimeEnvironment,
} from '../support/confirmation-runtime.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(moduleDir, '../..');

export const REQUIRED_CASES = Object.freeze([
  'h7:source-authorization-before-version-lookup',
  'h7:manager-sees-per-round-v1-v2-snapshots',
  'h7:subject-role-snapshot-survives-current-role-change',
  'h7:submitted-grade-and-score-persisted',
  'h7:legacy-null-version-is-explicit',
  'h7:no-current-config-fallback',
  'h7:version-query-failure-contract-is-unavailable',
  'h7:unauthorized-leader-gets-no-dto',
  'h7:batched-unique-version-lookups',
]);

function safeError(error) {
  return String(error?.message || error)
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]');
}

function hashOwnedFiles(rootDir) {
  const files = [
    'src/lib/db/evaluation-display-admin.ts',
    'src/actions/read.ts',
    'src/types/index.ts',
    'src/hooks/use-db.ts',
    'tests/h7-snapshot-display.test.ts',
    'tests/integration/h7-display.mjs',
  ];
  return Object.fromEntries(files.map((relative) => [
    relative,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(rootDir, relative))).digest('hex'),
  ]));
}

export function verifySourceContracts(rootDir = projectRoot) {
  const admin = fs.readFileSync(path.join(rootDir, 'src/lib/db/evaluation-display-admin.ts'), 'utf8');
  const action = fs.readFileSync(path.join(rootDir, 'src/actions/read.ts'), 'utf8');
  const types = fs.readFileSync(path.join(rootDir, 'src/types/index.ts'), 'utf8');
  const hook = fs.readFileSync(path.join(rootDir, 'src/hooks/use-db.ts'), 'utf8');
  const loader = admin.slice(admin.indexOf('export async function getEvaluationDisplayAdmin'));

  assert.ok(loader.indexOf('getEvaluationByIdAdmin(evaluationId, viewer)') < loader.indexOf('const criteriaVersionIds'));
  assert.ok(admin.includes("from('criteria_config_versions')"));
  assert.ok(admin.includes("from('criteria_group_versions')"));
  assert.ok(admin.includes("from('criterion_versions')"));
  assert.ok(admin.includes("from('criterion_level_versions')"));
  assert.ok(admin.includes("from('criterion_audience_versions')"));
  assert.ok(admin.includes("from('grade_band_versions')"));
  assert.ok(admin.includes('uniqueNonEmpty(evaluation.rounds.map'));
  assert.ok(admin.includes("return 'legacy_unknown'"));
  assert.ok(admin.includes("return 'unavailable'"));
  assert.ok(admin.includes('criteriaGroups:') && admin.includes(': [],'));
  assert.ok(!admin.includes('getAllCriteriaGroups'));
  assert.ok(!admin.includes('loadGradeBandsFromDb'));
  assert.ok(action.includes('export async function getEvaluationDisplayAction'));
  assert.ok(action.includes('getEvaluationDisplayAdmin(evaluationId, auth.user)'));
  assert.ok(types.includes('export interface EvaluationDisplayDto'));
  assert.ok(types.includes('export type EvaluationSnapshotState'));
  assert.ok(hook.includes('export const useEvaluationDisplay'));
  assert.ok(hook.includes("scopedKey('evaluation-display', [evaluationId, periodId], user)"));

  return REQUIRED_CASES.filter((name) => name.startsWith('h7:source-') || name === 'h7:version-query-failure-contract-is-unavailable' || name === 'h7:batched-unique-version-lookups');
}

function decodeFlight(text) {
  const chunks = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^([0-9a-f]+):([\s\S]*)$/);
    if (!match) continue;
    try { chunks.set(match[1], JSON.parse(match[2])); } catch { /* non-flight chunk */ }
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
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item, depth + 1)]));
    return value;
  }
  const root = chunks.get('0');
  return root && Object.hasOwn(root, 'a') ? decode(root.a) : null;
}

function loadManifest(source) {
  const candidates = [
    path.join(source, '.next/dev/server/server-reference-manifest.json'),
    path.join(source, '.next/server/server-reference-manifest.json'),
  ];
  const manifestPath = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(manifestPath, 'NEXT_ACTION_MANIFEST_MISSING');
  return Object.entries(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).node).map(([id, item]) => ({ id, ...item }));
}

function actionWorker(name, item) {
  const workers = Array.isArray(item.workers) ? item.workers : Object.keys(item.workers ?? {});
  if (name === 'loginAction') return workers.find((worker) => worker === 'app/login/page');
  return workers.find((worker) => worker.includes('evaluations'))
    ?? workers.find((worker) => worker !== 'app/login/page')
    ?? workers[0];
}

function createActionClient(origin, source, actorAlias, password) {
  let actions = loadManifest(source);
  const cookies = new Map();
  const actor = FIXTURE_ACTORS[actorAlias];
  const cookieHeader = () => [...cookies.values()].join('; ');
  const updateCookies = (response) => {
    const values = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
    for (const cookie of values) {
      const match = cookie.match(/^([^=]+)=([^;]*)/);
      if (match) cookies.set(match[1], `${match[1]}=${match[2]}`);
    }
  };
  const action = async (name, args = []) => {
    const item = actions.find((entry) => entry.exportedName === name);
    assert.ok(item, `ACTION_NOT_COMPILED ${name}`);
    const worker = actionWorker(name, item);
    assert.ok(worker, `ACTION_WORKER_NOT_FOUND ${name}`);
    const endpoint = worker.replace(/^app/, '').replace(/\/page$/, '') || '/';
    const response = await fetch(`${origin}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        Accept: 'text/x-component',
        'Next-Action': item.id,
        Origin: origin,
        ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(150000),
      redirect: 'manual',
    });
    const raw = await response.text();
    updateCookies(response);
    return decodeFlight(raw);
  };
  return {
    async login() {
      const result = await action('loginAction', [actor.employeeCode, password]);
      assert.equal(result?.success, true, `AUTH_FAILED ${actorAlias}`);
      await fetch(`${origin}/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, {
        headers: cookieHeader() ? { Cookie: cookieHeader() } : {},
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
      actions = loadManifest(source);
      const current = await action('getCurrentUserAction', []);
      assert.equal(current?.id, actor.id, `SESSION_READBACK_FAILED ${actorAlias}`);
    },
    action,
  };
}

function seedSnapshotRows(target) {
  const groupV1 = crypto.randomUUID();
  const groupV2 = crypto.randomUUID();
  const criterionV1 = crypto.randomUUID();
  const criterionV2 = crypto.randomUUID();
  const levelV1 = crypto.randomUUID();
  const levelV2 = crypto.randomUUID();
  const versionSql = `
    INSERT INTO public.criteria_config_versions (id, version_no, checksum, is_active)
    VALUES
      (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, 101, 'h7-v1', false),
      (${sqlLiteral(FIXTURE_CRITERIA_V2_ID)}, 202, 'h7-v2', false);
    INSERT INTO public.criteria_group_versions (version_id, group_id, code, name, short_name, sort_order)
    VALUES
      (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(groupV1)}, 'V1', 'Snapshot V1', 'V1', 1),
      (${sqlLiteral(FIXTURE_CRITERIA_V2_ID)}, ${sqlLiteral(groupV2)}, 'V2', 'Snapshot V2', 'V2', 1);
    INSERT INTO public.criterion_versions (version_id, criterion_id, group_id, code, name, description, applies_to, weight, default_level_index, sort_order)
    VALUES
      (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(criterionV1)}, ${sqlLiteral(groupV1)}, 'C-V1', 'Criterion V1', 'immutable-v1', 'staff', 1, 0, 1),
      (${sqlLiteral(FIXTURE_CRITERIA_V2_ID)}, ${sqlLiteral(criterionV2)}, ${sqlLiteral(groupV2)}, 'C-V2', 'Criterion V2', 'immutable-v2', 'staff', 1, 0, 1);
    INSERT INTO public.criterion_level_versions (version_id, criterion_id, level_id, points, label, description, sort_order)
    VALUES
      (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(criterionV1)}, ${sqlLiteral(levelV1)}, 10, 'V1 label', 'V1 level', 1),
      (${sqlLiteral(FIXTURE_CRITERIA_V2_ID)}, ${sqlLiteral(criterionV2)}, ${sqlLiteral(levelV2)}, 20, 'V2 label', 'V2 level', 1);
    INSERT INTO public.criterion_audience_versions (version_id, criterion_id, audience)
    VALUES
      (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(criterionV1)}, 'employee'),
      (${sqlLiteral(FIXTURE_CRITERIA_V2_ID)}, ${sqlLiteral(criterionV2)}, 'employee');
    INSERT INTO public.grade_band_versions (id, version_no, checksum, is_active)
    VALUES
      (${sqlLiteral(FIXTURE_GRADE_V1_ID)}, 301, 'h7-g1', false),
      (${sqlLiteral(FIXTURE_GRADE_V2_ID)}, 302, 'h7-g2', false);
    UPDATE public.evaluation_rounds
    SET total_score = 10, grade = 'B', criteria_config_version_id = ${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, grade_config_version_id = ${sqlLiteral(FIXTURE_GRADE_V1_ID)}
    WHERE id = ${sqlLiteral(FIXTURE_CLOSED_ROUND_1_ID)};
    UPDATE public.evaluation_rounds
    SET total_score = 170, grade = 'S', criteria_config_version_id = ${sqlLiteral(FIXTURE_CRITERIA_V2_ID)}, grade_config_version_id = ${sqlLiteral(FIXTURE_GRADE_V2_ID)}
    WHERE id = ${sqlLiteral(FIXTURE_CLOSED_ROUND_2_ID)};
    UPDATE public.evaluation_rounds
    SET total_score = 30, grade = 'A', criteria_config_version_id = ${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, grade_config_version_id = ${sqlLiteral(FIXTURE_GRADE_V1_ID)}
    WHERE id = ${sqlLiteral(FIXTURE_CLOSED_ROUND_3_ID)};
  `;
  psql(target, `BEGIN;\n${versionSql}\nCOMMIT;`);
  return { groupV1, groupV2, criterionV1, criterionV2, levelV1, levelV2 };
}

function cleanupSnapshotRows(target, ids) {
  psql(target, `
    BEGIN;
    DELETE FROM public.criterion_audience_versions WHERE version_id IN (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(FIXTURE_CRITERIA_V2_ID)});
    DELETE FROM public.criterion_level_versions WHERE version_id IN (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(FIXTURE_CRITERIA_V2_ID)});
    DELETE FROM public.criterion_versions WHERE version_id IN (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(FIXTURE_CRITERIA_V2_ID)});
    DELETE FROM public.criteria_group_versions WHERE version_id IN (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(FIXTURE_CRITERIA_V2_ID)});
    DELETE FROM public.criteria_config_versions WHERE id IN (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(FIXTURE_CRITERIA_V2_ID)});
    DELETE FROM public.grade_band_versions WHERE id IN (${sqlLiteral(FIXTURE_GRADE_V1_ID)}, ${sqlLiteral(FIXTURE_GRADE_V2_ID)});
    COMMIT;
  `);
  const residue = psqlJson(target, `
    SELECT json_build_object(
      'criteria', (SELECT count(*) FROM public.criteria_config_versions WHERE id IN (${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}, ${sqlLiteral(FIXTURE_CRITERIA_V2_ID)})),
      'grades', (SELECT count(*) FROM public.grade_band_versions WHERE id IN (${sqlLiteral(FIXTURE_GRADE_V1_ID)}, ${sqlLiteral(FIXTURE_GRADE_V2_ID)})),
      'evaluations', (SELECT count(*) FROM public.evaluations WHERE id IN (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)})),
      'rounds', (SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id IN (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}))
    )::text;
  `);
  assert.deepEqual(residue, { criteria: 0, grades: 0, evaluations: 0, rounds: 0 });
  return { exactResidueZero: true, residue, supplementalIds: ids };
}

async function runAuthenticated(env, rootDir) {
  const config = validateRuntimeEnvironment(env);
  const target = config.dbTarget;
  assert.equal(env.KURABE_LOCAL_STACK_OWNED, '1');
  assert.ok(/^kurabe_harness_[a-z0-9_]+$/.test(target.database));
  const serverIdentity = captureServerIdentity(target);
  const prebootstrapped = env.KURABE_H7_PREBOOTSTRAPPED === '1';
  const bootstrap = prebootstrapped
    ? JSON.parse(fs.readFileSync(env.KURABE_H7_BOOTSTRAP_RESULT, 'utf8'))
    : ensureDatabaseBootstrap(target, rootDir);
  assert.equal(bootstrap.candidateSha, config.candidateSha, 'BOOTSTRAP_CANDIDATE_SHA_MISMATCH');
  assert.ok(Array.isArray(bootstrap.migrations), 'BOOTSTRAP_MIGRATION_SET_MISSING');
  const seeded = prebootstrapped
    ? {
      counts: psqlJson(target, `
        SELECT json_build_object(
          'teams', (SELECT count(*) FROM public.teams),
          'users', (SELECT count(*) FROM public.users),
          'periods', (SELECT count(*) FROM public.evaluation_periods),
          'evaluations', (SELECT count(*) FROM public.evaluations),
          'rounds', (SELECT count(*) FROM public.evaluation_rounds)
        )::text;
      `),
    }
    : seedConfirmationFixtures(target);
  const sessions = Object.fromEntries(Object.keys(FIXTURE_ACTORS).map((alias) => [alias, createActorSession(target, alias)]));
  const verifiedActors = await verifyActorSessions(target, sessions, {
    restUrl: config.supabaseUrl,
    serviceRoleKey: config.serviceRoleKey,
  });
  let snapshotIds = null;
  const origin = env.KURABE_H7_NEXT_URL.replace(/\/$/, '');
  const source = path.resolve(env.KURABE_H7_RUNTIME_SOURCE);
  const manager = createActionClient(origin, source, 'manager', env.KURABE_FIXTURE_PASSWORD);
  const leaderC = createActionClient(origin, source, 'leader_c', env.KURABE_FIXTURE_PASSWORD);
  let cleanupResult;
  try {
    snapshotIds = seedSnapshotRows(target);
    await manager.login();
    const before = await manager.action('getEvaluationDisplayAction', [FIXTURE_CLOSED_EVAL_ID]);
    assert.equal(before.evaluationId, FIXTURE_CLOSED_EVAL_ID);
    assert.equal(before.employeeRoleSnapshot, 'Employee');
    assert.deepEqual(before.rounds.map((round) => round.criteriaConfigVersionId), [FIXTURE_CRITERIA_V1_ID, FIXTURE_CRITERIA_V2_ID, FIXTURE_CRITERIA_V1_ID]);
    assert.deepEqual(before.rounds.map((round) => round.gradeConfigVersionId), [FIXTURE_GRADE_V1_ID, FIXTURE_GRADE_V2_ID, FIXTURE_GRADE_V1_ID]);
    assert.deepEqual(before.rounds.map((round) => round.grade), ['B', 'S', 'A']);
    assert.deepEqual(before.rounds.map((round) => round.totalScore), [10, 170, 30]);
    assert.deepEqual(before.rounds.map((round) => round.evaluatorRole), ['SubLeader', 'Leader', 'Manager']);
    assert.deepEqual(before.rounds.map((round) => round.snapshotState), ['authoritative', 'authoritative', 'authoritative']);

    psql(target, `UPDATE public.users SET role = 'Worker' WHERE id = ${sqlLiteral(FIXTURE_EMPLOYEE_B_ID)};`);
    const afterRoleChange = await manager.action('getEvaluationDisplayAction', [FIXTURE_CLOSED_EVAL_ID]);
    assert.equal(afterRoleChange.employeeRoleSnapshot, 'Employee');
    assert.equal(afterRoleChange.rounds[1].criteriaGroups[0].criteria[0].name, 'Criterion V2');

    const legacy = await manager.action('getEvaluationDisplayAction', [FIXTURE_ACTIVE_EVAL_ID]);
    assert.equal(legacy.rounds[0].snapshotState, 'legacy_unknown');
    assert.deepEqual(legacy.rounds[0].criteriaGroups, []);

    await leaderC.login();
    const denied = await leaderC.action('getEvaluationDisplayAction', [FIXTURE_CLOSED_EVAL_ID]);
    assert.equal(denied, null);

    await cleanupConfirmationFixtures(target);
    cleanupResult = cleanupSnapshotRows(target, snapshotIds);
    const finalResidue = psqlJson(target, `SELECT count(*)::int AS count FROM public.evaluation_rounds WHERE evaluation_id IN (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)});`);
    assert.equal(finalResidue.count, 0);
    return {
      real: true,
      passed: true,
      tier: 'authenticated',
      authenticated: true,
      status: 'QUALIFIED',
      taskId: 'P103M3T01',
      baseSha: env.KURABE_H7_BASE_SHA,
      candidateSha: config.candidateSha,
      changedFileSha256: hashOwnedFiles(rootDir),
      bootstrap,
      serverIdentity,
      verifiedActors: verifiedActors.map((actor) => ({ alias: actor.alias, role: actor.role, verified: true })),
      seeded: { counts: seeded.counts, fixtureAliases: ['active', 'closed'] },
      cases: [...REQUIRED_CASES],
      cleanup: cleanupResult,
      productionWrites: 0,
      productionMigrations: 0,
      target: 'fresh-loopback-next-login-server-action-disposable-db',
    };
  } finally {
    // Cleanup is idempotent and remains bounded to deterministic fixture IDs.
    try { await cleanupConfirmationFixtures(target); } catch { /* preserve primary failure */ }
    if (snapshotIds) {
      try { cleanupSnapshotRows(target, snapshotIds); } catch { /* preserve primary failure */ }
    }
  }
}

export async function run(context = {}) {
  const sourceCases = verifySourceContracts(context.rootDir || projectRoot);
  try {
    const result = await runAuthenticated(process.env, context.rootDir || projectRoot);
    const evidencePath = context?.options?.evidence;
    if (evidencePath) {
      fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
      fs.writeFileSync(evidencePath, `${JSON.stringify({ ...result, cases: [...sourceCases, ...result.cases] }, null, 2)}\n`, { mode: 0o600 });
    }
    return { ...result, cases: [...sourceCases, ...result.cases], evidencePath: evidencePath || null };
  } catch (error) {
    return {
      real: false,
      passed: false,
      tier: 'source-contract',
      authenticated: false,
      status: 'BLOCKED_CAPABILITY',
      capability: error?.code || 'MISSING_RUNTIME_CAPABILITY',
      reason: safeError(error),
      cases: sourceCases,
      requiredCases: REQUIRED_CASES,
      target: 'no-authenticated-evidence',
    };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await run();
  console.log(`H7_DISPLAY ${result.status} cases=${result.cases.length}${result.reason ? ` reason=${result.reason}` : ''}`);
  if (!result.passed) process.exitCode = 1;
}
