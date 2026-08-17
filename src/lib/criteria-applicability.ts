import { Role } from '@/types';

export type CriterionAudience = 'management' | 'employee' | 'worker';

export const CRITERION_AUDIENCES: readonly CriterionAudience[] = [
  'management',
  'employee',
  'worker',
] as const;

export const AUDIENCE_ROLES: Record<CriterionAudience, readonly Role[]> = {
  management: ['Manager', 'Leader', 'SubLeader'],
  employee: ['Employee'],
  worker: ['Worker'],
} as const;

export const ROLE_TO_AUDIENCE: Record<Role, CriterionAudience> = {
  Manager: 'management',
  Leader: 'management',
  SubLeader: 'management',
  Employee: 'employee',
  Worker: 'worker',
} as const;

const VALID_AUDIENCE_SET = new Set<string>(CRITERION_AUDIENCES);

/**
 * Type guard for CriterionAudience.
 * No substring matching; exact value only.
 */
export function isCriterionAudience(value: unknown): value is CriterionAudience {
  return typeof value === 'string' && VALID_AUDIENCE_SET.has(value);
}

/**
 * Validates that an input is a non-empty array of valid CriterionAudience values.
 * Deduplicates the array and preserves deterministic order.
 */
export function validateAudiences(
  audiences: unknown
): { valid: true; data: CriterionAudience[] } | { valid: false; error: string } {
  if (!Array.isArray(audiences)) {
    return { valid: false, error: 'Danh sách đối tượng áp dụng không hợp lệ.' };
  }

  const unique = new Set<CriterionAudience>();
  for (const item of audiences) {
    if (!isCriterionAudience(item)) {
      return { valid: false, error: `Đối tượng áp dụng không hợp lệ: ${String(item)}` };
    }
    unique.add(item);
  }

  if (unique.size === 0) {
    return { valid: false, error: 'Đối tượng áp dụng không được để trống.' };
  }

  // Deterministic order based on canonical CRITERION_AUDIENCES
  const sorted = CRITERION_AUDIENCES.filter(aud => unique.has(aud));
  return { valid: true, data: sorted };
}

/**
 * Type guard for a valid non-empty set of CriterionAudience values.
 */
export function isValidAudienceSet(audiences: unknown): audiences is CriterionAudience[] {
  return validateAudiences(audiences).valid;
}

/**
 * Maps a list of CriterionAudience to the corresponding expanded Role list.
 * Exactly 7 non-empty combinations are supported:
 * 1. ['management']                      -> ['Manager', 'Leader', 'SubLeader']
 * 2. ['employee']                        -> ['Employee']
 * 3. ['worker']                          -> ['Worker']
 * 4. ['management', 'employee']          -> ['Manager', 'Leader', 'SubLeader', 'Employee']
 * 5. ['management', 'worker']            -> ['Manager', 'Leader', 'SubLeader', 'Worker']
 * 6. ['employee', 'worker']              -> ['Employee', 'Worker']
 * 7. ['management', 'employee', 'worker']-> ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker']
 */
export function mapAudiencesToRoles(audiences: readonly CriterionAudience[]): Role[] {
  const roles: Role[] = [];
  const set = new Set(audiences);

  if (set.has('management')) {
    roles.push('Manager', 'Leader', 'SubLeader');
  }
  if (set.has('employee')) {
    roles.push('Employee');
  }
  if (set.has('worker')) {
    roles.push('Worker');
  }

  return roles;
}

/**
 * Maps a list of Roles to their corresponding canonical CriterionAudiences.
 */
export function mapRolesToAudiences(roles: readonly Role[]): CriterionAudience[] {
  const uniqueAudiences = new Set<CriterionAudience>();
  for (const role of roles) {
    const audience = ROLE_TO_AUDIENCE[role];
    if (audience) {
      uniqueAudiences.add(audience);
    }
  }
  return CRITERION_AUDIENCES.filter(aud => uniqueAudiences.has(aud));
}

/**
 * Checks if a specific role is covered by a list of CriterionAudiences.
 */
export function isRoleInAudiences(role: Role, audiences: readonly CriterionAudience[]): boolean {
  const audience = ROLE_TO_AUDIENCE[role];
  return audiences.includes(audience);
}

/**
 * Decodes legacy criteria.applies_to string to CriterionAudience[].
 * Legacy mapping rules:
 * - 'leader' -> ['management']
 * - 'staff'  -> ['employee']
 * - 'both'   -> ['management', 'employee']
 * - NULL / empty -> ['management', 'employee'] (QL + NV, never silently includes worker)
 * - Unknown non-empty value -> [] (never silently mapped to all)
 */
export function decodeLegacyAppliesTo(appliesTo: string | null | undefined): CriterionAudience[] {
  if (appliesTo === null || appliesTo === undefined || appliesTo.trim() === '') {
    return ['management', 'employee'];
  }

  switch (appliesTo.trim()) {
    case 'leader':
      return ['management'];
    case 'staff':
      return ['employee'];
    case 'both':
      return ['management', 'employee'];
    default:
      // Unknown non-empty value: return empty, do not treat as all
      return [];
  }
}

/**
 * Decodes legacy criteria.applies_to string directly to Role[].
 */
export function decodeLegacyAppliesToRoles(appliesTo: string | null | undefined): Role[] {
  const audiences = decodeLegacyAppliesTo(appliesTo);
  return mapAudiencesToRoles(audiences);
}

/**
 * Encodes a list of CriterionAudiences back to legacy applies_to string ('leader' | 'staff' | 'both')
 * for backwards-compatibility / coexistence in database during migration window.
 */
export function encodeAudiencesToLegacy(
  audiences: readonly CriterionAudience[]
): 'leader' | 'staff' | 'both' {
  const hasManagement = audiences.includes('management');
  const hasEmployee = audiences.includes('employee');

  if (hasManagement && !hasEmployee) {
    return 'leader';
  }
  if (!hasManagement && hasEmployee) {
    return 'staff';
  }
  return 'both';
}
