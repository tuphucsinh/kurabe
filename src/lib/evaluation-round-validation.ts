/**
 * Evaluation round payload validation contract (Phase 0 Bug 2).
 * Pure module: zero Next.js / Supabase dependencies.
 */

export const EVAL_ROUND_LIMITS = {
  MAX_NOTE_LENGTH: 2000,
  MAX_COMMENT_LENGTH: 5000,
  MAX_PAYLOAD_BYTES: 64 * 1024, // 64KB
  MAX_CRITERIA_COUNT: 100,
} as const;

export interface EvaluationCriterionRule {
  id: string;
  allowedPoints?: number[];
  levels?: Array<{ points: number; label?: string; description?: string }>;
}

export interface EvaluationRoundPayloadInput {
  scores?: unknown;
  notes?: unknown;
  selectedLevelIndexes?: unknown;
  comment?: unknown;
  isSubmit?: unknown;
}

export interface EvaluationValidationOptions {
  maxNoteLength?: number;
  maxCommentLength?: number;
  maxPayloadBytes?: number;
  isSubmitOverride?: boolean;
}

export interface CanonicalEvaluationRoundPayload {
  scores: Record<string, number>;
  notes: Record<string, string>;
  selectedLevelIndexes: Record<string, number>;
  comment: string;
  isSubmit: boolean;
}

export type EvaluationRoundValidationResult =
  | {
      ok: true;
      data: CanonicalEvaluationRoundPayload;
    }
  | {
      ok: false;
      error: string;
    };

const HAZARD_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  '__meta_selected_level_indexes__',
]);

/**
 * Validates and canonicalizes an evaluation round payload before DB persistence.
 *
 * Rules & Invariants:
 * 1. Rejects unknown criterion keys in scores, notes, and selectedLevelIndexes.
 * 2. Rejects missing criteria scores when isSubmit=true (all criteria must be scored).
 * 3. Permits partial/incomplete criteria scores when isSubmit=false (Draft mode).
 * 4. Rejects NaN, Infinity, -Infinity, non-numeric values in scores.
 * 5. Rejects score points not in criterion's allowed level points (negative or arbitrary numbers).
 * 6. Rejects non-integer or out-of-range selected level indexes.
 * 7. Rejects score vs index mismatch (score must equal allowedPoints[index]).
 * 8. Rejects oversized note (> MAX_NOTE_LENGTH), comment (> MAX_COMMENT_LENGTH), payload (> MAX_PAYLOAD_BYTES).
 * 9. Strips / rejects prototype pollution and meta key hazards (__proto__, constructor, prototype, __meta_selected_level_indexes__).
 * 10. Pure function: never mutates input objects.
 */
