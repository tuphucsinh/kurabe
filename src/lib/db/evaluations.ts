import { supabase } from '../supabase';
import { Evaluation, EvaluationPeriod, EvaluationRound, EvalStatus, Grade, Role, RoundNumber } from '@/types';
import { Database } from '@/types/database';

type DbPeriod = Database['public']['Tables']['evaluation_periods']['Row'];
type DbEvaluation = Database['public']['Tables']['evaluations']['Row'] & { evaluation_rounds?: DbRound[] };
type DbRound = Database['public']['Tables']['evaluation_rounds']['Row'];

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

export async function getEvaluations(): Promise<Evaluation[]> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching evaluations:', error);
    return [];
  }

  return (data || []).map(mapEvaluationFromDb);
}

export async function getEvaluationById(id: string): Promise<Evaluation | null> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('Error fetching evaluation:', error);
    return null;
  }

  return mapEvaluationFromDb(data);
}

export async function getEvaluationsByPeriod(periodId: string): Promise<Evaluation[]> {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('period_id', periodId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching evaluations by period:', error);
    return [];
  }

  return (data || []).map(mapEvaluationFromDb);
}

export async function getEvaluationByEmployee(employeeId: string, periodId?: string): Promise<Evaluation | null> {
  let query = supabase
    .from('evaluations')
    .select('*, evaluation_rounds(*)')
    .eq('employee_id', employeeId);

  if (periodId) {
    query = query.eq('period_id', periodId);
  } else {
    // Nếu không truyền periodId, lấy bản ghi mới nhất
    query = query.order('created_at', { ascending: false });
  }

  const { data, error } = await query.limit(1).single();

  if (error) {
    if (error.code !== 'PGRST116') console.error('Error fetching employee evaluation:', error);
    return null;
  }

  return mapEvaluationFromDb(data);
}

export async function upsertEvaluation(evalData: Partial<Evaluation>): Promise<Evaluation | null> {
  const dbEval = {
    id: evalData.id,
    period_id: evalData.periodId,
    employee_id: evalData.employeeId,
    employee_role: evalData.employeeRole,
    team_id: evalData.teamId,
    current_round: evalData.currentRound,
    status: evalData.status,
    final_grade: evalData.finalGrade,
    final_score: evalData.finalScore,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('evaluations')
    .upsert(dbEval as any)
    .select()
    .single();

  if (error) {
    console.error('Error upserting evaluation:', error);
    return null;
  }

  return mapEvaluationFromDb(data);
}

export async function upsertEvaluationRound(evaluationId: string, round: Partial<EvaluationRound>): Promise<void> {
  const dbRound = {
    evaluation_id: evaluationId,
    round: round.round,
    evaluator_id: round.evaluatorId,
    evaluator_role: round.evaluatorRole,
    scores: round.scores,
    notes: round.notes,
    total_score: round.totalScore,
    grade: round.grade,
    comment: round.comment,
    additional_comment: round.additionalComment,
    submitted_at: round.submittedAt || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('evaluation_rounds')
    .upsert(dbRound as any, { onConflict: 'evaluation_id,round' });

  if (error) console.error('Error upserting evaluation round:', error);
}

// Helpers
export function mapPeriodFromDb(db: DbPeriod): EvaluationPeriod {
  return {
    id: db.id,
    year: db.year,
    name: db.name,
    status: db.status === 'active' ? 'Active' : 'Closed',
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
