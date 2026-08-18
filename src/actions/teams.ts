'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath, revalidateTag } from 'next/cache';
import { Team } from '@/types';
import { toClientError } from '@/lib/errors';
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
    const teamName = team.name || existingTeam?.name || '';
    const leaderId = team.leaderId ? team.leaderId : null;
    let leaderWasUnassigned = false;

    if (leaderId) {
      const { data: leaderUser, error: leaderLookupError } = await supabaseAdmin
        .from('users')
        .select('id, role, is_active, team_id')
        .eq('id', leaderId)
        .maybeSingle();

      if (leaderLookupError) {
        return { success: false, error: toClientError(leaderLookupError, 'Lỗi khi kiểm tra thông tin trưởng nhóm.') };
      }

      const validation = validateLeaderAssignment(
        leaderUser
          ? {
              id: leaderUser.id,
              role: leaderUser.role,
              isActive: leaderUser.is_active === true,
              teamId: leaderUser.team_id,
            }
          : null,
        teamId,
        { allowUnassigned: true }
      );

      if (!validation.ok) {
        return { success: false, error: validation.error };
      }

      if (leaderUser && leaderUser.team_id === null) {
        leaderWasUnassigned = true;
      }
    }

    const dbTeam = {
      id: teamId,
      name: teamName,
      leader_id: leaderId,
      is_active: true,
    };

    const { data, error } = await supabaseAdmin
      .from('teams')
      .upsert(dbTeam)
      .select('id, name, leader_id')
      .single();

    if (error || !data) {
      return { success: false, error: toClientError(error, 'Lỗi khi lưu nhóm. Vui lòng thử lại.') };
    }

    if (leaderId && leaderWasUnassigned) {
      const { data: updatedUsers, error: userUpdateError } = await supabaseAdmin
        .from('users')
        .update({ team_id: teamId })
        .eq('id', leaderId)
        .is('team_id', null)
        .select('id');

      if (userUpdateError) {
        return { success: false, error: toClientError(userUpdateError, 'Lỗi khi cập nhật nhóm cho trưởng nhóm.') };
      }

      if (!updatedUsers || updatedUsers.length !== 1) {
        return { success: false, error: 'Không thể gán trưởng nhóm vào nhóm. Vui lòng thử lại.' };
      }
    }

    const savedTeam: Team = {
      id: data.id,
      name: data.name,
      leaderId: data.leader_id || null,
    };

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
    const { data, error } = await supabaseAdmin
      .from('teams')
      .update({ is_active: false })
      .eq('id', id)
      .select('id');

    if (error) {
      return { success: false, error: toClientError(error, 'Lỗi khi xóa nhóm. Vui lòng thử lại.') };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Không tìm thấy nhóm' };
    }

    revalidateTeamPaths();

    await logAudit(auth.user, 'DELETE_TEAM', 'team', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi xóa nhóm.') };
  }
}

export const deleteTeamAction = softDeleteTeamAction;
