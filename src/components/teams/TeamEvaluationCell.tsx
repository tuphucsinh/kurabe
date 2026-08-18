'use client';

import { Skeleton } from '@/components/ui/Skeleton';

interface TeamEvaluationCellProps {
  membersCount: number;
  completedCount?: number;
  progress?: number;
  isLoading: boolean;
  isError?: boolean;
}

export default function TeamEvaluationCell({
  membersCount,
  completedCount = 0,
  progress = 0,
  isLoading,
  isError = false,
}: TeamEvaluationCellProps) {
  const waitingCount = Math.max(0, membersCount - completedCount);
  const progressColor = progress === 100 ? 'bg-green-500' : 'bg-primary';

  return (
    <div className="space-y-5" data-load-layer="heavy">
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center p-3 rounded-xl bg-surface">
          <p className="text-[11px] font-bold uppercase tracking-wider text-outline mb-1">Nhân sự</p>
          <p className="text-xl font-black text-on-surface">{membersCount}</p>
        </div>
        <div className="text-center p-3 rounded-xl bg-surface">
          <p className="text-[11px] font-bold uppercase tracking-wider text-outline mb-1">Xong</p>
          {isLoading ? (
            <div className="h-7 flex items-center justify-center">
              <Skeleton variant="text" width={24} height={20} className="rounded" />
            </div>
          ) : isError ? (
            <p className="text-xl font-black text-slate-400">-</p>
          ) : (
            <p className="text-xl font-black text-green-600">{completedCount}</p>
          )}
        </div>
        <div className="text-center p-3 rounded-xl bg-surface">
          <p className="text-[11px] font-bold uppercase tracking-wider text-outline mb-1">Chờ</p>
          {isLoading ? (
            <div className="h-7 flex items-center justify-center">
              <Skeleton variant="text" width={24} height={20} className="rounded" />
            </div>
          ) : isError ? (
            <p className="text-xl font-black text-slate-400">-</p>
          ) : (
            <p className="text-xl font-black text-amber-600">{waitingCount}</p>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-outline uppercase tracking-wider">Tiến độ</span>
          {isLoading ? (
            <Skeleton variant="text" width={32} height={16} className="rounded" />
          ) : isError ? (
            <span className="text-sm font-bold text-slate-400">-</span>
          ) : (
            <span className="text-sm font-black text-primary">{progress}%</span>
          )}
        </div>
        <div className="h-2 w-full bg-surface rounded-full overflow-hidden">
          {isLoading ? (
            <div className="h-full w-1/3 bg-slate-200 rounded-full animate-pulse" />
          ) : isError ? (
            <div className="h-full w-0 bg-slate-200 rounded-full" />
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
