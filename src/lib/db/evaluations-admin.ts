import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { Evaluation, User } from '@/types';
import { DatabaseError } from '@/lib/errors';
import { canViewEvaluation } from '@/data/workflow';
import { mapEvaluationFromDb, filterEvaluationsForViewer } from '@/lib/db/evaluations';

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
