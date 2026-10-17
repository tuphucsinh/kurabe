import { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../supabase-admin';
import type { Database } from '@/types/database';
import type { CriteriaGroup, Criterion, CriteriaSetKey, Role } from '@/types';
import { DatabaseError } from '../errors';
import {
  isCriterionAudience,
  mapAudiencesToRoles,
  decodeLegacyAppliesToRoles,
  type CriterionAudience,
  isCriteriaSetKey,
  roleToSetKey,
  setKeyToAudience,
} from '../criteria-applicability';

type ConfigLevel = {
  id: string;
  criterion_id?: string;
  points: number;
  label: string;
  description?: string | null;
  sort_order: number;
};
type ConfigCriterion = {
  id: string;
  group_id: string;
  code: string;
  name: string;
  description?: string | null;
  applies_to?: string | null;
  audiences: string[];
  weight?: number | null;
  default_level_index?: number | null;
  sort_order: number;
  levels: ConfigLevel[];
  set_key?: string | null;
};
type ConfigGroup = {
  id: string;
  code: string;
  name: string;
  short_name?: string | null;
  sort_order: number;
  criteria: ConfigCriterion[];
  set_key?: string | null;
};
export type CriteriaConfig = {
  version: number;
  version_id: string;
  checksum: string;
  group_count?: number | null;
  criterion_count?: number | null;
  level_count?: number | null;
  audience_count?: number | null;
  groups: ConfigGroup[];
};

function parseConfig(value: unknown): CriteriaConfig {
  if (!value || typeof value !== 'object') throw new DatabaseError('Invalid criteria configuration');
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.version) || typeof raw.version_id !== 'string' || !Array.isArray(raw.groups)) {
    throw new DatabaseError('Invalid criteria configuration');
  }

  // Count metadata validation: all 4 null/undefined (legacy) OR all 4 non-negative safe integers (P108)
  const rawCounts = [raw.group_count, raw.criterion_count, raw.level_count, raw.audience_count];
  const allCountsNull = rawCounts.every((c) => c === null || c === undefined);
  const allCountsValidInts = rawCounts.every(
    (c) => typeof c === 'number' && Number.isSafeInteger(c) && c >= 0
  );

  // Mixed count metadata => fail closed
  if (!allCountsNull && !allCountsValidInts) {
    throw new DatabaseError('Invalid or mixed count metadata in criteria configuration');
  }

  const groups = raw.groups as ConfigGroup[];
  let totalCriteria = 0;
  let totalLevels = 0;
  let totalAudiences = 0;
  let hasAnyP108SetRows = false;

  for (const group of groups) {
    if (!group || typeof group !== 'object') {
      throw new DatabaseError('Invalid criteria group in configuration');
    }
    if (group.set_key !== null && group.set_key !== undefined) {
      if (!isCriteriaSetKey(group.set_key)) {
        throw new DatabaseError(`Invalid group set_key: ${String(group.set_key)}`);
      }
      hasAnyP108SetRows = true;
    }
    if (!Array.isArray(group.criteria)) {
      throw new DatabaseError('Group criteria must be an array');
    }
    totalCriteria += group.criteria.length;

    for (const criterion of group.criteria) {
      if (!criterion || typeof criterion !== 'object') {
        throw new DatabaseError('Invalid criterion in group');
      }
      if (criterion.set_key !== null && criterion.set_key !== undefined) {
        if (!isCriteriaSetKey(criterion.set_key)) {
          throw new DatabaseError(`Invalid criterion set_key: ${String(criterion.set_key)}`);
        }
        hasAnyP108SetRows = true;
      }

      // Group/criterion null/mismatch check
      if (group.set_key != null || criterion.set_key != null) {
        if (group.set_key !== criterion.set_key) {
          throw new DatabaseError('Mismatch between group set_key and criterion set_key');
        }
      }

      // In P108: exactly one audience equal set mapping
      if (criterion.set_key != null) {
        const expectedAudience = setKeyToAudience(criterion.set_key as CriteriaSetKey);
        const audiences = criterion.audiences || [];
        if (!Array.isArray(audiences) || audiences.length !== 1 || audiences[0] !== expectedAudience) {
          throw new DatabaseError(`Invalid audience for criterion in set ${criterion.set_key}`);
        }
      }

      const levels = criterion.levels || [];
      if (!Array.isArray(levels) || levels.length === 0) {
        throw new DatabaseError('Criterion must have at least one level');
      }
      totalLevels += levels.length;
      totalAudiences += (criterion.audiences || []).length;
    }
  }

  // Any P108 set rows require all 4 non-negative safe integer counts and exact matches
  if (hasAnyP108SetRows && !allCountsValidInts) {
    throw new DatabaseError('P108 criteria configuration requires complete count metadata');
  }

  if (allCountsValidInts) {
    if (
      groups.length !== raw.group_count ||
      totalCriteria !== raw.criterion_count ||
      totalLevels !== raw.level_count ||
      totalAudiences !== raw.audience_count
    ) {
      throw new DatabaseError('Criteria configuration count metadata mismatch');
    }
  }

  return raw as unknown as CriteriaConfig;
}

