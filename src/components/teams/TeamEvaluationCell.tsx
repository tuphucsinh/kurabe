'use client';

import { Skeleton } from '@/components/ui/Skeleton';

interface TeamEvaluationCellProps {
  membersCount?: number;
  completedCount?: number;
  progress?: number;
  isLoading?: boolean;
  isError?: boolean;
  skeleton?: boolean;
}

export default function TeamEvaluationCell({
  membersCount = 0,
  completedCount = 0,
  progress = 0,
  isLoading = false,
  isError = false,
  skeleton = false,
}: TeamEvaluationCellProps) {
  const waitingCount = Math.max(0, membersCount - completedCount);
  const progressColor = progress === 100 ? 'bg-green-500' : 'bg-brand';

  if (skeleton) {
    return (
      <div className="space-y-3 md:space-y-3" data-load-layer="heavy">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 md:gap-2">
          <div className="text-center p-2 md:p-2 rounded-xl bg-surface-muted">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-0.5 md:mb-0.5 whitespace-nowrap">Nhân sự</p>
            <div className="h-6 md:h-6 flex items-center justify-center">
              <Skeleton variant="text" width={24} height={20} className="rounded" />
            </div>
          </div>
          <div className="text-center p-2 md:p-2 rounded-xl bg-surface-muted">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-0.5 md:mb-0.5 whitespace-nowrap">Xong</p>
            <div className="h-6 md:h-6 flex items-center justify-center">
              <Skeleton variant="text" width={24} height={20} className="rounded" />
            </div>
          </div>
          <div className="text-center p-2 md:p-2 rounded-xl bg-surface-muted">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-0.5 md:mb-0.5 whitespace-nowrap">Chờ</p>
            <div className="h-6 md:h-6 flex items-center justify-center">
              <Skeleton variant="text" width={24} height={20} className="rounded" />
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1 md:space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[11px] md:text-xs font-bold text-ink-muted uppercase tracking-wider">Tiến độ</span>
            <Skeleton variant="text" width={32} height={16} className="rounded" />
          </div>
          <div className="h-1.5 md:h-2 w-full bg-surface-muted rounded-full overflow-hidden" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-3" data-load-layer="heavy">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2 md:gap-2">
        <div className="text-center p-2 md:p-2 rounded-xl bg-surface-muted">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-0.5 md:mb-0.5 whitespace-nowrap">Nhân sự</p>
          <p className="text-lg md:text-lg font-black text-ink">{membersCount}</p>
        </div>
        <div className="text-center p-2 md:p-2 rounded-xl bg-surface-muted">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-0.5 md:mb-0.5 whitespace-nowrap">Xong</p>
          {isLoading ? (
            <div className="h-6 md:h-6 flex items-center justify-center">
              <Skeleton variant="text" width={24} height={20} className="rounded" />
            </div>
          ) : isError ? (
            <p className="text-lg md:text-lg font-black text-ink-muted">-</p>
          ) : (
            <p className="text-lg md:text-lg font-black text-green-600">{completedCount}</p>
          )}
        </div>
        <div className="text-center p-2 md:p-2 rounded-xl bg-surface-muted">
          <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted mb-0.5 md:mb-0.5 whitespace-nowrap">Chờ</p>
          {isLoading ? (
            <div className="h-6 md:h-6 flex items-center justify-center">
              <Skeleton variant="text" width={24} height={20} className="rounded" />
            </div>
          ) : isError ? (
            <p className="text-lg md:text-lg font-black text-ink-muted">-</p>
          ) : (
            <p className="text-lg md:text-lg font-black text-amber-600">{waitingCount}</p>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1 md:space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[11px] md:text-xs font-bold text-ink-muted uppercase tracking-wider">Tiến độ</span>
          {isLoading ? (
            <Skeleton variant="text" width={32} height={16} className="rounded" />
          ) : isError ? (
            <span className="text-xs md:text-sm font-bold text-ink-muted">-</span>
          ) : (
            <span className="text-xs md:text-sm font-black text-brand">{progress}%</span>
          )}
        </div>
        <div className="h-1.5 md:h-2 w-full bg-surface-muted rounded-full overflow-hidden">
          {isLoading ? (
            <div className="h-full w-1/3 bg-outline-soft rounded-full animate-pulse" />
          ) : isError ? (
            <div className="h-full w-0 bg-outline-soft rounded-full" />
          ) : (
            <div
              className={`h-full ${progressColor} rounded-full transition-all duration-1000 ease-out`}
              style={{ width: `${progress}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
