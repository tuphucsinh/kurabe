'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager, requireRole } from '@/lib/auth';
import { logAudit, logAuditBatch } from '@/lib/audit';
import { revalidatePath, revalidateTag } from 'next/cache';
import { User } from '@/types';
import { Database } from '@/types/database';
import { mapUserFromDb } from '@/lib/db/users';
import { applyPersonnelTransaction, PersonnelTransactionUserInput } from '@/lib/db/evaluations-write';
import { toClientError } from '@/lib/errors';

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
    if (!auth.user.teamId) {
      return { success: false, error: 'Bạn chưa được gán nhóm nào — liên hệ Manager.' };
    }
    const leaderTeamId = auth.user.teamId;
    if (user.role && !['Employee', 'SubLeader', 'Worker'].includes(user.role)) {
      return { success: false, error: 'Leader chỉ được tạo hoặc sửa Nhân viên/Công nhân/SubLeader trong nhóm của mình.' };
    }
    user.teamId = leaderTeamId;
    if (user.id) {
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('id, team_id, role')
        .eq('id', user.id)
        .maybeSingle();
      if (existingUser) {
        if (existingUser.team_id !== leaderTeamId) {
          return { success: false, error: 'Bạn chỉ được sửa nhân viên trong nhóm mình.' };
        }
        if (!['Employee', 'SubLeader', 'Worker'].includes(existingUser.role)) {
          return { success: false, error: 'Bạn không được sửa đổi Manager/Leader.' };
        }
      }
    }
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
    const result = await applyPersonnelTransaction([payload]);
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
    return { success: true, user: saved };
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

    const existingIdSet = new Set((existing || []).map((row) => row.id));
    const prepared = users.map((user) => {
      const id = user.id || crypto.randomUUID();
      return {
        id,
        isNew: !existingIdSet.has(id),
        payload: buildPersonnelUserPayload(user, id, !existingIdSet.has(id)),
      };
    });

    const result = await applyPersonnelTransaction(prepared.map((item) => item.payload));
    if (result.error || !result.data || result.data.users.length !== prepared.length) {
      return { success: false, error: toClientError(result.error, 'Lỗi lưu hàng loạt nhân viên và khởi tạo đánh giá. Không có thay đổi nào được giữ lại.') };
    }

    const saved = result.data.users.map((row) => mapUserFromDb(row as DbUser));
    await logAuditBatch(
      auth.user,
      saved.map((user) => ({
        action: existingIdSet.has(user.id) ? 'UPDATE_USER' : 'CREATE_USER',
        entity: 'user',
        entityId: user.id,
        detail: { name: user.name, role: user.role, teamId: user.teamId },
      }))
    );
    revalidateUserPaths();
    return { success: true, users: saved };
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
