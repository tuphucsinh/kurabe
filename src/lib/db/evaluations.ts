import { supabase } from '../supabase';
import { Evaluation, EvaluationPeriod, EvaluationRound, EvalStatus, Grade, Role, RoundNumber, User, PeriodStatus, EvaluationRoundStatus } from '@/types';
import { DatabaseError } from '../errors';
import { canViewEvaluation } from '@/data/workflow';
import { Tables } from '@/types/database';
import { splitRoundNotes } from '@/lib/round-level-selection';

type DbPeriod = Tables<'evaluation_periods'>;
type DbRound = Tables<'evaluation_rounds'>;
type DbEvaluation = Tables<'evaluations'> & { evaluation_rounds?: DbRound[] };

export async function getPeriods(): Promise<EvaluationPeriod[]> {
  const { data, error } = await supabase
    .from('evaluation_periods')
    .select('*')
    .order('year', { ascending: false });

  if (error) {
    throw new DatabaseError('Error fetching periods', error);
  }

  return (data || []).map(mapPeriodFromDb);
}

export async function getActivePeriod(): Promise<EvaluationPeriod | null> {
  const { data, error } = await supabase
    .from('evaluation_periods')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new DatabaseError('Error fetching active period', error);
  }

  return mapPeriodFromDb(data);
}

export function filterEvaluationsForViewer(evaluations: Evaluation[], viewer?: User | null, allUsers?: User[]): Evaluation[] {
  if (!viewer) return [];
  return evaluations.filter(ev => canViewEvaluation(viewer, ev, allUsers));
}

export async function getEvaluations(user?: User | null): Promise<Evaluation[]> {
  let query = supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)');

  let allUsers: User[] | undefined = undefined;

  if (user && user.role !== 'Manager') {
    const { data: rounds } = await supabase
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
      const { data: subEmployees } = await supabase
        .from('users')
        .select('id, subleader_id')
        .eq('subleader_id', user.id);
      const subEmpIds = (subEmployees || []).map(u => u.id).filter(Boolean);
      if (subEmpIds.length > 0) {
        orFilters.push(`employee_id.in.(${subEmpIds.join(',')})`);
      }
      allUsers = (subEmployees || []).map(u => ({ id: u.id, subleaderId: u.subleader_id } as User));
    }

    query = query.or(orFilters.join(','));
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new DatabaseError('Error fetching evaluations', error);
  }

  const evaluations = (data || []).map(mapEvaluationFromDb);
  return filterEvaluationsForViewer(evaluations, user, allUsers);
}

export async function getEvaluationById(id: string, user?: User | null): Promise<Evaluation | null> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new DatabaseError('Error fetching evaluation', error);
  }

  const evaluation = mapEvaluationFromDb(data);

  let allUsers: User[] | undefined = undefined;
  if (user?.role === 'SubLeader') {
    const { data: subEmployees } = await supabase
      .from('users')
      .select('id, subleader_id')
      .eq('subleader_id', user.id);
    allUsers = (subEmployees || []).map(u => ({ id: u.id, subleaderId: u.subleader_id } as User));
  }

  if (!canViewEvaluation(user, evaluation, allUsers)) {
    return null;
  }

  return evaluation;
}

export async function getEvaluationsByPeriod(periodId: string, user?: User | null): Promise<Evaluation[]> {
  let query = supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('period_id', periodId);

  let allUsers: User[] | undefined = undefined;

  if (user && user.role !== 'Manager') {
    const { data: rounds } = await supabase
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
      const { data: subEmployees } = await supabase
        .from('users')
        .select('id, subleader_id')
        .eq('subleader_id', user.id);
      const subEmpIds = (subEmployees || []).map(u => u.id).filter(Boolean);
      if (subEmpIds.length > 0) {
        orFilters.push(`employee_id.in.(${subEmpIds.join(',')})`);
      }
      allUsers = (subEmployees || []).map(u => ({ id: u.id, subleaderId: u.subleader_id } as User));
    }

    query = query.or(orFilters.join(','));
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    throw new DatabaseError('Error fetching evaluations by period', error);
  }

  const evaluations = (data || []).map(mapEvaluationFromDb);
  return filterEvaluationsForViewer(evaluations, user, allUsers);
}

