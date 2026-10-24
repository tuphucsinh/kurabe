'use client';

import React, { createContext, useCallback, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { User, EvaluationPeriod, ViewerScope } from '@/types';
import { loginAction, logoutAction } from '@/actions/auth';
import { getCurrentUserAction, getPeriodsAction, getPeriodMetadataAction, getViewerScopeAction } from '@/actions/read';

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
  refreshViewerScope: (options?: { clearBeforeRender?: boolean }) => Promise<ViewerScope | null>;
  /**
   * One authenticated period-metadata refresh shared by create/close/delete-empty/
   * select/login. Reconciles the selected cookie, the provider state and the
   * server props and invalidates the period-scoped cache, all guarded by an
   * epoch so a late response can never overwrite newer period state.
   */
  refreshPeriodMetadata: (preferredPeriodId?: string) => Promise<void>;
  periodEpoch: number;
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

// Cache families that depend on the selected period. A period mutation refreshes
// provider metadata and invalidates exactly these scoped keys (never a global
// cache), then lets the server props re-render via router.refresh().
const PERIOD_SCOPED_QUERY_FAMILIES = new Set([
  'criteria-edit-state',
  'periods',
  'active-period',
  'evaluations',
  'evaluation-display',
  'evaluation-page-data',
  'evaluation-compare-page-data',
  'employees-page-data',
  'teams-page-data',
]);

const isPeriodScopedQuery = ({ queryKey }: { queryKey: readonly unknown[] }) => (
  typeof queryKey[0] === 'string' && PERIOD_SCOPED_QUERY_FAMILIES.has(queryKey[0])
);

/**
 * Resolve the selected period from a fresh server snapshot: an explicit
 * preference wins, then the cookie value, then the Active period, then the newest
 * period. Returns null only when the viewer has no periods at all.
 */
const resolveSelectedPeriod = (
  periods: EvaluationPeriod[],
  preferredPeriodId?: string | null,
): EvaluationPeriod | null => {
  if (preferredPeriodId) {
    const preferred = periods.find((period) => period.id === preferredPeriodId);
    if (preferred) return preferred;
  }
  return periods.find((period) => period.status === 'Active') ?? periods[0] ?? null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // App-router refresh: the convergence path re-runs the RSC tree so a second
  // tab's server-prop snapshot catches up with the reconciled period cookie.
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [viewerScope, setViewerScope] = useState<ViewerScope | null>(null);
  const [scopeEpoch, setScopeEpoch] = useState(0);
  const [periodEpoch, setPeriodEpoch] = useState(0);
  const [currentPeriod, setCurrentPeriodState] = useState<EvaluationPeriod | null>(null);
  const [allPeriods, setAllPeriods] = useState<EvaluationPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const userRef = useRef<User | null>(null);
  const scopeRef = useRef<ViewerScope | null>(null);
  // P110M1T06: an in-flight scope request is bound to the identity that started
  // it. A login to a different user must never be blocked by (or clobber) the
  // previous user's pending request.
  const scopeRequestRef = useRef<{ userId: string; request: Promise<ViewerScope | null> } | null>(null);
  const authGenerationRef = useRef(0);
  const lastScopeRefreshAtRef = useRef(0);
  const lastPeriodRefreshAtRef = useRef(0);
  // Monotonic epoch for period-metadata refreshes. Every refresh issues the next
  // epoch and only applies its response while it is still the newest one, so a
  // slow/older response can never overwrite newer period state.
  const periodEpochRef = useRef(0);

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
    if (!activeUserId) return scopeRef.current;

    // Same-identity dedupe: one request per user at a time. An in-flight request
    // for a DIFFERENT identity neither blocks this one nor gets overwritten; its
    // late response is discarded by the identity check below.
    const inflight = scopeRequestRef.current;
    if (inflight && inflight.userId === activeUserId) return scopeRef.current;

    if (clearBeforeRender) {
      setViewerScope(null);
      await clearScopedQueries();
    }

    const request = getViewerScopeAction();
    scopeRequestRef.current = { userId: activeUserId, request };
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
      // Release the slot only while this request still owns it — a newer
      // identity's request may already be registered.
      if (scopeRequestRef.current?.request === request) scopeRequestRef.current = null;
    }
  }, [clearScopedQueries]);

  const maybeRefreshViewerScope = useCallback(() => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible' || !userRef.current) return;
    if (Date.now() - lastScopeRefreshAtRef.current < 30_000) return;
    // Same-identity poll: refresh silently in the background. Do NOT clearBeforeRender —
    // removing scoped queries before the answer arrives blanks the UI (skeleton blink every
    // ~40-50s). Identity/scope changes still clear exactly once via the fingerprint-diff
    // effect above; a null scope response changes the fingerprint too (fail-closed).
    void refreshViewerScope();
  }, [refreshViewerScope]);

  // Period metadata is a different identity axis from the viewer scope: a period
  // mutation (create/close/delete-empty) or a period selection changes the cookie,
  // the provider period objects and the server props, but never the viewer scope
  // fingerprint. This single shared refresh reconciles all of them from one
  // authenticated server snapshot.
  const refreshPeriodMetadata = useCallback(async (
    preferredPeriodId?: string,
    // Only the background cross-tab/focus convergence path opts into the RSC
    // server-prop revalidation; mutation/selection/login callers reconcile the
    // client state and let their own navigation/refresh follow.
    { revalidateServerProps = false }: { revalidateServerProps?: boolean } = {},
  ): Promise<void> => {
    const activeUserId = userRef.current?.id;
    if (!activeUserId) return;

    lastPeriodRefreshAtRef.current = Date.now();
    const requestEpoch = periodEpochRef.current + 1;
    periodEpochRef.current = requestEpoch;

    try {
      const metadata = await getPeriodMetadataAction();

      // Late-response guard: a newer refresh (or an identity change) wins; an
      // older response is discarded rather than overwriting newer period state.
      if (requestEpoch !== periodEpochRef.current) return;
      if (userRef.current?.id !== activeUserId) return;

      const periods = metadata.periods ?? [];
      const target = resolveSelectedPeriod(periods, preferredPeriodId ?? metadata.selectedPeriodId);

      setAllPeriods(periods);
      setCurrentPeriodState(target);

      // Reconcile the selected cookie with the resolved provider state so the
      // server props (which read the same cookie) agree with the client.
      if (target) {
        localStorage.setItem('selected_period_id', target.id);
        document.cookie = `selected_period_id=${target.id}; path=/; max-age=31536000`;
      } else {
        localStorage.removeItem('selected_period_id');
        document.cookie = 'selected_period_id=; path=/; max-age=0';
      }

      setPeriodEpoch((epoch) => epoch + 1);
      queryClient.invalidateQueries({ predicate: isPeriodScopedQuery });

      // Convergence-only server-prop revalidation: once the cookie/provider state
      // are reconciled above, re-run the RSC tree so a second tab's stale
      // server-prop snapshot catches up without a manual navigation. It sits
      // behind the SAME epoch guard, so a late/older response can never refresh
      // over newer state, and it is requested only by the cross-tab/focus path —
      // never by the ordinary poll tick or the mutation/login callers.
      if (revalidateServerProps) router.refresh();
    } catch (error) {
      console.error('Error refreshing period metadata:', error);
    }
  }, [queryClient, router]);

  // Background/focus convergence for period metadata (same identity axis, same
  // 30s throttle style as the viewer-scope poll). `force` is used for a discrete
  // cross-tab signal (the `storage` event) so a hidden second tab still converges;
  // it never clears caches before the answer arrives (no blanking, no global cache).
  const maybeRefreshPeriodMetadata = useCallback((force = false) => {
    if (typeof document === 'undefined' || !userRef.current) return;
    if (!force) {
      if (document.visibilityState !== 'visible') return;
      // Skip the very first focus/visibility signal after mount: the page was just
      // server-rendered with current props, and an immediate router.refresh() aborts
      // the in-flight RSC stream ("destination stream closed early"), leaving the
      // route stuck on its static frame. Only a genuine return to the tab, after at
      // least one completed refresh, asks for the server props again.
      if (lastPeriodRefreshAtRef.current === 0) return;
      if (Date.now() - lastPeriodRefreshAtRef.current < 30_000) return;
    }
    // Focus/pageshow/visibilitychange/storage convergence asks the shared refresh
    // to also revalidate the RSC server props; the 30s throttle and the epoch
    // guard keep this off ordinary poll ticks.
    void refreshPeriodMetadata(undefined, { revalidateServerProps: true });
  }, [refreshPeriodMetadata]);

  useEffect(() => {
    if (!isInitialized) return undefined;
    const onFocus = () => {
      maybeRefreshViewerScope();
      maybeRefreshPeriodMetadata();
    };
    const onPageShow = () => {
      maybeRefreshViewerScope();
      maybeRefreshPeriodMetadata();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        maybeRefreshViewerScope();
        maybeRefreshPeriodMetadata();
      }
    };
    // Cross-tab convergence: a period mutation/selection in another tab writes the
    // shared `selected_period_id` cookie/localStorage, which fires `storage` here.
    // Without this, a second tab's allPeriods/currentPeriod stay stale until a
    // manual reload. The same monotonic epoch guard rejects any late response.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== 'selected_period_id') return;
      maybeRefreshPeriodMetadata(true);
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('storage', onStorage);
    const interval = window.setInterval(maybeRefreshViewerScope, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(interval);
    };
  }, [isInitialized, maybeRefreshViewerScope, maybeRefreshPeriodMetadata]);

  // P110M1T06: bootstrap exactly once. The old deps-[isInitialized] effect
  // re-ran loadAuth (3 server actions) and discarded the results when
  // isInitialized flipped true. The started-ref also dedupes the StrictMode
  // double effect invocation in dev; production gets exactly one bootstrap.
  const bootstrapStartedRef = useRef(false);
  useEffect(() => {
    if (isInitialized || bootstrapStartedRef.current) return undefined;
    bootstrapStartedRef.current = true;

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
    if (resolvedScope) {
      // Shared authenticated period refresh: resolves periods/Active/selected and
      // reconciles cookie + provider state + scoped cache for the new identity.
      const savedPeriodId = localStorage.getItem('selected_period_id');
      await refreshPeriodMetadata(savedPeriodId ?? undefined);
    } else {
      setAllPeriods([]);
      setCurrentPeriodState(null);
    }
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
      refreshViewerScope,
      refreshPeriodMetadata,
      periodEpoch,
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