'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { getDashboardLightData, getDashboardHeavyData } from '@/actions/dashboard';
import type { DashboardLightData, DashboardHeavyData } from '@/actions/dashboard';
import type { User } from '@/types';
import DashboardLightSection from '@/components/dashboard/DashboardLightSection';
import DashboardHeavySection from '@/components/dashboard/DashboardHeavySection';

interface DashboardDataLayerProps {
  viewer: User | null;
  periodId: string;
}

export default function DashboardDataLayer({
  viewer,
  periodId,
}: DashboardDataLayerProps) {
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

  const reqIdRef = useRef(0);

  const fetchLight = useCallback(
    async (targetPeriodId: string, currentReqId: number) => {
      if (!targetPeriodId) {
        setLightState({ isLoading: false, error: null, data: null });
        return;
      }
      setLightState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await getDashboardLightData(targetPeriodId);
        if (currentReqId !== reqIdRef.current) return;
        if (!result) {
          setLightState({
            isLoading: false,
            error: 'Không thể tải dữ liệu tổng quan',
            data: null,
          });
        } else {
          setLightState({
            isLoading: false,
            error: null,
            data: result,
          });
        }
      } catch (err) {
        if (currentReqId !== reqIdRef.current) return;
        setLightState({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ',
          data: null,
        });
      }
    },
    []
  );

  const fetchHeavy = useCallback(
    async (targetPeriodId: string, currentReqId: number) => {
      if (!targetPeriodId) {
        setHeavyState({ isLoading: false, error: null, data: null });
        return;
      }
      setHeavyState((prev) => ({ ...prev, isLoading: true, error: null }));
      try {
        const result = await getDashboardHeavyData(targetPeriodId);
        if (currentReqId !== reqIdRef.current) return;
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
        if (currentReqId !== reqIdRef.current) return;
        setHeavyState({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Lỗi kết nối máy chủ',
          data: null,
        });
      }
    },
    []
  );

  const fetchLightAndHeavy = useCallback(
    (targetPeriodId: string, currentReqId: number) => {
      Promise.all([
        fetchLight(targetPeriodId, currentReqId),
        fetchHeavy(targetPeriodId, currentReqId),
      ]);
    },
    [fetchLight, fetchHeavy]
  );

  useEffect(() => {
    const currentReqId = ++reqIdRef.current;
    fetchLightAndHeavy(periodId, currentReqId);
  }, [periodId, fetchLightAndHeavy]);

  const handleRetryLight = useCallback(() => {
    fetchLight(periodId, reqIdRef.current);
  }, [fetchLight, periodId]);

  const handleRetryHeavy = useCallback(() => {
    fetchHeavy(periodId, reqIdRef.current);
  }, [fetchHeavy, periodId]);

  // userNameById from heavy data (independent of light data)
  const userNameById = heavyState.data?.userNameById || {};

  // If light data has finished loading and total === 0, empty state is displayed by LightSection
  const isZeroTotal = !lightState.isLoading && lightState.data && lightState.data.stats.total === 0;

  return (
    <div className="space-y-8">
      {/* Light Data Region: KPI, Team status, Grade distribution */}
      <DashboardLightSection
        data={lightState.data}
        isLoading={lightState.isLoading}
        error={lightState.error}
        onRetry={handleRetryLight}
      />

      {/* Heavy Data Region: Pending reviews, Anomaly alerts, Radar chart, Recent activities */}
      {!isZeroTotal && (
        <DashboardHeavySection
          data={heavyState.data}
          userNameById={userNameById}
          viewer={viewer}
          isLoading={heavyState.isLoading}
          error={heavyState.error}
          onRetry={handleRetryHeavy}
        />
      )}
    </div>
  );
}
