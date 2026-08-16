import { getGradeBandsSync, GradeBands } from '@/lib/grade-bands';
import { matchGradeBand } from '@/lib/grade-match';
import { Evaluation, EvaluationRound, Grade, RoundNumber, Role } from '@/types';
import { parseGrade } from '@/lib/parsers';

const LEADER_ROLES: Role[] = ['Leader', 'Manager', 'SubLeader'];

const GRADE_COLORS: Record<string, string> = {
  'S': 'text-amber-600 bg-amber-50 border-amber-200',
  'A': 'text-blue-600 bg-blue-50 border-blue-200',
  'AB': 'text-blue-600 bg-blue-50 border-blue-200',
  'B': 'text-green-600 bg-green-50 border-green-200',
  'C': 'text-orange-600 bg-orange-50 border-orange-200',
  'D': 'text-red-600 bg-red-50 border-red-200',
};

/**
 * Tính score cho 1 round
 * Trả về { totalScore: number; grade: Grade }
 * `bands` optional: thang điểm đã load từ DB (caller giữ state để recompute khi bands đổi); mặc định module cache.
 */
export function calculateRoundScore(
  round: EvaluationRound,
  bands?: GradeBands
): { totalScore: number; grade: Grade } {
  const totalScore = Object.values(round.scores).reduce((sum, score) => sum + score, 0);
  const grade = getGradeFromScore(totalScore, round.evaluatorRole, bands);
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
 * `bandsOverride` optional: thang điểm đã load từ DB; mặc định module cache.
 */
export function getGradeFromScore(
  totalScore: number,
  role: Role,
  bandsOverride?: GradeBands
): Grade {
  const isLeader = LEADER_ROLES.includes(role);
  const bands = bandsOverride ?? getGradeBandsSync();
  const targetGrading = isLeader ? bands.leader : bands.staff;

  // Match qua pure helper — ngữ nghĩa null duy nhất: minScore null = band thấp nhất catch-all
  const result = matchGradeBand(targetGrading, totalScore);

  return parseGrade(result, 'D');
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
  return GRADE_COLORS[grade] || 'text-gray-600 bg-gray-50 border-gray-200';
}

