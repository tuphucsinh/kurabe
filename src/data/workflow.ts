import { User, Evaluation, EvaluationRound, Role, RoundNumber } from '@/types';
import {
  EvaluatorSelector,
  getEvaluationFlow,
  getNextEvaluationStep,
} from '@/lib/evaluation-workflow';

function matchesEvaluatorSelector(
  selector: EvaluatorSelector,
  evaluator: User,
  target: User | Evaluation
): boolean {
  if (selector === 'SELF') {
    const targetId = 'employeeId' in target ? target.employeeId : target.id;
    return evaluator.id === targetId;
  }

  if (selector === 'SubLeader') {
    return evaluator.role === 'SubLeader' && evaluator.teamId === target.teamId;
  }

  if (selector === 'Leader') {
    return evaluator.role === 'Leader' && evaluator.teamId === target.teamId;
  }

  return evaluator.role === 'Manager';
}

/**
 * Kiểm tra quyền đánh giá (thường ở Round 1)
 */
export function canEvaluate(evaluator: User, target: User): boolean {
  const [firstStep] = getEvaluationFlow(target.role);
  return matchesEvaluatorSelector(firstStep.evaluator, evaluator, target);
}

/**
 * Kiểm tra quyền review (Round 2, 3)
 */
export function canReview(reviewer: User, evaluation: Evaluation, allUsers: User[]): boolean {
  const targetEmployee = allUsers.find(u => u.id === evaluation.employeeId);
  if (!targetEmployee) return false;

  const currentStep = getEvaluationFlow(targetEmployee.role)
    .find(step => step.round === evaluation.currentRound);

  if (!currentStep || currentStep.evaluator === 'SELF') {
    return false;
  }

  return matchesEvaluatorSelector(currentStep.evaluator, reviewer, evaluation);
}

/**
 * Lấy danh sách nhân viên mà user hiện tại có thể đánh giá (Round 1)
 */
export function getEvaluatableEmployees(currentUser: User, allUsers: User[]): User[] {
  return allUsers.filter(user => canEvaluate(currentUser, user));
}

/**
 * Kiểm tra evaluation có thể submit không
 */
export function canSubmitRound(evaluation: Evaluation, round: RoundNumber): boolean {
  const roundData = evaluation.rounds.find(r => r.round === round);
  if (!roundData) return false;
  
  // Chưa submit mới được submit
  return !roundData.submittedAt;
}

/**
 * Lấy round tiếp theo theo role người được đánh giá
 */
export function getNextRoundForEmployeeRole(
  employeeRole: Role,
  currentRound: RoundNumber
): RoundNumber | null {
  const nextStep = getNextEvaluationStep(employeeRole, currentRound);
  return nextStep.isFinal ? null : nextStep.round;
}

/**
 * @deprecated Dùng getNextRoundForEmployeeRole(employeeRole, currentRound).
 */
export function getNextRound(currentRound: RoundNumber): RoundNumber | null {
  return getNextRoundForEmployeeRole('Employee', currentRound);
}

/**
 * Kiểm tra đã lock chưa (đã submit)
 */
export function isRoundLocked(round: EvaluationRound): boolean {
  return !!round.submittedAt;
}

/**
 * Kiểm tra quyền xem chi tiết evaluation
 */
export function canViewEvaluation(user: User, evaluation: Evaluation): boolean {
  // Manager xem tất cả
  if (user.role === 'Manager') return true;
  
  // Chủ sở hữu xem của mình
  if (user.id === evaluation.employeeId) return true;
  
  // Người đang đánh giá/review
  if (evaluation.rounds.some(r => r.evaluatorId === user.id)) return true;

  return false;
}
