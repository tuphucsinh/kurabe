// =============================================================================
// P107M1T05 — Complete atomic roster & history-safe personnel lifecycle
// =============================================================================
// Offline, self-contained node:test suite. No network, no database, no
// node_modules. It exercises:
//   * the REAL stable-pagination/manifest reader (src/lib/db/users-admin.ts),
//   * the REAL evaluator resolution + role-round flow
//     (src/lib/evaluator-resolver.ts, src/lib/evaluation-workflow.ts),
//   * the static source contracts of the landed P107M1T05 delta,
//   * the candidate migration contracts
//     (supabase/migrations/20261008000200_p107_roster_personnel.sql).
//
// Module loading mirrors tests/p107-read-authority.test.mjs: Node native
// TypeScript type-stripping executes the real .ts sources through a small ESM
// resolve hook that maps the '@/...' alias and stubs the type-only barrels and
// the privileged server client.
//
// Fixture: tests/fixtures/p107/roster-personnel/synthetic-1500.json
// =============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..');

const projectMarker = path.join('src', 'data', 'workflow.ts');
if (!fs.existsSync(path.join(process.cwd(), projectMarker)) && fs.existsSync(path.join(rootDir, projectMarker))) {
  process.chdir(rootDir);
}

function readSource(rel) {
  const filePath = path.join(rootDir, rel);
  assert.ok(fs.existsSync(filePath), `${rel} must exist`);
  return fs.readFileSync(filePath, 'utf8');
}

function readFixture(rel) {
  return JSON.parse(readSource(rel));
}

// --- Type barrel stubs (value-imported by the real modules, purely types) ----
const TYPES_STUB = [
  'export const Role = {};',
  'export const User = {};',
  'export const Database = {};',
  'export const IdManifest = {};',
  'export const RosterGraphEntry = {};',
  'export const StableIdPage = {};',
  'export const HistoricalLabelState = {};',
  'export const Evaluation = {};',
  'export const EvaluationRound = {};',
  'export const EvaluationPeriod = {};',
  'export const EvaluationRoundStatus = {};',
  'export const EvaluationRoundMetadata = {};',
  'export const EvaluationDisplayDto = {};',
  'export const PeriodStatus = {};',
  'export const EvalStatus = {};',
  'export const RoundNumber = {};',
  'export const Grade = {};',
  'export const Team = {};',
  'export const ViewerScope = {};',
  'export const buildViewerScopeKey = () => "";',
].join('\n');

const DB_STUB = [
  'export const Tables = {};',
  'export const TablesInsert = {};',
  'export const TablesUpdate = {};',
  'export const Database = {};',
  'export const Json = {};',
].join('\n');

const SUPABASE_STUB = [
  'export const supabaseAdmin = {};',
].join('\n');

const SUPABASE_JS_STUB = [
  'export class SupabaseClient {}',
  'export const createClient = () => ({});',
].join('\n');

const loaderSource = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const rootDir = ${JSON.stringify(rootDir)};
const TYPES = ${JSON.stringify(TYPES_STUB)};
const DB = ${JSON.stringify(DB_STUB)};
const SUPABASE = ${JSON.stringify(SUPABASE_STUB)};
const SUPABASE_JS = ${JSON.stringify(SUPABASE_JS_STUB)};

