'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useUsers, useTeams, useEvaluations, useUpsertUser, useBatchUpsertUsers, useDeleteUser } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { User, Role } from '@/types';
import { hasRoundDraft } from '@/data/workflow';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Search, Filter, Plus, Edit2, FileText, ChevronDown, Users, Trash2, Upload, Loader2, Download, KeyRound, UserCheck, User as UserIcon, Shield, Hash, Calendar, X } from 'lucide-react';
import { parseEmployeeExcel, downloadSampleExcel } from '@/lib/import';
import { resetPassword } from '@/actions/account';
import Link from 'next/link';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Skeleton, TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface EmployeeTableItem extends User {
  teamName: string;
  grade: string;
  score: number;
  gradeRound: number | null;
  previousRoundScores: Array<{ round: number; score: number }>;
}

// Thứ tự chức vụ cho sort theo nhóm: Manager cuối (Toàn bộ bộ phận), Leader > SubLeader > Employee
const ROLE_ORDER: Record<string, number> = {
  Leader: 0,
  SubLeader: 1,
  Employee: 2,
  Manager: 3,
};

interface EmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (employee: Partial<User>) => void;
  employee?: User | null;
  restrictToTeamId?: string | null;
  roleOptions?: Role[];
  allUsers: User[];
  teams: { id: string; name: string }[];
}

