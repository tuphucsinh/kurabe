'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Lock, User as UserIcon } from 'lucide-react';

export default function LoginPage() {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      await login(employeeCode, password);
      // Full reload — middleware đọc cookie auth_session và redirect chắc chắn
      // (router.push có thể bị kẹt nếu RSC navigation fail)
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Mã nhân viên không hợp lệ hoặc không tồn tại.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-outline-variant overflow-hidden">
        <div className="bg-primary p-6 text-center">
          <h1 className="text-2xl font-bold text-white tracking-wide">KURABE</h1>
          <p className="text-primary-light text-sm mt-1">QAQC Evaluation System</p>
        </div>
        
        <div className="p-8">
          <h2 className="text-xl font-semibold text-on-surface mb-6 text-center">Đăng nhập hệ thống</h2>
          
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="employeeCode" className="block text-sm font-medium text-on-surface mb-1">
                Mã nhân viên (Employee Code)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon size={18} className="text-outline" />
                </div>
                <input
                  id="employeeCode"
                  type="text"
                  value={employeeCode}
                  onChange={(e) => setEmployeeCode(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-outline-variant rounded-md leading-5 bg-white placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition duration-150 ease-in-out sm:text-sm"
                  placeholder="Nhập mã NV"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-on-surface mb-1">
                Mật khẩu
              </label>
              <p className="text-xs text-outline mb-1.5">Chưa đặt mật khẩu → chỉ cần nhập mã NV</p>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-outline" />
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-outline-variant rounded-md leading-5 bg-white placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition duration-150 ease-in-out sm:text-sm"
                  placeholder="Nhập mật khẩu"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-error bg-red-50 p-3 rounded-md border border-red-100">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors duration-200 mt-6"
            >
              Đăng nhập
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

