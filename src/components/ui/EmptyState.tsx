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
      <div className="w-20 h-20 rounded-full bg-surface-muted flex items-center justify-center mb-6 shadow-sm border border-outline-soft">
        {Icon ? (
          <Icon size={40} className="text-outline" />
        ) : (
          <div className="w-10 h-10 bg-surface-muted rounded-lg animate-pulse" />
        )}
      </div>
      
      <h3 className="text-xl font-black text-ink mb-2">{title}</h3>
      
      {description && (
        <p className="text-ink-muted max-w-sm mx-auto mb-8 leading-relaxed">
          {description}
        </p>
      )}
      
      {action && (
        <button
          onClick={action.onClick}
          className="px-6 py-3 bg-brand text-white rounded-xl font-bold hover:bg-brand-mid transition-all shadow-lg shadow-brand/20 flex items-center justify-center gap-2 group active:scale-95"
        >
          {action.icon && <action.icon size={18} className="group-hover:rotate-12 transition-transform" />}
          {action.label}
        </button>
      )}
    </div>
  );
}
