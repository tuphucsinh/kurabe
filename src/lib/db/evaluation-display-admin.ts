import 'server-only';

import {
  decodeLegacyAppliesToRoles,
  isCriterionAudience,
  mapAudiencesToRoles,
  isCriteriaSetKey,
  roleToSetKey,
  setKeyToAudience,
  type CriterionAudience,
} from '@/lib/criteria-applicability';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CriteriaGroup,
  Criterion,
  CriteriaSetKey,
  Evaluation,
  EvaluationDisplayDto,
  EvaluationDisplayRound,
  EvaluationSnapshotState,
  Role,
  User,
} from '@/types';
import type { Tables, Database } from '@/types/database';
import { getEvaluationByIdAdmin } from '@/lib/db/evaluations-admin';

type CriteriaConfigVersionRow = Pick<
  Tables<'criteria_config_versions'>,
  'id' | 'version_no' | 'group_count' | 'criterion_count' | 'level_count' | 'audience_count'
>;
type CriteriaGroupVersionRow = Pick<
  Tables<'criteria_group_versions'>,
  'version_id' | 'group_id' | 'code' | 'name' | 'short_name' | 'sort_order' | 'set_key'
>;
type CriterionVersionRow = Pick<
  Tables<'criterion_versions'>,
  | 'version_id'
  | 'criterion_id'
  | 'group_id'
  | 'code'
  | 'name'
  | 'description'
  | 'applies_to'
  | 'weight'
  | 'default_level_index'
  | 'sort_order'
  | 'set_key'
>;
type CriterionLevelVersionRow = Pick<
  Tables<'criterion_level_versions'>,
  'version_id' | 'criterion_id' | 'level_id' | 'points' | 'label' | 'description' | 'sort_order'
>;
type CriterionAudienceVersionRow = Pick<
  Tables<'criterion_audience_versions'>,
  'version_id' | 'criterion_id' | 'audience'
>;
type GradeConfigVersionRow = Pick<Tables<'grade_band_versions'>, 'id'>;

export type CriteriaSnapshot = {
  groups: Map<string, CriteriaGroup>;
  unavailable: Set<string>;
};

type GradeSnapshot = {
  available: Set<string>;
  unavailable: Set<string>;
};

export const DEFAULT_SNAPSHOT_PAGE_SIZE = 1000;

export interface LoadCriteriaSnapshotsOptions {
  client?: SupabaseClient<Database>;
  pageSize?: number;
}

const uniqueNonEmpty = (values: readonly (string | null | undefined)[]): string[] => [
  ...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)),
];

