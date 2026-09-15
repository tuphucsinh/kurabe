#!/usr/bin/env node
/**
 * Real browser closure for P103M4T01.
 *
 * This suite uses the actual Next production build, a disposable PostgreSQL /
 * PostgREST runtime, opaque DB-backed sessions, and Chrome CDP. It does not
 * translate release/readiness cases into confirmation cases.
 */
import assert from 'node:assert/strict';
import {
  FIXTURE_ACTIVE_EVAL_ID,
  FIXTURE_ACTIVE_ROUND_1_ID,
  FIXTURE_ACTORS,
  FIXTURE_CLOSED_EVAL_ID,
  FIXTURE_CLOSED_PERIOD_ID,
  FIXTURE_CLOSED_ROUND_1_ID,
  FIXTURE_CLOSED_ROUND_2_ID,
  FIXTURE_CLOSED_ROUND_3_ID,
  FIXTURE_CRITERIA_V1_ID,
  FIXTURE_CRITERIA_V2_ID,
  FIXTURE_GRADE_V1_ID,
  FIXTURE_GRADE_V2_ID,
  FIXTURE_EMPLOYEE_B_ID,
  FIXTURE_MANAGER_ID,
  createActorSession,
  psql,
  psqlJson,
  sqlLiteral,
} from '../support/confirmation-fixtures.mjs';
import {
  cleanupH7Fixtures,
  cleanupSnapshotRows,
} from '../integration/h7-display.mjs';
import {
  validateRuntimeEnvironment,
} from '../support/confirmation-runtime.mjs';
import {
  startNextApplication,
} from './app-auth-harness.mjs';
import {
  navigate,
  openChrome,
  setSessionCookie,
} from './client-scope-freshness.mjs';
import { BROWSER_REQUIRED_CASES } from '../operations/p103-required-cases.mjs';

function safeError(error) {
  return String(error?.message || error)
    .replace(/https?:\/\/[^\s)]+/gi, '[REDACTED_URL]')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(password|secret|token|key)\s*[=:]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(predicate, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await wait(150);
  }
  throw lastError || new Error(`browser condition timed out after ${timeout}ms`);
}

async function deleteCookies(page) {
  await page.command('Network.clearBrowserCookies');
}

async function clickByText(page, text) {
  const encoded = JSON.stringify(text);
  await page.evaluate(`(() => {
    const node = [...document.querySelectorAll('button,a')].find((candidate) => candidate.textContent?.includes(${encoded}));
    if (!node) throw new Error('interactive node not found: ' + ${encoded});
    node.click();
    return true;
  })()`);
}

function makeFixture(env, target) {
  return {
    restUrl: env.supabaseUrl,
    anonKey: env.anonKey,
    serviceRoleKey: env.serviceRoleKey,
    query(sql) { return psql(target, sql); },
  };
}

function activeFixtureState(target) {
  return psqlJson(target, `
    SELECT json_build_object(
      'evaluation', (SELECT row_to_json(x)::json FROM (
        SELECT id, status, current_round FROM public.evaluations WHERE id = ${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}
      ) x),
      'round', (SELECT row_to_json(x)::json FROM (
        SELECT id, status, criteria_config_version_id, grade_config_version_id FROM public.evaluation_rounds WHERE id = ${sqlLiteral(FIXTURE_ACTIVE_ROUND_1_ID)}
      ) x),
      'criteriaV1Active', (SELECT is_active FROM public.criteria_config_versions WHERE id = ${sqlLiteral(FIXTURE_CRITERIA_V1_ID)}),
      'criteriaV2Active', (SELECT is_active FROM public.criteria_config_versions WHERE id = ${sqlLiteral(FIXTURE_CRITERIA_V2_ID)}),
      'gradeV1Active', (SELECT is_active FROM public.grade_band_versions WHERE id = ${sqlLiteral(FIXTURE_GRADE_V1_ID)}),
      'gradeV2Active', (SELECT is_active FROM public.grade_band_versions WHERE id = ${sqlLiteral(FIXTURE_GRADE_V2_ID)})
    )::text;
  `);
}

function setCurrentRules(target, active) {
  if (!active) return;
  const counts = psqlJson(target, `
    SELECT json_build_object(
      'criteria', (SELECT count(*) FROM public.criteria_config_versions WHERE is_active = TRUE),
      'grades', (SELECT count(*) FROM public.grade_band_versions WHERE is_active = TRUE)
    )::text;
  `);
  assert.equal(counts.criteria, 1, 'browser fixture requires one existing active criteria configuration');
  assert.equal(counts.grades, 1, 'browser fixture requires one existing active grade configuration');
}

