import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');
const displayAdmin = read('src/lib/db/evaluation-display-admin.ts');
const readAction = read('src/actions/read.ts');
const types = read('src/types/index.ts');
const hooks = read('src/hooks/use-db.ts');

assert.ok(displayAdmin.includes('export async function getEvaluationDisplayAdmin'));
assert.ok(displayAdmin.includes("getEvaluationByIdAdmin(evaluationId, viewer)"));
const displayLoader = displayAdmin.slice(displayAdmin.indexOf('export async function getEvaluationDisplayAdmin'));
assert.ok(displayLoader.indexOf('getEvaluationByIdAdmin(evaluationId, viewer)') < displayLoader.indexOf('const criteriaVersionIds'));
assert.ok(displayAdmin.includes("from('criteria_group_versions')"));
assert.ok(displayAdmin.includes("from('criterion_versions')"));
assert.ok(displayAdmin.includes("from('criterion_level_versions')"));
assert.ok(displayAdmin.includes("from('criterion_audience_versions')"));
assert.ok(displayAdmin.includes("from('grade_band_versions')"));
assert.ok(displayAdmin.includes('uniqueNonEmpty(evaluation.rounds.map'));
assert.ok(displayAdmin.includes("return 'legacy_unknown'"));
assert.ok(displayAdmin.includes("return 'unavailable'"));
assert.ok(!displayAdmin.includes('getAllCriteriaGroups'));
assert.ok(!displayAdmin.includes('loadGradeBandsFromDb'));
assert.ok(!displayAdmin.includes('getGradeBandsSync'));
assert.ok(displayAdmin.includes('criteriaGroups:') && displayAdmin.includes(': [],'));
assert.ok(displayAdmin.includes('employeeRoleSnapshot: evaluation.employeeRole'));
assert.ok(displayAdmin.includes('round.totalScore'));
assert.ok(displayAdmin.includes('round.grade'));
assert.ok(displayAdmin.includes('round.evaluatorRole'));

assert.ok(types.includes("export type EvaluationSnapshotState = 'authoritative' | 'legacy_unknown' | 'unavailable'"));
assert.ok(types.includes('export interface EvaluationDisplayDto'));
assert.ok(types.includes('criteriaConfigVersionId: string | null'));
assert.ok(types.includes('gradeConfigVersionId: string | null'));
assert.ok(types.includes('criteriaGroups: CriteriaGroup[]'));

assert.ok(readAction.includes('export async function getEvaluationDisplayAction'));
const authIndex = readAction.indexOf('const auth = await requireAuth();', readAction.indexOf('getEvaluationDisplayAction'));
const loaderIndex = readAction.indexOf('getEvaluationDisplayAdmin(evaluationId, auth.user)');
assert.ok(authIndex >= 0 && loaderIndex > authIndex);

assert.ok(hooks.includes('export const useEvaluationDisplay'));
assert.ok(hooks.includes("scopedKey('evaluation-display', [evaluationId, periodId], user)"));
assert.ok(hooks.includes('getEvaluationDisplayAction(evaluationId)'));

console.log('H7_SNAPSHOT_DISPLAY_SOURCE_CONTRACT PASS cases=25');
