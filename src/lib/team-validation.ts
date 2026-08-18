export interface Candidate {
  id: string;
  role: string;
  isActive: boolean;
  teamId: string | null;
}

export type LeaderValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validates whether a candidate user can be assigned as Leader for a given target team.
 * Rejects missing candidate, inactive user, non-Leader role, or team mismatch.
 */
export function validateLeaderAssignment(
  candidate: Candidate | null | undefined,
  targetTeamId: string
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

  if (candidate.teamId !== targetTeamId) {
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
  candidates: T[]
): T | null {
  if (!targetTeamId) {
    return null;
  }

  if (appointedId) {
    const appointed = candidates.find((c) => c.id === appointedId);
    if (appointed && validateLeaderAssignment(appointed, targetTeamId).ok) {
      return appointed;
    }
  }

  const fallback = candidates.find(
    (c) => validateLeaderAssignment(c, targetTeamId).ok
  );
  return fallback ?? null;
}
