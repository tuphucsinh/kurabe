'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { revalidatePath, revalidateTag } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import {
  resolveEvaluatorFromList,
  loadTeamLeaderIds,
  EvaluationSubject,
  EvaluatorResolution,
} from '@/lib/evaluator-resolver';
import { toClientError, ClientSafeError } from '@/lib/errors';
import { parseRole } from '@/lib/parsers';

export interface EvaluationPayloadItem {
  employee_id: string;
  employee_role: string;
  team_id: string | null;
  status: string;
  current_round: number;
  created_at: string;
  updated_at: string;
}

export interface RoundPayloadItem {
  employee_id: string;
  round: number;
  evaluator_id: string | null;
  evaluator_role: string;
  scores: Record<string, unknown>;
  notes: Record<string, unknown>;
  total_score: number;
  grade: string;
  status: string;
  created_at: string;
}

export interface DeleteEmptyPeriodRpcResult {
  deleted: boolean;
  reason: 'DELETED' | 'NOT_FOUND' | 'NOT_CLOSED' | 'HAS_DATA' | string;
  evaluation_count?: number;
  ai_summary_count?: number;
}

function revalidatePeriodPaths() {
  revalidateTag('dashboard-data', 'default');
  revalidateTag('report-aggregation', 'default');
  revalidatePath('/admin/periods');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  revalidatePath('/employees');
  revalidatePath('/settings');
}

function getMissingEvaluatorError(employeeId: string, selector: string, round: number): string {
  return `Không tìm thấy ${selector} phù hợp cho nhân viên ${employeeId} ở Round ${round}.`;
}

/**
 * Tạo một kỳ đánh giá mới và khởi tạo Evaluations cho TẤT CẢ nhân viên (Bao gồm cả Manager).
 * Actor lấy từ session (requireManager) — KHÔNG trust managerId từ client.
 *
 * P96T04 Contract:
 * - TypeScript là thẩm quyền duy nhất giải quyết luồng đánh giá (evaluator resolution).
 * - Toàn bộ thao tác tạo kỳ (evaluation_periods status: 'active') + danh sách evaluations + round 1
 *   được thực thi trong 1 giao dịch database nguyên tử thông qua RPC create_evaluation_period_atomic.
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

    // 2. Chuẩn bị payload danh sách Evaluations và Rounds cho atomic RPC
    // status: 'active' được gán server-side trong RPC
    const evaluationsPayload: EvaluationPayloadItem[] = periodEmployees.map((emp) => ({
      employee_id: emp.id,
      employee_role: emp.role,
      team_id: emp.teamId || null,
      status: 'NotStarted',
      current_round: 1,
      created_at: now,
      updated_at: now,
    }));

    const roundsPayload: RoundPayloadItem[] = periodEmployees.map((emp) => {
      const flow = getEvaluationFlow(emp.role);
      const firstStep = flow[0]; // Chỉ lấy Round 1
      const evaluator = initialEvaluators.get(emp.id);

      return {
        employee_id: emp.id,
        round: firstStep.round,
        evaluator_id: evaluator?.id || null,
        evaluator_role: parseRole(evaluator?.role || firstStep.evaluator),
        scores: {},
        notes: {},
        total_score: 0,
        grade: 'Pending',
        status: 'NotStarted',
        created_at: now,
      };
    });

    // 3. Thực thi Atomic Transaction RPC (Kỳ đánh giá + Evaluations + Round 1 được tạo trong 1 giao dịch)
    const { data: periodId, error: rpcError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: string | null; error: unknown }>)(
      'create_evaluation_period_atomic',
      {
        p_name: periodName,
        p_year: year,
        p_created_by: managerId,
        p_created_at: now,
        p_evaluations: evaluationsPayload,
        p_rounds: roundsPayload,
      }
    );

    if (rpcError || !periodId || typeof periodId !== 'string' || !periodId.trim()) {
      const errObj = rpcError as { code?: string; message?: string; details?: string; hint?: string } | null;
      const dbErrorText = [errObj?.message, errObj?.details, errObj?.hint].filter(Boolean).join(' ');
      const isSingleActiveConflict =
        errObj?.code === '23505' &&
        (dbErrorText.includes('idx_evaluation_periods_single_active') ||
          dbErrorText.includes('evaluation_periods_status_key'));
      if (isSingleActiveConflict) {
        return {
          success: false,
          error: toClientError(
            new ClientSafeError('Đã có một kỳ đánh giá đang hoạt động (Active). Vui lòng đóng kỳ hiện tại trước khi tạo kỳ mới.'),
            'Lỗi tạo kỳ đánh giá. Vui lòng thử lại.'
          ),
        };
      }
      if (rpcError) {
        return { success: false, error: toClientError(rpcError, 'Lỗi tạo kỳ đánh giá. Vui lòng thử lại.') };
      }
      return {
        success: false,
        error: 'Lỗi tạo kỳ đánh giá: không nhận được mã kỳ đánh giá hợp lệ.',
      };
    }

    revalidatePeriodPaths();
    await logAudit(auth.user, 'CREATE_PERIOD', 'period', periodId, { year });

    if (periodEmployees.length === 0) {
      return {
        success: true,
        periodId,
        message: 'Kỳ đánh giá đã được tạo nhưng không có nhân viên nào để khởi tạo.',
      };
    }

    return { success: true, periodId };
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
    if (!periodId || typeof periodId !== 'string' || periodId.trim() === '') {
      return { success: false, error: 'Thiếu thông tin kỳ đánh giá.' };
    }

    const { data, error } = await supabaseAdmin
      .from('evaluation_periods')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString()
      })
      .eq('id', periodId)
      .eq('status', 'active')
      .select('id');

    if (error) return { success: false, error: toClientError(error, 'Lỗi đóng kỳ đánh giá. Vui lòng thử lại.') };

    if (!data || data.length !== 1) {
      return { success: false, error: 'Kỳ đánh giá không tồn tại hoặc đã được đóng.' };
    }

    revalidatePeriodPaths();
    await logAudit(auth.user, 'CLOSE_PERIOD', 'period', periodId);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định khi đóng kỳ đánh giá.') };
  }
}

/**
 * Xóa một kỳ đánh giá trống đã đóng (Atomic RPC).
 * Chặn xóa kỳ có dữ liệu (evaluations > 0 hoặc ai_summaries > 0) hoặc kỳ chưa đóng.
 * Toàn bộ kiểm tra lock, đếm và xóa thực thi trong 1 transaction phía DB.
 */
