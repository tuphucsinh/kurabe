'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

export default function HistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('History page error:', error);
  }, [error]);

  return (
    <main className="px-4 sm:px-6 md:px-10 lg:px-12 py-8 max-w-5xl mx-auto">
      <section className="bg-surface-raised rounded-2xl border border-outline-soft p-8 text-center space-y-4">
        <AlertTriangle className="mx-auto text-rose-500" size={32} aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-ink">Không thể tải lịch sử đánh giá</h1>
          <p className="text-sm text-ink-muted">Đã xảy ra lỗi khi tải dữ liệu. Vui lòng thử lại sau.</p>
        </div>
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <RefreshCcw size={16} aria-hidden="true" />
          Thử lại
        </button>
      </section>
    </main>
  );
}