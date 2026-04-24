'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CountryAdminPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to reports listing
    router.push('/country-admin/reports');
  }, [router]);

  return null;
}