export function validateEvaluationRoundPayload(
  input: unknown,
  criteria: EvaluationCriterionRule[],
  options?: EvaluationValidationOptions
): EvaluationRoundValidationResult {
  // 1. Root structure validation
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Dữ liệu đánh giá không hợp lệ.' };
  }

  // 2. Payload size & serialization limits
  let serializedBytes = 0;
  try {
    const str = JSON.stringify(input);
    if (typeof str !== 'string') {
      return { ok: false, error: 'Dữ liệu đánh giá không hợp lệ.' };
    }
    serializedBytes =
      typeof Buffer !== 'undefined'
        ? Buffer.byteLength(str, 'utf8')
        : new TextEncoder().encode(str).length;
  } catch {
    return { ok: false, error: 'Dữ liệu đánh giá không hợp lệ.' };
  }

  const maxPayloadBytes = options?.maxPayloadBytes ?? EVAL_ROUND_LIMITS.MAX_PAYLOAD_BYTES;
  if (serializedBytes > maxPayloadBytes) {
    return { ok: false, error: 'Kích thước dữ liệu vượt quá giới hạn cho phép.' };
  }

  // 3. Criteria rules normalization
  if (
    !Array.isArray(criteria) ||
    criteria.length === 0 ||
    criteria.length > EVAL_ROUND_LIMITS.MAX_CRITERIA_COUNT
  ) {
    return { ok: false, error: 'Danh sách tiêu chí đánh giá không hợp lệ.' };
  }

  const criteriaRuleMap = new Map<string, number[]>();
  for (const rule of criteria) {
    if (!rule || typeof rule !== 'object' || typeof rule.id !== 'string' || !rule.id.trim()) {
      return { ok: false, error: 'Cấu hình tiêu chí không hợp lệ.' };
    }
    const critId = rule.id.trim();
    if (criteriaRuleMap.has(critId)) {
      return { ok: false, error: 'Cấu hình tiêu chí bị trùng lặp.' };
    }

    let points: number[] | null = null;
    if (Array.isArray(rule.allowedPoints)) {
      points = rule.allowedPoints;
    } else if (Array.isArray(rule.levels)) {
      points = rule.levels.map((l) => l?.points);
    }

    if (!points || points.length === 0) {
      return { ok: false, error: 'Thang điểm tiêu chí không hợp lệ.' };
    }

    for (const p of points) {
      if (typeof p !== 'number' || !Number.isFinite(p)) {
        return { ok: false, error: 'Thang điểm tiêu chí không hợp lệ.' };
      }
    }

    criteriaRuleMap.set(critId, points);
  }

  const raw = input as Record<string, unknown>;

  // 4. isSubmit normalization
  const isSubmit =
    options?.isSubmitOverride !== undefined
      ? Boolean(options.isSubmitOverride)
      : Boolean(raw.isSubmit);

  // 5. Comment validation
  let canonicalComment = '';
  if (raw.comment !== undefined && raw.comment !== null) {
    if (typeof raw.comment !== 'string') {
      return { ok: false, error: 'Nhận xét không hợp lệ.' };
    }
    const maxCommentLength = options?.maxCommentLength ?? EVAL_ROUND_LIMITS.MAX_COMMENT_LENGTH;
    if (raw.comment.length > maxCommentLength) {
      return { ok: false, error: 'Nhận xét vượt quá độ dài cho phép.' };
    }
    canonicalComment = raw.comment;
  }

  // 6. Inspect nested objects
  let rawScoresObj: Record<string, unknown> = {};
  if (raw.scores !== undefined && raw.scores !== null) {
    if (typeof raw.scores !== 'object' || Array.isArray(raw.scores)) {
      return { ok: false, error: 'Dữ liệu điểm không hợp lệ.' };
    }
    rawScoresObj = raw.scores as Record<string, unknown>;
  }

  let rawNotesObj: Record<string, unknown> = {};
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== 'object' || Array.isArray(raw.notes)) {
      return { ok: false, error: 'Dữ liệu ghi chú không hợp lệ.' };
    }
    rawNotesObj = raw.notes as Record<string, unknown>;
  }

  let rawIndexesObj: Record<string, unknown> = {};
  if (raw.selectedLevelIndexes !== undefined && raw.selectedLevelIndexes !== null) {
    if (typeof raw.selectedLevelIndexes !== 'object' || Array.isArray(raw.selectedLevelIndexes)) {
      return { ok: false, error: 'Dữ liệu mức đánh giá không hợp lệ.' };
    }
    rawIndexesObj = raw.selectedLevelIndexes as Record<string, unknown>;
  }

  // 7. Check key hazards & unknown keys
  for (const key of Object.getOwnPropertyNames(rawScoresObj)) {
    if (HAZARD_KEYS.has(key) || !criteriaRuleMap.has(key)) {
      return { ok: false, error: 'Tiêu chí đánh giá không hợp lệ.' };
    }
  }

  for (const key of Object.getOwnPropertyNames(rawNotesObj)) {
    if (HAZARD_KEYS.has(key) || !criteriaRuleMap.has(key)) {
      return { ok: false, error: 'Tiêu chí ghi chú không hợp lệ.' };
    }
  }

  for (const key of Object.getOwnPropertyNames(rawIndexesObj)) {
    if (HAZARD_KEYS.has(key) || !criteriaRuleMap.has(key)) {
      return { ok: false, error: 'Tiêu chí mức đánh giá không hợp lệ.' };
    }
  }

  // 8. Validate criteria values
  const canonicalScores: Record<string, number> = {};
  const canonicalNotes: Record<string, string> = {};
  const canonicalIndexes: Record<string, number> = {};

  for (const [critId, allowedPoints] of criteriaRuleMap.entries()) {
    const hasScore = Object.prototype.hasOwnProperty.call(rawScoresObj, critId);
    const hasIndex = Object.prototype.hasOwnProperty.call(rawIndexesObj, critId);

    if (isSubmit && (!hasScore || !hasIndex)) {
      return {
        ok: false,
        error: 'Vui lòng hoàn thành đánh giá cho tất cả các tiêu chí trước khi gửi.',
      };
    }

    if (hasScore && !hasIndex) {
      return { ok: false, error: 'Thiếu mức đánh giá cho tiêu chí đã chấm điểm.' };
    }

    if (!hasScore && hasIndex) {
      return { ok: false, error: 'Thiếu điểm cho tiêu chí đã chọn mức.' };
    }

    if (hasScore && hasIndex) {
      const rawScore = rawScoresObj[critId];
      if (typeof rawScore !== 'number' || !Number.isFinite(rawScore)) {
        return { ok: false, error: 'Điểm đánh giá không hợp lệ.' };
      }

      const rawIndex = rawIndexesObj[critId];
      if (typeof rawIndex !== 'number' || !Number.isInteger(rawIndex)) {
        return { ok: false, error: 'Mức đánh giá không hợp lệ.' };
      }

      if (rawIndex < 0 || rawIndex >= allowedPoints.length) {
        return { ok: false, error: 'Mức đánh giá vượt quá thang điểm.' };
      }

      const expectedPoints = allowedPoints[rawIndex];
      if (rawScore !== expectedPoints) {
        return { ok: false, error: 'Điểm và mức đánh giá không khớp.' };
      }

      canonicalScores[critId] = rawScore;
      canonicalIndexes[critId] = rawIndex;
    }

    const hasNote = Object.prototype.hasOwnProperty.call(rawNotesObj, critId);
    if (hasNote) {
      const rawNote = rawNotesObj[critId];
      if (typeof rawNote !== 'string') {
        return { ok: false, error: 'Ghi chú không hợp lệ.' };
      }
      const maxNoteLength = options?.maxNoteLength ?? EVAL_ROUND_LIMITS.MAX_NOTE_LENGTH;
      if (rawNote.length > maxNoteLength) {
        return { ok: false, error: 'Ghi chú vượt quá độ dài cho phép.' };
      }
      canonicalNotes[critId] = rawNote;
    }
  }

  return {
    ok: true,
    data: {
      scores: canonicalScores,
      notes: canonicalNotes,
      selectedLevelIndexes: canonicalIndexes,
      comment: canonicalComment,
      isSubmit,
    },
  };
}
