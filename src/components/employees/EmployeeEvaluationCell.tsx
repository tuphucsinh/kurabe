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
        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
        <Skeleton className="h-4 w-20 rounded shrink-0" />
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

  const roundsMap = new Map<number, number>();
  if (gradeRound != null) {
    roundsMap.set(gradeRound, score);
  }
  if (previousRoundScores) {
    for (const roundData of previousRoundScores) {
      roundsMap.set(roundData.round, roundData.score);
    }
  }

  const maxRound = roundsMap.size > 0 ? Math.max(...Array.from(roundsMap.keys())) : 0;
  const roundNumbers = maxRound > 0 ? Array.from({ length: maxRound }, (_, i) => i + 1) : [];

  return (
    <div data-load-layer="heavy" className="flex items-center gap-2">
      <GradeBadge
        grade={grade}
        className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black shrink-0 ${
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
      {roundNumbers.length > 0 && (
        <div className="flex items-center gap-2 tabular-nums text-xs whitespace-nowrap shrink-0">
          {roundNumbers.map((roundNum) => {
            const scoreVal = roundsMap.get(roundNum);
            const hasScore = scoreVal != null;
            const isLatest = roundNum === gradeRound;
            const scoreText = hasScore ? scoreVal : '-';

            return (
              <span
                key={`round-${roundNum}`}
                className={
                  isLatest
                    ? 'font-bold text-slate-800'
                    : 'font-medium text-slate-500 opacity-60'
                }
              >
                L{roundNum}: {scoreText}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default EmployeeEvaluationCell;

