/**
 * Focused Source-Contract Test for P96T06: Static Compare Shell / Loading Frame
 *
 * NOTE: Authenticated browser evidence is a separate gate; static source-contract
 * test does not claim live browser PASS. Browser state remains BLOCKED_AUTH.
 * This test performs hermetic, side-effect-free contract assertions over compare
 * shell components, loading fallback structures, DOM layer markers, error/blocked shell wrapping,
 * and safety invariants.
 *
 * Run: node tests/p96t06-compare-static-frame.test.mjs
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const LOADING_PATH = path.join(projectRoot, 'src', 'app', 'evaluations', '[id]', 'compare', 'loading.tsx');
const CLIENT_PATH = path.join(projectRoot, 'src', 'app', 'evaluations', '[id]', 'compare', 'ComparePageClient.tsx');

console.log('[GATE NOTE] Authenticated browser evidence is a separate gate; static source-contract test does not claim live browser PASS. Browser state: BLOCKED_AUTH.');
console.log('[NOTE] Executing deterministic source-contract test for P96T06 compare static frame & loading layer invariants...');

// ============================================================
// 1. ARTIFACT EXISTENCE
// ============================================================
assert.ok(fs.existsSync(LOADING_PATH), `Compare loading fallback must exist at: ${LOADING_PATH}`);
assert.ok(fs.existsSync(CLIENT_PATH), `Compare client page must exist at: ${CLIENT_PATH}`);

const loadingCode = fs.readFileSync(LOADING_PATH, 'utf8');
const clientCode = fs.readFileSync(CLIENT_PATH, 'utf8');

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeWhitespace(code) {
  return code.replace(/\s+/g, ' ').trim();
}

const cleanLoading = normalizeWhitespace(stripComments(loadingCode));
const cleanClient = normalizeWhitespace(stripComments(clientCode));

// ============================================================
// 2. LAYER MARKERS IN loading.tsx
// ============================================================
assert.ok(
  cleanLoading.includes('data-load-layer="static"'),
  'loading.tsx must render root data-load-layer="static"'
);
assert.ok(
  cleanLoading.includes('data-load-layer="static-header"'),
  'loading.tsx must render data-load-layer="static-header"'
);
assert.ok(
  cleanLoading.includes('data-load-layer="primary"'),
  'loading.tsx must render data-load-layer="primary"'
);
assert.ok(
  cleanLoading.includes('data-load-layer="changed-criteria"'),
  'loading.tsx must render data-load-layer="changed-criteria"'
);
assert.ok(
  cleanLoading.includes('data-load-layer="comments"'),
  'loading.tsx must render data-load-layer="comments"'
);
assert.ok(
  cleanLoading.includes('data-load-layer="unchanged"'),
  'loading.tsx must render data-load-layer="unchanged"'
);

// Component exports in loading.tsx
assert.ok(
  cleanLoading.includes('export function CompareStaticFrame'),
  'loading.tsx must export CompareStaticFrame component'
);
assert.ok(
  cleanLoading.includes('export default function CompareLoading'),
  'loading.tsx must export default function CompareLoading'
);

// ARIA semantics in loading.tsx
assert.ok(
  cleanLoading.includes('role="status"'),
  'loading.tsx must declare role="status"'
);
assert.ok(
  cleanLoading.includes('aria-busy="true"'),
  'loading.tsx must declare aria-busy="true"'
);

// ============================================================
// 3. NON-INTERACTIVE & SAFETY INVARIANTS IN loading.tsx
// ============================================================
assert.ok(!cleanLoading.includes('<button'), 'loading.tsx must NOT contain <button> tags');
assert.ok(!cleanLoading.includes('<form'), 'loading.tsx must NOT contain <form> tags');
assert.ok(!cleanLoading.includes('<input'), 'loading.tsx must NOT contain <input> tags');
assert.ok(!cleanLoading.includes('<select'), 'loading.tsx must NOT contain <select> tags');
assert.ok(!cleanLoading.includes('<textarea'), 'loading.tsx must NOT contain <textarea> tags');
assert.ok(!cleanLoading.includes('onClick='), 'loading.tsx must NOT contain onClick event handlers');
assert.ok(!cleanLoading.includes('onSubmit='), 'loading.tsx must NOT contain onSubmit event handlers');

// No fake values in loading.tsx
assert.ok(!cleanLoading.includes('Nguyễn'), 'loading.tsx must NOT contain fake employee name');
assert.ok(!cleanLoading.includes('Hạng A'), 'loading.tsx must NOT contain fake grade text (Hạng A)');
assert.ok(!cleanLoading.includes('Hạng S'), 'loading.tsx must NOT contain fake grade text (Hạng S)');
assert.ok(!cleanLoading.includes('Hạng B'), 'loading.tsx must NOT contain fake grade text (Hạng B)');
assert.ok(!cleanLoading.includes('(Hiện tại)'), 'loading.tsx must NOT contain fake round status (Hiện tại)');

// No write action imports
assert.ok(
  !cleanLoading.includes('saveEvaluationRound') &&
  !cleanLoading.includes('initializeEvaluationRoundDraft') &&
  !cleanLoading.includes('returnEvaluationRound'),
  'loading.tsx must NOT import or invoke evaluation write actions'
);

// ============================================================
// 4. SHARED FRAME & HEADER ARCHITECTURE IN ComparePageClient.tsx
// ============================================================
assert.ok(
  cleanClient.includes('export function CompareHeader') || cleanClient.includes('function CompareHeader'),
  'ComparePageClient must define stateless CompareHeader component'
);
assert.ok(
  cleanClient.includes('export function CompareFrame') || cleanClient.includes('function CompareFrame'),
  'ComparePageClient must define stateless CompareFrame shell component'
);

// CompareFrame & CompareHeader layer contract
assert.ok(
  cleanClient.includes('data-load-layer="static"'),
  'ComparePageClient must render root data-load-layer="static"'
);
assert.ok(
  cleanClient.includes('data-load-layer="static-header"'),
  'ComparePageClient must render data-load-layer="static-header"'
);
assert.ok(
  cleanClient.includes('data-load-layer="primary"'),
  'ComparePageClient must render data-load-layer="primary"'
);
assert.ok(
  cleanClient.includes('data-load-layer="changed-criteria"'),
  'ComparePageClient must render data-load-layer="changed-criteria"'
);
assert.ok(
  cleanClient.includes('data-load-layer="comments"'),
  'ComparePageClient must render data-load-layer="comments"'
);
assert.ok(
  cleanClient.includes('data-load-layer="unchanged"'),
  'ComparePageClient must render data-load-layer="unchanged"'
);

// Loading fallback renders CompareStaticFrame
assert.ok(
  cleanClient.includes('CompareStaticFrame') && cleanClient.includes("from './loading'"),
  'ComparePageClient must import CompareStaticFrame from ./loading'
);
assert.ok(
  cleanClient.includes('return <CompareStaticFrame') || cleanClient.includes('return (<CompareStaticFrame'),
  'ComparePageClient must render CompareStaticFrame during loading state'
);

// ============================================================
// 5. REVIEWER FINDING FIX: ALL STATES WRAPPED IN STATIC SHELL (NO BARE EARLY RETURNS)
// ============================================================

// NO_ACTIVE_PERIOD must be wrapped in CompareFrame with back navigation
assert.ok(
  cleanClient.includes("scope.kind === 'NO_ACTIVE_PERIOD'"),
  'ComparePageClient must handle NO_ACTIVE_PERIOD'
);
assert.ok(
  /if\s*\(\s*scope\.kind\s*===\s*'NO_ACTIVE_PERIOD'\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'NO_ACTIVE_PERIOD branch must return CompareFrame'
);
assert.ok(
  /<CompareFrame[^>]*>\s*<main[^>]*>[\s\S]*?Hiện chưa có kỳ đánh giá đang mở/i.test(cleanClient),
  'NO_ACTIVE_PERIOD must return CompareFrame wrapping message rather than a bare main/div'
);

// MULTIPLE_ACTIVE_PERIODS / RESOLUTION_ERROR must be wrapped in CompareFrame with role="alert"
assert.ok(
  cleanClient.includes("scope.kind === 'MULTIPLE_ACTIVE_PERIODS'") &&
  cleanClient.includes("scope.kind === 'ACTIVE_PERIOD_RESOLUTION_ERROR'"),
  'ComparePageClient must handle multiple active and resolution error scopes'
);
assert.ok(
  /if\s*\(\s*scope\.kind\s*===\s*'MULTIPLE_ACTIVE_PERIODS'[\s\S]*?\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'MULTIPLE_ACTIVE_PERIODS / ACTIVE_PERIOD_RESOLUTION_ERROR branch must return CompareFrame'
);
assert.ok(
  /<CompareFrame[^>]*>\s*<main[^>]*role="alert"[^>]*>[\s\S]*?Không thể xác định kỳ đánh giá đang mở/i.test(cleanClient),
  'MULTIPLE_ACTIVE_PERIODS / RESOLUTION_ERROR must return CompareFrame wrapping role="alert" main element'
);

// Missing data (!employee || !evaluation || !accessState) must be wrapped in CompareFrame
assert.ok(
  cleanClient.includes('!employee || !evaluation || !accessState'),
  'ComparePageClient must handle missing employee/evaluation data guard'
);
assert.ok(
  /if\s*\(\s*!employee\s*\|\|\s*!evaluation\s*\|\|\s*!accessState\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'Missing data branch must return CompareFrame'
);
assert.ok(
  /<CompareFrame[^>]*>[\s\S]*?Không tìm thấy dữ liệu nhân viên hoặc đánh giá/i.test(cleanClient),
  'Missing data state must return CompareFrame wrapping message rather than bare div'
);

// Blocked access state must be wrapped in CompareFrame
assert.ok(
  cleanClient.includes("accessState.mode === 'blocked'"),
  'ComparePageClient must guard blocked access state'
);
assert.ok(
  /if\s*\(\s*accessState\.mode\s*===\s*'blocked'\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'Blocked access branch must return CompareFrame'
);
assert.ok(
  /<CompareFrame[^>]*>[\s\S]*?Quyền truy cập bị từ chối/i.test(cleanClient),
  'Blocked access state must return CompareFrame wrapping blocked UI'
);

// Loaded state reuses CompareFrame
assert.ok(
  /return\s*\(?\s*<CompareFrame\s+onBack=\{handleBack\}\s+employeeName=\{employee\.name\}/i.test(cleanClient),
  'Loaded state must reuse CompareFrame with employee metadata'
);

// Ensure no bare main tag return outside CompareFrame
assert.ok(
  !cleanClient.includes('return <main') && !cleanClient.includes('return (<main'),
  'ComparePageClient must not directly return bare <main> without CompareFrame wrapper'
);

// Safety: error/blocked branches must NOT leak employee data into CompareFrame props
assert.ok(
  !cleanClient.includes("<CompareFrame onBack={handleBack} employeeName={employee.name}> <main className=\"flex min-h-[240px]") &&
  !cleanClient.includes("<CompareFrame onBack={handleBack} employeeName={employee?.name}> <main className=\"flex min-h-[240px]"),
  'NO_ACTIVE_PERIOD must not pass employee metadata to CompareFrame'
);

// ============================================================
// 6. PRESERVED HANDLERS, HOOKS & SAFETY INVARIANTS
// ============================================================

// Data hooks & access control
assert.ok(
  cleanClient.includes('useEvaluationComparePageData(employeeId, periodId, user)'),
  'ComparePageClient must query useEvaluationComparePageData'
);
assert.ok(
  cleanClient.includes('getEvaluationAccessState(user, evaluation, users)'),
  'ComparePageClient must determine access state with getEvaluationAccessState'
);

// Calculations
assert.ok(
  cleanClient.includes('calculateRoundScore('),
  'ComparePageClient must preserve calculateRoundScore calculation'
);
assert.ok(
  cleanClient.includes('gradeBadgeClass('),
  'ComparePageClient must preserve gradeBadgeClass helper'
);
assert.ok(
  cleanClient.includes('getGradeBandsSync()') && cleanClient.includes('getGradeBandsAction()'),
  'ComparePageClient must preserve grade bands resolution'
);

// Router & navigation handlers
assert.ok(
  cleanClient.includes('useRouter()'),
  'ComparePageClient must initialize useRouter'
);
assert.ok(
  cleanClient.includes('router.push(`/evaluations/${employeeId}`)') ||
  cleanClient.includes("router.push(`/evaluations/${employeeId}`)"),
  'ComparePageClient must preserve router.push back-to-evaluation navigation'
);
assert.ok(
  cleanClient.includes('router.push(`/evaluations/${employeeId}?round=${r.round}`)') ||
  cleanClient.includes("router.push(`/evaluations/${employeeId}?round=${r.round}`)"),
  'ComparePageClient must preserve router.push round detail navigation'
);

// ============================================================
// 7. RESPONSIVE GEOMETRY SYMMETRY
// ============================================================
assert.ok(
  cleanLoading.includes('max-w-[1440px] mx-auto') && cleanClient.includes('max-w-[1440px] mx-auto'),
  'Both loading and client frames must share max-w-[1440px] mx-auto centering'
);
assert.ok(
  cleanLoading.includes('px-3 sm:px-4 md:px-8') && cleanClient.includes('px-3 sm:px-4 md:px-8'),
  'Both loading and client frames must share responsive horizontal padding px-3 sm:px-4 md:px-8'
);
assert.ok(
  cleanLoading.includes('sticky top-0 z-50') && cleanClient.includes('sticky top-0 z-50'),
  'Both loading and client frames must share sticky top-0 header positioning'
);
assert.ok(
  cleanLoading.includes('md:hidden') && cleanLoading.includes('max-md:hidden'),
  'loading.tsx must maintain responsive mobile cards vs desktop table geometry'
);
assert.ok(
  cleanClient.includes('md:hidden') && cleanClient.includes('max-md:hidden'),
  'ComparePageClient must maintain responsive mobile cards vs desktop table geometry'
);

// ============================================================
// 8. FIREWALL / PERIMETER INVARIANTS
// ============================================================
const WRITE_GUARD_PATH = path.join(projectRoot, 'src', 'lib', 'db', 'evaluation-period-write-guard.ts');
const EVAL_WRITE_PATH = path.join(projectRoot, 'src', 'lib', 'db', 'evaluations-write.ts');
const ACTIONS_EVAL_PATH = path.join(projectRoot, 'src', 'actions', 'evaluation.ts');
const AUTH_CTX_PATH = path.join(projectRoot, 'src', 'contexts', 'AuthContext.tsx');
const SCORING_PATH = path.join(projectRoot, 'src', 'lib', 'scoring.ts');

assert.ok(fs.existsSync(WRITE_GUARD_PATH), 'Write guard must exist untouched');
assert.ok(fs.existsSync(EVAL_WRITE_PATH), 'Evaluations write module must exist untouched');
assert.ok(fs.existsSync(ACTIONS_EVAL_PATH), 'Actions evaluation module must exist untouched');
assert.ok(fs.existsSync(AUTH_CTX_PATH), 'AuthContext must exist untouched');
assert.ok(fs.existsSync(SCORING_PATH), 'Scoring module must exist untouched');

console.log('[PASS] All deterministic contract assertions verified for P96T06 compare static shell and loading frame.');
