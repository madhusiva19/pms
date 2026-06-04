'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/Breadcrumb';
import LoadingSpinner from '@/components/LoadingSpinner';
import { reconsiderationApi } from '@/services/potentialAssessmentApi';
import { ChevronLeft } from 'lucide-react';
import type { PotentialAssessmentReconsideration, PotentialAssessmentItem, RatingValue } from '@/types';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function calcSelfPillarRating(items: PotentialAssessmentItem[], pillar: string): RatingValue | null {
  const pi = items.filter(i => i.pillar === pillar);
  if (!pi.length) return null;
  const counts: Record<string, number> = { H: 0, M: 0, L: 0 };
  pi.forEach(i => { if (i.self_rating) counts[i.self_rating]++; });
  const max = Math.max(counts.H, counts.M, counts.L);
  if (max === 0) return null;
  if (counts.H === max) return 'H';
  if (counts.M === max) return 'M';
  return 'L';
}

const ratingCls: Record<RatingValue, string> = {
  H: 'bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC]',
  M: 'bg-[#FEF9C3] text-[#CA8A04] border-[#FDE047]',
  L: 'bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5]',
};

function RatingBadge({ value }: { value: RatingValue | null | undefined }) {
  if (!value) return <span className="text-[#94A3B8] text-[13px]">—</span>;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-semibold border ${ratingCls[value]}`}>
      {value === 'H' ? 'High' : value === 'M' ? 'Medium' : 'Low'}
    </span>
  );
}

const RATING_OPTIONS: { value: RatingValue; label: string }[] = [
  { value: 'H', label: 'H — High' },
  { value: 'M', label: 'M — Medium' },
  { value: 'L', label: 'L — Low' },
];

function RatingSelect({ value, onChange, label }: { value: RatingValue | ''; onChange: (v: RatingValue | '') => void; label: string }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as RatingValue | '')}
      aria-label={label}
      className="border border-[#D1D5DB] rounded-lg px-3 py-2 text-[13.5px] text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] bg-white"
    >
      <option value="">— unchanged —</option>
      {RATING_OPTIONS.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

const BACK_PATH = '/branch-admin/potential-assessment/supervisor-review';

export default function BranchAdminReconsiderationReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const assessmentId = params?.assessmentId as string;

  const [assessment, setAssessment] = useState<PotentialAssessmentReconsideration | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const [justification, setJustification] = useState('');
  const [overrideAbility, setOverrideAbility] = useState<RatingValue | ''>('');
  const [overrideAspiration, setOverrideAspiration] = useState<RatingValue | ''>('');
  const [overrideLeadership, setOverrideLeadership] = useState<RatingValue | ''>('');
  const [overrideTalentBlock, setOverrideTalentBlock] = useState<RatingValue | ''>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'branch_admin')) router.push('/');
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
  if (!user || user.role !== 'branch_admin') return null;

  if (!assessment) {
    return (
      <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full">
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">
          {error ?? 'Assessment not found.'}
        </div>
      </div>
    );
  }

  const items = assessment.items ?? [];
  const selfAbility    = calcSelfPillarRating(items, 'ability');
  const selfAspiration = calcSelfPillarRating(items, 'aspiration');
  const selfLeadership = calcSelfPillarRating(items, 'leadership');
  const hasAnyOverride = !!(overrideAbility || overrideAspiration || overrideLeadership || overrideTalentBlock);

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      await reconsiderationApi.review(assessmentId, 'approve', {
        reviewerId:          user.id,
        justification:       justification     || undefined,
        overrideAbility:     overrideAbility   || undefined,
        overrideAspiration:  overrideAspiration || undefined,
        overrideLeadership:  overrideLeadership || undefined,
        overrideTalentBlock: overrideTalentBlock || undefined,
      });
      const msg = showOverride && hasAnyOverride
        ? 'Scores updated and reconsideration approved.'
        : 'Reconsideration approved. Assessment marked as completed.';
      alert(msg);
      router.push(BACK_PATH);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Failed to approve reconsideration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionNote.trim()) { alert('Please provide a rejection note before rejecting.'); return; }
    setSubmitting(true);
    try {
      await reconsiderationApi.review(assessmentId, 'reject', { reviewerId: user.id, rejectionNote });
      alert('Reconsideration rejected.');
      router.push(BACK_PATH);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Failed to reject reconsideration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full">
      <Breadcrumb items={[
        { label: 'Potential Assessment', href: BACK_PATH },
        { label: 'Reconsideration Review' },
      ]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Reconsideration Review</h1>
        <p className="text-[14px] text-[#64748B]">{assessment.employee_name} · {assessment.appraisal_cycle}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">{error}</div>}

      <div className="flex items-start gap-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-5 py-4">
        <span className="text-[20px] shrink-0">⚠️</span>
        <div>
          <p className="text-[14px] font-semibold text-[#92400E]">Reconsideration Requested</p>
          <p className="text-[13.5px] text-[#92400E] mt-0.5">
            {assessment.employee_name ?? 'This employee'} has requested a reconsideration.
            Requested on {formatDate(assessment.requested_at)}.
            Direct supervisor: <strong>{assessment.supervisor_name ?? '—'}</strong>.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-3.5 bg-[#F8FAFC] border-b border-[#E5E7EB]">
          <h2 className="text-[14px] font-semibold text-[#101828]">Assessment Results Comparison</h2>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">Employee self-assessment vs supervisor review</p>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[#F1F5F9]">
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-1/3">Pillar</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-1/3">Employee (Self)</th>
              <th className="text-left px-5 py-3 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-1/3">Supervisor Review</th>
            </tr>
          </thead>
          <tbody>
            {[
              { label: 'Ability',      self: selfAbility,    supervisor: assessment.overall_ability    },
              { label: 'Aspiration',   self: selfAspiration, supervisor: assessment.overall_aspiration },
              { label: 'Leadership',   self: selfLeadership, supervisor: assessment.overall_leadership },
              { label: 'Talent Block', self: null,           supervisor: assessment.talent_block       },
            ].map((row) => (
              <tr key={row.label} className="border-b border-[#F1F5F9] last:border-0">
                <td className="px-5 py-3.5 text-[13.5px] font-medium text-[#101828]">{row.label}</td>
                <td className="px-5 py-3.5">{row.label === 'Talent Block' ? <span className="text-[#94A3B8] text-[13px]">N/A</span> : <RatingBadge value={row.self} />}</td>
                <td className="px-5 py-3.5"><RatingBadge value={row.supervisor} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 flex flex-col gap-3">
        <h2 className="text-[14px] font-semibold text-[#101828] pb-2 border-b border-[#F1F5F9]">Employee's Reconsideration Comment</h2>
        {assessment.comment ? (
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-4 py-3 text-[13.5px] text-[#374151] leading-6">
            {assessment.comment}
          </div>
        ) : (
          <p className="text-[13.5px] text-[#94A3B8] italic">No comment provided.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 flex flex-col gap-5">
        <h2 className="text-[15px] font-semibold text-[#101828] pb-2 border-b border-[#F1F5F9]">Your Decision</h2>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowOverride(v => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${showOverride ? 'bg-[#1D4ED8]' : 'bg-[#D1D5DB]'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showOverride ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-[13.5px] font-medium text-[#374151]">Override supervisor scores</span>
        </div>

        {showOverride && (
          <div className="flex flex-col gap-4 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4">
            <p className="text-[12.5px] text-[#64748B]">Leave a field as "— unchanged —" to keep the existing score.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Ability</label>
                <RatingSelect value={overrideAbility} onChange={setOverrideAbility} label="Override Ability Rating" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Aspiration</label>
                <RatingSelect value={overrideAspiration} onChange={setOverrideAspiration} label="Override Aspiration Rating" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Leadership</label>
                <RatingSelect value={overrideLeadership} onChange={setOverrideLeadership} label="Override Leadership Rating" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Talent Block</label>
                <RatingSelect value={overrideTalentBlock} onChange={setOverrideTalentBlock} label="Override Talent Block Rating" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-[#374151]">
                Justification <span className="text-[#DC2626]">(required when overriding)</span>
              </label>
              <textarea rows={3}
                placeholder="Explain why you are changing the supervisor's scores..."
                value={justification} onChange={e => setJustification(e.target.value)}
                className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-[13.5px] text-[#1E293B] resize-none focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-[#374151]">
            Rejection Note <span className="text-[#DC2626]">(required if rejecting)</span>
          </label>
          <textarea rows={3}
            placeholder="Explain why this reconsideration is being rejected..."
            value={rejectionNote} onChange={e => setRejectionNote(e.target.value)}
            className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-[13.5px] text-[#1E293B] resize-none focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-1">
          <button type="button" onClick={() => router.push(BACK_PATH)}
            className="flex items-center gap-2 px-4 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg text-[13.5px] font-medium text-[#1E293B] hover:bg-[#F1F5F9] transition-colors">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>
          <button type="button" onClick={handleReject} disabled={submitting}
            className="px-4 py-2 bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] text-[13.5px] font-medium rounded-lg hover:bg-[#FEE2E2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {submitting ? 'Processing…' : 'Reject'}
          </button>
          <button type="button" onClick={handleApprove} disabled={submitting}
            className="px-4 py-2 bg-[#1D4ED8] text-white text-[13.5px] font-medium rounded-lg hover:bg-[#1E40AF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {submitting ? 'Processing…' : (showOverride && hasAnyOverride ? 'Override & Approve' : 'Approve')}
          </button>
        </div>
      </div>
    </div>
  );
}
