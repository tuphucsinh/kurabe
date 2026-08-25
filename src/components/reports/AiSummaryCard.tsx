'use client';

import { useState, useEffect } from 'react';
import { Sparkles, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { generatePeriodSummary, getPeriodSummary } from '@/actions/ai-summary';

/** Card "Tóm tắt kỳ bằng AI" trên Báo cáo — Manager-only. Heavy data layer. */
export default function AiSummaryCard({
  periodId,
  initialSummary,
  initialCreatedAt,
}: {
  periodId: string;
  initialSummary?: string;
  initialCreatedAt?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [summary, setSummary] = useState(() => initialSummary || '');
  const [createdAt, setCreatedAt] = useState(() => initialCreatedAt || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(() => !initialSummary && !!periodId);

  useEffect(() => {
    if (initialSummary || !periodId || (user && user.role !== 'Manager')) {
      return;
    }

    let active = true;

    void Promise.resolve().then(async () => {
      if (!active) return;
      setIsLoadingSummary(true);
      try {
        const res = await getPeriodSummary(periodId);
        if (active && res) {
          if (res.summary) setSummary(res.summary);
          if (res.created_at) setCreatedAt(res.created_at);
        }
      } catch (err) {
        console.error('getPeriodSummary error:', err);
      } finally {
        if (active) setIsLoadingSummary(false);
      }
    });

    return () => {
      active = false;
    };
  }, [periodId, initialSummary, user]);

  if (user?.role !== 'Manager') return null;

  const handleGenerate = async () => {
    if (!periodId) {
      toast('Không có kỳ đánh giá.', 'error');
      return;
    }
    setIsGenerating(true);
    try {
      const result = await generatePeriodSummary(periodId);
      if (result.summary) {
        setSummary(result.summary);
        setCreatedAt(new Date().toISOString());
        toast('Đã tạo tóm tắt bằng AI.', 'success');
      } else {
        toast(result.error || 'Lỗi khi tạo tóm tắt.', 'error');
      }
    } catch (err) {
      console.error('generatePeriodSummary error:', err);
      toast('Lỗi khi tạo tóm tắt.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      data-load-layer="heavy"
      className="bg-gradient-to-br from-brand-soft to-surface-raised p-6 rounded-3xl border border-outline-soft shadow-sm flex flex-col justify-between"
    >
      <div>
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2.5 rounded-xl bg-brand-soft text-brand">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <h4 className="text-base font-bold text-ink">Tóm tắt kỳ bằng AI</h4>
            {createdAt && (
              <p className="text-[11px] text-ink-muted">Tạo lúc {new Date(createdAt).toLocaleString('vi-VN')}</p>
            )}
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || isLoadingSummary}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-sm font-bold hover:bg-brand-mid transition-all shadow-md shadow-brand/20 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 size={15} className="animate-spin" /> : summary ? <RotateCcw size={15} /> : <Sparkles size={15} />}
            {isGenerating ? 'Đang tạo...' : summary ? 'Tạo lại' : 'Tạo tóm tắt'}
          </button>
        </div>

        {isLoadingSummary ? (
          <div className="space-y-3 py-4">
            <div className="h-4 w-3/4 bg-brand-soft/60 animate-pulse rounded" />
            <div className="h-4 w-full bg-brand-soft/60 animate-pulse rounded" />
            <div className="h-4 w-2/3 bg-brand-soft/60 animate-pulse rounded" />
          </div>
        ) : isGenerating ? (
          <div className="flex items-center gap-3 text-sm text-ink-muted py-6">
            <Loader2 size={18} className="animate-spin text-brand" />
            AI đang tổng hợp dữ liệu đánh giá (mất khoảng 10-30 giây)...
          </div>
        ) : summary ? (
          <div className="prose prose-sm max-w-none bg-surface-raised/70 rounded-2xl border border-outline-soft p-5">
            <div className="text-sm text-ink whitespace-pre-wrap leading-relaxed">{summary}</div>
            <div className="mt-4 pt-3 border-t border-outline-soft flex items-center gap-1.5 text-[11px] text-ink-muted">
              <ShieldCheck size={12} />
              Nội dung do AI tổng hợp từ dữ liệu đánh giá (đã ẩn danh hóa) — số liệu gốc vẫn là nguồn chính thức.
            </div>
          </div>
        ) : (
          <div className="text-sm text-ink-muted py-4">
            Bấm <b className="text-brand">Tạo tóm tắt</b> để AI tổng hợp toàn bộ đánh giá kỳ này thành bản báo cáo ngắn gọn:
            phân bổ xếp loại, điểm nổi bật, xu hướng nhận xét và gợi ý hành động.
          </div>
        )}
      </div>
    </div>
  );
}
