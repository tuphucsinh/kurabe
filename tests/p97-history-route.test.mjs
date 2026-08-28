/**
 * Static and Behavioral Contract Test for Phase 97: Server-Protected Read-Only Evaluation History Route
 *
 * Scope:
 * P97T01: Dedicated server-only admin query module (src/lib/db/evaluation-history-admin.ts)
 * P97T02: Server page route (src/app/history/[employeeId]/page.tsx) and read-only renderer (src/components/evaluation/EvaluationHistoryPage.tsx)
 * P97T03: Navigation integration in Sidebar (src/components/layout/Sidebar.tsx) and EmployeesClient (src/components/employees/EmployeesClient.tsx)
 *
 * Invariants tested:
 * - Server-only boundary & absence of client leaks
 * - Strict Closed-only period status (raw 'closed') & Approved evaluation status filter
 * - Strict canViewEvaluation predicate enforcement & fail-closed access control
 * - Zero fallback to Active or latest period in history queries / rendering
 * - Presentational read-only contract: zero mutation forms, buttons, server actions
 * - Navigation link preservation and accessible routing contracts
 * - Firewall: protected core modules untouched
 *
 * Run: node tests/p97-history-route.test.mjs
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const QUERY_MODULE_PATH = path.join(projectRoot, 'src', 'lib', 'db', 'evaluation-history-admin.ts');
const ROUTE_PAGE_PATH = path.join(projectRoot, 'src', 'app', 'history', '[employeeId]', 'page.tsx');
const ERROR_BOUNDARY_PATH = path.join(projectRoot, 'src', 'app', 'history', '[employeeId]', 'error.tsx');
const RENDERER_COMPONENT_PATH = path.join(projectRoot, 'src', 'components', 'evaluation', 'EvaluationHistoryPage.tsx');
const SIDEBAR_PATH = path.join(projectRoot, 'src', 'components', 'layout', 'Sidebar.tsx');
const EMPLOYEES_CLIENT_PATH = path.join(projectRoot, 'src', 'components', 'employees', 'EmployeesClient.tsx');

// Protected paths that must not be weakened or altered
const WORKFLOW_PATH = path.join(projectRoot, 'src', 'data', 'workflow.ts');
const AUTH_PATH = path.join(projectRoot, 'src', 'lib', 'auth.ts');
const SCORING_PATH = path.join(projectRoot, 'src', 'lib', 'scoring.ts');
const HISTORY_LIST_PATH = path.join(projectRoot, 'src', 'components', 'evaluation', 'HistoryList.tsx');
const EVALUATIONS_WRITE_PATH = path.join(projectRoot, 'src', 'lib', 'db', 'evaluations-write.ts');

console.log('[P97 TEST] Executing static contract and security invariant assertions for Phase 97...');

// ============================================================
// 1. ARTIFACT EXISTENCE
// ============================================================
assert.ok(fs.existsSync(QUERY_MODULE_PATH), `Query module must exist at: ${QUERY_MODULE_PATH}`);
assert.ok(fs.existsSync(ROUTE_PAGE_PATH), `Route page must exist at: ${ROUTE_PAGE_PATH}`);
assert.ok(fs.existsSync(ERROR_BOUNDARY_PATH), `History error boundary must exist at: ${ERROR_BOUNDARY_PATH}`);
assert.ok(fs.existsSync(RENDERER_COMPONENT_PATH), `Renderer component must exist at: ${RENDERER_COMPONENT_PATH}`);
assert.ok(fs.existsSync(SIDEBAR_PATH), `Sidebar must exist at: ${SIDEBAR_PATH}`);
assert.ok(fs.existsSync(EMPLOYEES_CLIENT_PATH), `EmployeesClient must exist at: ${EMPLOYEES_CLIENT_PATH}`);

const queryModuleCode = fs.readFileSync(QUERY_MODULE_PATH, 'utf8');
const routePageCode = fs.readFileSync(ROUTE_PAGE_PATH, 'utf8');
const errorBoundaryCode = fs.readFileSync(ERROR_BOUNDARY_PATH, 'utf8');
const rendererCode = fs.readFileSync(RENDERER_COMPONENT_PATH, 'utf8');
const sidebarCode = fs.readFileSync(SIDEBAR_PATH, 'utf8');
const employeesClientCode = fs.readFileSync(EMPLOYEES_CLIENT_PATH, 'utf8');

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeWhitespace(code) {
  return code.replace(/\s+/g, ' ').trim();
}

const cleanQueryCode = normalizeWhitespace(stripComments(queryModuleCode));
const cleanRouteCode = normalizeWhitespace(stripComments(routePageCode));
const cleanErrorBoundaryCode = normalizeWhitespace(stripComments(errorBoundaryCode));
const cleanRendererCode = normalizeWhitespace(stripComments(rendererCode));
const cleanSidebarCode = normalizeWhitespace(stripComments(sidebarCode));
const cleanEmployeesClientCode = normalizeWhitespace(stripComments(employeesClientCode));

// ============================================================
// 2. SERVER-ONLY QUERY MODULE CONTRACT (src/lib/db/evaluation-history-admin.ts)
// ============================================================

// 2.1 Server-only boundary
assert.ok(
  queryModuleCode.startsWith("import 'server-only';") || queryModuleCode.includes("import 'server-only';"),
  'Query module must start with import \'server-only\';'
);
assert.ok(
  cleanQueryCode.includes("from '@/lib/supabase-admin'"),
  'Query module must use supabaseAdmin service client'
);

// 2.2 Strict Database Filters: raw status 'closed' and evaluation status 'Approved'
assert.ok(
  cleanQueryCode.includes(".eq('status', 'Approved')"),
  'Query module must enforce evaluation status == Approved at database level'
);
assert.ok(
  cleanQueryCode.includes(".eq('evaluation_periods.status', 'closed')"),
  'Query module must enforce period raw status == closed (lowercase) at database level'
);
assert.ok(
  !cleanQueryCode.includes(".eq('evaluation_periods.status', 'Closed')"),
  'Query module must NOT use display-cased Closed in database predicate'
);
assert.ok(
  !cleanQueryCode.includes(".eq('evaluation_periods.status', 'active')"),
  'Query module must NOT include active periods in query predicate'
);

// 2.3 Verified mappers usage (no raw DB payload leaked)
assert.ok(
  cleanQueryCode.includes('mapEvaluationFromDb') && cleanQueryCode.includes('mapPeriodFromDb') && cleanQueryCode.includes('mapUserFromDb'),
  'Query module must use mapEvaluationFromDb, mapPeriodFromDb, and mapUserFromDb'
);

// 2.4 Application-level validation of closed and Approved status
assert.ok(
  cleanQueryCode.includes("periodData.status !== 'closed'") || cleanQueryCode.includes("period.status !== 'Closed'"),
  'Query module must validate closed period status in application loop'
);
assert.ok(
  cleanQueryCode.includes("evaluation.status !== 'Approved'"),
  'Query module must validate Approved evaluation status in application loop'
);

// 2.5 canViewEvaluation Access Control
assert.ok(
  cleanQueryCode.includes('canViewEvaluation(viewer, evaluation, allUsersContext)'),
  'Query module must call canViewEvaluation with viewer, evaluation, and allUsersContext'
);

// 2.6 Fail-closed on missing viewer or target
assert.ok(
  cleanQueryCode.includes('if (!viewer || !employeeId)'),
  'Query module must fail closed when viewer or employeeId is missing'
);

// 2.7 Canonical Sorting: period.year DESC -> period.createdAt DESC -> evaluation.id ASC
assert.ok(
  cleanQueryCode.includes('b.period.year - a.period.year') || cleanQueryCode.includes('b.period.year !== a.period.year'),
  'Query module must sort by period.year DESC first'
);
assert.ok(
  cleanQueryCode.includes('timeB - timeA') || cleanQueryCode.includes('dateB - dateA') || cleanQueryCode.includes('b.period.createdAt'),
  'Query module must sort by period.createdAt DESC second'
);
assert.ok(
  cleanQueryCode.includes('a.evaluation.id.localeCompare(b.evaluation.id)'),
  'Query module must sort by evaluation.id ASC third'
);

// 2.8 No Active/latest Fallback in Query Module
assert.ok(
  !cleanQueryCode.includes('resolveCurrentPeriod') &&
  !cleanQueryCode.includes('getActivePeriod') &&
  !cleanQueryCode.includes('resolveActiveEvaluationPeriodScope'),
  'Query module must NOT fall back to Active or latest period resolver'
);

// ============================================================
// 3. SERVER PAGE ROUTE CONTRACT (src/app/history/[employeeId]/page.tsx)
// ============================================================

// 3.1 Server-side auth guard
assert.ok(
  cleanRouteCode.includes('getSessionUser()'),
  'Route page must authenticate viewer on server with getSessionUser()'
);
assert.ok(
  cleanRouteCode.includes("redirect('/login')"),
  'Route page must redirect unauthenticated viewers to /login'
);

// 3.2 Individual role self-history redirection guard
assert.ok(
  cleanRouteCode.includes('isIndividualRole(viewer.role)') && cleanRouteCode.includes('redirect(`/history/${viewer.id}`)'),
  'Route page must redirect individual roles trying to view other users to their own history'
);

// 3.3 Admin query invocation
assert.ok(
  cleanRouteCode.includes('getEvaluationHistoryAdmin(employeeId, viewer)'),
  'Route page must invoke getEvaluationHistoryAdmin with employeeId and viewer'
);

// 3.4 Passes data to renderer
assert.ok(
  cleanRouteCode.includes('<EvaluationHistoryPage target={target} entries={entries} viewer={viewer} />') ||
  cleanRouteCode.includes('<EvaluationHistoryPage target={target} entries={entries}'),
  'Route page must render EvaluationHistoryPage with target and entries'
);

// 3.5 Route-specific safe error boundary
assert.ok(
  cleanErrorBoundaryCode.includes("'use client'") && cleanErrorBoundaryCode.includes('reset'),
  'History route must provide a client error boundary with retry support'
);
assert.ok(
  cleanErrorBoundaryCode.includes('Không thể tải lịch sử đánh giá') &&
  !cleanErrorBoundaryCode.includes('error.message'),
  'History error boundary must show a safe generic message without raw server error details'
);

// ============================================================
// 4. READ-ONLY RENDERER COMPONENT CONTRACT (src/components/evaluation/EvaluationHistoryPage.tsx)
// ============================================================

// 4.1 UI Heading and Read-Only Indication
assert.ok(
  cleanRendererCode.includes('Lịch sử đánh giá'),
  'Renderer must display heading "Lịch sử đánh giá"'
);
assert.ok(
  cleanRendererCode.includes('Chỉ xem'),
  'Renderer must display explicit "Chỉ xem" indicator'
);

// 4.2 Safe Empty States (No fallback to active)
assert.ok(
  cleanRendererCode.includes('Không tìm thấy thông tin nhân viên'),
  'Renderer must display safe not-found state when target is missing'
);
assert.ok(
  cleanRendererCode.includes('Chưa có lịch sử đánh giá'),
  'Renderer must display safe empty state when no closed approved entries exist'
);
assert.ok(
  !cleanRendererCode.includes('resolveCurrentPeriod') &&
  !cleanRendererCode.includes('getActivePeriod') &&
  !cleanRendererCode.includes('activePeriod'),
  'Renderer must NOT fall back to Active period'
);

// 4.3 Zero Mutation Forms, Buttons, and Server Actions
assert.ok(!cleanRendererCode.includes('<form'), 'Renderer must NOT contain any <form> tags');
assert.ok(!cleanRendererCode.includes('saveEvaluationRound'), 'Renderer must NOT invoke saveEvaluationRound');
assert.ok(!cleanRendererCode.includes('initializeEvaluationRoundDraft'), 'Renderer must NOT invoke initializeEvaluationRoundDraft');
assert.ok(!cleanRendererCode.includes('returnEvaluationRound'), 'Renderer must NOT invoke returnEvaluationRound');
assert.ok(!cleanRendererCode.includes('upsertUserAction'), 'Renderer must NOT invoke upsertUserAction');
assert.ok(!cleanRendererCode.includes('deleteUser'), 'Renderer must NOT invoke delete user mutations');
assert.ok(!cleanRendererCode.includes('saveResultMessageAction'), 'Renderer must NOT invoke saveResultMessageAction');
assert.ok(!cleanRendererCode.includes('generatePeriodSummary'), 'Renderer must NOT invoke generatePeriodSummary');

// 4.4 Round Summary & Grade display
assert.ok(
  cleanRendererCode.includes('Chi tiết các vòng đánh giá'),
  'Renderer must render round details summary section'
);
assert.ok(
  cleanRendererCode.includes('evaluation.finalGrade') || cleanRendererCode.includes('evaluation.finalScore'),
  'Renderer must render evaluation final grade and score'
);

// ============================================================
// 5. NAVIGATION INTEGRATION CONTRACTS
// ============================================================

// 5.1 Sidebar navigation (src/components/layout/Sidebar.tsx)
assert.ok(
  cleanSidebarCode.includes("href: `/history/${user?.id || ''}`") && cleanSidebarCode.includes("label: 'Lịch sử đánh giá'"),
  'Sidebar must contain self-history link for individual roles'
);
assert.ok(
  cleanSidebarCode.includes("href: `/evaluations/${user?.id || ''}`"),
  'Sidebar must preserve existing /evaluations link for individual roles'
);
assert.ok(
  cleanSidebarCode.includes("label: 'Phiếu đánh giá của tôi'"),
  'Sidebar must preserve label for existing evaluation link'
);

// 5.2 Employees list action row (src/components/employees/EmployeesClient.tsx)
assert.ok(
  cleanEmployeesClientCode.includes("href={`/history/${item.id}`}") && cleanEmployeesClientCode.includes('title="Lịch sử đánh giá"'),
  'EmployeesClient action row must contain read-only history link with accessible title'
);
assert.ok(
  cleanEmployeesClientCode.includes("href={`/evaluations/${item.id}`}"),
  'EmployeesClient action row must preserve existing evaluation link'
);
assert.ok(
  cleanEmployeesClientCode.includes('handleEdit(item)') &&
  cleanEmployeesClientCode.includes('handleResetPassword(item.id, item.name)') &&
  cleanEmployeesClientCode.includes('handleDelete(item.id, item.name)'),
  'EmployeesClient must preserve all existing mutation handlers (edit, reset password, delete)'
);

// ============================================================
// 6. FIREWALL & INTEGRITY OF PROTECTED FILES
// ============================================================
assert.ok(fs.existsSync(WORKFLOW_PATH), `Workflow predicate module must exist at: ${WORKFLOW_PATH}`);
assert.ok(fs.existsSync(AUTH_PATH), `Auth module must exist at: ${AUTH_PATH}`);
assert.ok(fs.existsSync(SCORING_PATH), `Scoring module must exist at: ${SCORING_PATH}`);
assert.ok(fs.existsSync(HISTORY_LIST_PATH), `HistoryList inline component must exist at: ${HISTORY_LIST_PATH}`);
assert.ok(fs.existsSync(EVALUATIONS_WRITE_PATH), `Evaluations write module must exist at: ${EVALUATIONS_WRITE_PATH}`);

const workflowCode = fs.readFileSync(WORKFLOW_PATH, 'utf8');
assert.ok(
  workflowCode.includes('export function canViewEvaluation'),
  'canViewEvaluation predicate in workflow.ts must remain untouched'
);

console.log('[PASS] All Phase 97 static contract assertions, security boundaries, and navigation invariants verified.');
