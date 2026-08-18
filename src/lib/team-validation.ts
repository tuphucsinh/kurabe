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
 * Validates whether a candidate user can be assigned as Leader for a given target team.
 * Rejects missing candidate, inactive user, non-Leader role, or team mismatch.
 * When options.allowUnassigned is true, a candidate with null teamId is accepted.
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

  const allowUnassigned = typeof options === 'boolean' ? options : !!options?.allowUnassigned;

  if (candidate.teamId !== targetTeamId) {
    if (allowUnassigned && !candidate.teamId) {
      return { ok: true };
    }
    return { ok: false, error: 'Trưởng nhóm phải thuộc về nhóm này.' };
  }

  return { ok: true };
}

/**
 * Selects a valid leader from candidate list:
 * 1. Appointed candidate (if appointedId provided and valid for targetTeamId).
 * 2. Otherwise first active candidate with role Leader belonging to targetTeamId.
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
