'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, mockUsers, EvaluationPeriod, db } from '@/data/mock';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (employeeId: string) => void;
  logout: () => void;
  // Computed helpers for workflow
  isManager: boolean;
  isLeader: boolean;
  isSubLeader: boolean;
  currentPeriod: EvaluationPeriod | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage on mount
    const savedUserId = localStorage.getItem('auth_user_id');
    if (savedUserId) {
      const foundUser = mockUsers.find(u => u.id === savedUserId);
      if (foundUser) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setUser(foundUser);
      }
    }
    setIsLoading(false);
  }, []);

  const login = (employeeId: string) => {
    const foundUser = mockUsers.find(u => u.id === employeeId);
    if (foundUser) {
      setUser(foundUser);
      localStorage.setItem('auth_user_id', foundUser.id);
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
  const currentPeriod = db.periods.find(p => p.status === 'Active') || null;

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
