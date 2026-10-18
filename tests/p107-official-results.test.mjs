import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pure projector (type-only module-scope imports) — executed with Node's native
// TypeScript type-stripping, no server-only dependency.
import { projectEvaluationResults } from '../src/lib/evaluation-result-projection.ts';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = process.cwd();

function readProjectFile(rel) {
  const full = path.join(projectRoot, rel);
  assert.ok(fs.existsSync(full), `File must exist: ${rel}`);
  return fs.readFileSync(full, 'utf8');
}

const fixture = JSON.parse(
  fs.readFileSync(path.join(testDir, 'fixtures', 'p107', 'official-results', 'official-results.json'), 'utf8')
);
const ROSTER = fixture.roster;

function run(scenario) {
  const evaluations = fixture.scenarios[scenario].evaluations;
  return projectEvaluationResults({
    periodId: 'period-p107-golden',
    roster: ROSTER,
    evaluations,
    unavailableCriteriaVersions: new Set(),
    criteriaGroupsByVersion: new Map(),
    teamNames: new Map(),
  });
}

console.log('=== P107M1T06 official result projection — golden suite ===');

// -------------------------------------------------------------
// 1. Five roles + all statuses: only Approved rows enter the result
// -------------------------------------------------------------
{
  const p = run('statuses');

  assert.deepEqual(p.roster.byRole, { Manager: 1, Leader: 1, SubLeader: 1, Employee: 1, Worker: 1 }, 'five roles on the roster');

  // Non-Approved rows with persisted final fields must NOT enter the result.
  assert.equal(p.result.approvedCount, 1, 'only the single Approved row is official');
  assert.equal(p.result.sampleCount, 1);
  assert.equal(p.result.invalidCount, 0);
  assert.equal(p.result.legacyCount, 0);
  assert.equal(p.result.mixedBasis, false);
  assert.equal(p.result.average, 88);
  assert.equal(p.result.highGradeRate, 100);
  assert.deepEqual(p.result.gradeDistribution.find((g) => g.grade === 'A'), { grade: 'A', count: 1 });
  assert.deepEqual(p.result.top.map((t) => t.evaluationId), ['ev-approved']);

  assert.deepEqual(p.coverage, { total: 5, approved: 1, valid: 1, invalid: 0, legacy: 0, pending: 4 });
  assert.equal(p.progress.filter((e) => e.frozenIncomplete).length, 2, 'Submitted + Reviewed frozen-incomplete stay in progress only');

  const byEmp = new Map(p.progress.map((e) => [e.employeeId, e.status]));
  assert.equal(byEmp.get('e-mgr'), 'NotStarted');
  assert.equal(byEmp.get('e-ldr'), 'Draft');
  assert.equal(byEmp.get('e-sub'), 'Submitted');
  assert.equal(byEmp.get('e-emp'), 'Reviewed');
  assert.equal(byEmp.get('e-wrk'), 'Approved');

  console.log('  PASS: five roles / all statuses — Approved-only, frozen-incomplete excluded from result');
}

// -------------------------------------------------------------
// 2. Single configured basis: numeric average/rate/top, valid 0 preserved
// -------------------------------------------------------------
{
  const p = run('clean');
  assert.equal(p.result.approvedCount, 4);
  assert.equal(p.result.sampleCount, 4);
  assert.equal(p.result.mixedBasis, false);
  assert.equal(p.result.average, 55, '(90 + 80 + 0 + 50) / 4 = 55 (valid score 0 honoured)');
  assert.equal(p.result.highGradeRate, 50, '2 of 4 are >= AB');
  assert.deepEqual(p.result.gradeDistribution, [
    { grade: 'S', count: 0 },
    { grade: 'A', count: 1 },
    { grade: 'AB', count: 1 },
    { grade: 'B', count: 1 },
    { grade: 'C', count: 1 },
    { grade: 'D', count: 0 },
  ]);
  assert.deepEqual(p.result.top.map((t) => t.evaluationId), ['ev-c-mgr', 'ev-c-ldr', 'ev-c-emp', 'ev-c-sub']);
  assert.equal(p.result.top[3].score, 0, 'valid score 0 appears in top, not dropped');
  assert.deepEqual(p.result.approved.map((e) => e.evaluationId), ['ev-c-emp', 'ev-c-ldr', 'ev-c-mgr', 'ev-c-sub']);
  assert.deepEqual(p.coverage, { total: 5, approved: 4, valid: 4, invalid: 0, legacy: 0, pending: 1 });

  const mgr = p.roleBreakdown.find((r) => r.role === 'Manager');
  assert.deepEqual(mgr, { role: 'Manager', approved: 1, average: 90, highGradeRate: 100, sampleCount: 1 });
  const cfg = p.configBreakdown.filter((c) => c.configKey === 'cfg-1');
  assert.equal(cfg.length, 4, 'config breakdown keeps every role under the single basis');

  console.log('  PASS: single basis — average 55, high-grade 50%, deterministic top, score 0 preserved');
}

