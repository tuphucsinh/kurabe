'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import type { ComponentProps } from 'react';
import { GradeDistribution } from './GradeDistribution';

const GradeDistributionComponent = dynamic(
  () => import('./GradeDistribution').then((mod) => mod.GradeDistribution),
  {
    ssr: false,
    loading: () => <div className="animate-pulse h-48 bg-slate-100 rounded-2xl w-full" />,
  }
);

export default function ClientGradeDistribution(props: ComponentProps<typeof GradeDistribution>) {
  return <GradeDistributionComponent {...props} />;
}

export { ClientGradeDistribution };
