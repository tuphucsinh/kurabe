'use client';

import { Lock } from 'lucide-react';

interface AccessDeniedProps {
  message: string;
  title?: string;
  tone?: 'red' | 'amber';
  onBack?: () => void;
}

/**
 * Màn chặn truy cập dùng chung cho các guard của trang đánh giá (D3 —
 * gom 7 khối JSX copy-paste gần giống nhau về 1 component).
 */
export default function AccessDenied({ message, title, tone = 'red', onBack }: AccessDeniedProps) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className={`p-4 rounded-full ${tone === 'red' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
        <Lock size={48} />
      </div>
      {title && <h2 className="text-2xl font-bold text-slate-900">{title}</h2>}
      <p className="text-slate-500 max-w-md">{message}</p>
      {onBack && (
        <button
          onClick={onBack}
          className="px-6 py-2 bg-primary text-white rounded-xl font-bold shadow-sm"
        >
          Quay lại
        </button>
      )}
    </div>
  );
}

/** Màn chờ tải vòng đánh giá (giữ nhịp skeleton như bản gốc). */
export function RoundLoading({ label = 'Đang tải dữ liệu...' }: { label?: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="w-12 h-12 bg-blue-100 rounded-full" />
        <div className="text-slate-400 font-medium">{label}</div>
      </div>
    </div>
  );
}