// -------------------------------------------------------------
// 3. Mixed incompatible bases + legacy + invalid (missing final field)
// -------------------------------------------------------------
{
  const p = run('mixed');
  assert.equal(p.result.approvedCount, 4, 'Approved rows counted');
  assert.equal(p.result.sampleCount, 3, 'valid Approved rows only');
  assert.equal(p.result.invalidCount, 1, 'Approved row with a missing final grade is explicit invalid');
  assert.equal(p.result.legacyCount, 1, 'Approved row with a missing version stays explicit legacy');
  assert.equal(p.result.mixedBasis, true, 'cfg-1 / cfg-2 / legacy_unknown are incompatible bases');
  assert.equal(p.result.average, null, 'no invented cross-basis average');
  assert.equal(p.result.highGradeRate, null, 'no invented cross-basis percentage');
  assert.deepEqual(p.result.top.map((t) => t.evaluationId), ['ev-m-mgr', 'ev-m-sub', 'ev-m-ldr']);
  assert.deepEqual(p.coverage, { total: 5, approved: 4, valid: 3, invalid: 1, legacy: 1, pending: 1 });
  assert.deepEqual(p.snapshot.basisStates, ['authoritative', 'legacy_unknown']);
  assert.deepEqual(p.snapshot.criteriaConfigVersionIds, ['cfg-1', 'cfg-2']);
  assert.equal(p.snapshot.mixed, true);

  const wrk = p.result.invalid.find((e) => e.evaluationId === 'ev-m-wrk');
  assert.equal(wrk.valid, false, 'missing final grade => invalid (never a latest-round fallback)');
  assert.equal(wrk.score, 30);
  assert.equal(wrk.grade, null);

  console.log('  PASS: mixed-config null average/rate + legacy + invalid, breakdown retained');
}

// -------------------------------------------------------------
// 4. Empty is a real 0, distinct from null/mixed
// -------------------------------------------------------------
{
  const p = run('empty');
  assert.equal(p.result.approvedCount, 0);
  assert.equal(p.result.sampleCount, 0);
  assert.equal(p.result.average, 0, '0 valid rows is a real numeric 0');
  assert.equal(p.result.highGradeRate, 0);
  assert.equal(p.result.mixedBasis, false);
  assert.deepEqual(p.result.top, []);
  assert.deepEqual(p.coverage, { total: 5, approved: 0, valid: 0, invalid: 0, legacy: 0, pending: 5 });
  assert.ok(p.progress.every((e) => e.status === 'NotStarted' && e.hasEvaluation === false));

  console.log('  PASS: empty period => real 0 (not null, not mixed) with full-roster progress');
}

