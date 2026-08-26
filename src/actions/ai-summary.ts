'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { callAI, isAIConfigured } from '@/lib/ai';
import { getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { revalidatePath } from 'next/cache';
import { toClientError } from '@/lib/errors';
import { checkAndRecordAiUsage } from '@/lib/ai-limit';
import { boundAIText, MAX_AI_PROMPT_CHARS } from '@/lib/ai-governance';
import { assertEvaluationPeriodActive } from '@/lib/db/evaluation-period-write-guard';

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

  // P96T05: Closed-period write firewall — guard period exact active before quota/AI work
  const periodGuard = await assertEvaluationPeriodActive(periodId);
  if (!periodGuard.success) {
    return { error: periodGuard.error };
  }

  const aiQuota = await checkAndRecordAiUsage(auth.user.id, 'generatePeriodSummary');
  if (!aiQuota.allowed) return { error: aiQuota.error };

  try {
    const [evaluations, users] = await Promise.all([
      getEvaluationsByPeriodAdmin(periodId, auth.user),
      getUsersAdmin(),
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
        .map((r) => `vòng ${r.round}: ${boundAIText(r.comment, 500)}`)
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

    const instructions = `Hãy viết TÓM TẮT KỲ ĐÁNH GIÁ bằng tiếng Việt, dạng markdown ngắn gọn (tối đa 250 từ) gồm:
1. Tổng quan: số nhân sự đã đánh giá, phân bổ xếp loại (S/A/AB/B/C/D), điểm trung bình.
2. Điểm nổi bật: nhân sự có điểm cao nhất (mã NV), điểm yếu cần lưu ý (mã NV, xếp loại thấp).
3. Xu hướng nhận xét chung từ các ghi chú (nếu có).
4. Gợi ý hành động cho quản lý (1-2 ý).`;

    const dataHeader = `Dữ liệu đánh giá QAQC kỳ (đã ẩn danh hóa — mã NV thay tên):`;
    const promptPrefix = `${instructions}\n\n${dataHeader}\n`;

    // Khớp deterministically các dòng JSON hoàn chỉnh trong giới hạn MAX_AI_PROMPT_CHARS
    const fittedRows: typeof rows = [];
    for (const row of rows) {
      const candidate = [...fittedRows, row];
      const candidateJson = JSON.stringify(candidate, null, 1);
      const fullPrompt = `${promptPrefix}${candidateJson}`;
      if (fullPrompt.length <= MAX_AI_PROMPT_CHARS) {
        fittedRows.push(row);
      } else {
        break;
      }
    }

    const prompt = `${promptPrefix}${JSON.stringify(fittedRows, null, 1)}`;
    const boundedPrompt = boundAIText(prompt, MAX_AI_PROMPT_CHARS);
    const summary = await callAI(boundedPrompt, { maxTokens: 800 });
    if (!summary) return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };

    // P96T05: Closed-period write firewall — guard period exact active again before upsert
    const preUpsertGuard = await assertEvaluationPeriodActive(periodId);
    if (!preUpsertGuard.success) {
      return { error: preUpsertGuard.error };
    }

    const { error } = await supabaseAdmin.from('ai_summaries').upsert(
      {
        period_id: periodId,
        summary,
        created_by: auth.user.id,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'period_id' }
    );

    if (error) {
      console.error('Lưu ai_summaries error:', error.message);
      return { error: toClientError(error, 'Lỗi khi lưu tóm tắt. Vui lòng thử lại.') };
    }

    revalidatePath('/reports');
    return { summary };
  } catch (err) {
    console.error('generatePeriodSummary error');
    return { error: toClientError(err, 'Lỗi khi tạo tóm tắt. Vui lòng thử lại.') };
  }
}
