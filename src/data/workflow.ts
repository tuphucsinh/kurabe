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
import { parseRoundNumber } from '@/lib/parsers';

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
  target: User | Evaluation,
  allUsers?: User[],
  ledTeamIds?: readonly string[]
): boolean {
  if ((evaluator as { isActive?: boolean; is_active?: boolean }).isActive === false || (evaluator as { isActive?: boolean; is_active?: boolean }).is_active === false) {
    return false;
  }

  if (selector === 'SELF') {
    const targetId = 'employeeId' in target ? target.employeeId : target.id;
    const targetRole = 'employeeRole' in target ? target.employeeRole : target.role;
    return evaluator.id === targetId && evaluator.role === targetRole;
  }

  if (selector === 'SubLeader') {
    if (evaluator.role !== 'SubLeader') return false;
    let subleaderId: string | null | undefined = 'subleaderId' in target ? (target as User).subleaderId : undefined;
    const targetTeamId = target.teamId;
    if (!subleaderId && 'employeeId' in target && allUsers) {
      const targetUser = allUsers.find(u => u.id === target.employeeId);
      subleaderId = targetUser?.subleaderId;
    }
    if (!subleaderId) return false;
    return subleaderId === evaluator.id && evaluator.teamId === targetTeamId;
  }

  if (selector === 'Leader') {
    const leadsTargetTeam = Boolean(target.teamId && ledTeamIds?.includes(target.teamId));
    return evaluator.role === 'Leader' && (evaluator.teamId === target.teamId || leadsTargetTeam);
  }

  return evaluator.role === 'Manager';
}


/**
 * Kiểm tra quyền đánh giá (thường ở Round 1)
 */
export function canEvaluate(evaluator: User, target: User, ledTeamIds?: readonly string[]): boolean {
  const [firstStep] = getEvaluationFlow(target.role);
  return matchesEvaluatorSelector(firstStep.evaluator, evaluator, target, undefined, ledTeamIds);
}

/**
 * Kiểm tra quyền review (Round 2, 3)
 */
export function canReview(reviewer: User, evaluation: Evaluation, allUsers: User[], ledTeamIds?: readonly string[]): boolean {
  const targetEmployee = allUsers.find(u => u.id === evaluation.employeeId);
  if (!targetEmployee) return false;

  const currentStep = getEvaluationFlow(targetEmployee.role)
    .find(step => step.round === evaluation.currentRound);

  if (!currentStep || currentStep.evaluator === 'SELF') {
    return false;
  }

  return matchesEvaluatorSelector(currentStep.evaluator, reviewer, evaluation, allUsers, ledTeamIds);
}

/**
 * Lấy danh sách nhân viên mà user hiện tại có thể đánh giá (Round 1)
 */
