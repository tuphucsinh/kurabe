import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getReportAggregation } from '@/actions/reports';
import { getPeriodSummary } from '@/actions/ai-summary';
import { getTeams } from '@/lib/db/teams';
import { getSessionUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/layout/PageHeader';
import { Users, Target, TrendingUp, Clock } from 'lucide-react';
import ReportFilters from '@/components/reports/ReportFilters';
import ExportReportButton from '@/components/reports/ExportReportButton';
import BatchResultMessageModal from '@/components/reports/BatchResultMessageModal';
import PeriodMinutesModal from '@/components/reports/PeriodMinutesModal';
import AiSummaryCard from '@/components/reports/AiSummaryCard';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import TeamComparison from '@/components/reports/TeamComparison';
import CriteriaHeatmap from '@/components/reports/CriteriaHeatmap';
import TopPerformers from '@/components/reports/TopPerformers';

export default async function ReportsPage({ searchParams }: { searchParams: { team?: string } }) {
  // Guard role: báo cáo toàn công ty — chỉ Manager/Leader (Phase 39). Employee chuyển về phiếu đánh giá.
  const viewer = await getSessionUser();
  if (!viewer || (viewer.role !== 'Manager' && viewer.role !== 'Leader')) {
    if (viewer?.role === 'Employee') {
      redirect(`/evaluations/${viewer.id}`);
    }
    redirect('/dashboard');
  }

  const cookieStore = await cookies();
  let periodId = cookieStore.get('selected_period_id')?.value;
  
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
  } catch (err) {
    console.error('Error fetching period in ReportsPage:', err);
  }

  const team = searchParams.team || 'all';
  const teams = await getTeams();
  const reportData = periodId ? await getReportAggregation(periodId, team) : null;
  const aiSummary = periodId ? await getPeriodSummary(periodId) : {};

  if (!reportData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-outline font-medium">Không có dữ liệu báo cáo cho kỳ đánh giá này.</p>
      </div>
    );
  }

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-6 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* 1. HEADER: Flex justify-between với Tiêu đề bên trái & KPI Compact Pill + Export Button bên phải */}
      <PageHeader 
        title="Báo cáo QAQC" 
        description="Tổng hợp kết quả đánh giá năng lực và chất lượng QAQC"
      >
        <div className="flex flex-wrap items-center gap-3">
          {/* KPI COMPACT pill trắng chia 4 */}
          <div className="bg-white px-4 py-2 rounded-2xl border border-outline-variant/60 shadow-sm flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-bold text-lg text-on-surface leading-none">{reportData.stats.totalEmployees}</span>
              <span className="text-xs text-outline font-medium">nhân sự</span>
            </div>
            <span className="text-outline-variant/60 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <Target className="w-4 h-4 text-primary shrink-0" />
              <span className="font-bold text-lg text-on-surface leading-none">{reportData.stats.avgScore.toFixed(1)}</span>
              <span className="text-xs text-outline font-medium">điểm TB</span>
            </div>
            <span className="text-outline-variant/60 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-green-600 shrink-0" />
              <span className="font-bold text-lg text-on-surface leading-none">{reportData.stats.highGradeRate.toFixed(1)}%</span>
              <span className="text-xs text-outline font-medium">≥ AB</span>
            </div>
            <span className="text-outline-variant/60 hidden sm:inline">•</span>
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-orange-600 shrink-0" />
              <span className="font-bold text-lg text-on-surface leading-none">{reportData.stats.pendingCount}</span>
              <span className="text-xs text-outline font-medium">chưa đánh giá</span>
            </div>
          </div>

          {viewer?.role === 'Manager' && (
            <>
              <PeriodMinutesModal periodId={periodId || ''} />
              <BatchResultMessageModal periodId={periodId || ''} />
            </>
          )}
          <ExportReportButton periodId={periodId || ''} />
        </div>
      </PageHeader>

      {/* 2. ReportFilters (giữ nguyên trên cùng dưới header) */}
      <ReportFilters teams={teams} />

      {/* 3. GradeDistribution (đưa LÊN ĐẦU nội dung, render full width, nén gọn) */}
      <GradeDistribution data={reportData.gradeDistribution} />

      {/* 4. GRID 2 CỘT: TRÁI = TeamComparison · PHẢI = CriteriaHeatmap */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamComparison teams={reportData.teamStats} />
        <CriteriaHeatmap data={reportData.criteriaAnalysis} />
      </div>

      {/* 5. GRID 2 CỘT: TRÁI = TopPerformers · PHẢI = AiSummaryCard */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TopPerformers employees={reportData.topPerformers} />
        <AiSummaryCard periodId={periodId || ''} initialSummary={aiSummary.summary} initialCreatedAt={aiSummary.created_at} />
      </div>
    </div>
  );
}
