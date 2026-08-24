import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('db/migration-p3-evaluation-transaction.sql', 'utf8');
const repair = fs.readFileSync('db/repair-p3-evaluation-transaction-v2.sql', 'utf8');

for (const source of [migration, repair]) {
  assert.match(source, /FROM public\.evaluation_rounds AS target_round\s+WHERE target_round\.evaluation_id = p_evaluation_id\s+AND target_round\.round = p_round/);
  assert.match(source, /FROM public\.evaluation_rounds AS next_round\s+WHERE next_round\.evaluation_id = p_evaluation_id\s+AND next_round\.round = p_next_round/);
  assert.doesNotMatch(source, /FROM public\.evaluation_rounds\s+WHERE evaluation_id = p_evaluation_id/);
  assert.match(source, /kurabe:p3:candidate:v1:function:save_evaluation_round_transaction/);
}

assert.match(repair, /REPAIR_BLOCKED: expected P3 function is absent/);
assert.match(repair, /REPAIR_BLOCKED: function provenance marker mismatch/);
assert.match(repair, /CREATE OR REPLACE FUNCTION public\.save_evaluation_round_transaction/);

console.log('P3 RPC ambiguity regression tests: ALL PASS');
