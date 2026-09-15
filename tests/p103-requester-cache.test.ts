import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildViewerScopeKey } from '../src/types';

const rootDir = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

const user = {
  userId: 'leader-a',
  role: 'Leader' as const,
  primaryTeamId: 'team-primary',
};

const scopeKey = buildViewerScopeKey({
  ...user,
  leaderTeamIds: ['team-z', 'team-primary', 'team-a', 'team-z'],
});
const sortedScopeKey = buildViewerScopeKey({
  ...user,
  leaderTeamIds: ['team-a', 'team-z', 'team-primary'],
});
assert.equal(scopeKey, sortedScopeKey, 'scopeKey must be stable regardless of appointment query order');
assert.deepEqual(JSON.parse(scopeKey).leaderTeamIds, ['team-a', 'team-primary', 'team-z']);

const readAction = read('src/actions/read.ts');
assert.match(readAction, /export async function getViewerScopeAction\(\): Promise<ViewerScope \| null>/);
assert.match(readAction, /getLeaderTeamIds\(auth\.user\)/);
assert.match(readAction, /Array\.from\(new Set\(leaderTeamIds\)\)\.sort/);
assert.match(readAction, /buildViewerScopeKey\(/);
assert.doesNotMatch(readAction, /getViewerScopeAction\([^)]*scope|viewerScope[^)]*authorization/i);

const hook = read('src/hooks/use-db.ts');
const families = [
  'users', 'users-batch', 'user', 'team-users', 'employees-page-data',
  'teams', 'team', 'teams-page-data', 'periods', 'active-period',
  'evaluations', 'evaluation', 'evaluation-display', 'evaluation-page-data',
  'evaluation-compare-page-data', 'criteria',
];
for (const family of families) {
  assert.match(hook, new RegExp(`scopedKey\\('${family}'`), `${family} must carry the server scope identity`);
}
assert.match(hook, /viewerScope\?\.scopeKey \?\? null/);
assert.match(hook, /scopeEpoch/);
assert.match(hook, /periodId/);
assert.match(hook, /versionIdentity/);
assert.match(hook, /invalidateRequesterQueries/);
assert.match(hook, /hasRequesterScope/);
assert.match(hook, /enabled: [^\n]*viewerScope != null/);

const auth = read('src/contexts/AuthContext.tsx');
assert.match(auth, /getViewerScopeAction/);
assert.match(auth, /queryClient\.cancelQueries\(\{ predicate: isScopedQuery \}\)/);
assert.match(auth, /queryClient\.removeQueries\(\{ predicate: isScopedQuery \}\)/);
assert.match(auth, /evaluation-display/);
assert.match(auth, /addEventListener\('focus'/);
assert.match(auth, /addEventListener\('pageshow'/);
assert.match(auth, /visibilitychange/);
assert.match(auth, /setInterval\(maybeRefreshViewerScope, 30_000\)/);
assert.match(auth, /authGenerationRef/);
assert.doesNotMatch(auth, /getLeaderTeamIds/);

const queryProvider = read('src/providers/query-provider.tsx');
assert.match(queryProvider, /onError: \(error, query\)/);
assert.match(queryProvider, /query\.setState\(\{ data: undefined, dataUpdatedAt: 0 \}\)/);

console.log('P103M3T03 requester scope/cache contract PASS');
