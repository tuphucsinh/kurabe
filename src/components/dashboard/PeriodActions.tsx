'use client';

import React, { useState } from 'react';
import { Plus, Lock, Trash2, FileDown } from 'lucide-react';
import { exportEvaluationsToExcel } from '@/lib/export';
import { useAuth } from '@/contexts/AuthContext';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

const PeriodModal = dynamic(() =>
  import('@/components/modals/PeriodModal').then((mod) => mod.PeriodModal)
);
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { closeEvaluationPeriod, deleteEvaluationPeriod } from '@/actions/period';

export default function PeriodActions() {
  const { currentPeriod, isManager, allPeriods } = useAuth();
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  if (!isManager) return null;

  const handleClosePeriod = async () => {
    if (!currentPeriod) return;
    
    const confirmed = await confirm({
      title: 'Đóng kỳ đánh giá',
      message: 'Sau khi đóng, tất cả đánh giá trong kỳ này sẽ không thể chỉnh sửa. Bạn có chắc chắn?',
      confirmText: 'Đóng kỳ',
      variant: 'danger'
    });
    
    if (!confirmed) return;
    
    setIsClosing(true);
    try {
      const result = await closeEvaluationPeriod(currentPeriod.id);
      if (result.success) {
        toast('Đã đóng kỳ thành công.', 'success');
        router.refresh(); // Refresh to update context
      } else {
        toast(result.error || 'Lỗi đóng kỳ', 'error');
      }
    } finally {
      setIsClosing(false);
    }
  };

  const handlePeriodSuccess = () => {
    router.refresh();
  };

  const handleDeletePeriod = async () => {
    if (!currentPeriod) return;

    const confirmed = await confirm({
      title: 'Xóa vĩnh viễn Kỳ Đánh Giá',
      message: `Bạn sắp xóa vĩnh viễn Kỳ ${currentPeriod.year}. Hành động này sẽ xóa toàn bộ evaluations và rounds của kỳ này. BẠN CÓ CHẮC CHẮN KHÔNG?`,
      confirmText: 'Xóa Vĩnh Viễn',
      variant: 'danger'
    });
    
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      const result = await deleteEvaluationPeriod(currentPeriod.id);
      if (result.success) {
        toast(`Đã xóa Kỳ ${currentPeriod.year} thành công.`, 'success');
        router.refresh();
      } else {
        toast(result.error || 'Không thể xóa kỳ.', 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!currentPeriod) return;
    setIsExporting(true);
    try {
      await exportEvaluationsToExcel(currentPeriod.id, { includeRoundDetails: true });
      toast('Đã xuất Excel thành công.', 'success');
    } catch (error) {
      console.error(error);
      toast('Không thể xuất file Excel. Vui lòng thử lại.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3">
        {currentPeriod?.status === 'Active' && (
          <button
            onClick={handleClosePeriod}
            disabled={isClosing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors disabled:opacity-50"
          >
            <Lock size={16} />
            {isClosing ? 'Đang đóng...' : 'Đóng kỳ'}
          </button>
        )}

        {currentPeriod && (
          <button
            onClick={handleDeletePeriod}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 border border-rose-700 rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50"
          >
            <Trash2 size={16} />
            {isDeleting ? 'Đang xóa...' : 'Xóa kỳ'}
          </button>
        )}
        
        {(!currentPeriod || !allPeriods.some(p => p.status === 'Active')) && (
          <button
            onClick={() => setIsPeriodModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all active:scale-95"
          >
            <Plus size={18} />
            Tạo kỳ mới
          </button>
        )}

        {currentPeriod && (
          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all active:scale-95 disabled:opacity-50"
          >
            <FileDown size={18} />
            {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
          </button>
        )}
      </div>

      <PeriodModal 
        isOpen={isPeriodModalOpen} 
        onClose={() => setIsPeriodModalOpen(false)} 
        onSuccess={handlePeriodSuccess} 
      />
    </>
  );
}
