import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { User } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { USER_SELECT, mapUserFromDb } from '@/lib/db/users';

/**
 * Đọc danh sách users bằng service_role (supabaseAdmin).
 * Phân quyền theo requester:
 * - Manager: xem tất cả
 * - Employee: xem chính mình
 * - Leader / SubLeader: xem thành viên trong team của mình
 */
export async function getUsersAdmin(
  requester?: User | null,
  options?: { limit?: number; offset?: number; search?: string }
): Promise<User[]> {
  let query = supabaseAdmin
    .from('users')
    .select(USER_SELECT)
    .eq('is_active', true);

  if (requester && requester.role !== 'Manager') {
    if (requester.role === 'Employee') {
      query = query.eq('id', requester.id);
    } else if (requester.role === 'Leader' || requester.role === 'SubLeader') {
      if (!requester.teamId) {
        // Leader/SubLeader thiếu teamId → KHÔNG được xem toàn bộ (chống bypass)
        return [];
      }
      query = query.eq('team_id', requester.teamId);
    }
  }

  if (options?.search && options.search.trim()) {
    const term = options.search.trim();
    query = query.or(`name.ilike.%${term}%,employee_code.ilike.%${term}%`);
  }

  let orderedQuery = query.order('name');

  if (options?.limit) {
    orderedQuery = orderedQuery.limit(options.limit);
    if (options?.offset) {
      // Supabase range is inclusive: range(start, end)
      orderedQuery = orderedQuery.range(options.offset, options.offset + options.limit - 1);
    }
  }

  const { data, error } = await orderedQuery;

  if (error) {
    throw new DatabaseError('Error fetching users (admin)', error);
  }

  return (data || []).map(mapUserFromDb);
}

/**
 * Đọc chi tiết user theo ID bằng service_role (supabaseAdmin).
 * Phân quyền: Manager xem mọi user; Employee chỉ xem chính mình;
 * Leader/SubLeader chỉ xem user cùng team (hoặc chính mình).
 */
export async function getUserByIdAdmin(
  id: string,
  requester?: User | null
): Promise<User | null> {
  if (!id) return null;
  if (!requester) return null;

  if (requester.role !== 'Manager') {
    const sameUser = id === requester.id;
    const sameTeam = !!requester.teamId && (await isUserInTeam(id, requester.teamId!));
    if (!sameUser && !sameTeam) {
      return null;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_SELECT)
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new DatabaseError('Error fetching user (admin)', error);
  }

  return data ? mapUserFromDb(data) : null;
}

/** Kiểm tra user có thuộc team không (server-only, dùng trong phân quyền ById). */
async function isUserInTeam(userId: string, teamId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Đọc danh sách users thuộc một Team bằng service_role (supabaseAdmin).
 * Phân quyền: Manager xem mọi team; Leader/SubLeader/Employee chỉ xem team của mình.
 */
export async function getUsersByTeamAdmin(
  teamId: string,
  requester?: User | null
): Promise<User[]> {
  if (!teamId) return [];
  if (!requester) return [];

  if (requester.role !== 'Manager' && requester.teamId !== teamId) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_SELECT)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('name');

  if (error) {
    throw new DatabaseError('Error fetching users by team (admin)', error);
  }

  return (data || []).map(mapUserFromDb);
}
