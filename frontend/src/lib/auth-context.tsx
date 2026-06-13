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
    const initializeAuth = async () => {
      try {
        // Get Supabase auth user
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

        if (authError || !authUser) {
          setLoading(false);
          return;
        }

        // Fetch user profile with role from users table using actual auth user ID
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError) {
          logger.error('Failed to fetch user profile from database', profileError);
          // Fallback: create a default hq_admin user with the actual auth user ID
          setUser({
            id: authUser.id,
            email: authUser.email || '',
            full_name: authUser.user_metadata?.full_name || 'HQ Admin',
            role: 'hq_admin',
            country_id: undefined
          });
        } else if (userProfile) {
          setUser(userProfile);
        }
      } catch (err) {
        logger.error('Authentication initialization failed', err);
        setError('Authentication error');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
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
