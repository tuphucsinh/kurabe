import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  getPeriods, 
  getActivePeriod
} from '@/lib/db/evaluations';
import { 
  getEvaluationsAction, 
  getEvaluationSummariesAction,
  getEvaluationByIdAction, 
  getEvaluationByEmployeeAction,
  getUsersAction,
  getUsersBatchAction,
  getUserByIdAction,
  getUsersByTeamAction,
  getTeamsAction,
  getTeamByIdAction,
  getEvaluationSummariesBatchAction,
  getEmployeesPageDataAction,
  EmployeesPageData,
  getTeamsPageDataAction,
  TeamsPageData,
  getEvaluationPageDataAction,
  EvaluationPageData,
  getEvaluationComparePageDataAction,
  EvaluationComparePageData
} from '@/actions/read';
import { UsersBatchOptions } from '@/lib/db/users-admin';

import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { deleteUserAction, upsertUserAction, upsertUsersAction } from '@/actions/users';
import { deleteTeamAction, upsertTeamAction } from '@/actions/teams';
import { 
  deleteCriteriaGroupAction, 
  deleteCriterionAction,
  upsertCriteriaGroupAction,
  upsertCriterionAction,
  updateDefaultLevelAction,
  updateCriterionAudiencesAction
} from '@/actions/criteria';
import { CriterionAudience } from '@/lib/criteria-applicability';

import { CriteriaGroup, Criterion, Team, User } from '@/types';

// Users
export const useUsers = (requester?: User | null, options?: { limit?: number; offset?: number }) => useQuery({
  queryKey: ['users', requester?.id, options?.limit, options?.offset],
  queryFn: () => getUsersAction(options),
  staleTime: 5 * 60 * 1000,
  // Chưa load xong user (auth async) → đỡ fetch cả bảng rồi vứt kết quả (C2)
  enabled: requester != null
});
export const useUsersBatch = (requester?: User | null, options?: UsersBatchOptions) => useQuery({
  queryKey: ['users-batch', requester?.id, options?.offset, options?.limit, options?.search, options?.teamId, options?.role],
  queryFn: () => getUsersBatchAction(options),
  staleTime: 2 * 60 * 1000,
  enabled: requester != null
});
export const useUser = (id: string) => useQuery({ queryKey: ['user', id], queryFn: () => getUserByIdAction(id), enabled: !!id });
export const useTeamUsers = (teamId: string) => useQuery({ queryKey: ['team-users', teamId], queryFn: () => getUsersByTeamAction(teamId), enabled: !!teamId });

export const useEmployeesPageData = (
  periodId?: string,
  options?: UsersBatchOptions,
  requester?: User | null
) => useQuery<EmployeesPageData>({
  queryKey: ['employees-page-data', periodId, options?.offset, options?.limit, options?.search, options?.teamId, options?.role],
  queryFn: () => getEmployeesPageDataAction(periodId, options),
  staleTime: 2 * 60 * 1000,
  enabled: requester !== undefined ? requester != null : true,
});

export const useUpsertUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (user: Partial<User>) => {
      const res = await upsertUserAction(user);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật nhân viên');
      return res.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // Đổi role có thể đổi leader_id → làm mới teams để trang /teams hiển thị ngay
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['employees-page-data'] });
    },
  });
};

export const useBatchUpsertUsers = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (users: Partial<User>[]) => {
      const res = await upsertUsersAction(users);
      if (!res.success) throw new Error(res.error || 'Lỗi khi import nhân viên');
      return res.users;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // Đổi role có thể đổi leader_id → làm mới teams để trang /teams hiển thị ngay
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      queryClient.invalidateQueries({ queryKey: ['employees-page-data'] });
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUserAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['employees-page-data'] });
    },
  });
};


// Teams
export const useTeams = (requester?: User | null) => useQuery({
  queryKey: ['teams', requester?.id],
  queryFn: () => getTeamsAction(),
  staleTime: 5 * 60 * 1000,
  enabled: requester != null
});
export const useTeam = (id: string) => useQuery({ queryKey: ['team', id], queryFn: () => getTeamByIdAction(id), enabled: !!id });

export const useTeamsPageData = (
  periodId?: string,
  requester?: User | null
) => useQuery<TeamsPageData>({
  queryKey: ['teams-page-data', periodId],
  queryFn: () => getTeamsPageDataAction(periodId),
  staleTime: 2 * 60 * 1000,
  enabled: requester !== undefined ? requester != null : true,
});

