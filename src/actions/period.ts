'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import {
  resolveEvaluatorFromList,
  loadTeamLeaderIds,
  EvaluationSubject,
  EvaluatorResolution,
} from '@/lib/evaluator-resolver';
import { Database } from '@/types/database';
import { toClientError } from '@/lib/errors';
import { parseRole } from '@/lib/parsers';

type InsertEvaluation = Database['public']['Tables']['evaluations']['Insert'];
type InsertRound = Database['public']['Tables']['evaluation_rounds']['Insert'];



function getMissingEvaluatorError(employeeId: string, selector: string, round: number): string {
  return `Không tìm thấy ${selector} phù hợp cho nhân viên ${employeeId} ở Round ${round}.`;
}

/**
 * Tạo một kỳ đánh giá mới và khởi tạo Evaluations cho TẤT CẢ nhân viên (Bao gồm cả Manager).
 * Actor lấy từ session (requireManager) — KHÔNG trust managerId từ client.
 */
export async function createEvaluationPeriod(year: number) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };
  const managerId = auth.user.id;

  try {
    const now = new Date().toISOString();
    const periodName = `Kỳ ${year}`;

    // 1. Lấy danh sách TẤT CẢ nhân viên active
    const { data: employees, error: eError } = await supabaseAdmin
      .from('users')
      .select('id, role, team_id, subleader_id')
      .eq('is_active', true);

    if (eError) {
      return { success: false, error: toClientError(eError, 'Lỗi lấy danh sách nhân viên. Vui lòng thử lại.') };
    }

    const periodEmployees: EvaluationSubject[] = (employees || []).map(emp => ({
      id: emp.id,
      role: parseRole(emp.role),
      teamId: emp.team_id,
      subleaderId: emp.subleader_id,
    }));
    // Map leader được chỉ định — đồng bộ ngữ cảnh resolve với resolveEvaluatorFromDb (A3)
    const teamLeaderIds = await loadTeamLeaderIds(supabaseAdmin);
    const initialEvaluators = new Map<string, EvaluatorResolution | null>();

    // Validate/Resolve evaluator round 1 trước khi tạo bất kỳ record nào.
    // Nếu employee.subleaderId null (chưa gán SubLeader), round 1 sẽ được tạo với evaluator_id = null (không fail kỳ).
    for (const employee of periodEmployees) {
      const [firstStep] = getEvaluationFlow(employee.role);
      const evaluator = resolveEvaluatorFromList(firstStep.evaluator, employee, periodEmployees, teamLeaderIds);
      if (!evaluator && firstStep.evaluator !== 'SubLeader') {
        return { success: false, error: getMissingEvaluatorError(employee.id, firstStep.evaluator, firstStep.round) };
      }
      initialEvaluators.set(employee.id, evaluator);
    }

    // 2. Tạo Evaluation Period
    const { data: period, error: pError } = await supabaseAdmin
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
      return { success: false, error: toClientError(pError, 'Lỗi tạo kỳ đánh giá. Vui lòng thử lại.') };
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

    const { data: insertedEvals, error: evError } = await supabaseAdmin
      .from('evaluations')
      .insert(evaluationsData)
      .select();

    if (evError || !insertedEvals) {
      return { success: false, error: toClientError(evError, 'Lỗi khởi tạo danh sách đánh giá. Vui lòng thử lại.') };
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

      // Nếu employee chưa gán subleader (evaluator null), evaluator_id = null (không được assign) để bổ sung sau
      roundsData.push({
        evaluation_id: ev.id,
        round: firstStep.round,
        evaluator_id: evaluator?.id || null,
        evaluator_role: parseRole(evaluator?.role || firstStep.evaluator),
        scores: {},
        notes: {},
        total_score: 0,
        grade: 'Pending',
        status: 'NotStarted',
        created_at: now
      });
    }

    const { error: rError } = await supabaseAdmin
      .from('evaluation_rounds')
      .insert(roundsData);

    if (rError) {
      return { success: false, error: toClientError(rError, 'Lỗi tạo các vòng đánh giá. Vui lòng thử lại.') };
    }

    revalidatePath('/admin/periods');
    await logAudit(auth.user, 'CREATE_PERIOD', 'period', period.id, { year });
    return { success: true, periodId: period.id };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định khi tạo kỳ đánh giá.') };
  }
}

/**
 * Đóng một kỳ đánh giá.
 */
export async function closeEvaluationPeriod(periodId: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { error } = await supabaseAdmin
      .from('evaluation_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString()
      })
      .eq('id', periodId);

    if (error) return { success: false, error: toClientError(error, 'Lỗi đóng kỳ đánh giá. Vui lòng thử lại.') };

    revalidatePath('/admin/periods');
    await logAudit(auth.user, 'CLOSE_PERIOD', 'period', periodId);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định khi đóng kỳ đánh giá.') };
  }
}

/**
 * Xóa một kỳ đánh giá và toàn bộ dữ liệu liên quan.
 */
export async function deleteEvaluationPeriod(periodId: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    // 1. Xóa trực tiếp evaluations, DB đã config cascade sang evaluation_rounds và responses
    const { error: evalError } = await supabaseAdmin
      .from('evaluations')
      .delete()
      .eq('period_id', periodId);

    if (evalError) return { success: false, error: toClientError(evalError, 'Lỗi xóa dữ liệu đánh giá của kỳ. Vui lòng thử lại.') };

    // 3. Xóa period
    const { error } = await supabaseAdmin
      .from('evaluation_periods')
      .delete()
      .eq('id', periodId);

    if (error) return { success: false, error: toClientError(error, 'Lỗi xóa kỳ đánh giá. Vui lòng thử lại.') };

    revalidatePath('/admin/periods');
    revalidatePath('/dashboard');
    await logAudit(auth.user, 'DELETE_PERIOD', 'period', periodId);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định khi xóa kỳ đánh giá.') };
  }
}

/**
 * Cập nhật MỤC TIÊU kỳ đánh giá (tỉ lệ % + mức xếp loại) — Manager-only.
 */
export async function savePeriodTarget(
  periodId: string,
  rate: number,
  grade: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    if (!periodId) return { success: false, error: 'Thiếu thông tin kỳ đánh giá.' };
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return { success: false, error: 'Tỉ lệ mục tiêu phải nằm trong khoảng 0-100%.' };
    }
    const validGrades = ['S', 'A', 'AB', 'B', 'C', 'D'];
    if (!validGrades.includes(grade)) {
      return { success: false, error: 'Mức xếp loại mục tiêu không hợp lệ.' };
    }

    const { error } = await supabaseAdmin
      .from('evaluation_periods')
      .update({ target_rate: Math.round(rate), target_grade: grade })
      .eq('id', periodId);

    if (error) return { success: false, error: toClientError(error, 'Lỗi lưu mục tiêu. Vui lòng thử lại.') };

    revalidatePath('/settings');
    revalidatePath('/reports');
    await logAudit(auth.user, 'UPDATE_PERIOD_TARGET', 'period', periodId, { rate, grade });
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định khi lưu mục tiêu.') };
  }
}
