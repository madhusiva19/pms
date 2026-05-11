'use client';

/**
 * CompletedSummary — Reusable read-only completed assessment view.
 * Shown to both appraisee and supervisor once status = 'completed'.
 */

import React, { useState, useEffect } from 'react';
import { ASSESSMENT_PILLARS, PILLAR_KEYS, type PillarKey, type PillarDefinition } from '@/utils/assessmentContent';
import { buildPillars, calcOverallPotentiality } from '@/utils/assessmentUtils';
import type { PotentialAssessment, PotentialAssessmentItem, RatingValue } from '@/types';
import { assessmentComponentsApi } from '@/services/potentialAssessmentApi';

interface CompletedSummaryProps {
  assessmentData: PotentialAssessment;
  /** Pass 'appraisee' to hide supervisor columns (only self-assessment + talent block visible) */
  viewerRole?: 'appraisee' | 'supervisor';
}

const ratingBadge: Record<RatingValue, string> = {
  H: 'bg-[#DCFCE7] text-[#16A34A] border-[#86EFAC]',
  M: 'bg-[#FEF9C3] text-[#CA8A04] border-[#FDE047]',
  L: 'bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5]',
};

const ratingLabel: Record<RatingValue, string> = {
  H: 'High',
  M: 'Medium',
  L: 'Low',
};

const ratingProgress: Record<RatingValue, number> = {
  H: 100,
  M: 66,
  L: 33,
};

