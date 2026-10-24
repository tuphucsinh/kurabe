import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientPath = path.join(projectRoot, 'src', 'app', 'evaluations', '[id]', 'compare', 'ComparePageClient.tsx');

// ============================================================================
// P110M1T03 — Compare page must not treat a missing score as 0. Missing scores
// stay null, deltas exist only between two valid numeric endpoints, and the UI
// renders missing scores as an explicit dash.
// ============================================================================

function extractUseMemoArrowBody(sourceCode, varName) {
  const sourceFile = ts.createSourceFile(clientPath, sourceCode, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let arrowText = null;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === varName) {
      if (node.initializer && ts.isCallExpression(node.initializer)) {
        const arg0 = node.initializer.arguments[0];
        if (arg0 && (ts.isArrowFunction(arg0) || ts.isFunctionExpression(arg0))) {
          arrowText = arg0.getText(sourceFile);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  if (!arrowText) throw new Error(`Could not find useMemo callback for ${varName}`);
  return arrowText;
}

const source = fs.readFileSync(clientPath, 'utf8');
const comparisonRowsArrow = extractUseMemoArrowBody(source, 'comparisonRows');
const transpiled = ts.transpileModule(`return (${comparisonRowsArrow});`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const computeRows = (allCriteria, changedCriteriaIds, roundViews) =>
  new Function('allCriteria', 'changedCriteriaIds', 'roundViews', transpiled)(
    allCriteria, changedCriteriaIds, roundViews
  )();

const criterion = { id: 'c1', code: 'A1', name: 'Crit 1', appliesTo: ['Employee'] };
const allCriteria = [criterion];
const changed = new Set(['c1']);

function roundViewsFrom(scoresPerRound, criteriaPerRound) {
  return scoresPerRound.map((scores, i) => ({
    round: { round: i + 1, scores },
    criteriaGroups: [
      { id: 'g1', code: 'A', name: 'Group A', criteria: criteriaPerRound[i] ? [criterion] : [] },
    ],
    isSubmitted: true,
    displayRound: null,
  }));
}

function rowFor(scoresPerRound, criteriaPerRound) {
  const rows = computeRows(allCriteria, changed, roundViewsFrom(scoresPerRound, criteriaPerRound));
  assert.equal(rows.length, 1);
  return rows[0];
}

// --- 1. 4 → 6 → missing: round 1-2 delta +2; round 2-3 and total undefined ---
{
  const row = rowFor([{ c1: 4 }, { c1: 6 }, {}], [true, true, true]);
  assert.deepEqual(row.roundScores, [4, 6, null], 'missing score must stay null, never 0');
  assert.deepEqual(row.roundDeltas, [null, 2, null], 'delta only between two valid endpoints');
  assert.equal(row.totalDelta, null, 'total delta undefined when the last score is missing');
}

// --- 2. Missing because the criterion does not apply in the last round ---
{
  const row = rowFor([{ c1: 4 }, { c1: 6 }, {}], [true, true, false]);
  assert.deepEqual(row.roundScores, [4, 6, null],
    'criterion absent from a round must not be treated as 0');
  assert.equal(row.totalDelta, null);
}

// --- 3. 0 is a valid score: 0 → 4 = +4 ---
{
  const row = rowFor([{ c1: 0 }, { c1: 4 }], [true, true]);
  assert.deepEqual(row.roundScores, [0, 4]);
  assert.deepEqual(row.roundDeltas, [null, 4], '0 → 4 must be +4');
  assert.equal(row.totalDelta, 4);
}

// --- 4. 4 → 0 = -4 ---
{
  const row = rowFor([{ c1: 4 }, { c1: 0 }], [true, true]);
  assert.deepEqual(row.roundScores, [4, 0]);
  assert.deepEqual(row.roundDeltas, [null, -4], '4 → 0 must be -4');
  assert.equal(row.totalDelta, -4);
}

// --- 5. Missing in the middle: 4 → missing → 6 has no invented deltas ---
{
  const row = rowFor([{ c1: 4 }, {}, { c1: 6 }], [true, true, true]);
  assert.deepEqual(row.roundScores, [4, null, 6]);
  assert.deepEqual(row.roundDeltas, [null, null, null],
    'no delta may be computed across a missing middle score');
  assert.equal(row.totalDelta, 6 - 4,
    'first/last both valid: total delta still exists');
}

// --- 6. Renderers surface missing scores explicitly (no silent 0, no NaN) ---
assert.match(source, /score === null \? '—' : score/, 'score cells must render a dash for missing scores');
assert.match(source, /title=\{score === null \? 'Chưa chấm' : undefined\}/, 'missing score cells must be labelled');
assert.match(source, /totalDelta === null \? '—'/, 'total delta badge must render a dash when undefined');
assert.match(source, /delta !== null && delta !== 0/, 'delta chips must skip null deltas');
assert.doesNotMatch(source, /scores\?\.\[criterion\.id\] \?\? 0/, 'the ?? 0 missing-score coercion must stay removed');
assert.match(source, /roundScores: Array<number \| null>/, 'ComparisonRow type must allow null scores');

console.log('P110M1T03 compare missing-score handling: ALL PASS');
