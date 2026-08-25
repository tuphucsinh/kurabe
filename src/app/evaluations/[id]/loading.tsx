import { Skeleton } from '@/components/ui/Skeleton';

export default function EvaluationLoading() {
  return (
    <div className="px-4 md:px-8 lg:px-10 py-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <Skeleton className="h-10 w-24 rounded-xl" />
        <Skeleton className="h-10 w-48 rounded-xl" />
      </div>

      <div className="bg-surface-raised p-6 rounded-2xl border border-outline shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <Skeleton className="h-16 w-16 rounded-full shrink-0" />
          <div className="space-y-3 flex-1 w-full">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="w-full md:w-1/3 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>

      <div className="bg-surface-raised p-6 rounded-2xl border border-outline shadow-sm">
        <div className="space-y-6">
          <Skeleton className="h-8 w-48 mb-6" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-6 w-1/3" />
              <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
