'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { CriteriaGroup, Criterion, Role } from '@/types';
import { toClientError } from '@/lib/errors';
import {
  CriterionAudience,
  validateAudiences,
  isCriterionAudience,
  mapAudiencesToRoles,
  mapRolesToAudiences,
  encodeAudiencesToLegacy,
} from '@/lib/criteria-applicability';
import type { Json } from '@/types/database';
import type { CriteriaConfig } from '@/lib/db/criteria';

type ConfigCriterion = CriteriaConfig['groups'][number]['criteria'][number];
type ConfigGroup = CriteriaConfig['groups'][number];

type ActionResult<T> = { success: boolean; error?: string; value?: T };

function revalidateCriteriaPaths() {
  revalidatePath('/criteria');
  revalidatePath('/settings');
}

function staleError(): ActionResult<never> {
  return { success: false, error: 'Cấu hình tiêu chí đã thay đổi. Vui lòng tải lại trang trước khi lưu.' };
}

function validExpectedVersion(version: unknown): version is number {
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 1;
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
    const code = (error as { code?: string }).code;
    if (code === 'P99M3T02_CONFIG_STALE') throw new Error('P99M3T02_CONFIG_STALE');
    throw error;
  }
  return data as unknown as CriteriaConfig;
}

async function editConfig<T>(expectedVersion: number | undefined, edit: (config: CriteriaConfig) => T): Promise<{ config: CriteriaConfig; value: T }> {
  if (!validExpectedVersion(expectedVersion)) throw new Error('P99M3T02_CONFIG_STALE');
  const current = await loadConfig();
  if (current.version !== expectedVersion) throw new Error('P99M3T02_CONFIG_STALE');
  const value = edit(current);
  const saved = await saveConfig(current, expectedVersion);
  return { config: saved, value };
}

function toCriterion(c: ConfigCriterion, config: CriteriaConfig): Criterion {
  const audiences = (c.audiences || []).filter(isCriterionAudience) as CriterionAudience[];
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
  };
}

function toGroup(group: ConfigGroup, config: CriteriaConfig): CriteriaGroup {
  return {
    id: group.id,
    code: group.code,
    name: group.name,
    shortName: group.short_name || '',
    sortOrder: group.sort_order,
    configVersion: config.version,
    configVersionId: config.version_id,
    criteria: (group.criteria || []).map((criterion) => toCriterion(criterion, config)),
  };
}

function audienceInput(value: unknown): CriterionAudience[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const direct = value.every(isCriterionAudience);
  if (direct) {
    const result = validateAudiences(value);
    return result.valid ? result.data : null;
  }
  const result = mapRolesToAudiences(value as Role[]);
  return result.length ? result : null;
}

function findCriterion(config: CriteriaConfig, id: string): { group: ConfigGroup; criterion: ConfigCriterion } | null {
  for (const group of config.groups) {
    const criterion = group.criteria.find((candidate) => candidate.id === id);
    if (criterion) return { group, criterion };
  }
  return null;
}

export async function upsertCriteriaGroupAction(
  group: Partial<CriteriaGroup>,
  expectedVersion?: number
): Promise<{ success: boolean; group?: CriteriaGroup; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };
  try {
    const { config, value } = await editConfig(expectedVersion, (current) => {
      const existing = group.id ? current.groups.find((candidate) => candidate.id === group.id) : undefined;
      if (existing) {
        existing.code = group.code || existing.code;
        existing.name = group.name || existing.name;
        existing.short_name = group.shortName ?? existing.short_name;
        existing.sort_order = group.sortOrder ?? existing.sort_order;
        return existing;
      }
      const created: ConfigGroup = {
        id: group.id || crypto.randomUUID(),
        code: group.code || '',
        name: group.name || '',
        short_name: group.shortName || null,
        sort_order: group.sortOrder ?? current.groups.length,
        criteria: [],
      };
      current.groups.push(created);
      return created;
    });
    await logAudit(auth.user, group.id ? 'UPDATE_CRITERIA_GROUP' : 'CREATE_CRITERIA_GROUP', 'criteria_group', value.id, { code: value.code, name: value.name });
    revalidateCriteriaPaths();
    return { success: true, group: toGroup(value, config) };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'P99M3T02_CONFIG_STALE') return staleError();
    return { success: false, error: toClientError(error, 'Lỗi khi lưu nhóm tiêu chí. Vui lòng thử lại.') };
  }
}

