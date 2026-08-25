'use client';

import { Loader2 } from 'lucide-react';

interface ReturnDialogProps {
  open: boolean;
  /** Vòng đang trả lại — quyết định văn bản tiêu đề/mô tả */
  round: number;
  reason: string;
  isReturning: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/** Dialog "Trả lại đánh giá/báo cáo" (D3 — tách khỏi page). */
export default function ReturnDialog({
  open,
  round,
  reason,
  isReturning,
  onReasonChange,
  onClose,
  onConfirm,
}: ReturnDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs"
        onClick={() => {
          if (!isReturning) onClose();
        }}
      />
      <div className="relative w-full max-w-md max-md:max-h-[90vh] max-md:overflow-y-auto bg-surface-raised p-5 sm:p-6 rounded-2xl border border-outline-soft shadow-xl space-y-3.5">
        <h3 className="text-base sm:text-lg font-bold text-ink">
          {round === 1 ? 'Trả lại báo cáo' : 'Trả lại đánh giá'}
        </h3>
        <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
          {round === 1
            ? 'Báo cáo sẽ quay về bản nháp để chỉnh sửa.'
            : `Đánh giá sẽ quay về vòng ${round - 1} để chỉnh sửa. Dữ liệu vòng hiện tại sẽ bị reset.`}
        </p>
        <textarea
          className="w-full mt-2 p-3 bg-surface-muted border border-outline-soft rounded-xl text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand min-h-[90px] resize-none text-ink placeholder:text-ink-muted/60 leading-relaxed"
          placeholder="Lý do trả lại (bắt buộc)"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={3}
          disabled={isReturning}
        />
        <div className="flex items-center justify-end gap-2.5 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isReturning}
            className="max-md:min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-ink-muted hover:text-ink hover:bg-surface-muted rounded-xl transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!reason.trim() || isReturning}
            className="max-md:min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-2xs active:scale-95"
          >
            {isReturning && <Loader2 size={15} className="animate-spin" />}
            <span>Xác nhận trả lại</span>
          </button>
        </div>
      </div>
    </div>
  );
}