// -------------------------------------------------------------
// 4b. Effective team filter: headline aggregates, grade distribution and
//     criteria analysis equal the team-scoped projection (F1/F2/F5)
// -------------------------------------------------------------
{
  const evaluations = fixture.scenarios.clean.evaluations;
  const criteriaGroupsByVersion = new Map([
    [
      'cfg-1',
      [
        {
          id: 'grp-A',
          code: 'A',
          name: 'Kỷ luật',
          shortName: 'KL',
          criteria: [{ id: 'c1', code: 'C1', name: 'Tiêu chí 1', levels: [{ points: 20, label: 'Tối đa' }] }],
        },
      ],
    ],
  ]);

  // Org-wide reference for the same scenario.
  const all = projectEvaluationResults({
    periodId: 'period-p107-golden',
    roster: ROSTER,
    evaluations,
    criteriaGroupsByVersion,
  });
  assert.equal(all.result.average, 55, 'org-wide average is 55');
  assert.equal(all.result.highGradeRate, 50, 'org-wide high-grade rate is 50%');
  const allCriteria = all.criteriaBreakdown.find((c) => c.group === 'A');
  assert.equal(allCriteria.avgScore, 11, 'org-wide group A average is 11');
  assert.ok(Math.abs(allCriteria.percentage - 55) < 1e-9, 'org-wide group A percentage is ~55');

  // Team t2 = { e-sub, e-emp } is the effective authorized filter.
  const teamIds = new Set(ROSTER.filter((r) => r.teamId === 't2').map((r) => r.employeeId));
  const scoped = projectEvaluationResults({
    periodId: 'period-p107-golden',
    roster: ROSTER.filter((r) => teamIds.has(r.employeeId)),
    evaluations: evaluations.filter((e) => teamIds.has(e.employeeId)),
    criteriaGroupsByVersion,
  });

  assert.equal(scoped.roster.total, 2, 'scoped roster is the team size');
  assert.equal(scoped.result.approvedCount, 2);
  assert.equal(scoped.result.sampleCount, 2);
  assert.equal(scoped.result.invalidCount, 0);
  assert.equal(scoped.result.legacyCount, 0);
  assert.equal(scoped.result.average, 25, '(0 + 50) / 2 team-scoped average');
  assert.equal(scoped.result.highGradeRate, 0, 'B/C are below AB inside the team');
  assert.deepEqual(scoped.result.gradeDistribution, [
    { grade: 'S', count: 0 },
    { grade: 'A', count: 0 },
    { grade: 'AB', count: 0 },
    { grade: 'B', count: 1 },
    { grade: 'C', count: 1 },
    { grade: 'D', count: 0 },
  ]);
  // Top performers are selected from the team-scoped valid set BEFORE the cap
  // (F2): the org-wide top mgr(90)/ldr(80) is filtered out, not the intersection.
  assert.deepEqual(scoped.result.top.map((t) => t.evaluationId), ['ev-c-emp', 'ev-c-sub']);
  assert.deepEqual(scoped.coverage, { total: 2, approved: 2, valid: 2, invalid: 0, legacy: 0, pending: 0 });
  // Criteria analysis is scoped too (F1): group A avg (0 + 10) / 2 = 5 of max 20.
  assert.deepEqual(scoped.criteriaBreakdown, [
    {
      group: 'A',
      avgScore: 5,
      percentage: 25,
      groupId: 'grp-A',
      versionId: 'cfg-1',
      setKey: null,
      configVersion: null,
      label: 'Tiêu chuẩn',
    },
  ]);

  console.log('  PASS: team filter scopes headline aggregates, grade distribution, criteria analysis and top slice');
}

