import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Role } from '@/types';
import {
  isCriterionAudience,
  mapAudiencesToRoles,
  decodeLegacyAppliesToRoles,
} from '@/lib/criteria-applicability';
import type { EvaluationCriterionRule } from '@/lib/evaluation-round-validation';
import { toClientError } from '@/lib/errors';

export type LoadAuthoritativeCriteriaResult =
  | {
      success: true;
      rules: EvaluationCriterionRule[];
    }
  | {
      success: false;
      error: string;
    };

/**
 * Loads active authoritative criteria and their ordered levels applicable to a role using supabaseAdmin.
 * Fails closed with safe Vietnamese client error on any failure, ambiguity, or missing data.
 */
export async function loadAuthoritativeCriteriaForRole(
  role: Role
): Promise<LoadAuthoritativeCriteriaResult> {
  if (!role) {
    return { success: false, error: 'Vai trò nhân viên không hợp lệ.' };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('criteria')
      .select(`
        id,
        applies_to,
        is_active,
        sort_order,
        criteria_groups (
          id,
          is_active
        ),
        criterion_audiences (
          audience
        ),
        criterion_levels (
          id,
          points,
          label,
          description,
          sort_order
        )
      `)
      .eq('is_active', true)
      .order('sort_order');

    if (error || !data) {
      return {
        success: false,
        error: toClientError(error, 'Lỗi tải danh mục tiêu chí đánh giá.'),
      };
    }

    if (data.length === 0) {
      return {
        success: false,
        error: 'Không tìm thấy tiêu chí đánh giá trong hệ thống.',
      };
    }

    const applicableRules: EvaluationCriterionRule[] = [];

    for (const criterion of data) {
      if (!criterion || typeof criterion.id !== 'string' || !criterion.id.trim()) {
        continue;
      }

      // If criterion belongs to a group, verify that group is active
      if (criterion.criteria_groups && criterion.criteria_groups.is_active === false) {
        continue;
      }

      // Map appliesTo
      let applicableRoles: Role[];
      if (criterion.criterion_audiences && criterion.criterion_audiences.length > 0) {
        for (const item of criterion.criterion_audiences) {
          if (!item || !isCriterionAudience(item.audience)) {
            return {
              success: false,
              error: 'Cấu hình đối tượng áp dụng của tiêu chí không hợp lệ.',
            };
          }
        }
        const validAudiences = criterion.criterion_audiences
          .map((a) => a.audience)
          .filter(isCriterionAudience);
        applicableRoles = mapAudiencesToRoles(validAudiences);
        if (applicableRoles.length === 0) {
          return {
            success: false,
            error: 'Cấu hình đối tượng áp dụng của tiêu chí không hợp lệ.',
          };
        }
      } else {
        applicableRoles = decodeLegacyAppliesToRoles(criterion.applies_to);
      }

      if (!applicableRoles.includes(role)) {
        continue;
      }

      // Validate & sort levels
      const levels = (criterion.criterion_levels || [])
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      if (levels.length === 0) {
        return {
          success: false,
          error: 'Cấu hình mức đánh giá của tiêu chí không hợp lệ.',
        };
      }

      const allowedPoints: number[] = [];
      for (const level of levels) {
        if (typeof level.points !== 'number' || !Number.isFinite(level.points)) {
          return {
            success: false,
            error: 'Thang điểm tiêu chí không hợp lệ.',
          };
        }
        allowedPoints.push(level.points);
      }

      applicableRules.push({
        id: criterion.id.trim(),
        allowedPoints,
        levels: levels.map((l) => ({
          points: l.points,
          label: l.label,
          description: l.description || undefined,
        })),
      });
    }

    if (applicableRules.length === 0) {
      return {
        success: false,
        error: 'Không tìm thấy tiêu chí đánh giá phù hợp với vai trò.',
      };
    }

    return { success: true, rules: applicableRules };
  } catch (err: unknown) {
    return {
      success: false,
      error: toClientError(err, 'Lỗi không xác định khi tải tiêu chí đánh giá.'),
    };
  }
}