function dataModule(source) {
  return { url: "data:text/javascript," + encodeURIComponent(source), shortCircuit: true, format: "module" };
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/types") return dataModule(TYPES);
  if (specifier === "@/types/database") return dataModule(DB);
  if (specifier === "server-only") return dataModule("export {};");
  if (specifier === "@supabase/supabase-js") return dataModule(SUPABASE_JS);
  if (specifier === "@/lib/supabase-admin" || specifier === "./supabase-admin" || specifier === "../supabase-admin") {
    return dataModule(SUPABASE);
  }
  if (specifier.startsWith("@/")) {
    const basePath = path.join(rootDir, "src", specifier.slice(2));
    const candidates = [
      basePath + ".ts",
      basePath + ".tsx",
      path.join(basePath, "index.ts"),
      path.join(basePath, "index.tsx"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) {
        return nextResolve(pathToFileURL(c).href, context);
      }
    }
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      const resolved = await nextResolve(specifier, context);
      if (/\\/src\\/lib\\/supabase-admin\\.ts$/.test(resolved.url)) return dataModule(SUPABASE);
      return resolved;
    } catch (err) {
      if (context && context.parentURL) {
        const base = new URL(specifier, context.parentURL);
        for (const suffix of [".ts", ".tsx", "/index.ts"]) {
          const cand = base.href + suffix;
          try {
            if (fs.existsSync(fileURLToPath(cand))) return nextResolve(cand, context);
          } catch { /* keep trying */ }
        }
      }
      throw err;
    }
  }
  const resolved = await nextResolve(specifier, context);
  if (typeof resolved?.url === "string" && /\\/src\\/lib\\/supabase-admin\\.ts$/.test(resolved.url)) {
    return dataModule(SUPABASE);
  }
  return resolved;
}
`;

register('data:text/javascript,' + encodeURIComponent(loaderSource));

// Real modules under test (imported AFTER the resolve hook is registered).
const {
  collectStableManifest,
  collectStableIdManifest,
  RosterReadError,
  ROSTER_PAGE_CAP,
} = await import('../src/lib/db/users-admin.ts');
const { getEvaluationFlow } = await import('../src/lib/evaluation-workflow.ts');
const { resolveEvaluatorFromList } = await import('../src/lib/evaluator-resolver.ts');

// ---------------------------------------------------------------- helpers ----
function makeFetcher(ids, opts = {}) {
  const pageSizeSeen = [];
  let calls = 0;
  return {
    pageSizeSeen,
    get calls() { return calls; },
    fetchPage: async (offset, limit) => {
      calls += 1;
      pageSizeSeen.push(limit);
      if (opts.failAtPage !== undefined && calls === opts.failAtPage) {
        throw new Error('SYNTHETIC_MID_PAGE_FAILURE');
      }
      const slice = ids.slice(offset, offset + limit);
      let totalCount = ids.length;
      if (opts.totalCount !== undefined) totalCount = opts.totalCount;
      if (opts.totalCountForPage) totalCount = opts.totalCountForPage(calls, ids.length);
      if (opts.oversizeOnFirstPage && calls === 1) {
        return { ids: [...slice, 'extra-over'], totalCount };
      }
      return { ids: slice, totalCount };
    },
  };
}

function idsOf(n, prefix = 'u') {
  return Array.from({ length: n }, (_, i) => `${prefix}-${String(i).padStart(6, '0')}`);
}

// =============================================================================
// 1. STABLE PAGINATION + COUNT/ID MANIFEST
// =============================================================================
describe('P107M1T05 stable pagination and count/ID manifest', () => {
  it('0 boundary: empty roster is a verified empty manifest, not a silent empty success', async () => {
    const f = makeFetcher([]);
    const manifest = await collectStableIdManifest(f.fetchPage, { pageSize: 500 });
    assert.deepStrictEqual(manifest.ids, []);
    assert.strictEqual(manifest.totalCount, 0);
  });

  it('1 boundary: single id round-trips exactly', async () => {
    const f = makeFetcher(['only-one']);
    const manifest = await collectStableIdManifest(f.fetchPage, { pageSize: 500 });
    assert.deepStrictEqual(manifest.ids, ['only-one']);
    assert.strictEqual(manifest.totalCount, 1);
  });

  it('cap boundary: exactly pageSize ids enumerate in one page', async () => {
    const ids = idsOf(ROSTER_PAGE_CAP);
    const f = makeFetcher(ids);
    const manifest = await collectStableIdManifest(f.fetchPage, { pageSize: ROSTER_PAGE_CAP });
    assert.strictEqual(manifest.totalCount, ROSTER_PAGE_CAP);
    assert.deepStrictEqual(manifest.ids, ids);
    assert.strictEqual(manifest.pages, 1);
    assert.ok(f.pageSizeSeen.every((s) => s <= ROSTER_PAGE_CAP), 'page size never exceeds the cap');
  });

  it('cap boundary + 1: one extra id forces a second page', async () => {
    const ids = idsOf(ROSTER_PAGE_CAP + 1);
    const f = makeFetcher(ids);
    const manifest = await collectStableIdManifest(f.fetchPage, { pageSize: ROSTER_PAGE_CAP });
    assert.deepStrictEqual(manifest.ids, ids);
    assert.strictEqual(manifest.pages, 2);
  });

  it('1500 synthetic users: exact ordered ids with no truncation', async () => {
    const ids = idsOf(1500);
    const f = makeFetcher(ids);
    const manifest = await collectStableManifest(
      async (offset, limit) => {
        const page = await f.fetchPage(offset, limit);
        return { items: page.ids.map((id) => ({ id })), totalCount: page.totalCount };
      },
      (item) => item.id,
      { pageSize: 500 }
    );
    assert.strictEqual(manifest.totalCount, 1500);
    assert.strictEqual(manifest.ids.length, 1500);
    assert.deepStrictEqual(manifest.ids, ids);
    assert.strictEqual(manifest.pages, 3);
  });

  it('a mid-pagination failure is an error, never an empty success', async () => {
    const ids = idsOf(1500);
    const f = makeFetcher(ids, { failAtPage: 2 });
    await assert.rejects(
      () => collectStableIdManifest(f.fetchPage, { pageSize: 500 }),
      /SYNTHETIC_MID_PAGE_FAILURE/
    );
  });

  it('a page/count mismatch (truncated tail) is denied', async () => {
    const ids = idsOf(1500);
    // Server reports 1500 but stops delivering after 1000 rows.
    const f = makeFetcher(ids.slice(0, 1000), { totalCount: 1500 });
    await assert.rejects(
      () => collectStableIdManifest(f.fetchPage, { pageSize: 500 }),
      (err) => err instanceof RosterReadError && err.code === 'ROSTER_TRUNCATED'
    );
  });

  it('a missing exact count is denied', async () => {
    const f = { fetchPage: async () => ({ ids: ['a'], totalCount: null }) };
    await assert.rejects(
      () => collectStableIdManifest(f.fetchPage, { pageSize: 500 }),
      (err) => err instanceof RosterReadError && err.code === 'ROSTER_COUNT_MISSING'
    );
  });

  it('an unstable count between pages is denied', async () => {
    const ids = idsOf(1200);
    const f = makeFetcher(ids, { totalCountForPage: (call) => (call === 1 ? 1200 : 1199) });
    await assert.rejects(
      () => collectStableIdManifest(f.fetchPage, { pageSize: 500 }),
      (err) => err instanceof RosterReadError && err.code === 'ROSTER_COUNT_UNSTABLE'
    );
  });

  it('an oversize page is denied (server ignored the bound)', async () => {
    const f = makeFetcher(idsOf(10), { oversizeOnFirstPage: true });
    await assert.rejects(
      () => collectStableIdManifest(f.fetchPage, { pageSize: 5 }),
      (err) => err instanceof RosterReadError && err.code === 'ROSTER_PAGE_OVERSIZE'
    );
  });

  it('duplicate ids (unstable ordering) are denied', async () => {
    const f = { fetchPage: async () => ({ ids: ['dup', 'dup'], totalCount: 2 }) };
    await assert.rejects(
      () => collectStableIdManifest(f.fetchPage, { pageSize: 10 }),
      (err) => err instanceof RosterReadError && err.code === 'ROSTER_ID_DUPLICATE'
    );
  });

  it('an explicit expectedTotal disagreement is denied', async () => {
    const f = makeFetcher(idsOf(10));
    await assert.rejects(
      () => collectStableIdManifest(f.fetchPage, { pageSize: 500, expectedTotal: 11 }),
      (err) => err instanceof RosterReadError
        && (err.code === 'ROSTER_COUNT_MISMATCH' || err.code === 'ROSTER_COUNT_UNSTABLE')
    );
  });

  it('the requested page size is clamped to the roster cap', async () => {
    const ids = idsOf(ROSTER_PAGE_CAP + 1);
    const f = makeFetcher(ids);
    const manifest = await collectStableIdManifest(f.fetchPage, { pageSize: ROSTER_PAGE_CAP * 10 });
    assert.deepStrictEqual(manifest.ids, ids);
    assert.ok(f.pageSizeSeen.every((s) => s <= ROSTER_PAGE_CAP));
  });
});

// =============================================================================
// 2. ROLE → ROUND ASSIGNMENT (1500 synthetic users)
// =============================================================================
describe('P107M1T05 role-round evaluator assignment graph', () => {
  const fixture = readFixture('tests/fixtures/p107/roster-personnel/synthetic-1500.json');

  function buildSubjects() {
    const subjects = [];
    const teamLeaderIds = {};
    for (const u of fixture.users) {
      subjects.push({ id: u.id, role: u.role, teamId: u.teamId, subleaderId: u.subleaderId ?? null, isActive: true });
      if (u.role === 'Leader' && u.leadsTeam) teamLeaderIds[u.leadsTeam] = u.id;
    }
    return { subjects, teamLeaderIds };
  }

  it('fixture is 1500 users with the documented role mix', () => {
    assert.strictEqual(fixture.users.length, 1500);
    const roles = new Set(fixture.users.map((u) => u.role));
    for (const role of ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker']) {
      assert.ok(roles.has(role), `fixture must contain role ${role}`);
    }
  });

  it('every role resolves round 1 to the exact expected evaluator id', () => {
    const { subjects, teamLeaderIds } = buildSubjects();
    const byId = new Map(subjects.map((s) => [s.id, s]));
    let checked = 0;
    for (const subject of subjects) {
      const flow = getEvaluationFlow(subject.role);
      assert.strictEqual(flow[0].round, 1, 'round 1 is the first step for every role');
      const actual = resolveEvaluatorFromList(flow[0].evaluator, subject, subjects, teamLeaderIds);

      let expected;
      if (['Manager', 'Leader', 'SubLeader'].includes(subject.role)) {
        expected = { id: subject.id, role: subject.role };
      } else if (subject.subleaderId) {
        const sub = byId.get(subject.subleaderId);
        const valid = sub && sub.role === 'SubLeader' && sub.teamId === subject.teamId;
        expected = valid ? { id: sub.id, role: 'SubLeader' } : null;
      } else {
        expected = null;
      }
      assert.deepStrictEqual(actual, expected, `mismatch for ${subject.id} (${subject.role})`);
      checked += 1;
    }
    assert.strictEqual(checked, 1500);
  });

  it('self-evaluating roles never pick another evaluator', () => {
    const { subjects, teamLeaderIds } = buildSubjects();
    for (const subject of subjects.filter((s) => ['Manager', 'Leader', 'SubLeader'].includes(s.role))) {
      const actual = resolveEvaluatorFromList(getEvaluationFlow(subject.role)[0].evaluator, subject, subjects, teamLeaderIds);
      assert.strictEqual(actual.id, subject.id);
    }
  });

  it('round 2 Leader assignment follows teams.leader_id with no automatic replacement', () => {
    const { subjects, teamLeaderIds } = buildSubjects();
    const byId = new Map(subjects.map((s) => [s.id, s]));
    const employees = subjects.filter((s) => s.role === 'Employee' || s.role === 'Worker');
    for (const subject of employees.slice(0, 200)) {
      const actual = resolveEvaluatorFromList('Leader', subject, subjects, teamLeaderIds);
      const appointed = teamLeaderIds[subject.teamId];
      if (!appointed) {
        assert.strictEqual(actual, null, 'no appointed Leader => explicit null, no fallback');
      } else {
        const leader = byId.get(appointed);
        assert.strictEqual(actual?.id, appointed);
        assert.strictEqual(leader?.role, 'Leader');
      }
    }
  });

  it('round 1 tolerates an unassigned SubLeader without failing the period', () => {
    const subjects = [{ id: 'e1', role: 'Employee', teamId: 't1', subleaderId: null }];
    const actual = resolveEvaluatorFromList('SubLeader', subjects[0], subjects, {});
    assert.strictEqual(actual, null);
    const flow = getEvaluationFlow('Employee');
    assert.strictEqual(flow[0].evaluator, 'SubLeader', 'unassigned SubLeader is tolerable at round 1');
  });
});

// =============================================================================
// 3. STATIC SOURCE CONTRACTS
// =============================================================================
describe('P107M1T05 source contracts', () => {
  const periodSrc = readSource('src/actions/period.ts');
  const usersAdminSrc = readSource('src/lib/db/users-admin.ts');
  const evaluationsAdminSrc = readSource('src/lib/db/evaluations-admin.ts');
  const evaluationsWriteSrc = readSource('src/lib/db/evaluations-write.ts');
  const resolverSrc = readSource('src/lib/evaluator-resolver.ts');
  const uiSrc = readSource('src/components/settings/TeamsRolesTab.tsx');

  it('period creation reads the complete roster graph and denies on mismatch', () => {
    assert.match(periodSrc, /readActiveRosterGraphAdmin\(\)/);
    assert.match(periodSrc, /instanceof RosterReadError/);
    assert.match(periodSrc, /Không có kỳ đánh giá nào được tạo/);
    assert.match(periodSrc, /roster\.manifest\.totalCount !== periodEmployees\.length/);
    // The partial/unbounded roster read must be gone.
    assert.doesNotMatch(periodSrc, /\.from\('users'\)\s*\n\s*\.select\('id, role, team_id, subleader_id'\)\s*\n\s*\.eq\('is_active', true\)/);
  });

  it('users-admin exposes stable-ID complete readers with a page cap', () => {
    assert.match(usersAdminSrc, /export const ROSTER_PAGE_CAP = 500;/);
    assert.match(usersAdminSrc, /export async function collectStableManifest/);
    assert.match(usersAdminSrc, /export async function collectStableIdManifest\(/);
    assert.match(usersAdminSrc, /export async function readActiveRosterGraphAdmin/);
    assert.match(usersAdminSrc, /\.order\('id', \{ ascending: true \}\)/);
    assert.match(usersAdminSrc, /ROSTER_TRUNCATED/);
    // The bounded viewport reader stays bounded.
    assert.match(usersAdminSrc, /range\(offset, offset \+ limit\)/);
  });

  it('evaluations-admin bounds assignment filters to the period and orders by id', () => {
    assert.match(evaluationsAdminSrc, /fetchAssignedRoundEvaluationIds/);
    assert.match(evaluationsAdminSrc, /'evaluation_id, evaluations!inner\(period_id\)'/);
    assert.match(evaluationsAdminSrc, /\.eq\('evaluations\.period_id', periodId\)/);
    assert.match(evaluationsAdminSrc, /readEvaluationsByPeriodManifestAdmin/);
    assert.match(evaluationsAdminSrc, /\.order\('id', \{ ascending: true \}\)/);
  });

  it('evaluations-write routes the full roster and existing evaluations through the stable complete readers', () => {
    assert.match(evaluationsWriteSrc, /readActiveRosterGraphAdmin\(\)/);
    assert.match(evaluationsWriteSrc, /readActiveRosterManifestAdmin\(\)/);
    assert.match(evaluationsWriteSrc, /readEvaluationsByPeriodManifestAdmin\(activePeriodId\)/);
    assert.match(evaluationsWriteSrc, /instanceof RosterReadError/);
    // The unbounded whole-roster and whole-period reads must be gone.
    assert.doesNotMatch(evaluationsWriteSrc, /\.from\('users'\)\s*\.select\('id, role, team_id, subleader_id'\)/);
    assert.doesNotMatch(evaluationsWriteSrc, /\.from\('evaluations'\)\s*\.select\('employee_id'\)/);
  });

  it('evaluator-resolver picks a deterministic Manager and ordered team scopes', () => {
    assert.match(resolverSrc, /\.order\('id', \{ ascending: true \}\)/);
    assert.match(resolverSrc, /filter\(u => u\.role === 'Manager' && u\.isActive !== false\)/);
    assert.match(resolverSrc, /sort\(\(a, b\) => a\.id\.localeCompare\(b\.id\)\)\[0\]/);
  });

  it('the teams/roles tab surfaces empty, error and retry while keeping missing roles explicit', () => {
    assert.match(uiSrc, /isError/);
    assert.match(uiSrc, /refetchUsers/);
    assert.match(uiSrc, /Thử lại/);
    assert.match(uiSrc, /Chưa có Leader/);
    assert.match(uiSrc, /Chưa có SubLeader/);
    // No automatic replacement text / behaviour.
    assert.doesNotMatch(uiSrc, /tự động thay thế|auto replace|autoReplace/i);
  });
});

// =============================================================================
// 4. MIGRATION CONTRACTS
// =============================================================================
describe('P107M1T05 migration contracts', () => {
  const MIGRATION_PATH = 'supabase/migrations/20261008000200_p107_roster_personnel.sql';
  const migrationSql = readSource(MIGRATION_PATH);

  function stripSqlComments(sql) {
    return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
  }
  const clean = stripSqlComments(migrationSql).trim();

  it('is a bounded candidate transaction', () => {
    assert.ok(migrationSql.includes('CANDIDATE ONLY — NOT APPLIED') || migrationSql.includes('CANDIDATE ONLY'));
    assert.ok(migrationSql.includes('DO NOT APPLY DIRECTLY WITHOUT SEPARATE APPROVAL'));
    assert.ok(clean.startsWith('BEGIN;'), 'migration must start with BEGIN;');
    assert.ok(clean.endsWith('COMMIT;'), 'migration must end with COMMIT;');
  });

  it('revalidates the exact roster graph under a deterministic lock', () => {
    assert.match(migrationSql, /LOCK TABLE public\.users, public\.teams IN SHARE ROW EXCLUSIVE MODE/);
    assert.match(migrationSql, /CREATE OR REPLACE FUNCTION public\.create_evaluation_period_atomic\(/);
    assert.match(migrationSql, /P107_ROSTER_COUNT_MISMATCH/);
    assert.match(migrationSql, /P107_ROSTER_ID_MISMATCH/);
    assert.match(migrationSql, /P107_ROSTER_ATTR_MISMATCH/);
    assert.match(migrationSql, /P107_ROSTER_ASSIGNMENT_MISMATCH/);
    assert.match(migrationSql, /resolve_personnel_evaluator\(s\.id, s\.role, s\.team_id, r\.round\)/);
  });

  it('makes historical-only deactivation possible while denying live orphans', () => {
    assert.match(migrationSql, /P107_DELETE_LIVE_EVALUATOR/);
    assert.match(migrationSql, /p\.status = 'active'/);
    assert.match(migrationSql, /r\.submitted_at IS NULL/);
    // Active-assignment / self-delete / FK-erase denials are preserved.
    assert.match(migrationSql, /P102M3T05_SELF_DELETE_FORBIDDEN/);
    assert.match(migrationSql, /P102M3T05_DELETE_REFERENCED_LEADER/);
    assert.match(migrationSql, /P102M3T05_DELETE_REFERENCED_SUBLEADER/);
    assert.match(migrationSql, /P102M3T05_DELETE_REFERENCED_TEAM/);
    // Deferred subleader validation is relaxed to active referencing users.
    assert.match(migrationSql, /WHERE s\.is_active IS TRUE\s*\n\s*AND s\.subleader_id IS NOT NULL/);
    assert.match(migrationSql, /NEW\.is_active IS TRUE AND NEW\.subleader_id IS NOT NULL/);
  });

  it('adds a bounded, immutable historical label schema with explicit unknown', () => {
    assert.match(migrationSql, /CREATE TABLE public\.evaluation_history_labels/);
    assert.match(migrationSql, /label_state text NOT NULL DEFAULT 'unknown'/);
    assert.match(migrationSql, /CHECK \(label_state IN \('known', 'unknown'\)\)/);
    assert.match(migrationSql, /CHECK \(\(label_state = 'known'\) = \(label_value IS NOT NULL\)\)/);
    assert.match(migrationSql, /evaluation_history_labels_immutable/);
    assert.match(migrationSql, /P107_HISTORY_LABEL_IMMUTABLE/);
    assert.match(migrationSql, /BEFORE UPDATE OR DELETE ON public\.evaluation_history_labels/);
    assert.match(migrationSql, /ENABLE ROW LEVEL SECURITY/);
  });

  it('does not weaken grants (revoke anon/authenticated, grant service_role)', () => {
    assert.match(migrationSql, /REVOKE ALL ON public\.evaluation_history_labels FROM PUBLIC, anon, authenticated/);
    assert.match(migrationSql, /GRANT SELECT, INSERT ON public\.evaluation_history_labels TO service_role/);
    assert.match(migrationSql, /REVOKE EXECUTE ON FUNCTION public\.create_evaluation_period_atomic/);
    assert.match(migrationSql, /GRANT EXECUTE ON FUNCTION public\.create_evaluation_period_atomic/);
    assert.doesNotMatch(migrationSql, /GRANT ALL/);
  });
});
