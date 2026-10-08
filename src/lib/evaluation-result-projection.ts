import type {
  CriteriaGroup,
  EvalStatus,
  Evaluation,
  Grade,
  Role,
  User,
} from '@/types';

/**
 * Authenticated server result projector.
 *
 * Single authoritative source for official (Approved-only) evaluation results.
 * It is intentionally dependency-light at module scope: only type-only imports
 * plus a runtime-callable async loader that dynamically reuses the existing
 * versioned display snapshot loader (`loadCriteriaSnapshots`) and the batched
 * evaluations reader (`getEvaluationsByPeriodAdmin`). This keeps the pure
 * projection importable by offline node regressions while the server loader
 * stays server-only in the running app.
 *
 * Rules enforced here (L1/L2/L4/N3/P4-P6):
 * - Official result denominator is Approved rows with a persisted, consistent
 *   final field. Non-Approved rows NEVER enter the result denominator.
 * - A missing/inconsistent final field on an Approved row is explicit
 *   `invalid`/unknown — never a latest-round fallback.
 * - 0 valid rows is a real numeric 0; an empty/failed reader stays distinct.
 * - Immutable snapshot basis (config versions) is reported instead of leaking
 *   raw rounds; legacy/missing versions remain explicit `legacy_unknown`.
 * - Mixed incompatible scoring bases never yield an invented single percentage;
 *   the role/config breakdown and sample count are kept instead.
 */

export const PROJECTION_GRADES: readonly Grade[] = ['S', 'A', 'AB', 'B', 'C', 'D'];
const HIGH_GRADES: readonly Grade[] = ['S', 'A', 'AB'];
const TOP_LIMIT = 5;

export type ProjectionBasis = 'authoritative' | 'legacy_unknown' | 'unavailable';

export interface ProjectionRosterMember {
  employeeId: string;
  role: Role;
  teamId: string | null;
}

export interface ResultEntry {
  evaluationId: string;
  employeeId: string;
  employeeRole: Role;
  teamId: string | null;
  grade: Grade | null;
  score: number | null;
  basis: ProjectionBasis;
  criteriaConfigVersionId: string | null;
  gradeConfigVersionId: string | null;
  configKey: string;
  /** true when the Approved row carries a consistent persisted final result. */
  valid: boolean;
}

export interface ProjectionProgressEntry {
  employeeId: string;
  role: Role;
  teamId: string | null;
  status: EvalStatus;
  hasEvaluation: boolean;
  /** Non-Approved rows that already hold a submitted round — visible, never scored. */
  frozenIncomplete: boolean;
}

export interface ProjectionCoverage {
  /** Full authorized roster size (progress denominator). */
  total: number;
  /** Approved rows (result candidate denominator). */
  approved: number;
  /** Approved rows with a consistent persisted final result. */
  valid: number;
  /** Approved rows with a missing/inconsistent final field. */
  invalid: number;
  /** Valid Approved rows whose snapshot basis is legacy/missing-version. */
  legacy: number;
  /** Roster members without an Approved result (pending / in progress / not started). */
  pending: number;
}

export interface RoleBreakdownEntry {
  role: Role;
  approved: number;
  average: number;
  highGradeRate: number;
  sampleCount: number;
}

export interface ConfigBreakdownEntry {
  configKey: string;
  basis: ProjectionBasis;
  role: Role;
  approved: number;
  average: number;
}

export interface TeamBreakdownEntry {
  teamId: string;
  name: string;
  approved: number;
  average: number;
  sampleCount: number;
}

export interface CriteriaBreakdownEntry {
  group: string;
  avgScore: number;
  percentage: number;
}

