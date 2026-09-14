import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { Team, User } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { mapTeamFromDb } from '@/lib/db/teams';

/**
 * Đọc danh sách teams bằng service_role (supabaseAdmin).
 * Phân quyền theo requester:
 * - Manager: xem tất cả teams
 * - Leader: xem primary team và các active team có leader_id trỏ tới mình
 * - SubLeader / Employee / Worker: xem team của mình (thiếu teamId → rỗng, chống bypass)
 */
export async function getTeamsAdmin(requester?: User | null): Promise<Team[]> {
  let query = supabaseAdmin
    .from('teams')
    .select('*')
    .eq('is_active', true);

  if (requester && requester.role !== 'Manager') {
    const scopedTeamIds = requester.role === 'Leader'
      ? await getLeaderTeamIds(requester)
      : requester.teamId ? [requester.teamId] : [];
    if (scopedTeamIds.length === 0) {
      return [];
    }
    query = query.in('id', scopedTeamIds);
  }

  const { data, error } = await query.order('name');

  if (error) {
    throw new DatabaseError('Error fetching teams (admin)', error);
  }

  return (data || []).map(mapTeamFromDb);
}

/**
 * Đọc chi tiết team theo ID bằng service_role (supabaseAdmin).
 * Phân quyền: Manager xem mọi team; Leader xem primary team và team mình lead;
 * các role khác chỉ xem primary team.
 */
export async function getTeamByIdAdmin(
  id: string,
  requester?: User | null
): Promise<Team | null> {
  if (!id) return null;
  if (!requester) return null;

  if (requester.role !== 'Manager') {
    const scopedTeamIds = requester.role === 'Leader'
      ? await getLeaderTeamIds(requester)
      : requester.teamId ? [requester.teamId] : [];
    if (!scopedTeamIds.includes(id)) return null;
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('*')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Error fetching team (admin)', error);
  }

  return data ? mapTeamFromDb(data) : null;
}

/**
 * Returns the active teams a Leader may administer. The primary team remains
 * in scope for backwards compatibility; appointed secondary teams are added
 * from teams.leader_id rather than inferred from users.team_id.
 */
export async function getLeaderTeamIds(requester: User): Promise<string[]> {
  if (requester.role !== 'Leader') {
    return requester.teamId ? [requester.teamId] : [];
  }

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('is_active', true)
    .eq('leader_id', requester.id);

  if (error) {
    throw new DatabaseError('Error fetching Leader team scope (admin)', error);
  }

  let activePrimaryTeamId: string | null = null;
  if (requester.teamId) {
    const { data: primaryTeam, error: primaryError } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('id', requester.teamId)
      .eq('is_active', true)
      .maybeSingle();

    if (primaryError) {
      throw new DatabaseError('Error fetching Leader primary team scope (admin)', primaryError);
    }
    activePrimaryTeamId = primaryTeam?.id ?? null;
  }

  return Array.from(new Set([
    ...(activePrimaryTeamId ? [activePrimaryTeamId] : []),
    ...(data || []).map((team: { id: string }) => team.id),
  ]));
}
