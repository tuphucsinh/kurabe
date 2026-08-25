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
      className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 lg:py-5 space-y-6 md:space-y-8 lg:space-y-4 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-[18px] sm:text-[22px] md:text-[27px] lg:text-[27px] font-black text-on-surface leading-[1.05] tracking-tight">
            Tổng quan hệ thống
          </h1>
          <p className="text-sm sm:text-base md:text-lg lg:text-[14px] text-outline font-medium mt-2 leading-snug">
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
