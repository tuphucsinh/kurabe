import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Role } from '@/types';
import { isCriterionAudience, mapAudiencesToRoles, decodeLegacyAppliesToRoles, CriterionAudience } from '@/lib/criteria-applicability';
import type { EvaluationCriterionRule } from '@/lib/evaluation-round-validation';
import { toClientError } from '@/lib/errors';

export type LoadAuthoritativeCriteriaResult =
  | { success: true; rules: EvaluationCriterionRule[]; versionId: string; version: number }
  | { success: false; error: string };

type ConfigLevel = { points: number; label: string; description?: string | null; sort_order: number };
type ConfigCriterion = {
  id: string;
  applies_to?: string | null;
  audiences?: string[];
  levels?: ConfigLevel[];
};
type ConfigGroup = { criteria?: ConfigCriterion[] };
type ActiveConfig = { version: number; version_id: string; groups?: ConfigGroup[] };

function isActiveConfig(value: unknown): value is ActiveConfig {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  return Number.isSafeInteger(raw.version) && typeof raw.version_id === 'string' && Array.isArray(raw.groups);
}

/** Loads the immutable active snapshot, never the mutable live projection. */
export async function loadAuthoritativeCriteriaForRole(role: Role): Promise<LoadAuthoritativeCriteriaResult> {
  if (!role) return { success: false, error: 'Vai trò nhân viên không hợp lệ.' };

  try {
    const { data, error } = await supabaseAdmin.rpc('get_active_criteria_config');
    if (error || !isActiveConfig(data)) {
      return { success: false, error: toClientError(error, 'Lỗi tải danh mục tiêu chí đánh giá.') };
    }

    const rules: EvaluationCriterionRule[] = [];
    for (const group of data.groups || []) {
      for (const criterion of group.criteria || []) {
        if (!criterion || typeof criterion.id !== 'string' || !criterion.id.trim()) continue;
        const audiences = (criterion.audiences || []).filter(isCriterionAudience) as CriterionAudience[];
        const applicableRoles = audiences.length > 0
          ? mapAudiencesToRoles(audiences)
          : decodeLegacyAppliesToRoles(criterion.applies_to || null);
        if (!applicableRoles.includes(role)) continue;

        const levels = (criterion.levels || []).slice().sort((a, b) => a.sort_order - b.sort_order);
        if (levels.length === 0 || levels.some((level) => typeof level.points !== 'number' || !Number.isFinite(level.points))) {
          return { success: false, error: 'Cấu hình mức đánh giá của tiêu chí không hợp lệ.' };
        }
        rules.push({
          id: criterion.id.trim(),
          allowedPoints: levels.map((level) => level.points),
          levels: levels.map((level) => ({
            points: level.points,
            label: level.label,
            description: level.description || undefined,
          })),
        });
      }
    }

    if (rules.length === 0) return { success: false, error: 'Không tìm thấy tiêu chí đánh giá phù hợp với vai trò.' };
    return { success: true, rules, versionId: data.version_id, version: data.version };
  } catch (error: unknown) {
    return { success: false, error: toClientError(error, 'Lỗi không xác định khi tải tiêu chí đánh giá.') };
  }
}

/**
 * Verifies that the client's rendered criteria config version matches the active version.
 */
export async function verifyActiveCriteriaConfigVersion(expectedVersionId: string): Promise<boolean> {
  if (!expectedVersionId || typeof expectedVersionId !== 'string') return false;
  try {
    const { data, error } = await supabaseAdmin.rpc('get_active_criteria_config');
    if (error || !isActiveConfig(data)) return false;
    return data.version_id === expectedVersionId;
  } catch {
    return false;
  }
}
