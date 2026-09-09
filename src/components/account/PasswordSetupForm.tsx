'use client';

import React, { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import {
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { completePasswordSetup } from '@/actions/account';

interface PasswordSetupFormProps {
  initialToken?: string;
}

export default function PasswordSetupForm({ initialToken = '' }: PasswordSetupFormProps) {
  const [token, setToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorContext, setErrorContext] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Safe client-only fragment reading: read optional hash token (#token=... or #<64-hex>)
  // and immediately scrub it from browser location bar to avoid lingering in URL or history.
  // Never log to console, never store in localStorage or sessionStorage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const hash = window.location.hash;
      if (hash) {
        let candidate = '';
        if (hash.startsWith('#token=')) {
          candidate = hash.slice(7);
        } else if (hash.startsWith('#')) {
          candidate = hash.slice(1);
        }
        candidate = candidate.trim();
        if (/^[0-9a-f]{64}$/i.test(candidate)) {
          const sanitizedToken = candidate.toLowerCase();
          queueMicrotask(() => {
            setToken(sanitizedToken);
          });
          try {
            window.history.replaceState(null, '', window.location.pathname + (window.location.search || ''));
          } catch {
            // best-effort history sanitization
          }
        }
      }
    } catch {
      // ignore non-browser or sandbox errors
    }
  }, []);

  const handleClearError = () => {
    setError(null);
    setErrorContext(null);
  };

  const handleRetry = () => {
    handleClearError();
    const tokenInput = document.getElementById('setupToken') as HTMLInputElement | null;
    if (tokenInput) {
      tokenInput.focus();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    handleClearError();

    const cleanToken = token.trim().toLowerCase();

    // 1. No-token validation
    if (!cleanToken) {
      setError('Vui lòng nhập mã thiết lập mật khẩu một lần.');
      setErrorContext(null);
      return;
    }

    // 2. Token format validation (64 hex characters)
    if (!/^[0-9a-f]{64}$/i.test(cleanToken)) {
      setError('Mã thiết lập không hợp lệ. Mã phải là chuỗi 64 ký tự hex do Quản lý cung cấp.');
      setErrorContext('Vui lòng kiểm tra lại để đảm bảo bạn đã sao chép đầy đủ 64 ký tự của mã.');
      return;
    }

    // 3. Password length validation
    if (!newPassword || newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      setErrorContext(null);
      return;
    }

    if (newPassword.length > 72) {
      setError('Mật khẩu không được vượt quá 72 ký tự.');
      setErrorContext(null);
      return;
    }

    // 4. Password confirmation validation
    if (newPassword !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      setErrorContext(null);
      return;
    }

    setIsLoading(true);

    try {
      const result = await completePasswordSetup(cleanToken, newPassword, confirmPassword);
      if (result.success) {
        setIsSuccess(true);
        setToken('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        const errorMsg = result.error || 'Lỗi thiết lập mật khẩu. Vui lòng thử lại.';
        setError(errorMsg);
        if (
          errorMsg.includes('không hợp lệ hoặc đã hết hạn') ||
          errorMsg.includes('hết hạn') ||
          errorMsg.includes('không hợp lệ')
        ) {
          setErrorContext(
            'Mã thiết lập chỉ có hiệu lực trong 30 phút và chỉ dùng được 1 lần. Nếu Quản lý đã đặt lại mã mới hoặc mã đã hết hạn/đã sử dụng, vui lòng liên hệ Quản lý để nhận mã thiết lập mới.'
          );
        }
      }
    } catch {
      setError('Lỗi kết nối hoặc lỗi không xác định khi hoàn tất đặt mật khẩu. Vui lòng thử lại.');
      setErrorContext(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="space-y-6 text-center py-4" data-testid="setup-success-card">
        <div className="mx-auto w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
          <CheckCircle2 size={36} />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-ink">Thiết lập mật khẩu thành công!</h3>
          <p className="text-xs sm:text-sm text-ink-muted leading-relaxed max-w-sm mx-auto">
            Mật khẩu mới của bạn đã được cập nhật thành công. Mã thiết lập một lần đã được vô hiệu hóa an toàn. Bạn có thể sử dụng mật khẩu này để đăng nhập ngay bây giờ.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/login"
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl shadow-sm text-sm font-bold text-white bg-brand hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand transition-all active:scale-[0.99]"
          >
            <span>Đến trang đăng nhập</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5" noValidate>
      {/* Token Field */}
      <div>
        <label htmlFor="setupToken" className="block text-xs font-bold uppercase tracking-wider text-ink-muted mb-1.5">
          Mã thiết lập một lần (Setup Token)
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-muted">
            <KeyRound size={18} />
          </div>
          <input
            id="setupToken"
            name="setupToken"
            type="text"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              if (error) handleClearError();
            }}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            inputMode="text"
            disabled={isLoading}
            placeholder="Dán mã 64 ký tự hex do Quản lý cung cấp"
            className="block w-full pl-10 pr-3 py-2.5 rounded-xl border border-outline-soft font-mono text-xs sm:text-sm bg-surface-raised text-ink placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all disabled:opacity-60"
            aria-describedby={error ? 'setup-error-alert' : undefined}
          />
        </div>
        <p className="text-[11px] text-ink-muted mt-1">
          Mã bảo mật gồm 64 ký tự hex có hiệu lực trong vòng 30 phút.
        </p>
      </div>

      {/* New Password Field */}
      <div>
        <label htmlFor="newPassword" className="block text-xs font-bold uppercase tracking-wider text-ink-muted mb-1.5">
          Mật khẩu mới
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-muted">
            <Lock size={18} />
          </div>
          <input
            id="newPassword"
            name="newPassword"
            type={showNewPassword ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (error) handleClearError();
            }}
            autoComplete="new-password"
            disabled={isLoading}
            placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
            className="block w-full pl-10 pr-10 py-2.5 rounded-xl border border-outline-soft text-sm bg-surface-raised text-ink placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowNewPassword((v) => !v)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-muted hover:text-ink focus:outline-none"
            aria-label={showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          >
            {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Confirm Password Field */}
      <div>
        <label htmlFor="confirmPassword" className="block text-xs font-bold uppercase tracking-wider text-ink-muted mb-1.5">
          Xác nhận mật khẩu mới
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-ink-muted">
            <Lock size={18} />
          </div>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error) handleClearError();
            }}
            autoComplete="new-password"
            disabled={isLoading}
            placeholder="Nhập lại mật khẩu mới"
            className="block w-full pl-10 pr-10 py-2.5 rounded-xl border border-outline-soft text-sm bg-surface-raised text-ink placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword((v) => !v)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-ink-muted hover:text-ink focus:outline-none"
            aria-label={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          >
            {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </div>

      {/* Error & Retry Banner */}
      {error && (
        <div
          id="setup-error-alert"
          role="alert"
          aria-live="assertive"
          className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs sm:text-sm text-red-700 space-y-2 animate-in fade-in duration-150"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle size={18} className="shrink-0 text-red-600 mt-0.5" />
            <div className="space-y-1 flex-1">
              <p className="font-semibold text-red-800">{error}</p>
              {errorContext && (
                <p className="text-xs text-red-600 leading-relaxed">{errorContext}</p>
              )}
            </div>
          </div>
          <div className="pt-1 flex items-center justify-end">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-red-800 hover:text-red-900 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw size={13} />
              <span>Thử lại</span>
            </button>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-brand hover:bg-brand-mid focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed mt-6"
      >
        {isLoading ? (
          <>
            <RefreshCw size={18} className="animate-spin" />
            <span>Đang thiết lập mật khẩu...</span>
          </>
        ) : (
          <>
            <ShieldCheck size={18} />
            <span>Hoàn tất đặt mật khẩu</span>
          </>
        )}
      </button>

      {/* Return to Login */}
      <div className="pt-4 text-center border-t border-outline-soft/60">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-ink-muted hover:text-brand transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Quay lại trang đăng nhập</span>
        </Link>
      </div>
    </form>
  );
}
