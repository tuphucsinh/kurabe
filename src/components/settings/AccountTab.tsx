'use client';

import { useEffect, useState } from 'react';
import { UserCircle, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeams } from '@/hooks/use-db';
import { useToast } from '@/components/ui/Toast';
import { changePassword } from '@/actions/account';
import { supabase } from '@/lib/supabase';

const ROLE_BADGE: Record<string, string> = {
  Manager: 'bg-indigo-100 text-indigo-700',
  Leader: 'bg-emerald-100 text-emerald-700',
  SubLeader: 'bg-sky-100 text-sky-700',
  Employee: 'bg-slate-100 text-slate-600',
};

const ROLE_LABEL: Record<string, string> = {
  Manager: 'Quản lý',
  Leader: 'Leader',
  SubLeader: 'SubLeader',
  Employee: 'Nhân viên',
};

export default function AccountTab() {
  const { user } = useAuth();
  const { data: teams = [] } = useTeams(user);
  const { toast } = useToast();

  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Kiểm tra user đã đặt mật khẩu chưa (chỉ cần biết null hay không — không lộ hash)
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('password_hash')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setHasPassword(Boolean(data?.password_hash));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const teamName = teams.find((t) => t.id === user?.teamId)?.name || 'Chưa gán';

  const handleSubmit = async () => {
    if (!user) return;

    if (!newPassword || newPassword.length < 6) {
      toast('Mật khẩu mới phải có ít nhất 6 ký tự.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast('Mật khẩu xác nhận không khớp.', 'error');
      return;
    }
    if (hasPassword && !oldPassword) {
      toast('Vui lòng nhập mật khẩu cũ.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const result = await changePassword(hasPassword ? oldPassword : null, newPassword);
      if (result.success) {
        toast(hasPassword ? 'Đã đổi mật khẩu thành công.' : 'Đã đặt mật khẩu thành công.', 'success');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setHasPassword(true);
      } else {
        toast(result.error || 'Lỗi khi lưu mật khẩu.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Thông tin cá nhân */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-indigo-600" />
          Thông tin cá nhân
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Mã nhân viên</p>
            <p className="font-semibold text-slate-800">{user.employeeCode}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Họ và tên</p>
            <p className="font-semibold text-slate-800">{user.name}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Chức vụ</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_BADGE[user.role] || ROLE_BADGE.Employee}`}>
              {ROLE_LABEL[user.role] || user.role}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-slate-50">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Nhóm</p>
            <p className="font-semibold text-slate-800">{teamName}</p>
          </div>
        </div>
      </div>

      {/* Đổi mật khẩu */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-4 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-indigo-600" />
          {hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {hasPassword
            ? 'Đổi mật khẩu đăng nhập của bạn. Mật khẩu cũ được yêu cầu để xác minh.'
            : 'Tài khoản của bạn chưa có mật khẩu. Đặt mật khẩu để sẵn sàng khi hệ thống bật đăng nhập bằng mật khẩu.'}
        </p>

        <div className="space-y-4 max-w-md">
          {hasPassword && (
            <div>
              <label htmlFor="old-password" className="block text-sm font-medium text-slate-700 mb-1">
                Mật khẩu cũ
              </label>
              <input
                id="old-password"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Nhập mật khẩu cũ"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
              />
            </div>
          )}
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-slate-700 mb-1">
              Mật khẩu mới
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Ít nhất 6 ký tự"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-medium text-slate-700 mb-1">
              Xác nhận mật khẩu mới
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Nhập lại mật khẩu mới"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50"
          >
            <ShieldCheck size={16} />
            {isSaving ? 'Đang lưu...' : hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu'}
          </button>
        </div>
      </div>
    </div>
  );
}
