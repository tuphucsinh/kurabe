'use client';

import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
      <div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-on-surface leading-[1.05] tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-base sm:text-lg md:text-2xl text-outline font-medium mt-2 leading-snug">
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
