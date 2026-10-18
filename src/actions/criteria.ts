'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { CriteriaGroup, Criterion, CriteriaSetKey, Role } from '@/types';
import { toClientError, ClientSafeError } from '@/lib/errors';
import {
  CriterionAudience,
  isCriteriaSetKey,
  setKeyToAudience,
  mapAudiencesToRoles,
  isCriterionAudience,
} from '@/lib/criteria-applicability';
import type { Json } from '@/types/database';
import type { CriteriaConfig } from '@/lib/db/criteria';

type ConfigLevel = CriteriaConfig['groups'][number]['criteria'][number]['levels'][number];
type ConfigCriterion = CriteriaConfig['groups'][number]['criteria'][number];
type ConfigGroup = CriteriaConfig['groups'][number];

type ActionResult<T> = { success: boolean; error?: string; value?: T };

export type CriteriaEditState = {
  hasActivePeriod: boolean;
  isLegacy: boolean;
  activePeriodName?: string | null;
  canEdit: boolean;
};

function revalidateCriteriaPaths() {
  revalidatePath('/criteria');
  revalidatePath('/settings');
}

function validExpectedVersion(version: unknown): version is number {
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 1;
}

function mapCriteriaError(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : (typeof error === 'object' && error !== null && 'message' in error)
      ? String((error as { message: unknown }).message)
      : String(error);

  const code = (typeof error === 'object' && error !== null && 'code' in error)
    ? String((error as { code: unknown }).code)
    : '';

  if (message.includes('P99M3T02_CONFIG_STALE') || code === 'P99M3T02_CONFIG_STALE') {
    return 'Cấu hình tiêu chí đã thay đổi. Vui lòng tải lại trang trước khi lưu.';
  }
  if (message.includes('P108_PERIOD_ACTIVE') || code === 'P108_PERIOD_ACTIVE') {
    return 'Không thể chỉnh sửa tiêu chuẩn khi đang có kỳ đánh giá đang hoạt động.';
  }
  if (message.includes('P108_SET_IMMUTABLE') || code === 'P108_SET_IMMUTABLE') {
    return 'Không thể chuyển nhóm hoặc tiêu chí sang bộ tiêu chí khác.';
  }
  if (message.includes('P99M3T02_INVALID_CONFIG') || code === 'P99M3T02_INVALID_CONFIG') {
    return 'Dữ liệu cấu hình tiêu chí không hợp lệ.';
  }

  return toClientError(error, fallback);
}

async function loadConfig(): Promise<CriteriaConfig> {
  const { data, error } = await supabaseAdmin.rpc('get_active_criteria_config');
  if (error || !data || typeof data !== 'object') throw error || new Error('invalid criteria config');
  const config = data as unknown as CriteriaConfig;
  if (!validExpectedVersion(config.version) || typeof config.version_id !== 'string' || !Array.isArray(config.groups)) {
    throw new Error('invalid criteria config');
  }
  return config;
}

async function saveConfig(config: CriteriaConfig, expectedVersion: number): Promise<CriteriaConfig> {
  const { data, error } = await supabaseAdmin.rpc('save_criteria_config', {
    p_config: config as unknown as Json,
    p_expected_version: expectedVersion,
  });
  if (error) {
    throw error;
  }
  return data as unknown as CriteriaConfig;
}

