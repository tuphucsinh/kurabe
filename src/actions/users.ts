'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager, requireRole } from '@/lib/auth';
import { logAudit, logAuditBatch } from '@/lib/audit';
import { revalidatePath, revalidateTag } from 'next/cache';
import { User } from '@/types';
import { Database } from '@/types/database';
import { mapUserFromDb } from '@/lib/db/users';
import { getLeaderTeamIds } from '@/lib/db/teams-admin';
import { applyPersonnelTransaction, PersonnelTransactionUserInput } from '@/lib/db/evaluations-write';
import { toClientError } from '@/lib/errors';
import { seedDefaultPasswords } from '@/lib/db/password-seed';

type DbUser = Partial<Database['public']['Tables']['users']['Row']>;

function buildPersonnelUserPayload(
  user: Partial<User>,
  id: string,
  isNew: boolean
): PersonnelTransactionUserInput {
  const payload: PersonnelTransactionUserInput = { id };
  if (user.employeeCode !== undefined) payload.employee_code = user.employeeCode;
  if (user.name !== undefined) payload.name = user.name;
  if (user.role !== undefined) payload.role = user.role;
  if (user.teamId !== undefined) payload.team_id = user.teamId || null;
  if (user.joinDate !== undefined) payload.join_date = user.joinDate || null;
  if (user.avatar !== undefined) payload.avatar_url = user.avatar || null;
  if (user.subleaderId !== undefined) payload.subleader_id = user.subleaderId || null;
  if (user.description !== undefined) payload.description = user.description || null;
  if (user.gender !== undefined) payload.gender = user.gender;
  if (isNew) {
    if (payload.role === undefined) payload.role = 'Employee';
    if (payload.gender === undefined) payload.gender = 'Nữ';
    payload.is_active = true;
  }
  return payload;
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
    const leaderTeamIds = await getLeaderTeamIds(auth.user);
    if (leaderTeamIds.length === 0) {
      return { success: false, error: 'Bạn chưa được gán nhóm nào — liên hệ Manager.' };
    }
    if (user.role && !['Employee', 'SubLeader', 'Worker'].includes(user.role)) {
      return { success: false, error: 'Leader chỉ được tạo hoặc sửa Nhân viên/Công nhân/SubLeader trong nhóm mình lead.' };
    }

    let existingUser: { id: string; team_id: string | null; role: string } | null = null;
    if (user.id) {
      const { data, error: existingUserError } = await supabaseAdmin
        .from('users')
        .select('id, team_id, role')
        .eq('id', user.id)
        .maybeSingle();
      if (existingUserError) {
        return { success: false, error: toClientError(existingUserError, 'Lỗi kiểm tra phạm vi nhân viên hiện tại.') };
      }
      if (data) {
        existingUser = data;
        if (!data.team_id || !leaderTeamIds.includes(data.team_id)) {
          return { success: false, error: 'Bạn chỉ được sửa nhân viên trong nhóm mình lead.' };
        }
        if (!['Employee', 'SubLeader', 'Worker'].includes(data.role)) {
          return { success: false, error: 'Bạn không được sửa đổi Manager/Leader.' };
        }
      }
    }

    const targetTeamId = user.teamId ?? existingUser?.team_id ?? auth.user.teamId;
    if (!targetTeamId || !leaderTeamIds.includes(targetTeamId)) {
      return { success: false, error: 'Leader chỉ được thao tác trong nhóm mình lead.' };
    }
    user.teamId = targetTeamId;
  }

  try {
    const userId = user.id || crypto.randomUUID();
    let isNewUser = !user.id;
    if (user.id) {
      const { data: existingUser, error: lookupError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      if (lookupError) return { success: false, error: toClientError(lookupError, 'Lỗi kiểm tra nhân viên hiện tại.') };
      isNewUser = !existingUser;
    }

    const payload = buildPersonnelUserPayload(user, userId, isNewUser);
    const result = await applyPersonnelTransaction([payload], null, auth.user.id);
    if (result.error || !result.data || result.data.users.length !== 1) {
      return { success: false, error: toClientError(result.error, 'Lỗi lưu nhân viên và khởi tạo đánh giá. Không có thay đổi nào được giữ lại.') };
    }

    const saved = mapUserFromDb(result.data.users[0] as DbUser);
    await logAudit(
      auth.user,
      isNewUser ? 'CREATE_USER' : 'UPDATE_USER',
      'user',
      saved.id,
      { name: saved.name, role: saved.role, teamId: saved.teamId }
    );
    revalidateUserPaths();

    let warning: string | undefined;
    if (isNewUser) {
      const seed = await seedDefaultPasswords([userId]);
      if (seed.failed.length > 0) {
        warning = `Không thể đặt mật khẩu mặc định cho ${seed.failed.length} nhân viên (ID: ${seed.failed.map((f) => f.id).join(', ')}). Quản lý có thể đặt lại mật khẩu thủ công.`;
      }
    }

    return { success: true, user: saved, ...(warning ? { warning } : {}) };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi lưu nhân viên.') };
  }
}