export async function getActiveCriteriaConfig(
  db: SupabaseClient<Database> = supabaseAdmin
): Promise<CriteriaConfig> {
  const { data, error } = await db.rpc('get_active_criteria_config');
  if (error) throw new DatabaseError('Error fetching active criteria configuration', error);
  return parseConfig(data);
}

function mapCriterion(c: ConfigCriterion, config: CriteriaConfig): Criterion {
  if (c.set_key !== null && c.set_key !== undefined && !isCriteriaSetKey(c.set_key)) {
    throw new DatabaseError(`Invalid criterion set_key: ${String(c.set_key)}`);
  }
  const setKey: CriteriaSetKey | null = isCriteriaSetKey(c.set_key) ? c.set_key : null;
  const audiences = (c.audiences || []).filter(isCriterionAudience) as CriterionAudience[];
  const roles = setKey != null
    ? mapAudiencesToRoles(audiences)
    : (audiences.length > 0 ? mapAudiencesToRoles(audiences) : decodeLegacyAppliesToRoles(c.applies_to || null));

  return {
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description || undefined,
    appliesTo: roles,
    levels: (c.levels || []).slice().sort((a, b) => a.sort_order - b.sort_order).map((level) => ({
      points: level.points,
      label: level.label,
      description: level.description || undefined,
    })),
    groupId: c.group_id,
    weight: c.weight ?? 0,
    defaultLevelIndex: c.default_level_index ?? undefined,
    sortOrder: c.sort_order,
    configVersion: config.version,
    configVersionId: config.version_id,
    setKey,
  };
}

function mapGroup(group: ConfigGroup, config: CriteriaConfig): CriteriaGroup {
  if (group.set_key !== null && group.set_key !== undefined && !isCriteriaSetKey(group.set_key)) {
    throw new DatabaseError(`Invalid group set_key: ${String(group.set_key)}`);
  }
  const setKey: CriteriaSetKey | null = isCriteriaSetKey(group.set_key) ? group.set_key : null;
  return {
    id: group.id,
    code: group.code,
    name: group.name,
    shortName: group.short_name || '',
    sortOrder: group.sort_order,
    configVersion: config.version,
    configVersionId: config.version_id,
    setKey,
    criteria: (group.criteria || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
      .map((criterion) => mapCriterion(criterion, config)),
  };
}

export async function getAllCriteriaGroups(
  db: SupabaseClient<Database> = supabaseAdmin
): Promise<CriteriaGroup[]> {
  const config = await getActiveCriteriaConfig(db);
  return config.groups.map((group) => mapGroup(group, config));
}

export async function getCriteriaGroupById(
  id: string,
  db: SupabaseClient<Database> = supabaseAdmin
): Promise<CriteriaGroup | null> {
  const config = await getActiveCriteriaConfig(db);
  const group = config.groups.find((candidate) => candidate.id === id);
  return group ? mapGroup(group, config) : null;
}

export async function getCriteriaForRole(
  role: Role,
  db: SupabaseClient<Database> = supabaseAdmin
): Promise<CriteriaGroup[]> {
  const groups = await getAllCriteriaGroups(db);
  const targetSet = roleToSetKey(role);
  return groups
    .filter((group) => group.setKey == null || group.setKey === targetSet)
    .map((group) => ({
      ...group,
      criteria: group.criteria.filter((criterion) => {
        if (criterion.setKey != null) {
          return criterion.setKey === targetSet;
        }
        return criterion.appliesTo.includes(role);
      }),
    }))
    .filter((group) => group.criteria.length > 0);
}
