import { supabase } from '../supabase';
import { CriteriaGroup, Role } from '@/types';
import { DatabaseError } from '../errors';
import { Tables } from '@/types/database';
import {
  isCriterionAudience,
  mapAudiencesToRoles,
  decodeLegacyAppliesToRoles,
} from '../criteria-applicability';

type DbCriterionLevel = Tables<'criterion_levels'>;
type DbCriterionAudience = Tables<'criterion_audiences'>;
type DbCriterionRow = Tables<'criteria'> & {
  criterion_levels?: DbCriterionLevel[];
  criterion_audiences?: Pick<DbCriterionAudience, 'audience'>[];
};
type DbCriteriaGroup = Tables<'criteria_groups'> & {
  criteria?: DbCriterionRow[];
};

export async function getAllCriteriaGroups(): Promise<CriteriaGroup[]> {
  const { data, error } = await supabase
    .from('criteria_groups')
    .select(`
      id,
      code,
      name,
      short_name,
      sort_order,
      is_active,
      criteria (
        id,
        code,
        name,
        description,
        applies_to,
        weight,
        default_level_index,
        sort_order,
        group_id,
        is_active,
        criterion_audiences (
          audience
        ),
        criterion_levels (
          id,
          criterion_id,
          points,
          label,
          description,
          sort_order
        )
      )
    `)
    .eq('is_active', true)
    .eq('criteria.is_active', true)
    .order('sort_order');

  if (error) {
    throw new DatabaseError('Error fetching criteria groups', error);
  }

  return (data || []).map(mapGroupFromDb);
}

export async function getCriteriaGroupById(id: string): Promise<CriteriaGroup | null> {
  const { data, error } = await supabase
    .from('criteria_groups')
    .select(`
      id,
      code,
      name,
      short_name,
      sort_order,
      is_active,
      criteria (
        id,
        code,
        name,
        description,
        applies_to,
        weight,
        default_level_index,
        sort_order,
        group_id,
        is_active,
        criterion_audiences (
          audience
        ),
        criterion_levels (
          id,
          criterion_id,
          points,
          label,
          description,
          sort_order
        )
      )
    `)
    .eq('id', id)
    .eq('is_active', true)
    .eq('criteria.is_active', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new DatabaseError('Error fetching criteria group', error);
  }

  return mapGroupFromDb(data);
}

export async function getCriteriaForRole(role: Role): Promise<CriteriaGroup[]> {
  const allGroups = await getAllCriteriaGroups();
  
  // Filter criteria trong từng group dựa trên appliesTo
  return allGroups.map(group => ({
    ...group,
    criteria: group.criteria.filter(c => c.appliesTo.includes(role))
  })).filter(group => group.criteria.length > 0);
}

// Helpers
function mapCriterionAppliesTo(c: DbCriterionRow): Role[] {
  // If relation rows exist, map them canonically to Criterion.appliesTo
  if (c.criterion_audiences && c.criterion_audiences.length > 0) {
    const validAudiences = c.criterion_audiences
      .map(a => a.audience)
      .filter(isCriterionAudience);

    if (validAudiences.length > 0) {
      return mapAudiencesToRoles(validAudiences);
    }
  }

  // Fallback for pre-activation window before criterion_audiences rows are populated
  return decodeLegacyAppliesToRoles(c.applies_to);
}

function mapGroupFromDb(dbGroup: DbCriteriaGroup): CriteriaGroup {
  return {
    id: dbGroup.id,
    code: dbGroup.code,
    name: dbGroup.name,
    shortName: dbGroup.short_name || '',
    criteria: (dbGroup.criteria || [])
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(c => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description || undefined,
        appliesTo: mapCriterionAppliesTo(c),
        weight: c.weight || 0,
        defaultLevelIndex: c.default_level_index ?? undefined,
        levels: (c.criterion_levels || [])
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
          .map(l => ({
            points: l.points,
            label: l.label,
            description: l.description || undefined
          }))
      }))
  };
}
