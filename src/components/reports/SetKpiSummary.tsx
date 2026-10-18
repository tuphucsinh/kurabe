'use client';

import React from 'react';
import { Users, Target, Trophy, Medal, AlertCircle, Award } from 'lucide-react';
import type { ReportSetKpiBucket, ReportExcludedKpiInfo } from '@/actions/reports';
import type { DashboardSetKpiSummaryItem } from '@/actions/dashboard';
import type { SetKpiBucket } from '@/lib/evaluation-result-projection';

export interface SetKpiSummaryProps {
  bucket?: ReportSetKpiBucket | DashboardSetKpiSummaryItem | SetKpiBucket;
  buckets?: (ReportSetKpiBucket | DashboardSetKpiSummaryItem | SetKpiBucket)[];
  excludedInfo?: ReportExcludedKpiInfo | {
    unavailableCount?: number;
    legacyCount?: number;
    otherPeriodCount?: number;
    totalExcluded?: number;
    notice?: string | null;
  } | null;
  compact?: boolean;
}

export interface UnifiedPerformer {
  id: string;
  name: string;
  teamName: string;
  score: number;
  grade: string;
}

export interface UnifiedTeamStat {
  id: string;
  name: string;
  avgScore: number;
  sampleCount: number;
  progress: number;
}

const SET_BADGE_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  leader: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  staff: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  worker: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

function normalizeTop(b: ReportSetKpiBucket | DashboardSetKpiSummaryItem | SetKpiBucket): UnifiedPerformer[] {
  if ('topPerformers' in b && Array.isArray(b.topPerformers)) {
    return b.topPerformers.map((p) => ({
      id: p.id,
      name: p.name,
      teamName: p.teamName,
      score: p.score,
      grade: p.grade,
    }));
  }
  if ('top' in b && Array.isArray(b.top)) {
    return (b.top as unknown[]).map((raw) => {
      const p = raw as Record<string, unknown>;
      const name = typeof p.name === 'string' ? p.name : (typeof p.employeeId === 'string' ? p.employeeId : 'Unknown');
      const teamName = typeof p.teamName === 'string' ? p.teamName : (typeof p.teamId === 'string' ? p.teamId : '—');
      const score = typeof p.score === 'number' ? p.score : 0;
      const grade = typeof p.grade === 'string' ? p.grade : '-';
      const id = typeof p.id === 'string' ? p.id : (typeof p.employeeId === 'string' ? p.employeeId : '');
      return { id, name, teamName, score, grade };
    });
  }
  return [];
}

function normalizeTeams(b: ReportSetKpiBucket | DashboardSetKpiSummaryItem | SetKpiBucket): UnifiedTeamStat[] {
  if ('teamStats' in b && Array.isArray(b.teamStats)) {
    return b.teamStats.map((t) => ({
      id: t.id,
      name: t.name,
      avgScore: t.avgScore,
      sampleCount: t.sampleCount,
      progress: t.progress,
    }));
  }
  if ('teams' in b && Array.isArray(b.teams)) {
    const rawList = b.teams as Record<string, unknown>[];
    const maxScore = rawList.reduce((max, t) => {
      const s = typeof t.avgScore === 'number' ? t.avgScore : (typeof t.average === 'number' ? t.average : 0);
      return Math.max(max, s);
    }, 0);
    return rawList.map((t) => {
      const avg = typeof t.avgScore === 'number' ? t.avgScore : (typeof t.average === 'number' ? t.average : 0);
      const id = typeof t.id === 'string' ? t.id : (typeof t.teamId === 'string' ? t.teamId : '');
      const name = typeof t.name === 'string' ? t.name : id;
      const sampleCount = typeof t.sampleCount === 'number' ? t.sampleCount : 0;
      const progress = maxScore > 0 ? (avg / maxScore) * 100 : 0;
      return { id, name, avgScore: avg, sampleCount, progress };
    });
  }
  return [];
}

