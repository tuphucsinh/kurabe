'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { exportEvaluationsToExcel } from '@/lib/export';
import { useToast } from '@/components/ui/Toast';

/** Nút "Xuất file" trang Báo cáo — wire engine export thật (trước đây là button chết). */
export default function ExportReportButton({ periodId }: { periodId: string }) {
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!periodId) {
      toast('Không có kỳ đánh giá để xuất.', 'error');
      return;
    }
    setIsExporting(true);
    try {
      await exportEvaluationsToExcel(periodId, { includeRoundDetails: true });
      toast('Đã xuất file Excel thành công.', 'success');
    } catch (err) {
      console.error('Export error:', err);
      toast('Lỗi khi xuất file Excel.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="flex items-center gap-2 px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm font-medium hover:bg-surface-container transition-colors disabled:opacity-50 w-full sm:w-auto justify-center"
    >
      {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      Xuất file
    </button>
  );
}
