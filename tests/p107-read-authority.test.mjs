// =============================================================================
// P107M1T03 — Server read authority & appointed-Leader behavior suite
// =============================================================================
// Offline, self-contained node:test suite. No network, no database, no
// node_modules. It exercises the REAL pure authorization functions and the
// static source contracts of the landed P107 read-authority delta.
//
// Module loading (same mechanism as tests/password-seed.test.mjs):
//   * Node native TypeScript type-stripping executes the real .ts sources.
//   * A small ESM resolve hook maps the '@/...' path alias to src/*.ts and
//     stubs the type-only '@/types' and '@/types/database' barrels, whose
//     interface exports have no runtime bindings.
//
// Fixture: tests/fixtures/p107/read-authority/synthetic-fixtures.json
// (15 cases CASE-P107-01 .. CASE-P107-15).
// =============================================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '..');

// The resolve hook below anchors '@/...' to the project root. The suite is
// specified to run from the worktree root, but re-anchor defensively so it is
// independent of invocation directory.
const projectMarker = path.join('src', 'data', 'workflow.ts');
if (!fs.existsSync(path.join(process.cwd(), projectMarker)) && fs.existsSync(path.join(rootDir, projectMarker))) {
  process.chdir(rootDir);
}

// --- Type barrel stubs (value-imported by the real modules, purely types) ----
const TYPES_STUB = [
  'export const Role = {};',
  'export const User = {};',
  'export const Database = {};',
  'export const Evaluation = {};',
  'export const EvaluationRound = {};',
  'export const EvaluationPeriod = {};',
  'export const EvaluationRoundStatus = {};',
  'export const EvaluationRoundMetadata = {};',
  'export const PeriodStatus = {};',
  'export const EvalStatus = {};',
  'export const RoundNumber = {};',
  'export const Grade = {};',
  'export const Team = {};',
].join('\n');

const DB_STUB = [
  'export const Tables = {};',
  'export const Database = {};',
  'export const Json = {};',
].join('\n');

