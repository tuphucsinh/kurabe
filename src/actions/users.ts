'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager, requireRole } from '@/lib/auth';
import { logAudit, logAuditBatch } from '@/lib/audit';
import { revalidatePath, revalidateTag } from 'next/cache';
import { User, Role } from '@/types';
import { Database } from '@/types/database';
import { mapUserFromDb, USER_SELECT } from '@/lib/db/users';
import { ensureEvaluationsForUsers } from '@/lib/db/evaluations-write';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import { resolveEvaluatorFromList, loadTeamLeaderIds, EvaluationSubject } from '@/lib/evaluator-resolver';
import { toClientError, ClientSafeError } from '@/lib/errors';
import { parseRole } from '@/lib/parsers';
import { canHaveSubLeader } from '@/lib/role-policy';

type DbUserInsert = Database['public']['Tables']['users']['Insert'];

function mapSlot(u: { id: string; role: string; team_id: string | null }): Pick<User, 'id' | 'role' | 'teamId'> {
  return { id: u.id, role: parseRole(u.role), teamId: u.team_id || '' };
}

/**
 * RULE: Team chỉ được 1 Leader; SubLeader không giới hạn số lượng.
 * Muốn thay đổi Leader → phải hạ người giữ chức hiện tại xuống
 * Employee TRƯỚC, rồi mới thăng người khác lên.
 */
function assertLeadershipSlot(
  candidate: Partial<User>,
  existingUsers: Pick<User, 'id' | 'role' | 'teamId'>[]
): void {
  if (candidate.role !== 'Leader' || !candidate.teamId) {
    return; // Chỉ Leader bị ràng buộc slot (SubLeader không giới hạn)
  }
  const holders = existingUsers.filter(u =>
    u.teamId === candidate.teamId &&
    u.role === candidate.role &&
    u.id !== candidate.id // không tính chính người đang sửa
  );
  if (holders.length > 0) {
    const holderName = holders[0].id; // caller có thể enrich tên
    throw new ClientSafeError(
      `Nhóm này đã có ${candidate.role === 'Leader' ? 'Leader' : 'SubLeader'}` +
      (holderName ? ` (id: ${holderName})` : '') +
      `. Muốn thay đổi, hãy hạ người giữ chức hiện tại xuống Nhân viên trước, rồi mới thăng người khác lên.`
    );
  }
}

type PersonnelSyncResult = {
  updatedEvaluations: number;
  updatedRounds: number;
  errors: string[];
};

type ActiveEvaluationRow = { id: string; employee_id: string };
type ActiveUserSubjectRow = { id: string; role: string; team_id: string | null; subleader_id: string | null };
type ActiveRoundRow = { id: string; evaluation_id: string; round: number };

/**
 * Đồng bộ snapshot personnel chỉ trong kỳ active và workflow chưa submit.
 * Historical/closed/submitted rows bị lọc trước query; DB guard vẫn là lớp
 * authoritative cuối cùng cho race close/submit.
 */
