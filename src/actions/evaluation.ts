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
  evaluatorId: string,
  scores: Record<string, number>,
  notes: Record<string, string>,
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
      .select('submitted_at')
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .eq('evaluator_id', evaluatorId)
      .single();

    if (currentRoundError || !currentRound) {
      return { success: false, error: 'Không tìm thấy vòng đánh giá hiện tại.' };
    }

    if (isSubmit && currentRound.submitted_at) {
      return { success: true };
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
    const updateData: UpdateRound = {
      scores,
      notes,
      comment,
      total_score: totalScore,
      grade: grade as Grade
    };

    if (isSubmit) {
      updateData.submitted_at = now;
    }

    const { error: rError } = await supabase
      .from('evaluation_rounds')
      .update(updateData)
      .eq('evaluation_id', evaluationId)
      .eq('round', round)
      .eq('evaluator_id', evaluatorId);

    if (rError) {
      return { success: false, error: 'Lỗi cập nhật kết quả: ' + rError.message };
    }

    // 4. Nếu là Submit, xử lý logic chuyển Round tiếp theo hoặc kết thúc Evaluation
    if (isSubmit && nextStep) {
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
          created_at: now
        };

        const { error: nextRoundError } = await supabase
          .from('evaluation_rounds')
          .insert(nextRoundData);

        if (nextRoundError) {
          return { success: false, error: 'Lỗi tạo vòng đánh giá tiếp theo: ' + nextRoundError.message };
        }
      }

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
        return { success: false, error: 'Lỗi cập nhật trạng thái đánh giá: ' + eError.message };
      }
    }

    revalidatePath(`/evaluations/${evaluationId}`);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
