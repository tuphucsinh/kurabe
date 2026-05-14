'use client';

import { useState, useMemo } from 'react';
import { useUsers, useTeams, useEvaluations, useUpsertUser, useBatchUpsertUsers, useDeleteUser } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { User } from '@/types';
import { hasRoundDraft } from '@/data/workflow';
import DataTable, { Column } from '@/components/ui/DataTable';
import dynamic from 'next/dynamic';
const EmployeeModal = dynamic(() => import('@/components/modals/EmployeeModal'), { ssr: false });
import { Search, Filter, Plus, Edit2, FileText, ChevronDown, Users, Trash2, Upload, Loader2, Download } from 'lucide-react';
import { parseEmployeeExcel, downloadSampleExcel } from '@/lib/import';
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
  const fileInputRef = useState<HTMLInputElement | null>(null)[0]; // Actually I'll use a hidden input with ref

  const isLoading = usersLoading || teamsLoading || evalsLoading;

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

  // Sort state
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({
    key: 'name',
    direction: 'asc',
  });

  const sortedEmployees = useMemo(() => {
    if (!sortConfig.direction) return filteredEmployees;
    
    return [...filteredEmployees].sort((a, b) => {
      let aVal: string | number = a[sortConfig.key as keyof EmployeeTableItem] as string | number;
      let bVal: string | number = b[sortConfig.key as keyof EmployeeTableItem] as string | number;
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredEmployees, sortConfig]);

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
      deleteUser(id);
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
    
    upsertUser(payload);
  };

  const handleImportClick = () => {
    const input = document.getElementById('excel-import-input') as HTMLInputElement;
    if (input) input.click();
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
      const userMap = new Map(users.map(u => [u.employeeCode?.toLowerCase(), u.id]));
      
      const payloads: User[] = result.data.map(item => {
        const existingId = userMap.get((item.employeeCode ?? '').toLowerCase());
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
                  type="file" 
                  id="excel-import-input" 
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
        {sortedEmployees.length > 0 ? (
          <DataTable 
            columns={columns} 
            data={sortedEmployees} 
            sortKey={sortConfig.key}
            sortDirection={sortConfig.direction}
            onSort={handleSort}
            className="border-none rounded-none"
          />
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
          Tổng số: <b className="text-on-surface">{sortedEmployees.length}</b> nhân viên
        </p>
      </div>

      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        employee={editingEmployee}
        onSave={handleSaveEmployee}
        restrictToTeamId={isLeader ? (user?.teamId || null) : null}
        roleOptions={isLeader ? ['SubLeader', 'Employee'] : ['Manager', 'Leader', 'SubLeader', 'Employee']}
      />
    </div>
  );
}