const potentialityConfig: Record<RatingValue, { label: string; bg: string; text: string; border: string }> = {
  H: { label: 'High', bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  M: { label: 'Medium', bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  L: { label: 'Low', bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
};

function RatingBadge({ value }: { value: RatingValue | null }) {
  if (!value) return <span className="text-[#94A3B8] text-[13px]">—</span>;
  return (
    <div className="w-8 h-8 rounded-full bg-[#EFF6FF] border-2 border-[#BFDBFE] flex items-center justify-center text-[13px] font-bold text-[#2563EB] flex-shrink-0">
      {value}
    </div>
  );
}

function PillarCard({ label, value }: { label: string; value: RatingValue | null }) {
  const progress = value ? ratingProgress[value] : 0;
  const fullLabel = value ? ratingLabel[value] : '—';
  return (
    <div className="border-2 border-[#BFDBFE] rounded-xl p-4 flex flex-col gap-3 bg-white hover:border-[#3B82F6] hover:shadow-md transition-all">
      <p className="inline-block text-[11px] font-semibold text-[#2563EB] uppercase tracking-widest bg-[#EFF6FF] px-2 py-0.5 rounded-md w-fit">{label}</p>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[#EFF6FF] border-2 border-[#BFDBFE] flex items-center justify-center text-[14px] font-bold text-[#2563EB] flex-shrink-0">
          {value ?? '—'}
        </div>
        <span className="text-[14px] font-semibold text-[#1E293B]">{fullLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-[5px] bg-[#E2E8F0] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#3B82F6] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[11px] text-[#94A3B8] font-medium tabular-nums">{value ? `${progress === 100 ? '3/3' : progress === 66 ? '2/3' : '1/3'}` : '—'}</span>
      </div>
    </div>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CompletedSummary({ assessmentData, viewerRole = 'supervisor' }: CompletedSummaryProps) {
  const [activeTab, setActiveTab] = useState<PillarKey>('ability');
  const [pillars, setPillars] = useState<PillarDefinition[]>(ASSESSMENT_PILLARS);

  useEffect(() => {
    if (!assessmentData.appraisee_role) return;
    assessmentComponentsApi.getForRole(assessmentData.appraisee_role)
      .then(comps => { if (comps.length > 0) setPillars(buildPillars(comps)); })
      .catch(() => { });
  }, [assessmentData.appraisee_role]);

  // Build lookup
  const itemLookup: Record<PillarKey, Record<number, PotentialAssessmentItem>> = {} as any;
  PILLAR_KEYS.forEach((p) => { itemLookup[p] = {}; });
  (assessmentData.items || []).forEach((item) => {
    itemLookup[item.pillar as PillarKey][item.component_number] = item;
  });

  const activePillar = pillars.find((p) => p.key === activeTab)!


  const op = calcOverallPotentiality(assessmentData.overall_ability, assessmentData.overall_aspiration, assessmentData.overall_leadership);
  const opConfig = op ? potentialityConfig[op] : null;

  const isAppraiseeView = viewerRole === 'appraisee';

  return (
    <div className="flex flex-col gap-6">

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[#F3F4F6] rounded-lg w-fit">
        {pillars.map((pillar) => (
          <button key={pillar.key} onClick={() => setActiveTab(pillar.key)}
            className={`px-4 py-2 rounded-md text-[13px] font-medium transition-all ${activeTab === pillar.key ? 'bg-[#1D4ED8] text-white shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}>
            {pillar.label}
          </button>
        ))}
      </div>

      {/* Full detail table */}
      <div className="rounded-xl border border-[#E2E8F0] overflow-hidden overflow-x-auto shadow-sm">
        <table className="w-full border-collapse min-w-[860px]">
          <thead>
            <tr style={{ background: 'linear-gradient(to right, #F8FAFF, #EFF6FF)' }}>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-widest border-b border-[#E2E8F0] w-10">#</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#64748B] uppercase tracking-widest border-b border-[#E2E8F0]">Component</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#2563EB] uppercase tracking-widest border-b border-[#E2E8F0] border-l border-l-[#BFDBFE] bg-[#EFF6FF]">Self Rating</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#2563EB] uppercase tracking-widest border-b border-[#E2E8F0] bg-[#EFF6FF]">Self Example</th>
              {!isAppraiseeView && (
                <>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#2563EB] uppercase tracking-widest border-b border-[#E2E8F0] border-l-2 border-l-[#BFDBFE] bg-[#EFF6FF]">Supervisor Rating</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-[#2563EB] uppercase tracking-widest border-b border-[#E2E8F0] bg-[#EFF6FF]">Supervisor Justification</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {activePillar.components.map((desc, idx) => {
              const c = (idx + 1) as 1 | 2 | 3;
              const item = itemLookup[activePillar.key][c];
              return (
                <tr key={c} className="border-b border-[#F1F5F9] hover:bg-[#FAFCFF] transition-colors group">
                  <td className="px-5 py-4 align-top">
                    <span className="w-6 h-6 rounded-full bg-[#F1F5F9] text-[12px] font-bold text-[#94A3B8] flex items-center justify-center">{c}</span>
                  </td>
                  <td className="px-5 py-4 align-top max-w-[220px]">
                    <p className="text-[13.5px] text-[#1E293B] leading-6 font-medium">{desc}</p>
                  </td>
                  <td className="px-5 py-4 bg-[#F8FBFF] group-hover:bg-[#EFF6FF] transition-colors align-top border-l border-l-[#DBEAFE]">
                    <RatingBadge value={item?.self_rating ?? null} />
                  </td>
                  <td className="px-5 py-4 bg-[#F8FBFF] group-hover:bg-[#EFF6FF] transition-colors align-top">
                    <p className="text-[13px] text-[#475569] leading-6 whitespace-pre-wrap max-w-[220px]">{item?.self_example || <span className="text-[#CBD5E1] italic">No example provided</span>}</p>
                  </td>
                  {!isAppraiseeView && (
                    <>
                      <td className="px-5 py-4 bg-[#F8FBFF] group-hover:bg-[#EFF6FF] transition-colors align-top border-l-2 border-l-[#BFDBFE]">
                        <RatingBadge value={item?.supervisor_rating ?? null} />
                      </td>
                      <td className="px-5 py-4 bg-[#F8FBFF] group-hover:bg-[#EFF6FF] transition-colors align-top">
                        <p className="text-[13px] text-[#475569] leading-6 whitespace-pre-wrap max-w-[220px]">{item?.supervisor_justification || <span className="text-[#CBD5E1] italic">No justification provided</span>}</p>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Overall Summary Card */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 flex flex-col gap-6">
        <h3 className="text-[15px] font-semibold text-[#101828]">Overall Summary</h3>

        {/* Pillar ratings */}
        <div>
          <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-widest mb-3">Pillar Ratings</p>
          <div className="grid grid-cols-3 gap-4">
            <PillarCard label="Average Ability" value={assessmentData.overall_ability as RatingValue | null} />
            <PillarCard label="Average Aspiration" value={assessmentData.overall_aspiration as RatingValue | null} />
            <PillarCard label="Average Leadership" value={assessmentData.overall_leadership as RatingValue | null} />
          </div>
        </div>

        {/* Overall Potentiality */}
        {opConfig && (
          <div className="rounded-xl border-2 p-5 flex items-center justify-between"
            style={{ borderColor: opConfig.border, backgroundColor: opConfig.bg + '33' }}>
            <div>
              <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide mb-1">Overall Potentiality</p>
              <p className="text-[28px] font-bold" style={{ color: opConfig.text }}>{opConfig.label}</p>
            </div>
            <div className="w-16 h-16 rounded-full border-4 flex items-center justify-center text-[28px] font-black"
              style={{ borderColor: opConfig.border, color: opConfig.text, backgroundColor: opConfig.bg }}>
              {op}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="flex flex-col gap-1 pt-2 border-t border-[#F1F5F9]">
          <p className="text-[12.5px] text-[#94A3B8]">
            Self-assessment submitted: <span className="text-[#64748B] font-medium">{formatDate(assessmentData.self_submitted_at)}</span>
          </p>
          <p className="text-[12.5px] text-[#94A3B8]">
            Supervisor review submitted: <span className="text-[#64748B] font-medium">{formatDate(assessmentData.supervisor_submitted_at)}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
