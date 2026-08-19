'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import type { ComponentProps } from 'react';
import CriteriaHeatmap from '@/components/reports/CriteriaHeatmap';

const CriteriaHeatmapComponent = dynamic(
  () => import('@/components/reports/CriteriaHeatmap'),
  {
    ssr: false,
    loading: () => <div className="animate-pulse h-64 bg-slate-100 rounded-3xl w-full" />,
  }
);

export default function ClientCriteriaHeatmap(props: ComponentProps<typeof CriteriaHeatmap>) {
  return <CriteriaHeatmapComponent {...props} />;
}

export { ClientCriteriaHeatmap };
