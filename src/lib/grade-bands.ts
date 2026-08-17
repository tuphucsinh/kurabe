import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Database } from '@/types/database';
import type { Grade } from '@/types';
import { parseGrade } from '@/lib/parsers';

export type GradeBand = {
  grade: Grade;
  minScore: number | null;
  maxScore: number | null;
};

export type GradeBands = {
  leader: GradeBand[];
  staff: GradeBand[];
  worker: GradeBand[];
};

// Fallback hardcode — NGUỒN DUY NHẤT của thang mặc định (D4: gộp từ src/data/criteria.ts).
// KHÔNG BAO GIỜ throw; DB lỗi/chưa nạp → dùng bản này.
const HARDCODED_BANDS: GradeBands = {
  leader: [
    { grade: 'S', minScore: 170, maxScore: null },
    { grade: 'A', minScore: 160, maxScore: 169 },
    { grade: 'AB', minScore: 130, maxScore: 159 },
    { grade: 'B', minScore: 100, maxScore: 129 },
    { grade: 'C', minScore: 70, maxScore: 99 },
    { grade: 'D', minScore: null, maxScore: 69 },
  ],
  staff: [
    { grade: 'S', minScore: 155, maxScore: null },
    { grade: 'A', minScore: 145, maxScore: 154 },
    { grade: 'AB', minScore: 115, maxScore: 144 },
    { grade: 'B', minScore: 90, maxScore: 114 },
    { grade: 'C', minScore: 60, maxScore: 89 },
    { grade: 'D', minScore: null, maxScore: 59 },
  ],
  worker: [
    { grade: 'S', minScore: 155, maxScore: null },
    { grade: 'A', minScore: 145, maxScore: 154 },
    { grade: 'AB', minScore: 115, maxScore: 144 },
    { grade: 'B', minScore: 90, maxScore: 114 },
    { grade: 'C', minScore: 60, maxScore: 89 },
    { grade: 'D', minScore: null, maxScore: 59 },
  ],
};

// Module cache — dùng chung cho client lẫn server trong cùng runtime
let cachedBands: GradeBands | null = null;

/** Đọc dải điểm sync: cache-first, fallback hardcode (app không bao giờ vỡ khi chưa load/DB lỗi). */
export function getGradeBandsSync(): GradeBands {
  return cachedBands ?? HARDCODED_BANDS;
}

/** Load dải điểm từ DB (bảng grade_bands), set module cache. Lỗi/thiếu bảng → giữ fallback. */
export async function loadGradeBandsFromDb(
  db: SupabaseClient<Database> = supabase
): Promise<GradeBands> {
  try {
    const { data, error } = await db
      .from('grade_bands')
      .select('role_group, grade, min_score, max_score, sort_order')
      .order('sort_order', { ascending: true });

    if (error) {
      // Bảng chưa tồn tại (migration chưa chạy) hoặc lỗi khác → fallback
      return cachedBands ?? HARDCODED_BANDS;
    }

    if (!data || data.length === 0) {
      return cachedBands ?? HARDCODED_BANDS;
    }

    const bands: GradeBands = { leader: [], staff: [], worker: [] };
    for (const row of data) {
      if (row.role_group === 'leader' || row.role_group === 'staff' || row.role_group === 'worker') {
        bands[row.role_group].push({
          grade: parseGrade(row.grade),
          minScore: row.min_score,
          maxScore: row.max_score,
        });
      } else {
        console.warn(`[grade-bands] Bỏ qua role_group không hợp lệ từ DB: ${JSON.stringify(row.role_group)}`);
      }
    }

    // Validate đủ 6 grade/group — thiếu thì fallback group đó (tránh mất grade khi seed lỗi)
    for (const group of ['leader', 'staff', 'worker'] as const) {
      if (bands[group].length !== 6) {
        bands[group] = HARDCODED_BANDS[group];
      }
    }

    cachedBands = bands;
    return bands;
  } catch {
    return cachedBands ?? HARDCODED_BANDS;
  }
}

/** Xóa cache (gọi sau khi save để lần đọc tới lấy dữ liệu mới). */
export function invalidateGradeBandsCache() {
  cachedBands = null;
}
