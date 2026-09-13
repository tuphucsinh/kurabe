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
 * 2. Otherwise first active candidate with role Leader.
 * 3. Otherwise null.
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

  if (appointedId) {
    const appointed = candidates.find((c) => c.id === appointedId);
    if (appointed && validateLeaderAssignment(appointed, targetTeamId, options).ok) {
      return appointed;
    }
  }

  const fallback = candidates.find(
    (c) => validateLeaderAssignment(c, targetTeamId, options).ok
  );
  return fallback ?? null;
}
