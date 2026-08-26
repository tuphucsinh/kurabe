import 'server-only';

import { supabaseAdmin } from '../supabase-admin';
import { User, RoundNumber } from '@/types';
import { TablesInsert, Json } from '@/types/database';
import { getEvaluationFlow } from '@/lib/evaluation-workflow';
import { resolveEvaluatorFromList, loadTeamLeaderIds, EvaluationSubject } from '@/lib/evaluator-resolver';
import { parseRole } from '@/lib/parsers';
import {
  assertEvaluationPeriodActive,
  CLOSED_PERIOD_WRITE_ERROR,
} from './evaluation-period-write-guard';

/**
 * CÁC HÀM GHI evaluation/evaluation_rounds — server-only (service-role client).
 * KHÔNG import vào client bundle (server-only chặn build — tránh lộ service key).
 * Chỉ được gọi từ server actions (P70T01 — C3: server actions là lớp ghi DUY NHẤT).
 */

/**
 * Tự động tạo evaluation + round 1 cho các user MỚI được thêm vào kỳ đang active.
 * Gọi sau upsertUser/upsertUsers (server actions). Idempotent: user đã có evaluation sẽ được bỏ qua.
 * Logic giống createEvaluationPeriod (actions/period.ts): resolve evaluator round 1
 * theo flow role, tạo evaluation NotStarted + round 1.
 *
 * P96T05: Fail-closed khi không có kỳ active hoặc kỳ đã đóng/lỗi (không chuyển thành skipped thầm lặng).
 */
export async function ensureEvaluationsForUsers(newUsers: User[]): Promise<{ created: number; skipped: number; errors: string[] }> {
  const result = { created: 0, skipped: 0, errors: [] as string[] };
  if (!newUsers || newUsers.length === 0) return result;

  // 1. Kỳ active (không có, đã đóng, hoặc lỗi → fail-closed với observable error)
  const { data: activePeriods, error: periodErr } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, status')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(2);

  if (periodErr || !activePeriods || activePeriods.length !== 1) {
    result.errors.push(periodErr ? `Lỗi kiểm tra kỳ đánh giá: ${periodErr.message}` : CLOSED_PERIOD_WRITE_ERROR);
    result.skipped = newUsers.length;
    return result;
  }

  const activePeriod = activePeriods[0];
  const guard = await assertEvaluationPeriodActive(activePeriod.id);
  if (!guard.success) {
    result.errors.push(guard.error);
    result.skipped = newUsers.length;
    return result;
  }

  const activePeriodId = guard.periodId;

  // 2. Tải toàn bộ user active để resolve evaluator (batch) + map leader chỉ định + evaluation hiện có
  const [allUsersRes, existingEvalsRes, teamLeaderIds] = await Promise.all([
    supabaseAdmin.from('users').select('id, role, team_id, subleader_id').eq('is_active', true),
    supabaseAdmin.from('evaluations').select('employee_id').eq('period_id', activePeriodId),
    loadTeamLeaderIds(supabaseAdmin),
  ]);
  if (allUsersRes.error || existingEvalsRes.error) {
    result.errors.push('Không thể tải dữ liệu để khởi tạo đánh giá.');
    result.skipped = newUsers.length;
    return result;
  }

  const subjects: EvaluationSubject[] = (allUsersRes.data || []).map(u => ({
    id: u.id,
    role: parseRole(u.role),
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

    // P96T05: Kiểm tra active guard trước mỗi thao tác tạo evaluation/round
    const itemGuard = await assertEvaluationPeriodActive(activePeriodId);
    if (!itemGuard.success) {
      result.errors.push(itemGuard.error);
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
    }, subjects, teamLeaderIds);

    if (!evaluator && firstStep.evaluator !== 'SubLeader') {
      result.errors.push(`Không tìm thấy ${firstStep.evaluator} phù hợp cho ${user.name || user.id} ở Round 1.`);
      result.skipped++;
      continue;
    }

    // Tạo evaluation
    const { data: ev, error: evError } = await supabaseAdmin
      .from('evaluations')
      .insert({
        period_id: activePeriodId,
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
      evaluator_role: parseRole(evaluator?.role || firstStep.evaluator),
      scores: {} as Json,
      notes: {} as Json,
      total_score: 0,
      grade: 'Pending',
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
