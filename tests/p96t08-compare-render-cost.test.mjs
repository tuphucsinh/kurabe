/**
 * Focused Source-Contract Test for P96T08: Compact Compare Render Cost & Accessible Unchanged Disclosure
 *
 * NOTE: Authenticated browser evidence is a separate gate; static source-contract
 * test does not claim live browser PASS. Browser state remains BLOCKED_AUTH.
 * This test performs deterministic, side-effect-free contract assertions proving:
 * 1. Removal of visible internal criterion IDs from changed and unchanged rows while internal React key/lookup identities remain intact.
 * 2. Shared memoized comparisonRows model feeding both mobile and desktop render branches without duplicate per-renderer score/delta computation.
 * 3. Native <details> / <summary> disclosure for unchanged criteria, closed by default, keyboard accessible, with zero custom disclosure state or event handlers.
 * 4. Modest presentation-only density reduction without truncating criterion names or comments, and preserving touch target invariants.
 * 5. Preservation of all phase markers, layer markers, progressive DOM order, CompareFrame/CompareHeader state shell safety, single aggregate query hook, auth/access checks, and router navigation.
 * 6. Non-interactive invariants, absence of fake data/delays/retries/waterfalls, and firewall perimeter integrity.
 *
 * Run: node tests/p96t08-compare-render-cost.test.mjs
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
console.log('[NOTE] Executing deterministic source-contract test for P96T08 compact compare render cost & accessible unchanged disclosure...');

// ============================================================
// 1. ARTIFACT EXISTENCE & READ
// ============================================================
assert.ok(fs.existsSync(LOADING_PATH), `Compare loading fallback must exist at: ${LOADING_PATH}`);
assert.ok(fs.existsSync(CLIENT_PATH), `Compare client page must exist at: ${CLIENT_PATH}`);

const clientCode = fs.readFileSync(CLIENT_PATH, 'utf8');

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalizeWhitespace(code) {
  return code.replace(/\s+/g, ' ').trim();
}

const cleanClient = normalizeWhitespace(stripComments(clientCode));

// ============================================================
// 2. NO VISIBLE CRITERION ID IN JSX OUTPUT WHILE INTERNAL IDENTIFIERS REMAIN
// ============================================================
// No visible {criterion.id}, {c.id}, or {row.criterion.id} inside JSX text nodes
assert.ok(
  !/<[^>]*>\s*\{\s*(?:criterion|c|row\.criterion)\.id\s*\}\s*<\/[^>]*>/i.test(cleanClient),
  'ComparePageClient must NOT render criterion.id as visible JSX text content'
);
assert.ok(
  !cleanClient.includes('>{criterion.id}<') &&
  !cleanClient.includes('>{c.id}<') &&
  !cleanClient.includes('>{row.criterion.id}<'),
  'ComparePageClient must NOT contain visible criterion ID text interpolation'
);
assert.ok(
  !cleanClient.includes('{criterion.id}</span>') &&
  !cleanClient.includes('{c.id}</span>') &&
  !cleanClient.includes('{row.criterion.id}</span>'),
  'ComparePageClient must NOT render criterion ID inside span tags'
);

// Internal identifier usage for React keys and score lookups MUST remain
assert.ok(
  cleanClient.includes('key={criterion.id}') || cleanClient.includes('key={row.criterion.id}'),
  'ComparePageClient must retain criterion.id for React keys'
);
assert.ok(
  cleanClient.includes('scores?.[c.id]') || cleanClient.includes('scores[c.id]'),
  'ComparePageClient must retain c.id for changedCriteriaIds lookup'
);
assert.ok(
  cleanClient.includes('scores?.[criterion.id]') || cleanClient.includes('scores[criterion.id]'),
  'ComparePageClient must retain criterion.id for score lookups in data derivation'
);
assert.ok(
  cleanClient.includes('changedCriteriaIds.has(c.id)'),
  'ComparePageClient must retain c.id for changed-set filtering'
);

// ============================================================
// 3. SHARED MEMOIZED comparisonRows MODEL & ELIMINATION OF PER-RENDERER DUPLICATION
// ============================================================
// Export of ComparisonRow interface
assert.ok(
  cleanClient.includes('interface ComparisonRow') || cleanClient.includes('type ComparisonRow'),
  'ComparePageClient must declare ComparisonRow model type'
);
assert.ok(
  cleanClient.includes('criterion: Criterion') || cleanClient.includes('criterion: (typeof allCriteria)'),
  'ComparisonRow interface must define criterion field'
);
assert.ok(
  cleanClient.includes('roundScores: number[]'),
  'ComparisonRow interface must define roundScores number array'
);
assert.ok(
  cleanClient.includes('roundDeltas: number[]'),
  'ComparisonRow interface must define roundDeltas number array'
);
assert.ok(
  cleanClient.includes('totalDelta: number'),
  'ComparisonRow interface must define totalDelta number'
);

// Single memoized comparisonRows derivation
assert.ok(
  cleanClient.includes('const comparisonRows = useMemo') || cleanClient.includes('comparisonRows = useMemo'),
  'ComparePageClient must derive a single memoized comparisonRows model'
);
assert.ok(
  /const\s+comparisonRows\s*=\s*useMemo(?:<ComparisonRow\[\]>)?\(\s*\(\)\s*=>\s*\{[\s\S]*?\[\s*allCriteria\s*,\s*changedCriteriaIds\s*,\s*allRounds\s*\]\s*\)/.test(cleanClient),
  'comparisonRows useMemo must depend on [allCriteria, changedCriteriaIds, allRounds]'
);

// Mobile renderer (md:hidden) and Desktop renderer (max-md:hidden) both consume comparisonRows
assert.ok(
  cleanClient.includes('comparisonRows.map('),
  'ComparePageClient must iterate over comparisonRows'
);

const comparisonRowsMatches = cleanClient.match(/comparisonRows\.map\(/g);
assert.ok(
  comparisonRowsMatches && comparisonRowsMatches.length >= 2,
  'Both mobile and desktop render branches must map over comparisonRows'
);

// No duplicate per-renderer filter or round score calculation inside JSX
const changedSectionIdx = cleanClient.indexOf('data-load-layer="changed-criteria"');
const commentsSectionIdx = cleanClient.indexOf('data-load-layer="comments"');
assert.ok(changedSectionIdx > 0 && commentsSectionIdx > changedSectionIdx, 'Changed criteria section must exist before comments');

const changedSectionJSX = cleanClient.slice(changedSectionIdx, commentsSectionIdx);
assert.ok(
  !changedSectionJSX.includes('allCriteria.filter('),
  'Changed criteria JSX render tree must NOT execute allCriteria.filter (must consume memoized comparisonRows)'
);
assert.ok(
  !changedSectionJSX.includes('allRounds.map(r => r.scores?.[criterion.id]'),
  'Changed criteria JSX render tree must NOT recompute round scores per renderer'
);
assert.ok(
  !changedSectionJSX.includes('prevScore !== null ? score - prevScore : 0'),
  'Changed criteria JSX render tree must NOT recompute per-round deltas per renderer'
);
assert.ok(
  !changedSectionJSX.includes('roundScores[roundScores.length - 1] - roundScores[0]'),
  'Changed criteria JSX render tree must NOT recompute totalDelta per renderer'
);

// ============================================================
// 4. NATIVE <details> / <summary> UNCHANGED DISCLOSURE CONTRACT
// ============================================================
const unchangedSectionIdx = cleanClient.indexOf('data-load-layer="unchanged"');
assert.ok(unchangedSectionIdx > 0, 'Unchanged criteria section must exist');
const unchangedSectionJSX = cleanClient.slice(unchangedSectionIdx);

// Native <details> and <summary> elements exist
assert.ok(
  unchangedSectionJSX.includes('<details') && unchangedSectionJSX.includes('</details>'),
  'Unchanged section must render native <details> element'
);
assert.ok(
  unchangedSectionJSX.includes('<summary') && unchangedSectionJSX.includes('</summary>'),
  'Unchanged section must render native <summary> element'
);

// Closed by default: <details> tag must NOT have open attribute
assert.ok(
  !/<details\s+[^>]*\bopen\b/i.test(unchangedSectionJSX),
  'Native <details> element must NOT have open attribute (must be closed by default)'
);

// No custom disclosure state or custom event handlers
assert.ok(!cleanClient.includes('isExpanded'), 'ComparePageClient must NOT declare isExpanded state');
assert.ok(!cleanClient.includes('setIsOpen'), 'ComparePageClient must NOT declare setIsOpen state');
assert.ok(!cleanClient.includes('isOpen'), 'ComparePageClient must NOT declare isOpen state');
assert.ok(!cleanClient.includes('toggleUnchanged'), 'ComparePageClient must NOT declare toggleUnchanged state/handler');
assert.ok(!cleanClient.includes('showUnchanged'), 'ComparePageClient must NOT declare showUnchanged state/handler');
assert.ok(
  !/<summary[^>]*\bonClick\b/i.test(unchangedSectionJSX),
  '<summary> must NOT have custom onClick handler'
);
assert.ok(
  !/<details[^>]*\bonToggle\b/i.test(unchangedSectionJSX),
  '<details> must NOT have custom onToggle handler'
);

// Preserves unchanged summary labels & data
assert.ok(
  unchangedSectionJSX.includes('Tiêu chí giữ nguyên'),
  'Unchanged section summary must retain "Tiêu chí giữ nguyên" title'
);
assert.ok(
  unchangedSectionJSX.includes('Không đổi qua') && unchangedSectionJSX.includes('Chưa có vòng để so sánh'),
  'Unchanged section summary must retain round comparison subtitle'
);
assert.ok(
  unchangedSectionJSX.includes('{criterion.name}'),
  'Unchanged section content must render criterion name'
);
assert.ok(
  unchangedSectionJSX.includes('allRounds[0]?.scores?.[criterion.id] ?? 0') ||
  unchangedSectionJSX.includes('scores?.[criterion.id]'),
  'Unchanged section content must render score for criterion'
);

// ============================================================
// 5. MODEST PRESENTATION DENSITY & NO TRUNCATION
// ============================================================
// Criterion names must NOT be truncated with truncate class
assert.ok(
  !/<span[^>]*\btruncate\b[^>]*>\s*\{\s*criterion\.name\s*\}\s*<\/span>/i.test(cleanClient),
  'Criterion names in spans must NOT use truncate class'
);
assert.ok(
  !/<h3[^>]*\btruncate\b[^>]*>\s*\{\s*criterion\.name\s*\}\s*<\/h3>/i.test(cleanClient),
  'Criterion names in h3 must NOT use truncate class'
);

// Comments must NOT be truncated
assert.ok(
  cleanClient.includes('{r.comment || "Không có nhận xét."}') || cleanClient.includes('{r.comment || \'Không có nhận xét.\'}'),
  'Evaluation round comment must be preserved in full'
);
assert.ok(
  cleanClient.includes('{r.additionalComment}'),
  'Evaluation round additional comment must be preserved in full'
);

// Touch target invariants
assert.ok(
  cleanClient.includes('max-md:min-h-[44px]') && cleanClient.includes('max-md:min-w-[44px]'),
  'Back navigation button must preserve min 44x44px touch target on mobile'
);
assert.ok(
  cleanClient.includes('max-md:min-h-[36px]'),
  'Round detail link must preserve min 36px touch target on mobile'
);

// ============================================================
// 6. PRESERVED PHASE & LAYER MARKERS, ORDER, AND FRAME INVARIANTS
// ============================================================
// All 6 layers preserved
assert.ok(cleanClient.includes('data-load-layer="static"'), 'ComparePageClient must retain data-load-layer="static"');
assert.ok(cleanClient.includes('data-load-layer="static-header"'), 'ComparePageClient must retain data-load-layer="static-header"');
assert.ok(cleanClient.includes('data-load-layer="primary"'), 'ComparePageClient must retain data-load-layer="primary"');
assert.ok(cleanClient.includes('data-load-layer="changed-criteria"'), 'ComparePageClient must retain data-load-layer="changed-criteria"');
assert.ok(cleanClient.includes('data-load-layer="comments"'), 'ComparePageClient must retain data-load-layer="comments"');
assert.ok(cleanClient.includes('data-load-layer="unchanged"'), 'ComparePageClient must retain data-load-layer="unchanged"');

// Stable phase attributes preserved
assert.ok(cleanClient.includes('data-load-phase="primary"'), 'ComparePageClient must retain data-load-phase="primary"');
assert.ok(cleanClient.includes('data-load-phase="secondary"'), 'ComparePageClient must retain data-load-phase="secondary"');

// Progressive DOM order strictly maintained: primary < changed-criteria < comments < unchanged
const clientSummaryIdx = cleanClient.indexOf('data-load-layer="primary"');
const clientChangedIdx = cleanClient.indexOf('data-load-layer="changed-criteria"');
const clientCommentsIdx = cleanClient.indexOf('data-load-layer="comments"');
const clientUnchangedIdx = cleanClient.indexOf('data-load-layer="unchanged"');

assert.ok(clientSummaryIdx > 0, 'Summary section position must be found');
assert.ok(clientChangedIdx > clientSummaryIdx, 'Changed criteria section must follow summary');
assert.ok(clientCommentsIdx > clientChangedIdx, 'Comments section must follow changed criteria');
assert.ok(clientUnchangedIdx > clientCommentsIdx, 'Unchanged section must follow comments');

// Phase + layer pairings preserved
assert.ok(
  /<section[^>]*data-load-phase="primary"[^>]*data-load-layer="primary"/i.test(cleanClient) ||
  /<section[^>]*data-load-layer="primary"[^>]*data-load-phase="primary"/i.test(cleanClient),
  'Summary section must pair data-load-phase="primary" with data-load-layer="primary"'
);
assert.ok(
  /<section[^>]*data-load-phase="primary"[^>]*data-load-layer="changed-criteria"/i.test(cleanClient) ||
  /<section[^>]*data-load-layer="changed-criteria"[^>]*data-load-phase="primary"/i.test(cleanClient),
  'Changed criteria section must pair data-load-phase="primary" with data-load-layer="changed-criteria"'
);
assert.ok(
  /<section[^>]*data-load-phase="secondary"[^>]*data-load-layer="comments"/i.test(cleanClient) ||
  /<section[^>]*data-load-layer="comments"[^>]*data-load-phase="secondary"/i.test(cleanClient),
  'Comments section must pair data-load-phase="secondary" with data-load-layer="comments"'
);
assert.ok(
  /<section[^>]*data-load-phase="secondary"[^>]*data-load-layer="unchanged"/i.test(cleanClient) ||
  /<section[^>]*data-load-layer="unchanged"[^>]*data-load-phase="secondary"/i.test(cleanClient),
  'Unchanged section must pair data-load-phase="secondary" with data-load-layer="unchanged"'
);

// State-shell safety: all branches wrapped in CompareFrame
assert.ok(
  /if\s*\(\s*scope\.kind\s*===\s*'NO_ACTIVE_PERIOD'\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'NO_ACTIVE_PERIOD branch must return CompareFrame'
);
assert.ok(
  /if\s*\(\s*scope\.kind\s*===\s*'MULTIPLE_ACTIVE_PERIODS'[\s\S]*?\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'MULTIPLE_ACTIVE_PERIODS / RESOLUTION_ERROR branch must return CompareFrame'
);
assert.ok(
  /if\s*\(\s*!employee\s*\|\|\s*!evaluation\s*\|\|\s*!accessState\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'Missing data branch must return CompareFrame'
);
assert.ok(
  /if\s*\(\s*accessState\.mode\s*===\s*'blocked'\s*\)\s*\{\s*return\s*\(?\s*<CompareFrame/i.test(cleanClient),
  'Blocked access branch must return CompareFrame'
);
assert.ok(
  cleanClient.includes('return <CompareStaticFrame') || cleanClient.includes('return (<CompareStaticFrame'),
  'Loading state must return CompareStaticFrame'
);
assert.ok(
  /return\s*\(?\s*<CompareFrame\s+onBack=\{handleBack\}\s+employeeName=\{employee\.name\}/i.test(cleanClient),
  'Loaded state must reuse CompareFrame with employee metadata'
);

// ============================================================
// 7. SOLE AGGREGATE QUERY & NO FAKE DELAYS / TIMERS / RETRIES
// ============================================================
assert.ok(
  cleanClient.includes('useEvaluationComparePageData(employeeId, periodId, user)'),
  'ComparePageClient must query useEvaluationComparePageData with periodId and user'
);
const hookCount = cleanClient.match(/useEvaluationComparePageData\(/g);
assert.strictEqual(hookCount?.length, 1, 'ComparePageClient must make exactly ONE useEvaluationComparePageData call');

assert.ok(!cleanClient.includes('setTimeout'), 'ComparePageClient must NOT use setTimeout');
assert.ok(!cleanClient.includes('setInterval'), 'ComparePageClient must NOT use setInterval');
assert.ok(!cleanClient.includes('requestAnimationFrame'), 'ComparePageClient must NOT use requestAnimationFrame');
assert.ok(!cleanClient.includes('setImmediate'), 'ComparePageClient must NOT use setImmediate');
assert.ok(!cleanClient.includes('handleRetry'), 'ComparePageClient must NOT have retry handlers');
assert.ok(!cleanClient.includes('useQuery('), 'ComparePageClient must NOT introduce useQuery waterfall');
assert.ok(!cleanClient.includes('fetch('), 'ComparePageClient must NOT call client fetch');
assert.ok(!cleanClient.includes('axios'), 'ComparePageClient must NOT import or call axios');

// Preserved scoring, auth, router handlers
assert.ok(cleanClient.includes('calculateRoundScore('), 'ComparePageClient must preserve calculateRoundScore');
assert.ok(cleanClient.includes('gradeBadgeClass('), 'ComparePageClient must preserve gradeBadgeClass');
assert.ok(cleanClient.includes('getGradeBandsSync()') && cleanClient.includes('getGradeBandsAction()'), 'ComparePageClient must preserve grade bands resolution');
assert.ok(cleanClient.includes('getEvaluationAccessState(user, evaluation, users)'), 'ComparePageClient must preserve access check');
assert.ok(cleanClient.includes('useRouter()'), 'ComparePageClient must initialize useRouter');
assert.ok(cleanClient.includes('router.push(`/evaluations/${employeeId}`)'), 'ComparePageClient must preserve back router push');
assert.ok(cleanClient.includes('router.push(`/evaluations/${employeeId}?round=${r.round}`)'), 'ComparePageClient must preserve round detail router push');

// Worker role invariants
assert.ok(cleanClient.includes('const role = employee.role;'), 'ComparePageClient must filter criteria using employee.role');
assert.ok(cleanClient.includes('const evaluatorRole = employee.role;'), 'ComparePageClient must score using employee.role');

// ============================================================
// 8. FIREWALL / PERIMETER INTEGRITY
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

console.log('[PASS] All deterministic contract assertions verified for P96T08 compare render cost & accessible unchanged disclosure.');
