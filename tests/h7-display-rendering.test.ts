import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const compare = read('src/app/evaluations/[id]/compare/ComparePageClient.tsx');
const detail = read('src/app/evaluations/[id]/EvaluationPageClient.tsx');
const pageState = read('src/hooks/use-evaluation-page-state.ts');

// The UI must consume the fixed H7 hook; it may not reconstruct submitted values
// from the live criteria/grade configuration.
assert.ok(compare.includes('useEvaluationDisplay'), 'compare must consume useEvaluationDisplay');
assert.ok(detail.includes('useEvaluationDisplay'), 'detail must consume useEvaluationDisplay');
assert.ok(pageState.includes('evaluationDisplay?: EvaluationDisplayDto | null'), 'page state must accept the fixed H7 DTO');
assert.ok(pageState.includes("historicalDisplayRound.snapshotState !== 'authoritative'"), 'page state must fail closed for non-authoritative snapshots');
assert.ok(pageState.includes('getCriteriaForRoleAction(employee.role)'), 'draft must retain the current-rules criteria workflow');
assert.ok(pageState.includes('if (isSubmittedRound)'), 'submitted and draft criteria paths must be separate');

// Submitted summary values come directly from the historical DTO.
assert.ok(compare.includes('view.displayRound.totalScore'), 'compare score must use submitted DTO score');
assert.ok(compare.includes('view.displayRound.grade'), 'compare grade must use submitted DTO grade');
assert.ok(compare.includes('displayRound.evaluatorRole'), 'compare must render submitted evaluator role from DTO');
assert.ok(detail.includes('historicalRound.totalScore'), 'detail score must use submitted DTO score');
assert.ok(detail.includes('historicalRound.grade'), 'detail grade must use submitted DTO grade');
assert.ok(detail.includes('historicalRound.evaluatorRole'), 'detail evaluator role must use submitted DTO role');
assert.ok(detail.includes('employeeRoleSnapshot'), 'detail subject role must use the DTO role snapshot');

// Criteria labels are resolved per round, not from one merged live projection.
assert.ok(compare.includes('roundCriteria'), 'compare must retain per-round criterion metadata');
assert.ok(compare.includes('roundCriteria[rIdx]?.name'), 'compare must render each round criterion label');
assert.ok(detail.includes('criteriaGroups[0]?.configVersionId'), 'detail must expose the historical criteria version');

// Explicit loading/error/legacy/unavailable states are required, and live fallback
// must not be used when the historical DTO is absent or unusable.
for (const state of ['loading', 'error', 'legacy_unknown', 'unavailable']) {
  assert.ok(compare.includes(`data-historical-snapshot-state="${state}"`) || compare.includes(`'${state}'`), `compare must expose ${state} state`);
}
assert.ok(detail.includes('data-historical-snapshot-state="error"'), 'detail must expose historical load error');
assert.ok(detail.includes("historicalSnapshotState === 'legacy_unknown'"), 'detail must expose legacy snapshot state');
assert.ok(detail.includes("historicalSnapshotState === 'unavailable'"), 'detail must expose unavailable snapshot state');
assert.ok(detail.includes('Không dùng cấu hình hiện tại'), 'detail must not fall back to current config');
assert.ok(compare.includes('Không dùng cấu hình hiện tại'), 'compare must not fall back to current config');
assert.match(
  compare,
  /view\.isSubmitted && view\.displayRound\s*\n\s*\? \{ totalScore: view\.displayRound\.totalScore, grade: view\.displayRound\.grade \}/,
  'submitted compare rounds must use DTO grade and score instead of live grade bands'
);

// Existing route and authorization boundaries remain in place.
assert.ok(compare.includes('scope.kind === \'NO_ACTIVE_PERIOD\''), 'compare active-period gate must remain');
assert.ok(compare.includes('getEvaluationAccessState(user, evaluation, users)'), 'compare access guard must remain');
assert.ok(detail.includes('scope.kind === \'NO_ACTIVE_PERIOD\''), 'detail active-period gate must remain');
assert.ok(detail.includes('getEvaluationAccessState(user, evaluation'), 'detail access guard must remain');
assert.equal(compare.includes('status === \'Closed\''), false, 'compare must not add a closed-period shortcut');

console.log('H7 display rendering source contract: ALL PASS');
