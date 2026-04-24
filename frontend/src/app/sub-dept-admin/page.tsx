'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function SubDeptAdminHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/sub-dept-admin/dashboard'); }, [router]);
  return null;
}
