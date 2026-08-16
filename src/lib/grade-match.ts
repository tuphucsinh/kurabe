/**
 * Match band theo điểm — PURE function, không import gì (test được độc lập).
 * Quy ước null duy nhất (A2, 2026-08-16): `minScore: null` = band KHÔNG cận dưới
 * (mức thấp nhất, catch-all). Sort và match dùng cùng một ngữ nghĩa null —
 * hết trạng thái sort-theo-0 / match-theo--Infinity của bản cũ.
 */

export interface MatchableBand {
  grade: string;
  minScore: number | null;
}

/**
 * Tìm band cho điểm số:
 * 1. Chỉ xét các band có cận dưới (minScore != null), sort giảm dần theo minScore,
 *    band đầu tiên có totalScore >= minScore thắng (ưu tiên mức cao khi chồng lấn).
 * 2. Không match band nào → trả về band catch-all (minScore == null) nếu có.
 * 3. Không có band nào phù hợp → undefined (caller quyết định fallback, vd 'D').
 */
export function matchGradeBand(bands: MatchableBand[], totalScore: number): string | undefined {
  const withMin = bands
    .filter((b): b is MatchableBand & { minScore: number } => b.minScore != null)
    .sort((a, b) => b.minScore - a.minScore);

  const matched = withMin.find((b) => totalScore >= b.minScore);
  if (matched) return matched.grade;

  return bands.find((b) => b.minScore == null)?.grade;
}
