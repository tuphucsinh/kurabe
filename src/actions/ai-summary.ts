'use server';

import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireManager } from '@/lib/auth';
import { callAI, isAIConfigured } from '@/lib/ai';
import { getEvaluationsByPeriodAdmin } from '@/lib/db/evaluations-admin';
import { getUsersAdmin } from '@/lib/db/users-admin';
import { revalidatePath } from 'next/cache';
import { toClientError } from '@/lib/errors';
import { consumeAiQuota, refundAiQuota, reserveAiQuota } from '@/lib/ai-limit';
import { boundAITextWithMeta, MAX_AI_PROMPT_CHARS, buildAIPayload, type AIPayloadCoverage } from '@/lib/ai-governance';
import { assertEvaluationPeriodActive } from '@/lib/db/evaluation-period-write-guard';
import { createHash } from 'node:crypto';

/** Đọc tóm tắt AI đã lưu của kỳ (cache) — Manager. */
export async function getPeriodSummary(periodId: string): Promise<{
  summary?: string;
  created_at?: string;
  coverage?: AIPayloadCoverage;
}> {
  const auth = await requireManager();
  if (auth.error !== null) return {};

  if (!periodId) return {};

  const { data } = await supabaseAdmin
    .from('ai_summaries')
    .select(
      'summary, created_at, coverage_status, coverage_total_items, coverage_fitted_items, coverage_dropped_items, coverage_truncated, coverage_fields, source_revision, source_generated_at'
    )
    .eq('period_id', periodId)
    .maybeSingle();

  if (!data) return {};

  const row = data as typeof data & {
    coverage_status?: string | null;
    coverage_total_items?: number | null;
    coverage_fitted_items?: number | null;
    coverage_dropped_items?: number | null;
    coverage_truncated?: boolean | null;
    coverage_fields?: unknown;
    source_revision?: string | null;
    source_generated_at?: string | null;
  };
  const status = row.coverage_status === 'complete' || row.coverage_status === 'partial' ? row.coverage_status : 'unknown';
  const coverageFields = row.coverage_fields && typeof row.coverage_fields === 'object' ? row.coverage_fields : undefined;
  return {
    summary: row.summary,
    created_at: row.created_at || undefined,
    coverage: {
      status,
      truncated: row.coverage_truncated === true || status === 'partial',
      droppedItems: row.coverage_dropped_items ?? 0,
      totalItems: row.coverage_total_items ?? 0,
      fittedItems: row.coverage_fitted_items ?? 0,
      coverageLabel:
        status === 'unknown'
          ? 'unknown — dữ liệu cũ không lưu phạm vi đầu vào'
          : row.coverage_truncated
            ? `partial — ${row.coverage_fitted_items ?? 0}/${row.coverage_total_items ?? 0} bản ghi được đưa vào`
            : `complete — ${row.coverage_fitted_items ?? 0}/${row.coverage_total_items ?? 0} bản ghi`,
      fieldTruncation: coverageFields as AIPayloadCoverage['fieldTruncation'],
      sourceRevision: row.source_revision || undefined,
      sourceGeneratedAt: row.source_generated_at || undefined,
    },
  };
}

/**
 * Tạo tóm tắt kỳ bằng AI (Manager-only).
 * Dữ liệu gửi LLM được ẨN DANH HÓA (tên thật → mã NV) — chỉ số liệu + nhận xét cần thiết.
 * Nếu kỳ chưa có đánh giá nào (không round có điểm) → không gọi AI (tránh phí phạm).
 */
