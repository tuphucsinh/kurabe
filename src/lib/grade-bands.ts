import { supabase } from '@/lib/supabase';
import { gradingLeader, gradingStaff } from '@/data/criteria';
import type { Grade } from '@/types';

export type GradeBand = {
  grade: Grade;
  minScore: number | null;
  maxScore: number | null;
};

export type GradeBands = {
  leader: GradeBand[];
  staff: GradeBand[];
};

// Fallback hardcode hiện tại (src/data/criteria.ts) — KHÔNG BAO GIỜ throw
const HARDCODED_BANDS: GradeBands = {
  leader: gradingLeader.map((g) => ({
    grade: g.grade as Grade,
    minScore: g.minScore ?? null,
    maxScore: g.maxScore ?? null,
  })),
  staff: gradingStaff.map((g) => ({
    grade: g.grade as Grade,
    minScore: g.minScore ?? null,
    maxScore: g.maxScore ?? null,
  })),
};

// Module cache — dùng chung cho client lẫn server trong cùng runtime
let cachedBands: GradeBands | null = null;

/** Đọc dải điểm sync: cache-first, fallback hardcode (app không bao giờ vỡ khi chưa load/DB lỗi). */
export function getGradeBandsSync(): GradeBands {
  return cachedBands ?? HARDCODED_BANDS;
}

/** Load dải điểm từ DB (bảng grade_bands), set module cache. Lỗi/thiếu bảng → giữ fallback. */
export async function loadGradeBandsFromDb(): Promise<GradeBands> {
  try {
    const { data, error } = await supabase
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

    const bands: GradeBands = { leader: [], staff: [] };
    for (const row of data) {
      const group = row.role_group === 'staff' ? 'staff' : 'leader';
      bands[group].push({
        grade: row.grade as Grade,
        minScore: row.min_score,
        maxScore: row.max_score,
      });
    }

    // Validate đủ 6 grade/group — thiếu thì fallback group đó (tránh mất grade khi seed lỗi)
    for (const group of ['leader', 'staff'] as const) {
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
