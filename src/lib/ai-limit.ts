import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeAIAction } from '@/lib/ai-governance';

const AI_LIMIT_PER_HOUR = 30; // 30 lượt / giờ cho các tác vụ AI quản trị
const AI_WINDOW_MS = 60 * 60 * 1000; // 1 giờ

/**
 * Kiểm tra quota và ghi nhận slot sử dụng AI (fail-close).
 * Chống lạm dụng / đốt chi phí LLM.
 */
export async function checkAndRecordAiUsage(
  userId: string,
  action: string = 'ai',
  limit: number = AI_LIMIT_PER_HOUR,
  windowMs: number = AI_WINDOW_MS
): Promise<{ allowed: boolean; error?: string }> {
  try {
    const since = new Date(Date.now() - windowMs).toISOString();
    const { count, error: countErr } = await supabaseAdmin
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', since);

    if (countErr) {
      console.error('checkAndRecordAiUsage count error:', countErr.message);
      return { allowed: false, error: 'Hệ thống AI tạm thời bận, vui lòng thử lại sau.' };
    }

    if ((count ?? 0) >= limit) {
      return {
        allowed: false,
        error: `Bạn đã đạt giới hạn yêu cầu AI trong khoảng thời gian này (tối đa ${limit} lượt/giờ). Vui lòng thử lại sau.`,
      };
    }

    // Reserve slot
    const safeAction = normalizeAIAction(action);
    const { error: insertErr } = await supabaseAdmin
      .from('ai_usage')
      .insert({ user_id: userId, action: safeAction });

    if (insertErr) {
      console.error('checkAndRecordAiUsage insert error:', insertErr.message);
      return { allowed: false, error: 'Hệ thống AI tạm thời bận, vui lòng thử lại sau.' };
    }

    return { allowed: true };
  } catch {
    console.error('checkAndRecordAiUsage exception');
    return { allowed: false, error: 'Hệ thống AI tạm thời bận, vui lòng thử lại sau.' };
  }
}
