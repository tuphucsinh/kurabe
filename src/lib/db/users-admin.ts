import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { User } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { USER_SELECT, mapUserFromDb } from '@/lib/db/users';
import { isIndividualRole } from '@/lib/role-policy';
import { normalizeBatchParams, computeBatchResult } from '@/lib/employee-batch-helpers';

export interface UsersBatchOptions {
  offset?: number;
  limit?: number;
  search?: string;
  teamId?: string;
  role?: string;
}

export interface UsersBatchResult {
  items: User[];
  hasMore: boolean;
  totalCount: number;
}

/**
 * Đọc danh sách users theo lô (batch) 20 dòng bằng service_role (supabaseAdmin).
 * - Hard cap limit = 20, offset >= 0
 * - Fixed sort: name ASC, id ASC
 * - RBAC: Manager xem tất cả; Leader/SubLeader xem team mình; Employee/Worker xem chính mình; thiếu team fail-closed.
 * - Search sanitized (max 50, stripped PostgREST metacharacters).
 * - Trả về { items, hasMore, totalCount } dùng limit + 1.
 */
export async function getUsersBatchAdmin(
  requester?: User | null,
  options?: UsersBatchOptions
): Promise<UsersBatchResult> {
  if (!requester) {
    return { items: [], hasMore: false, totalCount: 0 };
  }

  const { offset, limit, search, teamId, role } = normalizeBatchParams(options);

  // RBAC enforcement
  if (requester.role !== 'Manager') {
    if (isIndividualRole(requester.role)) {
      // Employee / Worker can only view self
      if (teamId && requester.teamId && teamId !== requester.teamId) {
        return { items: [], hasMore: false, totalCount: 0 };
      }
      if (role && role !== requester.role) {
        return { items: [], hasMore: false, totalCount: 0 };
      }
    } else if (requester.role === 'Leader' || requester.role === 'SubLeader') {
      // Leader/SubLeader must have teamId
      if (!requester.teamId) {
        return { items: [], hasMore: false, totalCount: 0 };
      }
      // Cannot request a different team than their own
      if (teamId && teamId !== requester.teamId) {
        return { items: [], hasMore: false, totalCount: 0 };
      }
    }
  }

  let query = supabaseAdmin
    .from('users')
    .select(USER_SELECT, { count: 'exact' })
    .eq('is_active', true);

  if (requester.role !== 'Manager') {
    if (isIndividualRole(requester.role)) {
      query = query.eq('id', requester.id);
    } else if (requester.role === 'Leader' || requester.role === 'SubLeader') {
      query = query.eq('team_id', requester.teamId);
    }
  } else {
    // Manager can filter by arbitrary teamId
    if (teamId) {
      query = query.eq('team_id', teamId);
    }
  }

  if (role) {
    query = query.eq('role', role);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,employee_code.ilike.%${search}%`);
  }

  // Stable fixed sort: name ASC, id ASC
  query = query.order('name', { ascending: true }).order('id', { ascending: true });

  // Fetch limit + 1 rows to determine hasMore without a cursor
  // Supabase range(start, end) is inclusive
  query = query.range(offset, offset + limit);

  const { data, error, count } = await query;

  if (error) {
    throw new DatabaseError('Error fetching users batch (admin)', error);
  }

  const { items, hasMore, totalCount } = computeBatchResult(data || [], limit, count, offset);

  return {
    items: items.map(mapUserFromDb),
    hasMore,
    totalCount,
  };
}

/** Danh sách users TOÀN HỆ THỐNG (service_role, KHÔNG scope) — CHỈ dùng để phát hiện 'khác nhóm' trong Chat AI.
 * KHÔNG đưa thông tin nhạy cảm của người ngoài phạm vi vào prompt. */
export async function getAllUsersAdmin(): Promise<User[]> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select(USER_SELECT)
    .eq('is_active', true)
    .order('name');
  if (error) {
    throw new DatabaseError('Error fetching all users (admin)', error);
  }
  return (data || []).map(mapUserFromDb);
}

export async function getUsersAdmin(
  requester?: User | null,
  options?: { limit?: number; offset?: number; search?: string }
): Promise<User[]> {
  let query = supabaseAdmin
    .from('users')
    .select(USER_SELECT)
    .eq('is_active', true);

  if (requester && requester.role !== 'Manager') {
    if (isIndividualRole(requester.role)) {
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
 * Phân quyền: Manager xem mọi user; Employee / Worker chỉ xem chính mình;
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
    const sameTeam = !isIndividualRole(requester.role) && !!requester.teamId && (await isUserInTeam(id, requester.teamId!));
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
 * Phân quyền: Manager xem mọi team; Leader/SubLeader xem team của mình; Employee/Worker chỉ xem chính mình.
 */
export async function getUsersByTeamAdmin(
  teamId: string,
  requester?: User | null
): Promise<User[]> {
  if (!teamId) return [];
  if (!requester) return [];

  if (requester.role !== 'Manager' && (isIndividualRole(requester.role) || requester.teamId !== teamId)) {
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
