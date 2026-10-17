'use server';

import {
  getEvaluationsByPeriodAdmin,
  getEvaluationSummariesByPeriodAdmin,
} from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { getTeamsAdmin } from '@/lib/db/teams-admin';
import { loadCriteriaSnapshots, groupsForVersion } from '@/lib/db/evaluation-display-admin';
import { requireRole } from '@/lib/auth';
import { detectAnomalies } from '@/lib/anomaly';
import {
  formatCriteriaSetLabel,
  getEvaluationResultProjection,
  projectEvaluationResults,
  type EvaluationResultProjection,
  type ProjectionCoverage,
} from '@/lib/evaluation-result-projection';
import type { CriteriaGroup, Evaluation, EvaluationRound, Grade, SkillGapRadarDatum, User } from '@/types';

export interface DashboardRadarSet {
  key: string;
  setKey: string | null;
  versionId: string;
  label: string;
  data: SkillGapRadarDatum[];
  sampleCount: number;
}

export interface DashboardStats {
  completed: number;
  inProgress: number;
  notStarted: number;
  total: number;
  percent: number;
}

export interface DashboardGradeDistributionItem {
  grade: string;
  count: number;
  color: string;
}

export interface DashboardTeamStatusItem {
  id: string;
  name: string;
  membersCount: number;
  progress: number;
}

export interface DashboardRecentActivityItem {
  id: string;
  employeeId: string;
  evaluatorId: string;
  employeeName: string;
  evaluatorName: string;
  status: string;
  grade: string;
  date: string;
}

/** Rule-based anomaly, computed server-side — no raw round payload reaches the client. */
export interface DashboardAnomaly {
  evaluationId: string;
  employeeId: string;
  name: string;
  round: number;
  prevRound: number;
  prevScore: number;
  score: number;
  diff: number;
  severity: 'high' | 'medium';
}

/** Authoritative official-result summary surfaced on the dashboard (Approved-only). */
export interface DashboardResultSummary {
  approvedCount: number;
  invalidCount: number;
  legacyCount: number;
  average: number | null;
  highGradeRate: number | null;
  mixedBasis: boolean;
  sampleCount: number;
}

export interface DashboardLightData {
  stats: DashboardStats;
  gradeDistribution: DashboardGradeDistributionItem[];
  teamStatus: DashboardTeamStatusItem[];
  /** id → tên NV (đã fetch sẵn cho stats) — client components dùng thay vì fetch lại qua useUsers (fix flash UUID) */
  userNameById: Record<string, string>;
}

export interface DashboardHeavyData {
  recentActivities: DashboardRecentActivityItem[];
  /**
   * Minimized pending-review projections (round assignment/status only — no
   * round scores, notes or comments). Consumed by PendingReviews.
   */
  pendingEvaluations: Evaluation[];
  /** Server-computed anomalies — replaces the previous raw evaluations prop. */
  anomalies: DashboardAnomaly[];
  /** Server-computed skill-gap aggregate — replaces raw evaluations + criteriaGroups props. */
  radar: SkillGapRadarDatum[];
  /** Number of evaluations that contributed a paired self/manager radar sample. */
  radarSampleCount: number;
  /** Per-set radar breakdown when multiple sets or versions are present. */
  radarSets?: DashboardRadarSet[];
  /** Non-Approved records already holding a submitted round (visible in progress only). */
  frozenIncomplete: number;
  result: DashboardResultSummary;
  coverage: ProjectionCoverage;
  userNameById: Record<string, string>;
}

export interface DashboardData extends DashboardLightData, DashboardHeavyData {}

const GRADE_COLORS: Record<string, string> = {
  S: 'bg-indigo-500',
  A: 'bg-emerald-500',
  AB: 'bg-teal-500',
  B: 'bg-blue-500',
  C: 'bg-amber-500',
  D: 'bg-rose-500',
};

/**
 * Helper tính toán light stats/teamStatus/gradeDistribution/userNameById từ evaluations và users/teams.
 * Grade distribution and completed counts come from the single server result
 * projector (Approved-only, persisted final fields) to guarantee report/dashboard
 * agreement; progress counters remain roster-based.
 */