export function buildCriteriaSnapshot(
  versionIds: readonly string[],
  configs: CriteriaConfigVersionRow[],
  groups: CriteriaGroupVersionRow[],
  criteria: CriterionVersionRow[],
  levels: CriterionLevelVersionRow[],
  audiences: CriterionAudienceVersionRow[]
): CriteriaSnapshot {
  const requested = new Set(versionIds);
  const configMap = new Map(configs.map((row) => [row.id, row]));
  const unavailable = new Set(versionIds.filter((id) => !configMap.has(id)));
  const result = new Map<string, CriteriaGroup>();

  for (const versionId of versionIds) {
    if (!requested.has(versionId) || !configMap.has(versionId)) {
      unavailable.add(versionId);
      continue;
    }

    const config = configMap.get(versionId)!;
    const versionGroups = groups
      .filter((row) => row.version_id === versionId)
      .sort((a, b) => a.sort_order - b.sort_order || a.group_id.localeCompare(b.group_id));
    const versionCriteria = criteria.filter((row) => row.version_id === versionId);
    const versionLevels = levels.filter((row) => row.version_id === versionId);
    const versionAudiences = audiences.filter((row) => row.version_id === versionId);

    let valid = versionGroups.length > 0;

    // P108 count metadata verification
    const rawCounts = [
      config.group_count,
      config.criterion_count,
      config.level_count,
      config.audience_count,
    ];
    const allCountsNull = rawCounts.every((c) => c === null || c === undefined);
    const allCountsValidInts = rawCounts.every(
      (c) => typeof c === 'number' && Number.isSafeInteger(c) && c >= 0
    );

    // Mixed count metadata => fail closed
    if (!allCountsNull && !allCountsValidInts) {
      valid = false;
    }

    const hasAnyP108SetRows =
      versionGroups.some((g) => g.set_key != null) ||
      versionCriteria.some((c) => c.set_key != null);

    // Any P108 set rows require all four nonnegative safe integer counts and exact matches.
    // Legacy is ONLY when all 4 counts null/undefined AND rows are genuinely legacy set_key null/absent.
    if (hasAnyP108SetRows && !allCountsValidInts) {
      valid = false;
    }

    if (allCountsValidInts) {
      if (
        versionGroups.length !== config.group_count ||
        versionCriteria.length !== config.criterion_count ||
        versionLevels.length !== config.level_count ||
        versionAudiences.length !== config.audience_count
      ) {
        valid = false;
      }
    } else {
      // Limitation: Legacy criteria configuration versions (created prior to P108) do not store
      // group_count, criterion_count, level_count, and audience_count in criteria_config_versions.
      // Stored metadata count verification cannot be performed for legacy versions; these rely solely
      // on structural validation (deterministic uniqueness, non-empty criteria levels, valid relationships, and audience decoding).
    }

    // Structural validation: check parent-child relationships and orphan rows
    const groupIds = new Set(versionGroups.map((g) => g.group_id));
    const criterionIds = new Set(versionCriteria.map((c) => c.criterion_id));

    // Reject orphan criteria
    if (versionCriteria.some((c) => !groupIds.has(c.group_id))) {
      valid = false;
    }
    // Reject orphan levels
    if (versionLevels.some((l) => !criterionIds.has(l.criterion_id))) {
      valid = false;
    }
    // Reject orphan audiences
    if (versionAudiences.some((a) => !criterionIds.has(a.criterion_id))) {
      valid = false;
    }

    for (const groupRow of versionGroups) {
      // Reject invalid non-null group set_key
      if (groupRow.set_key !== null && groupRow.set_key !== undefined) {
        if (!isCriteriaSetKey(groupRow.set_key)) {
          valid = false;
        }
      }

      const groupCriteria = versionCriteria
        .filter((row) => row.group_id === groupRow.group_id)
        .sort((a, b) => a.sort_order - b.sort_order || a.criterion_id.localeCompare(b.criterion_id));

      const groupSetKey: CriteriaSetKey | null = isCriteriaSetKey(groupRow.set_key) ? groupRow.set_key : null;

      const mappedCriteria: Criterion[] = groupCriteria.map((criterionRow) => {
        // Reject invalid non-null criterion set_key
        if (criterionRow.set_key !== null && criterionRow.set_key !== undefined) {
          if (!isCriteriaSetKey(criterionRow.set_key)) {
            valid = false;
          }
        }

        const criterionLevels = versionLevels
          .filter((row) => row.criterion_id === criterionRow.criterion_id)
          .sort((a, b) => a.sort_order - b.sort_order || a.level_id.localeCompare(b.level_id));
        const criterionAudiences = versionAudiences
          .filter((row) => row.criterion_id === criterionRow.criterion_id)
          .map((row) => row.audience);

        const critSetKey: CriteriaSetKey | null = isCriteriaSetKey(criterionRow.set_key) ? criterionRow.set_key : null;

        // Group / criterion null / mismatch check
        if (groupRow.set_key != null || criterionRow.set_key != null) {
          if (groupRow.set_key !== criterionRow.set_key) {
            valid = false;
          }
        }

        let roles: Role[];
        if (critSetKey != null) {
          // In P108: exactly one audience equal set mapping
          const expectedAudience = setKeyToAudience(critSetKey);
          if (criterionAudiences.length !== 1 || criterionAudiences[0] !== expectedAudience) {
            valid = false;
          }
          roles = criterionAudiences.length === 1 && criterionAudiences[0] === expectedAudience
            ? mapAudiencesToRoles(criterionAudiences as CriterionAudience[])
            : [];
        } else {
          // Genuinely legacy NULL
          roles = criterionAudiences.length > 0 && criterionAudiences.every(isCriterionAudience)
            ? mapAudiencesToRoles(criterionAudiences)
            : decodeLegacyAppliesToRoles(criterionRow.applies_to);
        }

        if (
          criterionLevels.length === 0 ||
          criterionLevels.some((level) => typeof level.points !== 'number' || !Number.isFinite(level.points)) ||
          roles.length === 0
        ) {
          valid = false;
        }

        return {
          id: criterionRow.criterion_id,
          code: criterionRow.code,
          name: criterionRow.name,
          description: criterionRow.description ?? undefined,
          appliesTo: roles,
          levels: criterionLevels.map((level) => ({
            points: level.points,
            label: level.label,
            description: level.description ?? undefined,
          })),
          groupId: criterionRow.group_id,
          weight: criterionRow.weight ?? undefined,
          defaultLevelIndex: criterionRow.default_level_index ?? undefined,
          sortOrder: criterionRow.sort_order,
          configVersion: config.version_no,
          configVersionId: versionId,
          setKey: critSetKey,
        };
      });

      const group: CriteriaGroup = {
        id: groupRow.group_id,
        code: groupRow.code,
        name: groupRow.name,
        shortName: groupRow.short_name ?? groupRow.name,
        criteria: mappedCriteria,
        sortOrder: groupRow.sort_order,
        configVersion: config.version_no,
        configVersionId: versionId,
        setKey: groupSetKey,
      };
      result.set(`${versionId}:${groupRow.group_id}`, group);
    }

    if (!valid) {
      unavailable.add(versionId);
      for (const key of result.keys()) {
        if (key.startsWith(`${versionId}:`)) result.delete(key);
      }
    }
  }

  return { groups: result, unavailable };
}

