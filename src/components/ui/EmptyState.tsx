import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
  className?: string;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action,
  className 
}: EmptyStateProps) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500",
      className
    )}>
      <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center mb-6 shadow-sm border border-slate-100">
        {Icon ? (
          <Icon size={40} className="text-slate-300" />
        ) : (
          <div className="w-10 h-10 bg-slate-200 rounded-lg animate-pulse" />
        )}
      </div>
      
      <h3 className="text-xl font-black text-on-surface mb-2">{title}</h3>
      
      {description && (
        <p className="text-on-surface-variant max-w-sm mx-auto mb-8 leading-relaxed">
          {description}
        </p>
      )}
      
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group active:scale-95"
        >
          {action.icon && <action.icon size={18} className="group-hover:rotate-12 transition-transform" />}
          {action.label}
        </button>
      )}
    </div>
  );
}
