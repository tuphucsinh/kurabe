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
    <div className="bg-white rounded-3xl p-6 md:p-8 border border-outline-variant shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <History className="text-primary" size={20} />
          <h3 className="text-lg font-bold text-slate-900">Kết quả các kỳ trước</h3>
        </div>
        <span className="text-xs font-medium text-slate-400">
          {otherPeriods.length} kỳ đã lưu
        </span>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-xs text-slate-400 animate-pulse">
          Đang tải lịch sử đánh giá...
        </div>
      ) : otherPeriods.length === 0 ? (
        <p className="text-xs text-slate-500 italic py-2">
          Chưa có dữ liệu kết quả từ các kỳ đánh giá trước.
        </p>
      ) : (
        <div className="space-y-3 pt-2">
          {otherPeriods.map((h) => {
            const period = periods.find((p) => p.id === h.periodId);
            const pName = period ? `${period.name} (${period.year})` : 'Kỳ đánh giá';
            const isExpanded = expandedId === h.id;

            return (
              <div
                key={h.id}
                className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 hover:border-primary/30 transition-all space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-black text-sm text-primary shadow-2xs">
                      {h.finalGrade || '-'}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{pName}</p>
                      <p className="text-xs text-slate-500">
                        Điểm: <b className="text-slate-800 font-semibold">{h.finalScore ?? '-'}</b>
                        {h.updatedAt && ` • ${new Date(h.updatedAt).toLocaleDateString('vi-VN')}`}
                      </p>
                    </div>
                  </div>

                  {h.resultMessage && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : h.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-primary transition-colors"
                    >
                      <span>{isExpanded ? 'Ẩn nhận xét' : 'Xem nhận xét'}</span>
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>

                {isExpanded && h.resultMessage && (
                  <div className="p-3.5 rounded-xl bg-white border border-sky-200 text-xs text-sky-950 leading-relaxed whitespace-pre-wrap animate-in fade-in duration-200">
                    <p className="font-semibold text-sky-900 mb-1 flex items-center gap-1.5">
                      <MessageSquareQuote size={13} className="text-sky-600" />
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