export async function upsertCriterionAction(
  criterion: Partial<Criterion>,
  groupId: string,
  expectedVersion?: number
): Promise<{ success: boolean; criterion?: Criterion; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };
  try {
    const { config, value } = await editConfig(expectedVersion, (current) => {
      const group = current.groups.find((candidate) => candidate.id === groupId);
      if (!group) throw new Error('Không tìm thấy nhóm tiêu chí.');
      const existing = criterion.id ? group.criteria.find((candidate) => candidate.id === criterion.id) : undefined;
      const audiences = criterion.appliesTo === undefined
        ? (existing?.audiences || []).filter(isCriterionAudience) as CriterionAudience[]
        : audienceInput(criterion.appliesTo);
      if (!audiences || audiences.length === 0) throw new Error('Đối tượng áp dụng không được để trống.');
      const levels = criterion.levels === undefined
        ? (existing?.levels || [])
        : criterion.levels.map((level, index) => ({
            id: crypto.randomUUID(),
            criterion_id: existing?.id || criterion.id || crypto.randomUUID(),
            points: level.points,
            label: level.label,
            description: level.description || null,
            sort_order: index,
          }));
      const id = existing?.id || criterion.id || crypto.randomUUID();
      const next: ConfigCriterion = {
        id,
        group_id: group.id,
        code: criterion.code || existing?.code || '',
        name: criterion.name || existing?.name || '',
        description: criterion.description ?? existing?.description ?? null,
        applies_to: encodeAudiencesToLegacy(audiences),
        audiences,
        weight: criterion.weight ?? existing?.weight ?? 0,
        default_level_index: criterion.defaultLevelIndex ?? existing?.default_level_index ?? null,
        sort_order: criterion.sortOrder ?? existing?.sort_order ?? group.criteria.length,
        levels: levels.map((level, index) => ({ ...level, criterion_id: id, sort_order: index })),
      };
      if (existing) Object.assign(existing, next);
      else group.criteria.push(next);
      return next;
    });
    await logAudit(auth.user, criterion.id ? 'UPDATE_CRITERION' : 'CREATE_CRITERION', 'criterion', value.id, { code: value.code, name: value.name, groupId, audiences: value.audiences });
    revalidateCriteriaPaths();
    return { success: true, criterion: toCriterion(value, config) };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'P99M3T02_CONFIG_STALE') return staleError();
    return { success: false, error: toClientError(error, 'Lỗi khi lưu tiêu chí. Vui lòng thử lại.') };
  }
}

export async function updateCriterionAudiencesAction(
  criterionId: string,
  audiences: CriterionAudience[] | string[],
  expectedVersion?: number
): Promise<{ success: boolean; audiences?: CriterionAudience[]; appliesTo?: Role[]; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };
  try {
    const normalized = validateAudiences(audiences);
    if (!normalized.valid) return { success: false, error: normalized.error };
    await editConfig(expectedVersion, (config) => {
      const found = findCriterion(config, criterionId);
      if (!found) throw new Error('Không tìm thấy tiêu chí.');
      found.criterion.audiences = normalized.data;
      found.criterion.applies_to = encodeAudiencesToLegacy(normalized.data);
      return found.criterion;
    });
    await logAudit(auth.user, 'UPDATE_CRITERION_AUDIENCES', 'criterion', criterionId, { audiences: normalized.data });
    revalidateCriteriaPaths();
    return { success: true, audiences: normalized.data, appliesTo: mapAudiencesToRoles(normalized.data) };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'P99M3T02_CONFIG_STALE') return staleError();
    return { success: false, error: toClientError(error, 'Lỗi khi cập nhật đối tượng áp dụng.') };
  }
}

export async function updateDefaultLevelAction(
  criterionId: string,
  levelIndex: number | null,
  expectedVersion?: number
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };
  try {
    await editConfig(expectedVersion, (config) => {
      const found = findCriterion(config, criterionId);
      if (!found) throw new Error('Không tìm thấy tiêu chí.');
      found.criterion.default_level_index = levelIndex;
      return found.criterion;
    });
    revalidateCriteriaPaths();
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'P99M3T02_CONFIG_STALE') return staleError();
    return { success: false, error: toClientError(error, 'Lỗi khi cập nhật mức mặc định. Vui lòng thử lại.') };
  }
}

export async function deleteCriteriaGroupAction(id: string, expectedVersion?: number): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };
  try {
    await editConfig(expectedVersion, (config) => {
      const index = config.groups.findIndex((group) => group.id === id);
      if (index < 0) throw new Error('Không tìm thấy nhóm tiêu chí.');
      config.groups.splice(index, 1);
      if (config.groups.length === 0) throw new Error('Phải giữ lại ít nhất một nhóm tiêu chí.');
      return id;
    });
    revalidateCriteriaPaths();
    await logAudit(auth.user, 'DELETE_CRITERIA_GROUP', 'criteria_group', id);
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'P99M3T02_CONFIG_STALE') return staleError();
    return { success: false, error: toClientError(error, 'Lỗi khi xóa nhóm tiêu chí. Vui lòng thử lại.') };
  }
}

export async function deleteCriterionAction(id: string, expectedVersion?: number): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };
  try {
    await editConfig(expectedVersion, (config) => {
      const found = findCriterion(config, id);
      if (!found) throw new Error('Không tìm thấy tiêu chí.');
      found.group.criteria = found.group.criteria.filter((criterion) => criterion.id !== id);
      return id;
    });
    revalidateCriteriaPaths();
    await logAudit(auth.user, 'DELETE_CRITERION', 'criterion', id);
    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'P99M3T02_CONFIG_STALE') return staleError();
    return { success: false, error: toClientError(error, 'Lỗi khi xóa tiêu chí. Vui lòng thử lại.') };
  }
}

export const softDeleteCriteriaGroupAction = deleteCriteriaGroupAction;
export const softDeleteCriterionAction = deleteCriterionAction;