export const useUpsertTeam = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (team: Partial<Team>) => {
      const res = await upsertTeamAction(team);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật nhóm');
      return res.team;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['teams-page-data'] });
    },
  });
};

export const useDeleteTeam = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteTeamAction(id);
      if (!res.success) throw new Error(res.error || 'Lỗi khi xóa nhóm');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['teams-page-data'] });
    },
  });
};


// Periods & Evaluations
export const usePeriods = () => useQuery({ queryKey: ['periods'], queryFn: getPeriods, staleTime: 10 * 60 * 1000 });
export const useActivePeriod = () => useQuery({ queryKey: ['active-period'], queryFn: getActivePeriod, staleTime: 10 * 60 * 1000 });

export const useEvaluations = (periodId?: string, user?: User | null) => useQuery({
  queryKey: ['evaluations', periodId, user?.id],
  queryFn: () => getEvaluationsAction(periodId),
  staleTime: 2 * 60 * 1000,
  enabled: !!user
});

export const useEvaluationSummaries = (periodId?: string, user?: User | null) => useQuery({
  queryKey: ['evaluations', 'summary', periodId, user?.id],
  queryFn: () => getEvaluationSummariesAction(periodId),
  staleTime: 2 * 60 * 1000,
  enabled: !!user
});

export const useEvaluationSummariesBatch = (employeeIds: string[], periodId?: string, user?: User | null) => useQuery({
  queryKey: ['evaluations', 'summary-batch', periodId, user?.id, employeeIds.join(',')],
  queryFn: () => getEvaluationSummariesBatchAction(employeeIds, periodId),
  staleTime: 2 * 60 * 1000,
  enabled: !!user && !!periodId && employeeIds.length > 0
});


export const useEvaluation = (id: string, user?: User | null) => useQuery({ 
  queryKey: ['evaluation', id, user?.id], 
  queryFn: () => getEvaluationByIdAction(id), 
  enabled: !!id && !!user 
});

export const useEvaluationByEmployee = (employeeId: string, periodId?: string, user?: User | null) => useQuery({ 
  queryKey: ['evaluation-by-employee', employeeId, periodId, user?.id], 
  queryFn: () => getEvaluationByEmployeeAction(employeeId, periodId), 
  enabled: !!employeeId && !!user 
});

export const useEvaluationPageData = (
  employeeId: string,
  periodId?: string,
  user?: User | null
) => useQuery<EvaluationPageData>({
  queryKey: ['evaluation-page-data', employeeId, periodId, user?.id],
  queryFn: () => getEvaluationPageDataAction(employeeId, periodId),
  staleTime: 2 * 60 * 1000,
  enabled: !!employeeId && !!user,
});

export const useEvaluationComparePageData = (
  employeeId: string,
  periodId?: string,
  user?: User | null
) => useQuery<EvaluationComparePageData>({
  queryKey: ['evaluation-compare-page-data', employeeId, periodId, user?.id],
  queryFn: () => getEvaluationComparePageDataAction(employeeId, periodId),
  staleTime: 2 * 60 * 1000,
  enabled: !!employeeId && !!user,
});

// Criteria
export const useCriteria = () => useQuery({ queryKey: ['criteria'], queryFn: getAllCriteriaGroups, staleTime: 5 * 60 * 1000 });

export const useUpsertCriteriaGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (group: Partial<CriteriaGroup>) => {
      const res = await upsertCriteriaGroupAction(group);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật nhóm tiêu chí');
      return res.group;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};

export const useDeleteCriteriaGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteCriteriaGroupAction(id);
      if (!res.success) throw new Error(res.error || 'Lỗi khi xóa nhóm tiêu chí');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};


export const useUpsertCriterion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ criterion, groupId }: { criterion: Partial<Criterion>; groupId: string }) => {
      const res = await upsertCriterionAction(criterion, groupId);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật tiêu chí');
      return res.criterion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};

export const useDeleteCriterion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteCriterionAction(id);
      if (!res.success) throw new Error(res.error || 'Lỗi khi xóa tiêu chí');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};


export const useUpdateDefaultLevel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ criterionId, levelIndex }: { criterionId: string; levelIndex: number | null }) => {
      const res = await updateDefaultLevelAction(criterionId, levelIndex);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật mức mặc định');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};

export const useUpdateCriterionAudiences = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ criterionId, audiences }: { criterionId: string; audiences: CriterionAudience[] }) => {
      const res = await updateCriterionAudiencesAction(criterionId, audiences);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật đối tượng áp dụng');
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};
