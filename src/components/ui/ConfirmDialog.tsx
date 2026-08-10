'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, Info } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | undefined>(undefined);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const handleClose = useCallback((value: boolean) => {
    if (confirmState) {
      confirmState.resolve(value);
      setConfirmState(null);
    }
  }, [confirmState]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && confirmState) {
        handleClose(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmState, handleClose]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {confirmState && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => handleClose(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-surface p-6 rounded-2xl border shadow-2xl overflow-hidden"
            >
              <div className="flex items-start gap-4">
                <div className={`shrink-0 p-3 rounded-xl ${
                  confirmState.variant === 'danger' ? 'bg-rose-100 text-rose-600' :
                  confirmState.variant === 'warning' ? 'bg-amber-100 text-amber-600' :
                  'bg-blue-100 text-blue-600'
                }`}>
                  {confirmState.variant === 'danger' ? <Trash2 size={24} /> :
                   confirmState.variant === 'warning' ? <AlertTriangle size={24} /> :
                   <Info size={24} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-on-surface mb-1">
                    {confirmState.title}
                  </h3>
                  <p className="text-outline leading-relaxed">
                    {confirmState.message}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  onClick={() => handleClose(false)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-outline hover:bg-black/5 transition-colors"
                >
                  {confirmState.cancelText || 'Hủy'}
                </button>
                <button
                  onClick={() => handleClose(true)}
                  className={`px-6 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95 shadow-md ${
                    confirmState.variant === 'danger' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-200' :
                    confirmState.variant === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' :
                    'bg-primary hover:bg-primary/90 shadow-blue-200'
                  }`}
                >
                  {confirmState.confirmText || 'Xác nhận'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider');
  }
  return context;
}
