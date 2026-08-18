import { getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { getTeamsAdmin } from '@/lib/db/teams-admin';
import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { Grade, User, Team, Evaluation, CriteriaGroup } from '@/types';

export interface ReportPrimaryData {
  stats: {
    totalEmployees: number;
    avgScore: number;
    highGradeRate: number;
    pendingCount: number;
  };
  gradeDistribution: { grade: Grade; count: number; color: string }[];
}

export interface ReportSecondaryData {
  teamStats: { id: string; name: string; avgScore: number; progress: number }[];
  criteriaAnalysis: { group: string; avgScore: number; percentage: number }[];
  topPerformers: { id: string; name: string; teamName: string; score: number; grade: string }[];
}

export interface ReportAggregationData extends ReportPrimaryData, ReportSecondaryData {}

const GRADE_COLOR_MAP: Record<string, string> = {
  'S': 'bg-amber-500',
  'A': 'bg-blue-600',
  'AB': 'bg-blue-400',
  'B': 'bg-green-500',
  'C': 'bg-orange-500',
  'D': 'bg-red-500'
};

const GRADES: Grade[] = ['S', 'A', 'AB', 'B', 'C', 'D'];

export function computeReportPrimaryData(
  evaluations: Evaluation[],
  users: User[],
  selectedTeam: string = 'all'
): ReportPrimaryData {
  // Filter by team — KHÔNG loại Manager: Manager có evaluation riêng trong kỳ (được đánh giá)
  const filteredUsers = selectedTeam === 'all'
    ? users
    : users.filter((u) => u.teamId === selectedTeam);

  const userIds = new Set(filteredUsers.map((u) => u.id));
  const filteredEvals = evaluations.filter((e) => userIds.has(e.employeeId));

  let totalScore = 0;
  let highGrades = 0;
  const gradeCounts: Record<string, number> = {
    'S': 0, 'A': 0, 'AB': 0, 'B': 0, 'C': 0, 'D': 0
  };

  filteredEvals.forEach((e) => {
    const score = e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0);
    const grade = (e.finalGrade || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].grade : null)) as string;

    totalScore += score;

    if (grade) {
      if (['S', 'A', 'AB'].includes(grade)) highGrades++;
      if (gradeCounts[grade] !== undefined) gradeCounts[grade]++;
    }
  });

  const totalEmployees = filteredUsers.length;
  const evaluatedCount = filteredEvals.length;
  // "Chưa đánh giá" = đã có evaluation nhưng CHƯA Approved (kết quả chưa chốt)
  const pendingCount = filteredEvals.filter((e) => e.status !== 'Approved').length;
  const avgScore = evaluatedCount > 0 ? totalScore / evaluatedCount : 0;
  const highGradeRate = evaluatedCount > 0 ? (highGrades / evaluatedCount) * 100 : 0;

  const gradeDistribution = GRADES.map((g) => ({
    grade: g,
    count: gradeCounts[g as string] || 0,
    color: GRADE_COLOR_MAP[g as string] || 'bg-slate-400'
  }));

  return {
    stats: {
      totalEmployees,
      avgScore,
      highGradeRate,
      pendingCount
    },
    gradeDistribution
  };
}

