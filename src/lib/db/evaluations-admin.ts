import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { Evaluation, EvaluationPeriod, EvaluationRound, EvaluationRoundStatus, User } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { canViewEvaluation } from '@/data/workflow';
import { mapEvaluationFromDb, filterEvaluationsForViewer, mapPeriodFromDb } from '@/lib/db/evaluations';
import { parseRole, parseGrade, parseEvalStatus, parseRoundNumber } from '@/lib/parsers';
import { isIndividualRole } from '@/lib/role-policy';
import { validateAndDedupeUuids } from '@/lib/employee-batch-helpers';
import { getLeaderTeamIds } from '@/lib/db/teams-admin';


const PERIOD_SELECT = 'id, year, name, status, created_by, created_at, closed_at, target_rate, target_grade';

export async function getPeriodsAdmin(requester?: User | null): Promise<EvaluationPeriod[]> {
  if (!requester) return [];
  const { data, error } = await supabaseAdmin
    .from('evaluation_periods')
    .select(PERIOD_SELECT)
    .order('year', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new DatabaseError('Error fetching periods (admin)', error);
  return (data || []).map(mapPeriodFromDb);
}

export async function getActivePeriodAdmin(requester?: User | null): Promise<EvaluationPeriod | null> {
  if (!requester) return null;
  const { data, error } = await supabaseAdmin
    .from('evaluation_periods')
    .select(PERIOD_SELECT)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new DatabaseError('Error fetching active period (admin)', error);
  return data ? mapPeriodFromDb(data) : null;
}

export async function getPeriodByIdAdmin(id: string, requester?: User | null): Promise<EvaluationPeriod | null> {
  if (!id || !requester) return null;
  const { data, error } = await supabaseAdmin
    .from('evaluation_periods')
    .select(PERIOD_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new DatabaseError('Error fetching period (admin)', error);
  return data ? mapPeriodFromDb(data) : null;
}

export async function resolveCurrentPeriodAdmin(preferredId?: string, requester?: User | null): Promise<EvaluationPeriod | null> {
  if (!requester) return null;
  try {
    if (preferredId) {
      const preferred = await getPeriodByIdAdmin(preferredId, requester);
      if (preferred) return preferred;
    }
    const periods = await getPeriodsAdmin(requester);
    return periods.find((period) => period.status === 'Active') || periods[0] || null;
  } catch {
    return null;
  }
}

/** Context SubLeader cho canViewEvaluation: stub User {id, subleaderId} của các NV mình quản. */
async function getSubLeaderViewContextAdmin(user: User): Promise<User[] | undefined> {
  if (user.role !== 'SubLeader' || !user.teamId) return undefined;
  const { data: subEmployees, error } = await supabaseAdmin
    .from('users')
    .select('id, role, team_id, is_active, subleader_id')
    .eq('subleader_id', user.id)
    .eq('team_id', user.teamId)
    .eq('is_active', true);
  if (error) {
    throw new DatabaseError('Error fetching SubLeader view context (admin)', error);
  }
  return (subEmployees || []).map((u: { id: string; role: string; team_id: string | null; subleader_id: string | null }) => ({
    id: u.id,
    role: parseRole(u.role),
    teamId: u.team_id || '',
    subleaderId: u.subleader_id,
  } as User));
}

/**
 * Query evaluations phía SERVER bằng service role (supabaseAdmin).
 * Áp dụng đúng phân quyền theo viewer:
 * - Manager: xem tất cả
 * - Người khác: của mình + được giao chấm (+ Leader: primary/appointed teams; SubLeader: NV quản)
 */
export async function fetchEvaluationsForViewerAdmin(
  user: User,
  periodId?: string,
  opts?: { limit?: number; errorLabel?: string }
): Promise<Evaluation[]> {
  const errorLabel = opts?.errorLabel || 'Error fetching evaluations (admin)';
  let query = supabaseAdmin
    .from('evaluations')
    .select('*, evaluation_rounds(*)');

  if (periodId) {
    query = query.eq('period_id', periodId);
  }

  let allUsers: User[] | undefined = undefined;
  const leaderTeamIds = user.role === 'Leader' ? await getLeaderTeamIds(user) : [];

  if (user.role !== 'Manager') {
    // Evaluations mà viewer là người chấm (mọi vòng) + Context SubLeader (chạy song song)
    const [roundsRes, subUsers] = await Promise.all([
      supabaseAdmin
        .from('evaluation_rounds')
        .select('evaluation_id')
        .eq('evaluator_id', user.id),
      user.role === 'SubLeader' ? getSubLeaderViewContextAdmin(user) : Promise.resolve(undefined),
    ]);

    if (roundsRes.error) {
      throw new DatabaseError(errorLabel, roundsRes.error);
    }

    allUsers = subUsers;
    const assignedIds = (roundsRes.data || []).map(r => r.evaluation_id).filter(Boolean);

    const orFilters = [`employee_id.eq.${user.id}`];
    if (assignedIds.length > 0) orFilters.push(`id.in.(${assignedIds.join(',')})`);

    // Leader xem evaluations trong primary và appointed teams.
    if (user.role === 'Leader' && leaderTeamIds.length > 0) {
      orFilters.push(`team_id.in.(${leaderTeamIds.join(',')})`);
    }

    // SubLeader chỉ xem evaluation của NV có subleader_id = chính mình
    if (user.role === 'SubLeader') {
      const subEmpIds = (allUsers || []).map(u => u.id).filter(Boolean);
      if (subEmpIds.length > 0) {
        orFilters.push(`employee_id.in.(${subEmpIds.join(',')})`);
      }
    }

    query = query.or(orFilters.join(','));
  }

  query = query.order('created_at', { ascending: false });

  if (opts?.limit && opts.limit > 0) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError(errorLabel, error);
  }

  const evaluations = (data || []).map(mapEvaluationFromDb);
  return filterEvaluationsForViewer(evaluations, user, allUsers, leaderTeamIds);
}

export async function getEvaluationsAdmin(
  user?: User | null,
  opts?: { limit?: number }
): Promise<Evaluation[]> {
  if (!user) return [];
  return fetchEvaluationsForViewerAdmin(user, undefined, opts);
}

export async function getEvaluationsByPeriodAdmin(
  periodId: string,
  user?: User | null,
  opts?: { limit?: number }
): Promise<Evaluation[]> {
  if (!user || !periodId) return [];
  return fetchEvaluationsForViewerAdmin(user, periodId, {
    limit: opts?.limit,
    errorLabel: 'Error fetching evaluations by period (admin)'
  });
}

const EVALUATION_SUMMARY_SELECT =
  'id, period_id, employee_id, employee_role, team_id, current_round, status, final_grade, final_score, result_message, return_note, created_at, updated_at, evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, status, total_score, grade, grade_config_version_id, criteria_config_version_id, submitted_at, created_at)';

const EVALUATION_BATCH_SUMMARY_SELECT =
  'id, period_id, employee_id, employee_role, team_id, current_round, status, final_grade, final_score, result_message, created_at, updated_at, evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, status, total_score, grade, grade_config_version_id, criteria_config_version_id, submitted_at, created_at)';

type DbRoundSummary = {
  id: string;
  evaluation_id: string;
  round: number;
  evaluator_id: string | null;
  evaluator_role: string;
  status: string;
  total_score: number | null;
  grade: string | null;
  grade_config_version_id: string | null;
  criteria_config_version_id: string | null;
  submitted_at: string | null;
  created_at: string | null;
};

type DbEvaluationSummary = {
  id: string;
  period_id: string;
  employee_id: string;
  employee_role: string;
  team_id: string | null;
  current_round: number | null;
  status: string;
  final_grade: string | null;
  final_score: number | null;
  result_message: string | null;
  return_note: string | null;
  created_at: string | null;
  updated_at: string | null;
  evaluation_rounds?: DbRoundSummary[] | null;
};

type DbEvaluationBatchSummary = {
  id: string;
  period_id: string;
  employee_id: string;
  employee_role: string;
  team_id: string | null;
  current_round: number | null;
  status: string;
  final_grade: string | null;
  final_score: number | null;
  result_message: string | null;
  created_at: string | null;
  updated_at: string | null;
  evaluation_rounds?: DbRoundSummary[] | null;
};

function normalizeSummaryRoundStatus(status?: string | null, submittedAt?: string | null): EvaluationRoundStatus {
  if (submittedAt) return 'Submitted';
  if (status === 'Submitted' || status === 'Draft' || status === 'NotStarted') {
    return status;
  }
  return 'NotStarted';
}

function mapRoundSummaryFromDb(db: DbRoundSummary): EvaluationRound {
  return {
    id: db.id,
    evaluationId: db.evaluation_id || '',
    round: parseRoundNumber(db.round),
    evaluatorId: db.evaluator_id || '',
    evaluatorRole: parseRole(db.evaluator_role),
    status: normalizeSummaryRoundStatus(db.status, db.submitted_at),
    scores: {},
    selectedLevelIndexes: undefined,
    notes: {},
    totalScore: db.total_score ?? 0,
    grade: parseGrade(db.grade),
    comment: undefined,
    additionalComment: undefined,
    submittedAt: db.submitted_at || undefined,
    createdAt: db.created_at || '',
    gradeConfigVersionId: db.grade_config_version_id,
    criteriaConfigVersionId: db.criteria_config_version_id,
    criteriaSnapshotState: db.criteria_config_version_id ? 'authoritative' : 'legacy_unknown',
  };
}

function mapEvaluationSummaryFromDb(db: DbEvaluationSummary): Evaluation {
  return {
    id: db.id,
    periodId: db.period_id || '',
    employeeId: db.employee_id || '',
    employeeRole: parseRole(db.employee_role),
    teamId: db.team_id || '',
    rounds: (db.evaluation_rounds || [])
      .map(mapRoundSummaryFromDb)
      .sort((a, b) => a.round - b.round),
    currentRound: parseRoundNumber(db.current_round),
    status: parseEvalStatus(db.status),
    finalGrade: db.final_grade ? parseGrade(db.final_grade) : undefined,
    finalScore: db.final_score ?? undefined,
    resultMessage: db.result_message ?? null,
    returnNote: db.return_note || undefined,
    createdAt: db.created_at || '',
    updatedAt: db.updated_at || '',
  };
}

function mapEvaluationBatchSummaryFromDb(db: DbEvaluationBatchSummary): Evaluation {
  return {
    id: db.id,
    periodId: db.period_id || '',
    employeeId: db.employee_id || '',
    employeeRole: parseRole(db.employee_role),
    teamId: db.team_id || '',
    rounds: (db.evaluation_rounds || [])
      .map(mapRoundSummaryFromDb)
      .sort((a, b) => a.round - b.round),
    currentRound: parseRoundNumber(db.current_round),
    status: parseEvalStatus(db.status),
    finalGrade: db.final_grade ? parseGrade(db.final_grade) : undefined,
    finalScore: db.final_score ?? undefined,
    resultMessage: db.result_message ?? null,
    returnNote: undefined,
    createdAt: db.created_at || '',
    updatedAt: db.updated_at || '',
  };
}

/**
 * Query evaluation summaries phía SERVER bằng service role (supabaseAdmin).
 * Dùng projection rút gọn (không tải scores/notes/comment nặng) để tối ưu danh sách.
 * Áp dụng đúng phân quyền theo viewer:
 * - Manager: xem tất cả
 * - Người khác: của mình + được giao chấm (+ Leader: primary/appointed teams; SubLeader: NV quản)
 */
export async function fetchEvaluationSummariesForViewerAdmin(
  user: User,
  periodId?: string,
  opts?: { limit?: number; errorLabel?: string }
): Promise<Evaluation[]> {
  const errorLabel = opts?.errorLabel || 'Error fetching evaluation summaries (admin)';
  let query = supabaseAdmin
    .from('evaluations')
    .select(EVALUATION_SUMMARY_SELECT);

  if (periodId) {
    query = query.eq('period_id', periodId);
  }

  let allUsers: User[] | undefined = undefined;
  const leaderTeamIds = user.role === 'Leader' ? await getLeaderTeamIds(user) : [];

  if (user.role !== 'Manager') {
    // Evaluations mà viewer là người chấm (mọi vòng) + Context SubLeader (chạy song song)
    const [roundsRes, subUsers] = await Promise.all([
      supabaseAdmin
        .from('evaluation_rounds')
        .select('evaluation_id')
        .eq('evaluator_id', user.id),
      user.role === 'SubLeader' ? getSubLeaderViewContextAdmin(user) : Promise.resolve(undefined),
    ]);

    if (roundsRes.error) {
      throw new DatabaseError(errorLabel, roundsRes.error);
    }

    allUsers = subUsers;
    const assignedIds = (roundsRes.data || []).map(r => r.evaluation_id).filter(Boolean);

    const orFilters = [`employee_id.eq.${user.id}`];
    if (assignedIds.length > 0) orFilters.push(`id.in.(${assignedIds.join(',')})`);

    // Leader xem evaluations trong primary và appointed teams.
    if (user.role === 'Leader' && leaderTeamIds.length > 0) {
      orFilters.push(`team_id.in.(${leaderTeamIds.join(',')})`);
    }

    // SubLeader chỉ xem evaluation của NV có subleader_id = chính mình
    if (user.role === 'SubLeader') {
      const subEmpIds = (allUsers || []).map(u => u.id).filter(Boolean);
      if (subEmpIds.length > 0) {
        orFilters.push(`employee_id.in.(${subEmpIds.join(',')})`);
      }
    }

    query = query.or(orFilters.join(','));
  }

  query = query.order('created_at', { ascending: false });

  if (opts?.limit && opts.limit > 0) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new DatabaseError(errorLabel, error);
  }

  const evaluations = (data || []).map(mapEvaluationSummaryFromDb);
  return filterEvaluationsForViewer(evaluations, user, allUsers, leaderTeamIds);
}

