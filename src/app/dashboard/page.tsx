'use client';

import React, { useMemo, useState } from 'react';
import { Plus, Lock, Trash2, FileDown, Activity } from 'lucide-react';
import { exportEvaluationsToExcel } from '@/lib/export';
import { PeriodSummary } from '@/components/dashboard/PeriodSummary';
import { useUsers, useEvaluations, useTeams, useCriteria } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { PeriodModal } from '@/components/modals/PeriodModal';
import { closeEvaluationPeriod, deleteEvaluationPeriod } from '@/actions/period';
import { Skeleton, CardSkeleton, StatCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkillGapRadar } from '@/components/charts/SkillGapRadar';

import { User } from '@/types';
export default function DashboardPage() {
  const { currentPeriod, isManager, isLeader, allPeriods, user } = useAuth();
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const { data: users = [], isLoading: usersLoading, error: usersError } = useUsers(user);
  const { data: evaluations = [], isLoading: evalsLoading, error: evalsError } = useEvaluations(currentPeriod?.id, user);
  const { data: teams = [], isLoading: teamsLoading, error: teamsError } = useTeams(user);
  const { data: criteriaGroups = [], isLoading: criteriaLoading, error: criteriaError } = useCriteria();

  const error = usersError || evalsError || teamsError || criteriaError;

  const isLoading = usersLoading || evalsLoading || teamsLoading || criteriaLoading;

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

  const handleDeletePeriod = async () => {
    if (!currentPeriod) return;

    const confirmed = window.confirm(
      `Bạn sắp xóa vĩnh viễn Kỳ ${currentPeriod.year}. Hành động này sẽ xóa toàn bộ evaluations và rounds của kỳ này. Bạn có chắc chắn muốn tiếp tục?`
    );
    if (!confirmed) return;

    const expectedText = `XOA KY ${currentPeriod.year}`;
    const typedText = window.prompt(
      `Để xác nhận lần cuối, vui lòng nhập chính xác: ${expectedText}`
    );

    if (typedText !== expectedText) {
      alert('Xác nhận không khớp. Hủy thao tác xóa kỳ.');
      return;
    }

    setIsDeleting(true);
    try {
      const result = await deleteEvaluationPeriod(currentPeriod.id);
      if (result.success) {
        alert(`Đã xóa Kỳ ${currentPeriod.year} thành công.`);
        window.location.reload();
      } else {
        alert(result.error || 'Không thể xóa kỳ.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = async () => {
    if (!currentPeriod) return;
    setIsExporting(true);
    try {
      await exportEvaluationsToExcel(currentPeriod.id, { includeRoundDetails: true });
    } catch (error) {
      console.error(error);
      alert('Không thể xuất file Excel. Vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 w-full max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="space-y-2">
            <Skeleton variant="text" width={200} height={32} />
            <Skeleton variant="text" width={300} height={20} />
          </div>
          <div className="flex gap-3">
            <Skeleton variant="rectangular" width={100} height={40} className="rounded-xl" />
            <Skeleton variant="rectangular" width={120} height={40} className="rounded-xl" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
          <Activity size={32} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Đã có lỗi xảy ra</h2>
          <p className="text-slate-500 max-w-md mx-auto">
            Không thể tải dữ liệu hệ thống. Vui lòng kiểm tra kết nối mạng hoặc liên hệ quản trị viên.
          </p>
          <pre className="mt-4 p-4 bg-slate-50 rounded-lg text-xs text-rose-600 overflow-auto max-w-full">
            {error instanceof Error ? error.message : 'Unknown Database Error'}
          </pre>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Thử lại
        </button>
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

            {currentPeriod && (
              <button
                onClick={handleDeletePeriod}
                disabled={isDeleting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-rose-600 border border-rose-700 rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                <Trash2 size={16} />
                {isDeleting ? 'Đang xóa...' : 'Xóa kỳ'}
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

            {currentPeriod && (
              <button
                onClick={handleExportExcel}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all active:scale-95 disabled:opacity-50"
              >
                <FileDown size={18} />
                {isExporting ? 'Đang xuất...' : 'Xuất Excel'}
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

      {(isManager || isLeader) && evaluations.length > 0 ? (
        <PeriodSummary evaluations={evaluations} users={users} />
      ) : (isManager || isLeader) && evaluations.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-outline-variant flex items-center justify-center">
          <EmptyState 
            title="Chưa có dữ liệu đánh giá"
            description="Kỳ này hiện chưa có nhân viên nào được đánh giá. Hãy bắt đầu quy trình đánh giá cho nhân sự."
            action={isManager || isLeader ? {
              label: "Bắt đầu đánh giá",
              onClick: () => window.location.href = '/employees',
              icon: Plus
            } : undefined}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Team Status */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:col-span-1">
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

        {/* Skill Gap Radar */}
        {(isManager || isLeader) && (
          <div className="lg:col-span-1">
            <SkillGapRadar evaluations={evaluations} criteriaGroups={criteriaGroups} />
          </div>
        )}

        {/* Recent Activities */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col lg:col-span-1 2xl:col-span-1">
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
    </div>
  );
}
