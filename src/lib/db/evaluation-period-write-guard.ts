import 'server-only';

import { supabaseAdmin } from '@/lib/supabase-admin';

export const CLOSED_PERIOD_WRITE_ERROR = 'Kỳ đánh giá đã đóng hoặc không còn hoạt động. Thao tác ghi bị từ chối.';
export const EVALUATION_NOT_FOUND_FOR_WRITE_ERROR = 'Không tìm thấy thông tin đánh giá.';

export type PeriodActiveGuardResult =
  | { success: true; periodId: string }
  | { success: false; error: string; periodId?: string };

/**
 * Kiểm tra trạng thái kỳ đánh giá có chính xác là 'active' (lowercase raw) hay không.
 * Mọi trường hợp không phải 'active' (status khác, đã đóng, không tồn tại, lỗi DB)
 * đều bị từ chối với kết quả fail-closed.
 */
export async function assertEvaluationPeriodActive(
  periodId: string | null | undefined
): Promise<PeriodActiveGuardResult> {
  if (!periodId || typeof periodId !== 'string' || !periodId.trim()) {
    return {
      success: false,
      error: CLOSED_PERIOD_WRITE_ERROR,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('evaluation_periods')
    .select('id, status')
    .eq('id', periodId.trim())
    .maybeSingle();

  if (error || !data) {
    return {
      success: false,
      error: CLOSED_PERIOD_WRITE_ERROR,
    };
  }

  // Exact lowercase raw 'active' comparison
  if (data.status !== 'active') {
    return {
      success: false,
      error: CLOSED_PERIOD_WRITE_ERROR,
      periodId: data.id,
    };
  }

  return {
    success: true,
    periodId: data.id,
  };
}

/**
 * Kiểm tra kỳ đánh giá của một record evaluation có chính xác là 'active' (lowercase raw) hay không.
 * Sử dụng truy vấn server-side authoritative từ quan hệ DB (evaluations -> evaluation_periods).
 */
export async function assertEvaluationPeriodActiveForEvaluation(
  evaluationId: string | null | undefined
): Promise<PeriodActiveGuardResult> {
  if (!evaluationId || typeof evaluationId !== 'string' || !evaluationId.trim()) {
    return {
      success: false,
      error: EVALUATION_NOT_FOUND_FOR_WRITE_ERROR,
    };
  }

  const { data, error } = await supabaseAdmin
    .from('evaluations')
    .select('id, period_id')
    .eq('id', evaluationId.trim())
    .maybeSingle();

  if (error || !data) {
    return {
      success: false,
      error: EVALUATION_NOT_FOUND_FOR_WRITE_ERROR,
    };
  }

  if (!data.period_id) {
    return {
      success: false,
      error: CLOSED_PERIOD_WRITE_ERROR,
    };
  }

  return assertEvaluationPeriodActive(data.period_id);
}
