'use client';

/**
 * Saved Reports Page
 * Shows user's saved reports
 */

import React, { useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import LoadingScreen from '@/components/LoadingScreen';

export default function SavedReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) router.push('/');
  }, [user, authLoading, router]);

  if (authLoading) return <LoadingScreen />;
  if (!user) return null;

  return (
    <div className="px-4 py-2 pb-10 flex flex-col gap-8">
      <div className="max-w-[1225px] mx-auto w-full flex flex-col gap-8">

        {/* Title */}
        <div>
          <p className="text-[15px] text-[#4A5565] mt-1">Your saved and downloaded reports.</p>
        </div>

        {/* Empty State */}
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#F1F5F9] flex items-center justify-center mb-3">
            <ChevronRight className="w-6 h-6 text-[#94A3B8]" />
          </div>
          <p className="text-[14px] text-[#64748B]">No saved reports yet. Create your first report from the Reports section.</p>
        </div>

      </div>
    </div>
  );
}
