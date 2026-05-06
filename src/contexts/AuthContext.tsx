'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, EvaluationPeriod } from '@/types';
import { supabase } from '@/lib/supabase';
import { mapUserFromDb } from '@/lib/db/users';
import { mapPeriodFromDb } from '@/lib/db/evaluations';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (employeeCode: string) => Promise<void>;
  logout: () => void;
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
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    async function loadAuth() {
      try {
        const savedUserId = localStorage.getItem('auth_user_id');
        const savedPeriodId = localStorage.getItem('selected_period_id');
        
        // 1. Load all periods
        const { data: periodsData } = await supabase
          .from('evaluation_periods')
          .select('*')
          .order('year', { ascending: false })
          .order('created_at', { ascending: false });
        
        const periods = (periodsData || []).map(mapPeriodFromDb);
        setAllPeriods(periods);

        // 2. Determine current period
        if (periods.length > 0) {
          let targetPeriod = null;
          
          if (savedPeriodId) {
            targetPeriod = periods.find(p => p.id === savedPeriodId);
          }
          
          // Fallback to active period if no saved one or saved one not found
          if (!targetPeriod) {
            targetPeriod = periods.find(p => p.status === 'Active') || periods[0];
          }

          if (targetPeriod) {
            setCurrentPeriodState(targetPeriod);
          }
        }

        // 3. Load user
        if (savedUserId) {
          const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', savedUserId)
            .single();
            
          if (userData) {
            setUser(mapUserFromDb(userData));
          }
        }
      } catch (error) {
        console.error('Error loading auth context:', error);
      } finally {
        setIsLoading(false);
        setIsInitialized(true);
      }
    }
    
    loadAuth();
  }, []);

  const setCurrentPeriod = (period: EvaluationPeriod) => {
    setCurrentPeriodState(period);
    localStorage.setItem('selected_period_id', period.id);
  };

  const login = async (employeeCode: string) => {
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('employee_code', employeeCode)
      .single();
      
    if (userData) {
      const user = mapUserFromDb(userData);
      setUser(user);
      localStorage.setItem('auth_user_id', user.id);
    } else {
      throw new Error('User not found');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_user_id');
  };

  const isManager = user?.role === 'Manager';
  const isLeader = user?.role === 'Leader';
  const isSubLeader = user?.role === 'SubLeader';

  return (
    <AuthContext.Provider value={{ 
      user, 
      isLoading, 
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
