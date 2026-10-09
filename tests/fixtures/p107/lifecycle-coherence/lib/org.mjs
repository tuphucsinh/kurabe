// P107M1T07 owned helper: deterministic fixtures, real-UI login/logout, DB graph
// readbacks, authenticated Next action invocation, and the UI journey primitives
// used by the five SUBJECT-role flows. No fake auth, no product-code edits.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashString, psql, psqlJson, sqlLiteral, wait, waitFor } from './guard.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function makeRunSeed() {
  return process.env.KURABE_P107_RUN_SEED || crypto.randomUUID();
}

export function deriveId(seed, label, variantIndex = 0) {
  const hex = crypto.createHash('sha256').update(`${seed}:${label}:${variantIndex}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = '8';
  const value = `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
  if (!UUID_RE.test(value)) throw new Error(`invalid derived uuid for ${label}`);
  return value;
}

export function buildFixtureIds(seed) {
  return {
    seed,
    team: deriveId(seed, 'team'),
    manager: deriveId(seed, 'manager'),
    leader: deriveId(seed, 'leader'),
    subleader: deriveId(seed, 'subleader'),
    employee: deriveId(seed, 'employee'),
    worker: deriveId(seed, 'worker'),
    criteriaGroup: deriveId(seed, 'criteria-group'),
    criterion: deriveId(seed, 'criterion'),
    levelTop: deriveId(seed, 'level-top'),
    levelLow: deriveId(seed, 'level-low'),
  };
}

export const ACTOR_ROLES = {
  manager: 'Manager',
  leader: 'Leader',
  subleader: 'SubLeader',
  employee: 'Employee',
  worker: 'Worker',
};

export function codes(seed) {
  const tag = seed.replace(/[^0-9a-f]/gi, '').slice(0, 6).toUpperCase();
  return {
    manager: `P107T07-${tag}-MGR`,
    leader: `P107T07-${tag}-LDR`,
    subleader: `P107T07-${tag}-SUB`,
    employee: `P107T07-${tag}-EMP`,
    worker: `P107T07-${tag}-WRK`,
  };
}

export const LEVEL_TOP_LABEL = 'Tiêu chuẩn chính (top)';
export const LEVEL_TOP_POINTS = 170;
export const LEVEL_LOW_LABEL = 'Tiêu chuẩn thấp (low)';
export const LEVEL_LOW_POINTS = 40;

/** Seed the live base config BEFORE forward migrations (the versioning migrations
 *  snapshot these live grade/criteria rows; their preflight requires them to exist). */
export function seedPreMigrationConfig(target, ids) {
  psql(target, `
INSERT INTO public.grade_bands(role_group,grade,min_score,max_score,sort_order) VALUES
('leader','S',170,NULL,0),('leader','A',160,169,1),('leader','AB',130,159,2),('leader','B',100,129,3),('leader','C',70,99,4),('leader','D',NULL,69,5),
('staff','S',155,NULL,0),('staff','A',145,154,1),('staff','AB',115,144,2),('staff','B',90,114,3),('staff','C',60,89,4),('staff','D',NULL,59,5),
('worker','S',155,NULL,0),('worker','A',145,154,1),('worker','AB',115,144,2),('worker','B',90,114,3),('worker','C',60,89,4),('worker','D',NULL,59,5);
INSERT INTO public.criteria_groups(id,code,name,short_name,sort_order)
VALUES (${sqlLiteral(ids.criteriaGroup)},'A','P107T07 Confirmation','C',0);
INSERT INTO public.criteria(id,code,name,description,applies_to,weight,group_id,sort_order,default_level_index)
VALUES (${sqlLiteral(ids.criterion)},'A1','P107T07 Criterion','Synthetic','employee',100,${sqlLiteral(ids.criteriaGroup)},0,0);
INSERT INTO public.criterion_levels(id,criterion_id,points,label,description,sort_order)
VALUES
 (${sqlLiteral(ids.levelTop)},${sqlLiteral(ids.criterion)},${LEVEL_TOP_POINTS},${sqlLiteral(LEVEL_TOP_LABEL)},'Top level',0),
 (${sqlLiteral(ids.levelLow)},${sqlLiteral(ids.criterion)},${LEVEL_LOW_POINTS},${sqlLiteral(LEVEL_LOW_LABEL)},'Low level',1);
INSERT INTO public.criterion_audiences(criterion_id,audience)
VALUES (${sqlLiteral(ids.criterion)},'management'),(${sqlLiteral(ids.criterion)},'employee'),(${sqlLiteral(ids.criterion)},'worker');
`);
}

/** Post-migration: materialize the immutable active version snapshots from the live config. */
export function seedBaseConfig(target, ids) {
  // Materialize immutable snapshot version 1 from the live config.
  const grade = psqlJson(target, 'SELECT public.get_active_grade_config();');
  const criteria = psqlJson(target, 'SELECT public.get_active_criteria_config();');
  assert.ok(grade && grade.version_id, 'active grade config snapshot missing');
  assert.ok(criteria && criteria.version_id, 'active criteria config snapshot missing');
  return {
    gradeConfigVersionId: grade.version_id,
    gradeVersion: grade.version,
    criteriaConfigVersionId: criteria.version_id,
    criteriaVersion: criteria.version,
    criterionId: ids.criterion,
    topLevelLabel: LEVEL_TOP_LABEL,
    topLevelPoints: LEVEL_TOP_POINTS,
    lowLevelLabel: LEVEL_LOW_LABEL,
    lowLevelPoints: LEVEL_LOW_POINTS,
  };
}

/** Seed the single active Manager, appointed Leader, SubLeader and memberships. */
export function seedOrg(target, ids) {
  const c = codes(ids.seed);
  psql(target, `
BEGIN;
INSERT INTO public.teams(id,name,is_active,leader_id) VALUES (${sqlLiteral(ids.team)},'P107T07 Team',true,NULL);
INSERT INTO public.users(id,employee_code,name,role,team_id,join_date,is_active,password_hash,password_setup_required,gender)
VALUES
 (${sqlLiteral(ids.manager)},${sqlLiteral(c.manager)},'P107T07 Manager','Manager',NULL,'2026-01-01',true,NULL,false,'Other'),
 (${sqlLiteral(ids.leader)},${sqlLiteral(c.leader)},'P107T07 Leader','Leader',${sqlLiteral(ids.team)},'2026-01-01',true,NULL,false,'Other'),
 (${sqlLiteral(ids.subleader)},${sqlLiteral(c.subleader)},'P107T07 SubLeader','SubLeader',${sqlLiteral(ids.team)},'2026-01-01',true,NULL,false,'Other'),
 (${sqlLiteral(ids.employee)},${sqlLiteral(c.employee)},'P107T07 Employee','Employee',${sqlLiteral(ids.team)},'2026-01-01',true,NULL,false,'Other'),
 (${sqlLiteral(ids.worker)},${sqlLiteral(c.worker)},'P107T07 Worker','Worker',${sqlLiteral(ids.team)},'2026-01-01',true,NULL,false,'Other');
UPDATE public.teams SET leader_id=${sqlLiteral(ids.leader)} WHERE id=${sqlLiteral(ids.team)};
UPDATE public.users SET subleader_id=${sqlLiteral(ids.subleader)} WHERE id IN (${sqlLiteral(ids.employee)},${sqlLiteral(ids.worker)});
COMMIT;
`);
  const managers = Number(psql(target, `SELECT count(*) FROM public.users WHERE role='Manager' AND is_active;`));
  assert.equal(managers, 1, 'exactly one active Manager is required');
  const appointed = psql(target, `SELECT leader_id FROM public.teams WHERE id=${sqlLiteral(ids.team)};`);
  assert.equal(appointed, ids.leader, 'appointed Leader pointer must resolve');
  const subPointers = Number(psql(target, `SELECT count(*) FROM public.users WHERE subleader_id=${sqlLiteral(ids.subleader)};`));
  assert.equal(subPointers, 2, 'Employee and Worker must point at the SubLeader');
  return { managers, appointedLeaderId: appointed, subPointers, userCodes: c };
}

export function subjectId(ids, alias) {
  const map = { manager: ids.manager, leader: ids.leader, subleader: ids.subleader, employee: ids.employee, worker: ids.worker };
  const value = map[alias];
  if (!value) throw new Error(`unknown subject alias ${alias}`);
  return value;
}

// ---------------------------------------------------------------------------
// Real UI login / logout (opaque DB-backed session obtained through the app).
// ---------------------------------------------------------------------------
export async function loginAs(page, origin, employeeCode, { expectUserId = null } = {}) {
  const loginFormPresent = async () => (await page.evaluate("document.getElementById('employeeCode') !== null")) === true;

  const check = (landed) => {
    if (!expectUserId) return landed;
    if (landed.path === `/evaluations/${expectUserId}`) return landed;
    throw new Error(`login ${employeeCode} landed on ${landed.path}, expected /evaluations/${expectUserId}`);
  };

  const attempt = async () => {
    await page.goto(`${origin}/login`);
    // The app bounces an authenticated session away from /login, so a second actor
    // must drop the current session first — otherwise the harness would keep the
    // previous role's cookie and silently test the wrong viewer. Do it
    // DETERMINISTICALLY: clear cookies AND the local auth/period keys, then reload
    // /login, so no stale session can survive the actor switch (a logout-race here
    // previously landed the new actor on the previous user's evaluation).
    if (!(await loginFormPresent())) {
      await page.send('Network.clearBrowserCookies').catch(() => {});
      await page.evaluate('try { localStorage.clear(); } catch (e) { /* ignore */ }').catch(() => {});
      await page.goto(`${origin}/login`);
      if (!(await loginFormPresent())) throw new Error('login form unreachable after session clear');
    }
    await page.waitFor("document.getElementById('employeeCode') !== null", { timeout: 30_000, label: 'login form' });
    await page.fill('#employeeCode', employeeCode);
    // The optional-password contract allows a no-password account to sign in with the
    // code alone, so assert emptiness only while the field is actually rendered.
    const hasPassword = (await page.evaluate("document.getElementById('password') !== null")) === true;
    if (hasPassword) {
      const passwordFilled = await page.fill('#password', '');
      assert.equal(passwordFilled, '', 'optional password field must remain empty for legacy account');
    }
    await page.submit('form');
    // Wait for the login form to actually leave before accepting a landing path:
    // the previous actor's authenticated route can still be the current path for a
    // moment, and an early match would falsely report the wrong viewer's landing.
    await page.waitFor("document.getElementById('employeeCode') === null", { timeout: 40_000, label: `login submitted ${employeeCode}` }).catch(() => {});
    return waitFor(async () => {
      const state = await page.evaluate("({ path: location.pathname, text: document.body ? document.body.innerText : '' })");
      return state.path === '/dashboard' || /^\/evaluations\/[0-9a-f-]{36}$/i.test(state.path) ? state : false;
    }, { timeout: 40_000, label: `login ${employeeCode}` });
  };

  try {
    const landed = check(await attempt());
    return { ...landed, attempts: 1 };
  } catch (error) {
    // A stale session can bounce /login before the submit lands, or the landing can
    // briefly reflect the previous actor. Retry once from a clean cookie jar so the
    // actor switch is deterministic; if the second attempt still lands on the wrong
    // viewer, surface the exact mismatch instead of silently testing the wrong user.
    await page.send('Network.clearBrowserCookies').catch(() => {});
    const landed = check(await attempt());
    return { ...landed, attempts: 2, firstAttemptError: String(error?.message || error).slice(0, 200) };
  }
}

export async function logoutViaUi(page) {
  const onLoginForm = async () => (await page.evaluate("location.pathname === '/login' && document.getElementById('employeeCode') !== null")) === true;
  // Click the app's own logout control (found by text anywhere in the DOM, incl.
  // non-button elements); tolerate an already-logged-out page, and retry once if a
  // held/paused scoped read delayed the first navigation.
  try {
    await page.clickText('Đăng xuất');
  } catch (error) {
    if (!(await onLoginForm())) throw error;
  }
  try {
    await page.waitFor("location.pathname === '/login' && document.getElementById('employeeCode') !== null", { timeout: 30_000, label: 'logout' });
  } catch (error) {
    if (!(await onLoginForm())) {
      await page.clickText('Đăng xuất').catch(() => {});
      await page.waitFor("location.pathname === '/login' && document.getElementById('employeeCode') !== null", { timeout: 20_000, label: 'logout retry' });
    }
  }
  const cookies = await page.cookies();
  return { authCookiePresent: cookies.some((cookie) => cookie.name === 'auth_session') };
}

// ---------------------------------------------------------------------------
// DB graph readbacks (separate assertions live in the caller).
// ---------------------------------------------------------------------------
export function readEvaluation(target, evaluationId) {
  return psqlJson(target, `SELECT row_to_json(x)::text FROM (
    SELECT id, period_id, employee_id, employee_role, team_id, current_round, status,
           final_grade, final_score, return_note, updated_at
    FROM public.evaluations WHERE id = ${sqlLiteral(evaluationId)}
  ) x;`);
}

export function readRound(target, evaluationId, round) {
  return psqlJson(target, `SELECT row_to_json(x)::text FROM (
    SELECT id, evaluation_id, round, evaluator_id, evaluator_role, status, total_score, grade,
           submitted_at, criteria_config_version_id, grade_config_version_id, scores
    FROM public.evaluation_rounds WHERE evaluation_id = ${sqlLiteral(evaluationId)} AND round = ${round}
  ) x;`);
}

export function readRounds(target, evaluationId) {
  return psqlJson(target, `SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.round)::text,'[]') FROM (
    SELECT round, evaluator_id, evaluator_role, status, total_score, grade,
           criteria_config_version_id, grade_config_version_id, submitted_at
    FROM public.evaluation_rounds WHERE evaluation_id = ${sqlLiteral(evaluationId)}
  ) x;`);
}

/** Immutability digest over the committed evaluation + its rounds. */
export function evaluationDigest(target, evaluationId) {
  const text = psql(target, `
    SELECT COALESCE(string_agg(line, E'\\n' ORDER BY line), '') FROM (
      SELECT 'e|' || e.id || '|' || e.status || '|' || COALESCE(e.current_round::text,'') || '|' || COALESCE(e.final_grade,'') || '|' || COALESCE(e.return_note,'') AS line
      FROM public.evaluations e WHERE e.id = ${sqlLiteral(evaluationId)}
      UNION ALL
      SELECT 'r|' || r.round || '|' || r.status || '|' || COALESCE(r.evaluator_id::text,'') || '|' || r.evaluator_role || '|' || COALESCE(r.total_score::text,'') || '|' || COALESCE(r.grade,'') || '|' || r.scores::text || '|' || r.notes::text AS line
      FROM public.evaluation_rounds r WHERE r.evaluation_id = ${sqlLiteral(evaluationId)}
    ) s;`);
  return hashString(text);
}

/** Global policy-row counts; a DENY must leave these unchanged. */
export function policyCounts(target) {
  return psql(target, `
    SELECT (SELECT count(*) FROM public.evaluations)::text || '|' ||
           (SELECT count(*) FROM public.evaluation_rounds)::text || '|' ||
           (SELECT count(*) FROM public.users)::text || '|' ||
           (SELECT count(*) FROM public.evaluation_periods)::text || '|' ||
           (SELECT count(*) FROM public.evaluation_rounds WHERE status='Draft')::text;`);
}

export function listPeriods(target) {
  return psqlJson(target, `SELECT COALESCE(json_agg(row_to_json(x) ORDER BY x.year)::text,'[]') FROM (
    SELECT id, year, name, status, closed_at FROM public.evaluation_periods ORDER BY year
  ) x;`);
}

export function evaluationCountForPeriod(target, periodId) {
  return Number(psql(target, `SELECT count(*) FROM public.evaluations WHERE period_id=${sqlLiteral(periodId)};`));
}

/**
 * DB ground truth for a pinned criteria snapshot. The projection basis is
 * `authoritative` only when the round pins a version whose immutable rows are
 * fully materialized; `legacy_unknown` when no version is pinned; `unavailable`
 * when the pinned version has no complete snapshot. Asserting the observed
 * basis against this readback is a real semantic check, never a hard-coded
 * waiver.
 */
export function criteriaSnapshotReadback(target, versionId) {
  if (!versionId) return { versionExists: false, groupCount: 0, criterionCount: 0, levelCount: 0, audienceCount: 0, appliesTo: null };
  const row = psql(target, `SELECT
    (SELECT count(*) FROM public.criteria_config_versions WHERE id=${sqlLiteral(versionId)})::text || '|' ||
    (SELECT count(*) FROM public.criteria_group_versions WHERE version_id=${sqlLiteral(versionId)})::text || '|' ||
    (SELECT count(*) FROM public.criterion_versions WHERE version_id=${sqlLiteral(versionId)})::text || '|' ||
    (SELECT count(*) FROM public.criterion_level_versions WHERE version_id=${sqlLiteral(versionId)})::text || '|' ||
    (SELECT count(*) FROM public.criterion_audience_versions WHERE version_id=${sqlLiteral(versionId)})::text || '|' ||
    COALESCE((SELECT applies_to FROM public.criterion_versions WHERE version_id=${sqlLiteral(versionId)} LIMIT 1), '<null>');`);
  const [versionExists, groupCount, criterionCount, levelCount, audienceCount, appliesTo] = row.split('|');
  return {
    versionExists: Number(versionExists) > 0,
    groupCount: Number(groupCount), criterionCount: Number(criterionCount), levelCount: Number(levelCount),
    audienceCount: Number(audienceCount), appliesTo,
  };
}

/**
 * Direct PostgREST probe against the exact origin the Next server's
 * supabaseAdmin uses, so a proxy/schema-cache fault is distinguishable from a
 * genuinely incomplete snapshot. Returns status + a bounded redacted body.
 */
export async function restProbe(stack, path) {
  const url = `${stack.restUrl}/rest/v1/${path}`;
  try {
    const response = await fetch(url, { headers: { apikey: stack.serviceRoleKey, Authorization: `Bearer ${stack.serviceRoleKey}` } });
    const text = await response.text();
    return { url: path, status: response.status, ok: response.ok, body: text.slice(0, 300) };
  } catch (error) {
    return { url: path, status: 0, ok: false, body: String(error && error.message || error).slice(0, 200) };
  }
}

/** Expected ProjectionBasis implied by the DB readback for a pinned version. */
export function expectedProjectionBasis(pinnedVersion, snapshot) {
  if (!pinnedVersion) return 'legacy_unknown';
  const materialized = snapshot.versionExists && snapshot.groupCount > 0 && snapshot.criterionCount > 0
    && snapshot.levelCount > 0 && snapshot.audienceCount > 0;
  return materialized ? 'authoritative' : 'unavailable';
}

// ---------------------------------------------------------------------------
// Authenticated Next server-action invocation from the real browser session.
// ---------------------------------------------------------------------------
export function loadActionManifest(buildDir) {
  const candidates = [
    path.join(buildDir, 'server/server-reference-manifest.json'),
    path.join(buildDir, 'server/server-reference-manifest.js'),
  ];
  const jsonPath = candidates.find((candidate) => candidate.endsWith('.json') && fs.existsSync(candidate));
  assert.ok(jsonPath, `NEXT_ACTION_MANIFEST_MISSING under ${buildDir}`);
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return Object.entries(parsed.node || {}).map(([id, item]) => ({ id, ...item }));
}

function actionEndpoint(item) {
  const workers = Array.isArray(item.workers) ? item.workers : Object.keys(item.workers ?? {});
  // Prefer a REAL page worker. Next lists internal pages such as `app/_not-found/page`
  // first for many actions; POSTing a server action there returns the 404 page
  // (an RSC flight body), not the action result. `_`-prefixed segments are internal.
  const usable = workers.filter((entry) => !entry.includes('app/login/page') && !entry.split('/').some((segment) => segment.startsWith('_')));
  const worker = usable[0] ?? workers.find((entry) => !entry.includes('app/login/page')) ?? workers[0];
  assert.ok(worker, 'action worker not found');
  // Next route groups — `(group)` segments — never appear in the request URL, so
  // an endpoint built from the raw worker path 404s for any action that lives
  // under a route group.
  const path = worker
    .replace(/^app/, '')
    .replace(/\/page$/, '')
    .split('/')
    .filter((segment) => segment.length > 0 && !/^\(.*\)$/.test(segment))
    .join('/');
  return path.length > 0 ? `/${path}` : '/';
}

export function decodeFlight(text) {
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
    if (Array.isArray(value)) return value.map((entry) => decode(entry, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decode(entry, depth + 1)]));
    return value;
  }
  const root = chunks.get('0');
  return root && Object.hasOwn(root, 'a') ? decode(root.a) : null;
}