async function fetchPagedVersionTable<T>(
  fetchPage: (rangeFrom: number, rangeTo: number) => PromiseLike<{
    data: T[] | null;
    error: unknown;
    count: number | null;
  }>,
  pageSize: number
): Promise<{ rows: T[]; count: number } | null> {
  if (typeof pageSize !== 'number' || !Number.isSafeInteger(pageSize) || pageSize <= 0) {
    return null;
  }
  const rows: T[] = [];
  let offset = 0;
  let reportedCount: number | null = null;

  while (true) {
    const rangeTo = offset + pageSize - 1;
    const { data, error, count } = await fetchPage(offset, rangeTo);
    if (error || data == null) {
      return null;
    }
    if (count == null || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      return null;
    }
    if (reportedCount === null) {
      reportedCount = count;
    } else if (reportedCount !== count) {
      return null;
    }

    if (reportedCount === 0) {
      return { rows: [], count: 0 };
    }

    const expectedOnPage = Math.min(pageSize, reportedCount - offset);
    if (data.length < expectedOnPage || data.length === 0) {
      // Truncation detected: PostgREST returned fewer rows than requested page range
      return null;
    }

    rows.push(...data);
    offset += data.length;

    if (offset >= reportedCount) {
      break;
    }
  }

  if (rows.length !== reportedCount) {
    return null;
  }

  return { rows, count: reportedCount };
}

