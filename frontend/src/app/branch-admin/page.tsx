'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function BranchAdminHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/branch-admin/dashboard'); }, [router]);
  return null;
}
