import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

// ============================================================================
// P110M1T05 — /teams must stop shipping full evaluation round payloads. The
// action reads the summary projection (no scores/notes/comment), keeps the
// per-part error contract and role scoping, and never loads evaluations when
// no period is selected.
// ============================================================================

const readPath = path.join(projectRoot, 'src/actions/read.ts');
const readSource = fs.readFileSync(readPath, 'utf8');

const readTranspiled = ts.transpileModule(readSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const S = {
  authUser: { id: 'mgr-1', role: 'Manager' },
  users: [],
  teams: [],
  evaluations: [],
  usersError: null,
  teamsError: null,
  evalsError: null,
  evaluationQueries: [],
};

function loadReadModule() {
  const customRequire = (id) => {
    if (id === 'server-only') return {};
    if (id === '@/types') return { buildViewerScopeKey: (...parts) => JSON.stringify(parts) };
    if (id === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
    if (id === 'next/cache') return { revalidatePath: () => {} };
    if (id === '@/lib/auth') {
      return {
        requireAuth: async () => ({ error: null, user: S.authUser }),
        requireRole: async () => ({ error: null, user: S.authUser }),
      };
    }
    if (id === '@/lib/supabase-admin') return { supabaseAdmin: {} };
    if (id === '@/lib/db/evaluations-admin') {
      return {
        getEvaluationsAdmin: async () => [],
        getEvaluationsByPeriodAdmin: async () => { throw new Error('full reader must not be used by /teams'); },
        getEvaluationSummariesAdmin: async () => [],
        // Real projection semantics: returns what the real summary reader returns.
        getEvaluationSummariesByPeriodAdmin: async (periodId, user) => {
          S.evaluationQueries.push({ periodId, user });
          if (S.evalsError) throw new Error(S.evalsError);
          return S.evaluations;
        },
        getEvaluationSummariesByEmployeeIdsAdmin: async () => [],
        getEvaluationByEmployeeAdmin: async () => null,
        getEvaluationByIdAdmin: async () => null,
        getPeriodsAdmin: async () => [],
        getActivePeriodAdmin: async () => null,
        getPeriodByIdAdmin: async () => null,
      };
    }
    if (id === '@/lib/db/users-admin') {
      return {
        getUsersAdmin: async () => { if (S.usersError) throw new Error(S.usersError); return S.users; },
        getUsersBatchAdmin: async () => ({ users: [], hasMore: false }),
        getUserByIdAdmin: async () => null,
        getUsersByTeamAdmin: async () => [],
      };
    }
    if (id === '@/lib/db/teams-admin') {
      return {
        getTeamsAdmin: async () => { if (S.teamsError) throw new Error(S.teamsError); return S.teams; },
        getTeamByIdAdmin: async () => null,
        getLeaderTeamIds: async () => [],
      };
    }
    if (id === '@/lib/db/criteria') return { getCriteriaForRole: async () => [], getAllCriteriaGroups: async () => [] };
    if (id === '@/lib/grade-bands') return { loadGradeBandsFromDb: async () => null, getGradeBandsSync: () => null };
    if (id === '@/lib/db/evaluation-history-admin') return { getEvaluationHistoryAdmin: async () => ({ target: null, entries: [] }) };
    if (id === '@/lib/db/evaluation-display-admin') return { getEvaluationDisplayAdmin: async () => null };
    if (id === '@/lib/evaluation-result-projection') {
      return {
        getEvaluationResultProjection: () => ({}),
        sanitizeEvaluationResultProjectionForView: (p) => p,
      };
    }
    return require(id);
  };
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', readTranspiled)(mod.exports, customRequire, mod);
  return mod.exports;
}

const { getTeamsPageDataAction } = loadReadModule();

const summaryEval = {
  id: 'ev-1', period_id: 'p1', employee_id: 'u1', employee_role: 'Employee',
  team_id: 't1', current_round: 2, status: 'Approved',
  evaluation_rounds: [{ id: 'r1', evaluation_id: 'ev-1', round: 1, status: 'Submitted', total_score: 10 }],
};

// --- 1. With a period: summaries returned, full reader untouched, scoping kept ---
{
  S.users = [{ id: 'u1', name: 'NV 1', teamId: 't1' }];
  S.teams = [{ id: 't1', name: 'Team 1' }];
  S.evaluations = [summaryEval];
  S.evaluationQueries = [];
  S.evalsError = null;

  const data = await getTeamsPageDataAction('p1');
  assert.equal(data.users.length, 1);
  assert.equal(data.teams.length, 1);
  assert.equal(data.evaluations.length, 1);
  assert.equal(data.usersError, null);
  assert.equal(data.teamsError, null);
  assert.equal(data.evalsError, null);
  assert.deepEqual(S.evaluationQueries, [{ periodId: 'p1', user: S.authUser }],
    'evaluation read goes through the scoped summary reader with the authorized user');
  assert.ok(!('scores' in data.evaluations[0]) && !('notes' in data.evaluations[0]),
    'summary rows carry no heavy round payloads');
}

// --- 2. Per-part error contract preserved on evaluations failure ---
{
  S.evalsError = 'summary read failed';
  const data = await getTeamsPageDataAction('p1');
  assert.match(data.evalsError || '', /summary read failed/);
  assert.equal(data.users.length, 1, 'users part still succeeds independently');
  assert.equal(data.evaluations.length, 0);
  S.evalsError = null;
}

// --- 3. No period selected: no evaluation read at all (no all-history scan) ---
{
  S.evaluationQueries = [];
  const data = await getTeamsPageDataAction();
  assert.equal(S.evaluationQueries.length, 0, 'zero-period branch must not read evaluations');
  assert.equal(data.evaluations.length, 0);
  assert.equal(data.evalsError, null);
}

// --- 4. Source contracts on the action chunk ---
const actionStart = readSource.indexOf('export async function getTeamsPageDataAction');
const actionEnd = readSource.indexOf('export type EvaluationPageData');
const actionChunk = readSource.slice(actionStart, actionEnd);
assert.ok(actionChunk.includes('getEvaluationSummariesByPeriodAdmin(periodId, auth.user)'),
  '/teams must read the summary projection');
assert.ok(!actionChunk.includes('getEvaluationsByPeriodAdmin'),
  '/teams must not call the full-payload reader');

// The shared full reader keeps no blanket limit (export/aggregation still reads complete data)
const adminSource = fs.readFileSync(path.join(projectRoot, 'src/lib/db/evaluations-admin.ts'), 'utf8');
const fullReaderChunk = adminSource.slice(
  adminSource.indexOf('export async function fetchEvaluationsForViewerAdmin'),
  adminSource.indexOf('export async function fetchEvaluationSummariesForViewerAdmin')
);
assert.ok(fullReaderChunk.includes('if (opts?.limit && opts.limit > 0)'),
  'full reader keeps the opt-in limit (no blanket cap)');

console.log('P110M1T05 teams summary projection: ALL PASS');
