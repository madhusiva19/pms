'use client';

/**
 * CompletedSummary — Reusable read-only completed assessment view.
 * Shown to both appraisee and supervisor once status = 'completed'.
 */

import React, { useState } from 'react';
import { ASSESSMENT_PILLARS, PILLAR_KEYS, type PillarKey } from '@/utils/assessmentContent';
import type { PotentialAssessment, PotentialAssessmentItem, RatingValue } from '@/types';

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

const potentialityConfig: Record<RatingValue, { label: string; bg: string; text: string; border: string }> = {
  H: { label: 'High',   bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  M: { label: 'Medium', bg: '#DBEAFE', text: '#1D4ED8', border: '#93C5FD' },
  L: { label: 'Low',    bg: '#FEF9C3', text: '#B45309', border: '#FDE047' },
};

function RatingPill({ value }: { value: RatingValue | null }) {
  if (!value) return <span className="text-[#94A3B8] text-[13px]">—</span>;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-[13px] font-semibold border ${ratingBadge[value]}`}>
      {value}
    </span>
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

  // Build lookup
  const itemLookup: Record<PillarKey, Record<number, PotentialAssessmentItem>> = {} as any;
  PILLAR_KEYS.forEach((p) => { itemLookup[p] = {}; });
  (assessmentData.items || []).forEach((item) => {
    itemLookup[item.pillar as PillarKey][item.component_number] = item;
  });

  const activePillar = ASSESSMENT_PILLARS.find((p) => p.key === activeTab)!;
  const op = assessmentData.talent_block;
  const opConfig = op ? potentialityConfig[op] : null;

  const isAppraiseeView = viewerRole === 'appraisee';

  return (
    <div className="flex flex-col gap-6">

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 bg-[#F3F4F6] rounded-lg w-fit">
        {ASSESSMENT_PILLARS.map((pillar) => (
          <button key={pillar.key} onClick={() => setActiveTab(pillar.key)}
            className={`px-4 py-2 rounded-md text-[13px] font-medium transition-all ${activeTab === pillar.key ? 'bg-white text-[#1E3A8A] shadow-sm' : 'text-[#64748B] hover:text-[#1E293B]'}`}>
            {pillar.label}
          </button>
        ))}
      </div>

      {/* Full detail table */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-7">#</th>
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Component</th>
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-28 bg-[#F0F4FF]">Self Rating</th>
              <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide bg-[#F0F4FF]">Self Example</th>
              {!isAppraiseeView && (
                <>
                  <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide w-32">Supervisor Rating</th>
                  <th className="text-left px-4 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Supervisor Justification</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {activePillar.components.map((desc, idx) => {
              const c = (idx + 1) as 1 | 2 | 3;
              const item = itemLookup[activePillar.key][c];
              return (
                <tr key={c} className={`border-b border-[#F1F5F9] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}`}>
                  <td className="px-4 py-4 text-[13px] text-[#94A3B8] font-medium align-top">{c}</td>
                  <td className="px-4 py-4 text-[13.5px] text-[#1E293B] leading-6 align-top max-w-[180px]">{desc}</td>
                  <td className="px-4 py-4 bg-[#F5F8FF] align-top"><RatingPill value={item?.self_rating ?? null} /></td>
                  <td className="px-4 py-4 bg-[#F5F8FF] align-top">
                    <p className="text-[13.5px] text-[#374151] leading-6 whitespace-pre-wrap max-w-[220px]">{item?.self_example || '—'}</p>
                  </td>
                  {!isAppraiseeView && (
                    <>
                      <td className="px-4 py-4 align-top"><RatingPill value={item?.supervisor_rating ?? null} /></td>
                      <td className="px-4 py-4 align-top">
                        <p className="text-[13.5px] text-[#374151] leading-6 whitespace-pre-wrap max-w-[220px]">{item?.supervisor_justification || '—'}</p>
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
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Overall Ability', value: assessmentData.overall_ability },
            { label: 'Overall Aspiration', value: assessmentData.overall_aspiration },
            { label: 'Overall Leadership', value: assessmentData.overall_leadership },
          ].map(({ label, value }) => (
            <div key={label} className="border border-[#E5E7EB] rounded-xl p-4 flex flex-col gap-2 bg-[#FAFAFA]">
              <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">{label}</p>
              <RatingPill value={value as RatingValue | null} />
            </div>
          ))}
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
