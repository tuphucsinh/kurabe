import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
}

export function StatCard({ title, value, icon: Icon }: StatCardProps) {
  return (
    <div className="bg-surface-raised p-6 rounded-2xl shadow-sm border border-outline-soft hover:shadow-md transition-shadow duration-300 group">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-ink-muted">{title}</h3>
        <div className="p-2 bg-brand-soft text-brand rounded-lg group-hover:scale-110 transition-transform duration-300">
          <Icon size={20} />
        </div>
      </div>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold text-ink">{value}</p>
      </div>
    </div>
  );
}
