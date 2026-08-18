import type { Role, User } from '@/types';

const ALL_ROLES = ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker'] as const;

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sanitize search term:
 * - Max 50 characters
 * - Unicode letters, numbers, spaces, and hyphens only
 * - Strips PostgREST special chars (%, ,, (, ), ., :, \, ", ')
 */
export function sanitizeSearchTerm(rawSearch?: string | null): string {
  if (!rawSearch || typeof rawSearch !== 'string') return '';
  return rawSearch
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/**
 * Validate and deduplicate UUIDs (1..20 valid UUIDs).
 */
export function validateAndDedupeUuids(ids: unknown[]): string[] {
  if (!Array.isArray(ids)) return [];
  const valid = new Set<string>();
  for (const id of ids) {
    if (typeof id === 'string') {
      const trimmed = id.trim().toLowerCase();
      if (UUID_REGEX.test(trimmed)) {
        valid.add(trimmed);
        if (valid.size === 20) break;
      }
    }
  }
  return Array.from(valid);
}

export function isUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

export interface NormalizedBatchParams {
  offset: number;
  limit: number;
  search?: string;
  teamId?: string;
  role?: Role;
}

/**
 * Normalize batch query parameters:
 * - Limit: hard cap at 20 (1..20), default 20
 * - Offset: integer >= 0, default 0
 * - Search: sanitized string
 * - TeamId: non-empty string, ignoring 'all'
 * - Role: valid Role enum, ignoring 'all'
 */
export function normalizeBatchParams(params?: {
  offset?: number;
  limit?: number;
  search?: string;
  teamId?: string;
  role?: string;
}): NormalizedBatchParams {
  const rawLimit = Number(params?.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(20, Math.floor(rawLimit)) : 20;

  const rawOffset = Number(params?.offset);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

  const search = sanitizeSearchTerm(params?.search) || undefined;

  let teamId: string | undefined = undefined;
  if (params?.teamId && typeof params.teamId === 'string') {
    const t = params.teamId.trim();
    if (t && t !== 'all') {
      teamId = t;
    }
  }

  let role: Role | undefined = undefined;
  if (params?.role && typeof params.role === 'string') {
    const r = params.role.trim();
    if (r && r !== 'all' && (ALL_ROLES as readonly string[]).includes(r)) {
      role = r as Role;
    }
  }

  return { offset, limit, search, teamId, role };
}

/**
 * Compute batch result from limit+1 queried items.
 */
export function computeBatchResult<T>(
  itemsPlusOne: T[],
  limit: number,
  totalCount?: number | null,
  offset: number = 0
): { items: T[]; hasMore: boolean; totalCount: number } {
  const hasMore = itemsPlusOne.length > limit;
  const items = hasMore ? itemsPlusOne.slice(0, limit) : itemsPlusOne;
  const resolvedCount = typeof totalCount === 'number' ? totalCount : offset + items.length;
  return {
    items,
    hasMore,
    totalCount: resolvedCount,
  };
}

/**
 * Merge user batches while preserving order and deduplicating by ID.
 */
export function mergeUserBatches(existingUsers: User[], newUsers: User[]): User[] {
  const seen = new Set<string>();
  const result: User[] = [];
  for (const u of existingUsers) {
    if (u && u.id && !seen.has(u.id)) {
      seen.add(u.id);
      result.push(u);
    }
  }
  for (const u of newUsers) {
    if (u && u.id && !seen.has(u.id)) {
      seen.add(u.id);
      result.push(u);
    }
  }
  return result;
}