async function editConfig<T>(
  expectedVersion: number | undefined,
  edit: (config: CriteriaConfig) => { value: T; unchanged?: boolean } | T
): Promise<{ config: CriteriaConfig; value: T; unchanged?: boolean }> {
  if (!validExpectedVersion(expectedVersion)) {
    throw new Error('P99M3T02_CONFIG_STALE');
  }
  const current = await loadConfig();
  if (current.version !== expectedVersion) {
    throw new Error('P99M3T02_CONFIG_STALE');
  }

  // Refuse save if catalog is legacy (groups with null set_key)
  if (current.groups.some((g) => !g.set_key || !isCriteriaSetKey(g.set_key))) {
    throw new ClientSafeError('Danh mục tiêu chuẩn cũ chưa phân bổ theo bộ tiêu chí (chờ import dữ liệu). Không thể lưu.');
  }

  // Active evaluation period check
  const { data: activePeriods, error: periodErr } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, name, status')
    .eq('status', 'active')
    .limit(1);

  if (periodErr) throw periodErr;
  if (Array.isArray(activePeriods) && activePeriods.length > 0) {
    throw new Error('P108_PERIOD_ACTIVE: criteria config cannot be modified while an evaluation period is active');
  }

  const result = edit(current);
  const isUnchanged = typeof result === 'object' && result !== null && 'unchanged' in result && (result as { unchanged?: boolean }).unchanged === true;
  const value = typeof result === 'object' && result !== null && 'value' in result ? (result as { value: T }).value : (result as T);

  if (isUnchanged) {
    return { config: current, value, unchanged: true };
  }

  const saved = await saveConfig(current, expectedVersion);
  return { config: saved, value, unchanged: false };
}

function toCriterion(c: ConfigCriterion, config: CriteriaConfig): Criterion {
  const setKey = (c.set_key && isCriteriaSetKey(c.set_key)) ? (c.set_key as CriteriaSetKey) : null;
  const audiences = setKey
    ? [setKeyToAudience(setKey)]
    : ((c.audiences || []).filter(isCriterionAudience) as CriterionAudience[]);
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    description: c.description || undefined,
    appliesTo: audiences.length ? mapAudiencesToRoles(audiences) : [],
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

function toGroup(group: ConfigGroup, config: CriteriaConfig): CriteriaGroup {
  const setKey = (group.set_key && isCriteriaSetKey(group.set_key)) ? (group.set_key as CriteriaSetKey) : null;
  return {
    id: group.id,
    code: group.code,
    name: group.name,
    shortName: group.short_name || '',
    sortOrder: group.sort_order,
    configVersion: config.version,
    configVersionId: config.version_id,
    setKey,
    criteria: (group.criteria || []).map((criterion) => toCriterion(criterion, config)),
  };
}

function findCriterion(
  config: CriteriaConfig,
  id: string
): { group: ConfigGroup; criterion: ConfigCriterion; groupIndex: number; criterionIndex: number } | null {
  for (let gIdx = 0; gIdx < config.groups.length; gIdx++) {
    const group = config.groups[gIdx];
    const cIdx = group.criteria.findIndex((candidate) => candidate.id === id);
    if (cIdx >= 0) {
      return { group, criterion: group.criteria[cIdx], groupIndex: gIdx, criterionIndex: cIdx };
    }
  }
  return null;
}

export async function getCriteriaEditStateAction(): Promise<{
  success: boolean;
  state?: CriteriaEditState;
  error?: string;
}> {
  const auth = await requireAuth();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { data: activePeriods, error: periodErr } = await supabaseAdmin
      .from('evaluation_periods')
      .select('id, name, status')
      .eq('status', 'active')
      .limit(1);

    if (periodErr) throw periodErr;

    const hasActivePeriod = Array.isArray(activePeriods) && activePeriods.length > 0;
    const activePeriodName = hasActivePeriod ? activePeriods[0].name : null;

    let isLegacy = false;
    try {
      const config = await loadConfig();
      isLegacy = !config.groups || config.groups.length === 0 || config.groups.some((g) => !g.set_key || !isCriteriaSetKey(g.set_key));
    } catch {
      isLegacy = true;
    }

    const isManager = auth.user.role === 'Manager';
    const canEdit = isManager && !hasActivePeriod && !isLegacy;

    return {
      success: true,
      state: {
        hasActivePeriod,
        isLegacy,
        activePeriodName,
        canEdit,
      },
    };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi khi kiểm tra trạng thái chỉnh sửa.') };
  }
}

