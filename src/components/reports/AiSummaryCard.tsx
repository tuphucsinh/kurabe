'use client';

import { useState } from 'react';
import { Sparkles, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { generatePeriodSummary } from '@/actions/ai-summary';

/** Card "Tóm tắt kỳ bằng AI" trên Báo cáo — Manager-only. */
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
  const [summary, setSummary] = useState(initialSummary || '');
  const [createdAt, setCreatedAt] = useState(initialCreatedAt || '');
  const [isGenerating, setIsGenerating] = useState(false);

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
    <div className="bg-gradient-to-br from-indigo-50/80 to-white p-6 rounded-3xl border border-indigo-100 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-600">
          <Sparkles size={18} />
        </div>
        <div className="flex-1">
          <h4 className="text-base font-bold text-slate-800">Tóm tắt kỳ bằng AI</h4>
          {createdAt && (
            <p className="text-[11px] text-slate-400">Tạo lúc {new Date(createdAt).toLocaleString('vi-VN')}</p>
          )}
        </div>
        <button
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
        >
          {isGenerating ? <Loader2 size={15} className="animate-spin" /> : summary ? <RotateCcw size={15} /> : <Sparkles size={15} />}
          {isGenerating ? 'Đang tạo...' : summary ? 'Tạo lại' : 'Tạo tóm tắt'}
        </button>
      </div>

      {isGenerating ? (
        <div className="flex items-center gap-3 text-sm text-slate-500 py-6">
          <Loader2 size={18} className="animate-spin text-indigo-600" />
          AI đang tổng hợp dữ liệu đánh giá (mất khoảng 10-30 giây)...
        </div>
      ) : summary ? (
        <div className="prose prose-sm max-w-none bg-white/70 rounded-2xl border border-slate-100 p-5">
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{summary}</div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck size={12} />
            Nội dung do AI tổng hợp từ dữ liệu đánh giá (đã ẩn danh hóa) — số liệu gốc vẫn là nguồn chính thức.
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-500 py-4">
          Bấm <b className="text-indigo-600">Tạo tóm tắt</b> để AI tổng hợp toàn bộ đánh giá kỳ này thành bản báo cáo ngắn gọn:
          phân bổ xếp loại, điểm nổi bật, xu hướng nhận xét và gợi ý hành động.
        </div>
      )}
    </div>
  );
}
