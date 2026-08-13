'use server';

import { getEvaluationsByPeriod } from '@/lib/db/evaluations';
import { getUsers } from '@/lib/db/users';
import { getTeams } from '@/lib/db/teams';
import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { getSessionUser } from '@/lib/auth';
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

export async function getDashboardData(periodId: string): Promise<DashboardData | null> {
  if (!periodId) return null;

  try {
    // Viewer = user đang đăng nhập (session) — dashboard hiển thị đúng scope theo role;
    // trước đây truyền undefined → filterEvaluationsForViewer trả [] → stats luôn 0.
    const viewer = await getSessionUser();

    const [evaluations, users, teams, criteriaGroups] = await Promise.all([
      getEvaluationsByPeriod(periodId, viewer),
      getUsers(),
      getTeams(),
      getAllCriteriaGroups()
    ]);

    const targetUsers = users.filter((u) => u.role !== 'Manager');
    const totalCount = targetUsers.length;

    const completed = evaluations.filter((e) => e.status === 'Approved').length;
    const dbNotStarted = evaluations.filter((e) => e.status === 'NotStarted').length;
    const inProgress = evaluations.filter((e) => e.status !== 'Approved' && e.status !== 'NotStarted').length;
    const notStarted = Math.max(0, totalCount - evaluations.length) + dbNotStarted;
    
    const stats = {
      completed,
      inProgress,
      notStarted,
      total: totalCount,
      percent: totalCount > 0 ? Math.round((completed / totalCount) * 100) : 0
    };

    const counts: Record<string, number> = { S: 0, A: 0, AB: 0, B: 0, C: 0, D: 0 };
    evaluations.forEach((e) => {
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
        evaluations.some((e) => e.employeeId === m.id && e.status === 'Approved')
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
      .slice(0, 5)
      .map((evaluation) => {
        const employee = userMap.get(evaluation.employeeId);
        const latestRound = evaluation.rounds && evaluation.rounds.length > 0 
          ? evaluation.rounds[evaluation.rounds.length - 1] 
          : undefined;
        const evaluator = latestRound ? userMap.get(latestRound.evaluatorId) : undefined;
        
        return {
          id: evaluation.id,
          employeeName: employee?.name || 'Unknown',
          evaluatorName: evaluator?.name || 'Unknown',
          status: evaluation.status,
          grade: (evaluation.finalGrade || (latestRound?.grade) || '-') as string,
          date: new Date(evaluation.createdAt).toISOString()
        };
      });

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
