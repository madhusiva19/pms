'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export type UserRole =
  | 'hq_admin'
  | 'country_admin'
  | 'branch_admin'
  | 'dept_admin'
  | 'sub_dept_admin'
  | 'employee';

export interface User {
  id:                 string;
  email:              string;
  full_name:          string;
  role:               UserRole;
  branch_id?:         string;
  country_id?:        string;
  iata_branch_code?:  string;
  department_id?:     string;
  sub_department_id?: string;
  avatar_url?:        string;
}

interface AuthContextType {
  user:               User | null;
  loading:            boolean;
  error:              string | null;
  notificationCount:  number;
  trainingBadgeCount: number;
  logout:             () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,               setUser]               = useState<User | null>(null);
  const [loading,            setLoading]            = useState(true);
  const [error,              setError]              = useState<string | null>(null);
  const [notificationCount,  setNotificationCount]  = useState(0);
  const [trainingBadgeCount, setTrainingBadgeCount] = useState(0);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // ── DEMO MODE SUPPORT ──────────────────────────────────────
        // FIX: Use sessionStorage instead of localStorage so each browser
        // tab has its own isolated demo session and doesn't bleed into
        // other tabs loaded with different roles.
        const urlParams = new URLSearchParams(window.location.search);
        const demoRole  = urlParams.get('demo-role');
        const validRoles: UserRole[] = [
          'hq_admin', 'country_admin', 'branch_admin',
          'dept_admin', 'sub_dept_admin', 'employee',
        ];

        if (validRoles.includes(demoRole as UserRole)) {
          console.log(`🔧 Demo mode enabled with role: ${demoRole}`);
          // ✅ sessionStorage: tab-scoped, not shared across tabs
          sessionStorage.setItem('demo-role', demoRole!);
        }

        // ✅ Only reads from THIS tab's sessionStorage
        const activeDemoRole = demoRole || sessionStorage.getItem('demo-role');

        const demoEmail = urlParams.get('demo-email');
        if (demoEmail) {
          // ✅ sessionStorage: tab-scoped
          sessionStorage.setItem('demo-email', demoEmail);
        }
        const activeDemoEmail = demoEmail || sessionStorage.getItem('demo-email');

        if (activeDemoEmail) {
          const { data: demoUser } = await supabase
            .from('users')
            .select('*')
            .eq('email', activeDemoEmail)
            .single();
          if (demoUser) {
            setUser(demoUser);
            setLoading(false);
            return;
          }
        }

        if (activeDemoRole) {
          const { data: demoUser } = await supabase
            .from('users')
            .select('*')
            .eq('role', activeDemoRole)
            .limit(1)
            .single();
          if (demoUser) {
            setUser(demoUser);
            setLoading(false);
            return;
          }
        }
        // ── END DEMO MODE ──────────────────────────────────────────

        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !authUser) {
          setUser(null);
          setLoading(false);
          return;
        }

        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError) {
          console.error('Error fetching user profile:', profileError);
          setUser({
            id:        authUser.id,
            email:     authUser.email || '',
            full_name: authUser.user_metadata?.full_name || 'HQ Admin',
            role:      'hq_admin',
          });
        } else if (userProfile) {
          setUser(userProfile);
        }

      } catch (err) {
        console.error('Authentication error:', err);
        setError('Authentication error');
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Fetch unread notification count whenever the user changes
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
      .then(({ count }) => setNotificationCount(count ?? 0));
  }, [user?.id]);

  // Fetch incomplete training badge count whenever the user changes
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('training_records')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .then(({ count }) => setTrainingBadgeCount(count ?? 0));
  }, [user?.id]);

  // Clear session and reset auth state
  const logout = () => {
    sessionStorage.removeItem('demo-role');
    sessionStorage.removeItem('demo-email');
    localStorage.removeItem('demo-role');
    localStorage.removeItem('demo-email');
    supabase.auth.signOut();
    setUser(null);
    setNotificationCount(0);
    setTrainingBadgeCount(0);
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      error,
      notificationCount,
      trainingBadgeCount,
      logout,
    }}>
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