/**
 * Invoke an authenticated server action through the app origin using the
 * browser's session cookie. Returns { ok, status, value, errorKind } so callers
 * can keep HTTP business errors separate from generic transport errors.
 */
export async function browserAction(page, { manifest, name, args = [] }) {
  const item = manifest.find((entry) => entry.exportedName === name);
  assert.ok(item, `ACTION_NOT_COMPILED ${name}`);
  const endpoint = actionEndpoint(item);
  const expression = `(async () => {
    const response = await fetch(location.origin + ${JSON.stringify(endpoint)}, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8', Accept: 'text/x-component', 'Next-Action': ${JSON.stringify(item.id)}, Origin: location.origin },
      body: ${JSON.stringify(JSON.stringify(args))},
      credentials: 'include',
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  })()`;
  let result;
  try {
    result = await page.evaluate(expression);
  } catch (error) {
    const wrapped = new Error(`transport error invoking ${name}: ${error.message}`);
    wrapped.errorKind = 'TRANSPORT_ERROR';
    throw wrapped;
  }
  if (!result || !result.ok) {
    const error = new Error(`${name} HTTP ${result?.status}: ${String(result?.text || '').slice(0, 200)}`);
    error.errorKind = 'TRANSPORT_ERROR';
    throw error;
  }
  return { ok: true, status: result.status, value: decodeFlight(result.text), text: result.text };
}

