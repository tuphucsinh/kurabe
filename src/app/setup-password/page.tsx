import type { Metadata } from 'next';
import PasswordSetupForm from '@/components/account/PasswordSetupForm';

export const metadata: Metadata = {
  title: 'Thiết lập mật khẩu | KURABE',
  description: 'Thiết lập mật khẩu mới cho tài khoản nhân viên Kurabe',
};

export default function SetupPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4 sm:p-6">
      <div className="w-full max-w-lg bg-surface-raised rounded-2xl shadow-xl border border-outline-soft overflow-hidden">
        <div className="bg-brand p-5 sm:p-6 text-center text-white">
          <h1 className="text-2xl font-bold tracking-wide">KURABE</h1>
          <p className="text-brand-soft text-xs sm:text-sm mt-1">QAQC Evaluation System</p>
        </div>

        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold text-ink">Thiết lập mật khẩu mới</h2>
            <p className="text-xs sm:text-sm text-ink-muted mt-1.5">
              Nhập mã thiết lập do Quản lý cung cấp và mật khẩu mới cho tài khoản của bạn.
            </p>
          </div>

          <PasswordSetupForm />
        </div>
      </div>
    </div>
  );
}