async function syncEvaluationsAfterUsersChange(users: User[]): Promise<PersonnelSyncResult> {
  const result: PersonnelSyncResult = { updatedEvaluations: 0, updatedRounds: 0, errors: [] };
  if (users.length === 0) return result;

  // 0. Đồng bộ teams.leader_id theo role hiện tại (không phải historical snapshot).
  for (const user of users) {
    if (!user.teamId) continue;
    const teamQuery = user.role === 'Leader'
      ? supabaseAdmin.from('teams').update({ leader_id: user.id }).eq('id', user.teamId)
      : supabaseAdmin
        .from('teams')
        .update({ leader_id: null })
        .eq('id', user.teamId)
        .eq('leader_id', user.id);
    const { error } = await teamQuery;
    if (error) result.errors.push('team snapshot sync failed');
  }

  // 1. Resolve the canonical active period before touching any evaluation.
  const { data: activePeriods, error: periodError } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(2);
  if (periodError) {
    result.errors.push('active period lookup failed');
    return result;
  }
  if (!activePeriods || activePeriods.length === 0) return result;
  if (activePeriods.length !== 1) {
    result.errors.push('active period cardinality invalid');
    return result;
  }
  const activePeriodId = activePeriods[0].id;

  // 2. Only current NotStarted/Draft evaluations may receive personnel snapshots.
  const { data: evs, error: evaluationsError } = await supabaseAdmin
    .from('evaluations')
    .select('id, employee_id')
    .in('employee_id', users.map((user) => user.id))
    .eq('period_id', activePeriodId)
    .in('status', ['NotStarted', 'Draft']);
  if (evaluationsError) {
    result.errors.push('active evaluation lookup failed');
    return result;
  }
  const activeEvaluations = (evs || []) as ActiveEvaluationRow[];
  if (activeEvaluations.length === 0) return result;

  const userById = new Map(users.map((user: User) => [user.id, user] as [string, User]));
  for (const evaluation of activeEvaluations) {
    const user = userById.get(evaluation.employee_id);
    if (!user) continue;
    const { data: updated, error } = await supabaseAdmin
      .from('evaluations')
      .update({ employee_role: user.role, team_id: user.teamId || null })
      .eq('id', evaluation.id)
      .eq('period_id', activePeriodId)
      .in('status', ['NotStarted', 'Draft'])
      .select('id');
    if (error) {
      result.errors.push('active evaluation snapshot update failed');
    } else {
      result.updatedEvaluations += updated?.length || 0;
    }
  }

  // 3. Resolve current evaluators only for those active, unsubmitted records.
  const [{ data: allUsers, error: usersError }, teamLeaderIds] = await Promise.all([
    supabaseAdmin
      .from('users')
      .select('id, role, team_id, subleader_id')
      .eq('is_active', true),
    loadTeamLeaderIds(supabaseAdmin),
  ]);
  if (usersError) {
    result.errors.push('active personnel lookup failed');
    return result;
  }
  const activeUsers = (allUsers || []) as ActiveUserSubjectRow[];
  const subjects: EvaluationSubject[] = activeUsers.map((user: ActiveUserSubjectRow) => ({
    id: user.id,
    role: parseRole(user.role),
    teamId: user.team_id || null,
    subleaderId: user.subleader_id || null,
  }));
  const flowByRole = new Map<Role, ReturnType<typeof getEvaluationFlow>>();
  const { data: rounds, error: roundsError } = await supabaseAdmin
    .from('evaluation_rounds')
    .select('id, evaluation_id, round, status, submitted_at')
    .in('evaluation_id', activeEvaluations.map((evaluation) => evaluation.id))
    .in('status', ['NotStarted', 'Draft'])
    .is('submitted_at', null)
    .order('round');
  if (roundsError) {
    result.errors.push('active round lookup failed');
    return result;
  }

  const updatesByKey = new Map<string, { evaluatorId: string | null; evaluatorRole: Role; roundIds: string[] }>();
  const activeRounds = (rounds || []) as ActiveRoundRow[];
  for (const round of activeRounds) {
    const evaluation = activeEvaluations.find((item: ActiveEvaluationRow) => item.id === round.evaluation_id);
    const user = evaluation ? userById.get(evaluation.employee_id) : undefined;
    if (!user) continue;
    let flow = flowByRole.get(user.role);
    if (!flow) {
      flow = getEvaluationFlow(user.role);
      flowByRole.set(user.role, flow);
    }
    const step = flow.find((item) => item.round === round.round);
    if (!step) continue;
    const evaluator = resolveEvaluatorFromList(step.evaluator, {
      id: user.id,
      role: user.role,
      teamId: user.teamId || null,
      subleaderId: user.subleaderId || null,
    }, subjects, teamLeaderIds);
    const key = `${evaluator?.id || 'none'}::${evaluator?.role || step.evaluator}`;
    const bucket = updatesByKey.get(key) || {
      evaluatorId: evaluator?.id || null,
      evaluatorRole: parseRole(evaluator?.role || step.evaluator),
      roundIds: [],
    };
    bucket.roundIds.push(round.id);
    updatesByKey.set(key, bucket);
  }

  for (const bucket of updatesByKey.values()) {
    const { data: updated, error } = await supabaseAdmin
      .from('evaluation_rounds')
      .update({ evaluator_id: bucket.evaluatorId, evaluator_role: bucket.evaluatorRole })
      .in('id', bucket.roundIds)
      .in('status', ['NotStarted', 'Draft'])
      .is('submitted_at', null)
      .select('id');
    if (error) {
      result.errors.push('active round snapshot update failed');
    } else {
      result.updatedRounds += updated?.length || 0;
    }
  }

  return result;
}

