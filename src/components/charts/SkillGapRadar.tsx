import React from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import type { SkillGapRadarDatum } from '@/types';

export interface RadarSetItem {
  key: string;
  setKey: string | null;
  versionId: string;
  label: string;
  data: SkillGapRadarDatum[];
  sampleCount: number;
}

export interface SkillGapRadarProps {
  data?: SkillGapRadarDatum[];
  radarSets?: RadarSetItem[];
}

function RadarChartContent({ data }: { data: SkillGapRadarDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data}>
        <PolarGrid stroke="#D9E1E6" />
        <PolarAngleAxis dataKey="subject" tick={{ fill: '#5F6B73', fontSize: 11, fontWeight: 500 }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#AEB8BF', fontSize: 10 }} />
        <Radar name="Tự đánh giá" dataKey="Self" stroke="#AEB8BF" fill="#EEF3F6" fillOpacity={0.5} />
        <Radar name="Quản lý" dataKey="Manager" stroke="#6366f1" fill="#818cf8" fillOpacity={0.6} />
        <Tooltip
          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
          itemStyle={{ fontSize: '13px', fontWeight: 500 }}
        />
        <Legend wrapperStyle={{ paddingTop: '20px' }} iconType="circle" />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/**
 * Skill-gap radar. The self/manager percentages are computed server-side from
 * the immutable pinned criteria snapshot (see getDashboardHeavyData) so the
 * client never receives raw round scores.
 * When multiple sets exist, renders one radar per set with its label.
 */
export function SkillGapRadar({ data = [], radarSets }: SkillGapRadarProps) {
  const isMultiSet = radarSets && radarSets.length > 1;

  if (isMultiSet) {
    const validSets = radarSets.filter(
      (s) => s.data.length > 0 && !s.data.every((d) => d.Self === 0 && d.Manager === 0)
    );
    if (validSets.length === 0) {
      return (
        <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col items-center justify-center h-full min-h-[300px]">
          <h3 className="text-lg font-semibold text-ink mb-2 self-start w-full">Skill Gap Analysis</h3>
          <p className="text-ink-muted mt-10">Chưa đủ dữ liệu đánh giá 2 chiều.</p>
        </div>
      );
    }
    return (
      <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col h-full space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-ink mb-2">Skill Gap Analysis</h3>
          <p className="text-sm text-ink-muted">Khoảng cách kỹ năng: Tự đánh giá vs Quản lý (%) theo bộ tiêu chí</p>
        </div>
        <div className="space-y-6">
          {validSets.map((set) => (
            <div key={set.key} className="space-y-2 pt-2 border-t border-outline-soft/60 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-0.5 rounded-full bg-brand-soft text-brand text-xs font-semibold">
                  {set.label}
                </span>
                {set.sampleCount > 0 && (
                  <span className="text-xs text-ink-muted">{set.sampleCount} đánh giá</span>
                )}
              </div>
              <div className="w-full h-[280px]">
                <RadarChartContent data={set.data} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0 || data.every((d) => d.Self === 0 && d.Manager === 0)) {
    return (
      <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col items-center justify-center h-full min-h-[300px]">
        <h3 className="text-lg font-semibold text-ink mb-2 self-start w-full">Skill Gap Analysis</h3>
        <p className="text-ink-muted mt-10">Chưa đủ dữ liệu đánh giá 2 chiều.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft flex flex-col h-full">
      <h3 className="text-lg font-semibold text-ink mb-2">Skill Gap Analysis</h3>
      <p className="text-sm text-ink-muted mb-6">Khoảng cách kỹ năng: Tự đánh giá vs Quản lý (%)</p>
      <div className="flex-1 w-full min-h-[300px]">
        <RadarChartContent data={data} />
      </div>
    </div>
  );
}
