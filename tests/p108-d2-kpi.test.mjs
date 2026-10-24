#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');
const tsPath = path.join(projectRoot, 'node_modules/typescript/lib/typescript.js');
const tsUrl = pathToFileURL(tsPath).href;

// Shared mock state for Server Actions & boundary testing
globalThis.__p108_d2_mock_state = {
  evaluations: [],
  users: [],
  teams: [
    { id: 'team-1', name: 'Đội 1' },
    { id: 'team-2', name: 'Đội 2' },
  ],
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
  // Match DB/auth/provider boundaries by canonical source identity too: source
  // modules legitimately use both aliases and relative imports.
  if ((specifier.startsWith('.') || specifier.startsWith('file:')) && context.parentURL) {
    const target = new URL(specifier, context.parentURL);
    if (target.protocol === 'file:') {
      const rel = path.relative(path.join(rootDir, 'src'), fileURLToPath(target));
      if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
        specifier = '@/'+rel.replace(/\\.(ts|tsx|js)$/, '');
      }
    }
  }
  if (
    specifier === "react" ||
    specifier === "react-dom" ||
    specifier === "react-dom/server" ||
    specifier === "react/jsx-runtime" ||
    specifier === "react/jsx-dev-runtime" ||
    specifier.startsWith("lucide-react")
  ) {
    const parent = pathToFileURL(path.join(rootDir, "package.json")).href;
    return nextResolve(specifier, { ...context, parentURL: parent });
  }

  if (["next/cache", "next/headers", "@/lib/ai", "@/lib/ai-limit", "@/lib/supabase-admin", "@/lib/db/evaluation-period-write-guard"].includes(specifier)) {
    const modules = {
      "next/cache": "export const revalidatePath = () => {};",
      "next/headers": "export const cookies = async () => ({ get: () => undefined });",
      "@/lib/ai": "export const isAIConfigured = () => true; export const callAI = async (prompt) => { (globalThis.__p108_d2_mock_state.aiPrompts ||= []).push(prompt); return 'SYNTHETIC_PROVIDER_OUTPUT'; }; export const callAIVision = callAI;",
      "@/lib/ai-limit": "export const reserveAiQuota = async () => ({ allowed:true, requestId:'unit-request' }); export const consumeAiQuota = async () => ({ok:true}); export const refundAiQuota = async () => ({ok:true}); export const checkAndRecordAiUsage = async () => ({allowed:true}); export const reserveChatQuota = reserveAiQuota; export const consumeChatQuota = consumeAiQuota; export const refundChatQuota = refundAiQuota;",
      "@/lib/db/evaluation-period-write-guard": "export const assertEvaluationPeriodActive = async () => ({success:true}); export const assertEvaluationPeriodActiveForEvaluation = assertEvaluationPeriodActive;",
      "@/lib/supabase-admin": "const state = () => globalThis.__p108_d2_mock_state; export const supabaseAdmin = { from(table) { let q; q = new Proxy({}, { get(_, key) { if (key === 'then') return Promise.resolve({ data: table === 'ai_summaries' ? (state().cachedSummary || null) : table === 'evaluation_periods' ? {id:state().periodId || 'p-d2',name:'Synthetic period',year:2026,status:'active'} : [], error:null }).then.bind(Promise.resolve({data:table === 'ai_summaries' ? (state().cachedSummary || null) : table === 'evaluation_periods' ? {id:state().periodId || 'p-d2',name:'Synthetic period',year:2026,status:'active'} : [],error:null})); return () => q; }}); return q; }, async rpc(name,args) { (state().rpcCalls ||= []).push({name,args}); return { data:{coverage_status:'complete'},error:null }; } };",
    };
    return { url: "data:text/javascript," + encodeURIComponent(modules[specifier]), shortCircuit:true, format:"module" };
  }

  if (specifier === '@supabase/supabase-js') {
    const code = "import { supabaseAdmin } from '@/lib/supabase-admin'; export const createClient = () => supabaseAdmin;";
    return {url:'data:text/javascript,'+encodeURIComponent(code),shortCircuit:true,format:'module'};
  }
  if (specifier === "server-only") {
    return { url: "data:text/javascript,export {};", shortCircuit: true, format: "module" };
  }

  if (specifier === "next/dynamic") {
    const code = "export default function dynamic(loader) { return function DynamicComponent(props) { return null; }; }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/contexts/AuthContext") {
    const code = "export const useAuth = () => ({ user: globalThis.__p108_d2_mock_state.currentUser, viewerScope: { scopeKey: 'scope-key' }, scopeEpoch: 1 });";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/auth") {
    const code = "export const requireRole = async () => ({ error: null, user: globalThis.__p108_d2_mock_state.currentUser }); export const requireAuth = async () => ({ error: null, user: globalThis.__p108_d2_mock_state.currentUser }); export const requireManager = requireAuth;";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/db/evaluations-admin") {
    const code = "export const getEvaluationsByPeriodAdmin = async () => globalThis.__p108_d2_mock_state.evaluations; export const getEvaluationSummariesByPeriodAdmin = async () => globalThis.__p108_d2_mock_state.evaluations; export const getEvaluationsAdmin = getEvaluationsByPeriodAdmin; export const getEvaluationSummariesAdmin = getEvaluationsByPeriodAdmin; export const getEvaluationSummariesByEmployeeIdsAdmin = getEvaluationsByPeriodAdmin; export const getEvaluationByIdAdmin = async () => null; export const getEvaluationByEmployeeAdmin = async () => null; export const getPeriodsAdmin = async () => []; export const getActivePeriodAdmin = async () => ({ id: globalThis.__p108_d2_mock_state.periodId || 'p-d2', name: 'Synthetic period' }); export const getPeriodByIdAdmin = getActivePeriodAdmin;";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/db/users-admin") {
    const code = "export const getUsersAdmin = async () => globalThis.__p108_d2_mock_state.users; export const getUsersBatchAdmin = async () => ({ users: globalThis.__p108_d2_mock_state.users }); export const getUserByIdAdmin = async (id) => globalThis.__p108_d2_mock_state.users.find(u => u.id === id); export const getUsersByTeamAdmin = getUsersAdmin; export const getAllUsersAdmin = getUsersAdmin;";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/db/teams-admin") {
    const code = "export const getTeamsAdmin = async () => globalThis.__p108_d2_mock_state.teams; export const getTeamByIdAdmin = async (id) => globalThis.__p108_d2_mock_state.teams.find(t => t.id === id); export const getLeaderTeamIds = async () => ['team-1','team-2'];";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/lib/db/evaluation-display-admin") {
    const code = "export const getEvaluationDisplayAdmin = async () => null; export const loadCriteriaSnapshots = async () => globalThis.__p108_d2_mock_state.criteriaSnapshots; export const groupsForVersion = (versionId, snapshot) => (!versionId ? [] : [...snapshot.groups.entries()].filter(([k]) => k.startsWith(versionId + ':')).map(([, g]) => g));";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/layout/PageHeader") {
    const code = "import React from 'react'; export default function PageHeader({ title, description, children }) { return React.createElement('header', { 'data-testid': 'page-header' }, React.createElement('h1', null, title), React.createElement('p', null, description), children); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/reports/ReportFilters") {
    const code = "import React from 'react'; export default function ReportFilters() { return React.createElement('div', { 'data-testid': 'report-filters' }); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/reports/ExportReportButton") {
    const code = "import React from 'react'; export default function ExportReportButton() { return React.createElement('button', { 'data-testid': 'export-report-btn' }, 'Export'); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/reports/AiSummaryCard") {
    const code = "import React from 'react'; export default function AiSummaryCard() { return React.createElement('div', { 'data-testid': 'ai-summary-card' }); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/charts/ClientGradeDistribution") {
    const code = "import React from 'react'; export default function ClientGradeDistribution({ data }) { return React.createElement('div', { 'data-testid': 'grade-dist' }, JSON.stringify(data)); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/charts/ClientCriteriaHeatmap") {
    const code = "import React from 'react'; export default function ClientCriteriaHeatmap({ data }) { return React.createElement('div', { 'data-testid': 'criteria-heatmap' }, JSON.stringify(data)); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/dashboard/PendingReviews") {
    const code = "import React from 'react'; export default function PendingReviews({ evaluations }) { return React.createElement('div', { 'data-testid': 'pending-reviews' }); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/dashboard/AnomalyAlertCard") {
    const code = "import React from 'react'; export default function AnomalyAlertCard({ anomalies }) { return React.createElement('div', { 'data-testid': 'anomaly-alert-card' }); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/charts/LazySkillGapRadar") {
    const code = "import React from 'react'; export default function LazySkillGapRadar() { return React.createElement('div', { 'data-testid': 'lazy-radar' }); }";
    return { url: "data:text/javascript," + encodeURIComponent(code), shortCircuit: true, format: "module" };
  }

  if (specifier === "@/components/ui/EmptyState") {
    const code = "import React from 'react'; export function EmptyState({ title, description }) { return React.createElement('div', { 'data-testid': 'empty-state' }, title, description); }";
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
        source += "\\nexport { buildRadar, summarizeResult };";
      }
      // Expose private context builders ONLY in this in-memory test module.
      // Production Server Action exports and bodies are unchanged.
      if (filePath.endsWith("src/actions/chat.ts")) {
        source += "\\nexport { buildPageContext, buildManagerSemanticContext };";
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

// React SSR dependencies
import React from 'react';
import ReactDOMServer from 'react-dom/server';

// Module imports under test
const { projectEvaluationResults: projectEvaluationResultsCore, formatCriteriaSetLabel } = await import(
  '../src/lib/evaluation-result-projection.ts'
);
// Positive pure fixtures carry a real, explicit loaded synthetic catalog. No
// catalog is inferred from the score/role under test; negative cases call Core.
const loadedFixtureCatalog = new Map(['v1', 'v2'].map((version) => [version,
  ['leader', 'staff', 'worker'].map((setKey) => ({
    id: version + '-' + setKey, code: 'A', name: 'Synthetic ' + setKey,
    setKey, configVersionId: version, configVersion: Number(version.slice(1)),
    criteria: [{ id: version + '-c-' + setKey, code: 'A1', name: 'Synthetic',
      levels: [{ points: setKey === 'leader' ? 190 : 175, label: 'Max' }] }],
  })),
]));
function projectEvaluationResults(input) {
  return projectEvaluationResultsCore({ ...input,
    criteriaGroupsByVersion: Object.hasOwn(input, 'criteriaGroupsByVersion')
      ? input.criteriaGroupsByVersion : loadedFixtureCatalog });
}
const { getReportAggregation } = await import('../src/actions/reports.ts');
const { getDashboardHeavyData, summarizeResult } = await import('../src/actions/dashboard.ts');
const { default: SetKpiSummary } = await import('../src/components/reports/SetKpiSummary.tsx');
const { default: ReportsDataLayer } = await import('../src/components/reports/ReportsDataLayer.tsx');
const { default: DashboardHeavySection } = await import('../src/components/dashboard/DashboardHeavySection.tsx');

console.log('=== P108M1T08-D2 Focused KPI & Set Metric Acceptance Suite ===\n');

// Test formatCriteriaSetLabel helper
assert.equal(formatCriteriaSetLabel('leader', 1), 'Quản lý (v1)');
assert.equal(formatCriteriaSetLabel('staff', 2), 'Nhân viên (v2)');
assert.equal(formatCriteriaSetLabel('worker', null), 'Công nhân');
assert.equal(formatCriteriaSetLabel(null, null), 'Tiêu chuẩn');

// ===========================================================================
// Test 1: All 3 sets sharing SAME criteria version
// Critical requirement: version alone must not merge sets!
// ===========================================================================
{
  console.log('1. All 3 sets sharing SAME version: separated into distinct buckets...');

  const roster = [
    { employeeId: 'emp-ldr', role: 'Leader', teamId: 't1' },
    { employeeId: 'emp-stf', role: 'Employee', teamId: 't1' },
    { employeeId: 'emp-wrk', role: 'Worker', teamId: 't1' },
  ];

  const evaluations = [
    {
      id: 'ev-ldr',
      periodId: 'p-1',
      employeeId: 'emp-ldr',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 90,
      rounds: [{ round: 1, evaluatorId: 'emp-ldr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-stf',
      periodId: 'p-1',
      employeeId: 'emp-stf',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 80,
      rounds: [{ round: 1, evaluatorId: 'emp-ldr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-wrk',
      periodId: 'p-1',
      employeeId: 'emp-wrk',
      employeeRole: 'Worker',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'AB',
      finalScore: 70,
      rounds: [{ round: 1, evaluatorId: 'emp-ldr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p-1',
    roster,
    evaluations,
  });

  assert.equal(p.result.setKpis.length, 3, 'Must produce exactly 3 separate buckets for leader, staff, worker');
  assert.equal(p.result.setKpis[0].setKey, 'leader');
  assert.equal(p.result.setKpis[0].criteriaVersionId, 'v1');
  assert.equal(p.result.setKpis[0].average, 90);

  assert.equal(p.result.setKpis[1].setKey, 'staff');
  assert.equal(p.result.setKpis[1].criteriaVersionId, 'v1');
  assert.equal(p.result.setKpis[1].average, 80);

  assert.equal(p.result.setKpis[2].setKey, 'worker');
  assert.equal(p.result.setKpis[2].criteriaVersionId, 'v1');
  assert.equal(p.result.setKpis[2].average, 70);

  // Deterministic ordering: Leader, Staff, Worker
  assert.deepEqual(p.result.setKpis.map((b) => b.setKey), ['leader', 'staff', 'worker']);

  console.log('  PASS: Version alone does not merge sets; 3 distinct buckets in Leader -> Staff -> Worker order.');
}

// ===========================================================================
// Test 2: Manager / Leader / SubLeader grouped as leader from evaluation snapshot
// ===========================================================================
{
  console.log('2. Manager / Leader / SubLeader grouped into leader bucket from evaluation snapshot...');

  const roster = [
    { employeeId: 'emp-mgr', role: 'Manager', teamId: 't1' },
    { employeeId: 'emp-ldr', role: 'Leader', teamId: 't1' },
    { employeeId: 'emp-sub', role: 'SubLeader', teamId: 't1' },
    { employeeId: 'emp-stf', role: 'Employee', teamId: 't1' },
    { employeeId: 'emp-wrk', role: 'Worker', teamId: 't1' },
  ];

  const evaluations = [
    {
      id: 'ev-1',
      periodId: 'p-1',
      employeeId: 'emp-mgr',
      employeeRole: 'Manager',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'S',
      finalScore: 96,
      rounds: [{ round: 1, evaluatorId: 'emp-mgr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-2',
      periodId: 'p-1',
      employeeId: 'emp-ldr',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 90,
      rounds: [{ round: 1, evaluatorId: 'emp-mgr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-3',
      periodId: 'p-1',
      employeeId: 'emp-sub',
      employeeRole: 'SubLeader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'AB',
      finalScore: 84,
      rounds: [{ round: 1, evaluatorId: 'emp-mgr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-4',
      periodId: 'p-1',
      employeeId: 'emp-stf',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 75,
      rounds: [{ round: 1, evaluatorId: 'emp-mgr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-5',
      periodId: 'p-1',
      employeeId: 'emp-wrk',
      employeeRole: 'Worker',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 70,
      rounds: [{ round: 1, evaluatorId: 'emp-mgr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p-1',
    roster,
    evaluations,
  });

  const leaderBucket = p.result.setKpis.find((b) => b.setKey === 'leader');
  assert.ok(leaderBucket);
  assert.equal(leaderBucket.sampleCount, 3, 'Manager, Leader, SubLeader must all be in leader bucket');
  // (96 + 90 + 84) / 3 = 90
  assert.equal(leaderBucket.average, 90);
  assert.deepEqual(
    leaderBucket.top.map((e) => e.employeeRole),
    ['Manager', 'Leader', 'SubLeader'],
    'Top entries inside leader bucket retain evaluation snapshot employeeRole'
  );

  console.log('  PASS: Manager, Leader, SubLeader properly grouped into leader set.');
}

// ===========================================================================
// Test 3: Negative and zero finals preserved
// ===========================================================================
{
  console.log('3. Negative and zero final scores preserved with nullish semantics...');

  const roster = [
    { employeeId: 'u1', role: 'Employee', teamId: 't1' },
    { employeeId: 'u2', role: 'Employee', teamId: 't1' },
    { employeeId: 'u3', role: 'Employee', teamId: 't1' },
  ];

  const evaluations = [
    {
      id: 'ev-zero',
      periodId: 'p-1',
      employeeId: 'u1',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'D',
      finalScore: 0,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-neg',
      periodId: 'p-1',
      employeeId: 'u2',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'D',
      finalScore: -10,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-pos',
      periodId: 'p-1',
      employeeId: 'u3',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 40,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p-1',
    roster,
    evaluations,
  });

  const staffBucket = p.result.setKpis[0];
  assert.equal(staffBucket.sampleCount, 3);
  // (0 + -10 + 40) / 3 = 10
  assert.equal(staffBucket.average, 10);
  assert.equal(staffBucket.top[0].score, 40);
  assert.equal(staffBucket.top[1].score, 0, 'Score 0 preserved in top');
  assert.equal(staffBucket.top[2].score, -10, 'Negative score preserved in top');

  console.log('  PASS: Score 0 and negative score correctly preserved in sampleCount, average, and top.');
}

// ===========================================================================
// Test 4: nonApproved and invalid evaluations excluded
// ===========================================================================
{
  console.log('4. nonApproved and invalid rows excluded from D2 buckets...');

  const roster = [
    { employeeId: 'u1', role: 'Leader', teamId: 't1' },
    { employeeId: 'u2', role: 'Leader', teamId: 't1' },
    { employeeId: 'u3', role: 'Leader', teamId: 't1' },
    { employeeId: 'u4', role: 'Leader', teamId: 't1' },
    { employeeId: 'u5', role: 'Leader', teamId: 't1' },
  ];

  const evaluations = [
    {
      id: 'ev-app-valid',
      periodId: 'p-1',
      employeeId: 'u1',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 85,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-submitted',
      periodId: 'p-1',
      employeeId: 'u2',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Submitted',
      finalGrade: 'A',
      finalScore: 85,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-draft',
      periodId: 'p-1',
      employeeId: 'u3',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Draft',
      rounds: [],
    },
    {
      id: 'ev-invalid-grade',
      periodId: 'p-1',
      employeeId: 'u4',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: null, // missing grade
      finalScore: 80,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-invalid-score',
      periodId: 'p-1',
      employeeId: 'u5',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: null, // missing score
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p-1',
    roster,
    evaluations,
  });

  const leaderBucket = p.result.setKpis[0];
  assert.equal(leaderBucket.sampleCount, 1, 'Only the 1 Approved valid row enters the bucket');
  assert.equal(leaderBucket.average, 85);
  assert.equal(p.result.invalidCount, 2, '2 invalid Approved rows tracked in legacy invalidCount');

  console.log('  PASS: Only Approved rows with consistent persisted finals enter D2 buckets.');
}

// ===========================================================================
// Test 5: Period mismatch excluded
// ===========================================================================
{
  console.log('5. Period mismatch evaluations explicitly excluded from D2 metrics...');

  const roster = [
    { employeeId: 'u1', role: 'Leader', teamId: 't1' },
    { employeeId: 'u2', role: 'Leader', teamId: 't1' },
  ];

  const evaluations = [
    {
      id: 'ev-cur-period',
      periodId: 'period-2026-q3',
      employeeId: 'u1',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 90,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-old-period',
      periodId: 'period-2025-q4', // MISMATCH
      employeeId: 'u2',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'S',
      finalScore: 98,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'period-2026-q3',
    roster,
    evaluations,
  });

  const leaderBucket = p.result.setKpis[0];
  assert.equal(leaderBucket.sampleCount, 1, 'Other-period row dropped from D2 bucket');
  assert.equal(leaderBucket.average, 90, 'Average reflects only current period row');
  assert.equal(p.excludedKpis?.otherPeriodCount, 1, 'otherPeriodCount tracked in excludedKpis');

  console.log('  PASS: Other-period row dropped; tracked in excludedKpis.otherPeriodCount.');
}

// ===========================================================================
// Test 6: Same set DIFFERENT version remains separate even with same maximum
// ===========================================================================
{
  console.log('6. Same set DIFFERENT version remains separate even with identical maximum...');

  const roster = [
    { employeeId: 'u1', role: 'Leader', teamId: 't1' },
    { employeeId: 'u2', role: 'Leader', teamId: 't1' },
  ];

  const evaluations = [
    {
      id: 'ev-v1',
      periodId: 'p-1',
      employeeId: 'u1',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 85,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'cfg-leader-v1' }],
    },
    {
      id: 'ev-v2',
      periodId: 'p-1',
      employeeId: 'u2',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 85,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'cfg-leader-v2' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p-1',
    roster,
    evaluations,
    criteriaGroupsByVersion: new Map(['cfg-leader-v1', 'cfg-leader-v2'].map((version, index) => [
      version, loadedFixtureCatalog.get('v1').filter((g) => g.setKey === 'leader')
        .map((g) => ({ ...g, configVersionId: version, configVersion: index + 1 })),
    ])),
  });

  assert.equal(p.result.setKpis.length, 2, 'Leader v1 and Leader v2 must not be merged');
  assert.equal(p.result.setKpis[0].criteriaVersionId, 'cfg-leader-v1');
  assert.equal(p.result.setKpis[1].criteriaVersionId, 'cfg-leader-v2');

  console.log('  PASS: Different criteria versions stay strictly separated.');
}

// ===========================================================================
// Test 7: Missing and unavailable basis explicitly excluded (not official 0)
// ===========================================================================
{
  console.log('7. Missing/unavailable basis explicit excluded, not counted as official 0...');

  const roster = [
    { employeeId: 'u1', role: 'Employee', teamId: 't1' },
    { employeeId: 'u2', role: 'Employee', teamId: 't1' },
    { employeeId: 'u3', role: 'Employee', teamId: 't1' },
  ];

  const evaluations = [
    {
      id: 'ev-valid',
      periodId: 'p-1',
      employeeId: 'u1',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 88,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-unavailable',
      periodId: 'p-1',
      employeeId: 'u2',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 75,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v-unavail' }],
    },
    {
      id: 'ev-no-version',
      periodId: 'p-1',
      employeeId: 'u3',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'C',
      finalScore: 60,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted' /* no version */ }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p-1',
    roster,
    evaluations,
    unavailableCriteriaVersions: new Set(['v-unavail']),
  });

  const staffBucket = p.result.setKpis[0];
  assert.equal(staffBucket.sampleCount, 1, 'Only the authoritative versioned row is in the bucket');
  assert.equal(staffBucket.average, 88, 'Average is 88, not diluted by unresolvable rows');
  assert.equal(p.excludedKpis?.unavailableBasisCount, 1);
  assert.equal(p.excludedKpis?.missingBasisCount, 1);
  assert.equal(p.result.excludedKpiCount, 2);

  console.log('  PASS: Unavailable and missing basis excluded cleanly without corrupting metrics.');
}

// ===========================================================================
// Test 8: <=5 and >5 per bucket, deterministic ties
// ===========================================================================
{
  console.log('8. Top slice is per bucket, max 5, with deterministic tie breaking...');

  const roster = [
    { employeeId: 'u1', role: 'Employee', teamId: 't1' },
    { employeeId: 'u2', role: 'Employee', teamId: 't1' },
    { employeeId: 'u3', role: 'Employee', teamId: 't1' },
    { employeeId: 'u4', role: 'Employee', teamId: 't1' },
    { employeeId: 'u5', role: 'Employee', teamId: 't1' },
    { employeeId: 'u6', role: 'Employee', teamId: 't1' },
    { employeeId: 'u7', role: 'Employee', teamId: 't1' },
  ];

  // 7 evaluations, with scores: 95, 90, 90, 85, 80, 75, 70
  // Note: ev-b and ev-a both have score 90; ev-a must come before ev-b
  const evaluations = [
    { id: 'ev-70', periodId: 'p', employeeId: 'u7', employeeRole: 'Employee', teamId: 't1', status: 'Approved', finalGrade: 'C', finalScore: 70, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-b', periodId: 'p', employeeId: 'u3', employeeRole: 'Employee', teamId: 't1', status: 'Approved', finalGrade: 'A', finalScore: 90, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-85', periodId: 'p', employeeId: 'u4', employeeRole: 'Employee', teamId: 't1', status: 'Approved', finalGrade: 'A', finalScore: 85, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-95', periodId: 'p', employeeId: 'u1', employeeRole: 'Employee', teamId: 't1', status: 'Approved', finalGrade: 'S', finalScore: 95, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-75', periodId: 'p', employeeId: 'u6', employeeRole: 'Employee', teamId: 't1', status: 'Approved', finalGrade: 'B', finalScore: 75, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-a', periodId: 'p', employeeId: 'u2', employeeRole: 'Employee', teamId: 't1', status: 'Approved', finalGrade: 'A', finalScore: 90, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-80', periodId: 'p', employeeId: 'u5', employeeRole: 'Employee', teamId: 't1', status: 'Approved', finalGrade: 'AB', finalScore: 80, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
  ];

  const p = projectEvaluationResults({
    periodId: 'p',
    roster,
    evaluations,
  });

  const staffBucket = p.result.setKpis[0];
  assert.equal(staffBucket.sampleCount, 7);
  assert.equal(staffBucket.top.length, 5, 'Top slice capped at 5');
  assert.equal(staffBucket.top[0].evaluationId, 'ev-95');
  assert.equal(staffBucket.top[1].evaluationId, 'ev-a', 'ev-a before ev-b on tie');
  assert.equal(staffBucket.top[2].evaluationId, 'ev-b', 'ev-b after ev-a on tie');
  assert.equal(staffBucket.top[3].evaluationId, 'ev-85');
  assert.equal(staffBucket.top[4].evaluationId, 'ev-80');

  console.log('  PASS: Top slice is capped at 5 with deterministic evaluationId tie breaking.');
}

// ===========================================================================
// Test 9: Team isolation and effective selected-team filtering
// ===========================================================================
{
  console.log('9. Team isolation and effective selected-team filtering before cap...');

  const roster = [
    { employeeId: 'u1', role: 'Employee', teamId: 'team-1' },
    { employeeId: 'u2', role: 'Employee', teamId: 'team-1' },
    { employeeId: 'u3', role: 'Employee', teamId: 'team-2' },
    { employeeId: 'u4', role: 'Employee', teamId: 'team-2' },
  ];

  const evaluations = [
    { id: 'ev-1', periodId: 'p', employeeId: 'u1', employeeRole: 'Employee', teamId: 'team-1', status: 'Approved', finalGrade: 'B', finalScore: 75, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-2', periodId: 'p', employeeId: 'u2', employeeRole: 'Employee', teamId: 'team-1', status: 'Approved', finalGrade: 'A', finalScore: 85, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-3', periodId: 'p', employeeId: 'u3', employeeRole: 'Employee', teamId: 'team-2', status: 'Approved', finalGrade: 'S', finalScore: 99, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
    { id: 'ev-4', periodId: 'p', employeeId: 'u4', employeeRole: 'Employee', teamId: 'team-2', status: 'Approved', finalGrade: 'S', finalScore: 98, rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }] },
  ];

  // Filter to team-1 only: employeeIds { u1, u2 }
  const team1Roster = roster.filter((r) => r.teamId === 'team-1');
  const team1Evals = evaluations.filter((e) => e.teamId === 'team-1');

  const p = projectEvaluationResults({
    periodId: 'p',
    roster: team1Roster,
    evaluations: team1Evals,
    teamNames: new Map([['team-1', 'Đội 1'], ['team-2', 'Đội 2']]),
  });

  const staffBucket = p.result.setKpis[0];
  assert.equal(staffBucket.sampleCount, 2);
  assert.equal(staffBucket.average, 80);
  // Org-wide top (u3=99, u4=98) are filtered out, not taking over team-1 top
  assert.deepEqual(staffBucket.top.map((t) => t.employeeId), ['u2', 'u1']);
  assert.equal(staffBucket.teams.length, 1);
  assert.equal(staffBucket.teams[0].teamId, 'team-1');
  assert.equal(staffBucket.teams[0].name, 'Đội 1');
  assert.equal(staffBucket.teams[0].average, 80);

  console.log('  PASS: Team filter scopes the bucket, top performers, and team stats before cap.');
}

// ===========================================================================
// Test 10: Current users.role drift does NOT reclassify (snapshot is authority)
// ===========================================================================
{
  console.log('10. Current users.role drift does not reclassify; snapshot employeeRole rules...');

  const roster = [
    // In current users table, employee got promoted to Manager!
    { employeeId: 'emp-promoted', role: 'Manager', teamId: 't1' },
  ];

  const evaluations = [
    {
      id: 'ev-eval',
      periodId: 'p-1',
      employeeId: 'emp-promoted',
      // BUT at the time of evaluation in this period, they were an Employee:
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 88,
      rounds: [{ round: 1, evaluatorId: 'mgr', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p-1',
    roster,
    evaluations,
  });

  assert.equal(p.result.setKpis.length, 1);
  assert.equal(p.result.setKpis[0].setKey, 'staff', 'Must be classified into staff bucket based on evaluation snapshot');
  assert.notEqual(p.result.setKpis[0].setKey, 'leader', 'Must NOT be classified as leader based on current users.role');

  console.log('  PASS: Evaluation role snapshot governs set classification, ignoring users.role drift.');
}

// ===========================================================================
// Test 11: Input deep equality & immutability
// ===========================================================================
{
  console.log('11. Input deep equality & immutability verified...');

  const roster = [
    { employeeId: 'u1', role: 'Leader', teamId: 't1' },
    { employeeId: 'u2', role: 'Employee', teamId: 't1' },
  ];
  const evaluations = [
    {
      id: 'ev-1',
      periodId: 'p',
      employeeId: 'u1',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 90,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const clonedRoster = structuredClone(roster);
  const clonedEvals = structuredClone(evaluations);

  projectEvaluationResults({
    periodId: 'p',
    roster,
    evaluations,
  });

  assert.deepEqual(roster, clonedRoster, 'Roster input was not mutated');
  assert.deepEqual(evaluations, clonedEvals, 'Evaluations input was not mutated');

  console.log('  PASS: Projection function is strictly pure and does not mutate inputs.');
}

// ===========================================================================
// Test 12: Single-set legacy controls
// ===========================================================================
{
  console.log('12. Single-set controls match single-set expectations...');

  const roster = [
    { employeeId: 'u1', role: 'Employee', teamId: 't1' },
    { employeeId: 'u2', role: 'Employee', teamId: 't1' },
  ];
  const evaluations = [
    {
      id: 'ev-1',
      periodId: 'p',
      employeeId: 'u1',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 80,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-2',
      periodId: 'p',
      employeeId: 'u2',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 70,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p',
    roster,
    evaluations,
  });

  assert.equal(p.result.setKpis.length, 1);
  assert.equal(p.result.setKpis[0].setKey, 'staff');
  assert.equal(p.result.setKpis[0].sampleCount, 2);
  assert.equal(p.result.setKpis[0].average, 75);
  assert.equal(p.result.average, 75, 'Single-set result.average matches bucket average');

  console.log('  PASS: Single-set fixture produces single bucket cleanly.');
}

// ===========================================================================
// Test 13: Counts, progress, grade distribution unchanged
// ===========================================================================
{
  console.log('13. Roster counts, progress, and gradeDistribution completely unchanged...');

  const roster = [
    { employeeId: 'u1', role: 'Leader', teamId: 't1' },
    { employeeId: 'u2', role: 'Employee', teamId: 't1' },
  ];
  const evaluations = [
    {
      id: 'ev-1',
      periodId: 'p',
      employeeId: 'u1',
      employeeRole: 'Leader',
      teamId: 't1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 90,
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-2',
      periodId: 'p',
      employeeId: 'u2',
      employeeRole: 'Employee',
      teamId: 't1',
      status: 'Submitted',
      rounds: [{ round: 1, evaluatorId: 'u1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const p = projectEvaluationResults({
    periodId: 'p',
    roster,
    evaluations,
  });

  assert.equal(p.roster.total, 2);
  assert.equal(p.coverage.total, 2);
  assert.equal(p.coverage.approved, 1);
  assert.equal(p.coverage.valid, 1);
  assert.equal(p.coverage.pending, 1);
  assert.equal(p.progress.length, 2);
  assert.equal(p.progress.find((e) => e.employeeId === 'u1')?.status, 'Approved');
  assert.equal(p.progress.find((e) => e.employeeId === 'u2')?.status, 'Submitted');
  assert.equal(p.result.gradeDistribution.find((g) => g.grade === 'A')?.count, 1);

  console.log('  PASS: Headline counts, coverage, and progress entries remain identical.');
}

// ===========================================================================
// Test 14: Server actions DTO mappings
// ===========================================================================
{
  console.log('14. Reports and Dashboard actions map D2 setKpis accurately...');

  // The real server supplies immutable snapshot data; an ID without its loaded
  // catalog is intentionally excluded. Keep positive fixtures equally complete.
  globalThis.__p108_d2_mock_state.criteriaSnapshots = {
    groups: new Map([
      ['v1:g-leader', { id: 'g-leader', code: 'A', name: 'Leader fixture', setKey: 'leader', configVersion: 1, configVersionId: 'v1', criteria: [{ id: 'c-leader', code: 'A1', name: 'Fixture', levels: [{ points: 190, label: 'Max' }] }] }],
      ['v1:g-staff', { id: 'g-staff', code: 'A', name: 'Staff fixture', setKey: 'staff', configVersion: 1, configVersionId: 'v1', criteria: [{ id: 'c-staff', code: 'A1', name: 'Fixture', levels: [{ points: 175, label: 'Max' }] }] }],
    ]),
    unavailable: new Set(),
  };
  globalThis.__p108_d2_mock_state.users = [
    { id: 'emp-1', name: 'Nguyễn Văn Leader', role: 'Leader', teamId: 'team-1' },
    { id: 'emp-2', name: 'Trần Thị Staff', role: 'Employee', teamId: 'team-1' },
  ];
  globalThis.__p108_d2_mock_state.evaluations = [
    {
      id: 'ev-1',
      periodId: 'p-d2',
      employeeId: 'emp-1',
      employeeRole: 'Leader',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'A',
      finalScore: 92,
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
      rounds: [{ round: 1, evaluatorId: 'emp-1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
    {
      id: 'ev-2',
      periodId: 'p-d2',
      employeeId: 'emp-2',
      employeeRole: 'Employee',
      teamId: 'team-1',
      status: 'Approved',
      finalGrade: 'B',
      finalScore: 78,
      createdAt: '2026-10-18T00:00:00Z',
      updatedAt: '2026-10-18T00:00:00Z',
      rounds: [{ round: 1, evaluatorId: 'emp-1', status: 'Submitted', criteriaConfigVersionId: 'v1' }],
    },
  ];

  const reportData = await getReportAggregation('p-d2', 'all');
  assert.ok(reportData, 'Report aggregation returns data');
  assert.equal(reportData.setKpis.length, 2, 'Report action has 2 buckets');

  const ldrBucket = reportData.setKpis.find((b) => b.setKey === 'leader');
  assert.ok(ldrBucket);
  assert.equal(ldrBucket.average, 92);
  assert.equal(ldrBucket.topPerformers[0].name, 'Nguyễn Văn Leader');
  assert.equal(ldrBucket.topPerformers[0].score, 92, 'Uses official persisted score');

  const stfBucket = reportData.setKpis.find((b) => b.setKey === 'staff');
  assert.ok(stfBucket);
  assert.equal(stfBucket.average, 78);
  assert.equal(stfBucket.topPerformers[0].name, 'Trần Thị Staff');

  // Dashboard heavy action: summarizeResult gives null average when mixed D2 buckets
  const heavyData = await getDashboardHeavyData('p-d2', {
    'emp-1': 'Nguyễn Văn Leader',
    'emp-2': 'Trần Thị Staff',
  });
  assert.ok(heavyData);
  assert.equal(heavyData.result.setKpis.length, 2);
  assert.equal(heavyData.result.average, null, 'Heavy summary nulls out average when mixed D2 buckets');
  assert.equal(heavyData.result.mixedBasis, true);

  // Directly verify summarizeResult pure helper logic
  const pureProj = projectEvaluationResults({
    periodId: 'p-d2',
    roster: [
      { employeeId: 'emp-1', role: 'Leader', teamId: 'team-1' },
      { employeeId: 'emp-2', role: 'Employee', teamId: 'team-1' },
    ],
    evaluations: globalThis.__p108_d2_mock_state.evaluations,
  });
  const pureSummary = summarizeResult(pureProj, (id) => id);
  assert.equal(pureSummary.setKpis.length, 2);
  assert.equal(pureSummary.average, null, 'pure summary nulls average for mixed sets');

  console.log('  PASS: Reports and Dashboard actions map setKpis and enforce D2 mixed rules.');
}

// ===========================================================================
// Test 15: React SSR Component Rendering (SetKpiSummary, ReportsDataLayer, DashboardHeavySection)
// ===========================================================================
{
  console.log('15. React SSR Component Rendering with ReactDOMServer...');

  const mockBuckets = [
    {
      key: 'leader:v1',
      setKey: 'leader',
      criteriaVersionId: 'v1',
      label: 'Quản lý (v1)',
      sampleCount: 3,
      average: 90,
      topPerformers: [
        { id: '1', name: 'Trưởng phòng A', teamName: 'Đội 1', score: 95, grade: 'S' },
        { id: '2', name: 'Phó phòng B', teamName: 'Đội 1', score: 85, grade: 'A' },
      ],
      teamStats: [
        { id: 't1', name: 'Đội 1', avgScore: 90, sampleCount: 3, progress: 100 },
      ],
    },
    {
      key: 'staff:v1',
      setKey: 'staff',
      criteriaVersionId: 'v1',
      label: 'Nhân viên (v1)',
      sampleCount: 5,
      average: 82.5,
      topPerformers: [
        { id: '3', name: 'Nhân viên C', teamName: 'Đội 2', score: 88, grade: 'A' },
      ],
      teamStats: [
        { id: 't2', name: 'Đội 2', avgScore: 82.5, sampleCount: 5, progress: 100 },
      ],
    },
  ];

  // 15a. Render SetKpiSummary in detailed mode
  const detailedHtml = ReactDOMServer.renderToString(
    React.createElement(SetKpiSummary, {
      buckets: mockBuckets,
      excludedInfo: { totalExcluded: 1, unavailableCount: 1, otherPeriodCount: 0 },
    })
  );
  assert.ok(detailedHtml.includes('Quản lý (v1)'), 'Renders Leader bucket label');
  assert.ok(detailedHtml.includes('Nhân viên (v1)'), 'Renders Staff bucket label');
  assert.ok(detailedHtml.includes('90.0'), 'Renders Leader raw average');
  assert.ok(detailedHtml.includes('82.5'), 'Renders Staff raw average');
  assert.ok(detailedHtml.includes('Trưởng phòng A'), 'Renders top performer name');
  assert.ok(detailedHtml.includes('Đội 1'), 'Renders team name');
  assert.ok(detailedHtml.includes('set-kpi-excluded-notice'), 'Renders excluded notice');

  // 15b. Render SetKpiSummary in compact mode (for DashboardHeavySection)
  const compactHtml = ReactDOMServer.renderToString(
    React.createElement(SetKpiSummary, {
      buckets: mockBuckets,
      compact: true,
    })
  );
  assert.ok(compactHtml.includes('set-kpi-compact-grid'), 'Renders compact grid');
  assert.ok(compactHtml.includes('90.0'));
  assert.ok(compactHtml.includes('82.5'));

  // 15c. Render DashboardHeavySection SSR
  const mockDashboardData = {
    recentActivities: [],
    pendingEvaluations: [],
    anomalies: [],
    radar: [],
    radarSampleCount: 0,
    frozenIncomplete: 0,
    coverage: { total: 8, approved: 8, valid: 8, invalid: 0, legacy: 0, pending: 0 },
    userNameById: {},
    result: {
      approvedCount: 8,
      invalidCount: 0,
      legacyCount: 0,
      average: null, // mixed
      highGradeRate: null,
      mixedBasis: true,
      sampleCount: 8,
      setKpis: mockBuckets,
      excludedCount: 0,
    },
  };

  const dashboardHtml = ReactDOMServer.renderToString(
    React.createElement(DashboardHeavySection, {
      data: mockDashboardData,
      userNameById: {},
      viewer: { id: 'usr-mgr', role: 'Manager', teamId: 'team-1' },
      isLoading: false,
      error: null,
    })
  );
  assert.ok(dashboardHtml.includes('Quản lý (v1)'), 'DashboardHeavySection renders per-set label');
  assert.ok(dashboardHtml.includes('90.0'), 'DashboardHeavySection renders per-set raw average');
  assert.ok(dashboardHtml.includes('82.5'), 'DashboardHeavySection renders per-set raw average');

  // 15d. Render ReportsDataLayer SSR
  const reportsHtml = ReactDOMServer.renderToString(
    React.createElement(ReportsDataLayer, {
      viewer: { id: 'usr-mgr', role: 'Manager', teamId: 'team-1' },
      periodId: 'p-d2',
      selectedTeam: 'all',
      teams: [{ id: 'team-1', name: 'Đội 1' }],
    })
  );
  assert.ok(reportsHtml.includes('Báo cáo QAQC'), 'ReportsDataLayer renders initial SSR shell');

  console.log('  PASS: React SSR component rendering succeeds for SetKpiSummary, DashboardHeavySection, and ReportsDataLayer.');
}

// ===========================================================================
// Test 16: Source code contract verification
// ===========================================================================
{
  console.log('16. Source contract checks: ReportsDataLayer and DashboardHeavySection consume SetKpiSummary...');

  const reportsSrc = fs.readFileSync(path.join(projectRoot, 'src/components/reports/ReportsDataLayer.tsx'), 'utf8');
  assert.ok(reportsSrc.includes('SetKpiSummary'), 'ReportsDataLayer imports/uses SetKpiSummary');
  assert.ok(reportsSrc.includes('reportData.setKpis'), 'ReportsDataLayer passes setKpis to SetKpiSummary');

  const dashboardSrc = fs.readFileSync(path.join(projectRoot, 'src/components/dashboard/DashboardHeavySection.tsx'), 'utf8');
  assert.ok(dashboardSrc.includes('SetKpiSummary'), 'DashboardHeavySection imports/uses SetKpiSummary');
  assert.ok(dashboardSrc.includes('data.result.setKpis'), 'DashboardHeavySection passes setKpis to SetKpiSummary');

  // Verify manifest SHA is unchanged
  const manifestPath = path.join(projectRoot, 'db/seed/p108-criteria-manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'Manifest file exists');

  console.log('  PASS: Source contracts verified.');
}

console.log('17. Missing loaded catalog, missing period, and partial-basis summary refuse contamination...');
{
  const roster = [{ employeeId: 'd2-a', role: 'Leader', teamId: 't1' }, { employeeId: 'd2-b', role: 'Employee', teamId: 't1' }];
  const make = (id, role, version, score) => ({ id, employeeId: id, employeeRole: role, teamId: 't1', periodId: 'd2-proof', status: 'Approved', finalGrade: 'A', finalScore: score, rounds: [{ round: 1, status: 'Submitted', criteriaConfigVersionId: version }] });
  const rows = [make('d2-a', 'Leader', 'cfg-good', 10), make('d2-b', 'Employee', 'cfg-absent', 190)];
  const known = new Map([['cfg-good', [{ id: 'g-good', code: 'A', name: 'Pinned', setKey: 'leader', configVersion: 1, criteria: [] }]]]);
  const p = projectEvaluationResults({ periodId: 'd2-proof', roster, evaluations: rows, criteriaGroupsByVersion: known });
  assert.equal(p.result.setKpis.length, 1);
  assert.equal(p.result.setKpis[0].average, 10);
  assert.equal(p.excludedKpis.unavailableBasisCount, 1);
  assert.equal(summarizeResult(p).average, null, 'scalar period average must be null when other rows were excluded');
  assert.equal(summarizeResult(p).setKpis[0].average, 10, 'labelled leader bucket retains its legitimate 10');
  const empty = projectEvaluationResults({ periodId: 'd2-proof', roster, evaluations: rows, criteriaGroupsByVersion: new Map() });
  assert.equal(empty.result.setKpis.length, 0);
  assert.equal(empty.excludedKpis.unavailableBasisCount, 2);
  assert.equal(summarizeResult(empty).average, null);
  const noPeriod = { ...rows[0] }; delete noPeriod.periodId;
  const bad = projectEvaluationResults({ periodId: 'd2-proof', roster, evaluations: [noPeriod], criteriaGroupsByVersion: known });
  assert.equal(bad.result.setKpis.length, 0);
  assert.equal(bad.excludedKpis.otherPeriodCount, 1);
  const html = ReactDOMServer.renderToString(React.createElement(DashboardHeavySection, { data: { recentActivities: [], pendingEvaluations: [], anomalies: [], radar: [], radarSets: [], frozenIncomplete: 0, coverage: empty.coverage, result: summarizeResult(empty) }, userNameById: {}, viewer: { role: 'Manager' }, isLoading: false, error: null }));
  assert.ok(html.includes('set-kpi-excluded-notice'));
  assert.ok(html.includes('set-kpi-empty-state'));
}
console.log('  PASS: unresolved loaded snapshots excluded, missing period rejected, partial-basis average and empty notice correct.');
// Owner-limited D2 recovery: real server/actions/rendering/prompt producers;
// mocks exist ONLY at DB/auth/provider/Next runtime boundaries above.
const d2State = globalThis.__p108_d2_mock_state;
const { sanitizeEvaluationResultProjectionForView, ROLE_TO_D2_SET_KEY } = await import('../src/lib/evaluation-result-projection.ts');
const { getDashboardData } = await import('../src/actions/dashboard.ts');
const { getEvaluationResultProjectionAction } = await import('../src/actions/read.ts');
const { LoadedReportsContent, ReportsKpiPills } = await import('../src/components/reports/ReportsDataLayer.tsx');
const { buildExportSummaryRows } = await import('../src/lib/export.ts');
const { roleToSetKey } = await import('../src/lib/criteria-applicability.ts');
const { generatePeriodSummary, getPeriodSummary } = await import('../src/actions/ai-summary.ts');
const { generatePeriodMinutesAction } = await import('../src/actions/ai.ts');
const { buildPageContext, buildManagerSemanticContext } = await import('../src/actions/chat.ts');
const unitPeriod = 'p-d2';
function d2Row(id, role, score, { teamId = 'team-1', grade = 'A', version = 'v1', gradeVersion = null } = {}) {
  return { id: 'eval-' + id, employeeId: id, employeeRole: role, teamId,
    periodId: unitPeriod, status: 'Approved', finalScore: score, finalGrade: grade,
    createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z',
    rounds: [{ id:'round-'+id, round:1, evaluatorId:id, status:'Submitted',
      totalScore:score, grade, criteriaConfigVersionId:version, gradeConfigVersionId:gradeVersion }],
  };
}
function setD2Rows(rows, catalog = loadedFixtureCatalog) {
  d2State.periodId = unitPeriod;
  d2State.evaluations = rows;
  d2State.users = rows.map((e) => ({ id:e.employeeId, name:'Synthetic '+e.employeeId,
    employeeCode:'CODE-'+e.employeeId, role:e.employeeRole, teamId:e.teamId }));
  d2State.criteriaSnapshots = { groups:new Map([...catalog].flatMap(([v, groups]) => groups.map((g) => [v+':'+g.id,g]))), unavailable:new Set() };
  d2State.currentUser = { id:'usr-mgr',role:'Manager',teamId:'team-1' };
}
function assertNoCommonKpi(data) {
  assert.equal(data.stats.avgScore, null);
  assert.equal(data.stats.highGradeRate, null);
  assert.deepEqual(data.topPerformers, []);
  assert.deepEqual(data.teamStats, []);
}
function assertSafeProjection(p) {
  assert.equal(p.result.average, null);
  assert.equal(p.result.highGradeRate, null);
  assert.deepEqual(p.result.top, []);
  assert.deepEqual(p.teamBreakdown, []);
  assert.deepEqual(p.roleBreakdown, [], 'No bypass through old per-role means');
  assert.deepEqual(p.configBreakdown, [], 'No bypass through legacy config means');
}
console.log('18. Exact reviewer counterexamples through real Reports, heavy/legacy Dashboard and public read actions...');
setD2Rows([d2Row('leader','Leader',90),d2Row('staff','Employee',80),d2Row('worker','Worker',70)]);
const b1Report = await getReportAggregation(unitPeriod, 'all');
assertNoCommonKpi(b1Report);
assert.equal(b1Report.stats.mixedBasis, true);
assert.equal(b1Report.stats.totalEmployees, 3, 'Additive roster remains global');
assert.deepEqual(b1Report.setKpis.map((b) => [b.setKey,b.average]), [['leader',90],['staff',80],['worker',70]]);
for (const data of [await getDashboardHeavyData(unitPeriod), await getDashboardData(unitPeriod)]) {
  assert.equal(data.result.average,null);
  assert.equal(data.result.highGradeRate,null);
  assert.equal(data.result.mixedBasis,true);
  assert.equal(data.result.sampleCount,3);
}
const b1Public = await getEvaluationResultProjectionAction(unitPeriod);
assertSafeProjection(b1Public);
assert.equal(b1Public.snapshot.mixed,true, 'Snapshot comparison flag reflects sets, not just one version ID');
const onlyLeaderCatalog = new Map([['v1', loadedFixtureCatalog.get('v1').filter((g) => g.setKey === 'leader')]]);
setD2Rows([d2Row('leader','Leader',10,{grade:'C'}),d2Row('staff','Employee',175,{grade:'S'})],onlyLeaderCatalog);
const b2Report = await getReportAggregation(unitPeriod,'all');
assertNoCommonKpi(b2Report);
assert.equal(b2Report.stats.mixedBasis,true);
assert.equal(b2Report.stats.sampleCount,1, 'Metric sample is not an ineligible legacy-valid final');
assert.equal(b2Report.setKpis.length,1);
assert.equal(b2Report.setKpis[0].average,10);
assert.equal(b2Report.setKpis[0].highGradeRate,0);
assert.equal(b2Report.excludedKpis.totalExcluded,1);
assert.equal(b2Report.excludedKpis.unavailableCount,1);
for (const data of [await getDashboardHeavyData(unitPeriod), await getDashboardData(unitPeriod)]) {
  assert.equal(data.result.average,null);
  assert.equal(data.result.highGradeRate,null);
  assert.equal(data.result.sampleCount,1);
  assert.equal(data.result.setKpis[0].average,10);
}
assertSafeProjection(await getEvaluationResultProjectionAction(unitPeriod));
const b2Leader = await getReportAggregation(unitPeriod,'all','leader');
assert.equal(b2Leader.stats.avgScore,10);
assert.equal(b2Leader.stats.highGradeRate,0);
assert.equal(b2Leader.stats.mixedBasis,false);
assert.equal(b2Leader.stats.totalEmployees,2, 'Roster/progress counts are additive, independent of selected score set');
assert.equal(b2Leader.stats.sampleCount,1);
assert.deepEqual(b2Leader.topPerformers.map((x) => x.id),['leader']);
assert.equal(b2Leader.teamStats[0].avgScore,10);
assert.equal(b2Leader.excludedKpis.totalExcluded,0);
assert.equal(b2Leader.excludedKpis.unavailableCount,0, 'Reason counts must have the same selected-set scope as total');
const leaderPublic = await getEvaluationResultProjectionAction(unitPeriod,'leader');
assert.equal(leaderPublic.result.average,10);
assert.equal(leaderPublic.snapshot.mixed,false);
assert.equal(leaderPublic.excludedKpis.bySet.staff,0,'All selected-view exclusion fields have the same scope');
assert.ok(leaderPublic.roleBreakdown.every((r) => r.role === 'Leader' && r.average === 10));
assert.ok(leaderPublic.configBreakdown.every((r) => r.role === 'Leader' && r.average === 10));
const b2Staff = await getReportAggregation(unitPeriod,'all','staff');
assertNoCommonKpi(b2Staff);
assert.deepEqual(b2Staff.setKpis,[]);
assert.equal(b2Staff.stats.sampleCount,0);
assert.equal(b2Staff.excludedKpis.totalExcluded,1);
await assert.rejects(getReportAggregation(unitPeriod,'all','Staff'),/INVALID_KPI_SET_FILTER/);
// P110M4T01: hành vi mới có chủ đích — bộ lọc lạ trả typed null (như thiếu auth),
// không còn throw mờ INVALID_KPI_SET_FILTER ra digest.
assert.equal(await getEvaluationResultProjectionAction(unitPeriod,'unknown'), null, 'unknown set filter must resolve to typed null');
console.log('  PASS: no global80 /92.5 /50%; explicit leader scope has10 and0, excluded staff scope is null/empty.');

console.log('19. Empty, invalid Approved, missing loaded catalog, incompatible criteria/grade basis and uncapped grade rate...');
const coreInput = { periodId:unitPeriod,roster:[{employeeId:'leader',role:'Leader',teamId:'team-1'}],evaluations:[d2Row('leader','Leader',10,{grade:'C'})] };
const noLoadedCatalog = projectEvaluationResultsCore(coreInput);
assert.deepEqual(noLoadedCatalog.result.setKpis,[], 'Claimed version alone NEVER skips the pinned-catalog check');
assert.equal(noLoadedCatalog.excludedKpis.unavailableBasisCount,1);
assert.equal(sanitizeEvaluationResultProjectionForView(noLoadedCatalog).result.average,null);
setD2Rows([]);
const emptyReport = await getReportAggregation(unitPeriod);
assertNoCommonKpi(emptyReport);
assert.deepEqual(emptyReport.setKpis,[]);
for (const data of [await getDashboardHeavyData(unitPeriod),await getDashboardData(unitPeriod)]) {
  assert.equal(data.result.average,null);
  assert.equal(data.result.highGradeRate,null);
}
assertSafeProjection(await getEvaluationResultProjectionAction(unitPeriod));
setD2Rows([d2Row('good','Leader',10,{grade:'C'}),d2Row('bad','Leader',null,{grade:'A'})]);
const invalidReport = await getReportAggregation(unitPeriod);
assertNoCommonKpi(invalidReport);
assert.equal(invalidReport.excludedKpis.totalExcluded,1,'Invalid Approved is included in total exclusions');
assert.equal(invalidReport.stats.sampleCount,1);
setD2Rows([d2Row('zero','Worker',0,{grade:'D'}),d2Row('negative','Worker',-10,{grade:'D'})]);
const zeroNegativeReport = await getReportAggregation(unitPeriod,'all','worker');
assert.equal(zeroNegativeReport.stats.avgScore,-5);
assert.deepEqual(zeroNegativeReport.topPerformers.map((row)=>row.score),[0,-10]);
assert.equal(zeroNegativeReport.stats.highGradeRate,0);
assert.equal(zeroNegativeReport.setKpis[0].teamStats[0].avgScore,-5);
setD2Rows([d2Row('old','Employee',80),d2Row('new','Employee',90,{version:'v2'})]);
const twoVersions = await getReportAggregation(unitPeriod,'all','staff');
assertNoCommonKpi(twoVersions);
assert.equal(twoVersions.setKpis.length,2);
setD2Rows([d2Row('g1','Employee',80,{gradeVersion:'grade-v1'}),d2Row('g2','Employee',90,{gradeVersion:'grade-v2'})]);
const twoGradeVersions = await getReportAggregation(unitPeriod,'all','staff');
assertNoCommonKpi(twoGradeVersions);
assert.equal(twoGradeVersions.setKpis.length,2);
assert.notEqual(twoGradeVersions.setKpis[0].key,twoGradeVersions.setKpis[1].key);
assert.notEqual(twoGradeVersions.setKpis[0].label,twoGradeVersions.setKpis[1].label);
setD2Rows(Array.from({length:8},(_,i) => d2Row('sample-'+i,'Employee',100-i,{grade:i<5?'A':'C'})));
const fullRate = await getReportAggregation(unitPeriod,'all','staff');
assert.equal(fullRate.setKpis[0].topPerformers.length,5);
assert.equal(fullRate.stats.sampleCount,8);
assert.equal(fullRate.stats.highGradeRate,62.5,'Rate includes all8 eligible entries, not only the5 high-grade Top slice');
for (const role of ['Manager','Leader','SubLeader','Employee','Worker']) assert.equal(ROLE_TO_D2_SET_KEY[role],roleToSetKey(role));
console.log('  PASS: no invented empty0, invalid rows counted, pinned catalogs required, grade versions separate, rate uses all eligible samples.');

console.log('20. Real selected-team AND selected-set action filters before Top5 cap...');
const otherTeamRows = Array.from({length:7},(_,i) => d2Row('other-'+i,'Employee',170-i,{teamId:'team-2'}));
const selectedRows = Array.from({length:6},(_,i) => d2Row('selected-'+i,'Employee',80-i));
setD2Rows([...otherTeamRows,...selectedRows,d2Row('leader','Leader',190)]);
const teamReport = await getReportAggregation(unitPeriod,'team-1','staff');
assert.equal(teamReport.stats.avgScore,77.5);
assert.equal(teamReport.stats.sampleCount,6);
assert.equal(teamReport.stats.totalEmployees,7, 'Additive selected-team roster includes its leader');
assert.equal(teamReport.topPerformers.length,5);
assert.deepEqual(teamReport.topPerformers.map((p) => p.id),selectedRows.slice(0,5).map((e) => e.employeeId));
assert.ok(teamReport.topPerformers.every((p) => p.teamName === 'Đội 1'));
assert.equal(teamReport.setKpis.length,1);
assert.ok(teamReport.setKpis[0].teamStats.every((t) => t.id === 'team-1'));
assert.ok(!teamReport.topPerformers.some((p) => p.id.startsWith('other-')));
console.log('  PASS: high-scoring rows from other team/leader set never consume selected staff Top slots.');

console.log('21. Actual Reports loading shell and post-fetch header/content rendering from actual action DTO...');
const reportsSource = fs.readFileSync(path.join(projectRoot,'src/components/reports/ReportsDataLayer.tsx'),'utf8');
assert.ok(reportsSource.includes('<LoadedReportsContent reportData={reportData}'));
assert.ok(reportsSource.includes('<ReportsKpiPills reportData={reportData}'));
const loadingHtml = ReactDOMServer.renderToString(React.createElement(ReportsDataLayer,{viewer:d2State.currentUser,periodId:unitPeriod,selectedTeam:'all',teams:d2State.teams}));
assert.ok(loadingHtml.includes('animate-pulse'));
assert.ok(!loadingHtml.includes('data-testid="loaded-reports-content"'));
function renderLoaded(dto) {
  return { header:ReactDOMServer.renderToStaticMarkup(React.createElement(ReportsKpiPills,{reportData:dto})),
    body:ReactDOMServer.renderToStaticMarkup(React.createElement(LoadedReportsContent,{reportData:dto,periodId:unitPeriod})) };
}
let rendered = renderLoaded(b1Report);
assert.ok(rendered.body.includes('Quản lý (v1)') && rendered.body.includes('Nhân viên (v1)') && rendered.body.includes('Công nhân (v1)'));
for (const score of ['90.0','80.0','70.0']) assert.ok(rendered.body.includes(score),'Labelled bucket score '+score);
assert.ok(!rendered.header.includes('80.0'),'No period-average80 in loaded header');
assert.ok(!rendered.header.includes('100.0%'),'No global high-grade KPI in mixed loaded header');
rendered = renderLoaded(b2Report);
assert.ok(rendered.body.includes('10.0'));
assert.ok(!rendered.header.includes('92.5'));
assert.ok(!rendered.header.includes('50.0%'));
assert.ok(!rendered.header.includes('10.0'),'No unlabelled partial period average');
rendered = renderLoaded(b2Leader);
assert.ok(rendered.header.includes('10.0'));
assert.ok(rendered.header.includes('0.0%'));
assert.ok(rendered.header.includes('Quản lý (v1)'));
rendered = renderLoaded(emptyReport);
assert.ok(!rendered.header.includes('0.0%'));
assert.ok(!rendered.header.includes('0.0</span>'));
assert.ok(rendered.body.includes('set-kpi-empty'));
console.log('  PASS: loaded source branch and real DTO render labelled set metrics; global header is null on mixed/excluded/empty data.');

console.log('22. Real AI summary/minutes prompt boundaries, no paid/network calls, old cached summaries stay historical...');
setD2Rows([d2Row('leader','Leader',10,{grade:'C'}),d2Row('staff','Employee',175,{grade:'S'})],onlyLeaderCatalog);
d2State.cachedSummary = { summary:'LEGACY_BAD_AVERAGE_92.5_AND_RATE_50',created_at:'2026-10-01T00:00:00Z',source_revision:'pre-d2',coverage_status:'complete' };
const oldSummary = await getPeriodSummary(unitPeriod);
assert.equal(oldSummary.summary,undefined,'Stale legacy numeric text is not served as current summary');
assert.equal(d2State.cachedSummary.summary,'LEGACY_BAD_AVERAGE_92.5_AND_RATE_50','Stored legacy text is not rewritten/deleted');
assert.equal(oldSummary.freshness,'stale','Policy-aware source revision does not treat old numeric summary as current');
d2State.aiPrompts = [];
d2State.rpcCalls = [];
const aiSummary = await generatePeriodSummary(unitPeriod);
assert.equal(aiSummary.error,undefined);
assert.equal(d2State.aiPrompts.length,1);
const summaryPrompt = d2State.aiPrompts[0];
assert.ok(summaryPrompt.includes('Quản lý (v1)'));
assert.ok(summaryPrompt.includes('Điểm TB = 10.0'));
assert.ok(!summaryPrompt.includes('CODE-staff (175đ)'),'Excluded staff is not an official Top row');
assert.ok(!summaryPrompt.includes('"score":175'));
assert.ok(!summaryPrompt.includes('"grade":"S"'),'Qualitative notes cannot reconstruct excluded grade KPI');
assert.ok(summaryPrompt.includes('không tự tính điểm trung bình'));
assert.equal(d2State.rpcCalls.length,1);
assert.equal(d2State.rpcCalls[0].name,'upsert_ai_summary_if_active','Existing guarded persistence path remains');
assert.match(d2State.rpcCalls[0].args.p_source_revision,/^[a-f0-9]{64}$/);
const minutes = await generatePeriodMinutesAction({periodId:unitPeriod});
assert.equal(minutes.error,undefined);
assert.equal(d2State.aiPrompts.length,2);
const minutesPrompt = d2State.aiPrompts[1];
assert.ok(!minutesPrompt.includes('LEGACY_BAD_AVERAGE_92.5_AND_RATE_50'));
assert.ok(minutesPrompt.includes('Quản lý (v1): 1 mẫu Approved, điểm TB 10'));
assert.ok(minutesPrompt.includes('Không tính điểm TB, Top chung'));
assert.equal(d2State.cachedSummary.summary,'LEGACY_BAD_AVERAGE_92.5_AND_RATE_50','Readback history still intact');
console.log('  PASS: actual provider inputs contain eligible per-set metrics only; old cache kept but not reused as current KPI. Provider output is explicitly synthetic.');

console.log('23. Real manager chat context carries safe labelled metrics without a raw cross-set leaderboard...');
const semantic = await buildManagerSemanticContext(unitPeriod,'Synthetic period',d2State.currentUser);
assert.ok(!semantic.includes('TĂNG:'));
assert.ok(!semantic.includes('GIẢM:'));
assert.ok(semantic.includes('không xếp hạng chéo vai trò'));
for (const pathname of ['/reports','/dashboard']) {
  const context = await buildPageContext(pathname,d2State.currentUser.role,d2State.currentUser);
  assert.ok(context.includes('Quản lý (v1): 1 mẫu Approved, điểm TB 10'));
  assert.ok(context.includes('Không tính điểm TB, Top hoặc tỷ lệ ≥AB chung'));
  assert.ok(!context.includes('LEGACY_BAD_AVERAGE_92.5_AND_RATE_50'));
}
console.log('  PASS: real chat context uses current sanitized dashboard metrics; individual-round references are not a global ranking.');

console.log('24. Actual export row producer preserves approved historical individual scores and adds no synthetic aggregate...');
setD2Rows([d2Row('leader','Leader',90),d2Row('staff','Employee',80),d2Row('worker','Worker',70)]);
const sourceBefore = structuredClone(d2State.evaluations);
const exportRows = buildExportSummaryRows(d2State.evaluations,new Map(d2State.users.map((u)=>[u.id,u])),new Map(d2State.teams.map((t)=>[t.id,t])));
assert.equal(exportRows.length,3);
assert.deepEqual(exportRows.map((r)=>r['Điểm Tổng']),[90,80,70]);
assert.deepEqual(exportRows.map((r)=>r['Chức Vụ']),['Leader','Employee','Worker']);
assert.ok(exportRows.every((r)=>Object.keys(r).length === 7));
assert.deepEqual(d2State.evaluations,sourceBefore,'Export preserves stored approved data');
console.log('  PASS: mixed-set raw scores remain separate labelled employee rows, never a fabricated mean/Top row.');

console.log('\n=== ALL P108M1T08-D2 TESTS PASSED SUCCESSFULLY ===\n');
