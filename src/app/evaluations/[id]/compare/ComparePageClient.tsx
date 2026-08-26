'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEvaluationComparePageData } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { calculateRoundScore } from '@/lib/scoring';
import { getGradeBandsSync } from '@/lib/grade-bands';
import { getGradeBandsAction } from '@/actions/read';
import { gradeBadgeClass } from '@/components/ui/GradeBadge';
import { getEvaluationAccessState } from '@/data/workflow';
import { CriteriaGroup, User } from '@/types';
import type { EvaluationPeriodScope } from '@/lib/evaluation-period-scope';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  History,
  AlertCircle,
  ArrowRight,
  Loader2,
  Lock
} from 'lucide-react';

interface ComparePageClientProps {
  employeeId: string;
  scope: EvaluationPeriodScope;
}

const EMPTY_USERS: User[] = [];
const EMPTY_GROUPS: CriteriaGroup[] = [];

export default function ComparePageClient({ employeeId, scope }: ComparePageClientProps) {
  const router = useRouter();
  const periodId = scope.kind === 'ACTIVE' ? scope.activePeriodId : undefined;
  const { user } = useAuth();

  const { data: pageData, isLoading } = useEvaluationComparePageData(employeeId, periodId, user);
  const employee = pageData?.employee;
  const evaluation = pageData?.evaluation;
  const users = pageData?.users ?? EMPTY_USERS;
  const groups = pageData?.groups ?? EMPTY_GROUPS;
  const loadingUser = isLoading;
  const loadingEval = isLoading;
  const loadingCriteria = isLoading;

  // Nạp thang điểm từ DB (load trang trực tiếp sẽ còn fallback hardcode nếu thiếu)
  const [gradeBands, setGradeBands] = useState(() => getGradeBandsSync());
  useEffect(() => {
    let cancelled = false;
    getGradeBandsAction().then((bands) => { if (!cancelled) setGradeBands(bands); });
    return () => { cancelled = true; };
  }, []);

  const accessState = useMemo(() =>
    evaluation ? getEvaluationAccessState(user, evaluation, users) : null,
  [user, evaluation, users]);

  const allRounds = useMemo(() => {
    if (!evaluation || !evaluation.rounds || !accessState) return [];
    return [...evaluation.rounds]
      .filter(r => accessState.visibleRounds.some(vr => vr.round === r.round))
      .sort((a, b) => a.round - b.round);
  }, [evaluation, accessState]);
  const activeVisibleRound = allRounds.length > 0 ? allRounds[allRounds.length - 1].round : null;

  const criteria = useMemo(() => {
    if (!employee || groups.length === 0) return [];
    const role = employee.role;

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
    const evaluatorRole = employee.role;

    return allRounds.map(r => ({
      round: r,
      result: calculateRoundScore({ ...r, evaluatorRole }, gradeBands),
    }));
  }, [allRounds, employee, gradeBands]);

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

  if (scope.kind === 'NO_ACTIVE_PERIOD') {
    return (
      <main className="flex min-h-[240px] items-center justify-center px-6 py-12">
        <p className="text-center text-sm text-slate-600">Hiện chưa có kỳ đánh giá đang mở.</p>
      </main>
    );
  }

  if (scope.kind === 'MULTIPLE_ACTIVE_PERIODS' || scope.kind === 'ACTIVE_PERIOD_RESOLUTION_ERROR') {
    return (
      <main className="flex min-h-[240px] items-center justify-center px-6 py-12" role="alert">
        <p className="text-center text-sm text-amber-700">Không thể xác định kỳ đánh giá đang mở.</p>
      </main>
    );
  }

  if (loadingUser || loadingEval || loadingCriteria) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-brand animate-spin" />
        <p className="text-ink-muted font-medium">Đang tải dữ liệu so sánh...</p>
      </div>
    );
  }

  if (!employee || !evaluation || !accessState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-12 h-12 text-error" />
        <p className="text-ink font-bold">Không tìm thấy dữ liệu nhân viên hoặc đánh giá.</p>
        <button onClick={() => router.back()} className="text-brand font-bold">Quay lại</button>
      </div>
    );
  }

  // Blocked UI
  if (accessState.mode === 'blocked') {
    return (
      <div className="min-h-screen bg-page flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-4 bg-error/10 rounded-full text-error">
          <Lock size={48} />
        </div>
        <h2 className="text-2xl font-bold text-ink uppercase tracking-tight">Quyền truy cập bị từ chối</h2>
        <p className="text-ink-muted max-w-md">
          {accessState.reason === 'NO_DRAFT'
            ? 'Chưa có đánh giá.'
            : 'Bạn không có quyền xem dữ liệu so sánh này.'}
        </p>
        <button
          onClick={() => router.back()}
          className="px-8 py-3 bg-brand text-white rounded-2xl font-bold shadow-lg shadow-brand/20 hover:scale-105 active:scale-95 transition-all"
        >
          Quay lại trang đánh giá
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-page pb-20">
      {/* ═══════ Sticky Header ═══════ */}
      <div className="sticky top-0 z-50 bg-surface-raised border-b border-outline-soft px-3 sm:px-4 md:px-8 py-3 sm:py-4 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => router.push(`/evaluations/${employeeId}`)}
              className="p-2 hover:bg-surface-muted rounded-full transition-colors text-ink-muted max-md:min-h-[44px] max-md:min-w-[44px] flex items-center justify-center active:scale-95"
            >
              <ArrowLeft size={22} />
            </button>
            <div>
              <h1 className="text-base sm:text-lg md:text-xl font-black text-ink tracking-tight uppercase">So sánh các vòng đánh giá</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-bold text-brand px-2 py-0.5 bg-brand-soft rounded-lg">
                  {employee.name}
                </span>
                <span className="text-xs text-ink-muted font-medium">
                  {employee.employeeCode || 'No Code'}
                </span>
              </div>
            </div>
          </div>
          <div className="max-md:hidden flex items-center gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[11px] font-bold text-ink-muted uppercase tracking-widest">Trạng thái hiện tại</span>
              <span className="text-sm font-black text-ink">Lần {activeVisibleRound ?? '-'}</span>
            </div>
            <div className="p-3 bg-brand-soft rounded-2xl text-brand">
              <History size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 mt-6 md:mt-8">
        <div className="flex flex-col gap-6 sm:gap-8">

          {/* ═══════ Summary Section ═══════ */}
          <section>
            <h2 className="text-xs font-black text-ink-muted uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <AlertCircle size={14} className="text-brand" />
              Tổng quan kết quả
            </h2>
            {allRounds.length === 0 ? (
              <div className="p-8 sm:p-12 text-center bg-surface-raised rounded-[2rem] border border-dashed border-outline-soft shadow-sm">
                <p className="text-sm text-ink-muted font-medium">Chưa có đánh giá.</p>
              </div>
            ) : (
            <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto pb-4 scrollbar-hide touch-pan-x">
              {roundResults.map(({ round: r, result }, idx) => {
                const prevResult = idx > 0 ? roundResults[idx - 1].result : null;
                const delta = prevResult ? result.totalScore - prevResult.totalScore : null;

                return (
                  <div key={r.round} className="flex items-center gap-3 sm:gap-4 shrink-0">
                    {idx > 0 && (
                      <div className="flex flex-col items-center gap-1">
                        <div className={`
                          flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl text-xs font-black
                          ${delta! > 0 ? 'bg-green-100 text-green-700' :
                            delta! < 0 ? 'bg-red-100 text-red-700' : 'bg-surface-muted text-ink-muted'}
                        `}>
                          {delta! > 0 ? <TrendingUp size={13} /> :
                           delta! < 0 ? <TrendingDown size={13} /> : <Minus size={13} />}
                          {delta! > 0 ? `+${delta}` : delta}
                        </div>
                        <ArrowRight size={14} className="text-outline-soft" />
                      </div>
                    )}

                    <div className={`
                      min-w-[160px] sm:min-w-[180px] p-4 sm:p-6 rounded-[2rem] border shadow-sm flex flex-col items-center text-center transition-all hover:shadow-md
                      ${r.round === evaluation.currentRound
                        ? 'bg-surface-raised border-brand ring-1 ring-brand/20'
                        : 'bg-surface-raised border-outline-soft'}
                    `}>
                      <span className={`text-[11px] font-bold uppercase tracking-widest mb-2 sm:mb-3 ${
                        r.round === evaluation.currentRound ? 'text-brand' : 'text-ink-muted'
                      }`}>
                        Lần {r.round} {r.round === evaluation.currentRound ? '(Hiện tại)' : ''}
                      </span>
                      <div className="text-3xl sm:text-4xl font-black text-ink mb-1">{result.totalScore}</div>
                      <div className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-black uppercase shadow-md ${gradeBadgeClass(result.grade, 'solid')}`}>
                        Hạng {result.grade}
                      </div>
                      <button
                        onClick={() => router.push(`/evaluations/${employeeId}?round=${r.round}`)}
                        className="mt-3 sm:mt-4 flex items-center gap-1.5 text-[11px] font-black text-brand hover:underline uppercase tracking-tighter max-md:min-h-[36px]"
                      >
                        Xem chi tiết <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </section>

          {/* ═══════ Main Comparison Table & Mobile Cards ═══════ */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h2 className="text-xs font-black text-ink-muted uppercase tracking-[0.2em] flex items-center gap-2">
                Chi tiết tiêu chí thay đổi ({changedCriteriaIds.size})
              </h2>
              <span className="self-start sm:self-auto text-[11px] font-bold text-ink-muted bg-surface-muted px-2 py-1 rounded-lg border border-outline-soft">
                Chỉ hiển thị các mục có biến động điểm
              </span>
            </div>

            {changedCriteriaIds.size > 0 ? (
              <>
                {/* Mobile: Card presentation with rounds stacked */}
                <div className="md:hidden space-y-3">
                  {allCriteria.filter(c => changedCriteriaIds.has(c.id)).map(criterion => {
                    const roundScores = allRounds.map(r => r.scores?.[criterion.id] ?? 0);
                    const totalDelta = roundScores.length >= 2
                      ? roundScores[roundScores.length - 1] - roundScores[0]
                      : 0;

                    return (
                      <div key={criterion.id} className="p-4 rounded-2xl border border-outline-soft bg-surface-raised shadow-sm space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-black text-brand uppercase tracking-tighter opacity-80">{criterion.id}</span>
                            <h3 className="text-sm font-bold text-ink leading-tight">{criterion.name}</h3>
                          </div>
                          <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-xl shadow-sm ${
                            totalDelta > 0 ? 'bg-green-100 text-green-700' :
                            totalDelta < 0 ? 'bg-red-100 text-red-700' : 'bg-surface-muted text-ink-muted'
                          }`}>
                            {totalDelta > 0 ? <TrendingUp size={12} /> : totalDelta < 0 ? <TrendingDown size={12} /> : null}
                            {totalDelta > 0 ? `+${totalDelta}` : totalDelta}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 gap-2 pt-2 border-t border-outline-soft/40">
                          {allRounds.map((r, rIdx) => {
                            const score = r.scores?.[criterion.id] ?? 0;
                            const prevScore = rIdx > 0 ? (allRounds[rIdx-1].scores?.[criterion.id] ?? 0) : null;
                            const delta = prevScore !== null ? score - prevScore : 0;
                            const isCurrent = r.round === evaluation.currentRound;

                            return (
                              <div key={r.round} className={`p-2.5 rounded-xl flex flex-col items-center justify-center border text-center transition-all ${
                                isCurrent
                                  ? 'bg-brand-soft border-brand/40 ring-1 ring-brand/20'
                                  : 'bg-surface/50 border-outline-soft/50'
                              }`}>
                                <span className={`text-[11px] font-black uppercase tracking-wider mb-1 ${isCurrent ? 'text-brand font-bold' : 'text-ink-muted'}`}>
                                  Lần {r.round} {isCurrent ? '(Hiện tại)' : ''}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-base font-black ${isCurrent ? 'text-brand' : 'text-ink'}`}>
                                    {score}
                                  </span>
                                  {delta !== 0 && (
                                    <span className={`text-[11px] font-bold ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                      {delta > 0 ? '+' : ''}{delta}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tablet / PC: Table presentation (Unchanged) */}
                <div className="max-md:hidden w-full rounded-[2rem] border border-outline-soft bg-surface-raised overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[700px]">
                      <thead>
                        <tr className="bg-surface/50 border-b border-outline-soft">
                          <th className="px-8 py-5 text-[11px] font-black text-ink-muted uppercase tracking-wider">
                            Tiêu chí đánh giá
                          </th>
                          {allRounds.map(r => (
                            <th key={r.round} className={`px-4 py-5 text-[11px] font-black uppercase tracking-wider text-center min-w-[100px] ${
                              r.round === evaluation.currentRound ? 'text-brand' : 'text-ink-muted'
                            }`}>
                              L{r.round}
                            </th>
                          ))}
                          <th className="px-8 py-5 text-[11px] font-black text-ink-muted uppercase tracking-wider text-right">
                            Biến động (Δ)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-soft">
                        {allCriteria.filter(c => changedCriteriaIds.has(c.id)).map(criterion => {
                          const roundScores = allRounds.map(r => r.scores?.[criterion.id] ?? 0);
                          const totalDelta = roundScores.length >= 2
                            ? roundScores[roundScores.length - 1] - roundScores[0]
                            : 0;

                          return (
                            <tr key={criterion.id} className="hover:bg-surface/30 transition-colors group">
                              <td className="px-8 py-4">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[11px] font-black text-brand uppercase tracking-tighter opacity-70">{criterion.id}</span>
                                  <span className="text-sm font-bold text-ink leading-tight group-hover:text-brand transition-colors">{criterion.name}</span>
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
                                        ${r.round === evaluation.currentRound ? 'bg-brand text-white shadow-md' : 'bg-surface text-ink'}
                                        ${delta > 0 ? 'ring-2 ring-green-500/30' : delta < 0 ? 'ring-2 ring-red-500/30' : ''}
                                      `}>
                                        {score}
                                      </div>
                                      {delta !== 0 && (
                                        <span className={`text-[11px] font-bold mt-1 flex items-center gap-0.5 ${
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
                                  totalDelta < 0 ? 'bg-red-100 text-red-700' : 'bg-surface-muted text-ink-muted'
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
              </>
            ) : (
              <div className="p-8 sm:p-16 text-center bg-surface-raised rounded-[2rem] border border-dashed border-outline-soft shadow-sm">
                <div className="inline-flex p-4 bg-surface rounded-full mb-4 text-outline-soft">
                  <Minus size={32} />
                </div>
                <p className="text-sm text-ink-muted font-medium italic">Không có thay đổi điểm số nào giữa các vòng đánh giá.</p>
              </div>
            )}
          </section>

          {/* ═══════ Comments Comparison ═══════ */}
          <section>
            <h2 className="text-xs font-black text-ink-muted uppercase tracking-[0.2em] flex items-center gap-2 mb-4">
              <MessageSquare size={14} className="text-brand" />
              Nhận xét qua các vòng
            </h2>

            <div className={`grid gap-4 sm:gap-6 ${
              allRounds.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
              allRounds.length >= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'
            }`}>
              {allRounds.map(r => (
                <div key={r.round} className={`p-5 sm:p-6 rounded-[2rem] border shadow-sm flex flex-col gap-4 transition-all hover:shadow-md ${
                  r.round === evaluation.currentRound
                    ? 'bg-surface-raised border-brand/20'
                    : 'bg-surface-raised border-outline-soft'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-black uppercase tracking-widest ${
                      r.round === evaluation.currentRound ? 'text-brand' : 'text-ink-muted'
                    }`}>
                      Lần {r.round} {r.round === evaluation.currentRound ? '(Hiện tại)' : ''}
                    </span>
                    <span className="text-[11px] font-bold text-outline-soft">
                      {r.submittedAt ? 'Đã gửi' : 'Bản nháp'}
                    </span>
                  </div>

                  <div className="flex-1">
                    <div className="text-[11px] font-black text-ink-muted/50 uppercase mb-2">Nhận xét chung</div>
                    <p className="text-sm text-ink/80 leading-relaxed italic font-medium">
                      &quot;{r.comment || "Không có nhận xét."}&quot;
                    </p>
                  </div>

                  {r.additionalComment && (
                    <div className="pt-4 border-t border-outline-soft/30 bg-surface/30 -mx-5 -mb-5 sm:-mx-6 sm:-mb-6 p-5 sm:p-6 rounded-b-[2rem]">
                      <div className="text-[11px] font-black text-ink-muted/50 uppercase mb-2">Thông tin bổ sung</div>
                      <p className="text-xs text-ink/70 leading-relaxed italic">
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
              <div className="bg-surface-raised rounded-3xl border border-outline-soft overflow-hidden">
                <div className="px-4 sm:px-8 py-4 bg-surface/30 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <h3 className="text-xs font-black text-ink-muted uppercase tracking-widest">
                    Tiêu chí giữ nguyên ({unchangedCriteria.length})
                  </h3>
                  <span className="text-[11px] font-bold text-ink-muted/50 uppercase">
                    {allRounds.length > 1 ? `Không đổi qua ${allRounds.length} vòng` : 'Chưa có vòng để so sánh'}
                  </span>
                </div>
                <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                  {unchangedCriteria.map(criterion => {
                    const score = allRounds[0]?.scores?.[criterion.id] ?? 0;
                    return (
                      <div key={criterion.id} className="flex items-center justify-between p-3 rounded-2xl bg-surface/20 border border-outline-soft/50 hover:border-brand/20 transition-colors">
                        <div className="flex flex-col truncate pr-2">
                          <span className="text-[11px] font-black text-outline-soft uppercase">{criterion.id}</span>
                          <span className="text-xs font-bold text-ink/70 truncate">{criterion.name}</span>
                        </div>
                        <span className="shrink-0 text-sm font-black text-ink-muted px-2.5 py-1 bg-surface-raised rounded-xl shadow-sm border border-outline-soft/30">{score}</span>
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
