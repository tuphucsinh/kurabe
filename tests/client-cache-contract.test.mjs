#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

const scopedFamilies = [
  'users', 'users-batch', 'user', 'team-users', 'employees-page-data',
  'teams', 'team', 'teams-page-data', 'periods', 'active-period',
  'evaluations', 'evaluation', 'evaluation-page-data',
  'evaluation-compare-page-data', 'criteria',
];

export async function run() {
  const hook = read('src/hooks/use-db.ts');
  const auth = read('src/contexts/AuthContext.tsx');
  const layout = read('src/app/layout.tsx');
  const callerSources = [
    'src/app/evaluations/[id]/EvaluationPageClient.tsx',
    'src/app/teams/[id]/page.tsx',
    'src/components/employees/EmployeesClient.tsx',
    'src/components/layout/Sidebar.tsx',
    'src/components/reports/BatchResultMessageModal.tsx',
    'src/app/login/page.tsx',
  ].map(read).join('\n');
  const dashboardDataLayer = read('src/components/dashboard/DashboardDataLayer.tsx');
  const reportsDataLayer = read('src/components/reports/ReportsDataLayer.tsx');
  const cases = [];

  assert.match(hook, /const requesterScope = \(requester\?: User \| null\): readonly unknown\[\] => \[/);
  assert.match(hook, /export const scopedKey =/);
  assert.match(hook, /requester\?\.id,/);
  assert.match(hook, /requester\?\.role,/);
  assert.match(hook, /requester\?\.teamId,/);
  assert.match(hook, /const scopedKey = \(family: string, params: readonly unknown\[\], requester\?: User \| null\)/);
  for (const family of scopedFamilies) {
    assert.match(hook, new RegExp(`scopedKey\\('${family}'`), `${family} must use requester-scoped keys`);
  }
  cases.push('all-sensitive-query-families-use-id-role-team-scope');

  assert.match(hook, /enabled: requester != null/);
  assert.match(hook, /enabled: user != null/);
  assert.match(hook, /enabled: !!id && user != null/);
  assert.doesNotMatch(hook, /queryKey:\s*\[(?:'users'|'teams'|'periods'|'active-period'|'criteria')\]/);
  cases.push('authenticated-requester-gating-prevents-anonymous-fetch');

  assert.match(hook, /predicate: \(\{ queryKey \}: \{ queryKey: readonly unknown\[\] \}\) => queryKey\[0\] === family && hasRequesterScope\(queryKey, requester\)/);
  assert.match(auth, /const SCOPED_QUERY_FAMILIES = new Set/);
  assert.match(auth, /queryClient\.cancelQueries\(\{ predicate: isScopedQuery \}\)/);
  assert.match(auth, /queryClient\.removeQueries\(\{ predicate: isScopedQuery \}\)/);
  assert.match(auth, /previousScope !== null && previousScope !== currentScope/);
  assert.match(layout, /<QueryProvider>\s*<AuthProvider>/s);
  cases.push('identity-change-cancels-and-removes-old-scope-cache');

  assert.match(dashboardDataLayer, /const reqIdRef = useRef\(0\)/);
  assert.ok(
    [...dashboardDataLayer.matchAll(/currentReqId !== reqIdRef\.current/g)].length >= 3,
    'dashboard data must ignore stale light/heavy responses'
  );
  assert.match(reportsDataLayer, /const activeReqRef = useRef\(0\)/);
  assert.ok(
    [...reportsDataLayer.matchAll(/activeReqRef\.current === currentReq/g)].length >= 3,
    'reports data must ignore stale responses and errors'
  );
  cases.push('late-responses-cannot-overwrite-newer-data-generation');

  const invalidations = [...hook.matchAll(/invalidateRequesterQueries\(queryClient, '([^']+)', requesterRef\.current\)/g)].map((match) => match[1]);
  assert.ok(invalidations.length >= 10, 'mutations must invalidate through requester-scoped predicate');
  assert.doesNotMatch(hook, /invalidateQueries\(\{\s*queryKey:\s*\[/s);
  cases.push('mutations-invalidate-only-the-active-requester-scope');

  const mutationBlocks = [...hook.matchAll(/mutationFn: async[\s\S]*?\n\s*\},\n\s*onSuccess:/g)].map((match) => match[0]);
  assert.ok(mutationBlocks.length >= 9, 'expected all write hooks to have explicit mutation lifecycle');
  for (const block of mutationBlocks) assert.match(block, /if \(![^\n]+\.success\) throw new Error/);
  cases.push('mutation-failures-are-raised-and-not-presented-as-success');

  assert.doesNotMatch(callerSources, /queryClient\.invalidateQueries\(\{\s*queryKey:\s*\[/s);
  assert.doesNotMatch(callerSources, /queryKey:\s*\[\s*['"]employee-batch['"]/s);
  assert.match(callerSources, /invalidateRequesterQueries\(/);
  assert.match(callerSources, /router\.replace\(/);
  cases.push('all-discovered-callers-use-active-requester-invalidation');

  assert.match(hook, /export const useTeamsPageData = \([\s\S]*?requester\?: User \| null/);
  assert.match(hook, /export const useEvaluationPageData = \([\s\S]*?user\?: User \| null/);
  assert.match(hook, /export const useEvaluationComparePageData = \([\s\S]*?user\?: User \| null/);
  cases.push('page-data-callers-have-explicit-requester-contract');

  assert.equal(cases.length, 8);
  return {
    real: true,
    passed: true,
    tier: 'source-contract',
    status: 'EXECUTED',
    authenticated: false,
    cases,
    target: 'local-query-cache-scope-contract',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((result) => console.log(`CLIENT_CACHE_CONTRACT PASS cases=${result.cases.length} target=${result.target}`))
    .catch((error) => {
      console.error(`CLIENT_CACHE_CONTRACT FAIL ${error.message}`);
      process.exitCode = 1;
    });
}
