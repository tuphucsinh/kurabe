import { Skeleton, CardSkeleton } from '@/components/ui/Skeleton';

export default function CriteriaLoading() {
  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="flex space-x-2 border-b border-slate-200 pb-px mb-8">
        <Skeleton className="h-10 w-32 rounded-t-lg" />
        <Skeleton className="h-10 w-32 rounded-t-lg" />
        <Skeleton className="h-10 w-32 rounded-t-lg" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
