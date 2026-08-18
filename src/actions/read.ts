'use server';

import { requireAuth, requireRole } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Evaluation, Role, CriteriaGroup, User, Team } from '@/types';
import { 
  getEvaluationsAdmin, 
  getEvaluationsByPeriodAdmin, 
  getEvaluationSummariesAdmin,
  getEvaluationSummariesByPeriodAdmin,
  getEvaluationByIdAdmin, 
  getEvaluationByEmployeeAdmin, 
  getEvaluationHistoryByEmployeeAdmin 
} from '@/lib/db/evaluations-admin';
import { 
  getUsersAdmin, 
  getUserByIdAdmin, 
  getUsersByTeamAdmin 
} from '@/lib/db/users-admin';
import { 
  getTeamsAdmin, 
  getTeamByIdAdmin 
} from '@/lib/db/teams-admin';
import { getCriteriaForRole } from '@/lib/db/criteria';
import { loadGradeBandsFromDb, getGradeBandsSync, GradeBands } from '@/lib/grade-bands';
import { getActivePeriod } from '@/lib/db/evaluations';

export type AuditRow = {
  id: string;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string | null;
};

/**
 * Đọc thông tin User đang đăng nhập (session hiện tại).
 * Bắt buộc requireAuth(). Trả null nếu chưa đăng nhập.
 */
export async function getCurrentUserAction(): Promise<User | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }
  return auth.user;
}

/**
 * Đọc danh sách users (phân quyền theo viewer: Manager xem tất cả, Employee/Leader/SubLeader theo team).
 * Bắt buộc requireAuth().
 */
export async function getUsersAction(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<User[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }
  return getUsersAdmin(auth.user, options);
}

/**
 * Đọc thông tin user theo ID.
 * Bắt buộc requireAuth().
 */
export async function getUserByIdAction(id: string): Promise<User | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }
  return getUserByIdAdmin(id, auth.user);
}

/**
 * Đọc danh sách users thuộc một Team.
 * Bắt buộc requireAuth() + phân quyền: Manager mọi team; khác chỉ team mình.
 */
export async function getUsersByTeamAction(teamId: string): Promise<User[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }
  return getUsersByTeamAdmin(teamId, auth.user);
}

/**
 * Đọc danh sách teams (phân quyền theo viewer).
 * Bắt buộc requireAuth().
 */
export async function getTeamsAction(): Promise<Team[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }
  return getTeamsAdmin(auth.user);
}

/**
 * Đọc thông tin team theo ID.
 * Bắt buộc requireAuth().
 */
export async function getTeamByIdAction(id: string): Promise<Team | null> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return null;
  }
  return getTeamByIdAdmin(id, auth.user);
}

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
 * Đọc danh sách tóm tắt evaluations theo kỳ hoặc toàn bộ (phân quyền theo viewer).
 * Dùng summary projection (không tải scores/notes nặng) để tối ưu danh sách nhân viên.
 * Bắt buộc requireAuth() — chỉ trả evaluations viewer được phép xem.
 */
export async function getEvaluationSummariesAction(
  periodId?: string,
  opts?: { limit?: number }
): Promise<Evaluation[]> {
  const auth = await requireAuth();
  if (auth.error !== null) {
    return [];
  }

  if (periodId) {
    return getEvaluationSummariesByPeriodAdmin(periodId, auth.user, opts);
  }
  return getEvaluationSummariesAdmin(auth.user, opts);
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

  const effectivePeriodId = periodId ?? (await getActivePeriod())?.id;
  if (!effectivePeriodId) {
    return null;
  }

  return getEvaluationByEmployeeAdmin(employeeId, effectivePeriodId, auth.user);
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
