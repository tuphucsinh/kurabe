import { Skeleton } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Đang tải dữ liệu tổng quan"
      className="px-6 md:px-10 lg:px-12 py-8 lg:py-5 space-y-8 lg:space-y-4 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto"
    >
      <span className="sr-only">Đang tải dữ liệu tổng quan...</span>

      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Skeleton className="h-8 w-56 mb-2" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      </div>

      {/* KPI Compact Bar Skeleton */}
      <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-4 md:flex-wrap">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2 min-w-[140px]"
          >
            <Skeleton className="h-5 w-5 rounded-full shrink-0" />
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>

      {/* Row 1: Team Status & Grade Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Team Status Card Skeleton */}
        <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col min-h-[260px]">
          <Skeleton className="h-6 w-44 mb-6" />
          <div className="space-y-6 flex-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Grade Distribution Card Skeleton */}
        <div className="bg-surface-raised p-5 rounded-2xl shadow-sm border border-outline-soft min-h-[260px] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="space-y-3 flex-1 justify-center flex flex-col">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-3 flex-1 rounded-full" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Pending Reviews & Anomaly Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft min-h-[240px]">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft min-h-[240px]">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 3: Skill Gap Radar & Recent Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft min-h-[320px] flex flex-col">
          <Skeleton className="h-6 w-40 mb-4" />
          <Skeleton className="h-56 w-full rounded-xl mt-auto" />
        </div>

        <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft min-h-[320px] flex flex-col">
          <Skeleton className="h-6 w-44 mb-6" />
          <div className="space-y-4 flex-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-4 p-2">
                <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
