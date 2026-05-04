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
  country_id?:        string;  // country_admin only
  iata_branch_code?:  string;  // branch_admin
  department_id?:     string;  // dept_admin
  sub_department_id?: string;  // sub_dept_admin
}

interface AuthContextType {
  user:    User | null;
  loading: boolean;
  error:   string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // ── DEMO MODE SUPPORT ──────────────────────────────────────
        const urlParams   = new URLSearchParams(window.location.search);
        const demoRole    = urlParams.get('demo-role');
        const validRoles: UserRole[] = [
          'hq_admin', 'country_admin', 'branch_admin',
          'dept_admin', 'sub_dept_admin', 'employee',
        ];

        // Save demo-role from URL to localStorage
        if (validRoles.includes(demoRole as UserRole)) {
          console.log(`🔧 Demo mode enabled with role: ${demoRole}`);
          localStorage.setItem('demo-role', demoRole!);
        }

        const activeDemoRole  = demoRole || localStorage.getItem('demo-role');

        // ?demo-email= targets a specific user (bypasses role-based lookup)
        const demoEmail = urlParams.get('demo-email');
        if (demoEmail) {
          localStorage.setItem('demo-email', demoEmail);
        }
        const activeDemoEmail = demoEmail || localStorage.getItem('demo-email');

        // If demo-email is set, find that specific user
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

        // If demo-role is set, find the first user with that role
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

        // Get Supabase auth user
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !authUser) {
          // No Supabase session — fall back to saved demo role
          const savedRole = (localStorage.getItem('demo-role') as UserRole) || 'hq_admin';
          localStorage.setItem('demo-role', savedRole);
          setUser({
            id:        `demo-${savedRole}`,
            email:     'demo@pms.local',
            full_name: savedRole
              .replace(/_/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase()),
            role: savedRole,
          });
          setLoading(false);
          return;
        }

        // Fetch user profile from users table using actual auth user ID
        const { data: userProfile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authUser.id)
          .single();

        if (profileError) {
          console.error('Error fetching user profile:', profileError);
          // Fallback to hq_admin with real auth user ID
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