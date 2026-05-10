'use client';

/**
 * SupervisorReviewForm — Reusable component
 * Used by all supervisor roles to review their subordinate's self-assessment.
 */

import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Loader2, ChevronRight } from 'lucide-react';
import { ASSESSMENT_PILLARS, PILLAR_KEYS, type PillarKey, type PillarDefinition } from '@/utils/assessmentContent';
import { buildPillars } from '@/utils/assessmentUtils';
import { potentialAssessmentApi, assessmentComponentsApi } from '@/services/potentialAssessmentApi';
import type {
  AssessmentStatus,
  PotentialAssessment,
  PotentialAssessmentItem,
  RatingValue,
  SupervisorSubmitItemPayload,
} from '@/types';

interface SupervisorReviewFormProps {
  assessmentId: string;
  supervisorId: string;
  supervisorRole: string;
  currentStatus: AssessmentStatus;
  assessmentData: PotentialAssessment;
  onSubmitSuccess: (updated: PotentialAssessment) => void;
}

type SupRatingMap = Record<PillarKey, Record<number, RatingValue | ''>>;
type SupJustMap = Record<PillarKey, Record<number, string>>;

const RATING_OPTIONS: RatingValue[] = ['H', 'M', 'L'];

const ratingBadgeStyles: Record<RatingValue, string> = {
  H: 'bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC]',
  M: 'bg-[#FEF9C3] text-[#CA8A04] border-[#FDE047]',
  L: 'bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5]',
};

function buildEmpty(): { ratings: SupRatingMap; justs: SupJustMap } {
  const ratings = {} as SupRatingMap;
  const justs = {} as SupJustMap;
  PILLAR_KEYS.forEach((p) => {
    ratings[p] = { 1: '', 2: '', 3: '' };
    justs[p] = { 1: '', 2: '', 3: '' };
  });
  return { ratings, justs };
}

