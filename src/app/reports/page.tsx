'use client';

import { useState, useMemo } from 'react';
import { db, Grade } from '@/data/mock';
import { allCriteria } from '@/data/criteria';
import PageHeader from '@/components/layout/PageHeader';
import { 
  Users, 
  Target, 
  TrendingUp, 
  Clock,
  Filter,
  Download,
  Calendar
} from 'lucide-react';

import { GradeDistribution } from '@/components/charts/GradeDistribution';
import dynamic from 'next/dynamic';

const TeamComparison = dynamic(() => import('@/components/reports/TeamComparison'), { 
  ssr: false,
  loading: () => <div className="animate-pulse h-40 bg-slate-100 rounded-2xl" />
});
const CriteriaHeatmap = dynamic(() => import('@/components/reports/CriteriaHeatmap'), { 
  ssr: false,
  loading: () => <div className="animate-pulse h-40 bg-slate-100 rounded-2xl" />
});
const TopPerformers = dynamic(() => import('@/components/reports/TopPerformers'), { 
  ssr: false,
  loading: () => <div className="animate-pulse h-40 bg-slate-100 rounded-2xl" />
});

function KPICard({ title, value, unit, icon: Icon, colorClass, trend }: { 
  title: string, 
  value: string | number, 
  unit?: string,
  icon: React.ElementType,
  colorClass: string,
  trend?: string
}) {
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

export default function ReportsPage() {
  const [selectedTeam, setSelectedTeam] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-Q1');

  // 1. Data Aggregation
  const reportData = useMemo(() => {
    // Filter by team
    const filteredUsers = selectedTeam === 'all' 
      ? db.users.filter(u => u.role !== 'Manager') 
      : db.users.filter(u => u.teamId === selectedTeam && u.role !== 'Manager');

    const userIds = new Set(filteredUsers.map(u => u.id));
    
    // Filter evaluations
    const filteredEvals = db.evaluations.filter(e => userIds.has(e.employeeId));

    // Stats
    const totalEmployees = filteredUsers.length;
    const evaluatedCount = filteredEvals.length;
    const pendingCount = totalEmployees - evaluatedCount;
    
    const totalScore = filteredEvals.reduce((sum, e) => sum + (e.finalScore || e.rounds[e.rounds.length - 1]?.totalScore || 0), 0);
    const avgScore = evaluatedCount > 0 ? totalScore / evaluatedCount : 0;
    
    const highGrades = filteredEvals.filter(e => {
      const g = e.finalGrade || e.rounds[e.rounds.length - 1]?.grade;
      return g && ['S', 'A', 'AB'].includes(g);
    }).length;
    const highGradeRate = evaluatedCount > 0 ? (highGrades / evaluatedCount) * 100 : 0;

    // Grade Distribution
    const gradeColorMap: Record<string, string> = {
      'S': 'bg-amber-500',
      'A': 'bg-blue-600',
      'AB': 'bg-blue-400',
      'B': 'bg-green-500',
      'C': 'bg-orange-500',
      'D': 'bg-red-500'
    };

    const grades: Grade[] = ['S', 'A', 'AB', 'B', 'C', 'D'];
    const gradeDistribution = grades.map(g => ({
      grade: g,
      count: filteredEvals.filter(e => (e.finalGrade || e.rounds[e.rounds.length - 1]?.grade) === g).length,
      color: gradeColorMap[g] || 'bg-slate-400'
    }));

    // Team Comparison
    const teamStats = db.teams.map(t => {
      const teamUsers = db.users.filter(u => u.teamId === t.id);
      const teamEvals = db.evaluations.filter(e => teamUsers.some(u => u.id === e.employeeId));
      const teamAvg = teamEvals.length > 0 
        ? teamEvals.reduce((sum, e) => sum + (e.finalScore || e.rounds[e.rounds.length - 1]?.totalScore || 0), 0) / teamEvals.length 
        : 0;
      return {
        id: t.id,
        name: t.name,
        avgScore: teamAvg,
        progress: (teamAvg / 150) * 100 // Assume 150 is max
      };
    });

    // Criteria Group Analysis (A-F)
    const groups: ('A' | 'B' | 'C' | 'D' | 'E' | 'F')[] = ['A', 'B', 'C', 'D', 'E', 'F'];
    const flatCriteria = allCriteria.flatMap(g => g.criteria.map(c => ({ ...c, groupId: g.id })));
    const criteriaAnalysis = groups.map(group => {
      const groupCriteriaIds = flatCriteria.filter(c => c.groupId === group).map(c => c.id);
      let totalGroupScore = 0;
      let count = 0;

      filteredEvals.forEach(e => {
        const latestScores = e.rounds[e.rounds.length - 1]?.scores || {};
        groupCriteriaIds.forEach(cid => {
          if (latestScores[cid] !== undefined) {
            totalGroupScore += latestScores[cid];
            count++;
          }
        });
      });

      return {
        group,
        avgScore: count > 0 ? totalGroupScore / count : 0,
        percentage: count > 0 ? (totalGroupScore / (count * 5)) * 100 : 0 
      };
    });

    // Top Performers
    const topPerformers = filteredEvals
      .map(e => {
        const user = db.users.find(u => u.id === e.employeeId);
        const team = db.teams.find(t => t.id === user?.teamId);
        return {
          id: e.employeeId,
          name: user?.name || 'Unknown',
          teamName: team?.name || 'Unknown',
          score: e.finalScore || e.rounds[e.rounds.length - 1]?.totalScore || 0,
          grade: e.finalGrade || e.rounds[e.rounds.length - 1]?.grade || '-'
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    return {
      stats: {
        totalEmployees,
        avgScore,
        highGradeRate,
        pendingCount
      },
      gradeDistribution,
      teamStats,
      criteriaAnalysis,
      topPerformers
    };
  }, [selectedTeam]);

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      <PageHeader 
        title="Báo cáo QAQC" 
        description="Tổng hợp kết quả đánh giá năng lực và chất lượng QAQC"
      >
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm font-medium hover:bg-surface-container transition-colors">
            <Download className="w-4 h-4" />
            Xuất file
          </button>
        </div>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-2xl border border-outline-variant shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-container rounded-xl">
          <Filter className="w-4 h-4 text-outline" />
          <span className="text-sm font-medium text-outline">Lọc:</span>
        </div>
        
        <select 
          value={selectedTeam}
          onChange={(e) => setSelectedTeam(e.target.value)}
          className="px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        >
          <option value="all">Tất cả nhóm</option>
          {db.teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <select 
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="px-4 py-2 bg-white border border-outline-variant rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
        >
          <option value="2026-Q1">Quý 1 - 2026</option>
          <option value="2025-Q4">Quý 4 - 2025</option>
        </select>

        <div className="ml-auto text-sm text-outline flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          Dữ liệu cập nhật: 27/04/2026
        </div>
      </div>

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
          trend="+0.5" 
        />
        <KPICard 
          title="Tỉ lệ ≥ AB" 
          value={reportData.stats.highGradeRate.toFixed(1)} 
          unit="%" 
          icon={TrendingUp} 
          colorClass="bg-green-600"
          trend="+1.2%" 
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
              Mục tiêu Quý 1
            </h4>
            <p className="text-sm text-outline-variant font-medium leading-relaxed">
              Đạt tỉ lệ <strong className="text-primary font-bold">75%</strong> nhân sự xếp loại từ <strong className="text-primary font-bold">AB</strong> trở lên. 
              Hiện tại đang đạt <strong className="text-primary font-bold">{reportData.stats.highGradeRate.toFixed(1)}%</strong>.
            </p>
            <div className="mt-6 p-4 bg-white/50 rounded-2xl border border-primary/10">
              <div className="flex justify-between text-xs font-bold mb-2">
                <span className="text-outline">Tiến độ mục tiêu</span>
                <span className="text-primary">{((reportData.stats.highGradeRate / 75) * 100).toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full bg-primary/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-1000" 
                  style={{ width: `${Math.min(100, (reportData.stats.highGradeRate / 75) * 100)}%` }}
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
