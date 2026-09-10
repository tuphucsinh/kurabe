'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { invalidateGradeBandsCache } from '@/lib/grade-bands';
import { validateGradeBands, GradeBandsInput } from '@/lib/grade-bands-validate';
import { requireManager } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { revalidatePath } from 'next/cache';
import { toClientError } from '@/lib/errors';
import { Json } from '@/types/database';

/** Replace one complete grade configuration through the versioned DB transaction. */
export async function saveGradeBands(
  bands: GradeBandsInput[]
): Promise<{ success: boolean; version?: number; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { success: false, error: auth.error };

  try {
    const validationError = validateGradeBands(bands);
    if (validationError) return { success: false, error: validationError };

    const versions = new Set(bands.map((band) => band.version));
    if (versions.size !== 1 || !Number.isInteger(bands[0]?.version)) {
      return { success: false, error: 'Thang điểm đã cũ hoặc thiếu phiên bản. Vui lòng tải lại trước khi lưu.' };
    }
    const expectedVersion = bands[0].version as number;
    const payload: Json[] = bands.map((band, index) => ({
      role_group: band.roleGroup,
      grade: band.grade,
      min_score: band.minScore,
      max_score: band.maxScore,
      sort_order: band.sortOrder ?? index % 6,
    }));

    const { data, error } = await supabaseAdmin.rpc('save_grade_config', {
      p_bands: payload,
      p_expected_version: expectedVersion,
    });
    if (error) return { success: false, error: toClientError(error, 'Lỗi giao dịch lưu thang điểm. Không có thay đổi nào được giữ lại.') };
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.version !== 'number') {
      return { success: false, error: 'Lỗi giao dịch lưu thang điểm: phản hồi phiên bản không hợp lệ.' };
    }

    invalidateGradeBandsCache();
    revalidatePath('/settings');
    revalidatePath('/criteria');
    await logAudit(auth.user, 'UPDATE_GRADE_BANDS', 'grade_bands', null, {
      version: data.version,
      previousVersion: expectedVersion,
      bandCount: bands.length,
    });
    return { success: true, version: data.version };
  } catch (err: unknown) {
    return { success: false, error: toClientError(err, 'Lỗi không xác định khi lưu thang điểm. Không có thay đổi nào được giữ lại.') };
  }
}
