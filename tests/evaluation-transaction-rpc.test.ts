/**
 * Contract and static migration safety tests for Evaluation Transaction RPC & Retention (Phase P3M1T01).
 *
 * Assertions:
 * 1. Unit contract tests for pure buildEvaluationRoundTransactionRpcArgs helper.
 * 2. Static file safety assertions for candidate SQL migrations (no DB connection required).
 */
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  buildEvaluationRoundTransactionRpcArgs,
  BuildEvaluationRoundTransactionRpcInput,
  EvaluationRoundTransactionRpcArgs,
} from '../src/lib/evaluation-transaction-rpc';

const PROJECT_ROOT = process.cwd();

// ============================================================
// PART 1: PURE RPC ARGS BUILDER TESTS
// ============================================================

// --- 1.1 Draft Round Mapping (isSubmit = false) ---
{
  const input: BuildEvaluationRoundTransactionRpcInput = {
    evaluationId: 'eval-uuid-1111',
    round: 1,
    actorId: 'user-uuid-subleader',
    canonical: {
      scores: { crit_quality: 15, crit_speed: 10 },
      notes: { crit_quality: 'Tốt' },
      selectedLevelIndexes: { crit_quality: 3, crit_speed: 2 },
      comment: 'Bản nháp vòng 1',
      isSubmit: false,
    },
    totalScore: 25,
    grade: 'B',
    submittedAt: '2026-08-24T12:00:00.000Z',
    nextStep: null,
    nextEvaluator: null,
  };

  const args: EvaluationRoundTransactionRpcArgs = buildEvaluationRoundTransactionRpcArgs(input);

  // Exact parameter names contract
  assert.equal(args.p_evaluation_id, 'eval-uuid-1111');
  assert.equal(args.p_round, 1);
  assert.equal(args.p_actor_id, 'user-uuid-subleader');
  assert.deepEqual(args.p_scores, { crit_quality: 15, crit_speed: 10 });
  assert.equal(args.p_comment, 'Bản nháp vòng 1');
  assert.equal(args.p_total_score, 25);
  assert.equal(args.p_grade, 'B');
  assert.equal(args.p_is_submit, false);
  assert.equal(args.p_submitted_at, '2026-08-24T12:00:00.000Z');

  // Nullable next-round / final fields contract for Draft
  assert.equal(args.p_next_round, null, 'Draft round must have p_next_round = null');
  assert.equal(args.p_next_evaluator_id, null, 'Draft round must have p_next_evaluator_id = null');
  assert.equal(args.p_next_evaluator_role, null, 'Draft round must have p_next_evaluator_role = null');
  assert.equal(args.p_next_status, null, 'Draft round must have p_next_status = null');
  assert.equal(args.p_is_final, false, 'Draft round must have p_is_final = false');

  // Serialized metadata in notes
  assert.equal(typeof args.p_notes.__meta_selected_level_indexes__, 'string');
  assert.deepEqual(JSON.parse(args.p_notes.__meta_selected_level_indexes__), {
    crit_quality: 3,
    crit_speed: 2,
  });
  assert.equal(args.p_notes.crit_quality, 'Tốt');
}

// --- 1.2 Intermediate Submit (e.g. Round 1 -> Round 2) ---
{
  const input: BuildEvaluationRoundTransactionRpcInput = {
    evaluationId: 'eval-uuid-2222',
    round: 1,
    actorId: 'user-uuid-subleader',
    canonical: {
      scores: { crit_quality: 20, crit_speed: 20 },
      notes: { crit_quality: 'Xuất sắc' },
      selectedLevelIndexes: { crit_quality: 4, crit_speed: 4 },
      comment: 'Hoàn tất đánh giá vòng 1',
      isSubmit: true,
    },
    totalScore: 40,
    grade: 'A',
    submittedAt: '2026-08-24T13:00:00.000Z',
    nextStep: {
      round: 2,
      status: 'Submitted',
      evaluator: 'Leader',
      isFinal: false,
    },
    nextEvaluator: {
      id: 'user-uuid-leader',
      role: 'Leader',
    },
  };

  const args = buildEvaluationRoundTransactionRpcArgs(input);

  assert.equal(args.p_is_submit, true);
  assert.equal(args.p_is_final, false, 'Intermediate submit must have p_is_final = false');
  assert.equal(args.p_next_round, 2, 'Next round must be 2');
  assert.equal(args.p_next_evaluator_id, 'user-uuid-leader');
  assert.equal(args.p_next_evaluator_role, 'Leader');
  assert.equal(args.p_next_status, 'Submitted');
}

