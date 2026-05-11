'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { calculateRoundScore } from '@/lib/scoring';
import { RoundNumber, EvaluationRound, Grade, Role } from '@/types';
import {
  EvaluatorSelector,
  getNextEvaluationStep,
  isLeaderGradingRole,
} from '@/lib/evaluation-workflow';
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

type EvaluatorResolution = {
  id: string;
  role: Role;
};

async function resolveEvaluator(
  selector: EvaluatorSelector,
  evaluation: EvaluationSnapshot
): Promise<EvaluatorResolution | null> {
  if (selector === 'SELF') {
    return { id: evaluation.employeeId, role: evaluation.employeeRole };
  }

  if (selector === 'SubLeader' && evaluation.teamId) {
    const { data: subLeader } = await supabase
      .from('users')
      .select('id, role')
      .eq('team_id', evaluation.teamId)
      .eq('role', 'SubLeader')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (subLeader) {
      return { id: subLeader.id, role: subLeader.role as Role };
    }
  }

  if (selector === 'Leader' && evaluation.teamId) {
    const { data: team } = await supabase
      .from('teams')
      .select('leader_id')
      .eq('id', evaluation.teamId)
      .single();

    if (team?.leader_id) {
      const { data: teamLeader } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', team.leader_id)
        .eq('role', 'Leader')
        .eq('is_active', true)
        .single();

      if (teamLeader) {
        return { id: teamLeader.id, role: teamLeader.role as Role };
      }
    }

    const { data: fallbackLeader } = await supabase
      .from('users')
      .select('id, role')
      .eq('team_id', evaluation.teamId)
      .eq('role', 'Leader')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (fallbackLeader) {
      return { id: fallbackLeader.id, role: fallbackLeader.role as Role };
    }
  }

  if (selector === 'Manager') {
    const { data: manager } = await supabase
      .from('users')
      .select('id, role')
      .eq('role', 'Manager')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (manager) {
      return { id: manager.id, role: manager.role as Role };
    }
  }

  return null;
}

/**
 * Lưu bản nháp (Draft) hoặc Gửi (Submit) kết quả đánh giá cho một Round.
 */
export async function saveEvaluationRound(
  evaluationId: string,
  round: RoundNumber,
  actorId: string,
  scores: Record<string, number>,
  notes: Record<string, string>,
  selectedLevelIndexes: SelectedLevelIndexes,
  comment: string,
  isSubmit: boolean = false
) {
  try {
    const { data: evalInfo, error: evalInfoError } = await supabase
      .from('evaluations')
      .select('employee_id, employee_role, team_id')
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

    const { data: currentRound, error: currentRoundError } = await supabase
      .from('evaluation_rounds')
      .select('submitted_at, status')
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .eq('evaluator_id', actorId)
      .single();

    if (currentRoundError || !currentRound) {
      return { success: false, error: 'Không tìm thấy vòng đánh giá hiện tại.' };
    }

    if (isSubmit && (currentRound.submitted_at || currentRound.status === 'Submitted')) {
      return { success: true };
    }

    if (!isSubmit && (currentRound.submitted_at || currentRound.status === 'Submitted')) {
      return { success: false, error: 'Vòng đánh giá đã khóa.' };
    }

    // 2. Tính toán điểm và grade theo role người được đánh giá
    const tempRound: Partial<EvaluationRound> = {
      scores,
      evaluatorRole: isLeaderGradingRole(evaluation.employeeRole) ? 'Leader' : 'Employee'
    };
    
    const { totalScore, grade } = calculateRoundScore(tempRound as EvaluationRound);

    const now = new Date().toISOString();
    const nextStep = isSubmit ? getNextEvaluationStep(evaluation.employeeRole, round) : null;
    let nextEvaluator: EvaluatorResolution | null = null;

    if (nextStep && !nextStep.isFinal && nextStep.evaluator) {
      nextEvaluator = await resolveEvaluator(nextStep.evaluator, evaluation);

      if (!nextEvaluator) {
        return {
          success: false,
          error: `Không tìm thấy ${nextStep.evaluator} phù hợp cho vòng đánh giá tiếp theo.`
        };
      }
    }
    
    // 3. Cập nhật record round
    const composedNotes = composeRoundNotes(notes, selectedLevelIndexes);
    const updateData: UpdateRound = {
      scores,
      notes: composedNotes,
      comment,
      total_score: totalScore,
      grade: grade as Grade
    };

    if (isSubmit) {
      updateData.submitted_at = now;
      updateData.status = 'Submitted';
    } else if (currentRound.status === 'NotStarted') {
      updateData.status = 'Draft';
    }

    const { error: rError } = await supabase
      .from('evaluation_rounds')
      .update(updateData)
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .eq('evaluator_id', actorId);

    if (rError) {
      return { success: false, error: 'Lỗi cập nhật kết quả: ' + rError.message };
    }

    if (!isSubmit) {
      const { data: evalState } = await supabase
        .from('evaluations')
        .select('status')
        .eq('id', evaluationId)
        .single();

      if (evalState?.status === 'NotStarted') {
        const { error: statusError } = await supabase
          .from('evaluations')
          .update({ status: 'Draft', updated_at: now })
          .eq('id', evaluationId);

        if (statusError) {
          return { success: false, error: 'Lỗi cập nhật trạng thái bản nháp: ' + statusError.message };
        }
      }
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
