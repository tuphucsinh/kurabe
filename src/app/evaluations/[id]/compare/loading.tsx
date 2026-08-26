import { Skeleton } from '@/components/ui/Skeleton';
import {
  AlertCircle,
  ArrowLeft,
  History,
  MessageSquare,
} from 'lucide-react';

export function CompareStaticFrame() {
  return (
    <div
      className="min-h-full bg-page pb-20 w-full animate-in fade-in duration-300"
      data-load-layer="static"
      data-load-state="loading"
      role="status"
      aria-busy="true"
      aria-label="Đang tải dữ liệu so sánh"
    >
      <span className="sr-only">Đang tải dữ liệu so sánh...</span>

      {/* ═══════ Sticky Header Skeleton ═══════ */}
      <div
        className="sticky top-0 z-50 bg-surface-raised border-b border-outline-soft px-3 sm:px-4 md:px-8 py-3 sm:py-4 shadow-sm"
        data-load-layer="static-header"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div
              className="p-2 rounded-full text-ink-muted/40 max-md:min-h-[44px] max-md:min-w-[44px] flex items-center justify-center"
              aria-hidden="true"
            >
              <ArrowLeft size={22} className="opacity-40" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg md:text-xl font-black text-ink tracking-tight uppercase">
                So sánh các vòng đánh giá
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <Skeleton className="h-5 w-24 rounded-lg" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
            </div>
          </div>
          <div className="max-md:hidden flex items-center gap-3">
            <div className="flex flex-col items-end gap-1">
              <span className="text-[11px] font-bold text-ink-muted uppercase tracking-widest">
                Trạng thái hiện tại
              </span>
              <Skeleton className="h-4 w-12 rounded" />
            </div>
            <div className="p-3 bg-brand-soft/50 rounded-2xl text-brand/50" aria-hidden="true">
              <History size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 mt-6 md:mt-8">
        <div className="flex flex-col gap-6 sm:gap-8">

          {/* ═══════ Summary Section Skeleton ═══════ */}
          <section data-load-phase="primary" data-load-layer="primary">
            <h2 className="text-xs font-black text-ink-muted uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <AlertCircle size={14} className="text-brand" />
              Tổng quan kết quả
            </h2>
            <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto pb-4 scrollbar-hide touch-pan-x">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 sm:gap-4 shrink-0">
                  {i > 1 && (
                    <div className="flex flex-col items-center gap-1" aria-hidden="true">
                      <Skeleton className="h-6 w-14 rounded-xl" />
                      <Skeleton className="h-3 w-3 rounded-full" />
                    </div>
                  )}
                  <div className="min-w-[160px] sm:min-w-[180px] p-4 sm:p-6 rounded-[2rem] border border-outline-soft bg-surface-raised shadow-sm flex flex-col items-center text-center space-y-2">
                    <Skeleton className="h-3 w-16 rounded" />
                    <Skeleton className="h-9 w-16 rounded-xl my-1" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-4 w-24 rounded mt-2" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════ Main Comparison Table & Mobile Cards Skeleton ═══════ */}
          <section data-load-phase="primary" data-load-layer="changed-criteria">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h2 className="text-xs font-black text-ink-muted uppercase tracking-[0.2em] flex items-center gap-2">
                Chi tiết tiêu chí thay đổi
              </h2>
              <span className="self-start sm:self-auto text-[11px] font-bold text-ink-muted bg-surface-muted px-2 py-1 rounded-lg border border-outline-soft">
                Chỉ hiển thị các mục có biến động điểm
              </span>
            </div>

            {/* Mobile: Card presentation with rounds stacked */}
            <div className="md:hidden space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-2xl border border-outline-soft bg-surface-raised shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <Skeleton className="h-3 w-10 rounded" />
                      <Skeleton className="h-4 w-40 rounded" />
                    </div>
                    <Skeleton className="h-6 w-14 rounded-xl shrink-0" />
                  </div>
                  <div className="grid grid-cols-2 min-[480px]:grid-cols-3 sm:grid-cols-4 gap-2 pt-2 border-t border-outline-soft/40">
                    {[1, 2].map((r) => (
                      <div key={r} className="p-2.5 rounded-xl border border-outline-soft/50 bg-surface/50 flex flex-col items-center justify-center text-center space-y-1.5 min-h-[56px]">
                        <Skeleton className="h-3 w-12 rounded" />
                        <Skeleton className="h-5 w-8 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Tablet / PC: Table presentation */}
            <div className="max-md:hidden w-full rounded-[2rem] border border-outline-soft bg-surface-raised overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-surface/50 border-b border-outline-soft">
                      <th className="px-8 py-5 text-[11px] font-black text-ink-muted uppercase tracking-wider">
                        Tiêu chí đánh giá
                      </th>
                      <th className="px-4 py-5 text-[11px] font-black text-ink-muted uppercase tracking-wider text-center min-w-[100px]">
                        <Skeleton className="h-3 w-8 mx-auto" />
                      </th>
                      <th className="px-4 py-5 text-[11px] font-black text-ink-muted uppercase tracking-wider text-center min-w-[100px]">
                        <Skeleton className="h-3 w-8 mx-auto" />
                      </th>
                      <th className="px-8 py-5 text-[11px] font-black text-ink-muted uppercase tracking-wider text-right">
                        Biến động (Δ)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-soft">
                    {[1, 2, 3, 4].map((i) => (
                      <tr key={i} className="hover:bg-surface/30 transition-colors">
                        <td className="px-8 py-4">
                          <div className="flex flex-col gap-1.5">
                            <Skeleton className="h-3 w-10 rounded" />
                            <Skeleton className="h-4 w-48 rounded" />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Skeleton className="w-10 h-10 rounded-xl mx-auto" />
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Skeleton className="w-10 h-10 rounded-xl mx-auto" />
                        </td>
                        <td className="px-8 py-4 text-right">
                          <Skeleton className="h-6 w-14 rounded-xl ml-auto" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ═══════ Comments Comparison Skeleton ═══════ */}
          <section data-load-phase="secondary" data-load-layer="comments">
            <h2 className="text-xs font-black text-ink-muted uppercase tracking-[0.2em] flex items-center gap-2 mb-4">
              <MessageSquare size={14} className="text-brand" />
              Nhận xét qua các vòng
            </h2>
            <div className="grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2">
              {[1, 2].map((i) => (
                <div key={i} className="p-5 sm:p-6 rounded-[2rem] border border-outline-soft bg-surface-raised shadow-sm flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3 w-16 rounded" />
                    <Skeleton className="h-3 w-12 rounded" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-24 rounded" />
                    <Skeleton className="h-4 w-full rounded" />
                    <Skeleton className="h-4 w-3/4 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════ Unchanged Criteria Skeleton ═══════ */}
          <section className="mt-4" data-load-phase="secondary" data-load-layer="unchanged">
            <div className="bg-surface-raised rounded-3xl border border-outline-soft overflow-hidden">
              <div className="px-4 sm:px-8 py-4 bg-surface/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Skeleton className="h-3 w-36 rounded" />
                <Skeleton className="h-3 w-28 rounded" />
              </div>
              <div className="p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-surface/20 border border-outline-soft/50">
                    <div className="flex flex-col gap-1 flex-1 pr-2">
                      <Skeleton className="h-3 w-8 rounded" />
                      <Skeleton className="h-3.5 w-32 rounded" />
                    </div>
                    <Skeleton className="h-6 w-8 rounded-xl shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}

export default function CompareLoading() {
  return <CompareStaticFrame />;
}
