
'use client';

import { useState, useReducer, use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  getCriteriaForRole
} from '@/data/criteria';
import { mockUsers, User, mockEvaluations, EvaluationRound } from '@/data/mock';
import CriteriaTab from '@/components/evaluation/CriteriaTab';
import EvaluationHeader from '@/components/evaluation/EvaluationHeader';
import GroupNavTabs from '@/components/evaluation/GroupNavTabs';
import { calculateGrade } from '@/lib/scoring';
import { 
  ChevronRight,
  CheckCircle2,
  Lock,
  MessageSquare,
  ArrowLeftRight,
  ChevronDown,
  ArrowLeft
} from 'lucide-react';
import { isRoundLocked } from '@/data/workflow';
import { m, LazyMotion, domAnimation } from 'framer-motion';
import { saveEvaluationRoundDraft, submitEvaluationRound } from '@/actions/evaluation';


interface EvaluationState {
  employee: User | null;
  evaluation: typeof mockEvaluations[0] | null;
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
  
  const [state, dispatch] = useReducer(evaluationReducer, initialState);
  const { employee, evaluation, currentRoundData, allPreviousRounds, scores, notes, comment } = state;

  const [activeGroupId, setActiveGroupId] = useState('A');
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
    const found = mockUsers.find(u => u.id === id);
    if (found) {
      // Get evaluation data
      const evalData = mockEvaluations.find(e => e.employeeId === id);
      if (evalData) {
        const current = evalData.rounds.find(r => r.round === evalData.currentRound) || null;
        const prevRounds = evalData.rounds
          .filter(r => r.round < evalData.currentRound)
          .sort((a, b) => a.round - b.round);

        let initialScores: Record<string, number> = {};
        let initialNotes: Record<string, string> = {};
        let initialComment = '';

        const hasCurrentDraft = current?.scores && Object.keys(current.scores).length > 0;

        if (hasCurrentDraft) {
          initialScores = current!.scores;
          initialNotes = current!.notes || {};
          initialComment = current!.comment || '';
        } else if (prevRounds.length > 0) {
          const lastPrev = prevRounds[prevRounds.length - 1];
          initialScores = { ...lastPrev.scores };
          initialNotes = { ...(lastPrev.notes || {}) };
        }

        dispatch({
          type: 'SET_INITIAL_DATA',
          payload: {
            employee: found,
            evaluation: evalData,
            currentRoundData: current,
            allPreviousRounds: prevRounds,
            scores: initialScores,
            notes: initialNotes,
            comment: initialComment
          }
        });
      } else {
        dispatch({ type: 'SET_INITIAL_DATA', payload: { employee: found } });
      }
    } else {
      // Redirect or show error
      console.error('Employee not found');
    }
  }, [id]);

  if (!employee) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isLeader = employee.role !== 'Employee';
  const criteriaGroups = getCriteriaForRole(isLeader ? 'Leader' : 'Employee');
  const activeGroup = criteriaGroups.find(g => g.id === activeGroupId) || criteriaGroups[0];
  const isLocked = currentRoundData ? isRoundLocked(currentRoundData) : false;

  const handleScoreChange = (criterionId: string, points: number) => {
    dispatch({ type: 'SET_SCORE', criterionId, points });
  };

  const handleNoteChange = (criterionId: string, note: string) => {
    dispatch({ type: 'SET_NOTE', criterionId, note });
  };
  const handleSave = async (status: 'Draft' | 'Submitted') => {
    if (!evaluation || !currentRoundData) return;

    setIsSaving(true);
    try {
      if (status === 'Draft') {
        const res = await saveEvaluationRoundDraft(
          evaluation.id,
          currentRoundData.round,
          scores,
          notes,
          comment
        );
        if (res.success) {
          alert('Đã lưu bản nháp.');
        } else {
          alert(`Lỗi: ${res.error}`);
        }
      } else {
        // Save first just in case
        await saveEvaluationRoundDraft(
          evaluation.id,
          currentRoundData.round,
          scores,
          notes,
          comment
        );
        const res = await submitEvaluationRound(evaluation.id, currentRoundData.round);
        if (res.success) {
          alert('Đánh giá đã được gửi thành công!');
          router.push('/employees');
        } else {
          alert(`Lỗi: ${res.error}`);
        }
      }
    } catch (err) {
      console.error(err);
      alert('Đã xảy ra lỗi khi lưu đánh giá.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <LazyMotion features={domAnimation}>
      <div className="px-6 md:px-10 lg:px-12 py-8 space-y-8 animate-in fade-in duration-500 w-full max-w-[1600px] mx-auto">
      {/* Header & Back Button */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          {/* Breadcrumb / Progress */}
          {evaluation && (
            <div className="flex items-center gap-2 text-sm text-outline font-medium">
              <span>Đánh giá</span>
              <ChevronRight size={14} />
              <span className="text-primary bg-primary/10 px-2 py-0.5 rounded">Lần {evaluation.currentRound} / 3</span>
              {/* Compare Button moved here */}
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
          )}

          {/* Action Buttons */}
          <div className="flex flex-row gap-3 w-full md:w-auto">
            {!isLocked ? (
              <>
                <button 
                  onClick={() => handleSave('Draft')}
                  disabled={isSaving}
                  className="flex-1 md:flex-none px-4 md:px-6 py-2.5 bg-white text-on-surface border border-outline-variant rounded-xl font-bold hover:bg-surface hover:border-outline transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap"
                >
                  Lưu bản nháp
                </button>
                <button 
                  onClick={() => handleSave('Submitted')}
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

        {(() => {
          const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
          const totalCriteria = criteriaGroups.reduce((sum, g) => sum + g.criteria.length, 0);
          const scoredCount = Object.keys(scores).length;
          const grade = calculateGrade(totalScore, isLeader);

          return (
            <EvaluationHeader
              employee={employee}
              isLeader={isLeader}
              scores={scores}
              criteriaGroups={criteriaGroups}
              allPreviousRounds={allPreviousRounds}
              grade={grade}
              totalScore={totalScore}
              scoredCount={scoredCount}
              totalCriteria={totalCriteria}
            />
          );
        })()}

        {/* General Comment Section */}
        <div className="bg-white rounded-3xl border border-outline-variant shadow-sm overflow-hidden">
          <button
            onClick={() => setIsCommentOpen(prev => !prev)}
            className="w-full px-6 py-4 bg-surface/30 flex items-center justify-between hover:bg-surface/50 transition-colors duration-200"
          >
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <MessageSquare size={18} />
              </div>
              <h2 className="font-black text-on-surface uppercase tracking-tight">Nhận xét chung</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-outline uppercase tracking-widest">
                Lần {evaluation?.currentRound} / 3
              </span>
              <m.div
                animate={{ rotate: isCommentOpen ? 180 : 0 }}
                transition={{ duration: 0.25 }}
                className="text-outline"
              >
                <ChevronDown size={18} />
              </m.div>
            </div>
          </button>

          <m.div
            initial={false}
            animate={{ height: isCommentOpen ? 'auto' : 0, opacity: isCommentOpen ? 1 : 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="p-6 space-y-6 border-t border-outline-variant/30">
              {/* Previous Rounds Comments */}
              {allPreviousRounds.length > 0 && (
                <div className="space-y-3">
                  <div className="grid gap-3">
                    {allPreviousRounds.map(r => (
                      <div key={r.round} className="bg-surface/50 rounded-xl p-4 border border-outline-variant/30 text-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-black bg-outline-variant/50 text-outline px-1.5 py-0.5 rounded">L{r.round}</span>
                          <span className="text-[10px] text-outline font-medium italic">Đã nộp: {isMounted && r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('vi-VN') : 'N/A'}</span>
                        </div>
                        <p className="text-on-surface/80 leading-relaxed">
                          {r.comment || <span className="text-outline/50 italic">Không có nhận xét chung.</span>}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Round Comment Editor */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label htmlFor="general-comment" className="text-[10px] font-bold text-outline uppercase tracking-widest">
                    Nhận xét hiện tại:
                  </label>
                  <span className={`text-[10px] font-bold ${comment.length > 900 ? 'text-red-500' : 'text-outline'}`}>
                    {comment.length} / 1000
                  </span>
                </div>
                <textarea
                  id="general-comment"
                  value={comment}
                  onChange={(e) => dispatch({ type: 'SET_COMMENT', comment: e.target.value.substring(0, 1000) })}
                  disabled={isLocked}
                  placeholder={isLocked ? "Không có nhận xét cho vòng này." : "Nhập nhận xét tổng quan về năng lực, thái độ và đóng góp của nhân viên trong kỳ này..."}
                  className={`
                    w-full min-h-[150px] p-4 rounded-2xl border transition-all duration-300 text-sm leading-relaxed
                    ${isLocked 
                      ? 'bg-surface/50 border-outline-variant/50 cursor-not-allowed italic' 
                      : 'bg-white border-outline-variant focus:border-primary focus:ring-4 focus:ring-primary/5 hover:border-outline'
                    }
                  `}
                />
              </div>
            </div>
          </m.div>
        </div>
      </div>

      <div className="space-y-8">
        <div className="space-y-8">
          {/* Navigation Tabs */}
          <GroupNavTabs
            groups={criteriaGroups}
            activeGroupId={activeGroupId}
            scores={scores}
            onGroupChange={setActiveGroupId}
          />

          {/* Active Group Title */}
          <div className="flex items-center gap-4">
            <div className="h-10 w-1.5 bg-primary rounded-full"></div>
            <h2 className="text-2xl font-black text-on-surface">
              Nhóm {activeGroupId}: {activeGroup.name}
            </h2>
          </div>

          {/* Criteria List */}
          <CriteriaTab 
            criteria={activeGroup.criteria} 
            scores={scores} 
            notes={notes}
            onScoreChange={handleScoreChange} 
            onNoteChange={handleNoteChange}
            allPreviousRounds={allPreviousRounds}
            disabled={isLocked}
          />
          
          {/* Navigation between groups */}
          {(() => {
            const currentIdx = criteriaGroups.findIndex(g => g.id === activeGroupId);
            const navigateTo = (idx: number) => {
              setActiveGroupId(criteriaGroups[idx].id);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            };
            return (
              <div className="flex justify-between items-center pt-8 border-t border-outline-variant">
                {currentIdx > 0 ? (
                  <button onClick={() => navigateTo(currentIdx - 1)} className="flex items-center gap-2 font-bold text-primary hover:bg-primary/10 transition-colors bg-primary/5 px-6 py-3 rounded-2xl">
                    <ArrowLeft size={20} />
                    Nhóm trước
                  </button>
                ) : <div />}
                {currentIdx < criteriaGroups.length - 1 ? (
                  <button onClick={() => navigateTo(currentIdx + 1)} className="flex items-center gap-2 font-bold text-primary hover:bg-primary/10 transition-colors bg-primary/5 px-6 py-3 rounded-2xl">
                    Nhóm tiếp theo
                    <ChevronRight size={20} />
                  </button>
                ) : <div />}
              </div>
            );
          })()}
        </div>
      </div>


    </div>
    </LazyMotion>
  );
}
