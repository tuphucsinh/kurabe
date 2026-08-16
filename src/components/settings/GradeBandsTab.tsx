'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { getGradeColor } from '@/lib/scoring';
import { getGradeBandsAction } from '@/actions/read';
import { GradeBands } from '@/lib/grade-bands';
import { validateGradeBands, GradeBandsInput } from '@/lib/grade-bands-validate';
import { saveGradeBands } from '@/actions/grade-bands';
import { Skeleton } from '@/components/ui/Skeleton';

const GROUP_LABEL: Record<'leader' | 'staff', string> = {
  leader: 'Quản lý (Leader/Manager/SubLeader)',
  staff: 'Nhân viên (Employee)',
};

type Row = GradeBandsInput;

function buildRows(bands: GradeBands): Row[] {
  const rows: Row[] = [];
  for (const group of ['leader', 'staff'] as const) {
    for (const band of bands[group]) {
      rows.push({
        roleGroup: group,
        grade: band.grade,
        minScore: band.minScore,
        maxScore: band.maxScore,
      });
    }
  }
  return rows;
}

export default function GradeBandsTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bands = await getGradeBandsAction();
      if (!cancelled) {
        setRows(buildRows(bands));
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updateRow = (index: number, field: 'minScore' | 'maxScore', value: string) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index
          ? { ...row, [field]: value === '' ? null : Number(value) }
          : row
      )
    );
    setError(null);
  };

  const handleSave = async () => {
    const validationError = validateGradeBands(rows);
    if (validationError) {
      setError(validationError);
      toast(validationError, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveGradeBands(rows);
      if (result.success) {
        toast('Đã lưu thang điểm xếp loại.', 'success');
      } else {
        setError(result.error || 'Lỗi khi lưu thang điểm.');
        toast(result.error || 'Lỗi khi lưu thang điểm.', 'error');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Lỗi không xác định khi lưu thang điểm.';
      console.error('saveGradeBands error:', err);
      setError(message);
      toast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <Skeleton variant="text" width={220} height={20} />
          <Skeleton variant="rectangular" height={240} className="rounded-xl" />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <Skeleton variant="text" width={220} height={20} />
          <Skeleton variant="rectangular" height={240} className="rounded-xl" />
        </div>
      </div>
    );
  }

  const renderGroup = (group: 'leader' | 'staff') => {
    const groupRows = rows.filter((r) => r.roleGroup === group);
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-1">
          {GROUP_LABEL[group]}
        </h3>
        <p className="text-xs text-slate-400 mb-4">Điểm tối đa cho một đánh giá: 200</p>
        <div className="space-y-3">
          {groupRows.map((row) => (
            <div
              key={row.grade}
              className="flex items-center gap-3 p-3 rounded-xl bg-slate-50"
            >
              <span
                className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border text-sm font-black ${getGradeColor(row.grade)}`}
              >
                {row.grade}
              </span>

              <div className="flex items-center gap-2 flex-1">
                <label className="text-xs font-medium text-slate-500 w-8">Từ</label>
                <input
                  type="number"
                  value={row.minScore ?? ''}
                  onChange={(e) =>
                    updateRow(rows.indexOf(row), 'minScore', e.target.value)
                  }
                  disabled={row.grade === 'D'}
                  placeholder="—"
                  className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100 disabled:text-slate-400"
                />
                <span className="text-slate-300">→</span>
                <label className="text-xs font-medium text-slate-500 w-8">Đến</label>
                <input
                  type="number"
                  value={row.maxScore ?? ''}
                  onChange={(e) =>
                    updateRow(rows.indexOf(row), 'maxScore', e.target.value)
                  }
                  disabled={row.grade === 'S'}
                  placeholder="—"
                  className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderGroup('leader')}
        {renderGroup('staff')}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
        >
          <Save size={16} />
          {isSaving ? 'Đang lưu...' : 'Lưu thang điểm'}
        </button>
      </div>
    </div>
  );
}
