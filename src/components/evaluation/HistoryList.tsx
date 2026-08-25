'use client';

import { useState } from 'react';
import { History, ChevronDown, ChevronUp, MessageSquareQuote } from 'lucide-react';
import { Evaluation, EvaluationPeriod } from '@/types';

interface HistoryListProps {
  history: Evaluation[];
  currentEvaluationId: string;
  periods: EvaluationPeriod[];
  isLoading: boolean;
}

/** Section "Kết quả các kỳ trước" của trang đánh giá (D3 — tách khỏi page 1065 dòng). */
export default function HistoryList({ history, currentEvaluationId, periods, isLoading }: HistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const otherPeriods = history.filter((h) => h.id !== currentEvaluationId);

  return (
    <div className="bg-surface-raised rounded-2xl p-4 sm:p-5 border border-outline-soft shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="text-brand shrink-0" size={18} />
          <h3 className="text-base sm:text-lg font-bold text-ink">Kết quả các kỳ trước</h3>
        </div>
        <span className="text-xs font-medium text-ink-muted bg-surface-muted px-2.5 py-0.5 rounded-md">
          {otherPeriods.length} kỳ đã lưu
        </span>
      </div>

      {isLoading ? (
        <div className="py-4 text-center text-xs text-ink-muted animate-pulse">
          Đang tải lịch sử đánh giá...
        </div>
      ) : otherPeriods.length === 0 ? (
        <p className="text-xs text-ink-muted italic py-1.5">
          Chưa có dữ liệu kết quả từ các kỳ đánh giá trước.
        </p>
      ) : (
        <div className="space-y-2.5 pt-1">
          {otherPeriods.map((h) => {
            const period = periods.find((p) => p.id === h.periodId);
            const pName = period ? `${period.name} (${period.year})` : 'Kỳ đánh giá';
            const isExpanded = expandedId === h.id;

            return (
              <div
                key={h.id}
                className="p-3 sm:p-3.5 rounded-xl bg-surface-muted/60 border border-outline-soft hover:border-brand/30 transition-all space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-lg bg-surface-raised border border-outline-soft flex items-center justify-center font-bold text-sm text-brand shadow-2xs shrink-0">
                      {h.finalGrade || '-'}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink">{pName}</p>
                      <p className="text-xs text-ink-muted">
                        Điểm: <b className="text-ink font-semibold">{h.finalScore ?? '-'}</b>
                        {h.updatedAt && ` • ${new Date(h.updatedAt).toLocaleDateString('vi-VN')}`}
                      </p>
                    </div>
                  </div>

                  {h.resultMessage && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : h.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 max-md:min-h-[44px] rounded-lg bg-surface-raised border border-outline-soft text-xs font-semibold text-ink hover:text-brand hover:border-brand/30 transition-colors"
                    >
                      <span>{isExpanded ? 'Ẩn nhận xét' : 'Xem nhận xét'}</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>

                {isExpanded && h.resultMessage && (
                  <div className="p-3 rounded-xl bg-surface-raised border border-brand-mid/20 text-xs text-ink leading-relaxed whitespace-pre-wrap animate-in fade-in duration-150">
                    <p className="font-semibold text-brand mb-1 flex items-center gap-1.5">
                      <MessageSquareQuote size={13} className="text-brand-mid" />
                      Nhận xét kỳ này:
                    </p>
                    {h.resultMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
