'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App Error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="bg-white rounded-3xl border border-outline-variant shadow-xl p-8 max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500">
          <AlertTriangle size={40} />
        </div>
        
        <div>
          <h2 className="text-2xl font-black text-on-surface mb-2">Đã có lỗi xảy ra!</h2>
          <p className="text-on-surface-variant text-sm">
            Rất tiếc, hệ thống gặp trục trặc trong quá trình xử lý. Xin vui lòng thử lại sau.
          </p>
        </div>

        <div className="bg-surface rounded-xl p-4 text-left border border-outline-variant overflow-hidden">
          <p className="text-xs font-mono text-outline line-clamp-3">
            {error.message || 'Unknown error'}
          </p>
        </div>

        <button
          onClick={() => reset()}
          className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 px-6 rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <RefreshCcw size={18} />
          Thử lại
        </button>
      </div>
    </div>
  );
}