export async function getEvaluationSummariesAdmin(
  user?: User | null,
  opts?: { limit?: number }
): Promise<Evaluation[]> {
  if (!user) return [];
  return fetchEvaluationSummariesForViewerAdmin(user, undefined, opts);
}

export async function getEvaluationSummariesByPeriodAdmin(
  periodId: string,
  user?: User | null,
  opts?: { limit?: number }
): Promise<Evaluation[]> {
  if (!user || !periodId) return [];
  return fetchEvaluationSummariesForViewerAdmin(user, periodId, {
    limit: opts?.limit,
    errorLabel: 'Error fetching evaluation summaries by period (admin)'
  });
}

/**
 * Đọc danh sách evaluation summaries theo mảng employee IDs (1..20 UUIDs) trong một kỳ.
 * - Phân quyền server-side chặt chẽ theo viewer (RBAC):
 *   - Manager: được xem tất cả employeeIds được yêu cầu
 *   - Leader: chỉ được xem các employee thuộc team của mình (thiếu teamId -> [])
 *   - SubLeader: chỉ được xem chính mình + các NV mình phụ trách (subleader_id = user.id) thuộc team (thiếu teamId -> [])
 *   - Employee / Worker: chỉ được xem chính mình
 * - Dùng summary projection (EVALUATION_SUMMARY_SELECT) - không tải scores/notes/comment nặng.
 */
