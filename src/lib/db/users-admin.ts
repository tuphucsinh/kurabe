import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { User, IdManifest, RosterGraphEntry } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { USER_SELECT, mapUserFromDb } from '@/lib/db/users';
import { getLeaderTeamIds } from '@/lib/db/teams-admin';
import { isIndividualRole } from '@/lib/role-policy';
import { parseRole } from '@/lib/parsers';
import { normalizeBatchParams, computeBatchResult, sanitizeSearchTerm } from '@/lib/employee-batch-helpers';

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
  subleaderMap: Record<string, string>;
}

/**
 * Resolves the effective team filter for a Leader:
 * effective filter = requestedTeam ∩ authorizedLedTeams.
 * Out-of-scope requested teams must remain denied (fail closed).
 */
export function resolveLeaderEffectiveTeamFilter(
  requestedTeamId: string | undefined,
  authorizedLedTeamIds: readonly string[]
): {
  allowed: boolean;
  effectiveTeamId?: string;
  effectiveTeamIds: string[];
} {
  if (authorizedLedTeamIds.length === 0) {
    return { allowed: false, effectiveTeamIds: [] };
  }
  if (!requestedTeamId) {
    return { allowed: true, effectiveTeamIds: [...authorizedLedTeamIds] };
  }
  if (!authorizedLedTeamIds.includes(requestedTeamId)) {
    return { allowed: false, effectiveTeamIds: [] };
  }
  return { allowed: true, effectiveTeamId: requestedTeamId, effectiveTeamIds: [requestedTeamId] };
}

/**
 * Đọc danh sách users theo lô (batch) 20 dòng bằng service_role (supabaseAdmin).
 * - Hard cap limit = 20, offset >= 0
 * - Fixed sort: name ASC, id ASC
 * - RBAC: Manager xem tất cả; Leader xem primary và team mình lead;
 *   SubLeader xem primary team; Employee/Worker xem chính mình; thiếu scope fail-closed.
 * - Search sanitized (max 50, stripped PostgREST metacharacters).
 * - Trả về { items, hasMore, totalCount, subleaderMap } dùng limit + 1.
 */
