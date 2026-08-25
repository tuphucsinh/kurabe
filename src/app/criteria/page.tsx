'use client';

import { useState, useEffect } from 'react';
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
  const { data: groups = [] } = useCriteria();
  const [, setGradeTick] = useState(0);

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

  return (
    <LazyMotion features={domAnimation}>
      <m.div className="px-4 sm:px-6 md:px-10 lg:px-12 py-6 md:py-8 lg:py-5 space-y-6 md:space-y-8 lg:space-y-4 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-[18px] sm:text-[22px] md:text-[27px] lg:text-[27px] font-black text-on-surface leading-[1.05] tracking-tight">
            Tiêu chuẩn Đánh giá
          </h1>
          <p className="text-sm sm:text-base md:text-lg lg:text-[14px] text-outline font-medium mt-2 leading-snug">
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
              className="max-md:hidden flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors shrink-0"
            >
              <Plus size={18} />
              Thêm tiêu chuẩn
            </button>
          )}
        </div>
      </div>



      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 md:gap-8">
        {/* Main Content */}
        <div className="xl:col-span-3 space-y-6 md:space-y-8">
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
                    relative flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-all duration-300 shrink-0 snap-start
                    ${isActive
                      ? 'border-transparent text-white z-10 shadow-lg shadow-primary/30'
                      : 'bg-white border-outline-variant/40 hover:border-primary/40 hover:bg-primary/5 shadow-sm hover:shadow-md'
                    }
                  `}
                >
                  {isActive && (
                    <m.div
                      layoutId="criteriaActiveTab"
                      className="absolute inset-0 bg-gradient-to-r from-[#0E4B66] to-[#1A6D91] rounded-2xl"
                      transition={{ type: 'spring', bounce: 0.25, duration: 0.5 }}
                    />
                  )}



                  {/* Label */}
                  <div className="relative z-20 flex flex-col items-start">
                    <span className={`text-[11px] font-bold uppercase tracking-[0.15em] leading-none ${isActive ? 'text-white/60' : 'text-outline'}`}>
                      Nhóm {group.code}
                    </span>
                    <span className={`text-sm font-bold whitespace-nowrap leading-snug ${isActive ? 'text-white' : 'text-on-surface'}`}>
                      {displayName}
                    </span>
                  </div>

                  {/* Badge - criteria count */}
                  <div className="relative z-20 ml-1">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-white/20 text-white/70' : 'bg-surface text-outline'
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
                className="max-md:hidden flex items-center justify-center w-12 h-12 rounded-2xl border border-dashed border-outline-variant bg-surface hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all duration-300 shrink-0 text-outline"
                title="Thêm nhóm tiêu chuẩn"
              >
                <Plus size={20} />
              </button>
            )}
          </div>

          {/* Active Group Title */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-8 sm:h-10 w-1.5 bg-primary rounded-full"></div>
            <h2 className="text-xl sm:text-2xl font-black text-on-surface flex items-center gap-3">
              Nhóm {safeGroupCode}: {activeGroup?.name}
              {activeGroup && isManager && (
                <span className="max-md:hidden inline-flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditingGroup(activeGroup);
                      setGroupModalOpen(true);
                    }}
                    className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Sửa nhóm"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(activeGroup.id!, activeGroup.name)}
                    className="p-2.5 min-w-11 min-h-11 flex items-center justify-center text-outline hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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
                <div key={criterion.id} className="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm hover:border-primary/20 transition-all duration-300">
                  <div className="px-4 sm:px-6 py-2.5 bg-surface border-b border-outline-variant flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 flex-1 min-w-0">
                      <span className="text-xs font-black bg-white text-primary px-2 py-0.5 rounded border border-primary/20 shrink-0">
                        {criterion.code || criterion.id}
                      </span>
                      <span className="font-bold text-on-surface shrink-0">{criterion.name}</span>
                      {criterion.description && (
                        <span className="text-sm font-normal text-outline/80 block w-full md:inline md:w-auto">
                          <span className="hidden md:inline">— </span>{criterion.description}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
                        className="max-md:hidden inline-flex items-center gap-1 sm:gap-1.5 p-1 bg-white rounded-lg border border-outline-variant/60 shrink-0"
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
                                inline-flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-0.5 rounded border text-xs transition-all select-none
                                ${isManager ? 'cursor-pointer' : 'cursor-default opacity-80'}
                                ${isChecked
                                  ? checkedClass
                                  : 'bg-slate-50/50 text-slate-400 border-slate-200'
                                }
                                ${isUpdatingThis ? 'opacity-50 pointer-events-none' : ''}
                              `}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!isManager || isUpdatingThis}
                                onChange={() => handleToggleAudience(criterion, key)}
                                className={`w-3.5 h-3.5 rounded border-slate-300 ${accentColor} focus:ring-1 focus:ring-primary/20 ${isManager ? 'cursor-pointer' : 'cursor-default'}`}
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
                            className="p-2 min-w-10 min-h-10 sm:p-2.5 sm:min-w-11 sm:min-h-11 flex items-center justify-center text-outline hover:text-primary hover:bg-primary/10 rounded-xl transition-colors shrink-0"
                            title="Sửa tiêu chí"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteCriterion(criterion.id!, criterion.name)}
                            className="p-2 min-w-10 min-h-10 sm:p-2.5 sm:min-w-11 sm:min-h-11 flex items-center justify-center text-outline hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors shrink-0"
                            title="Xóa tiêu chí"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-2 md:p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2 md:gap-3">
                    {criterion.levels.map((level, idx) => {
                      const isDefault = criterion.defaultLevelIndex === idx;
                      return (
                      <div
                        key={idx}
                        className={`relative p-3 rounded-xl border text-left group transition-all duration-200 ${
                          isDefault
                            ? 'border-amber-400 bg-amber-50/30 shadow-sm'
                            : 'border-outline-variant hover:border-primary/30 hover:bg-surface'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`
                            shrink-0 text-sm font-black px-2 py-0.5 rounded mt-1
                            ${level.points > 0 ? 'bg-green-50 text-green-700' :
                              level.points < 0 ? 'bg-red-50 text-red-700' :
                              'bg-surface text-outline'}
                          `}>
                            {level.points > 0 ? `+${level.points}` : level.points}
                          </span>
                          <p className="text-sm leading-snug flex-1 text-on-surface-variant pt-1.5">
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
                              className={`max-md:hidden shrink-0 p-2.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg transition-colors ${
                                isDefault
                                  ? 'text-amber-500 bg-amber-100 hover:bg-amber-200'
                                  : 'text-outline-variant hover:text-amber-500 hover:bg-amber-50 opacity-0 group-hover:opacity-100 focus:opacity-100'
                              }`}
                              title={isDefault ? "Đang là mức mặc định" : "Đặt làm mặc định"}
                            >
                              <Star size={16} className={isDefault ? 'fill-current' : ''} />
                            </button>
                          )}
                        </div>
                        {level.description && (
                          <div className="mt-2 flex items-start gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity pr-6">
                            <Info size={12} className="shrink-0 mt-0.5" />
                            <p className="text-[11px] italic">{level.description}</p>
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
            <div className="py-20 text-center bg-surface rounded-3xl border border-dashed border-outline-variant">
              <p className="text-outline">Không có tiêu chí nào trong nhóm này.</p>
            </div>
          )}
        </div>

        {/* Sidebar: Grading Summary */}
        <div className="space-y-6">
          <div className="sticky top-8">
            <div className="bg-white rounded-2xl border border-outline-variant overflow-hidden shadow-sm">
              <div className="bg-primary px-6 py-4 flex items-center gap-3">
                <Award className="text-white" size={20} />
                <h3 className="font-bold text-white uppercase tracking-wider text-sm">Thang điểm Xếp loại</h3>
              </div>
              <div className="p-6">
                <div className="space-y-8">
                  <div>
                    <h4 className="text-xs font-bold text-outline uppercase mb-4 tracking-wider">Quản lý / Có chức vụ</h4>
                    <div className="space-y-3">
                      {gradingLeader.map((g) => (
                        <div key={g.grade} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className={`
                              w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg transition-transform group-hover:scale-110
                              ${g.grade === 'S' ? 'bg-amber-100 text-amber-700' :
                                g.grade === 'A' || g.grade === 'AB' ? 'bg-blue-100 text-blue-700' :
                                g.grade === 'B' ? 'bg-green-100 text-green-700' :
                                'bg-surface text-outline'}
                            `}>
                              {g.grade}
                            </div>
                            <span className="font-semibold text-on-surface">Hạng {g.grade}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium text-outline">
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

                  <div className="pt-6 border-t border-outline-variant">
                    <h4 className="text-xs font-bold text-outline uppercase mb-4 tracking-wider">Nhân viên (Staff)</h4>
                    <div className="space-y-3">
                      {gradingStaff.map((g) => (
                        <div key={g.grade} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className={`
                              w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg transition-transform group-hover:scale-110
                              ${g.grade === 'S' ? 'bg-amber-100 text-amber-700' :
                                g.grade === 'A' || g.grade === 'AB' ? 'bg-blue-100 text-blue-700' :
                                g.grade === 'B' ? 'bg-green-100 text-green-700' :
                                'bg-surface text-outline'}
                            `}>
                              {g.grade}
                            </div>
                            <span className="font-semibold text-on-surface">Hạng {g.grade}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium text-outline">
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

                  <div className="pt-6 border-t border-outline-variant">
                    <h4 className="text-xs font-bold text-outline uppercase mb-4 tracking-wider">Công nhân (Worker)</h4>
                    <div className="space-y-3">
                      {gradingWorker.map((g) => (
                        <div key={g.grade} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className={`
                              w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg transition-transform group-hover:scale-110
                              ${g.grade === 'S' ? 'bg-amber-100 text-amber-700' :
                                g.grade === 'A' || g.grade === 'AB' ? 'bg-blue-100 text-blue-700' :
                                g.grade === 'B' ? 'bg-green-100 text-green-700' :
                                'bg-surface text-outline'}
                            `}>
                              {g.grade}
                            </div>
                            <span className="font-semibold text-on-surface">Hạng {g.grade}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium text-outline">
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

                <div className="mt-8 p-4 bg-surface rounded-xl border border-outline-variant">
                  <div className="flex gap-3 text-sm text-on-surface-variant">
                    <Info size={16} className="text-primary shrink-0 mt-0.5" />
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
