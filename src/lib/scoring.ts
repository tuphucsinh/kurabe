import { gradingLeader, gradingStaff } from '@/data/criteria';
import { Evaluation, EvaluationRound, Grade, RoundNumber, Role } from '@/types';

/**
 * Tính score cho 1 round
 * Trả về { totalScore: number; grade: Grade }
 */
export function calculateRoundScore(round: EvaluationRound): { totalScore: number; grade: Grade } {
  const totalScore = Object.values(round.scores).reduce((sum, score) => sum + score, 0);
  const grade = getGradeFromScore(totalScore, round.evaluatorRole);
  return { totalScore, grade };
}

/**
 * So sánh 2 rounds, trả về danh sách criteriaId có điểm khác
 */
export function diffRounds(round1: EvaluationRound, round2: EvaluationRound): string[] {
  const allKeys = Array.from(new Set([
    ...Object.keys(round1.scores),
    ...Object.keys(round2.scores)
  ]));

  return allKeys.filter(key => round1.scores[key] !== round2.scores[key]);
}

/**
 * Lấy grade cuối cùng (round cuối cùng đã submitted)
 */
export function getFinalResult(evaluation: Evaluation): { totalScore: number; grade: Grade; round: RoundNumber } | null {
  // Tìm round cuối cùng đã submit, lấy round lớn nhất
  const submittedRounds = [...evaluation.rounds]
    .filter(r => r.submittedAt)
    .sort((a, b) => b.round - a.round);

  if (submittedRounds.length === 0) return null;

  const lastSubmitted = submittedRounds[0];
  return {
    totalScore: lastSubmitted.totalScore,
    grade: lastSubmitted.grade,
    round: lastSubmitted.round
  };
}

/**
 * Lấy xếp loại từ điểm và vai trò
 */
export function getGradeFromScore(totalScore: number, role: Role): Grade {
  const isLeader = role === 'Leader' || role === 'Manager' || role === 'SubLeader';
  const targetGrading = isLeader ? gradingLeader : gradingStaff;

  // Tìm range phù hợp nhất, ưu tiên các mức cao trước nếu bị chồng lấn (overlapping)
  const result = [...targetGrading]
    .sort((a, b) => (b.minScore || 0) - (a.minScore || 0))
    .find(range => totalScore >= (range.minScore ?? -Infinity));

  return (result?.grade as Grade) || 'D';
}

/**
 * Backward compatible helper
 */
export function calculateGrade(totalScore: number, isLeader: boolean): Grade {
  return getGradeFromScore(totalScore, isLeader ? 'Leader' : 'Employee');
}

/**
 * Lấy màu sắc cho xếp loại
 */
export function getGradeColor(grade: string): string {
  switch (grade) {
    case 'S': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'A':
    case 'AB': return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'B': return 'text-green-600 bg-green-50 border-green-200';
    case 'C': return 'text-orange-600 bg-orange-50 border-orange-200';
    case 'D': return 'text-red-600 bg-red-50 border-red-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

