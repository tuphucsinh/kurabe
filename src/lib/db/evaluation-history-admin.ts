import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { User, Evaluation, EvaluationPeriod } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { USER_SELECT, mapUserFromDb } from '@/lib/db/users';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { mapEvaluationFromDb, mapPeriodFromDb } from '@/lib/db/evaluations';
import { canViewEvaluation } from '@/data/workflow';
import { isIndividualRole } from '@/lib/role-policy';

export interface EvaluationHistoryEntry {
  evaluation: Evaluation;
  period: EvaluationPeriod;
}

export interface EvaluationHistoryResult {
  target: User | null;
  entries: EvaluationHistoryEntry[];
}

/**
 * Đọc lịch sử đánh giá đã hoàn tất của một nhân viên (server-only).
 *
 * Ràng buộc bảo mật & dữ liệu:
 * 1. Chỉ lấy evaluation có status = 'Approved'.
 * 2. Chỉ lấy kỳ đánh giá có trạng thái thô trong database là 'closed' (không fallback sang active/latest).
 * 3. Kiểm tra quyền truy cập nghiêm ngặt qua canViewEvaluation(viewer, evaluation, allUsersContext).
 * 4. Sắp xếp: period.year DESC -> period.createdAt DESC -> evaluation.id ASC.
 * 5. Fail-closed: viewer thiếu auth hoặc không có quyền xem -> trả về entries rỗng hoặc target null.
 */
export async function getEvaluationHistoryAdmin(
  employeeId: string,
  viewer?: User | null
): Promise<EvaluationHistoryResult> {
  if (!viewer || !employeeId) {
    return { target: null, entries: [] };
  }

  // 1. Kiểm tra quyền cơ bản đối với target user
  if (viewer.role !== 'Manager') {
    if (isIndividualRole(viewer.role) && viewer.id !== employeeId) {
      return { target: null, entries: [] };
    }
  }

  // 2. Lấy thông tin target employee
  const { data: targetData, error: targetError } = await supabaseAdmin
    .from('users')
    .select(USER_SELECT)
    .eq('id', employeeId)
    .maybeSingle();

  if (targetError) {
    throw new DatabaseError('Error fetching target user for evaluation history (admin)', targetError);
  }

  if (!targetData) {
    return { target: null, entries: [] };
  }

  const target = mapUserFromDb(targetData);

  // Phân quyền theo team đối với Leader/SubLeader
  if (viewer.role !== 'Manager' && viewer.id !== employeeId) {
    if (viewer.role === 'Leader' || viewer.role === 'SubLeader') {
      if (!viewer.teamId || target.teamId !== viewer.teamId) {
        return { target: null, entries: [] };
      }
    }
  }

  // 3. Query evaluations đã Approved thuộc các kỳ đã closed
  const { data: evalRows, error: evalError } = await supabaseAdmin
    .from('evaluations')
    .select('*, evaluation_rounds(*), evaluation_periods!inner(*)')
    .eq('employee_id', employeeId)
    .eq('status', 'Approved')
    .eq('evaluation_periods.status', 'closed');

  if (evalError) {
    throw new DatabaseError('Error fetching evaluation history by employee (admin)', evalError);
  }

  if (!evalRows || evalRows.length === 0) {
    return { target, entries: [] };
  }

  // 4. Chuẩn bị context phân quyền cho canViewEvaluation
  let allUsersContext: User[] = [target];
  if (viewer.role === 'Leader' || viewer.role === 'SubLeader') {
    // Giữ đủ context user trong cùng team để matchesEvaluatorSelector không deny
    // sai do thiếu quan hệ subleader/team; context này không được trả về client.
    const teamUsers = await getUsersAdmin(viewer);
    allUsersContext = [
      ...teamUsers.filter((user) => user.id !== target.id),
      target,
    ];
  }

  // 5. Lọc từng evaluation và period, kiểm tra tính hợp lệ và quyền xem
  const entries: EvaluationHistoryEntry[] = [];

  for (const row of evalRows) {
    const periodData = Array.isArray(row.evaluation_periods)
      ? row.evaluation_periods[0]
      : row.evaluation_periods;

    // Bắt buộc raw status của period là 'closed'
    if (!periodData || periodData.status !== 'closed') {
      continue;
    }

    const evaluation = mapEvaluationFromDb(row);
    if (evaluation.status !== 'Approved') {
      continue;
    }

    // Kiểm tra quyền xem chi tiết evaluation của viewer
    if (!canViewEvaluation(viewer, evaluation, allUsersContext)) {
      continue;
    }

    const period = mapPeriodFromDb(periodData);
    if (period.status !== 'Closed') {
      continue;
    }

    entries.push({ evaluation, period });
  }

  // 6. Sắp xếp theo thứ tự: period.year DESC -> period.createdAt DESC -> evaluation.id ASC
  entries.sort((a, b) => {
    if (b.period.year !== a.period.year) {
      return b.period.year - a.period.year;
    }
    const timeA = new Date(a.period.createdAt).getTime();
    const timeB = new Date(b.period.createdAt).getTime();
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return a.evaluation.id.localeCompare(b.evaluation.id);
  });

  return { target, entries };
}
