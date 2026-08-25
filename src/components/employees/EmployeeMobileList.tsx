'use client';

import React from 'react';
import Link from 'next/link';
import { EmployeeTableItem } from '@/lib/employee-table-projection';
import { roleLabel } from '@/lib/role-policy';
import EmployeeEvaluationCell from '@/components/employees/EmployeeEvaluationCell';

interface EmployeeMobileListProps {
  items: EmployeeTableItem[];
  onRetryEvaluation?: (employeeId: string) => void;
}

export default function EmployeeMobileList({ items, onRetryEvaluation }: EmployeeMobileListProps) {
  return (
    <div className="divide-y divide-outline-soft/50">
      {items.map((item) => (
        <div key={item.id} className="p-4 space-y-2.5 hover:bg-surface-muted/50 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <Link
                prefetch={false}
                href={`/evaluations/${item.id}`}
                className="font-bold text-ink hover:text-brand hover:underline text-sm line-clamp-1"
                title="Đánh giá"
              >
                {item.name}
              </Link>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Mã: {item.employeeCode || item.id.slice(0, 8)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                  item.role === 'Manager'
                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                    : item.role === 'Leader'
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : item.role === 'SubLeader'
                    ? 'bg-teal-50 text-teal-700 border border-teal-200'
                    : item.role === 'Worker'
                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                    : 'bg-surface-muted text-ink-muted'
                }`}
              >
                {roleLabel(item.role)}
              </span>
              {item.teamName && (
                <span className="px-2 py-0.5 rounded-md bg-surface-muted text-ink-muted text-[11px] font-medium">
                  {item.teamName}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-outline-soft/60">
            <span className="text-xs text-ink-muted font-medium">Kết quả:</span>
            <EmployeeEvaluationCell
              grade={item.grade}
              score={item.score}
              gradeRound={item.gradeRound}
              previousRoundScores={item.previousRoundScores}
              hasFinalResult={item.hasFinalResult}
              evaluationLoading={item.evaluationLoading}
              evaluationError={item.evaluationError}
              employeeId={item.id}
              role={item.role}
              onRetry={onRetryEvaluation}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
