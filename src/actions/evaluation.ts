'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { calculateRoundScore } from '@/lib/scoring';
import { ensureServerGradeBands } from '@/lib/grade-bands-server';
import { toClientError } from '@/lib/errors';
import { RoundNumber, EvaluationRound, Role } from '@/types';
import {
  getEvaluationFlow,
  getNextEvaluationStep,
  isLeaderGradingRole,
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

type UpdateRound = Database['public']['Tables']['evaluation_rounds']['Update'];
type UpdateEvaluation = Database['public']['Tables']['evaluations']['Update'];
type InsertRound = Database['public']['Tables']['evaluation_rounds']['Insert'];

interface EvaluationSnapshot {
  employeeId: string;
  employeeRole: Role;
  teamId: string | null;
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
  isSubmit: boolean = false
) {
  const auth = await requireAuth();
  if (auth.error !== null) return { success: false, error: auth.error };
  const actorId = auth.user.id;

  try {
    const { data: evalInfo, error: evalInfoError } = await supabaseAdmin
      .from('evaluations')
      .select('employee_id, employee_role, team_id, status')
      .eq('id', evaluationId)
      .single();

    if (evalInfoError || !evalInfo) {
      return { success: false, error: 'Không tìm thấy thông tin đánh giá.' };
    }

    const evaluation: EvaluationSnapshot = {
      employeeId: evalInfo.employee_id,
      employeeRole: parseRole(evalInfo.employee_role),
      teamId: evalInfo.team_id,
    };

    // 2. Tính toán điểm và grade theo role người được đánh giá
    // Nạp thang điểm từ DB trước khi tính — nếu không server dùng fallback hardcode cũ
    await ensureServerGradeBands();

    const tempRound: Partial<EvaluationRound> = {
      scores,
      evaluatorRole: isLeaderGradingRole(evaluation.employeeRole) ? 'Leader' : 'Employee'
    };
    
    const { totalScore, grade } = calculateRoundScore(tempRound as EvaluationRound);

    const now = new Date().toISOString();
    const nextStep = isSubmit ? getNextEvaluationStep(evaluation.employeeRole, round) : null;
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
    
    // 3. Cập nhật record round (Atomic)
    const composedNotes = composeRoundNotes(notes, selectedLevelIndexes);
    const updateData: UpdateRound = {
      scores,
      notes: composedNotes,
      comment,
      total_score: totalScore,
      grade: grade,
      status: isSubmit ? 'Submitted' : 'Draft'
    };

    if (isSubmit) {
      updateData.submitted_at = now;
    }

    const roundQuery = supabaseAdmin
      .from('evaluation_rounds')
      .update(updateData)
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .eq('evaluator_id', actorId)
      .select('id');

    if (isSubmit) {
      roundQuery.is('submitted_at', null);
    } else {
      roundQuery.neq('status', 'Submitted');
    }

    const { data: updatedRounds, error: rError } = await roundQuery;

    if (rError) {
      return { success: false, error: toClientError(rError, 'Lỗi cập nhật kết quả. Vui lòng thử lại.') };
    }

    // Nếu không có row nào được update, có nghĩa là record đã được submit (lock) hoặc không tồn tại hoặc sai evaluator
    if (!updatedRounds || updatedRounds.length === 0) {
      const { data: checkRound } = await supabaseAdmin
        .from('evaluation_rounds')
        .select('status')
        .eq('evaluation_id', evaluationId)
        .eq('round', round)
        .eq('evaluator_id', actorId)
        .maybeSingle();

      if (!checkRound) {
        return { success: false, error: 'Không tìm thấy vòng đánh giá hoặc bạn không có quyền.' };
      }
      
      if (isSubmit && checkRound.status === 'Submitted') {
        // Self-heal: nếu evaluation bị kẹt status (data cũ), tự sửa khi bấm nộp lại (Phase 79)
        if (nextStep) {
          const { data: stuckStatus } = await supabaseAdmin
            .from('evaluations')
            .select('status')
            .eq('id', evaluationId)
            .maybeSingle();
          if (stuckStatus && stuckStatus.status !== nextStep.status) {
            await supabaseAdmin
              .from('evaluations')
              .update({ status: nextStep.status, updated_at: now })
              .eq('id', evaluationId);
          }
        }
        return { success: true }; // Idempotent: đã submit trước đó
      }
      
      return { success: false, error: 'Vòng đánh giá đã khóa.' };
    }

    // Cập nhật trạng thái evaluation nếu là Draft và đang ở NotStarted
    if (!isSubmit && evalInfo.status === 'NotStarted') {
      await supabaseAdmin
        .from('evaluations')
        .update({ status: 'Draft', updated_at: now })
        .eq('id', evaluationId)
        .eq('status', 'NotStarted');
    }

    // 4. Nếu là Submit, xử lý logic chuyển Round tiếp theo hoặc kết thúc Evaluation
    if (isSubmit && nextStep) {
      let submitFlowError: string | null = null;

      // 5. Nếu chưa phải round cuối, tạo record cho round tiếp theo trước khi advance evaluation
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
          created_at: now
        };

        const { data: existingNextRound, error: existingNextRoundError } = await supabaseAdmin
          .from('evaluation_rounds')
          .select('id')
          .eq('evaluation_id', evaluationId)
          .eq('round', nextStep.round)
          .maybeSingle();

        if (existingNextRoundError) {
          submitFlowError = toClientError(existingNextRoundError, 'Lỗi kiểm tra vòng đánh giá tiếp theo. Vui lòng thử lại.');
        } else if (!existingNextRound) {
          const { error: nextRoundError } = await supabaseAdmin
            .from('evaluation_rounds')
            .insert(nextRoundData);

          if (nextRoundError) {
            submitFlowError = toClientError(nextRoundError, 'Lỗi tạo vòng đánh giá tiếp theo. Vui lòng thử lại.');
          }
        }
      }

      if (!submitFlowError) {
        const evalUpdate: UpdateEvaluation = {
          status: nextStep.status,
          current_round: nextStep.round,
          return_note: null,
          updated_at: now
        };

        if (nextStep.isFinal) {
          evalUpdate.final_grade = grade;
          evalUpdate.final_score = totalScore;
        }

        const { error: eError } = await supabaseAdmin
          .from('evaluations')
          .update(evalUpdate)
          .eq('id', evaluationId);

        if (eError) {
          submitFlowError = toClientError(eError, 'Lỗi cập nhật trạng thái đánh giá. Vui lòng thử lại.');
        } else {
          // Guard chống data kẹt: verify status sau update, retry 1 lần nếu lệch (Phase 79)
          const { data: statusCheck, error: statusCheckError } = await supabaseAdmin
            .from('evaluations')
            .select('status')
            .eq('id', evaluationId)
            .maybeSingle();
          if (statusCheckError) {
            console.error('[saveEvaluationRound] verify status fail', { id: evaluationId, error: statusCheckError.message });
          } else if (statusCheck && statusCheck.status !== evalUpdate.status) {
            const { error: retryError } = await supabaseAdmin
              .from('evaluations')
              .update({ status: evalUpdate.status, updated_at: now })
              .eq('id', evaluationId);
            if (retryError) {
              console.error('[saveEvaluationRound] status khong khop sau update (retry fail)', {
                id: evaluationId,
                expected: evalUpdate.status,
                actual: statusCheck.status,
              });
            } else {
              const { data: recheck } = await supabaseAdmin
                .from('evaluations')
                .select('status')
                .eq('id', evaluationId)
                .maybeSingle();
              if (recheck && recheck.status !== evalUpdate.status) {
                console.error('[saveEvaluationRound] status van lech sau retry', {
                  id: evaluationId,
                  expected: evalUpdate.status,
                  actual: recheck.status,
                });
              }
            }
          }
        }
      }

      if (submitFlowError) {
        // Best-effort rollback để giảm trạng thái nửa chừng nếu submit flow fail.
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
      // Data mới phải hiện ngay trên dashboard/reports (xóa cache data)
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
 * Trả lại kết quả đánh giá (Return Evaluation Round).
 * Case B: Manager round 1 Approved -> trả về Draft để chỉnh sửa lại.
 * Case A: Round > 1 -> reset round hiện tại về NotStarted và mở khóa round trước về Draft.
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
    const { data: evalInfo, error: evalInfoError } = await supabaseAdmin
      .from('evaluations')
      .select('id, employee_id, employee_role, current_round, status')
      .eq('id', evaluationId)
      .single();

    if (evalInfoError || !evalInfo) {
      return { success: false, error: 'Không tìm thấy thông tin đánh giá.' };
    }

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
    const trimmedReason = reason.trim();

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
        .select('id');

      if (evalUpError || !updatedEval || updatedEval.length === 0) {
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

      if (roundUpError || !updatedRound || updatedRound.length === 0) {
        // Best-effort rollback evaluations về Approved
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

    // (2) RESET round hiện tại
    const resetData = resetRoundFields();
    const { data: resetResult, error: resetError } = await supabaseAdmin
      .from('evaluation_rounds')
      .update(resetData)
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .eq('evaluator_id', actorId)
      .is('submitted_at', null)
      .select('id');

    if (resetError || !resetResult || resetResult.length === 0) {
      return { success: false, error: 'Vòng đánh giá đã khóa.' };
    }

    // (3) Unlock round - 1
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

    if (unlockError || !unlockResult || unlockResult.length === 0) {
      // Rollback round hiện tại về snapshot
      await supabaseAdmin
        .from('evaluation_rounds')
        .update(currentRoundSnapshot)
        .eq('evaluation_id', evaluationId)
        .eq('round', round)
        .eq('evaluator_id', actorId);

      return { success: false, error: 'Vòng trước không thể mở khóa.' };
    }

    // (4) Update evaluations
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

    if (updateEvalError || !updateEvalResult || updateEvalResult.length === 0) {
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