export async function loadCriteriaSnapshots(
  versionIds: readonly string[],
  options?: LoadCriteriaSnapshotsOptions
): Promise<CriteriaSnapshot> {
  const uniqueIds = uniqueNonEmpty(versionIds);
  if (uniqueIds.length === 0) return { groups: new Map(), unavailable: new Set() };

  const rawPageSize = options?.pageSize;
  if (rawPageSize !== undefined) {
    if (typeof rawPageSize !== 'number' || !Number.isSafeInteger(rawPageSize) || rawPageSize <= 0) {
      // Invalid input returns unavailable before DB requests
      return { groups: new Map(), unavailable: new Set(uniqueIds) };
    }
  }
  const pageSize = rawPageSize ?? DEFAULT_SNAPSHOT_PAGE_SIZE;
  const client = options?.client ?? supabaseAdmin;

  const allGroups = new Map<string, CriteriaGroup>();
  const unavailable = new Set<string>();

  await Promise.all(
    uniqueIds.map(async (versionId) => {
      const configRes = await client
        .from('criteria_config_versions')
        .select('id, version_no, group_count, criterion_count, level_count, audience_count')
        .eq('id', versionId)
        .maybeSingle();

      if (configRes.error || !configRes.data) {
        unavailable.add(versionId);
        return;
      }

      const configRow = configRes.data as CriteriaConfigVersionRow;

      const [groupsRes, criteriaRes, levelsRes, audiencesRes] = await Promise.all([
        fetchPagedVersionTable<CriteriaGroupVersionRow>(
          (from, to) =>
            client
              .from('criteria_group_versions')
              .select('version_id, group_id, code, name, short_name, sort_order, set_key', { count: 'exact' })
              .eq('version_id', versionId)
              .order('sort_order', { ascending: true })
              .order('group_id', { ascending: true })
              .range(from, to),
          pageSize
        ),
        fetchPagedVersionTable<CriterionVersionRow>(
          (from, to) =>
            client
              .from('criterion_versions')
              .select('version_id, criterion_id, group_id, code, name, description, applies_to, weight, default_level_index, sort_order, set_key', { count: 'exact' })
              .eq('version_id', versionId)
              .order('sort_order', { ascending: true })
              .order('criterion_id', { ascending: true })
              .range(from, to),
          pageSize
        ),
        fetchPagedVersionTable<CriterionLevelVersionRow>(
          (from, to) =>
            client
              .from('criterion_level_versions')
              .select('version_id, criterion_id, level_id, points, label, description, sort_order', { count: 'exact' })
              .eq('version_id', versionId)
              .order('sort_order', { ascending: true })
              .order('criterion_id', { ascending: true })
              .order('level_id', { ascending: true })
              .range(from, to),
          pageSize
        ),
        fetchPagedVersionTable<CriterionAudienceVersionRow>(
          (from, to) =>
            client
              .from('criterion_audience_versions')
              .select('version_id, criterion_id, audience', { count: 'exact' })
              .eq('version_id', versionId)
              .order('criterion_id', { ascending: true })
              .order('audience', { ascending: true })
              .range(from, to),
          pageSize
        ),
      ]);

      if (!groupsRes || !criteriaRes || !levelsRes || !audiencesRes) {
        unavailable.add(versionId);
        return;
      }

      const snapshot = buildCriteriaSnapshot(
        [versionId],
        [configRow],
        groupsRes.rows,
        criteriaRes.rows,
        levelsRes.rows,
        audiencesRes.rows
      );

      if (snapshot.unavailable.has(versionId)) {
        unavailable.add(versionId);
      } else {
        for (const [key, group] of snapshot.groups.entries()) {
          allGroups.set(key, group);
        }
      }
    })
  );

  return { groups: allGroups, unavailable };
}

async function loadGradeSnapshots(
  versionIds: readonly string[],
  client: SupabaseClient<Database> = supabaseAdmin
): Promise<GradeSnapshot> {
  if (versionIds.length === 0) return { available: new Set(), unavailable: new Set() };

  const { data, error } = await client
    .from('grade_band_versions')
    .select('id')
    .in('id', versionIds);
  if (error) {
    console.error('getEvaluationDisplayAdmin grade snapshot query failed');
    return { available: new Set(), unavailable: new Set(versionIds) };
  }

  const available = new Set(((data ?? []) as GradeConfigVersionRow[]).map((row: GradeConfigVersionRow) => row.id));
  return {
    available,
    unavailable: new Set(versionIds.filter((id) => !available.has(id))),
  };
}

function roundSnapshotState(
  round: Evaluation['rounds'][number],
  criteriaSnapshot: CriteriaSnapshot,
  gradeSnapshot: GradeSnapshot
): EvaluationSnapshotState {
  if (!round.criteriaConfigVersionId || !round.gradeConfigVersionId) return 'legacy_unknown';
  if (
    criteriaSnapshot.unavailable.has(round.criteriaConfigVersionId)
    || gradeSnapshot.unavailable.has(round.gradeConfigVersionId)
    || !gradeSnapshot.available.has(round.gradeConfigVersionId)
    || ![...criteriaSnapshot.groups.keys()].some((key) => key.startsWith(`${round.criteriaConfigVersionId}:`))
  ) {
    return 'unavailable';
  }
  return 'authoritative';
}

