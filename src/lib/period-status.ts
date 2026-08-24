/**
 * Period status validation contract (Phase 0 Bug 1).
 * Canonical raw DB status values in Supabase: 'active' | 'closed'.
 */

export type RawPeriodStatus = 'active' | 'closed';

/**
 * Checks whether an evaluation period is in a deletable status.
 * Canonical rule: ONLY exact raw DB 'closed' periods can be deleted.
 * 'active', 'Active', null, undefined, empty, or unknown statuses must return false.
 *
 * @param status Raw status value from DB or caller
 * @returns boolean - true if deletion is allowed, false otherwise
 */
export function canDeleteEvaluationPeriodStatus(status: unknown): boolean {
  return status === 'closed';
}
