import { Skeleton, StatCardSkeleton, TableSkeleton } from '@/components/ui/Skeleton';

export default function ReportsLoading() {
  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-32 rounded-xl" />
          <Skeleton className="h-10 w-10 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[400px]">
          <Skeleton className="h-6 w-48 mb-6" />
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm h-[400px]">
          <Skeleton className="h-6 w-48 mb-6" />
          <Skeleton className="h-[280px] w-full rounded-xl" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="p-6">
          <TableSkeleton rows={5} columns={6} />
        </div>
      </div>
    </div>
  );
}