function revalidateUserPaths() {
  revalidateTag('dashboard-data', 'default');
  revalidateTag('report-aggregation', 'default');
  revalidatePath('/employees');
  revalidatePath('/teams');
  revalidatePath('/dashboard');
  revalidatePath('/reports');
  revalidatePath('/users');
}

export async function upsertUserAction(
  user: Partial<User>
): Promise<{ success: boolean; user?: User; error?: string; warning?: string }> {
  const auth = await requireRole(['Manager', 'Leader']);
  if (auth.error !== null) return { success: false, error: auth.error };

  const isLeader = auth.user.role === 'Leader';
  if (isLeader) {
    // Leader chỉ thao tác trong team của mình
    if (!auth.user.teamId) {
      return { success: false, error: 'Bạn chưa được gán nhóm nào — liên hệ Manager.' };
    }
    const leaderTeamId = auth.user.teamId;

    // Chặn tạo/sửa Manager, Leader — Leader chỉ quản Employee/SubLeader/Worker
    if (user.role && user.role !== 'Employee' && user.role !== 'SubLeader' && user.role !== 'Worker') {
      return { success: false, error: 'Leader chỉ được tạo hoặc sửa Nhân viên/Công nhân/SubLeader trong nhóm của mình.' };
    }

    // ÉP teamId = team của Leader (chặn gán nhóm khác / null-strip khi sửa)
    user.teamId = leaderTeamId;

    // Check EDIT (payload có id):
    if (user.id) {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id, team_id, role')
        .eq('id', user.id)
        .maybeSingle();
      if (existingUser) {
        // (a) Chỉ được sửa NV trong team mình
        if (existingUser.team_id !== leaderTeamId) {
          return { success: false, error: 'Bạn chỉ được sửa nhân viên trong nhóm của mình.' };
        }
        // (b) Chặn hạ chức Manager/Leader
        if (existingUser.role !== 'Employee' && existingUser.role !== 'SubLeader' && existingUser.role !== 'Worker') {
          return { success: false, error: 'Bạn không được sửa đổi Manager/Leader.' };
        }
        // (c) payload.role rỗng khi sửa → giữ nguyên role cũ (chặn hạ SubLeader→Employee vô tình)
        if (!user.role) {
          user.role = parseRole(existingUser.role);
        }
      }
    }
  }

  let syncWarning: string | undefined;
  try {
    let isNewUser = true;
    if (user.id) {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (existingUser) {
        isNewUser = false;
      }
    }

    // Rule: 1 team = 1 Leader + 1 SubLeader — chặn thăng khi team đã có người giữ chức
    if (user.role === 'Leader' || user.role === 'SubLeader') {
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('id, role, team_id')
        .eq('is_active', true);
      assertLeadershipSlot(user, (existing || []).map(mapSlot));
    }

    const gender = user.gender === 'Nam' || user.gender === 'Nữ' ? user.gender : 'Nữ';
    const role = user.role || 'Employee';
    const userId = user.id || crypto.randomUUID();
    const dbUser: DbUserInsert = {
      id: userId,
      employee_code: user.employeeCode || '',
      name: user.name || '',
      role,
      gender,
      team_id: user.teamId || null,
      join_date: user.joinDate || null,
      avatar_url: user.avatar || null,
      subleader_id: canHaveSubLeader(role) ? (user.subleaderId || null) : null,
      description: user.description || null,
      is_active: true,
    };

    const { data, error } = await supabaseAdmin
      .from('users')
      .upsert(dbUser)
      .select(USER_SELECT)
      .single();

    if (error || !data) {
      return { success: false, error: toClientError(error, 'Lỗi lưu nhân viên. Vui lòng thử lại.') };
    }

    const saved = mapUserFromDb(data);

    // Đổi chức vụ/team/SubLeader → đồng bộ evaluation + round 1 theo flow mới
    if (user.role || user.teamId || user.subleaderId !== undefined) {
      const syncResult = await syncEvaluationsAfterUsersChange([saved]);
      if (syncResult.errors.length > 0) {
        console.error('personnel evaluation snapshot sync rejected:', syncResult.errors);
        syncWarning = 'Hồ sơ đã lưu; một phần đồng bộ đánh giá bị từ chối vì workflow đã khóa.';
      }
    }

    // Nếu user mới → gọi ensureEvaluationsForUsers (admin) nội bộ
    if (isNewUser) {
      try {
        await ensureEvaluationsForUsers([saved]);
      } catch (err) {
        console.error('ensureEvaluationsForUsers error:', err);
      }
    }

    await logAudit(
      auth.user,
      isNewUser ? 'CREATE_USER' : 'UPDATE_USER',
      'user',
      saved.id,
      { name: saved.name, role: saved.role, teamId: saved.teamId }
    );

    revalidateUserPaths();

    return { success: true, user: saved, ...(syncWarning ? { warning: syncWarning } : {}) };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi lưu nhân viên.') };
  }
}

