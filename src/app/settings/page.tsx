'use client';

import { useState } from 'react';
import { CalendarDays, UsersRound, UserCircle, Gauge, ScrollText, Target } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Tabs from '@/components/ui/Tabs';
import PeriodsTab from '@/components/settings/PeriodsTab';
import TeamsRolesTab from '@/components/settings/TeamsRolesTab';
import AccountTab from '@/components/settings/AccountTab';
import GradeBandsTab from '@/components/settings/GradeBandsTab';
import AuditTab from '@/components/settings/AuditTab';
import TargetTab from '@/components/settings/TargetTab';

export default function SettingsPage() {
  const { isLoading, isManager, user } = useAuth();
  const [activeTab, setActiveTab] = useState(isManager ? 'periods' : 'account');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#003449] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  // Logout/chưa đăng nhập: KHÔNG hiện "Chỉ Quản lý" (tránh chớp màn hình khi logout) —
  // middleware sẽ redirect /login; hiện spinner chờ chuyển trang.
  if (!user) {
    return (
      <div className="min-h-screen bg-[#003449] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const adminTabs = [
    { id: 'periods', label: 'Kỳ đánh giá', icon: <CalendarDays className="w-4 h-4" /> },
    { id: 'grades', label: 'Thang điểm', icon: <Gauge className="w-4 h-4" /> },
    { id: 'roles', label: 'Nhóm & Quyền', icon: <UsersRound className="w-4 h-4" /> },
    { id: 'audit', label: 'Nhật ký', icon: <ScrollText className="w-4 h-4" /> },
    { id: 'target', label: 'Mục tiêu', icon: <Target className="w-4 h-4" /> },
  ];
  const tabs = isManager
    ? [{ id: 'account', label: 'Tài khoản', icon: <UserCircle className="w-4 h-4" /> }, ...adminTabs]
    : [{ id: 'account', label: 'Tài khoản', icon: <UserCircle className="w-4 h-4" /> }];

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
        {activeTab === 'account' && <AccountTab />}
        {activeTab === 'grades' && <GradeBandsTab />}
        {activeTab === 'roles' && <TeamsRolesTab />}
        {activeTab === 'audit' && <AuditTab />}
        {activeTab === 'target' && <TargetTab />}
      </div>
    </div>
  );
}
