'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_ROUTE_PREFIX, STORAGE_KEYS } from '../lib/constants';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || 'null') as { role?: string } | null;
      const role = stored?.role || 'branch_admin';
      const prefix = ROLE_ROUTE_PREFIX[role] || '/branch-admin';
      router.push(`${prefix}/my-team`);
    } catch {
      router.push('/branch-admin/my-team');
    }
  }, [router]);

  return null;
}
