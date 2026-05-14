import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({ className, variant = 'rectangular', width, height }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-slate-200',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'rounded h-4 w-full',
        variant === 'rectangular' && 'rounded-md',
        className
      )}
      style={{ width, height }}
    />
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full space-y-4">
      <div className="flex space-x-4">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-8 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton key={j} className="h-12 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
      <div className="flex items-center space-x-4">
        <Skeleton variant="circular" className="h-12 w-12" />
        <div className="space-y-2 flex-1">
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
        </div>
      </div>
      <Skeleton variant="rectangular" className="h-32 w-full" />
      <div className="flex justify-between items-center pt-2">
        <Skeleton variant="text" width="30%" />
        <Skeleton variant="rectangular" className="h-8 w-20" />
      </div>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
      <div className="flex justify-between items-start">
        <Skeleton variant="circular" className="h-10 w-10" />
        <Skeleton variant="rectangular" className="h-6 w-12" />
      </div>
      <div className="space-y-2">
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="text" width="80%" height={24} />
      </div>
    </div>
  );
}
