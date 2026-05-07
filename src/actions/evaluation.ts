'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { calculateRoundScore } from '@/lib/scoring';
import { RoundNumber, EvaluationRound, Grade, EvalStatus, Role } from '@/types';
import { Database } from '@/types/database';

type UpdateRound = Database['public']['Tables']['evaluation_rounds']['Update'];
type UpdateEvaluation = Database['public']['Tables']['evaluations']['Update'];

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
    // 1. Lấy thông tin evaluator snapshot (role)
    const { data: user, error: uError } = await supabase
      .from('users')
      .select('role')
      .eq('id', evaluatorId)
      .single();

    if (uError || !user) {
      return { success: false, error: 'Không tìm thấy thông tin người đánh giá.' };
    }

    // 2. Tính toán điểm và grade
    const tempRound: Partial<EvaluationRound> = {
      scores,
      evaluatorRole: user.role as Role
    };
    
    const { totalScore, grade } = calculateRoundScore(tempRound as EvaluationRound);

    const now = new Date().toISOString();
    
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
      .eq('round', round);

    if (rError) {
      return { success: false, error: 'Lỗi cập nhật kết quả: ' + rError.message };
    }

    // 4. Nếu là Submit, xử lý logic chuyển Round tiếp theo hoặc kết thúc Evaluation
    if (isSubmit) {
      let nextStatus: EvalStatus = 'Draft';
      let nextRound: number = round;

      if (round === 1) {
        nextRound = 2;
        nextStatus = 'Submitted';
      } else if (round === 2) {
        nextRound = 3;
        nextStatus = 'Reviewed';
      } else if (round === 3) {
        nextStatus = 'Approved';
      }

      const evalUpdate: UpdateEvaluation = {
        status: nextStatus,
        current_round: nextRound,
        updated_at: now
      };

      if (nextStatus === 'Approved') {
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

      // 5. Nếu chưa phải round cuối, tạo record cho round tiếp theo
      if (nextRound > round) {
        // Round 2: Evaluator là Leader của team
        // Round 3: Evaluator là Manager (admin)
        let nextEvaluatorId = '';
        let nextEvaluatorRole = '';

        const { data: evalInfo } = await supabase
          .from('evaluations')
          .select('team_id')
          .eq('id', evaluationId)
          .single();

        if (nextRound === 2 && evalInfo) {
          const { data: leader } = await supabase
            .from('users')
            .select('id, role')
            .eq('team_id', evalInfo.team_id || '')
            .eq('role', 'Leader')
            .single();
          
          if (leader) {
            nextEvaluatorId = leader.id;
            nextEvaluatorRole = leader.role;
          }
        } else if (nextRound === 3) {
          const { data: manager } = await supabase
            .from('users')
            .select('id, role')
            .eq('role', 'Manager')
            .single();
          
          if (manager) {
            nextEvaluatorId = manager.id;
            nextEvaluatorRole = manager.role;
          }
        }

        await supabase
          .from('evaluation_rounds')
          .insert({
            evaluation_id: evaluationId,
            round: nextRound,
            evaluator_id: nextEvaluatorId || evaluatorId, // Fallback nếu không tìm thấy
            evaluator_role: nextEvaluatorRole || 'Leader',
            scores: {},
            notes: {},
            total_score: 0,
            grade: 'Pending',
            created_at: now
          });
      }
    }

    revalidatePath(`/evaluations/${evaluationId}`);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
