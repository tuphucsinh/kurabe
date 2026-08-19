'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useBatchUpsertUsers, useDeleteUser } from '@/hooks/use-db';
import { getUsersBatchAction, getEvaluationSummariesBatchAction, getEmployeesPageDataAction } from '@/actions/read';
import { mergeUserBatches } from '@/lib/employee-batch-helpers';
import EmployeeEvaluationCell from '@/components/employees/EmployeeEvaluationCell';
import { upsertUserAction } from '@/actions/users';
import { useAuth } from '@/contexts/AuthContext';
import { User, Evaluation, Team } from '@/types';
import DataTable, { Column } from '@/components/ui/DataTable';
import { Search, Filter, Plus, Edit2, FileText, ChevronDown, Users, Trash2, Upload, Loader2, Download, KeyRound, RefreshCw } from 'lucide-react';
import { parseEmployeeExcel, downloadSampleExcel } from '@/lib/import';
import { resetPassword } from '@/actions/account';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { canHaveSubLeader, isManagementRole, roleLabel } from '@/lib/role-policy';

const EmployeeModal = dynamic(() => import('@/components/modals/EmployeeModal'));

function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

interface EmployeesClientProps {
  initialViewer: User;
}

interface EmployeeTableItem extends User {
  teamName: string;
  grade: string;
  score: number;
  gradeRound: number | null;
  previousRoundScores: Array<{ round: number; score: number }>;
  hasFinalResult: boolean;
  evaluationLoading: boolean;
  evaluationError?: boolean;
}

