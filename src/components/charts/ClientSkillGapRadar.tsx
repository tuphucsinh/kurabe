'use client';

import dynamic from 'next/dynamic';
import { Evaluation, CriteriaGroup } from '@/types';

const SkillGapRadarComponent = dynamic(
  () => import('./SkillGapRadar').then(mod => mod.SkillGapRadar),
  {
    ssr: false,
    loading: () => <div className="animate-pulse h-64 bg-slate-100 rounded-2xl w-full" />
  }
);

export default function ClientSkillGapRadar(props: { evaluations: Evaluation[]; criteriaGroups: CriteriaGroup[] }) {
  return <SkillGapRadarComponent {...props} />;
}
