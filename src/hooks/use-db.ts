import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, getUserById, getUsersByTeam, upsertUser } from '@/lib/db/users';
import { getTeams, getTeamById, upsertTeam } from '@/lib/db/teams';
import { 
  getPeriods, 
  getActivePeriod, 
  getEvaluations, 
  getEvaluationById, 
  upsertEvaluation, 
  upsertEvaluationRound,
  getEvaluationByEmployee
} from '@/lib/db/evaluations';
import { getAllCriteriaGroups, upsertCriteriaGroup, upsertCriterion, updateDefaultLevel } from '@/lib/db/criteria';
import { EvaluationRound, CriteriaGroup, Criterion } from '@/types';

// Users
export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: getUsers });
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

// Teams
export const useTeams = () => useQuery({ queryKey: ['teams'], queryFn: getTeams });
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

// Periods & Evaluations
export const usePeriods = () => useQuery({ queryKey: ['periods'], queryFn: getPeriods });
export const useActivePeriod = () => useQuery({ queryKey: ['active-period'], queryFn: getActivePeriod });
export const useEvaluations = () => useQuery({ queryKey: ['evaluations'], queryFn: getEvaluations });
export const useEvaluation = (id: string) => useQuery({ queryKey: ['evaluation', id], queryFn: () => getEvaluationById(id), enabled: !!id });
export const useEvaluationByEmployee = (employeeId: string) => useQuery({ queryKey: ['evaluation-by-employee', employeeId], queryFn: () => getEvaluationByEmployee(employeeId), enabled: !!employeeId });

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
export const useCriteria = () => useQuery({ queryKey: ['criteria'], queryFn: getAllCriteriaGroups });

export const useUpsertCriteriaGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertCriteriaGroup,
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
