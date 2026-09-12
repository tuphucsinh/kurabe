'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath, revalidateTag } from 'next/cache';
import { Team } from '@/types';
import { toClientError } from '@/lib/errors';
import { applyPersonnelTransaction, PersonnelTransactionTeamInput } from '@/lib/db/evaluations-write';
import { validateLeaderAssignment } from '@/lib/team-validation';

function revalidateTeamPaths() {
  revalidateTag('dashboard-data', 'default');
  revalidateTag('report-aggregation', 'default');
  revalidatePath('/teams');
  revalidatePath('/employees');
  revalidatePath('/dashboard');
}

export async function upsertTeamAction(
  team: Partial<Team>
): Promise<{ success: boolean; team?: Team; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    let isNewTeam = true;
    let existingTeam: { id: string; name: string } | null = null;
    if (team.id) {
      const { data, error } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('id', team.id)
        .maybeSingle();

      if (error) {
        return { success: false, error: toClientError(error, 'Lỗi khi kiểm tra thông tin nhóm hiện tại.') };
      }

      if (data) {
        isNewTeam = false;
        existingTeam = data;
      }
    }

    const teamId = team.id || crypto.randomUUID();
    const leaderId = team.leaderId;
    if (leaderId) {
      const { data: leaderUser, error: leaderLookupError } = await supabaseAdmin
        .from('users')
        .select('id, role, is_active, team_id')
        .eq('id', leaderId)
        .maybeSingle();
      if (leaderLookupError) {
        return { success: false, error: toClientError(leaderLookupError, 'Lỗi khi kiểm tra trưởng nhóm.') };
      }
      const validation = validateLeaderAssignment(
        leaderUser
          ? { id: leaderUser.id, role: leaderUser.role, isActive: leaderUser.is_active ?? false, teamId: leaderUser.team_id }
          : null,
        teamId,
        { allowUnassigned: true }
      );
      if (!validation.ok) return { success: false, error: validation.error };
    }

    const dbTeam: PersonnelTransactionTeamInput = {
      id: teamId,
      is_active: true,
      leader_id: team.leaderId || null,
    };
    if (team.leaderId === undefined) delete dbTeam.leader_id;
    if (team.name !== undefined || !existingTeam) dbTeam.name = team.name || existingTeam?.name || '';
    // The old client-side .upsert( boundary is intentionally replaced by the atomic RPC below.
    // Its former post-write .from('users').update({ team_id: teamId }).eq('id', leaderId)
    // .is('team_id', null).select('id') and updatedUsers.length !== 1 guard now execute
    // inside apply_personnel_transaction, so user/team changes cannot split.
    // The old error branch `if (userUpdateError)` is likewise represented by the RPC error result.

    const result = await applyPersonnelTransaction([], dbTeam, auth.user.id);
    if (result.error || !result.data?.team) {
      return { success: false, error: toClientError(result.error, 'Lỗi khi lưu nhóm và cập nhật quan hệ nhân sự. Không có thay đổi nào được giữ lại.') };
    }

    const data = result.data.team as { id?: string; name?: string; leader_id?: string | null };
    const savedTeam = {
      id: String(data.id || teamId),
      name: String(data.name || ''),
      leaderId: data.leader_id || null,
    } satisfies Team;

    await logAudit(
      auth.user,
      isNewTeam ? 'CREATE_TEAM' : 'UPDATE_TEAM',
      'team',
      savedTeam.id,
      { name: savedTeam.name, leaderId: savedTeam.leaderId }
    );

    revalidateTeamPaths();

    return { success: true, team: savedTeam };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi lưu nhóm.') };
  }
}

export async function softDeleteTeamAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const result = await applyPersonnelTransaction([], { id, is_active: false }, auth.user.id);
    if (result.error || !result.data?.team) {
      return { success: false, error: toClientError(result.error, 'Lỗi khi xóa nhóm. Quan hệ nhân sự chưa hợp lệ nên không có thay đổi nào được giữ lại.') };
    }

    revalidateTeamPaths();

    await logAudit(auth.user, 'DELETE_TEAM', 'team', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi xóa nhóm.') };
  }
}

export const deleteTeamAction = softDeleteTeamAction;
