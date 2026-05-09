'use client';

/**
 * SelfAssessmentForm — Reusable component
 * Used by: Country Admin, Branch Admin, Dept Admin, Sub Dept Admin, Employee
 * 
 * Props:
 *   employeeId     — UUID of the appraisee
 *   supervisorId   — UUID of the assigned supervisor (resolved by caller)
 *   role           — appraisee's role string
 *   cycle          — active appraisal cycle name e.g. "2024-25"
 *   currentStatus  — assessment status from parent (after API fetch)
 *   assessmentData — full assessment record if it exists
 *   onSubmitSuccess — callback after successful self-submission
 */

import React, { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { ASSESSMENT_PILLARS, PILLAR_KEYS, type PillarKey, type PillarDefinition } from '@/utils/assessmentContent';
import { potentialAssessmentApi, assessmentComponentsApi } from '@/services/potentialAssessmentApi';
import type { AssessmentComponent } from '@/types';
import type {
  AssessmentStatus,
  PotentialAssessment,
  PotentialAssessmentItem,
  RatingValue,
  SelfSubmitItemPayload,
  AppraiseeRole,
} from '@/types';

interface SelfAssessmentFormProps {
  employeeId: string;
  supervisorId: string;
  role: AppraiseeRole;
  cycle: string;
  currentStatus: AssessmentStatus;
  assessmentData: PotentialAssessment | null;
  onSubmitSuccess: (updated: PotentialAssessment) => void;
}

type RatingMap = Record<PillarKey, Record<number, RatingValue | ''>>;
type ExampleMap = Record<PillarKey, Record<number, string>>;

function buildPillars(dbComponents: AssessmentComponent[]): PillarDefinition[] {
  return ASSESSMENT_PILLARS.map(pillar => ({
    ...pillar,
    components: ([1, 2, 3] as const).map(num => {
      const found = dbComponents.find(c => c.pillar === pillar.key && c.component_number === num);
      return found ? found.description : pillar.components[num - 1];
    }),
  }));
}

const RATING_OPTIONS: RatingValue[] = ['H', 'M', 'L'];

const ratingBadgeStyles: Record<RatingValue, string> = {
  H: 'bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC]',
  M: 'bg-[#FEF9C3] text-[#CA8A04] border-[#FDE047]',
  L: 'bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5]',
};

function buildInitialRatings(): RatingMap {
  const map = {} as RatingMap;
  PILLAR_KEYS.forEach((p) => {
    map[p] = { 1: '', 2: '', 3: '' };
  });
  return map;
}

function buildInitialExamples(): ExampleMap {
  const map = {} as ExampleMap;
  PILLAR_KEYS.forEach((p) => {
    map[p] = { 1: '', 2: '', 3: '' };
  });
  return map;
}

export default function SelfAssessmentForm({
  employeeId,
  supervisorId,
  role,
  cycle,
  currentStatus,
  assessmentData,
  onSubmitSuccess,
}: SelfAssessmentFormProps) {
  const [pillars, setPillars]     = useState<PillarDefinition[]>(ASSESSMENT_PILLARS);
  const [activeTab, setActiveTab] = useState<PillarKey>('ability');
  const [ratings, setRatings]     = useState<RatingMap>(buildInitialRatings());
  const [examples, setExamples]   = useState<ExampleMap>(buildInitialExamples());
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    assessmentComponentsApi.getForRole(role)
      .then(comps => { if (comps.length > 0) setPillars(buildPillars(comps)); })
      .catch(() => {});
  }, [role]);

  // Pre-fill from existing data
  useEffect(() => {
    if (!assessmentData?.items?.length) return;
    const newRatings = buildInitialRatings();
    const newExamples = buildInitialExamples();
    assessmentData.items.forEach((item: PotentialAssessmentItem) => {
      const p = item.pillar as PillarKey;
      const c = item.component_number as 1 | 2 | 3;
      newRatings[p][c] = item.self_rating ?? '';
      newExamples[p][c] = item.self_example ?? '';
    });
    setRatings(newRatings);
    setExamples(newExamples);
  }, [assessmentData]);

  const isReadOnly = currentStatus !== 'not_started' && currentStatus !== 'pending_self';

  const allFilled = PILLAR_KEYS.every((p) =>
    [1, 2, 3].every((c) => ratings[p][c] !== '')
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const items: SelfSubmitItemPayload[] = [];
      PILLAR_KEYS.forEach((p) => {
        [1, 2, 3].forEach((c) => {
          items.push({
            pillar: p,
            component_number: c as 1 | 2 | 3,
            self_rating: ratings[p][c] as RatingValue,
            self_example: examples[p][c],
          });
        });
      });
      const result = await potentialAssessmentApi.submitSelf({
        employee_id: employeeId,
        supervisor_id: supervisorId,
        appraisee_role: role,
        cycle,
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

      {/* Instruction banner */}
      {!isReadOnly && (
        <div className="bg-[#EFF6FF] border border-[#BEDBFF] rounded-xl px-5 py-4">
          <p className="text-[13.5px] text-[#1E40AF] leading-6">
            The Potential Assessment is measured on <strong>Ability + Aspiration + Leadership</strong>.
            Rate yourself on each component as <strong>High (H)</strong>, <strong>Medium (M)</strong>,
            or <strong>Low (L)</strong>. You may also provide an incident or example to support your rating (optional).
          </p>
        </div>
      )}

      {/* Awaiting supervisor banner */}
      {currentStatus === 'pending_supervisor' && (
        <div className="flex items-center gap-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl px-5 py-3">
          <AlertCircle className="w-4 h-4 text-[#D97706] flex-shrink-0" />
          <span className="text-[13.5px] text-[#92400E] font-medium">
            Your self-assessment has been submitted. Awaiting supervisor review.
          </span>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[#F3F4F6] rounded-lg w-fit">
        {pillars.map((pillar) => {
          const filled = [1, 2, 3].filter((c) => ratings[pillar.key][c] !== '').length;
          return (
            <button
              key={pillar.key}
              onClick={() => setActiveTab(pillar.key)}
              className={`px-4 py-2 rounded-md text-[13px] font-medium transition-all ${
                activeTab === pillar.key
                  ? 'bg-white text-[#1E3A8A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#1E293B]'
              }`}
            >
              {pillar.label}
              {!isReadOnly && (
                <span className={`ml-2 text-[11px] ${filled === 3 ? 'text-[#16A34A]' : 'text-[#94A3B8]'}`}>
                  {filled}/3
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Assessment table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-8">#</th>
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Component</th>
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-44">Your Rating (H/M/L)</th>
              <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Incident / Example</th>
            </tr>
          </thead>
          <tbody>
            {activePillar.components.map((desc, idx) => {
              const c = (idx + 1) as 1 | 2 | 3;
              const rating = ratings[activePillar.key][c] as RatingValue | '';
              const example = examples[activePillar.key][c];
              return (
                <tr key={c} className={`border-b border-[#F1F5F9] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}`}>
                  <td className="px-5 py-4 text-[13px] text-[#94A3B8] font-medium align-top">{c}</td>
                  <td className="px-5 py-4 text-[13.5px] text-[#1E293B] leading-6 max-w-xs align-top">{desc}</td>
                  <td className="px-5 py-4 align-top">
                    {isReadOnly ? (
                      rating ? (
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-[13px] font-semibold border ${ratingBadgeStyles[rating as RatingValue]}`}>
                          {rating}
                        </span>
                      ) : (
                        <span className="text-[#94A3B8] text-[13px]">—</span>
                      )
                    ) : (
                      <div className="flex gap-1">
                        {RATING_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            onClick={() => setRatings((prev) => ({
                              ...prev,
                              [activePillar.key]: { ...prev[activePillar.key], [c]: opt },
                            }))}
                            className={`w-9 h-9 rounded-lg text-[13px] font-semibold border transition-all ${
                              rating === opt
                                ? ratingBadgeStyles[opt] + ' border-2'
                                : 'bg-white text-[#64748B] border-[#E5E7EB] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top">
                    {isReadOnly ? (
                      <p className="text-[13.5px] text-[#374151] leading-6 whitespace-pre-wrap">
                        {example || <span className="text-[#94A3B8]">—</span>}
                      </p>
                    ) : (
                      <textarea
                        value={example}
                        onChange={(e) => setExamples((prev) => ({
                          ...prev,
                          [activePillar.key]: { ...prev[activePillar.key], [c]: e.target.value },
                        }))}
                        placeholder="Describe a specific incident or example…"
                        rows={3}
                        className="w-full resize-none border border-[#E5E7EB] rounded-lg px-3 py-2.5 text-[13.5px] text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#3B82F6] focus:border-transparent transition-all"
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tab navigation helpers */}
      {!isReadOnly && (
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {activeTab !== 'ability' && (
              <button
                onClick={() => {
                  const idx = PILLAR_KEYS.indexOf(activeTab);
                  setActiveTab(PILLAR_KEYS[idx - 1]);
                }}
                className="flex items-center gap-1 px-3 py-2 text-[13px] text-[#64748B] border border-[#E5E7EB] rounded-lg hover:bg-[#F8FAFC] transition-colors"
              >
                ← Previous
              </button>
            )}
            {activeTab !== 'leadership' && (
              <button
                onClick={() => {
                  const idx = PILLAR_KEYS.indexOf(activeTab);
                  setActiveTab(PILLAR_KEYS[idx + 1]);
                }}
                className="flex items-center gap-1 px-3 py-2 text-[13px] text-[#3B82F6] border border-[#BEDBFF] rounded-lg hover:bg-[#EFF6FF] transition-colors"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            disabled={!allFilled}
            onClick={() => setShowModal(true)}
            className={`px-6 py-2.5 rounded-lg text-[13.5px] font-semibold text-white transition-all ${
              allFilled
                ? 'bg-[#1E3A8A] hover:bg-[#1E40AF] active:scale-[0.98]'
                : 'bg-[#CBD5E1] cursor-not-allowed'
            }`}
          >
            Submit Self-Assessment
          </button>
        </div>
      )}

      {!allFilled && !isReadOnly && (
        <p className="text-[12.5px] text-[#94A3B8]">
          All 9 components must have a rating selected before you can submit.
        </p>
      )}

      {/* Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#FEF9C3] flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-[#CA8A04]" />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold text-[#101828]">Confirm Submission</h2>
                <p className="text-[13.5px] text-[#64748B] mt-1 leading-6">
                  Once submitted, your self-assessment cannot be edited. Are you sure you want to continue?
                </p>
              </div>
            </div>
            {submitError && (
              <div className="bg-[#FEE2E2] border border-[#FCA5A5] rounded-lg px-4 py-3 text-[13px] text-[#DC2626]">
                {submitError}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                disabled={submitting}
                onClick={() => { setShowModal(false); setSubmitError(null); }}
                className="px-4 py-2 text-[13.5px] font-medium text-[#374151] border border-[#E5E7EB] rounded-lg hover:bg-[#F8FAFC] transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={submitting}
                onClick={handleSubmit}
                className="flex items-center gap-2 px-4 py-2 bg-[#1E3A8A] text-white text-[13.5px] font-semibold rounded-lg hover:bg-[#1E40AF] transition-colors disabled:opacity-70"
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <>
                  <CheckCircle className="w-4 h-4" /> Yes, Submit
                </>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
