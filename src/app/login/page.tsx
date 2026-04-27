'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { mockUsers } from '@/data/mock';
import { Lock, User as UserIcon } from 'lucide-react';

export default function LoginPage() {
  const [employeeId, setEmployeeId] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const router = useRouter();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      login(employeeId);
      router.push('/dashboard');
    } catch {
      setError('Employee ID không hợp lệ hoặc không tồn tại.');
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
              <label htmlFor="employeeId" className="block text-sm font-medium text-on-surface mb-1">
                Mã nhân viên (Employee ID)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <UserIcon size={18} className="text-outline" />
                </div>
                <input
                  id="employeeId"
                  type="text"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-outline-variant rounded-md leading-5 bg-white placeholder-outline focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition duration-150 ease-in-out sm:text-sm"
                  placeholder="Nhập mã NV (vd: u1, u2...)"
                  required
                />
              </div>
            </div>

            {/* Note: Password field is disabled for this mock version */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-on-surface mb-1">
                Mật khẩu
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-outline" />
                </div>
                <input
                  id="password"
                  type="password"
                  className="block w-full pl-10 pr-3 py-2 border border-outline-variant rounded-md leading-5 bg-surface text-outline cursor-not-allowed sm:text-sm"
                  placeholder="Không yêu cầu mật khẩu (Mock)"
                  disabled
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

          <div className="mt-8 pt-6 border-t border-outline-variant">
            <h3 className="text-sm font-medium text-on-surface mb-3">Tài khoản test (Mock Data):</h3>
            <div className="flex flex-wrap gap-2">
              {mockUsers.map(u => (
                <button
                  key={u.id}
                  onClick={() => setEmployeeId(u.id)}
                  className="text-xs bg-surface border border-outline-variant px-2 py-1 rounded hover:border-primary hover:text-primary transition-colors"
                >
                  <span className="font-semibold">{u.id}</span> - {u.role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
