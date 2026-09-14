import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { User, Evaluation, EvaluationPeriod } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { USER_SELECT, mapUserFromDb } from '@/lib/db/users';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { mapEvaluationFromDb, mapPeriodFromDb } from '@/lib/db/evaluations';
import {
  canViewEvaluation,
  canReadEvaluationHistory,
  hasEvaluationHistoryTargetScope,
  isAuthorizedHistoricalEvaluator,
} from '@/data/workflow';
import { isIndividualRole } from '@/lib/role-policy';
import { getLeaderTeamIds } from '@/lib/db/teams-admin';

export interface EvaluationHistoryEntry {
  evaluation: Evaluation;
  period: EvaluationPeriod;
}

export interface EvaluationHistoryResult {
  target: User | null;
  entries: EvaluationHistoryEntry[];
}

function buildHistoricalTarget(target: User, evaluation: Evaluation): User {
  const firstRound = evaluation.rounds.find((round) => round.round === 1);
  return {
    ...target,
    // Access to a historical record follows the captured evaluation graph,
    // not the employee's current role/team/subleader assignment.
    role: evaluation.employeeRole,
    teamId: evaluation.teamId,
    subleaderId: firstRound?.evaluatorRole === 'SubLeader'
      ? firstRound.evaluatorId || null
      : target.subleaderId,
  };
}

/**
 * Đọc lịch sử đánh giá đã hoàn tất của một nhân viên (server-only).
 *
 * Ràng buộc bảo mật & dữ liệu:
 * 1. Chỉ lấy evaluation có status = 'Approved'.
 * 2. Chỉ lấy kỳ đánh giá có trạng thái thô trong database là 'closed' (không fallback sang active/latest).
 * 3. Kiểm tra quyền truy cập nghiêm ngặt qua canReadEvaluationHistory (shared H4 truth table).
 * 4. Sắp xếp: period.year DESC -> period.createdAt DESC -> evaluation.id ASC.
 * 5. Fail-closed: viewer thiếu auth hoặc không có quyền xem -> trả về entries rỗng hoặc target null.
 * 6. Non-disclosure: Viewer không có current scope (Manager, Self, Leader của team hiện tại)
 *    và không có historical evaluator entry hợp lệ -> trả { target: null, entries: [] }
 *    để ngăn chặn target enumeration qua route /history/[id].
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
  const leaderTeamIds = viewer.role === 'Leader' ? await getLeaderTeamIds(viewer) : [];
  const hasCurrentScope = hasEvaluationHistoryTargetScope(viewer, target, leaderTeamIds);

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
    if (!hasCurrentScope) {
      return { target: null, entries: [] };
    }
    return { target, entries: [] };
  }

  // 4. Chuẩn bị context nội bộ cho legacy evaluation-detail policy. This is
  // never returned to the client and cannot widen the H4 history truth table.
  let allUsersContextBase: User[] = [target];
  if (viewer.role === 'Leader' || viewer.role === 'SubLeader') {
    const teamUsers = await getUsersAdmin(viewer);
    allUsersContextBase = [
      ...teamUsers.filter((user) => user.id !== target.id),
      target,
    ];
  }

  // 5. Lọc từng evaluation và period qua shared H4 history policy.
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

    const historicalTarget = buildHistoricalTarget(target, evaluation);
    const allUsersContext = [
      ...allUsersContextBase.filter((user) => user.id !== historicalTarget.id),
      historicalTarget,
    ];
    const canViewEvaluationDetail = canViewEvaluation(viewer, evaluation, allUsersContext, leaderTeamIds);

    // One shared H4 truth table serves both the route and direct Server Action:
    // current target scope OR a submitted historical evaluator snapshot.
    // Historical read access is deliberately separate from current write auth.
    if (!canReadEvaluationHistory(viewer, historicalTarget, evaluation, leaderTeamIds)) {
      continue;
    }
    // Outside current scope, retain the existing evaluation-detail guard and
    // require a submitted historical evaluator snapshot (never draft access).
    if (!hasCurrentScope && (!canViewEvaluationDetail || !isAuthorizedHistoricalEvaluator(viewer, evaluation))) {
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

  // Nếu viewer không có current scope VÀ không có entries hợp lệ nào viewer được phép xem:
  // Fail closed: Không disclose target metadata (tránh user enumeration qua /history/[id])
  if (!hasCurrentScope && entries.length === 0) {
    return { target: null, entries: [] };
  }

  return { target, entries };
}
