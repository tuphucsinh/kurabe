import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { Evaluation, EvaluationRound, EvaluationRoundStatus, User } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { canViewEvaluation } from '@/data/workflow';
import { mapEvaluationFromDb, filterEvaluationsForViewer } from '@/lib/db/evaluations';
import { parseRole, parseGrade, parseEvalStatus, parseRoundNumber } from '@/lib/parsers';

/** Context SubLeader cho canViewEvaluation: stub User {id, subleaderId} của các NV mình quản. */
async function getSubLeaderViewContextAdmin(user: User): Promise<User[] | undefined> {
  if (user.role !== 'SubLeader') return undefined;
  const { data: subEmployees } = await supabaseAdmin
    .from('users')
    .select('id, subleader_id')
    .eq('subleader_id', user.id);
  return (subEmployees || []).map(u => ({ id: u.id, subleaderId: u.subleader_id } as User));
}

/**
 * Query evaluations phía SERVER bằng service role (supabaseAdmin).
 * Áp dụng đúng phân quyền theo viewer:
 * - Manager: xem tất cả
 * - Người khác: của mình + được giao chấm (+ Leader: team; SubLeader: NV quản)
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

  if (user.role !== 'Manager') {
    // Evaluations mà viewer là người chấm (mọi vòng)
    const { data: rounds } = await supabaseAdmin
      .from('evaluation_rounds')
      .select('evaluation_id')
      .eq('evaluator_id', user.id);
    const assignedIds = (rounds || []).map(r => r.evaluation_id).filter(Boolean);

    const orFilters = [`employee_id.eq.${user.id}`];
    if (assignedIds.length > 0) orFilters.push(`id.in.(${assignedIds.join(',')})`);

    // Leader xem evaluations trong team
    if (user.role === 'Leader' && user.teamId) {
      orFilters.push(`team_id.eq.${user.teamId}`);
    }

    // SubLeader chỉ xem evaluation của NV có subleader_id = chính mình
    if (user.role === 'SubLeader') {
      allUsers = await getSubLeaderViewContextAdmin(user);
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
  return filterEvaluationsForViewer(evaluations, user, allUsers);
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
  'id, period_id, employee_id, employee_role, team_id, current_round, status, final_grade, final_score, result_message, return_note, created_at, updated_at, evaluation_rounds(id, evaluation_id, round, evaluator_id, evaluator_role, status, total_score, grade, submitted_at, created_at)';

type DbRoundSummary = {
  id: string;
  evaluation_id: string;
  round: number;
  evaluator_id: string | null;
  evaluator_role: string;
  status: string;
  total_score: number | null;
  grade: string | null;
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
    totalScore: db.total_score || 0,
    grade: parseGrade(db.grade),
    comment: undefined,
    additionalComment: undefined,
    submittedAt: db.submitted_at || undefined,
    createdAt: db.created_at || '',
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
    finalScore: db.final_score || undefined,
    resultMessage: db.result_message ?? null,
    returnNote: db.return_note || undefined,
    createdAt: db.created_at || '',
    updatedAt: db.updated_at || '',
  };
}

/**
 * Query evaluation summaries phía SERVER bằng service role (supabaseAdmin).
 * Dùng projection rút gọn (không tải scores/notes/comment nặng) để tối ưu danh sách.
 * Áp dụng đúng phân quyền theo viewer:
 * - Manager: xem tất cả
 * - Người khác: của mình + được giao chấm (+ Leader: team; SubLeader: NV quản)
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

  if (user.role !== 'Manager') {
    // Evaluations mà viewer là người chấm (mọi vòng)
    const { data: rounds } = await supabaseAdmin
      .from('evaluation_rounds')
      .select('evaluation_id')
      .eq('evaluator_id', user.id);
    const assignedIds = (rounds || []).map(r => r.evaluation_id).filter(Boolean);

    const orFilters = [`employee_id.eq.${user.id}`];
    if (assignedIds.length > 0) orFilters.push(`id.in.(${assignedIds.join(',')})`);

    // Leader xem evaluations trong team
    if (user.role === 'Leader' && user.teamId) {
      orFilters.push(`team_id.eq.${user.teamId}`);
    }

    // SubLeader chỉ xem evaluation của NV có subleader_id = chính mình
    if (user.role === 'SubLeader') {
      allUsers = await getSubLeaderViewContextAdmin(user);
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
  return filterEvaluationsForViewer(evaluations, user, allUsers);
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

export async function getEvaluationByIdAdmin(
  id: string,
  user?: User | null
): Promise<Evaluation | null> {
  if (!id) return null;

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
  const allUsers = user ? await getSubLeaderViewContextAdmin(user) : undefined;

  if (!canViewEvaluation(user, evaluation, allUsers)) {
    return null;
  }

  return evaluation;
}

export async function getEvaluationByEmployeeAdmin(
  employeeId: string,
  periodId?: string,
  user?: User | null
): Promise<Evaluation | null> {
  if (!employeeId) return null;

  let query = supabaseAdmin
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('employee_id', employeeId);

  if (periodId) {
    query = query.eq('period_id', periodId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new DatabaseError('Error fetching evaluation by employee (admin)', error);
  }

  if (!data) return null;

  const evaluation = mapEvaluationFromDb(data);
  const allUsers = user ? await getSubLeaderViewContextAdmin(user) : undefined;

  if (!canViewEvaluation(user, evaluation, allUsers)) {
    return null;
  }

  return evaluation;
}

export async function getEvaluationHistoryByEmployeeAdmin(
  employeeId: string,
  user?: { id: string; role: string } | null
): Promise<Evaluation[]> {
  if (!user || !employeeId || (user.role !== 'Manager' && employeeId !== user.id)) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('employee_id', employeeId)
    .eq('status', 'Approved')
    .order('created_at', { ascending: false });

  if (error) {
    throw new DatabaseError('Error fetching evaluation history by employee (admin)', error);
  }

  return (data || []).map(mapEvaluationFromDb);
}