export interface EvaluationResultProjection {
  periodId: string;
  roster: { total: number; byRole: Record<string, number> };
  result: {
    approvedCount: number;
    invalidCount: number;
    legacyCount: number;
    /** null when incompatible scoring bases are mixed (never invented). */
    average: number | null;
    /** null when incompatible scoring bases are mixed (never invented). */
    highGradeRate: number | null;
    gradeDistribution: { grade: Grade; count: number }[];
    top: ResultEntry[];
    /** Approved rows with a consistent persisted final result (deterministic order). */
    approved: ResultEntry[];
    /** Approved rows with a missing/inconsistent final field (explicit invalid/unknown). */
    invalid: ResultEntry[];
    mixedBasis: boolean;
    sampleCount: number;
  };
  progress: ProjectionProgressEntry[];
  coverage: ProjectionCoverage;
  snapshot: {
    basisStates: ProjectionBasis[];
    criteriaConfigVersionIds: string[];
    gradeConfigVersionIds: string[];
    mixed: boolean;
  };
  roleBreakdown: RoleBreakdownEntry[];
  configBreakdown: ConfigBreakdownEntry[];
  teamBreakdown: TeamBreakdownEntry[];
  criteriaBreakdown: CriteriaBreakdownEntry[];
}

export interface ProjectionInput {
  periodId: string;
  roster: ProjectionRosterMember[];
  evaluations: Evaluation[];
  /** Criteria versions known-unavailable in the immutable snapshot store. */
  unavailableCriteriaVersions?: ReadonlySet<string>;
  /** Pinned criteria groups keyed by criteria config version id. */
  criteriaGroupsByVersion?: Map<string, CriteriaGroup[]>;
  /** Team id → display name roster lookup (never active-user fallback). */
  teamNames?: Map<string, string>;
}

function isKnownGrade(value: unknown): value is Grade {
  return typeof value === 'string' && (PROJECTION_GRADES as readonly string[]).includes(value);
}

function lastRound(evaluation: Evaluation) {
  if (!evaluation.rounds || evaluation.rounds.length === 0) return undefined;
  return evaluation.rounds.reduce((latest, round) => (round.round >= latest.round ? round : latest));
}

function roundHasSubmitted(round: { status?: string | null; submittedAt?: string | null }): boolean {
  return round.status === 'Submitted' || !!round.submittedAt;
}

function basisFor(
  evaluation: Evaluation,
  unavailable: ReadonlySet<string>
): { basis: ProjectionBasis; criteriaConfigVersionId: string | null; gradeConfigVersionId: string | null } {
  const round = lastRound(evaluation);
  const criteriaConfigVersionId = round?.criteriaConfigVersionId ?? null;
  const gradeConfigVersionId = round?.gradeConfigVersionId ?? null;
  if (!criteriaConfigVersionId) {
    return { basis: 'legacy_unknown', criteriaConfigVersionId, gradeConfigVersionId };
  }
  if (unavailable.has(criteriaConfigVersionId)) {
    return { basis: 'unavailable', criteriaConfigVersionId, gradeConfigVersionId };
  }
  return { basis: 'authoritative', criteriaConfigVersionId, gradeConfigVersionId };
}

const averageOf = (entries: ResultEntry[]): number => {
  if (entries.length === 0) return 0;
  return entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0) / entries.length;
};

const highGradeRateOf = (entries: ResultEntry[]): number => {
  if (entries.length === 0) return 0;
  const high = entries.filter((entry) => entry.grade !== null && HIGH_GRADES.includes(entry.grade)).length;
  return (high / entries.length) * 100;
};

interface CriteriaAccumulator {
  total: number;
  samples: number;
  groupMaxScore: number;
  groupCriteriaCount: number;
}

