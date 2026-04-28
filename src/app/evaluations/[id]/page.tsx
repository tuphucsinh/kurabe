
'use client';

import { useState, useReducer, use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getCriteriaForRole } from '@/lib/db/criteria';
import { useUser, useEvaluationByEmployee } from '@/hooks/use-db';
import { User, Evaluation, EvaluationRound, CriteriaGroup } from '@/types';
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
import { isRoundLocked } from '@/data/workflow';
import { LazyMotion, domAnimation } from 'framer-motion';
import { saveEvaluationRound } from '@/actions/evaluation';

interface EvaluationState {
  employee: User | null;
  evaluation: Evaluation | null;
  currentRoundData: EvaluationRound | null;
  allPreviousRounds: EvaluationRound[];
  scores: Record<string, number>;
  notes: Record<string, string>;
  comment: string;
}

type EvaluationAction =
  | { type: 'SET_INITIAL_DATA'; payload: Partial<EvaluationState> }
  | { type: 'SET_SCORE'; criterionId: string; points: number }
  | { type: 'SET_NOTE'; criterionId: string; note: string }
  | { type: 'SET_COMMENT'; comment: string };

const initialState: EvaluationState = {
  employee: null,
  evaluation: null,
  currentRoundData: null,
  allPreviousRounds: [],
  scores: {},
  notes: {},
  comment: '',
};

function evaluationReducer(state: EvaluationState, action: EvaluationAction): EvaluationState {
  switch (action.type) {
    case 'SET_INITIAL_DATA':
      return { ...state, ...action.payload };
    case 'SET_SCORE':
      return { ...state, scores: { ...state.scores, [action.criterionId]: action.points } };
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

export default function EvaluationPage({ params }: EvaluationPageProps) {
  const router = useRouter();
  const { id } = use(params);
  
  const queryClient = useQueryClient();
  const { data: employee = null, isLoading: isLoadingUser } = useUser(id);
  const { data: evaluation = null, isLoading: isLoadingEval } = useEvaluationByEmployee(id);

  const [state, dispatch] = useReducer(evaluationReducer, initialState);
  const { scores, notes, comment, currentRoundData, allPreviousRounds } = state;

  const [criteriaGroups, setCriteriaGroups] = useState<CriteriaGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState('A');
  const [isSaving, setIsSaving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    async function loadData() {
      if (employee && evaluation) {
        // Fetch criteria from DB
        const roleForCriteria = employee.role === 'Employee' ? 'Employee' : 'Leader';
        const dbCriteria = await getCriteriaForRole(roleForCriteria);
        setCriteriaGroups(dbCriteria);

        const current = evaluation.rounds.find(r => r.round === evaluation.currentRound) || null;
        const prevRounds = evaluation.rounds
          .filter(r => r.round < evaluation.currentRound)
          .sort((a, b) => a.round - b.round);

        let initialScores: Record<string, number> = {};
        let initialNotes: Record<string, string> = {};
        let initialComment = '';

        if (current?.scores && Object.keys(current.scores).length > 0) {
          initialScores = { ...current.scores };
          initialNotes = current.notes || {};
          initialComment = current.comment || '';
        } else if (prevRounds.length > 0) {
          const lastRound = prevRounds[prevRounds.length - 1];
          initialScores = { ...lastRound.scores };
          initialNotes = lastRound.notes || {};
        }

        dispatch({
          type: 'SET_INITIAL_DATA',
          payload: {
            employee,
            evaluation,
            currentRoundData: current,
            allPreviousRounds: prevRounds,
            scores: initialScores,
            notes: initialNotes,
            comment: initialComment,
          }
        });
      }
    }
    loadData();
  }, [employee, evaluation]);

  if (!isMounted || isLoadingUser || isLoadingEval || !employee || !evaluation) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-full"></div>
          <div className="text-slate-400 font-medium">Đang tải dữ liệu...</div>
        </div>
      </div>
    );
  }

  const activeGroup = criteriaGroups.find(g => g.id === activeGroupId) || criteriaGroups[0];
  const isLocked = currentRoundData ? isRoundLocked(currentRoundData) : false;

  const handleSave = async (isSubmit: boolean) => {
    if (!evaluation || !currentRoundData) return;

    setIsSaving(true);
    try {
      const res = await saveEvaluationRound(
        evaluation.id,
        evaluation.currentRound,
        currentRoundData.evaluatorId,
        scores,
        notes,
        comment,
        isSubmit
      );

      if (res.success) {
        queryClient.invalidateQueries({ queryKey: ['evaluation-by-employee', id] });
        if (isSubmit) {
          alert('Đánh giá đã được gửi thành công!');
          router.push('/employees');
        } else {
          alert('Đã lưu bản nháp.');
        }
      } else {
        alert(`Lỗi: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Đã xảy ra lỗi khi xử lý đánh giá.');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper for type-safe round data
  const currentSummaryRound: EvaluationRound = {
    id: currentRoundData?.id || '',
    evaluationId: evaluation.id,
    round: evaluation.currentRound,
    evaluatorId: currentRoundData?.evaluatorId || '',
    evaluatorRole: employee.role === 'Employee' ? 'Employee' : 'Leader',
    scores,
    notes,
    totalScore: 0,
    grade: 'Pending',
    comment,
    submittedAt: currentRoundData?.submittedAt,
    createdAt: currentRoundData?.createdAt || '',
  };

  const { totalScore, grade } = calculateRoundScore(currentSummaryRound);

  return (
    <LazyMotion features={domAnimation}>
      <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-outline font-medium">
              <span>Đánh giá</span>
              <ChevronRight size={14} />
              <span className="text-primary bg-primary/10 px-2 py-0.5 rounded">Lần {evaluation.currentRound} / 3</span>
              {allPreviousRounds.length > 0 && (
                <button 
                  onClick={() => router.push(`/evaluations/${id}/compare`)}
                  className="flex items-center gap-2 px-4 py-1.5 bg-white border border-outline-variant rounded-xl text-sm font-bold text-primary hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95 ml-2"
                >
                  <ArrowLeftRight size={16} />
                  <span>Chi tiết so sánh</span>
                </button>
              )}
              {isLocked && (
                <>
                  <ChevronRight size={14} />
                  <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded flex items-center gap-1">
                    <Lock size={12} /> Đã khóa
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-row gap-3 w-full md:w-auto">
              {!isLocked ? (
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
                  Đã nộp {isMounted && currentRoundData?.submittedAt && `lúc ${new Date(currentRoundData.submittedAt).toLocaleString('vi-VN')}`}
                </div>
              )}
            </div>
          </div>

          <EvaluationHeader
            employee={employee}
            isLeader={employee.role !== 'Employee'}
            scores={scores}
            criteriaGroups={criteriaGroups}
            allPreviousRounds={allPreviousRounds}
            grade={grade}
            totalScore={totalScore}
            scoredCount={Object.keys(scores).length}
            totalCriteria={criteriaGroups.reduce((sum, g) => sum + g.criteria.length, 0)}
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
                notes={notes}
                onScoreChange={(id, val) => dispatch({ type: 'SET_SCORE', criterionId: id, points: val })}
                onNoteChange={(id, val) => dispatch({ type: 'SET_NOTE', criterionId: id, note: val })}
                allPreviousRounds={allPreviousRounds}
                disabled={isLocked || isSaving}
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
                disabled={isLocked || isSaving}
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
