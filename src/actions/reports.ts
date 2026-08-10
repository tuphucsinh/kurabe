'use server';

import { getEvaluationsByPeriod } from '@/lib/db/evaluations';
import { getUsers } from '@/lib/db/users';
import { getTeams } from '@/lib/db/teams';
import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { Grade, User } from '@/types';

export interface ReportAggregationData {
  stats: {
    totalEmployees: number;
    avgScore: number;
    highGradeRate: number;
    pendingCount: number;
  };
  gradeDistribution: { grade: Grade; count: number; color: string }[];
  teamStats: { id: string; name: string; avgScore: number; progress: number }[];
  criteriaAnalysis: { group: string; avgScore: number; percentage: number }[];
  topPerformers: { id: string; name: string; teamName: string; score: number; grade: string }[];
}

export async function getReportAggregation(
  periodId: string, 
  selectedTeam: string = 'all'
): Promise<ReportAggregationData | null> {
  if (!periodId) return null;

  try {
    const [evaluations, users, teams, allCriteriaData] = await Promise.all([
      getEvaluationsByPeriod(periodId),
      getUsers(),
      getTeams(),
      getAllCriteriaGroups()
    ]);

    // Pre-build Maps for O(1) lookups
    const userMap = new Map<string, User>();
    const usersByTeam = new Map<string, User[]>();
    
    users.forEach(u => {
      userMap.set(u.id, u);
      if (!usersByTeam.has(u.teamId)) {
        usersByTeam.set(u.teamId, []);
      }
      usersByTeam.get(u.teamId)!.push(u);
    });

    const teamMap = new Map(teams.map(t => [t.id, t]));

    // Filter by team
    const filteredUsers = selectedTeam === 'all' 
      ? users.filter(u => u.role !== 'Manager') 
      : (usersByTeam.get(selectedTeam) || []).filter(u => u.role !== 'Manager');

    const userIds = new Set(filteredUsers.map(u => u.id));
    
    // Filter evaluations
    const filteredEvals = evaluations.filter(e => userIds.has(e.employeeId));

    // Single-pass Grade & Criteria Counting
    let totalScore = 0;
    let highGrades = 0;
    const gradeCounts: Record<string, number> = {
      'S': 0, 'A': 0, 'AB': 0, 'B': 0, 'C': 0, 'D': 0
    };

    const criteriaGroupIdMap = new Map<string, string>();
    allCriteriaData.forEach(g => {
      g.criteria.forEach(c => criteriaGroupIdMap.set(c.id, g.code));
    });

    const criteriaGroupScores: Record<string, { totalGroupScore: number, count: number }> = {
      'A': { totalGroupScore: 0, count: 0 },
      'B': { totalGroupScore: 0, count: 0 },
      'C': { totalGroupScore: 0, count: 0 },
      'D': { totalGroupScore: 0, count: 0 },
      'E': { totalGroupScore: 0, count: 0 },
      'F': { totalGroupScore: 0, count: 0 }
    };

    filteredEvals.forEach(e => {
      const score = e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0);
      const grade = (e.finalGrade || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].grade : null)) as string;
      
      totalScore += score;
      
      if (grade) {
        if (['S', 'A', 'AB'].includes(grade)) highGrades++;
        if (gradeCounts[grade] !== undefined) gradeCounts[grade]++;
      }

      const latestScores = (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].scores : {}) as Record<string, number>;
      Object.entries(latestScores).forEach(([cid, s]) => {
        const groupId = criteriaGroupIdMap.get(cid);
        if (groupId && criteriaGroupScores[groupId]) {
          criteriaGroupScores[groupId].totalGroupScore += s;
          criteriaGroupScores[groupId].count++;
        }
      });
    });

    // Stats
    const totalEmployees = filteredUsers.length;
    const evaluatedCount = filteredEvals.length;
    const pendingCount = totalEmployees - evaluatedCount;
    const avgScore = evaluatedCount > 0 ? totalScore / evaluatedCount : 0;
    const highGradeRate = evaluatedCount > 0 ? (highGrades / evaluatedCount) * 100 : 0;

    // Grade Distribution
    const gradeColorMap: Record<string, string> = {
      'S': 'bg-amber-500',
      'A': 'bg-blue-600',
      'AB': 'bg-blue-400',
      'B': 'bg-green-500',
      'C': 'bg-orange-500',
      'D': 'bg-red-500'
    };

    const grades: Grade[] = ['S', 'A', 'AB', 'B', 'C', 'D'];
    const gradeDistribution = grades.map(g => ({
      grade: g,
      count: gradeCounts[g as string] || 0,
      color: gradeColorMap[g as string] || 'bg-slate-400'
    }));

    // Team Comparison
    const teamStatsMap = new Map<string, { id: string, name: string, totalScore: number, count: number }>();
    teams.forEach(t => teamStatsMap.set(t.id, { id: t.id, name: t.name, totalScore: 0, count: 0 }));

    evaluations.forEach(e => {
      const user = userMap.get(e.employeeId);
      if (user && teamStatsMap.has(user.teamId)) {
        const score = e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0);
        const teamStat = teamStatsMap.get(user.teamId)!;
        teamStat.totalScore += score;
        teamStat.count++;
      }
    });

    const teamStats = Array.from(teamStatsMap.values()).map(ts => {
      const teamAvg = ts.count > 0 ? ts.totalScore / ts.count : 0;
      return {
        id: ts.id,
        name: ts.name,
        avgScore: teamAvg,
        progress: (teamAvg / 150) * 100 // Assume 150 is max
      };
    });

    // Criteria Group Analysis (A-F)
    const groupCodes = ['A', 'B', 'C', 'D', 'E', 'F'];
    const criteriaAnalysis = groupCodes.map(group => {
      const stats = criteriaGroupScores[group] || { totalGroupScore: 0, count: 0 };
      return {
        group,
        avgScore: stats.count > 0 ? stats.totalGroupScore / stats.count : 0,
        percentage: stats.count > 0 ? (stats.totalGroupScore / (stats.count * 5)) * 100 : 0 
      };
    });

    // Top Performers
    const topPerformers = filteredEvals
      .map(e => {
        const user = userMap.get(e.employeeId);
        const team = teamMap.get(user?.teamId ?? '');
        return {
          id: e.employeeId,
          name: user?.name || 'Unknown',
          teamName: team?.name || 'Unknown',
          score: e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0),
          grade: (e.finalGrade || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].grade : '-')) as string
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      stats: {
        totalEmployees,
        avgScore,
        highGradeRate,
        pendingCount
      },
      gradeDistribution,
      teamStats,
      criteriaAnalysis,
      topPerformers
    };
  } catch (error) {
    console.error('Error in getReportAggregation:', error);
    return null;
  }
}
