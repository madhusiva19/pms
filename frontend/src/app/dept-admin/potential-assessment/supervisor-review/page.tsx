'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Breadcrumb from '@/components/breadcrumb/Breadcrumb';
import LoadingSpinner from '@/components/LoadingSpinner';
import { appraisalCyclesApi, potentialAssessmentApi } from '@/services/potentialAssessmentApi';
import { User, ChevronRight } from 'lucide-react';
import type { SubordinateAssessmentSummary } from '@/types';
import { statusBadge } from '@/lib/assessmentStatusBadge';

export default function DeptAdminTeamReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [subordinates, setSubordinates] = useState<SubordinateAssessmentSummary[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'dept_admin')) router.push('/');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (authLoading || !user) return;
    appraisalCyclesApi.getActive()
      .then(async (activeCycle) => {
        const subs = await potentialAssessmentApi.getSubordinates(user.id, String(activeCycle.pms_year), user.role);
        setSubordinates(subs);
      })
      .finally(() => setTeamLoading(false));
  }, [user, authLoading]);

  if (authLoading) return <LoadingSpinner />;
  if (!user || user.role !== 'dept_admin') return null;

  return (
    <div className="flex flex-col gap-10 max-w-[1225px] mx-auto w-full">
      <Breadcrumb items={[
        { label: 'Home', href: '/dept-admin/dashboard' },
        { label: 'Potential Assessment' },
        { label: 'Team Review' },
      ]} />

      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold text-[#101828] leading-9">Team Review</h1>
      </div>

      <section className="flex flex-col gap-4">
        <div className="pb-3 border-b border-[#E5E7EB]">
          <h2 className="text-[18px] font-semibold text-[#101828]">Sub Department Admin Assessments</h2>
          <p className="text-[13.5px] text-[#64748B]">Review potential assessments for Sub Dept Admins under your department.</p>
        </div>
        {teamLoading ? <div className="text-[#94A3B8] text-[14px] py-4">Loading team dataâ€¦</div> : (() => {
          const reconSubs = subordinates.filter(s => s.assessment_status === 'reconsideration_requested');
          return (
            <>
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
                    {subordinates.length === 0 && <tr><td colSpan={4} className="px-5 py-12 text-center text-[#94A3B8] text-[14px]">No Sub Dept Admins found under your department.</td></tr>}
                    {subordinates.map((sub) => {
                      const badge = statusBadge[sub.assessment_status] ?? statusBadge.not_started;
                      const canReview = sub.assessment_status !== 'not_started' && sub.assessment_status !== 'pending_self';
                      return (
                        <tr key={sub.id} className="border-b border-[#F1F5F9] hover:bg-[#FAFAFA] transition-colors">
                          <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#DBEAFE] flex items-center justify-center"><User className="w-4 h-4 text-[#1D4ED8]" /></div><span className="text-[13.5px] font-medium text-[#101828]">{sub.full_name}</span></div></td>
                          <td className="px-5 py-4 text-[13.5px] text-[#4A5565]">{sub.emp_id ?? sub.id.slice(0, 8)}</td>
                          <td className="px-5 py-4"><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border ${badge.cls}`}>{badge.label}</span></td>
                          <td className="px-5 py-4">
                            <button type="button" disabled={!canReview} onClick={() => router.push(`/dept-admin/potential-assessment/${sub.id}`)}
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

              {reconSubs.length > 0 && (
                <div className="flex flex-col gap-3 mt-2">
                  <div className="pb-3 border-b border-[#E5E7EB]">
                    <h2 className="text-[16px] font-semibold text-[#101828]">Pending Reconsideration Requests</h2>
                    <p className="text-[13px] text-[#64748B]">These sub dept admins have requested a reconsideration of their assessment result.</p>
                  </div>
                  <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-[#E5E7EB]">
                          <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Name</th>
                          <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Employee ID</th>
                          <th className="text-left px-5 py-3.5 text-[12px] font-semibold text-[#64748B] uppercase tracking-wide">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reconSubs.map((sub) => (
                          <tr key={sub.id} className="border-b border-[#F1F5F9] hover:bg-[#FAFAFA] transition-colors">
                            <td className="px-5 py-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-[#DBEAFE] flex items-center justify-center"><User className="w-4 h-4 text-[#1D4ED8]" /></div><span className="text-[13.5px] font-medium text-[#101828]">{sub.full_name}</span></div></td>
                            <td className="px-5 py-4 text-[13.5px] text-[#4A5565]">{sub.emp_id ?? sub.id.slice(0, 8)}</td>
                            <td className="px-5 py-4">
                              <button type="button"
                                onClick={() => router.push(`/dept-admin/potential-assessment/reconsideration/${sub.assessment_id}`)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#1E3A8A] text-white hover:bg-[#1E40AF] transition-colors">
                                Review Request
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </section>
    </div>
  );
}