// ---------------------------------------------------------------------------
// UI journey primitives for the evaluation page.
// ---------------------------------------------------------------------------
export async function openEvaluation(page, origin, subjectIdValue, { expectEdit = true } = {}) {
  const state = await page.goto(`${origin}/evaluations/${subjectIdValue}`);
  await page.waitFor(
    "document.body.innerText.toLowerCase().includes('đánh giá') || document.body.innerText.toLowerCase().includes('quyền truy cập')",
    { timeout: 30_000, label: `evaluation ${subjectIdValue} loaded` },
  );
  if (!expectEdit) return state;
  try {
    await page.waitFor(
      "document.body.innerText.toLowerCase().includes('gửi đánh giá') || document.body.innerText.toLowerCase().includes('lưu bản nháp') || document.body.innerText.toLowerCase().includes('đã nộp') || document.body.innerText.toLowerCase().includes('chỉ xem')",
      { timeout: 40_000, label: `evaluation ${subjectIdValue} editable` },
    );
  } catch (error) {
    const snapshot = await page.state().catch(() => null);
    const diag = typeof page.diagnostics === 'function' ? await page.diagnostics() : null;
    console.log('FAILURE_DIAG ' + JSON.stringify({ label: `evaluation ${subjectIdValue} editable`, snapshot: { path: snapshot?.path, text: (snapshot?.text || '').slice(0, 200) }, diag }));
    throw new Error(`${error.message} | path=${snapshot?.path} text=${JSON.stringify((snapshot?.text || '').slice(0, 400))} | diag=${JSON.stringify(diag).slice(0, 4000)}`);
  }
  return state;
}