function EmployeeModal({
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
  const allowedRoles: Role[] = roleOptions && roleOptions.length > 0 ? roleOptions : ['Manager', 'Leader', 'SubLeader', 'Employee'];
  const defaultRole = employee?.role && allowedRoles.includes(employee.role) ? employee.role : (allowedRoles[0] || 'Employee');
  const initialTeamId = employee?.teamId || restrictToTeamId || teams[0]?.id || '';

  const [formData, setFormData] = useState<Partial<User>>({
    name: employee?.name || '',
    employeeCode: employee?.employeeCode || '',
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

export default function EmployeesPage() {
  const { user } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers(user);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(user);
  const { data: evaluations = [], isLoading: evalsLoading } = useEvaluations(undefined, user);
  const { mutate: upsertUser } = useUpsertUser();
  const { mutateAsync: batchUpsertUsers } = useBatchUpsertUsers();
  const { mutate: deleteUser } = useDeleteUser();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const canManageEmployees = user?.role === 'Manager' || user?.role === 'Leader';
  const canDeleteEmployees = user?.role === 'Manager';
  const isManager = user?.role === 'Manager';
  const isLeader = user?.role === 'Leader';
  
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const isLoading = usersLoading || teamsLoading || evalsLoading;

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Computed data
  const employeesData = useMemo(() => {
    return users.map((user) => {
      const team = teams.find((t) => t.id === user.teamId);
      const userEvals = evaluations.filter((e) => e.employeeId === user.id);
      const latestEval = userEvals.length > 0
        ? [...userEvals].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
        : null;

      const latestScoredRound = latestEval?.rounds?.filter(hasRoundDraft) || [];
      const latestRound = latestScoredRound.length
        ? latestScoredRound.reduce((max, r) => r.round > max.round ? r : max, latestScoredRound[0])
        : null;
      const previousRoundScores = latestScoredRound
        .filter(r => latestRound ? r.round !== latestRound.round : true)
        .sort((a, b) => b.round - a.round)
        .map(r => ({ round: r.round, score: r.totalScore }));

      return {
        ...user,
        teamName: user.role === 'Manager' ? 'Toàn bộ bộ phận' : (team?.name || 'Chưa gán'),
        grade: latestEval?.finalGrade ?? latestRound?.grade ?? '-',
        score: latestEval?.finalScore ?? latestRound?.totalScore ?? 0,
        gradeRound: latestRound?.round ?? null,
        previousRoundScores,
      };
    });
  }, [users, teams, evaluations]);

  // Filtered data
  const filteredEmployees = useMemo(() => {
    return employeesData.filter((emp) => {
      const nameMatch = emp.name.toLowerCase().includes(searchTerm.toLowerCase());
      const codeMatch = emp.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSearch = nameMatch || codeMatch;
      const matchesTeam = teamFilter === 'all' || emp.teamId === teamFilter;
      const matchesRole = roleFilter === 'all' || emp.role === roleFilter;
      return matchesSearch && matchesTeam && matchesRole;
    });
  }, [employeesData, searchTerm, teamFilter, roleFilter]);

  // Sort state — mặc định theo Nhóm → Chức vụ (Leader > SubLeader > Employee) → Tên
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: 'teamName',
    direction: 'asc',
  });

  const sortedEmployees = useMemo(() => {
    if (!sortConfig.direction) return filteredEmployees;
    
    return [...filteredEmployees].sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      if (sortConfig.key === 'subleaderId') {
        aVal = a.subleaderId ? (userMap.get(a.subleaderId)?.name || '') : '';
        bVal = b.subleaderId ? (userMap.get(b.subleaderId)?.name || '') : '';
      } else {
        aVal = (a[sortConfig.key as keyof EmployeeTableItem] ?? '') as string | number;
        bVal = (b[sortConfig.key as keyof EmployeeTableItem] ?? '') as string | number;
      }
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      // Sort theo Nhóm: cùng nhóm → chức vụ → tên
      if (sortConfig.key === 'teamName') {
        if (aVal !== bVal) return sortConfig.direction === 'asc' ? (aVal < bVal ? -1 : 1) : (aVal > bVal ? -1 : 1);
        // Cùng nhóm → theo chức vụ (Leader trước, SubLeader, rồi Employee)
        const aRole = ROLE_ORDER[a.role] ?? 9;
        const bRole = ROLE_ORDER[b.role] ?? 9;
        if (aRole !== bRole) return sortConfig.direction === 'asc' ? aRole - bRole : bRole - aRole;
        // Cùng chức vụ → theo tên để ổn định
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        if (aName < bName) return -1;
        if (aName > bName) return 1;
        return 0;
      }
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredEmployees, sortConfig, userMap]);

  // Reset page when filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [searchTerm, teamFilter, roleFilter]);

  const totalPages = Math.ceil(sortedEmployees.length / itemsPerPage);
  
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedEmployees.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedEmployees, currentPage]);

  const handleSort = (key: string, direction: 'asc' | 'desc' | null) => {
    setSortConfig({ key, direction });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <Skeleton variant="text" width={200} height={32} />
            <Skeleton variant="text" width={300} height={20} />
          </div>
          <Skeleton variant="rectangular" width={140} height={40} className="rounded-xl" />
        </div>
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  const handleEdit = (employee: User) => {
    if (!canManageEmployees) {
      toast('Bạn không có quyền sửa nhân viên.', 'error');
      return;
    }
    if (isLeader) {
      if (!user?.teamId || employee.teamId !== user.teamId) {
        toast('Leader chỉ được sửa nhân viên trong nhóm mình quản lý.', 'error');
        return;
      }
      if (employee.role === 'Manager' || employee.role === 'Leader') {
        toast('Leader không được sửa tài khoản Manager/Leader.', 'error');
        return;
      }
    }
    setEditingEmployee(employee);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    if (!canManageEmployees) {
      toast('Bạn không có quyền thêm nhân viên.', 'error');
      return;
    }
    setEditingEmployee(null);
    setIsModalOpen(true);
  };
  
  const handleDelete = async (id: string, name: string) => {
    if (!canDeleteEmployees) {
      toast('Bạn không có quyền xóa nhân viên.', 'error');
      return;
    }
    
    const confirmed = await confirm({
      title: 'Xóa nhân viên',
      message: `Bạn có chắc chắn muốn xóa nhân viên "${name}"? Thao tác này không thể hoàn tác.`,
      confirmText: 'Xóa ngay',
      variant: 'danger'
    });

    if (confirmed) {
      deleteUser(id, {
        onSuccess: () => toast('Đã xóa nhân viên.', 'success'),
        onError: () => toast('Lỗi khi xóa nhân viên.', 'error')
      });
    }
  };

  const handleResetPassword = async (id: string, name: string) => {
    if (!isManager) {
      toast('Chỉ Quản lý mới có quyền đặt lại mật khẩu.', 'error');
      return;
    }

    const confirmed = await confirm({
      title: 'Đặt lại mật khẩu',
      message: `Đặt lại mật khẩu của "${name}"? Mật khẩu sẽ chuyển về TRỐNG — nhân viên sẽ tự đặt mật khẩu mới từ Cài đặt → Tài khoản.`,
      confirmText: 'Đặt lại',
      variant: 'warning'
    });

    if (!confirmed) return;

    const result = await resetPassword(id);
    if (result.success) {
      toast(`Đã đặt lại mật khẩu cho ${name}.`, 'success');
    } else {
      toast(result.error || 'Lỗi khi đặt lại mật khẩu.', 'error');
    }
  };

  const handleSaveEmployee = (data: Partial<User>) => {
    if (!canManageEmployees) {
      toast('Bạn không có quyền lưu thay đổi nhân viên.', 'error');
      return;
    }

    if (isLeader) {
      if (!user?.teamId) {
        toast('Leader chưa được gán nhóm nên không thể thêm/sửa nhân viên.', 'error');
        return;
      }

      const targetRole = data.role || editingEmployee?.role || 'Employee';
      if (targetRole === 'Manager' || targetRole === 'Leader') {
        toast('Leader chỉ được thêm/sửa Employee hoặc SubLeader trong nhóm mình quản lý.', 'error');
        return;
      }

      if (editingEmployee && editingEmployee.teamId !== user.teamId) {
        toast('Leader chỉ được sửa nhân viên trong nhóm mình quản lý.', 'error');
        return;
      }
    }

    const payload = editingEmployee 
      ? { ...editingEmployee, ...data } as User 
      : { 
          id: crypto.randomUUID(), 
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as User;

    if (isLeader && user?.teamId) {
      payload.teamId = user.teamId;
    }
    
    upsertUser(payload, {
      onSuccess: () => toast('Cập nhật nhân viên thành công!', 'success'),
      onError: (err) => {
        const msg = err instanceof Error ? err.message : 'Lỗi khi cập nhật nhân viên.';
        toast(msg, 'error');
      }
    });
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast('File quá lớn (tối đa 5MB).', 'error');
      return;
    }

    setIsImporting(true);
    try {
      const result = await parseEmployeeExcel(file, teams);
      
      if (result.errors.length > 0 && result.data.length === 0) {
        toast(`Lỗi import: ${result.errors[0]}`, 'error');
        setIsImporting(false);
        return;
      }

      // Match with existing users
      const codeMap = new Map(users.map(u => [u.employeeCode?.toLowerCase(), u.id]));
      
      const payloads: User[] = result.data.map(item => {
        const existingId = codeMap.get((item.employeeCode ?? '').toLowerCase());
        return {
          ...item,
          id: existingId || crypto.randomUUID(),
        } as User;
      });

      if (payloads.length > 0) {
        await batchUpsertUsers(payloads);
        toast(`Đã import thành công ${payloads.length} nhân viên.`, 'success');
      }
      
      if (result.errors.length > 0) {
        console.error('Import errors:', result.errors);
        toast(`Có ${result.errors.length} dòng bị lỗi. Kiểm tra console để biết chi tiết.`, 'warning');
      }
    } catch (error) {
      console.error('Import process error:', error);
      toast('Lỗi khi xử lý file import.', 'error');
    } finally {
      setIsImporting(false);
      e.target.value = ''; // Reset input
    }
  };

  const columns: Column<EmployeeTableItem>[] = [
    {
      key: 'name',
      header: 'Nhân viên',
      sortable: true,
      render: (item) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500">
            {item.name.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{item.name}</p>
            <p className="text-[11px] text-slate-400">Mã: {item.employeeCode || item.id.slice(0, 8)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'teamName',
      header: 'Nhóm',
      sortable: true,
      hiddenOnMobile: true,
      render: (item) => (
        <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-medium">
          {item.teamName}
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Chức vụ',
      sortable: true,
      hiddenOnMobile: true,
      render: (item) => (
        <span className={`text-xs font-medium ${
          item.role === 'Manager' ? 'text-rose-600' : 
          item.role === 'Leader' ? 'text-amber-600' : 
          item.role === 'SubLeader' ? 'text-blue-600' : 'text-slate-500'
        }`}>
          {item.role === 'Employee' ? 'Nhân viên' : item.role}
        </span>
      ),
    },
    {
      key: 'subleaderId',
      header: 'SubLeader',
      sortable: true,
      hiddenOnMobile: true,
      render: (item) => {
        if (item.role !== 'Employee') {
          return <span className="text-xs text-slate-400 font-medium">—</span>;
        }
        const subleader = item.subleaderId ? userMap.get(item.subleaderId) : null;
        return subleader ? (
          <span className="text-xs font-medium text-slate-700">
            {subleader.name}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 text-xs font-medium border border-rose-200">
            Chưa gán
          </span>
        );
      },
    },
    {
      key: 'description',
      header: 'Chức danh',
      sortable: true,
      hiddenOnMobile: true,
      render: (item) => (
        <span className="text-xs text-slate-600">
          {item.description || '—'}
        </span>
      ),
    },
    {
      key: 'grade',
      header: 'Xếp loại gần nhất',
      sortable: true,
      render: (item) => (
          <div className="flex items-center gap-2">
            <span className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-black ${
              item.grade === 'S' ? 'bg-indigo-100 text-indigo-700' :
              item.grade === 'A' ? 'bg-emerald-100 text-emerald-700' :
              item.grade === 'AB' ? 'bg-teal-100 text-teal-700' :
              item.grade === 'B' ? 'bg-blue-100 text-blue-700' :
              item.grade === 'C' ? 'bg-amber-100 text-amber-700' :
              item.grade === 'D' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-400'
            }`}>
              {item.grade}
            </span>
            <div className="flex items-end gap-2 tabular-nums">
              {item.gradeRound != null && (
                <div className="w-12 flex flex-col items-center leading-none">
                  <span className="text-xs text-slate-700 font-bold">L{item.gradeRound}</span>
                  <span className="text-base text-slate-800 font-bold mt-1">{item.score}</span>
                </div>
              )}
              {item.previousRoundScores.map((roundData) => (
                <div key={roundData.round} className="w-12 flex flex-col items-center leading-none opacity-55">
                  <span className="text-xs text-slate-500 font-medium">L{roundData.round}</span>
                  <span className="text-sm text-slate-500 font-medium mt-1">{roundData.score}</span>
                </div>
              ))}
            </div>
          </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <div className="flex justify-end gap-2">
          <Link
            href={`/evaluations/${item.id}`}
            className="p-2 text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
            title="Đánh giá"
          >
            <FileText size={18} />
          </Link>
          {canManageEmployees && (!isLeader || (item.teamId === user?.teamId && item.role !== 'Manager' && item.role !== 'Leader')) && (
            <button
              onClick={() => handleEdit(item)}
              className="p-2 text-outline hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
              title="Sửa"
            >
              <Edit2 size={18} />
            </button>
          )}
          {isManager && (
            <button
              onClick={() => handleResetPassword(item.id, item.name)}
              className="p-2 text-outline hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
              title="Đặt lại mật khẩu (về trống)"
            >
              <KeyRound size={18} />
            </button>
          )}
          {canDeleteEmployees && (
            <button
              onClick={() => handleDelete(item.id, item.name)}
              className="p-2 text-outline hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
              title="Xóa"
            >
              <Trash2 size={18} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">Quản lý Nhân sự QAQC</h1>
          <p className="text-on-surface-variant mt-1 text-sm md:text-base">Danh sách chi tiết nhân viên và kết quả đánh giá năng lực</p>
        </div>
        {canManageEmployees && (
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {isManager && (
              <>
                <button 
                  onClick={() => downloadSampleExcel(teams)}
                  className="px-4 py-3 bg-white text-slate-600 border border-outline-variant rounded-xl font-bold hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center justify-center gap-2"
                  title="Tải file mẫu"
                >
                  <Download size={20} />
                  <span className="hidden sm:inline">File mẫu</span>
                </button>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  className="hidden" 
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                />
                <button 
                  onClick={handleImportClick}
                  disabled={isImporting}
                  className="px-6 py-3 bg-white text-on-surface border border-outline-variant rounded-xl font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isImporting ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
                  Nhập từ Excel
                </button>
              </>
            )}
            <button 
              onClick={handleAdd}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group active:scale-95"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              Thêm nhân viên mới
            </button>
          </div>
        )}
      </div>

      {/* Filters Section */}
      <div className="flex flex-col xl:flex-row gap-4">
        <div className="relative flex-1 min-w-[300px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={20} />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên nhân viên hoặc mã số..."
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-outline-variant bg-surface focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-sm md:text-base"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4 lg:w-auto">
          <div className="relative w-full sm:w-[220px]">
            <select
              className="w-full pl-11 pr-10 py-3 rounded-xl border border-outline-variant bg-surface focus:bg-white focus:border-primary outline-none transition-all text-sm appearance-none font-medium text-on-surface"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
            >
              <option value="all">Tất cả Nhóm</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={18} />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
              <ChevronDown size={16} />
            </div>
          </div>

          <div className="relative w-full sm:w-[220px]">
            <select
              className="w-full pl-11 pr-10 py-3 rounded-xl border border-outline-variant bg-surface focus:bg-white focus:border-primary outline-none transition-all text-sm appearance-none font-medium text-on-surface"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="all">Tất cả Chức vụ</option>
              <option value="Manager">Manager</option>
              <option value="Leader">Leader</option>
              <option value="SubLeader">SubLeader</option>
              <option value="Employee">Nhân viên</option>
            </select>
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={18} />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-2xl border border-outline-variant shadow-sm overflow-hidden min-h-[400px] flex flex-col">
        {paginatedEmployees.length > 0 ? (
          <>
            <DataTable 
              columns={columns} 
              data={paginatedEmployees} 
              sortKey={sortConfig.key}
              sortDirection={sortConfig.direction}
              onSort={handleSort}
              className="border-none rounded-none flex-1"
            />
            {totalPages > 1 && (
              <div className="border-t border-outline-variant px-6 py-4 flex items-center justify-between bg-surface/50">
                <span className="text-sm text-outline">
                  Hiển thị {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, sortedEmployees.length)} trong {sortedEmployees.length} nhân viên
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-lg border border-outline-variant text-sm font-medium hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                  >
                    Trước
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                      .map((p, i, arr) => (
                        <React.Fragment key={p}>
                          {i > 0 && arr[i - 1] !== p - 1 && <span className="px-2 text-outline">...</span>}
                          <button
                            onClick={() => setCurrentPage(p)}
                            className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                              currentPage === p 
                                ? 'bg-primary text-white' 
                                : 'hover:bg-white text-on-surface-variant'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-lg border border-outline-variant text-sm font-medium hover:bg-white disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState 
              icon={Users}
              title="Không tìm thấy nhân viên"
              description={searchTerm || teamFilter !== 'all' || roleFilter !== 'all' 
                ? "Không có nhân viên nào khớp với bộ lọc hiện tại. Thử thay đổi điều kiện tìm kiếm."
                : "Chưa có nhân viên nào trong hệ thống. Hãy thêm nhân viên mới hoặc nhập từ Excel."
              }
              action={canManageEmployees ? {
                label: "Thêm nhân viên mới",
                onClick: handleAdd,
                icon: Plus
              } : undefined}
            />
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between px-2">
        <p className="text-sm text-outline font-medium">
          Tổng số: <b className="text-on-surface">{users.length}</b> nhân viên trong hệ thống
        </p>
      </div>

      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        employee={editingEmployee}
        onSave={handleSaveEmployee}
        restrictToTeamId={isLeader ? (user?.teamId || null) : null}
        roleOptions={isLeader ? ['SubLeader', 'Employee'] : ['Manager', 'Leader', 'SubLeader', 'Employee']}
        allUsers={users}
        teams={teams}
      />
    </div>
  );
}

