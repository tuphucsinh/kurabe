'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { useUsers } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { Evaluation } from '@/types';
import { detectAnomalies } from '@/lib/anomaly';
import { explainAnomalyAction } from '@/actions/ai';
import { EmptyState } from '@/components/ui/EmptyState';

/** Dashboard: cảnh báo đánh giá bất thường (rule-based) + giải thích AI (Manager). */
export default function AnomalyAlertCard({ evaluations }: { evaluations: Evaluation[] }) {
  const { user } = useAuth();
  const { data: users = [] } = useUsers(user);
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [explanations, setExplanations] = useState<Record<string, string>>({});

  const anomalies = useMemo(() => {
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    return detectAnomalies(evaluations, nameById);
  }, [evaluations, users]);

  const isManager = user?.role === 'Manager';

  const handleExplain = async (anomalyId: string, evaluationId: string, name: string, round: number, prevScore: number, score: number) => {
    if (explanations[anomalyId]) return;
    setExplainingId(anomalyId);
    const result = await explainAnomalyAction({ evaluationId, name, round, prevScore, score });
    setExplanations((prev) => ({ ...prev, [anomalyId]: result.explanation || result.error || 'AI không khả dụng.' }));
    setExplainingId(null);
  };

  if (!isManager) return null;

  if (anomalies.length === 0) return null;

  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 mb-5">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h3 className="text-lg font-semibold text-slate-800">Cảnh báo đánh giá bất thường</h3>
        <span className="ml-auto text-sm font-bold text-amber-600">{anomalies.length} cảnh báo</span>
      </div>

      <div className="space-y-3">
          {anomalies.map((a) => {
            const key = `${a.evaluationId}-${a.round}`;
            const isHigh = a.severity === 'high';
            return (
              <div key={key} className={`p-4 rounded-xl border ${isHigh ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg shrink-0 ${isHigh ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                    <AlertTriangle size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">
                      {a.name}
                      <span className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isHigh ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isHigh ? 'Nghiêm trọng' : 'Chú ý'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vòng {a.prevRound}: <b>{a.prevScore}</b> → Vòng {a.round}: <b>{a.score}</b> (chênh <b className={isHigh ? 'text-rose-600' : 'text-amber-600'}>{a.diff} điểm</b>)
                    </p>
                    <button
                      onClick={() => handleExplain(key, a.evaluationId, a.name, a.round, a.prevScore, a.score)}
                      disabled={explainingId === key}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors disabled:opacity-50"
                    >
                      {explainingId === key ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      {explanations[key] ? 'Đã giải thích' : 'Giải thích bằng AI'}
                    </button>
                    {explanations[key] && (
                      <p className="mt-2 text-xs text-slate-600 bg-white/70 rounded-lg p-3 border border-slate-100">
                        {explanations[key]}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-400">
            * Cảnh báo dựa trên quy tắc chênh lệch điểm giữa 2 vòng liên tiếp (≥20: chú ý, ≥30: nghiêm trọng).
          </p>
        </div>
    </div>
  );
}