export async function selectTopLevel(page, label = LEVEL_TOP_LABEL) {
  // Criteria load asynchronously (use-evaluation-page-state Layer 2). The editable
  // buttons appear before the criteria region is populated, so wait for the level
  // button to exist before clicking it instead of failing the whole flow.
  await waitFor(async () => {
    const present = await page.evaluate(
      `(() => [...document.querySelectorAll('button')].some((n) => (n.textContent || '').includes(${JSON.stringify(label)})))()`,
    );
    return present === true;
  }, { timeout: 30_000, interval: 300, label: `level button ${label}` });
  await page.clickLevelButton(label);
  await wait(250);
  const scoreText = await page.evaluate("document.body.innerText");
  return scoreText;
}

export async function saveDraftViaUi(page) {
  await page.clickText('Lưu bản nháp');
  await page.waitFor(
    "document.body.innerText.toLowerCase().includes('đã lưu bản nháp') || document.body.innerText.toLowerCase().includes('lỗi:')",
    { timeout: 30_000, label: 'draft saved' },
  );
  return page.evaluate("document.body.innerText");
}

export async function submitViaUi(page, { expectRedirect = false } = {}) {
  await page.clickText('Gửi Đánh giá');
  await page.waitFor(
    "document.body.innerText.toLowerCase().includes('đánh giá đã được gửi thành công') || document.body.innerText.toLowerCase().includes('lỗi:') || location.pathname === '/employees'",
    { timeout: 40_000, label: 'submit' },
  );
  if (expectRedirect) {
    await page.waitFor("location.pathname === '/employees'", { timeout: 20_000, label: 'submit redirect' }).catch(() => {});
  }
  return page.evaluate("document.body.innerText");
}

