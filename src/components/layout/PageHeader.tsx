'use client';

import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div>
        <h1 className="text-[18px] sm:text-[22px] md:text-[27px] lg:text-[27px] font-black text-on-surface leading-[1.05] tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-sm sm:text-base md:text-lg lg:text-[14px] text-outline font-medium mt-2 leading-snug">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
