import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadGradeBandsFromDb } from '@/lib/grade-bands';

/**
 * Nạp thang điểm từ DB vào module cache phía SERVER (service role — không phụ thuộc RLS).
 * PHẢI gọi trước khi tính grade trong server actions (vd saveEvaluationRound), nếu không
 * getGradeBandsSync() phía server sẽ mãi dùng fallback hardcode (bug 2026-08-16).
 * Lỗi DB → im lặng giữ fallback, không chặn luồng chính.
 */
export async function ensureServerGradeBands(): Promise<void> {
  try {
    await loadGradeBandsFromDb(supabaseAdmin);
  } catch {
    // Giữ fallback hardcode — fallback không bao giờ làm vỡ luồng chấm điểm
  }
}
