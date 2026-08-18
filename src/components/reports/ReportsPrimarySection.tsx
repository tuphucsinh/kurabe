import React from 'react';
import PageHeader from '@/components/layout/PageHeader';
import { Users, Target, TrendingUp, Clock } from 'lucide-react';
import ReportFilters from '@/components/reports/ReportFilters';
import ExportReportButton from '@/components/reports/ExportReportButton';
import PeriodMinutesModal from '@/components/reports/PeriodMinutesModal';
import BatchResultMessageModal from '@/components/reports/BatchResultMessageModal';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import type { Team } from '@/types';
import type { ReportPrimaryData } from '@/lib/db/reports-source';

interface ReportsPrimarySectionProps {
  periodId: string;
  viewerRole?: string;
  teams: Team[];
  primaryData: ReportPrimaryData;
}

export default function ReportsPrimarySection({
  periodId,
  viewerRole,
  teams,
  primaryData,
}: ReportsPrimarySectionProps) {
  return (
    <>
      {/* 1. HEADER: Flex justify-between với Tiêu đề bên trái & KPI Compact Pill + Export Button bên phải */}
      <PageHeader
        title="Báo cáo QAQC"
        description="Tổng hợp kết quả đánh giá năng lực và chất lượng QAQC"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* KPI COMPACT pill trắng chia 4 */}
          <div className="bg-white px-4 py-2 rounded-2xl border border-outline-variant/60 shadow-sm flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-bold text-lg text-on-surface leading-none">
                {primaryData.stats.totalEmployees}
              </span>
              <span className="text-xs text-outline font-medium">nhân sự</span>
            </div>
            <span className="text-outline-variant/60 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <Target className="w-4 h-4 text-primary shrink-0" />
              <span className="font-bold text-lg text-on-surface leading-none">
                {primaryData.stats.avgScore.toFixed(1)}
              </span>
              <span className="text-xs text-outline font-medium">điểm TB</span>
            </div>
            <span className="text-outline-variant/60 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
              <span className="font-bold text-lg text-on-surface leading-none">
                {primaryData.stats.highGradeRate.toFixed(1)}%
              </span>
              <span className="text-xs text-outline font-medium">≥ AB</span>
            </div>
            <span className="text-outline-variant/60 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-orange-600 shrink-0" />
              <span className="font-bold text-lg text-on-surface leading-none">
                {primaryData.stats.pendingCount}
              </span>
              <span className="text-xs text-outline font-medium">chưa đánh giá</span>
            </div>
          </div>

          {viewerRole === 'Manager' && (
            <>
              <PeriodMinutesModal periodId={periodId || ''} />
              <BatchResultMessageModal periodId={periodId || ''} />
            </>
          )}
          <ExportReportButton periodId={periodId || ''} />
        </div>
      </PageHeader>

      {/* 2. ReportFilters (giữ nguyên trên cùng dưới header) */}
      <ReportFilters teams={teams} />

      {/* 3. GradeDistribution (đưa LÊN ĐẦU nội dung, render full width, nén gọn) */}
      <GradeDistribution data={primaryData.gradeDistribution} />
    </>
  );
}