function accumulateCriteria(
  accumulator: Map<string, CriteriaAccumulator>,
  evaluation: Evaluation,
  groups: CriteriaGroup[]
): void {
  const round = lastRound(evaluation);
  if (!round || !round.scores) return;
  const groupByCriterion = new Map<string, CriteriaGroup>();
  for (const group of groups) {
    for (const criterion of group.criteria || []) {
      groupByCriterion.set(criterion.id, group);
    }
  }
  for (const [criterionId, score] of Object.entries(round.scores)) {
    const group = groupByCriterion.get(criterionId);
    if (!group || typeof score !== 'number' || !Number.isFinite(score)) continue;
    let entry = accumulator.get(group.code);
    if (!entry) {
      const groupMaxScore = (group.criteria || []).reduce(
        (max, criterion) =>
          max + (criterion.levels || []).reduce((m, level) => Math.max(m, level.points || 0), 0),
        0
      );
      entry = {
        total: 0,
        samples: 0,
        groupMaxScore,
        groupCriteriaCount: (group.criteria || []).length,
      };
      accumulator.set(group.code, entry);
    }
    entry.total += score;
    entry.samples += 1;
  }
}

function buildCriteriaBreakdown(accumulator: Map<string, CriteriaAccumulator>): CriteriaBreakdownEntry[] {
  return [...accumulator.entries()]
    .map(([group, entry]) => {
      const avgScore = entry.samples > 0 ? entry.total / entry.samples : 0;
      const avgMax = entry.groupCriteriaCount > 0 ? entry.groupMaxScore / entry.groupCriteriaCount : 0;
      return {
        group,
        avgScore,
        percentage: avgMax > 0 ? (avgScore / avgMax) * 100 : 0,
      };
    })
    .sort((a, b) => a.group.localeCompare(b.group));
}

/**
 * Pure official-result projection. Deterministic and side-effect free so it can
 * be exercised by offline golden regressions and reused by every server surface.
 */
