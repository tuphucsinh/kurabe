import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, getUserById, getUsersByTeam } from '@/lib/db/users';
import { getTeams, getTeamById } from '@/lib/db/teams';
import { 
  getPeriods, 
  getActivePeriod, 
  getEvaluations, 
  getEvaluationsByPeriod,
  getEvaluationById, 
  getEvaluationByEmployee
} from '@/lib/db/evaluations';
import { getAllCriteriaGroups } from '@/lib/db/criteria';
import { deleteUserAction, upsertUserAction, upsertUsersAction } from '@/actions/users';
import { deleteTeamAction, upsertTeamAction } from '@/actions/teams';
import { 
  deleteCriteriaGroupAction, 
  deleteCriterionAction,
  upsertCriteriaGroupAction,
  upsertCriterionAction,
  updateDefaultLevelAction
} from '@/actions/criteria';

import { CriteriaGroup, Criterion, Team, User } from '@/types';

// Users
export const useUsers = (requester?: User | null, options?: { limit?: number; offset?: number }) => useQuery({
  queryKey: ['users', requester?.id, options?.limit, options?.offset],
  queryFn: () => getUsers(requester, options),
  staleTime: 5 * 60 * 1000,
  // Chưa load xong user (auth async) → đỡ fetch cả bảng rồi vứt kết quả (C2)
  enabled: requester != null
});
export const useUser = (id: string) => useQuery({ queryKey: ['user', id], queryFn: () => getUserById(id), enabled: !!id });
export const useTeamUsers = (teamId: string) => useQuery({ queryKey: ['team-users', teamId], queryFn: () => getUsersByTeam(teamId), enabled: !!teamId });

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
    },
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUserAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
};


// Teams
export const useTeams = (requester?: User | null) => useQuery({
  queryKey: ['teams', requester?.id],
  queryFn: () => getTeams(requester),
  staleTime: 5 * 60 * 1000,
  enabled: requester != null
});
export const useTeam = (id: string) => useQuery({ queryKey: ['team', id], queryFn: () => getTeamById(id), enabled: !!id });

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
    },
  });
};


// Periods & Evaluations
export const usePeriods = () => useQuery({ queryKey: ['periods'], queryFn: getPeriods, staleTime: 10 * 60 * 1000 });
export const useActivePeriod = () => useQuery({ queryKey: ['active-period'], queryFn: getActivePeriod, staleTime: 10 * 60 * 1000 });

export const useEvaluations = (periodId?: string, user?: User | null) => useQuery({
  queryKey: ['evaluations', periodId, user?.id],
  queryFn: () => periodId ? getEvaluationsByPeriod(periodId, user) : getEvaluations(user),
  staleTime: 2 * 60 * 1000,
  enabled: !!user
});

export const useEvaluation = (id: string, user?: User | null) => useQuery({ 
  queryKey: ['evaluation', id, user?.id], 
  queryFn: () => getEvaluationById(id, user), 
  enabled: !!id 
});

export const useEvaluationByEmployee = (employeeId: string, periodId?: string, user?: User | null) => useQuery({ 
  queryKey: ['evaluation-by-employee', employeeId, periodId, user?.id], 
  queryFn: () => getEvaluationByEmployee(employeeId, periodId, user), 
  enabled: !!employeeId 
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
