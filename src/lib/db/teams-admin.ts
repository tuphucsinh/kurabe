import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { Team, User } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { mapTeamFromDb } from '@/lib/db/teams';

/**
 * Đọc danh sách teams bằng service_role (supabaseAdmin).
 * Phân quyền theo requester:
 * - Manager: xem tất cả teams
 * - Leader / SubLeader / Employee / Worker: xem team của mình (thiếu teamId → rỗng, chống bypass)
 */
export async function getTeamsAdmin(requester?: User | null): Promise<Team[]> {
  let query = supabaseAdmin
    .from('teams')
    .select('*')
    .eq('is_active', true);

  if (requester && requester.role !== 'Manager') {
    if (!requester.teamId) {
      return [];
    }
    query = query.eq('id', requester.teamId);
  }

  const { data, error } = await query.order('name');

  if (error) {
    throw new DatabaseError('Error fetching teams (admin)', error);
  }

  return (data || []).map(mapTeamFromDb);
}

/**
 * Đọc chi tiết team theo ID bằng service_role (supabaseAdmin).
 * Phân quyền: Manager xem mọi team; Leader / SubLeader / Employee / Worker chỉ xem team của mình.
 */
export async function getTeamByIdAdmin(
  id: string,
  requester?: User | null
): Promise<Team | null> {
  if (!id) return null;
  if (!requester) return null;

  if (requester.role !== 'Manager' && requester.teamId !== id) {
    return null;
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
