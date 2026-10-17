#!/usr/bin/env node
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');
const tsPath = path.join(projectRoot, 'node_modules/typescript/lib/typescript.js');
const tsUrl = pathToFileURL(tsPath).href;

// Shared state for DB mocks used when executing actual Server Actions
globalThis.__p108_mock_state = {
  evaluations: [],
  users: [],
  teams: [{ id: 'team-1', name: 'Team 1' }],
  criteriaSnapshots: { groups: new Map(), unavailable: new Set() },
  currentUser: { id: 'usr-mgr', role: 'Manager', teamId: 'team-1' },
};

const loaderCode = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import tsModule from ${JSON.stringify(tsUrl)};
const ts = tsModule.default || tsModule;
const rootDir = ${JSON.stringify(projectRoot)};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export {};", shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/auth") {
    const code = "export const requireRole = async () => ({ error: null, user: globalThis.__p108_mock_state.currentUser }); export const requireAuth = async () => ({ error: null, user: globalThis.__p108_mock_state.currentUser });";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/db/evaluations-admin") {
    const code = "export const getEvaluationsByPeriodAdmin = async () => globalThis.__p108_mock_state.evaluations; export const getEvaluationSummariesByPeriodAdmin = async () => globalThis.__p108_mock_state.evaluations;";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/db/users-admin") {
    const code = "export const getUsersAdmin = async () => globalThis.__p108_mock_state.users;";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/db/teams-admin") {
    const code = "export const getTeamsAdmin = async () => globalThis.__p108_mock_state.teams;";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/db/evaluation-display-admin") {
    const code = "export const loadCriteriaSnapshots = async () => globalThis.__p108_mock_state.criteriaSnapshots; export const groupsForVersion = (versionId, snapshot) => (!versionId ? [] : [...snapshot.groups.entries()].filter(([k]) => k.startsWith(versionId + ':')).map(([, g]) => g));";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    for (const suffix of [".ts", ".tsx", "/index.ts", ".js", ""]) {
      const p = path.join(rootDir, "src", rel + suffix);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return nextResolve(pathToFileURL(p).href, context);
      }
    }
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    try {
      return await nextResolve(specifier, context);
    } catch (err) {
      if (context && context.parentURL) {
        const base = new URL(specifier, context.parentURL);
        for (const suffix of [".ts", ".tsx", "/index.ts"]) {
          const cand = base.href + suffix;
          try {
            if (fs.existsSync(fileURLToPath(cand))) {
              return nextResolve(cand, context);
            }
          } catch {}
        }
      }
      throw err;
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:")) {
    const filePath = fileURLToPath(url);
    if (filePath.endsWith(".ts") || filePath.endsWith(".tsx")) {
      let source = fs.readFileSync(filePath, "utf8");
      if (filePath.endsWith("src/actions/dashboard.ts")) {
        source += "\\nexport { buildRadar };";
      }
      const transpiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ESNext, jsx: ts.JsxEmit.ReactJSX }
      });
      return { format: "module", source: transpiled.outputText, shortCircuit: true };
    }
  }
  return nextLoad(url, context);
}
`;

register('data:text/javascript,' + encodeURIComponent(loaderCode));

// Import ACTUAL TS implementations under test
const { projectEvaluationResults, formatCriteriaSetLabel } = await import(
  '../src/lib/evaluation-result-projection.ts'
);
const { buildRadar } = await import('../src/actions/dashboard.ts');
const { getReportAggregation } = await import('../src/actions/reports.ts');

console.log('=== P108M1T08 Per-set criteria analytics & report projection golden suite ===\n');

// Verify formatCriteriaSetLabel helper
assert.equal(formatCriteriaSetLabel('leader', 1), 'Quản lý (v1)');
assert.equal(formatCriteriaSetLabel('staff', 2), 'Nhân viên (v2)');
assert.equal(formatCriteriaSetLabel('worker', null), 'Công nhân');
assert.equal(formatCriteriaSetLabel(null, null), 'Tiêu chuẩn');
assert.equal(formatCriteriaSetLabel(null, 3), 'Tiêu chuẩn (v3)');

// ---------------------------------------------------------------------------
// (a) Leader group A and Staff group A (same code 'A', different sets)
//     are NEVER merged: two entries with their own avg/percentage/group max.
// ---------------------------------------------------------------------------
{
  console.log('Case (a): Leader group A and Staff group A never merged...');

  const roster = [
    { employeeId: 'emp-leader-1', role: 'Leader', teamId: 'team-1' },
    { employeeId: 'emp-staff-1', role: 'Employee', teamId: 'team-1' },
  ];

  // Leader group A has max 20 points; Staff group A has max 10 points
  const groupLeaderA = {
    id: 'grp-leader-A',
    code: 'A',
    name: 'Kỷ luật Leader',
    shortName: 'KL-L',
    setKey: 'leader',
    configVersion: 1,
    configVersionId: 'cfg-leader-v1',
    criteria: [
      {
        id: 'crit-ldr-1',
        code: 'C1',
        name: 'Tiêu chí L1',
        levels: [{ points: 20, label: 'Tối đa' }],
      },
    ],
  };

  const groupStaffA = {
    id: 'grp-staff-A',
    code: 'A',
    name: 'Kỷ luật Staff',
    shortName: 'KL-S',
    setKey: 'staff',
    configVersion: 1,
    configVersionId: 'cfg-staff-v1',
    criteria: [
      {
        id: 'crit-stf-1',
        code: 'C1',
        name: 'Tiêu chí S1',
        levels: [{ points: 10, label: 'Tối đa' }],
      },
    ],
  };

  const criteriaGroupsByVersion = new Map([
    ['cfg-leader-v1', [groupLeaderA]],
    ['cfg-staff-v1', [groupStaffA]],
  ]);

  const evaluations = [
    {
      id: 'eval-leader',
      periodId: 'p108-period',
      employeeId: 'emp-leader-1',
      employeeRole: 'Leader',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 80,
      rounds: [
        {
          round: 1,
          evaluatorId: 'emp-leader-1',
          evaluatorRole: 'Leader',
          status: 'Submitted',
          totalScore: 80,
          grade: 'A',
          criteriaConfigVersionId: 'cfg-leader-v1',
          scores: { 'crit-ldr-1': 16 }, // 16 of 20 = 80%
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'eval-staff',
      periodId: 'p108-period',
      employeeId: 'emp-staff-1',
      employeeRole: 'Employee',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 50,
      rounds: [
        {
          round: 1,
          evaluatorId: 'emp-leader-1',
          evaluatorRole: 'Leader',
          status: 'Submitted',
          totalScore: 50,
          grade: 'B',
          criteriaConfigVersionId: 'cfg-staff-v1',
          scores: { 'crit-stf-1': 5 }, // 5 of 10 = 50%
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const projection = projectEvaluationResults({
    periodId: 'p108-period',
    roster,
    evaluations,
    criteriaGroupsByVersion,
  });

  assert.equal(projection.criteriaBreakdown.length, 2, 'two distinct entries for two sets');

  const leaderEntry = projection.criteriaBreakdown.find(
    (e) => e.setKey === 'leader' && e.groupId === 'grp-leader-A'
  );
  assert.ok(leaderEntry, 'leader group A exists');
  assert.equal(leaderEntry.group, 'A');
  assert.equal(leaderEntry.groupId, 'grp-leader-A');
  assert.equal(leaderEntry.versionId, 'cfg-leader-v1');
  assert.equal(leaderEntry.configVersion, 1);
  assert.equal(leaderEntry.label, 'Quản lý (v1)');
  assert.equal(leaderEntry.avgScore, 16, 'leader group A average is 16');
  assert.equal(leaderEntry.percentage, 80, 'leader group A percentage is 16/20 = 80%');

  const staffEntry = projection.criteriaBreakdown.find(
    (e) => e.setKey === 'staff' && e.groupId === 'grp-staff-A'
  );
  assert.ok(staffEntry, 'staff group A exists');
  assert.equal(staffEntry.group, 'A');
  assert.equal(staffEntry.groupId, 'grp-staff-A');
  assert.equal(staffEntry.versionId, 'cfg-staff-v1');
  assert.equal(staffEntry.configVersion, 1);
  assert.equal(staffEntry.label, 'Nhân viên (v1)');
  assert.equal(staffEntry.avgScore, 5, 'staff group A average is 5');
  assert.equal(staffEntry.percentage, 50, 'staff group A percentage is 5/10 = 50%');

  console.log('  PASS (a): Leader group A and Staff group A never merged.');
}

// ---------------------------------------------------------------------------
// (b) Leader A version 1 vs Leader A version 2 never merged
// ---------------------------------------------------------------------------
{
  console.log('Case (b): Leader A version 1 vs Leader A version 2 never merged...');

  const roster = [
    { employeeId: 'emp-1', role: 'Leader', teamId: 'team-1' },
    { employeeId: 'emp-2', role: 'Leader', teamId: 'team-1' },
  ];

  const groupV1 = {
    id: 'grp-ldr-A',
    code: 'A',
    name: 'Kỷ luật',
    shortName: 'KL',
    setKey: 'leader',
    configVersion: 1,
    configVersionId: 'cfg-v1',
    criteria: [
      {
        id: 'crit-1',
        code: 'C1',
        name: 'Tiêu chí 1',
        levels: [{ points: 20, label: 'Tối đa' }],
      },
    ],
  };

  const groupV2 = {
    id: 'grp-ldr-A',
    code: 'A',
    name: 'Kỷ luật',
    shortName: 'KL',
    setKey: 'leader',
    configVersion: 2,
    configVersionId: 'cfg-v2',
    criteria: [
      {
        id: 'crit-1',
        code: 'C1',
        name: 'Tiêu chí 1',
        levels: [{ points: 50, label: 'Tối đa' }],
      },
    ],
  };

  const criteriaGroupsByVersion = new Map([
    ['cfg-v1', [groupV1]],
    ['cfg-v2', [groupV2]],
  ]);

  const evaluations = [
    {
      id: 'eval-v1',
      periodId: 'p108-period',
      employeeId: 'emp-1',
      employeeRole: 'Leader',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 50,
      rounds: [
        {
          round: 1,
          evaluatorId: 'emp-1',
          evaluatorRole: 'Leader',
          status: 'Submitted',
          totalScore: 50,
          grade: 'B',
          criteriaConfigVersionId: 'cfg-v1',
          scores: { 'crit-1': 10 }, // 10 of 20 = 50%
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'eval-v2',
      periodId: 'p108-period',
      employeeId: 'emp-2',
      employeeRole: 'Leader',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 50,
      rounds: [
        {
          round: 1,
          evaluatorId: 'emp-2',
          evaluatorRole: 'Leader',
          status: 'Submitted',
          totalScore: 50,
          grade: 'B',
          criteriaConfigVersionId: 'cfg-v2',
          scores: { 'crit-1': 25 }, // 25 of 50 = 50%
          createdAt: '2026-10-02T00:00:00Z',
        },
      ],
      currentRound: 1,
      createdAt: '2026-10-02T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
    },
  ];

  const projection = projectEvaluationResults({
    periodId: 'p108-period',
    roster,
    evaluations,
    criteriaGroupsByVersion,
  });

  assert.equal(projection.criteriaBreakdown.length, 2, 'v1 and v2 are kept separate');

  const v1Entry = projection.criteriaBreakdown.find((e) => e.versionId === 'cfg-v1');
  assert.ok(v1Entry, 'v1 entry exists');
  assert.equal(v1Entry.configVersion, 1);
  assert.equal(v1Entry.label, 'Quản lý (v1)');
  assert.equal(v1Entry.avgScore, 10);
  assert.equal(v1Entry.percentage, 50);

  const v2Entry = projection.criteriaBreakdown.find((e) => e.versionId === 'cfg-v2');
  assert.ok(v2Entry, 'v2 entry exists');
  assert.equal(v2Entry.configVersion, 2);
  assert.equal(v2Entry.label, 'Quản lý (v2)');
  assert.equal(v2Entry.avgScore, 25);
  assert.equal(v2Entry.percentage, 50);

  console.log('  PASS (b): Leader A v1 vs Leader A v2 never merged.');
}

// ---------------------------------------------------------------------------
// (c) Legacy single-version period: group/avgScore/percentage numbers EQUAL
//     the pre-change baseline values (assert literal baseline numbers).
// ---------------------------------------------------------------------------
{
  console.log('Case (c): Legacy single-version period preserves exact baseline numbers...');

  const roster = [
    { employeeId: 'emp-leg-1', role: 'Employee', teamId: 'team-1' },
    { employeeId: 'emp-leg-2', role: 'Employee', teamId: 'team-1' },
  ];

  // Pre-change legacy fixture: criteria group without setKey or configVersion
  const legacyGroup = {
    id: 'grp-legacy-A',
    code: 'A',
    name: 'Kỷ luật',
    shortName: 'KL',
    criteria: [
      {
        id: 'crit-c1',
        code: 'C1',
        name: 'Tiêu chí 1',
        levels: [{ points: 20, label: 'Tối đa' }],
      },
    ],
  };

  const criteriaGroupsByVersion = new Map([['cfg-legacy', [legacyGroup]]]);

  const evaluations = [
    {
      id: 'ev-1',
      periodId: 'p108-period',
      employeeId: 'emp-leg-1',
      employeeRole: 'Employee',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'C',
      finalScore: 10,
      rounds: [
        {
          round: 1,
          evaluatorId: 'emp-leg-1',
          evaluatorRole: 'Employee',
          status: 'Submitted',
          totalScore: 10,
          grade: 'C',
          criteriaConfigVersionId: 'cfg-legacy',
          scores: { 'crit-c1': 10 },
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ev-2',
      periodId: 'p108-period',
      employeeId: 'emp-leg-2',
      employeeRole: 'Employee',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'D',
      finalScore: 0,
      rounds: [
        {
          round: 1,
          evaluatorId: 'emp-leg-2',
          evaluatorRole: 'Employee',
          status: 'Submitted',
          totalScore: 0,
          grade: 'D',
          criteriaConfigVersionId: 'cfg-legacy',
          scores: { 'crit-c1': 0 },
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const projection = projectEvaluationResults({
    periodId: 'p108-period',
    roster,
    evaluations,
    criteriaGroupsByVersion,
  });

  // PRE-CHANGE BASELINE:
  // group: 'A'
  // avgScore: (10 + 0) / 2 = 5
  // percentage: (5 / 20) * 100 = 25%
  assert.equal(projection.criteriaBreakdown.length, 1);
  const entry = projection.criteriaBreakdown[0];
  assert.equal(entry.group, 'A', 'literal legacy group A');
  assert.equal(entry.avgScore, 5, 'literal baseline avgScore 5');
  assert.equal(entry.percentage, 25, 'literal baseline percentage 25');

  // Verify new fields for legacy single-version
  assert.equal(entry.groupId, 'grp-legacy-A');
  assert.equal(entry.versionId, 'cfg-legacy');
  assert.equal(entry.setKey, null);
  assert.equal(entry.configVersion, null);
  assert.equal(entry.label, 'Tiêu chuẩn');

  console.log('  PASS (c): Legacy single-version period numbers equal pre-change baseline.');
}

// ---------------------------------------------------------------------------
// (d) Legacy mixed-version fixture (criteria saved while a period was active):
//     split per version; records old (merged) value vs new (split) values.
// ---------------------------------------------------------------------------
{
  console.log('Case (d): Legacy mixed-version fixture records old vs new values...');

  const roster = [
    { employeeId: 'emp-mv-1', role: 'Leader', teamId: 'team-1' },
    { employeeId: 'emp-mv-2', role: 'Leader', teamId: 'team-1' },
  ];

  // In this fixture, criteria was saved while the period was active:
  // Version 1 scale: criterion max 20 points, emp-1 scored 10 points.
  // Version 2 scale: criterion max 50 points, emp-2 scored 40 points.
  const groupV1 = {
    id: 'grp-mv-A',
    code: 'A',
    name: 'Kỷ luật',
    shortName: 'KL',
    configVersion: 1,
    configVersionId: 'cfg-mv-v1',
    criteria: [{ id: 'crit-c1', code: 'C1', name: 'Tiêu chí 1', levels: [{ points: 20, label: 'Tối đa' }] }],
  };

  const groupV2 = {
    id: 'grp-mv-A',
    code: 'A',
    name: 'Kỷ luật',
    shortName: 'KL',
    configVersion: 2,
    configVersionId: 'cfg-mv-v2',
    criteria: [{ id: 'crit-c1', code: 'C1', name: 'Tiêu chí 1', levels: [{ points: 50, label: 'Tối đa' }] }],
  };

  const criteriaGroupsByVersion = new Map([
    ['cfg-mv-v1', [groupV1]],
    ['cfg-mv-v2', [groupV2]],
  ]);

  const evaluations = [
    {
      id: 'ev-mv-1',
      periodId: 'p108-period',
      employeeId: 'emp-mv-1',
      employeeRole: 'Leader',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 50,
      rounds: [
        {
          round: 1,
          evaluatorId: 'emp-mv-1',
          evaluatorRole: 'Leader',
          status: 'Submitted',
          totalScore: 50,
          grade: 'B',
          criteriaConfigVersionId: 'cfg-mv-v1',
          scores: { 'crit-c1': 10 }, // 10 / 20 = 50%
          createdAt: '2026-10-01T00:00:00Z',
        },
      ],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ev-mv-2',
      periodId: 'p108-period',
      employeeId: 'emp-mv-2',
      employeeRole: 'Leader',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 80,
      rounds: [
        {
          round: 1,
          evaluatorId: 'emp-mv-2',
          evaluatorRole: 'Leader',
          status: 'Submitted',
          totalScore: 80,
          grade: 'A',
          criteriaConfigVersionId: 'cfg-mv-v2',
          scores: { 'crit-c1': 40 }, // 40 / 50 = 80%
          createdAt: '2026-10-02T00:00:00Z',
        },
      ],
      currentRound: 1,
      createdAt: '2026-10-02T00:00:00Z',
      updatedAt: '2026-10-02T00:00:00Z',
    },
  ];

  // =========================================================================
  // DOCUMENTED PRE-CHANGE (LEGACY) BEHAVIOR:
  // Under the legacy implementation keyed only by group.code ('A'):
  // - Total score summed across both evaluations: 10 + 40 = 50
  // - Total samples: 2
  // - Merged average score: 50 / 2 = 25
  // - Group maximum was captured from whichever group initialized the entry (v1 max = 20)
  // - Resulting in an invalid cross-scale merged percentage: (25 / 20) * 100 = 125%!
  const OLD_MERGED_AVG_SCORE = 25;
  const OLD_MERGED_PERCENTAGE = 125;
  // =========================================================================

  const projection = projectEvaluationResults({
    periodId: 'p108-period',
    roster,
    evaluations,
    criteriaGroupsByVersion,
  });

  // NEW (POST-CHANGE) BEHAVIOR:
  // Distinct entries split per version, each calculated against its true version maximum:
  // - v1 entry: avgScore = 10, percentage = 50% (10 / 20 * 100)
  // - v2 entry: avgScore = 40, percentage = 80% (40 / 50 * 100)
  const NEW_SPLIT_V1_AVG = 10;
  const NEW_SPLIT_V1_PCT = 50;
  const NEW_SPLIT_V2_AVG = 40;
  const NEW_SPLIT_V2_PCT = 80;

  assert.equal(projection.criteriaBreakdown.length, 2, 'split into 2 entries instead of 1 merged');

  const v1 = projection.criteriaBreakdown.find((e) => e.versionId === 'cfg-mv-v1');
  assert.ok(v1);
  assert.equal(v1.avgScore, NEW_SPLIT_V1_AVG, 'new split v1 avg is 10');
  assert.equal(v1.percentage, NEW_SPLIT_V1_PCT, 'new split v1 percentage is 50%');
  assert.notEqual(v1.avgScore, OLD_MERGED_AVG_SCORE, 'v1 avg is not merged 25');

  const v2 = projection.criteriaBreakdown.find((e) => e.versionId === 'cfg-mv-v2');
  assert.ok(v2);
  assert.equal(v2.avgScore, NEW_SPLIT_V2_AVG, 'new split v2 avg is 40');
  assert.equal(v2.percentage, NEW_SPLIT_V2_PCT, 'new split v2 percentage is 80%');
  assert.notEqual(v2.percentage, OLD_MERGED_PERCENTAGE, 'v2 percentage is not distorted 125%');

  console.log('  PASS (d): Legacy mixed-version fixture correctly splits old merged values into new versioned values.');
}

// ---------------------------------------------------------------------------
// (e) Stored inputs deep-equal before/after projection (never mutated);
//     counts, progress, gradeDistribution, average, top unchanged between
//     a single-set and mixed-set run of the same approved evaluations.
// ---------------------------------------------------------------------------
{
  console.log('Case (e): Immutability of inputs & KPI invariance between single-set and mixed-set...');

  const roster = [
    { employeeId: 'u1', role: 'Leader', teamId: 't1' },
    { employeeId: 'u2', role: 'Employee', teamId: 't1' },
    { employeeId: 'u3', role: 'Worker', teamId: 't1' },
  ];

  const evaluationsSingle = [
    {
      id: 'ev-1',
      periodId: 'p108',
      employeeId: 'u1',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 85,
      rounds: [{ round: 1, evaluatorId: 'u1', evaluatorRole: 'Leader', status: 'Submitted', criteriaConfigVersionId: 'cfg-s', scores: { 'c1': 10 } }],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ev-2',
      periodId: 'p108',
      employeeId: 'u2',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 70,
      rounds: [{ round: 1, evaluatorId: 'u1', evaluatorRole: 'Leader', status: 'Submitted', criteriaConfigVersionId: 'cfg-s', scores: { 'c1': 8 } }],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ev-3',
      periodId: 'p108',
      employeeId: 'u3',
      employeeRole: 'Worker',
      teamId: 't1',
      status: 'Submitted',
      rounds: [{ round: 1, evaluatorId: 'u1', evaluatorRole: 'Leader', status: 'Submitted', criteriaConfigVersionId: 'cfg-s', scores: { 'c1': 5 } }],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const evaluationsMixed = [
    {
      id: 'ev-1',
      periodId: 'p108',
      employeeId: 'u1',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 85,
      rounds: [{ round: 1, evaluatorId: 'u1', evaluatorRole: 'Leader', status: 'Submitted', criteriaConfigVersionId: 'cfg-ldr', scores: { 'c-ldr': 10 } }],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ev-2',
      periodId: 'p108',
      employeeId: 'u2',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 70,
      rounds: [{ round: 1, evaluatorId: 'u1', evaluatorRole: 'Leader', status: 'Submitted', criteriaConfigVersionId: 'cfg-stf', scores: { 'c-stf': 8 } }],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'ev-3',
      periodId: 'p108',
      employeeId: 'u3',
      employeeRole: 'Worker',
      teamId: 't1',
      status: 'Submitted',
      rounds: [{ round: 1, evaluatorId: 'u1', evaluatorRole: 'Leader', status: 'Submitted', criteriaConfigVersionId: 'cfg-stf', scores: { 'c-stf': 5 } }],
      currentRound: 1,
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-01T00:00:00Z',
    },
  ];

  const clonedSingle = structuredClone(evaluationsSingle);
  const clonedMixed = structuredClone(evaluationsMixed);

  const singleProj = projectEvaluationResults({
    periodId: 'p108',
    roster,
    evaluations: evaluationsSingle,
    criteriaGroupsByVersion: new Map([
      ['cfg-s', [{ id: 'g1', code: 'A', name: 'G1', criteria: [{ id: 'c1', code: 'C1', name: 'C1', levels: [{ points: 10, label: 'Max' }] }] }]],
    ]),
  });

  const mixedProj = projectEvaluationResults({
    periodId: 'p108',
    roster,
    evaluations: evaluationsMixed,
    criteriaGroupsByVersion: new Map([
      ['cfg-ldr', [{ id: 'g-ldr', code: 'A', name: 'GL', setKey: 'leader', criteria: [{ id: 'c-ldr', code: 'C1', name: 'C1', levels: [{ points: 10, label: 'Max' }] }] }]],
      ['cfg-stf', [{ id: 'g-stf', code: 'A', name: 'GS', setKey: 'staff', criteria: [{ id: 'c-stf', code: 'C1', name: 'C1', levels: [{ points: 10, label: 'Max' }] }] }]],
    ]),
  });

  // Verify inputs are NEVER mutated
  assert.deepEqual(evaluationsSingle, clonedSingle, 'single evaluations input was not mutated');
  assert.deepEqual(evaluationsMixed, clonedMixed, 'mixed evaluations input was not mutated');

  // Verify headline counts and progress are identical
  assert.equal(singleProj.result.approvedCount, mixedProj.result.approvedCount);
  assert.equal(singleProj.result.invalidCount, mixedProj.result.invalidCount);
  assert.equal(singleProj.result.sampleCount, mixedProj.result.sampleCount);
  assert.deepEqual(singleProj.coverage, mixedProj.coverage);
  assert.deepEqual(singleProj.progress, mixedProj.progress);
  assert.deepEqual(singleProj.result.gradeDistribution, mixedProj.result.gradeDistribution);

  // Top performers are identical
  assert.deepEqual(
    singleProj.result.top.map((t) => [t.evaluationId, t.score]),
    mixedProj.result.top.map((t) => [t.evaluationId, t.score])
  );

  console.log('  PASS (e): Inputs preserved deeply; counts, progress, gradeDistribution, and top unchanged.');
}

// ---------------------------------------------------------------------------
// (f) Radar per set: two sets produce two radar groups;
//     single set identical to the old radar output.
// ---------------------------------------------------------------------------
{
  console.log('Case (f): Radar per set and legacy single-set equivalence...');

  const groupLeader = {
    id: 'grp-r-ldr',
    code: 'A',
    name: 'Kỷ luật Leader',
    shortName: 'KL-L',
    setKey: 'leader',
    configVersion: 1,
    configVersionId: 'cfg-ldr',
    criteria: [
      {
        id: 'c-r-ldr',
        code: 'C1',
        name: 'Tiêu chí L',
        levels: [{ points: 10, label: 'Max' }],
      },
    ],
  };

  const groupStaff = {
    id: 'grp-r-stf',
    code: 'A',
    name: 'Kỷ luật Staff',
    shortName: 'KL-S',
    setKey: 'staff',
    configVersion: 1,
    configVersionId: 'cfg-stf',
    criteria: [
      {
        id: 'c-r-stf',
        code: 'C1',
        name: 'Tiêu chí S',
        levels: [{ points: 10, label: 'Max' }],
      },
    ],
  };

  const criteriaGroupsByVersion = new Map([
    ['cfg-ldr', [groupLeader]],
    ['cfg-stf', [groupStaff]],
  ]);

  // Two-party evaluation for Leader: Self = 8, Manager = 9 (of 10) => Self 80%, Manager 90%
  const evalLeader = {
    id: 'ev-r-ldr',
    employeeId: 'u-ldr',
    employeeRole: 'Leader',
    status: 'Approved',
    rounds: [
      {
        round: 1,
        evaluatorId: 'u-ldr',
        criteriaConfigVersionId: 'cfg-ldr',
        scores: { 'c-r-ldr': 8 },
      },
      {
        round: 2,
        evaluatorId: 'u-mgr',
        criteriaConfigVersionId: 'cfg-ldr',
        scores: { 'c-r-ldr': 9 },
      },
    ],
  };

  // Two-party evaluation for Staff: Self = 6, Manager = 7 (of 10) => Self 60%, Manager 70%
  const evalStaff = {
    id: 'ev-r-stf',
    employeeId: 'u-stf',
    employeeRole: 'Employee',
    status: 'Approved',
    rounds: [
      {
        round: 1,
        evaluatorId: 'u-stf',
        criteriaConfigVersionId: 'cfg-stf',
        scores: { 'c-r-stf': 6 },
      },
      {
        round: 2,
        evaluatorId: 'u-mgr',
        criteriaConfigVersionId: 'cfg-stf',
        scores: { 'c-r-stf': 7 },
      },
    ],
  };

  // Test multi-set radar:
  const multiRadarResult = buildRadar([evalLeader, evalStaff], criteriaGroupsByVersion);
  assert.equal(multiRadarResult.radarSets.length, 2, 'two sets produce two radar groups');

  const leaderRadar = multiRadarResult.radarSets.find((s) => s.setKey === 'leader');
  assert.ok(leaderRadar, 'leader radar set exists');
  assert.equal(leaderRadar.label, 'Quản lý (v1)');
  assert.equal(leaderRadar.sampleCount, 1);
  assert.deepEqual(leaderRadar.data, [
    { subject: 'KL-L', Self: 80, Manager: 90, fullMark: 100 },
  ]);

  const staffRadar = multiRadarResult.radarSets.find((s) => s.setKey === 'staff');
  assert.ok(staffRadar, 'staff radar set exists');
  assert.equal(staffRadar.label, 'Nhân viên (v1)');
  assert.equal(staffRadar.sampleCount, 1);
  assert.deepEqual(staffRadar.data, [
    { subject: 'KL-S', Self: 60, Manager: 70, fullMark: 100 },
  ]);

  // Test single-set radar:
  const singleRadarResult = buildRadar([evalLeader], criteriaGroupsByVersion);
  assert.equal(singleRadarResult.radarSets.length, 1, 'single set produces one radar set');
  assert.deepEqual(
    singleRadarResult.radarSets[0].data,
    singleRadarResult.radar,
    'single set radarSets[0].data is identical to the old radar field'
  );
  assert.equal(
    singleRadarResult.radarSets[0].sampleCount,
    singleRadarResult.sampleCount,
    'sample count matches'
  );
  assert.deepEqual(singleRadarResult.radar, [
    { subject: 'KL-L', Self: 80, Manager: 90, fullMark: 100 },
  ]);

  console.log('  PASS (f): Radar per set splits correctly; single-set output equals legacy radar.');
}

// ---------------------------------------------------------------------------
// (g) mixedSets flag + note present only when more than one set/version exists;
//     no grade-version note anywhere.
// ---------------------------------------------------------------------------
{
  console.log('Case (g): mixedSets flag & note present only when mixed; no grade-version note...');

  const mockUsers = [
    { id: 'u-1', name: 'User 1', role: 'Leader', teamId: 'team-1' },
    { id: 'u-2', name: 'User 2', role: 'Employee', teamId: 'team-1' },
  ];
  globalThis.__p108_mock_state.users = mockUsers;
  globalThis.__p108_mock_state.teams = [{ id: 'team-1', name: 'Team 1' }];

  const groupLeader = {
    id: 'grp-g-ldr',
    code: 'A',
    name: 'Kỷ luật',
    shortName: 'KL',
    setKey: 'leader',
    configVersion: 1,
    configVersionId: 'cfg-g-ldr',
    criteria: [{ id: 'c-g-1', code: 'C1', name: 'C1', levels: [{ points: 20, label: 'Max' }] }],
  };

  const groupStaff = {
    id: 'grp-g-stf',
    code: 'A',
    name: 'Kỷ luật',
    shortName: 'KL',
    setKey: 'staff',
    configVersion: 1,
    configVersionId: 'cfg-g-stf',
    criteria: [{ id: 'c-g-2', code: 'C2', name: 'C2', levels: [{ points: 10, label: 'Max' }] }],
  };

  // Scenario 1: Single set only
  globalThis.__p108_mock_state.evaluations = [
    {
      id: 'ev-g-1',
      employeeId: 'u-1',
      employeeRole: 'Leader',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 80,
      rounds: [{ round: 1, evaluatorId: 'u-1', evaluatorRole: 'Leader', criteriaConfigVersionId: 'cfg-g-ldr', scores: { 'c-g-1': 16 } }],
      currentRound: 1,
    },
  ];
  globalThis.__p108_mock_state.criteriaSnapshots = {
    groups: new Map([['cfg-g-ldr:grp-g-ldr', groupLeader]]),
    unavailable: new Set(),
  };

  const singleReport = await getReportAggregation('period-p108', 'all');
  assert.ok(singleReport, 'singleReport returned');
  assert.equal(singleReport.mixedSets, false, 'mixedSets is false for single set');
  assert.equal(singleReport.note, null, 'note is null for single set');
  assert.equal(singleReport.criteriaAnalysis.length, 1);
  assert.equal(singleReport.criteriaAnalysis.mixedSets, false);
  assert.equal(singleReport.criteriaAnalysis.note, null);

  // Scenario 2: Multiple sets (Leader + Staff)
  globalThis.__p108_mock_state.evaluations = [
    {
      id: 'ev-g-1',
      employeeId: 'u-1',
      employeeRole: 'Leader',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 80,
      rounds: [{ round: 1, evaluatorId: 'u-1', evaluatorRole: 'Leader', criteriaConfigVersionId: 'cfg-g-ldr', scores: { 'c-g-1': 16 } }],
      currentRound: 1,
    },
    {
      id: 'ev-g-2',
      employeeId: 'u-2',
      employeeRole: 'Employee',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 50,
      rounds: [{ round: 1, evaluatorId: 'u-1', evaluatorRole: 'Leader', criteriaConfigVersionId: 'cfg-g-stf', scores: { 'c-g-2': 5 } }],
      currentRound: 1,
    },
  ];
  globalThis.__p108_mock_state.criteriaSnapshots = {
    groups: new Map([
      ['cfg-g-ldr:grp-g-ldr', groupLeader],
      ['cfg-g-stf:grp-g-stf', groupStaff],
    ]),
    unavailable: new Set(),
  };

  const mixedReport = await getReportAggregation('period-p108', 'all');
  assert.ok(mixedReport, 'mixedReport returned');
  assert.equal(mixedReport.mixedSets, true, 'mixedSets is true for multiple sets');
  assert.equal(
    mixedReport.note,
    'Không so sánh trực tiếp giữa các bộ tiêu chí',
    'mixedSets note has exact required text'
  );
  assert.equal(mixedReport.criteriaAnalysis.mixedSets, true);
  assert.equal(mixedReport.criteriaAnalysis.note, 'Không so sánh trực tiếp giữa các bộ tiêu chí');

  // Verify D3: NO grade-version note anywhere in the reports DTO
  const serialized = JSON.stringify(mixedReport);
  assert.ok(
    !serialized.includes('grade-version') &&
    !serialized.includes('gradeVersion') &&
    !serialized.includes('phiên bản xếp loại') &&
    !serialized.includes('bảng xếp loại'),
    'D3: NO grade-version note anywhere in the report payload'
  );

  console.log('  PASS (g): mixedSets flag & note present only when mixed; no grade-version note anywhere.');
}

console.log('\n=== ALL P108 REPORT PROJECTION GOLDEN TESTS PASS ===\n');
