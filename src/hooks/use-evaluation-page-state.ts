'use client';

import { useEffect, useReducer, useState } from 'react';
import { User, Evaluation, EvaluationRound, CriteriaGroup, EvaluationAccessState } from '@/types';
import { 
  getCriteriaForRoleAction, 
  getEvaluationHistoryAction, 
  getGradeBandsAction 
} from '@/actions/read';
import { getGradeBandsSync, GradeBands } from '@/lib/grade-bands';

export interface EvaluationState {
  employee: User | null;
  evaluation: Evaluation | null;
  currentRoundData: EvaluationRound | null;
  allPreviousRounds: EvaluationRound[];
  scores: Record<string, number>;
  selectedLevelIndexes: Record<string, number>;
  notes: Record<string, string>;
  comment: string;
}

export type EvaluationAction =
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

export function evaluationReducer(state: EvaluationState, action: EvaluationAction): EvaluationState {
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

interface UseEvaluationPageStateArgs {
  employee: User | null;
  evaluation: Evaluation | null;
  accessState: EvaluationAccessState | null;
  isEmployeeOwner: boolean;
  user: User | null;
}

/**
 * State + data-loading của trang đánh giá (D3 — tách khỏi page 1065 dòng):
 * reducer form (scores/notes/comment), nạp criteria + round đang mở,
 * lịch sử các kỳ trước (Employee owner), thang điểm từ DB, mount flag.
 */
export function useEvaluationPageState({ employee, evaluation, accessState, isEmployeeOwner, user }: UseEvaluationPageStateArgs) {
  const [state, dispatch] = useReducer(evaluationReducer, initialState);
  const [criteriaGroups, setCriteriaGroups] = useState<CriteriaGroup[]>([]);
  const [history, setHistory] = useState<Evaluation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [gradeBands, setGradeBands] = useState<GradeBands>(() => getGradeBandsSync());
  const [isMounted, setIsMounted] = useState(false);

  // Nạp dữ liệu form khi có employee + evaluation + accessState
  useEffect(() => {
    async function loadData() {
      if (employee && evaluation && accessState) {
        if (accessState.mode === 'blocked') return;

        // Fetch criteria from DB
        const dbCriteria = await getCriteriaForRoleAction(employee.role);
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

  // Tải lịch sử đánh giá các kỳ trước của Employee
  useEffect(() => {
    if (isEmployeeOwner && user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoadingHistory(true);
      getEvaluationHistoryAction(user.id)
        .then((data) => { setHistory(data); setIsLoadingHistory(false); })
        .catch((err) => { console.error('Error loading eval history:', err); setIsLoadingHistory(false); });
    }
  }, [isEmployeeOwner, user]);

  // Nạp thang điểm từ DB cho hiển thị client (load trang trực tiếp sẽ còn fallback hardcode nếu thiếu)
  useEffect(() => {
    let cancelled = false;
    getGradeBandsAction().then((bands) => { if (!cancelled) setGradeBands(bands); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  return {
    state,
    dispatch,
    criteriaGroups,
    history,
    isLoadingHistory,
    gradeBands,
    isMounted,
  };
}