export async function upsertCriteriaGroupAction(
  group: Partial<CriteriaGroup> & { setKey?: CriteriaSetKey | null },
  expectedVersion?: number
): Promise<{ success: boolean; group?: CriteriaGroup; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { config, value } = await editConfig(expectedVersion, (current) => {
      if (group.id) {
        const existing = current.groups.find((candidate) => candidate.id === group.id);
        if (existing) {
          if (group.setKey && existing.set_key && group.setKey !== existing.set_key) {
            throw new ClientSafeError('P108_SET_IMMUTABLE: Không thể chuyển nhóm tiêu chí sang bộ tiêu chí khác.');
          }
          if (group.code && group.code !== existing.code) {
            const targetSet = existing.set_key;
            if (current.groups.some((g) => g.id !== group.id && g.set_key === targetSet && g.code.toUpperCase() === group.code!.toUpperCase())) {
              throw new ClientSafeError(`Mã nhóm ${group.code} đã tồn tại trong bộ tiêu chí.`);
            }
            existing.code = group.code;
          }
          existing.name = group.name || existing.name;
          existing.short_name = group.shortName ?? existing.short_name;
          existing.sort_order = group.sortOrder ?? existing.sort_order;
          return existing;
        }
      }

      const setKey = group.setKey;
      if (!setKey || !isCriteriaSetKey(setKey)) {
        throw new ClientSafeError('Bộ tiêu chí không hợp lệ hoặc chưa được chọn.');
      }
      if (!group.code || !/^[A-Z]$/.test(group.code)) {
        throw new ClientSafeError('Mã nhóm phải là 1 ký tự chữ cái in hoa (A-Z).');
      }
      if (current.groups.some((g) => g.set_key === setKey && g.code.toUpperCase() === group.code!.toUpperCase())) {
        throw new ClientSafeError(`Mã nhóm ${group.code} đã tồn tại trong bộ tiêu chí.`);
      }

      const created: ConfigGroup = {
        id: group.id || crypto.randomUUID(),
        set_key: setKey,
        code: group.code,
        name: group.name || '',
        short_name: group.shortName || null,
        sort_order: group.sortOrder ?? current.groups.filter((g) => g.set_key === setKey).length,
        criteria: [],
      };
      current.groups.push(created);
      return created;
    });

    await logAudit(auth.user, group.id ? 'UPDATE_CRITERIA_GROUP' : 'CREATE_CRITERIA_GROUP', 'criteria_group', value.id, {
      code: value.code,
      name: value.name,
      set_key: value.set_key,
    });
    revalidateCriteriaPaths();
    return { success: true, group: toGroup(value, config) };
  } catch (error: unknown) {
    return { success: false, error: mapCriteriaError(error, 'Lỗi khi lưu nhóm tiêu chí. Vui lòng thử lại.') };
  }
}

