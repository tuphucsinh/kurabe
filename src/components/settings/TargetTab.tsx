'use client';

import { useState } from 'react';
import { Target, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { savePeriodTarget } from '@/actions/period';

const GRADES = ['S', 'A', 'AB', 'B', 'C', 'D'];

/** Cấu hình Mục tiêu Kỳ (tỉ lệ % + mức xếp loại) — Manager-only. */
export default function TargetTab() {
  const { allPeriods, currentPeriod, user } = useAuth();
  const { toast } = useToast();

  const [selectedPeriodId, setSelectedPeriodId] = useState(currentPeriod?.id || allPeriods[0]?.id || '');
  const selected = allPeriods.find((p) => p.id === selectedPeriodId) || null;
  const [rate, setRate] = useState<string>(String(selected?.targetRate ?? 75));
  const [grade, setGrade] = useState<string>(selected?.targetGrade || 'AB');
  const [isSaving, setIsSaving] = useState(false);

  const isManager = user?.role === 'Manager';

  const handlePeriodChange = (id: string) => {
    setSelectedPeriodId(id);
    const p = allPeriods.find((x) => x.id === id);
    if (p) {
      setRate(String(p.targetRate ?? 75));
      setGrade(p.targetGrade || 'AB');
    }
  };

  const handleSave = async () => {
    if (!isManager) {
      toast('Chỉ Quản lý mới có quyền chỉnh sửa mục tiêu.', 'error');
      return;
    }
    if (!selectedPeriodId) {
      toast('Chưa chọn kỳ đánh giá.', 'error');
      return;
    }
    const rateNum = Number(rate);
    if (!Number.isFinite(rateNum) || rateNum < 0 || rateNum > 100) {
      toast('Tỉ lệ mục tiêu phải nằm trong khoảng 0-100%.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const result = await savePeriodTarget(selectedPeriodId, rateNum, grade);
      if (result.success) {
        toast('Đã lưu mục tiêu kỳ thành công.', 'success');
      } else {
        toast(result.error || 'Lỗi khi lưu mục tiêu.', 'error');
      }
    } catch (err) {
      console.error('savePeriodTarget error:', err);
      toast('Lỗi khi lưu mục tiêu.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isManager) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <p className="text-sm text-slate-500">Chỉ Quản lý mới có quyền cấu hình mục tiêu kỳ.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-xl">
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
        <Target className="w-4 h-4 text-indigo-600" />
        Mục tiêu kỳ đánh giá
      </h3>
      <p className="text-sm text-slate-500 mb-5">
        Mục tiêu hiển thị trên trang Báo cáo — hộp Mục tiêu Kỳ này — tỉ lệ nhân sự đạt từ mức xếp loại chọn trở lên.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Kỳ đánh giá</label>
          <select
            value={selectedPeriodId}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {allPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.status === 'Active' ? 'Đang mở' : 'Đã đóng'})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Tỉ lệ mục tiêu (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            placeholder="VD: 75"
          />
          <p className="text-xs text-slate-400 mt-1">Phần trăm nhân sự cần đạt mức xếp loại trở lên.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Mức xếp loại tối thiểu</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          Lưu mục tiêu
        </button>
      </div>
    </div>
  );
}