export default function SupervisorReviewForm({
  assessmentId,
  supervisorId,
  supervisorRole,
  currentStatus,
  assessmentData,
  onSubmitSuccess,
}: SupervisorReviewFormProps) {
  const [pillars, setPillars]       = useState<PillarDefinition[]>(ASSESSMENT_PILLARS);
  const [activeTab, setActiveTab]   = useState<PillarKey>('ability');
  const [supRatings, setSupRatings] = useState<SupRatingMap>(buildEmpty().ratings);
  const [supJusts, setSupJusts]     = useState<SupJustMap>(buildEmpty().justs);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isReadOnly = currentStatus !== 'pending_supervisor';

  // Build pillar→component→item lookup
  const itemLookup: Record<PillarKey, Record<number, PotentialAssessmentItem>> = {} as any;
  PILLAR_KEYS.forEach((p) => { itemLookup[p] = {}; });
  (assessmentData.items || []).forEach((item) => {
    itemLookup[item.pillar as PillarKey][item.component_number] = item;
  });

  useEffect(() => {
    if (!assessmentData?.items?.length) return;
    const { ratings: newR, justs: newJ } = buildEmpty();
    assessmentData.items.forEach((item) => {
      const p = item.pillar as PillarKey;
      const c = item.component_number as 1 | 2 | 3;
      if (item.supervisor_rating) newR[p][c] = item.supervisor_rating;
      if (item.supervisor_justification) newJ[p][c] = item.supervisor_justification;
    });
    setSupRatings(newR);
    setSupJusts(newJ);
  }, [assessmentData]);

  useEffect(() => {
    if (!assessmentData.appraisee_role) return;
    assessmentComponentsApi.getForRole(assessmentData.appraisee_role)
      .then(comps => { if (comps.length > 0) setPillars(buildPillars(comps)); })
      .catch(() => {});
  }, [assessmentData.appraisee_role]);

  const allFilled = PILLAR_KEYS.every((p) =>
    [1, 2, 3].every((c) => supRatings[p][c] !== '' && supJusts[p][c].trim() !== '')
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const items: SupervisorSubmitItemPayload[] = [];
      PILLAR_KEYS.forEach((p) => {
        [1, 2, 3].forEach((c) => {
          const item = itemLookup[p][c];
          if (item) {
            items.push({
              id: item.id,
              supervisor_rating: supRatings[p][c] as RatingValue,
              supervisor_justification: supJusts[p][c],
            });
          }
        });
      });
      const result = await potentialAssessmentApi.submitSupervisor({
        assessment_id: assessmentId,
        supervisor_id: supervisorId,
        supervisor_role: supervisorRole,
        items,
      });
      setShowModal(false);
      onSubmitSuccess(result);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.error ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const activePillar = pillars.find((p) => p.key === activeTab)!;

  return (
    <div className="flex flex-col gap-6">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[#F3F4F6] rounded-lg w-fit">
        {pillars.map((pillar) => {
          const filled = isReadOnly ? 3 : [1,2,3].filter((c) => supRatings[pillar.key][c] !== '').length;
          return (
            <button key={pillar.key} onClick={() => setActiveTab(pillar.key)}
              className={`px-4 py-2 rounded-md text-[13px] font-medium transition-all ${activeTab === pillar.key ? 'bg-white text-[#1E3A8A] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}>
              {pillar.label}
              {!isReadOnly && <span className={`ml-2 text-[11px] ${filled === 3 ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>{filled}/3</span>}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-7">#</th>
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Component</th>
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-28 bg-[#F0F4FF]">Appraisee Rating</th>
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide bg-[#F0F4FF]">Appraisee Example</th>
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-40">Your Rating</th>
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Your Justification</th>
            </tr>
          </thead>
          <tbody>
            {activePillar.components.map((desc, idx) => {
              const c = (idx + 1) as 1 | 2 | 3;
              const item = itemLookup[activePillar.key][c];
              const selfRating = item?.self_rating ?? null;
              const selfExample = item?.self_example ?? '';
              const supRating = supRatings[activePillar.key][c];
              const supJust = supJusts[activePillar.key][c];
              return (
                <tr key={c} className={`border-b border-[#F1F5F9] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}`}>
                  <td className="px-4 py-4 text-[13px] text-[#94A3B8] font-medium align-top">{c}</td>
                  <td className="px-4 py-4 text-[13.5px] text-[#1E293B] leading-6 align-top max-w-[200px]">{desc}</td>
                  <td className="px-4 py-4 bg-[#F5F8FF] align-top">
                    {selfRating ? (
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-[13px] font-semibold border ${ratingBadgeStyles[selfRating]}`}>{selfRating}</span>
                    ) : <span className="text-[#94A3B8] text-[13px]">—</span>}
                  </td>
                  <td className="px-4 py-4 bg-[#F5F8FF] align-top">
                    <p className="text-[13.5px] text-[#374151] leading-6 whitespace-pre-wrap max-w-[240px]">{selfExample || <span className="text-[#94A3B8]">—</span>}</p>
                  </td>
                  <td className="px-4 py-4 align-top">
                    {isReadOnly ? (
                      supRating ? <span className={`inline-flex items-center px-3 py-1 rounded-full text-[13px] font-semibold border ${ratingBadgeStyles[supRating as RatingValue]}`}>{supRating}</span>
                      : <span className="text-[#94A3B8] text-[13px]">—</span>
                    ) : (
                      <div className="flex gap-1">
                        {RATING_OPTIONS.map((opt) => (
                          <button key={opt}
                            onClick={() => setSupRatings((prev) => ({ ...prev, [activePillar.key]: { ...prev[activePillar.key], [c]: opt } }))}
                            className={`w-9 h-9 rounded-lg text-[13px] font-semibold border transition-all ${supRating === opt ? ratingBadgeStyles[opt] + ' border-2' : 'bg-white text-[#64748B] border-[#E5E7EB] hover:bg-[#F8FAFC]'}`}>
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    {isReadOnly ? (
                      <p className="text-[13.5px] text-[#374151] leading-6 whitespace-pre-wrap max-w-[240px]">{supJust || <span className="text-[#94A3B8]">—</span>}</p>
                    ) : (
                      <textarea value={supJust}
                        onChange={(e) => setSupJusts((prev) => ({ ...prev, [activePillar.key]: { ...prev[activePillar.key], [c]: e.target.value } }))}
                        placeholder="Provide your justification…" rows={3}
                        className="w-full resize-none border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-[13.5px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isReadOnly && (
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {activeTab !== 'ability' && (
              <button onClick={() => setActiveTab(PILLAR_KEYS[PILLAR_KEYS.indexOf(activeTab) - 1])}
                className="px-3 py-2 text-[13px] text-[#64748B] border border-[#E5E7EB] rounded-lg hover:bg-[#F8FAFC] transition-colors">
                ← Previous
              </button>
            )}
            {activeTab !== 'leadership' && (
              <button onClick={() => setActiveTab(PILLAR_KEYS[PILLAR_KEYS.indexOf(activeTab) + 1])}
                className="flex items-center gap-1 px-3 py-2 text-[13px] text-[#3B82F6] border border-[#BEDBFF] rounded-lg hover:bg-[#EFF6FF] transition-colors">
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button disabled={!allFilled} onClick={() => setShowModal(true)}
            className={`px-6 py-2.5 rounded-lg text-[13.5px] font-semibold text-white transition-all ${allFilled ? 'bg-[#1E3A8A] hover:bg-[#1E40AF] active:scale-[0.98]' : 'bg-[#CBD5E1] cursor-not-allowed'}`}>
            Submit Review
          </button>
        </div>
      )}
      {!allFilled && !isReadOnly && (
        <p className="text-[12.5px] text-[#94A3B8]">All 9 components must have a rating and justification before you can submit.</p>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FEF9C3] flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-[#CA8A04]" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-[#101828]">Confirm Review Submission</h2>
                <p className="text-[13.5px] text-[#64748B] mt-1 leading-6">
                  Once submitted, the Talent Block will be calculated and this assessment will be finalised. This cannot be undone.
                </p>
              </div>
            </div>
            {submitError && <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg px-4 py-3 text-[13px] text-[#DC2626]">{submitError}</div>}
            <div className="flex gap-3 justify-end">
              <button disabled={submitting} onClick={() => { setShowModal(false); setSubmitError(null); }}
                className="px-4 py-2 text-[13.5px] font-medium text-[#374151] border border-[#E5E7EB] rounded-lg hover:bg-[#F8FAFC] transition-colors">
                Cancel
              </button>
              <button disabled={submitting} onClick={handleSubmit}
                className="flex items-center gap-2 px-4 py-2 bg-[#1E3A8A] text-white text-[13.5px] font-semibold rounded-lg hover:bg-[#1E40AF] transition-colors disabled:opacity-70">
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><CheckCircle className="w-4 h-4" /> Finalise Assessment</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