function computeDashboardLightMetrics(
  evaluations: Evaluation[],
  users: User[],
  teams: { id: string; name: string }[]
): DashboardLightData {
  const totalCount = users.length;

  // Chỉ tính evaluation của user ĐANG ACTIVE — evaluation của user đã xóa mềm (is_active=false) không tính vào dashboard
  const activeIds = new Set(users.map((u) => u.id));
  const activeEvaluations = evaluations.filter((e) => activeIds.has(e.employeeId));

  const projection = projectEvaluationResults({
    periodId: '',
    roster: users.map((u) => ({ employeeId: u.id, role: u.role, teamId: u.teamId || null })),
    evaluations,
  });

  const completed = projection.result.approvedCount;
  const dbNotStarted = activeEvaluations.filter((e) => e.status === 'NotStarted').length;
  const inProgress = activeEvaluations.filter((e) => e.status !== 'Approved' && e.status !== 'NotStarted').length;
  const notStarted = Math.max(0, totalCount - activeEvaluations.length) + dbNotStarted;

  const stats: DashboardStats = {
    completed,
    inProgress,
    notStarted,
    total: totalCount,
    percent: totalCount > 0 ? Math.round((completed / totalCount) * 100) : 0,
  };

  const gradeDistribution: DashboardGradeDistributionItem[] = projection.result.gradeDistribution.map((item) => ({
    grade: item.grade,
    count: item.count,
    color: GRADE_COLORS[item.grade] || 'bg-slate-500',
  }));

  const usersByTeam = new Map<string, User[]>();
  users.forEach((u) => {
    if (u.teamId) {
      if (!usersByTeam.has(u.teamId)) {
        usersByTeam.set(u.teamId, []);
      }
      usersByTeam.get(u.teamId)!.push(u);
    }
  });

  const approvedByEmployee = new Set(
    activeEvaluations.filter((e) => e.status === 'Approved').map((e) => e.employeeId)
  );

  const teamStatus: DashboardTeamStatusItem[] = teams.map((team) => {
    const members = usersByTeam.get(team.id) || [];
    const completedMembers = members.filter((m) => approvedByEmployee.has(m.id)).length;
    const progress = members.length > 0 ? Math.round((completedMembers / members.length) * 100) : 0;

    return {
      id: team.id,
      name: team.name,
      membersCount: members.length,
      progress,
    };
  });

  const userNameById = Object.fromEntries(users.map((u) => [u.id, u.name]));

  return {
    stats,
    gradeDistribution,
    teamStatus,
    userNameById,
  };
}

