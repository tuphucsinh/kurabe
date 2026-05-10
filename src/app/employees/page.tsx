'use client';

import { useState, useMemo } from 'react';
import { useUsers, useTeams, useEvaluations, useUpsertUser, useDeleteUser } from '@/hooks/use-db';
import { useAuth } from '@/contexts/AuthContext';
import { User } from '@/types';
import DataTable, { Column } from '@/components/ui/DataTable';
import dynamic from 'next/dynamic';
const EmployeeModal = dynamic(() => import('@/components/modals/EmployeeModal'), { ssr: false });
import { Search, Filter, Plus, Edit2, FileText, ChevronDown, Users, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface EmployeeTableItem extends User {
  teamName: string;
  grade: string;
  score: number;
  gradeRound: number | null;
}

export default function EmployeesPage() {
  const { user } = useAuth();
  const { data: users = [], isLoading: usersLoading } = useUsers(user);
  const { data: teams = [], isLoading: teamsLoading } = useTeams(user);
  const { data: evaluations = [], isLoading: evalsLoading } = useEvaluations(undefined, user);
  const { mutate: upsertUser } = useUpsertUser();
  const { mutate: deleteUser } = useDeleteUser();

  const [searchTerm, setSearchTerm] = useState('');
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);

  const isLoading = usersLoading || teamsLoading || evalsLoading;

  // Computed data
  const employeesData = useMemo(() => {
    return users.map((user) => {
      const team = teams.find((t) => t.id === user.teamId);
      const userEvals = evaluations.filter((e) => e.employeeId === user.id);
      const latestEval = userEvals.length > 0
        ? [...userEvals].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
        : null;

      const latestRound = latestEval?.rounds?.length
        ? latestEval.rounds.reduce((max, r) => r.round > max.round ? r : max, latestEval.rounds[0])
        : null;

      return {
        ...user,
        teamName: user.role === 'Manager' ? 'Toàn bộ bộ phận' : (team?.name || 'Chưa gán'),
        grade: latestEval?.finalGrade || latestRound?.grade || '-',
        score: latestEval?.finalScore || latestRound?.totalScore || 0,
        gradeRound: latestRound?.round ?? null,
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const handleEdit = (employee: User) => {
    setEditingEmployee(employee);
    setIsModalOpen(true);
  };

  const handleAdd = () => {
    setEditingEmployee(null);
    setIsModalOpen(true);
  };
  
  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa nhân viên "${name}"?`)) {
      deleteUser(id);
    }
  };

  const handleSaveEmployee = (data: Partial<User>) => {
    const payload = editingEmployee 
      ? { ...editingEmployee, ...data } as User 
      : { 
          id: crypto.randomUUID(), 
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as User;
    
    upsertUser(payload);
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
          <div className="flex flex-col">
            {item.gradeRound != null && (
              <span className="text-[10px] text-slate-400 font-medium leading-none">L{item.gradeRound}</span>
            )}
            <span className="text-xs text-slate-400 font-medium">{item.score}</span>
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
          <button
            onClick={() => handleEdit(item)}
            className="p-2 text-outline hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
            title="Sửa"
          >
            <Edit2 size={18} />
          </button>
          <button
            onClick={() => handleDelete(item.id, item.name)}
            className="p-2 text-outline hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
            title="Xóa"
          >
            <Trash2 size={18} />
          </button>
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
        <button 
          onClick={handleAdd}
          className="w-full md:w-auto px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group active:scale-95"
        >
          <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
          Thêm nhân viên mới
        </button>
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
      <div className="bg-white rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        <DataTable 
          columns={columns} 
          data={sortedEmployees} 
          sortKey={sortConfig.key}
          sortDirection={sortConfig.direction}
          onSort={handleSort}
          className="border-none rounded-none"
        />
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
      />
    </div>
  );
}

