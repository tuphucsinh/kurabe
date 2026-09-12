import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  getEvaluationsAction, 
  getEvaluationSummariesAction,
  getEvaluationByIdAction,
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
  EvaluationComparePageData,
  getPeriodsAction,
  getActivePeriodAction,
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

const requesterScope = (requester?: User | null): readonly unknown[] => [
  requester?.id,
  requester?.role,
  requester?.teamId,
];

export const scopedKey = (family: string, params: readonly unknown[], requester?: User | null) => [
  family,
  ...params,
  ...requesterScope(requester),
];

const hasRequesterScope = (queryKey: readonly unknown[], requester?: User | null) => {
  const scope = requesterScope(requester);
  return requester?.id != null
    && queryKey.length >= scope.length + 1
    && queryKey.slice(-scope.length).every((value, index) => Object.is(value, scope[index]));
};

export const invalidateRequesterQueries = (queryClient: ReturnType<typeof useQueryClient>, family: string, requester?: User | null) => {
  if (requester?.id == null) return;
  queryClient.invalidateQueries({
    predicate: ({ queryKey }: { queryKey: readonly unknown[] }) => queryKey[0] === family && hasRequesterScope(queryKey, requester),
  });
};

const useRequesterRef = () => {
  const { user } = useAuth();
  const requesterRef = useRef<User | null>(user);
  useEffect(() => {
    requesterRef.current = user;
  }, [user]);
  return requesterRef;
};

// Users
export const useUsers = (requester?: User | null, options?: { limit?: number; offset?: number }) => useQuery({
  queryKey: scopedKey('users', [options?.limit, options?.offset], requester),
  queryFn: () => getUsersAction(options),
  staleTime: 5 * 60 * 1000,
  // Chưa load xong user (auth async) → đỡ fetch cả bảng rồi vứt kết quả (C2)
  enabled: requester != null
});
export const useUsersBatch = (requester?: User | null, options?: UsersBatchOptions) => useQuery({
  queryKey: scopedKey('users-batch', [options?.offset, options?.limit, options?.search, options?.teamId, options?.role], requester),
  queryFn: () => getUsersBatchAction(options),
  staleTime: 2 * 60 * 1000,
  enabled: requester != null
});
export const useUser = (id: string) => {
  const { user } = useAuth();
  return useQuery({ queryKey: scopedKey('user', [id], user), queryFn: () => getUserByIdAction(id), enabled: !!id && user != null });
};
export const useTeamUsers = (teamId: string) => {
  const { user } = useAuth();
  return useQuery({ queryKey: scopedKey('team-users', [teamId], user), queryFn: () => getUsersByTeamAction(teamId), enabled: !!teamId && user != null });
};

export const useEmployeesPageData = (
  periodId?: string,
  options?: UsersBatchOptions,
  requester?: User | null
) => useQuery<EmployeesPageData>({
  queryKey: scopedKey('employees-page-data', [periodId, options?.offset, options?.limit, options?.search, options?.teamId, options?.role], requester),
  queryFn: () => getEmployeesPageDataAction(periodId, options),
  staleTime: 2 * 60 * 1000,
  enabled: requester != null,
});

export const useUpsertUser = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async (user: Partial<User>) => {
      const res = await upsertUserAction(user);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật nhân viên');
      return res.user;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'users', requesterRef.current);
      // Đổi role có thể đổi leader_id → làm mới teams để trang /teams hiển thị ngay
      invalidateRequesterQueries(queryClient, 'teams', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'evaluations', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'employees-page-data', requesterRef.current);
    },
  });
};

export const useBatchUpsertUsers = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async (users: Partial<User>[]) => {
      const res = await upsertUsersAction(users);
      if (!res.success) throw new Error(res.error || 'Lỗi khi import nhân viên');
      return res.users;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'users', requesterRef.current);
      // Đổi role có thể đổi leader_id → làm mới teams để trang /teams hiển thị ngay
      invalidateRequesterQueries(queryClient, 'teams', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'evaluations', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'employees-page-data', requesterRef.current);
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteUserAction(id);
      if (!result.success) throw new Error(result.error || 'Lỗi khi xóa nhân viên');
      return result;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'users', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'employees-page-data', requesterRef.current);
    },
  });
};


// Teams
export const useTeams = (requester?: User | null) => useQuery({
  queryKey: scopedKey('teams', [], requester),
  queryFn: () => getTeamsAction(),
  staleTime: 5 * 60 * 1000,
  enabled: requester != null
});
export const useTeam = (id: string) => {
  const { user } = useAuth();
  return useQuery({ queryKey: scopedKey('team', [id], user), queryFn: () => getTeamByIdAction(id), enabled: !!id && user != null });
};

export const useTeamsPageData = (
  periodId?: string,
  requester?: User | null
) => useQuery<TeamsPageData>({
  queryKey: scopedKey('teams-page-data', [periodId], requester),
  queryFn: () => getTeamsPageDataAction(periodId),
  staleTime: 2 * 60 * 1000,
  enabled: requester != null,
});

export const useUpsertTeam = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async (team: Partial<Team>) => {
      const res = await upsertTeamAction(team);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật nhóm');
      return res.team;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'teams', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'users', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'teams-page-data', requesterRef.current);
    },
  });
};

