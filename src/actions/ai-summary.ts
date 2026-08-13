'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { callAI, isAIConfigured } from '@/lib/ai';
import { getEvaluationsByPeriod } from '@/lib/db/evaluations';
import { getUsers } from '@/lib/db/users';
import { revalidatePath } from 'next/cache';

/** Đọc tóm tắt AI đã lưu của kỳ (cache) — Manager. */
export async function getPeriodSummary(periodId: string): Promise<{ summary?: string; created_at?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return {};

  if (!periodId) return {};

  const { data } = await supabaseAdmin
    .from('ai_summaries')
    .select('summary, created_at')
    .eq('period_id', periodId)
    .maybeSingle();

  return data ? { summary: data.summary, created_at: data.created_at || undefined } : {};
}

/**
 * Tạo tóm tắt kỳ bằng AI (Manager-only).
 * Dữ liệu gửi LLM được ẨN DANH HÓA (tên thật → mã NV) — chỉ số liệu + nhận xét cần thiết.
 * Nếu kỳ chưa có đánh giá nào (không round có điểm) → không gọi AI (tránh phí phạm).
 */
export async function generatePeriodSummary(
  periodId: string
): Promise<{ summary?: string; error?: string }> {
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!periodId) return { error: 'Thiếu thông tin kỳ đánh giá.' };
  if (!isAIConfigured()) return { error: 'AI chưa được cấu hình (thiếu API key).' };

  try {
    const [evaluations, users] = await Promise.all([
      getEvaluationsByPeriod(periodId, auth.user),
      getUsers(),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const evaluated = evaluations.filter((e) => (e.rounds || []).some((r) => (r.totalScore || 0) > 0));

    if (evaluated.length === 0) {
      return { error: 'Kỳ này chưa có đánh giá nào có điểm — hãy chờ các vòng đánh giá hoàn thành rồi tạo tóm tắt.' };
    }

    // Ẩn danh hóa: mã NV thay tên; gom dữ liệu gọn
    const rows = evaluated.map((e) => {
      const u = userMap.get(e.employeeId);
      const lastRound = [...e.rounds].sort((a, b) => b.round - a.round).find((r) => (r.totalScore || 0) > 0);
      const notes = (e.rounds || [])
        .filter((r) => (r.comment || '').trim())
        .map((r) => `vòng ${r.round}: ${r.comment}`)
        .join(' | ');
      return {
        code: u?.employeeCode || e.employeeId.slice(0, 8),
        role: e.employeeRole,
        score: lastRound?.totalScore ?? 0,
        grade: lastRound?.grade ?? '—',
        status: e.status,
        notes: notes || undefined,
      };
    });

    const prompt = `Dữ liệu đánh giá QAQC kỳ (đã ẩn danh hóa — mã NV thay tên):
${JSON.stringify(rows, null, 1)}

Hãy viết TÓM TẮT KỲ ĐÁNH GIÁ bằng tiếng Việt, dạng markdown ngắn gọn (tối đa 250 từ) gồm:
1. Tổng quan: số nhân sự đã đánh giá, phân bổ xếp loại (S/A/AB/B/C/D), điểm trung bình.
2. Điểm nổi bật: nhân sự có điểm cao nhất (mã NV), điểm yếu cần lưu ý (mã NV, xếp loại thấp).
3. Xu hướng nhận xét chung từ các ghi chú (nếu có).
4. Gợi ý hành động cho quản lý (1-2 ý).`;

    const summary = await callAI(prompt, { maxTokens: 800 });
    if (!summary) return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };

    const { error } = await supabaseAdmin.from('ai_summaries').upsert(
      {
        period_id: periodId,
        summary,
        created_by: auth.user.id,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'period_id' }
    );

    if (error) console.error('Lưu ai_summaries error:', error.message);

    revalidatePath('/reports');
    return { summary };
  } catch (err) {
    console.error('generatePeriodSummary error:', err);
    return { error: 'Lỗi khi tạo tóm tắt: ' + (err instanceof Error ? err.message : 'không xác định') };
  }
}
