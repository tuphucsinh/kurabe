/**
 * P107M1T07 — Return/resubmit snapshots and resident period coherence
 * (N1/N2/N6/L5). Self-contained source/contract + fixture suite: no network, no
 * database, no node_modules. It asserts the landed lifecycle-coherence delta and
 * the frozen-close policy against the owned artifacts.
 *
 * Run: node --test tests/p107-lifecycle-coherence.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateFixture } from './fixtures/p107/lifecycle-coherence/acceptance.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

const MIGRATION = 'supabase/migrations/20261008000300_p107_lifecycle_coherence.sql';
const migration = read(MIGRATION);
const readAction = read('src/actions/read.ts');
const periodAction = read('src/actions/period.ts');
const auth = read('src/contexts/AuthContext.tsx');
const periodActions = read('src/components/dashboard/PeriodActions.tsx');
const periodModal = read('src/components/modals/PeriodModal.tsx');
const periodSelector = read('src/components/layout/PeriodSelector.tsx');
const periodsTab = read('src/components/settings/PeriodsTab.tsx');
const scopeLib = read('src/lib/evaluation-period-scope.ts');
const evalPage = read('src/app/evaluations/[id]/page.tsx');
const fixture = JSON.parse(read('tests/fixtures/p107/lifecycle-coherence/lifecycle-coherence.json'));

const fnChunk = (source, name) => {
  const marker = `export async function ${name}`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `expected to find ${marker}`);
  const nextExport = source.indexOf('export ', start + marker.length);
  return nextExport === -1 ? source.slice(start) : source.slice(start, nextExport);
};

const sqlFnChunk = (name) => {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
  const start = migration.indexOf(marker);
  assert.ok(start >= 0, `expected to find ${marker}`);
  const nextComment = migration.indexOf(`COMMENT ON FUNCTION public.${name}`, start + marker.length);
  assert.ok(nextComment > start, `expected a provenance comment for ${name}`);
  return migration.slice(start, nextComment);
};

test('fixture and candidate migration contract', () => {
  assert.equal(validateFixture(fixture), true);
  assert.ok(migration.includes('CANDIDATE ONLY — NOT APPLIED'), 'migration must be a candidate');
  const clean = migration.replace(/--.*$/gm, '').trim();
  assert.ok(clean.startsWith('BEGIN;'), 'migration must start with BEGIN;');
  assert.ok(clean.endsWith('COMMIT;'), 'migration must end with COMMIT;');
  assert.match(migration, /DO \$\$/i, 'migration must contain a preflight DO $$ block');
  assert.match(migration, /SECURITY DEFINER/i, 'redefined functions must remain SECURITY DEFINER');
  assert.match(migration, /SET search_path = public/i, 'redefined functions must pin search_path');
  assert.ok(migration.includes('kurabe:p107m1t07:candidate:v1:function:save_evaluation_round_transaction_active_only'));
  assert.ok(migration.includes('kurabe:p107m1t07:candidate:v1:function:return_evaluation_round_transaction'));
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.save_evaluation_round_transaction_active_only\([^)]*\) FROM PUBLIC, anon, authenticated;/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.save_evaluation_round_transaction_active_only\([^)]*\) TO service_role, postgres;/);
});

test('N2: resubmit reconciles a returned (NotStarted) next round instead of conflicting', () => {
  const save = sqlFnChunk('save_evaluation_round_transaction_active_only');
  // The reconcile UPDATE is strictly guarded to the mutable NotStarted next round.
  assert.match(
    save,
    /UPDATE public\.evaluation_rounds\s+SET criteria_config_version_id = v_effective_criteria_version_id,\s+grade_config_version_id = v_effective_grade_version_id\s+WHERE id = v_existing_next_round_id\s+AND status = 'NotStarted';/,
    'mutable next round must be reconciled under a status = NotStarted guard',
  );
  // The first conflict guard must NOT fire on a config-version difference alone.
  const guardStart = save.indexOf('IF v_existing_next_round_id IS NOT NULL THEN');
  const guardEnd = save.indexOf("RAISE EXCEPTION 'CONFLICTING_NEXT_ROUND: Round % already exists", guardStart);
  assert.ok(guardStart > 0 && guardEnd > guardStart, 'expected the next-round guard block');
  const guard = save.slice(guardStart, guardEnd);
  assert.match(guard, /v_existing_next_evaluator_id IS DISTINCT FROM p_next_evaluator_id/);
  assert.match(guard, /v_existing_next_evaluator_role IS DISTINCT FROM p_next_evaluator_role/);
  assert.match(guard, /v_existing_next_status IS DISTINCT FROM 'NotStarted'/);
  assert.doesNotMatch(guard, /criteria_config_version_id IS DISTINCT/, 'config-version difference alone must not be a hard conflict');
});

test('N2 negative control: genuine concurrent progress still fails closed', () => {
  const save = sqlFnChunk('save_evaluation_round_transaction_active_only');
  assert.match(save, /RAISE EXCEPTION 'CONFLICTING_NEXT_ROUND: Round % already exists with a different evaluator, status, or config version'/);
  assert.match(save, /RAISE EXCEPTION 'CONFLICTING_NEXT_ROUND: Round % changed while reconciling config version references'/);
});

test('N6: transition context is deleted on every successful save exit', () => {
  const save = sqlFnChunk('save_evaluation_round_transaction_active_only');
  // The main success path now cleans before its final RETURN NEXT.
  assert.match(
    save,
    /DELETE FROM public\.evaluation_transition_context WHERE context_key = v_transition_key;\s*\n\s*round_id := v_round_id;\s*\n\s*evaluation_id := p_evaluation_id;/,
    'main success path must clean its transition-context row before returning',
  );
  const deleteCount = (migration.match(/DELETE FROM public\.evaluation_transition_context WHERE context_key = v_transition_key;/g) || []).length;
  assert.ok(deleteCount >= 6, `expected every success exit to clean its row (found ${deleteCount})`);
});

test('return resets the mutable returned round version pins', () => {
  const ret = sqlFnChunk('return_evaluation_round_transaction');
  const reset = ret.indexOf("scores = '{}'::jsonb");
  assert.ok(reset > 0, 'expected the returned-round reset');
  const resetBlock = ret.slice(reset, reset + 600);
  assert.match(resetBlock, /status = 'NotStarted'/);
  assert.match(resetBlock, /criteria_config_version_id = NULL/);
  assert.match(resetBlock, /grade_config_version_id = NULL/);
  // Return still cleans its transition context.
  assert.match(ret, /DELETE FROM public\.evaluation_transition_context WHERE context_key = v_transition_key;/);
});

test('N1: one authenticated period-metadata refresh action', () => {
  assert.match(readAction, /export async function getPeriodMetadataAction\(\): Promise<PeriodMetadata>/);
  assert.match(readAction, /import \{ cookies \} from 'next\/headers'/);
  const meta = fnChunk(readAction, 'getPeriodMetadataAction');
  assert.match(meta, /requireAuth\(\)/, 'refresh must be authenticated');
  assert.match(meta, /selected_period_id/, 'refresh must reconcile the selected cookie');
  assert.match(meta, /activePeriod/);
  assert.match(meta, /periods/);
});

test('N1: epoch-protected refresh reconciles cookie/provider/props/scoped cache', () => {
  assert.match(auth, /refreshPeriodMetadata: \(preferredPeriodId\?: string\) => Promise<void>/);
  assert.match(auth, /periodEpoch: number/);
  // late-response guard: issue the next epoch and reject any non-newest response
  assert.match(auth, /periodEpochRef\.current \+ 1/);
  assert.match(auth, /requestEpoch !== periodEpochRef\.current/);
  assert.match(auth, /userRef\.current\?\.id !== activeUserId/);
  // reconciles cookie + provider state + server props + scoped cache
  assert.match(auth, /document\.cookie = `selected_period_id=\$\{target\.id\}/);
  assert.match(auth, /setAllPeriods\(periods\)/);
  assert.match(auth, /setCurrentPeriodState\(target\)/);
  assert.match(auth, /queryClient\.invalidateQueries\(\{ predicate: isPeriodScopedQuery \}\)/);
  assert.match(auth, /getPeriodMetadataAction/);
});

test('N1: create/close/delete/select/login share the refresh', () => {
  assert.match(auth, /await refreshPeriodMetadata/, 'login must use the shared refresh');
  assert.match(periodModal, /createEvaluationPeriod/);
  assert.match(periodActions, /createEvaluationPeriod|handlePeriodSuccess/);
  assert.match(periodActions, /closeEvaluationPeriod/);
  assert.match(periodActions, /deleteEvaluationPeriod/);
  assert.match(periodActions, /refreshPeriodMetadata/);
  // every period mutation/selection pairs the shared refresh with a server-prop refresh
  assert.match(periodActions, /refreshPeriodMetadata\([^)]*\);\s*\n\s*router\.refresh\(\);/);
  assert.match(periodSelector, /setCurrentPeriod\(period\);[\s\S]*router\.refresh\(\);/);
  assert.match(periodSelector, /refreshPeriodMetadata/);
  assert.match(periodsTab, /refreshPeriodMetadata/);
  assert.match(periodsTab, /router\.refresh\(\)/);
});

test('N1: cross-tab/focus convergence refreshes period metadata under the same epoch guard', () => {
  // A `storage` event on the shared period cookie converges a stale second tab.
  assert.match(auth, /window\.addEventListener\('storage', onStorage\)/);
  assert.match(auth, /event\.key !== null && event\.key !== 'selected_period_id'/);
  assert.match(auth, /maybeRefreshPeriodMetadata\(true\)/);
  assert.match(auth, /window\.removeEventListener\('storage', onStorage\)/);
  // focus / pageshow / visibilitychange also converge period metadata.
  assert.match(auth, /const onFocus = \(\) => \{[\s\S]*?maybeRefreshPeriodMetadata\(\);/);
  assert.match(auth, /const onPageShow = \(\) => \{[\s\S]*?maybeRefreshPeriodMetadata\(\);/);
  assert.match(auth, /const onVisibilityChange = \(\) => \{[\s\S]*?maybeRefreshPeriodMetadata\(\);/);
  // The background path reuses the SAME monotonic epoch guard and never clears before render.
  const maybe = auth.match(/const maybeRefreshPeriodMetadata[\s\S]*?\}, \[refreshPeriodMetadata\]\);/);
  assert.ok(maybe, 'maybeRefreshPeriodMetadata callback not found');
  assert.doesNotMatch(maybe[0], /clearBeforeRender/);
  assert.match(auth, /const requestEpoch = periodEpochRef\.current \+ 1;/);
  assert.match(auth, /if \(requestEpoch !== periodEpochRef\.current\) return;/);
  // Convergence-only server-prop revalidation, requested only by this path and
  // gated behind the same epoch guard.
  assert.match(auth, /void refreshPeriodMetadata\(undefined, \{ revalidateServerProps: true \}\);/);
  assert.match(auth, /if \(revalidateServerProps\) router\.refresh\(\);/);
});

test('N1: period selection awaits the shared refresh before router.refresh', () => {
  assert.match(
    periodSelector,
    /onClick=\{async \(\) => \{[\s\S]*?await refreshPeriodMetadata\(period\.id\);[\s\S]*?router\.refresh\(\);/,
  );
});

test('L5: closing with unfinished rounds is allowed with an explicit frozen label', () => {
  const close = fnChunk(periodAction, 'closeEvaluationPeriod');
  assert.match(close, /frozenIncomplete/);
  assert.match(close, /unfinishedCount/);
  assert.match(close, /neq\('status', 'Approved'\)/);
  // atomic-update contract preserved; no pre-read of the period row (TOCTOU)
  assert.match(close, /\.eq\('id', periodId\)/);
  assert.match(close, /\.eq\('status', 'active'\)/);
  assert.match(close, /data\.length !== 1/);
  assert.ok(!close.includes(".from('evaluation_periods').select"), 'must not pre-read the period row');
  // explicit frozen label in the UI, surfaced from the close result
  assert.match(periodsTab, /data-period-frozen/);
  assert.match(periodActions, /frozenIncomplete/);
});

test('L5: a failed unfinished-count read surfaces an unknown frozen state (no silent 0)', () => {
  const close = fnChunk(periodAction, 'closeEvaluationPeriod');
  assert.match(close, /countUnavailable/);
  // The count error must not be coerced to a clean 0 (that under-reports a frozen close).
  assert.doesNotMatch(close, /unfinishedCountError \? 0 :/);
  assert.match(close, /frozenIncomplete: countUnavailable \? undefined :/);
  assert.match(close, /unfinishedCount: unfinishedCount \?\? null/);
  // The UI surfaces the degraded state instead of a plain success toast.
  assert.match(periodActions, /countUnavailable/);
});

test('policy preserved: no Excluded state, no reopen, no clearBeforeRender, no global cache', () => {
  assert.ok(!/'Excluded'/.test(migration), 'no Excluded status value may be introduced');
  assert.ok(!/'reopen'/.test(migration), 'no reopen action may be introduced');
  assert.equal(auth.includes('clearBeforeRender: true'), false, 'background clearBeforeRender must not return');
  assert.doesNotMatch(auth, /new QueryClient\(/, 'must not introduce a global cache');
});

test('active-only default detail/compare stays; explicit historical read stays separate', () => {
  assert.match(scopeLib, /kind: 'ACTIVE'/);
  assert.doesNotMatch(scopeLib, /SELECTED|HISTORICAL/);
  assert.match(evalPage, /resolveActiveEvaluationPeriodScope/);
  assert.match(readAction, /export async function getEvaluationDisplayAction/);
});