export function groupsForVersion(versionId: string | null | undefined, snapshot: CriteriaSnapshot): CriteriaGroup[] {
  if (!versionId) return [];
  return [...snapshot.groups.entries()]
    .filter(([key]) => key.startsWith(`${versionId}:`))
    .map(([, group]) => group)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
}

export function filterGroupsForDisplay(
  groups: CriteriaGroup[],
  employeeRoleSnapshot: Role
): CriteriaGroup[] {
  const subjectSet = roleToSetKey(employeeRoleSnapshot);
  const result: CriteriaGroup[] = [];

  for (const group of groups) {
    if (group.setKey != null && group.setKey !== subjectSet) {
      continue;
    }

    const filteredCriteria = (group.criteria || []).filter((criterion) => {
      if (criterion.setKey != null) {
        return criterion.setKey === subjectSet;
      }
      if (group.setKey != null) {
        return group.setKey === subjectSet;
      }
      return criterion.appliesTo.includes(employeeRoleSnapshot);
    });

    if (filteredCriteria.length > 0) {
      result.push({
        ...group,
        criteria: filteredCriteria,
      });
    }
  }

  return result;
}

function buildDisplayRounds(
  evaluation: Evaluation,
  criteriaSnapshot: CriteriaSnapshot,
  gradeSnapshot: GradeSnapshot
): EvaluationDisplayRound[] {
  // Only payload-bearing, authorized rounds live in `evaluation.rounds`. Rounds
  // whose payload is withheld for the viewer are omitted entirely and surfaced
  // separately via EvaluationDisplayDto.redactedRounds — no placeholder round
  // (and therefore no fabricated totalScore/grade) is ever synthesized.
  return evaluation.rounds.map((round) => ({
    round: round.round,
    status: round.status,
    totalScore: round.totalScore,
    grade: round.grade,
    evaluatorRole: round.evaluatorRole,
    criteriaConfigVersionId: round.criteriaConfigVersionId ?? null,
    gradeConfigVersionId: round.gradeConfigVersionId ?? null,
    snapshotState: roundSnapshotState(round, criteriaSnapshot, gradeSnapshot),
    criteriaGroups: roundSnapshotState(round, criteriaSnapshot, gradeSnapshot) === 'authoritative'
      ? filterGroupsForDisplay(groupsForVersion(round.criteriaConfigVersionId, criteriaSnapshot), evaluation.employeeRole)
      : [],
  }));
}

export async function getEvaluationDisplayAdmin(
  evaluationId: string,
  viewer?: User | null,
  options?: LoadCriteriaSnapshotsOptions
): Promise<EvaluationDisplayDto | null> {
  if (!evaluationId || !viewer) return null;

  // Authorization must complete before any historical version identifiers are queried.
  const evaluation = await getEvaluationByIdAdmin(evaluationId, viewer);
  if (!evaluation) return null;

  const criteriaVersionIds = uniqueNonEmpty(evaluation.rounds.map((round) => round.criteriaConfigVersionId));
  const gradeVersionIds = uniqueNonEmpty(evaluation.rounds.map((round) => round.gradeConfigVersionId));
  const [criteriaSnapshot, gradeSnapshot] = await Promise.all([
    loadCriteriaSnapshots(criteriaVersionIds, options),
    loadGradeSnapshots(gradeVersionIds, options?.client),
  ]);

  return {
    evaluationId: evaluation.id,
    employeeRoleSnapshot: evaluation.employeeRole,
    rounds: buildDisplayRounds(evaluation, criteriaSnapshot, gradeSnapshot),
    redactedRounds: (evaluation.roundMetadata ?? []).filter((meta) => meta.isRedacted === true),
  };
}
