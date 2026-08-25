
'use client';

import { useState, use, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useEvaluationPageData } from '@/hooks/use-db';
import { User, EvaluationRound, RoundNumber, EvaluationPeriod } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import CriteriaTab from '@/components/evaluation/CriteriaTab';
import EvaluationHeader from '@/components/evaluation/EvaluationHeader';
import GroupNavTabs from '@/components/evaluation/GroupNavTabs';
import AccessDenied, { RoundLoading } from '@/components/evaluation/AccessDenied';
import HistoryList from '@/components/evaluation/HistoryList';
import ReturnDialog from '@/components/evaluation/ReturnDialog';
import ResultCard from '@/components/evaluation/ResultCard';
import { useEvaluationPageState } from '@/hooks/use-evaluation-page-state';
import { useAutoResetToast } from '@/hooks/use-auto-reset-toast';
import { calculateRoundScore } from '@/lib/scoring';
import {
  ChevronRight,
  CheckCircle2,
  Lock,
  ArrowLeftRight,
  Loader2,
  Sparkles,
  Undo2,
  AlertTriangle,
} from 'lucide-react';
import { getEvaluationAccessState } from '@/data/workflow';
import { LazyMotion, domAnimation } from 'framer-motion';
import {
  saveEvaluationRound,
  returnEvaluationRound,
  initializeEvaluationRoundDraft,
} from '@/actions/evaluation';
import {
  getMaxEvaluationRound,
  isLeaderGradingRole,
} from '@/lib/evaluation-workflow';
import { useToast } from '@/components/ui/Toast';
import { draftResultMessageAction } from '@/actions/ai';
import { isIndividualRole, roleLabel } from '@/lib/role-policy';

interface EvaluationPageProps {
  params: Promise<{ id: string }>;
}

const ROLE_RANK: Record<User['role'], number> = {
  Worker: 1,
  Employee: 1,
  SubLeader: 2,
  Leader: 3,
  Manager: 4,
};

const EMPTY_USERS: User[] = [];
const EMPTY_PERIODS: EvaluationPeriod[] = [];

