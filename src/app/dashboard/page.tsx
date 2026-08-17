import React from 'react';
import { getDashboardData } from '@/actions/dashboard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Users, TrendingUp, CheckCircle2, Clock } from 'lucide-react';
import PendingReviews from '@/components/dashboard/PendingReviews';
import AnomalyAlertCard from '@/components/dashboard/AnomalyAlertCard';
import { cookies } from 'next/headers';
import LazySkillGapRadar from '@/components/charts/LazySkillGapRadar';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { resolveCurrentPeriod } from '@/lib/db/evaluations';
import { isIndividualRole } from '@/lib/role-policy';
import type { EvaluationPeriod } from '@/types';

export default async function DashboardPage() {
  const viewer = await getSessionUser();
  if (!viewer) {
    redirect('/login');
  }
  if (isIndividualRole(viewer?.role)) {
    redirect(`/evaluations/${viewer?.id}`);
  }

  // Giải kỳ hiện tại: cookie → kỳ Active → kỳ mới nhất (helper chung — C5)
  const preferredPeriodId = (await cookies()).get('selected_period_id')?.value;
  const currentPeriod: EvaluationPeriod | null = await resolveCurrentPeriod(preferredPeriodId);
  const periodId = currentPeriod?.id;

  const dashboardData = periodId ? await getDashboardData(periodId) : null;

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng quan hệ thống</h1>
          <p className="text-slate-500 mt-1">
            {currentPeriod ? (
              <>Theo dõi tiến độ đánh giá năng lực QAQC — <span className="text-indigo-600 font-semibold">Kỳ {currentPeriod.year}</span></>
            ) : (
              'Chưa có kỳ đánh giá nào được chọn'
            )}
          </p>
        </div>
      </div>

      {!dashboardData || dashboardData.stats.total === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-outline-variant flex items-center justify-center">
          <EmptyState 
            title="Chưa có dữ liệu đánh giá"
            description="Kỳ này hiện chưa có nhân sự hoặc chưa có đánh giá nào."
          />
        </div>
      ) : (
        <>
          {/* KPI Compact */}
          <div className="grid grid-cols-2 gap-3 md:flex md:items-center md:gap-4 md:flex-wrap">
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <Users size={18} className="text-primary shrink-0" />
              <span className="text-lg font-black text-slate-900">{dashboardData.stats.total}</span>
              <span className="text-sm text-slate-500">nhân sự</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <TrendingUp size={18} className="text-emerald-600 shrink-0" />
              <span className="text-lg font-black text-slate-900">{dashboardData.stats.percent}%</span>
              <span className="text-sm text-slate-500">tiến độ</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-600 shrink-0" />
              <span className="text-lg font-black text-slate-900">{dashboardData.stats.completed}/{dashboardData.stats.total}</span>
              <span className="text-sm text-slate-500">đã đánh giá</span>
            </div>
            <div className="bg-white rounded-2xl border border-outline-variant shadow-sm px-3 py-3 md:px-4 md:py-2.5 flex items-center gap-2">
              <Clock size={18} className="text-amber-600 shrink-0" />
              <span className="text-lg font-black text-slate-900">{dashboardData.stats.total - dashboardData.stats.completed}</span>
              <span className="text-sm text-slate-500">chưa xong</span>
            </div>
          </div>

          {/* Grid: TeamStatus | GradeDistribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Team Status */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:col-span-1">
              <h3 className="text-lg font-semibold text-slate-800 mb-6">Trạng thái theo nhóm</h3>
              <div className="space-y-6 flex-1">
                {dashboardData.teamStatus.map((team) => (
                  <div key={team.id} className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-medium text-slate-700">{team.name}</span>
                      <span className="text-slate-500">{team.progress}% ({team.membersCount} nhân viên)</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-out" 
                        style={{ width: `${team.progress}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Grade Distribution */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
              <h3 className="text-sm font-bold text-slate-800 mb-4">Phân bổ xếp loại</h3>
              <GradeDistribution data={dashboardData.gradeDistribution} />
            </div>
          </div>

          {/* Grid: PendingReviews | Anomaly */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PendingReviews evaluations={dashboardData.rawEvaluations} userNameById={dashboardData.userNameById} />
            <AnomalyAlertCard evaluations={dashboardData.rawEvaluations} userNameById={dashboardData.userNameById} isManager={viewer?.role === 'Manager'} />
          </div>

          {/* Grid: Radar | Recent */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <LazySkillGapRadar 
                evaluations={dashboardData.rawEvaluations} 
                criteriaGroups={dashboardData.rawCriteriaGroups} 
              />
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
              <h3 className="text-lg font-semibold text-slate-800 mb-6">Hoạt động gần đây</h3>
              <div className="space-y-4 flex-1">
                {dashboardData.recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">
                      {activity.evaluatorName?.charAt(0) || '?'}
                    </div>
                    <div>
                      <p className="text-sm text-slate-700">
                        <span className="font-semibold">{activity.evaluatorName}</span> đã {activity.status === 'Approved' ? 'phê duyệt' : 'gửi'} đánh giá cho <span className="font-semibold">{activity.employeeName}</span>
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Xếp loại: <span className="font-bold text-slate-600">{activity.grade}</span> • {new Date(activity.date).toLocaleDateString('vi-VN')}
                      </p>
                    </div>
                  </div>
                ))}
                {dashboardData.recentActivities.length === 0 && (
                  <div className="h-full flex items-center justify-center py-10">
                    <EmptyState 
                      title="Không có hoạt động"
                      description="Chưa có hoạt động đánh giá nào gần đây."
                      className="p-0"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
