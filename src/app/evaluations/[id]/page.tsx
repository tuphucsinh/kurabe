
'use client';

import { useState, useReducer, use, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getCriteriaForRole } from '@/lib/db/criteria';
import { useUser, useEvaluationByEmployee } from '@/hooks/use-db';
import { User, Evaluation, EvaluationRound, CriteriaGroup } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import CriteriaTab from '@/components/evaluation/CriteriaTab';
import EvaluationHeader from '@/components/evaluation/EvaluationHeader';
import GroupNavTabs from '@/components/evaluation/GroupNavTabs';
import { calculateRoundScore } from '@/lib/scoring';
import { 
  ChevronRight,
  CheckCircle2,
  Lock,
  ArrowLeftRight,
} from 'lucide-react';
import { getEvaluationAccessState } from '@/data/workflow';
import { LazyMotion, domAnimation } from 'framer-motion';
import { saveEvaluationRound } from '@/actions/evaluation';
import {
  getMaxEvaluationRound,
  isLeaderGradingRole,
} from '@/lib/evaluation-workflow';
import { useToast } from '@/components/ui/Toast';

interface EvaluationState {
  employee: User | null;
  evaluation: Evaluation | null;
  currentRoundData: EvaluationRound | null;
  allPreviousRounds: EvaluationRound[];
  scores: Record<string, number>;
  selectedLevelIndexes: Record<string, number>;
  notes: Record<string, string>;
  comment: string;
}

type EvaluationAction =
  | { type: 'SET_INITIAL_DATA'; payload: Partial<EvaluationState> }
  | { type: 'SET_SCORE'; criterionId: string; points: number; levelIndex: number }
  | { type: 'SET_NOTE'; criterionId: string; note: string }
  | { type: 'SET_COMMENT'; comment: string };

const initialState: EvaluationState = {
  employee: null,
  evaluation: null,
  currentRoundData: null,
  allPreviousRounds: [],
  scores: {},
  selectedLevelIndexes: {},
  notes: {},
  comment: '',
};

function evaluationReducer(state: EvaluationState, action: EvaluationAction): EvaluationState {
  switch (action.type) {
    case 'SET_INITIAL_DATA':
      return { ...state, ...action.payload };
    case 'SET_SCORE':
      return {
        ...state,
        scores: { ...state.scores, [action.criterionId]: action.points },
        selectedLevelIndexes: {
          ...state.selectedLevelIndexes,
          [action.criterionId]: action.levelIndex,
        }
      };
    case 'SET_NOTE':
      return { ...state, notes: { ...state.notes, [action.criterionId]: action.note } };
    case 'SET_COMMENT':
      return { ...state, comment: action.comment };
    default:
      return state;
  }
}

interface EvaluationPageProps {
  params: Promise<{ id: string }>;
}

