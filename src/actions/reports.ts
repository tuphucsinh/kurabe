'use server';

import { getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { requireRole } from '@/lib/auth';
import {
  getEvaluationResultProjection,
  sanitizeEvaluationResultProjectionForView,
  type SetFilterOption,
} from '@/lib/evaluation-result-projection';
import { Grade, User } from '@/types';

export interface CriteriaAnalysisItem {
  group: string;
  avgScore: number;
  percentage: number;
  groupId: string;
  versionId: string;
  setKey: string | null;
  configVersion: number | null;
  label: string;
}

export interface ReportSetKpiTeam {
  id: string;
  name: string;
  avgScore: number;
  sampleCount: number;
  progress: number;
}

export interface ReportSetKpiTopPerformer {
  id: string;
  name: string;
  teamName: string;
  score: number;
  grade: string;
}

export interface ReportSetKpiBucket {
  key: string;
  setKey: 'leader' | 'staff' | 'worker';
  criteriaVersionId: string;
  label: string;
  sampleCount: number;
  average: number;
  highGradeRate?: number;
  topPerformers: ReportSetKpiTopPerformer[];
  teamStats: ReportSetKpiTeam[];
}

export interface ReportExcludedKpiInfo {
  unavailableCount: number;
  legacyCount: number;
  otherPeriodCount: number;
  totalExcluded: number;
  notice?: string | null;
}

export interface ReportAggregationData {
  stats: {
    totalEmployees: number;
    /** Authoritative Approved-only average; null when incompatible scoring bases are mixed. */
    avgScore: number | null;
    /** Authoritative Approved-only high-grade (≥ AB) rate; null when bases are mixed. */
    highGradeRate: number | null;
    pendingCount: number;
    approvedCount: number;
    invalidCount: number;
    legacyCount: number;
    sampleCount: number;
    mixedBasis: boolean;
  };
  gradeDistribution: { grade: Grade; count: number; color: string }[];
  teamStats: { id: string; name: string; avgScore: number; progress: number }[];
  criteriaAnalysis: CriteriaAnalysisItem[];
  mixedSets?: boolean;
  note?: string | null;
  mixedSetsNote?: string | null;
  topPerformers: { id: string; name: string; teamName: string; score: number; grade: string }[];
  setKpis: ReportSetKpiBucket[];
  excludedKpis?: ReportExcludedKpiInfo;
}

const GRADE_COLOR_MAP: Record<string, string> = {
  S: 'bg-amber-500',
  A: 'bg-blue-600',
  AB: 'bg-blue-400',
  B: 'bg-green-500',
  C: 'bg-orange-500',
  D: 'bg-red-500',
};

async function getReportAggregationInner(
  periodId: string,
  selectedTeam: string,
  selectedSet: string = 'all',
  viewer: User | null
): Promise<ReportAggregationData | null> {
  if (!periodId) return null;

  const validSetKeys = ['all', 'leader', 'staff', 'worker'] as const;
  if (!validSetKeys.includes(selectedSet as typeof validSetKeys[number])) {
    throw new Error('INVALID_KPI_SET_FILTER');
  }
  const normalizedSelectedSet = selectedSet as SetFilterOption;

  const [evaluations, users] = await Promise.all([
    getEvaluationsByPeriodAdmin(periodId, viewer),
    getUsersAdmin(viewer),
  ]);

  const userMap = new Map<string, User>(users.map((u) => [u.id, u]));

  // Team filter — KHÔNG loại Manager: Manager có evaluation riêng trong kỳ.
  const usersByTeam = new Map<string, User[]>();
  users.forEach((u) => {
    if (!usersByTeam.has(u.teamId)) usersByTeam.set(u.teamId, []);
    usersByTeam.get(u.teamId)!.push(u);
  });
  // Effective authorized team filter; null means "all authorized employees".
  const teamFilterIds = selectedTeam === 'all'
    ? null
    : new Set((usersByTeam.get(selectedTeam) || []).map((u) => u.id));

  // Single projector, scoped to the effective team filter, so every official
  // aggregate below (roster, average, high-grade rate, coverage, grade
  // distribution, criteria analysis, top slice) is filter-consistent server-side
  // instead of org-wide.
  const rawProjection = await getEvaluationResultProjection(periodId, viewer, {
    evaluations,
    employeeIds: teamFilterIds,
  });
  if (!rawProjection) return null;

  // Apply compatibility-view helper: sanitizes average/rate/top/teams when bases are mixed or excluded
  const projection = sanitizeEvaluationResultProjectionForView(rawProjection, normalizedSelectedSet);

  const teamStats = projection.teamBreakdown.map((team) => ({
    id: team.teamId,
    name: team.name,
    avgScore: team.average,
    progress: 0,
  }));
  const maxTeamAvg = teamStats.reduce((max, team) => Math.max(max, team.avgScore), 0);
  teamStats.forEach((team) => {
    team.progress = maxTeamAvg > 0 ? Math.min(100, (team.avgScore / maxTeamAvg) * 100) : 0;
  });

  const rawCriteria = normalizedSelectedSet === 'all'
    ? rawProjection.criteriaBreakdown
    : rawProjection.criteriaBreakdown.filter((entry) => !entry.setKey || entry.setKey === normalizedSelectedSet);

  const criteriaAnalysis: CriteriaAnalysisItem[] = rawCriteria.map((entry) => ({
    group: entry.group,
    avgScore: entry.avgScore,
    percentage: entry.percentage,
    groupId: entry.groupId,
    versionId: entry.versionId,
    setKey: entry.setKey,
    configVersion: entry.configVersion,
    label: entry.label,
  }));

  const distinctSetsOrVersions = new Set(
    criteriaAnalysis.map((entry) => `${entry.setKey ?? ''}:${entry.versionId ?? ''}`)
  );
  const mixedSets = distinctSetsOrVersions.size > 1;
  const note = mixedSets ? 'Không so sánh trực tiếp giữa các bộ tiêu chí' : null;

  Object.defineProperty(criteriaAnalysis, 'mixedSets', {
    value: mixedSets,
    writable: true,
    configurable: true,
    enumerable: false,
  });
  Object.defineProperty(criteriaAnalysis, 'note', {
    value: note,
    writable: true,
    configurable: true,
    enumerable: false,
  });

  const topPerformers = projection.result.top.map((entry) => ({
    id: entry.employeeId,
    name: userMap.get(entry.employeeId)?.name || 'Unknown',
    teamName: entry.teamId ? (rawProjection.teamBreakdown.find((t) => t.teamId === entry.teamId)?.name || '—') : '—',
    score: entry.score ?? 0,
    grade: entry.grade ?? '-',
  }));

  // D2 per-set / per-basis KPI mapping (using official persisted entry.score, not latest-round fallback)
  const setKpis: ReportSetKpiBucket[] = (projection.result.setKpis || []).map((bucket) => {
    const maxBucketTeamAvg = bucket.teams.reduce((max, t) => Math.max(max, t.average), 0);
    const bucketTeamStats: ReportSetKpiTeam[] = bucket.teams.map((t) => ({
      id: t.teamId,
      name: t.name,
      avgScore: t.average,
      sampleCount: t.sampleCount,
      progress: maxBucketTeamAvg > 0 ? Math.min(100, (t.average / maxBucketTeamAvg) * 100) : 0,
    }));

    const bucketTopPerformers: ReportSetKpiTopPerformer[] = bucket.top.map((entry) => ({
      id: entry.employeeId,
      name: userMap.get(entry.employeeId)?.name || 'Unknown',
      teamName: entry.teamId ? (rawProjection.teamBreakdown.find((t) => t.teamId === entry.teamId)?.name || '—') : '—',
      score: entry.score ?? 0,
      grade: entry.grade ?? '-',
    }));

    return {
      key: bucket.key,
      setKey: bucket.setKey,
      criteriaVersionId: bucket.criteriaVersionId,
      label: bucket.label,
      sampleCount: bucket.sampleCount,
      average: bucket.average,
      highGradeRate: bucket.highGradeRate,
      topPerformers: bucketTopPerformers,
      teamStats: bucketTeamStats,
    };
  });

  const excludedKpis: ReportExcludedKpiInfo | undefined = projection.excludedKpis
    ? {
        unavailableCount: projection.excludedKpis.unavailableBasisCount,
        legacyCount: projection.excludedKpis.missingBasisCount,
        otherPeriodCount: projection.excludedKpis.otherPeriodCount,
        totalExcluded: projection.excludedKpis.total,
        notice:
          projection.excludedKpis.total > 0
            ? `Có ${projection.excludedKpis.total} đánh giá không thuộc bộ tiêu chuẩn hoặc phiên bản hợp lệ đã được tách riêng khỏi chỉ số chính thức.`
            : null,
      }
    : undefined;

  return {
    stats: {
      totalEmployees: projection.roster.total,
      avgScore: projection.result.average,
      highGradeRate: projection.result.highGradeRate,
      pendingCount: projection.coverage.pending,
      approvedCount: projection.result.approvedCount,
      invalidCount: projection.result.invalidCount,
      legacyCount: projection.result.legacyCount,
      sampleCount: projection.result.sampleCount,
      mixedBasis: projection.result.mixedBasis,
    },
    gradeDistribution: projection.result.gradeDistribution.map((item) => ({
      grade: item.grade,
      count: item.count,
      color: GRADE_COLOR_MAP[item.grade] || 'bg-slate-400',
    })),
    teamStats,
    criteriaAnalysis,
    topPerformers,
    mixedSets,
    note,
    mixedSetsNote: note,
    setKpis,
    excludedKpis,
  };
}

export async function getReportAggregation(
  periodId: string,
  selectedTeam: string = 'all',
  selectedSet: string = 'all'
): Promise<ReportAggregationData | null> {
  if (!periodId) return null;
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) {
    throw new Error(auth.error || 'Unauthorized');
  }
  // KHÔNG unstable_cache — bỏ cache trong hàm (gây lag Vercel + trang trắng, Fix A 2026-08-16)
  return getReportAggregationInner(periodId, selectedTeam, selectedSet, auth.user);
}
