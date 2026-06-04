'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/Breadcrumb';
import LoadingSpinner from '@/components/LoadingSpinner';
import { reconsiderationApi } from '@/services/potentialAssessmentApi';
import { ChevronLeft } from 'lucide-react';
import type { PotentialAssessmentReconsideration } from '@/types';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function DeptAdminReconsiderationReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const assessmentId = params?.assessmentId as string;

  const [assessment, setAssessment] = useState<PotentialAssessmentReconsideration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'dept_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || !user || !assessmentId) return;
    setLoading(true);
    reconsiderationApi.getStatus(assessmentId)
      .then(setAssessment)
      .catch((err) => setError(err?.response?.data?.error ?? 'Failed to load assessment.'))
      .finally(() => setLoading(false));
  }, [user, authLoading, assessmentId]);

  if (authLoading || loading) return <LoadingSpinner />;
  if (!user || user.role !== 'dept_admin') return null;

  if (!assessment) {
    return (
      <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full">
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">
          {error ?? 'Assessment not found.'}
        </div>
      </div>
    );
  }

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await reconsiderationApi.review(assessmentId, 'approve', undefined, user.id);
      alert('Reconsideration approved. Assessment marked as completed.');
      router.push('/dept-admin/potential-assessment/supervisor-review');
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Failed to approve reconsideration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionNote.trim()) {
      alert('Please provide a rejection note before rejecting.');
      return;
    }
    setSubmitting(true);
    try {
      await reconsiderationApi.review(assessmentId, 'reject', rejectionNote, user.id);
      alert('Reconsideration rejected.');
      router.push('/dept-admin/potential-assessment/supervisor-review');
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Failed to reject reconsideration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full">
      <Breadcrumb items={[
        { label: 'Potential Assessment', href: '/dept-admin/potential-assessment/supervisor-review' },
        { label: 'Reconsideration Review' },
      ]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Reconsideration Review</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">{error}</div>
      )}

      {/* Alert banner */}
      <div className="flex items-start gap-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-5 py-4">
        <span className="text-[20px] flex-shrink-0">⚠️</span>
        <div>
          <p className="text-[14px] font-semibold text-[#92400E]">Reconsideration Requested</p>
          <p className="text-[13.5px] text-[#92400E] mt-0.5">
            {assessment.employee_name ?? 'This employee'} has requested a reconsideration of their assessment result.
          </p>
        </div>
      </div>

      {/* Details card */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB]">

          {/* Left — Assessment Details */}
          <div className="p-6 flex flex-col gap-4">
            <h2 className="text-[14px] font-semibold text-[#101828] pb-2 border-b border-[#F1F5F9]">Assessment Details</h2>
            <dl className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">Employee Name</dt>
                <dd className="text-[13.5px] text-[#1E293B] font-medium">{assessment.employee_name ?? '—'}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">Assessment Cycle</dt>
                <dd className="text-[13.5px] text-[#1E293B]">{assessment.appraisal_cycle ?? '—'}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">Direct Supervisor</dt>
                <dd className="text-[13.5px] text-[#1E293B]">{assessment.supervisor_name ?? '—'}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">Original Status</dt>
                <dd>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]">
                    Completed
                  </span>
                </dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">Requested At</dt>
                <dd className="text-[13.5px] text-[#1E293B]">{formatDate(assessment.requested_at)}</dd>
              </div>
            </dl>
          </div>

          {/* Right — Employee's Comment */}
          <div className="p-6 flex flex-col gap-4">
            <h2 className="text-[14px] font-semibold text-[#101828] pb-2 border-b border-[#F1F5F9]">Employee's Comment</h2>
            {assessment.comment ? (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-4 py-3 text-[13.5px] text-[#374151] leading-6 min-h-[80px]">
                {assessment.comment}
              </div>
            ) : (
              <p className="text-[13.5px] text-[#94A3B8] italic">No comment provided.</p>
            )}
          </div>
        </div>
      </div>

      {/* Your Decision */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold text-[#101828] pb-2 border-b border-[#F1F5F9]">Your Decision</h2>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-[#374151]">
            Rejection Note <span className="text-[#DC2626]">(required if rejecting)</span>
          </label>
          <textarea
            rows={4}
            placeholder="Explain why this reconsideration is being rejected..."
            value={rejectionNote}
            onChange={(e) => setRejectionNote(e.target.value)}
            className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-[13.5px] text-[#1E293B] resize-none focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.push('/dept-admin/potential-assessment/supervisor-review')}
            className="flex items-center gap-2 px-4 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13.5px] font-medium text-[#1E293B] hover:bg-[#F1F5F9] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <button
            type="button"
            onClick={handleReject}
            disabled={submitting}
            className="px-4 py-2 bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] text-[13.5px] font-medium rounded-lg hover:bg-[#FEE2E2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Processing…' : 'Reject Reconsideration'}
          </button>

          <button
            type="button"
            onClick={handleApprove}
            disabled={submitting}
            className="px-4 py-2 bg-[#1D4ED8] text-white text-[13.5px] font-medium rounded-lg hover:bg-[#1E40AF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Processing…' : 'Approve & Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}