const ROLE_RANK: Record<User['role'], number> = {
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

  const [state, dispatch] = useReducer(evaluationReducer, initialState);
  const { scores, selectedLevelIndexes, notes, comment, currentRoundData, allPreviousRounds } = state;

  const [criteriaGroups, setCriteriaGroups] = useState<CriteriaGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState('A');
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { toast } = useToast();
  const [showDraftSavedToast, setShowDraftSavedToast] = useState(false);
  const [showSubmitSuccessToast, setShowSubmitSuccessToast] = useState(false);

  // New access control logic
  const accessState = useMemo(() => 
    evaluation ? getEvaluationAccessState(user, evaluation) : null,
  [evaluation, user]);

  useEffect(() => {
    async function loadData() {
      if (employee && evaluation && accessState) {
        if (accessState.mode === 'blocked') return;

        // Fetch criteria from DB
        const roleForCriteria = isLeaderGradingRole(employee.role) ? 'Leader' : 'Employee';
        const dbCriteria = await getCriteriaForRole(roleForCriteria);
        setCriteriaGroups(dbCriteria);

        // Identify which round to show/edit
        const targetRoundNum = accessState.editableRound || accessState.displayRound;
        const targetRound = evaluation.rounds.find(r => r.round === targetRoundNum) || null;
        
        const prevRounds = evaluation.rounds
          .filter(r => accessState.visibleRounds.some((vr: EvaluationRound) => vr.round === r.round) && r.round < (targetRoundNum || 0))
          .sort((a, b) => a.round - b.round);

        let initialScores: Record<string, number> = {};
        let initialSelectedLevelIndexes: Record<string, number> = {};
        let initialNotes: Record<string, string> = {};
        let initialComment = '';

        if (targetRound?.scores && Object.keys(targetRound.scores).length > 0) {
          initialScores = { ...targetRound.scores };
          initialSelectedLevelIndexes = targetRound.selectedLevelIndexes || {};
          initialNotes = targetRound.notes || {};
          initialComment = targetRound.comment || '';
        } else if (!accessState.editableRound && targetRound) {
          initialScores = { ...targetRound.scores };
          initialSelectedLevelIndexes = targetRound.selectedLevelIndexes || {};
          initialNotes = targetRound.notes || {};
          initialComment = targetRound.comment || '';
        } else if (prevRounds.length > 0 && accessState.editableRound) {
          // Carry forward from previous round if we are starting a new round
          const lastRound = prevRounds[prevRounds.length - 1];
          initialScores = { ...lastRound.scores };
          initialSelectedLevelIndexes = lastRound.selectedLevelIndexes || {};
          initialNotes = lastRound.notes || {};
        }

        // Pre-fill defaults chỉ khi đang edit round và chưa có dữ liệu.
        if (Object.keys(initialScores).length === 0 && !!accessState.editableRound) {
          for (const group of dbCriteria) {
            for (const criterion of group.criteria) {
              if (criterion.defaultLevelIndex != null && criterion.levels[criterion.defaultLevelIndex]) {
                initialScores[criterion.id!] = criterion.levels[criterion.defaultLevelIndex].points;
              }
            }
          }
        }

        dispatch({
          type: 'SET_INITIAL_DATA',
          payload: {
            employee,
            evaluation,
            currentRoundData: targetRound,
            allPreviousRounds: prevRounds,
            scores: initialScores,
            selectedLevelIndexes: initialSelectedLevelIndexes,
            notes: initialNotes,
            comment: initialComment,
          }
        });
      }
    }
    loadData();
  }, [employee, evaluation, accessState]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!showDraftSavedToast) return;
    const timeoutId = window.setTimeout(() => {
      setShowDraftSavedToast(false);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [showDraftSavedToast]);

  useEffect(() => {
    if (!showSubmitSuccessToast) return;
    const timeoutId = window.setTimeout(() => {
      setShowSubmitSuccessToast(false);
    }, 3000);
    return () => window.clearTimeout(timeoutId);
  }, [showSubmitSuccessToast]);

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
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-4 bg-red-50 rounded-full text-red-500">
          <Lock size={48} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Quyền truy cập bị từ chối</h2>
        <p className="text-slate-500 max-w-md">Bạn không có quyền truy cập</p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-primary text-white rounded-xl font-bold shadow-sm"
        >
          Quay lại
        </button>
      </div>
    );
  }

  if (!evaluation) {
    const isViewerLowerThanTarget = !!user && ROLE_RANK[user.role] < ROLE_RANK[employee.role];

    if (isViewerLowerThanTarget) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="p-4 bg-red-50 rounded-full text-red-500">
            <Lock size={48} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Quyền truy cập bị từ chối</h2>
          <p className="text-slate-500 max-w-md">Bạn không có quyền truy cập</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-primary text-white rounded-xl font-bold shadow-sm"
          >
            Quay lại
          </button>
        </div>
      );
    }

    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-4 bg-amber-50 rounded-full text-amber-500">
          <Lock size={48} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Chưa có dữ liệu đánh giá</h2>
        <p className="text-slate-500 max-w-md">Không có dữ liệu evaluation tương ứng cho nhân viên này.</p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-primary text-white rounded-xl font-bold shadow-sm"
        >
          Quay lại
        </button>
      </div>
    );
  }

  if (!accessState) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-4 bg-red-50 rounded-full text-red-500">
          <Lock size={48} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Quyền truy cập bị từ chối</h2>
        <p className="text-slate-500 max-w-md">Bạn không có quyền truy cập</p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-primary text-white rounded-xl font-bold shadow-sm"
        >
          Quay lại
        </button>
      </div>
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
        ? `Nhân viên (${roleLabel[employee.role] || employee.role}) chưa có đánh giá — hiện đang ở vòng ${evaluation.currentRound}/${blockedMaxRound}, chưa ai khởi tạo bản nháp cho vòng này.`
        : 'Bạn không có quyền xem hoặc thực hiện đánh giá này.';
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-4 bg-red-50 rounded-full text-red-500">
          <Lock size={48} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Quyền truy cập bị từ chối</h2>
        <p className="text-slate-500 max-w-md">
          {blockedDetail}
        </p>
        <button 
          onClick={() => router.back()}
          className="px-6 py-2 bg-primary text-white rounded-xl font-bold shadow-sm"
        >
          Quay lại
        </button>
      </div>
    );
  }

  const activeGroup = criteriaGroups.find(g => g.id === activeGroupId) || criteriaGroups[0];
  const isReadOnly = accessState.mode === 'readonly';
  const usesLeaderGrading = isLeaderGradingRole(employee.role);
  const maxRound = getMaxEvaluationRound(employee.role);
  const activeRound = accessState.editableRound || accessState.displayRound;
  const activeRoundExists = activeRound
    ? evaluation.rounds.some(r => r.round === activeRound)
    : false;
  const activeRoundData = currentRoundData?.round === activeRound ? currentRoundData : null;

  if (activeRound && activeRoundExists && !activeRoundData) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full"></div>
          <div className="text-slate-400 font-medium">Đang tải dữ liệu...</div>
        </div>
      </div>
    );
  }

  if (!activeRound || !activeRoundExists || !activeRoundData) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center space-y-4">
        <div className="p-4 bg-red-50 rounded-full text-red-500">
          <Lock size={48} />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Không thể tải vòng đánh giá</h2>
        <p className="text-slate-500 max-w-md">Vòng đánh giá hiện tại chưa sẵn sàng hoặc đã bị khóa.</p>
        <button
          onClick={() => router.back()}
          className="px-6 py-2 bg-primary text-white rounded-xl font-bold shadow-sm"
        >
          Quay lại
        </button>
      </div>
    );
  }

  const handleSave = async (isSubmit: boolean) => {
    if (!evaluation || !accessState.editableRound || !user?.id) return;

    setIsSaving(true);
    try {
      const res = await saveEvaluationRound(
        evaluation.id,
        accessState.editableRound,
        user.id,
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
          setShowSubmitSuccessToast(true);
          window.setTimeout(() => {
            router.push('/employees');
          }, 900);
        } else {
          setShowDraftSavedToast(true);
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

  const { totalScore, grade } = calculateRoundScore(currentSummaryRound);

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
            <div className="flex items-center gap-2 text-sm text-outline font-medium">
              <span>Đánh giá</span>
              <ChevronRight size={14} />
              <span className="text-primary bg-primary/10 px-2 py-0.5 rounded">
                Lần {accessState.editableRound || accessState.displayRound} / {maxRound}
              </span>
              {allPreviousRounds.length > 0 && (
                <button 
                  onClick={() => router.push(`/evaluations/${id}/compare`)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-white border border-outline-variant rounded-xl text-sm font-bold text-primary hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95 ml-2"
                >
                  <ArrowLeftRight size={16} />
                  <span>Chi tiết so sánh</span>
                </button>
              )}
              {isReadOnly && (
                <>
                  <ChevronRight size={14} />
                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1">
                    <Lock size={12} /> {activeRoundData.status === 'Submitted' ? 'Đã nộp' : 'Chỉ xem'}
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-row gap-3 w-full md:w-auto">
              {!isReadOnly ? (
                <>
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
                <div className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-medium flex items-center gap-2">
                  <Lock size={16} />
                  {activeRoundData.status === 'Submitted'
                    ? `Đã nộp${isMounted && activeRoundData.submittedAt ? ` lúc ${new Date(activeRoundData.submittedAt).toLocaleString('vi-VN')}` : ''}`
                    : 'Đang xem bản nháp của vòng này'}
                </div>
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
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="flex-1 space-y-6">
            <GroupNavTabs
              groups={criteriaGroups}
              activeGroupId={activeGroupId}
              onSelect={setActiveGroupId}
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
              <h3 className="text-lg font-bold text-on-surface-variant mb-4">Ghi chú chung</h3>
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
            </div>
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}