export async function getUsersBatchAdmin(
  requester?: User | null,
  options?: UsersBatchOptions
): Promise<UsersBatchResult> {
  if (!requester) {
    return { items: [], hasMore: false, totalCount: 0, subleaderMap: {} };
  }

  const { offset, limit, search, teamId, role } = normalizeBatchParams(options);
  const leaderTeamIds = requester.role === 'Leader' ? await getLeaderTeamIds(requester) : [];

  // RBAC enforcement
  if (requester.role !== 'Manager') {
    if (isIndividualRole(requester.role)) {
      // Employee / Worker can only view self
      if (teamId && requester.teamId && teamId !== requester.teamId) {
        return { items: [], hasMore: false, totalCount: 0, subleaderMap: {} };
      }
      if (role && role !== requester.role) {
        return { items: [], hasMore: false, totalCount: 0, subleaderMap: {} };
      }
    } else if (requester.role === 'Leader') {
      const leaderFilter = resolveLeaderEffectiveTeamFilter(teamId, leaderTeamIds);
      if (!leaderFilter.allowed) {
        return { items: [], hasMore: false, totalCount: 0, subleaderMap: {} };
      }
    } else if (requester.role === 'SubLeader') {
      if (!requester.teamId) {
        return { items: [], hasMore: false, totalCount: 0, subleaderMap: {} };
      }
      if (teamId && teamId !== requester.teamId) {
        return { items: [], hasMore: false, totalCount: 0, subleaderMap: {} };
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
    } else if (requester.role === 'Leader') {
      const leaderFilter = resolveLeaderEffectiveTeamFilter(teamId, leaderTeamIds);
      if (leaderFilter.effectiveTeamId) {
        query = query.eq('team_id', leaderFilter.effectiveTeamId);
      } else {
        query = query.in('team_id', leaderFilter.effectiveTeamIds);
      }
    } else if (requester.role === 'SubLeader') {
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
  const mappedUsers = items.map(mapUserFromDb);

  const subleaderIds = Array.from(
    new Set(
      mappedUsers
        .map((u) => u.subleaderId)
        .filter((id): id is string => Boolean(id))
    )
  );

  const subleaderMap: Record<string, string> = {};
  if (subleaderIds.length > 0) {
    const { data: subleaders, error: subErr } = await supabaseAdmin
      .from('users')
      .select('id, name')
      .in('id', subleaderIds);

    if (subErr) {
      console.error('Error fetching subleaders batch (admin):', subErr);
    } else if (subleaders) {
      for (const s of subleaders) {
        if (s.id && s.name) {
          subleaderMap[s.id] = s.name;
        }
      }
    }
  }

  return {
    items: mappedUsers,
    hasMore,
    totalCount,
    subleaderMap,
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
    } else if (requester.role === 'Leader') {
      const leaderTeamIds = await getLeaderTeamIds(requester);
      if (leaderTeamIds.length === 0) {
        return [];
      }
      query = query.in('team_id', leaderTeamIds);
    } else if (requester.role === 'SubLeader') {
      if (!requester.teamId) {
        return [];
      }
      query = query.eq('team_id', requester.teamId);
    }
  }

  if (options?.search) {
    const term = sanitizeSearchTerm(options.search);
    if (term) {
      query = query.or(`name.ilike.%${term}%,employee_code.ilike.%${term}%`);
    }
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
    const scopedTeamIds = requester.role === 'Leader'
      ? await getLeaderTeamIds(requester)
      : requester.teamId ? [requester.teamId] : [];
    const sameTeam = !isIndividualRole(requester.role)
      && scopedTeamIds.length > 0
      && (await isUserInAnyTeam(id, scopedTeamIds));
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
async function isUserInAnyTeam(userId: string, teamIds: string[]): Promise<boolean> {
  if (teamIds.length === 0) return false;
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .in('team_id', teamIds)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/**
 * Đọc danh sách users thuộc một Team bằng service_role (supabaseAdmin).
 * Phân quyền: Manager xem mọi team; Leader xem team mình lead; SubLeader xem primary
 * team; Employee/Worker chỉ xem chính mình.
 */
export async function getUsersByTeamAdmin(
  teamId: string,
  requester?: User | null
): Promise<User[]> {
  if (!teamId) return [];
  if (!requester) return [];

  if (requester.role !== 'Manager') {
    if (isIndividualRole(requester.role)) return [];
    const scopedTeamIds = requester.role === 'Leader'
      ? await getLeaderTeamIds(requester)
      : requester.teamId ? [requester.teamId] : [];
    if (!scopedTeamIds.includes(teamId)) return [];
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

/**
 * Stable, count-verifying pagination for the complete roster / evaluation /
 * assignment consumers.
 *
 * Contract (P107M1T05 L3/L6/P3):
 *   - Pages are fetched with a bounded page size and a deterministic stable ID
 *     order supplied by the caller's fetcher.
 *   - Every page MUST report an exact `totalCount`. A missing count, a page
 *     larger than requested, a duplicate id (unstable order), or a collected
 *     count that disagrees with the reported count is a denial — never a silent
 *     empty success.
 *   - The reader only stops when the collected id set exactly matches the
 *     reported total.
 */
export const ROSTER_PAGE_CAP = 500;

export type StableItemPage<T> = { items: T[]; totalCount: number | null };

export class RosterReadError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RosterReadError';
    this.code = code;
  }
}

export async function collectStableManifest<T>(
  fetchPage: (offset: number, limit: number) => Promise<StableItemPage<T>>,
  getId: (item: T) => string,
  options?: { pageSize?: number; expectedTotal?: number }
): Promise<{ items: T[]; ids: string[]; totalCount: number; pages: number }> {
  const requested = options?.pageSize ?? ROSTER_PAGE_CAP;
  const pageSize = Math.max(1, Math.min(requested, ROSTER_PAGE_CAP));
  const items: T[] = [];
  const ids: string[] = [];
  const seen = new Set<string>();
  let expected: number | null = options?.expectedTotal ?? null;
  let offset = 0;
  let pages = 0;

  // Hard ceiling guards an unbounded/misbehaving server from looping forever.
  const pageCeiling = 100000;

  for (;;) {
    if (pages >= pageCeiling) {
      throw new RosterReadError('ROSTER_PAGE_CEILING', 'roster pagination exceeded the page ceiling');
    }
    const page = await fetchPage(offset, pageSize);
    pages += 1;

    if (!page || !Array.isArray(page.items)) {
      throw new RosterReadError('ROSTER_PAGE_INVALID', 'roster page did not return an item list');
    }
    const totalCount = page.totalCount;
    if (totalCount === null || totalCount === undefined || !Number.isInteger(totalCount) || totalCount < 0) {
      throw new RosterReadError('ROSTER_COUNT_MISSING', 'roster page must report an exact total count');
    }
    if (expected === null) {
      expected = totalCount;
    } else if (expected !== totalCount) {
      throw new RosterReadError('ROSTER_COUNT_UNSTABLE', 'roster total count changed between pages');
    }
    if (page.items.length > pageSize) {
      throw new RosterReadError('ROSTER_PAGE_OVERSIZE', 'roster page exceeded the requested page size');
    }

    for (const item of page.items) {
      const id = getId(item);
      if (!id || typeof id !== 'string') {
        throw new RosterReadError('ROSTER_ID_INVALID', 'roster page contained an invalid id');
      }
      if (seen.has(id)) {
        throw new RosterReadError('ROSTER_ID_DUPLICATE', 'roster pagination returned a duplicate id');
      }
      seen.add(id);
      ids.push(id);
      items.push(item);
    }

    offset += page.items.length;

    if (ids.length === expected) break;
    if (ids.length > expected) {
      throw new RosterReadError('ROSTER_COUNT_MISMATCH', 'roster collected more ids than the reported count');
    }
    if (page.items.length === 0) {
      throw new RosterReadError('ROSTER_TRUNCATED', 'roster pagination ended before the reported count');
    }
  }

  if (expected === null) {
    throw new RosterReadError('ROSTER_COUNT_MISSING', 'roster reader did not observe an exact total count');
  }
  if (ids.length !== expected) {
    throw new RosterReadError('ROSTER_COUNT_MISMATCH', 'roster id count does not match the reported total');
  }
  if (options?.expectedTotal !== undefined && expected !== options.expectedTotal) {
    throw new RosterReadError('ROSTER_COUNT_MISMATCH', 'roster total count does not match the expected total');
  }

  return { items, ids, totalCount: expected, pages };
}

export async function collectStableIdManifest(
  fetchPage: (offset: number, limit: number) => Promise<{ ids: string[]; totalCount: number | null }>,
  options?: { pageSize?: number; expectedTotal?: number }
): Promise<IdManifest> {
  const result = await collectStableManifest<string>(
    async (offset, limit) => {
      const page = await fetchPage(offset, limit);
      return { items: page.ids, totalCount: page.totalCount };
    },
    (id) => id,
    options
  );
  return { ids: result.ids, totalCount: result.totalCount, pages: result.pages };
}

/** Stable-ID, count-verifying page of active roster personas (graph identity). */
async function fetchActiveRosterGraphPage(
  offset: number,
  limit: number
): Promise<StableItemPage<RosterGraphEntry>> {
  const { data, error, count } = await supabaseAdmin
    .from('users')
    .select('id, role, team_id, subleader_id', { count: 'exact' })
    .eq('is_active', true)
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new DatabaseError('Error fetching active roster page (admin)', error);
  }

  const items: RosterGraphEntry[] = (data || []).map((row) => ({
    id: row.id,
    role: parseRole(row.role),
    teamId: row.team_id ?? null,
    subleaderId: row.subleader_id ?? null,
  }));

  return { items, totalCount: count ?? null };
}

/**
 * Complete-reader: the exact active roster graph (id/role/team/subleader) in
 * stable ID order, or a thrown denial when any page/count invariant fails.
 */
export async function readActiveRosterGraphAdmin(): Promise<{
  entries: RosterGraphEntry[];
  manifest: IdManifest;
}> {
  const result = await collectStableManifest<RosterGraphEntry>(
    fetchActiveRosterGraphPage,
    (entry) => entry.id
  );
  return {
    entries: result.items,
    manifest: { ids: result.ids, totalCount: result.totalCount, pages: result.pages },
  };
}

/** Complete-reader: the exact active roster ID manifest in stable ID order. */
export async function readActiveRosterManifestAdmin(): Promise<IdManifest> {
  return collectStableIdManifest(async (offset, limit) => {
    const { data, error, count } = await supabaseAdmin
      .from('users')
      .select('id', { count: 'exact' })
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new DatabaseError('Error fetching active roster id page (admin)', error);
    }
    return { ids: (data || []).map((row) => row.id), totalCount: count ?? null };
  });
}
