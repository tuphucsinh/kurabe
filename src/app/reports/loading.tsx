import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';

export default function ReportsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Đang tải dữ liệu báo cáo"
      className="px-6 md:px-10 lg:px-12 py-8 space-y-6 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto"
    >
      <span className="sr-only">Đang tải báo cáo tổng hợp...</span>

      {/* Header + KPI Compact Pill + Action buttons */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-2">
        <div>
          <Skeleton className="h-8 w-44 mb-2" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* KPI Compact Pill */}
          <div className="bg-white px-4 py-2.5 rounded-2xl border border-outline-variant/60 shadow-sm flex flex-wrap items-center gap-3 sm:gap-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
          {/* Action Button */}
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>

      {/* ReportFilters Skeleton */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3 md:p-4 rounded-2xl border border-outline-variant shadow-sm">
        <Skeleton className="h-9 w-20 rounded-xl" />
        <Skeleton className="h-9 w-40 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
        <Skeleton className="h-4 w-36 ml-auto hidden md:block" />
      </div>

      {/* GradeDistribution Skeleton (full-width) */}
      <div className="bg-white px-5 py-4 rounded-2xl shadow-sm border border-outline-variant/60">
        <div className="flex items-center justify-between mb-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="space-y-2.5">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-3.5 w-10" />
              <Skeleton className="h-2.5 flex-1 rounded-full" />
              <Skeleton className="h-3.5 w-8" />
              <Skeleton className="h-3.5 w-10" />
            </div>
          ))}
        </div>
      </div>

      {/* Grid 2 Columns: TeamComparison & CriteriaHeatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TeamComparison Skeleton */}
        <div className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm min-h-[300px] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="space-y-5 flex-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* CriteriaHeatmap Skeleton */}
        <div className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm min-h-[300px] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid 2 Columns: TopPerformers & AiSummaryCard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TopPerformers Skeleton */}
        <div className="bg-white rounded-3xl border border-outline-variant shadow-sm overflow-hidden flex flex-col min-h-[280px]">
          <div className="p-6 border-b border-outline-variant bg-surface/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div>
                <Skeleton className="h-5 w-32 mb-1" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="p-4 flex-1">
            <TableSkeleton rows={5} columns={5} />
          </div>
        </div>

        {/* AiSummaryCard Skeleton */}
        <div className="bg-gradient-to-br from-indigo-50/80 to-white p-6 rounded-3xl border border-indigo-100 shadow-sm min-h-[280px] flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-5 w-36 mb-1" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
          <div className="space-y-3 py-4 flex-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        </div>
      </div>
    </div>
  );
}