export function projectEvaluationResults(input: ProjectionInput): EvaluationResultProjection {
  const unavailable = input.unavailableCriteriaVersions ?? new Set<string>();
  const roster = input.roster;
  const rosterIds = new Set(roster.map((member) => member.employeeId));

  const progress: ProjectionProgressEntry[] = roster.map((member) => ({
    employeeId: member.employeeId,
    role: member.role,
    teamId: member.teamId,
    status: 'NotStarted' as EvalStatus,
    hasEvaluation: false,
    frozenIncomplete: false,
  }));
  const progressByEmployee = new Map(progress.map((entry) => [entry.employeeId, entry]));

  const approvedEntries: ResultEntry[] = [];
  const allBasisStates = new Set<ProjectionBasis>();
  const criteriaVersions = new Set<string>();
  const gradeVersions = new Set<string>();
  const criteriaAccumulator = new Map<string, CriteriaAccumulator>();

  for (const evaluation of input.evaluations) {
    const { basis, criteriaConfigVersionId, gradeConfigVersionId } = basisFor(evaluation, unavailable);
    if (criteriaConfigVersionId) criteriaVersions.add(criteriaConfigVersionId);
    if (gradeConfigVersionId) gradeVersions.add(gradeConfigVersionId);

    const progressEntry = progressByEmployee.get(evaluation.employeeId);
    if (progressEntry) {
      progressEntry.status = evaluation.status;
      progressEntry.hasEvaluation = true;
      progressEntry.frozenIncomplete =
        evaluation.status !== 'Approved' &&
        (evaluation.rounds || []).some((round) => roundHasSubmitted(round));
    }

    // Official result is Approved-only and roster-scoped; non-Approved rows are
    // never part of the result denominator (they stay visible in progress).
    if (evaluation.status !== 'Approved' || !rosterIds.has(evaluation.employeeId)) continue;

    allBasisStates.add(basis);
    const grade = isKnownGrade(evaluation.finalGrade) ? evaluation.finalGrade : null;
    const score =
      typeof evaluation.finalScore === 'number' && Number.isFinite(evaluation.finalScore)
        ? evaluation.finalScore
        : null;
    const entry: ResultEntry = {
      evaluationId: evaluation.id,
      employeeId: evaluation.employeeId,
      employeeRole: evaluation.employeeRole,
      teamId: evaluation.teamId || null,
      grade,
      score,
      basis,
      criteriaConfigVersionId,
      gradeConfigVersionId,
      configKey: criteriaConfigVersionId ?? 'legacy_unknown',
      valid: grade !== null && score !== null,
    };
    approvedEntries.push(entry);

    if (entry.valid && input.criteriaGroupsByVersion) {
      const groups = input.criteriaGroupsByVersion.get(entry.configKey);
      if (groups) accumulateCriteria(criteriaAccumulator, evaluation, groups);
    }
  }

  const valid = approvedEntries.filter((entry) => entry.valid);
  const configKeys = new Set(valid.map((entry) => entry.configKey));
  const mixedBasis = configKeys.size > 1;

  // Mixed incompatible scoring bases: never invent a single cross-basis
  // percentage — surface nulls alongside the truthful breakdowns.
  const average = mixedBasis ? null : averageOf(valid);
  const highGradeRate = mixedBasis ? null : highGradeRateOf(valid);

  const gradeDistribution = PROJECTION_GRADES.map((grade) => ({
    grade,
    count: valid.filter((entry) => entry.grade === grade).length,
  }));

  const top = [...valid]
    .sort((a, b) => {
      if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
      return a.evaluationId.localeCompare(b.evaluationId);
    })
    .slice(0, TOP_LIMIT);

  const roleMap = new Map<Role, ResultEntry[]>();
  for (const entry of valid) {
    const list = roleMap.get(entry.employeeRole) ?? [];
    list.push(entry);
    roleMap.set(entry.employeeRole, list);
  }
  const roleBreakdown: RoleBreakdownEntry[] = [...roleMap.entries()]
    .map(([role, entries]) => ({
      role,
      approved: entries.length,
      average: averageOf(entries),
      highGradeRate: highGradeRateOf(entries),
      sampleCount: entries.length,
    }))
    .sort((a, b) => a.role.localeCompare(b.role));

  const configMap = new Map<string, ResultEntry[]>();
  for (const entry of valid) {
    const list = configMap.get(entry.configKey) ?? [];
    list.push(entry);
    configMap.set(entry.configKey, list);
  }
  const configBreakdown: ConfigBreakdownEntry[] = [...configMap.entries()]
    .flatMap(([configKey, entries]) => {
      const roles = new Map<Role, ResultEntry[]>();
      for (const entry of entries) {
        const list = roles.get(entry.employeeRole) ?? [];
        list.push(entry);
        roles.set(entry.employeeRole, list);
      }
      return [...roles.entries()].map(([role, roleEntries]) => ({
        configKey,
        basis: roleEntries[0].basis,
        role,
        approved: roleEntries.length,
        average: averageOf(roleEntries),
      }));
    })
    .sort((a, b) => a.configKey.localeCompare(b.configKey) || a.role.localeCompare(b.role));

  const teamMap = new Map<string, ResultEntry[]>();
  for (const entry of valid) {
    if (!entry.teamId) continue;
    const list = teamMap.get(entry.teamId) ?? [];
    list.push(entry);
    teamMap.set(entry.teamId, list);
  }
  const teamBreakdown: TeamBreakdownEntry[] = [...teamMap.entries()]
    .map(([teamId, entries]) => ({
      teamId,
      name: input.teamNames?.get(teamId) ?? teamId,
      approved: entries.length,
      average: averageOf(entries),
      sampleCount: entries.length,
    }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId));

  const byRole: Record<string, number> = {};
  for (const member of roster) {
    byRole[member.role] = (byRole[member.role] ?? 0) + 1;
  }

  const approvedCount = approvedEntries.length;
  const invalidCount = approvedCount - valid.length;
  const legacyCount = valid.filter((entry) => entry.basis === 'legacy_unknown').length;

  return {
    periodId: input.periodId,
    roster: { total: roster.length, byRole },
    result: {
      approvedCount,
      invalidCount,
      legacyCount,
      average,
      highGradeRate,
      gradeDistribution,
      top,
      approved: [...valid].sort((a, b) => a.evaluationId.localeCompare(b.evaluationId)),
      invalid: approvedEntries
        .filter((entry) => !entry.valid)
        .sort((a, b) => a.evaluationId.localeCompare(b.evaluationId)),
      mixedBasis,
      sampleCount: valid.length,
    },
    progress,
    coverage: {
      total: roster.length,
      approved: approvedCount,
      valid: valid.length,
      invalid: invalidCount,
      legacy: legacyCount,
      pending: roster.length - approvedCount,
    },
    snapshot: {
      basisStates: [...allBasisStates].sort(),
      criteriaConfigVersionIds: [...criteriaVersions].sort(),
      gradeConfigVersionIds: [...gradeVersions].sort(),
      mixed: mixedBasis,
    },
    roleBreakdown,
    configBreakdown,
    teamBreakdown,
    criteriaBreakdown: buildCriteriaBreakdown(criteriaAccumulator),
  };
}

