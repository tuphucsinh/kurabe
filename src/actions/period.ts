'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { Grade, Role } from '@/types';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import {
  resolveEvaluatorFromList,
  EvaluationSubject,
  EvaluatorResolution,
} from '@/lib/evaluator-resolver';
import { Database } from '@/types/database';

type InsertEvaluation = Database['public']['Tables']['evaluations']['Insert'];
type InsertRound = Database['public']['Tables']['evaluation_rounds']['Insert'];



function getMissingEvaluatorError(employeeId: string, selector: string, round: number): string {
  return `Không tìm thấy ${selector} phù hợp cho nhân viên ${employeeId} ở Round ${round}.`;
}

/**
 * Tạo một kỳ đánh giá mới và khởi tạo Evaluations cho TẤT CẢ nhân viên (Bao gồm cả Manager).
 */
export async function createEvaluationPeriod(year: number, managerId: string) {
  try {
    const now = new Date().toISOString();
    const periodName = `Kỳ ${year}`;

    // 1. Lấy danh sách TẤT CẢ nhân viên active
    const { data: employees, error: eError } = await supabase
      .from('users')
      .select('id, role, team_id')
      .eq('is_active', true);

    if (eError) {
      return { success: false, error: 'Lỗi lấy danh sách nhân viên: ' + eError.message };
    }

    const periodEmployees: EvaluationSubject[] = (employees || []).map(emp => ({
      id: emp.id,
      role: emp.role as Role,
      teamId: emp.team_id,
    }));
    const initialEvaluators = new Map<string, EvaluatorResolution>();

    // Validate evaluator round 1 trước khi tạo bất kỳ record nào.
    for (const employee of periodEmployees) {
      const [firstStep] = getEvaluationFlow(employee.role);
      const evaluator = resolveEvaluatorFromList(firstStep.evaluator, employee, periodEmployees);
      if (!evaluator) {
        return { success: false, error: getMissingEvaluatorError(employee.id, firstStep.evaluator, firstStep.round) };
      }
      initialEvaluators.set(employee.id, evaluator);
    }

    // 2. Tạo Evaluation Period
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

    if (periodEmployees.length === 0) {
      return { success: true, periodId: period.id, message: 'Kỳ đánh giá đã được tạo nhưng không có nhân viên nào để khởi tạo.' };
    }

    // 3. Chuẩn bị dữ liệu Evaluations (Bulk Insert)
    const evaluationsData: InsertEvaluation[] = periodEmployees.map((emp) => ({
      period_id: period.id,
      employee_id: emp.id,
      employee_role: emp.role,
      team_id: emp.teamId,
      status: 'NotStarted',
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

    const employeeMap = new Map(periodEmployees.map(emp => [emp.id, emp]));

    // 4. Khởi tạo Round 1 cho từng nhân viên
    const roundsData: InsertRound[] = [];
    
    for (const ev of insertedEvals) {
      const employee = employeeMap.get(ev.employee_id);
      if (!employee) continue;

      const flow = getEvaluationFlow(employee.role);
      const firstStep = flow[0]; // Chỉ lấy Round 1
      const evaluator = initialEvaluators.get(employee.id);
      if (!evaluator) continue;

      roundsData.push({
        evaluation_id: ev.id,
        round: firstStep.round,
        evaluator_id: evaluator.id,
        evaluator_role: evaluator.role,
        scores: {},
        notes: {},
        total_score: 0,
        grade: 'Pending' as Grade,
        status: 'NotStarted',
        created_at: now
      });
    }

    const { error: rError } = await supabase
      .from('evaluation_rounds')
      .insert(roundsData);

    if (rError) {
      return { success: false, error: 'Lỗi tạo các vòng đánh giá: ' + rError.message };
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

/**
 * Xóa một kỳ đánh giá và toàn bộ dữ liệu liên quan.
 */
export async function deleteEvaluationPeriod(periodId: string) {
  try {
    // 1. Xóa trực tiếp evaluations, DB đã config cascade sang evaluation_rounds và responses
    const { error: evalError } = await supabase
      .from('evaluations')
      .delete()
      .eq('period_id', periodId);

    if (evalError) return { success: false, error: evalError.message };

    // 3. Xóa period
    const { error } = await supabase
      .from('evaluation_periods')
      .delete()
      .eq('id', periodId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/periods');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
