'use client';

import React, { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User, EvaluationPeriod, ViewerScope } from '@/types';
import { loginAction, logoutAction } from '@/actions/auth';
import { getCurrentUserAction, getPeriodsAction, getViewerScopeAction } from '@/actions/read';

interface AuthContextType {
  user: User | null;
  viewerScope: ViewerScope | null;
  scopeEpoch: number;
  isLoading: boolean;
  isLoggingOut: boolean;
  login: (employeeCode: string, password?: string) => Promise<User>;
  logout: () => void | Promise<void>;
  isManager: boolean;
  isLeader: boolean;
  isSubLeader: boolean;
  currentPeriod: EvaluationPeriod | null;
  allPeriods: EvaluationPeriod[];
  setCurrentPeriod: (period: EvaluationPeriod) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SCOPED_QUERY_FAMILIES = new Set([
  'users',
  'users-batch',
  'employee-batch',
  'user',
  'team-users',
  'employees-page-data',
  'teams',
  'team',
  'teams-page-data',
  'periods',
  'active-period',
  'evaluations',
  'evaluation',
  'evaluation-display',
  'evaluation-page-data',
  'evaluation-compare-page-data',
  'criteria',
]);

const isScopedQuery = ({ queryKey }: { queryKey: readonly unknown[] }) => (
  typeof queryKey[0] === 'string' && SCOPED_QUERY_FAMILIES.has(queryKey[0])
);

const scopeFingerprint = (user: User | null, viewerScope: ViewerScope | null): string | null => {
  if (!user) return null;
  return JSON.stringify([
    user.id,
    user.role,
    user.teamId,
    viewerScope?.scopeKey ?? null,
  ]);
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [viewerScope, setViewerScope] = useState<ViewerScope | null>(null);
  const [scopeEpoch, setScopeEpoch] = useState(0);
  const [currentPeriod, setCurrentPeriodState] = useState<EvaluationPeriod | null>(null);
  const [allPeriods, setAllPeriods] = useState<EvaluationPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const userRef = useRef<User | null>(null);
  const scopeRef = useRef<ViewerScope | null>(null);
  const scopeRequestRef = useRef<Promise<ViewerScope | null> | null>(null);
  const authGenerationRef = useRef(0);
  const lastScopeRefreshAtRef = useRef(0);

  const clearScopedQueries = useCallback(async () => {
    await queryClient.cancelQueries({ predicate: isScopedQuery });
    queryClient.removeQueries({ predicate: isScopedQuery });
  }, [queryClient]);

  useEffect(() => {
    scopeRef.current = viewerScope;
    userRef.current = user;
  }, [user, viewerScope]);

  // A new scope is a new cache namespace. Remove the old namespace before a
  // late server response can become visible under the new identity.
  const currentScope = scopeFingerprint(user, viewerScope);
  const previousScopeRef = useRef<string | null>(null);
  useEffect(() => {
    const previousScope = previousScopeRef.current;
    if (previousScope !== null && previousScope !== currentScope) {
      setScopeEpoch((epoch) => epoch + 1);
      void clearScopedQueries();
    }
    previousScopeRef.current = currentScope;
  }, [clearScopedQueries, currentScope]);

  const refreshViewerScope = useCallback(async ({ clearBeforeRender = false } = {}): Promise<ViewerScope | null> => {
    const activeUserId = userRef.current?.id;
    if (!activeUserId || scopeRequestRef.current) return scopeRef.current;

    if (clearBeforeRender) {
      setViewerScope(null);
      await clearScopedQueries();
    }

    const request = getViewerScopeAction();
    scopeRequestRef.current = request;
    try {
      const nextScope = await request;
      if (userRef.current?.id !== activeUserId) return null;
      lastScopeRefreshAtRef.current = Date.now();
      if (!nextScope) {
        scopeRef.current = null;
        setViewerScope(null);
        await clearScopedQueries();
        return null;
      }
      scopeRef.current = nextScope;
      setViewerScope(nextScope);
      return nextScope;
    } catch (error) {
      console.error('Error refreshing viewer scope:', error);
      lastScopeRefreshAtRef.current = Date.now();
      scopeRef.current = null;
      setViewerScope(null);
      await clearScopedQueries();
      return null;
    } finally {
      scopeRequestRef.current = null;
    }
  }, [clearScopedQueries]);

  const maybeRefreshViewerScope = useCallback(() => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible' || !userRef.current) return;
    if (Date.now() - lastScopeRefreshAtRef.current < 30_000) return;
    void refreshViewerScope({ clearBeforeRender: true });
  }, [refreshViewerScope]);

