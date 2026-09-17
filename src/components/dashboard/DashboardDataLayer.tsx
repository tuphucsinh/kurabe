'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getDashboardLightData, getDashboardHeavyData } from '@/actions/dashboard';
import type { DashboardLightData, DashboardHeavyData } from '@/actions/dashboard';
import type { User } from '@/types';
import DashboardLightSection from '@/components/dashboard/DashboardLightSection';
import DashboardHeavySection from '@/components/dashboard/DashboardHeavySection';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardDataLayerProps {
  viewer: User | null;
  periodId: string;
}

function hydrateRecentActivities(
  data: DashboardHeavyData,
  userNameById: Record<string, string>
): DashboardHeavyData {
  return {
    ...data,
    recentActivities: data.recentActivities.map((activity) => ({
      ...activity,
      employeeName: userNameById[activity.employeeId] || activity.employeeName,
      evaluatorName: userNameById[activity.evaluatorId] || activity.evaluatorName,
    })),
    userNameById,
  };
}

export default function DashboardDataLayer({
  viewer,
  periodId,
}: DashboardDataLayerProps) {
  const { user, viewerScope, scopeEpoch } = useAuth();
  const effectiveViewer = user ?? viewer;

  const [lightState, setLightState] = useState<{
    isLoading: boolean;
    error: string | null;
    data: DashboardLightData | null;
  }>({
    isLoading: true,
    error: null,
    data: null,
  });

  const [heavyState, setHeavyState] = useState<{
    isLoading: boolean;
    error: string | null;
    data: DashboardHeavyData | null;
  }>({
    isLoading: true,
    error: null,
    data: null,
  });

  const [renderScope, setRenderScope] = useState<{ scopeKey: string; scopeEpoch: number } | null>(null);
  const renderScopeRef = useRef<{ scopeKey: string; scopeEpoch: number } | null>(null);
  const reqIdRef = useRef(0);

  const fetchHeavy = useCallback(
    async (
      targetPeriodId: string,
      currentReqId: number,
      userNameMap: Record<string, string> = {},
      expectedScopeKey?: string | null,
      expectedEpoch?: number
    ) => {
      if (!targetPeriodId || !effectiveViewer || !viewerScope) {
        return;
      }
      const requestScope = {
        scopeKey: expectedScopeKey ?? viewerScope.scopeKey,
        scopeEpoch: expectedEpoch ?? scopeEpoch,
      };
      const scopeChanged =
        renderScopeRef.current?.scopeKey !== requestScope.scopeKey ||
        renderScopeRef.current?.scopeEpoch !== requestScope.scopeEpoch;
      renderScopeRef.current = requestScope;
      setRenderScope(requestScope);
      setHeavyState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        data: scopeChanged ? null : prev.data,
      }));
      try {
        const result = await getDashboardHeavyData(targetPeriodId, userNameMap);
        if (
          currentReqId !== reqIdRef.current ||
          (expectedScopeKey !== undefined && viewerScope?.scopeKey !== expectedScopeKey) ||
          (expectedEpoch !== undefined && scopeEpoch !== expectedEpoch) ||
          !viewerScope
        ) return;
        if (!result) {
          setHeavyState({
            isLoading: false,
            error: 'Không thể tải dữ liệu phân tích chi tiết',
            data: null,
          });
        } else {
          setHeavyState({
            isLoading: false,
            error: null,
            data: result,
          });
        }
      } catch (err) {
        if (
          currentReqId !== reqIdRef.current ||
          (expectedScopeKey !== undefined && viewerScope?.scopeKey !== expectedScopeKey) ||
          (expectedEpoch !== undefined && scopeEpoch !== expectedEpoch) ||
          !viewerScope
        ) return;
        setHeavyState({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ',
          data: null,
        });
      }
    },
    [effectiveViewer, viewerScope, scopeEpoch]
  );

  const fetchLightAndHeavy = useCallback(
    async (
      targetPeriodId: string,
      currentReqId: number,
      expectedScopeKey?: string | null,
      expectedEpoch?: number
    ) => {
      if (!targetPeriodId || !effectiveViewer || !viewerScope) {
        return;
      }

      const requestScope = {
        scopeKey: expectedScopeKey ?? viewerScope.scopeKey,
        scopeEpoch: expectedEpoch ?? scopeEpoch,
      };
      const scopeChanged =
        renderScopeRef.current?.scopeKey !== requestScope.scopeKey ||
        renderScopeRef.current?.scopeEpoch !== requestScope.scopeEpoch;
      renderScopeRef.current = requestScope;
      setRenderScope(requestScope);

      setLightState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        data: scopeChanged ? null : prev.data,
      }));
      setHeavyState((prev) => ({
        ...prev,
        isLoading: true,
        error: null,
        data: scopeChanged ? null : prev.data,
      }));

      // These requests have independent server-side authorization and data sources.
      // Start heavy immediately; wait for light only to hydrate its display names.
      const heavyPromise = getDashboardHeavyData(targetPeriodId, {}).then(
        (data) => ({ ok: true as const, data }),
        (error) => ({ ok: false as const, error })
      );
      let userNameMap: Record<string, string> = {};

      try {
        const lightResult = await getDashboardLightData(targetPeriodId);
        if (
          currentReqId !== reqIdRef.current ||
          (expectedScopeKey !== undefined && viewerScope?.scopeKey !== expectedScopeKey) ||
          (expectedEpoch !== undefined && scopeEpoch !== expectedEpoch) ||
          !viewerScope
        ) return;
        if (!lightResult) {
          setLightState({
            isLoading: false,
            error: 'Không thể tải dữ liệu tổng quan',
            data: null,
          });
        } else {
          userNameMap = lightResult.userNameById || {};
          setLightState({
            isLoading: false,
            error: null,
            data: lightResult,
          });
        }
      } catch (err) {
        if (
          currentReqId !== reqIdRef.current ||
          (expectedScopeKey !== undefined && viewerScope?.scopeKey !== expectedScopeKey) ||
          (expectedEpoch !== undefined && scopeEpoch !== expectedEpoch) ||
          !viewerScope
        ) return;
        setLightState({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ',
          data: null,
        });
      }

      const heavyOutcome = await heavyPromise;
      if (
        currentReqId !== reqIdRef.current ||
        (expectedScopeKey !== undefined && viewerScope?.scopeKey !== expectedScopeKey) ||
        (expectedEpoch !== undefined && scopeEpoch !== expectedEpoch) ||
        !viewerScope
      ) return;
      if (!heavyOutcome.ok) {
        setHeavyState({
          isLoading: false,
          error: heavyOutcome.error instanceof Error ? heavyOutcome.error.message : 'Lỗi kết nối máy chủ',
          data: null,
        });
      } else if (!heavyOutcome.data) {
        setHeavyState({
          isLoading: false,
          error: 'Không thể tải dữ liệu phân tích chi tiết',
          data: null,
        });
      } else {
        setHeavyState({
          isLoading: false,
          error: null,
          data: hydrateRecentActivities(heavyOutcome.data, userNameMap),
        });
      }
    },
    [effectiveViewer, viewerScope, scopeEpoch]
  );

  useEffect(() => {
    const currentReqId = ++reqIdRef.current;
    if (!effectiveViewer || !viewerScope) {
      return;
    }
    fetchLightAndHeavy(periodId, currentReqId, viewerScope.scopeKey, scopeEpoch);
  }, [periodId, effectiveViewer, viewerScope, scopeEpoch, fetchLightAndHeavy]);

  const handleRetryLight = useCallback(() => {
    if (!effectiveViewer || !viewerScope) return;
    const currentReqId = ++reqIdRef.current;
    fetchLightAndHeavy(periodId, currentReqId, viewerScope.scopeKey, scopeEpoch);
  }, [fetchLightAndHeavy, periodId, effectiveViewer, viewerScope, scopeEpoch]);

  const handleRetryHeavy = useCallback(() => {
    if (!effectiveViewer || !viewerScope) return;
    const currentReqId = ++reqIdRef.current;
    const userNameMap = lightState.data?.userNameById || {};
    fetchHeavy(periodId, currentReqId, userNameMap, viewerScope.scopeKey, scopeEpoch);
  }, [fetchHeavy, periodId, lightState.data?.userNameById, effectiveViewer, viewerScope, scopeEpoch]);

  const currentScopeKey = viewerScope?.scopeKey;
  const hasCurrentLightState = Boolean(
    currentScopeKey &&
      renderScope?.scopeKey === currentScopeKey &&
      renderScope.scopeEpoch === scopeEpoch
  );
  const hasCurrentHeavyState = Boolean(
    currentScopeKey &&
      renderScope?.scopeKey === currentScopeKey &&
      renderScope.scopeEpoch === scopeEpoch
  );
  const visibleLightState =
    effectiveViewer && viewerScope && hasCurrentLightState
      ? lightState
      : { isLoading: Boolean(effectiveViewer && viewerScope), error: null, data: null };
  const visibleHeavyState =
    effectiveViewer && viewerScope && hasCurrentHeavyState
      ? heavyState
      : { isLoading: Boolean(effectiveViewer && viewerScope), error: null, data: null };

  // userNameById from light data or heavy data
  const userNameById =
    visibleLightState.data?.userNameById || visibleHeavyState.data?.userNameById || {};

  // If light data has finished loading and total === 0, empty state is displayed by LightSection
  const isZeroTotal =
    !visibleLightState.isLoading && visibleLightState.data && visibleLightState.data.stats.total === 0;

  return (
    <div className="space-y-8">
      {/* Light Data Region: KPI, Team status, Grade distribution */}
      <DashboardLightSection
        data={visibleLightState.data}
        isLoading={visibleLightState.isLoading}
        error={visibleLightState.error}
        onRetry={handleRetryLight}
      />

      {/* Heavy Data Region: Pending reviews, Anomaly alerts, Radar chart, Recent activities */}
      {!isZeroTotal && (
        <DashboardHeavySection
          data={visibleHeavyState.data}
          userNameById={userNameById}
          viewer={viewer}
          isLoading={visibleHeavyState.isLoading}
          error={visibleHeavyState.error}
          onRetry={handleRetryHeavy}
        />
      )}
    </div>
  );
}