export function computeReportSecondaryData(
  evaluations: Evaluation[],
  users: User[],
  teams: Team[],
  allCriteriaData: CriteriaGroup[],
  selectedTeam: string = 'all'
): ReportSecondaryData {
  const userMap = new Map<string, User>();
  const usersByTeam = new Map<string, User[]>();

  users.forEach((u) => {
    userMap.set(u.id, u);
    if (!usersByTeam.has(u.teamId)) {
      usersByTeam.set(u.teamId, []);
    }
    usersByTeam.get(u.teamId)!.push(u);
  });

  const teamMap = new Map(teams.map((t) => [t.id, t]));

  const filteredUsers = selectedTeam === 'all'
    ? users
    : (usersByTeam.get(selectedTeam) || []);

  const userIds = new Set(filteredUsers.map((u) => u.id));
  const filteredEvals = evaluations.filter((e) => userIds.has(e.employeeId));

  const criteriaGroupIdMap = new Map<string, string>();
  allCriteriaData.forEach((g) => {
    g.criteria.forEach((c) => criteriaGroupIdMap.set(c.id, g.code));
  });

  let maxTotalScore = 0;
  const groupCriteriaCount: Record<string, number> = {};
  const groupMaxScore: Record<string, number> = {};
  allCriteriaData.forEach((g) => {
    let gm = 0;
    let count = 0;
    g.criteria.forEach((c) => {
      const maxPoints = (c.levels || []).reduce((m, l) => Math.max(m, l.points || 0), 0);
      gm += maxPoints;
      maxTotalScore += maxPoints;
      count += 1;
    });
    groupCriteriaCount[g.code] = count;
    groupMaxScore[g.code] = gm;
  });

  const criteriaGroupScores: Record<string, { totalGroupScore: number; count: number }> = {
    'A': { totalGroupScore: 0, count: 0 },
    'B': { totalGroupScore: 0, count: 0 },
    'C': { totalGroupScore: 0, count: 0 },
    'D': { totalGroupScore: 0, count: 0 },
    'E': { totalGroupScore: 0, count: 0 },
    'F': { totalGroupScore: 0, count: 0 }
  };

  filteredEvals.forEach((e) => {
    const latestScores = (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].scores : {}) as Record<string, number>;
    Object.entries(latestScores).forEach(([cid, s]) => {
      const groupId = criteriaGroupIdMap.get(cid);
      if (groupId && criteriaGroupScores[groupId]) {
        criteriaGroupScores[groupId].totalGroupScore += s;
        criteriaGroupScores[groupId].count++;
      }
    });
  });

  // Team Comparison
  const teamStatsMap = new Map<string, { id: string; name: string; totalScore: number; count: number }>();
  teams.forEach((t) => teamStatsMap.set(t.id, { id: t.id, name: t.name, totalScore: 0, count: 0 }));

  evaluations.forEach((e) => {
    const user = userMap.get(e.employeeId);
    if (user && teamStatsMap.has(user.teamId)) {
      const score = e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0);
      const teamStat = teamStatsMap.get(user.teamId)!;
      teamStat.totalScore += score;
      teamStat.count++;
    }
  });

  const teamStats = Array.from(teamStatsMap.values()).map((ts) => {
    const teamAvg = ts.count > 0 ? ts.totalScore / ts.count : 0;
    return {
      id: ts.id,
      name: ts.name,
      avgScore: teamAvg,
      progress: maxTotalScore > 0 ? (teamAvg / maxTotalScore) * 100 : 0
    };
  });

  // Criteria Group Analysis (A-F)
  const groupCodes = ['A', 'B', 'C', 'D', 'E', 'F'];
  const criteriaAnalysis = groupCodes.map((group) => {
    const stats = criteriaGroupScores[group] || { totalGroupScore: 0, count: 0 };
    const count = groupCriteriaCount[group] || 0;
    const maxScore = groupMaxScore[group] || 0;
    const avgScore = stats.count > 0 ? stats.totalGroupScore / stats.count : 0;
    const avgMax = count > 0 && maxScore > 0 ? maxScore / count : 0;
    return {
      group,
      avgScore,
      percentage: avgMax > 0 ? (avgScore / avgMax) * 100 : 0
    };
  });

  // Top Performers
  const topPerformers = filteredEvals
    .map((e) => {
      const user = userMap.get(e.employeeId);
      const team = teamMap.get(user?.teamId ?? '');
      return {
        id: e.employeeId,
        name: user?.name || 'Unknown',
        teamName: team?.name || '—',
        score: e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0),
        grade: (e.finalGrade || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].grade : '-')) as string
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    teamStats,
    criteriaAnalysis,
    topPerformers
  };
}

export interface ReportsSharedData {
  evaluations: Evaluation[];
  users: User[];
  teams: Team[];
}

export interface ReportsSource {
  shared: Promise<ReportsSharedData>;
  teams: Promise<Team[]>;
  primary: Promise<ReportPrimaryData | null>;
  secondary: Promise<ReportSecondaryData | null>;
}

export function createReportsSource(
  periodId: string,
  selectedTeam: string = 'all',
  viewer: User | null
): ReportsSource {
  if (!periodId) {
    return {
      shared: Promise.resolve({ evaluations: [], users: [], teams: [] }),
      teams: viewer ? getTeamsAdmin(viewer) : Promise.resolve([]),
      primary: Promise.resolve(null),
      secondary: Promise.resolve(null),
    };
  }

  // Fan-out root: shared evaluations, users, teams read once per page request
  const shared = Promise.all([
    getEvaluationsByPeriodAdmin(periodId, viewer),
    getUsersAdmin(viewer),
    getTeamsAdmin(viewer),
  ]).then(([evaluations, users, teams]) => ({
    evaluations,
    users,
    teams,
  }));

  // Teams derived promise for page filter (reusing shared read)
  const teamsPromise = shared
    .then(({ teams }) => teams)
    .catch((error) => {
      console.error('Error in reportsSource.teams:', error);
      return [];
    });

  // Primary derived promise: KPI / grade distribution (no criteria)
  const primary = shared
    .then(({ evaluations, users }) =>
      computeReportPrimaryData(evaluations, users, selectedTeam)
    )
    .catch((error) => {
      console.error('Error in reportsSource.primary:', error);
      return null;
    });

  // Secondary derived promise: teamStats / criteriaHeatmap / topPerformers (fetches criteria lazily)
  const secondary = Promise.all([shared, getAllCriteriaGroups()])
    .then(([{ evaluations, users, teams }, allCriteriaData]) =>
      computeReportSecondaryData(evaluations, users, teams, allCriteriaData, selectedTeam)
    )
    .catch((error) => {
      console.error('Error in reportsSource.secondary:', error);
      return null;
    });

  return {
    shared,
    teams: teamsPromise,
    primary,
    secondary,
  };
}
