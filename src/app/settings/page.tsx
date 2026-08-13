'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, CalendarDays, UsersRound, Compass, Users, Scale } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Tabs from '@/components/ui/Tabs';
import PeriodsTab from '@/components/settings/PeriodsTab';
import TeamsRolesTab from '@/components/settings/TeamsRolesTab';

export default function SettingsPage() {
  const { isLoading, isManager } = useAuth();
  const [activeTab, setActiveTab] = useState('periods');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#003449] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-12 flex flex-col items-center justify-center text-center space-y-4">
          <div className="p-4 rounded-full bg-rose-50 text-rose-600">
            <ShieldAlert className="w-12 h-12" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">
            Chỉ Quản lý mới có quyền truy cập
          </h1>
          <p className="text-sm text-slate-500 max-w-md">
            Trang Cài đặt chỉ dành cho Quản lý. Liên hệ Quản lý nếu cần hỗ trợ.
          </p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'periods', label: 'Kỳ đánh giá', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'roles', label: 'Nhóm & Quyền', icon: <UsersRound className="w-4 h-4" /> },
    { id: 'quick', label: 'Điều hướng nhanh', icon: <Compass className="w-4 h-4" /> },
  ];

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Cài đặt</h1>
        <p className="text-slate-500 text-sm mt-1">
          Quản lý kỳ đánh giá, nhóm & quyền của hệ thống
        </p>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <div>
        {activeTab === 'periods' && <PeriodsTab />}
        {activeTab === 'roles' && <TeamsRolesTab />}
        {activeTab === 'quick' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <Link
              href="/employees"
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-lg hover:border-indigo-200 transition-all flex flex-col gap-4"
            >
              <div className="w-fit p-3 rounded-xl bg-indigo-50 text-indigo-600">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800">Nhân viên</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Quản lý danh sách nhân viên
                </p>
              </div>
            </Link>

            <Link
              href="/teams"
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-lg hover:border-indigo-200 transition-all flex flex-col gap-4"
            >
              <div className="w-fit p-3 rounded-xl bg-indigo-50 text-indigo-600">
                <UsersRound className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800">Nhóm</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Quản lý nhóm QAQC
                </p>
              </div>
            </Link>

            <Link
              href="/criteria"
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 hover:shadow-lg hover:border-indigo-200 transition-all flex flex-col gap-4"
            >
              <div className="w-fit p-3 rounded-xl bg-indigo-50 text-indigo-600">
                <Scale className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800">Tiêu chuẩn</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Quản lý tiêu chí đánh giá
                </p>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
