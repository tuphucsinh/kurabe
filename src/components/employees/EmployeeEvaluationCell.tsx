'use client';

import React from 'react';
import GradeBadge from '@/components/ui/GradeBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Check, RefreshCw } from 'lucide-react';
import { Role } from '@/types';
import { getMaxEvaluationRound } from '@/lib/evaluation-workflow';

export function getTargetRoundNumbers(
  role?: Role | string | null,
  maxRoundSeen: number = 0
): number[] {
  let count = 0;
  if (role) {
    const maxRound = getMaxEvaluationRound(role as Role);
    count = Math.max(typeof maxRound === 'number' ? maxRound : 0, maxRoundSeen);
  }

  if (count === 0) {
    count = maxRoundSeen;
  }

  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, i) => count - i);
}

export interface EmployeeEvaluationCellProps {
  grade: string;
  score: number;
  gradeRound: number | null;
  previousRoundScores: Array<{ round: number; score: number }>;
  hasFinalResult: boolean;
  evaluationLoading: boolean;
  evaluationError?: boolean;
  employeeId: string;
  role?: Role | string;
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
  role,
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
          className="text-xs text-brand font-bold hover:underline inline-flex items-center gap-1"
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

  const maxRoundSeen = roundsMap.size > 0 ? Math.max(...Array.from(roundsMap.keys())) : 0;
  const roundNumbers = getTargetRoundNumbers(role, maxRoundSeen);

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
                    ? 'font-bold text-ink'
                    : 'font-medium text-ink-muted opacity-60'
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

