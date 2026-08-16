'use server';

import { requireAuth, requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Evaluation, Role, CriteriaGroup } from '@/types';
import { 
  getEvaluationsAdmin, 
  getEvaluationsByPeriodAdmin, 
  getEvaluationByIdAdmin, 
  getEvaluationByEmployeeAdmin, 
  getEvaluationHistoryByEmployeeAdmin 
} from '@/lib/db/evaluations-admin';
import { getCriteriaForRole } from '@/lib/db/criteria';
import { loadGradeBandsFromDb, getGradeBandsSync, GradeBands } from '@/lib/grade-bands';

export type AuditRow = {
  id: string;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string | null;
};

/**
 * Đọc danh sách evaluations theo kỳ hoặc toàn bộ (phân quyền theo viewer).
 * Bắt buộc requireAuth() — chỉ trả evaluations viewer được phép xem.
 */
export async function getEvaluationsAction(
  periodId?: string,
  opts?: { limit?: number }
): Promise<Evaluation[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }

  if (periodId) {
    return getEvaluationsByPeriodAdmin(periodId, auth.user, opts);
  }
  return getEvaluationsAdmin(auth.user, opts);
}

/**
 * Đọc chi tiết một evaluation theo ID.
 * Bắt buộc requireAuth() + canViewEvaluation.
 */
export async function getEvaluationByIdAction(id: string): Promise<Evaluation | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }

  return getEvaluationByIdAdmin(id, auth.user);
}

/**
 * Đọc evaluation của một nhân viên theo kỳ (hoặc kỳ đang mở).
 * Bắt buộc requireAuth() + canViewEvaluation.
 */
export async function getEvaluationByEmployeeAction(
  employeeId: string,
  periodId?: string
): Promise<Evaluation | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }

  return getEvaluationByEmployeeAdmin(employeeId, periodId, auth.user);
}

/**
 * Đọc lịch sử đánh giá các kỳ trước (status = Approved) của nhân viên.
 * Bắt buộc requireAuth() + chỉ Manager hoặc chính nhân viên đó mới được xem.
 */
export async function getEvaluationHistoryAction(employeeId: string): Promise<Evaluation[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }

  return getEvaluationHistoryByEmployeeAdmin(employeeId, auth.user);
}

/**
 * Đọc nhật ký kiểm toán (audit_logs).
 * Bắt buộc requireRole(['Manager']) — chỉ Manager mới có quyền xem.
 */
export async function getAuditLogsAction(opts?: {
  limit?: number;
}): Promise<{ logs: AuditRow[]; error: string | null }> {
  const auth = await requireRole(['Manager']);
  if (auth.error !== null) {
    return { logs: [], error: auth.error };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('audit_logs')
      .select('id, actor_name, action, entity, entity_id, created_at')
      .order('created_at', { ascending: false })
      .limit(opts?.limit ?? 50);

    if (error) {
      console.error('getAuditLogsAction error:', error.message);
      return { logs: [], error: 'Không thể tải nhật ký hoạt động.' };
    }

    return { logs: (data || []) as AuditRow[], error: null };
  } catch (err) {
    console.error('getAuditLogsAction exception:', err);
    return { logs: [], error: 'Lỗi hệ thống khi tải nhật ký.' };
  }
}

/**
 * Đọc thang điểm từ DB (supabaseAdmin).
 * Bắt buộc requireAuth().
 */
export async function getGradeBandsAction(): Promise<GradeBands> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return getGradeBandsSync();
  }

  return loadGradeBandsFromDb(supabaseAdmin);
}

/**
 * Đọc nhóm tiêu chí áp dụng cho một Role cụ thể.
 * Bắt buộc requireAuth().
 */
export async function getCriteriaForRoleAction(role: Role): Promise<CriteriaGroup[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }

  return getCriteriaForRole(role);
}