const loaderSource = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const rootDir = ${JSON.stringify(rootDir)};
const TYPES = ${JSON.stringify(TYPES_STUB)};
const DB = ${JSON.stringify(DB_STUB)};

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "@/types") {
    return { url: "data:text/javascript," + encodeURIComponent(TYPES), shortCircuit: true, format: "module" };
  }
  if (specifier === "@/types/database") {
    return { url: "data:text/javascript," + encodeURIComponent(DB), shortCircuit: true, format: "module" };
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
  return nextResolve(specifier, context);
}
`;

register('data:text/javascript,' + encodeURIComponent(loaderSource));

// Real modules under test (imported AFTER the resolve hook is registered).
const {
  canViewRoundDraft,
  canViewRoundPayload,
  canViewEvaluation,
  canWriteEvaluationRound,
} = await import('../src/data/workflow.ts');
const {
  sanitizeEvaluationForViewer,
  filterEvaluationsForViewer,
} = await import('../src/lib/db/evaluations.ts');
const { sanitizeSearchTerm } = await import('../src/lib/employee-batch-helpers.ts');

// ---------------------------------------------------------------- helpers ----
function readSource(rel) {
  const filePath = path.join(rootDir, rel);
  assert.ok(fs.existsSync(filePath), `${rel} must exist`);
  return fs.readFileSync(filePath, 'utf8');
}

function extractFunctionBody(source, header) {
  const start = source.indexOf(header);
  assert.ok(start >= 0, `expected to find "${header}" in source`);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `expected to find the end of "${header}"`);
  return source.slice(start, end + 2);
}

const fixturePath = path.join(rootDir, 'tests', 'fixtures', 'p107', 'read-authority', 'synthetic-fixtures.json');
assert.ok(fs.existsSync(fixturePath), 'P107 read-authority synthetic fixture must exist');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

const TEAMS = fixture.teams;
const FIXTURE_USERS = fixture.users;

function mapUser(u) {
  const mapped = {
    id: u.id,
    employeeCode: u.employeeCode,
    name: u.name,
    role: u.role,
    teamId: u.teamId,
    gender: 'Nữ',
    isActive: u.isActive,
  };
  if ('subleaderId' in u) mapped.subleaderId = u.subleaderId;
  return mapped;
}

const usersByKey = {};
for (const key of Object.keys(FIXTURE_USERS)) usersByKey[key] = mapUser(FIXTURE_USERS[key]);
const manager = usersByKey.manager;
const appointedLeaderAlpha = usersByKey.appointedLeaderAlpha;
const secondaryLeaderBeta = usersByKey.secondaryLeaderBeta;
const primaryLeaderUnappointed = usersByKey.primaryLeaderUnappointed;
const subLeaderAlpha = usersByKey.subLeaderAlpha;
const employeeAlpha = usersByKey.employeeAlpha;
const otherTeamEmployee = usersByKey.otherTeamEmployee;

// Synthetic Employee subject living in the unappointed team (the fixture has a
// Leader there but no employee; the deny must hold for any team member).
const unappointedEmployee = {
  id: '77777777-7777-4777-8777-777777777777',
  employeeCode: 'EMP-U1',
  name: 'Unappointed Team Employee',
  role: 'Employee',
  teamId: TEAMS.teamUnappointed.id,
  gender: 'Nữ',
  isActive: true,
};

const users = Object.keys(FIXTURE_USERS).map((k) => usersByKey[k]);
users.push(unappointedEmployee);

// Appointed Leader scope == active teams whose teams.leader_id points at the user.
function ledTeamIdsFor(userId) {
  return Object.values(TEAMS)
    .filter((t) => t.leaderId === userId)
    .map((t) => t.id);
}

const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-02T00:00:00.000Z';

// --- Evaluation fixtures -----------------------------------------------------
// Eval A: Employee subject (starts at SubLeader in round 1).
const R1_DRAFT = {
  round: 1,
  evaluatorId: subLeaderAlpha.id,
  evaluatorRole: 'SubLeader',
  status: 'Draft',
  scores: { c1: 8, c2: 7 },
  notes: { c1: 'private draft note' },
  selectedLevelIndexes: { c1: 1 },
  totalScore: 85,
  grade: 'B',
  comment: 'private draft comment',
  createdAt: T0,
};
const R1_SUBMITTED = { ...R1_DRAFT, status: 'Submitted', submittedAt: T1 };

const EVAL_A_DRAFT = {
  id: 'eval-alpha-draft',
  periodId: 'period-1',
  employeeId: employeeAlpha.id,
  employeeRole: 'Employee',
  teamId: TEAMS.teamAlpha.id,
  rounds: [{ ...R1_DRAFT }],
  currentRound: 1,
  status: 'Draft',
  createdAt: T0,
  updatedAt: T0,
};
const EVAL_A_SUBMITTED = { ...EVAL_A_DRAFT, id: 'eval-alpha-submitted', rounds: [{ ...R1_SUBMITTED }], status: 'Submitted' };
// Same round shape as EVAL_A_DRAFT: a Submitted round that was Returned to Draft.
const EVAL_A_RETURNED = { ...EVAL_A_DRAFT, id: 'eval-alpha-returned', rounds: [{ ...R1_DRAFT }], status: 'Draft' };

// Eval B: Employee subject in Team Beta, whose appointed Leader is a Leader
// whose PRIMARY team is Team Alpha (appointment independent of primary team).
const R1_B = {
  round: 1,
  evaluatorId: 'subleader-beta-id',
  evaluatorRole: 'SubLeader',
  status: 'Submitted',
  scores: {},
  notes: {},
  totalScore: 0,
  grade: 'Pending',
  submittedAt: T1,
  createdAt: T0,
};
const R2_B_DRAFT = {
  round: 2,
  evaluatorId: secondaryLeaderBeta.id,
  evaluatorRole: 'Leader',
  status: 'Draft',
  scores: {},
  notes: {},
  createdAt: T0,
};
const EVAL_B = {
  id: 'eval-beta',
  periodId: 'period-1',
  employeeId: otherTeamEmployee.id,
  employeeRole: 'Employee',
  teamId: TEAMS.teamBeta.id,
  rounds: [R1_B, R2_B_DRAFT],
  currentRound: 2,
  status: 'Draft',
  createdAt: T0,
  updatedAt: T0,
};

// Eval C: Employee subject in the unappointed team (no teams.leader_id pointer).
const R1_C = { ...R1_B, evaluatorId: 'subleader-unappointed-id' };
const R2_C_DRAFT = {
  round: 2,
  evaluatorId: primaryLeaderUnappointed.id,
  evaluatorRole: 'Leader',
  status: 'Draft',
  scores: {},
  notes: {},
  createdAt: T0,
};
const EVAL_C = {
  id: 'eval-unappointed',
  periodId: 'period-1',
  employeeId: unappointedEmployee.id,
  employeeRole: 'Employee',
  teamId: TEAMS.teamUnappointed.id,
  rounds: [R1_C, R2_C_DRAFT],
  currentRound: 2,
  status: 'Draft',
  createdAt: T0,
  updatedAt: T0,
};

function roundOf(evaluation, n) {
  return evaluation.rounds.find((r) => r.round === n);
}

// -------------------------------------------------------- migration checks ----
const MIGRATION_PATH = 'supabase/migrations/20261008000100_p107_read_authority.sql';

function migrationText() {
  return readSource(MIGRATION_PATH);
}

function signatureArgLists(sql) {
  const re = /save_evaluation_round_transaction_active_only\(\s*([^)]*)\)/g;
  const found = [];
  for (const m of sql.matchAll(re)) {
    const args = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    found.push(args);
  }
  return found;
}

// ------------------------------------------------------------- static text ----
function assertNoUniquePrimaryLeaderFallback() {
  const teamValidation = readSource('src/lib/team-validation.ts');
  assert.doesNotMatch(teamValidation, /isPrimaryLeader/, 'team-validation must not reintroduce isPrimaryLeader');

  const selectValidLeaderBody = extractFunctionBody(teamValidation, 'export function selectValidLeader');
  assert.match(selectValidLeaderBody, /return null;/, 'selectValidLeader must deny (return null)');
  assert.match(
    selectValidLeaderBody,
    /validateLeaderAssignment\(appointed, targetTeamId/,
    'selectValidLeader must validate the appointed pointer only'
  );
  assert.doesNotMatch(selectValidLeaderBody, /candidates\.filter/, 'no candidate scanning fallback allowed');
  assert.doesNotMatch(selectValidLeaderBody, /\.teamId/, 'selectValidLeader must not compare primary teamId');
  assert.doesNotMatch(selectValidLeaderBody, /primary/i, 'no primary-team selection logic allowed');

  const resolver = readSource('src/lib/evaluator-resolver.ts');
  assert.match(resolver, /teamLeaderIds\?\.\[subject\.teamId\]/, 'Leader resolution must use the appointed pointer map');
  assert.match(resolver, /if \(!appointedId\) return null;/, 'absent pointer must deny');
  assert.match(
    resolver,
    /Appointed pointer absent -> reject, no primary fallback/,
    'appointed pointer absence must reject without primary fallback'
  );
  assert.match(resolver, /Invalid or inactive appointed pointer -> reject, do not fallback/);
  assert.match(resolver, /selectValidLeader\(appointedId, subject\.teamId, candidates/);
  assert.doesNotMatch(resolver, /isPrimaryLeader/);

  const teamsAdmin = readSource('src/lib/db/teams-admin.ts');
  const getLeaderTeamIdsBody = extractFunctionBody(teamsAdmin, 'export async function getLeaderTeamIds');
  assert.match(getLeaderTeamIdsBody, /\.eq\('leader_id', requester\.id\)/, 'Leader scope must come from teams.leader_id');
  assert.doesNotMatch(getLeaderTeamIdsBody, /requester\.teamId/, 'Leader scope must not include primary team membership');
  assert.doesNotMatch(getLeaderTeamIdsBody, /primary/i);

  const evaluationAction = readSource('src/actions/evaluation.ts');
  assert.doesNotMatch(evaluationAction, /isPrimaryLeader/, 'actions/evaluation.ts must use appointed-only Leader authority');
  const appointedChecks = evaluationAction.match(
    /const isAppointedLeader = actorUser\.role === 'Leader' && Boolean\(teamLeaderId && teamLeaderId === actorId\);/g
  );
  assert.ok(
    appointedChecks && appointedChecks.length === 2,
    'both write and return authorization paths must use the appointed-only Leader check'
  );

  const workflow = readSource('src/data/workflow.ts');
  const leaderBranchStart = workflow.indexOf("if (selector === 'Leader') {");
  assert.ok(leaderBranchStart >= 0, 'matchesEvaluatorSelector must contain a Leader branch');
  const leaderBranchEnd = workflow.indexOf('\n  }', leaderBranchStart);
  assert.ok(leaderBranchEnd > leaderBranchStart, 'Leader branch must be extractable');
  const leaderBranch = workflow.slice(leaderBranchStart, leaderBranchEnd + 4);
  assert.match(
    leaderBranch,
    /const leadsTargetTeam = Boolean\(target\.teamId && ledTeamIds\?\.includes\(target\.teamId\)\);/,
    'Leader authority must derive solely from ledTeamIds membership'
  );
  assert.match(leaderBranch, /return evaluator\.role === 'Leader' && leadsTargetTeam;/);
  assert.doesNotMatch(leaderBranch, /\.teamId === target\.teamId/, 'no primary-team equality fallback');
}

function assertUsersAdminSearchSanitized() {
  const usersAdmin = readSource('src/lib/db/users-admin.ts');

  assert.match(usersAdmin, /sanitizeSearchTerm/, 'users-admin must sanitize search input');
  assert.match(
    usersAdmin,
    /const term = sanitizeSearchTerm\(options\.search\);/,
    'getUsersAdmin must sanitize options.search'
  );
  assert.match(
    usersAdmin,
    /import \{ normalizeBatchParams, computeBatchResult, sanitizeSearchTerm \} from '@\/lib\/employee-batch-helpers';/
  );
  assert.match(usersAdmin, /normalizeBatchParams\(/, 'batch path must go through the sanitizing normalizer');
  assert.match(usersAdmin, /USER_SELECT/, 'users-admin must project with USER_SELECT (not select(*))');
  assert.doesNotMatch(usersAdmin, /password_hash/, 'users-admin must never reference password_hash');
  assert.doesNotMatch(usersAdmin, /\.select\('\*'\)/, 'users-admin must never select(*)');

  const orBodies = [...usersAdmin.matchAll(/\.or\(\s*`([^`]*)`\s*\)/g)].map((m) => m[1]);
  assert.ok(orBodies.length >= 1, 'expected at least one PostgREST .or() filter');
  for (const orBody of orBodies) {
    assert.match(orBody, /name\.ilike/, 'search filter may only target the name column');
    assert.match(orBody, /employee_code\.ilike/, 'search filter may only target the employee_code column');
    assert.doesNotMatch(orBody, /password_hash/, 'search filter must not reference password_hash');
    assert.doesNotMatch(orBody, /team_id/, 'search filter must not relax team scope');
    assert.doesNotMatch(orBody, /\bid\./, 'search filter must not inject arbitrary id predicates');
    const interpolations = [...orBody.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1].trim());
    assert.ok(interpolations.length >= 1, '.or() must interpolate the search value');
    for (const name of interpolations) {
      assert.ok(
        name === 'term' || name === 'search',
        `only sanitized bindings may be interpolated into .or(), found "${name}"`
      );
    }
  }
}

