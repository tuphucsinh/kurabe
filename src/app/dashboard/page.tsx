'use client';

import React, { useMemo } from 'react';
import { StatCard } from '@/components/ui/StatCard';
import { GradeDistribution } from '@/components/charts/GradeDistribution';
import { Users, FileCheck, Clock, Activity } from 'lucide-react';
import { db } from '@/data/mock';

export default function DashboardPage() {
  // Aggregate data from mock db
  const { totalEmployees, completedEvals, pendingEvals } = useMemo(() => {
    const total = db.users.filter((u) => u.role === 'SubLeader' || u.role === 'Leader').length;
    const completed = db.evaluations.filter((e) => e.status === 'Approved').length;
    return {
      totalEmployees: total,
      completedEvals: completed,
      pendingEvals: total - completed
    };
  }, []);
  
  // Aggregate grades
  const gradeData = useMemo(() => {
    const counts: Record<string, number> = { S: 0, A: 0, AB: 0, B: 0, C: 0, D: 0 };
    db.evaluations.forEach((e) => {
      // Lấy kết quả từ round cuối cùng đã submit hoặc round 1 nếu chưa submit
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
  }, []);

  // Team status data
  const teamStatus = useMemo(() => {
    return db.teams.map((team) => {
      const members = db.users.filter((u) => u.teamId === team.id);
      const completedMembers = members.filter((m) => 
        db.evaluations.some((e) => e.employeeId === m.id && e.status === 'Approved')
      ).length;
      const progress = members.length > 0 ? Math.round((completedMembers / members.length) * 100) : 0;
      
      return {
        ...team,
        membersCount: members.length,
        progress
      };
    });
  }, []);

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng quan hệ thống</h1>
          <p className="text-slate-500 mt-1">Theo dõi tiến độ đánh giá năng lực QAQC năm 2026</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Tổng nhân sự" 
          value={totalEmployees} 
          icon={Users} 
          trend={{ value: 12, isPositive: true }} 
        />
        <StatCard 
          title="Đã đánh giá" 
          value={completedEvals} 
          icon={FileCheck} 
          trend={{ value: 8, isPositive: true }} 
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
          trend={{ value: 5, isPositive: true }} 
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
            {db.evaluations.slice(0, 5).map((evaluation) => {
              const employee = db.users.find(u => u.id === evaluation.employeeId);
              const evaluator = db.users.find(u => u.id === evaluation.rounds[evaluation.rounds.length - 1]?.evaluatorId);
              
              return (
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
              );
            })}
            {db.evaluations.length === 0 && (
              <div className="text-center py-6 text-slate-500 text-sm">Chưa có hoạt động nào</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