  useEffect(() => {
    if (!isInitialized) return undefined;
    const onFocus = () => maybeRefreshViewerScope();
    const onPageShow = () => maybeRefreshViewerScope();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') maybeRefreshViewerScope();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = window.setInterval(maybeRefreshViewerScope, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(interval);
    };
  }, [isInitialized, maybeRefreshViewerScope]);

  useEffect(() => {
    async function loadAuth() {
      const generation = ++authGenerationRef.current;
      try {
        // Resolve the viewer and server scope before exposing authenticated
        // query keys. Period metadata is never fetched for anonymous users.
        const loadedUser = await getCurrentUserAction();
        const loadedScope = loadedUser ? await getViewerScopeAction() : null;
        const loadAuthenticatedPeriods = async (): Promise<EvaluationPeriod[]> => {
          if (!loadedUser || !loadedScope) return [];
          const periods = await getPeriodsAction();
          return periods;
        };
        const periods = await loadAuthenticatedPeriods();
        if (generation !== authGenerationRef.current) return;

        const savedPeriodId = localStorage.getItem('selected_period_id');
        const targetPeriod = savedPeriodId
          ? periods.find((period) => period.id === savedPeriodId)
          : undefined;
        const resolvedPeriod = targetPeriod || periods.find((period) => period.status === 'Active') || periods[0];

        if (!isInitialized) {
          userRef.current = loadedUser;
          scopeRef.current = loadedScope;
          setAllPeriods(periods);
          setCurrentPeriodState(resolvedPeriod || null);
          setViewerScope(loadedScope);
          setUser(loadedUser);
          if (loadedUser) {
            localStorage.setItem('auth_user_id', loadedUser.id);
          } else {
            localStorage.removeItem('auth_user_id');
          }
        }
      } catch (error) {
        console.error('Error loading auth context:', error);
        if (generation === authGenerationRef.current) {
          userRef.current = null;
          scopeRef.current = null;
          setViewerScope(null);
          setUser(null);
        }
      } finally {
        if (generation === authGenerationRef.current && !isInitialized) {
          setIsLoading(false);
          setIsInitialized(true);
        }
      }
    }

    loadAuth();
  }, [isInitialized]);

  const setCurrentPeriod = (period: EvaluationPeriod) => {
    if (!allPeriods.some((candidate) => candidate.id === period.id)) return;
    setCurrentPeriodState(period);
    localStorage.setItem('selected_period_id', period.id);
    document.cookie = `selected_period_id=${period.id}; path=/; max-age=31536000`;
  };

  const login = async (employeeCode: string, password?: string) => {
    const res = await loginAction(employeeCode, password || '');
    if (!res.success || !res.user) {
      throw new Error(res.error || 'Login failed');
    }

    ++authGenerationRef.current;
    userRef.current = res.user;
    scopeRef.current = null;
    setViewerScope(null);
    setUser(res.user);
    localStorage.setItem('auth_user_id', res.user.id);

    const resolvedScope = await refreshViewerScope();
    const periods = resolvedScope ? await getPeriodsAction() : [];
    const savedPeriodId = localStorage.getItem('selected_period_id');
    const targetPeriod = periods.find((period) => period.id === savedPeriodId)
      || periods.find((period) => period.status === 'Active')
      || periods[0];
    setAllPeriods(periods);
    setCurrentPeriodState(targetPeriod || null);
    return res.user;
  };

  const logout = async () => {
    setIsLoggingOut(true);
    ++authGenerationRef.current;
    userRef.current = null;
    scopeRef.current = null;
    setViewerScope(null);
    setUser(null);
    await clearScopedQueries();
    try {
      await logoutAction();
    } catch {}
    setAllPeriods([]);
    setCurrentPeriodState(null);
    localStorage.removeItem('auth_user_id');
    localStorage.removeItem('selected_period_id');
    document.cookie = 'selected_period_id=; path=/; max-age=0';
    lastScopeRefreshAtRef.current = 0;
    setIsLoggingOut(false);
  };

  const isManager = user?.role === 'Manager';
  const isLeader = user?.role === 'Leader';
  const isSubLeader = user?.role === 'SubLeader';

  return (
    <AuthContext.Provider value={{
      user,
      viewerScope,
      scopeEpoch,
      isLoading,
      isLoggingOut,
      login,
      logout,
      isManager,
      isLeader,
      isSubLeader,
      currentPeriod,
      allPeriods,
      setCurrentPeriod,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}