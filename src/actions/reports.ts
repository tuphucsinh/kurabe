'use server';

import { getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { requireRole } from '@/lib/auth';
import { getEvaluationResultProjection } from '@/lib/evaluation-result-projection';
import { Grade, Evaluation, User } from '@/types';

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
  criteriaAnalysis: { group: string; avgScore: number; percentage: number }[];
  topPerformers: { id: string; name: string; teamName: string; score: number; grade: string }[];
}

const GRADE_COLOR_MAP: Record<string, string> = {
  S: 'bg-amber-500',
  A: 'bg-blue-600',
  AB: 'bg-blue-400',
  B: 'bg-green-500',
  C: 'bg-orange-500',
  D: 'bg-red-500',
};

/**
 * Raw display fallback score for a single evaluation row. Official metrics never
 * use this fallback — they come from the authoritative result projector which
 * honours persisted Approved final fields with nullish (not truthy) semantics so
 * a valid score 0 is preserved. Used to render the top-performer score with the
 * same nullish score-0 semantics (identical to the official score for every
 * valid Approved row).
 */
function evaluationScore(e: Evaluation): number {
  const lastRound = e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1] : undefined;
  return e.finalScore ?? lastRound?.totalScore ?? 0;
}

async function getReportAggregationInner(
  periodId: string,
  selectedTeam: string,
  viewer: User | null
): Promise<ReportAggregationData | null> {
  if (!periodId) return null;

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
  const projection = await getEvaluationResultProjection(periodId, viewer, {
    evaluations,
    employeeIds: teamFilterIds,
  });
  if (!projection) return null;

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

  const criteriaAnalysis = projection.criteriaBreakdown.map((entry) => ({
    group: entry.group,
    avgScore: entry.avgScore,
    percentage: entry.percentage,
  }));

  // Top performers come from the team-scoped top slice (the projector already
  // selected them from the scoped valid set BEFORE the TOP_LIMIT cap), so no
  // post-slice re-filtering can drop a selected team's performers.
  const evaluationById = new Map(evaluations.map((e) => [e.id, e]));
  const topPerformers = projection.result.top.map((entry) => {
    const evaluation = evaluationById.get(entry.evaluationId);
    return {
      id: entry.employeeId,
      name: userMap.get(entry.employeeId)?.name || 'Unknown',
      teamName: entry.teamId ? (projection.teamBreakdown.find((t) => t.teamId === entry.teamId)?.name || '—') : '—',
      score: evaluation ? evaluationScore(evaluation) : (entry.score ?? 0),
      grade: entry.grade ?? '-',
    };
  });

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
  };
}

export async function getReportAggregation(
  periodId: string,
  selectedTeam: string = 'all'
): Promise<ReportAggregationData | null> {
  if (!periodId) return null;
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) {
    throw new Error(auth.error || 'Unauthorized');
  }
  // KHÔNG unstable_cache — bỏ cache trong hàm (gây lag Vercel + trang trắng, Fix A 2026-08-16)
  return getReportAggregationInner(periodId, selectedTeam, auth.user);
}
