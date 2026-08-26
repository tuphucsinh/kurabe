'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { User, Evaluation, EvaluationRound, CriteriaGroup, EvaluationAccessState, RoundNumber } from '@/types';
import { 
  getCriteriaForRoleAction, 
  getEvaluationHistoryAction, 
  getGradeBandsAction 
} from '@/actions/read';
import { getGradeBandsSync, GradeBands } from '@/lib/grade-bands';

export type CriteriaStatus = 'idle' | 'loading' | 'loaded' | 'empty' | 'error';

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
 * State + data-loading của trang đánh giá (D3 / Phase 94 Staged loading):
 * - Layer 1: dispatch ngay context cơ bản (employee/evaluation/persisted scores/notes/comment/rounds).
 * - Layer 2: nạp criteria độc lập với loading/error/loaded/empty + stale-response cancellation + retry.
 * - Hydrate default levels & selectedLevelIndexes chỉ khi criteria sẵn sàng, khóa autosave trước khi hydrate.
 * - Layer 3: nạp history & grade bands non-blocking với guard riêng.
 */
export function useEvaluationPageState({ employee, evaluation, accessState, isEmployeeOwner, user }: UseEvaluationPageStateArgs) {
  const [state, dispatch] = useReducer(evaluationReducer, initialState);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const [criteriaGroups, setCriteriaGroups] = useState<CriteriaGroup[]>([]);
  const [criteriaStatus, setCriteriaStatus] = useState<CriteriaStatus>('idle');
  const [criteriaError, setCriteriaError] = useState<string | null>(null);
  const [criteriaRetryCount, setCriteriaRetryCount] = useState(0);

  const [history, setHistory] = useState<Evaluation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

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
  const criteriaGenRef = useRef(0);
  const historyGenRef = useRef(0);

  const wrappedDispatch = useCallback((action: EvaluationAction) => {
    if (action.type === 'SET_SCORE' || action.type === 'SET_NOTE' || action.type === 'SET_COMMENT') {
      userEditedRef.current = true;
    }
    dispatch(action);
  }, []);

  const refetchCriteria = useCallback(() => {
    setCriteriaRetryCount((c) => c + 1);
  }, []);

  // 1. Layer 1: Nạp dữ liệu cơ bản (light context) ngay lập tức khi có employee + evaluation + accessState
  useEffect(() => {
    if (employee && evaluation && accessState) {
      if (accessState.mode === 'blocked') return;

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
        const lastRound = prevRounds[prevRounds.length - 1];
        initialScores = { ...lastRound.scores };
        initialSelectedLevelIndexes = lastRound.selectedLevelIndexes || {};
        initialNotes = lastRound.notes || {};
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
  }, [employee, evaluation, accessState]);

  // 2. Layer 2: Nạp criteria độc lập + hydrate defaults & missing selectedLevelIndexes sau khi có criteria
  useEffect(() => {
    if (!employee || !evaluation || !accessState || accessState.mode === 'blocked') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCriteriaStatus('idle');
      setCriteriaGroups([]);
      setCriteriaError(null);
      return;
    }

    let cancelled = false;
    const currentGen = ++criteriaGenRef.current;
    setCriteriaStatus('loading');
    setCriteriaError(null);

    const targetRoundNum = accessState.editableRound || accessState.displayRound;
    const targetRound = evaluation.rounds.find(r => r.round === targetRoundNum) || null;

    getCriteriaForRoleAction(employee.role)
      .then((dbCriteria) => {
        if (cancelled || criteriaGenRef.current !== currentGen) return;

        if (!dbCriteria || dbCriteria.length === 0) {
          setCriteriaGroups([]);
          setCriteriaStatus('empty');
          return;
        }

        setCriteriaGroups(dbCriteria);
        setCriteriaStatus('loaded');

        // Hydrate default levels & missing selectedLevelIndexes
        const currentScores = { ...stateRef.current.scores };
        let currentSelectedLevelIndexes = { ...stateRef.current.selectedLevelIndexes };

        // Pre-fill defaults chỉ khi đang edit round và chưa có điểm nào
        if (Object.keys(currentScores).length === 0 && !!accessState.editableRound) {
          for (const group of dbCriteria) {
            for (const criterion of group.criteria) {
              if (criterion.defaultLevelIndex != null && criterion.levels[criterion.defaultLevelIndex]) {
                currentScores[criterion.id!] = criterion.levels[criterion.defaultLevelIndex].points;
                currentSelectedLevelIndexes[criterion.id!] = criterion.defaultLevelIndex;
              }
            }
          }
        }

        currentSelectedLevelIndexes = fillMissingSelectedLevelIndexes(
          currentScores,
          currentSelectedLevelIndexes,
          dbCriteria
        );

        dispatch({
          type: 'SET_INITIAL_DATA',
          payload: {
            scores: currentScores,
            selectedLevelIndexes: currentSelectedLevelIndexes,
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
      })
      .catch((err) => {
        if (cancelled || criteriaGenRef.current !== currentGen) return;
        console.error('Error fetching criteria for role:', err);
        setCriteriaStatus('error');
        setCriteriaError(err instanceof Error ? err.message : 'Không thể tải tiêu chí đánh giá.');
      });

    return () => {
      cancelled = true;
    };
  }, [employee, evaluation, accessState, criteriaRetryCount]);

  // 3. Layer 3: Tải lịch sử đánh giá các kỳ trước của Employee (non-blocking)
  useEffect(() => {
    if (isEmployeeOwner && user?.id) {
      let cancelled = false;
      const currentGen = ++historyGenRef.current;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsLoadingHistory(true);
      setHistoryError(null);

      getEvaluationHistoryAction(user.id)
        .then((data) => {
          if (cancelled || historyGenRef.current !== currentGen) return;
          setHistory(data);
          setIsLoadingHistory(false);
        })
        .catch((err) => {
          if (cancelled || historyGenRef.current !== currentGen) return;
          console.error('Error loading eval history:', err);
          setHistoryError(err instanceof Error ? err.message : 'Không thể tải lịch sử đánh giá.');
          setIsLoadingHistory(false);
        });

      return () => {
        cancelled = true;
      };
    } else {
      setHistory([]);
      setIsLoadingHistory(false);
      setHistoryError(null);
    }
  }, [isEmployeeOwner, user?.id]);

  // 4. Layer 4: Nạp thang điểm từ DB (non-blocking)
  useEffect(() => {
    let cancelled = false;
    getGradeBandsAction().then((bands) => {
      if (!cancelled && bands) setGradeBands(bands);
    }).catch((err) => {
      console.error('Error loading grade bands:', err);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMounted(true);
  }, []);

  return {
    state,
    dispatch: wrappedDispatch,
    criteriaGroups,
    criteriaStatus,
    criteriaError,
    refetchCriteria,
    history,
    isLoadingHistory,
    historyError,
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
