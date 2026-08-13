'use client';

import { useMemo } from 'react';
import { Users, UserIcon, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers, useTeams } from '@/hooks/use-db';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export default function TeamsRolesTab() {
  const { user } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers(user);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(user);

  const isLoading = usersLoading || teamsLoading;

  const unassignedCount = useMemo(() => {
    return users.filter((u) => !u.teamId).length;
  }, [users]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Chưa có nhóm nào"
        description="Hệ thống chưa có nhóm QAQC."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {teams.map((team) => {
          const teamMembers = users.filter((u) => u.teamId === team.id);
          const leader = users.find((u) => u.id === team.leaderId);
          const subLeaders = users.filter(
            (u) => u.role === 'SubLeader' && u.teamId === team.id
          );
          const isMissingRole = !leader || subLeaders.length === 0;

          return (
            <div
              key={team.id}
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
            >
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    {team.name}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {teamMembers.length} thành viên
                  </p>
                </div>
              </div>

              {/* Vai trò */}
              <div className="space-y-3">
                {/* Leader */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-500" />
                    Leader
                  </span>
                  {leader ? (
                    <span className="bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                      {leader.name}
                    </span>
                  ) : (
                    <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                      Chưa có Leader
                    </span>
                  )}
                </div>

                {/* SubLeader */}
                <div className="flex items-start justify-between text-sm">
                  <span className="text-slate-500 font-medium flex items-center gap-1.5 pt-0.5">
                    <UserIcon className="w-4 h-4 text-sky-500" />
                    SubLeader
                  </span>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {subLeaders.length > 0 ? (
                      subLeaders.map((sub) => (
                        <span
                          key={sub.id}
                          className="bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full text-xs font-semibold"
                        >
                          {sub.name}
                        </span>
                      ))
                    ) : (
                      <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                        Chưa có SubLeader
                      </span>
                    )}
                  </div>
                </div>

                {/* Cảnh báo chung */}
                {isMissingRole && (
                  <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs rounded-lg p-3 flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                      Nhóm thiếu chức vụ — cập nhật tại trang Nhân viên.
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Alert nhân viên chưa gán nhóm */}
      {unassignedCount > 0 && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>
            {unassignedCount} nhân viên chưa gán nhóm — gán nhóm tại trang Nhân viên.
          </span>
        </div>
      )}
    </div>
  );
}