// -------------------------------------------------------------
// 5. Server loader null-guard + single-source wiring across surfaces
// -------------------------------------------------------------
{
  const projector = readProjectFile('src/lib/evaluation-result-projection.ts');
  assert.match(projector, /if \(!periodId \|\| !viewer\) return null/, 'loader denies missing auth/period (no snapshot metadata)');
  assert.match(projector, /getEvaluationsByPeriodAdmin/, 'loader reuses the batched evaluations reader');
  assert.match(projector, /loadCriteriaSnapshots/, 'loader reuses the versioned display snapshot loader');
  assert.match(projector, /export function projectEvaluationResults/, 'pure projector exported');
  assert.match(projector, /export async function getEvaluationResultProjection/, 'server loader exported');

  const dashboard = readProjectFile('src/actions/dashboard.ts');
  assert.ok(!dashboard.includes('rawEvaluations'), 'heavy DTO dropped rawEvaluations');
  assert.ok(!dashboard.includes('rawCriteriaGroups'), 'heavy DTO dropped rawCriteriaGroups');
  assert.match(dashboard, /getEvaluationResultProjection/, 'dashboard uses the single server projector');
  const heavyBody = dashboard.match(/export async function getDashboardHeavyData[\s\S]*?(?=export async function|$)/)[0];
  assert.ok(!heavyBody.includes('getUsersAdmin('), 'heavy action must not load users directly');
  assert.match(dashboard, /data-load-layer|coverage/, 'dashboard surfaces coverage');

  const reports = readProjectFile('src/actions/reports.ts');
  assert.match(reports, /getEvaluationResultProjection/, 'report uses the single server projector');
  assert.ok(!reports.includes('e.finalScore || (e.rounds'), 'report never falls back with truthy semantics');
  assert.match(reports, /score:\s*entry\.score \?\? 0/, 'report serializes the persisted official score with zero-safe nullish semantics');
  assert.ok(!reports.includes('lastRound?.totalScore'), 'official report rows never fall back to a latest round');
  assert.match(reports, /employeeIds:\s*teamFilterIds/, 'report scopes the projector to the effective team filter');
  assert.match(reports, /projection\.result\.top\s*\.map/, 'top performers come from the team-scoped top set (before the limit cap)');
  assert.ok(!reports.includes('void evaluationScore'), 'report must not neutralize the score helper as dead code');
  assert.ok(!reports.includes('function evaluationScore'), 'obsolete raw-round fallback helper is removed, not retained as dead code');

  const read = readProjectFile('src/actions/read.ts');
  assert.match(read, /export async function getEvaluationResultProjectionAction/, 'read exposes the projection server action');

  const exportLib = readProjectFile('src/lib/export.ts');
  assert.match(exportLib, /getEvaluationResultProjectionAction/, 'export restricts to the official projection');
  assert.match(
    exportLib,
    /throw new Error\('Không thể xác định kết quả chính thức để xuất/,
    'export fails closed (throws) when the official projection is unavailable'
  );
  assert.ok(
    !/officialIds\s*\?\s*evaluations\.filter/.test(exportLib),
    'export never silently falls back to the unfiltered evaluation set'
  );

  const heavySection = readProjectFile('src/components/dashboard/DashboardHeavySection.tsx');
  assert.ok(
    !heavySection.includes('!data ? null'),
    'heavy section must render a distinct, visible error state for a missing/failed payload (not nothing)'
  );

  const teamComparison = readProjectFile('src/components/reports/TeamComparison.tsx');
  assert.ok(
    !teamComparison.includes('Average Score'),
    'relative team-comparison bar must not be mislabeled as an absolute Average Score'
  );

  const ai = readProjectFile('src/actions/ai.ts');
  assert.ok(!ai.includes('rawEvaluations'), 'AI no longer reads raw evaluations');
  assert.match(ai, /d\.anomalies/, 'AI consumes the minimized anomaly DTO');

  const chat = readProjectFile('src/actions/chat.ts');
  assert.ok(!chat.includes('rawEvaluations'), 'chat no longer reads raw evaluations');

  const periodsTab = readProjectFile('src/components/settings/PeriodsTab.tsx');
  assert.match(periodsTab, /getPeriodsProgressSummaryAction/, 'Settings uses the light per-period aggregate');
  assert.ok(!periodsTab.includes('useEvaluations(undefined'), 'Settings no longer reads all-period evaluations');

  console.log('  PASS: single projector wired into report/dashboard/export/AI; heavy DTO minimized');
}

// -------------------------------------------------------------
// 6. Behavioral: the real report action returns team-scoped headline aggregates,
//    grade distribution and criteria analysis (F1/F2) that equal the scoped set.
// -------------------------------------------------------------
{
  const { register } = await import('node:module');

  const mockUsers = ROSTER.map((r) => ({
    id: r.employeeId,
    name: `NV ${r.employeeId}`,
    role: r.role,
    teamId: r.teamId,
  }));
  const cleanEvaluations = fixture.scenarios.clean.evaluations.map((e) => ({
    ...e,
    periodId: 'period-p107',
  }));
  const criteriaGroup = {
    id: 'grp-A',
    code: 'A',
    name: 'Kỷ luật',
    shortName: 'KL',
    criteria: [{ id: 'c1', code: 'C1', name: 'Tiêu chí 1', levels: [{ points: 20, label: 'Tối đa' }] }],
  };

  const mockSources = {
    '@/types': 'export const Role={};export const Grade={};export const EvalStatus={};export const User={};export const Evaluation={};export const ViewerScope={};export const buildViewerScopeKey=()=>{};',
    '@/lib/auth':
      "export const requireRole = async () => ({ error: null, user: { id: 'manager-1', role: 'Manager', teamId: 't1' } }); export const requireAuth = async () => ({ error: null, user: { id: 'manager-1', role: 'Manager', teamId: 't1' } });",
    '@/lib/db/evaluations-admin': `export const getEvaluationsByPeriodAdmin = async () => (${JSON.stringify(cleanEvaluations)}); export const getEvaluationSummariesByPeriodAdmin = async () => (${JSON.stringify(cleanEvaluations)});`,
    '@/lib/db/users-admin': `export const getUsersAdmin = async () => (${JSON.stringify(mockUsers)});`,
    '@/lib/db/teams-admin':
      "export const getTeamsAdmin = async () => ([{ id: 't1', name: 'Team 1' }, { id: 't2', name: 'Team 2' }, { id: 't3', name: 'Team 3' }]);",
    '@/lib/db/evaluation-display-admin': `const group = ${JSON.stringify(criteriaGroup)}; export const loadCriteriaSnapshots = async (ids) => ({ groups: ids.includes('cfg-1') ? new Map([['cfg-1:grp-A', group]]) : new Map(), unavailable: new Set() }); export const groupsForVersion = (versionId, snapshot) => (!versionId ? [] : [...snapshot.groups.entries()].filter(([k]) => k.startsWith(versionId + ':')).map(([, g]) => g));`,
  };

  const loader = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const rootDir = process.cwd();
const mocks = ${JSON.stringify(mockSources)};
export async function resolve(specifier, context, nextResolve) {
  if (Object.prototype.hasOwnProperty.call(mocks, specifier)) {
    return { url: "data:text/javascript," + encodeURIComponent(mocks[specifier]), shortCircuit: true, format: "module" };
  }
  if (specifier.startsWith("@/")) {
    const sub = specifier.slice(2);
    const basePath = path.join(rootDir, "src", sub);
    const candidates = [basePath + ".ts", basePath + ".tsx", path.join(basePath, "index.ts"), path.join(basePath, "index.tsx")];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return nextResolve(pathToFileURL(c).href, context);
    }
  }
  return nextResolve(specifier, context);
}
`;
  register(`data:text/javascript,${encodeURIComponent(loader)}`);

  const { getReportAggregation } = await import('../src/actions/reports.ts');

  const scoped = await getReportAggregation('period-p107', 't2');
  assert.ok(scoped, 'report returns a structured result for a team filter');
  assert.equal(scoped.stats.totalEmployees, 2, 'team filter scopes the headline roster count');
  assert.equal(scoped.stats.avgScore, null, 'D2: mixed sets (leader + staff in team) null out global average');
  assert.equal(scoped.stats.highGradeRate, null, 'D2: mixed sets null out high-grade rate');
  assert.equal(scoped.stats.mixedBasis, true, 'D2: mixed sets marked mixedBasis=true');
  assert.equal(scoped.setKpis.length, 2, 'D2: separate buckets for leader and staff');
  assert.equal(scoped.setKpis.find((b) => b.setKey === 'leader')?.average, 0, 'leader bucket average');
  assert.equal(scoped.setKpis.find((b) => b.setKey === 'staff')?.average, 50, 'staff bucket average');
  assert.equal(scoped.stats.pendingCount, 0);
  assert.equal(scoped.stats.approvedCount, 2);
  assert.equal(scoped.stats.sampleCount, 2);
  assert.deepEqual(
    scoped.gradeDistribution.filter((g) => g.count > 0).map((g) => [g.grade, g.count]),
    [['B', 1], ['C', 1]],
    'team-scoped grade distribution'
  );
  assert.deepEqual(
    scoped.criteriaAnalysis,
    [
      {
        group: 'A',
        avgScore: 5,
        percentage: 25,
        groupId: 'grp-A',
        versionId: 'cfg-1',
        setKey: null,
        configVersion: null,
        label: 'Tiêu chuẩn',
      },
    ],
    'team-scoped criteria analysis'
  );
  assert.deepEqual(scoped.topPerformers, [], 'D2: legacy cross-set topPerformers empty when mixedSets');
  assert.deepEqual(scoped.teamStats, [], 'D2: legacy cross-set teamStats empty when mixedSets');

  const all = await getReportAggregation('period-p107', 'all');
  assert.ok(all, 'report returns a structured result for all teams');
  assert.equal(all.stats.totalEmployees, 5, 'all-teams keeps the org-wide roster');
  assert.equal(all.stats.avgScore, null, 'D2: org-wide multiple sets null out cross-set average');
  assert.equal(all.stats.highGradeRate, null, 'D2: org-wide multiple sets null out cross-set high-grade rate');
  assert.equal(all.stats.mixedBasis, true, 'D2: marked mixedBasis=true');
  assert.equal(all.setKpis.length, 2, 'D2: separate buckets for leader and staff');
  assert.equal(all.setKpis.find((b) => b.setKey === 'leader')?.sampleCount, 3, '3 leaders in all teams');
  assert.equal(all.setKpis.find((b) => b.setKey === 'staff')?.sampleCount, 1, '1 staff in all teams');
  assert.deepEqual(all.topPerformers, [], 'D2: cross-set top empty when mixedSets');

  // Verify scoped set query works cleanly for specific set:
  const leaderOnly = await getReportAggregation('period-p107', 'all', 'leader');
  assert.ok(leaderOnly);
  assert.equal(leaderOnly.stats.mixedBasis, false);
  assert.equal(leaderOnly.stats.sampleCount, 3);
  assert.equal(Math.round((leaderOnly.stats.avgScore ?? 0) * 10) / 10, 56.7);
  assert.equal(leaderOnly.setKpis.length, 1);
  assert.ok(leaderOnly.topPerformers.some((p) => p.id === 'e-mgr'), 'leader top includes manager');

  console.log('  PASS: report action returns team-scoped aggregates equal to the scoped projection');
}

console.log('\n=== P107M1T06 official results: ALL GOLDEN CHECKS PASS ===');
