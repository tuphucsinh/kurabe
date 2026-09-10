import { supabase } from '../supabase';
import { CriteriaGroup, Criterion, Role } from '@/types';
import { DatabaseError } from '../errors';
import { isCriterionAudience, mapAudiencesToRoles, decodeLegacyAppliesToRoles, CriterionAudience } from '../criteria-applicability';

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
};
type ConfigGroup = {
  id: string;
  code: string;
  name: string;
  short_name?: string | null;
  sort_order: number;
  criteria: ConfigCriterion[];
};
export type CriteriaConfig = {
  version: number;
  version_id: string;
  checksum: string;
  groups: ConfigGroup[];
};

function parseConfig(value: unknown): CriteriaConfig {
  if (!value || typeof value !== 'object') throw new DatabaseError('Invalid criteria configuration');
  const raw = value as Record<string, unknown>;
  if (!Number.isSafeInteger(raw.version) || typeof raw.version_id !== 'string' || !Array.isArray(raw.groups)) {
    throw new DatabaseError('Invalid criteria configuration');
  }
  return raw as unknown as CriteriaConfig;
}

export async function getActiveCriteriaConfig(): Promise<CriteriaConfig> {
  const { data, error } = await supabase.rpc('get_active_criteria_config');
  if (error) throw new DatabaseError('Error fetching active criteria configuration', error);
  return parseConfig(data);
}

function mapCriterion(c: ConfigCriterion, config: CriteriaConfig): Criterion {
  const audiences = c.audiences.filter(isCriterionAudience) as CriterionAudience[];
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description || undefined,
    appliesTo: audiences.length > 0 ? mapAudiencesToRoles(audiences) : decodeLegacyAppliesToRoles(c.applies_to || null),
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
  };
}

function mapGroup(group: ConfigGroup, config: CriteriaConfig): CriteriaGroup {
  return {
    id: group.id,
    code: group.code,
    name: group.name,
    shortName: group.short_name || '',
    sortOrder: group.sort_order,
    configVersion: config.version,
    configVersionId: config.version_id,
    criteria: (group.criteria || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
      .map((criterion) => mapCriterion(criterion, config)),
  };
}

export async function getAllCriteriaGroups(): Promise<CriteriaGroup[]> {
  const config = await getActiveCriteriaConfig();
  return config.groups.map((group) => mapGroup(group, config));
}

export async function getCriteriaGroupById(id: string): Promise<CriteriaGroup | null> {
  const config = await getActiveCriteriaConfig();
  const group = config.groups.find((candidate) => candidate.id === id);
  return group ? mapGroup(group, config) : null;
}

export async function getCriteriaForRole(role: Role): Promise<CriteriaGroup[]> {
  const groups = await getAllCriteriaGroups();
  return groups
    .map((group) => ({ ...group, criteria: group.criteria.filter((criterion) => criterion.appliesTo.includes(role)) }))
    .filter((group) => group.criteria.length > 0);
}
