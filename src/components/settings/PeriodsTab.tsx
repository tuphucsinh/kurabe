'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import PeriodActions from '@/components/dashboard/PeriodActions';
import { getPeriodsProgressSummaryAction, type PeriodProgressSummary } from '@/actions/read';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export default function PeriodsTab() {
  const { allPeriods, currentPeriod, setCurrentPeriod, user } = useAuth();
  const { toast } = useToast();
  const [periodStats, setPeriodStats] = useState<PeriodProgressSummary | null>(null);

  // Light per-period aggregate (COUNT-only server query) — never loads the full
  // all-period evaluations/notes payload on the client. Async-only state updates
  // keep the effect free of synchronous setState cascades.
  useEffect(() => {
    if (!user) return;
    let active = true;
    void getPeriodsProgressSummaryAction()
      .then((res) => {
        if (active) setPeriodStats(res || {});
      })
      .catch(() => {
        if (active) setPeriodStats({});
      });
    return () => {
      active = false;
    };
  }, [user]);

  const statsLoading = Boolean(user) && periodStats === null;

  return (
    <div className="space-y-6">
      {/* Card Thao tác kỳ đánh giá — Manager mutation cluster, hidden on mobile */}
      <div className="max-md:hidden bg-surface-raised rounded-2xl border border-outline-soft/60 shadow-sm p-6">
        <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-brand" />
          Thao tác kỳ đánh giá
        </h3>
        <PeriodActions />
      </div>

      {/* Card Danh sách kỳ đánh giá */}
      <div className="bg-surface-raised rounded-2xl border border-outline-soft/60 shadow-sm p-4 sm:p-6">
        <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-ink-muted" />
          Danh sách kỳ đánh giá
        </h3>

        {allPeriods.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Chưa có kỳ đánh giá"
            description="Tạo kỳ mới để bắt đầu đánh giá."
          />
        ) : (
          <div className="divide-y divide-outline-soft/60 border border-outline-soft/60 rounded-xl overflow-hidden">
            {allPeriods.map((period) => {
              const stat = (periodStats ?? {})[period.id] || { total: 0, approved: 0, pct: 0 };
              const isSelected = period.id === currentPeriod?.id;

              return (
                <div
                  key={period.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-3 sm:px-4 py-3 sm:py-4 gap-3 sm:gap-4 hover:bg-surface-muted/50 transition-colors"
                >
                  {/* Cột 1: Kỳ {year} + name */}
                  <div className="min-w-0 sm:min-w-[180px]">
                    <div className="font-semibold text-ink">
                      Kỳ {period.year}
                    </div>
                    {period.name && (
                      <div className="text-xs text-ink-muted mt-0.5">
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
                          : 'bg-surface-muted text-ink-muted'
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
                    {statsLoading ? (
                      <Skeleton variant="text" width={120} height={16} />
                    ) : stat.total === 0 ? (
                      <span className="text-ink-muted">Chưa có dữ liệu</span>
                    ) : (
                      <span className="text-ink font-medium">
                        {stat.approved}/{stat.total} đánh giá • {stat.pct}%
                      </span>
                    )}
                  </div>

                  {/* Cột 4: Nút */}
                  <div className="flex items-center sm:justify-end min-w-0 sm:min-w-[120px]">
                    {isSelected ? (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-soft text-brand border border-brand/20">
                        Đang chọn
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentPeriod(period);
                          toast('Đã chọn kỳ ' + period.year, 'success');
                        }}
                        className="px-4 py-2 text-sm font-semibold text-brand bg-brand-soft rounded-lg hover:bg-brand/10 transition"
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
