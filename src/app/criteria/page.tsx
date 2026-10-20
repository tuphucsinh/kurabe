'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useCriteria,
  useUpsertCriteriaGroup,
  useUpsertCriterion,
  useDeleteCriteriaGroup,
  useDeleteCriterion,
  useCriteriaEditState,
} from '@/hooks/use-db';
import { Criterion, CriteriaGroup, CriteriaSetKey } from '@/types';
import {
  isCriteriaSetKey,
  mapRolesToAudiences,
} from '@/lib/criteria-applicability';
import { getGradeBandsSync } from '@/lib/grade-bands';
import { getGradeBandsAction } from '@/actions/read';
import {
  Award,
  Info,
  Lock,
  Pencil,
  Plus,
  Star,
  Trash2,
} from 'lucide-react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import CriteriaModal from '@/components/modals/CriteriaModal';
import CriteriaGroupModal from '@/components/modals/CriteriaGroupModal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { isIndividualRole } from '@/lib/role-policy';
import { Skeleton } from '@/components/ui/Skeleton';

const SET_TABS = [
  { key: 'leader' as const, label: 'Quản lý', sublabel: 'Leader', shortLabel: 'QL' },
  { key: 'staff' as const, label: 'Nhân viên', sublabel: 'Staff', shortLabel: 'NV' },
  { key: 'worker' as const, label: 'Công nhân', sublabel: 'Worker', shortLabel: 'CN' },
] as const;

function formatCriterionBadge(code?: string | null): string {
  if (!code) return '';
  const match = code.match(/^[ABC](\d+)$/i);
  return match ? match[1] : code;
}

