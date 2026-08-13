import React from 'react';
import { supabase } from '@/lib/supabase';
import { getDashboardData } from '@/actions/dashboard';
import { PeriodSummary } from '@/components/dashboard/PeriodSummary';
import { EmptyState } from '@/components/ui/EmptyState';
import PendingReviews from '@/components/dashboard/PendingReviews';
import { cookies } from 'next/headers';
import ClientSkillGapRadar from '@/components/charts/ClientSkillGapRadar';


export default async function DashboardPage() {
  const cookieStore = await cookies();
  let periodId = cookieStore.get('selected_period_id')?.value;
  
  let currentPeriod = null;
  try {
    if (!periodId) {
      const { data: activePeriodData } = await supabase
        .from('evaluation_periods')
        .select('id')
        .eq('status', 'Active')
        .maybeSingle();
        
      if (activePeriodData) {
        periodId = activePeriodData.id;
      } else {
        const { data: fallbackPeriodData } = await supabase
          .from('evaluation_periods')
          .select('id')
          .order('year', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackPeriodData) {
          periodId = fallbackPeriodData.id;
        }
      }
    }

    if (periodId) {
      const { data } = await supabase.from('evaluation_periods').select('*').eq('id', periodId).maybeSingle();
      if (data) currentPeriod = data;
    }
  } catch (err) {
    console.error('Error loading evaluation period in DashboardPage:', err);
  }

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
          <PeriodSummary 
            stats={dashboardData.stats} 
            gradeDistribution={dashboardData.gradeDistribution} 
            totalEvaluationsCount={dashboardData.rawEvaluations.length} 
          />

          <PendingReviews evaluations={dashboardData.rawEvaluations} />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

            {/* Skill Gap Radar - Still needs raw evaluations for recharts, but we pass it directly */}
            <div className="lg:col-span-1">
              <ClientSkillGapRadar 
                evaluations={dashboardData.rawEvaluations} 
                criteriaGroups={dashboardData.rawCriteriaGroups} 
              />
            </div>

            {/* Recent Activities */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:col-span-1 2xl:col-span-1">
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
