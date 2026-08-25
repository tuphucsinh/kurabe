'use client';

import { useMemo } from 'react';
import { CalendarDays, CheckCircle2, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import PeriodActions from '@/components/dashboard/PeriodActions';
import { useEvaluations } from '@/hooks/use-db';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export default function PeriodsTab() {
  const { allPeriods, currentPeriod, setCurrentPeriod, user } = useAuth();
  const { toast } = useToast();
  const { data: evaluations = [], isLoading: evalsLoading } = useEvaluations(undefined, user);

  // Tính toán tiến độ đánh giá cho từng kỳ
  const periodStats = useMemo(() => {
    const stats: Record<string, { total: number; approved: number; pct: number }> = {};
    allPeriods.forEach((period) => {
      const evals = evaluations.filter((e) => e.periodId === period.id);
      const total = evals.length;
      const approved = evals.filter((e) => e.status === 'Approved').length;
      const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
      stats[period.id] = { total, approved, pct };
    });
    return stats;
  }, [allPeriods, evaluations]);

  return (
    <div className="space-y-6">
      {/* Card Thao tác kỳ đánh giá — Manager mutation cluster, hidden on mobile */}
      <div className="max-md:hidden bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-600" />
          Thao tác kỳ đánh giá
        </h3>
        <PeriodActions />
      </div>

      {/* Card Danh sách kỳ đánh giá */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-500" />
          Danh sách kỳ đánh giá
        </h3>

        {allPeriods.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Chưa có kỳ đánh giá"
            description="Tạo kỳ mới để bắt đầu đánh giá."
          />
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {allPeriods.map((period) => {
              const stat = periodStats[period.id] || { total: 0, approved: 0, pct: 0 };
              const isSelected = period.id === currentPeriod?.id;

              return (
                <div
                  key={period.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-3 sm:py-4 gap-3 sm:gap-4 hover:bg-slate-50/50 transition-colors"
                >
                  {/* Cột 1: Kỳ {year} + name */}
                  <div className="min-w-0 sm:min-w-[180px]">
                    <div className="font-semibold text-slate-800">
                      Kỳ {period.year}
                    </div>
                    {period.name && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {period.name}
                      </div>
                    )}
                  </div>

                  {/* Cột 2: Badge status */}
                  <div className="min-w-0 sm:min-w-[100px]">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        period.status === 'Active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {period.status === 'Active' ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Đang mở
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 mr-1" />
                          Đã đóng
                        </>
                      )}
                    </span>
                  </div>

                  {/* Cột 3: Tiến độ */}
                  <div className="min-w-0 sm:min-w-[200px] text-sm">
                    {evalsLoading ? (
                      <Skeleton variant="text" width={120} height={16} />
                    ) : stat.total === 0 ? (
                      <span className="text-slate-400">Chưa có dữ liệu</span>
                    ) : (
                      <span className="text-slate-600 font-medium">
                        {stat.approved}/{stat.total} đánh giá • {stat.pct}%
                      </span>
                    )}
                  </div>

                  {/* Cột 4: Nút */}
                  <div className="flex items-center sm:justify-end min-w-0 sm:min-w-[120px]">
                    {isSelected ? (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-100 text-indigo-700">
                        Đang chọn
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentPeriod(period);
                          toast('Đã chọn kỳ ' + period.year, 'success');
                        }}
                        className="px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition"
                      >
                        Chọn kỳ
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
