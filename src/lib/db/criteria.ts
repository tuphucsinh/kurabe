import { supabase } from '../supabase';
import { CriteriaGroup, Role, Criterion } from '@/types';
import { Tables, TablesInsert, TablesUpdate } from '@/types/database';

type DbCriterionLevel = Tables<'criterion_levels'>;
type DbCriterionRow = Tables<'criteria'> & {
  criterion_levels?: DbCriterionLevel[]
};
type DbCriteriaGroup = Tables<'criteria_groups'> & {
  criteria?: DbCriterionRow[]
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
    console.error('Error fetching criteria groups:', error);
    return [];
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
    if (error.code !== 'PGRST116') console.error('Error fetching criteria group:', error);
    return null;
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

export async function upsertCriteriaGroup(group: Partial<CriteriaGroup>): Promise<void> {
  const dbGroup: TablesInsert<'criteria_groups'> = {
    id: group.id,
    code: group.code || '',
    name: group.name || '',
    short_name: group.shortName || null,
    sort_order: group.sortOrder ?? 0
  };

  const { error } = await supabase
    .from('criteria_groups')
    .upsert(dbGroup);

  if (error) console.error('Error upserting criteria group:', error.message || error);
}

export async function upsertCriterion(criterion: Partial<Criterion>, groupId: string): Promise<void> {
  let appliesToDb = 'both';
  if (criterion.appliesTo) {
    const hasLeader = criterion.appliesTo.includes('Manager') || criterion.appliesTo.includes('Leader');
    const hasStaff = criterion.appliesTo.includes('SubLeader') || criterion.appliesTo.includes('Employee');
    if (hasLeader && !hasStaff) appliesToDb = 'leader';
    else if (!hasLeader && hasStaff) appliesToDb = 'staff';
    else appliesToDb = 'both';
  }

  const row: TablesInsert<'criteria'> = {
    group_id: groupId,
    code: criterion.code || '',
    name: criterion.name || '',
    description: criterion.description || null,
    applies_to: appliesToDb,
    weight: criterion.weight ?? 0,
    default_level_index: criterion.defaultLevelIndex ?? null
  };
  if (criterion.id) row.id = criterion.id;

  const { data, error } = await supabase
    .from('criteria')
    .upsert(row)
    .select()
    .single();

  if (error) {
    console.error('Error upserting criterion:', error.message || error);
    return;
  }

  const criterionId = data.id;

  // Save levels: delete old then insert new
  if (criterion.levels && criterion.levels.length > 0) {
    const { error: delErr } = await supabase
      .from('criterion_levels')
      .delete()
      .eq('criterion_id', criterionId);

    if (delErr) {
      console.error('Error deleting old levels:', delErr.message || delErr);
      return;
    }

    const levelsToInsert: TablesInsert<'criterion_levels'>[] = criterion.levels.map((l, idx) => ({
      criterion_id: criterionId,
      points: l.points,
      label: l.label,
      description: l.description || null,
      sort_order: idx
    }));

    const { error: insErr } = await supabase
      .from('criterion_levels')
      .insert(levelsToInsert);

    if (insErr) console.error('Error inserting levels:', insErr.message || insErr);
  }
}

export async function updateDefaultLevel(criterionId: string, levelIndex: number | null): Promise<void> {
  const { error } = await supabase
    .from('criteria')
    .update({ default_level_index: levelIndex })
    .eq('id', criterionId);

  if (error) console.error('Error updating default level:', error.message || error);
}

export async function softDeleteCriteriaGroup(id: string): Promise<void> {
  const update: TablesUpdate<'criteria_groups'> = { is_active: false };
  const { error } = await supabase
    .from('criteria_groups')
    .update(update)
    .eq('id', id);

  if (error) console.error('Error soft deleting criteria group:', error.message || error);
}

export async function softDeleteCriterion(id: string): Promise<void> {
  const update: TablesUpdate<'criteria'> = { is_active: false };
  const { error } = await supabase
    .from('criteria')
    .update(update)
    .eq('id', id);

  if (error) console.error('Error soft deleting criterion:', error.message || error);
}

// Helpers
function mapAppliesToRoles(appliesTo: string): Role[] {
  switch (appliesTo) {
    case 'leader': return ['Manager', 'Leader'];
    case 'staff': return ['SubLeader', 'Employee'];
    case 'both': 
    default: return ['Manager', 'Leader', 'SubLeader', 'Employee'];
  }
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
        appliesTo: mapAppliesToRoles(c.applies_to || 'both'),
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

