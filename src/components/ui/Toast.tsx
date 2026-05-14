'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => {
      const newToasts = [...prev, { id, message, type }];
      return newToasts.slice(-3); // Keep only 3 most recent
    });

    // Auto dismiss
    const timer = setTimeout(() => {
      removeToast(id);
    }, 3000);

    return () => clearTimeout(timer);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) {
  const icons = {
    success: <CheckCircle2 className="text-emerald-500" size={20} />,
    error: <AlertCircle className="text-rose-500" size={20} />,
    warning: <AlertTriangle className="text-amber-500" size={20} />,
    info: <Info className="text-sky-500" size={20} />,
  };

  const colors = {
    success: 'border-emerald-500/20 bg-emerald-50/90 text-emerald-900 shadow-emerald-500/10',
    error: 'border-rose-500/20 bg-rose-50/90 text-rose-900 shadow-rose-500/10',
    warning: 'border-amber-500/20 bg-amber-50/90 text-amber-900 shadow-amber-500/10',
    info: 'border-sky-500/20 bg-sky-50/90 text-sky-900 shadow-sky-500/10',
  };

  return (
    <div 
      role="alert"
      aria-live="assertive"
      className={`pointer-events-auto flex items-center gap-4 p-4 rounded-2xl border backdrop-blur-md shadow-xl animate-in slide-in-from-right fade-in duration-500 zoom-in-95 ease-out ${colors[toast.type]}`}
    >
      <div className="shrink-0 p-2 rounded-xl bg-white shadow-sm border border-black/5">
        {icons[toast.type]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold leading-relaxed tracking-tight">
          {toast.message}
        </p>
      </div>
      <button 
        onClick={onClose}
        className="shrink-0 p-1.5 rounded-lg hover:bg-black/5 text-slate-400 hover:text-slate-600 transition-all active:scale-90"
      >
        <X size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
