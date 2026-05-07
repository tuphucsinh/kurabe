'use client';

import React, { useMemo } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import { Users, FileCheck, Clock, Activity, Plus, Lock } from 'lucide-react';
import { useUsers, useEvaluations, useTeams } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { PeriodModal } from '@/components/modals/PeriodModal';
import { closeEvaluationPeriod } from '@/actions/period';
import { useState } from 'react';
import { User } from '@/types';
export default function DashboardPage() {
  const { currentPeriod, isManager, allPeriods } = useAuth();
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: evaluations = [], isLoading: evalsLoading } = useEvaluations(currentPeriod?.id);
  const { data: teams = [], isLoading: teamsLoading } = useTeams();

  const isLoading = usersLoading || evalsLoading || teamsLoading;

  const { userMap, usersByTeam } = useMemo(() => {
    const map = new Map<string, User>();
    const byTeam = new Map<string, User[]>();
    users.forEach(u => {
      map.set(u.id, u);
      if (u.teamId) {
        if (!byTeam.has(u.teamId)) {
          byTeam.set(u.teamId, []);
        }
        byTeam.get(u.teamId)!.push(u);
      }
    });
    return { userMap: map, usersByTeam: byTeam };
  }, [users]);

  // Aggregate data from database
  const { totalEmployees, completedEvals, pendingEvals } = useMemo(() => {
    const total = users.filter((u) => u.role !== 'Manager').length;
    const completed = evaluations.filter((e) => {
      const employee = userMap.get(e.employeeId);
      return e.status === 'Approved' && employee?.role !== 'Manager';
    }).length;
    return {
      totalEmployees: total,
      completedEvals: completed,
      pendingEvals: total - completed
    };
  }, [users, evaluations, userMap]);
  
  // Aggregate grades
  const gradeData = useMemo(() => {
    const counts: Record<string, number> = { S: 0, A: 0, AB: 0, B: 0, C: 0, D: 0 };
    evaluations.forEach((e) => {
      // Get result from finalGrade or latest round
      const latestRound = e.rounds[e.rounds.length - 1];
      const grade = e.finalGrade || latestRound?.grade;
      if (grade && counts[grade] !== undefined) {
        counts[grade]++;
      }
    });

    return [
      { grade: 'S', count: counts['S'], color: 'bg-indigo-500' },
      { grade: 'A', count: counts['A'], color: 'bg-emerald-500' },
      { grade: 'AB', count: counts['AB'], color: 'bg-teal-500' },
      { grade: 'B', count: counts['B'], color: 'bg-blue-500' },
      { grade: 'C', count: counts['C'], color: 'bg-amber-500' },
      { grade: 'D', count: counts['D'], color: 'bg-rose-500' },
    ];
  }, [evaluations]);

  // Team status data
  const teamStatus = useMemo(() => {
    return teams.map((team) => {
      const members = usersByTeam.get(team.id) || [];
      const completedMembers = members.filter((m) => 
        evaluations.some((e) => e.employeeId === m.id && e.status === 'Approved')
      ).length;
      const progress = members.length > 0 ? Math.round((completedMembers / members.length) * 100) : 0;
      
      return {
        ...team,
        membersCount: members.length,
        progress
      };
    });
  }, [teams, usersByTeam, evaluations]);

  const recentActivities = useMemo(() => {
    return evaluations.slice(0, 5).map((evaluation) => {
      const employee = userMap.get(evaluation.employeeId);
      const latestRound = evaluation.rounds[evaluation.rounds.length - 1];
      const evaluator = latestRound ? userMap.get(latestRound.evaluatorId) : undefined;
      return { evaluation, employee, evaluator };
    });
  }, [evaluations, userMap]);

  const handleClosePeriod = async () => {
    if (!currentPeriod || !window.confirm('Sau khi đóng, tất cả đánh giá trong kỳ này sẽ không thể chỉnh sửa. Bạn có chắc chắn?')) return;
    
    setIsClosing(true);
    try {
      const result = await closeEvaluationPeriod(currentPeriod.id);
      if (result.success) {
        window.location.reload(); // Refresh to update context
      } else {
        alert(result.error);
      }
    } finally {
      setIsClosing(false);
    }
  };

  const handlePeriodSuccess = () => {
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

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

        {isManager && (
          <div className="flex items-center gap-3">
            {currentPeriod?.status === 'Active' && (
              <button
                onClick={handleClosePeriod}
                disabled={isClosing}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors disabled:opacity-50"
              >
                <Lock size={16} />
                {isClosing ? 'Đang đóng...' : 'Đóng kỳ'}
              </button>
            )}
            
            {(!currentPeriod || !allPeriods.some(p => p.status === 'Active')) && (
              <button
                onClick={() => setIsPeriodModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all active:scale-95"
              >
                <Plus size={18} />
                Tạo kỳ mới
              </button>
            )}
          </div>
        )}
      </div>

      <PeriodModal 
        isOpen={isPeriodModalOpen} 
        onClose={() => setIsPeriodModalOpen(false)} 
        onSuccess={handlePeriodSuccess} 
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Tổng nhân sự" 
          value={totalEmployees} 
          icon={Users} 
        />
        <StatCard 
          title="Đã đánh giá" 
          value={completedEvals} 
          icon={FileCheck} 
        />
        <StatCard 
          title="Chờ xử lý" 
          value={pendingEvals} 
          icon={Clock} 
        />
        <StatCard 
          title="Tỉ lệ hoàn thành" 
          value={`${totalEmployees > 0 ? Math.round((completedEvals / totalEmployees) * 100) : 0}%`} 
          icon={Activity} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
        {/* Grade Distribution */}
        <div className="flex flex-col">
          <GradeDistribution data={gradeData} />
        </div>

        {/* Team Status */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Trạng thái theo nhóm</h3>
          <div className="space-y-6 flex-1">
            {teamStatus.map((team) => (
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

        {/* Recent Activities */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:col-span-2 2xl:col-span-1">
          <h3 className="text-lg font-semibold text-slate-800 mb-6">Hoạt động gần đây</h3>
          <div className="space-y-4 flex-1">
            {recentActivities.map(({ evaluation, employee, evaluator }) => (
              <div key={evaluation.id} className="flex items-start gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">
                  {evaluator?.name?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="text-sm text-slate-700">
                    <span className="font-semibold">{evaluator?.name || 'Unknown'}</span> đã {evaluation.status === 'Approved' ? 'phê duyệt' : 'gửi'} đánh giá cho <span className="font-semibold">{employee?.name || 'Unknown'}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Xếp loại: <span className="font-bold text-slate-600">{evaluation.finalGrade || evaluation.rounds[0]?.grade || '-'}</span> • {new Date(evaluation.createdAt).toLocaleDateString('vi-VN')}
                  </p>
                </div>
              </div>
            ))}
            {evaluations.length === 0 && (
              <div className="text-center py-6 text-slate-500 text-sm">Chưa có hoạt động nào</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
