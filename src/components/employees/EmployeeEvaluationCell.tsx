'use client';

import React from 'react';
import GradeBadge from '@/components/ui/GradeBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Check, RefreshCw } from 'lucide-react';

export interface EmployeeEvaluationCellProps {
  grade: string;
  score: number;
  gradeRound: number | null;
  previousRoundScores: Array<{ round: number; score: number }>;
  hasFinalResult: boolean;
  evaluationLoading: boolean;
  evaluationError?: boolean;
  employeeId: string;
  onRetry?: (employeeId: string) => void;
}

export const EmployeeEvaluationCell = React.memo(function EmployeeEvaluationCell({
  grade,
  score,
  gradeRound,
  previousRoundScores,
  hasFinalResult,
  evaluationLoading,
  evaluationError,
  employeeId,
  onRetry,
}: EmployeeEvaluationCellProps) {
  if (evaluationLoading) {
    return (
      <div data-load-layer="heavy" className="flex items-center gap-2">
        <Skeleton className="w-8 h-8 rounded-lg" />
        <div className="w-12 flex flex-col items-center gap-1">
          <Skeleton className="h-3 w-6 rounded" />
          <Skeleton className="h-4 w-8 rounded" />
        </div>
      </div>
    );
  }

  if (evaluationError) {
    return (
      <div data-load-layer="heavy" className="flex items-center gap-2">
        <span className="text-xs text-rose-500 font-medium">Lỗi tải</span>
        <button
          type="button"
          onClick={() => onRetry?.(employeeId)}
          className="text-xs text-primary font-bold hover:underline inline-flex items-center gap-1"
          title="Thử tải lại đánh giá"
        >
          <RefreshCw size={12} />
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div data-load-layer="heavy" className="flex items-center gap-2">
      <GradeBadge
        grade={grade}
        className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black ${
          hasFinalResult ? 'ring-2 ring-emerald-500' : ''
        }`}
      />
      {hasFinalResult && (
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0"
          title="Đã có kết quả cuối"
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      <div className="flex items-end gap-2 tabular-nums">
        {gradeRound != null && (
          <div className="w-12 flex flex-col items-center leading-none">
            <span className="text-xs text-slate-700 font-bold">L{gradeRound}</span>
            <span className="text-base text-slate-800 font-bold mt-1">{score}</span>
          </div>
        )}
        {previousRoundScores.map((roundData) => (
          <div key={roundData.round} className="w-12 flex flex-col items-center leading-none opacity-55">
            <span className="text-xs text-slate-500 font-medium">L{roundData.round}</span>
            <span className="text-sm text-slate-500 font-medium mt-1">{roundData.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
});

export default EmployeeEvaluationCell;
