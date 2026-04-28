'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, EvaluationPeriod } from '@/types';
import { supabase } from '@/lib/supabase';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (employeeId: string) => Promise<void>;
  logout: () => void;
  isManager: boolean;
  isLeader: boolean;
  isSubLeader: boolean;
  currentPeriod: EvaluationPeriod | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [currentPeriod, setCurrentPeriod] = useState<EvaluationPeriod | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAuth() {
      const savedUserId = localStorage.getItem('auth_user_id');
      
      // Load current active period
      const { data: periodData } = await supabase
        .from('evaluation_periods')
        .select('*')
        .eq('status', 'Active')
        .single();
      
      if (periodData) {
        setCurrentPeriod(periodData as EvaluationPeriod);
      }

      if (savedUserId) {
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', savedUserId)
          .single();
          
        if (userData) {
          setUser(userData as User);
        }
      }
      setIsLoading(false);
    }
    
    loadAuth();
  }, [supabase]);

  const login = async (employeeId: string) => {
    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', employeeId)
      .single();
      
    if (userData) {
      setUser(userData as User);
      localStorage.setItem('auth_user_id', userData.id);
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
      currentPeriod
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
