import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const authContextPath = path.join(import.meta.dirname, '..', 'src', 'contexts', 'AuthContext.tsx');
const source = readFileSync(authContextPath, 'utf8');

// Static source-contract for the scoped-cache blink fix (P106M1T02):
// the 30s viewer-scope poll must never clear scoped caches before the server
// answer arrives; identity/scope-change clearing lives in the fingerprint-diff effect.

test('poll path never passes clearBeforeRender: true', () => {
  assert.equal(
    source.includes('clearBeforeRender: true'),
    false,
    'refreshViewerScope must not be called with clearBeforeRender: true from the poll (or anywhere else)',
  );
});

test('clearBeforeRender option itself stays on the interface/implementation', () => {
  const occurrences = source.split('clearBeforeRender').length - 1;
  assert.ok(occurrences >= 1, 'interface declaration of clearBeforeRender must remain');
  // Allowed: interface option + implementation destructuring/branching only.
  assert.ok(
    occurrences <= 4,
    `unexpected extra clearBeforeRender usages (found ${occurrences})`,
  );
});

test('maybeRefreshViewerScope calls refreshViewerScope with no argument object', () => {
  const match = source.match(/const maybeRefreshViewerScope[\s\S]{0,700}?}, \[refreshViewerScope\]\);/);
  assert.ok(match, 'maybeRefreshViewerScope callback not found');
  const body = match[0];
  assert.match(body, /void refreshViewerScope\(\);/);
  assert.doesNotMatch(body, /refreshViewerScope\(\s*\{/);
});

test('identity/scope-change clearing invariants remain intact', () => {
  for (const anchor of [
    'scopeFingerprint(',
    'scopeEpoch',
    'clearScopedQueries(',
    'queryClient.cancelQueries',
    'queryClient.removeQueries',
    'SCOPED_QUERY_FAMILIES',
  ]) {
    assert.ok(source.includes(anchor), `invariant anchor missing: ${anchor}`);
  }
});

test('SCOPED_QUERY_FAMILIES still covers the pages that must clear on identity change', () => {
  const familiesMatch = source.match(/const SCOPED_QUERY_FAMILIES = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(familiesMatch, 'SCOPED_QUERY_FAMILIES set not found');
  const families = familiesMatch[1];
  for (const family of ["'teams'", "'teams-page-data'", "'employees-page-data'"]) {
    assert.ok(families.includes(family), `family missing from set: ${family}`);
  }
});

test('background period-metadata convergence is storage/focus driven and epoch guarded', () => {
  // A second tab converges on the shared period cookie via the `storage` event.
  assert.match(source, /window\.addEventListener\('storage', onStorage\)/);
  assert.match(source, /event\.key !== null && event\.key !== 'selected_period_id'/);
  assert.match(source, /maybeRefreshPeriodMetadata\(true\)/);
  // The background path never clears caches before the answer arrives (no blink).
  const maybe = source.match(/const maybeRefreshPeriodMetadata[\s\S]*?\}, \[refreshPeriodMetadata\]\);/);
  assert.ok(maybe, 'maybeRefreshPeriodMetadata callback not found');
  assert.doesNotMatch(maybe[0], /clearBeforeRender/);
  // Same monotonic epoch guard as the mutation path.
  assert.match(source, /const requestEpoch = periodEpochRef\.current \+ 1;/);
  assert.match(source, /if \(requestEpoch !== periodEpochRef\.current\) return;/);
});

test('cross-tab/focus convergence revalidates RSC server props, never on ordinary poll ticks', () => {
  // The convergence path revalidates the app-router server-prop snapshot so a
  // second tab's RSC props do not stay stale until a manual navigation.
  assert.match(source, /import \{ useRouter \} from 'next\/navigation';/);
  assert.match(source, /const router = useRouter\(\);/);

  // Only the cross-tab/focus convergence callback opts into server-prop revalidation.
  const maybe = source.match(/const maybeRefreshPeriodMetadata[\s\S]*?\}, \[refreshPeriodMetadata\]\);/);
  assert.ok(maybe, 'maybeRefreshPeriodMetadata callback not found');
  assert.match(maybe[0], /void refreshPeriodMetadata\(undefined, \{ revalidateServerProps: true \}\);/);
  assert.equal(
    (source.match(/revalidateServerProps: true/g) || []).length,
    1,
    'server-prop revalidation must be requested by exactly the convergence path',
  );

  // router.refresh() is guarded by the convergence flag and the monotonic epoch.
  assert.match(source, /if \(revalidateServerProps\) router\.refresh\(\);/);
  const guardAt = source.indexOf('if (requestEpoch !== periodEpochRef.current) return;');
  const refreshAt = source.indexOf('if (revalidateServerProps) router.refresh();');
  assert.ok(guardAt >= 0 && refreshAt > guardAt, 'server-prop revalidation must sit behind the epoch guard');

  // The ordinary 30s poll tick must not invoke the period convergence or router.refresh.
  const tick = source.match(/window\.setInterval\([^;]*\);/);
  assert.ok(tick, 'poll interval not found');
  assert.doesNotMatch(tick[0], /maybeRefreshPeriodMetadata|refreshPeriodMetadata|router\.refresh/);

  // Plain callers (login here, plus the mutation/selection paths) do not request it.
  assert.match(source, /await refreshPeriodMetadata\(savedPeriodId \?\? undefined\);/);
});
