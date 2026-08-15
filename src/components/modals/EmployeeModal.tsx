'use client';

import React, { useState, useMemo } from 'react';
import { X, User as UserIcon, Shield, FileText, Users, UserCheck, Hash, Calendar } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { User, Role } from '@/types';

export interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (employee: Partial<User>) => void;
  employee?: User | null;
  restrictToTeamId?: string | null;
  roleOptions?: Role[];
  allUsers: User[];
  teams: { id: string; name: string }[];
}

export default function EmployeeModal({
  isOpen,
  onClose,
  onSave,
  employee,
  restrictToTeamId,
  roleOptions,
  allUsers,
  teams,
}: EmployeeModalProps) {
  if (!isOpen) return null;

  return (
    <EmployeeModalContent
      key={`${employee?.id || 'new'}-${teams[0]?.id || ''}`}
      onClose={onClose}
      onSave={onSave}
      employee={employee}
      teams={teams}
      allUsers={allUsers}
      restrictToTeamId={restrictToTeamId}
      roleOptions={roleOptions}
    />
  );
}

interface EmployeeModalContentProps {
  onClose: () => void;
  onSave: (employee: Partial<User>) => void;
  employee?: User | null;
  teams: { id: string; name: string }[];
  allUsers: User[];
  restrictToTeamId?: string | null;
  roleOptions?: Role[];
}

function EmployeeModalContent({
  onClose,
  onSave,
  employee,
  teams,
  allUsers,
  restrictToTeamId,
  roleOptions,
}: EmployeeModalContentProps) {
  const { toast } = useToast();
  const allowedRoles: Role[] = roleOptions && roleOptions.length > 0 ? roleOptions : ['Manager', 'Leader', 'SubLeader', 'Employee'];
  const defaultRole = employee?.role && allowedRoles.includes(employee.role) ? employee.role : (allowedRoles[0] || 'Employee');
  const initialTeamId = employee?.teamId || restrictToTeamId || '';

  const [formData, setFormData] = useState<Partial<User>>({
    name: employee?.name || '',
    employeeCode: employee?.employeeCode || '',
    gender: employee?.gender || 'Nữ',
    role: defaultRole,
    teamId: initialTeamId,
    subleaderId: employee?.subleaderId || '',
    description: employee?.description || '',
    joinDate: employee?.joinDate || new Date().toISOString().split('T')[0],
  });

  // Filter options for SubLeader: role === 'SubLeader' AND teamId === current teamId AND id !== current employee id
  const subleaderOptions = useMemo(() => {
    if (!formData.teamId) return [];
    return allUsers.filter(
      (u) => u.role === 'SubLeader' && u.teamId === formData.teamId && u.id !== employee?.id
    );
  }, [allUsers, formData.teamId, employee?.id]);

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value as Role;
    setFormData((prev) => ({
      ...prev,
      role: newRole,
      teamId: newRole === 'Manager' ? undefined : prev.teamId,
      subleaderId: newRole === 'Employee' ? prev.subleaderId : '',
    }));
  };

  const handleTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTeamId = e.target.value;
    setFormData((prev) => ({
      ...prev,
      teamId: newTeamId,
      subleaderId: '', // Reset subleader when team changes
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalData: Partial<User> = { ...formData };

    if (restrictToTeamId) {
      finalData.teamId = restrictToTeamId;
    }

    if (finalData.role !== 'Manager' && !finalData.teamId) {
      toast('Vui lòng chọn nhóm cho nhân viên.', 'error');
      return;
    }

    if (finalData.role === 'Manager') {
      finalData.teamId = undefined;
      finalData.subleaderId = null;
    } else if (finalData.role !== 'Employee') {
      finalData.subleaderId = null;
    } else if (finalData.subleaderId) {
      // Validate client-side: subleader must belong to the same team
      const selectedSubLeader = allUsers.find((u) => u.id === finalData.subleaderId);
      if (selectedSubLeader && selectedSubLeader.teamId !== finalData.teamId) {
        finalData.subleaderId = null;
      }
    }

    onSave(finalData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-800">
            {employee ? 'Chỉnh sửa nhân viên' : 'Thêm nhân viên mới'}
          </h2>
          <button 
            onClick={onClose}
            type="button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Hash size={14} />
                Mã nhân viên
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700"
                placeholder="VD: EMP001"
                value={formData.employeeCode || ''}
                onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <UserIcon size={14} />
                Họ và tên
              </label>
              <input
                type="text"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700"
                placeholder="Nhập họ tên..."
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Shield size={14} />
                Chức vụ
              </label>
              <select
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700 bg-white"
                value={formData.role || 'Employee'}
                onChange={handleRoleChange}
              >
                {allowedRoles.map((role) => (
                  <option key={role} value={role}>
                    {role === 'Employee' ? 'Nhân viên' : role}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FileText size={14} />
                Chức danh
              </label>
              <input
                type="text"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700"
                placeholder="vd: Tổ trưởng, Trưởng ca..."
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          {formData.role !== 'Manager' && (
            <div className="grid grid-cols-2 gap-4">
              <div className={`space-y-2 ${formData.role !== 'Employee' ? 'col-span-2' : ''}`}>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <Users size={14} />
                  Nhóm
                </label>
                <select
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700 bg-white"
                  value={formData.teamId || ''}
                  onChange={handleTeamChange}
                  disabled={!!restrictToTeamId}
                >
                  <option value="" disabled>Chọn nhóm...</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>

              {formData.role === 'Employee' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                    <UserCheck size={14} />
                    SubLeader phụ trách
                  </label>
                  <select
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                    value={formData.subleaderId || ''}
                    onChange={(e) => setFormData({ ...formData, subleaderId: e.target.value || null })}
                    disabled={!formData.teamId}
                  >
                    {!formData.teamId ? (
                      <option value="">Chọn team trước</option>
                    ) : (
                      <>
                        <option value="">Chưa gán</option>
                        {subleaderOptions.map((sl) => (
                          <option key={sl.id} value={sl.id}>
                            {sl.name}{sl.employeeCode ? ` (${sl.employeeCode})` : ''}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <Calendar size={14} />
                Ngày vào công ty
              </label>
              <input
                type="date"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-slate-700"
                value={formData.joinDate || ''}
                onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <UserIcon size={14} />
                Giới tính
              </label>
              <div className="flex items-center gap-6 h-[42px]">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="gender"
                    value="Nữ"
                    checked={formData.gender !== 'Nam'}
                    onChange={() => setFormData({ ...formData, gender: 'Nữ' })}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  Nữ
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
                  <input
                    type="radio"
                    name="gender"
                    value="Nam"
                    checked={formData.gender === 'Nam'}
                    onChange={() => setFormData({ ...formData, gender: 'Nam' })}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
                  />
                  Nam
                </label>
              </div>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
            >
              {employee ? 'Cập nhật' : 'Thêm mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
