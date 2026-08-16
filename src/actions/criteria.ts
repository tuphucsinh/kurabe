'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { CriteriaGroup, Criterion, Role } from '@/types';
import { Database } from '@/types/database';
import { toClientError } from '@/lib/errors';

type DbCriteriaGroupInsert = Database['public']['Tables']['criteria_groups']['Insert'];
type DbCriterionInsert = Database['public']['Tables']['criteria']['Insert'];
type DbCriterionLevelInsert = Database['public']['Tables']['criterion_levels']['Insert'];

function revalidateCriteriaPaths() {
  revalidatePath('/criteria');
  revalidatePath('/settings');
}

function mapAppliesToRoles(appliesTo: string): Role[] {
  switch (appliesTo) {
    case 'leader': return ['Manager', 'Leader', 'SubLeader'];
    case 'staff': return ['Employee'];
    case 'both':
    default: return ['Manager', 'Leader', 'SubLeader', 'Employee'];
  }
}

export async function upsertCriteriaGroupAction(
  group: Partial<CriteriaGroup>
): Promise<{ success: boolean; group?: CriteriaGroup; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    let isNew = true;
    if (group.id) {
      const { data: existing } = await supabaseAdmin
        .from('criteria_groups')
        .select('id')
        .eq('id', group.id)
        .maybeSingle();
      if (existing) {
        isNew = false;
      }
    }

    const groupId = group.id || crypto.randomUUID();
    const dbGroup: DbCriteriaGroupInsert = {
      id: groupId,
      code: group.code || '',
      name: group.name || '',
      short_name: group.shortName || null,
      sort_order: group.sortOrder ?? 0,
      is_active: true,
    };

    const { data, error } = await supabaseAdmin
      .from('criteria_groups')
      .upsert(dbGroup)
      .select('id, code, name, short_name, sort_order')
      .single();

    if (error || !data) {
      return { success: false, error: toClientError(error, 'Lỗi khi lưu nhóm tiêu chí. Vui lòng thử lại.') };
    }

    const savedGroup: CriteriaGroup = {
      id: data.id,
      code: data.code,
      name: data.name,
      shortName: data.short_name || '',
      criteria: group.criteria || [],
      sortOrder: data.sort_order ?? 0,
    };

    await logAudit(
      auth.user,
      isNew ? 'CREATE_CRITERIA_GROUP' : 'UPDATE_CRITERIA_GROUP',
      'criteria_group',
      savedGroup.id,
      { code: savedGroup.code, name: savedGroup.name }
    );

    revalidateCriteriaPaths();

    return { success: true, group: savedGroup };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi lưu nhóm tiêu chí.') };
  }
}

export async function upsertCriterionAction(
  criterion: Partial<Criterion>,
  groupId: string
): Promise<{ success: boolean; criterion?: Criterion; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    let isNew = true;
    if (criterion.id) {
      const { data: existing } = await supabaseAdmin
        .from('criteria')
        .select('id')
        .eq('id', criterion.id)
        .maybeSingle();
      if (existing) {
        isNew = false;
      }
    }

    let appliesToDb = 'both';
    if (criterion.appliesTo) {
      const hasLeader = criterion.appliesTo.includes('Manager') || criterion.appliesTo.includes('Leader') || criterion.appliesTo.includes('SubLeader');
      const hasStaff = criterion.appliesTo.includes('Employee');
      if (hasLeader && !hasStaff) appliesToDb = 'leader';
      else if (!hasLeader && hasStaff) appliesToDb = 'staff';
      else appliesToDb = 'both';
    }

    const criterionId = criterion.id || crypto.randomUUID();
    const row: DbCriterionInsert = {
      id: criterionId,
      group_id: groupId,
      code: criterion.code || '',
      name: criterion.name || '',
      description: criterion.description || null,
      applies_to: appliesToDb,
      weight: criterion.weight ?? 0,
      default_level_index: criterion.defaultLevelIndex ?? null,
      is_active: true,
    };

    const { data, error } = await supabaseAdmin
      .from('criteria')
      .upsert(row)
      .select('id, code, name, description, applies_to, weight, default_level_index, group_id')
      .single();

    if (error || !data) {
      return { success: false, error: toClientError(error, 'Lỗi khi lưu tiêu chí. Vui lòng thử lại.') };
    }

    // Save levels: delete old then insert new
    if (criterion.levels && criterion.levels.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('criterion_levels')
        .delete()
        .eq('criterion_id', data.id);

      if (delErr) {
        return { success: false, error: toClientError(delErr, 'Lỗi khi xóa mức đánh giá cũ. Vui lòng thử lại.') };
      }

      const levelsToInsert: DbCriterionLevelInsert[] = criterion.levels.map((l, idx) => ({
        criterion_id: data.id,
        points: l.points,
        label: l.label,
        description: l.description || null,
        sort_order: idx,
      }));

      const { error: insErr } = await supabaseAdmin
        .from('criterion_levels')
        .insert(levelsToInsert);

      if (insErr) {
        return { success: false, error: toClientError(insErr, 'Lỗi khi thêm mức đánh giá. Vui lòng thử lại.') };
      }
    }

    const savedCriterion: Criterion = {
      id: data.id,
      code: data.code,
      name: data.name,
      description: data.description || undefined,
      appliesTo: mapAppliesToRoles(data.applies_to || 'both'),
      groupId: data.group_id || groupId,
      weight: data.weight || 0,
      defaultLevelIndex: data.default_level_index ?? undefined,
      levels: criterion.levels || [],
    };

    await logAudit(
      auth.user,
      isNew ? 'CREATE_CRITERION' : 'UPDATE_CRITERION',
      'criterion',
      savedCriterion.id,
      { code: savedCriterion.code, name: savedCriterion.name, groupId }
    );

    revalidateCriteriaPaths();

    return { success: true, criterion: savedCriterion };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi lưu tiêu chí.') };
  }
}

export async function updateDefaultLevelAction(
  criterionId: string,
  levelIndex: number | null
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { data, error } = await supabaseAdmin
      .from('criteria')
      .update({ default_level_index: levelIndex })
      .eq('id', criterionId)
      .select('id');

    if (error) {
      return { success: false, error: toClientError(error, 'Lỗi khi cập nhật mức mặc định. Vui lòng thử lại.') };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Không tìm thấy tiêu chí' };
    }

    revalidateCriteriaPaths();

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định. Vui lòng thử lại.') };
  }
}

export async function deleteCriteriaGroupAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { data, error } = await supabaseAdmin
      .from('criteria_groups')
      .update({ is_active: false })
      .eq('id', id)
      .select('id');

    if (error) {
      return { success: false, error: toClientError(error, 'Lỗi khi xóa nhóm tiêu chí. Vui lòng thử lại.') };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Không tìm thấy nhóm tiêu chí' };
    }

    revalidateCriteriaPaths();
    await logAudit(auth.user, 'DELETE_CRITERIA_GROUP', 'criteria_group', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi xóa nhóm tiêu chí.') };
  }
}

export async function deleteCriterionAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { data, error } = await supabaseAdmin
      .from('criteria')
      .update({ is_active: false })
      .eq('id', id)
      .select('id');

    if (error) {
      return { success: false, error: toClientError(error, 'Lỗi khi xóa tiêu chí. Vui lòng thử lại.') };
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Không tìm thấy tiêu chí' };
    }

    revalidateCriteriaPaths();
    await logAudit(auth.user, 'DELETE_CRITERION', 'criterion', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi xóa tiêu chí.') };
  }
}

export const softDeleteCriteriaGroupAction = deleteCriteriaGroupAction;
export const softDeleteCriterionAction = deleteCriterionAction;
