'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { calculateRoundScore } from '@/lib/scoring';
import { ensureServerGradeBands } from '@/lib/grade-bands-server';
import { toClientError } from '@/lib/errors';
import { RoundNumber, EvaluationRound, Role, EvalStatus } from '@/types';
import {
  ACTIVE_STEP_STATUSES,
  getEvaluationFlow,
  getNextEvaluationStep,
} from '@/lib/evaluation-workflow';
import {
  resolveEvaluatorFromDb,
  EvaluationSubject,
} from '@/lib/evaluator-resolver';
import { Database } from '@/types/database';
import { composeRoundNotes, SelectedLevelIndexes } from '@/lib/round-level-selection';
import {
  canReturnEvaluation,
  resetRoundFields,
  nextStatusAfterReturn,
} from '@/lib/return-evaluation';
import { parseRole, parseGrade, parseEvalStatus, parseRoundNumber } from '@/lib/parsers';
import { loadAuthoritativeCriteriaForRole } from '@/lib/db/criteria-admin';
import {
  validateEvaluationRoundPayload,
  EvaluationRoundPayloadInput,
  EvaluationCriterionRule,
} from '@/lib/evaluation-round-validation';
import {
  buildEvaluationRoundTransactionRpcArgs,
} from '@/lib/evaluation-transaction-rpc';
import { assertEvaluationPeriodActiveForEvaluation } from '@/lib/db/evaluation-period-write-guard';

type UpdateRound = Database['public']['Tables']['evaluation_rounds']['Update'];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_EVALUATION_STATUSES = new Set<string>([
  'NotStarted',
  'Draft',
  'Submitted',
  'Reviewed',
  'Approved',
]);

type EvaluationTransactionResult = {
  round_id: string;
  evaluation_id: string;
  next_round_id: string | null;
  final_status: string;
};

function isEvaluationTransactionResult(value: unknown): value is EvaluationTransactionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    typeof result.round_id === 'string' &&
    UUID_REGEX.test(result.round_id) &&
    typeof result.evaluation_id === 'string' &&
    UUID_REGEX.test(result.evaluation_id) &&
    (result.next_round_id === null ||
      (typeof result.next_round_id === 'string' && UUID_REGEX.test(result.next_round_id))) &&
    typeof result.final_status === 'string' &&
    VALID_EVALUATION_STATUSES.has(result.final_status)
  );
}

function deriveExpectedAggregateStatus(
  round: RoundNumber,
  isSubmit: boolean,
  nextStepStatus?: EvalStatus | null
): EvalStatus | null {
  if (isSubmit) {
    return nextStepStatus ?? 'Approved';
  }
  return ACTIVE_STEP_STATUSES[round] ?? null;
}
type UpdateEvaluation = Database['public']['Tables']['evaluations']['Update'];
type InsertRound = Database['public']['Tables']['evaluation_rounds']['Insert'];

interface EvaluationSnapshot {
  employeeId: string;
  employeeRole: Role;
  teamId: string | null;
}

export interface SaveEvaluationRoundConfigOptions {
  criteriaConfigVersionId?: string | null;
  gradeConfigVersionId?: string | null;
  renderedRules?: EvaluationCriterionRule[];
}

interface EvaluationCurrentAuthInfo {
  employee_id: string;
  employee_role: string;
  team_id: string | null;
  status: string;
  current_round: number | null;
}

interface WriteAuthSuccess {
  success: true;
  roundId: string;
  roundStatus: string;
  isLocked: boolean;
}

type WriteAuthResult = WriteAuthSuccess | { success: false; error: string };