export function getEvaluatableEmployees(currentUser: User, allUsers: User[], ledTeamIds?: readonly string[]): User[] {
  return allUsers.filter(user => canEvaluate(currentUser, user, ledTeamIds));
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
export function canViewEvaluation(
  user: User | null | undefined,
  evaluation: Evaluation,
  allUsers?: User[],
  ledTeamIds?: readonly string[]
): boolean {
  if (!user) return false;
  
  // Manager xem tất cả
  if (user.role === 'Manager') return true;
  
  // Chủ sở hữu xem của mình
  if (user.id === evaluation.employeeId) return true;

  // Người đã/đang được assign làm evaluator xem được.
  // Đối với evaluation đã Approved (hoặc đã kết thúc), chỉ evaluator đã thực sự submit round mới có quyền xem theo historical snapshot (tránh cấp quyền từ unfinished/withdrawn assignment).
  if (evaluation.rounds.some(r => r.evaluatorId === user.id && (evaluation.status !== 'Approved' || isRoundSubmitted(r)))) return true;

  // Thành viên trong flow của người được đánh giá (nếu cùng team)
  const flow = getEvaluationFlow(evaluation.employeeRole);
  const isInFlow = flow.some(step => matchesEvaluatorSelector(step.evaluator, user, evaluation, allUsers, ledTeamIds));

  // Future reviewer được phép xem draft trước khi đến lượt:
  // chỉ mở cho Leader cùng team. SubLeader phải có assign evaluator cụ thể.
  if (user.role === 'Leader' && isInFlow) return true;

  return false;
}

/**
 * Kiểm tra xem viewer có quyền hạn hiện tại (current scope) đối với target employee hay không.
 * - Manager: có quyền xem tất cả nhân viên.
 * - Self: có quyền xem chính mình.
 * - Leader: có quyền đối với nhân viên thuộc primary team hoặc appointed teams (teams.leader_id).
 * - SubLeader / Employee / Worker: không có current scope xem lịch sử người khác.
 */
export function hasEvaluationHistoryTargetScope(
  viewer: User | null | undefined,
  target: User,
  leaderTeamIds?: readonly string[]
): boolean {
  if (!viewer) return false;
  if (viewer.role === 'Manager') return true;
  if (viewer.id === target.id) return true;
  if (viewer.role === 'Leader') {
    return Boolean(target.teamId && leaderTeamIds && leaderTeamIds.includes(target.teamId));
  }
  return false;
}

/**
 * Kiểm tra xem viewer có phải là historical evaluator đã thực sự submit round cho evaluation này hay không.
 * Stale unfinished / withdrawn assignment (chưa submit) KHÔNG cấp quyền xem lịch sử.
 */
export function isAuthorizedHistoricalEvaluator(
  viewer: User | null | undefined,
  evaluation: Evaluation
): boolean {
  if (!viewer) return false;
  return evaluation.rounds.some(
    (r) => r.evaluatorId === viewer.id && isRoundSubmitted(r)
  );
}

/**
 * Single authorization truth table for historical evaluation reads.
 * Current scope permits the current target history; a submitted historical
 * round permits only that immutable historical entry after current scope is
 * withdrawn. This never grants current evaluation write access.
 */
export function canReadEvaluationHistory(
  viewer: User | null | undefined,
  target: User,
  evaluation: Evaluation,
  leaderTeamIds?: readonly string[]
): boolean {
  return hasEvaluationHistoryTargetScope(viewer, target, leaderTeamIds)
    || isAuthorizedHistoricalEvaluator(viewer, evaluation);
}

/**
 * Tính toán trạng thái truy cập chi tiết cho viewer đối với một evaluation
 */
export function getEvaluationAccessState(
  viewer: User | null | undefined,
  evaluation: Evaluation,
  allUsers?: User[],
  ledTeamIds?: readonly string[]
): EvaluationAccessState {
  if (!viewer || (viewer as { isActive?: boolean; is_active?: boolean }).isActive === false || (viewer as { isActive?: boolean; is_active?: boolean }).is_active === false) {
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
  const viewerStep = flow.find(step => matchesEvaluatorSelector(step.evaluator, viewer, evaluation, allUsers, ledTeamIds));
  
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
      const prevRound = evaluation.rounds.find(r => r.round === parseRoundNumber(evaluation.currentRound - 1));
      previousSubmitted = !!prevRound && isRoundSubmitted(prevRound);
    }

    const isManagerSelfRound =
      viewer.id === evaluation.employeeId &&
      currentStep?.evaluator === 'SELF' &&
      !!currentRoundData &&
      currentRoundData.evaluatorId === viewer.id &&
      !isRoundSubmitted(currentRoundData);

    const isManagerReviewerRound =
      currentStep?.evaluator === 'Manager' &&
      !!currentRoundData &&
      currentRoundData.evaluatorId === viewer.id &&
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
    if (
      currentStep &&
      currentStep.evaluator === 'SELF' &&
      currentRoundData &&
      currentRoundData.evaluatorId === viewer.id &&
      !isRoundSubmitted(currentRoundData)
    ) {
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
      if (!currentRoundData || currentRoundData.evaluatorId !== viewer.id || isRoundSubmitted(currentRoundData)) {
        if (!hasAnyDraft) {
          return {
            mode: 'blocked',
            reason: 'NO_DRAFT',
            displayRound: latestVisibleRound,
            editableRound: null,
            visibleRounds,
          };
        }
        return {
          mode: 'readonly',
          displayRound: latestVisibleRound,
          editableRound: null,
          visibleRounds,
        };
      }

      // Check xem round trước (nếu có) đã submit chưa - thực tế currentRound đã đảm bảo điều này qua saveEvaluationRound
      // Nhưng ta check thêm tính draft-gate: Nếu round 1 chưa có draft mà Leader (R2) vào xem
      if (evaluation.currentRound > 1) {
        const prevRound = evaluation.rounds.find(r => r.round === parseRoundNumber(evaluation.currentRound - 1));
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

/**
 * Kiểm tra xem actor có quyền ghi (Save Draft, Initialize Draft, Submit) đối với một round cụ thể hay không.
 * Yêu cầu đồng thời:
 * 1. Actor còn đang active (không bị khóa/inactivated).
 * 2. Actor thỏa mãn current authorization theo role, team, và quan hệ tổ chức hiện tại.
 * 3. Round đang mở (chưa submit) và actor là evaluator được gán trên round đó (stored assignment).
 * 4. Đảm bảo thứ tự monotonic (round hiện tại).
 */
export function canWriteEvaluationRound(
  actor: User | null | undefined,
  evaluation: Evaluation,
  round: RoundNumber,
  allUsers?: User[],
  ledTeamIds?: readonly string[]
): boolean {
  if (!actor || (actor as { isActive?: boolean; is_active?: boolean }).isActive === false || (actor as { isActive?: boolean; is_active?: boolean }).is_active === false) {
    return false;
  }
  if (evaluation.currentRound !== round) {
    return false;
  }
  const roundRecord = evaluation.rounds.find((r) => r.round === round);
  if (!roundRecord || isRoundSubmitted(roundRecord)) {
    return false;
  }
  if (roundRecord.evaluatorId !== actor.id) {
    return false;
  }
  if (round > 1) {
    const prevRound = evaluation.rounds.find((r) => r.round === parseRoundNumber(round - 1));
    if (!prevRound || !isRoundSubmitted(prevRound)) {
      return false;
    }
  }
  const flow = getEvaluationFlow(evaluation.employeeRole);
  const step = flow.find((s) => s.round === round);
  if (!step) {
    return false;
  }
  return matchesEvaluatorSelector(step.evaluator, actor, evaluation, allUsers, ledTeamIds);
}

/**
 * Kiểm tra xem actor có quyền trả lại (Return Evaluation Round) hay không.
 * Case B: Manager trả lại round 1 của chính mình khi đã Approved.
 * Case A: Reviewer (Leader/Manager) trả lại round > 1 đang ở Draft về round trước.
 * Yêu cầu actor còn đang active và giữ đúng vai trò/phạm vi hiện tại.
 */
export function canReturnEvaluationRound(
  actor: User | null | undefined,
  evaluation: Evaluation,
  round: RoundNumber,
  allUsers?: User[],
  ledTeamIds?: readonly string[]
): boolean {
  if (!actor || (actor as { isActive?: boolean; is_active?: boolean }).isActive === false || (actor as { isActive?: boolean; is_active?: boolean }).is_active === false) {
    return false;
  }
  if (round === 1) {
    if (
      evaluation.employeeRole !== 'Manager' ||
      evaluation.status !== 'Approved' ||
      evaluation.currentRound !== 1 ||
      actor.role !== 'Manager' ||
      actor.id !== evaluation.employeeId
    ) {
      return false;
    }
    const round1 = evaluation.rounds.find((r) => r.round === 1);
    return Boolean(round1 && round1.evaluatorId === actor.id && isRoundSubmitted(round1));
  }

  // round > 1
  if (evaluation.currentRound !== round || evaluation.status === 'Approved') {
    return false;
  }
  const currentRound = evaluation.rounds.find((r) => r.round === round);
  if (!currentRound || currentRound.evaluatorId !== actor.id || isRoundSubmitted(currentRound)) {
    return false;
  }
  const prevRound = evaluation.rounds.find((r) => r.round === parseRoundNumber(round - 1));
  if (!prevRound || !isRoundSubmitted(prevRound)) {
    return false;
  }
  const flow = getEvaluationFlow(evaluation.employeeRole);
  const step = flow.find((s) => s.round === round);
  if (!step || step.evaluator === 'SELF') {
    return false;
  }
  return matchesEvaluatorSelector(step.evaluator, actor, evaluation, allUsers, ledTeamIds);
}