export async function returnRoundViaUi(page, reason) {
  await page.clickText('Trả lại');
  await page.waitFor("document.body.innerText.toLowerCase().includes('xác nhận trả lại')", { timeout: 20_000, label: 'return dialog' });
  await page.fill('textarea[placeholder="Lý do trả lại (bắt buộc)"]', reason);
  await page.clickText('Xác nhận trả lại');
  await page.waitFor(
    "document.body.innerText.toLowerCase().includes('đã trả lại đánh giá') || document.body.innerText.toLowerCase().includes('lỗi:')",
    { timeout: 30_000, label: 'return confirmed' },
  );
  return page.evaluate("document.body.innerText");
}

/** Click the confirm button inside the shared ConfirmDialog (role=dialog). */
export async function confirmDialogButton(page, label) {
  const encoded = JSON.stringify(label);
  return page.evaluate(`(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) throw new Error('confirm dialog not found');
    const button = [...dialog.querySelectorAll('button')].find((node) => node.textContent?.includes(${encoded}));
    if (!button) throw new Error('confirm button not found: ' + ${encoded});
    button.click();
    return true;
  })()`);
}

/**
 * Open /settings with the Manager "Kỳ đánh giá" tab active. The settings page
 * seeds its active tab from the auth state on first render, so a Manager session
 * that is still resolving its scope can land on the account tab; a real user
 * clicks the tab, so the harness does the same instead of assuming the default.
 */