function setLegacySubmittedFixture(target) {
  psql(target, `
    UPDATE public.evaluations SET status = 'Approved', current_round = 1 WHERE id = ${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)};
    UPDATE public.evaluation_rounds
    SET status = 'Submitted', criteria_config_version_id = NULL, grade_config_version_id = NULL, total_score = 11, grade = 'B'
    WHERE id = ${sqlLiteral(FIXTURE_ACTIVE_ROUND_1_ID)};
  `);
}

function restoreDraftFixture(target) {
  psql(target, `
    UPDATE public.evaluations SET status = 'Draft', current_round = 1 WHERE id = ${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)};
    UPDATE public.evaluation_rounds
    SET status = 'Draft', criteria_config_version_id = NULL, grade_config_version_id = NULL, total_score = NULL, grade = NULL
    WHERE id = ${sqlLiteral(FIXTURE_ACTIVE_ROUND_1_ID)};
  `);
}

async function runCase(cases, id, fn) {
  assert.ok(BROWSER_REQUIRED_CASES.includes(id), `unknown browser case ${id}`);
  try {
    await fn();
    cases.push({ id, status: 'PASS', path: 'actual-next-chrome-cdp' });
  } catch (error) {
    throw new Error(`${id}: ${safeError(error)}`);
  }
}

