'use client';

import { useMemo } from 'react';
import { Users, UserIcon, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUsers, useTeams } from '@/hooks/use-db';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { canHaveSubLeader } from '@/lib/role-policy';

export default function TeamsRolesTab() {
  const { user } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers(user);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(user);

  const isLoading = usersLoading || teamsLoading || !user;

  const unassignedCount = useMemo(() => {
    return users.filter((u) => !u.teamId).length;
  }, [users]);

  // Cảnh báo NV/Công nhân (role Employee/Worker) chưa được gán SubLeader (subleaderId == null)
  const unassignedSubLeaderEmployees = useMemo(() => {
    return users.filter(
      (u) =>
        canHaveSubLeader(u.role) &&
        (!u.subleaderId || u.subleaderId.trim() === '')
    );
  }, [users]);

  // Gom nhóm NV chưa gán SubLeader theo team
  const unassignedByTeam = useMemo(() => {
    const map: Record<string, { teamName: string; count: number }> = {};
    unassignedSubLeaderEmployees.forEach((u) => {
      const team = teams.find((t) => t.id === u.teamId);
      const key = u.teamId || 'unassigned';
      const teamName = team ? team.name : 'Chưa xếp nhóm';
      if (!map[key]) {
        map[key] = { teamName, count: 0 };
      }
      map[key].count += 1;
    });
    return Object.values(map);
  }, [unassignedSubLeaderEmployees, teams]);

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
      {/* Alert cảnh báo NV chưa gán SubLeader đặt ở đầu tab */}
      {unassignedSubLeaderEmployees.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              <strong className="font-semibold">
                {unassignedSubLeaderEmployees.length}
              </strong>{' '}
              nhân viên chưa được gán SubLeader
            </span>
          </div>
          {unassignedByTeam.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-7">
              {unassignedByTeam.map((item) => (
                <span
                  key={item.teamName}
                  className="inline-flex items-center gap-1 bg-amber-100/80 text-amber-900 border border-amber-300/60 px-2.5 py-0.5 rounded-full text-xs font-medium"
                >
                  <span>{item.teamName}:</span>
                  <span className="font-bold">{item.count} NV</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
              className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6"
            >
              {/* Header */}
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{team.name}</h3>
                  <p className="text-sm text-slate-500">
                    {teamMembers.length} thành viên
                  </p>
                </div>
              </div>

              {/* Vai trò */}
              <div className="space-y-4">
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
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium flex items-center gap-1.5">
                      <UserIcon className="w-4 h-4 text-sky-500" />
                      SubLeader
                    </span>
                    {subLeaders.length === 0 && (
                      <span className="bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full text-xs font-semibold">
                        Chưa có SubLeader
                      </span>
                    )}
                  </div>
                  {subLeaders.length > 0 && (
                    <div className="space-y-1.5 pl-5">
                      {subLeaders.map((sub) => (
                        <div
                          key={sub.id}
                          className="flex items-center justify-between text-xs py-1.5 px-3 bg-slate-50 rounded-xl border border-slate-100"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-slate-800 truncate">
                              {sub.name}
                            </span>
                            {sub.employeeCode && (
                              <span className="text-slate-400 font-mono text-[11px] shrink-0">
                                ({sub.employeeCode})
                              </span>
                            )}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0 ml-2 ${
                              sub.description && sub.description.trim() !== ''
                                ? 'bg-sky-100 text-sky-700 border border-sky-200/50'
                                : 'bg-slate-200/60 text-slate-500 italic'
                            }`}
                          >
                            {sub.description && sub.description.trim() !== ''
                              ? sub.description
                              : 'Chưa có chức danh'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
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
