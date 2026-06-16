/**
 * Home/Dashboard Page
 * Redirects based on user role:
 * - hq_admin → /hq-admin
 * - country_admin → /country-admin
 * - branch_admin → /branch-admin
 * - dept_admin → /dept-admin
 * - sub_dept_admin → /sub-dept-admin
 * - employee → /employee
 */

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login');
        return;
      }

      switch (user.role) {
        case 'hq_admin':
          router.push('/hq-admin');
          break;
        case 'country_admin':
          router.push('/country-admin');
          break;
        case 'branch_admin':
          router.push('/branch-admin');
          break;
        case 'dept_admin':
          router.push('/dept-admin');
          break;
        case 'sub_dept_admin':
          router.push('/sub-dept-admin');
          break;
        case 'employee':
          router.push('/employee');
          break;
        default:
          
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <p className="text-gray-500">Loading...</p>
      </div>
    </div>
  );
}