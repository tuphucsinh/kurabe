'use client';

import React, { useState } from 'react';
import {
  FileText,
  Sparkles,
  Printer,
  Copy,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { generatePeriodMinutesAction } from '@/actions/ai';
import { usePeriods } from '@/hooks/use-db';
import { useToast } from '@/components/ui/Toast';

interface PeriodMinutesModalProps {
  periodId: string;
}

export default function PeriodMinutesModal({ periodId }: PeriodMinutesModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const { toast } = useToast();
  const { data: periods = [] } = usePeriods();

  const currentPeriod = periods.find((p) => p.id === periodId);
  const periodName = currentPeriod ? `${currentPeriod.name} (${currentPeriod.year})` : 'Kỳ đánh giá';
  const isActive = !currentPeriod?.status || currentPeriod.status.toLowerCase() === 'active';

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isGenerating) {
      if (!confirm('Đang soạn biên bản, bạn có chắc muốn đóng?')) {
        return;
      }
    }
    setIsOpen(false);
  };

  const handleGenerate = async () => {
    if (!periodId) {
      toast('Không tìm thấy thông tin kỳ đánh giá.', 'error');
      return;
    }

    // GATE: Cảnh báo xác nhận nếu kỳ đang Active
    if (isActive) {
      const proceed = window.confirm('Kỳ chưa đóng — biên bản sẽ là dự thảo. Tiếp tục?');
      if (!proceed) return;
    }

    setIsGenerating(true);
    try {
      const res = await generatePeriodMinutesAction({ periodId });
      if (res.error) {
        toast(res.error, 'error');
      } else if (res.minutes) {
        setMinutes(res.minutes);
        toast('Đã soạn biên bản kết thúc kỳ thành công.', 'success');
      }
    } catch (err) {
      console.error('Error generating period minutes:', err);
      toast('Lỗi khi kết nối với AI soạn biên bản.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!minutes.trim()) {
      toast('Chưa có nội dung biên bản để sao chép.', 'warning');
      return;
    }
    try {
      await navigator.clipboard.writeText(minutes);
      setIsCopied(true);
      toast('Đã sao chép nội dung biên bản.', 'success');
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Copy error:', err);
      toast('Lỗi khi sao chép vào bộ nhớ tạm.', 'error');
    }
  };

  const handlePrint = () => {
    if (!minutes.trim()) {
      toast('Chưa có nội dung biên bản để in.', 'warning');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (printWindow) {
      const escaped = minutes
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Biên bản kết thúc kỳ - ${periodName}</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                padding: 40px;
                color: #0f172a;
                line-height: 1.6;
                font-size: 13.5px;
              }
              .header {
                border-bottom: 2px solid #0E4B66;
                padding-bottom: 12px;
                margin-bottom: 24px;
              }
              .title {
                font-size: 18px;
                font-weight: 800;
                color: #003449;
                margin: 0 0 6px 0;
                text-transform: uppercase;
              }
              .meta {
                font-size: 12px;
                color: #64748b;
              }
              .content {
                white-space: pre-wrap;
                word-break: break-word;
              }
              @media print {
                body { padding: 20px; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">Biên bản kết thúc kỳ đánh giá</div>
              <div class="meta">Kỳ: ${periodName} • Ngày in: ${new Date().toLocaleDateString('vi-VN')}</div>
            </div>
            <div class="content">${escaped}</div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    } else {
      window.print();
    }
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-2 px-3.5 py-2 bg-surface-raised border border-outline-soft rounded-2xl text-xs sm:text-sm font-medium hover:bg-surface-muted text-ink shadow-2xs hover:opacity-95 active:scale-95 transition-all shrink-0 w-full sm:w-auto justify-center"
      >
        <FileText className="w-4 h-4 text-brand" />
        <span>Soạn biên bản kết thúc kỳ</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface-raised w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-outline-soft">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-brand-strong to-brand text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center">
                  <FileText className="text-cyan-300" size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-black tracking-tight">Biên bản kết thúc kỳ (AI)</h2>
                  <p className="text-xs text-white/70">
                    Kỳ: <span className="font-semibold text-white">{periodName}</span> • Tự động tổng hợp số liệu & báo cáo chính thức
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isGenerating}
                className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Warning if Active */}
            {isActive && (
              <div className="bg-amber-50 px-6 py-2.5 border-b border-amber-200 flex items-center gap-2 text-xs text-amber-800 shrink-0">
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span>
                  <b>Lưu ý:</b> Kỳ đánh giá đang mở (Active). Biên bản do AI soạn sẽ mang tính chất <b>dự thảo</b>.
                </span>
              </div>
            )}

            {/* Body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ink uppercase tracking-wider">
                  Nội dung biên bản (có thể chỉnh sửa trực tiếp):
                </label>
                {minutes && (
                  <span className="text-xs text-ink-muted">
                    {minutes.trim().split(/\s+/).length} từ • {minutes.length} ký tự
                  </span>
                )}
              </div>

              <textarea
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                placeholder={
                  isGenerating
                    ? 'AI đang phân tích số liệu và soạn thảo biên bản kết thúc kỳ...'
                    : 'Nhấn nút "Soạn biên bản (AI)" bên dưới để tự động tạo nội dung biên bản kết thúc kỳ.'
                }
                rows={14}
                disabled={isGenerating}
                className="w-full p-4 rounded-2xl border border-outline-soft bg-surface-muted/50 text-ink font-mono text-xs leading-relaxed focus:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition-all resize-y"
              />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-surface-muted border-t border-outline-soft flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-gradient-to-r from-brand to-brand-mid hover:opacity-95 active:scale-95 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Đang soạn...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={14} className="text-amber-300" />
                      <span>{minutes ? 'Soạn lại (AI)' : 'Soạn biên bản (AI)'}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  disabled={!minutes.trim() || isGenerating}
                  className="px-3.5 py-2 bg-surface-raised border border-outline-soft hover:bg-surface-muted text-ink-muted rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                  {isCopied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  <span>{isCopied ? 'Đã sao chép' : 'Sao chép'}</span>
                </button>

                <button
                  onClick={handlePrint}
                  disabled={!minutes.trim() || isGenerating}
                  className="px-3.5 py-2 bg-surface-raised border border-outline-soft hover:bg-surface-muted text-ink-muted rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Printer size={14} />
                  <span>In biên bản</span>
                </button>

                <button
                  onClick={handleClose}
                  className="px-3.5 py-2 bg-surface-raised border border-outline-soft hover:bg-surface-muted text-ink-muted rounded-xl text-xs font-bold transition-all"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