// --- 1.3 Final Submit (e.g. Round 3 -> Approved) ---
{
  const input: BuildEvaluationRoundTransactionRpcInput = {
    evaluationId: 'eval-uuid-3333',
    round: 3,
    actorId: 'user-uuid-manager',
    canonical: {
      scores: { crit_quality: 25, crit_speed: 25 },
      notes: { crit_quality: 'Hoàn hảo' },
      selectedLevelIndexes: { crit_quality: 4, crit_speed: 4 },
      comment: 'Phê duyệt kết quả cuối cùng',
      isSubmit: true,
    },
    totalScore: 50,
    grade: 'S',
    submittedAt: '2026-08-24T14:00:00.000Z',
    nextStep: {
      round: 3,
      status: 'Approved',
      isFinal: true,
    },
    nextEvaluator: null,
  };

  const args = buildEvaluationRoundTransactionRpcArgs(input);

  assert.equal(args.p_is_submit, true);
  assert.equal(args.p_is_final, true, 'Final submit must have p_is_final = true');
  assert.equal(args.p_next_round, null, 'Final submit must not populate p_next_round');
  assert.equal(args.p_next_evaluator_id, null, 'Final submit must not populate p_next_evaluator_id');
  assert.equal(args.p_next_evaluator_role, null, 'Final submit must not populate p_next_evaluator_role');
  assert.equal(args.p_next_status, 'Approved', 'Final submit next status must be Approved');
  assert.equal(args.p_grade, 'S');
  assert.equal(args.p_total_score, 50);
}

// --- 1.4 Input Immutability and Non-Numeric Sanitization ---
{
  const rawScores: Record<string, number> = { crit_1: 10, crit_invalid: Number.NaN };
  const input: BuildEvaluationRoundTransactionRpcInput = {
    evaluationId: 'eval-uuid-4444',
    round: 2,
    actorId: 'actor-1',
    canonical: {
      scores: rawScores,
      notes: {},
      selectedLevelIndexes: {},
      comment: 'Test comment',
      isSubmit: false,
    },
    totalScore: 10,
    grade: 'C',
  };

  const args = buildEvaluationRoundTransactionRpcArgs(input);
  // Modifying rawScores should not mutate returned args.p_scores
  rawScores.crit_1 = 999;
  assert.equal(args.p_scores.crit_1, 10, 'Scores must be cloned to prevent external mutation');
  assert.equal('crit_invalid' in args.p_scores, false, 'Non-finite numeric scores must be omitted');
}

// ============================================================
// PART 2: STATIC MIGRATION CONTRACT ASSERTIONS (NO REMOTE DB)
// ============================================================

const TX_MIGRATION_PATH = path.join(PROJECT_ROOT, 'db', 'migration-p3-evaluation-transaction.sql');
const RETENTION_MIGRATION_PATH = path.join(PROJECT_ROOT, 'db', 'migration-p3-retention.sql');

// Verify files exist
assert.equal(fs.existsSync(TX_MIGRATION_PATH), true, 'migration-p3-evaluation-transaction.sql must exist');
assert.equal(fs.existsSync(RETENTION_MIGRATION_PATH), true, 'migration-p3-retention.sql must exist');

const txSql = fs.readFileSync(TX_MIGRATION_PATH, 'utf-8');
const retentionSql = fs.readFileSync(RETENTION_MIGRATION_PATH, 'utf-8');

// --- 2.1 Transaction Migration Safety Markers & Signatures ---
{
  // Candidate only markers
  assert.equal(
    txSql.includes('CANDIDATE ONLY — NOT APPLIED'),
    true,
    'Transaction migration must be explicitly marked as CANDIDATE ONLY — NOT APPLIED'
  );

  // Function name, security definer, search_path
  assert.equal(
    txSql.includes('FUNCTION public.save_evaluation_round_transaction'),
    true,
    'Transaction migration must define public.save_evaluation_round_transaction'
  );
  assert.equal(
    txSql.includes('SECURITY DEFINER'),
    true,
    'RPC function must be SECURITY DEFINER'
  );
  assert.equal(
    txSql.includes('SET search_path = public'),
    true,
    'RPC function must set fixed search_path = public'
  );

  // Permission revocation and grant
  assert.equal(
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.save_evaluation_round_transaction[\s\S]+?FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(
      txSql
    ),
    true,
    'RPC execution must be revoked from PUBLIC, anon, and authenticated'
  );
  assert.equal(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.save_evaluation_round_transaction[\s\S]+?TO\s+service_role/i.test(
      txSql
    ),
    true,
    'RPC execution must be granted only to service_role'
  );

  // Preflight duplicate checks
  assert.equal(
    txSql.includes('PREFLIGHT_FAIL') &&
      txSql.includes('period_id, employee_id') &&
      txSql.includes('HAVING COUNT(*) > 1'),
    true,
    'Transaction migration must contain duplicate preflight check for evaluations'
  );
  assert.equal(
    txSql.includes('evaluation_id, round') &&
      txSql.includes('HAVING COUNT(*) > 1'),
    true,
    'Transaction migration must contain duplicate preflight check for evaluation_rounds'
  );

  // Schema Constraints & Indexes
  assert.equal(
    txSql.includes('uq_evaluations_period_employee'),
    true,
    'Must define named constraint uq_evaluations_period_employee'
  );
  assert.equal(
    txSql.includes('uq_evaluation_rounds_eval_round'),
    true,
    'Must define named constraint uq_evaluation_rounds_eval_round'
  );
  assert.equal(
    txSql.includes('chk_evaluation_rounds_round_range'),
    true,
    'Must define named constraint chk_evaluation_rounds_round_range'
  );
  assert.equal(
    txSql.includes('chk_evaluations_current_round_range'),
    true,
    'Must define named constraint chk_evaluations_current_round_range'
  );
  assert.equal(
    txSql.includes('chk_evaluations_status_valid'),
    true,
    'Must define named constraint chk_evaluations_status_valid'
  );
  assert.equal(
    txSql.includes('chk_evaluation_rounds_status_valid'),
    true,
    'Must define named constraint chk_evaluation_rounds_status_valid'
  );
  assert.equal(
    txSql.includes('chk_evaluation_rounds_total_score_non_negative'),
    true,
    'Must define named constraint chk_evaluation_rounds_total_score_non_negative'
  );
  assert.equal(
    txSql.includes('chk_evaluations_final_score_non_negative'),
    true,
    'Must define named constraint chk_evaluations_final_score_non_negative'
  );

  // Fail-closed Exception handling
  assert.equal(txSql.includes('RAISE EXCEPTION'), true, 'Must use RAISE EXCEPTION for transaction rollback');
}