export async function upsertCriterionAction(
  criterion: Partial<Criterion> & { setKey?: CriteriaSetKey | null },
  groupId: string,
  expectedVersion?: number,
  expectedSetKey?: CriteriaSetKey
): Promise<{ success: boolean; criterion?: Criterion; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const { config, value } = await editConfig(expectedVersion, (current) => {
      const targetGroup = current.groups.find((candidate) => candidate.id === groupId);
      if (!targetGroup) throw new ClientSafeError('Không tìm thấy nhóm tiêu chí.');

      const targetSet = targetGroup.set_key;
      if (!targetSet || !isCriteriaSetKey(targetSet)) {
        throw new ClientSafeError('Nhóm tiêu chí không có bộ tiêu chí hợp lệ.');
      }

      if (expectedSetKey && targetSet !== expectedSetKey) {
        throw new ClientSafeError('Nhóm tiêu chí không thuộc bộ tiêu chí chỉ định.');
      }

      if (criterion.setKey && criterion.setKey !== targetSet) {
        throw new ClientSafeError('Bộ tiêu chí của tiêu chí không khớp với nhóm tiêu chí.');
      }

      let existingCriterion: ConfigCriterion | undefined;
      let existingGroup: ConfigGroup | undefined;
      if (criterion.id) {
        const found = findCriterion(current, criterion.id);
        if (found) {
          existingCriterion = found.criterion;
          existingGroup = found.group;

          const existingSet = existingGroup.set_key;
          if (existingSet && existingSet !== targetSet) {
            throw new ClientSafeError('P108_SET_IMMUTABLE: Không thể chuyển tiêu chí sang bộ tiêu chí khác.');
          }

          if (existingGroup.id !== targetGroup.id) {
            existingGroup.criteria = existingGroup.criteria.filter((c) => c.id !== criterion.id);
            targetGroup.criteria.push(existingCriterion);
            existingCriterion.group_id = targetGroup.id;
          }
        }
      }

      const derivedAudience = setKeyToAudience(targetSet as CriteriaSetKey);
      const audiences: CriterionAudience[] = [derivedAudience];

      const id = existingCriterion?.id || criterion.id || crypto.randomUUID();
      const levels = criterion.levels === undefined
        ? (existingCriterion?.levels || [])
        : criterion.levels.map((level, index) => ({
            id: (level as { id?: string }).id || crypto.randomUUID(),
            criterion_id: id,
            points: level.points,
            label: level.label,
            description: level.description || null,
            sort_order: index,
          }));

      if (levels.length === 0) {
        throw new ClientSafeError('Tiêu chí phải có ít nhất một mức điểm.');
      }

      // P108 G1 explicit scoring: deny setting any NEW non-null default level index (including 0)
      if (
        criterion.defaultLevelIndex !== undefined &&
        criterion.defaultLevelIndex !== null &&
        criterion.defaultLevelIndex !== existingCriterion?.default_level_index
      ) {
        throw new ClientSafeError(
          'Không thể đặt mức mặc định cho tiêu chí. Hệ thống áp dụng cơ chế chấm điểm tường minh (không chọn sẵn mức mặc định).'
        );
      }

      const next: ConfigCriterion = {
        id,
        group_id: targetGroup.id,
        set_key: targetSet,
        code: criterion.code || existingCriterion?.code || '',
        name: criterion.name || existingCriterion?.name || '',
        description: criterion.description !== undefined
          ? ((criterion.description && criterion.description.trim()) || null)
          : (existingCriterion?.description ?? null),
        applies_to: derivedAudience,
        audiences,
        weight: criterion.weight ?? existingCriterion?.weight ?? 0,
        default_level_index: criterion.defaultLevelIndex !== undefined
          ? criterion.defaultLevelIndex
          : (existingCriterion?.default_level_index ?? null),
        sort_order: criterion.sortOrder ?? existingCriterion?.sort_order ?? targetGroup.criteria.length,
        levels: levels.map((level, index) => ({
          ...level,
          criterion_id: id,
          sort_order: index,
        })),
      };

      if (existingCriterion) {
        Object.assign(existingCriterion, next);
      } else {
        targetGroup.criteria.push(next);
      }

      return next;
    });

    await logAudit(auth.user, criterion.id ? 'UPDATE_CRITERION' : 'CREATE_CRITERION', 'criterion', value.id, {
      code: value.code,
      name: value.name,
      groupId,
      set_key: value.set_key,
    });
    revalidateCriteriaPaths();
    return { success: true, criterion: toCriterion(value, config) };
  } catch (error: unknown) {
    return { success: false, error: mapCriteriaError(error, 'Lỗi khi lưu tiêu chí. Vui lòng thử lại.') };
  }
}

