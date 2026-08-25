import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';

export default function EmployeesLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Đang tải danh sách nhân sự"
      className="px-6 md:px-10 lg:px-12 py-8 lg:py-5 space-y-8 lg:space-y-4 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto"
    >
      <span className="sr-only">Đang tải danh sách nhân sự...</span>

      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <Skeleton className="h-8 md:h-9 w-64 mb-2" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <Skeleton className="h-11 w-full sm:w-28 rounded-xl" />
          <Skeleton className="h-11 w-full sm:w-36 rounded-xl" />
          <Skeleton className="h-11 w-full sm:w-40 rounded-xl" />
        </div>
      </div>

      {/* Filters Section Skeleton */}
      <div className="flex flex-col xl:flex-row gap-4">
        <div className="relative flex-1 min-w-[300px]">
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className="flex flex-col sm:flex-row gap-4 lg:w-auto">
          <Skeleton className="h-12 w-full sm:w-[220px] rounded-xl" />
          <Skeleton className="h-12 w-full sm:w-[220px] rounded-xl" />
        </div>
      </div>

      {/* Table Section Skeleton */}
      <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm overflow-hidden min-h-[400px] flex flex-col">
        <div className="p-6 flex-1">
          <TableSkeleton rows={8} columns={6} />
        </div>
      </div>

      {/* Footer Info Skeleton */}
      <div className="mt-6 flex items-center justify-between px-2">
        <Skeleton className="h-4 w-56" />
      </div>
    </div>
  );
}
