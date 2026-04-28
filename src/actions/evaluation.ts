'use server';

import { db, RoundNumber, EvaluationRound } from '@/data/mock';
import { calculateRoundScore } from '@/lib/scoring';
import { isRoundLocked, getNextRound } from '@/data/workflow';
import { revalidatePath } from 'next/cache';

/**
 * Lưu bản nháp cho round hiện tại. Không khóa, không chuyển round.
 */
export async function saveEvaluationRoundDraft(
  evaluationId: string,
  roundNumber: RoundNumber,
  scores: Record<string, number>,
  notes: Record<string, string>,
  comment?: string
) {
  const evaluation = db.evaluations.find(e => e.id === evaluationId);
  if (!evaluation) {
    return { success: false, error: 'Evaluation not found' };
  }

  const round = evaluation.rounds.find(r => r.round === roundNumber);
  if (!round) {
    return { success: false, error: 'Round not found' };
  }

  if (isRoundLocked(round)) {
    return { success: false, error: 'Round is locked and cannot be modified' };
  }

  // Cập nhật scores và notes
  round.scores = { ...round.scores, ...scores };
  round.notes = { ...round.notes, ...notes };
  
  if (comment !== undefined) {
    round.comment = comment;
  }

  // Tính lại điểm và xếp loại cho round đó
  const { totalScore, grade } = calculateRoundScore(round);
  round.totalScore = totalScore;
  round.grade = grade;

  // Cập nhật thời gian update và trạng thái
  evaluation.updatedAt = new Date().toISOString();
  evaluation.status = 'Draft';

  revalidatePath('/evaluations');
  revalidatePath(`/evaluations/${evaluationId}`);

  return { success: true, evaluation };
}

/**
 * Chốt kết quả round hiện tại. Khóa round, mở round tiếp theo nếu cần.
 */
export async function submitEvaluationRound(evaluationId: string, roundNumber: RoundNumber) {
  const evaluation = db.evaluations.find(e => e.id === evaluationId);
  if (!evaluation) {
    return { success: false, error: 'Evaluation not found' };
  }

  const round = evaluation.rounds.find(r => r.round === roundNumber);
  if (!round) {
    return { success: false, error: 'Round not found' };
  }

  if (isRoundLocked(round)) {
    return { success: false, error: 'Round is already submitted' };
  }

  // Khóa round hiện tại
  const now = new Date().toISOString();
  round.submittedAt = now;
  evaluation.updatedAt = now;

  const nextRoundNum = getNextRound(roundNumber);

  if (nextRoundNum) {
    // Nếu còn round tiếp theo: Tạo round mới và copy baseline từ round cũ
    const newRound: EvaluationRound = {
      round: nextRoundNum,
      evaluatorId: '', // Sẽ được gán khi người review mở ra
      evaluatorRole: 'Employee', // Placeholder
      scores: { ...round.scores },
      notes: { ...(round.notes || {}) },
      totalScore: round.totalScore,
      grade: round.grade,
      comment: '',
      createdAt: now,
    };

    evaluation.rounds.push(newRound);
    evaluation.currentRound = nextRoundNum;
    
    // Logic trạng thái: 
    // R1 -> R2: Submitted (Chờ Leader review)
    // R2 -> R3: Reviewed (Chờ Manager review)
    evaluation.status = nextRoundNum === 2 ? 'Submitted' : 'Reviewed';
  } else {
    // Nếu là round cuối cùng: Hoàn tất kỳ đánh giá
    evaluation.status = 'Approved';
    evaluation.finalScore = round.totalScore;
    evaluation.finalGrade = round.grade;
  }

  revalidatePath('/evaluations');
  revalidatePath(`/evaluations/${evaluationId}`);

  return { success: true, evaluation };
}