export async function upsertUsersAction(
  users: Partial<User>[]
): Promise<{ success: boolean; users?: User[]; error?: string; warning?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };
  if (!users || users.length === 0) return { success: true, users: [] };

  try {
    const requestedIds = users.filter((user) => user.id).map((user) => user.id as string);
    const { data: existing, error: lookupError } = requestedIds.length > 0
      ? await supabaseAdmin.from('users').select('id').in('id', requestedIds)
      : { data: [] as Array<{ id: string }>, error: null };
    if (lookupError) return { success: false, error: toClientError(lookupError, 'Lỗi kiểm tra nhân viên hiện tại.') };

    // P110M3T02 (audit P1-1): client's code map only covers the loaded page
    // (20 rows), so an import updating a user beyond that page would mint a
    // fresh UUID and collide with the active-code unique index. Resolve ids by
    // employee_code against the full ACTIVE roster, case-insensitive — a code
    // match always means an update of that exact user.
    // P110M3T02 (audit P1-2): new Employee/Worker rows need their round-1
    // evaluator (own SubLeader); the Excel file has no such column. Auto-assign
    // only when the team has exactly one active SubLeader; anything ambiguous
    // fails the whole batch BEFORE any write.
    const { data: activeRoster, error: rosterError } = await supabaseAdmin
      .from('users')
      .select('id, employee_code, role, team_id')
      .eq('is_active', true);
    if (rosterError) return { success: false, error: toClientError(rosterError, 'Lỗi kiểm tra danh sách nhân viên đang hoạt động.') };

    const codeToId = new Map<string, string>();
    const subleadersByTeam = new Map<string, string[]>();
    for (const row of activeRoster || []) {
      const code = (row.employee_code ?? '').trim().toLowerCase();
      if (code) codeToId.set(code, row.id);
      if (row.role === 'SubLeader' && row.team_id) {
        const current = subleadersByTeam.get(row.team_id) || [];
        current.push(row.id);
        subleadersByTeam.set(row.team_id, current);
      }
    }

    const existingIdSet = new Set((existing || []).map((row) => row.id));
    const missingSubleaderCodes: string[] = [];
    const prepared = users.map((user, rowIndex) => {
      const code = (user.employeeCode ?? '').trim().toLowerCase();
      const matchedId = code ? codeToId.get(code) : undefined;
      const id = matchedId ?? user.id ?? crypto.randomUUID();
      const isNew = matchedId ? false : !existingIdSet.has(id);

      let effectiveUser = user;
      const role = user.role ?? 'Employee';
      if (isNew && (role === 'Employee' || role === 'Worker') && user.teamId && !user.subleaderId) {
        const candidates = subleadersByTeam.get(user.teamId) || [];
        if (candidates.length === 1) {
          effectiveUser = { ...user, subleaderId: candidates[0] };
        } else {
          missingSubleaderCodes.push(user.employeeCode?.trim() || `(dòng ${rowIndex + 1})`);
        }
      }

      return {
        id,
        isNew,
        payload: buildPersonnelUserPayload(effectiveUser, id, isNew),
      };
    });

    if (missingSubleaderCodes.length > 0) {
      return {
        success: false,
        error: `Không xác định được SubLeader chấm vòng 1 cho nhân viên mới: ${missingSubleaderCodes.join(', ')}. Nhóm của họ phải có đúng một SubLeader đang hoạt động, hoặc thêm/gán SubLeader trước khi import. Chưa có dữ liệu nào được ghi.`,
      };
    }

    const result = await applyPersonnelTransaction(prepared.map((item) => item.payload), null, auth.user.id);
    if (result.error || !result.data || result.data.users.length !== prepared.length) {
      return { success: false, error: toClientError(result.error, 'Lỗi lưu hàng loạt nhân viên và khởi tạo đánh giá. Không có thay đổi nào được giữ lại.') };
    }

    const updatedIdSet = new Set(prepared.filter((item) => !item.isNew).map((item) => item.id));
    const saved = result.data.users.map((row) => mapUserFromDb(row as DbUser));
    await logAuditBatch(
      auth.user,
      saved.map((user) => ({
        action: updatedIdSet.has(user.id) ? 'UPDATE_USER' : 'CREATE_USER',
        entity: 'user',
        entityId: user.id,
        detail: { name: user.name, role: user.role, teamId: user.teamId },
      }))
    );
    revalidateUserPaths();

    const newIds = prepared.filter((p) => p.isNew).map((p) => p.id);
    let warning: string | undefined;
    if (newIds.length > 0) {
      const seed = await seedDefaultPasswords(newIds);
      if (seed.failed.length > 0) {
        warning = `Không thể đặt mật khẩu mặc định cho ${seed.failed.length} nhân viên (ID: ${seed.failed.map((f) => f.id).join(', ')}). Quản lý có thể đặt lại mật khẩu thủ công.`;
      }
    }

    return { success: true, users: saved, ...(warning ? { warning } : {}) };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi lưu hàng loạt nhân viên.') };
  }
}

export async function softDeleteUserAction(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const result = await applyPersonnelTransaction([{ id, is_active: false }], null, auth.user.id);
    if (result.error || !result.data || result.data.users.length !== 1) {
      return { success: false, error: toClientError(result.error, 'Lỗi xóa nhân viên. Quan hệ nhân sự chưa hợp lệ nên không có thay đổi nào được giữ lại.') };
    }

    revalidateUserPaths();
    await logAudit(auth.user, 'DELETE_USER', 'user', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi xóa nhân viên.') };
  }
}

export const deleteUserAction = softDeleteUserAction;