export async function deleteEvaluationPeriod(periodId: string) {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    if (!periodId || typeof periodId !== 'string' || periodId.trim() === '') {
      return { success: false, error: 'Thiếu thông tin kỳ đánh giá.' };
    }

    const { data: rpcData, error: rpcError } = await (supabaseAdmin.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>
    ) => Promise<{ data: DeleteEmptyPeriodRpcResult | null; error: unknown }>)(
      'delete_empty_evaluation_period_atomic',
      {
        p_period_id: periodId,
      }
    );

    if (rpcError) {
      return { success: false, error: toClientError(rpcError, 'Lỗi xóa kỳ đánh giá. Vui lòng thử lại.') };
    }

    if (!rpcData) {
      return { success: false, error: 'Lỗi xóa kỳ đánh giá: không nhận được kết quả từ hệ thống.' };
    }

    if (!rpcData.deleted) {
      if (rpcData.reason === 'NOT_FOUND') {
        return { success: false, error: 'Không tìm thấy kỳ đánh giá.' };
      }
      if (rpcData.reason === 'NOT_CLOSED') {
        return { success: false, error: 'Kỳ đang Active — hãy "Đóng kỳ" trước khi xóa để tránh mất dữ liệu đang chấm.' };
      }
      if (rpcData.reason === 'HAS_DATA') {
        return {
          success: false,
          error: 'Không thể xóa kỳ đánh giá đã có dữ liệu (đánh giá hoặc báo cáo AI). Chỉ có thể xóa kỳ trống đã đóng.',
        };
      }
      return { success: false, error: 'Không thể xóa kỳ đánh giá.' };
    }

    revalidatePeriodPaths();
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
    if (!periodId || typeof periodId !== 'string' || periodId.trim() === '') {
      return { success: false, error: 'Thiếu thông tin kỳ đánh giá.' };
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      return { success: false, error: 'Tỉ lệ mục tiêu phải nằm trong khoảng 0-100%.' };
    }
    const validGrades = ['S', 'A', 'AB', 'B', 'C', 'D'];
    if (!validGrades.includes(grade)) {
      return { success: false, error: 'Mức xếp loại mục tiêu không hợp lệ.' };
    }

    const { data, error } = await supabaseAdmin
      .from('evaluation_periods')
      .update({ target_rate: Math.round(rate), target_grade: grade })
      .eq('id', periodId)
      .eq('status', 'active')
      .select('id');

    if (error) return { success: false, error: toClientError(error, 'Lỗi lưu mục tiêu. Vui lòng thử lại.') };

    if (!data || data.length !== 1) {
      return { success: false, error: 'Kỳ đánh giá không tồn tại hoặc đã bị đóng.' };
    }

    revalidatePeriodPaths();
    await logAudit(auth.user, 'UPDATE_PERIOD_TARGET', 'period', periodId, { rate, grade });
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định khi lưu mục tiêu.') };
  }
}

export const deleteEvaluationPeriodAction = deleteEvaluationPeriod;
