#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');

/**
 * Browser-facing source contract for the cache boundary. Authenticated
 * PostgreSQL/Next/Chrome qualification is intentionally owned by the later
 * integrated confirmation matrix; this suite does not claim that evidence.
 */
export async function run() {
  const auth = read('src/contexts/AuthContext.tsx');
  const hook = read('src/hooks/use-db.ts');
  const provider = read('src/providers/query-provider.tsx');
  const readAction = read('src/actions/read.ts');
  const cases = [];

  assert.match(readAction, /getViewerScopeAction/);
  assert.match(readAction, /scopeKey/);
  assert.match(readAction, /getLeaderTeamIds/);
  assert.match(auth, /viewerScope/);
  assert.match(auth, /scopeEpoch/);
  assert.match(hook, /viewerScope\?\.scopeKey/);
  cases.push('browser-query-identity-contains-server-authoritative-scope');

  assert.match(hook, /scopedKey\('evaluations', \[periodId\]/);
  assert.match(hook, /scopedKey\('evaluation-display', \[evaluationId, periodId, stableVersionIdentity\]/);
  assert.match(hook, /scopedKey\('evaluation-page-data', \[employeeId, periodId\]/);
  assert.match(hook, /scopedKey\('evaluation-compare-page-data', \[employeeId, periodId\]/);
  cases.push('period-evaluation-and-snapshot-version-identities-remain-separated');

  assert.match(auth, /queryClient\.cancelQueries\(\{ predicate: isScopedQuery \}\)/);
  assert.match(auth, /queryClient\.removeQueries\(\{ predicate: isScopedQuery \}\)/);
  assert.match(auth, /authGenerationRef/);
  assert.match(auth, /setViewerScope\(null\)/);
  cases.push('logout-scope-change-and-late-auth-completion-fence-old-data');

  assert.match(auth, /document\.visibilityState !== 'visible'/);
  assert.match(auth, /setInterval\(maybeRefreshViewerScope, 30_000\)/);
  assert.match(auth, /addEventListener\('focus'/);
  assert.match(auth, /addEventListener\('pageshow'/);
  assert.match(auth, /visibilitychange/);
  cases.push('focus-navigation-and-visible-tab-refresh-are-bounded');

  assert.match(provider, /query\.setState\(\{ data: undefined, dataUpdatedAt: 0 \}\)/);
  cases.push('failed-authorized-read-removes-last-good-sensitive-payload');

  return {
    real: true,
    passed: true,
    tier: 'source-contract',
    status: 'EXECUTED',
    authenticated: false,
    cases,
    target: 'browser-facing-scope-cache-boundary',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => console.log(`CACHE_CONFIRMATION ${result.status} cases=${result.cases.length} tier=${result.tier}`))
    .catch((error) => {
      console.error(`CACHE_CONFIRMATION FAIL ${error.message || error}`);
      process.exitCode = 1;
    });
}
