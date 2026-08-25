'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import type { ComponentProps } from 'react';
import TeamComparison from '@/components/reports/TeamComparison';

const TeamComparisonComponent = dynamic(
  () => import('@/components/reports/TeamComparison'),
  {
    ssr: false,
    loading: () => <div className="animate-pulse h-64 bg-surface-muted rounded-3xl w-full" />,
  }
);

export default function ClientTeamComparison(props: ComponentProps<typeof TeamComparison>) {
  return <TeamComparisonComponent {...props} />;
}

export { ClientTeamComparison };
