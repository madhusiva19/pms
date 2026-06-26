'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const ROLE_HOME: Record<string, string> = {
  hq_admin:       '/hq-admin/dashboard',
  country_admin:  '/country-admin/dashboard',
  branch_admin:   '/branch-admin/dashboard',
  dept_admin:     '/dept-admin/dashboard',
  sub_dept_admin: '/sub-dept-admin/dashboard',
  employee:       '/employee/dashboard',
};

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (user?.role) {
      router.replace(ROLE_HOME[user.role] ?? '/hq-admin/dashboard');
    } else {
      router.replace('/login');
    }
  }, [user, loading, router]);

  return null;
}
