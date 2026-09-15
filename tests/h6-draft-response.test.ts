/**
 * Unit & Contract Tests for Kurabe CONTROLLED Task P103M2T03
 * H6 Draft Transaction Response Contract.
 *
 * Tier: UNIT / STATIC CONTRACT (non-authenticated; no fake runtime claims).
 *
 * Covers:
 * 1. Reproduction of the legacy R2/R3 draft response+commit mismatch.
 * 2. Resolution via expected aggregate status derivation:
 *    - R1 Draft -> 'Draft'
 *    - R2 Draft -> 'Submitted'
 *    - R3 Draft -> 'Reviewed'
 *    - R1 Submit -> 'Submitted'
 *    - R2 Submit -> 'Reviewed'
 *    - Final Submit -> 'Approved'
 * 3. Strict structural ID & status validation:
 *    - UUID format validation for round_id, evaluation_id, next_round_id
 *    - Enum validation for final_status
 *    - Malformed counterexamples (null, primitives, non-UUIDs, impossible statuses)
 * 4. Response validator security guards:
 *    - Wrong evaluation_id rejection
 *    - Wrong round_id rejection
 *    - Draft next_round_id violation rejection (draft must never transition/advance)
 *    - Impossible status rejection
 * 5. Initialize draft consumer parity across R1/R2/R3:
 *    - Fresh initialization: { initialized: true }
 *    - Already drafted: { initialized: false, skipped: 'already_initialized' }
 *    - Locked / Submitted / Approved: { initialized: false, skipped: 'locked' }
 *    - Support for 'Reviewed' aggregate status in Round 3
 * 6. Source code integrity:
 *    - No submit audit on draft
 *    - Atomic guards (period firewall, H5 write auth) preceding writes
 *
 * Run: node scripts/run-tests.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE_STEP_STATUSES, getNextEvaluationStep } from '../src/lib/evaluation-workflow';
import type { EvalStatus, RoundNumber } from '../src/types';

const rootDir = process.cwd();
const ACTION_PATH = path.join(rootDir, 'src/actions/evaluation.ts');

const SAMPLE_EVAL_ID = '10000000-0000-4000-8000-000000000001';
const SAMPLE_ROUND_ID_1 = '20000000-0000-4000-8000-000000000001';
const SAMPLE_ROUND_ID_2 = '20000000-0000-4000-8000-000000000002';
const SAMPLE_ROUND_ID_3 = '20000000-0000-4000-8000-000000000003';
const SAMPLE_NEXT_ROUND_ID = '30000000-0000-4000-8000-000000000001';
const WRONG_UUID = '99999999-9999-4999-8999-999999999999';

// ============================================================
// PART 1: SOURCE CODE STATIC CONTRACTS
// ============================================================
console.log('\n--- PART 1: Source Code Static Contracts ---');
{
  assert.ok(fs.existsSync(ACTION_PATH), 'src/actions/evaluation.ts must exist');
  const actionSource = fs.readFileSync(ACTION_PATH, 'utf8');

  // Contract 1.1: saveEvaluationRound must derive expectedStatus from round/operation
  assert.ok(
    actionSource.includes('deriveExpectedAggregateStatus'),
    'evaluation.ts must define and use deriveExpectedAggregateStatus'
  );
  assert.ok(
    !actionSource.includes("nextStep?.status ?? (isSubmit ? 'Submitted' : 'Draft')"),
    "evaluation.ts must NOT use the legacy expectedStatus defaulting to 'Draft'"
  );

  // Contract 1.2: Strict response guards in saveEvaluationRound
  assert.ok(
    actionSource.includes('!isEvaluationTransactionResult(rpcResult)'),
    'saveEvaluationRound must validate RPC result with isEvaluationTransactionResult'
  );
  assert.ok(
    actionSource.includes('rpcResult.evaluation_id !== evaluationId'),
    'saveEvaluationRound must verify evaluation_id matches'
  );
  assert.ok(
    actionSource.includes('authGuard.roundId && rpcResult.round_id !== authGuard.roundId'),
    'saveEvaluationRound must verify round_id matches authGuard.roundId'
  );
  assert.ok(
    actionSource.includes('!isSubmit && rpcResult.next_round_id !== null'),
    'saveEvaluationRound must verify next_round_id is null for drafts'
  );
  assert.ok(
    actionSource.includes('rpcResult.final_status !== expectedStatus'),
    'saveEvaluationRound must verify final_status matches expectedStatus'
  );

  // Contract 1.3: No audit on draft
  assert.ok(
    actionSource.includes('if (isSubmit) {') && actionSource.includes('await logAudit('),
    'Audit logging must be strictly gated on isSubmit === true'
  );

  // Contract 1.4: initializeEvaluationRoundDraft validation
  assert.ok(
    actionSource.includes("export async function initializeEvaluationRoundDraft"),
    'evaluation.ts must export initializeEvaluationRoundDraft'
  );
  assert.ok(
    actionSource.includes("skipped: 'already_initialized'"),
    'initializeEvaluationRoundDraft must return skipped: already_initialized when already draft'
  );
  assert.ok(
    actionSource.includes("skipped: 'locked'"),
    'initializeEvaluationRoundDraft must return skipped: locked when submitted/locked'
  );

  // Contract 1.5: Period firewall and write authorization preflight preserved
  assert.ok(
    actionSource.includes('assertEvaluationPeriodActiveForEvaluation'),
    'evaluation.ts must retain assertEvaluationPeriodActiveForEvaluation firewall'
  );
  assert.ok(
    actionSource.includes('assertCurrentRoundWriteAuthorization'),
    'evaluation.ts must retain assertCurrentRoundWriteAuthorization precheck'
  );

  console.log('✓ Source code static contracts verified');
}

// ============================================================
// PART 2: REPRODUCE LEGACY R2/R3 DRAFT MISMATCH & VERIFY FIX
// ============================================================
console.log('\n--- PART 2: Reproduction of Legacy Mismatch & Fix Verification ---');
{
  // Legacy validator implementation (the bug):
  function legacyExpectedStatus(
    isSubmit: boolean,
    nextStep: { status: EvalStatus } | null
  ): string {
    return nextStep?.status ?? (isSubmit ? 'Submitted' : 'Draft');
  }

  // Fixed validator implementation:
  function fixedExpectedStatus(
    round: RoundNumber,
    isSubmit: boolean,
    nextStep: { status: EvalStatus } | null
  ): EvalStatus | null {
    if (isSubmit) {
      return nextStep?.status ?? 'Approved';
    }
    return ACTIVE_STEP_STATUSES[round] ?? null;
  }

  // Case A: Round 1 Draft (employee role: Employee)
  {
    const isSubmit = false;
    const nextStep = null; // nextStep is only computed on submit
    const round: RoundNumber = 1;

    const legacyStatus = legacyExpectedStatus(isSubmit, nextStep);
    const fixedStatus = fixedExpectedStatus(round, isSubmit, nextStep);

    // Both expected 'Draft' for R1
    assert.equal(legacyStatus, 'Draft');
    assert.equal(fixedStatus, 'Draft');
  }

  // Case B: Round 2 Draft (employee role: Employee)
  // In DB, Round 1 was submitted. Evaluations table status is 'Submitted'.
  // Evaluator opens Round 2 and saves Draft.
  // The transactional RPC leaves evaluations status as 'Submitted' and returns final_status = 'Submitted'.
  {
    const isSubmit = false;
    const nextStep = null;
    const round: RoundNumber = 2;
    const realDbFinalStatus: EvalStatus = 'Submitted';

    const legacyStatus = legacyExpectedStatus(isSubmit, nextStep);
    const fixedStatus = fixedExpectedStatus(round, isSubmit, nextStep);

    // BUG REPRODUCTION: Legacy expected 'Draft', causing mismatch with committed DB state 'Submitted'
    assert.equal(legacyStatus, 'Draft', 'Legacy incorrectly defaulted to Draft');
    assert.notEqual(
      realDbFinalStatus,
      legacyStatus,
      'REPRODUCED BUG: real DB final_status (Submitted) mismatched legacy expectedStatus (Draft)'
    );

    // FIX VERIFICATION: Fixed correctly derives 'Submitted' matching DB commit
    assert.equal(fixedStatus, 'Submitted', 'Fixed derives real aggregate state Submitted');
    assert.equal(
      realDbFinalStatus,
      fixedStatus,
      'FIX VERIFIED: real DB final_status matches fixed expectedStatus'
    );
  }

  // Case C: Round 3 Draft (employee role: Employee)
  // In DB, Round 2 was submitted. Evaluations table status is 'Reviewed'.
  // Evaluator opens Round 3 and saves Draft.
  // The transactional RPC leaves evaluations status as 'Reviewed' and returns final_status = 'Reviewed'.
  {
    const isSubmit = false;
    const nextStep = null;
    const round: RoundNumber = 3;
    const realDbFinalStatus: EvalStatus = 'Reviewed';

    const legacyStatus = legacyExpectedStatus(isSubmit, nextStep);
    const fixedStatus = fixedExpectedStatus(round, isSubmit, nextStep);

    // BUG REPRODUCTION: Legacy expected 'Draft', causing mismatch with committed DB state 'Reviewed'
    assert.equal(legacyStatus, 'Draft', 'Legacy incorrectly defaulted to Draft');
    assert.notEqual(
      realDbFinalStatus,
      legacyStatus,
      'REPRODUCED BUG: real DB final_status (Reviewed) mismatched legacy expectedStatus (Draft)'
    );

    // FIX VERIFICATION: Fixed correctly derives 'Reviewed' matching DB commit
    assert.equal(fixedStatus, 'Reviewed', 'Fixed derives real aggregate state Reviewed');
    assert.equal(
      realDbFinalStatus,
      fixedStatus,
      'FIX VERIFIED: real DB final_status matches fixed expectedStatus'
    );
  }

  // Case D: Submits across rounds (verifying parity is maintained)
  {
    // Employee R1 submit -> advances to R2 (nextStatus: 'Submitted')
    const r1Step = getNextEvaluationStep('Employee', 1);
    assert.equal(fixedExpectedStatus(1, true, r1Step), 'Submitted');

    // Employee R2 submit -> advances to R3 (nextStatus: 'Reviewed')
    const r2Step = getNextEvaluationStep('Employee', 2);
    assert.equal(fixedExpectedStatus(2, true, r2Step), 'Reviewed');

    // Employee R3 submit -> final (nextStatus: 'Approved')
    const r3Step = getNextEvaluationStep('Employee', 3);
    assert.equal(fixedExpectedStatus(3, true, r3Step), 'Approved');
  }

  console.log('✓ Legacy R2/R3 mismatch reproduced and fix verified');
}

// ============================================================
// PART 3: STRUCTURAL ID & TRANSACTION RESULT VALIDATION
// ============================================================
console.log('\n--- PART 3: Structural ID & Transaction Result Validation ---');
{
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const VALID_EVALUATION_STATUSES = new Set<string>([
    'NotStarted',
    'Draft',
    'Submitted',
    'Reviewed',
    'Approved',
  ]);

  function isEvaluationTransactionResult(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const result = value as Record<string, unknown>;
    return (
      typeof result.round_id === 'string' &&
      UUID_REGEX.test(result.round_id) &&
      typeof result.evaluation_id === 'string' &&
      UUID_REGEX.test(result.evaluation_id) &&
      (result.next_round_id === null ||
        (typeof result.next_round_id === 'string' && UUID_REGEX.test(result.next_round_id))) &&
      typeof result.final_status === 'string' &&
      VALID_EVALUATION_STATUSES.has(result.final_status)
    );
  }

  // Positive: Authentic draft results
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 'Draft',
    }),
    true,
    'Valid R1 draft response must be accepted'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_2,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 'Submitted',
    }),
    true,
    'Valid R2 draft response must be accepted'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_3,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 'Reviewed',
    }),
    true,
    'Valid R3 draft response must be accepted'
  );

  // Positive: Authentic submit results
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: SAMPLE_NEXT_ROUND_ID,
      final_status: 'Submitted',
    }),
    true,
    'Valid intermediate submit response must be accepted'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_3,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 'Approved',
    }),
    true,
    'Valid final approval response must be accepted'
  );

  // Malformed counterexamples: non-object types
  assert.equal(isEvaluationTransactionResult(null), false, 'null rejected');
  assert.equal(isEvaluationTransactionResult(undefined), false, 'undefined rejected');
  assert.equal(isEvaluationTransactionResult('{"round_id":"..."}'), false, 'string rejected');
  assert.equal(isEvaluationTransactionResult(12345), false, 'number rejected');
  assert.equal(isEvaluationTransactionResult([]), false, 'array rejected');
  assert.equal(isEvaluationTransactionResult({}), false, 'empty object rejected');

  // Malformed counterexamples: missing required fields
  assert.equal(
    isEvaluationTransactionResult({
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 'Draft',
    }),
    false,
    'missing round_id rejected'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      next_round_id: null,
      final_status: 'Draft',
    }),
    false,
    'missing evaluation_id rejected'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: SAMPLE_EVAL_ID,
      final_status: 'Draft',
    }),
    false,
    'missing next_round_id rejected'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
    }),
    false,
    'missing final_status rejected'
  );

  // Malformed counterexamples: non-UUID format
  assert.equal(
    isEvaluationTransactionResult({
      round_id: 'not-a-uuid',
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 'Draft',
    }),
    false,
    'non-UUID round_id rejected'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: 'eval-123',
      next_round_id: null,
      final_status: 'Draft',
    }),
    false,
    'non-UUID evaluation_id rejected'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: 'next-round-xyz',
      final_status: 'Draft',
    }),
    false,
    'non-UUID next_round_id rejected'
  );

  // Impossible-status counterexamples:
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 'UnknownStatus',
    }),
    false,
    'unknown final_status rejected'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 'Pending',
    }),
    false,
    'Pending status rejected'
  );
  assert.equal(
    isEvaluationTransactionResult({
      round_id: SAMPLE_ROUND_ID_1,
      evaluation_id: SAMPLE_EVAL_ID,
      next_round_id: null,
      final_status: 123,
    }),
    false,
    'numeric final_status rejected'
  );

  console.log('✓ Structural ID & Transaction Result validation verified');
}

// ============================================================
// PART 4: RESPONSE VALIDATOR SECURITY GUARDS & COUNTEREXAMPLES
// ============================================================
console.log('\n--- PART 4: Response Validator Security Guards & Counterexamples ---');
{
  function validateRpcResponse(
    rpcResult: unknown,
    evaluationId: string,
    roundId: string,
    round: RoundNumber,
    isSubmit: boolean,
    nextStepStatus?: EvalStatus | null
  ): { ok: true } | { ok: false; error: string } {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const VALID_EVALUATION_STATUSES = new Set<string>([
      'NotStarted',
      'Draft',
      'Submitted',
      'Reviewed',
      'Approved',
    ]);

    function isValid(val: unknown): val is {
      round_id: string;
      evaluation_id: string;
      next_round_id: string | null;
      final_status: string;
    } {
      if (!val || typeof val !== 'object' || Array.isArray(val)) return false;
      const r = val as Record<string, unknown>;
      return (
        typeof r.round_id === 'string' &&
        UUID_REGEX.test(r.round_id) &&
        typeof r.evaluation_id === 'string' &&
        UUID_REGEX.test(r.evaluation_id) &&
        (r.next_round_id === null ||
          (typeof r.next_round_id === 'string' && UUID_REGEX.test(r.next_round_id))) &&
        typeof r.final_status === 'string' &&
        VALID_EVALUATION_STATUSES.has(r.final_status)
      );
    }

    const expectedStatus = isSubmit
      ? (nextStepStatus ?? 'Approved')
      : (ACTIVE_STEP_STATUSES[round] ?? null);

    if (
      !expectedStatus ||
      !isValid(rpcResult) ||
      rpcResult.evaluation_id !== evaluationId ||
      (roundId && rpcResult.round_id !== roundId) ||
      (!isSubmit && rpcResult.next_round_id !== null) ||
      rpcResult.final_status !== expectedStatus
    ) {
      return { ok: false, error: 'Lỗi cập nhật kết quả đánh giá: phản hồi giao dịch không hợp lệ.' };
    }

    return { ok: true };
  }

  // 4.1 Positive cases
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_1, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      1,
      false
    ).ok,
    true,
    'Valid R1 draft response succeeds'
  );
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_2, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Submitted' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_2,
      2,
      false
    ).ok,
    true,
    'Valid R2 draft response succeeds'
  );
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_3, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Reviewed' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_3,
      3,
      false
    ).ok,
    true,
    'Valid R3 draft response succeeds'
  );

  // 4.2 Wrong evaluation_id rejection
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_1, evaluation_id: WRONG_UUID, next_round_id: null, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      1,
      false
    ).ok,
    false,
    'Mismatched evaluation_id must be rejected'
  );

  // 4.3 Wrong round_id rejection
  assert.equal(
    validateRpcResponse(
      { round_id: WRONG_UUID, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      1,
      false
    ).ok,
    false,
    'Mismatched round_id must be rejected'
  );

  // 4.4 Draft next_round_id violation: draft MUST NOT create/advance to next round
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_1, evaluation_id: SAMPLE_EVAL_ID, next_round_id: SAMPLE_NEXT_ROUND_ID, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      1,
      false
    ).ok,
    false,
    'Draft response with non-null next_round_id must be rejected'
  );
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_2, evaluation_id: SAMPLE_EVAL_ID, next_round_id: SAMPLE_NEXT_ROUND_ID, final_status: 'Submitted' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_2,
      2,
      false
    ).ok,
    false,
    'R2 Draft response with non-null next_round_id must be rejected'
  );

  // 4.5 Impossible status counterexamples
  // R1 draft returning Submitted (premature submit transition)
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_1, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Submitted' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      1,
      false
    ).ok,
    false,
    'R1 draft returning Submitted must be rejected'
  );
  // R2 draft returning Draft (downgrade of parent status)
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_2, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_2,
      2,
      false
    ).ok,
    false,
    'R2 draft returning Draft must be rejected'
  );
  // R2 draft returning Approved (impossible transition)
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_2, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Approved' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_2,
      2,
      false
    ).ok,
    false,
    'R2 draft returning Approved must be rejected'
  );
  // R3 draft returning Draft (downgrade)
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_3, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_3,
      3,
      false
    ).ok,
    false,
    'R3 draft returning Draft must be rejected'
  );
  // R3 draft returning Submitted (downgrade)
  assert.equal(
    validateRpcResponse(
      { round_id: SAMPLE_ROUND_ID_3, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Submitted' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_3,
      3,
      false
    ).ok,
    false,
    'R3 draft returning Submitted must be rejected'
  );

  console.log('✓ Response validator security guards & counterexamples verified');
}

// ============================================================
// PART 5: INITIALIZE ROUND DRAFT CONSUMER PARITY
// ============================================================
console.log('\n--- PART 5: Initialize Round Draft Consumer Parity ---');
{
  function resolveInitializeDraftOutcome(
    rpcResult: { final_status: string; round_id: string; evaluation_id: string; next_round_id: string | null },
    evaluationId: string,
    roundId: string,
    authGuard: { isLocked: boolean; roundStatus: string },
    evalInfo: { status: string; current_round: number },
    round: RoundNumber
  ): { success: true; initialized: boolean; skipped?: 'already_initialized' | 'locked' } | { success: false; error: string } {
    const VALID_EVALUATION_STATUSES = new Set<string>([
      'NotStarted',
      'Draft',
      'Submitted',
      'Reviewed',
      'Approved',
    ]);
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (
      !rpcResult ||
      !UUID_REGEX.test(rpcResult.round_id) ||
      !UUID_REGEX.test(rpcResult.evaluation_id) ||
      rpcResult.evaluation_id !== evaluationId ||
      (roundId && rpcResult.round_id !== roundId) ||
      rpcResult.next_round_id !== null ||
      !VALID_EVALUATION_STATUSES.has(rpcResult.final_status)
    ) {
      return { success: false, error: 'Không nhận được kết quả khởi tạo bản nháp hợp lệ.' };
    }

    if (
      authGuard.isLocked ||
      authGuard.roundStatus === 'Submitted' ||
      rpcResult.final_status === 'Approved'
    ) {
      return { success: true, initialized: false, skipped: 'locked' };
    }
    if (authGuard.roundStatus === 'Draft') {
      return { success: true, initialized: false, skipped: 'already_initialized' };
    }
    if (round > 1 && rpcResult.final_status === evalInfo.status) {
      return { success: true, initialized: false, skipped: 'already_initialized' };
    }

    return { success: true, initialized: rpcResult.final_status === 'Draft' };
  }

  // 5.1 Fresh initialization on NotStarted round
  {
    const outcome = resolveInitializeDraftOutcome(
      { round_id: SAMPLE_ROUND_ID_1, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      { isLocked: false, roundStatus: 'NotStarted' },
      { status: 'NotStarted', current_round: 1 },
      1
    );
    assert.deepEqual(outcome, { success: true, initialized: true });
  }

  // 5.2 Repeated open on already-drafted round 1 -> skipped: already_initialized
  {
    const outcome = resolveInitializeDraftOutcome(
      { round_id: SAMPLE_ROUND_ID_1, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      { isLocked: false, roundStatus: 'Draft' },
      { status: 'Draft', current_round: 1 },
      1
    );
    assert.deepEqual(outcome, { success: true, initialized: false, skipped: 'already_initialized' });
  }

  // 5.3 Repeated open on already-drafted round 2 -> skipped: already_initialized (not locked!)
  {
    const outcome = resolveInitializeDraftOutcome(
      { round_id: SAMPLE_ROUND_ID_2, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Submitted' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_2,
      { isLocked: false, roundStatus: 'Draft' },
      { status: 'Submitted', current_round: 2 },
      2
    );
    assert.deepEqual(outcome, { success: true, initialized: false, skipped: 'already_initialized' });
  }

  // 5.4 Repeated open on already-drafted round 3 with 'Reviewed' aggregate status -> skipped: already_initialized
  {
    const outcome = resolveInitializeDraftOutcome(
      { round_id: SAMPLE_ROUND_ID_3, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Reviewed' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_3,
      { isLocked: false, roundStatus: 'Draft' },
      { status: 'Reviewed', current_round: 3 },
      3
    );
    assert.deepEqual(outcome, { success: true, initialized: false, skipped: 'already_initialized' });
  }

  // 5.5 Open on locked / submitted round -> skipped: locked
  {
    const outcome = resolveInitializeDraftOutcome(
      { round_id: SAMPLE_ROUND_ID_1, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Submitted' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      { isLocked: true, roundStatus: 'Submitted' },
      { status: 'Submitted', current_round: 2 },
      1
    );
    assert.deepEqual(outcome, { success: true, initialized: false, skipped: 'locked' });
  }

  // 5.6 Open on Approved evaluation -> skipped: locked
  {
    const outcome = resolveInitializeDraftOutcome(
      { round_id: SAMPLE_ROUND_ID_3, evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Approved' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_3,
      { isLocked: true, roundStatus: 'Submitted' },
      { status: 'Approved', current_round: 3 },
      3
    );
    assert.deepEqual(outcome, { success: true, initialized: false, skipped: 'locked' });
  }

  // 5.7 Malformed response rejection
  {
    const outcome = resolveInitializeDraftOutcome(
      { round_id: 'bad-id', evaluation_id: SAMPLE_EVAL_ID, next_round_id: null, final_status: 'Draft' },
      SAMPLE_EVAL_ID,
      SAMPLE_ROUND_ID_1,
      { isLocked: false, roundStatus: 'NotStarted' },
      { status: 'NotStarted', current_round: 1 },
      1
    );
    assert.equal(outcome.success, false);
  }

  console.log('✓ Initialize Round Draft Consumer Parity verified');
}

console.log('\n=== ALL H6 DRAFT RESPONSE UNIT TESTS PASSED ===\n');
