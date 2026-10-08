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
 * Only current valid appointed teams.leader_id (active/current Leader) determines
 * Leader authority; no unique-primary fallback.
 * Invalid pointer / inactive pointer / missing pointer => null (unassigned/deny).
 */
export function selectValidLeader<T extends Candidate>(
  appointedId: string | null | undefined,
  targetTeamId: string | null | undefined,
  candidates: T[],
  options?: ValidateLeaderOptions | boolean
): T | null {
  if (!targetTeamId || !appointedId) {
    return null;
  }

  const appointed = candidates.find((c) => c.id === appointedId);
  if (appointed && validateLeaderAssignment(appointed, targetTeamId, options).ok) {
    return appointed;
  }

  // Pointer absent, invalid, or inactive -> unassigned/deny, no fallback
  return null;
}
