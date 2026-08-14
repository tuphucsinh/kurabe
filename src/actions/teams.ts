'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath, revalidateTag } from 'next/cache';
import { Team } from '@/types';

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
    if (team.id) {
      const { data: existingTeam } = await supabaseAdmin
        .from('teams')
        .select('id')
        .eq('id', team.id)
        .maybeSingle();
      if (existingTeam) {
        isNewTeam = false;
      }
    }

    const teamId = team.id || crypto.randomUUID();
    const dbTeam = {
      id: teamId,
      name: team.name || '',
      leader_id: team.leaderId || null,
      is_active: true,
    };

    const { data, error } = await supabaseAdmin
      .from('teams')
      .upsert(dbTeam)
      .select('id, name, leader_id')
      .single();

    if (error || !data) {
      return { success: false, error: 'Lỗi khi lưu nhóm: ' + (error?.message || 'unknown') };
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
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
      return { success: false, error: 'Lỗi khi xóa nhóm: ' + error.message };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Không tìm thấy nhóm' };
    }

    revalidateTeamPaths();

    await logAudit(auth.user, 'DELETE_TEAM', 'team', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export const deleteTeamAction = softDeleteTeamAction;