export async function getEvaluationSummariesByEmployeeIdsAdmin(
  employeeIds: string[],
  periodId?: string,
  requester?: User | null
): Promise<Evaluation[]> {
  if (!requester) return [];
  if (!periodId || typeof periodId !== 'string' || !periodId.trim()) return [];

  const validIds = validateAndDedupeUuids(employeeIds);
  if (validIds.length === 0) return [];

  let authorizedIds: string[] = [];
  let allUsers: User[] | undefined = undefined;
  let leaderTeamIds: string[] = [];

  if (requester.role === 'Manager') {
    authorizedIds = validIds;
  } else if (requester.role === 'Leader') {
    leaderTeamIds = await getLeaderTeamIds(requester);
    if (leaderTeamIds.length === 0) {
      return [];
    }
    // Leader chỉ được xem các nhân viên thuộc primary/appointed team
    const { data: teamMembers, error: teamErr } = await supabaseAdmin
      .from('users')
      .select('id')
      .in('id', validIds)
      .in('team_id', leaderTeamIds)
      .eq('is_active', true);

    if (teamErr) {
      throw new DatabaseError('Error fetching team members for evaluation summaries (admin)', teamErr);
    }
    if (!teamMembers || teamMembers.length === 0) {
      return [];
    }
    authorizedIds = teamMembers.map((u) => u.id);
  } else if (requester.role === 'SubLeader') {
    if (!requester.teamId) {
      return [];
    }
    allUsers = await getSubLeaderViewContextAdmin(requester);
    const subEmpIds = new Set((allUsers || []).map((u) => u.id));
    // SubLeader được xem chính mình và các NV có subleader_id = requester.id
    authorizedIds = validIds.filter((id) => id === requester.id || subEmpIds.has(id));
    if (authorizedIds.length === 0) {
      return [];
    }
  } else if (isIndividualRole(requester.role)) {
    // Employee / Worker chỉ xem chính mình
    authorizedIds = validIds.filter((id) => id === requester.id);
    if (authorizedIds.length === 0) {
      return [];
    }
  } else {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('evaluations')
    .select(EVALUATION_BATCH_SUMMARY_SELECT)
    .eq('period_id', periodId.trim())
    .in('employee_id', authorizedIds);

  if (error) {
    throw new DatabaseError('Error fetching evaluation summaries by employee IDs (admin)', error);
  }

  const evaluations = (data || []).map(mapEvaluationBatchSummaryFromDb);
  return filterEvaluationsForViewer(evaluations, requester, allUsers, leaderTeamIds);
}


export async function getEvaluationByIdAdmin(
  id: string,
  user?: User | null
): Promise<Evaluation | null> {
  if (!id || !user) return null;

  const { data, error } = await supabaseAdmin
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new DatabaseError('Error fetching evaluation (admin)', error);
  }

  const evaluation = mapEvaluationFromDb(data);
  const [allUsers, leaderTeamIds] = await Promise.all([
    getSubLeaderViewContextAdmin(user),
    user.role === 'Leader' ? getLeaderTeamIds(user) : Promise.resolve([] as string[]),
  ]);

  if (!canViewEvaluation(user, evaluation, allUsers, leaderTeamIds)) {
    return null;
  }

  return evaluation;
}

