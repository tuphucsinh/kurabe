'use client';

import { useMemo } from 'react';
import { Clock, CheckCircle2 } from 'lucide-react';
import { Evaluation } from '@/types';
import { EmptyState } from '@/components/ui/EmptyState';

/** Dashboard: ai còn nợ đánh giá (theo evaluator) — kỳ hiện tại.
 * userNameById truyền từ server page hoặc data layer — không tự fetch useUsers (fix flash UUID). */
export default function PendingReviews({
  evaluations = [],
  userNameById = {},
}: {
  evaluations?: Evaluation[];
  userNameById?: Record<string, string>;
}) {
  const pending = useMemo(() => {
    const map = new Map<string, { name: string; count: number; rounds: Set<number> }>();

    for (const ev of evaluations) {
      // Round hiện tại = round nhỏ nhất chưa Submitted (theo workflow tuần tự)
      const currentRound = (ev.rounds || [])
        .filter((r) => r.status !== 'Submitted')
        .sort((a, b) => a.round - b.round)[0];
      if (!currentRound) continue;

      const evaluatorId = currentRound.evaluatorId;
      const entry = map.get(evaluatorId) || { name: evaluatorId, count: 0, rounds: new Set<number>() };
      entry.count += 1;
      entry.rounds.add(currentRound.round);
      map.set(evaluatorId, entry);
    }

    return [...map.entries()]
      .map(([id, e]) => ({ ...e, name: userNameById[id] || e.name }))
      .sort((a, b) => b.count - a.count);
  }, [evaluations, userNameById]);

  const totalPending = pending.reduce((s, p) => s + p.count, 0);

  if (totalPending === 0) {
    return (
      <div data-load-layer="heavy" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold text-slate-800">Đánh giá tồn đọng</h3>
        </div>
        <EmptyState
          icon={CheckCircle2}
          title="Không còn đánh giá tồn đọng"
          description="Tất cả đánh giá của kỳ này đã được xử lý."
          className="p-0"
        />
      </div>
    );
  }

  return (
    <div data-load-layer="heavy" className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-5">
        <Clock className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-semibold text-slate-800">Đánh giá tồn đọng</h3>
        <span className="ml-auto text-sm font-bold text-amber-600">{totalPending} NV chưa xong</span>
      </div>

      <div className="space-y-3">
        {pending.map((p) => (
          <div key={p.name} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-100">
            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm shrink-0">
              {p.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{p.name}</p>
              <p className="text-xs text-slate-500">
                Còn đánh giá <span className="font-bold text-amber-600">{p.count} NV</span>
                {[...p.rounds].sort().map((r) => ` • vòng ${r}`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
