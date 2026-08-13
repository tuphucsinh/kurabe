'use server';

import { supabase } from '@/lib/supabase';
import { invalidateGradeBandsCache } from '@/lib/grade-bands';
import { validateGradeBands, GradeBandsInput } from '@/lib/grade-bands-validate';
import { revalidatePath } from 'next/cache';

/**
 * Lưu toàn bộ thang điểm (upsert từng dòng theo role_group + grade).
 * Manager-only về mặt UI; auth thật thuộc Phase 44.
 */
export async function saveGradeBands(
  bands: GradeBandsInput[]
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!bands || bands.length !== 12) {
      return { success: false, error: 'Dữ liệu thang điểm không đầy đủ.' };
    }

    const validationError = validateGradeBands(bands);
    if (validationError) {
      return { success: false, error: validationError };
    }

    // Upsert từng dòng (bảng nhỏ — 12 dòng, an toàn)
    for (const band of bands) {
      const { error } = await supabase
        .from('grade_bands')
        .upsert(
          {
            role_group: band.roleGroup,
            grade: band.grade,
            min_score: band.minScore,
            max_score: band.maxScore,
          },
          { onConflict: 'role_group,grade' }
        );
      if (error) {
        return { success: false, error: 'Lỗi lưu thang điểm: ' + error.message };
      }
    }

    invalidateGradeBandsCache();
    revalidatePath('/settings');
    revalidatePath('/criteria');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Lỗi không xác định khi lưu thang điểm.',
    };
  }
}
