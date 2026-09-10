'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { m, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const handleClose = useCallback((value: boolean) => {
    if (confirmState) {
      confirmState.resolve(value);
      setConfirmState(null);
    }
  }, [confirmState]);

  useEffect(() => {
    if (!confirmState) {
      returnFocusRef.current?.focus();
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ));
    focusable()[0]?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) return;
      const index = elements.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && (index <= 0 || index === -1)) {
        event.preventDefault();
        elements[elements.length - 1].focus();
      } else if (!event.shiftKey && index === elements.length - 1) {
        event.preventDefault();
        elements[0].focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
      {/* LazyMotion riêng cho dialog — không kéo bản full framer-motion vào bundle mọi trang (C5) */}
      <LazyMotion features={domAnimation} strict>
        <AnimatePresence>
          {confirmState && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => handleClose(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <m.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              aria-describedby="confirm-dialog-message"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-surface-raised p-6 rounded-2xl border border-outline-soft shadow-2xl overflow-hidden"
            >
              <div className="flex items-start gap-4">
                <div className={`shrink-0 p-3 rounded-xl ${
                  confirmState.variant === 'danger' ? 'bg-rose-100 text-rose-600' :
                  confirmState.variant === 'warning' ? 'bg-amber-100 text-amber-600' :
                  'bg-brand-soft text-brand'
                }`}>
                  {confirmState.variant === 'danger' ? <Trash2 size={24} /> :
                   confirmState.variant === 'warning' ? <AlertTriangle size={24} /> :
                   <Info size={24} />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id="confirm-dialog-title" className="text-lg font-bold text-ink mb-1">
                    {confirmState.title}
                  </h3>
                  <p id="confirm-dialog-message" className="text-ink-muted leading-relaxed">
                    {confirmState.message}
                  </p>
                </div>
              </div>

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  onClick={() => handleClose(false)}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-ink-muted hover:text-ink hover:bg-surface-muted transition-colors"
                >
                  {confirmState.cancelText || 'Hủy'}
                </button>
                <button
                  onClick={() => handleClose(true)}
                  className={`px-6 py-2 rounded-xl text-sm font-bold text-white transition-all active:scale-95 shadow-md ${
                    confirmState.variant === 'danger' ? 'bg-rose-500 hover:bg-rose-600 shadow-rose-200' :
                    confirmState.variant === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-200' :
                    'bg-brand hover:bg-brand-mid shadow-brand/20'
                  }`}
                >
                  {confirmState.confirmText || 'Xác nhận'}
                </button>
              </div>
            </m.div>
          </div>
        )}
        </AnimatePresence>
      </LazyMotion>
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
