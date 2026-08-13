'use client';

import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';
import { createEvaluationPeriod } from '@/actions/period';
import { useAuth } from '@/contexts/AuthContext';

interface PeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (periodId: string) => void;
}

export function PeriodModal({ isOpen, onClose, onSuccess }: PeriodModalProps) {
  const { user } = useAuth();
  const [year, setYear] = useState(new Date().getFullYear());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    setIsSubmitting(true);
    setError('');

    try {
      const result = await createEvaluationPeriod(year);
      if (result.success && result.periodId) {
        onSuccess(result.periodId);
        onClose();
      } else {
        setError(result.error || 'Đã xảy ra lỗi khi tạo kỳ đánh giá');
      }
    } catch {
      setError('Lỗi kết nối server');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h3 className="text-lg font-bold text-slate-800">Tạo kỳ đánh giá mới</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 text-rose-600 text-sm border border-rose-100 flex items-start gap-2">
              <span className="shrink-0 mt-0.5">⚠️</span>
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 ml-1">Năm đánh giá</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="number"
                required
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Khởi tạo kỳ đánh giá'
              )}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 text-center italic">
            * Lưu ý: Hệ thống sẽ tự động khởi tạo bảng đánh giá cho toàn bộ nhân viên khi tạo kỳ mới.
          </p>
        </form>
      </div>
    </div>
  );
}
