'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/Breadcrumb';
import LoadingSpinner from '@/components/LoadingSpinner';
import { reconsiderationApi, assessmentComponentsApi } from '@/services/potentialAssessmentApi';
import { ChevronLeft } from 'lucide-react';
import { ASSESSMENT_PILLARS, PILLAR_KEYS, type PillarKey } from '@/utils/assessmentContent';
import { buildPillars, calcOverallPotentiality } from '@/utils/assessmentUtils';
import type { PotentialAssessmentReconsideration, PotentialAssessmentItem, RatingValue } from '@/types';

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

function OverrideSelect({ itemId, value, onChange }: {
  itemId: string;
  value: RatingValue | '';
  onChange: (itemId: string, v: RatingValue | '') => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(itemId, e.target.value as RatingValue | '')}
      aria-label="Override rating"
      className={`border rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] bg-white ${
        value ? 'border-[#1D4ED8] text-[#1D4ED8] font-medium' : 'border-[#D1D5DB] text-[#6B7280]'
      }`}
    >
      <option value="">Keep current</option>
      <option value="H">H — High</option>
      <option value="M">M — Medium</option>
      <option value="L">L — Low</option>
    </select>
  );
}

function majority(ratings: RatingValue[]): RatingValue {
  const h = ratings.filter(r => r === 'H').length;
  const l = ratings.filter(r => r === 'L').length;
  if (h >= 2) return 'H';
  if (l >= 2) return 'L';
  return 'M';
}

const BACK_PATH = '/hq-admin/potential-assessment';