function assertServerOnlyConfigReads() {
  const criteria = readSource('src/lib/db/criteria.ts');
  assert.match(criteria, /import \{ supabaseAdmin \} from '\.\.\/supabase-admin';/);
  assert.match(
    criteria,
    /getActiveCriteriaConfig\([\s\S]*?db: SupabaseClient<Database> = supabaseAdmin/,
    'criteria version read must default to the server-only supabaseAdmin client'
  );
  assert.match(criteria, /await db\.rpc\('get_active_criteria_config'\)/);
  assert.doesNotMatch(criteria, /import \{ supabase \} from/, 'criteria reads must not use the browser client');

  const gradeBands = readSource('src/lib/grade-bands.ts');
  // grade-bands.ts is CLIENT-reachable (scoring / GradeBandsTab / ResultCard /
  // EvaluationHeader), so it must NEVER import the server-only admin client. Its
  // loader keeps the browser-safe default; privileged reads are injected by the
  // dedicated server-only module below.
  assert.match(gradeBands, /import \{ supabase \} from '@\/lib\/supabase';/);
  assert.doesNotMatch(
    gradeBands,
    /supabase-admin/,
    'client-reachable grade-bands.ts must not pull in the server-only admin client'
  );
  assert.match(
    gradeBands,
    /loadGradeBandsSnapshotFromDb\([\s\S]*?db: SupabaseClient<Database> = supabase\b/,
    'grade-bands loader must keep the browser-safe default client'
  );
  assert.match(gradeBands, /await db\.rpc\('get_active_grade_config'\)/);

  // The privileged server path is isolated in a server-only module.
  const gradeBandsServer = readSource('src/lib/grade-bands-server.ts');
  assert.match(gradeBandsServer, /import 'server-only';/);
  assert.match(gradeBandsServer, /import \{ supabaseAdmin \} from '@\/lib\/supabase-admin';/);
  assert.match(
    gradeBandsServer,
    /loadGradeBandsSnapshotFromDb\(supabaseAdmin\)/,
    'server-only path must inject supabaseAdmin explicitly'
  );
}

function assertMigrationRevokesBrowserRpc() {
  const sql = migrationText();

  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION public\.get_active_criteria_config\(\) FROM PUBLIC, anon, authenticated;/,
    'browser/anon/authenticated must be revoked on get_active_criteria_config'
  );
  assert.match(
    sql,
    /REVOKE EXECUTE ON FUNCTION public\.get_active_grade_config\(\) FROM PUBLIC, anon, authenticated;/,
    'browser/anon/authenticated must be revoked on get_active_grade_config'
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_active_criteria_config\(\) TO [^;]*(anon|authenticated)/,
    'must not grant criteria config to browser roles'
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_active_grade_config\(\) TO [^;]*(anon|authenticated)/,
    'must not grant grade config to browser roles'
  );
}

function assertMigrationGrantsServiceRoleRpc() {
  const sql = migrationText();

  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_active_criteria_config\(\) TO service_role, postgres;/,
    'only service_role/postgres may execute get_active_criteria_config'
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_active_grade_config\(\) TO service_role, postgres;/,
    'only service_role/postgres may execute get_active_grade_config'
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_active_criteria_config\(\) TO [^;]*PUBLIC/,
    'PUBLIC must not retain execute on config readers'
  );
  assert.doesNotMatch(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.get_active_grade_config\(\) TO [^;]*PUBLIC/,
    'PUBLIC must not retain execute on config readers'
  );
}

