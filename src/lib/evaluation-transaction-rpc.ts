import { RoundNumber, Role, Grade } from '@/types';
import { EvaluationNextStep } from '@/lib/evaluation-workflow';
import { composeRoundNotes, SelectedLevelIndexes } from '@/lib/round-level-selection';

export interface EvaluationRoundTransactionRpcArgs {
  p_evaluation_id: string;
  p_round: number;
  p_actor_id: string;
  p_scores: Record<string, number>;
  p_notes: Record<string, string>;
  p_comment: string;
  p_total_score: number;
  p_grade: string;
  p_is_submit: boolean | null;
  p_submitted_at: string;
  p_next_round: number | null;
  p_next_evaluator_id: string | null;
  p_next_evaluator_role: string | null;
  p_next_status: string | null;
  p_is_final: boolean;
  p_criteria_config_version_id: string;
  p_grade_config_version_id: string | null;
}

export interface EvaluationRoundTransactionRpcResult {
  round_id: string;
  evaluation_id: string;
  next_round_id: string | null;
  final_status: string;
}

export interface BuildEvaluationRoundTransactionRpcInput {
  evaluationId: string;
  round: RoundNumber;
  actorId: string;
  canonical: {
    scores: Record<string, number>;
    notes: Record<string, string>;
    selectedLevelIndexes: SelectedLevelIndexes;
    comment: string;
    isSubmit: boolean | null;
  };
  totalScore: number;
  grade: Grade;
  submittedAt?: string;
  nextStep?: EvaluationNextStep | null;
  nextEvaluator?: { id: string; role: Role } | null;
  criteriaConfigVersionId: string;
  gradeConfigVersionId?: string | null;
}

export interface EvaluationRoundReturnRpcArgs {
  p_evaluation_id: string;
  p_round: number;
  p_actor_id: string;
  p_reason: string;
}

export interface BuildEvaluationRoundReturnRpcInput {
  evaluationId: string;
  round: RoundNumber;
  actorId: string;
  reason: string;
}

/**
 * Pure typed builder mapping canonical evaluation round data to SQL RPC parameter names.
 * Fails closed against unvalidated inputs; ensures structured JSON fields and nullable next-round values.
 */
export function buildEvaluationRoundTransactionRpcArgs(
  input: BuildEvaluationRoundTransactionRpcInput
): EvaluationRoundTransactionRpcArgs {
  const {
    evaluationId,
    round,
    actorId,
    canonical,
    totalScore,
    grade,
    submittedAt,
    nextStep,
    nextEvaluator,
    criteriaConfigVersionId,
    gradeConfigVersionId,
  } = input;

  const composedNotes = composeRoundNotes(canonical.notes, canonical.selectedLevelIndexes);
  const now = submittedAt || new Date().toISOString();

  const isSubmit = canonical.isSubmit === true;
  const isFinal = Boolean(isSubmit && nextStep?.isFinal);

  // Clone scores to avoid external mutation
  const canonicalScores: Record<string, number> = {};
  for (const [key, val] of Object.entries(canonical.scores || {})) {
    if (typeof val === 'number' && Number.isFinite(val)) {
      canonicalScores[key] = val;
    }
  }

  return {
    p_evaluation_id: evaluationId,
    p_round: round,
    p_actor_id: actorId,
    p_scores: canonicalScores,
    p_notes: composedNotes,
    p_comment: canonical.comment ?? '',
    p_total_score: totalScore,
    p_grade: grade,
    p_is_submit: canonical.isSubmit,
    p_submitted_at: now,
    p_next_round: isSubmit && !isFinal && nextStep ? nextStep.round : null,
    p_next_evaluator_id: isSubmit && !isFinal && nextEvaluator ? nextEvaluator.id : null,
    p_next_evaluator_role: isSubmit && !isFinal && nextEvaluator ? nextEvaluator.role : null,
    p_next_status: isSubmit && nextStep ? nextStep.status : null,
    p_is_final: isFinal,
    p_criteria_config_version_id: criteriaConfigVersionId,
    p_grade_config_version_id: gradeConfigVersionId ?? null,
  };
}

/**
 * Pure typed builder mapping return evaluation round parameters to SQL RPC parameter names.
 */
export function buildEvaluationRoundReturnRpcArgs(
  input: BuildEvaluationRoundReturnRpcInput
): EvaluationRoundReturnRpcArgs {
  const { evaluationId, round, actorId, reason } = input;
  if (!evaluationId || typeof evaluationId !== 'string') {
    throw new Error('INVALID_ARGUMENT: evaluationId is required');
  }
  if (!round || round < 1 || round > 3) {
    throw new Error('INVALID_ARGUMENT: round must be between 1 and 3');
  }
  if (!actorId || typeof actorId !== 'string') {
    throw new Error('INVALID_ARGUMENT: actorId is required');
  }
  const trimmedReason = (reason ?? '').trim();
  if (!trimmedReason) {
    throw new Error('Lý do trả lại không được để trống');
  }

  return {
    p_evaluation_id: evaluationId,
    p_round: round,
    p_actor_id: actorId,
    p_reason: trimmedReason,
  };
}
