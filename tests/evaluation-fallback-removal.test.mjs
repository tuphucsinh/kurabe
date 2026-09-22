/**
 * Source-contract test for P105M1T02: Removal of unreachable legacy evaluation fallbacks.
 *
 * Verifies:
 *  (a) Both fail-closed gate strings are still present in saveEvaluationRound and returnEvaluationRound;
 *  (b) Both transactional RPC names ('save_evaluation_round_transaction_active_only',
 *      'return_evaluation_round_transaction') are still present;
 *  (c) The strings 'Legacy fallback is unreachable' and 'Guarded sequential return branch' are gone;
 *  (d) No .from('evaluation_rounds') sequential update/rollback path remains inside
 *      saveEvaluationRound and returnEvaluationRound function bodies.
 *
 * Run: node tests/evaluation-fallback-removal.test.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const evaluationTsPath = path.join(projectRoot, 'src', 'actions', 'evaluation.ts');
assert.ok(fs.existsSync(evaluationTsPath), 'src/actions/evaluation.ts must exist');

const evaluationSource = fs.readFileSync(evaluationTsPath, 'utf8');

function extractFunctionBody(source, functionName) {
  const declRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${functionName}\\s*\\([^)]*\\)[^{]*\\{`);
  const match = source.match(declRegex);
  assert.ok(match, `Function declaration not found: ${functionName}`);

  const bodyStartIndex = match.index + match[0].length - 1;
  let depth = 0;
  let bodyEndIndex = -1;

  for (let i = bodyStartIndex; i < source.length; i++) {
    if (source[i] === '{') {
      depth++;
    } else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        bodyEndIndex = i + 1;
        break;
      }
    }
  }

  assert.strictEqual(depth, 0, `Unbalanced braces in function ${functionName}`);
  assert.ok(bodyEndIndex > bodyStartIndex, `Could not find end of function ${functionName}`);
  return source.slice(bodyStartIndex, bodyEndIndex);
}

const saveEvaluationRoundBody = extractFunctionBody(evaluationSource, 'saveEvaluationRound');
const returnEvaluationRoundBody = extractFunctionBody(evaluationSource, 'returnEvaluationRound');

// ============================================================
// (a) Both fail-closed gate strings are still present
// ============================================================
const FAIL_CLOSED_ERROR_STRING = 'Transactional evaluation RPC is required; legacy fallback is disabled.';
const FAIL_CLOSED_ENV_CHECK = "process.env.KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC === 'true'";

assert.ok(
  saveEvaluationRoundBody.includes(FAIL_CLOSED_ERROR_STRING),
  'saveEvaluationRound must retain fail-closed error string'
);
assert.ok(
  saveEvaluationRoundBody.includes(FAIL_CLOSED_ENV_CHECK),
  'saveEvaluationRound must retain fail-closed env check'
);

assert.ok(
  returnEvaluationRoundBody.includes(FAIL_CLOSED_ERROR_STRING),
  'returnEvaluationRound must retain fail-closed error string'
);
assert.ok(
  returnEvaluationRoundBody.includes(FAIL_CLOSED_ENV_CHECK),
  'returnEvaluationRound must retain fail-closed env check'
);

// ============================================================
// (b) Both transactional RPC names are still present
// ============================================================
const SAVE_RPC_NAME = 'save_evaluation_round_transaction_active_only';
const RETURN_RPC_NAME = 'return_evaluation_round_transaction';

assert.ok(
  saveEvaluationRoundBody.includes(SAVE_RPC_NAME),
  `saveEvaluationRound must invoke transactional RPC ${SAVE_RPC_NAME}`
);

assert.ok(
  returnEvaluationRoundBody.includes(RETURN_RPC_NAME),
  `returnEvaluationRound must invoke transactional RPC ${RETURN_RPC_NAME}`
);

// ============================================================
// (c) Legacy fallback markers are gone
// ============================================================
const LEGACY_SAVE_COMMENT = 'Legacy fallback is unreachable';
const LEGACY_RETURN_COMMENT = 'Guarded sequential return branch';

assert.ok(
  !evaluationSource.includes(LEGACY_SAVE_COMMENT),
  `Source must not contain legacy comment "${LEGACY_SAVE_COMMENT}"`
);

assert.ok(
  !evaluationSource.includes(LEGACY_RETURN_COMMENT),
  `Source must not contain legacy comment "${LEGACY_RETURN_COMMENT}"`
);

// ============================================================
// (d) No .from('evaluation_rounds') sequential update/rollback path
//     remains inside saveEvaluationRound or returnEvaluationRound bodies
// ============================================================
assert.ok(
  !saveEvaluationRoundBody.includes(".from('evaluation_rounds')") &&
    !saveEvaluationRoundBody.includes('.from("evaluation_rounds")'),
  'saveEvaluationRound body must not contain direct .from("evaluation_rounds") queries'
);

assert.ok(
  !returnEvaluationRoundBody.includes(".from('evaluation_rounds')") &&
    !returnEvaluationRoundBody.includes('.from("evaluation_rounds")'),
  'returnEvaluationRound body must not contain direct .from("evaluation_rounds") queries'
);

// Verify no sequential table update/delete/insert paths exist in either function body
assert.ok(
  !saveEvaluationRoundBody.includes('.update(') &&
    !saveEvaluationRoundBody.includes('.delete(') &&
    !saveEvaluationRoundBody.includes('.insert('),
  'saveEvaluationRound body must not contain direct table update/delete/insert operations'
);

assert.ok(
  !returnEvaluationRoundBody.includes('.update(') &&
    !returnEvaluationRoundBody.includes('.delete(') &&
    !returnEvaluationRoundBody.includes('.insert('),
  'returnEvaluationRound body must not contain direct table update/delete/insert operations'
);

// ============================================================
// (e) Removed unused symbols & imports check
// ============================================================
assert.ok(
  !evaluationSource.includes('@/lib/return-evaluation'),
  'evaluation.ts must not import from @/lib/return-evaluation'
);
assert.ok(
  !evaluationSource.includes('canReturnEvaluation'),
  'evaluation.ts must not contain canReturnEvaluation'
);
assert.ok(
  !evaluationSource.includes('resetRoundFields'),
  'evaluation.ts must not contain resetRoundFields'
);
assert.ok(
  !evaluationSource.includes('nextStatusAfterReturn'),
  'evaluation.ts must not contain nextStatusAfterReturn'
);
assert.ok(
  !evaluationSource.includes('type UpdateRound'),
  'evaluation.ts must not define UpdateRound'
);
assert.ok(
  !evaluationSource.includes('type UpdateEvaluation'),
  'evaluation.ts must not define UpdateEvaluation'
);
assert.ok(
  !evaluationSource.includes('type InsertRound'),
  'evaluation.ts must not define InsertRound'
);

// ============================================================
// (f) Preserved reachable success exits and audit/revalidation
// ============================================================
assert.ok(
  saveEvaluationRoundBody.includes('revalidatePath'),
  'saveEvaluationRound must retain revalidatePath'
);
assert.ok(
  saveEvaluationRoundBody.includes('revalidateTag'),
  'saveEvaluationRound must retain revalidateTag'
);
assert.ok(
  saveEvaluationRoundBody.includes('logAudit'),
  'saveEvaluationRound must retain logAudit'
);
assert.ok(
  saveEvaluationRoundBody.includes('return { success: true }'),
  'saveEvaluationRound must retain return { success: true }'
);

assert.ok(
  returnEvaluationRoundBody.includes('revalidatePath'),
  'returnEvaluationRound must retain revalidatePath'
);
assert.ok(
  returnEvaluationRoundBody.includes('revalidateTag'),
  'returnEvaluationRound must retain revalidateTag'
);
assert.ok(
  returnEvaluationRoundBody.includes('logAudit'),
  'returnEvaluationRound must retain logAudit'
);
assert.ok(
  returnEvaluationRoundBody.includes('return { success: true }'),
  'returnEvaluationRound must retain return { success: true }'
);

console.log('P105M1T02 evaluation fallback removal source contract tests: ALL PASS');
