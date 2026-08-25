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
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => {
          if (!isReturning) onClose();
        }}
      />
      <div className="relative w-full max-w-md max-md:max-h-[90vh] max-md:overflow-y-auto bg-surface p-5 sm:p-6 rounded-2xl border shadow-2xl space-y-4">
        <h3 className="text-lg font-bold text-on-surface">
          {round === 1 ? 'Trả lại báo cáo' : 'Trả lại đánh giá'}
        </h3>
        <p className="text-sm text-outline leading-relaxed">
          {round === 1
            ? 'Báo cáo sẽ quay về bản nháp để chỉnh sửa.'
            : `Đánh giá sẽ quay về vòng ${round - 1} để chỉnh sửa. Dữ liệu vòng hiện tại sẽ bị reset.`}
        </p>
        <textarea
          className="w-full mt-4 p-3 border border-outline-variant rounded-xl text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 min-h-[90px] resize-none"
          placeholder="Lý do trả lại (bắt buộc)"
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={3}
          disabled={isReturning}
        />
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isReturning}
            className="max-md:min-h-[44px] px-4 py-2 text-sm font-semibold text-outline hover:text-on-surface disabled:opacity-50 transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!reason.trim() || isReturning}
            className="max-md:min-h-[44px] px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm active:scale-95"
          >
            {isReturning && <Loader2 size={16} className="animate-spin" />}
            <span>Xác nhận trả lại</span>
          </button>
        </div>
      </div>
    </div>
  );
}
