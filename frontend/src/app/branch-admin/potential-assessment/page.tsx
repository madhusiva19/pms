'use client';

/**
 * Branch Admin — Potential Assessment page
 * Section A: My Self-Assessment | Section B: Dept Admin team list
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/Breadcrumb';
import LoadingSpinner from '@/components/LoadingSpinner';
import SelfAssessmentForm from '@/components/potential-assessment/SelfAssessmentForm';
import CompletedSummary from '@/components/potential-assessment/CompletedSummary';
import { useAssessmentData } from '@/hooks/useAssessmentData';
import { appraisalCyclesApi, potentialAssessmentApi } from '@/services/potentialAssessmentApi';
import { User, ChevronRight } from 'lucide-react';
import type { AppraisalCycle, SubordinateAssessmentSummary, AssessmentStatus } from '@/types';

const statusBadge: Record<AssessmentStatus, { label: string; cls: string }> = {
  not_started:        { label: 'Not Started',   cls: 'bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]' },
  pending_self:       { label: 'Pending Self',   cls: 'bg-[#FEF9C3] text-[#92400E] border-[#FDE68A]' },
  pending_supervisor: { label: 'Pending Review', cls: 'bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]' },
  completed:          { label: 'Completed',      cls: 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]' },
};

export default function BranchAdminPotentialAssessmentPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { cycle, assessment, status, loading: selfLoading, error: selfError, reload } = useAssessmentData(user?.id, user?.id);
  const [subordinates, setSubordinates] = useState<SubordinateAssessmentSummary[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'branch_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    appraisalCyclesApi.getActive()
      .then(async (activeCycle) => {
        const subs = await potentialAssessmentApi.getSubordinates(user.id, activeCycle.name, user.role);
        setSubordinates(subs);
      })
      .finally(() => setTeamLoading(false));
  }, [user, authLoading]);

  if (authLoading || selfLoading) return <LoadingSpinner />;
  if (!user || user.role !== 'branch_admin') return null;

  return (
    <div className="flex flex-col gap-10 max-w-[1225px] mx-auto w-full">
      <Breadcrumb items={[{ label: 'Home', href: '/branch-admin/dashboard' }, { label: 'Potential Assessment' }]} />
      <div>
        <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Potential Assessment</h1>
        {cycle && <p className="text-[15px] text-[#4A5565]">Appraisal Cycle: <strong>{cycle.name}</strong></p>}
      </div>

      {/* Section A */}
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
          <SelfAssessmentForm employeeId={user.id} supervisorId={assessment?.supervisor_id ?? (user as any).manager_id ?? ''}
            role="branch_admin" cycle={cycle?.name ?? ''} currentStatus={status} assessmentData={assessment}
            onSubmitSuccess={() => reload()} />
        )}
      </section>

      {/* Section B */}
      <section className="flex flex-col gap-4">
        <div className="pb-3 border-b border-[#E5E7EB]">
          <h2 className="text-[18px] font-semibold text-[#101828]">Department Admin Assessments</h2>
          <p className="text-[13.5px] text-[#64748B]">Review potential assessments for Dept Admins under your branch.</p>
        </div>
        {teamLoading ? <div className="text-[#94A3B8] text-[14px] py-4">Loading team data…</div> : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
                  <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Employee ID</th>
                  <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Status</th>
                  <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {subordinates.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-[#94A3B8] text-[14px]">No Dept Admins found under your branch.</td></tr>}
                {subordinates.map((sub) => {
                  const badge = statusBadge[sub.assessment_status] ?? statusBadge.not_started;
                  const canReview = sub.assessment_status !== 'not_started' && sub.assessment_status !== 'pending_self';
                  return (
                    <tr key={sub.id} className="border-b border-[#F1F5F9] hover:bg-[#FAFAFA] transition-colors">
                      <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#DBEAFE] flex items-center justify-center"><User className="w-4 h-4 text-[#1D4ED8]" /></div><span className="text-[13.5px] font-medium text-[#101828]">{sub.full_name}</span></div></td>
                      <td className="px-5 py-4 text-[13.5px] text-[#4A5565]">{sub.emp_id ?? sub.id.slice(0,8)}</td>
                      <td className="px-5 py-4"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border ${badge.cls}`}>{badge.label}</span></td>
                      <td className="px-5 py-4">
                        <button disabled={!canReview} onClick={() => router.push(`/branch-admin/potential-assessment/${sub.id}`)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${canReview ? 'bg-[#1E3A8A] text-white hover:bg-[#1E40AF]' : 'bg-[#F1F5F9] text-[#94A3B8] cursor-not-allowed'}`}>
                          Review <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