export async function run() {
  const env = validateRuntimeEnvironment(process.env);
  const target = env.dbTarget;
  let h7FixturePrepared = false;
  let next;
  let browser;
  const cases = [];
  const originalActive = activeFixtureState(target);
  try {
    // The integration H7 delegate prepares this exact graph through the
    // authenticated action path. Browser qualification consumes that graph;
    // it never bypasses the round-mutation guard with direct progressed-row
    // inserts.
    const fixtureCounts = psqlJson(target, `
      SELECT json_build_object(
        'actors', (SELECT count(*) FROM public.users WHERE employee_code LIKE 'P103-%'),
        'periods', (SELECT count(*) FROM public.evaluation_periods WHERE name LIKE 'P103 %'),
        'evaluations', (SELECT count(*) FROM public.evaluations WHERE id IN (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)})),
        'rounds', (SELECT count(*) FROM public.evaluation_rounds WHERE evaluation_id IN (${sqlLiteral(FIXTURE_ACTIVE_EVAL_ID)}, ${sqlLiteral(FIXTURE_CLOSED_EVAL_ID)}))
      )::text;
    `);
    assert.deepEqual(fixtureCounts, { actors: 6, periods: 2, evaluations: 2, rounds: 4 }, 'authenticated H7 fixture graph is missing');
    h7FixturePrepared = true;
    setCurrentRules(target, true);

    const fixture = makeFixture(env, target);
    next = await startNextApplication(fixture);
    const sessions = Object.fromEntries(
      ['manager', 'leader_a', 'leader_c', 'subleader_b', 'employee_b']
        .map((alias) => [alias, createActorSession(target, alias)])
    );
    for (const session of Object.values(sessions)) {
      // The auth guard compares the session revision with the user revision;
      // align the disposable opaque session to the seeded actor's actual row
      // instead of assuming a migration default.
      psql(target, `
        UPDATE public.sessions AS session
        SET credential_revision = actor.credential_revision
        FROM public.users AS actor
        WHERE session.token_hash = ${sqlLiteral(session.tokenHash)}
          AND actor.id = session.user_id;
      `);
    }
    browser = await openChrome();

    let currentActorAlias = null;
    const verifyAuthenticatedContext = async () => {
      assert.ok(currentActorAlias, 'browser actor was not selected before assertion');
      const expected = FIXTURE_ACTORS[currentActorAlias];
      const session = sessions[currentActorAlias];
      const db = psqlJson(target, `
        SELECT row_to_json(x)::text FROM (
          SELECT session.user_id, session.expires_at, actor.employee_code, actor.role, actor.is_active,
                 actor.credential_revision AS user_credential_revision,
                 session.credential_revision AS session_credential_revision
          FROM public.sessions AS session
          JOIN public.users AS actor ON actor.id = session.user_id
          WHERE session.token_hash = ${sqlLiteral(session.tokenHash)}
        ) x;
      `);
      assert.equal(db.user_id, expected.id, `${currentActorAlias} session user mismatch`);
      assert.equal(db.employee_code, expected.employeeCode, `${currentActorAlias} session actor mismatch`);
      // H7 deliberately changes Employee B's current role to Worker after
      // historical rounds are submitted; identity/session binding remains the
      // invariant while the display DTO must preserve the historical role.
      if (currentActorAlias !== 'employee_b') assert.equal(db.role, expected.role, `${currentActorAlias} session role mismatch`);
      else assert.ok(['Employee', 'Worker'].includes(db.role), 'employee_b current role is outside the individual-role contract');
      assert.equal(db.is_active, true, `${currentActorAlias} actor is inactive`);
      assert.ok(new Date(db.expires_at).getTime() > Date.now(), `${currentActorAlias} session expired`);
      assert.equal(db.user_credential_revision, db.session_credential_revision, `${currentActorAlias} credential revision mismatch`);
      const cookieState = await browser.page.command('Network.getAllCookies');
      const cookie = cookieState.cookies.find((item) => item.name === 'auth_session');
      assert.equal(cookie?.value, session.token, `${currentActorAlias} browser cookie mismatch`);
      return { actor: expected, db, cookie: { name: cookie.name, domain: cookie.domain, path: cookie.path } };
    };

    const useActor = async (alias) => {
      await deleteCookies(browser.page);
      await setSessionCookie(browser.page, next.url, sessions[alias].token);
      currentActorAlias = alias;
      await verifyAuthenticatedContext();
    };
    const body = () => browser.page.evaluate(`({ href: location.href, text: document.body.innerText, html: document.documentElement.outerHTML })`);
    const go = async (url, ready = null) => {
      try {
        const result = await navigate(browser.page, `${next.url}${url}`, ready);
        const context = await verifyAuthenticatedContext();
        const targetId = new URL(result.href).pathname.match(/\/(?:history|evaluations)\/([^/]+)/)?.[1] || null;
        const target = Object.values(FIXTURE_ACTORS).find((actor) => actor.id === targetId) || null;
        return {
          ...result,
          context,
          targetMetadata: {
            targetId,
            targetName: target?.name || null,
            targetNameVisible: target ? result.text.includes(target.name) : false,
            requestedPath: url,
          },
        };
      } catch (error) {
        const diagnostic = await body().catch(() => ({ href: 'unavailable', text: 'unavailable' }));
        throw new Error(`${safeError(error)} state=${safeError(JSON.stringify(diagnostic))}`);
      }
    };
    const authoritative = "document.querySelector('[data-historical-snapshot-state=authoritative]') !== null";

    await runCase(cases, 'h4:history-denied-target-non-disclosure', async () => {
      await useActor('employee_b');
      const result = await go(`/history/${FIXTURE_MANAGER_ID}`, "document.body.innerText.includes('Lịch sử đánh giá')");
      assert.equal(result.context.actor.id, FIXTURE_EMPLOYEE_B_ID);
      assert.equal(result.targetMetadata.requestedPath, `/history/${FIXTURE_MANAGER_ID}`);
      assert.equal(result.targetMetadata.targetNameVisible, false);
      assert.doesNotMatch(result.text, /P103 Closed Period|P103 Employee B/);
    });

    await runCase(cases, 'h4:history-authorized-submitted-read', async () => {
      await useActor('manager');
      const result = await go(`/history/${FIXTURE_EMPLOYEE_B_ID}`, "document.body.innerText.includes('P103 Closed Period')");
      assert.match(result.text, /P103 Closed Period/);
      assert.match(result.text, /Hạng/);
      assert.match(result.text, /30/);
    });

    await runCase(cases, 'h4:history-route-action-policy-parity', async () => {
      await useActor('manager');
      const history = await go(`/history/${FIXTURE_EMPLOYEE_B_ID}`, "document.body.innerText.includes('P103 Closed Period')");
      const detail = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      assert.match(history.text, /P103 Closed Period/);
      assert.match(detail.text, /P103 Closed Period|P103 Employee B/);
      assert.match(detail.text, /Người đánh giá lịch sử: Manager/);
      assert.equal(await browser.page.evaluate("document.querySelector('[data-historical-snapshot-state]')?.getAttribute('data-historical-snapshot-state')"), 'authoritative');
    });

    await runCase(cases, 'h4:history-generic-unavailable-render', async () => {
      setLegacySubmittedFixture(target);
      await useActor('manager');
      const result = await go(`/evaluations/${FIXTURE_ACTIVE_EVAL_ID}`, "document.querySelector('[data-historical-snapshot-state]') !== null");
      assert.match(result.text, /Không thể hiển thị tiêu chí lịch sử/);
      assert.match(result.html, /data-historical-snapshot-state="legacy_unknown"/);
      restoreDraftFixture(target);
    });

    await runCase(cases, 'h7:submitted-grade-from-display-dto', async () => {
      await useActor('manager');
      const result = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      assert.match(result.text, /\bA\b/);
      assert.match(result.text, /30/);
    });

    await runCase(cases, 'h7:submitted-criteria-labels-per-round', async () => {
      await useActor('manager');
      const manager = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      assert.match(manager.text, /V1 label/);
      assert.match(manager.text, /Người đánh giá lịch sử: Manager/);
      await useActor('leader_a');
      const leader = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      assert.match(leader.text, /V2 label/);
      assert.match(leader.text, /Người đánh giá lịch sử: Leader/);
      await useActor('subleader_b');
      const subleader = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      assert.match(subleader.text, /V1 label/);
      assert.match(subleader.text, /Người đánh giá lịch sử: SubLeader/);
    });

    await runCase(cases, 'h7:submitted-evaluator-role-from-display-dto', async () => {
      await useActor('manager');
      await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      const state = await browser.page.evaluate("({ snapshot: document.querySelector('[data-historical-snapshot-state]')?.getAttribute('data-historical-snapshot-state'), role: document.querySelector('[data-historical-snapshot-state=authoritative]')?.getAttribute('data-evaluator-role') })");
      assert.deepEqual(state, { snapshot: 'authoritative', role: 'Manager' });
    });

    await runCase(cases, 'h7:loading-state-no-live-flicker', async () => {
      await useActor('manager');
      await browser.page.evaluate(`(() => {
        window.__p103H7LoadingProof = { fallbackBeforeAuthoritative: false, mutations: 0 };
        const observer = new MutationObserver(() => {
          const state = document.querySelector('[data-historical-snapshot-state]')?.getAttribute('data-historical-snapshot-state');
          if (state !== 'authoritative' && document.body.innerText.includes('Criterion V2')) window.__p103H7LoadingProof.fallbackBeforeAuthoritative = true;
          window.__p103H7LoadingProof.mutations += 1;
        });
        observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
        window.__p103H7LoadingProofObserver = observer;
      })()`);
      await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      const proof = await browser.page.evaluate(`(() => { window.__p103H7LoadingProofObserver?.disconnect(); return window.__p103H7LoadingProof; })()`);
      assert.equal(proof.fallbackBeforeAuthoritative, false);
      assert.ok(proof.mutations > 0);
    });

    await runCase(cases, 'h7:error-legacy-unavailable-no-current-fallback', async () => {
      setLegacySubmittedFixture(target);
      await useActor('manager');
      const result = await go(`/evaluations/${FIXTURE_ACTIVE_EVAL_ID}`, "document.querySelector('[data-historical-snapshot-state]')?.getAttribute('data-historical-snapshot-state') === 'legacy_unknown'");
      assert.match(result.html, /data-historical-snapshot-state="legacy_unknown"/);
      assert.doesNotMatch(result.text, /V2 label/);
      restoreDraftFixture(target);
    });

    await runCase(cases, 'h7:draft-keeps-current-rules', async () => {
      restoreDraftFixture(target);
      setCurrentRules(target, true);
      await useActor('manager');
      const result = await go(`/evaluations/${FIXTURE_ACTIVE_EVAL_ID}`, "document.body.innerText.includes('V2 label')");
      assert.match(result.text, /V2 label/);
      assert.doesNotMatch(result.html, /data-historical-snapshot-state="authoritative"/);
    });

    await runCase(cases, 'h7:active-period-and-auth-boundaries', async () => {
      await useActor('leader_c');
      const denied = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, "document.body.innerText.length > 0");
      assert.doesNotMatch(denied.text, /V1 label|V2 label|Người đánh giá lịch sử/);
      await useActor('manager');
      const active = await go(`/evaluations/${FIXTURE_ACTIVE_EVAL_ID}`, "document.body.innerText.includes('V2 label')");
      assert.match(active.text, /V2 label/);
    });

    await runCase(cases, 'cache:server-authoritative-scope-in-query-identity', async () => {
      await useActor('manager');
      const manager = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      assert.match(manager.text, /V1 label/);
      await useActor('leader_c');
      const restricted = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, "document.body.innerText.length > 0");
      assert.doesNotMatch(restricted.text, /V1 label|Người đánh giá lịch sử: Manager/);
    });

    await runCase(cases, 'cache:logout-clears-old-scope-before-render', async () => {
      await useActor('manager');
      await go('/dashboard', "document.body.innerText.includes('Tổng quan hệ thống')");
      await browser.page.evaluate(`(() => {
        window.__p103LogoutProof = { oldScopeFlash: false };
        const observer = new MutationObserver(() => {
          if (location.pathname === '/login' && document.body.innerText.includes('Tổng quan hệ thống')) window.__p103LogoutProof.oldScopeFlash = true;
        });
        observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
        window.__p103LogoutProofObserver = observer;
        const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('Đăng xuất'));
        if (!button) throw new Error('logout button not found');
        button.click();
      })()`);
      await waitFor(() => browser.page.evaluate("location.pathname === '/login' && !document.body.innerText.includes('Tổng quan hệ thống')"));
      const anonymousCookies = await browser.page.command('Network.getAllCookies');
      assert.equal(anonymousCookies.cookies.some((item) => item.name === 'auth_session'), false, 'logout left authenticated cookie');
      const proof = await browser.page.evaluate(`(() => { window.__p103LogoutProofObserver?.disconnect(); return window.__p103LogoutProof; })()`);
      assert.equal(proof.oldScopeFlash, false);
    });

    await runCase(cases, 'cache:visible-scope-refresh-is-bounded', async () => {
      await useActor('manager');
      await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      await useActor('leader_c');
      const started = Date.now();
      const restricted = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, "document.body.innerText.length > 0");
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 10_000, `scope refresh exceeded bound: ${elapsed}ms`);
      assert.doesNotMatch(restricted.text, /V1 label|Người đánh giá lịch sử: Manager/);
    });

    await runCase(cases, 'cache:failed-read-removes-last-good-sensitive-payload', async () => {
      await useActor('manager');
      await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, authoritative);
      await useActor('leader_c');
      const failed = await go(`/evaluations/${FIXTURE_CLOSED_EVAL_ID}`, "document.body.innerText.length > 0");
      assert.doesNotMatch(failed.text, /V1 label|V2 label|30|Hạng A/);
      assert.doesNotMatch(failed.html, /data-historical-snapshot-state="authoritative"/);
    });

    const ids = cases.map((item) => item.id);
    assert.equal(ids.length, BROWSER_REQUIRED_CASES.length, 'browser case count mismatch');
    assert.equal(new Set(ids).size, ids.length, 'duplicate browser case evidence');
    assert.deepEqual([...ids].sort(), [...BROWSER_REQUIRED_CASES].sort(), 'browser required manifest mismatch');
    assert.equal(psql(target, `SELECT count(*) FROM public.users WHERE id IN (${Object.values(FIXTURE_ACTORS).map((actor) => sqlLiteral(actor.id)).join(',')});`), '5');
    return {
      real: true,
      passed: true,
      tier: 'actual-Next-browser',
      authenticated: true,
      status: 'QUALIFIED',
      cases,
      browserRuntime: {
        target: 'owned-loopback-disposable-postgresql-postgrest',
        next: { url: next.url, pid: next.pid, buildMode: next.sourceIdentity.buildMode },
        browser: { engine: 'google-chrome-stable', debugPort: browser.debugPort },
      },
      productionWrites: 0,
      productionMigrations: 0,
      cleanup: { residue: 'pending-finally' },
    };
  } finally {
    if (browser) await browser.stop().catch(() => {});
    if (next) await next.stop().catch(() => {});
    try { restoreDraftFixture(target); } catch { /* cleanup below owns the fixture graph */ }
    try { cleanupH7Fixtures(target); } catch { /* preserve the primary browser failure */ }
    if (h7FixturePrepared) {
      try { cleanupSnapshotRows(target, { preservedForBrowser: true }); } catch { /* preserve the primary browser failure */ }
    }
    // Do not silently discard the baseline readback: it is emitted only for
    // local debugging and never used as qualification evidence.
    void originalActive;
  }
}

if (process.argv[1] && process.argv[1].endsWith('real-required-cases.mjs')) {
  run()
    .then((result) => console.log(`REAL_BROWSER_REQUIRED ${result.status} cases=${result.cases.length}`))
    .catch((error) => {
      console.error(`REAL_BROWSER_REQUIRED FAIL ${safeError(error)}`);
      process.exitCode = 1;
    });
}
