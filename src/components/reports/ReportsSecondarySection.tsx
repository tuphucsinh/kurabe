import React from 'react';
import { getReportSecondaryData } from '@/actions/reports';
import type { ReportSecondaryData } from '@/lib/db/reports-source';
import { getPeriodSummary } from '@/actions/ai-summary';
import TeamComparison from '@/components/reports/TeamComparison';
import CriteriaHeatmap from '@/components/reports/CriteriaHeatmap';
import TopPerformers from '@/components/reports/TopPerformers';
import AiSummaryCard from '@/components/reports/AiSummaryCard';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';

export function ReportsSecondarySkeleton() {
  return (
    <>
      {/* Grid 2 Columns: TeamComparison & CriteriaHeatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TeamComparison Skeleton */}
        <div className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm min-h-[300px] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          <div className="space-y-5 flex-1">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-10" />
                </div>
                <Skeleton className="h-2.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>

        {/* CriteriaHeatmap Skeleton */}
        <div className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm min-h-[300px] flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 space-y-2">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-8" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-7 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Grid 2 Columns: TopPerformers & AiSummaryCard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* TopPerformers Skeleton */}
        <div className="bg-white rounded-3xl border border-outline-variant shadow-sm overflow-hidden flex flex-col min-h-[280px]">
          <div className="p-6 border-b border-outline-variant bg-surface/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-xl" />
              <div>
                <Skeleton className="h-5 w-32 mb-1" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="p-4 flex-1">
            <TableSkeleton rows={5} columns={5} />
          </div>
        </div>

        {/* AiSummaryCard Skeleton */}
        <div className="bg-gradient-to-br from-indigo-50/80 to-white p-6 rounded-3xl border border-indigo-100 shadow-sm min-h-[280px] flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-5 w-36 mb-1" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
          <div className="space-y-3 py-4 flex-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        </div>
      </div>
    </>
  );
}

export default async function ReportsSecondarySection({
  secondaryPromise,
  periodId,
  team = 'all',
}: {
  secondaryPromise?: Promise<ReportSecondaryData | null>;
  periodId: string;
  team?: string;
}) {
  const [secondaryData, aiSummary] = await Promise.all([
    secondaryPromise ? secondaryPromise : getReportSecondaryData(periodId, team),
    getPeriodSummary(periodId),
  ]);

  if (!secondaryData) return null;

  return (
    <>
      {/* 4. GRID 2 CỘT: TRÁI = TeamComparison · PHẢI = CriteriaHeatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamComparison teams={secondaryData.teamStats} />
        <CriteriaHeatmap data={secondaryData.criteriaAnalysis} />
      </div>

      {/* 5. GRID 2 CỘT: TRÁI = TopPerformers · PHẢI = AiSummaryCard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopPerformers employees={secondaryData.topPerformers} />
        <AiSummaryCard
          periodId={periodId || ''}
          initialSummary={aiSummary?.summary}
          initialCreatedAt={aiSummary?.created_at}
        />
      </div>
    </>
  );
}
