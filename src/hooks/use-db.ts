import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, getUserById, getUsersByTeam, upsertUser } from '@/lib/db/users';
import { getTeams, getTeamById, upsertTeam } from '@/lib/db/teams';
import { 
  getPeriods, 
  getActivePeriod, 
  getEvaluations, 
  getEvaluationsByPeriod,
  getEvaluationById, 
  upsertEvaluation, 
  upsertEvaluationRound,
  getEvaluationByEmployee
} from '@/lib/db/evaluations';
import { getAllCriteriaGroups, upsertCriteriaGroup, upsertCriterion, updateDefaultLevel } from '@/lib/db/criteria';
import { deleteUserAction } from '@/actions/users';
import { deleteTeamAction } from '@/actions/teams';
import { deleteCriteriaGroupAction, deleteCriterionAction } from '@/actions/criteria';

import { EvaluationRound, Criterion, User } from '@/types';

// Users
export const useUsers = (requester?: User | null) => useQuery({ 
  queryKey: ['users', requester?.id], 
  queryFn: () => getUsers(requester), 
  staleTime: 5 * 60 * 1000 
});
export const useUser = (id: string) => useQuery({ queryKey: ['user', id], queryFn: () => getUserById(id), enabled: !!id });
export const useTeamUsers = (teamId: string) => useQuery({ queryKey: ['team-users', teamId], queryFn: () => getUsersByTeam(teamId), enabled: !!teamId });

export const useUpsertUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
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
  staleTime: 5 * 60 * 1000 
});
export const useTeam = (id: string) => useQuery({ queryKey: ['team', id], queryFn: () => getTeamById(id), enabled: !!id });

export const useUpsertTeam = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
};

export const useDeleteTeam = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteTeamAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
};


// Periods & Evaluations
export const usePeriods = () => useQuery({ queryKey: ['periods'], queryFn: getPeriods, staleTime: 10 * 60 * 1000 });
export const useActivePeriod = () => useQuery({ queryKey: ['active-period'], queryFn: getActivePeriod, staleTime: 10 * 60 * 1000 });

export const useEvaluations = (periodId?: string, user?: User | null) => useQuery({ 
  queryKey: ['evaluations', periodId, user?.id], 
  queryFn: () => periodId ? getEvaluationsByPeriod(periodId, user) : getEvaluations(user),
  staleTime: 2 * 60 * 1000
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

export const useUpsertEvaluation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertEvaluation,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
      if (data) queryClient.invalidateQueries({ queryKey: ['evaluation', data.id] });
    },
  });
};

export const useUpsertEvaluationRound = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ evaluationId, round }: { evaluationId: string; round: Partial<EvaluationRound> }) => 
      upsertEvaluationRound(evaluationId, round),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['evaluation', variables.evaluationId] });
      queryClient.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });
};

// Criteria
export const useCriteria = () => useQuery({ queryKey: ['criteria'], queryFn: getAllCriteriaGroups, staleTime: 5 * 60 * 1000 });

export const useUpsertCriteriaGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertCriteriaGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};

export const useDeleteCriteriaGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCriteriaGroupAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};


export const useUpsertCriterion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ criterion, groupId }: { criterion: Criterion; groupId: string }) => 
      upsertCriterion(criterion, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};

export const useDeleteCriterion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCriterionAction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};


export const useUpdateDefaultLevel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ criterionId, levelIndex }: { criterionId: string; levelIndex: number | null }) => 
      updateDefaultLevel(criterionId, levelIndex),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criteria'] });
    },
  });
};
