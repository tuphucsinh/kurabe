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
