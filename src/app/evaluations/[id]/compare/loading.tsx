import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';

export default function CompareLoading() {
  return (
    <div className="px-4 md:px-8 lg:px-10 py-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Skeleton className="h-10 w-24 rounded-xl" />
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>

      <div className="bg-surface-raised p-6 rounded-2xl border border-outline-soft shadow-sm mb-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-full shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>

      <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm overflow-hidden">
        <div className="p-6">
          <TableSkeleton rows={10} columns={4} />
        </div>
      </div>
    </div>
  );
}
