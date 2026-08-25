'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { User, Evaluation, EvaluationRound, CriteriaGroup, EvaluationAccessState, RoundNumber } from '@/types';
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

export interface EvaluationInitMetadata {
  key: string;
  round: RoundNumber | null;
  initialized: boolean;
  firstOpenEligible: boolean;
}

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

function fillMissingSelectedLevelIndexes(
  scores: Record<string, number>,
  selectedLevelIndexes: Record<string, number>,
  criteriaGroups: CriteriaGroup[]
): Record<string, number> {
  const criteriaById = new Map(
    criteriaGroups.flatMap((group) => group.criteria).map((criterion) => [criterion.id, criterion])
  );
  const normalizedIndexes = { ...selectedLevelIndexes };

  for (const [criterionId, score] of Object.entries(scores)) {
    if (normalizedIndexes[criterionId] !== undefined) continue;

    const criterion = criteriaById.get(criterionId);
    const derivedIndex = criterion?.levels.findIndex((level) => level.points === score) ?? -1;
    if (derivedIndex >= 0) normalizedIndexes[criterionId] = derivedIndex;
  }

  return normalizedIndexes;
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
 * lịch sử các kỳ trước (Employee owner), thang điểm từ DB, mount flag,
 * first-open metadata và edit tracking cho autosave.
 */
export function useEvaluationPageState({ employee, evaluation, accessState, isEmployeeOwner, user }: UseEvaluationPageStateArgs) {
  const [state, dispatch] = useReducer(evaluationReducer, initialState);
  const [criteriaGroups, setCriteriaGroups] = useState<CriteriaGroup[]>([]);
  const [history, setHistory] = useState<Evaluation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [gradeBands, setGradeBands] = useState<GradeBands>(() => getGradeBandsSync());
  const [isMounted, setIsMounted] = useState(false);
  const [initMetadata, setInitMetadata] = useState<EvaluationInitMetadata>({
    key: '',
    round: null,
    initialized: false,
    firstOpenEligible: false,
  });
  const userEditedRef = useRef(false);
  const lastInitializedKeyRef = useRef<string | null>(null);

  const wrappedDispatch = useCallback((action: EvaluationAction) => {
    if (action.type === 'SET_SCORE' || action.type === 'SET_NOTE' || action.type === 'SET_COMMENT') {
      userEditedRef.current = true;
    }
    dispatch(action);
  }, []);

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
                initialSelectedLevelIndexes[criterion.id!] = criterion.defaultLevelIndex;
              }
            }
          }
        }

        initialSelectedLevelIndexes = fillMissingSelectedLevelIndexes(
          initialScores,
          initialSelectedLevelIndexes,
          dbCriteria
        );

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

        const targetRoundNumber = (targetRound?.round ?? targetRoundNum ?? null) as RoundNumber | null;
        const initKey = targetRound
          ? `${evaluation.id}:${targetRound.round}`
          : (targetRoundNum ? `${evaluation.id}:${targetRoundNum}` : '');
        const firstOpenEligible =
          accessState.mode === 'edit' &&
          targetRound !== null &&
          targetRound.status === 'NotStarted';

        if (lastInitializedKeyRef.current !== initKey) {
          userEditedRef.current = false;
          lastInitializedKeyRef.current = initKey;
        }

        setInitMetadata({
          key: initKey,
          round: targetRoundNumber,
          initialized: true,
          firstOpenEligible,
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
    dispatch: wrappedDispatch,
    criteriaGroups,
    history,
    isLoadingHistory,
    gradeBands,
    isMounted,
    initMetadata,
    key: initMetadata.key,
    round: initMetadata.round,
    initialized: initMetadata.initialized,
    firstOpenEligible: initMetadata.firstOpenEligible,
    userEditedRef,
    isUserEdited: () => userEditedRef.current,
  };
}