/**
 * Server loader. Reuses the batched evaluations reader and the versioned
 * criteria snapshot loader; never loads raw current criteria or active-user
 * fallbacks. Returns `null` only for missing auth/period — an empty roster or an
 * empty period still returns a structured projection with a real 0.
 */
export async function getEvaluationResultProjection(
  periodId: string,
  viewer?: User | null,
  options?: {
    evaluations?: Evaluation[];
    /**
     * Effective authorized scope (e.g. a selected team). When provided, only the
     * given employee ids enter the roster, the approved/valid result set and
     * every aggregate, so the projection stays filter-consistent server-side.
     * `null`/undefined keeps the full authorized viewer scope.
     */
    employeeIds?: ReadonlySet<string> | null;
  }
): Promise<EvaluationResultProjection | null> {
  if (!periodId || !viewer) return null;

  const evaluationsAdmin = await import('@/lib/db/evaluations-admin');
  const usersAdmin = await import('@/lib/db/users-admin');
  const teamsAdmin = await import('@/lib/db/teams-admin');

  const [evaluations, users, teams] = await Promise.all([
    options?.evaluations
      ? Promise.resolve(options.evaluations)
      : evaluationsAdmin.getEvaluationsByPeriodAdmin(periodId, viewer),
    usersAdmin.getUsersAdmin(viewer),
    teamsAdmin.getTeamsAdmin(viewer),
  ]);

  // Apply the effective authorized scope before any aggregate is derived, so
  // roster counts, averages, coverage, grade distribution, criteria breakdown
  // and the top slice all reflect the same authorized filter.
  const scope = options?.employeeIds ?? null;
  const scopedEvaluations = scope
    ? evaluations.filter((evaluation) => scope.has(evaluation.employeeId))
    : evaluations;

  const roster: ProjectionRosterMember[] = users
    .filter((user) => !scope || scope.has(user.id))
    .map((user) => ({
      employeeId: user.id,
      role: user.role,
      teamId: user.teamId || null,
    }));
  const teamNames = new Map<string, string>(teams.map((team) => [team.id, team.name]));

  const criteriaVersionIds = [
    ...new Set(
      scopedEvaluations
        .flatMap((evaluation) => evaluation.rounds || [])
        .map((round) => round.criteriaConfigVersionId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];

  const unavailableCriteriaVersions = new Set<string>();
  const criteriaGroupsByVersion = new Map<string, CriteriaGroup[]>();
  if (criteriaVersionIds.length > 0) {
    const displayAdmin = await import('@/lib/db/evaluation-display-admin');
    const snapshot = await displayAdmin.loadCriteriaSnapshots(criteriaVersionIds);
    for (const id of snapshot.unavailable) unavailableCriteriaVersions.add(id);
    for (const versionId of criteriaVersionIds) {
      const groups = displayAdmin.groupsForVersion(versionId, snapshot);
      if (groups.length > 0) criteriaGroupsByVersion.set(versionId, groups);
    }
  }

  return projectEvaluationResults({
    periodId,
    roster,
    evaluations: scopedEvaluations,
    unavailableCriteriaVersions,
    criteriaGroupsByVersion,
    teamNames,
  });
}
