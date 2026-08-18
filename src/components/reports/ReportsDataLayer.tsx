'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Target, TrendingUp, Clock, AlertTriangle, RotateCcw } from 'lucide-react';
import { User } from '@/types';
import { getReportAggregation, ReportAggregationData } from '@/actions/reports';
import PageHeader from '@/components/layout/PageHeader';
import ReportFilters from '@/components/reports/ReportFilters';
import ExportReportButton from '@/components/reports/ExportReportButton';
import BatchResultMessageModal from '@/components/reports/BatchResultMessageModal';
import PeriodMinutesModal from '@/components/reports/PeriodMinutesModal';
import AiSummaryCard from '@/components/reports/AiSummaryCard';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import TeamComparison from '@/components/reports/TeamComparison';
import CriteriaHeatmap from '@/components/reports/CriteriaHeatmap';
import TopPerformers from '@/components/reports/TopPerformers';

export interface ReportsDataLayerProps {
  viewer: User;
  periodId: string;
  periodYear?: number;
  selectedTeam: string;
  teams: { id: string; name: string }[];
}

export default function ReportsDataLayer({
  viewer,
  periodId,
  periodYear,
  selectedTeam,
  teams,
}: ReportsDataLayerProps) {
  const [reportData, setReportData] = useState<ReportAggregationData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeReqRef = useRef(0);

  const fetchReportData = useCallback(() => {
    const currentReq = ++activeReqRef.current;

    void Promise.resolve().then(async () => {
      if (activeReqRef.current !== currentReq) return;

      if (!periodId) {
        setReportData(null);
        setIsLoading(false);
        setIsError(false);
        setErrorMessage(null);
        return;
      }

      setIsLoading(true);
      setIsError(false);
      setErrorMessage(null);

      try {
        const result = await getReportAggregation(periodId, selectedTeam);
        if (activeReqRef.current === currentReq) {
          setReportData(result);
        }
      } catch (err) {
        console.error('getReportAggregation error:', err);
        if (activeReqRef.current === currentReq) {
          setIsError(true);
          setErrorMessage('Không thể tải dữ liệu báo cáo. Vui lòng thử lại.');
        }
      } finally {
        if (activeReqRef.current === currentReq) {
          setIsLoading(false);
        }
      }
    });
  }, [periodId, selectedTeam]);

  useEffect(() => {
    const reqRef = activeReqRef;
    fetchReportData();

    return () => {
      reqRef.current += 1;
    };
  }, [fetchReportData]);

  return (
    <>
      {/* 1. HEADER (Shell Frame + Light KPI Pill + Modals/Actions) */}
      <PageHeader
        title="Báo cáo QAQC"
        description="Tổng hợp kết quả đánh giá năng lực và chất lượng QAQC"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* KPI COMPACT pill — Light Data Layer */}
          <div
            data-load-layer="light"
            className="bg-white px-4 py-2 rounded-2xl border border-outline-variant/60 shadow-sm flex flex-wrap items-center gap-3 sm:gap-4 min-h-[44px]"
          >
            {isLoading ? (
              <div className="flex items-center gap-3 py-1">
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-600 shrink-0 opacity-40" />
                  <div className="h-4 w-8 bg-slate-200 animate-pulse rounded" />
                  <span className="text-xs text-outline font-medium">nhân sự</span>
                </div>
                <span className="text-outline-variant/60 hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-primary shrink-0 opacity-40" />
                  <div className="h-4 w-8 bg-slate-200 animate-pulse rounded" />
                  <span className="text-xs text-outline font-medium">điểm TB</span>
                </div>
                <span className="text-outline-variant/60 hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-green-600 shrink-0 opacity-40" />
                  <div className="h-4 w-10 bg-slate-200 animate-pulse rounded" />
                  <span className="text-xs text-outline font-medium">≥ AB</span>
                </div>
                <span className="text-outline-variant/60 hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-orange-600 shrink-0 opacity-40" />
                  <div className="h-4 w-8 bg-slate-200 animate-pulse rounded" />
                  <span className="text-xs text-outline font-medium">chưa đánh giá</span>
                </div>
              </div>
            ) : reportData?.stats ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-600 shrink-0" />
                  <span className="font-bold text-lg text-on-surface leading-none">{reportData.stats.totalEmployees}</span>
                  <span className="text-xs text-outline font-medium">nhân sự</span>
                </div>
                <span className="text-outline-variant/60 hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-bold text-lg text-on-surface leading-none">{reportData.stats.avgScore.toFixed(1)}</span>
                  <span className="text-xs text-outline font-medium">điểm TB</span>
                </div>
                <span className="text-outline-variant/60 hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="font-bold text-lg text-on-surface leading-none">{reportData.stats.highGradeRate.toFixed(1)}%</span>
                  <span className="text-xs text-outline font-medium">≥ AB</span>
                </div>
                <span className="text-outline-variant/60 hidden sm:inline">•</span>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-orange-600 shrink-0" />
                  <span className="font-bold text-lg text-on-surface leading-none">{reportData.stats.pendingCount}</span>
                  <span className="text-xs text-outline font-medium">chưa đánh giá</span>
                </div>
              </>
            ) : isError ? (
              <div className="flex items-center gap-1.5 text-xs text-rose-600 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Không tải được số liệu</span>
              </div>
            ) : (
              <span className="text-xs text-outline font-medium">Chưa có số liệu</span>
            )}
          </div>

          {viewer?.role === 'Manager' && (
            <>
              <PeriodMinutesModal periodId={periodId || ''} />
              <BatchResultMessageModal periodId={periodId || ''} />
            </>
          )}
          <ExportReportButton periodId={periodId || ''} />
        </div>
      </PageHeader>

      {/* 2. ReportFilters (Light Data Layer) */}
      <ReportFilters teams={teams} periodYear={periodYear} />

      {/* 3. HEAVY DATA SECTIONS */}
      {isLoading ? (
        <div className="space-y-6">
          {/* Skeleton GradeDistribution */}
          <div data-load-layer="heavy" className="bg-white px-5 py-4 rounded-2xl shadow-sm border border-outline-variant/60 animate-pulse space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 bg-slate-200 rounded" />
              <div className="h-3 w-20 bg-slate-100 rounded" />
            </div>
            <div className="space-y-2.5 pt-1">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-10 h-3 bg-slate-200 rounded" />
                  <div className="flex-1 h-2.5 bg-slate-100 rounded-full" />
                  <div className="w-8 h-3 bg-slate-100 rounded" />
                  <div className="w-10 h-3 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Skeleton Grid: TeamComparison + CriteriaHeatmap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div data-load-layer="heavy" className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm animate-pulse space-y-4 min-h-[300px]">
              <div className="h-5 w-32 bg-slate-200 rounded" />
              <div className="space-y-4 pt-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex justify-between">
                      <div className="h-4 w-28 bg-slate-200 rounded" />
                      <div className="h-4 w-12 bg-slate-200 rounded" />
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
            <div data-load-layer="heavy" className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm animate-pulse space-y-4 min-h-[300px]">
              <div className="h-5 w-48 bg-slate-200 rounded" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-24 bg-slate-100 rounded-2xl" />
                ))}
              </div>
            </div>
          </div>

          {/* Skeleton Grid: TopPerformers + AiSummaryCard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div data-load-layer="heavy" className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm animate-pulse space-y-4 min-h-[260px]">
              <div className="h-5 w-36 bg-slate-200 rounded" />
              <div className="space-y-3 pt-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-xl" />
                ))}
              </div>
            </div>
            <div data-load-layer="heavy" className="bg-white p-6 rounded-3xl border border-outline-variant shadow-sm animate-pulse space-y-4 min-h-[260px]">
              <div className="h-5 w-40 bg-slate-200 rounded" />
              <div className="space-y-3 pt-2">
                <div className="h-4 w-3/4 bg-slate-100 rounded" />
                <div className="h-4 w-full bg-slate-100 rounded" />
                <div className="h-4 w-2/3 bg-slate-100 rounded" />
              </div>
            </div>
          </div>
        </div>
      ) : isError ? (
        <div
          data-load-layer="heavy"
          className="bg-white p-8 rounded-3xl border border-rose-200 shadow-sm flex flex-col items-center justify-center gap-4 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-rose-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-on-surface">Không thể tải dữ liệu báo cáo</h4>
            <p className="text-sm text-outline mt-1">{errorMessage || 'Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại.'}</p>
          </div>
          <button
            onClick={fetchReportData}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:opacity-90 active:scale-95 transition-all shadow-xs"
          >
            <RotateCcw className="w-4 h-4" />
            Thử lại
          </button>
        </div>
      ) : !reportData || reportData.stats.totalEmployees === 0 ? (
        <div
          data-load-layer="heavy"
          className="bg-white p-12 rounded-3xl border border-outline-variant shadow-sm flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-surface-container flex items-center justify-center text-outline">
            <Users className="w-6 h-6" />
          </div>
          <h4 className="text-base font-bold text-on-surface">Không có dữ liệu báo cáo</h4>
          <p className="text-sm text-outline max-w-md">
            Chưa có dữ liệu đánh giá nào cho kỳ này hoặc bộ lọc nhóm được chọn.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Grade Distribution */}
          <div data-load-layer="heavy">
            <GradeDistribution data={reportData.gradeDistribution} />
          </div>

          {/* Grid: TeamComparison & CriteriaHeatmap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TeamComparison teams={reportData.teamStats} />
            <CriteriaHeatmap data={reportData.criteriaAnalysis} />
          </div>

          {/* Grid: TopPerformers & AiSummaryCard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopPerformers employees={reportData.topPerformers} />
            <AiSummaryCard periodId={periodId || ''} />
          </div>
        </div>
      )}
    </>
  );
}