export async function openPeriodsTab(page, origin) {
  await page.goto(`${origin}/settings`);
  await page.waitFor("document.body.innerText.toLowerCase().includes('cài đặt')", { timeout: 30_000, label: 'settings page' });
  const hasCard = async () => (await page.evaluate("document.body.innerText.toLowerCase().includes('thao tác kỳ đánh giá')")) === true;
  if (!(await hasCard())) {
    await page.clickText('Kỳ đánh giá');
    try {
      await page.waitFor("document.body.innerText.toLowerCase().includes('thao tác kỳ đánh giá')", { timeout: 25_000, label: 'periods tab' });
    } catch (error) {
      const snapshot = await page.state().catch(() => null);
      throw new Error(`${error.message} | path=${snapshot?.path} text=${JSON.stringify((snapshot?.text || '').slice(0, 500))}`);
    }
  }
  return page.state();
}

/** Create a period through the real settings UI; returns the created year marker. */
export async function createPeriodViaUi(page, origin, year) {
  await openPeriodsTab(page, origin);
  await page.clickText('Tạo kỳ mới');
  await page.waitFor("document.body.innerText.toLowerCase().includes('tạo kỳ đánh giá mới')", { timeout: 20_000, label: 'period modal' });
  await page.fill('form input[type="number"]', String(year));
  await page.clickText('Khởi tạo kỳ đánh giá');
  await page.waitFor(
    `document.body.innerText.toLowerCase().includes('kỳ ${year}') || document.body.innerText.toLowerCase().includes('lỗi')`,
    { timeout: 40_000, label: `create period ${year}` },
  );
  await wait(600);
  return page.evaluate("document.body.innerText");
}

