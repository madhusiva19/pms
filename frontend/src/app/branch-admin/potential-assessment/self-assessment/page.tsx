'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/Breadcrumb';
import LoadingSpinner from '@/components/LoadingSpinner';
import SelfAssessmentForm from '@/components/potential-assessment/SelfAssessmentForm';
import CompletedSummary from '@/components/potential-assessment/CompletedSummary';
import { useAssessmentData } from '@/hooks/useAssessmentData';

export default function BranchAdminSelfAssessmentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { cycle, assessment, status, loading: selfLoading, error: selfError, reload } = useAssessmentData(user?.id, user?.id);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'branch_admin')) router.push('/');
  }, [user, authLoading, router]);

  if (authLoading || selfLoading) return <LoadingSpinner />;
  if (!user || user.role !== 'branch_admin') return null;

  return (
    <div className="flex flex-col gap-10 max-w-[1225px] mx-auto w-full">
      <Breadcrumb items={[
        { label: 'Home', href: '/branch-admin/dashboard' },
        { label: 'Potential Assessment' },
        { label: 'Self Assessment' },
      ]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Self Assessment</h1>
        {cycle && <p className="text-[15px] text-[#4A5565]">Appraisal Cycle: <strong>{cycle.name}</strong></p>}
      </div>

      <section className="flex flex-col gap-4">
        <div className="pb-3 border-b border-[#E5E7EB]">
          <h2 className="text-[18px] font-semibold text-[#101828]">My Self-Assessment</h2>
          <p className="text-[13.5px] text-[#64748B]">Complete your Ability, Aspiration and Leadership self-assessment.</p>
        </div>
        {selfError && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">{selfError}</div>}
        {status === 'completed' && assessment ? (
          <CompletedSummary assessmentData={assessment} viewerRole="appraisee" />
        ) : status === 'pending_supervisor' ? (
          <div className="bg-[#FEF9C3] border border-[#FDE68A] rounded-xl px-5 py-4 text-[13.5px] text-[#92400E] font-medium">
            Your self-assessment has been submitted. Awaiting Country Admin Review.
          </div>
        ) : (
          <SelfAssessmentForm
            employeeId={user.id}
            supervisorId={assessment?.supervisor_id ?? (user as any).manager_id ?? ''}
            role="branch_admin"
            cycle={cycle?.name ?? ''}
            currentStatus={status}
            assessmentData={assessment}
            onSubmitSuccess={() => reload()}
          />
        )}
      </section>
    </div>
  );
}