export async function upsertUsersAction(
  users: Partial<User>[]
): Promise<{ success: boolean; users?: User[]; error?: string; warning?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  let syncWarning: string | undefined;
  try {
    if (!users || users.length === 0) {
      return { success: true, users: [] };
    }

    // Lấy danh sách users hiện có để check slot và check isNew
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id, role, team_id')
      .eq('is_active', true);
    
    const existingSlots = (existing || []).map(mapSlot);
    const existingIdSet = new Set((existing || []).map(e => e.id));

    for (const u of users) {
      if (u.role === 'Leader' || u.role === 'SubLeader') {
        assertLeadershipSlot(u, existingSlots);
      }
    }

    const dbUsers: DbUserInsert[] = users.map(user => {
      const role = user.role || 'Employee';
      return {
        id: user.id || crypto.randomUUID(),
        employee_code: user.employeeCode || '',
        name: user.name || '',
        role,
        gender: user.gender === 'Nam' || user.gender === 'Nữ' ? user.gender : undefined,
        team_id: user.teamId || null,
        join_date: user.joinDate || null,
        avatar_url: user.avatar || null,
        subleader_id: canHaveSubLeader(role) ? (user.subleaderId || null) : null,
        description: user.description || null,
        is_active: true,
      };
    });

    const { data, error } = await supabaseAdmin
      .from('users')
      .upsert(dbUsers)
      .select(USER_SELECT);

    if (error || !data) {
      return { success: false, error: toClientError(error, 'Lỗi lưu hàng loạt nhân viên. Vui lòng thử lại.') };
    }

    const saved = (data || []).map(d => mapUserFromDb(d));

    // Đồng bộ evaluation cho user đổi chức vụ — 1 lần cho cả batch (C4)
    const usersToSync: User[] = [];
    const newUsersList: User[] = [];
    for (const u of saved) {
      const orig = users.find(x => x.id === u.id || (x.employeeCode && x.employeeCode === u.employeeCode));
      if (orig?.role || orig?.teamId) {
        usersToSync.push(u);
      }
      if (!existingIdSet.has(u.id)) {
        newUsersList.push(u);
      }
    }
    if (usersToSync.length > 0) {
      const syncResult = await syncEvaluationsAfterUsersChange(usersToSync);
      if (syncResult.errors.length > 0) {
        console.error('personnel evaluation snapshot batch sync rejected:', syncResult.errors);
        syncWarning = 'Hồ sơ đã lưu; một phần đồng bộ đánh giá bị từ chối vì workflow đã khóa.';
      }
    }

    // Tự tạo evaluation cho các user mới
    if (newUsersList.length > 0) {
      try {
        await ensureEvaluationsForUsers(newUsersList);
      } catch (err) {
        console.error('ensureEvaluationsForUsers batch error:', err);
      }
    }

    // Audit batch — 1 insert thay vì 1 insert/user (C4)
    await logAuditBatch(
      auth.user,
      saved.map((u) => ({
        action: existingIdSet.has(u.id) ? 'UPDATE_USER' : 'CREATE_USER',
        entity: 'user',
        entityId: u.id,
        detail: { name: u.name, role: u.role, teamId: u.teamId },
      }))
    );

    revalidateUserPaths();

    return { success: true, users: saved, ...(syncWarning ? { warning: syncWarning } : {}) };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi lưu hàng loạt nhân viên.') };
  }
}

export async function softDeleteUserAction(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ is_active: false })
      .eq('id', id)
      .select('id');

    if (error) {
      return { success: false, error: toClientError(error, 'Lỗi xóa nhân viên. Vui lòng thử lại.') };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Không tìm thấy nhân viên' };
    }

    revalidateUserPaths();
    await logAudit(auth.user, 'DELETE_USER', 'user', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi xóa nhân viên.') };
  }
}

export const deleteUserAction = softDeleteUserAction;