export default function EmployeesClient({ initialViewer }: EmployeesClientProps) {
  const { user: contextUser, currentPeriod, isLoading: authLoading } = useAuth();

  // Bootstrap-only effective viewer: initialViewer is active only while auth is loading;
  // after auth resolves (including resolve-to-null / logout), initialViewer is inactive.
  const effectiveViewer = authLoading ? (contextUser ?? initialViewer) : contextUser;

  const queryClient = useQueryClient();
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState<boolean>(true);
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const { mutateAsync: batchUpsertUsers } = useBatchUpsertUsers();
  const { mutate: deleteUser } = useDeleteUser();
  const { toast } = useToast();
  const confirm = useConfirm();

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Batch state
  const [users, setUsers] = useState<User[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [userBatchError, setUserBatchError] = useState<string | null>(null);

  // Evaluation summaries batch state (by employeeId)
  const [evaluationsMap, setEvaluationsMap] = useState<Record<string, Evaluation>>({});
  const [evalLoadingMap, setEvalLoadingMap] = useState<Record<string, boolean>>({});
  const [evalErrorMap, setEvalErrorMap] = useState<Record<string, boolean>>({});

  // Generation token to ignore stale async responses after filter/period changes
  const generationRef = useRef<number>(0);

  // Modal & permissions reconciled from effectiveViewer
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const canManageEmployees = effectiveViewer?.role === 'Manager' || effectiveViewer?.role === 'Leader';
  const canDeleteEmployees = effectiveViewer?.role === 'Manager';
  const isManager = effectiveViewer?.role === 'Manager';
  const isLeader = effectiveViewer?.role === 'Leader';

  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentPeriodId = currentPeriod?.id;

  // Primitive viewer identity & scope dependencies to prevent unnecessary refetches
  const viewerId = effectiveViewer?.id ?? null;
  const viewerRole = effectiveViewer?.role ?? null;
  const viewerTeamId = effectiveViewer?.teamId ?? null;
  const viewerScopeKey = `${viewerId ?? 'anonymous'}:${viewerRole ?? 'norole'}:${viewerTeamId ?? 'noteam'}`;

  // Track viewer state to handle logout / identity change / scope mismatch
  const prevViewerRef = useRef<{ id: string | null; role: string | null; teamId: string | null } | null>({
    id: initialViewer?.id ?? null,
    role: initialViewer?.role ?? null,
    teamId: initialViewer?.teamId ?? null,
  });

  // Reconcile viewer changes: clear state on logout or identity/scope change
  useEffect(() => {
    let isCancelled = false;
    const prev = prevViewerRef.current;
    const current = { id: viewerId, role: viewerRole, teamId: viewerTeamId };

    const hasChanged = !prev || prev.id !== current.id || prev.role !== current.role || prev.teamId !== current.teamId;

    if (hasChanged) {
      prevViewerRef.current = current;
      generationRef.current += 1;
      const currentGen = generationRef.current;

      void Promise.resolve().then(() => {
        if (isCancelled || generationRef.current !== currentGen) return;

        setUsers([]);
        setTeams([]);
        setTeamsLoading(true);
        setTeamsError(null);
        setEvaluationsMap({});
        setEvalLoadingMap({});
        setEvalErrorMap({});
        setTotalCount(0);
        setHasMore(false);
        setUserBatchError(null);
        setIsModalOpen(false);
        setEditingEmployee(null);

        if (!effectiveViewer) {
          setIsInitialLoading(false);
          setTeamsLoading(false);
        }
      });
    }

    return () => {
      isCancelled = true;
    };
  }, [viewerId, viewerRole, viewerTeamId, effectiveViewer]);

  // Fetch evaluations batch for a list of employee IDs
  const fetchEvaluationsForIds = useCallback(async (ids: string[], periodId: string, gen: number) => {
    if (!ids.length || !periodId) return;

    setEvalLoadingMap((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      return next;
    });
    setEvalErrorMap((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      return next;
    });

    try {
      const evals = await getEvaluationSummariesBatchAction(ids, periodId);
      if (generationRef.current !== gen) return;

      setEvaluationsMap((prev) => {
        const next = { ...prev };
        for (const ev of evals) {
          if (ev.employeeId) {
            next[ev.employeeId] = ev;
          }
        }
        return next;
      });
    } catch (err) {
      console.error('Error fetching evaluation summaries batch:', err);
      if (generationRef.current === gen) {
        setEvalErrorMap((prev) => {
          const next = { ...prev };
          for (const id of ids) next[id] = true;
          return next;
        });
      }
    } finally {
      if (generationRef.current === gen) {
        setEvalLoadingMap((prev) => {
          const next = { ...prev };
          for (const id of ids) delete next[id];
          return next;
        });
      }
    }
  }, []);

  // Fetch initial batch (teams + first 20 users + summaries) using effective viewer
  const loadInitialBatch = useCallback(async () => {
    if (!viewerId || !viewerScopeKey) {
      setIsInitialLoading(false);
      setTeamsLoading(false);
      return;
    }
    const currentScopeKey = viewerScopeKey;
    generationRef.current += 1;
    const currentGen = generationRef.current;

    setIsInitialLoading(true);
    setTeamsLoading(true);
    setIsLoadingMore(false);
    setUserBatchError(null);
    setTeamsError(null);
    setEvaluationsMap({});
    setEvalLoadingMap({});
    setEvalErrorMap({});

    try {
      const pageData = await getEmployeesPageDataAction(currentPeriodId, {
        offset: 0,
        limit: 20,
        search: debouncedSearchTerm,
        teamId: teamFilter,
        role: roleFilter,
      });

      if (generationRef.current !== currentGen || viewerScopeKey !== currentScopeKey) return;

      // Handle teams
      if (pageData.teamsError) {
        setTeamsError(pageData.teamsError);
      } else {
        setTeams(pageData.teams);
        setTeamsError(null);
      }

      // Handle users
      if (pageData.usersError) {
        setUserBatchError(pageData.usersError);
        setUsers([]);
        setHasMore(false);
        setTotalCount(0);
      } else {
        setUsers(pageData.users.items);
        setHasMore(pageData.users.hasMore);
        setTotalCount(pageData.users.totalCount);
        setUserBatchError(null);
      }

      // Handle summaries
      if (pageData.summariesError) {
        if (pageData.users.items.length > 0) {
          setEvalErrorMap((prev) => {
            const next = { ...prev };
            for (const u of pageData.users.items) next[u.id] = true;
            return next;
          });
        }
      } else {
        setEvaluationsMap(pageData.summaries || {});
      }
    } catch (err) {
      console.error('Error fetching initial employees page data:', err);
      if (generationRef.current === currentGen) {
        setUserBatchError('Không thể tải danh sách nhân viên. Vui lòng thử lại.');
      }
    } finally {
      if (generationRef.current === currentGen) {
        setIsInitialLoading(false);
        setTeamsLoading(false);
      }
    }
  }, [viewerId, viewerScopeKey, debouncedSearchTerm, teamFilter, roleFilter, currentPeriodId]);

  useEffect(() => {
    let isCancelled = false;
    void Promise.resolve().then(() => {
      if (!isCancelled) {
        loadInitialBatch();
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [loadInitialBatch]);

  // Load more users (next 20 users)
  const handleLoadMore = async () => {
    if (isLoadingMore || isInitialLoading || !hasMore || !effectiveViewer) return;
    const currentGen = generationRef.current;

    setIsLoadingMore(true);
    setUserBatchError(null);

    try {
      const nextOffset = users.length;
      const res = await getUsersBatchAction({
        offset: nextOffset,
        limit: 20,
        search: debouncedSearchTerm,
        teamId: teamFilter,
        role: roleFilter,
      });

      if (generationRef.current !== currentGen) return;

      const merged = mergeUserBatches(users, res.items);
      setUsers(merged);
      setHasMore(res.hasMore);
      setTotalCount(res.totalCount);

      const newIds = res.items.map((u) => u.id).filter((id) => !evaluationsMap[id]);
      if (newIds.length > 0 && currentPeriodId) {
        fetchEvaluationsForIds(newIds, currentPeriodId, currentGen);
      }
    } catch (err) {
      console.error('Error loading more users:', err);
      if (generationRef.current === currentGen) {
        setUserBatchError('Không thể tải thêm nhân viên. Vui lòng thử lại.');
      }
    } finally {
      if (generationRef.current === currentGen) {
        setIsLoadingMore(false);
      }
    }
  };

  // Retry evaluation fetch for an employee
  const handleRetryEvaluation = useCallback((employeeId: string) => {
    if (!currentPeriodId) return;
    fetchEvaluationsForIds([employeeId], currentPeriodId, generationRef.current);
  }, [currentPeriodId, fetchEvaluationsForIds]);

  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  // Computed employee items — teamsLoading does not block row display
  const employeesData: EmployeeTableItem[] = useMemo(() => {
    return users.map((userItem) => {
      const team = teams.find((t) => t.id === userItem.teamId);
      const rawEval = evaluationsMap[userItem.id] || null;
      const evalItem =
        rawEval && (!currentPeriodId || !rawEval.periodId || rawEval.periodId === currentPeriodId)
          ? rawEval
          : null;
      const isEvalLoading = !!evalLoadingMap[userItem.id];
      const isEvalError = !!evalErrorMap[userItem.id];

      const latestScoredRound = evalItem?.rounds?.filter(
        (r) => r.status !== 'Draft' && r.status !== 'NotStarted' && (r.status === 'Submitted' || (r.status as string) === 'Reviewed' || (r.status as string) === 'Approved' || !!r.submittedAt)
      ) || [];
      const latestRound = latestScoredRound.length
        ? latestScoredRound.reduce((max, r) => r.round > max.round ? r : max, latestScoredRound[0])
        : null;
      const previousRoundScores = latestScoredRound
        .filter((r) => latestRound ? r.round !== latestRound.round : true)
        .sort((a, b) => b.round - a.round)
        .map((r) => ({ round: r.round, score: r.totalScore }));

      return {
        ...userItem,
        teamName: userItem.role === 'Manager'
          ? 'Toàn bộ bộ phận'
          : team
          ? team.name
          : teamsError
          ? 'Lỗi tải nhóm'
          : teamsLoading
          ? 'Đang tải...'
          : 'Chưa gán',
        grade: evalItem?.finalGrade ?? latestRound?.grade ?? '-',
        score: evalItem?.finalScore ?? latestRound?.totalScore ?? 0,
        gradeRound: latestRound?.round ?? null,
        previousRoundScores,
        hasFinalResult: !!evalItem?.finalGrade,
        evaluationLoading: isEvalLoading,
        evaluationError: isEvalError,
      };
    });
  }, [users, teams, teamsLoading, teamsError, evaluationsMap, evalLoadingMap, evalErrorMap, currentPeriodId]);

  const handleEdit = (employee: User) => {
    if (!canManageEmployees) {
      toast('Bạn không có quyền sửa nhân viên.', 'error');
      return;
    }
    if (isLeader) {
      if (!effectiveViewer?.teamId || employee.teamId !== effectiveViewer.teamId) {
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
      variant: 'danger',
    });

    if (confirmed) {
      deleteUser(id, {
        onSuccess: () => {
          toast('Đã xóa nhân viên.', 'success');
          loadInitialBatch();
        },
        onError: () => toast('Lỗi khi xóa nhân viên.', 'error'),
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
      variant: 'warning',
    });

    if (!confirmed) return;

    const result = await resetPassword(id);
    if (result.success) {
      toast(`Đã đặt lại mật khẩu cho ${name}.`, 'success');
    } else {
      toast(result.error || 'Lỗi khi đặt lại mật khẩu.', 'error');
    }
  };

  const handleSaveEmployee = async (data: Partial<User>) => {
    if (!canManageEmployees) {
      toast('Bạn không có quyền lưu thay đổi nhân viên.', 'error');
      return;
    }

    if (isLeader) {
      if (!effectiveViewer?.teamId) {
        toast('Leader chưa được gán nhóm nên không thể thêm/sửa nhân viên.', 'error');
        return;
      }

      const targetRole = data.role || editingEmployee?.role || 'Employee';
      if (targetRole === 'Manager' || targetRole === 'Leader') {
        toast('Leader chỉ được thêm/sửa Nhân viên, Công nhân hoặc SubLeader trong nhóm mình quản lý.', 'error');
        return;
      }

      if (editingEmployee && editingEmployee.teamId !== effectiveViewer.teamId) {
        toast('Leader chỉ được sửa nhân viên trong nhóm mình quản lý.', 'error');
        return;
      }
    }

    const payload = editingEmployee
      ? ({ ...editingEmployee, ...data } as User)
      : ({
          id: crypto.randomUUID(),
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as User);

    if (isLeader && effectiveViewer?.teamId) {
      payload.teamId = effectiveViewer.teamId;
    }

    try {
      const result = await upsertUserAction(payload);
      if (result.success) {
        toast('Cập nhật nhân viên thành công!', 'success');
        queryClient.invalidateQueries({ queryKey: ['teams'] });
        queryClient.invalidateQueries({ queryKey: ['users'] });
        queryClient.invalidateQueries({ queryKey: ['employees-page-data'] });
        loadInitialBatch();
      } else {
        toast(result.error || 'Lỗi khi cập nhật nhân viên.', 'error');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi cập nhật nhân viên.';
      toast(msg, 'error');
    }
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

      const codeMap = new Map(users.map((u) => [u.employeeCode?.toLowerCase(), u.id]));

      const payloads: User[] = result.data.map((item) => {
        const existingId = codeMap.get((item.employeeCode ?? '').toLowerCase());
        return {
          ...item,
          id: existingId || crypto.randomUUID(),
        } as User;
      });

      if (payloads.length > 0) {
        await batchUpsertUsers(payloads);
        toast(`Đã import thành công ${payloads.length} nhân viên.`, 'success');
        loadInitialBatch();
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
      e.target.value = '';
    }
  };

  const columns: Column<EmployeeTableItem>[] = [
    {
      key: 'name',
      header: 'Nhân viên',
      render: (item) => (
        <div className="flex items-center gap-3">
          <div>
            <Link
              prefetch={false}
              href={`/evaluations/${item.id}`}
              className="font-semibold text-slate-900 hover:text-primary hover:underline"
              title="Đánh giá"
            >
              {item.name}
            </Link>
            <p className="text-[11px] text-slate-400">Mã: {item.employeeCode || item.id.slice(0, 8)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'teamName',
      header: 'Nhóm',
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
      hiddenOnMobile: true,
      render: (item) => (
        <span
          className={`text-xs font-medium ${
            item.role === 'Manager'
              ? 'text-rose-600'
              : item.role === 'Leader'
              ? 'text-amber-600'
              : item.role === 'SubLeader'
              ? 'text-blue-600'
              : item.role === 'Worker'
              ? 'text-emerald-600'
              : 'text-slate-500'
          }`}
        >
          {roleLabel(item.role)}
        </span>
      ),
    },
    {
      key: 'subleaderId',
      header: 'SubLeader',
      hiddenOnMobile: true,
      render: (item) => {
        if (!canHaveSubLeader(item.role)) {
          return <span className="text-xs text-slate-400 font-medium">—</span>;
        }
        const subleader = item.subleaderId ? userMap.get(item.subleaderId) : null;
        return subleader ? (
          <span className="text-xs font-medium text-slate-700">{subleader.name}</span>
        ) : item.subleaderId ? (
          <span className="text-xs font-medium text-slate-700">Đã gán</span>
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
      hiddenOnMobile: true,
      render: (item) => (
        <span className="text-xs text-slate-600">
          {isManagementRole(item.role) ? item.description || '—' : '—'}
        </span>
      ),
    },
    {
      key: 'grade',
      header: 'Xếp loại',
      render: (item) => (
        <EmployeeEvaluationCell
          grade={item.grade}
          score={item.score}
          gradeRound={item.gradeRound}
          previousRoundScores={item.previousRoundScores}
          hasFinalResult={item.hasFinalResult}
          evaluationLoading={item.evaluationLoading}
          evaluationError={item.evaluationError}
          employeeId={item.id}
          onRetry={handleRetryEvaluation}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (item) => (
        <div className="flex justify-end gap-2">
          <Link
            prefetch={false}
            href={`/evaluations/${item.id}`}
            className="p-2 text-outline hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
            title="Đánh giá"
          >
            <FileText size={18} />
          </Link>
          {canManageEmployees &&
            (!isLeader ||
              (item.teamId === effectiveViewer?.teamId && item.role !== 'Manager' && item.role !== 'Leader')) && (
              <button
                type="button"
                onClick={() => handleEdit(item)}
                className="p-2 text-outline hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
                title="Sửa"
              >
                <Edit2 size={18} />
              </button>
            )}
          {isManager && (
            <button
              type="button"
              onClick={() => handleResetPassword(item.id, item.name)}
              className="p-2 text-outline hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
              title="Đặt lại mật khẩu (về trống)"
            >
              <KeyRound size={18} />
            </button>
          )}
          {canDeleteEmployees && (
            <button
              type="button"
              onClick={() => handleDelete(item.id, item.name)}
              className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
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
    <div data-load-layer="shell" className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">
            Quản lý Nhân sự QAQC
          </h1>
          <p className="text-on-surface-variant mt-1 text-sm md:text-base">
            Danh sách chi tiết nhân viên và kết quả đánh giá năng lực
          </p>
        </div>
        {canManageEmployees && (
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            {isManager && (
              <>
                <button
                  type="button"
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
                  type="button"
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
              type="button"
              onClick={handleAdd}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 group active:scale-95"
            >
              <Plus size={20} className="group-hover:rotate-90 transition-transform duration-300" />
              Thêm nhân viên
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
            placeholder="Tìm tên hoặc mã NV"
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-outline-variant bg-surface focus:bg-white focus:border-primary focus:ring-4 focus:ring-primary/5 outline-none transition-all text-sm md:text-base"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-4 lg:w-auto">
          <div className="relative w-full sm:w-[220px]">
            <select
              className="w-full pl-11 pr-10 py-3 rounded-xl border border-outline-variant bg-surface focus:bg-white focus:border-primary outline-none transition-all text-sm appearance-none font-medium text-on-surface disabled:opacity-60"
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              disabled={teamsLoading && teams.length === 0}
            >
              <option value="all">
                {teamsError
                  ? 'Lỗi tải nhóm'
                  : teamsLoading && teams.length === 0
                  ? 'Đang tải nhóm...'
                  : 'Tất cả Nhóm'}
              </option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
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
              <option value="Worker">Công nhân</option>
            </select>
            <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" size={18} />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-outline">
              <ChevronDown size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* Notice on teams error */}
      {teamsError && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-center justify-between">
          <span>Không thể tải danh sách nhóm: {teamsError}</span>
        </div>
      )}

      {/* Table Section */}
      <div data-load-layer="light" className="bg-white rounded-2xl border border-outline-variant shadow-sm overflow-hidden min-h-[400px] flex flex-col">
        {isInitialLoading ? (
          <div className="w-full overflow-hidden rounded-xl border-none bg-white">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[600px] md:min-w-0">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-outline-variant bg-surface/50 backdrop-blur-md">
                    {columns.map((column) => (
                      <th
                        key={column.key as string}
                        className={`px-4 py-3 text-[11px] font-bold text-outline uppercase tracking-wider ${
                          column.hiddenOnMobile ? 'hidden md:table-cell' : ''
                        }`}
                      >
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className={`h-[48px] ${i % 2 === 1 ? 'bg-surface/30' : ''}`}>
                      <td className="px-4 py-2">
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-32 rounded" />
                          <Skeleton className="h-3 w-20 rounded" />
                        </div>
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell">
                        <Skeleton className="h-5 w-24 rounded-md" />
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell">
                        <Skeleton className="h-4 w-16 rounded" />
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell">
                        <Skeleton className="h-4 w-20 rounded" />
                      </td>
                      <td className="px-4 py-2 hidden md:table-cell">
                        <Skeleton className="h-4 w-12 rounded" />
                      </td>
                      <td className="px-4 py-2">
                        <div data-load-layer="heavy" className="flex items-center gap-2">
                          <Skeleton className="w-8 h-8 rounded-lg" />
                          <div className="w-12 flex flex-col items-center gap-1">
                            <Skeleton className="h-3 w-6 rounded" />
                            <Skeleton className="h-4 w-8 rounded" />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2">
                          <Skeleton className="w-8 h-8 rounded-lg" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : employeesData.length > 0 ? (
          <>
            <DataTable
              columns={columns}
              data={employeesData}
              className="border-none rounded-none flex-1"
            />

            {/* Load More & Batch Status Controls */}
            <div className="border-t border-outline-variant px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface/50">
              <span className="text-sm text-outline">
                Đã tải {employeesData.length} / {totalCount} nhân viên
              </span>

              {userBatchError ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-rose-600 font-medium">{userBatchError}</span>
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm font-bold hover:bg-rose-100 transition-colors"
                  >
                    Thử lại
                  </button>
                </div>
              ) : hasMore ? (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40 active:scale-95"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Đang tải thêm...</span>
                    </>
                  ) : (
                    <span>Tải thêm (+20 nhân viên)</span>
                  )}
                </button>
              ) : (
                <span className="text-xs text-slate-400 font-medium">
                  Đã hiển thị toàn bộ danh sách
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            {userBatchError ? (
              <div className="text-center py-12 px-4 space-y-4">
                <p className="text-rose-600 font-medium">{userBatchError}</p>
                <button
                  type="button"
                  onClick={() => loadInitialBatch()}
                  className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all inline-flex items-center gap-2"
                >
                  <RefreshCw size={16} />
                  Thử lại
                </button>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="Không tìm thấy nhân viên"
                description={
                  debouncedSearchTerm || teamFilter !== 'all' || roleFilter !== 'all'
                    ? 'Không có nhân viên nào khớp với bộ lọc hiện tại. Thử thay đổi điều kiện tìm kiếm.'
                    : 'Chưa có nhân viên nào trong hệ thống. Hãy thêm nhân viên mới hoặc nhập từ Excel.'
                }
                action={
                  canManageEmployees
                    ? {
                        label: 'Thêm nhân viên',
                        onClick: handleAdd,
                        icon: Plus,
                      }
                    : undefined
                }
              />
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between px-2">
        <div className="text-sm text-outline font-medium">
          {isInitialLoading ? (
            <Skeleton className="h-5 w-64 rounded inline-block" />
          ) : (
            <>
              Tổng số: <b className="text-on-surface">{totalCount}</b> nhân viên trong hệ thống ({users.length} đã tải)
            </>
          )}
        </div>
      </div>

      <EmployeeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        employee={editingEmployee}
        onSave={handleSaveEmployee}
        restrictToTeamId={isLeader ? effectiveViewer?.teamId || null : null}
        roleOptions={
          isLeader
            ? ['SubLeader', 'Employee', 'Worker']
            : ['Manager', 'Leader', 'SubLeader', 'Employee', 'Worker']
        }
        teams={teams}
      />
    </div>
  );
}
