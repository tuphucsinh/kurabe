'use client';

import React from 'react';
interface DashboardShellProps {
  periodYear?: number | string;
  periodName?: string;
  hasPeriod?: boolean;
  children: React.ReactNode;
}

export default function DashboardShell({
  periodYear,
  periodName,
  hasPeriod = true,
  children,
}: DashboardShellProps) {
  const displayPeriod = periodYear ? `Kỳ ${periodYear}` : (periodName || 'kỳ đánh giá');

  return (
    <div
      data-load-layer="shell"
      className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 space-y-6 md:space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Tổng quan hệ thống</h1>
          <p className="text-slate-500 mt-1 text-xs sm:text-sm">
            {hasPeriod ? (
              <>Theo dõi tiến độ đánh giá năng lực QAQC — <span className="text-indigo-600 font-semibold">{displayPeriod}</span></>
            ) : (
              'Chưa có kỳ đánh giá nào được chọn'
            )}
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}
