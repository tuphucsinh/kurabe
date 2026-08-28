'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  useCriteria,
  useUpsertCriteriaGroup,
  useUpsertCriterion,
  useUpdateDefaultLevel,
  useUpdateCriterionAudiences,
  useDeleteCriteriaGroup,
  useDeleteCriterion
} from '@/hooks/use-db';
import { Criterion, CriteriaGroup } from '@/types';
import {
  CriterionAudience,
  CRITERION_AUDIENCES,
  mapRolesToAudiences
} from '@/lib/criteria-applicability';
import { getGradeBandsSync } from '@/lib/grade-bands';
import { getGradeBandsAction } from '@/actions/read';
import {
  Award,
  Info,
  Pencil,
  Plus,
  Star,
  Trash2
} from 'lucide-react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import CriteriaModal from '@/components/modals/CriteriaModal';
import CriteriaGroupModal from '@/components/modals/CriteriaGroupModal';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { isIndividualRole } from '@/lib/role-policy';
import { Skeleton } from '@/components/ui/Skeleton';

const AUDIENCE_BADGES = [
  {
    key: 'management' as const,
    shortLabel: 'QL',
    title: 'Quản lý',
    checkedClass: 'bg-amber-100/90 text-amber-800 border-amber-300 font-bold',
    accentColor: 'accent-amber-600',
  },
  {
    key: 'employee' as const,
    shortLabel: 'NV',
    title: 'Nhân viên',
    checkedClass: 'bg-blue-100/90 text-blue-800 border-blue-300 font-bold',
    accentColor: 'accent-blue-600',
  },
  {
    key: 'worker' as const,
    shortLabel: 'CN',
    title: 'Công nhân',
    checkedClass: 'bg-teal-100/90 text-teal-800 border-teal-300 font-bold',
    accentColor: 'accent-teal-600',
  },
] as const;

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

  const isManager = user?.role === 'Manager'; // Chỉ Manager được thêm/sửa/xóa tiêu chuẩn
  const { data: groups = [], isLoading: isCriteriaLoading, isError: isCriteriaError } = useCriteria();
  const [, setGradeTick] = useState(0);

  const criteriaSummaryByAudience = useMemo<Record<CriterionAudience, { count: number; maxScore: number }>>(() => {
    const summary: Record<CriterionAudience, { count: number; maxScore: number }> = {
      management: { count: 0, maxScore: 0 },
      employee: { count: 0, maxScore: 0 },
      worker: { count: 0, maxScore: 0 },
    };

    for (const group of groups) {
      for (const criterion of group.criteria || []) {
        const validPoints = (criterion.levels || [])
          .map((l) => l.points)
          .filter((p): p is number => typeof p === 'number' && Number.isFinite(p));
        const maxCriterionScore = validPoints.length > 0 ? Math.max(...validPoints) : 0;

        const audiences = mapRolesToAudiences(criterion.appliesTo || []);
        for (const audience of audiences) {
          summary[audience].count++;
          summary[audience].maxScore += maxCriterionScore;
        }
      }
    }

    return summary;
  }, [groups]);

  // Load dải điểm từ DB (nếu có) để đồng bộ với Tab Thang điểm trong Cài đặt
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
  const updateDefaultLevel = useUpdateDefaultLevel();
  const updateCriterionAudiences = useUpdateCriterionAudiences();
  const { mutate: deleteGroup } = useDeleteCriteriaGroup();
  const { mutate: deleteCriterion } = useDeleteCriterion();

  const handleToggleAudience = (criterion: Criterion, audience: CriterionAudience) => {
    if (!isManager) return;
    const currentAudiences = mapRolesToAudiences(criterion.appliesTo || []);
    const isChecked = currentAudiences.includes(audience);

    let newAudiences: CriterionAudience[];
    if (isChecked) {
      newAudiences = currentAudiences.filter(a => a !== audience);
    } else {
      newAudiences = CRITERION_AUDIENCES.filter(a => currentAudiences.includes(a) || a === audience);
    }

    if (newAudiences.length === 0) {
      toast('Tiêu chí phải áp dụng cho ít nhất một đối tượng.', 'warning');
      return;
    }

    updateCriterionAudiences.mutate(
      { criterionId: criterion.id, audiences: newAudiences },
      {
        onSuccess: () => {
          toast('Cập nhật đối tượng áp dụng thành công.', 'success');
        },
        onError: (err: Error) => {
          toast(err?.message || 'Lỗi khi cập nhật đối tượng áp dụng.', 'error');
        },
      }
    );
  };

  const [activeGroupId, setActiveGroupId] = useState('A');

  const [criteriaModalOpen, setCriteriaModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingCriterion, setEditingCriterion] = useState<Criterion | null>(null);
  const [editingGroup, setEditingGroup] = useState<CriteriaGroup | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string>('');

  const currentCriteria = groups;

  // Reset activeGroupId when switching type if current id doesn't exist
  const validGroupCodes = currentCriteria.map(g => g.code);
  const safeGroupCode = validGroupCodes.includes(activeGroupId) ? activeGroupId : (validGroupCodes[0] || '');

  const activeGroup = currentCriteria.find(g => g.code === safeGroupCode) || currentCriteria[0];
  const safeGroupId = activeGroup?.id || '';

  const handleSaveCriterion = (criterion: Criterion, groupId: string) => {
    upsertCriterion.mutate({
      criterion,
      groupId
    }, {
      onSuccess: () => toast('Cập nhật tiêu chí thành công!', 'success'),
      onError: () => toast('Lỗi cập nhật tiêu chí.', 'error')
    });
  };

  const handleSaveGroup = (group: { id: string; code: string; name: string; shortName: string }) => {
    upsertGroup.mutate(group, {
      onSuccess: () => toast('Cập nhật nhóm tiêu chí thành công!', 'success'),
      onError: () => toast('Lỗi cập nhật nhóm tiêu chí.', 'error')
    });
    setActiveGroupId(group.code);
  };

  const handleDeleteGroup = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Xóa nhóm tiêu chuẩn',
      message: `Bạn có chắc chắn muốn xóa nhóm tiêu chuẩn "${name}"? Tất cả tiêu chí trong nhóm này cũng sẽ bị xóa.`,
      confirmText: 'Xóa nhóm',
      variant: 'danger'
    });
    if (confirmed) {
      deleteGroup(id, {
        onSuccess: () => toast('Đã xóa nhóm tiêu chí.', 'success'),
        onError: () => toast('Lỗi xóa nhóm tiêu chí.', 'error')
      });
    }
  };

  const handleDeleteCriterion = async (id: string, name: string) => {
    const confirmed = await confirm({
      title: 'Xóa tiêu chí',
      message: `Bạn có chắc chắn muốn xóa tiêu chí "${name}"?`,
      confirmText: 'Xóa tiêu chí',
      variant: 'danger'
    });
    if (confirmed) {
      deleteCriterion(id, {
        onSuccess: () => toast('Đã xóa tiêu chí.', 'success'),
        onError: () => toast('Lỗi xóa tiêu chí.', 'error')
      });
    }
  };

  const handleSetDefaultLevel = async (criterionId: string, levelIndex: number, currentDefault: number | undefined) => {
    if (levelIndex === currentDefault) {
      const confirmed = await confirm({
        title: 'Bỏ mức mặc định',
        message: 'Bạn có chắc chắn muốn bỏ chọn mức mặc định này?',
        confirmText: 'Bỏ chọn',
      });
      if (confirmed) {
        updateDefaultLevel.mutate({ criterionId, levelIndex: null }, {
          onSuccess: () => toast('Đã bỏ chọn mức mặc định.', 'success'),
          onError: () => toast('Lỗi bỏ chọn mức mặc định.', 'error')
        });
      }
      return;
    }
    const confirmed = await confirm({
      title: 'Đặt mức mặc định',
      message: 'Bạn có chắc chắn muốn đặt mức này làm mặc định khi tạo đánh giá mới?',
      confirmText: 'Đặt mặc định',
    });
    if (confirmed) {
      updateDefaultLevel.mutate({ criterionId, levelIndex }, {
        onSuccess: () => toast('Đã đặt mức mặc định.', 'success'),
        onError: () => toast('Lỗi đặt mức mặc định.', 'error')
      });
    }
  };

  // Filter criteria within active group
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
          {isManager && (
            <button
              onClick={() => {
                setEditingCriterion(null);
                setEditingGroupId(safeGroupId);
                setCriteriaModalOpen(true);
              }}
              className="max-md:hidden flex items-center gap-2 px-4 py-2 lg:px-3.5 lg:py-1.5 lg:min-h-10 bg-brand text-white rounded-xl font-semibold hover:bg-brand/90 transition-colors shrink-0 lg:text-sm"
            >
              <Plus size={18} />
              Thêm tiêu chuẩn
            </button>
          )}
        </div>
      </div>



      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 md:gap-8 lg:gap-5 xl:gap-6">
        {/* Main Content */}
        <div className="xl:col-span-3 space-y-6 md:space-y-8 lg:space-y-4">
          {/* Group Navigation Tabs - pill style */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1 sm:px-3 snap-x">
            {currentCriteria.map((group) => {
              const isActive = safeGroupCode === group.code;
              const displayName = group.shortName || group.name;

              return (
                <button
                  key={group.code}
                  onClick={() => setActiveGroupId(group.code)}
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

            {/* Add Group Button — chỉ Manager trên desktop/tablet */}
            {isManager && (
              <button
                onClick={() => {
                  setEditingGroup(null);
                  setGroupModalOpen(true);
                }}
                className="max-md:hidden flex items-center justify-center w-12 h-12 lg:w-10 lg:h-10 rounded-2xl border border-dashed border-outline-soft bg-surface hover:bg-brand-soft hover:border-brand/40 hover:text-brand transition-all duration-300 shrink-0 text-ink-muted"
                title="Thêm nhóm tiêu chuẩn"
              >
                <Plus size={20} />
              </button>
            )}
          </div>

          {/* Active Group Title */}
          <div className="flex items-center gap-3 sm:gap-4 lg:gap-3">
            <div className="h-8 sm:h-10 lg:h-7 w-1.5 bg-brand rounded-full"></div>
            <h2 className="text-xl sm:text-2xl lg:text-xl font-black text-ink flex items-center gap-3 lg:gap-2">
              Nhóm {safeGroupCode}: {activeGroup?.name}
              {activeGroup && isManager && (
                <span className="max-md:hidden inline-flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingGroup(activeGroup);
                      setGroupModalOpen(true);
                    }}
                    className="p-2.5 min-w-11 min-h-11 lg:p-1.5 lg:min-w-10 lg:min-h-10 flex items-center justify-center text-ink-muted hover:text-brand hover:bg-brand-soft rounded-lg transition-colors"
                    title="Sửa nhóm"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(activeGroup.id!, activeGroup.name)}
                    className="p-2.5 min-w-11 min-h-11 lg:p-1.5 lg:min-w-10 lg:min-h-10 flex items-center justify-center text-ink-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                    title="Xóa nhóm"
                  >
                    <Trash2 size={18} />
                  </button>
                </span>
              )}
            </h2>
          </div>

          {/* Criteria List - same style as evaluation detail */}
          {filteredCriteria.length > 0 ? (
            <div className="space-y-2 animate-in fade-in slide-in-from-right-4 duration-300">
              {filteredCriteria.map((criterion) => {
                const criterionAudiences = mapRolesToAudiences(criterion.appliesTo || []);
                const isUpdatingThis = updateCriterionAudiences.isPending &&
                  updateCriterionAudiences.variables?.criterionId === criterion.id;

                return (
                <div key={criterion.id} className="bg-surface-raised rounded-2xl border border-outline-soft overflow-hidden shadow-sm hover:border-brand/20 transition-all duration-300">
                  <div className="px-4 sm:px-6 lg:px-4 py-2.5 lg:py-2 bg-surface border-b border-outline-soft flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap lg:flex-nowrap items-center gap-x-2 gap-y-1 flex-1 min-w-0">
                      <span className="text-xs font-black bg-surface-raised text-brand px-2 py-0.5 rounded border border-brand/20 shrink-0">
                        {criterion.code || criterion.id}
                      </span>
                      <span className="font-bold text-ink shrink-0 lg:text-sm">{criterion.name}</span>
                      {criterion.description && (
                        <span className="text-sm lg:text-xs font-normal text-ink-muted/80 block w-full md:inline md:w-auto lg:block lg:flex-1 lg:min-w-0 lg:w-auto">
                          <span className="hidden md:inline">— </span>{criterion.description}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 lg:gap-2 shrink-0">
                      {/* Mobile: Display-only audience badges (no checkboxes, no mutation) */}
                      <div className="md:hidden flex items-center gap-1">
                        {AUDIENCE_BADGES.map(({ key, shortLabel, title, checkedClass }) => {
                          const isChecked = criterionAudiences.includes(key);
                          if (!isChecked) return null;
                          return (
                            <span
                              key={key}
                              title={`${title} (${shortLabel})`}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[11px] font-bold ${checkedClass}`}
                            >
                              {shortLabel}
                            </span>
                          );
                        })}
                      </div>

                      {/* Desktop/Tablet: Interactive Checkbox Fieldset */}
                      <fieldset
                        className="max-md:hidden inline-flex items-center gap-1 sm:gap-1.5 p-1 lg:p-0.5 bg-surface-raised rounded-lg border border-outline-soft/60 shrink-0"
                        aria-label={`Đối tượng áp dụng cho tiêu chí ${criterion.code || criterion.name}`}
                      >
                        <legend className="sr-only">Đối tượng áp dụng</legend>
                        {AUDIENCE_BADGES.map(({ key, shortLabel, title, checkedClass, accentColor }) => {
                          const isChecked = criterionAudiences.includes(key);
                          return (
                            <label
                              key={key}
                              title={`${title} (${shortLabel})`}
                              className={`
                                inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-0.5 lg:px-1.5 lg:py-0.5 rounded border text-xs transition-all select-none
                                ${isManager ? 'cursor-pointer' : 'cursor-default opacity-80'}
                                ${isChecked
                                  ? checkedClass
                                  : 'bg-surface-muted/50 text-ink-muted border-outline-soft'
                                }
                                ${isUpdatingThis ? 'opacity-50 pointer-events-none' : ''}
                              `}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!isManager || isUpdatingThis}
                                onChange={() => handleToggleAudience(criterion, key)}
                                className={`w-3.5 h-3.5 rounded border-outline-soft ${accentColor} focus:ring-1 focus:ring-brand/20 ${isManager ? 'cursor-pointer' : 'cursor-default'}`}
                                aria-label={`${title} (${shortLabel})`}
                              />
                              <span className="font-bold text-[11px] sm:text-xs">{shortLabel}</span>
                            </label>
                          );
                        })}
                      </fieldset>

                      {isManager && (
                        <div className="max-md:hidden flex items-center gap-0.5 sm:gap-1">
                          <button
                            onClick={() => {
                              setEditingCriterion(criterion);
                              setEditingGroupId(safeGroupId);
                              setCriteriaModalOpen(true);
                            }}
                            className="p-2 min-w-10 min-h-10 sm:p-2.5 sm:min-w-11 sm:min-h-11 lg:p-1.5 lg:min-w-10 lg:min-h-10 flex items-center justify-center text-ink-muted hover:text-brand hover:bg-brand-soft rounded-xl lg:rounded-lg transition-colors shrink-0"
                            title="Sửa tiêu chí"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteCriterion(criterion.id!, criterion.name)}
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
                          {/* Mobile read-only default indicator */}
                          {isDefault && (
                            <span className="md:hidden text-amber-500 shrink-0 p-1" title="Mức mặc định">
                              <Star size={14} className="fill-current" />
                            </span>
                          )}
                          {/* Desktop/Tablet interactive default selector */}
                          {isManager && (
                            <button
                              onClick={() => handleSetDefaultLevel(criterion.id!, idx, criterion.defaultLevelIndex)}
                              className={`max-md:hidden shrink-0 p-2.5 min-w-11 min-h-11 lg:p-1 lg:min-w-10 lg:min-h-10 flex items-center justify-center rounded-lg transition-colors ${
                                isDefault
                                  ? 'text-amber-500 bg-amber-100 hover:bg-amber-200'
                                  : 'text-outline-soft hover:text-amber-500 hover:bg-amber-50 opacity-0 group-hover:opacity-100 focus:opacity-100'
                              }`}
                              title={isDefault ? "Đang là mức mặc định" : "Đặt làm mặc định"}
                            >
                              <Star size={16} className={isDefault ? 'fill-current' : ''} />
                            </button>
                          )}
                        </div>
                        {level.description && (
                          <div className="mt-2 lg:mt-1.5 flex items-start gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity pr-6 lg:pr-4">
                            <Info size={12} className="shrink-0 mt-0.5" />
                            <p className="text-[11px] italic lg:leading-tight">{level.description}</p>
                          </div>
                        )}
                      </div>
                    )})}
                  </div>
                </div>
              );
            })}
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
                        ({criteriaSummaryByAudience.management.count} tiêu chuẩn, max {criteriaSummaryByAudience.management.maxScore} điểm)
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
                        ({criteriaSummaryByAudience.employee.count} tiêu chuẩn, max {criteriaSummaryByAudience.employee.maxScore} điểm)
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
                        ({criteriaSummaryByAudience.worker.count} tiêu chuẩn, max {criteriaSummaryByAudience.worker.maxScore} điểm)
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
                    <p>Hệ thống tự động xếp loại dựa trên tổng điểm đánh giá của tất cả các nhóm tiêu chí.</p>
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
        groupId={editingGroupId}
        groups={groups}
      />

      <CriteriaGroupModal
        key={editingGroup?.id ?? 'new'}
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onSave={handleSaveGroup}
        group={editingGroup}
        existingGroupIds={groups.map(g => g.code)}
      />
      </m.div>
    </LazyMotion>
  );
}