export default function HQAdminReconsiderationReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const assessmentId = params?.assessmentId as string;

  const [assessment, setAssessment] = useState<PotentialAssessmentReconsideration | null>(null);
  const [pillars, setPillars] = useState(ASSESSMENT_PILLARS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RatingValue | ''>>({});
  const [justification, setJustification] = useState('');
  const [rejectionNote, setRejectionNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'hq_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || !user || !assessmentId) return;
    setLoading(true);
    reconsiderationApi.getStatus(assessmentId)
      .then(setAssessment)
      .catch(err => setError(err?.response?.data?.error ?? 'Failed to load assessment.'))
      .finally(() => setLoading(false));
  }, [user, authLoading, assessmentId]);

  useEffect(() => {
    if (!assessment?.appraisee_role) return;
    assessmentComponentsApi.getForRole(assessment.appraisee_role)
      .then(comps => { if (comps.length > 0) setPillars(buildPillars(comps)); })
      .catch(() => {});
  }, [assessment?.appraisee_role]);

  if (authLoading || loading) return <LoadingSpinner />;
  if (!user || user.role !== 'hq_admin') return null;
  if (!assessment) return (
    <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full">
      <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">{error ?? 'Assessment not found.'}</div>
    </div>
  );

  const items = assessment.items ?? [];

  // Group items by pillar, sorted by component_number
  const itemsByPillar: Record<PillarKey, PotentialAssessmentItem[]> = { ability: [], aspiration: [], leadership: [] };
  items.forEach(item => {
    const p = item.pillar as PillarKey;
    if (itemsByPillar[p]) itemsByPillar[p].push(item);
  });
  PILLAR_KEYS.forEach(p => itemsByPillar[p].sort((a, b) => a.component_number - b.component_number));

  // Effective rating for an item: override takes precedence over supervisor_rating
  const effectiveRating = (item: PotentialAssessmentItem): RatingValue | null =>
    (overrides[item.id] as RatingValue) || item.supervisor_rating || null;

  // Live pillar overalls from current effective ratings
  const livePillarOverall = (pillar: PillarKey): RatingValue | null => {
    const ratings = itemsByPillar[pillar].map(effectiveRating).filter(Boolean) as RatingValue[];
    return ratings.length === 3 ? majority(ratings) : null;
  };

  const liveAbility    = livePillarOverall('ability');
  const liveAspiration = livePillarOverall('aspiration');
  const liveLeadership = livePillarOverall('leadership');
  const liveTalentBlock = calcOverallPotentiality(liveAbility, liveAspiration, liveLeadership);

  const hasAnyOverride = Object.values(overrides).some(Boolean);

  const setOverride = (itemId: string, v: RatingValue | '') => setOverrides(prev => ({ ...prev, [itemId]: v }));

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const overrideItems = Object.entries(overrides)
        .filter(([, rating]) => rating)
        .map(([item_id, rating]) => ({ item_id, rating: rating as string }));
      await reconsiderationApi.review(assessmentId, 'approve', {
        reviewerId: user.id,
        justification: justification || undefined,
        overrideItems: overrideItems.length ? overrideItems : undefined,
      });
      alert(hasAnyOverride ? 'Scores updated and reconsideration approved.' : 'Reconsideration approved.');
      router.push(BACK_PATH);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Failed to approve. Please try again.');
    } finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    if (!rejectionNote.trim()) { alert('Please provide a rejection note before rejecting.'); return; }
    setSubmitting(true);
    try {
      await reconsiderationApi.review(assessmentId, 'reject', { reviewerId: user.id, rejectionNote });
      alert('Reconsideration rejected.');
      router.push(BACK_PATH);
    } catch (err: any) {
      alert(err?.response?.data?.error ?? 'Failed to reject. Please try again.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full">
      <Breadcrumb items={[{ label: 'Potential Assessment', href: BACK_PATH }, { label: 'Reconsideration Review' }]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Reconsideration Review</h1>
        <p className="text-[14px] text-[#64748B]">{assessment.employee_name} · Cycle {assessment.appraisal_cycle}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">{error}</div>}

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-5 py-4">
        <span className="text-[20px] shrink-0">⚠️</span>
        <div className="flex flex-col gap-0.5">
          <p className="text-[14px] font-semibold text-[#92400E]">Reconsideration Requested</p>
          <p className="text-[13.5px] text-[#92400E]">
            <strong>{assessment.employee_name ?? 'This employee'}</strong> has requested a reconsideration
            of their assessment result. Requested on {formatDate(assessment.requested_at)}.
          </p>
        </div>
      </div>

      {/* Assessment details */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB]">
          <div className="p-6 flex flex-col gap-4">
            <h2 className="text-[14px] font-semibold text-[#101828] pb-2 border-b border-[#F1F5F9]">Assessment Details</h2>
            <dl className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">Employee</dt>
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
                <dt className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">Requested At</dt>
                <dd className="text-[13.5px] text-[#1E293B]">{formatDate(assessment.requested_at)}</dd>
              </div>
            </dl>
          </div>
          <div className="p-6 flex flex-col gap-3">
            <h2 className="text-[14px] font-semibold text-[#101828] pb-2 border-b border-[#F1F5F9]">Employee's Comment</h2>
            {assessment.comment ? (
              <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-4 py-3 text-[13.5px] text-[#374151] leading-6">
                {assessment.comment}
              </div>
            ) : (
              <p className="text-[13.5px] text-[#94A3B8] italic">No comment provided.</p>
            )}
          </div>
        </div>
      </div>

      {/* Component-level assessment results */}
      {pillars.map(pillar => {
        const pillarItems = itemsByPillar[pillar.key as PillarKey];
        const pillarOverall = livePillarOverall(pillar.key as PillarKey);
        return (
          <div key={pillar.key} className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <div className="px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB] flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-[#101828]">{pillar.label}</h2>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#64748B]">Pillar Overall:</span>
                <RatingBadge value={pillarOverall} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-[#F1F5F9]">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide w-[30%]">Component</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide w-[16%]">Self Rating</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide w-[16%]">Supervisor Rating</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide w-[16%]">Final Result</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide w-[22%]">Override</th>
                  </tr>
                </thead>
                <tbody>
                  {pillarItems.map((item, idx) => {
                    const desc = pillar.components[item.component_number - 1] ?? `Component ${item.component_number}`;
                    const final = effectiveRating(item);
                    const isOverridden = !!overrides[item.id];
                    return (
                      <tr key={item.id} className="border-b border-[#F1F5F9] last:border-0">
                        <td className="px-4 py-4 align-top">
                          <p className="text-[12px] font-semibold text-[#6B7280] mb-1">Q{idx + 1}</p>
                          <p className="text-[13px] text-[#374151] leading-5">{desc}</p>
                          {item.self_example && (
                            <p className="mt-1.5 text-[12px] text-[#64748B] italic leading-4 border-l-2 border-[#E2E8F0] pl-2">
                              &ldquo;{item.self_example}&rdquo;
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <RatingBadge value={item.self_rating} />
                        </td>
                        <td className="px-4 py-4 align-top">
                          <RatingBadge value={item.supervisor_rating} />
                          {item.supervisor_justification && (
                            <p className="mt-1.5 text-[12px] text-[#64748B] italic leading-4 border-l-2 border-[#E2E8F0] pl-2">
                              &ldquo;{item.supervisor_justification}&rdquo;
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 align-top">
                          {isOverridden ? (
                            <div className="flex flex-col gap-1">
                              <RatingBadge value={final} />
                              <span className="text-[11px] text-[#1D4ED8] font-medium">Overridden</span>
                            </div>
                          ) : (
                            <RatingBadge value={final} />
                          )}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <OverrideSelect
                            itemId={item.id}
                            value={overrides[item.id] ?? ''}
                            onChange={setOverride}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Live results summary */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-3 bg-[#F8FAFC] border-b border-[#E5E7EB]">
          <h2 className="text-[14px] font-semibold text-[#101828]">Overall Results Summary</h2>
          <p className="text-[12.5px] text-[#64748B] mt-0.5">Updates live as you change overrides above</p>
        </div>
        <div className="grid grid-cols-4 divide-x divide-[#F1F5F9]">
          {[
            { label: 'Ability',      value: liveAbility    },
            { label: 'Aspiration',   value: liveAspiration },
            { label: 'Leadership',   value: liveLeadership },
            { label: 'Talent Block', value: liveTalentBlock },
          ].map(row => (
            <div key={row.label} className="p-4 flex flex-col gap-2 items-center">
              <span className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wide">{row.label}</span>
              <RatingBadge value={row.value} />
            </div>
          ))}
        </div>
      </div>

      {/* Decision */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 flex flex-col gap-5">
        <h2 className="text-[15px] font-semibold text-[#101828] pb-2 border-b border-[#F1F5F9]">Your Decision</h2>

        {hasAnyOverride && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-[#374151]">
              Justification <span className="text-[#DC2626]">(required — you have overridden scores)</span>
            </label>
            <textarea rows={3}
              placeholder="Explain why you are changing the supervisor's scores..."
              value={justification} onChange={e => setJustification(e.target.value)}
              className="w-full rounded-lg border border-[#D1D5DB] px-3 py-2.5 text-[13.5px] text-[#1E293B] resize-none focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent"
            />
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
            {submitting ? 'Processing…' : hasAnyOverride ? 'Override & Approve' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}
