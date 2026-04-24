'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function DeptAdminHome() {
  const router = useRouter();
  useEffect(() => { router.replace('/dept-admin/dashboard'); }, [router]);
  return null;
}
