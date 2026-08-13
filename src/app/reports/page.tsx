import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getReportAggregation } from '@/actions/reports';
import { getTeams } from '@/lib/db/teams';
import { getSessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/layout/PageHeader';
import { Users, Target, TrendingUp, Clock } from 'lucide-react';
import ReportFilters from '@/components/reports/ReportFilters';
import ExportReportButton from '@/components/reports/ExportReportButton';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import TeamComparison from '@/components/reports/TeamComparison';
import CriteriaHeatmap from '@/components/reports/CriteriaHeatmap';
import TopPerformers from '@/components/reports/TopPerformers';

interface KPICardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: React.ElementType;
  colorClass: string;
  trend?: string;
}

function KPICard({ title, value, unit, icon: Icon, colorClass, trend }: KPICardProps) {
  return (
    <div className="bg-white p-5 rounded-3xl border border-outline-variant shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2.5 rounded-2xl ${colorClass} bg-opacity-10 transition-colors group-hover:bg-opacity-20`}>
          <Icon className={`w-5 h-5 ${colorClass.replace('bg-', 'text-')}`} />
        </div>
        {trend && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${trend.startsWith('+') ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'}`}>
            {trend}
          </span>
        )}
      </div>
      <div>
        <h4 className="text-sm font-medium text-outline mb-1">{title}</h4>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-bold text-on-surface">{value}</span>
          {unit && <span className="text-sm font-medium text-outline-variant">{unit}</span>}
        </div>
      </div>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: { team?: string } }) {
  // Guard role: báo cáo toàn công ty — chỉ Manager/Leader (Phase 39)
  const viewer = await getSessionUser();
  if (!viewer || (viewer.role !== 'Manager' && viewer.role !== 'Leader')) {
    redirect('/dashboard');
  }

  const cookieStore = await cookies();
  let periodId = cookieStore.get('selected_period_id')?.value;
  let periodTarget = { rate: 75, grade: 'AB' as string };
  
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
      const { data: periodData } = await supabase
        .from('evaluation_periods')
        .select('target_rate, target_grade')
        .eq('id', periodId)
        .maybeSingle();
      if (periodData) {
        periodTarget = {
          rate: periodData.target_rate ?? 75,
          grade: periodData.target_grade || 'AB',
        };
      }
    }
  } catch (err) {
    console.error('Error fetching period in ReportsPage:', err);
  }

  const team = searchParams.team || 'all';
  const teams = await getTeams();
  const reportData = periodId ? await getReportAggregation(periodId, team) : null;

  if (!reportData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-outline font-medium">Không có dữ liệu báo cáo cho kỳ đánh giá này.</p>
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      <PageHeader 
        title="Báo cáo QAQC" 
        description="Tổng hợp kết quả đánh giá năng lực và chất lượng QAQC"
      >
        <div className="flex items-center gap-3">
          <ExportReportButton periodId={periodId || ''} />
        </div>
      </PageHeader>

      <ReportFilters teams={teams} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          title="Tổng nhân sự" 
          value={reportData.stats.totalEmployees} 
          icon={Users} 
          colorClass="bg-blue-600" 
        />
        <KPICard 
          title="Điểm trung bình" 
          value={reportData.stats.avgScore.toFixed(1)} 
          icon={Target} 
          colorClass="bg-primary"
        />
        <KPICard 
          title="Tỉ lệ ≥ AB" 
          value={reportData.stats.highGradeRate.toFixed(1)} 
          unit="%" 
          icon={TrendingUp} 
          colorClass="bg-green-600"
        />
        <KPICard 
          title="Chưa đánh giá" 
          value={reportData.stats.pendingCount} 
          icon={Clock} 
          colorClass="bg-orange-600" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <GradeDistribution data={reportData.gradeDistribution} />
        </div>
        <div className="lg:col-span-2">
          <TeamComparison teams={reportData.teamStats} />
        </div>

        <div className="lg:col-span-2">
          <TopPerformers employees={reportData.topPerformers} />
        </div>
        
        <div className="lg:col-span-1">
          <div className="bg-primary/5 p-8 rounded-3xl border border-primary/20 flex flex-col justify-center h-full">
            <h4 className="text-primary font-bold mb-3 flex items-center gap-2">
              <Target className="w-5 h-5" />
              Mục tiêu Kỳ này
            </h4>
            <p className="text-sm text-outline-variant font-medium leading-relaxed">
              Đạt tỉ lệ <strong className="text-primary font-bold">{periodTarget.rate}%</strong> nhân sự xếp loại từ <strong className="text-primary font-bold">{periodTarget.grade}</strong> trở lên. 
              Hiện tại đang đạt <strong className="text-primary font-bold">{reportData.stats.highGradeRate.toFixed(1)}%</strong>.
            </p>
            <div className="mt-6 p-4 bg-white/50 rounded-2xl border border-primary/10">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-outline">Tiến độ mục tiêu</span>
                <span className="text-primary">{((reportData.stats.highGradeRate / periodTarget.rate) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-1000" 
                  style={{ width: `${Math.min(100, (reportData.stats.highGradeRate / periodTarget.rate) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <CriteriaHeatmap data={reportData.criteriaAnalysis} />
        </div>
      </div>
    </div>
  );
}
