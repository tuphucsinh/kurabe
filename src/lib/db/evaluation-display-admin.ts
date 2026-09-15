import 'server-only';

import { decodeLegacyAppliesToRoles, isCriterionAudience, mapAudiencesToRoles } from '@/lib/criteria-applicability';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  CriteriaGroup,
  Criterion,
  Evaluation,
  EvaluationDisplayDto,
  EvaluationDisplayRound,
  EvaluationSnapshotState,
  User,
} from '@/types';
import { Tables } from '@/types/database';
import { getEvaluationByIdAdmin } from '@/lib/db/evaluations-admin';

type CriteriaConfigVersionRow = Pick<Tables<'criteria_config_versions'>, 'id' | 'version_no'>;
type CriteriaGroupVersionRow = Pick<
  Tables<'criteria_group_versions'>,
  'version_id' | 'group_id' | 'code' | 'name' | 'short_name' | 'sort_order'
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

type CriteriaSnapshot = {
  groups: Map<string, CriteriaGroup>;
  unavailable: Set<string>;
};

type GradeSnapshot = {
  available: Set<string>;
  unavailable: Set<string>;
};

const uniqueNonEmpty = (values: Array<string | null | undefined>): string[] => [
  ...new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)),
];

function buildCriteriaSnapshot(
  versionIds: readonly string[],
  configs: CriteriaConfigVersionRow[],
  groups: CriteriaGroupVersionRow[],
  criteria: CriterionVersionRow[],
  levels: CriterionLevelVersionRow[],
  audiences: CriterionAudienceVersionRow[]
): CriteriaSnapshot {
  const requested = new Set(versionIds);
  const knownVersions = new Map(configs.map((row) => [row.id, row.version_no]));
  const unavailable = new Set(versionIds.filter((id) => !knownVersions.has(id)));
  const result = new Map<string, CriteriaGroup>();

  for (const versionId of versionIds) {
    const versionGroups = groups
      .filter((row) => row.version_id === versionId)
      .sort((a, b) => a.sort_order - b.sort_order || a.group_id.localeCompare(b.group_id));
    const versionCriteria = criteria.filter((row) => row.version_id === versionId);
    const versionLevels = levels.filter((row) => row.version_id === versionId);
    const versionAudiences = audiences.filter((row) => row.version_id === versionId);
    let valid = requested.has(versionId) && knownVersions.has(versionId) && versionGroups.length > 0;

    for (const groupRow of versionGroups) {
      const groupCriteria = versionCriteria
        .filter((row) => row.group_id === groupRow.group_id)
        .sort((a, b) => a.sort_order - b.sort_order || a.criterion_id.localeCompare(b.criterion_id));

      if (groupCriteria.length === 0) {
        valid = false;
        continue;
      }

      const mappedCriteria: Criterion[] = groupCriteria.map((criterionRow) => {
        const criterionLevels = versionLevels
          .filter((row) => row.criterion_id === criterionRow.criterion_id)
          .sort((a, b) => a.sort_order - b.sort_order || a.level_id.localeCompare(b.level_id));
        const criterionAudiences = versionAudiences
          .filter((row) => row.criterion_id === criterionRow.criterion_id)
          .map((row) => row.audience);
        const roles = criterionAudiences.length > 0 && criterionAudiences.every(isCriterionAudience)
          ? mapAudiencesToRoles(criterionAudiences)
          : decodeLegacyAppliesToRoles(criterionRow.applies_to);

        if (
          criterionLevels.length === 0
          || roles.length === 0
          || (criterionAudiences.length > 0 && !criterionAudiences.every(isCriterionAudience))
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
          configVersion: knownVersions.get(versionId),
          configVersionId: versionId,
        };
      });

      const group: CriteriaGroup = {
        id: groupRow.group_id,
        code: groupRow.code,
        name: groupRow.name,
        shortName: groupRow.short_name ?? groupRow.name,
        criteria: mappedCriteria,
        sortOrder: groupRow.sort_order,
        configVersion: knownVersions.get(versionId),
        configVersionId: versionId,
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

async function loadCriteriaSnapshots(versionIds: readonly string[]): Promise<CriteriaSnapshot> {
  if (versionIds.length === 0) return { groups: new Map(), unavailable: new Set() };

  const [configResult, groupsResult, criteriaResult, levelsResult, audiencesResult] = await Promise.all([
    supabaseAdmin.from('criteria_config_versions').select('id, version_no').in('id', versionIds),
    supabaseAdmin
      .from('criteria_group_versions')
      .select('version_id, group_id, code, name, short_name, sort_order')
      .in('version_id', versionIds),
    supabaseAdmin
      .from('criterion_versions')
      .select('version_id, criterion_id, group_id, code, name, description, applies_to, weight, default_level_index, sort_order')
      .in('version_id', versionIds),
    supabaseAdmin
      .from('criterion_level_versions')
      .select('version_id, criterion_id, level_id, points, label, description, sort_order')
      .in('version_id', versionIds),
    supabaseAdmin
      .from('criterion_audience_versions')
      .select('version_id, criterion_id, audience')
      .in('version_id', versionIds),
  ]);

  const results = [configResult, groupsResult, criteriaResult, levelsResult, audiencesResult];
  if (results.some((result) => result.error)) {
    console.error('getEvaluationDisplayAdmin criteria snapshot query failed');
    return { groups: new Map(), unavailable: new Set(versionIds) };
  }

  return buildCriteriaSnapshot(
    versionIds,
    (configResult.data ?? []) as CriteriaConfigVersionRow[],
    (groupsResult.data ?? []) as CriteriaGroupVersionRow[],
    (criteriaResult.data ?? []) as CriterionVersionRow[],
    (levelsResult.data ?? []) as CriterionLevelVersionRow[],
    (audiencesResult.data ?? []) as CriterionAudienceVersionRow[]
  );
}

async function loadGradeSnapshots(versionIds: readonly string[]): Promise<GradeSnapshot> {
  if (versionIds.length === 0) return { available: new Set(), unavailable: new Set() };

  const { data, error } = await supabaseAdmin
    .from('grade_band_versions')
    .select('id')
    .in('id', versionIds);
  if (error) {
    console.error('getEvaluationDisplayAdmin grade snapshot query failed');
    return { available: new Set(), unavailable: new Set(versionIds) };
  }

  const available = new Set((data ?? [] as GradeConfigVersionRow[]).map((row: GradeConfigVersionRow) => row.id));
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

function groupsForVersion(versionId: string | null | undefined, snapshot: CriteriaSnapshot): CriteriaGroup[] {
  if (!versionId) return [];
  return [...snapshot.groups.entries()]
    .filter(([key]) => key.startsWith(`${versionId}:`))
    .map(([, group]) => group)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id));
}

function buildDisplayRounds(
  evaluation: Evaluation,
  criteriaSnapshot: CriteriaSnapshot,
  gradeSnapshot: GradeSnapshot
): EvaluationDisplayRound[] {
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
      ? groupsForVersion(round.criteriaConfigVersionId, criteriaSnapshot)
      : [],
  }));
}

export async function getEvaluationDisplayAdmin(
  evaluationId: string,
  viewer?: User | null
): Promise<EvaluationDisplayDto | null> {
  if (!evaluationId || !viewer) return null;

  // Authorization must complete before any historical version identifiers are queried.
  const evaluation = await getEvaluationByIdAdmin(evaluationId, viewer);
  if (!evaluation) return null;

  const criteriaVersionIds = uniqueNonEmpty(evaluation.rounds.map((round) => round.criteriaConfigVersionId));
  const gradeVersionIds = uniqueNonEmpty(evaluation.rounds.map((round) => round.gradeConfigVersionId));
  const [criteriaSnapshot, gradeSnapshot] = await Promise.all([
    loadCriteriaSnapshots(criteriaVersionIds),
    loadGradeSnapshots(gradeVersionIds),
  ]);

  return {
    evaluationId: evaluation.id,
    employeeRoleSnapshot: evaluation.employeeRole,
    rounds: buildDisplayRounds(evaluation, criteriaSnapshot, gradeSnapshot),
  };
}