export const useDeleteTeam = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await deleteTeamAction(id);
      if (!res.success) throw new Error(res.error || 'Lỗi khi xóa nhóm');
      return res;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'teams', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'users', requesterRef.current);
      invalidateRequesterQueries(queryClient, 'teams-page-data', requesterRef.current);
    },
  });
};


// Periods & Evaluations
export const usePeriods = (requester?: User | null) => useQuery({ queryKey: scopedKey('periods', [], requester), queryFn: getPeriodsAction, staleTime: 10 * 60 * 1000, enabled: requester != null });
export const useActivePeriod = (requester?: User | null) => useQuery({ queryKey: scopedKey('active-period', [], requester), queryFn: getActivePeriodAction, staleTime: 10 * 60 * 1000, enabled: requester != null });

export const useEvaluations = (periodId?: string, user?: User | null) => useQuery({
  queryKey: scopedKey('evaluations', [periodId], user),
  queryFn: () => getEvaluationsAction(periodId),
  staleTime: 2 * 60 * 1000,
  enabled: user != null
});

export const useEvaluationSummaries = (periodId?: string, user?: User | null) => useQuery({
  queryKey: scopedKey('evaluations', ['summary', periodId], user),
  queryFn: () => getEvaluationSummariesAction(periodId),
  staleTime: 2 * 60 * 1000,
  enabled: user != null
});

export const useEvaluationSummariesBatch = (employeeIds: string[], periodId?: string, user?: User | null) => useQuery({
  queryKey: scopedKey('evaluations', ['summary-batch', periodId, employeeIds.join(',')], user),
  queryFn: () => getEvaluationSummariesBatchAction(employeeIds, periodId),
  staleTime: 2 * 60 * 1000,
  enabled: user != null && !!periodId && employeeIds.length > 0
});


export const useEvaluation = (id: string, user?: User | null) => useQuery({
  queryKey: scopedKey('evaluation', [id], user),
  queryFn: () => getEvaluationByIdAction(id),
  enabled: !!id && user != null
});

export const useEvaluationPageData = (
  employeeId: string,
  periodId?: string,
  user?: User | null
) => useQuery<EvaluationPageData>({
  queryKey: scopedKey('evaluation-page-data', [employeeId, periodId], user),
  queryFn: () => getEvaluationPageDataAction(employeeId, periodId),
  staleTime: 2 * 60 * 1000,
  enabled: !!employeeId && user != null && !!periodId,
});

export const useEvaluationComparePageData = (
  employeeId: string,
  periodId?: string,
  user?: User | null
) => useQuery<EvaluationComparePageData>({
  queryKey: scopedKey('evaluation-compare-page-data', [employeeId, periodId], user),
  queryFn: () => getEvaluationComparePageDataAction(employeeId, periodId),
  staleTime: 2 * 60 * 1000,
  enabled: !!employeeId && user != null && !!periodId,
});

// Criteria
export const useCriteria = () => {
  const { user } = useAuth();
  return useQuery({ queryKey: scopedKey('criteria', [], user), queryFn: getAllCriteriaGroups, staleTime: 5 * 60 * 1000, enabled: user != null });
};

export const useUpsertCriteriaGroup = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async ({ group, expectedVersion }: { group: Partial<CriteriaGroup>; expectedVersion?: number }) => {
      const res = await upsertCriteriaGroupAction(group, expectedVersion);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật nhóm tiêu chí');
      return res.group;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'criteria', requesterRef.current);
    },
  });
};

export const useDeleteCriteriaGroup = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async ({ id, expectedVersion }: { id: string; expectedVersion?: number }) => {
      const res = await deleteCriteriaGroupAction(id, expectedVersion);
      if (!res.success) throw new Error(res.error || 'Lỗi khi xóa nhóm tiêu chí');
      return res;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'criteria', requesterRef.current);
    },
  });
};


export const useUpsertCriterion = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async ({ criterion, groupId, expectedVersion }: { criterion: Partial<Criterion>; groupId: string; expectedVersion?: number }) => {
      const res = await upsertCriterionAction(criterion, groupId, expectedVersion);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật tiêu chí');
      return res.criterion;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'criteria', requesterRef.current);
    },
  });
};

export const useDeleteCriterion = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async ({ id, expectedVersion }: { id: string; expectedVersion?: number }) => {
      const res = await deleteCriterionAction(id, expectedVersion);
      if (!res.success) throw new Error(res.error || 'Lỗi khi xóa tiêu chí');
      return res;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'criteria', requesterRef.current);
    },
  });
};


export const useUpdateDefaultLevel = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async ({ criterionId, levelIndex, expectedVersion }: { criterionId: string; levelIndex: number | null; expectedVersion?: number }) => {
      const res = await updateDefaultLevelAction(criterionId, levelIndex, expectedVersion);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật mức mặc định');
      return res;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'criteria', requesterRef.current);
    },
  });
};

export const useUpdateCriterionAudiences = () => {
  const queryClient = useQueryClient();
  const requesterRef = useRequesterRef();
  return useMutation({
    mutationFn: async ({ criterionId, audiences, expectedVersion }: { criterionId: string; audiences: CriterionAudience[]; expectedVersion?: number }) => {
      const res = await updateCriterionAudiencesAction(criterionId, audiences, expectedVersion);
      if (!res.success) throw new Error(res.error || 'Lỗi khi cập nhật đối tượng áp dụng');
      return res;
    },
    onSuccess: () => {
      invalidateRequesterQueries(queryClient, 'criteria', requesterRef.current);
    },
  });
};
