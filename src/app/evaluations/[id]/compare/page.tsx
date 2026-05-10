'use client';

import { use, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useEvaluationByEmployee, useCriteria } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { calculateRoundScore } from '@/lib/scoring';
import { isLeaderGradingRole } from '@/lib/evaluation-workflow';
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  MessageSquare,
  History,
  AlertCircle,
  ArrowRight,
  Loader2
} from 'lucide-react';

interface ComparePageProps {
  params: Promise<{ id: string }>;
}

export default function ComparePage({ params }: ComparePageProps) {
  const router = useRouter();
  const { id } = use(params);
  const { user } = useAuth();
  
  const { data: employee, isLoading: loadingUser } = useUser(id);
  const { data: evaluation, isLoading: loadingEval } = useEvaluationByEmployee(id, undefined, user);
  const { data: groups = [], isLoading: loadingCriteria } = useCriteria();

  const allRounds = useMemo(() => {
    if (!evaluation || !evaluation.rounds) return [];
    return [...evaluation.rounds].sort((a, b) => a.round - b.round);
  }, [evaluation]);

  const criteria = useMemo(() => {
    if (!employee || groups.length === 0) return [];
    const role = isLeaderGradingRole(employee.role) ? 'Leader' : 'Employee';
    
    return groups.map(group => {
      const filteredCriteria = group.criteria?.filter(
        c => c.appliesTo.includes(role)
      ) || [];
      return { ...group, criteria: filteredCriteria };
    }).filter(g => g.criteria.length > 0);
  }, [employee, groups]);

  const allCriteria = useMemo(() => criteria.flatMap(g => g.criteria), [criteria]);

  // Score results for each round
  const roundResults = useMemo(() => {
    if (!employee) return [];
    const evaluatorRole = isLeaderGradingRole(employee.role) ? 'Leader' : 'Employee';

    return allRounds.map(r => ({
      round: r,
      result: calculateRoundScore({ ...r, evaluatorRole }),
    }));
  }, [allRounds, employee]);

  // Tìm tiêu chí có thay đổi giữa BẤT KỲ 2 round nào
  const changedCriteriaIds = useMemo(() => {
    const ids = new Set<string>();
    allCriteria.forEach(c => {
      const scores = allRounds.map(r => r.scores?.[c.id]);
      const unique = new Set(scores.filter(s => s !== undefined));
      if (unique.size > 1) ids.add(c.id);
    });
    return ids;
  }, [allCriteria, allRounds]);

  const unchangedCriteria = allCriteria.filter(c => !changedCriteriaIds.has(c.id));

  if (loadingUser || loadingEval || loadingCriteria) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-outline font-medium">Đang tải dữ liệu so sánh...</p>
      </div>
    );
  }

  if (!employee || !evaluation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <p className="text-on-surface font-bold">Không tìm thấy dữ liệu nhân viên hoặc đánh giá.</p>
        <button onClick={() => router.back()} className="text-primary font-bold">Quay lại</button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f8f9fa] pb-20">
      {/* ═══════ Sticky Header ═══════ */}
      <div className="sticky top-0 z-50 bg-white border-b border-outline-variant px-4 md:px-8 py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => router.push(`/evaluations/${id}`)}
              className="p-2 hover:bg-surface-variant rounded-full transition-colors text-outline"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-xl font-black text-on-surface tracking-tight uppercase">So sánh các vòng đánh giá</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-bold text-primary px-2 py-0.5 bg-primary/10 rounded-lg">
                  {employee.name}
                </span>
                <span className="text-xs text-outline font-medium">
                  {employee.employeeCode || 'No Code'}
                </span>
              </div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest">Trạng thái hiện tại</span>
              <span className="text-sm font-black text-on-surface">Lần {evaluation.currentRound}</span>
            </div>
            <div className="p-3 bg-primary/10 rounded-2xl text-primary">
              <History size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 mt-8">
        <div className="flex flex-col gap-8">
          
          {/* ═══════ Summary Section ═══════ */}
          <section>
            <h2 className="text-xs font-black text-outline uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <AlertCircle size={14} className="text-primary" />
              Tổng quan kết quả
            </h2>
            <div className="flex items-center gap-4 overflow-x-auto pb-4 scrollbar-hide">
              {roundResults.map(({ round: r, result }, idx) => {
                const prevResult = idx > 0 ? roundResults[idx - 1].result : null;
                const delta = prevResult ? result.totalScore - prevResult.totalScore : null;

                return (
                  <div key={r.round} className="flex items-center gap-4 shrink-0">
                    {idx > 0 && (
                      <div className="flex flex-col items-center gap-1">
                        <div className={`
                          flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black
                          ${delta! > 0 ? 'bg-green-100 text-green-700' : 
                            delta! < 0 ? 'bg-red-100 text-red-700' : 'bg-surface-variant text-outline'}
                        `}>
                          {delta! > 0 ? <TrendingUp size={14} /> : 
                           delta! < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                          {delta! > 0 ? `+${delta}` : delta}
                        </div>
                        <ArrowRight size={16} className="text-outline/30" />
                      </div>
                    )}

                    <div className={`
                      min-w-[180px] p-6 rounded-[2rem] border shadow-sm flex flex-col items-center text-center transition-all hover:shadow-md
                      ${r.round === evaluation.currentRound 
                        ? 'bg-white border-primary ring-1 ring-primary/20' 
                        : 'bg-white border-outline-variant'}
                    `}>
                      <span className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${
                        r.round === evaluation.currentRound ? 'text-primary' : 'text-outline'
                      }`}>
                        Lần {r.round} {r.round === evaluation.currentRound ? '(Hiện tại)' : ''}
                      </span>
                      <div className="text-4xl font-black text-on-surface mb-1">{result.totalScore}</div>
                      <div className={`px-4 py-1.5 rounded-full text-sm font-black uppercase shadow-md ${
                        result.grade === 'S' ? 'bg-amber-500 text-white' :
                        result.grade === 'A' || result.grade === 'AB' ? 'bg-blue-600 text-white' :
                        result.grade === 'B' ? 'bg-green-600 text-white' :
                        result.grade === 'C' ? 'bg-orange-500 text-white' :
                        result.grade === 'D' ? 'bg-red-600 text-white' :
                        'bg-gray-500 text-white'
                      }`}>
                        Hạng {result.grade}
                      </div>
                      <button 
                        onClick={() => router.push(`/evaluations/${id}?round=${r.round}`)}
                        className="mt-4 flex items-center gap-1.5 text-[10px] font-black text-primary hover:underline uppercase tracking-tighter"
                      >
                        Xem chi tiết <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ═══════ Main Comparison Table ═══════ */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-black text-outline uppercase tracking-[0.2em] flex items-center gap-2">
                Chi tiết tiêu chí thay đổi ({changedCriteriaIds.size})
              </h2>
              <span className="text-[10px] font-bold text-outline-variant bg-surface px-2 py-1 rounded-lg border border-outline-variant">
                Chỉ hiển thị các mục có biến động điểm
              </span>
            </div>
            
            {changedCriteriaIds.size > 0 ? (
              <div className="w-full rounded-[2rem] border border-outline-variant bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                      <tr className="bg-surface/50 border-b border-outline-variant">
                        <th className="px-8 py-5 text-[10px] font-black text-outline uppercase tracking-wider">
                          Tiêu chí đánh giá
                        </th>
                        {allRounds.map(r => (
                          <th key={r.round} className={`px-4 py-5 text-[10px] font-black uppercase tracking-wider text-center min-w-[100px] ${
                            r.round === evaluation.currentRound ? 'text-primary' : 'text-outline'
                          }`}>
                            L{r.round}
                          </th>
                        ))}
                        <th className="px-8 py-5 text-[10px] font-black text-outline uppercase tracking-wider text-right">
                          Biến động (Δ)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant">
                      {allCriteria.filter(c => changedCriteriaIds.has(c.id)).map(criterion => {
                        const roundScores = allRounds.map(r => r.scores?.[criterion.id] ?? 0);
                        const totalDelta = roundScores.length >= 2 
                          ? roundScores[roundScores.length - 1] - roundScores[0] 
                          : 0;

                        return (
                          <tr key={criterion.id} className="hover:bg-surface/30 transition-colors group">
                            <td className="px-8 py-4">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-black text-primary uppercase tracking-tighter opacity-70">{criterion.id}</span>
                                <span className="text-sm font-bold text-on-surface leading-tight group-hover:text-primary transition-colors">{criterion.name}</span>
                              </div>
                            </td>
                            {allRounds.map((r, rIdx) => {
                              const score = r.scores?.[criterion.id] ?? 0;
                              const prevScore = rIdx > 0 ? (allRounds[rIdx-1].scores?.[criterion.id] ?? 0) : null;
                              const delta = prevScore !== null ? score - prevScore : 0;

                              return (
                                <td key={r.round} className="px-4 py-4 text-center">
                                  <div className="flex flex-col items-center">
                                    <div className={`
                                      w-10 h-10 flex items-center justify-center rounded-xl text-base font-black transition-all
                                      ${r.round === evaluation.currentRound ? 'bg-primary text-white shadow-md' : 'bg-surface text-on-surface'}
                                      ${delta > 0 ? 'ring-2 ring-green-500/30' : delta < 0 ? 'ring-2 ring-red-500/30' : ''}
                                    `}>
                                      {score}
                                    </div>
                                    {delta !== 0 && (
                                      <span className={`text-[10px] font-bold mt-1 flex items-center gap-0.5 ${
                                        delta > 0 ? 'text-green-600' : 'text-red-600'
                                      }`}>
                                        {delta > 0 ? '+' : ''}{delta}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="px-8 py-4 text-right">
                              <span className={`inline-flex items-center gap-1 text-xs font-black px-3 py-1 rounded-xl shadow-sm ${
                                totalDelta > 0 ? 'bg-green-100 text-green-700' : 
                                totalDelta < 0 ? 'bg-red-100 text-red-700' : 'bg-surface-variant text-outline'
                              }`}>
                                {totalDelta > 0 ? <TrendingUp size={12} /> : totalDelta < 0 ? <TrendingDown size={12} /> : null}
                                {totalDelta > 0 ? `+${totalDelta}` : totalDelta}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="p-16 text-center bg-white rounded-[2rem] border border-dashed border-outline-variant shadow-sm">
                <div className="inline-flex p-4 bg-surface rounded-full mb-4 text-outline/30">
                  <Minus size={32} />
                </div>
                <p className="text-sm text-outline font-medium italic">Không có thay đổi điểm số nào giữa các vòng đánh giá.</p>
              </div>
            )}
          </section>

          {/* ═══════ Comments Comparison ═══════ */}
          <section>
            <h2 className="text-xs font-black text-outline uppercase tracking-[0.2em] flex items-center gap-2 mb-4">
              <MessageSquare size={14} className="text-primary" />
              Nhận xét qua các vòng
            </h2>
            
            <div className={`grid gap-6 ${
              allRounds.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 
              allRounds.length >= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'
            }`}>
              {allRounds.map(r => (
                <div key={r.round} className={`p-6 rounded-[2rem] border shadow-sm flex flex-col gap-4 transition-all hover:shadow-md ${
                  r.round === evaluation.currentRound 
                    ? 'bg-white border-primary/20' 
                    : 'bg-white border-outline-variant'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${
                      r.round === evaluation.currentRound ? 'text-primary' : 'text-outline'
                    }`}>
                      Lần {r.round} {r.round === evaluation.currentRound ? '(Hiện tại)' : ''}
                    </span>
                    <span className="text-[10px] font-bold text-outline/40">
                      {r.submittedAt ? 'Đã gửi' : 'Bản nháp'}
                    </span>
                  </div>
                  
                  <div className="flex-1">
                    <div className="text-[9px] font-black text-outline/50 uppercase mb-2">Nhận xét chung</div>
                    <p className="text-sm text-on-surface/80 leading-relaxed italic font-medium">
                      &quot;{r.comment || "Không có nhận xét."}&quot;
                    </p>
                  </div>

                  {r.additionalComment && (
                    <div className="pt-4 border-t border-outline-variant/30 bg-surface/30 -mx-6 -mb-6 p-6 rounded-b-[2rem]">
                      <div className="text-[9px] font-black text-outline/50 uppercase mb-2">Thông tin bổ sung</div>
                      <p className="text-xs text-on-surface/70 leading-relaxed italic">
                        {r.additionalComment}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ═══════ Unchanged Criteria Accordion-style ═══════ */}
          {unchangedCriteria.length > 0 && (
            <section className="mt-4">
              <div className="bg-white rounded-3xl border border-outline-variant overflow-hidden">
                <div className="px-8 py-4 bg-surface/30 flex items-center justify-between">
                  <h3 className="text-xs font-black text-outline uppercase tracking-widest">
                    Tiêu chí giữ nguyên ({unchangedCriteria.length})
                  </h3>
                  <span className="text-[10px] font-bold text-outline/50 uppercase">
                    {allRounds.length > 1 ? `Không đổi qua ${allRounds.length} vòng` : 'Chưa có vòng để so sánh'}
                  </span>
                </div>
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {unchangedCriteria.map(criterion => {
                    const score = allRounds[0]?.scores?.[criterion.id] ?? 0;
                    return (
                      <div key={criterion.id} className="flex items-center justify-between p-3 rounded-2xl bg-surface/20 border border-outline-variant/50 hover:border-primary/20 transition-colors">
                        <div className="flex flex-col truncate pr-2">
                          <span className="text-[9px] font-black text-outline-variant uppercase">{criterion.id}</span>
                          <span className="text-xs font-bold text-on-surface/70 truncate">{criterion.name}</span>
                        </div>
                        <span className="shrink-0 text-sm font-black text-outline px-2.5 py-1 bg-white rounded-xl shadow-sm border border-outline-variant/30">{score}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
