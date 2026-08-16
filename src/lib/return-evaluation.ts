import { EvalStatus, Role, RoundNumber } from '@/types';
import { ACTIVE_STEP_STATUSES } from './evaluation-workflow';
import { parseRoundNumber } from '@/lib/parsers';

export interface ReturnCheck {
  ok: boolean;
  error?: string;
}

export interface CanReturnEvaluationParams {
  round: RoundNumber;
  actorId: string;
  employeeId: string;
  actorRole: Role;
  evaluationStatus: EvalStatus;
  currentRound: RoundNumber;
  currentRoundEvaluatorId: string | null;
  currentRoundSubmitted: boolean;
  prevRoundExists: boolean;
  prevRoundSubmitted: boolean;
  flowEvaluator: string | null;
}

export function canReturnEvaluation(params: CanReturnEvaluationParams): ReturnCheck {
  const {
    round,
    actorId,
    employeeId,
    actorRole,
    evaluationStatus,
    currentRound,
    currentRoundEvaluatorId,
    currentRoundSubmitted,
    prevRoundExists,
    prevRoundSubmitted,
    flowEvaluator,
  } = params;

  if (round < 1) {
    return { ok: false, error: 'Vòng đánh giá không hợp lệ.' };
  }

  if (round !== currentRound) {
    return { ok: false, error: 'Vòng này không phải vòng hiện tại.' };
  }

  if (flowEvaluator === 'SELF') {
    if (
      round === 1 &&
      actorId === employeeId &&
      actorRole === 'Manager' &&
      evaluationStatus === 'Approved'
    ) {
      return { ok: true };
    }
    return { ok: false, error: 'Không thể trả lại vòng này.' };
  }

  // flowEvaluator !== 'SELF' (case A)
  if (round <= 1) {
    return { ok: false, error: 'Không thể trả lại vòng 1.' };
  }

  if (actorId !== currentRoundEvaluatorId) {
    return { ok: false, error: 'Bạn không phải người đánh giá vòng này.' };
  }

  if (currentRoundSubmitted) {
    return { ok: false, error: 'Vòng đánh giá đã nộp — không thể trả lại.' };
  }

  if (!prevRoundExists || !prevRoundSubmitted) {
    return { ok: false, error: 'Vòng trước chưa nộp — không thể trả lại.' };
  }

  return { ok: true };
}

export function resetRoundFields() {
  return {
    status: 'NotStarted' as const,
    scores: {},
    notes: {},
    comment: null,
    total_score: 0,
    grade: 'Pending' as const,
    submitted_at: null,
  };
}

export function nextStatusAfterReturn(round: RoundNumber): EvalStatus {
  const prevRound = parseRoundNumber(round - 1);
  return ACTIVE_STEP_STATUSES[prevRound] ?? 'Draft';
}