export async function getEvaluationByEmployeeAdmin(
  employeeId: string,
  periodId?: string,
  user?: User | null
): Promise<Evaluation | null> {
  if (!employeeId || !periodId || !user) return null;

  const query = supabaseAdmin
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('employee_id', employeeId)
    .eq('period_id', periodId);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new DatabaseError('Error fetching evaluation by employee (admin)', error);
  }

  if (!data) return null;

  const evaluation = mapEvaluationFromDb(data);
  const [allUsers, leaderTeamIds] = await Promise.all([
    getSubLeaderViewContextAdmin(user),
    user.role === 'Leader' ? getLeaderTeamIds(user) : Promise.resolve([] as string[]),
  ]);

  if (!canViewEvaluation(user, evaluation, allUsers, leaderTeamIds)) {
    return null;
  }

  return evaluation;
}

export async function getEvaluationHistoryByEmployeeAdmin(
  employeeId: string,
  user?: User | null
): Promise<Evaluation[]> {
  if (!user || !employeeId) return [];
  if (user.role !== 'Manager' && employeeId !== user.id) {
    if (user.role !== 'Leader') return [];
    const leaderTeamIds = await getLeaderTeamIds(user);
    if (leaderTeamIds.length === 0) return [];
    const { data: target, error: targetError } = await supabaseAdmin
      .from('users')
      .select('team_id')
      .eq('id', employeeId)
      .eq('is_active', true)
      .maybeSingle();
    if (targetError) {
      throw new DatabaseError('Error fetching target user for evaluation history (admin)', targetError);
    }
    if (!target?.team_id || !leaderTeamIds.includes(target.team_id)) return [];
  }

  const { data, error } = await supabaseAdmin
    .from('evaluations')
    .select('*, evaluation_rounds(*), evaluation_periods!inner(status)')
    .eq('employee_id', employeeId)
    .eq('status', 'Approved')
    .eq('evaluation_periods.status', 'closed')
    .order('created_at', { ascending: false });

  if (error) {
    throw new DatabaseError('Error fetching evaluation history by employee (admin)', error);
  }

  return (data || []).map(mapEvaluationFromDb);
}
