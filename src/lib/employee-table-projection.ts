import type { User, Team, Evaluation } from '@/types';

export interface EmployeeTableItem extends User {
  teamName: string;
  grade: string;
  score: number;
  gradeRound: number | null;
  previousRoundScores: Array<{ round: number; score: number }>;
  hasFinalResult: boolean;
  evaluationLoading: boolean;
  evaluationError?: boolean;
}

export interface ProjectEmployeeTableItemsParams {
  users: readonly User[] | User[];
  teams?: readonly Team[] | Team[];
  teamsLoading?: boolean;
  teamsError?: string | null;
  evaluationsMap?: Record<string, Evaluation>;
  evalLoadingMap?: Record<string, boolean>;
  evalErrorMap?: Record<string, boolean>;
  currentPeriodId?: string | null;
  subleaderMap?: Record<string, string>;
  userMap?: Map<string, User>;
}

const ROLE_ORDER: Record<string, number> = {
  Manager: 0,
  Leader: 1,
  SubLeader: 2,
  Employee: 3,
  Worker: 4,
};

function getRoleRank(role?: string): number {
  return role ? ROLE_ORDER[role] ?? 99 : 99;
}

/**
 * Projects a raw list of users and their associated evaluation/team state into
 * table items formatted for the employee management table.
 *
 * Preserves the exact sorting order:
 * 1. Role rank: Manager (0), Leader (1), SubLeader (2), Employee (3), Worker (4), Unknown (99).
 * 2. Team name (Vietnamese collation): Manager is 'Toàn bộ bộ phận', others resolved by teamId or ''.
 * 3. Subleader name (Vietnamese collation): subleaderMap -> userMap -> ''.
 * 4. User name (Vietnamese collation).
 */
export function projectEmployeeTableItems(params: ProjectEmployeeTableItemsParams): EmployeeTableItem[] {
  const {
    users,
    teams = [],
    teamsLoading = false,
    teamsError = null,
    evaluationsMap = {},
    evalLoadingMap = {},
    evalErrorMap = {},
    currentPeriodId = null,
    subleaderMap = {},
    userMap,
  } = params;

  const resolvedUserMap = userMap ?? new Map(users.map((u) => [u.id, u]));

  return [...users]
    .sort((a, b) => {
      const dRole = getRoleRank(a.role) - getRoleRank(b.role);
      if (dRole !== 0) return dRole;

      const teamNameOf = (u: User) =>
        u.role === 'Manager' ? 'Toàn bộ bộ phận' : teams.find((t) => t.id === u.teamId)?.name ?? '';
      const dTeam = teamNameOf(a).localeCompare(teamNameOf(b), 'vi');
      if (dTeam !== 0) return dTeam;

      const subNameOf = (u: User) =>
        u.subleaderId ? subleaderMap[u.subleaderId] ?? resolvedUserMap.get(u.subleaderId)?.name ?? '' : '';
      const dSub = subNameOf(a).localeCompare(subNameOf(b), 'vi');
      if (dSub !== 0) return dSub;

      return a.name.localeCompare(b.name, 'vi');
    })
    .map((userItem) => {
      const team = teams.find((t) => t.id === userItem.teamId);
      const rawEval = evaluationsMap[userItem.id] || null;
      const evalItem =
        rawEval && (!currentPeriodId || !rawEval.periodId || rawEval.periodId === currentPeriodId)
          ? rawEval
          : null;
      const isEvalLoading = !!evalLoadingMap[userItem.id];
      const isEvalError = !!evalErrorMap[userItem.id];

      const latestScoredRound =
        evalItem?.rounds?.filter(
          (r) =>
            r.status !== 'Draft' &&
            r.status !== 'NotStarted' &&
            (r.status === 'Submitted' ||
              (r.status as string) === 'Reviewed' ||
              (r.status as string) === 'Approved' ||
              !!r.submittedAt)
        ) || [];
      const latestRound = latestScoredRound.length
        ? latestScoredRound.reduce((max, r) => (r.round > max.round ? r : max), latestScoredRound[0])
        : null;
      const previousRoundScores = latestScoredRound
        .filter((r) => (latestRound ? r.round !== latestRound.round : true))
        .sort((a, b) => b.round - a.round)
        .map((r) => ({ round: r.round, score: r.totalScore }));

      return {
        ...userItem,
        teamName:
          userItem.role === 'Manager'
            ? 'Toàn bộ bộ phận'
            : team
            ? team.name
            : teamsError
            ? 'Lỗi tải nhóm'
            : teamsLoading
            ? 'Đang tải...'
            : 'Chưa gán',
        grade: evalItem?.finalGrade ?? latestRound?.grade ?? '-',
        score: evalItem?.finalScore ?? latestRound?.totalScore ?? 0,
        gradeRound: latestRound?.round ?? null,
        previousRoundScores,
        hasFinalResult: !!evalItem?.finalGrade,
        evaluationLoading: isEvalLoading,
        evaluationError: isEvalError,
      };
    });
}