export async function updateDefaultLevelAction(
  criterionId: string,
  levelIndex: number | null,
  expectedVersion: number | undefined,
  expectedSetKey: CriteriaSetKey
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  if (!expectedSetKey || !isCriteriaSetKey(expectedSetKey)) {
    return { success: false, error: 'Bộ tiêu chí không hợp lệ hoặc chưa được chỉ định.' };
  }

  try {
    const { unchanged } = await editConfig(expectedVersion, (config) => {
      const found = findCriterion(config, criterionId);
      if (!found) throw new ClientSafeError('Không tìm thấy tiêu chí.');

      if (found.group.set_key !== expectedSetKey) {
        throw new ClientSafeError('Tiêu chí không thuộc bộ tiêu chí chỉ định.');
      }

      // Preserve pre-existing values if not changed (zero write / no-op)
      if (found.criterion.default_level_index === levelIndex) {
        return { value: found.criterion, unchanged: true };
      }

      // P108 G1 explicit scoring: deny setting any NEW non-null default level index (including 0)
      if (levelIndex !== null) {
        throw new ClientSafeError(
          'Không thể đặt mức mặc định cho tiêu chí. Hệ thống áp dụng cơ chế chấm điểm tường minh (không chọn sẵn mức mặc định).'
        );
      }

      // Allow null clearing if appropriate
      found.criterion.default_level_index = null;
      return { value: found.criterion, unchanged: false };
    });

    if (!unchanged) {
      revalidateCriteriaPaths();
    }
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: mapCriteriaError(error, 'Lỗi khi cập nhật mức mặc định. Vui lòng thử lại.') };
  }
}

export async function deleteCriteriaGroupAction(
  id: string,
  expectedVersion: number | undefined,
  expectedSetKey: CriteriaSetKey
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  if (!expectedSetKey || !isCriteriaSetKey(expectedSetKey)) {
    return { success: false, error: 'Bộ tiêu chí không hợp lệ hoặc chưa được chỉ định.' };
  }

  try {
    await editConfig(expectedVersion, (config) => {
      const index = config.groups.findIndex((group) => group.id === id);
      if (index < 0) throw new ClientSafeError('Không tìm thấy nhóm tiêu chí.');
      const targetGroup = config.groups[index];

      if (targetGroup.set_key !== expectedSetKey) {
        throw new ClientSafeError('Nhóm tiêu chí không thuộc bộ tiêu chí chỉ định.');
      }

      if (config.groups.length <= 1) {
        throw new ClientSafeError('Phải giữ lại ít nhất một nhóm tiêu chí.');
      }

      config.groups.splice(index, 1);
      return id;
    });
    revalidateCriteriaPaths();
    await logAudit(auth.user, 'DELETE_CRITERIA_GROUP', 'criteria_group', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: mapCriteriaError(error, 'Lỗi khi xóa nhóm tiêu chí. Vui lòng thử lại.') };
  }
}

export async function deleteCriterionAction(
  id: string,
  expectedVersion: number | undefined,
  expectedSetKey: CriteriaSetKey
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  if (!expectedSetKey || !isCriteriaSetKey(expectedSetKey)) {
    return { success: false, error: 'Bộ tiêu chí không hợp lệ hoặc chưa được chỉ định.' };
  }

  try {
    await editConfig(expectedVersion, (config) => {
      const found = findCriterion(config, id);
      if (!found) throw new ClientSafeError('Không tìm thấy tiêu chí.');

      if (found.group.set_key !== expectedSetKey) {
        throw new ClientSafeError('Tiêu chí không thuộc bộ tiêu chí chỉ định.');
      }

      found.group.criteria = found.group.criteria.filter((criterion) => criterion.id !== id);
      return id;
    });
    revalidateCriteriaPaths();
    await logAudit(auth.user, 'DELETE_CRITERION', 'criterion', id);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: mapCriteriaError(error, 'Lỗi khi xóa tiêu chí. Vui lòng thử lại.') };
  }
}

export async function softDeleteCriteriaGroupAction(
  id: string,
  expectedVersion: number | undefined,
  expectedSetKey: CriteriaSetKey
): Promise<{ success: boolean; error?: string }> {
  return deleteCriteriaGroupAction(id, expectedVersion, expectedSetKey);
}

export async function softDeleteCriterionAction(
  id: string,
  expectedVersion: number | undefined,
  expectedSetKey: CriteriaSetKey
): Promise<{ success: boolean; error?: string }> {
  return deleteCriterionAction(id, expectedVersion, expectedSetKey);
}
