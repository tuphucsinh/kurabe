'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { Grade, Role } from '@/types';
import { EvaluatorSelector, getEvaluationFlow } from '@/lib/evaluation-workflow';
import { Database } from '@/types/database';

type InsertEvaluation = Database['public']['Tables']['evaluations']['Insert'];
type InsertRound = Database['public']['Tables']['evaluation_rounds']['Insert'];

type PeriodEmployee = {
  id: string;
  role: Role;
  team_id: string | null;
};

type EvaluatorResolution = {
  id: string;
  role: Role;
};

function resolveInitialEvaluator(
  employee: PeriodEmployee,
  employees: PeriodEmployee[]
): EvaluatorResolution | null {
  const [firstStep] = getEvaluationFlow(employee.role);
  const selector = firstStep.evaluator;

  if (selector === 'SELF') {
    return { id: employee.id, role: employee.role };
  }

  if (selector === 'SubLeader') {
    if (!employee.team_id) return null;
    const subLeader = employees.find(candidate =>
      candidate.team_id === employee.team_id && candidate.role === 'SubLeader'
    );
    return subLeader ? { id: subLeader.id, role: subLeader.role } : null;
  }

  if (selector === 'Leader') {
    if (!employee.team_id) return null;
    const leader = employees.find(candidate =>
      candidate.team_id === employee.team_id && candidate.role === 'Leader'
    );
    return leader ? { id: leader.id, role: leader.role } : null;
  }

  const manager = employees.find(candidate => candidate.role === 'Manager');
  return manager ? { id: manager.id, role: manager.role } : null;
}

function getMissingInitialEvaluatorError(employee: PeriodEmployee): string {
  const [firstStep] = getEvaluationFlow(employee.role);
  const selector: EvaluatorSelector = firstStep.evaluator;
  return `Không tìm thấy ${selector} phù hợp cho nhân viên ${employee.id} ở Round 1.`;
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

    const periodEmployees: PeriodEmployee[] = (employees || []).map(emp => ({
      id: emp.id,
      role: emp.role as Role,
      team_id: emp.team_id,
    }));
    const initialEvaluators = new Map<string, EvaluatorResolution>();

    for (const employee of periodEmployees) {
      const evaluator = resolveInitialEvaluator(employee, periodEmployees);
      if (!evaluator) {
        return { success: false, error: getMissingInitialEvaluatorError(employee) };
      }
      initialEvaluators.set(employee.id, evaluator);
    }

    // 2. Tạo Evaluation Period sau khi validate được evaluator Round 1
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

    const employeeMap = new Map(periodEmployees.map(emp => [emp.id, emp]));

    // 4. Khởi tạo Round 1 theo hierarchy của vai trò nhân viên
    const roundsData: InsertRound[] = insertedEvals.map((ev: { id: string; employee_id: string; employee_role: string }) => {
      const employee = employeeMap.get(ev.employee_id) || {
        id: ev.employee_id,
        role: ev.employee_role as Role,
        team_id: null
      };
      const evaluator = initialEvaluators.get(employee.id);

      if (!evaluator) {
        throw new Error(getMissingInitialEvaluatorError(employee));
      }

      return {
        evaluation_id: ev.id,
        round: 1,
        evaluator_id: evaluator.id,
        evaluator_role: evaluator.role,
        scores: {},
        notes: {},
        total_score: 0,
        grade: 'Pending' as Grade,
        created_at: now
      };
    });

    const { error: rError } = await supabase
      .from('evaluation_rounds')
      .insert(roundsData);

    if (rError) {
      return { success: false, error: 'Lỗi tạo vòng đánh giá đầu tiên: ' + rError.message };
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
    // 1. Xóa rounds liên quan
    const { data: evals } = await supabase
      .from('evaluations')
      .select('id')
      .eq('period_id', periodId);

    if (evals && evals.length > 0) {
      const evalIds = evals.map(e => e.id);
      await supabase.from('evaluation_rounds').delete().in('evaluation_id', evalIds);
      // 2. Xóa evaluations
      await supabase.from('evaluations').delete().eq('period_id', periodId);
    }

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