function assertMigrationRevokesLegacyOverload() {
  const sql = migrationText();

  assert.doesNotMatch(sql, /GRANT ALL/, 'migration must not contain a GRANT ALL');

  const argLists = signatureArgLists(sql);
  assert.ok(argLists.some((a) => a.length === 17), 'the 17-argument writer overload must be defined');
  assert.ok(argLists.some((a) => a.length === 16), 'the legacy 16-argument overload must be referenced');

  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.save_evaluation_round_transaction_active_only\(\s*uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid\s*\)\s*FROM PUBLIC, anon, authenticated;/,
    'the legacy 16-argument overload must be revoked from PUBLIC/anon/authenticated'
  );
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.save_evaluation_round_transaction_active_only\(\s*uuid, integer, uuid, jsonb, jsonb, text, numeric, text, boolean, timestamptz, integer, uuid, text, text, boolean, uuid, uuid\s*\)\s*TO service_role, postgres;/,
    'the 17-argument overload must be granted only to service_role/postgres'
  );
}

// -----------------------------------------------------------------------------
// DoD2: per-surface draft-confidentiality negative controls
// -----------------------------------------------------------------------------
// Every read surface (list / detail / history / display / compare / summary /
// batch / export / AI) must reach evaluation round payload ONLY through the
// shared sanitizing DB layer; none may read raw rounds directly.
function assertPerSurfaceDraftConfidentiality() {
  const evalAdmin = readSource('src/lib/db/evaluations-admin.ts');
  const filterCalls = (evalAdmin.match(/filterEvaluationsForViewer\(/g) || []).length;
  const sanitizeCalls = (evalAdmin.match(/sanitizeEvaluationForViewer\(/g) || []).length;
  assert.ok(filterCalls >= 2, `list/summary/batch admin readers must route through filterEvaluationsForViewer (found ${filterCalls})`);
  assert.ok(sanitizeCalls >= 2, `detail/by-employee/history admin readers must route through sanitizeEvaluationForViewer (found ${sanitizeCalls})`);
  assert.match(evalAdmin, /sanitizeEvaluationForViewer\(evaluation, user, allUsers, leaderTeamIds\)/, 'detail admin read must sanitize the evaluation payload');
  assert.match(evalAdmin, /getEvaluationHistoryByEmployeeAdmin[\s\S]*?\bconst \[allUsers, leaderTeamIds\] = await Promise\.all\([\s\S]*?sanitizeEvaluationForViewer\(ev, user, allUsers, leaderTeamIds\)/, 'history-by-employee admin read must sanitize each round payload WITH the resolved viewer context (an authorized Leader history must not be over-redacted)');
  assert.doesNotMatch(evalAdmin, /sanitizeEvaluationForViewer\(ev, user\)/, 'history-by-employee admin read must not drop the viewer context');

  const historyAdmin = readSource('src/lib/db/evaluation-history-admin.ts');
  assert.match(
    historyAdmin,
    /sanitizeEvaluationForViewer\(evaluation, viewer, allUsersContext, leaderTeamIds\)/,
    'history surface must sanitize each retained evaluation with full viewer context'
  );

  const displayAdmin = readSource('src/lib/db/evaluation-display-admin.ts');
  assert.match(displayAdmin, /return evaluation\.rounds\.map\(/, 'display surface builds rounds only from the already-authorized rounds');
  assert.match(
    displayAdmin,
    /redactedRounds: \(evaluation\.roundMetadata \?\? \[\]\)\.filter\(\(meta\) => meta\.isRedacted === true\)/,
    'display surface exposes withheld rounds as status/assignment metadata only'
  );

  const readAction = readSource('src/actions/read.ts');
  assert.match(readAction, /getEvaluationDisplayAdmin\(evaluationId, auth\.user\)/, 'compare surface reads through the sanitizing display admin');

  const exportLib = readSource('src/lib/export.ts');
  assert.match(exportLib, /EvaluationDisplayDto/, 'export surface consumes sanitized display DTOs');

  for (const aiFile of ['src/actions/ai.ts', 'src/actions/ai-summary.ts', 'src/actions/chat.ts']) {
    const src = readSource(aiFile);
    assert.match(
      src,
      /getEvaluationsByPeriodAdmin|getEvaluationByEmployeeAdmin/,
      `${aiFile} must read evaluations via the sanitizing admin layer`
    );
  }
}

// ============================================================== test suites ===

describe('P107M1T03 read-authority: fixture-driven authorization cases', () => {
  // Each key maps a fixture case id to its concrete assertion.
  const caseAssertions = {
    'CASE-P107-01': (c) => {
      assert.strictEqual(canViewRoundDraft(manager, EVAL_A_DRAFT, roundOf(EVAL_A_DRAFT, 1), users, []), true);
      assert.strictEqual(canViewRoundPayload(manager, EVAL_A_DRAFT, roundOf(EVAL_A_DRAFT, 1), users, []), c.expectedRead);
      assert.strictEqual(canWriteEvaluationRound(manager, EVAL_A_DRAFT, 1, users, []), c.expectedWrite);
    },
    'CASE-P107-02': (c) => {
      // Manager is not the assigned evaluator of round 1 -> write denied.
      assert.strictEqual(canWriteEvaluationRound(manager, EVAL_A_DRAFT, 1, users, []), c.expectedWrite);
      assert.strictEqual(canViewRoundPayload(manager, EVAL_A_DRAFT, roundOf(EVAL_A_DRAFT, 1), users, []), true);
    },
    'CASE-P107-03': (c) => {
      const r1 = roundOf(EVAL_A_DRAFT, 1);
      assert.strictEqual(canViewRoundDraft(subLeaderAlpha, EVAL_A_DRAFT, r1, users, []), c.expectedRead);
      assert.strictEqual(canViewRoundPayload(subLeaderAlpha, EVAL_A_DRAFT, r1, users, []), c.expectedRead);
      assert.strictEqual(canWriteEvaluationRound(subLeaderAlpha, EVAL_A_DRAFT, 1, users, []), c.expectedWrite);
    },
    'CASE-P107-04': (c) => {
      const r1 = roundOf(EVAL_A_DRAFT, 1);
      const led = ledTeamIdsFor(appointedLeaderAlpha.id);
      // The appointed Leader is in the current flow (round 2), so evaluation-level
      // visibility is granted, but the round-1 draft payload stays private.
      assert.strictEqual(canViewEvaluation(appointedLeaderAlpha, EVAL_A_DRAFT, users, led), true);
      assert.strictEqual(canViewRoundDraft(appointedLeaderAlpha, EVAL_A_DRAFT, r1, users, led), c.expectedRead);
      assert.strictEqual(canViewRoundPayload(appointedLeaderAlpha, EVAL_A_DRAFT, r1, users, led), c.expectedRead);
      assert.strictEqual(canWriteEvaluationRound(appointedLeaderAlpha, EVAL_A_DRAFT, 1, users, led), c.expectedWrite);
    },
    'CASE-P107-05': (c) => {
      const r1 = roundOf(EVAL_A_DRAFT, 1);
      assert.strictEqual(employeeAlpha.id, EVAL_A_DRAFT.employeeId);
      assert.strictEqual(canViewRoundDraft(employeeAlpha, EVAL_A_DRAFT, r1, users, []), false);
      assert.strictEqual(canViewRoundPayload(employeeAlpha, EVAL_A_DRAFT, r1, users, []), c.expectedRead);
      assert.strictEqual(canWriteEvaluationRound(employeeAlpha, EVAL_A_DRAFT, 1, users, []), c.expectedWrite);
    },
    'CASE-P107-06': (c) => {
      const r1 = roundOf(EVAL_A_DRAFT, 1);
      assert.strictEqual(canViewEvaluation(otherTeamEmployee, EVAL_A_DRAFT, users, []), false);
      assert.strictEqual(canViewRoundDraft(otherTeamEmployee, EVAL_A_DRAFT, r1, users, []), c.expectedRead);
      assert.strictEqual(canViewRoundPayload(otherTeamEmployee, EVAL_A_DRAFT, r1, users, []), c.expectedRead);
      assert.strictEqual(canWriteEvaluationRound(otherTeamEmployee, EVAL_A_DRAFT, 1, users, []), c.expectedWrite);
    },
    'CASE-P107-07': (c) => {
      const targetTeam = TEAMS[c.targetTeam];
      const led = ledTeamIdsFor(secondaryLeaderBeta.id);
      assert.deepStrictEqual(led, [targetTeam.id]);
      assert.notStrictEqual(secondaryLeaderBeta.teamId, targetTeam.id, 'primary team differs from led team');
      const r2 = roundOf(EVAL_B, 2);
      const authority = canViewRoundDraft(secondaryLeaderBeta, EVAL_B, r2, users, led);
      assert.strictEqual(authority, c.expectedAuthority);
      assert.strictEqual(canWriteEvaluationRound(secondaryLeaderBeta, EVAL_B, 2, users, led), true);
    },
    'CASE-P107-08': (c) => {
      const targetTeam = TEAMS[c.targetTeam];
      const led = ledTeamIdsFor(primaryLeaderUnappointed.id);
      assert.deepStrictEqual(led, [], 'no teams.leader_id pointer -> no led teams');
      assert.strictEqual(primaryLeaderUnappointed.teamId, targetTeam.id, 'primary membership matches target team');
      const r2 = roundOf(EVAL_C, 2);
      const authority = canViewRoundDraft(primaryLeaderUnappointed, EVAL_C, r2, users, led);
      assert.strictEqual(authority, c.expectedAuthority);
      assert.strictEqual(canWriteEvaluationRound(primaryLeaderUnappointed, EVAL_C, 2, users, led), false);
    },
    'CASE-P107-09': (c) => {
      const revoked = { ...subLeaderAlpha, isActive: false };
      const snapshotBefore = JSON.stringify({ users, EVAL_A_DRAFT });
      assert.strictEqual(canWriteEvaluationRound(revoked, EVAL_A_DRAFT, 1, users, []), c.expectedWrite);
      assert.strictEqual(canViewRoundDraft(revoked, EVAL_A_DRAFT, roundOf(EVAL_A_DRAFT, 1), users, []), false);
      assert.strictEqual(canViewRoundPayload(revoked, EVAL_A_DRAFT, roundOf(EVAL_A_DRAFT, 1), users, []), false);
      // Reads must not mutate the DB graph they are given.
      sanitizeEvaluationForViewer(EVAL_A_DRAFT, revoked, users, []);
      filterEvaluationsForViewer([EVAL_A_DRAFT], revoked, users, []);
      const snapshotAfter = JSON.stringify({ users, EVAL_A_DRAFT });
      assert.strictEqual(snapshotAfter, snapshotBefore);
    },
    'CASE-P107-10': (c) => {
      assert.strictEqual(c.previousStatus, 'Submitted');
      const r1 = roundOf(EVAL_A_RETURNED, 1);
      assert.strictEqual(r1.status, c.roundStatus);
      assert.strictEqual(r1.submittedAt, undefined);
      const led = ledTeamIdsFor(appointedLeaderAlpha.id);
      // Still visible at evaluation level, but the returned draft payload is private again.
      assert.strictEqual(canViewEvaluation(appointedLeaderAlpha, EVAL_A_RETURNED, users, led), true);
      assert.strictEqual(canViewRoundPayload(appointedLeaderAlpha, EVAL_A_RETURNED, r1, users, led), false);
      const sanitized = sanitizeEvaluationForViewer(EVAL_A_RETURNED, appointedLeaderAlpha, users, led);
      assert.strictEqual(sanitized.rounds.length, 0);
      assert.strictEqual(sanitized.roundMetadata[0].isRedacted, c.expectedDraftPrivacy);
    },
    'CASE-P107-11': (c) => {
      const r1 = roundOf(EVAL_A_SUBMITTED, 1);
      assert.strictEqual(r1.status, c.roundStatus);
      const led = ledTeamIdsFor(appointedLeaderAlpha.id);
      assert.strictEqual(canViewRoundPayload(appointedLeaderAlpha, EVAL_A_SUBMITTED, r1, users, led), c.expectedRead);
      assert.strictEqual(canViewRoundPayload(subLeaderAlpha, EVAL_A_SUBMITTED, r1, users, []), c.expectedRead);
      const sanitized = sanitizeEvaluationForViewer(EVAL_A_SUBMITTED, appointedLeaderAlpha, users, led);
      assert.strictEqual(sanitized.rounds.length, 1);
      assert.strictEqual(sanitized.roundMetadata[0].isRedacted, false);
    },
    'CASE-P107-12': (c) => {
      assert.ok(Array.isArray(c.injections) && c.injections.length >= 3);
      for (const injection of c.injections) {
        const clean = sanitizeSearchTerm(injection);
        assert.notStrictEqual(clean, injection, 'sanitization must actually change hostile input');
        assert.ok(clean.length <= 50, 'sanitized term is bounded to 50 chars');
        assert.doesNotMatch(clean, /[%(),.'";]/, 'PostgREST/grammar metacharacters must be stripped');
        assert.doesNotMatch(clean, /password_hash/, 'password_hash must not survive sanitization');
        assert.doesNotMatch(clean, /,/, 'no clause separator may survive');
        assert.strictEqual(sanitizeSearchTerm(clean), clean, 'sanitization must be idempotent');
      }
      assert.strictEqual(c.expectedSanitized, true);
      assertUsersAdminSearchSanitized();
    },
    'CASE-P107-13': (c) => {
      assert.strictEqual(c.expectedBrowserRpc, 'DENIED');
      assertMigrationRevokesBrowserRpc();
    },
    'CASE-P107-14': (c) => {
      assert.strictEqual(c.expectedServiceRoleRpc, 'ALLOWED');
      assertMigrationGrantsServiceRoleRpc();
    },
    'CASE-P107-15': (c) => {
      assert.strictEqual(c.expectedAcl, 'REVOKED');
      assertMigrationRevokesLegacyOverload();
    },
  };

  const declaredIds = fixture.cases.map((c) => c.id);
  const expectedIds = Array.from({ length: 15 }, (_, i) => `CASE-P107-${String(i + 1).padStart(2, '0')}`);

  it('fixture declares exactly the 15 expected cases', () => {
    assert.deepStrictEqual(declaredIds, expectedIds);
    assert.deepStrictEqual(Object.keys(caseAssertions).sort(), expectedIds.slice().sort());
  });

  for (const testCase of fixture.cases) {
    it(`${testCase.id}: ${testCase.description}`, () => {
      const run = caseAssertions[testCase.id];
      assert.ok(run, `no assertion registered for ${testCase.id}`);
      run(testCase);
    });
  }
});

describe('P107M1T03 read-authority: draft payload sanitization', () => {
  it('omits unauthorized draft payload while preserving status/assignment metadata', () => {
    const led = ledTeamIdsFor(appointedLeaderAlpha.id);
    const originalRound = roundOf(EVAL_A_DRAFT, 1);

    const sanitized = sanitizeEvaluationForViewer(EVAL_A_DRAFT, appointedLeaderAlpha, users, led);

    // Unauthorized draft round is removed entirely -> no payload survives.
    assert.deepStrictEqual(sanitized.rounds, []);

    // Status/assignment-only metadata is retained.
    assert.strictEqual(sanitized.roundMetadata.length, 1);
    const meta = sanitized.roundMetadata[0];
    assert.strictEqual(meta.round, 1);
    assert.strictEqual(meta.evaluatorId, subLeaderAlpha.id);
    assert.strictEqual(meta.evaluatorRole, 'SubLeader');
    assert.strictEqual(meta.status, 'Draft');
    assert.strictEqual(meta.isRedacted, true);

    // No payload field is carried in the metadata DTO.
    for (const forbidden of ['scores', 'notes', 'comment', 'additionalComment', 'selectedLevelIndexes', 'totalScore', 'grade']) {
      assert.ok(!(forbidden in meta), `roundMetadata must not expose ${forbidden}`);
    }

    // No fabricated total 0 / fake grade placeholder is synthesized.
    assert.ok(!sanitized.rounds.some((r) => r.totalScore === 0 || r.grade != null));
    for (const r of sanitized.rounds) {
      assert.ok(!('totalScore' in r) && !('grade' in r), 'no fabricated score/grade payload may appear');
    }

    // The source evaluation is untouched (no mutation of the input graph).
    assert.strictEqual(EVAL_A_DRAFT.rounds.length, 1);
    assert.strictEqual(EVAL_A_DRAFT.rounds[0], originalRound);
  });

  it('keeps the authorized draft payload intact and marks it non-redacted', () => {
    const sanitized = sanitizeEvaluationForViewer(EVAL_A_DRAFT, subLeaderAlpha, users, []);

    assert.strictEqual(sanitized.rounds.length, 1);
    const round = sanitized.rounds[0];
    assert.deepStrictEqual(round.scores, { c1: 8, c2: 7 });
    assert.deepStrictEqual(round.notes, { c1: 'private draft note' });
    assert.deepStrictEqual(round.selectedLevelIndexes, { c1: 1 });
    assert.strictEqual(round.totalScore, 85);
    assert.strictEqual(round.grade, 'B');
    assert.strictEqual(round.comment, 'private draft comment');
    assert.strictEqual(sanitized.roundMetadata[0].isRedacted, false);
  });

  it('redacts every round for a null viewer', () => {
    const sanitized = sanitizeEvaluationForViewer(EVAL_A_DRAFT, null, users, []);
    assert.deepStrictEqual(sanitized.rounds, []);
    assert.strictEqual(sanitized.roundMetadata[0].isRedacted, true);
  });

  it('redacted draft metadata exposes no payload and no config-version metadata', () => {
    const led = ledTeamIdsFor(appointedLeaderAlpha.id);
    const sanitized = sanitizeEvaluationForViewer(EVAL_A_DRAFT, appointedLeaderAlpha, users, led);
    assert.deepStrictEqual(sanitized.rounds, [], 'no round payload may survive for an unauthorized draft viewer');
    const meta = sanitized.roundMetadata[0];
    for (const forbidden of [
      'scores', 'notes', 'comment', 'additionalComment', 'selectedLevelIndexes',
      'totalScore', 'grade', 'criteriaConfigVersionId', 'gradeConfigVersionId',
      'criteriaSnapshotState', 'submittedAt',
    ]) {
      if (forbidden === 'submittedAt') continue; // status/assignment metadata may carry submittedAt
      assert.ok(!(forbidden in meta), `redacted metadata must not expose ${forbidden}`);
    }
  });

  it('filterEvaluationsForViewer drops unauthorized evaluations and sanitizes retained ones', () => {
    assert.deepStrictEqual(filterEvaluationsForViewer([EVAL_A_DRAFT], null, users, []), []);
    assert.deepStrictEqual(filterEvaluationsForViewer([EVAL_A_DRAFT], otherTeamEmployee, users, []), []);

    const forManager = filterEvaluationsForViewer([EVAL_A_DRAFT], manager, users, []);
    assert.strictEqual(forManager.length, 1);
    assert.strictEqual(forManager[0].rounds.length, 1);
    assert.strictEqual(forManager[0].roundMetadata[0].isRedacted, false);

    const forNextEvaluator = filterEvaluationsForViewer(
      [EVAL_A_DRAFT],
      appointedLeaderAlpha,
      users,
      ledTeamIdsFor(appointedLeaderAlpha.id)
    );
    assert.strictEqual(forNextEvaluator.length, 1);
    assert.strictEqual(forNextEvaluator[0].rounds.length, 0);
    assert.strictEqual(forNextEvaluator[0].roundMetadata[0].isRedacted, true);
  });
});

describe('P107M1T03 read-authority: static source contracts', () => {
  it('removes the unique-primary Leader fallback across the source surface', () => {
    assertNoUniquePrimaryLeaderFallback();
  });

  it('sanitizes PostgREST search input without exposing password_hash or relaxing team scope', () => {
    assertUsersAdminSearchSanitized();
  });

  it('reads active criteria/grade versions through the server-only supabaseAdmin client', () => {
    assertServerOnlyConfigReads();
  });

  it('migration revokes browser/anon RPC and the legacy 16-arg overload, granting only service_role/postgres', () => {
    assertMigrationRevokesLegacyOverload();
    assertMigrationRevokesBrowserRpc();
    assertMigrationGrantsServiceRoleRpc();
  });

  it('keeps every list/detail/history/display/compare/summary/batch/export/AI surface behind the shared draft sanitizer', () => {
    assertPerSurfaceDraftConfidentiality();
  });
});
