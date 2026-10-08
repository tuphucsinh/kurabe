'use client';

import dynamic from 'next/dynamic';
import type { SkillGapRadarDatum } from '@/types';

const Radar = dynamic(
  () => import('@/components/charts/SkillGapRadar').then((mod) => mod.SkillGapRadar),
  {
    ssr: false,
    loading: () => (
      <div className="bg-surface-raised rounded-2xl border border-outline-soft shadow-sm h-72 flex items-center justify-center text-sm text-ink-muted animate-pulse">
        Đang tải biểu đồ...
      </div>
    ),
  }
);

export default function LazySkillGapRadar({
  data = [],
}: {
  data?: SkillGapRadarDatum[];
}) {
  return (
    <div data-load-layer="heavy">
      <Radar data={data} />
    </div>
  );
}
