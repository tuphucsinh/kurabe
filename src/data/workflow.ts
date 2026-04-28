import { User, Evaluation, EvaluationRound, RoundNumber } from './mock';

/**
 * Kiểm tra quyền đánh giá (thường ở Round 1)
 */
export function canEvaluate(evaluator: User, target: User): boolean {
  // Tự đánh giá
  if (evaluator.id === target.id) return true;

  // SubLeader đánh giá nhân viên cùng team
  if (evaluator.role === 'SubLeader' && evaluator.teamId === target.teamId) {
    return target.role === 'Employee';
  }

  // Leader không đánh giá trực tiếp nhân viên ở R1 (nhân viên tự đánh giá hoặc SubLeader đánh giá)
  // Nhưng Leader tự đánh giá mình
  
  return false;
}

/**
 * Kiểm tra quyền review (Round 2, 3)
 */
export function canReview(reviewer: User, evaluation: Evaluation, allUsers: User[]): boolean {
  const targetEmployee = allUsers.find(u => u.id === evaluation.employeeId);
  if (!targetEmployee) return false;

  // Round 2: Leader review SubLeader và Employee cùng team, Manager review Leader
  if (evaluation.currentRound === 2) {
    if (reviewer.role === 'Leader' && reviewer.teamId === evaluation.teamId) {
      return targetEmployee.role === 'Employee' || targetEmployee.role === 'SubLeader';
    }
    if (reviewer.role === 'Manager') {
      return targetEmployee.role === 'Leader';
    }
    return false;
  }

  // Round 3: Manager review tất cả
  if (evaluation.currentRound === 3) {
    return reviewer.role === 'Manager';
  }

  return false;
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
 * Lấy round tiếp theo
 */
export function getNextRound(currentRound: RoundNumber): RoundNumber | null {
  if (currentRound === 1) return 2;
  if (currentRound === 2) return 3;
  return null;
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
  
  // Leader xem team của mình
  if (user.role === 'Leader' && user.teamId === evaluation.teamId) return true;
  
  // Người đang đánh giá/review
  if (evaluation.rounds.some(r => r.evaluatorId === user.id)) return true;

  return false;
}
