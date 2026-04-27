'use client';

import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
      <div>
        <h1 className="text-2xl font-black text-on-surface tracking-tight">{title}</h1>
        {description && <p className="text-sm text-outline font-medium mt-1">{description}</p>}
      </div>
      <div className="flex items-center gap-3">
        {children}
      </div>
    </div>
  );
}
