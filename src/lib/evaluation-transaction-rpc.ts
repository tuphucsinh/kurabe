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
  p_is_submit: boolean;
  p_submitted_at: string;
  p_next_round: number | null;
  p_next_evaluator_id: string | null;
  p_next_evaluator_role: string | null;
  p_next_status: string | null;
  p_is_final: boolean;
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
    isSubmit: boolean;
  };
  totalScore: number;
  grade: Grade;
  submittedAt?: string;
  nextStep?: EvaluationNextStep | null;
  nextEvaluator?: { id: string; role: Role } | null;
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
  } = input;

  const composedNotes = composeRoundNotes(canonical.notes, canonical.selectedLevelIndexes);
  const now = submittedAt || new Date().toISOString();

  const isSubmit = Boolean(canonical.isSubmit);
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
    p_is_submit: isSubmit,
    p_submitted_at: now,
    p_next_round: isSubmit && !isFinal && nextStep ? nextStep.round : null,
    p_next_evaluator_id: isSubmit && !isFinal && nextEvaluator ? nextEvaluator.id : null,
    p_next_evaluator_role: isSubmit && !isFinal && nextEvaluator ? nextEvaluator.role : null,
    p_next_status: isSubmit && nextStep ? nextStep.status : null,
    p_is_final: isFinal,
  };
}
