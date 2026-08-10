import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';

export default function EmployeesLoading() {
  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-50/50">
          <Skeleton className="h-10 w-full md:w-64 rounded-xl" />
          <div className="flex gap-2 w-full md:w-auto">
            <Skeleton className="h-10 w-32 rounded-xl" />
            <Skeleton className="h-10 w-24 rounded-xl" />
          </div>
        </div>
        <div className="p-6">
          <TableSkeleton rows={8} columns={5} />
        </div>
      </div>
    </div>
  );
}