export async function getEvaluationByEmployee(employeeId: string, periodId?: string, user?: User | null): Promise<Evaluation | null> {
  let query = supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('employee_id', employeeId);

  if (periodId) {
    query = query.eq('period_id', periodId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new DatabaseError('Error fetching evaluation by employee', error);
  }

  if (!data) return null;

  const evaluation = mapEvaluationFromDb(data);

  let allUsers: User[] | undefined = undefined;
  if (user?.role === 'SubLeader') {
    const { data: subEmployees } = await supabase
      .from('users')
      .select('id, subleader_id')
      .eq('subleader_id', user.id);
    allUsers = (subEmployees || []).map(u => ({ id: u.id, subleaderId: u.subleader_id } as User));
  }

  if (!canViewEvaluation(user, evaluation, allUsers)) {
    return null;
  }

  return evaluation;
}

export async function getEvaluationHistoryByEmployee(
  employeeId: string,
  user?: { id: string; role: string } | null
): Promise<Evaluation[]> {
  if (!user || (user.role !== 'Manager' && employeeId !== user.id)) {
    return [];
  }

  const { data, error } = await supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('employee_id', employeeId)
    .eq('status', 'Approved')
    .order('created_at', { ascending: false });

  if (error) {
    throw new DatabaseError('Error fetching evaluation history by employee', error);
  }

  return (data || []).map(mapEvaluationFromDb);
}

const PERIOD_STATUS_MAP: Record<string, PeriodStatus> = {
  active: 'Active',
  closed: 'Closed',
};

// Helpers
export function mapPeriodFromDb(db: DbPeriod): EvaluationPeriod {
  return {
    id: db.id,
    year: db.year,
    name: db.name,
    status: PERIOD_STATUS_MAP[db.status || ''] || 'Closed',
    createdBy: db.created_by || '',
    createdAt: db.created_at || '',
    closedAt: db.closed_at || undefined,
    targetRate: db.target_rate ?? 75,
    targetGrade: db.target_grade || 'AB',
  };
}

export function mapEvaluationFromDb(db: DbEvaluation): Evaluation {
  return {
    id: db.id,
    periodId: db.period_id || '',
    employeeId: db.employee_id || '',
    employeeRole: db.employee_role as Role,
    teamId: db.team_id || '',
    rounds: (db.evaluation_rounds || [])
      .map(mapRoundFromDb)
      .sort((a, b) => a.round - b.round),
    currentRound: (db.current_round || 1) as RoundNumber,
    status: db.status as EvalStatus,
    finalGrade: db.final_grade as Grade || undefined,
    finalScore: db.final_score || undefined,
    resultMessage: db.result_message ?? null,
    returnNote: db.return_note || undefined,
    createdAt: db.created_at || '',
    updatedAt: db.updated_at || '',
  };
}

function mapRoundFromDb(db: DbRound): EvaluationRound {
  const { userNotes, selectedLevelIndexes } = splitRoundNotes((db.notes as Record<string, string>) || {});
  return {
    id: db.id,
    evaluationId: db.evaluation_id || '',
    round: db.round as RoundNumber,
    evaluatorId: db.evaluator_id || '',
    evaluatorRole: db.evaluator_role as Role,
    status: normalizeRoundStatus(db),
    scores: (db.scores as Record<string, number>) || {},
    selectedLevelIndexes,
    notes: userNotes,
    totalScore: db.total_score || 0,
    grade: db.grade as Grade,
    comment: db.comment || undefined,
    additionalComment: db.additional_comment || undefined,
    submittedAt: db.submitted_at || undefined,
    createdAt: db.created_at || '',
  };
}

/**
 * Chuẩn hóa trạng thái round từ dữ liệu DB (hỗ trợ legacy)
 */
function normalizeRoundStatus(db: DbRound): EvaluationRoundStatus {
  // submitted_at luôn ưu tiên cao nhất để tránh stale status.
  if (db.submitted_at) return 'Submitted';

  if (db.status === 'Submitted' || db.status === 'Draft' || db.status === 'NotStarted') {
    return db.status as EvaluationRoundStatus;
  }

  // Legacy fallback: Kiểm tra xem có dữ liệu nháp không.
  const hasScores = db.scores && typeof db.scores === 'object' && Object.keys(db.scores as object).length > 0;
  const hasNotes = db.notes && typeof db.notes === 'object' && Object.keys(db.notes as object).length > 0;

  if (hasScores || hasNotes || db.comment) {
    return 'Draft';
  }

  return 'NotStarted';
}
