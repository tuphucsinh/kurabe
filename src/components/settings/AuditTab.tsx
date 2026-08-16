'use client';

import { useEffect, useState } from 'react';
import { ScrollText, Clock } from 'lucide-react';
import { getAuditLogsAction, AuditRow } from '@/actions/read';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

const ACTION_LABELS: Record<string, string> = {
  CREATE_PERIOD: 'Tạo kỳ đánh giá',
  CLOSE_PERIOD: 'Đóng kỳ đánh giá',
  DELETE_PERIOD: 'Xóa kỳ đánh giá',
  DELETE_USER: 'Xóa nhân viên',
  DELETE_TEAM: 'Xóa nhóm',
  DELETE_CRITERIA_GROUP: 'Xóa nhóm tiêu chuẩn',
  DELETE_CRITERION: 'Xóa tiêu chuẩn',
  UPDATE_GRADE_BANDS: 'Cập nhật thang điểm',
  CHANGE_PASSWORD: 'Đổi mật khẩu',
  RESET_PASSWORD: 'Đặt lại mật khẩu',
};

const ENTITY_LABELS: Record<string, string> = {
  period: 'Kỳ đánh giá',
  user: 'Nhân viên',
  team: 'Nhóm',
  criteria_group: 'Nhóm tiêu chuẩn',
  criterion: 'Tiêu chuẩn',
  grade_bands: 'Thang điểm',
};

export default function AuditTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getAuditLogsAction({ limit: 50 });
      if (!cancelled) {
        if (!res.error && res.logs) setRows(res.logs);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <ScrollText className="w-4 h-4 text-indigo-600" />
          Nhật ký hoạt động gần đây
        </h3>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rectangular" height={40} className="rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Chưa có hoạt động nào"
            description="Nhật ký sẽ ghi lại các thao tác quản trị quan trọng."
          />
        ) : (
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600 shrink-0">
                  <Clock size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">
                    <span className="font-semibold">{row.actor_name || 'Không xác định'}</span>{' '}
                    <span className="text-slate-500">đã</span>{' '}
                    <span className="font-medium text-indigo-600">{ACTION_LABELS[row.action] || row.action}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {ENTITY_LABELS[row.entity] || row.entity}
                    {row.entity_id ? ` • ${row.entity_id.slice(0, 8)}` : ''}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {row.created_at ? new Date(row.created_at).toLocaleString('vi-VN') : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