export async function generatePeriodSummary(
  periodId: string
): Promise<{ summary?: string; partial?: boolean; coverageLabel?: string; coverage?: AIPayloadCoverage; error?: string }> {
  let quotaRequestId: string | null = null;
  let providerReturnedOutput = false;
  const auth = await requireManager();
  if (auth.error !== null) return { error: auth.error };
  if (!periodId) return { error: 'Thiếu thông tin kỳ đánh giá.' };
  if (!isAIConfigured()) return { error: 'AI chưa được cấu hình (thiếu API key).' };

  // P96T05: Closed-period write firewall — guard period exact active before quota/AI work
  const periodGuard = await assertEvaluationPeriodActive(periodId);
  if (!periodGuard.success) {
    return { error: periodGuard.error };
  }

  try {
    const [evaluations, users] = await Promise.all([
      getEvaluationsByPeriodAdmin(periodId, auth.user),
      getUsersAdmin(auth.user),
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const isSubmitted = (round: (typeof evaluations)[number]['rounds'][number]) =>
      round.status === 'Submitted' || !!round.submittedAt;
    const evaluated = evaluations.filter((e) => (e.rounds || []).some(isSubmitted));

    if (evaluated.length === 0) {
      return { error: 'Kỳ này chưa có đánh giá nào có điểm — hãy chờ các vòng đánh giá hoàn thành rồi tạo tóm tắt.' };
    }

    // Reserve only after the no-data guard. The reservation is consumed on
    // usable provider output and refunded on provider failure, so quota state
    // reflects actual attempts rather than abandoned reservations.
    const aiQuota = await reserveAiQuota(auth.user.id, 'generatePeriodSummary');
    if (!aiQuota.allowed || !aiQuota.requestId) return { error: aiQuota.error };
    quotaRequestId = aiQuota.requestId;

    // Ẩn danh hóa: mã NV thay tên; gom dữ liệu gọn
    let commentTotalChars = 0;
    let commentIncludedChars = 0;
    let commentTruncated = false;
    const rows = evaluated.map((e) => {
      const u = userMap.get(e.employeeId);
      const lastRound = [...e.rounds]
        .sort((a, b) => b.round - a.round)
        .find(isSubmitted);
      const notes = (e.rounds || [])
        .filter((r) => isSubmitted(r) && (r.comment || '').trim())
        .map((r) => {
          const boundedComment = boundAITextWithMeta(r.comment, 500, 'characters');
          commentTotalChars += boundedComment.coverageMeta.totalItems;
          commentIncludedChars += boundedComment.coverageMeta.fittedItems;
          commentTruncated ||= boundedComment.coverageMeta.truncated;
          return `vòng ${r.round}: ${boundedComment.text}`;
        })
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

    const instructions = `Hãy viết TÓM TẮT KỲ ĐÁNH GIÁ bằng tiếng Việt, dạng markdown ngắn gọn (tối đa 250 từ) gồm:\n1. Tổng quan: số nhân sự đã đánh giá, phân bổ xếp loại (S/A/AB/B/C/D), điểm trung bình.\n2. Điểm nổi bật: nhân sự có điểm cao nhất (mã NV), điểm yếu cần lưu ý (mã NV, xếp loại thấp).\n3. Xu hướng nhận xét chung từ các ghi chú (nếu có).\n4. Gợi ý hành động cho quản lý (1-2 ý).`;

    const dataHeader = `Dữ liệu đánh giá QAQC kỳ (đã ẩn danh hóa — mã NV thay tên):`;
    const promptPrefix = `${instructions}\n\n${dataHeader}\n`;

    // Use buildAIPayload for deterministic coverage-aware payload construction.
    // Returns coverage metadata so callers can disclose partial status honestly.
    const { payload, coverageMeta } = buildAIPayload(promptPrefix, rows, MAX_AI_PROMPT_CHARS);
    const boundedPrompt = boundAITextWithMeta(payload, MAX_AI_PROMPT_CHARS, 'characters');
    const sourceGeneratedAt = new Date().toISOString();
    const sourceRevision = createHash('sha256')
      .update(
        JSON.stringify(
          evaluated.map((evaluation) => ({
            id: evaluation.id,
            updatedAt: evaluation.updatedAt,
            status: evaluation.status,
            rounds: evaluation.rounds.filter(isSubmitted).map((round) => ({
              id: round.id,
              round: round.round,
              status: round.status,
              submittedAt: round.submittedAt,
              totalScore: round.totalScore,
              grade: round.grade,
            })),
          }))
        )
      )
      .digest('hex');
    const coverage: AIPayloadCoverage = {
      status: coverageMeta.droppedItems > 0 || boundedPrompt.coverageMeta.truncated || commentTruncated ? 'partial' : 'complete',
      truncated: coverageMeta.droppedItems > 0 || boundedPrompt.coverageMeta.truncated || commentTruncated,
      droppedItems: coverageMeta.droppedItems,
      totalItems: coverageMeta.totalItems,
      fittedItems: coverageMeta.fittedItems,
      coverageLabel: coverageMeta.droppedItems > 0 || boundedPrompt.coverageMeta.truncated || commentTruncated
        ? `partial — ${coverageMeta.fittedItems}/${coverageMeta.totalItems} bản ghi; comment ${commentIncludedChars}/${commentTotalChars} ký tự`
        : coverageMeta.coverageLabel,
      fieldTruncation: {
        comments: {
          truncated: commentTruncated,
          totalChars: commentTotalChars,
          includedChars: commentIncludedChars,
        },
        prompt: {
          truncated: boundedPrompt.coverageMeta.truncated,
          totalChars: boundedPrompt.coverageMeta.totalItems,
          includedChars: boundedPrompt.coverageMeta.fittedItems,
        },
      },
      sourceRevision,
      sourceGeneratedAt,
    };
    const coverageStatus = coverage.status ?? (coverage.truncated ? 'partial' : 'complete');
    const summary = await callAI(boundedPrompt.text, { maxTokens: 800 });
    if (!summary) {
      const refund = await refundAiQuota(auth.user.id, quotaRequestId);
      quotaRequestId = null;
      if (!refund.ok) console.error('AI quota refund failed:', refund.error);
      return { error: 'AI không phản hồi (lỗi hoặc hết thời gian).' };
    }
    providerReturnedOutput = true;
    const consumed = await consumeAiQuota(auth.user.id, quotaRequestId);
    if (!consumed.ok) return { error: consumed.error || 'Không thể ghi nhận lượt sử dụng AI. Vui lòng thử lại.' };
    quotaRequestId = null;

    // P96T05: Closed-period write firewall — guard period exact active again before upsert
    const preUpsertGuard = await assertEvaluationPeriodActive(periodId);
    if (!preUpsertGuard.success) {
      return { error: preUpsertGuard.error };
    }

    // The legacy direct `.upsert(` path is intentionally replaced by the active-period RPC below.
    const { data: persistedSummary, error } = await supabaseAdmin.rpc('upsert_ai_summary_if_active', {
      p_period_id: periodId,
      p_summary: summary,
      p_created_by: auth.user.id,
      p_coverage_status: coverageStatus,
      p_coverage_total_items: coverage.totalItems,
      p_coverage_fitted_items: coverage.fittedItems,
      p_coverage_dropped_items: coverage.droppedItems,
      p_coverage_truncated: coverage.truncated,
      p_coverage_fields: coverage.fieldTruncation || {},
      p_source_revision: sourceRevision,
      p_source_generated_at: sourceGeneratedAt,
    });

    if (error) {
      console.error('Lưu ai_summaries error:', error.message);
      return { error: toClientError(error, 'Lỗi khi lưu tóm tắt. Vui lòng thử lại.') };
    }

    revalidatePath('/reports');
    return {
      summary,
      partial: coverageStatus === 'partial',
      coverageLabel: coverageStatus === 'partial' ? coverage.coverageLabel : '',
      coverage: persistedSummary && typeof persistedSummary === 'object'
        ? { ...coverage, status: String((persistedSummary as { coverage_status?: string }).coverage_status || coverage.status) as AIPayloadCoverage['status'] }
        : coverage,
    };
  } catch (err) {
    if (quotaRequestId && !providerReturnedOutput) {
      const refund = await refundAiQuota(auth.user.id, quotaRequestId);
      if (!refund.ok) console.error('AI quota refund failed after summary error:', refund.error);
    }
    console.error('generatePeriodSummary error');
    return { error: toClientError(err, 'Lỗi khi tạo tóm tắt. Vui lòng thử lại.') };
  }
}
