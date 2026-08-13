'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { calculateRoundScore } from '@/lib/scoring';
import { RoundNumber, EvaluationRound, Grade, Role } from '@/types';
import {
  getNextEvaluationStep,
  isLeaderGradingRole,
} from '@/lib/evaluation-workflow';
import {
  resolveEvaluatorFromDb,
  EvaluationSubject,
} from '@/lib/evaluator-resolver';
import { Database } from '@/types/database';
import { composeRoundNotes, SelectedLevelIndexes } from '@/lib/round-level-selection';

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
    const { data: evalInfo, error: evalInfoError } = await supabase
      .from('evaluations')
      .select('employee_id, employee_role, team_id, status')
      .eq('id', evaluationId)
      .single();

    if (evalInfoError || !evalInfo) {
      return { success: false, error: 'Không tìm thấy thông tin đánh giá.' };
    }

    const evaluation: EvaluationSnapshot = {
      employeeId: evalInfo.employee_id,
      employeeRole: evalInfo.employee_role as Role,
      teamId: evalInfo.team_id,
    };

    // 2. Tính toán điểm và grade theo role người được đánh giá
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
      grade: grade as Grade,
      status: isSubmit ? 'Submitted' : 'Draft'
    };

    if (isSubmit) {
      updateData.submitted_at = now;
    }

    const roundQuery = supabase
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
      return { success: false, error: 'Lỗi cập nhật kết quả: ' + rError.message };
    }

    // Nếu không có row nào được update, có nghĩa là record đã được submit (lock) hoặc không tồn tại hoặc sai evaluator
    if (!updatedRounds || updatedRounds.length === 0) {
      const { data: checkRound } = await supabase
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
        return { success: true }; // Idempotent: đã submit trước đó
      }
      
      return { success: false, error: 'Vòng đánh giá đã khóa.' };
    }

    // Cập nhật trạng thái evaluation nếu là Draft và đang ở NotStarted
    if (!isSubmit && evalInfo.status === 'NotStarted') {
      await supabase
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

        const { data: existingNextRound, error: existingNextRoundError } = await supabase
          .from('evaluation_rounds')
          .select('id')
          .eq('evaluation_id', evaluationId)
          .eq('round', nextStep.round)
          .maybeSingle();

        if (existingNextRoundError) {
          submitFlowError = 'Lỗi kiểm tra vòng đánh giá tiếp theo: ' + existingNextRoundError.message;
        } else if (!existingNextRound) {
          const { error: nextRoundError } = await supabase
            .from('evaluation_rounds')
            .insert(nextRoundData);

          if (nextRoundError) {
            submitFlowError = 'Lỗi tạo vòng đánh giá tiếp theo: ' + nextRoundError.message;
          }
        }
      }

      if (!submitFlowError) {
        const evalUpdate: UpdateEvaluation = {
          status: nextStep.status,
          current_round: nextStep.round,
          updated_at: now
        };

        if (nextStep.isFinal) {
          evalUpdate.final_grade = grade;
          evalUpdate.final_score = totalScore;
        }

        const { error: eError } = await supabase
          .from('evaluations')
          .update(evalUpdate)
          .eq('id', evaluationId);

        if (eError) {
          submitFlowError = 'Lỗi cập nhật trạng thái đánh giá: ' + eError.message;
        }
      }

      if (submitFlowError) {
        // Best-effort rollback để giảm trạng thái nửa chừng nếu submit flow fail.
        await supabase
          .from('evaluation_rounds')
          .update({ submitted_at: null, status: 'Draft' })
          .eq('evaluation_id', evaluationId)
          .eq('round', round)
          .eq('evaluator_id', actorId);

        return { success: false, error: submitFlowError };
      }
    }

    revalidatePath(`/evaluations/${evaluationId}`);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
