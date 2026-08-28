/**
 * Regression contract for the compact compare-page presentation pass.
 *
 * This is a source-contract test only. It does not claim authenticated browser
 * visual PASS; the supplied production URL currently redirects to /login.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientPath = path.join(projectRoot, 'src', 'app', 'evaluations', '[id]', 'compare', 'ComparePageClient.tsx');
const loadingPath = path.join(projectRoot, 'src', 'app', 'evaluations', '[id]', 'compare', 'loading.tsx');

const client = fs.readFileSync(clientPath, 'utf8');
const loading = fs.readFileSync(loadingPath, 'utf8');

function stripComments(code) {
  return code.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function normalize(code) {
  return stripComments(code).replace(/\s+/g, ' ').trim();
}

const cleanClient = normalize(client);
const cleanLoading = normalize(loading);

// Desktop uses the available width more effectively; vertical rhythm is compact.
assert.ok(cleanClient.includes('max-w-[1440px]'), 'Compare frame must use a wider desktop content container');
assert.ok(cleanClient.includes('flex flex-col gap-4 sm:gap-6'), 'Compare sections must reduce vertical spacing');
assert.ok(cleanLoading.includes('max-w-[1440px]'), 'Compare loading frame must match the wider content container');
assert.ok(cleanLoading.includes('flex flex-col gap-4 sm:gap-6'), 'Compare loading sections must reduce vertical spacing');

// Summary cards are compact but remain horizontally scrollable on narrow screens.
assert.ok(
  cleanClient.includes('min-w-[144px] sm:min-w-[160px] p-3 sm:p-4 rounded-2xl'),
  'Summary cards must use a compact responsive footprint'
);
assert.ok(
  cleanClient.includes('text-2xl sm:text-3xl font-black'),
  'Summary score typography must be compacted without removing the score'
);
assert.ok(
  cleanLoading.includes('min-w-[144px] sm:min-w-[160px] p-3 sm:p-4 rounded-2xl'),
  'Summary loading cards must match the compact responsive footprint'
);

// Table density is reduced without hiding criteria, scores, or deltas.
assert.ok(cleanClient.includes('rounded-2xl border border-outline-soft bg-surface-raised overflow-hidden shadow-sm'), 'Compare table must use a compact radius');
assert.ok(cleanClient.includes('px-4 py-3 text-[11px]'), 'Compare table header must use compact padding');
assert.ok(cleanClient.includes('px-3 py-2.5 text-center'), 'Compare table cells must use compact padding');
assert.ok(cleanClient.includes('w-9 h-9 flex items-center justify-center'), 'Compare score boxes must be compact');
assert.ok(cleanLoading.includes('px-4 py-3 text-[11px]'), 'Compare table loading header must use compact padding');

// Comments remain complete and visible; only their chrome/spacing is compacted.
assert.ok(cleanClient.includes('p-4 rounded-2xl border shadow-sm flex flex-col gap-3'), 'Comment cards must use compact spacing');
assert.ok(cleanClient.includes('{r.comment || "Không có nhận xét."}'), 'Full comment fallback must remain');
assert.ok(cleanClient.includes('{r.additionalComment}'), 'Additional comments must remain');

// Existing behavior and accessibility invariants remain intact.
assert.ok(cleanClient.includes('useEvaluationComparePageData(employeeId, periodId, user)'), 'Aggregate compare query must remain unchanged');
assert.strictEqual((cleanClient.match(/useEvaluationComparePageData\(/g) || []).length, 1, 'Compare page must keep one aggregate query');
assert.ok(cleanClient.includes('getEvaluationAccessState(user, evaluation, users)'), 'Evaluation access guard must remain');
assert.ok(cleanClient.includes('max-md:min-h-[44px]') && cleanClient.includes('max-md:min-w-[44px]'), 'Mobile back target must remain at least 44px');
assert.ok(cleanClient.includes('<details') && cleanClient.includes('<summary'), 'Unchanged criteria disclosure must remain native');
assert.ok(cleanClient.includes('data-load-layer="primary"') && cleanClient.includes('data-load-layer="comments"'), 'Progressive layer markers must remain');
assert.ok(!cleanClient.includes('setTimeout') && !cleanClient.includes('requestAnimationFrame'), 'Density pass must not add artificial delays');

console.log('Compare density regression tests: ALL PASS');