export async function closePeriodViaUi(page, origin, { skipOpen = false } = {}) {
  if (!skipOpen) await openPeriodsTab(page, origin);
  await page.clickText('Đóng kỳ');
  await page.waitFor("document.querySelector('[role=\"dialog\"]') !== null", { timeout: 20_000, label: 'close confirm' });
  await confirmDialogButton(page, 'Đóng kỳ');
  await page.waitFor(
    "document.body.innerText.toLowerCase().includes('đã đóng kỳ') || document.body.innerText.toLowerCase().includes('lỗi')",
    { timeout: 40_000, label: 'close period' },
  );
  await wait(500);
  return page.evaluate("document.body.innerText");
}

export async function deletePeriodViaUi(page, origin) {
  await openPeriodsTab(page, origin);
  await page.clickText('Xóa kỳ');
  await page.waitFor("document.querySelector('[role=\"dialog\"]') !== null", { timeout: 20_000, label: 'delete confirm' });
  await confirmDialogButton(page, 'Xóa Vĩnh Viễn');
  await page.waitFor(
    "document.body.innerText.toLowerCase().includes('đã xóa') || document.body.innerText.toLowerCase().includes('không thể xóa') || document.body.innerText.toLowerCase().includes('lỗi')",
    { timeout: 40_000, label: 'delete period' },
  );
  await wait(400);
  return page.evaluate("document.body.innerText");
}

export { psql, psqlJson, sqlLiteral };

/**
 * Declared business-valid EMPTY/CLOSED disposable prerequisite.
 *
 * The real create-period action always seeds one evaluation per active roster
 * member, so an empty period cannot be produced through the app. To exercise the
 * successful delete-empty path we therefore insert ONE empty CLOSED period as an
 * explicit prerequisite (asserted: zero evaluations), then drive the real Manager
 * delete action/UI against it. No business round is ever deleted to manufacture
 * emptiness. Returns the id so the caller can assert the exact absent id.
 */
export function seedDeclaredEmptyClosedPeriod(target, { year, name = null }) {
  const id = crypto.randomUUID();
  psql(target, `INSERT INTO public.evaluation_periods(id, year, name, status, closed_at)
    VALUES (${sqlLiteral(id)}, ${year}, ${sqlLiteral(name ?? `Kỳ ${year}`)}, 'closed', now());`);
  const evals = Number(psql(target, `SELECT count(*) FROM public.evaluations WHERE period_id=${sqlLiteral(id)};`));
  assert.equal(evals, 0, 'declared empty prerequisite period must hold zero evaluations');
  return id;
}

/**
 * True when the PeriodsTab row for `Kỳ <year>` currently renders the
 * provider-selected marker. Row-scoped: only a container whose text carries a
 * SINGLE `Kỳ <year>` marker (i.e. the actual row, not a shared list ancestor)
 * is considered, so an outer list that happens to contain both this year and a
 * different selected row can never produce a false positive.
 */
export async function periodRowSelected(page, year) {
  return (await page.evaluate(`(() => {
    const marker = ${JSON.stringify(`Kỳ ${year}`)};
    // Row-scoped: a row is a container that carries this year AND a selection
    // control (its own 'Đang chọn' label or a 'Chọn kỳ' button). The row text
    // legitimately repeats the year (title + period.name), so no occurrence-count
    // constraint — the SMALLEST such container is the row, never the shared list.
    const rows = [...document.querySelectorAll('div')].filter((n) => {
      const text = n.textContent || '';
      if (!text.includes(marker)) return false;
      if (text.includes('Đang chọn')) return true;
      return [...n.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Chọn kỳ'));
    });
    rows.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    const row = rows[0];
    return row ? (row.textContent || '').includes('Đang chọn') : false;
  })()`)) === true;
}

/**
 * True when the PeriodsTab actually renders a ROW for `Kỳ <year>`. Matched on an
 * element whose trimmed text is EXACTLY the year marker, so a transient toast
 * like "Đã xóa kỳ 2094" or a shared list ancestor cannot fake existence.
 */
