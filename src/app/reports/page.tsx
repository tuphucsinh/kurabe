'use client';

import { useState, useMemo } from 'react';
import { useUsers, useTeams, useEvaluations, useCriteria } from '@/hooks/use-db';
import PageHeader from '@/components/layout/PageHeader';
import { 
  Users, 
  Target, 
  TrendingUp, 
  Clock,
  Filter,
  Download,
  Calendar,
  Loader2
} from 'lucide-react';

import { GradeDistribution } from '@/components/charts/GradeDistribution';
import dynamic from 'next/dynamic';
import { Grade, User } from '@/types';

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

import { useAuth } from '@/contexts/AuthContext';

export default function ReportsPage() {
  const { currentPeriod } = useAuth();
  const [selectedTeam, setSelectedTeam] = useState<string>('all');

  const { data: users = [], isLoading: loadingUsers } = useUsers();
  const { data: teams = [], isLoading: loadingTeams } = useTeams();
  const { data: evaluations = [], isLoading: loadingEvals } = useEvaluations(currentPeriod?.id);
  const { data: allCriteriaData = [], isLoading: loadingCriteria } = useCriteria();

  const isLoading = loadingUsers || loadingTeams || loadingEvals || loadingCriteria;

  // 1. Data Aggregation
  const reportData = useMemo(() => {
    if (isLoading) return null;

    // Pre-build Maps for O(1) lookups
    const userMap = new Map<string, User>();
    const usersByTeam = new Map<string, User[]>();
    
    users.forEach(u => {
      userMap.set(u.id, u);
      if (!usersByTeam.has(u.teamId)) {
        usersByTeam.set(u.teamId, []);
      }
      usersByTeam.get(u.teamId)!.push(u);
    });

    const teamMap = new Map(teams.map(t => [t.id, t]));

    // Filter by team
    const filteredUsers = selectedTeam === 'all' 
      ? users.filter(u => u.role !== 'Manager') 
      : (usersByTeam.get(selectedTeam) || []).filter(u => u.role !== 'Manager');

    const userIds = new Set(filteredUsers.map(u => u.id));
    
    // Filter evaluations
    const filteredEvals = evaluations.filter(e => userIds.has(e.employeeId));

    // Single-pass Grade & Criteria Counting
    let totalScore = 0;
    let highGrades = 0;
    const gradeCounts: Record<string, number> = {
      'S': 0, 'A': 0, 'AB': 0, 'B': 0, 'C': 0, 'D': 0
    };

    const criteriaGroupIdMap = new Map<string, string>();
    allCriteriaData.forEach(g => {
      g.criteria.forEach(c => criteriaGroupIdMap.set(c.id, g.code));
    });

    const criteriaGroupScores: Record<string, { totalGroupScore: number, count: number }> = {
      'A': { totalGroupScore: 0, count: 0 },
      'B': { totalGroupScore: 0, count: 0 },
      'C': { totalGroupScore: 0, count: 0 },
      'D': { totalGroupScore: 0, count: 0 },
      'E': { totalGroupScore: 0, count: 0 },
      'F': { totalGroupScore: 0, count: 0 }
    };

    filteredEvals.forEach(e => {
      const score = e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0);
      const grade = (e.finalGrade || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].grade : null)) as string;
      
      totalScore += score;
      
      if (grade) {
        if (['S', 'A', 'AB'].includes(grade)) highGrades++;
        if (gradeCounts[grade] !== undefined) gradeCounts[grade]++;
      }

      const latestScores = (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].scores : {}) as Record<string, number>;
      Object.entries(latestScores).forEach(([cid, s]) => {
        const groupId = criteriaGroupIdMap.get(cid);
        if (groupId && criteriaGroupScores[groupId]) {
          criteriaGroupScores[groupId].totalGroupScore += s;
          criteriaGroupScores[groupId].count++;
        }
      });
    });

    // Stats
    const totalEmployees = filteredUsers.length;
    const evaluatedCount = filteredEvals.length;
    const pendingCount = totalEmployees - evaluatedCount;
    const avgScore = evaluatedCount > 0 ? totalScore / evaluatedCount : 0;
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
      count: gradeCounts[g as string] || 0,
      color: gradeColorMap[g as string] || 'bg-slate-400'
    }));

    // Team Comparison
    const teamStatsMap = new Map<string, { id: string, name: string, totalScore: number, count: number }>();
    teams.forEach(t => teamStatsMap.set(t.id, { id: t.id, name: t.name, totalScore: 0, count: 0 }));

    evaluations.forEach(e => {
      const user = userMap.get(e.employeeId);
      if (user && teamStatsMap.has(user.teamId)) {
        const score = e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0);
        const teamStat = teamStatsMap.get(user.teamId)!;
        teamStat.totalScore += score;
        teamStat.count++;
      }
    });

    const teamStats = Array.from(teamStatsMap.values()).map(ts => {
      const teamAvg = ts.count > 0 ? ts.totalScore / ts.count : 0;
      return {
        id: ts.id,
        name: ts.name,
        avgScore: teamAvg,
        progress: (teamAvg / 150) * 100 // Assume 150 is max
      };
    });

    // Criteria Group Analysis (A-F)
    const groupCodes: string[] = ['A', 'B', 'C', 'D', 'E', 'F'];
    const criteriaAnalysis = groupCodes.map(group => {
      const stats = criteriaGroupScores[group] || { totalGroupScore: 0, count: 0 };
      return {
        group,
        avgScore: stats.count > 0 ? stats.totalGroupScore / stats.count : 0,
        percentage: stats.count > 0 ? (stats.totalGroupScore / (stats.count * 5)) * 100 : 0 
      };
    });

    // Top Performers
    const topPerformers = filteredEvals
      .map(e => {
        const user = userMap.get(e.employeeId);
        const team = teamMap.get(user?.teamId ?? '');
        return {
          id: e.employeeId,
          name: user?.name || 'Unknown',
          teamName: team?.name || 'Unknown',
          score: e.finalScore || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].totalScore : 0),
          grade: e.finalGrade || (e.rounds && e.rounds.length > 0 ? e.rounds[e.rounds.length - 1].grade : '-') as string
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
  }, [isLoading, users, teams, evaluations, allCriteriaData, selectedTeam]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
        <p className="text-outline font-medium">Đang tải dữ liệu báo cáo...</p>
      </div>
    );
  }

  if (!reportData) return null;

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
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl text-sm font-semibold text-indigo-600">
          <Calendar className="w-4 h-4" />
          <span>Kỳ {currentPeriod?.year}</span>
        </div>

        <div className="ml-auto text-sm text-outline flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Dữ liệu thời gian thực
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
              Mục tiêu {currentPeriod ? `Kỳ ${currentPeriod.year}` : 'Kỳ này'}
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
