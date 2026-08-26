import { Skeleton } from '@/components/ui/Skeleton';
import { ChevronRight } from 'lucide-react';

export function CriteriaRegionSkeleton() {
  return (
    <div className="space-y-6 max-md:space-y-4 w-full min-w-0" data-load-layer="heavy">
      {/* Group Navigation Tabs Skeleton */}
      <div className="w-full min-w-0 max-w-full flex items-center gap-2 overflow-x-auto pb-2 pt-1 max-md:pb-1.5 max-md:pt-0.5 scrollbar-hide px-1 max-md:px-0.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3 max-md:px-3 max-md:py-2 rounded-2xl max-md:rounded-xl border border-outline-soft bg-surface-raised shrink-0 max-md:min-h-[44px]"
          >
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-12 rounded" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Criterion Cards Skeleton */}
      <div className="space-y-2 max-md:space-y-2.5 w-full min-w-0">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-full min-w-0 max-w-full bg-surface-raised rounded-2xl border border-outline-soft overflow-hidden shadow-sm max-md:shadow-2xs"
          >
            {/* Header */}
            <div className="px-4 py-2.5 max-md:px-3 max-md:py-2 bg-surface-muted/50 border-b border-outline-soft/70 flex flex-row items-center justify-between gap-2 max-md:flex-col max-md:items-start w-full min-w-0">
              <div className="flex items-center gap-3 max-md:gap-2 max-md:justify-between max-md:w-full min-w-0">
                <Skeleton className="h-5 w-10 rounded" />
                <Skeleton className="h-5 w-40 md:w-56 rounded" />
                <Skeleton className="h-6 w-16 rounded-lg ml-auto" />
              </div>
              <Skeleton className="h-5 w-20 rounded max-md:w-full" />
            </div>

            {/* Body / Options Grid */}
            <div className="p-3 md:p-3.5 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <div
                    key={lvl}
                    className="p-2.5 max-md:p-2 rounded-xl border border-outline-soft bg-surface-muted/30 space-y-1.5 min-h-[56px]"
                  >
                    <Skeleton className="h-3 w-14 rounded" />
                    <Skeleton className="h-4 w-8 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EvaluationStaticFrame() {
  return (
    <div
      className="px-6 md:px-10 lg:px-12 py-8 space-y-8 max-md:px-3 max-md:py-3 max-md:space-y-4 animate-in fade-in duration-300 w-full max-w-[1600px] mx-auto xl:px-6 xl:py-4 xl:max-w-none xl:space-y-6"
      data-load-layer="shell"
      data-load-state="static"
    >
      <div className="flex flex-col gap-6 max-md:gap-3 xl:gap-4" data-load-layer="light">
        {/* Breadcrumb + Action row */}
        <div className="flex flex-row max-md:flex-col justify-between items-center max-md:items-start gap-4 max-md:gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm max-md:text-xs text-ink-muted font-medium max-md:w-full max-md:flex-nowrap max-md:justify-between">
            <span>Đánh giá</span>
            <ChevronRight size={13} className="shrink-0 text-outline-soft max-md:hidden" />
            <Skeleton className="h-6 w-24 rounded-lg" />
          </div>
          <div className="flex items-center gap-3 max-md:gap-2 w-auto max-md:w-full max-md:flex-wrap">
            <Skeleton className="h-9 w-28 max-md:flex-1 rounded-xl" />
            <Skeleton className="h-9 w-32 max-md:flex-1 rounded-xl" />
          </div>
        </div>

        {/* Employee Header Frame + Score Table Frame */}
        <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm max-md:shadow-2xs overflow-hidden">
          <div className="flex flex-col md:flex-row">
            {/* Left: Employee Info */}
            <div className="flex-1 p-6 md:p-8 space-y-4 max-md:p-3.5 max-md:space-y-2 xl:p-5 xl:space-y-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                <Skeleton className="h-8 w-44 md:w-56 rounded-lg" />
                <Skeleton className="h-5 w-20 rounded-md" />
              </div>
              <div className="max-md:hidden flex flex-wrap items-center gap-8 md:gap-16 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-muted">Mã NV:</span>
                  <Skeleton className="h-4 w-16 rounded" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-muted">Bộ phận:</span>
                  <Skeleton className="h-4 w-24 rounded" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-ink-muted">Ngày vào làm:</span>
                  <Skeleton className="h-4 w-20 rounded" />
                </div>
              </div>
            </div>

            {/* Right: Score Panel */}
            <div className="flex items-center justify-center px-6 py-6 md:py-4 max-md:px-4 max-md:py-3 xl:py-2 border-t md:border-t-0 md:border-l border-outline-soft/60 bg-surface-muted/30">
              <table className="border-collapse text-center">
                <thead>
                  <tr>
                    <th className="px-2 pb-1 xl:pb-0 max-md:px-1.5 text-[11px] max-md:text-[10px] font-bold uppercase tracking-wider text-ink-muted/80 w-[32px]"></th>
                    <th className="px-3 pb-1 xl:pb-0 max-md:px-2 text-[11px] max-md:text-[10px] font-bold uppercase tracking-wider text-ink-muted/80">Xếp loại</th>
                    <th className="px-3 pb-1 xl:pb-0 max-md:px-2 text-[11px] max-md:text-[10px] font-bold uppercase tracking-wider text-ink-muted/80">Tổng điểm</th>
                    <th className="px-3 pb-1 xl:pb-0 max-md:px-2 text-[11px] max-md:text-[10px] font-bold uppercase tracking-wider text-ink-muted/80">Tiêu chí</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-1 xl:py-0.5 max-md:px-1.5 max-md:py-0.5 text-xs font-bold text-ink-muted uppercase">
                      <Skeleton className="h-4 w-6 mx-auto rounded" />
                    </td>
                    <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                      <Skeleton className="h-7 w-10 mx-auto rounded" />
                    </td>
                    <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                      <Skeleton className="h-7 w-12 mx-auto rounded" />
                    </td>
                    <td className="px-3 py-1 xl:py-0.5 max-md:px-2 max-md:py-0.5">
                      <Skeleton className="h-7 w-14 mx-auto rounded" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Main Body (2 Columns): Criteria Region + Nhận xét Card */}
      <div className="w-full flex flex-col lg:flex-row gap-6 items-start max-md:items-stretch" data-load-layer="heavy">
        {/* Left Column: Criteria Region Skeleton */}
        <div className="flex-1 min-w-0 max-md:w-full space-y-6 max-md:space-y-4">
          <CriteriaRegionSkeleton />
        </div>

        {/* Right Column: Nhận xét card Skeleton */}
        <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-8 z-10 xl:w-[272px]">
          <div className="bg-surface-raised rounded-2xl p-6 max-md:p-4 border border-outline-soft shadow-sm max-md:shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2 xl:flex-wrap xl:gap-y-3">
              <h3 className="text-base max-md:text-sm font-bold text-ink">Nhận xét</h3>
              <Skeleton className="h-6 w-20 rounded-lg" />
            </div>
            <Skeleton className="w-full h-36 max-md:h-32 xl:h-[314px] rounded-xl" />
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Nhận xét này sẽ được hiển thị cho nhân viên sau khi kỳ đánh giá kết thúc.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EvaluationStaticFrame;