// --- 2.2 Retention Migration Safety Markers, Allowlist & Immutability ---
{
  // Candidate only markers
  assert.equal(
    retentionSql.includes('CANDIDATE ONLY — NOT APPLIED'),
    true,
    'Retention migration must be explicitly marked as CANDIDATE ONLY — NOT APPLIED'
  );

  // Function name, security definer, search_path
  assert.equal(
    retentionSql.includes('FUNCTION public.purge_kurabe_retention'),
    true,
    'Retention migration must define public.purge_kurabe_retention'
  );
  assert.equal(
    retentionSql.includes('SECURITY DEFINER'),
    true,
    'Purge routine must be SECURITY DEFINER'
  );
  assert.equal(
    retentionSql.includes('SET search_path = public'),
    true,
    'Purge routine must set fixed search_path = public'
  );

  // Permission revocation and grant
  assert.equal(
    /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.purge_kurabe_retention[\s\S]+?FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(
      retentionSql
    ),
    true,
    'Purge routine execution must be revoked from PUBLIC, anon, and authenticated'
  );
  assert.equal(
    /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.purge_kurabe_retention[\s\S]+?TO\s+service_role/i.test(
      retentionSql
    ),
    true,
    'Purge routine execution must be granted only to service_role'
  );

  // Parameter validation fail closed
  assert.equal(
    retentionSql.includes('p_as_of IS NULL'),
    true,
    'Purge routine must validate p_as_of IS NULL and fail closed'
  );

  // Extract all DELETE FROM target tables
  const deleteMatches = Array.from(
    retentionSql.matchAll(/DELETE\s+FROM\s+(?:public\.)?([a-zA-Z0-9_]+)/gi)
  ).map(m => m[1].toLowerCase());

  const ALLOWLISTED_PURGE_TABLES = new Set([
    'sessions',
    'login_attempts',
    'ai_usage',
    'chat_reports',
    'audit_logs',
  ]);

  // Assert every delete target is allowlisted
  for (const table of deleteMatches) {
    assert.equal(
      ALLOWLISTED_PURGE_TABLES.has(table),
      true,
      `Table '${table}' in DELETE FROM statement must be in explicit retention allowlist`
    );
  }

  // Assert essential business & historical tables are NEVER in DELETE FROM
  const FORBIDDEN_PURGE_TABLES = [
    'evaluations',
    'evaluation_rounds',
    'evaluation_responses',
    'users',
    'teams',
    'evaluation_periods',
    'criteria',
    'criteria_groups',
    'criterion_levels',
    'criterion_audiences',
    'grade_bands',
    'ai_summaries',
  ];

  for (const forbiddenTable of FORBIDDEN_PURGE_TABLES) {
    assert.equal(
      deleteMatches.includes(forbiddenTable),
      false,
      `Forbidden domain table '${forbiddenTable}' must never be targeted for deletion in purge routine`
    );
  }

  // Ensure no cron/pg_cron schedule is created
  assert.equal(
    /cron\.schedule/i.test(retentionSql),
    false,
    'Retention migration candidate must NOT register cron/pg_cron jobs'
  );
}

console.log('evaluation-transaction-rpc tests: ALL PASS');
