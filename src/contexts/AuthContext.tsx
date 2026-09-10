'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, EvaluationPeriod } from '@/types';
import { loginAction, logoutAction } from '@/actions/auth';
import { getCurrentUserAction, getPeriodsAction } from '@/actions/read';

interface AuthContextType {
  user: User | null;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [currentPeriod, setCurrentPeriodState] = useState<EvaluationPeriod | null>(null);
  const [allPeriods, setAllPeriods] = useState<EvaluationPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    async function loadAuth() {
      try {
        // Resolve the viewer first; period metadata is never fetched for anonymous sessions.
        const loadedUser = await getCurrentUserAction();
        const periods = loadedUser ? await getPeriodsAction() : [];
        const savedPeriodId = localStorage.getItem('selected_period_id');
        const targetPeriod = savedPeriodId
          ? periods.find((period) => period.id === savedPeriodId)
          : undefined;
        const resolvedPeriod = targetPeriod || periods.find((period) => period.status === 'Active') || periods[0];
        
        // Batch state updates and check isInitialized to prevent Strict Mode double-render
        if (!isInitialized) {
          setAllPeriods(periods);
          if (resolvedPeriod) {
            setCurrentPeriodState(resolvedPeriod);
          }
          if (loadedUser) {
            setUser(loadedUser);
            localStorage.setItem('auth_user_id', loadedUser.id);
          } else {
            localStorage.removeItem('auth_user_id');
          }
        }
      } catch (error) {
        console.error('Error loading auth context:', error);
      } finally {
        if (!isInitialized) {
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
    document.cookie = `selected_period_id=${period.id}; path=/; max-age=31536000`; // 1 year expiry
  };

  const login = async (employeeCode: string, password?: string) => {
    const res = await loginAction(employeeCode, password || '');
    if (!res.success || !res.user) {
      throw new Error(res.error || 'Login failed');
    }
    setUser(res.user);
    localStorage.setItem('auth_user_id', res.user.id);
    const periods = await getPeriodsAction();
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
    try {
      await logoutAction();
    } catch {}
    setUser(null);
    setAllPeriods([]);
    setCurrentPeriodState(null);
    localStorage.removeItem('auth_user_id');
    localStorage.removeItem('selected_period_id');
    document.cookie = 'selected_period_id=; path=/; max-age=0';
  };

  const isManager = user?.role === 'Manager';
  const isLeader = user?.role === 'Leader';
  const isSubLeader = user?.role === 'SubLeader';

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
      isLoggingOut,
      login, 
      logout,
      isManager,
      isLeader,
      isSubLeader,
      currentPeriod,
      allPeriods,
      setCurrentPeriod
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
