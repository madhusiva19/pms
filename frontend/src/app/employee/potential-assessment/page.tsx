'use client';

/**
 * Employee — Potential Assessment page (self-assessment only, no team review)
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/Breadcrumb';
import LoadingSpinner from '@/components/LoadingSpinner';
import SelfAssessmentForm from '@/components/potential-assessment/SelfAssessmentForm';
import CompletedSummary from '@/components/potential-assessment/CompletedSummary';
import { useAssessmentData } from '@/hooks/useAssessmentData';
import type { PotentialAssessment } from '@/types';

export default function EmployeePotentialAssessmentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { cycle, assessment, status, loading, error, reload } = useAssessmentData(user?.id, user?.id);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'employee')) router.push('/');
  }, [user, authLoading, router]);

  if (authLoading || loading) return <LoadingSpinner />;
  if (!user || user.role !== 'employee') return null;

  return (
    <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full">
      <Breadcrumb items={[{ label: 'Home', href: '/employee/my-performance' }, { label: 'Potential Assessment' }]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Potential Assessment</h1>
        {cycle && <p className="text-[15px] text-[#4A5565]">Appraisal Cycle: <strong>{cycle.cycle_year}</strong></p>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">{error}</div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-[18px] font-semibold text-[#101828]">My Self-Assessment</h2>

        {status === 'completed' && assessment ? (
          <CompletedSummary assessmentData={assessment} />
        ) : (
          <SelfAssessmentForm
            employeeId={user.id}
            supervisorId={assessment?.supervisor_id ?? (user as any).manager_id ?? ''}
            role="employee"
            cycle={String(cycle?.cycle_year ?? '')}
            currentStatus={status}
            assessmentData={assessment}
            onSubmitSuccess={(updated: PotentialAssessment) => reload()}
          />
        )}
      </div>
    </div>
  );
}
