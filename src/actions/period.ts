'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { Grade } from '@/types';
import { Database } from '@/types/database';

type InsertEvaluation = Database['public']['Tables']['evaluations']['Insert'];
type InsertRound = Database['public']['Tables']['evaluation_rounds']['Insert'];

/**
 * Tạo một kỳ đánh giá mới và khởi tạo Evaluations cho TẤT CẢ nhân viên (Bao gồm cả Manager).
 */
export async function createEvaluationPeriod(year: number, managerId: string) {
  try {
    const now = new Date().toISOString();
    const periodName = `Kỳ ${year}`;

    // 1. Tạo Evaluation Period
    const { data: period, error: pError } = await supabase
      .from('evaluation_periods')
      .insert({
        name: periodName,
        year,
        created_by: managerId,
        status: 'active',
        created_at: now
      })
      .select()
      .single();

    if (pError || !period) {
      return { success: false, error: 'Lỗi tạo kỳ đánh giá: ' + (pError?.message || 'Unknown error') };
    }

    // 2. Lấy danh sách TẤT CẢ nhân viên active
    const { data: employees, error: eError } = await supabase
      .from('users')
      .select('id, role, team_id')
      .eq('is_active', true);

    if (eError) {
      return { success: false, error: 'Lỗi lấy danh sách nhân viên: ' + eError.message };
    }

    if (!employees || employees.length === 0) {
      return { success: true, message: 'Kỳ đánh giá đã được tạo nhưng không có nhân viên nào để khởi tạo.' };
    }

    // 3. Chuẩn bị dữ liệu Evaluations (Bulk Insert)
    const evaluationsData: InsertEvaluation[] = employees.map((emp: { id: string; role: string; team_id: string | null }) => ({
      period_id: period.id,
      employee_id: emp.id,
      employee_role: emp.role,
      team_id: emp.team_id,
      status: 'Draft',
      current_round: 1,
      created_at: now,
      updated_at: now
    }));

    const { data: insertedEvals, error: evError } = await supabase
      .from('evaluations')
      .insert(evaluationsData)
      .select();

    if (evError || !insertedEvals) {
      return { success: false, error: 'Lỗi khởi tạo danh sách đánh giá: ' + evError.message };
    }

    // 4. Khởi tạo Round 1 cho mỗi Evaluation (Tự đánh giá)
    const roundsData: InsertRound[] = insertedEvals.map((ev: { id: string; employee_id: string; employee_role: string }) => ({
      evaluation_id: ev.id,
      round: 1,
      evaluator_id: ev.employee_id, // Round 1 thường là tự đánh giá
      evaluator_role: ev.employee_role,
      scores: {},
      notes: {},
      total_score: 0,
      grade: 'Pending' as Grade,
      created_at: now
    }));

    const { error: rError } = await supabase
      .from('evaluation_rounds')
      .insert(roundsData);

    if (rError) {
      console.error('Error creating initial rounds:', rError);
      // Có thể không return fail ở đây nếu Evaluation đã tạo xong
    }

    revalidatePath('/admin/periods');
    return { success: true, periodId: period.id };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Đóng một kỳ đánh giá.
 */
export async function closeEvaluationPeriod(periodId: string) {
  try {
    const { error } = await supabase
      .from('evaluation_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString()
      })
      .eq('id', periodId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/periods');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
