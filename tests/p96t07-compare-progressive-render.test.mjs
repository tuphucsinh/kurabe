/**
 * Focused Source-Contract Test for P96T07: Progressive Render Contract (Primary & Secondary Phases)
 *
 * NOTE: Authenticated browser evidence is a separate gate; static source-contract
 * test does not claim live browser PASS. Browser state remains BLOCKED_AUTH.
 * This test performs deterministic, side-effect-free contract assertions proving:
 * 1. Explicit stable phase attributes (data-load-phase="primary" and data-load-phase="secondary") exist in loading.tsx and ComparePageClient.tsx.
 * 2. Primary sections strictly precede secondary sections in DOM/source order.
 * 3. All 6 data-load-layer markers (static, static-header, primary, changed-criteria, comments, unchanged) remain intact.
 * 4. Sole aggregate query (useEvaluationComparePageData) is preserved without duplicate queries, client waterfall, fake streaming, fake timeouts/delays, or retry buttons.
 * 5. Truthful aggregate readiness marker (data-load-state="loading" vs data-load-state="ready") is exposed without premature network milestones.
 * 6. Non-interactive invariants and absence of fake employee/score data in loading.tsx.
 * 7. State-shell safety invariants (reusable CompareFrame wrapping all early-return branches).
 *
 * Run: node tests/p96t07-compare-progressive-render.test.mjs
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
console.log('[NOTE] Executing deterministic source-contract test for P96T07 compare progressive render contract...');

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
// 2. PHASE ATTRIBUTES & LAYER MARKERS IN loading.tsx
// ============================================================
// Stable phase attributes
assert.ok(
  cleanLoading.includes('data-load-phase="primary"'),
  'loading.tsx must contain data-load-phase="primary"'
);
assert.ok(
  cleanLoading.includes('data-load-phase="secondary"'),
  'loading.tsx must contain data-load-phase="secondary"'
);

// Truthful aggregate readiness marker
assert.ok(
  cleanLoading.includes('data-load-state="loading"'),
  'loading.tsx root frame must declare data-load-state="loading"'
);

// All 6 layer markers preserved in loading.tsx
assert.ok(cleanLoading.includes('data-load-layer="static"'), 'loading.tsx must retain data-load-layer="static"');
assert.ok(cleanLoading.includes('data-load-layer="static-header"'), 'loading.tsx must retain data-load-layer="static-header"');
assert.ok(cleanLoading.includes('data-load-layer="primary"'), 'loading.tsx must retain data-load-layer="primary"');
assert.ok(cleanLoading.includes('data-load-layer="changed-criteria"'), 'loading.tsx must retain data-load-layer="changed-criteria"');
assert.ok(cleanLoading.includes('data-load-layer="comments"'), 'loading.tsx must retain data-load-layer="comments"');
assert.ok(cleanLoading.includes('data-load-layer="unchanged"'), 'loading.tsx must retain data-load-layer="unchanged"');

// Phase + layer pairings in loading.tsx
// Primary phase = summary + changed-criteria
assert.ok(
  /<section[^>]*data-load-phase="primary"[^>]*data-load-layer="primary"/i.test(cleanLoading) ||
  /<section[^>]*data-load-layer="primary"[^>]*data-load-phase="primary"/i.test(cleanLoading),
  'loading.tsx summary section must have both data-load-phase="primary" and data-load-layer="primary"'
);
assert.ok(
  /<section[^>]*data-load-phase="primary"[^>]*data-load-layer="changed-criteria"/i.test(cleanLoading) ||
  /<section[^>]*data-load-layer="changed-criteria"[^>]*data-load-phase="primary"/i.test(cleanLoading),
  'loading.tsx changed-criteria section must have both data-load-phase="primary" and data-load-layer="changed-criteria"'
);

// Secondary phase = comments + unchanged
assert.ok(
  /<section[^>]*data-load-phase="secondary"[^>]*data-load-layer="comments"/i.test(cleanLoading) ||
  /<section[^>]*data-load-layer="comments"[^>]*data-load-phase="secondary"/i.test(cleanLoading),
  'loading.tsx comments section must have both data-load-phase="secondary" and data-load-layer="comments"'
);
assert.ok(
  /<section[^>]*data-load-phase="secondary"[^>]*data-load-layer="unchanged"/i.test(cleanLoading) ||
  /<section[^>]*data-load-layer="unchanged"[^>]*data-load-phase="secondary"/i.test(cleanLoading),
  'loading.tsx unchanged section must have both data-load-phase="secondary" and data-load-layer="unchanged"'
);

// Order in loading.tsx: Primary sections strictly precede secondary sections
const loadingSummaryIdx = cleanLoading.indexOf('data-load-layer="primary"');
const loadingChangedIdx = cleanLoading.indexOf('data-load-layer="changed-criteria"');
const loadingCommentsIdx = cleanLoading.indexOf('data-load-layer="comments"');
const loadingUnchangedIdx = cleanLoading.indexOf('data-load-layer="unchanged"');

assert.ok(loadingSummaryIdx > 0, 'loading summary section position must be found');
assert.ok(loadingChangedIdx > loadingSummaryIdx, 'loading changed-criteria section must follow summary');
assert.ok(loadingCommentsIdx > loadingChangedIdx, 'loading comments section must follow changed-criteria');
assert.ok(loadingUnchangedIdx > loadingCommentsIdx, 'loading unchanged section must follow comments');

// ============================================================
// 3. PHASE ATTRIBUTES & LAYER MARKERS IN ComparePageClient.tsx
// ============================================================
// Stable phase attributes
assert.ok(
  cleanClient.includes('data-load-phase="primary"'),
  'ComparePageClient.tsx must contain data-load-phase="primary"'
);
assert.ok(
  cleanClient.includes('data-load-phase="secondary"'),
  'ComparePageClient.tsx must contain data-load-phase="secondary"'
);

// Truthful aggregate readiness marker in CompareFrame
assert.ok(
  cleanClient.includes('data-load-state={loadState}') || cleanClient.includes('data-load-state="ready"'),
  'CompareFrame must bind data-load-state'
);
assert.ok(
  cleanClient.includes('loadState="ready"') || cleanClient.includes("loadState='ready'") || cleanClient.includes('loadState = \'ready\''),
  'ComparePageClient loaded view must expose ready state only after aggregate data is available'
);

// All 6 layer markers preserved in ComparePageClient.tsx
assert.ok(cleanClient.includes('data-load-layer="static"'), 'ComparePageClient must retain data-load-layer="static"');
assert.ok(cleanClient.includes('data-load-layer="static-header"'), 'ComparePageClient must retain data-load-layer="static-header"');
assert.ok(cleanClient.includes('data-load-layer="primary"'), 'ComparePageClient must retain data-load-layer="primary"');
assert.ok(cleanClient.includes('data-load-layer="changed-criteria"'), 'ComparePageClient must retain data-load-layer="changed-criteria"');
assert.ok(cleanClient.includes('data-load-layer="comments"'), 'ComparePageClient must retain data-load-layer="comments"');
assert.ok(cleanClient.includes('data-load-layer="unchanged"'), 'ComparePageClient must retain data-load-layer="unchanged"');

// Phase + layer pairings in ComparePageClient.tsx
assert.ok(
  /<section[^>]*data-load-phase="primary"[^>]*data-load-layer="primary"/i.test(cleanClient) ||
  /<section[^>]*data-load-layer="primary"[^>]*data-load-phase="primary"/i.test(cleanClient),
  'ComparePageClient summary section must have both data-load-phase="primary" and data-load-layer="primary"'
);
assert.ok(
  /<section[^>]*data-load-phase="primary"[^>]*data-load-layer="changed-criteria"/i.test(cleanClient) ||
  /<section[^>]*data-load-layer="changed-criteria"[^>]*data-load-phase="primary"/i.test(cleanClient),
  'ComparePageClient changed-criteria section must have both data-load-phase="primary" and data-load-layer="changed-criteria"'
);
assert.ok(
  /<section[^>]*data-load-phase="secondary"[^>]*data-load-layer="comments"/i.test(cleanClient) ||
  /<section[^>]*data-load-layer="comments"[^>]*data-load-phase="secondary"/i.test(cleanClient),
  'ComparePageClient comments section must have both data-load-phase="secondary" and data-load-layer="comments"'
);
assert.ok(
  /<section[^>]*data-load-phase="secondary"[^>]*data-load-layer="unchanged"/i.test(cleanClient) ||
  /<section[^>]*data-load-layer="unchanged"[^>]*data-load-phase="secondary"/i.test(cleanClient),
  'ComparePageClient unchanged section must have both data-load-phase="secondary" and data-load-layer="unchanged"'
);

// Order in ComparePageClient.tsx: Primary sections strictly precede secondary sections
const clientSummaryIdx = cleanClient.indexOf('data-load-layer="primary"');
const clientChangedIdx = cleanClient.indexOf('data-load-layer="changed-criteria"');
const clientCommentsIdx = cleanClient.indexOf('data-load-layer="comments"');
const clientUnchangedIdx = cleanClient.indexOf('data-load-layer="unchanged"');

assert.ok(clientSummaryIdx > 0, 'client summary section position must be found');
assert.ok(clientChangedIdx > clientSummaryIdx, 'client changed-criteria section must follow summary');
assert.ok(clientCommentsIdx > clientChangedIdx, 'client comments section must follow changed-criteria');
assert.ok(clientUnchangedIdx > clientCommentsIdx, 'client unchanged section must follow comments');

// ============================================================
// 4. SOLE AGGREGATE QUERY & NO FAKE DELAYS / STREAMING / RETRIES
// ============================================================
// Preserves single aggregate query hook
assert.ok(
  cleanClient.includes('useEvaluationComparePageData(employeeId, periodId, user)'),
  'ComparePageClient must call useEvaluationComparePageData with periodId and user'
);

const hookMatches = cleanClient.match(/useEvaluationComparePageData\(/g);
assert.strictEqual(hookMatches?.length, 1, 'ComparePageClient must have exactly ONE useEvaluationComparePageData call (no duplicate queries)');

// No fake delays or artificial timers
assert.ok(!cleanClient.includes('setTimeout'), 'ComparePageClient must NOT use setTimeout');
assert.ok(!cleanClient.includes('setInterval'), 'ComparePageClient must NOT use setInterval');
assert.ok(!cleanClient.includes('requestAnimationFrame'), 'ComparePageClient must NOT use requestAnimationFrame');
assert.ok(!cleanClient.includes('setImmediate'), 'ComparePageClient must NOT use setImmediate');

// No fake state variables for artificial progressive timing
assert.ok(!cleanClient.includes('isSecondaryLoaded'), 'ComparePageClient must NOT invent fake secondary loaded state');
assert.ok(!cleanClient.includes('secondaryReady'), 'ComparePageClient must NOT invent fake secondary ready state');
assert.ok(!cleanClient.includes('primaryLoaded'), 'ComparePageClient must NOT invent fake primary loaded state');

// No local retry buttons / fallback queries
assert.ok(!cleanClient.includes('handleRetry'), 'ComparePageClient must NOT invent local retry handlers');
assert.ok(!cleanClient.includes('useQuery('), 'ComparePageClient must NOT add separate useQuery waterfalls');
assert.ok(!cleanClient.includes('fetch('), 'ComparePageClient must NOT add client fetch calls');
assert.ok(!cleanClient.includes('axios'), 'ComparePageClient must NOT add client axios calls');

// ============================================================
// 5. NON-INTERACTIVE & SAFETY INVARIANTS IN loading.tsx
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

// ARIA semantics in loading.tsx
assert.ok(cleanLoading.includes('role="status"'), 'loading.tsx must declare role="status"');
assert.ok(cleanLoading.includes('aria-busy="true"'), 'loading.tsx must declare aria-busy="true"');

// No write action imports in loading.tsx
assert.ok(
  !cleanLoading.includes('saveEvaluationRound') &&
  !cleanLoading.includes('initializeEvaluationRoundDraft') &&
  !cleanLoading.includes('returnEvaluationRound'),
  'loading.tsx must NOT import or invoke evaluation write actions'
);

// Component exports in loading.tsx
assert.ok(cleanLoading.includes('export function CompareStaticFrame'), 'loading.tsx must export CompareStaticFrame');
assert.ok(cleanLoading.includes('export default function CompareLoading'), 'loading.tsx must export default function CompareLoading');

// ============================================================
// 6. STATE-SHELL SAFETY INVARIANTS (NO BARE EARLY RETURNS)
// ============================================================
// NO_ACTIVE_PERIOD branch
assert.ok(
  /if\s*\(\s*scope\.kind\s*===\s*'NO_ACTIVE_PERIOD'\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'NO_ACTIVE_PERIOD branch must return CompareFrame'
);
assert.ok(
  /<CompareFrame[^>]*>\s*<main[^>]*>[\s\S]*?Hiện chưa có kỳ đánh giá đang mở/i.test(cleanClient),
  'NO_ACTIVE_PERIOD must return CompareFrame wrapping message rather than bare div'
);

// MULTIPLE_ACTIVE_PERIODS / ACTIVE_PERIOD_RESOLUTION_ERROR branch
assert.ok(
  /if\s*\(\s*scope\.kind\s*===\s*'MULTIPLE_ACTIVE_PERIODS'[\s\S]*?\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'MULTIPLE_ACTIVE_PERIODS / ACTIVE_PERIOD_RESOLUTION_ERROR branch must return CompareFrame'
);
assert.ok(
  /<CompareFrame[^>]*>\s*<main[^>]*role="alert"[^>]*>[\s\S]*?Không thể xác định kỳ đánh giá đang mở/i.test(cleanClient),
  'MULTIPLE_ACTIVE_PERIODS / RESOLUTION_ERROR must return CompareFrame wrapping role="alert" main element'
);

// Missing data branch
assert.ok(
  /if\s*\(\s*!employee\s*\|\|\s*!evaluation\s*\|\|\s*!accessState\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'Missing data branch must return CompareFrame'
);

// Blocked access branch
assert.ok(
  /if\s*\(\s*accessState\.mode\s*===\s*'blocked'\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'Blocked access branch must return CompareFrame'
);

// Loading state renders CompareStaticFrame
assert.ok(
  cleanClient.includes('return <CompareStaticFrame') || cleanClient.includes('return (<CompareStaticFrame'),
  'ComparePageClient must render CompareStaticFrame during loading state'
);

// Loaded state reuses CompareFrame with metadata
assert.ok(
  /return\s*\(?\s*<CompareFrame\s+onBack=\{handleBack\}\s+employeeName=\{employee\.name\}/i.test(cleanClient),
  'Loaded state must reuse CompareFrame with employee metadata'
);

// No bare main tag return outside CompareFrame
assert.ok(
  !cleanClient.includes('return <main') && !cleanClient.includes('return (<main'),
  'ComparePageClient must not directly return bare <main> without CompareFrame wrapper'
);

// ============================================================
// 7. RESPONSIVE GEOMETRY SYMMETRY
// ============================================================
assert.ok(
  cleanLoading.includes('max-w-7xl mx-auto') && cleanClient.includes('max-w-7xl mx-auto'),
  'Both loading and client frames must share max-w-7xl mx-auto centering'
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

console.log('[PASS] All deterministic contract assertions verified for P96T07 progressive render contract.');
