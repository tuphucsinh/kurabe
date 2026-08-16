'use server';

import { getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { getTeamsAdmin } from '@/lib/db/teams-admin';
import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { requireRole } from '@/lib/auth';
import { unstable_cache } from 'next/cache';
import { EvaluationRound } from '@/types';
import { User, Evaluation, CriteriaGroup } from '@/types';

export interface DashboardData {
  stats: {
    completed: number;
    inProgress: number;
    notStarted: number;
    total: number;
    percent: number;
  };
  gradeDistribution: { grade: string; count: number; color: string }[];
  teamStatus: { id: string; name: string; membersCount: number; progress: number }[];
  recentActivities: {
    id: string;
    employeeName: string;
    evaluatorName: string;
    status: string;
    grade: string;
    date: string;
  }[];
  rawEvaluations: Evaluation[]; // Only needed if we still pass them to SkillGapRadar
  rawCriteriaGroups: CriteriaGroup[]; // Only needed if we still pass them to SkillGapRadar
}

async function getDashboardDataInner(periodId: string, viewer: import('@/types').User | null): Promise<DashboardData | null> {
  if (!periodId) return null;

  try {
    const [evaluations, users, teams, criteriaGroups] = await Promise.all([
      getEvaluationsByPeriodAdmin(periodId, viewer),
      getUsersAdmin(viewer),
      getTeamsAdmin(viewer),
      getAllCriteriaGroups()
    ]);

    // Gồm cả Manager — Manager có evaluation riêng trong kỳ (được đánh giá)
    const targetUsers = users;
    const totalCount = targetUsers.length;

    // Chỉ tính evaluation của user ĐANG ACTIVE — evaluation của user đã xóa mềm (is_active=false) không tính vào dashboard
    const activeIds = new Set(users.map((u) => u.id));
    const activeEvaluations = evaluations.filter((e) => activeIds.has(e.employeeId));

    const completed = activeEvaluations.filter((e) => e.status === 'Approved').length;
    const dbNotStarted = activeEvaluations.filter((e) => e.status === 'NotStarted').length;
    const inProgress = activeEvaluations.filter((e) => e.status !== 'Approved' && e.status !== 'NotStarted').length;
    const notStarted = Math.max(0, totalCount - activeEvaluations.length) + dbNotStarted;
    
    const stats = {
      completed,
      inProgress,
      notStarted,
      total: totalCount,
      percent: totalCount > 0 ? Math.round((completed / totalCount) * 100) : 0
    };

    const counts: Record<string, number> = { S: 0, A: 0, AB: 0, B: 0, C: 0, D: 0 };
    activeEvaluations.forEach((e) => {
      const grade = e.finalGrade || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].grade : null);
      if (grade && counts[grade as string] !== undefined) {
        counts[grade as string]++;
      }
    });

    const colors: Record<string, string> = {
      S: 'bg-indigo-500',
      A: 'bg-emerald-500',
      AB: 'bg-teal-500',
      B: 'bg-blue-500',
      C: 'bg-amber-500',
      D: 'bg-rose-500'
    };

    const gradeDistribution = Object.entries(counts).map(([grade, count]) => ({
      grade,
      count,
      color: colors[grade]
    }));

    const userMap = new Map<string, User>();
    const usersByTeam = new Map<string, User[]>();
    users.forEach((u) => {
      userMap.set(u.id, u);
      if (u.teamId) {
        if (!usersByTeam.has(u.teamId)) {
          usersByTeam.set(u.teamId, []);
        }
        usersByTeam.get(u.teamId)!.push(u);
      }
    });

    const teamStatus = teams.map((team) => {
      const members = usersByTeam.get(team.id) || [];
      const completedMembers = members.filter((m) => 
        activeEvaluations.some((e) => e.employeeId === m.id && e.status === 'Approved')
      ).length;
      const progress = members.length > 0 ? Math.round((completedMembers / members.length) * 100) : 0;
      
      return {
        id: team.id,
        name: team.name,
        membersCount: members.length,
        progress
      };
    });

    const recentActivities = evaluations
      .map((evaluation) => {
        const employee = userMap.get(evaluation.employeeId);
        const submittedRounds = evaluation.rounds && evaluation.rounds.length > 0
          ? [...evaluation.rounds].filter((r): r is EvaluationRound & { submittedAt: string } => !!r.submittedAt).sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
          : [];
        const latestRound = submittedRounds[0] || (evaluation.rounds && evaluation.rounds.length > 0 ? evaluation.rounds[evaluation.rounds.length - 1] : undefined);
        const evaluator = latestRound ? userMap.get(latestRound.evaluatorId) : undefined;
        const activityDate = submittedRounds[0]?.submittedAt || evaluation.updatedAt || evaluation.createdAt;

        return {
          id: evaluation.id,
          employeeName: employee?.name || 'Unknown',
          evaluatorName: evaluator?.name || 'Unknown',
          status: evaluation.status,
          grade: (evaluation.finalGrade || (latestRound?.grade) || '-') as string,
          date: new Date(activityDate).toISOString()
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    return {
      stats,
      gradeDistribution,
      teamStatus,
      recentActivities,
      rawEvaluations: evaluations,
      rawCriteriaGroups: criteriaGroups
    };
  } catch (error) {
    console.error('Error in getDashboardData:', error);
    return null;
  }
}

export async function getDashboardData(periodId: string): Promise<DashboardData | null> {
  const auth = await requireRole(['Manager', 'Leader', 'SubLeader']);
  if (auth.error !== null) return null;
  const viewer = auth.user;
  // unstable_cache: keyParts PHẢI gồm periodId + viewer.id — chống cache cross-user (reviewer lần 2 bắt)
  const getCached = unstable_cache(
    async (p: string) => getDashboardDataInner(p, viewer),
    ['dashboard-data', periodId, viewer.id],
    { tags: ['dashboard-data'], revalidate: 300 }
  );
  return getCached(periodId);
}