export default function SetKpiSummary({
  bucket,
  buckets,
  excludedInfo,
  compact = false,
}: SetKpiSummaryProps) {
  const allBuckets = buckets ?? (bucket ? [bucket] : []);

  return (
    <div className="space-y-4" data-testid="set-kpi-summary-container">
      {/* Excluded notice if any unresolvable/unavailable/other-period evaluations were excluded */}
      {excludedInfo && (excludedInfo.totalExcluded ?? 0) > 0 && (
        <div
          data-testid="set-kpi-excluded-notice"
          className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-900 text-xs sm:text-sm"
        >
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Lưu ý về phạm vi tính điểm: </span>
            {excludedInfo.notice ||
              `Có ${excludedInfo.totalExcluded} đánh giá không thuộc bộ tiêu chuẩn hoặc phiên bản hợp lệ (${excludedInfo.unavailableCount ?? 0} không khả dụng, ${excludedInfo.otherPeriodCount ?? 0} khác kỳ) đã được tách riêng khỏi chỉ số chính thức.`}
          </div>
        </div>
      )}

      {allBuckets.length === 0 ? (
        <div
          data-testid="set-kpi-empty-state"
          className="p-6 rounded-2xl bg-surface-raised border border-outline-soft/60 text-center text-ink-muted text-sm"
        >
          Chưa có dữ liệu đánh giá hợp lệ theo bộ tiêu chuẩn.
        </div>
      ) : compact ? (
        /* Compact rendering for DashboardHeavySection */
        <div
          data-testid="set-kpi-compact-grid"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5"
        >
          {allBuckets.map((b) => {
            const badgeStyle = SET_BADGE_STYLES[b.setKey] || {
              bg: 'bg-slate-50',
              text: 'text-slate-700',
              border: 'border-slate-200',
            };
            return (
              <div
                key={b.key}
                data-testid={`set-kpi-card-${b.key}`}
                className="bg-surface-raised p-4 rounded-2xl border border-outline-soft/60 shadow-xs flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                  >
                    {b.label}
                  </span>
                  <span className="text-xs text-ink-muted flex items-center gap-1 font-medium">
                    <Users className="w-3.5 h-3.5" />
                    <span>{b.sampleCount} NV</span>
                  </span>
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-xs text-ink-muted font-medium">Điểm trung bình</span>
                  <span
                    data-testid={`set-kpi-avg-${b.key}`}
                    className="text-lg sm:text-xl font-bold text-ink"
                  >
                    {b.average.toFixed(1)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed per-set KPI blocks for ReportsDataLayer */
        <div data-testid="set-kpi-detailed-list" className="space-y-6">
          {allBuckets.map((b) => {
            const badgeStyle = SET_BADGE_STYLES[b.setKey] || {
              bg: 'bg-slate-50',
              text: 'text-slate-700',
              border: 'border-slate-200',
            };
            const topList = normalizeTop(b);
            const teamsList = normalizeTeams(b);

            return (
              <div
                key={b.key}
                data-testid={`set-kpi-block-${b.key}`}
                className="bg-surface-raised p-5 sm:p-6 rounded-3xl border border-outline-soft/70 shadow-sm space-y-5"
              >
                {/* Bucket Header Banner */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-outline-soft/40">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-xl text-sm font-bold border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                    >
                      {b.label}
                    </span>
                    <div className="flex items-center gap-1.5 text-xs sm:text-sm text-ink-muted">
                      <Users className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-ink">{b.sampleCount}</span>
                      <span>nhân sự đã chốt</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-surface-muted/60 px-3.5 py-1.5 rounded-2xl border border-outline-soft/40">
                    <Target className="w-4 h-4 text-brand" />
                    <span className="text-xs text-ink-muted font-medium">Điểm TB bộ tiêu chuẩn:</span>
                    <span
                      data-testid={`set-kpi-avg-${b.key}`}
                      className="text-base sm:text-lg font-bold text-ink"
                    >
                      {b.average.toFixed(1)}
                    </span>
                  </div>
                </div>

                {/* Grid: Top 5 Performers & Team Comparison */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Column 1: Top 5 Performers */}
                  <div className="bg-surface-muted/30 p-4 sm:p-5 rounded-2xl border border-outline-soft/40 flex flex-col">
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-4 h-4 text-amber-500" />
                        <h4 className="text-sm font-bold text-ink">Top 5 Xuất sắc</h4>
                      </div>
                      <span className="text-xs text-ink-muted">Tối đa 5 nhân sự</span>
                    </div>

                    {topList.length === 0 ? (
                      <div className="py-6 text-center text-xs text-ink-muted italic">
                        Chưa có nhân sự đạt kết quả hợp lệ trong bộ tiêu chuẩn này.
                      </div>
                    ) : (
                      <div className="space-y-2 flex-1">
                        {topList.map((performer, idx) => {
                          const rank = idx + 1;
                          return (
                            <div
                              key={performer.id || idx}
                              className="flex items-center justify-between p-2 rounded-xl bg-surface-raised border border-outline-soft/40 hover:border-outline-soft transition-colors"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="w-5 flex justify-center text-xs font-bold shrink-0">
                                  {rank === 1 ? (
                                    <Trophy className="w-4 h-4 text-amber-500" />
                                  ) : rank === 2 ? (
                                    <Medal className="w-4 h-4 text-slate-400" />
                                  ) : rank === 3 ? (
                                    <Award className="w-4 h-4 text-amber-700" />
                                  ) : (
                                    <span className="text-ink-muted">{rank}</span>
                                  )}
                                </span>
                                <div className="truncate">
                                  <div className="text-xs sm:text-sm font-semibold text-ink truncate">
                                    {performer.name}
                                  </div>
                                  <div className="text-[11px] text-ink-muted truncate">
                                    {performer.teamName}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-xs font-bold text-brand">
                                  {performer.score.toFixed(1)}
                                </span>
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-muted text-ink">
                                  {performer.grade}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Column 2: Team Averages (Raw Point Display, Within-Bucket Progress) */}
                  <div className="bg-surface-muted/30 p-4 sm:p-5 rounded-2xl border border-outline-soft/40 flex flex-col">
                    <div className="flex items-center justify-between mb-3.5">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <h4 className="text-sm font-bold text-ink">Điểm trung bình theo nhóm</h4>
                      </div>
                      <span className="text-[11px] font-medium text-ink-muted bg-surface-raised px-2 py-0.5 rounded-full border border-outline-soft/40">
                        Thang điểm riêng
                      </span>
                    </div>

                    {teamsList.length === 0 ? (
                      <div className="py-6 text-center text-xs text-ink-muted italic">
                        Chưa có dữ liệu nhóm trong bộ tiêu chuẩn này.
                      </div>
                    ) : (
                      <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                        {teamsList.map((team, idx) => (
                          <div key={team.id || idx} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-outline-soft w-3.5">
                                  {idx + 1}.
                                </span>
                                <span className="font-semibold text-ink truncate">
                                  {team.name}
                                </span>
                                <span className="text-[10px] text-ink-muted">
                                  ({team.sampleCount} NV)
                                </span>
                              </div>
                              <span className="font-bold text-ink shrink-0 ml-2">
                                {team.avgScore.toFixed(1)}
                              </span>
                            </div>
                            <div className="relative h-2 bg-surface-raised rounded-full overflow-hidden border border-outline-soft/40">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-brand/70 to-brand transition-all duration-700"
                                style={{ width: `${Math.min(100, Math.max(0, team.progress))}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
