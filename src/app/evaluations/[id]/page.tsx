
'use client';

import { useState, use, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useUsers, useEvaluationByEmployee } from '@/hooks/use-db';
import { User, EvaluationRound, RoundNumber } from '@/types';
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
  Send,
  Undo2,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react';
import { getEvaluationAccessState } from '@/data/workflow';
import { LazyMotion, domAnimation } from 'framer-motion';
import { saveEvaluationRound, returnEvaluationRound } from '@/actions/evaluation';
import {
  getMaxEvaluationRound,
  isLeaderGradingRole,
} from '@/lib/evaluation-workflow';
import { useToast } from '@/components/ui/Toast';
import { suggestCommentAction, draftResultMessageAction, saveResultMessageAction } from '@/actions/ai';
import { usePeriods } from '@/hooks/use-db';

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

export default function EvaluationPage({ params }: EvaluationPageProps) {
  const router = useRouter();
  const { id } = use(params);

  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: employee = null, isLoading: isLoadingUser } = useUser(id);
  const { data: evaluation = null, isLoading: isLoadingEval } = useEvaluationByEmployee(id, undefined, user);
  const { data: users = [] } = useUsers(user);
  const { data: periods = [] } = usePeriods();

  const isEmployeeOwner = user?.role === 'Employee' && evaluation?.employeeId === user.id;
  const [isSavingDraftMessage, setIsSavingDraftMessage] = useState(false);

  const [showDraftSavedToast, showDraftSaved] = useAutoResetToast();
  const [showSubmitSuccessToast, showSubmitSuccess] = useAutoResetToast();

  // Redirect sau submit — giữ timer ref để cleanup khi unmount (tránh update after unmount)
  const redirectTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (redirectTimer.current !== null) window.clearTimeout(redirectTimer.current);
  }, []);

  // AI (Manager-only)
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);

  // Return dialog state
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [isReturning, setIsReturning] = useState(false);

  const [activeGroupId, setActiveGroupId] = useState('A');
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

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
  } = useEvaluationPageState({ employee, evaluation, accessState, isEmployeeOwner, user });
  const { scores, selectedLevelIndexes, notes, comment, currentRoundData, allPreviousRounds } = state;

  if (!isMounted || isLoadingUser || isLoadingEval) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full"></div>
          <div className="text-slate-400 font-medium">Đang tải dữ liệu...</div>
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
    const roleLabel: Record<string, string> = {
      Manager: 'Manager',
      Leader: 'Leader',
      SubLeader: 'SubLeader',
      Employee: 'Nhân viên',
    };
    const blockedDetail =
      accessState.reason === 'NO_DRAFT'
        ? `${employee.name} (${roleLabel[employee.role] || employee.role}) chưa có đánh giá — hiện đang ở vòng ${evaluation.currentRound}/${blockedMaxRound}, chưa ai khởi tạo bản nháp cho vòng này.`
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
    evaluatorRole: usesLeaderGrading ? 'Leader' : 'Employee',
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
    if (!employee) return;
    setIsSuggesting(true);
    try {
      const totalScoreNow = Object.values(scores).reduce((a, b) => a + (Number(b) || 0), 0);
      const criteriaDetail = criteriaGroups
        .flatMap((g) => g.criteria)
        .map((c) => {
          const levelIdx = selectedLevelIndexes[c.id] ?? 0;
          const level = c.levels[levelIdx];
          return {
            code: c.code,
            name: c.name,
            points: Number(scores[c.id]) || 0,
            levelLabel: level?.label || '',
            note: notes[c.id] || '',
          };
        });
      const result = await suggestCommentAction({
        employeeCode: employee.employeeCode || '',
        role: employee.role,
        criteriaDetail,
        previousComments: (allPreviousRounds || []).map((r) => r.comment || '').filter(Boolean),
        currentComment: comment,
        totalScore: totalScoreNow,
        grade: currentRoundData?.grade || '',
      });
      if (result.comment) {
        dispatch({ type: 'SET_COMMENT', comment: result.comment });
        toast('Đã điền gợi ý — anh có thể chỉnh sửa trước khi lưu.', 'success');
      } else {
        toast(result.error || 'Lỗi khi tạo gợi ý.', 'error');
      }
    } catch (err) {
      console.error('suggestComment error:', err);
      toast('Lỗi khi tạo gợi ý.', 'error');
    } finally {
      setIsSuggesting(false);
    }
  };

  const handleDraftMessage = async () => {
    if (!employee || !evaluation) return;
    setIsDrafting(true);
    try {
      const lastRound = [...evaluation.rounds].sort((a, b) => b.round - a.round).find((r) => (r.totalScore || 0) > 0);
      const lastScores = lastRound?.scores || {};
      const criteriaDetail = criteriaGroups
        .flatMap((g) => g.criteria)
        .filter((c) => lastScores[c.id] !== undefined)
        .map((c) => {
          const levelIdx = lastRound?.selectedLevelIndexes?.[c.id] ?? 0;
          const level = c.levels[levelIdx];
          return {
            code: c.code,
            name: c.name,
            points: Number(lastScores[c.id]) || 0,
            levelLabel: level?.label || '',
          };
        });
      const result = await draftResultMessageAction({
        employeeCode: employee.employeeCode || '',
        name: employee.name,
        role: employee.role,
        totalScore: lastRound?.totalScore || 0,
        grade: lastRound?.grade || '',
        criteriaDetail,
        previousComments: (evaluation.rounds || [])
          .filter((r) => r.round < (lastRound?.round ?? 0))
          .map((r) => r.comment || '')
          .filter(Boolean),
        notesSummary: Object.entries(lastRound?.notes || {})
          .filter(([, v]) => v && v.trim())
          .slice(0, 3)
          .map(([k, v]) => {
            const c = criteriaGroups.flatMap((g) => g.criteria).find((x) => x.id === k);
            return `${c?.code || ''} ${c?.name || ''}: ${v}`;
          })
          .filter(Boolean)
          .join(' | '),
        summaryNotes: comment || (evaluation.rounds || []).map((r) => r.comment).filter(Boolean).join(' | '),
        periodName: (() => {
          const period = evaluation.periodId ? periods.find((p) => p.id === evaluation.periodId) : undefined;
          return period ? `${period.name} (${period.year})` : 'Kỳ đánh giá';
        })(),
      });
      if (result.message) {
        setDraftMessage(result.message);
      } else {
        toast(result.error || 'Lỗi khi soạn thông báo.', 'error');
      }
    } catch (err) {
      console.error('draftMessage error:', err);
      toast('Lỗi khi soạn thông báo.', 'error');
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSaveDraftMessage = async () => {
    if (!evaluation || !draftMessage.trim()) return;
    setIsSavingDraftMessage(true);
    try {
      const res = await saveResultMessageAction({
        evaluationId: evaluation.id,
        message: draftMessage.trim(),
      });
      if (res.ok) {
        toast('Đã lưu thông báo kết quả vào phiếu!', 'success');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['evaluation-by-employee', id, undefined, user?.id] }),
          queryClient.invalidateQueries({ queryKey: ['evaluations'] }),
        ]);
      } else {
        toast(res.error || 'Lỗi khi lưu thông báo.', 'error');
      }
    } catch (err) {
      console.error('Error saving draft message:', err);
      toast('Lỗi khi lưu thông báo.', 'error');
    } finally {
      setIsSavingDraftMessage(false);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      {showDraftSavedToast && (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 shadow-xl">
          <p className="text-sm font-semibold text-emerald-700">Đã lưu bản nháp.</p>
        </div>
      )}
      {showSubmitSuccessToast && (
        <div className="fixed left-1/2 top-5 z-50 -translate-x-1/2 rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 shadow-xl">
          <p className="text-sm font-semibold text-blue-700">Đánh giá đã được gửi thành công!</p>
        </div>
      )}
      <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-outline font-medium">
              <span>Đánh giá</span>
              <ChevronRight size={14} className="shrink-0" />
              <span className="text-primary bg-primary/10 px-2 py-0.5 rounded">
                Lần {accessState.editableRound || accessState.displayRound} / {maxRound}
              </span>
              {allPreviousRounds.length > 0 && (
                <button
                  onClick={() => router.push(`/evaluations/${id}/compare`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-outline-variant rounded-xl text-xs sm:text-sm font-bold text-primary hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95"
                >
                  <ArrowLeftRight size={14} />
                  <span>Chi tiết so sánh</span>
                </button>
              )}
              {isReadOnly && (
                <>
                  <ChevronRight size={14} className="shrink-0" />
                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1">
                    <Lock size={12} /> {activeRoundData.status === 'Submitted' ? 'Đã nộp' : 'Chỉ xem'}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-row gap-3 w-full md:w-auto">
              {!isReadOnly ? (
                <>
                  {accessState.editableRound !== null && accessState.editableRound > 1 && (
                    <button
                      onClick={() => setReturnDialogOpen(true)}
                      disabled={isSaving}
                      className="flex-1 md:flex-none px-4 md:px-6 py-2.5 bg-white text-rose-600 border border-rose-300 rounded-xl font-bold hover:bg-rose-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap"
                    >
                      <Undo2 size={18} className="shrink-0" />
                      <span>Trả lại đánh giá</span>
                    </button>
                  )}
                  <button
                    onClick={() => handleSave(false)}
                    disabled={isSaving}
                    className="flex-1 md:flex-none px-4 md:px-6 py-2.5 bg-white text-on-surface border border-outline-variant rounded-xl font-bold hover:bg-surface hover:border-outline transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap"
                  >
                    Lưu bản nháp
                  </button>
                  <button
                    onClick={() => handleSave(true)}
                    disabled={isSaving}
                    className="flex-1 md:flex-none px-4 md:px-6 py-2.5 bg-primary text-white rounded-xl font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100 text-sm whitespace-nowrap"
                  >
                    <CheckCircle2 size={18} className="shrink-0" />
                    <span>{isSaving ? 'Đang gửi...' : 'Gửi Đánh giá'}</span>
                  </button>
                </>
              ) : (
                <>
                  {user?.role === 'Manager' && evaluation?.employeeId === user.id && evaluation?.status === 'Approved' && (
                    <button
                      onClick={() => setReturnDialogOpen(true)}
                      disabled={isSaving}
                      className="flex-1 md:flex-none px-4 md:px-6 py-2.5 bg-white text-rose-600 border border-rose-300 rounded-xl font-bold hover:bg-rose-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap"
                    >
                      <Undo2 size={18} className="shrink-0" />
                      <span>Trả lại báo cáo</span>
                    </button>
                  )}
                  <div className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-medium flex items-center gap-2">
                    <Lock size={16} />
                    {activeRoundData.status === 'Submitted'
                      ? `Đã nộp${isMounted && activeRoundData.submittedAt ? ` lúc ${new Date(activeRoundData.submittedAt).toLocaleString('vi-VN')}` : ''}`
                      : 'Đang xem bản nháp của vòng này'}
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
          />

          {evaluation?.returnNote && (
            <div className="mt-3 px-4 py-3 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl text-sm font-medium flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
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

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-6">
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

          <div className="w-full lg:w-80 shrink-0">
            <div className="bg-white rounded-2xl p-6 border border-outline-variant shadow-sm sticky top-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-on-surface-variant">Ghi chú chung</h3>
                {user?.role === 'Manager' && !isReadOnly && (
                  <button
                    onClick={handleSuggestComment}
                    disabled={isSuggesting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 transition-all disabled:opacity-50"
                  >
                    {isSuggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                    {isSuggesting ? 'Đang gợi ý...' : 'Gợi ý nhận xét (AI)'}
                  </button>
                )}
              </div>
              <textarea
                value={comment}
                onChange={(e) => dispatch({ type: 'SET_COMMENT', comment: e.target.value })}
                placeholder="Nhập nhận xét tổng quát cho kỳ đánh giá này..."
                disabled={isReadOnly || isSaving}
                className="w-full h-40 p-4 bg-surface border border-outline-variant rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all resize-none"
              />
              <p className="mt-2 text-xs text-outline leading-relaxed">
                Nhận xét này sẽ được hiển thị cho nhân viên sau khi kỳ đánh giá kết thúc.
              </p>
              {user?.role === 'Manager' && (
                <>
                  <button
                    onClick={handleDraftMessage}
                    disabled={isDrafting}
                    className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-outline-variant text-xs font-bold text-on-surface hover:border-primary hover:text-primary transition-all disabled:opacity-50"
                  >
                    {isDrafting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    {isDrafting ? 'Đang soạn...' : 'Soạn thông báo kết quả (AI)'}
                  </button>
                  {draftMessage && (
                    <div className="mt-3 p-3 rounded-xl bg-surface border border-outline-variant text-xs text-on-surface leading-relaxed space-y-2">
                      <p className="whitespace-pre-wrap">{draftMessage}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => { navigator.clipboard.writeText(draftMessage); toast('Đã sao chép thông báo.', 'success'); }}
                          className="text-primary font-bold hover:underline flex items-center gap-1"
                        >
                          <Copy size={12} />
                          <span>Sao chép</span>
                        </button>
                        <span>•</span>
                        <button
                          type="button"
                          onClick={handleSaveDraftMessage}
                          disabled={isSavingDraftMessage}
                          className="text-emerald-700 font-bold hover:underline flex items-center gap-1 disabled:opacity-50"
                        >
                          {isSavingDraftMessage ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          <span>{isSavingDraftMessage ? 'Đang lưu...' : 'Lưu vào phiếu'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Dãy nhóm tiêu chuẩn cuối trang — click chuyển nhóm + cuộn lên đầu */}
        {criteriaGroups.length > 0 && (
          <div className="mt-8 pt-6 border-t border-outline-variant/40">
            <p className="text-xs font-bold text-outline uppercase tracking-wide mb-3">Chuyển nhanh đến nhóm tiêu chuẩn</p>
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
