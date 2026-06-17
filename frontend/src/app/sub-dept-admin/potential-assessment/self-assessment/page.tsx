'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/breadcrumb/Breadcrumb';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import SelfAssessmentForm from '@/components/potential-assessment/SelfAssessmentForm';
import CompletedSummary from '@/components/potential-assessment/CompletedSummary';
import { useAssessmentData } from '@/hooks/useAssessmentData';
import { reconsiderationApi } from '@/services/potentialAssessmentApi';
import type { PotentialAssessmentReconsideration } from '@/types';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SubDeptAdminSelfAssessmentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { cycle, assessment, status, loading: selfLoading, error: selfError, reload } = useAssessmentData(user?.id, user?.id);
  const [reconComment, setReconComment] = useState('');
  const [reconSubmitting, setReconSubmitting] = useState(false);
  const [reconMsg, setReconMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [reconsideration, setReconsideration] = useState<PotentialAssessmentReconsideration | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'sub_dept_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!assessment?.id) return;
    if (status === 'reconsideration_requested' || status === 'reconsideration_rejected' || status === 'completed') {
      reconsiderationApi.getStatus(assessment.id).then(setReconsideration).catch(() => setReconsideration(null));
    }
  }, [assessment?.id, status]);

  if (authLoading || selfLoading) return <LoadingSpinner />;
  if (!user || user.role !== 'sub_dept_admin') return null;

  const isCompletedOrReviewed = status === 'completed' || status === 'supervisor_reviewed' as string;
  const hasBeenReconsidered = reconsideration !== null && reconsideration.action !== null;

  const handleReconSubmit = async () => {
    if (!assessment?.id) return;
    setReconSubmitting(true);
    try {
      await reconsiderationApi.submit(assessment.id, reconComment, user.id);
      setReconMsg({ text: 'Reconsideration request submitted successfully.', ok: true });
      reload();
    } catch (err: any) {
      setReconMsg({ text: err?.response?.data?.error ?? 'Failed to submit reconsideration. Please try again.', ok: false });
    } finally {
      setReconSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-10 max-w-[1225px] mx-auto w-full px-8 py-6 pb-10">
      <Breadcrumb />

      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Self Assessment</h1>
        {cycle && <p className="text-[15px] text-[#4A5565]">Appraisal Cycle: <strong>{cycle.pms_year}</strong></p>}
      </div>

      <section className="flex flex-col gap-4">
        <div className="pb-3 border-b border-[#E5E7EB]">
          <h2 className="text-[18px] font-semibold text-[#101828]">My Self-Assessment</h2>
          <p className="text-[13.5px] text-[#64748B]">Complete your Ability, Aspiration and Leadership self-assessment.</p>
        </div>
        {selfError && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">{selfError}</div>}
        {(status === 'completed' || status === 'reconsideration_requested' || status === 'reconsideration_rejected') && assessment ? (
          <CompletedSummary assessmentData={assessment} />
        ) : status === 'pending_supervisor' ? (
          <div className="bg-[#FEF9C3] border border-[#FDE68A] rounded-xl px-5 py-4 text-[13.5px] text-[#92400E] font-medium">
            Your self-assessment has been submitted. Awaiting Dept Admin Review.
          </div>
        ) : (
          <SelfAssessmentForm
            employeeId={user.id}
            supervisorId={assessment?.supervisor_id ?? (user as any).manager_id ?? ''}
            role="sub_dept_admin"
            cycle={String(cycle?.pms_year ?? '')}
            currentStatus={status}
            assessmentData={assessment}
            onSubmitSuccess={() => reload()}
          />
        )}
      </section>

      {assessment && (isCompletedOrReviewed || status === 'reconsideration_requested' || status === 'reconsideration_rejected') && (
        <div className="flex flex-col gap-4 bg-white rounded-xl border border-[#E5E7EB] p-6">
          {reconMsg && (
            <div className={"rounded-xl px-4 py-3 text-[13.5px] font-medium border " + (reconMsg.ok ? "bg-[#F0FDF4] border-[#86EFAC] text-[#15803D]" : "bg-[#FEF2F2] border-[#FCA5A5] text-[#DC2626]")}>
              {reconMsg.text}
            </div>
          )}
          {status === 'reconsideration_requested' && (
            <div className="flex items-start gap-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-4 py-3">
              <p className="text-[13.5px] text-[#92400E]">Your reconsideration request is currently under review by the senior supervisor.</p>
            </div>
          )}
          {status === 'reconsideration_rejected' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 bg-[#FEF2F2] border border-[#FCA5A5] rounded-lg px-4 py-3">
                <p className="text-[13.5px] text-[#DC2626] font-medium">Your reconsideration request was rejected.</p>
              </div>
              {reconsideration?.rejection_note && (
                <div className="bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-4 py-3 text-[13.5px] text-[#374151]">
                  <p className="font-medium text-[#6B7280] mb-1 text-[12px] uppercase tracking-wide">Rejection Note</p>
                  <p>{reconsideration?.rejection_note}</p>
                </div>
              )}
              {reconsideration?.reviewed_at && (
                <p className="text-[12.5px] text-[#94A3B8]">Reviewed on: <span className="text-[#64748B] font-medium">{formatDate(reconsideration?.reviewed_at)}</span></p>
              )}
            </div>
          )}
          {status === 'completed' && hasBeenReconsidered && (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-3 bg-[#F0FDF4] border border-[#86EFAC] rounded-lg px-4 py-3">
                <p className="text-[13.5px] text-[#15803D] font-medium">Your reconsideration was reviewed and approved.</p>
              </div>
              {reconsideration?.reviewed_at && (
                <p className="text-[12.5px] text-[#94A3B8]">Approved on: <span className="text-[#64748B] font-medium">{formatDate(reconsideration?.reviewed_at)}</span></p>
              )}
            </div>
          )}
          {isCompletedOrReviewed && !hasBeenReconsidered && status !== 'reconsideration_requested' && status !== 'reconsideration_rejected' && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-[16px] font-semibold text-[#101828]">Not satisfied with your result?</h3>
                <p className="text-[13.5px] text-[#64748B] mt-1">You may request a reconsideration by a senior supervisor. This can only be done once.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium text-[#374151]">Comment (Optional)</label>
                <textarea rows={4} maxLength={500}
                  placeholder="Explain why you would like this assessment to be reconsidered..."
                  value={reconComment} onChange={(e) => setReconComment(e.target.value)}
                  className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-[13.5px] text-[#1E293B] resize-none focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
                />
                <p className="text-[12px] text-[#9CA3AF] text-right">{reconComment.length}/500</p>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={handleReconSubmit} disabled={reconSubmitting}
                  className="px-4 py-2 bg-[#1D4ED8] text-white text-[13.5px] font-medium rounded-lg hover:bg-[#1E40AF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {reconSubmitting ? 'Submitting…' : 'Request Reconsideration'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