export default function EvaluationPage({ params }: EvaluationPageProps) {
  const router = useRouter();
  const { id } = use(params);

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: pageData, isLoading } = useEvaluationPageData(id, undefined, user);
  const employee = pageData?.employee ?? null;
  const evaluation = pageData?.evaluation ?? null;
  const evaluationId = evaluation?.id;
  const users = pageData?.users ?? EMPTY_USERS;
  const periods = pageData?.periods ?? EMPTY_PERIODS;
  const isLoadingUser = isLoading;
  const isLoadingEval = isLoading;

  const isEmployeeOwner = isIndividualRole(user?.role) && evaluation?.employeeId === user?.id;

  const [showDraftSavedToast, showDraftSaved] = useAutoResetToast();
  const [showSubmitSuccessToast, showSubmitSuccess] = useAutoResetToast();

  // Redirect sau submit — giữ timer ref để cleanup khi unmount (tránh update after unmount)
  const redirectTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
  }, []);

  // AI (Manager-only)
  const [isSuggesting, setIsSuggesting] = useState(false);

  // Return dialog state
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [isReturning, setIsReturning] = useState(false);

  const [activeGroupId, setActiveGroupId] = useState('A');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const autosaveAttemptedKeys = useRef<Set<string>>(new Set());
  const autosavePendingKeys = useRef<Set<string>>(new Set());

  // Access control
  const accessState = useMemo(() =>
    evaluation ? getEvaluationAccessState(user, evaluation, users) : null,
  [evaluation, user, users]);

  // State + data loading (reducer, criteria, history, grade bands) — tách sang hook (D3)
  const {
    state,
    dispatch,
    criteriaGroups,
    history,
    isLoadingHistory,
    gradeBands,
    isMounted,
    initMetadata,
    userEditedRef,
  } = useEvaluationPageState({ employee, evaluation, accessState, isEmployeeOwner, user });
  const { scores, selectedLevelIndexes, notes, comment, currentRoundData, allPreviousRounds } = state;

  useEffect(() => {
    const currentEvaluationId = evaluationId;
    if (!currentEvaluationId) return;
    const safeEvaluationId: string = currentEvaluationId;

    const shouldAutosave =
      initMetadata.initialized &&
      initMetadata.firstOpenEligible &&
      accessState?.mode === 'edit' &&
      initMetadata.round !== null &&
      currentEvaluationId &&
      initMetadata.key &&
      !userEditedRef.current &&
      !autosaveAttemptedKeys.current.has(initMetadata.key) &&
      !autosavePendingKeys.current.has(initMetadata.key);

    if (!shouldAutosave || !currentEvaluationId || initMetadata.round === null || !initMetadata.key) return;

    const autosaveKey = initMetadata.key;
    const autosaveRound = initMetadata.round as RoundNumber;

    autosaveAttemptedKeys.current.add(autosaveKey);
    autosavePendingKeys.current.add(autosaveKey);

    async function runFirstOpenAutosave() {
      try {
        const res = await initializeEvaluationRoundDraft(
          safeEvaluationId,
          autosaveRound,
          scores,
          notes,
          selectedLevelIndexes,
          comment
        );
        if (!res.success && res.error) {
          console.error('[FirstOpenAutosave] Failed to initialize draft:', res.error);
          toast(`Không thể tự động lưu bản nháp: ${res.error}`, 'error');
        }
      } catch (err) {
        console.error('[FirstOpenAutosave] Unexpected error initializing draft:', err);
        toast('Không thể tự động khởi tạo bản nháp.', 'error');
      } finally {
        autosavePendingKeys.current.delete(autosaveKey);
      }
    }

    runFirstOpenAutosave();
  }, [
    accessState?.mode,
    comment,
    evaluationId,
    initMetadata,
    notes,
    scores,
    selectedLevelIndexes,
    toast,
    userEditedRef,
  ]);

  if (!isMounted || isLoadingUser || isLoadingEval) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-brand-soft rounded-full"></div>
          <div className="text-ink-muted font-medium">Đang tải dữ liệu...</div>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <AccessDenied
        title="Quyền truy cập bị từ chối"
        message="Bạn không có quyền truy cập"
        onBack={() => router.back()}
      />
    );
  }

  if (!evaluation) {
    const isViewerLowerThanTarget = !!user && ROLE_RANK[user.role] < ROLE_RANK[employee.role];

    if (isViewerLowerThanTarget) {
      return (
        <AccessDenied
          message="Bạn không thể xem đánh giá của cấp trên"
          onBack={() => router.back()}
        />
      );
    }

    return (
      <AccessDenied
        tone="amber"
        title="Chưa có dữ liệu đánh giá"
        message="Không có dữ liệu evaluation tương ứng cho nhân viên này."
        onBack={() => router.back()}
      />
    );
  }

  if (!accessState) {
    return (
      <AccessDenied
        message="Bạn không thể xem đánh giá của cấp trên"
        onBack={() => router.back()}
      />
    );
  }

  // Blocked UI
  if (accessState.mode === 'blocked') {
    const blockedMaxRound = getMaxEvaluationRound(employee.role);
    const blockedDetail =
      accessState.reason === 'NO_DRAFT'
        ? `${employee.name} (${roleLabel(employee.role)}) chưa có đánh giá — hiện đang ở vòng ${evaluation.currentRound}/${blockedMaxRound}, chưa ai khởi tạo bản nháp cho vòng này.`
        : 'Bạn không có quyền xem hoặc thực hiện đánh giá này.';
    return (
      <AccessDenied
        message={blockedDetail}
        onBack={() => router.back()}
      />
    );
  }

  const activeGroup = criteriaGroups.find(g => g.id === activeGroupId) || criteriaGroups[0];

  const handleGroupSelect = (groupId: string) => {
    setActiveGroupId(groupId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const isReadOnly = accessState.mode === 'readonly';
  const usesLeaderGrading = isLeaderGradingRole(employee.role);
  const maxRound = getMaxEvaluationRound(employee.role);
  const activeRound = accessState.editableRound || accessState.displayRound;
  const activeRoundExists = activeRound
    ? evaluation.rounds.some(r => r.round === activeRound)
    : false;
  const activeRoundData = currentRoundData?.round === activeRound ? currentRoundData : null;

  if (activeRound && activeRoundExists && !activeRoundData) {
    return <RoundLoading />;
  }

  if (!activeRound || !activeRoundExists || !activeRoundData) {
    return (
      <AccessDenied
        title="Không thể tải vòng đánh giá"
        message="Vòng đánh giá hiện tại chưa sẵn sàng hoặc đã bị khóa."
        onBack={() => router.back()}
      />
    );
  }

  const handleSave = async (isSubmit: boolean) => {
    if (!evaluation || !accessState.editableRound || !user?.id) return;

    setIsSaving(true);
    try {
      const res = await saveEvaluationRound(
        evaluation.id,
        accessState.editableRound,
        scores,
        notes,
        selectedLevelIndexes,
        comment,
        isSubmit
      );

      if (res.success) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['evaluation-page-data', id, undefined, user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['evaluation-by-employee', id, undefined, user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['evaluations'] }),
        ]);
        if (isSubmit) {
          showSubmitSuccess();
          redirectTimer.current = window.setTimeout(() => {
            router.push('/employees');
          }, 900);
        } else {
          showDraftSaved();
        }
      } else {
        toast(`Lỗi: ${res.error}`, 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Đã xảy ra lỗi khi xử lý đánh giá.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReturnEvaluation = async () => {
    const roundToReturn = accessState.editableRound ?? activeRound;
    if (!evaluation || !roundToReturn || !user?.id) return;

    const reason = returnReason.trim();
    if (!reason) {
      toast('Vui lòng nhập lý do trả lại.', 'error');
      return;
    }

    setIsReturning(true);
    try {
      const res = await returnEvaluationRound(
        evaluation.id,
        roundToReturn as RoundNumber,
        reason
      );

      if (res.success) {
        toast('Đã trả lại đánh giá.', 'success');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['evaluation-page-data', id, undefined, user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['evaluation-by-employee', id, undefined, user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['evaluations'] }),
        ]);
        setReturnDialogOpen(false);
        setReturnReason('');
      } else {
        toast(`Lỗi: ${res.error}`, 'error');
      }
    } catch (err) {
      console.error(err);
      toast('Đã xảy ra lỗi khi trả lại đánh giá.', 'error');
    } finally {
      setIsReturning(false);
    }
  };

  // Helper for type-safe round data
  const currentSummaryRound: EvaluationRound = {
    id: activeRoundData.id || '',
    evaluationId: evaluation.id,
    round: activeRound,
    evaluatorId: activeRoundData.evaluatorId || user?.id || '',
    evaluatorRole: employee.role,
    scores,
    selectedLevelIndexes,
    notes,
    totalScore: 0,
    grade: 'Pending',
    comment,
    status: activeRoundData.status || 'Draft',
    submittedAt: activeRoundData.submittedAt,
    createdAt: activeRoundData.createdAt || '',
  };

  const { totalScore, grade } = calculateRoundScore(currentSummaryRound, gradeBands);

  const handleSuggestComment = async () => {
    if (!employee || user?.role !== 'Manager' || isReadOnly) return;
    setIsSuggesting(true);
    try {
      const allCriteria = criteriaGroups.flatMap((g) => g.criteria);
      const criteriaMap = new Map(allCriteria.map((c) => [c.id, c]));

      const criteriaDetail = allCriteria.map((c) => {
        const levelIdx = selectedLevelIndexes[c.id] ?? 0;
        const level = c.levels[levelIdx];
        return {
          code: c.code,
          name: c.name,
          points: Number(scores[c.id]) || 0,
          levelLabel: level?.label || '',
        };
      });

      const previousComments = (allPreviousRounds || [])
        .map((r) => r.comment || '')
        .filter(Boolean);

      const notesSummary = Object.entries(notes)
        .filter(([k, v]) => Boolean(v && v.trim() && criteriaMap.has(k)))
        .slice(0, 3)
        .map(([k, v]) => {
          const c = criteriaMap.get(k)!;
          return `${c.code} ${c.name}: ${v.trim()}`;
        })
        .join(' | ');

      const prevCommentsText = previousComments.join(' | ');
      const summaryNotes = comment.trim() || prevCommentsText;

      const period = evaluation?.periodId ? periods.find((p) => p.id === evaluation.periodId) : undefined;
      const periodName = period ? `${period.name} (${period.year})` : 'Kỳ đánh giá';

      const result = await draftResultMessageAction({
        employeeCode: employee.employeeCode || '',
        name: employee.name || '',
        role: employee.role || '',
        totalScore,
        grade,
        criteriaDetail,
        previousComments,
        notesSummary,
        summaryNotes,
        periodName,
      });

      if (result.message) {
        dispatch({ type: 'SET_COMMENT', comment: result.message });
        toast('Đã tạo nhận xét AI — anh có thể chỉnh sửa trước khi lưu.', 'success');
      } else {
        toast(result.error || 'Lỗi khi tạo nhận xét AI.', 'error');
      }
    } catch (err) {
      console.error('handleSuggestComment error:', err);
      toast('Lỗi khi tạo nhận xét AI.', 'error');
    } finally {
      setIsSuggesting(false);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      {showDraftSavedToast && (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 shadow-lg">
          <p className="text-xs sm:text-sm font-bold text-emerald-800">Đã lưu bản nháp.</p>
        </div>
      )}
      {showSubmitSuccessToast && (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 shadow-lg">
          <p className="text-xs sm:text-sm font-bold text-emerald-800">Đánh giá đã được gửi thành công!</p>
        </div>
      )}
      <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 max-md:px-3 max-md:py-3 max-md:space-y-4 animate-in fade-in duration-300 w-full max-w-[1600px] mx-auto xl:px-6 xl:py-4 xl:max-w-none xl:space-y-6">
        <div className="flex flex-col gap-6 max-md:gap-3 xl:gap-4">
          <div className="flex flex-row max-md:flex-col justify-between items-center max-md:items-start gap-4 max-md:gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm max-md:text-xs text-ink-muted font-medium max-md:w-full max-md:flex-nowrap max-md:justify-between">
              <span>Đánh giá</span>
              <ChevronRight size={13} className="shrink-0 text-outline-soft max-md:hidden" />
              <span className="text-brand bg-brand-soft px-2.5 py-0.5 rounded-lg text-sm max-md:text-xs font-bold">
                Lần {accessState.editableRound || accessState.displayRound} / {maxRound}
              </span>
              {allPreviousRounds.length > 0 && (
                <button
                  onClick={() => router.push(`/evaluations/${id}/compare`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 max-md:min-h-[44px] bg-surface-raised border border-outline-soft rounded-xl text-sm max-md:text-xs font-bold text-ink hover:text-brand hover:border-brand/40 transition-all shadow-2xs active:scale-95"
                >
                  <ArrowLeftRight size={14} className="text-brand" />
                  <span>Chi tiết so sánh</span>
                </button>
              )}
              {isReadOnly && (
                <>
                  <ChevronRight size={13} className="shrink-0 text-outline-soft" />
                  <span className="text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-0.5 rounded-lg flex items-center gap-1 text-sm max-md:text-xs font-medium">
                    <Lock size={12} /> {activeRoundData.status === 'Submitted' ? 'Đã nộp' : 'Chỉ xem'}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 max-md:gap-2 w-auto max-md:w-full max-md:flex-wrap">
              {!isReadOnly ? (
                <>
                  {accessState.editableRound !== null && accessState.editableRound > 1 && (
                    <button
                      onClick={() => setReturnDialogOpen(true)}
                      disabled={isSaving}
                      className="px-4 py-2 max-md:basis-full max-md:flex-none max-md:min-h-[44px] max-md:px-3.5 bg-surface-raised text-rose-600 border border-rose-200 hover:border-rose-300 rounded-xl font-bold hover:bg-rose-50 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 text-sm max-md:text-xs whitespace-nowrap active:scale-[0.98] shadow-2xs"
                    >
                      <Undo2 size={15} className="shrink-0" />
                      <span>Trả lại đánh giá</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleSave(false)}
                    disabled={isSaving}
                    className="px-4 py-2 max-md:flex-1 max-md:min-h-[44px] max-md:px-3.5 bg-surface-raised text-ink border border-outline-soft rounded-xl font-bold hover:bg-surface-muted hover:border-outline transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 text-sm max-md:text-xs whitespace-nowrap active:scale-[0.98] shadow-2xs"
                  >
                    Lưu bản nháp
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={isSaving}
                    className="px-5 py-2 max-md:flex-1 max-md:min-h-[44px] max-md:px-4 bg-brand text-white rounded-xl font-bold shadow-sm hover:bg-brand-mid active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:hover:scale-100 text-sm max-md:text-xs whitespace-nowrap"
                  >
                    <CheckCircle2 size={15} className="shrink-0" />
                    <span>{isSaving ? 'Đang gửi...' : 'Gửi Đánh giá'}</span>
                  </button>
                </>
              ) : (
                <>
                  {user?.role === 'Manager' && evaluation?.employeeId === user.id && evaluation?.status === 'Approved' && (
                    <button
                      onClick={() => setReturnDialogOpen(true)}
                      disabled={isSaving}
                      className="px-4 py-2 max-md:basis-full max-md:flex-none max-md:min-h-[44px] max-md:px-3.5 bg-surface-raised text-rose-600 border border-rose-200 hover:border-rose-300 rounded-xl font-bold hover:bg-rose-50 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 text-sm max-md:text-xs whitespace-nowrap active:scale-[0.98] shadow-2xs"
                    >
                      <Undo2 size={15} className="shrink-0" />
                      <span>Trả lại báo cáo</span>
                    </button>
                  )}
                  <div className="px-3.5 py-2 max-md:w-full max-md:min-h-[44px] bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-sm max-md:text-xs font-medium flex items-center justify-start max-md:justify-center gap-1.5">
                    <Lock size={15} className="shrink-0" />
                    <span className="truncate">
                      {activeRoundData.status === 'Submitted'
                        ? `Đã nộp${isMounted && activeRoundData.submittedAt ? ` lúc ${new Date(activeRoundData.submittedAt).toLocaleString('vi-VN')}` : ''}`
                        : 'Đang xem bản nháp của vòng này'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <EvaluationHeader
            employee={employee}
            isLeader={usesLeaderGrading}
            scores={scores}
            criteriaGroups={criteriaGroups}
            allPreviousRounds={allPreviousRounds}
            grade={grade}
            totalScore={totalScore}
            scoredCount={Object.keys(scores).length}
            totalCriteria={criteriaGroups.reduce((sum, g) => sum + g.criteria.length, 0)}
            currentRound={activeRound}
            gradeBands={gradeBands}
          />

          {evaluation?.returnNote && (
            <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-sm max-md:text-xs font-medium flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-700" />
              <span>Đánh giá bị trả lại: {evaluation.returnNote}</span>
            </div>
          )}

          {/* 1. CARD KẾT QUẢ EMPLOYEE */}
          {isEmployeeOwner && evaluation?.status === 'Approved' && (
            <ResultCard
              employee={employee}
              evaluation={evaluation}
              totalScore={totalScore}
              grade={grade}
              gradeBands={gradeBands}
            />
          )}

          {/* 2. TAB/SECTION KẾT QUẢ CÁC KỲ TRƯỚC */}
          {isEmployeeOwner && (
            <HistoryList
              history={history}
              currentEvaluationId={evaluation.id}
              periods={periods}
              isLoading={isLoadingHistory}
            />
          )}
        </div>

        <div className="w-full flex flex-col lg:flex-row gap-6 items-start max-md:items-stretch">
          <div className="flex-1 min-w-0 max-md:w-full space-y-6 max-md:space-y-4">
            <GroupNavTabs
              groups={criteriaGroups}
              activeGroupId={activeGroup?.id ?? activeGroupId}
              onSelect={handleGroupSelect}
              scores={scores}
            />

            {activeGroup && (
              <CriteriaTab
                group={activeGroup}
                scores={scores}
                selectedLevelIndexes={selectedLevelIndexes}
                notes={notes}
                onScoreChange={(id, val, levelIndex) => dispatch({ type: 'SET_SCORE', criterionId: id, points: val, levelIndex })}
                onNoteChange={(id, val) => dispatch({ type: 'SET_NOTE', criterionId: id, note: val })}
                allPreviousRounds={allPreviousRounds}
                disabled={isReadOnly || isSaving}
              />
            )}
          </div>

          <div className="w-full lg:w-80 shrink-0 lg:sticky lg:top-8 z-10 xl:w-[272px]">
            <div className="bg-surface-raised rounded-2xl p-6 max-md:p-4 border border-outline-soft shadow-sm max-md:shadow-2xs space-y-3">
              <div className="flex items-center justify-between gap-2 xl:flex-wrap xl:gap-y-3">
                <h3 className="text-base max-md:text-sm font-bold text-ink">Nhận xét</h3>
                {user?.role === 'Manager' && !isReadOnly && (
                  <button
                    onClick={handleSuggestComment}
                    disabled={isSuggesting || isSaving}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 max-md:min-h-[36px] rounded-lg bg-brand-soft text-brand text-xs font-bold hover:bg-brand-soft/80 transition-all disabled:opacity-50 active:scale-95"
                  >
                    {isSuggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    <span>{isSuggesting ? 'Đang nhận xét...' : 'AI nhận xét'}</span>
                  </button>
                )}
              </div>
              <textarea
                value={comment}
                onChange={(e) => dispatch({ type: 'SET_COMMENT', comment: e.target.value })}
                placeholder="Nhập nhận xét tổng quát cho kỳ đánh giá này..."
                disabled={isReadOnly || isSaving}
                className="w-full h-36 max-md:h-32 p-3.5 max-md:p-3 bg-surface-muted border border-outline-soft rounded-xl text-sm max-md:text-base text-ink focus:ring-2 focus:ring-brand/20 focus:border-brand outline-none transition-all resize-none leading-relaxed xl:h-[314px]"
              />
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Nhận xét này sẽ được hiển thị cho nhân viên sau khi kỳ đánh giá kết thúc.
              </p>
            </div>
          </div>
        </div>

        {/* Dãy nhóm tiêu chuẩn cuối trang — click chuyển nhóm + cuộn lên đầu */}
        {criteriaGroups.length > 0 && (
          <div className="mt-8 pt-6 max-md:mt-6 max-md:pt-4 border-t border-outline-soft/60 space-y-3 max-md:space-y-2">
            <p className="text-xs font-bold text-ink-muted uppercase tracking-wider">Chuyển nhanh đến nhóm tiêu chuẩn</p>
            <GroupNavTabs
              groups={criteriaGroups}
              activeGroupId={activeGroup?.id ?? activeGroupId}
              onSelect={handleGroupSelect}
              scores={scores}
            />
          </div>
        )}
      </div>

      <ReturnDialog
        open={returnDialogOpen}
        round={accessState.editableRound ?? activeRound}
        reason={returnReason}
        isReturning={isReturning}
        onReasonChange={setReturnReason}
        onClose={() => setReturnDialogOpen(false)}
        onConfirm={handleReturnEvaluation}
      />
    </LazyMotion>
  );
}
