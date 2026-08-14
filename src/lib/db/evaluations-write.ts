import 'server-only';

import { supabaseAdmin } from '../supabase-admin';
import { Evaluation, EvaluationRound, Grade, Role, User, RoundNumber } from '@/types';
import { DatabaseError } from '../errors';
import { TablesInsert, Json } from '@/types/database';
import { composeRoundNotes } from '@/lib/round-level-selection';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import { resolveEvaluatorFromList, EvaluationSubject } from '@/lib/evaluator-resolver';
import { getActivePeriod, mapEvaluationFromDb } from './evaluations';

/**
 * CÁC HÀM GHI evaluation/evaluation_rounds — server-only (service-role client).
 * KHÔNG import vào client bundle (server-only chặn build — tránh lộ service key).
 * Chỉ được gọi từ server actions (P70T01 — C3: server actions là lớp ghi DUY NHẤT).
 */

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

  const { data, error } = await supabaseAdmin
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

  const { error } = await supabaseAdmin
    .from('evaluation_rounds')
    .upsert(dbRound, { onConflict: 'evaluation_id,round' });

  if (error) throw new DatabaseError('Error upserting evaluation round', error);
}

/**
 * Tự động tạo evaluation + round 1 cho các user MỚI được thêm vào kỳ đang active.
 * Gọi sau upsertUser/upsertUsers (server actions). Idempotent: user đã có evaluation sẽ được bỏ qua.
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
    supabaseAdmin.from('users').select('id, role, team_id, subleader_id').eq('is_active', true),
    supabaseAdmin.from('evaluations').select('employee_id').eq('period_id', activePeriod.id),
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
    const { data: ev, error: evError } = await supabaseAdmin
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
      .select('id')
      .single();

    if (evError || !ev) {
      result.errors.push(`Lỗi tạo evaluation cho ${user.name || user.id}: ${evError?.message || 'unknown'}`);
      result.skipped++;
      continue;
    }
    const evId = (ev as { id: string }).id;

    // Tạo round 1 (evaluator_id = null nếu nhân viên chưa được gán subleader)
    const roundRow: TablesInsert<'evaluation_rounds'> = {
      evaluation_id: evId,
      round: 1,
      evaluator_id: evaluator?.id || null,
      evaluator_role: evaluator?.role || (firstStep.evaluator as Role),
      scores: {} as Json,
      notes: {} as Json,
      total_score: 0,
      grade: 'Pending' as Grade,
      status: 'NotStarted',
      created_at: now,
    };
    const { error: rError } = await supabaseAdmin
      .from('evaluation_rounds')
      .insert(roundRow);

    if (rError) {
      result.errors.push(`Lỗi tạo round 1 cho ${user.name || user.id}: ${rError.message}`);
      result.skipped++;
      continue;
    }

    result.created++;
  }

  return result;
}

export type { RoundNumber };
