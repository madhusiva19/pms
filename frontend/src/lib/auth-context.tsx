'use client';

import { logger } from '@/utils/logger';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';


export type UserRole = 'hq_admin' | 'country_admin' | 'branch_admin' | 'dept_admin' | 'sub_dept_admin' | 'employee';
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  country_id?: string;   // For country_admin only
  iata_branch_code?: string;      // For branch_admin
  department_id?: string;         // For dept_admin
  sub_department_id?: string;
  // For sub_dept_admin
  avatar_url?: string;
}


interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
}



const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const loadProfile = async (authUserId: string, authUserEmail: string, metadata: Record<string, string>) => {
      const { data: userProfile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUserId)
        .single();

      if (profileError) {
        logger.error('Failed to fetch user profile from database', profileError);
        setUser({
          id: authUserId,
          email: authUserEmail,
          full_name: metadata?.full_name || 'User',
          role: 'hq_admin',
          country_id: undefined,
        });
      } else if (userProfile) {
        setUser(userProfile);
      }
    };

    // Subscribe to auth state changes (handles login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        try {
          await loadProfile(session.user.id, session.user.email ?? '', session.user.user_metadata ?? {});
        } catch (err) {
          logger.error('Authentication initialization failed', err);
          setError('Authentication error');
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
