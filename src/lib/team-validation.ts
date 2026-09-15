export interface Candidate {
  id: string;
  role: string;
  isActive: boolean;
  teamId: string | null;
}

export type LeaderValidationResult =
  | { ok: true }
  | { ok: false; error: string };

export interface ValidateLeaderOptions {
  allowUnassigned?: boolean;
  strict?: boolean;
  requireUniquePrimary?: boolean;
  rejectInvalidPointer?: boolean;
}

/**
 * Validates whether a candidate user can lead a target team.
 * `teamId` is the team's identity, not the user's primary membership. A Leader
 * may lead multiple teams, so this check deliberately does not compare teamId
 * with candidate.teamId.
 * `options.allowUnassigned` remains accepted for API compatibility; active
 * Leaders with any primary-team value are valid appointments.
 */
export function validateLeaderAssignment(
  candidate: Candidate | null | undefined,
  targetTeamId: string,
  options?: ValidateLeaderOptions | boolean
): LeaderValidationResult {
  if (!candidate) {
    return { ok: false, error: 'Không tìm thấy người dùng được chọn làm trưởng nhóm.' };
  }

  if (!candidate.isActive) {
    return { ok: false, error: 'Trưởng nhóm phải là người dùng đang hoạt động.' };
  }

  if (candidate.role !== 'Leader') {
    return { ok: false, error: 'Trưởng nhóm phải có vai trò Leader.' };
  }

  void targetTeamId;
  void options;

  return { ok: true };
}

/**
 * Selects a valid leader from candidate list:
 * 1. Appointed candidate (if appointedId provided and valid).
 * 2. When appointedId is absent:
 *    - In strict mode ({ strict: true }): requires unique active primary Leader.
 *      Returns null if 0 or >1 candidates match.
 *    - In standard mode: returns first active candidate matching target team.
 * 3. When appointedId is invalid or inactive:
 *    - In strict mode: returns null (rejects invalid/inactive pointer, no fallback).
 *    - In standard mode: falls back to active primary candidates.
 * 4. Otherwise null.
 */
export function selectValidLeader<T extends Candidate>(
  appointedId: string | null | undefined,
  targetTeamId: string | null | undefined,
  candidates: T[],
  options?: ValidateLeaderOptions | boolean
): T | null {
  if (!targetTeamId) {
    return null;
  }

  const isStrict =
    typeof options === 'object' &&
    options !== null &&
    (options.strict === true ||
      options.requireUniquePrimary === true ||
      options.rejectInvalidPointer === true);

  if (appointedId) {
    const appointed = candidates.find((c) => c.id === appointedId);
    if (appointed && validateLeaderAssignment(appointed, targetTeamId, options).ok) {
      return appointed;
    }
    if (isStrict) {
      // In strict mode, an invalid or inactive appointed pointer must be rejected without fallback
      return null;
    }
  }

  const isAllowUnassigned =
    typeof options === 'boolean' ? options : Boolean(options?.allowUnassigned);
  const primaryCandidates = candidates.filter((c) => {
    if (!validateLeaderAssignment(c, targetTeamId, options).ok) return false;
    if (c.teamId === targetTeamId) return true;
    if (isAllowUnassigned && c.teamId === null) return true;
    return false;
  });

  if (isStrict) {
    // Unique primary fallback only when pointer absent; reject ambiguous
    if (primaryCandidates.length === 1) {
      return primaryCandidates[0];
    }
    return null;
  }

  return primaryCandidates[0] ?? null;
}