function buildRecentActivities(
  evaluations: Evaluation[],
  nameLookup: (id: string) => string | undefined
): DashboardRecentActivityItem[] {
  return evaluations
    .map((evaluation) => {
      const submittedRounds = evaluation.rounds && evaluation.rounds.length > 0
        ? [...evaluation.rounds]
            .filter((r): r is EvaluationRound & { submittedAt: string } => !!r.submittedAt)
            .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
        : [];
      const latestRound = submittedRounds[0]
        || (evaluation.rounds && evaluation.rounds.length > 0 ? evaluation.rounds[evaluation.rounds.length - 1] : undefined);
      const activityDate = submittedRounds[0]?.submittedAt || evaluation.updatedAt || evaluation.createdAt;

      return {
        id: evaluation.id,
        employeeId: evaluation.employeeId,
        evaluatorId: latestRound?.evaluatorId || '',
        employeeName: nameLookup(evaluation.employeeId) || 'Unknown',
        evaluatorName: (latestRound ? nameLookup(latestRound.evaluatorId) : undefined) || 'Unknown',
        status: evaluation.status,
        grade: (evaluation.finalGrade || (latestRound?.grade) || '-') as string,
        date: new Date(activityDate).toISOString(),
      };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
}

/**
 * Minimized pending-review projection: assignment + status only. No round
 * scores/notes/comment are ever included, so the heavy DTO carries no raw draft
 * payload. Shape-compatible with the existing PendingReviews consumer.
 */
function buildPendingEvaluations(evaluations: Evaluation[]): Evaluation[] {
  return evaluations
    .filter((evaluation) => evaluation.status !== 'Approved')
    .map((evaluation) => ({
      id: evaluation.id,
      periodId: evaluation.periodId,
      employeeId: evaluation.employeeId,
      employeeRole: evaluation.employeeRole,
      teamId: evaluation.teamId,
      currentRound: evaluation.currentRound,
      status: evaluation.status,
      createdAt: evaluation.createdAt,
      updatedAt: evaluation.updatedAt,
      rounds: (evaluation.rounds || []).map((round) => ({
        round: round.round,
        evaluatorId: round.evaluatorId,
        evaluatorRole: round.evaluatorRole,
        status: round.status,
        totalScore: 0,
        grade: 'Pending' as Grade,
        scores: {},
        createdAt: round.createdAt,
      })),
    }) as Evaluation);
}

function buildAnomalies(
  evaluations: Evaluation[],
  nameById: Map<string, string>
): DashboardAnomaly[] {
  return detectAnomalies(evaluations, nameById).map((anomaly) => ({
    evaluationId: anomaly.evaluationId,
    employeeId: anomaly.employeeId,
    name: anomaly.name,
    round: anomaly.round,
    prevRound: anomaly.prevRound,
    prevScore: anomaly.prevScore,
    score: anomaly.score,
    diff: anomaly.diff,
    severity: anomaly.severity,
  }));
}

/**
 * Server-computed skill-gap radar aggregate using the immutable pinned criteria
 * snapshot per manager round (never current criteria). Mirrors the previous
 * client computation now that raw rounds are not shipped.
 */
function buildRadar(
  evaluations: Evaluation[],
  criteriaGroupsByVersion: Map<string, CriteriaGroup[]>
): { radar: SkillGapRadarDatum[]; sampleCount: number; radarSets: DashboardRadarSet[] } {
  const accum = new Map<string, { subject: string; self: number; manager: number; count: number }>();
  let sampleCount = 0;

  interface SetBucket {
    key: string;
    setKey: string | null;
    versionId: string;
    label: string;
    groupAccum: Map<string, { subject: string; self: number; manager: number; count: number }>;
    sampleCount: number;
  }
  const setBuckets = new Map<string, SetBucket>();

  for (const evaluation of evaluations) {
    const rounds = evaluation.rounds || [];
    if (rounds.length === 0) continue;
    const selfRound = rounds.find((r) => r.evaluatorId === evaluation.employeeId);
    const managerRounds = rounds.filter((r) => r.evaluatorId !== evaluation.employeeId);
    const managerRound = managerRounds.length > 0 ? managerRounds[managerRounds.length - 1] : null;
    if (!selfRound || !managerRound || Object.keys(managerRound.scores || {}).length === 0) continue;

    const versionId = managerRound.criteriaConfigVersionId ?? 'legacy_unknown';
    const groups = criteriaGroupsByVersion.get(managerRound.criteriaConfigVersionId ?? '') ?? [];
    if (groups.length === 0) continue;

    let contributedOverall = false;
    const contributedSetsThisEval = new Set<string>();

    for (const group of groups) {
      let selfGroupScore = 0;
      let managerGroupScore = 0;
      let maxApplicableScore = 0;
      for (const criterion of group.criteria) {
        const managerScore = managerRound.scores[criterion.id];
        if (managerScore !== undefined) {
          const maxLevel = Math.max(...criterion.levels.map((l) => l.points), 1);
          maxApplicableScore += maxLevel;
          managerGroupScore += managerScore;
          selfGroupScore += selfRound.scores[criterion.id] || 0;
        }
      }
      if (maxApplicableScore <= 0) continue;

      const setKey = (group.setKey as string) ?? null;
      const groupVersionId = group.configVersionId || versionId;
      const setBucketKey = `${setKey ?? ''}:${groupVersionId}`;
      let bucket = setBuckets.get(setBucketKey);
      if (!bucket) {
        bucket = {
          key: setBucketKey,
          setKey,
          versionId: groupVersionId,
          label: formatCriteriaSetLabel(setKey, group.configVersion ?? null),
          groupAccum: new Map(),
          sampleCount: 0,
        };
        setBuckets.set(setBucketKey, bucket);
      }

      const setGroupEntry = bucket.groupAccum.get(group.id) || {
        subject: group.shortName || group.name,
        self: 0,
        manager: 0,
        count: 0,
      };
      setGroupEntry.self += (selfGroupScore / maxApplicableScore) * 100;
      setGroupEntry.manager += (managerGroupScore / maxApplicableScore) * 100;
      setGroupEntry.count += 1;
      bucket.groupAccum.set(group.id, setGroupEntry);
      contributedSetsThisEval.add(setBucketKey);

      const key = group.id;
      const entry = accum.get(key) || { subject: group.shortName || group.name, self: 0, manager: 0, count: 0 };
      entry.self += (selfGroupScore / maxApplicableScore) * 100;
      entry.manager += (managerGroupScore / maxApplicableScore) * 100;
      entry.count += 1;
      accum.set(key, entry);
      contributedOverall = true;
    }

    if (contributedOverall) sampleCount += 1;
    for (const sKey of contributedSetsThisEval) {
      const b = setBuckets.get(sKey);
      if (b) b.sampleCount += 1;
    }
  }

  const radar = [...accum.values()].map((entry) => ({
    subject: entry.subject,
    Self: entry.count > 0 ? Math.round(entry.self / entry.count) : 0,
    Manager: entry.count > 0 ? Math.round(entry.manager / entry.count) : 0,
    fullMark: 100,
  }));

  const radarSets: DashboardRadarSet[] = [...setBuckets.values()]
    .map((bucket) => ({
      key: bucket.key,
      setKey: bucket.setKey,
      versionId: bucket.versionId,
      label: bucket.label,
      data: [...bucket.groupAccum.values()].map((entry) => ({
        subject: entry.subject,
        Self: entry.count > 0 ? Math.round(entry.self / entry.count) : 0,
        Manager: entry.count > 0 ? Math.round(entry.manager / entry.count) : 0,
        fullMark: 100,
      })),
      sampleCount: bucket.sampleCount,
    }))
    .sort((a, b) => {
      const setA = a.setKey ?? '';
      const setB = b.setKey ?? '';
      if (setA !== setB) return setA.localeCompare(setB);
      return a.versionId.localeCompare(b.versionId);
    });

  return { radar, sampleCount, radarSets };
}

function summarizeResult(projection: EvaluationResultProjection): DashboardResultSummary {
  return {
    approvedCount: projection.result.approvedCount,
    invalidCount: projection.result.invalidCount,
    legacyCount: projection.result.legacyCount,
    average: projection.result.average,
    highGradeRate: projection.result.highGradeRate,
    mixedBasis: projection.result.mixedBasis,
    sampleCount: projection.result.sampleCount,
  };
}

async function loadCriteriaGroupsByVersion(evaluations: Evaluation[]): Promise<Map<string, CriteriaGroup[]>> {
  const versionIds = [
    ...new Set(
      evaluations
        .flatMap((evaluation) => evaluation.rounds || [])
        .map((round) => round.criteriaConfigVersionId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ),
  ];
  const groupsByVersion = new Map<string, CriteriaGroup[]>();
  if (versionIds.length === 0) return groupsByVersion;
  const snapshot = await loadCriteriaSnapshots(versionIds);
  for (const versionId of versionIds) {
    const groups = groupsForVersion(versionId, snapshot);
    if (groups.length > 0) groupsByVersion.set(versionId, groups);
  }
  return groupsByVersion;
}

/**
 * Server action: Lấy dữ liệu nhẹ cho Dashboard (KPI, Trạng thái nhóm, Phân bổ xếp loại).
 * Dùng projection rút gọn getEvaluationSummariesByPeriodAdmin (EVALUATION_SUMMARY_SELECT),
 * TUYỆT ĐỐI KHÔNG tải criteriaGroups hoặc scores/notes/comments nặng của evaluations.
 */
export async function getDashboardLightData(periodId: string): Promise<DashboardLightData | null> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null || !periodId) return null;

  try {
    const [evaluations, users, teams] = await Promise.all([
      getEvaluationSummariesByPeriodAdmin(periodId, auth.user),
      getUsersAdmin(auth.user),
      getTeamsAdmin(auth.user),
    ]);

    return computeDashboardLightMetrics(evaluations, users, teams);
  } catch (error) {
    console.error('Error in getDashboardLightData:', error);
    return null;
  }
}

/**
 * Server action: Lấy dữ liệu nặng cho Dashboard (Pending reviews, Anomaly alerts, Radar chart, Recent activities).
 * Tải evaluations đầy đủ và pinned criteria snapshots; KHÔNG tải criteria hiện hành,
 * KHÔNG raw rounds/scores ra client (chỉ DTO tối giản + aggregate).
 */
export async function getDashboardHeavyData(
  periodId: string,
  userNameById: Record<string, string> = {}
): Promise<DashboardHeavyData | null> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null || !periodId) return null;

  try {
    const evaluations = await getEvaluationsByPeriodAdmin(periodId, auth.user);

    const nameLookup = (id: string) => userNameById[id];
    const nameById = new Map(evaluations.map((evaluation) => [
      evaluation.employeeId,
      userNameById[evaluation.employeeId] || evaluation.employeeId,
    ]));

    const [projection, criteriaGroupsByVersion] = await Promise.all([
      getEvaluationResultProjection(periodId, auth.user, { evaluations }),
      loadCriteriaGroupsByVersion(evaluations),
    ]);
    if (!projection) return null;
    const { radar, sampleCount, radarSets } = buildRadar(evaluations, criteriaGroupsByVersion);

    return {
      recentActivities: buildRecentActivities(evaluations, nameLookup),
      pendingEvaluations: buildPendingEvaluations(evaluations),
      anomalies: buildAnomalies(evaluations, nameById),
      radar,
      radarSampleCount: sampleCount,
      radarSets,
      frozenIncomplete: projection.progress.filter((entry) => entry.frozenIncomplete).length,
      result: summarizeResult(projection),
      coverage: projection.coverage,
      userNameById,
    };
  } catch (error) {
    console.error('Error in getDashboardHeavyData:', error);
    return null;
  }
}