async function assertCurrentRoundWriteAuthorization(
  actorId: string,
  evaluationId: string,
  round: RoundNumber,
  evalInfo: EvaluationCurrentAuthInfo,
  options?: { isSubmit?: boolean | null; isInit?: boolean }
): Promise<WriteAuthResult> {
  const { data: actorUser, error: actorError } = await supabaseAdmin
    .from('users')
    .select('id, role, team_id, is_active')
    .eq('id', actorId)
    .single();

  if (actorError || !actorUser || actorUser.is_active !== true) {
    return { success: false, error: 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa.' };
  }

  const { data: roundRecord, error: roundError } = await supabaseAdmin
    .from('evaluation_rounds')
    .select('id, evaluator_id, status, submitted_at')
    .eq('evaluation_id', evaluationId)
    .eq('round', round)
    .maybeSingle();

  if (roundError || !roundRecord) {
    return { success: false, error: 'Không tìm thấy thông tin vòng đánh giá.' };
  }

  if (roundRecord.evaluator_id !== actorId) {
    return { success: false, error: 'Bạn không có quyền đánh giá vòng này.' };
  }

  if (!options?.isInit && (roundRecord.status === 'Submitted' || roundRecord.submitted_at !== null)) {
    if (!options?.isSubmit) {
      return { success: false, error: 'Vòng đánh giá đã khóa.' };
    }
  }

  let teamLeaderId: string | null = null;
  if (evalInfo.team_id) {
    const { data: teamData, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, leader_id, is_active')
      .eq('id', evalInfo.team_id)
      .single();

    if (teamError || !teamData || teamData.is_active !== true) {
      return { success: false, error: 'Nhóm đánh giá không tồn tại hoặc đã bị vô hiệu hóa.' };
    }
    teamLeaderId = teamData.leader_id;
  }

  const { data: subjectUser, error: subjectError } = await supabaseAdmin
    .from('users')
    .select('id, role, team_id, subleader_id, is_active')
    .eq('id', evalInfo.employee_id)
    .single();

  if (subjectError || !subjectUser || subjectUser.is_active !== true) {
    return { success: false, error: 'Nhân viên được đánh giá không tồn tại hoặc đã bị vô hiệu hóa.' };
  }

  const flow = getEvaluationFlow(parseRole(evalInfo.employee_role));
  const currentStep = flow.find((s) => s.round === round);
  if (!currentStep) {
    return { success: false, error: 'Vòng đánh giá không hợp lệ đối với chức danh này.' };
  }

  if (currentStep.evaluator === 'SELF') {
    if (actorUser.id !== evalInfo.employee_id || actorUser.role !== evalInfo.employee_role) {
      return { success: false, error: 'Bạn không có quyền tự đánh giá cho hồ sơ này.' };
    }
  } else if (currentStep.evaluator === 'SubLeader') {
    if (
      actorUser.role !== 'SubLeader' ||
      !evalInfo.team_id ||
      actorUser.team_id !== evalInfo.team_id ||
      subjectUser.subleader_id !== actorId
    ) {
      return { success: false, error: 'Bạn không phải SubLeader phụ trách nhân viên này.' };
    }
  } else if (currentStep.evaluator === 'Leader') {
    const isPrimaryLeader = actorUser.role === 'Leader' && Boolean(evalInfo.team_id && actorUser.team_id === evalInfo.team_id);
    const isAppointedLeader = actorUser.role === 'Leader' && Boolean(teamLeaderId && teamLeaderId === actorId);
    if (!isPrimaryLeader && !isAppointedLeader) {
      return { success: false, error: 'Bạn không có quyền đánh giá nhóm này.' };
    }
  } else if (currentStep.evaluator === 'Manager') {
    if (actorUser.role !== 'Manager') {
      return { success: false, error: 'Chỉ Quản lý mới có quyền đánh giá vòng này.' };
    }
  } else {
    return { success: false, error: 'Không xác định được thẩm quyền đánh giá.' };
  }

  const isLocked =
    roundRecord.status === 'Submitted' ||
    roundRecord.submitted_at !== null ||
    evalInfo.status === 'Approved';

  return {
    success: true,
    roundId: roundRecord.id,
    roundStatus: roundRecord.status,
    isLocked,
  };
}

async function assertCurrentRoundReturnAuthorization(
  actorId: string,
  evaluationId: string,
  round: RoundNumber,
  evalInfo: EvaluationCurrentAuthInfo
): Promise<{ success: true } | { success: false; error: string }> {
  const { data: actorUser, error: actorError } = await supabaseAdmin
    .from('users')
    .select('id, role, team_id, is_active')
    .eq('id', actorId)
    .single();

  if (actorError || !actorUser || actorUser.is_active !== true) {
    return { success: false, error: 'Người dùng không tồn tại hoặc đã bị vô hiệu hóa.' };
  }

  const { data: roundRecord, error: roundError } = await supabaseAdmin
    .from('evaluation_rounds')
    .select('id, evaluator_id, status, submitted_at')
    .eq('evaluation_id', evaluationId)
    .eq('round', round)
    .maybeSingle();

  if (roundError || !roundRecord) {
    return { success: false, error: 'Không tìm thấy thông tin vòng đánh giá.' };
  }

  if (roundRecord.evaluator_id !== actorId) {
    return { success: false, error: 'Bạn không phải người đánh giá vòng này.' };
  }

  if (round === 1) {
    if (
      evalInfo.status !== 'Approved' ||
      evalInfo.current_round !== 1 ||
      evalInfo.employee_role !== 'Manager' ||
      actorUser.role !== 'Manager' ||
      evalInfo.employee_id !== actorId
    ) {
      return { success: false, error: 'Vòng 1 chỉ có thể trả lại khi đánh giá là Quản lý và đã Approved.' };
    }
    return { success: true };
  }

  if (evalInfo.current_round !== round || evalInfo.status === 'Approved') {
    return { success: false, error: 'Không thể trả lại đánh giá ở trạng thái hoặc vòng này.' };
  }

  let teamLeaderId: string | null = null;
  if (evalInfo.team_id) {
    const { data: teamData, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, leader_id, is_active')
      .eq('id', evalInfo.team_id)
      .single();

    if (teamError || !teamData || teamData.is_active !== true) {
      return { success: false, error: 'Nhóm đánh giá không tồn tại hoặc đã bị vô hiệu hóa.' };
    }
    teamLeaderId = teamData.leader_id;
  }

  const flow = getEvaluationFlow(parseRole(evalInfo.employee_role));
  const currentStep = flow.find((s) => s.round === round);
  if (!currentStep) {
    return { success: false, error: 'Vòng đánh giá không hợp lệ đối với chức danh này.' };
  }

  if (currentStep.evaluator === 'Leader') {
    const isPrimaryLeader = actorUser.role === 'Leader' && Boolean(evalInfo.team_id && actorUser.team_id === evalInfo.team_id);
    const isAppointedLeader = actorUser.role === 'Leader' && Boolean(teamLeaderId && teamLeaderId === actorId);
    if (!isPrimaryLeader && !isAppointedLeader) {
      return { success: false, error: 'Bạn không có quyền trả lại đánh giá cho nhóm này.' };
    }
  } else if (currentStep.evaluator === 'Manager') {
    if (actorUser.role !== 'Manager') {
      return { success: false, error: 'Chỉ Quản lý mới có quyền trả lại vòng này.' };
    }
  } else {
    return { success: false, error: 'Không thể trả lại vòng này.' };
  }

  return { success: true };
}

/**
 * Lưu bản nháp (Draft) hoặc Gửi (Submit) kết quả đánh giá cho một Round.
 * Actor lấy từ session (requireAuth) — round chỉ update được bởi đúng evaluator của round đó.
 */
export async function saveEvaluationRound(
  evaluationId: string,
  round: RoundNumber,
  scores: Record<string, number>,
  notes: Record<string, string>,
  selectedLevelIndexes: SelectedLevelIndexes,
  comment: string,
  isSubmit: boolean = false,
  configVersions?: SaveEvaluationRoundConfigOptions
) {
  const auth = await requireAuth();
  if (auth.error !== null) return { success: false, error: auth.error };
  const actorId = auth.user.id;

  try {
    // P96T05: Closed-period write firewall — fail closed before any direct write or RPC
    const periodGuard = await assertEvaluationPeriodActiveForEvaluation(evaluationId);
    if (!periodGuard.success) {
      return { success: false, error: periodGuard.error };
    }

    const { data: evalInfo, error: evalInfoError } = await supabaseAdmin
      .from('evaluations')
      .select('employee_id, employee_role, team_id, status, current_round')
      .eq('id', evaluationId)
      .single();

    if (evalInfoError || !evalInfo) {
      return { success: false, error: 'Không tìm thấy thông tin đánh giá.' };
    }

    // P103M1T03: Preflight current authorization guard
    const authGuard = await assertCurrentRoundWriteAuthorization(
      actorId,
      evaluationId,
      round,
      evalInfo,
      { isSubmit }
    );
    if (!authGuard.success) {
      return { success: false, error: authGuard.error };
    }


    const evaluation: EvaluationSnapshot = {
      employeeId: evalInfo.employee_id,
      employeeRole: parseRole(evalInfo.employee_role),
      teamId: evalInfo.team_id,
    };

    // 1.5. Nạp danh mục tiêu chí authoritative và validate payload fail-closed
    const criteriaResult = await loadAuthoritativeCriteriaForRole(evaluation.employeeRole);
    if (!criteriaResult.success) {
      return { success: false, error: criteriaResult.error };
    }

    // Validate client's rendered criteria version against authoritative version
    if (!configVersions?.criteriaConfigVersionId) {
      return {
        success: false,
        error: 'Thiếu phiên bản cấu hình tiêu chí. Vui lòng tải lại trang trước khi gửi.',
      };
    }
    if (
      configVersions?.criteriaConfigVersionId &&
      configVersions.criteriaConfigVersionId !== criteriaResult.versionId
    ) {
      return {
        success: false,
        error: 'Cấu hình tiêu chí đánh giá đã thay đổi. Vui lòng tải lại trang để cập nhật.',
      };
    }

    const payloadInput: EvaluationRoundPayloadInput = {
      scores,
      notes,
      selectedLevelIndexes,
      comment,
      isSubmit,
    };

    const validationResult = validateEvaluationRoundPayload(
      payloadInput,
      criteriaResult.rules,
      {
        isSubmitOverride: isSubmit,
        renderedRules: configVersions?.renderedRules,
      }
    );

    if (!validationResult.ok) {
      return { success: false, error: validationResult.error };
    }

    const canonical = validationResult.data;

    // 2. Tính toán điểm và grade theo đúng snapshot authoritative đã load.
    const gradeSnapshot = await ensureServerGradeBands();

    // Validate client's rendered grade version against authoritative version
    if (!configVersions?.gradeConfigVersionId) {
      return {
        success: false,
        error: 'Thiếu phiên bản thang điểm. Vui lòng tải lại trang trước khi gửi.',
      };
    }
    if (
      configVersions?.gradeConfigVersionId &&
      configVersions.gradeConfigVersionId !== gradeSnapshot.versionId
    ) {
      return {
        success: false,
        error: 'Cấu hình thang điểm đã thay đổi. Vui lòng tải lại trang để cập nhật.',
      };
    }
    if (!Array.isArray(configVersions.renderedRules)) {
      return { success: false, error: 'Thiếu snapshot tiêu chí đã render để lưu đánh giá.' };
    }

    const tempRound: Partial<EvaluationRound> = {
      scores: canonical.scores,
      evaluatorRole: evaluation.employeeRole,
    };
    
    const { totalScore, grade } = calculateRoundScore(tempRound as EvaluationRound, gradeSnapshot);
    const criteriaVersionId = configVersions.criteriaConfigVersionId;
    const gradeVersionId = configVersions.gradeConfigVersionId;

    const now = new Date().toISOString();
    const nextStep = canonical.isSubmit ? getNextEvaluationStep(evaluation.employeeRole, round) : null;
    let nextEvaluator = null;

    if (nextStep && !nextStep.isFinal && nextStep.evaluator) {
      const subject: EvaluationSubject = {
        id: evaluation.employeeId,
        role: evaluation.employeeRole,
        teamId: evaluation.teamId,
      };
      
      nextEvaluator = await resolveEvaluatorFromDb(nextStep.evaluator, subject);

      if (!nextEvaluator) {
        return {
          success: false,
          error: `Không tìm thấy ${nextStep.evaluator} phù hợp cho vòng đánh giá tiếp theo.`
        };
      }
    }
    
    const transactionalRpcEnabled = process.env.KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC === 'true';
    if (!transactionalRpcEnabled) {
      return { success: false, error: 'Transactional evaluation RPC is required; legacy fallback is disabled.' };
    }

    // 2.5. Transactional RPC candidate branch
    if (transactionalRpcEnabled) {
      const rpcArgs = buildEvaluationRoundTransactionRpcArgs({
        evaluationId,
        round,
        actorId,
        canonical,
        totalScore,
        grade,
        submittedAt: now,
        nextStep,
        nextEvaluator,
        criteriaConfigVersionId: criteriaVersionId,
        gradeConfigVersionId: gradeVersionId,
      });

      const { data: rpcData, error: rpcError } = await (supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: unknown }>)(
        'save_evaluation_round_transaction_active_only',
        rpcArgs as unknown as Record<string, unknown>
      );

      if (rpcError) {
        return {
          success: false,
          error: toClientError(rpcError, 'Lỗi cập nhật kết quả đánh giá (giao dịch thất bại).'),
        };
      }

      const rpcResult: unknown = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      const expectedStatus = deriveExpectedAggregateStatus(round, isSubmit, nextStep?.status);
      if (
        !expectedStatus ||
        !isEvaluationTransactionResult(rpcResult) ||
        rpcResult.evaluation_id !== evaluationId ||
        (authGuard.roundId && rpcResult.round_id !== authGuard.roundId) ||
        (!isSubmit && rpcResult.next_round_id !== null) ||
        rpcResult.final_status !== expectedStatus
      ) {
        return {
          success: false,
          error: 'Lỗi cập nhật kết quả đánh giá: phản hồi giao dịch không hợp lệ.',
        };
      }

      revalidatePath(`/evaluations/${evaluationId}`);
      if (isSubmit) {
        revalidateTag('dashboard-data', 'default');
        revalidateTag('report-aggregation', 'default');
        await logAudit(
          auth.user,
          nextStep?.isFinal ? 'APPROVE_EVALUATION' : 'SUBMIT_EVALUATION',
          'evaluation',
          evaluationId,
          { round, grade, score: totalScore }
        );
      }
      return { success: true };
    }

    // 3. Legacy fallback is unreachable after the fail-closed gate above.
    // Check current round record and enforce exact idempotent readbacks
    const { data: checkRound, error: checkRoundError } = await supabaseAdmin
      .from('evaluation_rounds')
      .select('id, status, submitted_at, evaluator_id')
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .maybeSingle();

    if (checkRoundError || !checkRound) {
      return { success: false, error: 'Không tìm thấy vòng đánh giá hoặc bạn không có quyền.' };
    }

    if (checkRound.evaluator_id !== actorId) {
      return { success: false, error: 'Bạn không có quyền đánh giá vòng này.' };
    }

    // Locked / submitted round handling:
    // Retries are exact idempotent readbacks only; they must never downgrade progressed state.
    if (checkRound.status === 'Submitted' || checkRound.submitted_at !== null) {
      if (!isSubmit) {
        return { success: false, error: 'Vòng đánh giá đã khóa.' };
      }
      // Exact idempotent submit readback: check if evaluation has already progressed
      const { data: latestEval } = await supabaseAdmin
        .from('evaluations')
        .select('status, current_round')
        .eq('id', evaluationId)
        .maybeSingle();

      if (
        latestEval &&
        ((latestEval.current_round !== null && latestEval.current_round > round) ||
          (nextStep?.isFinal && latestEval.status === (nextStep?.status ?? 'Approved')))
      ) {
        return { success: true }; // Idempotent: already progressed
      }

      return {
        success: false,
        error: 'Vòng đánh giá đã nộp trước đó nhưng trạng thái chưa đồng bộ. Vui lòng tải lại trang.',
      };
    }

    // Monotonic round invariant: must be editing current round
    if (evalInfo.current_round !== round) {
      return {
        success: false,
        error: `Đánh giá đang ở vòng ${evalInfo.current_round}, không thể thao tác trên vòng ${round}.`,
      };
    }

    // Previous round submit check for round > 1
    if (round > 1) {
      const { data: prevRoundData } = await supabaseAdmin
        .from('evaluation_rounds')
        .select('status, submitted_at')
        .eq('evaluation_id', evaluationId)
        .eq('round', round - 1)
        .maybeSingle();

      if (!prevRoundData || prevRoundData.status !== 'Submitted' || !prevRoundData.submitted_at) {
        return {
          success: false,
          error: `Vòng ${round} yêu cầu vòng ${round - 1} phải được hoàn tất và nộp trước.`,
        };
      }
    }

    const composedNotes = composeRoundNotes(canonical.notes, canonical.selectedLevelIndexes);
    const updateData: UpdateRound = {
      scores: canonical.scores,
      notes: composedNotes,
      comment: canonical.comment,
      total_score: totalScore,
      grade: grade,
      status: canonical.isSubmit ? 'Submitted' : 'Draft',
      criteria_config_version_id: criteriaVersionId,
      grade_config_version_id: gradeVersionId,
    };

    if (canonical.isSubmit) {
      updateData.submitted_at = now;
    }

    // Atomic update with affected-row check
    const { data: updatedRounds, error: rError } = await supabaseAdmin
      .from('evaluation_rounds')
      .update(updateData)
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .eq('evaluator_id', actorId)
      .eq('status', checkRound.status)
      .select('id');

    if (rError || !updatedRounds || updatedRounds.length !== 1) {
      return {
        success: false,
        error: toClientError(rError, 'Lỗi cập nhật kết quả. Dữ liệu đã thay đổi, vui lòng thử lại.'),
      };
    }

    // Update evaluation status for Draft
    if (!isSubmit && evalInfo.status === 'NotStarted') {
      await supabaseAdmin
        .from('evaluations')
        .update({ status: 'Draft', updated_at: now })
        .eq('id', evaluationId)
        .eq('status', 'NotStarted');
    }

    // Submit flow: advance round or complete evaluation
    if (isSubmit && nextStep) {
      let submitFlowError: string | null = null;

      if (!nextStep.isFinal && nextEvaluator) {
        const nextRoundData: InsertRound = {
          evaluation_id: evaluationId,
          round: nextStep.round,
          evaluator_id: nextEvaluator.id,
          evaluator_role: nextEvaluator.role,
          scores: {},
          notes: {},
          total_score: 0,
          grade: 'Pending',
          status: 'NotStarted',
          criteria_config_version_id: criteriaVersionId,
          grade_config_version_id: gradeVersionId,
          created_at: now,
        };

        const { data: existingNextRound } = await supabaseAdmin
          .from('evaluation_rounds')
          .select('id')
          .eq('evaluation_id', evaluationId)
          .eq('round', nextStep.round)
          .maybeSingle();

        if (!existingNextRound) {
          const { error: nextRoundError } = await supabaseAdmin
            .from('evaluation_rounds')
            .insert(nextRoundData);

          if (nextRoundError) {
            submitFlowError = toClientError(nextRoundError, 'Lỗi tạo vòng đánh giá tiếp theo.');
          }
        }
      }

      if (!submitFlowError) {
        const evalUpdate: UpdateEvaluation = {
          status: nextStep.status,
          current_round: nextStep.round,
          return_note: null,
          updated_at: now,
        };

        if (nextStep.isFinal) {
          evalUpdate.final_grade = grade;
          evalUpdate.final_score = totalScore;
        }

        const { data: updatedEval, error: eError } = await supabaseAdmin
          .from('evaluations')
          .update(evalUpdate)
          .eq('id', evaluationId)
          .eq('current_round', round)
          .select('id');

        if (eError || !updatedEval || updatedEval.length !== 1) {
          submitFlowError = toClientError(eError, 'Lỗi cập nhật trạng thái đánh giá.');
        }
      }

      if (submitFlowError) {
        // Rollback current round on submit failure
        if (!nextStep.isFinal) {
          await supabaseAdmin
            .from('evaluation_rounds')
            .delete()
            .eq('evaluation_id', evaluationId)
            .eq('round', nextStep.round);
        }
        await supabaseAdmin
          .from('evaluation_rounds')
          .update({ submitted_at: null, status: 'Draft' })
          .eq('evaluation_id', evaluationId)
          .eq('round', round)
          .eq('evaluator_id', actorId);

        return { success: false, error: submitFlowError };
      }
    }

    revalidatePath(`/evaluations/${evaluationId}`);
    if (isSubmit) {
      revalidateTag('dashboard-data', 'default');
      revalidateTag('report-aggregation', 'default');
      await logAudit(
        auth.user,
        nextStep?.isFinal ? 'APPROVE_EVALUATION' : 'SUBMIT_EVALUATION',
        'evaluation',
        evaluationId,
        { round, grade, score: totalScore }
      );
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định. Vui lòng thử lại.') };
  }
}

/**
 * Khởi tạo bản nháp (Draft) cho Round khi evaluator mở lần đầu (first-open).
 * Chỉ cập nhật khi round đang ở status 'NotStarted' và đúng evaluator_id.
 * Nếu đã được khởi tạo hoặc đã bị khóa, trả về kết quả skipped lành tính mà không ghi đè.
 */
export async function initializeEvaluationRoundDraft(
  evaluationId: string,
  round: RoundNumber,
  scores: Record<string, number>,
  notes: Record<string, string>,
  selectedLevelIndexes: SelectedLevelIndexes,
  comment: string,
  configVersions?: SaveEvaluationRoundConfigOptions
): Promise<{
  success: boolean;
  initialized?: boolean;
  skipped?: 'already_initialized' | 'locked';
  error?: string;
}> {
  if (process.env.KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC !== 'true') {
    return { success: false, error: 'Transactional evaluation RPC is not enabled.' };
  }

  const auth = await requireAuth();
  if (auth.error !== null) return { success: false, error: auth.error };
  const actorId = auth.user.id;

  try {
    // P96T05: Closed-period write firewall — fail closed before round/evaluation updates
    const periodGuard = await assertEvaluationPeriodActiveForEvaluation(evaluationId);
    if (!periodGuard.success) {
      return { success: false, error: periodGuard.error };
    }

    const { data: evalInfo, error: evalInfoError } = await supabaseAdmin
      .from('evaluations')
      .select('employee_id, employee_role, team_id, status, current_round')
      .eq('id', evaluationId)
      .single();

    if (evalInfoError || !evalInfo) {
      return { success: false, error: 'Không tìm thấy thông tin đánh giá.' };
    }

    // P103M1T03: Preflight current authorization guard
    const authGuard = await assertCurrentRoundWriteAuthorization(
      actorId,
      evaluationId,
      round,
      evalInfo,
      { isInit: true }
    );
    if (!authGuard.success) {
      return { success: false, error: authGuard.error };
    }

    const evaluation: EvaluationSnapshot = {
      employeeId: evalInfo.employee_id,
      employeeRole: parseRole(evalInfo.employee_role),
      teamId: evalInfo.team_id,
    };

    const criteriaResult = await loadAuthoritativeCriteriaForRole(evaluation.employeeRole);
    if (!criteriaResult.success) {
      return { success: false, error: criteriaResult.error };
    }

    if (
      configVersions?.criteriaConfigVersionId &&
      configVersions.criteriaConfigVersionId !== criteriaResult.versionId
    ) {
      return {
        success: false,
        error: 'Cấu hình tiêu chí đánh giá đã thay đổi. Vui lòng tải lại trang.',
      };
    }
    if (!configVersions?.criteriaConfigVersionId || !Array.isArray(configVersions.renderedRules)) {
      return { success: false, error: 'Thiếu snapshot tiêu chí và phiên bản cấu hình để khởi tạo.' };
    }

    const payloadInput: EvaluationRoundPayloadInput = {
      scores,
      notes,
      selectedLevelIndexes,
      comment,
      isSubmit: false,
    };

    const validationResult = validateEvaluationRoundPayload(
      payloadInput,
      criteriaResult.rules,
      {
        isSubmitOverride: false,
        renderedRules: configVersions?.renderedRules,
      }
    );

    if (!validationResult.ok) {
      return { success: false, error: validationResult.error };
    }

    const canonical = validationResult.data;
    const gradeSnapshot = await ensureServerGradeBands();

    if (
      configVersions?.gradeConfigVersionId &&
      configVersions.gradeConfigVersionId !== gradeSnapshot.versionId
    ) {
      return {
        success: false,
        error: 'Cấu hình thang điểm đã thay đổi. Vui lòng tải lại trang.',
      };
    }
    if (!configVersions.gradeConfigVersionId) {
      return { success: false, error: 'Thiếu phiên bản thang điểm để khởi tạo.' };
    }

    const tempRound: Partial<EvaluationRound> = {
      scores: canonical.scores,
      evaluatorRole: evaluation.employeeRole,
    };

    const { totalScore, grade } = calculateRoundScore(tempRound as EvaluationRound, gradeSnapshot);
    const criteriaVersionId = configVersions.criteriaConfigVersionId;
    const gradeVersionId = configVersions.gradeConfigVersionId;

    const now = new Date().toISOString();

    const rpcArgs = buildEvaluationRoundTransactionRpcArgs({
      evaluationId,
      round,
      actorId,
      canonical: {
        scores: canonical.scores,
        notes: canonical.notes,
        selectedLevelIndexes: canonical.selectedLevelIndexes,
        comment: canonical.comment,
        isSubmit: null,
      },
      totalScore,
      grade,
      submittedAt: now,
      nextStep: null,
      nextEvaluator: null,
      criteriaConfigVersionId: criteriaVersionId,
      gradeConfigVersionId: gradeVersionId,
    });
    const { data: rpcData, error: rError } = await supabaseAdmin.rpc(
      'save_evaluation_round_transaction_active_only',
      rpcArgs
    );
    if (rError) {
      return { success: false, error: toClientError(rError, 'Lỗi khởi tạo bản nháp. Vui lòng thử lại.') };
    }
    const rpcResult: unknown = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (
      !isEvaluationTransactionResult(rpcResult) ||
      rpcResult.evaluation_id !== evaluationId ||
      (authGuard.roundId && rpcResult.round_id !== authGuard.roundId) ||
      rpcResult.next_round_id !== null ||
      !VALID_EVALUATION_STATUSES.has(rpcResult.final_status)
    ) {
      return { success: false, error: 'Không nhận được kết quả khởi tạo bản nháp hợp lệ.' };
    }

    if (
      authGuard.isLocked ||
      authGuard.roundStatus === 'Submitted' ||
      rpcResult.final_status === 'Approved'
    ) {
      return { success: true, initialized: false, skipped: 'locked' };
    }
    if (authGuard.roundStatus === 'Draft') {
      return { success: true, initialized: false, skipped: 'already_initialized' };
    }
    if (round > 1 && rpcResult.final_status === evalInfo.status) {
      return { success: true, initialized: false, skipped: 'already_initialized' };
    }

    revalidatePath(`/evaluations/${evaluationId}`);
    return { success: true, initialized: rpcResult.final_status === 'Draft' };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định. Vui lòng thử lại.') };
  }
}

/**
 * Trả lại kết quả đánh giá (Return Evaluation Round).
 * Case B: Manager round 1 Approved -> trả về Draft để chỉnh sửa lại.
 * Case A: Round > 1 -> reset round hiện tại về NotStarted và mở khóa round trước về Draft.
 * Giao dịch chuyển trạng thái ngược có kiểm soát và kiểm tra số dòng bị ảnh hưởng.
 */
export async function returnEvaluationRound(
  evaluationId: string,
  round: RoundNumber,
  reason: string
) {
  if (!reason || !reason.trim()) {
    return { success: false, error: 'Lý do trả lại không được để trống.' };
  }

  const auth = await requireAuth();
  if (auth.error !== null) return { success: false, error: auth.error };
  const actorId = auth.user.id;

  try {
    // P96T05: Closed-period write firewall — fail closed before any update
    const periodGuard = await assertEvaluationPeriodActiveForEvaluation(evaluationId);
    if (!periodGuard.success) {
      return { success: false, error: periodGuard.error };
    }

    const { data: evalInfo, error: evalInfoError } = await supabaseAdmin
      .from('evaluations')
      .select('employee_id, employee_role, team_id, status, current_round')
      .eq('id', evaluationId)
      .single();

    if (evalInfoError || !evalInfo) {
      return { success: false, error: 'Không tìm thấy thông tin đánh giá.' };
    }

    // P103M1T03: Preflight current authorization guard
    const authGuard = await assertCurrentRoundReturnAuthorization(
      actorId,
      evaluationId,
      round,
      evalInfo
    );
    if (!authGuard.success) {
      return { success: false, error: authGuard.error };
    }

    const trimmedReason = reason.trim();

    const transactionalRpcEnabled = process.env.KURABE_ENABLE_TRANSACTIONAL_EVALUATION_RPC === 'true';
    if (!transactionalRpcEnabled) {
      return { success: false, error: 'Transactional evaluation RPC is required; legacy fallback is disabled.' };
    }

    // Transactional return RPC branch
    if (transactionalRpcEnabled) {
      const { data: rpcData, error: rpcError } = await (supabaseAdmin.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>
      ) => Promise<{ data: unknown; error: unknown }>)(
        'return_evaluation_round_transaction',
        {
          p_evaluation_id: evaluationId,
          p_round: round,
          p_actor_id: actorId,
          p_reason: trimmedReason,
        }
      );

      if (rpcError) {
        return {
          success: false,
          error: toClientError(rpcError, 'Lỗi trả lại đánh giá (giao dịch thất bại).'),
        };
      }

      const rpcResult = Array.isArray(rpcData) ? rpcData[0] : null;
      if (
        !rpcResult ||
        typeof rpcResult !== 'object' ||
        (rpcResult as Record<string, unknown>).evaluation_id !== evaluationId ||
        typeof (rpcResult as Record<string, unknown>).restored_round !== 'number' ||
        typeof (rpcResult as Record<string, unknown>).restored_status !== 'string'
      ) {
        return { success: false, error: 'Lỗi trả lại đánh giá: phản hồi giao dịch không hợp lệ.' };
      }

      await logAudit(auth.user, 'RETURN_EVALUATION', 'evaluation', evaluationId, {
        round,
        reason: trimmedReason,
      });

      revalidatePath(`/evaluations/${evaluationId}`);
      revalidateTag('dashboard-data', 'default');
      revalidateTag('report-aggregation', 'default');
      return { success: true };
    }

    // Guarded sequential return branch (atomic affected-row checks, explicit backwards transitions)
    const { data: roundsData, error: roundsError } = await supabaseAdmin
      .from('evaluation_rounds')
      .select('*')
      .eq('evaluation_id', evaluationId);

    if (roundsError || !roundsData) {
      return { success: false, error: 'Lỗi tải thông tin các vòng đánh giá.' };
    }

    const currentRoundRecord = roundsData.find((r) => r.round === round);
    const prevRound = parseRoundNumber(round - 1);
    const prevRoundRecord = roundsData.find((r) => r.round === prevRound);

    const flow = getEvaluationFlow(parseRole(evalInfo.employee_role));
    const flowStep = flow.find((step) => step.round === round);
    const flowEvaluator = flowStep?.evaluator ?? null;

    const check = canReturnEvaluation({
      round,
      actorId,
      employeeId: evalInfo.employee_id,
      actorRole: auth.user.role,
      evaluationStatus: parseEvalStatus(evalInfo.status),
      currentRound: parseRoundNumber(evalInfo.current_round),
      currentRoundEvaluatorId: currentRoundRecord?.evaluator_id ?? null,
      currentRoundSubmitted: Boolean(currentRoundRecord?.submitted_at),
      prevRoundExists: Boolean(prevRoundRecord),
      prevRoundSubmitted: Boolean(prevRoundRecord?.submitted_at),
      flowEvaluator,
    });

    if (!check.ok) {
      return { success: false, error: check.error ?? 'Không thể trả lại đánh giá.' };
    }

    const now = new Date().toISOString();

    // Case B: round === 1 (Manager tự đánh giá đã Approved)
    if (round === 1) {
      const { data: updatedEval, error: evalUpError } = await supabaseAdmin
        .from('evaluations')
        .update({
          current_round: 1,
          status: 'Draft',
          final_grade: null,
          final_score: null,
          return_note: trimmedReason,
          updated_at: now,
        })
        .eq('id', evaluationId)
        .eq('status', 'Approved')
        .eq('current_round', 1)
        .select('id');

      if (evalUpError || !updatedEval || updatedEval.length !== 1) {
        return { success: false, error: 'Báo cáo không ở trạng thái Approved.' };
      }

      const { data: updatedRound, error: roundUpError } = await supabaseAdmin
        .from('evaluation_rounds')
        .update({
          status: 'Draft',
          submitted_at: null,
        })
        .eq('evaluation_id', evaluationId)
        .eq('round', 1)
        .not('submitted_at', 'is', null)
        .select('id');

      if (roundUpError || !updatedRound || updatedRound.length !== 1) {
        // Rollback evaluations về Approved
        await supabaseAdmin
          .from('evaluations')
          .update({
            status: 'Approved',
            return_note: null,
            updated_at: now,
          })
          .eq('id', evaluationId);

        return { success: false, error: 'Không thể mở khóa vòng 1.' };
      }

      await logAudit(auth.user, 'RETURN_EVALUATION', 'evaluation', evaluationId, {
        round,
        reason: trimmedReason,
      });

      revalidatePath(`/evaluations/${evaluationId}`);
      revalidateTag('dashboard-data', 'default');
      revalidateTag('report-aggregation', 'default');
      return { success: true };
    }

    // Case A: round > 1
    const currentRoundSnapshot: UpdateRound = {
      scores: currentRoundRecord?.scores ?? {},
      notes: currentRoundRecord?.notes ?? {},
      comment: currentRoundRecord?.comment ?? null,
      total_score: currentRoundRecord?.total_score ?? 0,
      grade: currentRoundRecord?.grade ? parseGrade(currentRoundRecord.grade) : 'Pending',
      status: currentRoundRecord?.status ?? 'NotStarted',
      submitted_at: currentRoundRecord?.submitted_at ?? null,
    };

    // (2) RESET round hiện tại (affected-row check: exactly 1 row)
    const resetData = resetRoundFields();
    const { data: resetResult, error: resetError } = await supabaseAdmin
      .from('evaluation_rounds')
      .update(resetData)
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .eq('evaluator_id', actorId)
      .is('submitted_at', null)
      .select('id');

    if (resetError || !resetResult || resetResult.length !== 1) {
      return { success: false, error: 'Vòng đánh giá đã khóa hoặc không thể đặt lại.' };
    }

    // (3) Unlock round - 1 (affected-row check: exactly 1 row)
    const { data: unlockResult, error: unlockError } = await supabaseAdmin
      .from('evaluation_rounds')
      .update({
        status: 'Draft',
        submitted_at: null,
      })
      .eq('evaluation_id', evaluationId)
      .eq('round', prevRound)
      .not('submitted_at', 'is', null)
      .select('id');

    if (unlockError || !unlockResult || unlockResult.length !== 1) {
      // Rollback round hiện tại về snapshot
      await supabaseAdmin
        .from('evaluation_rounds')
        .update(currentRoundSnapshot)
        .eq('evaluation_id', evaluationId)
        .eq('round', round)
        .eq('evaluator_id', actorId);

      return { success: false, error: 'Vòng trước không thể mở khóa.' };
    }

    // (4) Update evaluations (affected-row check: exactly 1 row)
    const newStatus = nextStatusAfterReturn(round);
    const { data: updateEvalResult, error: updateEvalError } = await supabaseAdmin
      .from('evaluations')
      .update({
        current_round: prevRound,
        status: newStatus,
        final_grade: null,
        final_score: null,
        return_note: trimmedReason,
        updated_at: now,
      })
      .eq('id', evaluationId)
      .eq('current_round', round)
      .select('id');

    if (updateEvalError || !updateEvalResult || updateEvalResult.length !== 1) {
      // Rollback round trước và round hiện tại
      if (prevRoundRecord) {
        await supabaseAdmin
          .from('evaluation_rounds')
          .update({
            status: prevRoundRecord.status,
            submitted_at: prevRoundRecord.submitted_at,
          })
          .eq('evaluation_id', evaluationId)
          .eq('round', prevRound);
      }
      await supabaseAdmin
        .from('evaluation_rounds')
        .update(currentRoundSnapshot)
        .eq('evaluation_id', evaluationId)
        .eq('round', round)
        .eq('evaluator_id', actorId);

      return { success: false, error: 'Lỗi cập nhật trạng thái đánh giá.' };
    }

    // (5) Log audit + revalidate
    await logAudit(auth.user, 'RETURN_EVALUATION', 'evaluation', evaluationId, {
      round,
      reason: trimmedReason,
    });

    revalidatePath(`/evaluations/${evaluationId}`);
    revalidateTag('dashboard-data', 'default');
    revalidateTag('report-aggregation', 'default');

    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định. Vui lòng thử lại.') };
  }
}
