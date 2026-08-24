import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/hooks/use-evaluation-page-state.ts', 'utf8');
const defaultBlock = source.match(
  /if \(Object\.keys\(initialScores\)\.length === 0 && !!accessState\.editableRound\) \{([\s\S]*?)\n        \}/
)?.[1];

assert.ok(defaultBlock, 'default evaluation selection block must exist');
assert.match(
  defaultBlock,
  /initialScores\[criterion\.id!\] = criterion\.levels\[criterion\.defaultLevelIndex\]\.points;/,
  'default level must initialize its score'
);
assert.match(
  defaultBlock,
  /initialSelectedLevelIndexes\[criterion\.id!\] = criterion\.defaultLevelIndex;/,
  'default level must initialize its selected index so draft save passes validation'
);

console.log('Evaluation default selection regression tests: ALL PASS');