/**
 * Server action kế thừa (legacy compatibility cho ai.ts, chat.ts) — không còn raw payload.
 */
export async function getDashboardData(periodId: string): Promise<DashboardData | null> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null || !periodId) return null;

  try {
    const [evaluations, users, teams] = await Promise.all([
      getEvaluationsByPeriodAdmin(periodId, auth.user),
      getUsersAdmin(auth.user),
      getTeamsAdmin(auth.user),
    ]);

    const light = computeDashboardLightMetrics(evaluations, users, teams);

    const nameById = new Map(
      evaluations.map((evaluation) => [
        evaluation.employeeId,
        users.find((u) => u.id === evaluation.employeeId)?.name || evaluation.employeeId,
      ])
    );
    const criteriaGroupsByVersion = await loadCriteriaGroupsByVersion(evaluations);
    const projection = projectEvaluationResults({
      periodId,
      roster: users.map((u) => ({ employeeId: u.id, role: u.role, teamId: u.teamId || null })),
      evaluations,
      criteriaGroupsByVersion,
    });
    const { radar, sampleCount, radarSets } = buildRadar(evaluations, criteriaGroupsByVersion);
    const nameLookup = (id: string) => users.find((u) => u.id === id)?.name;

    return {
      ...light,
      recentActivities: buildRecentActivities(evaluations, nameLookup),
      pendingEvaluations: buildPendingEvaluations(evaluations),
      anomalies: buildAnomalies(evaluations, nameById),
      radar,
      radarSampleCount: sampleCount,
      radarSets,
      frozenIncomplete: projection.progress.filter((entry) => entry.frozenIncomplete).length,
      result: summarizeResult(projection),
      coverage: projection.coverage,
    };
  } catch (error) {
    console.error('Error in getDashboardData:', error);
    return null;
  }
}
