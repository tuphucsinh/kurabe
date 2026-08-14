import { supabase } from '../supabase';
import { Evaluation, EvaluationPeriod, EvaluationRound, EvalStatus, Grade, Role, RoundNumber, User, PeriodStatus, EvaluationRoundStatus } from '@/types';
import { DatabaseError } from '../errors';
import { canViewEvaluation } from '@/data/workflow';
import { Tables, TablesInsert, Json } from '@/types/database';
import { composeRoundNotes, splitRoundNotes } from '@/lib/round-level-selection';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import { resolveEvaluatorFromList, EvaluationSubject } from '@/lib/evaluator-resolver';

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
    throw new DatabaseError('Error upserting evaluation', error);
  }

  return mapEvaluationFromDb(data);
}

export async function upsertEvaluationRound(evaluationId: string, round: Partial<EvaluationRound>): Promise<void> {
  const composedNotes = composeRoundNotes(round.notes || {}, round.selectedLevelIndexes || {});
  const dbRound: TablesInsert<'evaluation_rounds'> = {
    evaluation_id: evaluationId,
    round: round.round || 1,
    evaluator_id: round.evaluatorId || null,
    evaluator_role: round.evaluatorRole || 'Employee',
    status: round.status || 'Draft',
    scores: (round.scores as Json) || null,
    notes: (composedNotes as Json) || null,
    total_score: round.totalScore ?? 0,
    grade: round.grade || 'Pending',
    comment: round.comment || null,
    additional_comment: round.additionalComment || null,
    submitted_at: round.status === 'Submitted' ? (round.submittedAt || new Date().toISOString()) : null,
  };

  const { error } = await supabase
    .from('evaluation_rounds')
    .upsert(dbRound, { onConflict: 'evaluation_id,round' });

  if (error) throw new DatabaseError('Error upserting evaluation round', error);
}

/**
 * Tự động tạo evaluation + round 1 cho các user MỚI được thêm vào kỳ đang active.
 * Gọi sau upsertUser/upsertUsers. Idempotent: user đã có evaluation sẽ được bỏ qua.
 * Logic giống createEvaluationPeriod (actions/period.ts): resolve evaluator round 1
 * theo flow role, tạo evaluation NotStarted + round 1.
 */
export async function ensureEvaluationsForUsers(newUsers: User[]): Promise<{ created: number; skipped: number; errors: string[] }> {
  const result = { created: 0, skipped: 0, errors: [] as string[] };
  if (!newUsers || newUsers.length === 0) return result;

  // 1. Kỳ active (không có → không làm gì)
  const activePeriod = await getActivePeriod();
  if (!activePeriod) {
    result.skipped = newUsers.length;
    return result;
  }

  // 2. Tải toàn bộ user active để resolve evaluator (batch) + danh sách evaluation hiện có
  const [allUsersRes, existingEvalsRes] = await Promise.all([
    supabase.from('users').select('id, role, team_id, subleader_id').eq('is_active', true),
    supabase.from('evaluations').select('employee_id').eq('period_id', activePeriod.id),
  ]);
  if (allUsersRes.error || existingEvalsRes.error) {
    result.errors.push('Không thể tải dữ liệu để khởi tạo đánh giá.');
    result.skipped = newUsers.length;
    return result;
  }

  const subjects: EvaluationSubject[] = (allUsersRes.data || []).map(u => ({
    id: u.id,
    role: u.role as Role,
    teamId: u.team_id || null,
    subleaderId: u.subleader_id || null,
  }));
  const existingIds = new Set((existingEvalsRes.data || []).map(e => e.employee_id));

  const now = new Date().toISOString();

  for (const user of newUsers) {
    // Bỏ qua user đã có evaluation trong kỳ active (idempotent)
    if (existingIds.has(user.id)) {
      result.skipped++;
      continue;
    }

    const flow = getEvaluationFlow(user.role);
    const firstStep = flow[0];
    const evaluator = resolveEvaluatorFromList(firstStep.evaluator, {
      id: user.id,
      role: user.role,
      teamId: user.teamId || null,
      subleaderId: user.subleaderId || null,
    }, subjects);

    if (!evaluator && firstStep.evaluator !== 'SubLeader') {
      result.errors.push(`Không tìm thấy ${firstStep.evaluator} phù hợp cho ${user.name || user.id} ở Round 1.`);
      result.skipped++;
      continue;
    }

    // Tạo evaluation
    const { data: ev, error: evError } = await supabase
      .from('evaluations')
      .insert({
        period_id: activePeriod.id,
        employee_id: user.id,
        employee_role: user.role,
        team_id: user.teamId || null,
        status: 'NotStarted',
        current_round: 1,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (evError || !ev) {
      result.errors.push(`Lỗi tạo evaluation cho ${user.name || user.id}: ${evError?.message || 'unknown'}`);
      result.skipped++;
      continue;
    }

    // Tạo round 1 (evaluator_id = null nếu nhân viên chưa được gán subleader)
    const { error: rError } = await supabase
      .from('evaluation_rounds')
      .insert({
        evaluation_id: ev.id,
        round: 1,
        evaluator_id: evaluator?.id || null,
        evaluator_role: evaluator?.role || (firstStep.evaluator as Role),
        scores: {},
        notes: {},
        total_score: 0,
        grade: 'Pending' as Grade,
        status: 'NotStarted',
        created_at: now,
      });

    if (rError) {
      result.errors.push(`Lỗi tạo round 1 cho ${user.name || user.id}: ${rError.message}`);
      result.skipped++;
      continue;
    }

    result.created++;
  }

  return result;
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
