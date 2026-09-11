'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { UserCircle, KeyRound, ShieldCheck, ShieldAlert, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeams } from '@/hooks/use-db';
import { useToast } from '@/components/ui/Toast';
import {
  changePassword,
  getAccountStatus,
  type AccountStatusResult,
} from '@/actions/account';

const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_BYTES = 72;

const ROLE_BADGE: Record<string, string> = {
  Manager: 'bg-indigo-100 text-indigo-700',
  Leader: 'bg-emerald-100 text-emerald-700',
  SubLeader: 'bg-sky-100 text-sky-700',
  Employee: 'bg-slate-100 text-slate-600',
  Worker: 'bg-amber-100 text-amber-700',
};

const ROLE_LABEL: Record<string, string> = {
  Manager: 'Quản lý',
  Leader: 'Leader',
  SubLeader: 'SubLeader',
  Employee: 'Nhân viên',
  Worker: 'Công nhân',
};

export default function AccountTab() {
  const { user } = useAuth();
  const { data: teams = [] } = useTeams(user);
  const { toast } = useToast();

  const [accountStatus, setAccountStatus] = useState<Extract<AccountStatusResult, { success: true }> | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Kiểm tra user đã đặt mật khẩu chưa và có yêu cầu setup token không (server-side, KHÔNG lộ hash)
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    (async () => {
      try {
        const res = await getAccountStatus();
        if (!cancelled) {
          if (res.success) {
            setAccountStatus(res);
            setStatusError(null);
          } else {
            setAccountStatus(null);
            setStatusError(res.error);
          }
        }
      } catch {
        if (!cancelled) {
          setAccountStatus(null);
          setStatusError('Không thể tải trạng thái xác thực tài khoản. Vui lòng thử lại.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingStatus(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const teamName = teams.find((t) => t.id === user?.teamId)?.name || 'Chưa gán';

  const handleSubmit = async () => {
    if (!user) return;
    setErrorMessage(null);

    // Tài khoản đang yêu cầu setup token không được phép tự đổi trực tiếp
    if (!accountStatus || accountStatus.setupRequired || !accountStatus.hasPassword) {
      const msg = statusError || 'Tài khoản đang yêu cầu thiết lập mật khẩu qua mã xác thực một lần do Quản lý cung cấp. Vui lòng sử dụng trang thiết lập mật khẩu.';
      setErrorMessage(msg);
      toast(msg, 'error');
      return;
    }

    if (!oldPassword) {
      const msg = 'Vui lòng nhập mật khẩu cũ.';
      setErrorMessage(msg);
      toast(msg, 'error');
      return;
    }

    const passwordByteLength = new TextEncoder().encode(newPassword).length;
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      const msg = `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
      setErrorMessage(msg);
      toast(msg, 'error');
      return;
    }

    if (passwordByteLength > MAX_PASSWORD_BYTES) {
      const msg = `Mật khẩu không được vượt quá ${MAX_PASSWORD_BYTES} byte UTF-8.`;
      setErrorMessage(msg);
      toast(msg, 'error');
      return;
    }

    if (newPassword !== confirmPassword) {
      const msg = 'Mật khẩu xác nhận không khớp.';
      setErrorMessage(msg);
      toast(msg, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const result = await changePassword(oldPassword, newPassword, confirmPassword);
      if (result.success) {
        toast('Đã đổi mật khẩu thành công.', 'success');
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setErrorMessage(null);
      } else {
        const msg = result.error || 'Lỗi khi lưu mật khẩu.';
        setErrorMessage(msg);
        toast(msg, 'error');
        if (result.code === 'SETUP_REQUIRED') {
          setAccountStatus({ success: true, hasPassword: true, setupRequired: true });
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Thông tin cá nhân */}
      <div className="bg-surface-raised rounded-2xl border border-outline-soft/60 shadow-sm p-6">
        <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
          <UserCircle className="w-4 h-4 text-brand" />
          Thông tin cá nhân
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-surface-muted">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-1">Mã nhân viên</p>
            <p className="font-semibold text-ink">{user.employeeCode}</p>
          </div>
          <div className="p-4 rounded-xl bg-surface-muted">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-1">Họ và tên</p>
            <p className="font-semibold text-ink">{user.name}</p>
          </div>
          <div className="p-4 rounded-xl bg-surface-muted">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-1">Chức vụ</p>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_BADGE[user.role] || ROLE_BADGE.Employee}`}>
              {ROLE_LABEL[user.role] || user.role}
            </span>
          </div>
          <div className="p-4 rounded-xl bg-surface-muted">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-muted mb-1">Nhóm</p>
            <p className="font-semibold text-ink">{teamName}</p>
          </div>
        </div>
      </div>

      {/* Quản lý mật khẩu */}
      <div className="bg-surface-raised rounded-2xl border border-outline-soft/60 shadow-sm p-6">
        <h3 className="text-sm font-bold text-ink uppercase tracking-wide mb-4 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-brand" />
          {accountStatus?.setupRequired || !accountStatus?.hasPassword ? 'Thiết lập mật khẩu' : 'Đổi mật khẩu'}
        </h3>

        {isLoadingStatus ? (
          <div className="flex items-center gap-3 py-6 text-sm text-ink-muted">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
            <span>Đang tải thông tin xác thực tài khoản...</span>
          </div>
        ) : statusError ? (
          <div role="alert" aria-live="assertive" className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm">
            {statusError}
          </div>
        ) : accountStatus?.setupRequired || !accountStatus?.hasPassword ? (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-ink space-y-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm text-ink">Yêu cầu thiết lập mật khẩu ban đầu</p>
                <p className="text-sm text-ink-muted mt-1">
                  Tài khoản của bạn đang yêu cầu thiết lập mật khẩu qua mã xác thực một lần do Quản lý cung cấp. Vui lòng sử dụng trang thiết lập mật khẩu để hoàn tất.
                </p>
              </div>
            </div>
            <div className="pt-2">
              <Link
                href="/setup-password"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white rounded-xl font-semibold text-sm hover:bg-brand-mid shadow-sm shadow-brand/20 transition-all active:scale-95"
              >
                <span>Đi tới trang Thiết lập mật khẩu</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-ink-muted mb-4">
              Đổi mật khẩu đăng nhập của bạn. Mật khẩu cũ được yêu cầu để xác minh và bảo vệ tài khoản.
            </p>

            {errorMessage && (
              <div role="alert" aria-live="assertive" className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-4 max-w-md">
              <div>
                <label htmlFor="old-password" className="block text-sm font-medium text-ink mb-1">
                  Mật khẩu cũ <span className="text-red-500">*</span>
                </label>
                <input
                  id="old-password"
                  type="password"
                  autoComplete="current-password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Nhập mật khẩu cũ"
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-soft text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand text-ink bg-surface-raised"
                />
              </div>

              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-ink mb-1">
                  Mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Từ 6 đến 72 ký tự"
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-soft text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand text-ink bg-surface-raised"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-ink mb-1">
                  Xác nhận mật khẩu mới <span className="text-red-500">*</span>
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full px-4 py-2.5 rounded-xl border border-outline-soft text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand text-ink bg-surface-raised"
                />
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand text-white rounded-xl font-semibold text-sm hover:bg-brand-mid shadow-sm shadow-brand/20 transition-all active:scale-95 disabled:opacity-50"
              >
                <ShieldCheck size={16} />
                {isSaving ? 'Đang lưu...' : 'Đổi mật khẩu'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