export async function periodRowExists(page, year) {
  return (await page.evaluate(`(() => {
    const marker = ${JSON.stringify(`Kỳ ${year}`)};
    return [...document.querySelectorAll('div,span')].some((n) => (n.textContent || '').trim() === marker);
  })()`)) === true;
}

/** Click the "Chọn kỳ" button in the PeriodsTab row for `Kỳ <year>` and wait until it is selected. */
export async function selectPeriodViaUi(page, origin, year) {
  await openPeriodsTab(page, origin);
  const marker = `Kỳ ${year}`;
  const outcome = await page.evaluate(`(() => {
    const marker = ${JSON.stringify(marker)};
    // Row-scoped (smallest container carrying this year + a selection control);
    // climbing ancestor levels let the FIRST row's button match the shared list
    // container that also mentions this year and clicked the wrong period.
    const rows = [...document.querySelectorAll('div')].filter((n) => {
      const text = n.textContent || '';
      if (!text.includes(marker)) return false;
      if (text.includes('Đang chọn')) return true;
      return [...n.querySelectorAll('button')].some((b) => (b.textContent || '').includes('Chọn kỳ'));
    });
    rows.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
    const row = rows[0];
    if (!row) return 'NO_ROW';
    if ((row.textContent || '').includes('Đang chọn')) return 'ALREADY_SELECTED';
    const button = [...row.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Chọn kỳ'));
    if (!button) return 'NO_BUTTON';
    button.click();
    return 'CLICKED';
  })()`);
  if (outcome !== 'CLICKED' && outcome !== 'ALREADY_SELECTED') {
    throw new Error(`select period ${year}: ${outcome}`);
  }
  await waitFor(async () => periodRowSelected(page, year), { timeout: 20_000, interval: 300, label: `select period ${year}` });
  return page.evaluate("document.body ? document.body.innerText : ''");
}

/**
 * Declared concurrency scratch fixture: one extra active Employee plus a fresh
 * NotStarted round-1 evaluation inside an existing ACTIVE period. Used only to
 * drive the real RPCs from two competing PostgreSQL connections. Retire (deactivate)
 * the user afterwards so the app's active roster is unaffected. Returns ids.
 */
export function seedConcurrencyScratch(target, { periodId, teamId, subleaderId, code }) {
  const userId = crypto.randomUUID();
  const evalId = crypto.randomUUID();
  const roundId = crypto.randomUUID();
  // Rounds must be INSERTED as NotStarted: guard_evaluation_round_mutations()
  // rejects any directly inserted progressed round ("P102M3T04_INVALID_ROUND").
  // A caller that then needs a Draft (to exercise a real submit) must advance it
  // through the real save RPC.
  psql(target, `BEGIN;
INSERT INTO public.users(id, employee_code, name, role, team_id, subleader_id, is_active, join_date, gender)
VALUES (${sqlLiteral(userId)}, ${sqlLiteral(code)}, ${sqlLiteral(`Scratch ${code}`)}, 'Employee', ${sqlLiteral(teamId)}, ${sqlLiteral(subleaderId)}, true, '2026-01-01', 'Other');
INSERT INTO public.evaluations(id, period_id, employee_id, employee_role, team_id, current_round, status, created_at, updated_at)
VALUES (${sqlLiteral(evalId)}, ${sqlLiteral(periodId)}, ${sqlLiteral(userId)}, 'Employee', ${sqlLiteral(teamId)}, 1, 'NotStarted', now(), now());
INSERT INTO public.evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, scores, notes, total_score, grade, status, created_at)
VALUES (${sqlLiteral(roundId)}, ${sqlLiteral(evalId)}, 1, ${sqlLiteral(subleaderId)}, 'SubLeader', '{}'::jsonb, '{}'::jsonb, 0, 'Pending', 'NotStarted', now());
COMMIT;`);
  return { userId, evalId, roundId };
}

/** As seedConcurrencyScratch but also creates its own ACTIVE period (only valid when no other period is Active). */
export function seedConcurrencyScratchPeriod(target, { year, teamId, subleaderId, code }) {
  const periodId = crypto.randomUUID();
  psql(target, `INSERT INTO public.evaluation_periods(id, year, name, status) VALUES (${sqlLiteral(periodId)}, ${year}, ${sqlLiteral(`Kỳ ${year}`)}, 'active');`);
  const scratch = seedConcurrencyScratch(target, { periodId, teamId, subleaderId, code });
  return { periodId, ...scratch };
}

/** Deactivate a declared scratch user so the app's active roster is unaffected. */
export function retireScratchUser(target, userId) {
  psql(target, `UPDATE public.users SET is_active = false WHERE id = ${sqlLiteral(userId)};`);
}
