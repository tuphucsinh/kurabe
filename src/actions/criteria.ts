'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { CriteriaGroup, Criterion, Role } from '@/types';
import { Database } from '@/types/database';
import { toClientError } from '@/lib/errors';
import {
  CriterionAudience,
  CRITERION_AUDIENCES,
  validateAudiences,
  isCriterionAudience,
  mapAudiencesToRoles,
  mapRolesToAudiences,
  encodeAudiencesToLegacy,
} from '@/lib/criteria-applicability';

type DbCriteriaGroupInsert = Database['public']['Tables']['criteria_groups']['Insert'];
type DbCriterionInsert = Database['public']['Tables']['criteria']['Insert'];
type DbCriterionLevelInsert = Database['public']['Tables']['criterion_levels']['Insert'];

function revalidateCriteriaPaths() {
  revalidatePath('/criteria');
  revalidatePath('/settings');
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

    // Resolve target audiences from criterion.appliesTo
    let targetAudiences: CriterionAudience[] = ['management', 'employee'];

    if (criterion.appliesTo !== undefined) {
      if (!Array.isArray(criterion.appliesTo) || criterion.appliesTo.length === 0) {
        return { success: false, error: 'Đối tượng áp dụng không được để trống.' };
      }

      // Check if values are CriterionAudience or Role strings
      const allAreAudiences = criterion.appliesTo.every(isCriterionAudience);
      if (allAreAudiences) {
        const valRes = validateAudiences(criterion.appliesTo);
        if (!valRes.valid) {
          return { success: false, error: valRes.error };
        }
        targetAudiences = valRes.data;
      } else {
        const mapped = mapRolesToAudiences(criterion.appliesTo as Role[]);
        if (mapped.length === 0) {
          return { success: false, error: 'Đối tượng áp dụng không hợp lệ hoặc rỗng.' };
        }
        targetAudiences = mapped;
      }
    } else if (!isNew && criterion.id) {
      // If updating without appliesTo, read existing audiences to preserve them
      const { data: existingAuds } = await supabaseAdmin
        .from('criterion_audiences')
        .select('audience')
        .eq('criterion_id', criterion.id);

      if (existingAuds && existingAuds.length > 0) {
        const validAuds = existingAuds.map(a => a.audience).filter(isCriterionAudience);
        if (validAuds.length > 0) {
          targetAudiences = validAuds;
        }
      }
    }

    const legacyAppliesTo = encodeAudiencesToLegacy(targetAudiences);
    const criterionId = criterion.id || crypto.randomUUID();
    const row: DbCriterionInsert = {
      id: criterionId,
      group_id: groupId,
      code: criterion.code || '',
      name: criterion.name || '',
      description: criterion.description || null,
      applies_to: legacyAppliesTo,
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

    // Safe upsert target audience rows
    const audienceRows = targetAudiences.map(aud => ({
      criterion_id: data.id,
      audience: aud,
    }));

    const { error: audUpsertErr } = await supabaseAdmin
      .from('criterion_audiences')
      .upsert(audienceRows, { onConflict: 'criterion_id,audience' });

    if (audUpsertErr) {
      return { success: false, error: toClientError(audUpsertErr, 'Lỗi khi lưu đối tượng áp dụng.') };
    }

    // Delete obsolete audiences for this criterion
    const obsoleteAudiences = CRITERION_AUDIENCES.filter(a => !targetAudiences.includes(a));
    if (obsoleteAudiences.length > 0) {
      const { error: audDelErr } = await supabaseAdmin
        .from('criterion_audiences')
        .delete()
        .eq('criterion_id', data.id)
        .in('audience', obsoleteAudiences);

      if (audDelErr) {
        return { success: false, error: toClientError(audDelErr, 'Lỗi khi cập nhật đối tượng áp dụng.') };
      }
    }

    // Save levels: delete old then insert new only if criterion.levels is explicitly provided and non-empty
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
      appliesTo: mapAudiencesToRoles(targetAudiences),
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
      {
        code: savedCriterion.code,
        name: savedCriterion.name,
        groupId,
        audiences: targetAudiences,
      }
    );

    revalidateCriteriaPaths();

    return { success: true, criterion: savedCriterion };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi lưu tiêu chí.') };
  }
}

/**
 * Dedicated manager-only action for inline toggles of criterion applicability.
 * Validates exact audiences, ensures criterion exists, updates criterion_audiences safely,
 * updates legacy criteria.applies_to, audits the change, and revalidates /criteria and /settings.
 */
export async function updateCriterionAudiencesAction(
  criterionId: string,
  audiences: CriterionAudience[] | string[]
): Promise<{
  success: boolean;
  audiences?: CriterionAudience[];
  appliesTo?: Role[];
  error?: string;
}> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  if (!criterionId || typeof criterionId !== 'string') {
    return { success: false, error: 'ID tiêu chí không hợp lệ.' };
  }

  const validation = validateAudiences(audiences);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const targetAudiences = validation.data;

  try {
    // 1. Ensure criterion exists
    const { data: criterion, error: critErr } = await supabaseAdmin
      .from('criteria')
      .select('id, code, name, applies_to, group_id')
      .eq('id', criterionId)
      .maybeSingle();

    if (critErr || !criterion) {
      return { success: false, error: 'Không tìm thấy tiêu chí.' };
    }

    // 2. Safe upsert target audiences first (prevents empty set on intermediate failure)
    const rowsToInsert = targetAudiences.map(aud => ({
      criterion_id: criterionId,
      audience: aud,
    }));

    const { error: upsertErr } = await supabaseAdmin
      .from('criterion_audiences')
      .upsert(rowsToInsert, { onConflict: 'criterion_id,audience' });

    if (upsertErr) {
      return { success: false, error: toClientError(upsertErr, 'Lỗi khi cập nhật đối tượng áp dụng.') };
    }

    // 3. Remove obsolete audiences for this criterion
    const obsoleteAudiences = CRITERION_AUDIENCES.filter(a => !targetAudiences.includes(a));
    if (obsoleteAudiences.length > 0) {
      const { error: delErr } = await supabaseAdmin
        .from('criterion_audiences')
        .delete()
        .eq('criterion_id', criterionId)
        .in('audience', obsoleteAudiences);

      if (delErr) {
        return { success: false, error: toClientError(delErr, 'Lỗi khi cập nhật đối tượng áp dụng.') };
      }
    }

    // 4. Update legacy applies_to column for coexistence/rollback
    const legacyAppliesTo = encodeAudiencesToLegacy(targetAudiences);
    const { error: legacyErr } = await supabaseAdmin
      .from('criteria')
      .update({ applies_to: legacyAppliesTo })
      .eq('id', criterionId);

    if (legacyErr) {
      return { success: false, error: toClientError(legacyErr, 'Lỗi khi cập nhật đối tượng áp dụng.') };
    }

    const resultingRoles = mapAudiencesToRoles(targetAudiences);

    // 5. Audit log
    await logAudit(
      auth.user,
      'UPDATE_CRITERION_AUDIENCES',
      'criterion',
      criterionId,
      {
        code: criterion.code,
        name: criterion.name,
        audiences: targetAudiences,
        roles: resultingRoles,
      }
    );

    // 6. Revalidate paths
    revalidateCriteriaPaths();

    return {
      success: true,
      audiences: targetAudiences,
      appliesTo: resultingRoles,
    };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi cập nhật đối tượng áp dụng.') };
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
