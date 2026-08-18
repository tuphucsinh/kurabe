'use client';

import dynamic from 'next/dynamic';
import type { Evaluation, CriteriaGroup } from '@/types';

const Radar = dynamic(() => import('@/components/charts/ClientSkillGapRadar'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm h-72 flex items-center justify-center text-sm text-slate-400 animate-pulse">
      Đang tải biểu đồ...
    </div>
  ),
});

export default function LazySkillGapRadar({
  evaluations = [],
  criteriaGroups = [],
}: {
  evaluations?: Evaluation[];
  criteriaGroups?: CriteriaGroup[];
}) {
  return (
    <div data-load-layer="heavy">
      <Radar evaluations={evaluations} criteriaGroups={criteriaGroups} />
    </div>
  );
}