export default function CriteriaPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (isIndividualRole(user?.role)) {
      router.replace(`/evaluations/${user?.id}`);
    }
  }, [user, router]);

  const isManager = user?.role === 'Manager';
  const { data: groups = [], isLoading: criteriaLoading, isError: isCriteriaError } = useCriteria();
  const { data: editState, isLoading: isEditStateLoading } = useCriteriaEditState();
  const isCriteriaLoading = criteriaLoading || isEditStateLoading;
  const [, setGradeTick] = useState(0);

  // Active set tab
  const [activeSetKey, setActiveSetKey] = useState<CriteriaSetKey>('leader');
  // Preserve per-tab active group UUID
  const [activeGroupIdBySet, setActiveGroupIdBySet] = useState<Record<CriteriaSetKey, string>>({
    leader: '',
    staff: '',
    worker: '',
  });

  const canEdit = isManager && editState?.canEdit === true;

  // Filter groups for current active set
  const currentSetGroups = useMemo(() => {
    return groups.filter((g) => {
      if (g.setKey) return g.setKey === activeSetKey;
      // In legacy config (before import), show groups across sets if setKey is null
      return editState?.isLegacy;
    });
  }, [groups, activeSetKey, editState?.isLegacy]);

  // Active group selection by UUID
  const safeGroupId = useMemo(() => {
    const remembered = activeGroupIdBySet[activeSetKey];
    if (remembered && currentSetGroups.some((g) => g.id === remembered)) {
      return remembered;
    }
    return currentSetGroups[0]?.id || '';
  }, [activeGroupIdBySet, activeSetKey, currentSetGroups]);

  const activeGroup = useMemo(() => {
    return currentSetGroups.find((g) => g.id === safeGroupId) || currentSetGroups[0];
  }, [currentSetGroups, safeGroupId]);

  // Compute criteria summary per set (count and max score)
  const criteriaSummaryBySet = useMemo<Record<CriteriaSetKey, { count: number; maxScore: number }>>(() => {
    const summary: Record<CriteriaSetKey, { count: number; maxScore: number }> = {
      leader: { count: 0, maxScore: 0 },
      staff: { count: 0, maxScore: 0 },
      worker: { count: 0, maxScore: 0 },
    };

    for (const group of groups) {
      for (const criterion of group.criteria || []) {
        const validPoints = (criterion.levels || [])
          .map((l) => l.points)
          .filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
        const maxCriterionScore = validPoints.length > 0 ? Math.max(...validPoints) : 0;

        const effectiveSet = criterion.setKey || group.setKey;
        if (effectiveSet && isCriteriaSetKey(effectiveSet)) {
          summary[effectiveSet].count += 1;
          summary[effectiveSet].maxScore += maxCriterionScore;
        } else {
          // Fallback for legacy criteria without setKey
          const audiences = mapRolesToAudiences(criterion.appliesTo || []);
          if (audiences.includes('management')) {
            summary.leader.count += 1;
            summary.leader.maxScore += maxCriterionScore;
          }
          if (audiences.includes('employee')) {
            summary.staff.count += 1;
            summary.staff.maxScore += maxCriterionScore;
          }
          if (audiences.includes('worker')) {
            summary.worker.count += 1;
            summary.worker.maxScore += maxCriterionScore;
          }
        }
      }
    }

    return summary;
  }, [groups]);

  // Load dải điểm từ DB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await getGradeBandsAction();
      if (!cancelled) setGradeTick((t) => t + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const gradingLeader = getGradeBandsSync().leader;
  const gradingStaff = getGradeBandsSync().staff;
  const gradingWorker = getGradeBandsSync().worker;

  const upsertGroup = useUpsertCriteriaGroup();
  const upsertCriterion = useUpsertCriterion();
  const { mutate: deleteGroup } = useDeleteCriteriaGroup();
  const { mutate: deleteCriterion } = useDeleteCriterion();

  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<Criterion | null>(null);
  const [editingGroup, setEditingGroup] = useState<CriteriaGroup | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string>('');

  const handleSaveCriterion = (criterion: Criterion, groupId: string) => {
    upsertCriterion.mutate(
      {
        criterion: { ...criterion, setKey: activeSetKey },
        groupId,
        expectedVersion: groups.find((group) => group.id === groupId)?.configVersion,
        expectedSetKey: activeSetKey,
      },
      {
        onSuccess: () => toast('Cập nhật tiêu chí thành công!', 'success'),
        onError: (err: Error) => toast(err?.message || 'Lỗi cập nhật tiêu chí.', 'error'),
      }
    );
  };

  const handleSaveGroup = (group: { id: string; code: string; name: string; shortName: string; setKey?: CriteriaSetKey }) => {
    upsertGroup.mutate(
      {
        group: { ...group, setKey: activeSetKey },
        expectedVersion: editingGroup?.configVersion ?? groups[0]?.configVersion,
      },
      {
        onSuccess: (savedGroup) => {
          toast('Cập nhật nhóm tiêu chí thành công!', 'success');
          if (savedGroup?.id) {
            setActiveGroupIdBySet((prev) => ({ ...prev, [activeSetKey]: savedGroup.id }));
          }
        },
        onError: (err: Error) => toast(err?.message || 'Lỗi cập nhật nhóm tiêu chí.', 'error'),
      }
    );
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    if (!canEdit) return;
    const confirmed = await confirm({
      title: 'Xóa nhóm tiêu chuẩn',
      message: `Bạn có chắc chắn muốn xóa nhóm tiêu chuẩn "${name}"? Tất cả tiêu chí trong nhóm này cũng sẽ bị xóa.`,
      confirmText: 'Xóa nhóm',
      variant: 'danger',
    });
    if (confirmed) {
      deleteGroup(
        { id, expectedVersion: activeGroup?.configVersion, expectedSetKey: activeSetKey },
        {
          onSuccess: () => toast('Đã xóa nhóm tiêu chí.', 'success'),
          onError: (err: Error) => toast(err?.message || 'Lỗi xóa nhóm tiêu chí.', 'error'),
        }
      );
    }
  };

  const handleDeleteCriterion = async (id: string, name: string) => {
    if (!canEdit) return;
    const confirmed = await confirm({
      title: 'Xóa tiêu chí',
      message: `Bạn có chắc chắn muốn xóa tiêu chí "${name}"?`,
      confirmText: 'Xóa tiêu chí',
      variant: 'danger',
    });
    if (confirmed) {
      const criterion = currentSetGroups.flatMap((group) => group.criteria).find((item) => item.id === id);
      deleteCriterion(
        { id, expectedVersion: criterion?.configVersion, expectedSetKey: activeSetKey },
        {
          onSuccess: () => toast('Đã xóa tiêu chí.', 'success'),
          onError: (err: Error) => toast(err?.message || 'Lỗi xóa tiêu chí.', 'error'),
        }
      );
    }
  };



  const filteredCriteria = activeGroup?.criteria || [];

  if (isCriteriaLoading) {
    return (
      <div className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 lg:py-5 space-y-6 md:space-y-8 lg:space-y-4 w-full max-w-[1600px] mx-auto" aria-busy="true">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 lg:gap-3">
          <div className="space-y-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
        <div className="flex gap-2 overflow-hidden pb-2">
          <Skeleton className="h-12 w-28 rounded-2xl" />
          <Skeleton className="h-12 w-28 rounded-2xl" />
          <Skeleton className="h-12 w-28 rounded-2xl" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isCriteriaError) {
    return (
      <div className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 lg:py-5 w-full max-w-[1600px] mx-auto">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <p className="font-medium text-rose-700">Đã xảy ra lỗi khi tải tiêu chuẩn đánh giá. Vui lòng thử lại sau.</p>
        </div>
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation}>
      <m.div className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 lg:py-5 space-y-6 md:space-y-8 lg:space-y-4 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 lg:gap-3">
          <div>
            <h1 className="text-[18px] sm:text-[22px] md:text-[27px] lg:text-[24px] font-black text-ink leading-[1.05] tracking-tight">
              Tiêu chuẩn Đánh giá
            </h1>
            <p className="text-sm sm:text-base md:text-lg lg:text-sm text-ink-muted font-medium mt-2 lg:mt-1 leading-snug">
              Hệ thống tiêu chuẩn xếp loại và thang điểm Kurabe
            </p>
          </div>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 w-full md:w-auto">
            {canEdit && (
              <button
                onClick={() => {
                  setEditingCriterion(null);
                  setEditingGroupId(safeGroupId);
                  setCriteriaModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 lg:px-3.5 lg:py-1.5 lg:min-h-10 bg-brand text-white rounded-xl font-semibold hover:bg-brand/90 transition-colors shrink-0 lg:text-sm"
              >
                <Plus size={18} />
                Thêm tiêu chuẩn
              </button>
            )}
          </div>
        </div>

        {/* Read-only Banner: Active Period Lock */}
        {editState?.hasActivePeriod && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5 flex items-start gap-3.5 text-amber-900 shadow-sm animate-in fade-in duration-300">
            <Lock className="shrink-0 mt-0.5 text-amber-700" size={20} />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-amber-900">
                Kỳ đánh giá đang hoạt động {editState.activePeriodName ? `(${editState.activePeriodName})` : ''} — Chế độ chỉ đọc
              </h3>
              <p className="text-xs sm:text-sm text-amber-800 mt-0.5">
                Tiêu chuẩn đánh giá đã được khóa để đảm bảo tính nhất quán của kỳ đánh giá. Không thể thêm, sửa hoặc xóa tiêu chuẩn lúc này.
              </p>
            </div>
          </div>
        )}

        {/* Read-only Banner: Legacy Catalog Notice */}
        {editState?.isLegacy && (
          <div className="rounded-2xl border border-blue-300 bg-blue-50 p-4 sm:p-5 flex items-start gap-3.5 text-blue-900 shadow-sm animate-in fade-in duration-300">
            <Info className="shrink-0 mt-0.5 text-blue-700" size={20} />
            <div>
              <h3 className="font-bold text-sm sm:text-base text-blue-900">
                Danh mục tiêu chuẩn cũ — Chờ nhập dữ liệu (waiting for import)
              </h3>
              <p className="text-xs sm:text-sm text-blue-800 mt-0.5">
                Danh mục tiêu chuẩn hiện tại là dữ liệu cũ chưa phân bổ theo bộ tiêu chí. Hệ thống đang ở chế độ chỉ đọc chờ nhập dữ liệu danh mục theo 3 bộ tiêu chí mới.
              </p>
            </div>
          </div>
        )}

        {/* Top 3 Set Tabs: Leader / Staff / Worker */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-surface-muted/60 rounded-2xl border border-outline-soft/60">
          {SET_TABS.map((tab) => {
            const isActive = activeSetKey === tab.key;
            const summary = criteriaSummaryBySet[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => setActiveSetKey(tab.key)}
                data-criteria-set-tab={tab.key}
                aria-selected={isActive}
                className={`px-4 py-2.5 lg:px-4 lg:py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2.5 ${
                  isActive
                    ? 'bg-brand text-white shadow-md shadow-brand/20'
                    : 'bg-transparent text-ink-muted hover:text-ink hover:bg-surface-raised'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-xs opacity-75 hidden sm:inline">({tab.sublabel})</span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-surface text-ink-muted border border-outline-soft/60'
                  }`}
                >
                  {summary.count} TC • Max {summary.maxScore}đ
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 md:gap-8 lg:gap-5 xl:gap-6">
          {/* Main Content */}
          <div className="xl:col-span-3 space-y-6 md:space-y-8 lg:space-y-4">
            {/* Group Navigation Tabs - keyed by group.id (UUID) */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1 sm:px-3 snap-x">
              {currentSetGroups.map((group) => {
                const isActive = activeGroup?.id === group.id;
                const displayName = group.shortName || group.name;

                return (
                  <button
                    key={group.id}
                    onClick={() => setActiveGroupIdBySet((prev) => ({ ...prev, [activeSetKey]: group.id }))}
                    data-criteria-group-id={group.id}
                    aria-selected={isActive}
                    className={`
                      relative flex items-center gap-2.5 lg:gap-2 px-3.5 py-2.5 lg:px-3 lg:py-2 rounded-2xl border transition-all duration-300 shrink-0 snap-start
                      ${isActive
                        ? 'border-transparent text-white z-10 shadow-lg shadow-brand/30'
                        : 'bg-surface-raised border-outline-soft/40 hover:border-brand/40 hover:bg-brand-soft/40 shadow-sm hover:shadow-md'
                      }
                    `}
                  >
                    {isActive && (
                      <m.div
                        layoutId="criteriaActiveTab"
                        className="absolute inset-0 bg-gradient-to-r from-brand to-brand-mid rounded-2xl"
                        transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
                      />
                    )}

                    {/* Label */}
                    <div className="relative z-20 flex flex-col items-start">
                      <span className={`text-[11px] font-bold uppercase tracking-[0.15em] leading-none ${isActive ? 'text-white/60' : 'text-ink-muted'}`}>
                        Nhóm {group.code}
                      </span>
                      <span className={`text-sm font-bold whitespace-nowrap leading-snug ${isActive ? 'text-white' : 'text-ink'}`}>
                        {displayName}
                      </span>
                    </div>

                    {/* Badge - criteria count */}
                    <div className="relative z-20 ml-1">
                      <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive ? 'bg-white/20 text-white/70' : 'bg-surface-muted text-ink-muted'
                      }`}>
                        {group.criteria.length}
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* Add Group Button — chỉ Manager khi canEdit */}
              {canEdit && (
                <button
                  onClick={() => {
                    setEditingGroup(null);
                    setGroupModalOpen(true);
                  }}
                  className="flex items-center justify-center w-12 h-12 lg:w-10 lg:h-10 rounded-2xl border border-dashed border-outline-soft bg-surface hover:bg-brand-soft hover:border-brand/40 hover:text-brand transition-all duration-300 shrink-0 text-ink-muted"
                  title="Thêm nhóm tiêu chuẩn"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>

            {/* Active Group Title */}
            {activeGroup && (
              <div className="flex items-center gap-3 sm:gap-4 lg:gap-3" data-criteria-group-id={activeGroup.id}>
                <div className="h-8 sm:h-10 lg:h-7 w-1.5 bg-brand rounded-full"></div>
                <h2 className="text-xl sm:text-2xl lg:text-xl font-black text-ink flex items-center gap-3 lg:gap-2">
                  Nhóm {activeGroup.code}: {activeGroup.name}
                  {canEdit && (
                    <span className="inline-flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingGroup(activeGroup);
                          setGroupModalOpen(true);
                        }}
                        data-criteria-group-id={activeGroup.id}
                        className="p-2.5 min-w-11 min-h-11 lg:p-1.5 lg:min-w-10 lg:min-h-10 flex items-center justify-center text-ink-muted hover:text-brand hover:bg-brand-soft rounded-lg transition-colors"
                        title="Sửa nhóm"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(activeGroup.id, activeGroup.name)}
                        data-criteria-group-id={activeGroup.id}
                        className="p-2.5 min-w-11 min-h-11 lg:p-1.5 lg:min-w-10 lg:min-h-10 flex items-center justify-center text-ink-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                        title="Xóa nhóm"
                      >
                        <Trash2 size={18} />
                      </button>
                    </span>
                  )}
                </h2>
              </div>
            )}

            {/* Criteria List - keyed by criterion.id (UUID) */}
            {filteredCriteria.length > 0 ? (
              <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
                {filteredCriteria.map((criterion) => (
                  <div
                    key={criterion.id}
                    data-criterion-id={criterion.id}
                    data-criterion-set={activeSetKey}
                    className="bg-surface-raised rounded-2xl border border-outline-soft overflow-hidden shadow-sm hover:border-brand/20 transition-all duration-300"
                  >
                    <div className="px-4 sm:px-6 lg:px-4 py-2.5 lg:py-2 bg-surface border-b border-outline-soft flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0">
                        <span
                          data-criterion-badge
                          className="text-xs font-black bg-surface-raised text-brand px-2 py-0.5 rounded border border-brand/20 shrink-0"
                        >
                          {formatCriterionBadge(criterion.code || criterion.id)}
                        </span>
                        <span data-criterion-name className="font-bold text-ink lg:text-sm break-words">{criterion.name}</span>
                        {criterion.description && (
                          <span
                            data-criterion-description
                            className="text-sm lg:text-xs font-normal text-ink-muted/80 block w-full break-words"
                          >
                            {criterion.description}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 lg:gap-2 shrink-0">
                        {canEdit && (
                          <div className="flex items-center gap-0.5 sm:gap-1">
                            <button
                              onClick={() => {
                                setEditingCriterion(criterion);
                                setEditingGroupId(safeGroupId);
                                setCriteriaModalOpen(true);
                              }}
                              data-edit-criterion={criterion.id}
                              aria-label={`Sửa tiêu chí ${criterion.name}`}
                              className="p-2 min-w-10 min-h-10 sm:p-2.5 sm:min-w-11 sm:min-h-11 lg:p-1.5 lg:min-w-10 lg:min-h-10 flex items-center justify-center text-ink-muted hover:text-brand hover:bg-brand-soft rounded-xl lg:rounded-lg transition-colors shrink-0"
                              title="Sửa tiêu chí"
                            >
                              <Pencil size={18} />
                            </button>
                            <button
                              onClick={() => handleDeleteCriterion(criterion.id, criterion.name)}
                              data-delete-criterion={criterion.id}
                              aria-label={`Xóa tiêu chí ${criterion.name}`}
                              className="p-2 min-w-10 min-h-10 sm:p-2.5 sm:min-w-11 sm:min-h-11 lg:p-1.5 lg:min-w-10 lg:min-h-10 flex items-center justify-center text-ink-muted hover:text-error hover:bg-error/10 rounded-xl lg:rounded-lg transition-colors shrink-0"
                              title="Xóa tiêu chí"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="p-2 md:p-3 lg:p-2.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3 lg:gap-2">
                      {criterion.levels.map((level, idx) => {
                        const isDefault = criterion.defaultLevelIndex === idx;
                        return (
                          <div
                            key={idx}
                            className={`relative p-3 lg:p-2.5 rounded-xl border text-left group transition-all duration-200 ${
                              isDefault
                                ? 'border-amber-400 bg-amber-50/30 shadow-sm'
                                : 'border-outline-soft hover:border-brand/30 hover:bg-surface'
                            }`}
                          >
                            <div className="flex items-start gap-3 lg:gap-2">
                              <span className={`
                                shrink-0 text-sm lg:text-xs font-black px-2 py-0.5 lg:px-1.5 lg:py-0.5 rounded mt-1 lg:mt-0.5
                                ${level.points > 0 ? 'bg-green-50 text-green-700' :
                                  level.points < 0 ? 'bg-red-50 text-red-700' :
                                  'bg-surface-muted text-ink-muted'}
                              `}>
                                {level.points > 0 ? `+${level.points}` : level.points}
                              </span>
                              <p className="text-sm lg:text-[13px] leading-snug flex-1 text-ink-muted pt-1.5 lg:pt-0.5">
                                {level.label}
                              </p>
                              {/* Non-interactive indicator for stored legacy default metadata (read-only reference) */}
                              {isDefault && (
                                <span
                                  className="text-amber-500 shrink-0 p-1"
                                  title="Mức mặc định lịch sử (chỉ tham khảo, không tự động chọn)"
                                >
                                  <Star size={14} className="fill-current" />
                                </span>
                              )}
                            </div>
                            {level.description && (
                              <div className="mt-2 lg:mt-1.5 flex items-start gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity pr-6 lg:pr-4">
                                <Info size={12} className="shrink-0 mt-0.5" />
                                <p className="text-[11px] italic lg:leading-tight">{level.description}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center bg-surface rounded-3xl border border-dashed border-outline-soft">
                <p className="text-ink-muted">Không có tiêu chí nào trong nhóm này.</p>
              </div>
            )}
          </div>

          {/* Sidebar: Grading Summary */}
          <div className="space-y-6 lg:space-y-4">
            <div className="sticky top-8">
              <div className="bg-surface-raised rounded-2xl border border-outline-soft overflow-hidden shadow-sm">
                <div className="bg-brand px-6 py-4 lg:px-4 lg:py-3 flex items-center gap-3">
                  <Award className="text-white" size={20} />
                  <h3 className="font-bold text-white uppercase tracking-wider text-sm">Thang điểm Xếp loại</h3>
                </div>
                <div className="p-6 lg:p-4">
                  <div className="space-y-8 lg:space-y-5">
                    <div>
                      <h4 className="text-xs font-bold text-ink-muted uppercase mb-4 lg:mb-2.5 tracking-wider">
                        Quản lý{' '}
                        <span className="normal-case font-normal tracking-normal text-ink-muted/75">
                          ({criteriaSummaryBySet.leader.count} tiêu chuẩn, max {criteriaSummaryBySet.leader.maxScore} điểm)
                        </span>
                      </h4>
                      <div className="space-y-3 lg:space-y-2">
                        {gradingLeader.map((g) => (
                          <div key={g.grade} className="flex items-center justify-between group">
                            <div className="flex items-center gap-3 lg:gap-2.5">
                              <div className={`
                                w-10 h-10 lg:w-8 lg:h-8 rounded-xl lg:rounded-lg flex items-center justify-center font-black text-lg lg:text-base transition-transform group-hover:scale-110
                                ${g.grade === 'S' ? 'bg-amber-100 text-amber-700' :
                                  g.grade === 'A' || g.grade === 'AB' ? 'bg-blue-100 text-blue-700' :
                                  g.grade === 'B' ? 'bg-green-100 text-green-700' :
                                  'bg-surface-muted text-ink-muted'}
                              `}>
                                {g.grade}
                              </div>
                              <span className="font-semibold text-ink lg:text-sm">Hạng {g.grade}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm lg:text-xs font-medium text-ink-muted">
                                {g.minScore && g.maxScore
                                  ? `${g.minScore} - ${g.maxScore}`
                                  : g.minScore
                                  ? `Trên ${g.minScore}`
                                  : `Dưới ${g.maxScore}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 lg:pt-4 border-t border-outline-soft">
                      <h4 className="text-xs font-bold text-ink-muted uppercase mb-4 lg:mb-2.5 tracking-wider">
                        Nhân viên{' '}
                        <span className="normal-case font-normal tracking-normal text-ink-muted/75">
                          ({criteriaSummaryBySet.staff.count} tiêu chuẩn, max {criteriaSummaryBySet.staff.maxScore} điểm)
                        </span>
                      </h4>
                      <div className="space-y-3 lg:space-y-2">
                        {gradingStaff.map((g) => (
                          <div key={g.grade} className="flex items-center justify-between group">
                            <div className="flex items-center gap-3 lg:gap-2.5">
                              <div className={`
                                w-10 h-10 lg:w-8 lg:h-8 rounded-xl lg:rounded-lg flex items-center justify-center font-black text-lg lg:text-base transition-transform group-hover:scale-110
                                ${g.grade === 'S' ? 'bg-amber-100 text-amber-700' :
                                  g.grade === 'A' || g.grade === 'AB' ? 'bg-blue-100 text-blue-700' :
                                  g.grade === 'B' ? 'bg-green-100 text-green-700' :
                                  'bg-surface-muted text-ink-muted'}
                              `}>
                                {g.grade}
                              </div>
                              <span className="font-semibold text-ink lg:text-sm">Hạng {g.grade}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm lg:text-xs font-medium text-ink-muted">
                                {g.minScore && g.maxScore
                                  ? `${g.minScore} - ${g.maxScore}`
                                  : g.minScore
                                  ? `Trên ${g.minScore}`
                                  : `Dưới ${g.maxScore}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="pt-6 lg:pt-4 border-t border-outline-soft">
                      <h4 className="text-xs font-bold text-ink-muted uppercase mb-4 lg:mb-2.5 tracking-wider">
                        Công nhân{' '}
                        <span className="normal-case font-normal tracking-normal text-ink-muted/75">
                          ({criteriaSummaryBySet.worker.count} tiêu chuẩn, max {criteriaSummaryBySet.worker.maxScore} điểm)
                        </span>
                      </h4>
                      <div className="space-y-3 lg:space-y-2">
                        {gradingWorker.map((g) => (
                          <div key={g.grade} className="flex items-center justify-between group">
                            <div className="flex items-center gap-3 lg:gap-2.5">
                              <div className={`
                                w-10 h-10 lg:w-8 lg:h-8 rounded-xl lg:rounded-lg flex items-center justify-center font-black text-lg lg:text-base transition-transform group-hover:scale-110
                                ${g.grade === 'S' ? 'bg-amber-100 text-amber-700' :
                                  g.grade === 'A' || g.grade === 'AB' ? 'bg-blue-100 text-blue-700' :
                                  g.grade === 'B' ? 'bg-green-100 text-green-700' :
                                  'bg-surface-muted text-ink-muted'}
                              `}>
                                {g.grade}
                              </div>
                              <span className="font-semibold text-ink lg:text-sm">Hạng {g.grade}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-sm lg:text-xs font-medium text-ink-muted">
                                {g.minScore && g.maxScore
                                  ? `${g.minScore} - ${g.maxScore}`
                                  : g.minScore
                                  ? `Trên ${g.minScore}`
                                  : `Dưới ${g.maxScore}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 lg:mt-5 p-4 lg:p-3 bg-surface rounded-xl border border-outline-soft">
                    <div className="flex gap-3 lg:gap-2 text-sm lg:text-xs text-ink-muted">
                      <Info size={16} className="text-brand shrink-0 mt-0.5" />
                      <p>Hệ thống tự động xếp loại dựa trên tổng điểm đánh giá của tất cả các nhóm tiêu chí theo từng bộ tiêu chuẩn.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <CriteriaModal
          isOpen={criteriaModalOpen}
          onClose={() => setCriteriaModalOpen(false)}
          onSave={handleSaveCriterion}
          criterion={editingCriterion}
          groupId={editingGroupId || safeGroupId}
          groups={currentSetGroups}
          setKey={activeSetKey}
          disabled={!canEdit}
        />

        <CriteriaGroupModal
          key={editingGroup?.id ?? 'new'}
          isOpen={groupModalOpen}
          onClose={() => setGroupModalOpen(false)}
          onSave={handleSaveGroup}
          group={editingGroup}
          existingGroupIds={currentSetGroups.map((g) => g.code)}
          setKey={activeSetKey}
          disabled={!canEdit}
        />
      </m.div>
    </LazyMotion>
  );
}
