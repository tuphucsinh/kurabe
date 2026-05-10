import { supabase } from '../supabase';
import { Evaluation, EvaluationPeriod, EvaluationRound, EvalStatus, Grade, Role, RoundNumber, User, PeriodStatus } from '@/types';
import { Tables, TablesInsert, Json } from '@/types/database';

type DbPeriod = Tables<'evaluation_periods'>;
type DbRound = Tables<'evaluation_rounds'>;
type DbEvaluation = Tables<'evaluations'> & { evaluation_rounds?: DbRound[] };

export async function getPeriods(): Promise<EvaluationPeriod[]> {
  const { data, error } = await supabase
    .from('evaluation_periods')
    .select('*')
    .order('year', { ascending: false });

  if (error) {
    console.error('Error fetching periods:', error);
    return [];
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
    if (error.code !== 'PGRST116') console.error('Error fetching active period:', error);
    return null;
  }

  return mapPeriodFromDb(data);
}

export async function getEvaluations(user?: User | null): Promise<Evaluation[]> {
  let query = supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)');

  if (user && user.role !== 'Manager') {
    const { data: rounds } = await supabase
      .from('evaluation_rounds')
      .select('evaluation_id')
      .eq('evaluator_id', user.id);
    const assignedIds = (rounds || []).map(r => r.evaluation_id).filter(Boolean);

    const orFilters = [`employee_id.eq.${user.id}`];
    if (assignedIds.length > 0) orFilters.push(`id.in.(${assignedIds.join(',')})`);

    query = query.or(orFilters.join(','));
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching evaluations:', error);
    return [];
  }

  return (data || []).map(mapEvaluationFromDb);
}

export async function getEvaluationById(id: string, user?: User | null): Promise<Evaluation | null> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error('Error fetching evaluation:', error);
    }
    return null;
  }

  const evaluation = mapEvaluationFromDb(data);

  // Security check cho non-managers
  if (user && user.role !== 'Manager') {
    const isOwner = evaluation.employeeId === user.id;
    const isEvaluator = evaluation.rounds.some(r => r.evaluatorId === user.id);

    if (!isOwner && !isEvaluator) {
      return null;
    }
  }

  return evaluation;
}

export async function getEvaluationsByPeriod(periodId: string, user?: User | null): Promise<Evaluation[]> {
  let query = supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('period_id', periodId);

  if (user && user.role !== 'Manager') {
    const { data: rounds } = await supabase
      .from('evaluation_rounds')
      .select('evaluation_id')
      .eq('evaluator_id', user.id);
    const assignedIds = (rounds || []).map(r => r.evaluation_id).filter(Boolean);

    const orFilters = [`employee_id.eq.${user.id}`];
    if (assignedIds.length > 0) orFilters.push(`id.in.(${assignedIds.join(',')})`);

    query = query.or(orFilters.join(','));
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching evaluations by period:', error);
    return [];
  }

  return (data || []).map(mapEvaluationFromDb);
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
    console.error('Error fetching evaluation by employee:', error);
    return null;
  }

  if (!data) return null;

  const evaluation = mapEvaluationFromDb(data);

  // Authorization check cho non-managers
  if (user && user.role !== 'Manager') {
    const isOwner = evaluation.employeeId === user.id;
    const isEvaluator = evaluation.rounds.some(r => r.evaluatorId === user.id);

    if (!isOwner && !isEvaluator) {
      return null;
    }
  }

  return evaluation;
}

export async function upsertEvaluation(evalData: Partial<Evaluation>): Promise<Evaluation | null> {
  const dbEval: TablesInsert<'evaluations'> = {
    id: evalData.id,
    period_id: evalData.periodId || '',
    employee_id: evalData.employeeId || '',
    employee_role: evalData.employeeRole || 'Employee',
    team_id: evalData.teamId || null,
    current_round: evalData.currentRound ?? 1,
    status: evalData.status || 'NotStarted',
    final_grade: evalData.finalGrade || null,
    final_score: evalData.finalScore ?? null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('evaluations')
    .upsert(dbEval)
    .select()
    .single();

  if (error) {
    console.error('Error upserting evaluation:', error);
    return null;
  }

  return mapEvaluationFromDb(data);
}

export async function upsertEvaluationRound(evaluationId: string, round: Partial<EvaluationRound>): Promise<void> {
  const dbRound: TablesInsert<'evaluation_rounds'> = {
    evaluation_id: evaluationId,
    round: round.round || 1,
    evaluator_id: round.evaluatorId || null,
    evaluator_role: round.evaluatorRole || 'Employee',
    scores: (round.scores as Json) || null,
    notes: (round.notes as Json) || null,
    total_score: round.totalScore ?? 0,
    grade: round.grade || 'Pending',
    comment: round.comment || null,
    additional_comment: round.additionalComment || null,
    submitted_at: round.submittedAt || new Date().toISOString(),
  };

  const { error } = await supabase
    .from('evaluation_rounds')
    .upsert(dbRound, { onConflict: 'evaluation_id,round' });

  if (error) console.error('Error upserting evaluation round:', error);
}

// Helpers
export function mapPeriodFromDb(db: DbPeriod): EvaluationPeriod {
  return {
    id: db.id,
    year: db.year,
    name: db.name,
    status: (db.status?.charAt(0).toUpperCase() + db.status?.slice(1).toLowerCase()) as PeriodStatus || 'Closed',
    createdBy: db.created_by || '',
    createdAt: db.created_at || '',
    closedAt: db.closed_at || undefined,
  };
}

function mapEvaluationFromDb(db: DbEvaluation): Evaluation {
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
    createdAt: db.created_at || '',
    updatedAt: db.updated_at || '',
  };
}

function mapRoundFromDb(db: DbRound): EvaluationRound {
  return {
    id: db.id,
    evaluationId: db.evaluation_id || '',
    round: db.round as RoundNumber,
    evaluatorId: db.evaluator_id || '',
    evaluatorRole: db.evaluator_role as Role,
    scores: (db.scores as Record<string, number>) || {},
    notes: (db.notes as Record<string, string>) || {},
    totalScore: db.total_score || 0,
    grade: db.grade as Grade,
    comment: db.comment || undefined,
    additionalComment: db.additional_comment || undefined,
    submittedAt: db.submitted_at || undefined,
    createdAt: db.created_at || '',
  };
}

