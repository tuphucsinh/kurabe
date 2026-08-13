'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { invalidateGradeBandsCache } from '@/lib/grade-bands';
import { validateGradeBands, GradeBandsInput } from '@/lib/grade-bands-validate';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';

/**
 * Lưu toàn bộ thang điểm (upsert từng dòng theo role_group + grade).
 * Manager-only — requireManager server-side (KHÔNG trust client).
 */
export async function saveGradeBands(
  bands: GradeBandsInput[]
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

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
      const { error } = await supabaseAdmin
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
    await logAudit(auth.user, 'UPDATE_GRADE_BANDS', 'grade_bands', null, { bands });
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Lỗi không xác định khi lưu thang điểm.',
    };
  }
}
