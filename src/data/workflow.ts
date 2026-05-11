import {
  User,
  Evaluation,
  EvaluationRound,
  Role,
  RoundNumber,
  EvaluationAccessState,
} from '@/types';
import {
  EvaluatorSelector,
  getEvaluationFlow,
  getNextEvaluationStep,
} from '@/lib/evaluation-workflow';

function getLatestVisibleRound(rounds: EvaluationRound[]): RoundNumber | null {
  if (rounds.length === 0) return null;
  return [...rounds].sort((a, b) => b.round - a.round)[0].round;
}

/**
 * Kiểm tra xem round đã có bản nháp chưa
 */
export function hasRoundDraft(round: EvaluationRound): boolean {
  // Có status Draft/Submitted hoặc đã có dữ liệu legacy
  if (round.status === 'Draft' || round.status === 'Submitted') return true;
  if (round.submittedAt) return true;
  
  // Fallback check legacy data
  const hasScores = Object.keys(round.scores || {}).length > 0;
  const hasNotes = Object.keys(round.notes || {}).length > 0;
  return hasScores || hasNotes || !!round.comment;
}

/**
 * Kiểm tra xem round đã được gửi chưa
 */
export function isRoundSubmitted(round: EvaluationRound): boolean {
  return round.status === 'Submitted' || !!round.submittedAt;
}

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
  return !isRoundSubmitted(roundData);
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
  return isRoundSubmitted(round);
}

/**
 * Kiểm tra quyền xem chi tiết evaluation
 */
export function canViewEvaluation(user: User | null | undefined, evaluation: Evaluation): boolean {
  if (!user) return false;
  
  // Manager xem tất cả
  if (user.role === 'Manager') return true;
  
  // Chủ sở hữu xem của mình
  if (user.id === evaluation.employeeId) return true;

  // Người đã/đang được assign làm evaluator xem được.
  if (evaluation.rounds.some(r => r.evaluatorId === user.id)) return true;

  // Thành viên trong flow của người được đánh giá (nếu cùng team)
  const flow = getEvaluationFlow(evaluation.employeeRole);
  const isInFlow = flow.some(step => matchesEvaluatorSelector(step.evaluator, user, evaluation));

  // Future reviewer được phép xem draft trước khi đến lượt:
  // chỉ mở cho Leader cùng team. SubLeader phải có assign evaluator cụ thể.
  if (user.role === 'Leader' && isInFlow) return true;

  return false;
}

/**
 * Tính toán trạng thái truy cập chi tiết cho viewer đối với một evaluation
 */
export function getEvaluationAccessState(
  viewer: User | null | undefined,
  evaluation: Evaluation
): EvaluationAccessState {
  if (!viewer) {
    return {
      mode: 'blocked',
      reason: 'NOT_AUTHORIZED',
      displayRound: null,
      editableRound: null,
      visibleRounds: [],
    };
  }
  const flow = getEvaluationFlow(evaluation.employeeRole);
  const visibleRounds = evaluation.rounds
    .filter(hasRoundDraft)
    .sort((a, b) => a.round - b.round);
  const latestVisibleRound = getLatestVisibleRound(visibleRounds);
  const hasAnyDraft = visibleRounds.length > 0;

  // 1. Tìm step hiện tại của viewer trong flow
  const viewerStep = flow.find(step => matchesEvaluatorSelector(step.evaluator, viewer, evaluation));
  
  // 2. Xác định mode mặc định
  const state: EvaluationAccessState = {
    mode: 'readonly',
    displayRound: latestVisibleRound,
    editableRound: null,
    visibleRounds,
  };

  // Manager Rule
  if (viewer.role === 'Manager') {
    // Nếu manager là evaluator hiện tại (Round cuối hoặc round duy nhất)
    const currentStep = flow.find(s => s.round === evaluation.currentRound);
    const currentRoundData = evaluation.rounds.find(r => r.round === evaluation.currentRound);
    let previousSubmitted = true;
    if (evaluation.currentRound > 1) {
      const prevRound = evaluation.rounds.find(r => r.round === (evaluation.currentRound - 1) as RoundNumber);
      previousSubmitted = !!prevRound && isRoundSubmitted(prevRound);
    }

    const isManagerSelfRound =
      viewer.id === evaluation.employeeId &&
      currentStep?.evaluator === 'SELF' &&
      !!currentRoundData &&
      !isRoundSubmitted(currentRoundData);

    const isManagerReviewerRound =
      currentStep?.evaluator === 'Manager' &&
      !!currentRoundData &&
      previousSubmitted &&
      !isRoundSubmitted(currentRoundData);

    if (isManagerSelfRound || isManagerReviewerRound) {
      state.mode = 'edit';
      state.editableRound = evaluation.currentRound;
      state.displayRound = evaluation.currentRound;
    }
    
    if (!hasAnyDraft && state.mode !== 'edit') {
      state.mode = 'blocked';
      state.reason = 'NO_DRAFT';
    }
    return state;
  }

  // Employee (Owner) Rule
  if (viewer.id === evaluation.employeeId) {
    const currentStep = flow.find(s => s.round === evaluation.currentRound);
    const currentRoundData = evaluation.rounds.find(r => r.round === evaluation.currentRound);
    if (currentStep && currentStep.evaluator === 'SELF' && currentRoundData) {
      state.mode = 'edit';
      state.editableRound = evaluation.currentRound;
      state.displayRound = evaluation.currentRound;
    } else if (!hasAnyDraft) {
      state.mode = 'blocked';
      state.reason = 'NO_DRAFT';
    }
    return state;
  }

  // Leader/SubLeader Reviewer Rule
  if (viewerStep) {
    // Nếu chưa đến lượt mình
    if (viewerStep.round > evaluation.currentRound) {
      if (!hasAnyDraft) {
        state.mode = 'blocked';
        state.reason = 'NO_DRAFT';
      } else {
        state.mode = 'readonly';
        // Hiển thị round mới nhất có dữ liệu
        state.displayRound = latestVisibleRound;
      }
      return state;
    }

    // Nếu đang đến lượt mình
    if (viewerStep.round === evaluation.currentRound) {
      const currentRoundData = evaluation.rounds.find(r => r.round === evaluation.currentRound);
      if (!currentRoundData) {
        return {
          mode: 'blocked',
          reason: 'ROUND_LOCKED',
          displayRound: latestVisibleRound,
          editableRound: null,
          visibleRounds,
        };
      }

      // Check xem round trước (nếu có) đã submit chưa - thực tế currentRound đã đảm bảo điều này qua saveEvaluationRound
      // Nhưng ta check thêm tính draft-gate: Nếu round 1 chưa có draft mà Leader (R2) vào xem
      if (evaluation.currentRound > 1) {
        const prevRound = evaluation.rounds.find(r => r.round === evaluation.currentRound - 1);
        if (!prevRound || !isRoundSubmitted(prevRound)) {
           // Trường hợp hy hữu: currentRound tăng nhưng round trước chưa submit
           state.mode = 'readonly';
           return state;
        }
      }

      state.mode = 'edit';
      state.editableRound = evaluation.currentRound;
      state.displayRound = evaluation.currentRound;
      return state;
    }

    // Nếu đã qua lượt mình
    if (viewerStep.round < evaluation.currentRound) {
      state.mode = 'readonly';
      state.displayRound = latestVisibleRound;
      return state;
    }
  }

  // Not authorized
  return {
    mode: 'blocked',
    reason: 'NOT_AUTHORIZED',
    displayRound: null,
    editableRound: null,
    visibleRounds: [],
  };
}
