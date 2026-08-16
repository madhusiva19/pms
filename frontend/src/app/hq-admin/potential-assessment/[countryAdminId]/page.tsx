'use client';

/**
 * HQ Admin — Potential Assessment review detail page for a Country Admin
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import LoadingScreen from '@/components/LoadingScreen';
import SupervisorReviewForm from '@/components/potential-assessment/SupervisorReviewForm';
import CompletedSummary from '@/components/potential-assessment/CompletedSummary';
import { appraisalCyclesApi, potentialAssessmentApi } from '@/services/potentialAssessmentApi';
import { statusBadge } from '@/lib/assessmentStatusBadge';
import { ChevronLeft, User } from 'lucide-react';
import type { AppraisalCycle, AssessmentStatus, PotentialAssessment } from '@/types';

export default function HQAdminReviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const countryAdminId = params?.countryAdminId as string;

  const [cycle, setCycle] = useState<AppraisalCycle | null>(null);
  const [appraisee, setAppraisee] = useState<{ full_name: string; emp_id?: string } | null>(null);
  const [assessment, setAssessment] = useState<PotentialAssessment & { items: any[] } | null>(null);
  const [status, setStatus] = useState<AssessmentStatus>('not_started');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'hq_admin')) router.push('/');
  }, [user, authLoading, router]);

  const loadData = async (activeCycle: AppraisalCycle) => {
    const [data, subs] = await Promise.all([
      potentialAssessmentApi.getForEmployee(countryAdminId, String(activeCycle.pms_year), user!.id),
      potentialAssessmentApi.getSubordinates(user!.id, String(activeCycle.pms_year), user!.role),
    ]);
    if ('id' in data) { setAssessment(data as any); setStatus((data as any).status); }
    const found = subs.find((s) => s.id === countryAdminId);
    if (found) setAppraisee(found);
  };

  useEffect(() => {
    if (authLoading || !user || !countryAdminId) return;
    setLoading(true);
    appraisalCyclesApi.getActive()
      .then(async (activeCycle) => { setCycle(activeCycle); await loadData(activeCycle); })
      .catch((err) => setError(err?.response?.data?.error ?? 'Failed to load assessment.'))
      .finally(() => setLoading(false));
  }, [user, authLoading, countryAdminId]);

  if (authLoading || loading) return <LoadingScreen />;
  if (!user || user.role !== 'hq_admin') return null;

  const badge = statusBadge[status] ?? statusBadge.not_started;

  return (
    <div className="flex flex-col gap-8 max-w-[1225px] mx-auto w-full px-8 py-6 pb-10">
      <div className="flex flex-col gap-1">
        {cycle && <p className="text-[15px] text-[#4A5565]">Cycle: <strong>{cycle.pms_year}</strong></p>}
      </div>

      {/* Appraisee banner */}
      <div className="w-full rounded-xl border border-[#BEDBFF] px-4 py-3 flex items-center justify-between"
        style={{ background: 'linear-gradient(90deg, #EFF6FF 0%, #F3F4F6 100%)' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-[#1D4ED8]" />
          </div>
          <div className="flex flex-col">
            <span className="text-[12.7px] text-[#4A5565]">Selected Country Admin</span>
            <span className="text-[18px] font-semibold text-[#101828] leading-7">{appraisee?.full_name ?? '—'}</span>
            {appraisee?.emp_id && <span className="text-[12px] text-[#64748B]">ID: {appraisee.emp_id}</span>}
          </div>
          <span className={`ml-4 inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium border ${badge.cls}`}>{badge.label}</span>
        </div>
        <button onClick={() => router.push('/hq-admin/potential-assessment')}
          className="flex items-center gap-2 px-3 py-[7px] bg-[#F9FAFB] border border-[#E5E7EB] rounded-md text-[13px] font-medium text-[#1E293B] hover:bg-gray-100 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-[13.5px] text-red-600">{error}</div>}

      {status === 'not_started' || status === 'pending_self' ? (
        <div className="bg-[#FEF9C3] border border-[#FDE68A] rounded-xl px-5 py-4 text-[13.5px] text-[#92400E]">
          This Country Admin has not yet submitted their self-assessment. Review will be available once they submit.
        </div>
      ) : status === 'completed' && assessment ? (
        <CompletedSummary assessmentData={assessment} />
      ) : assessment ? (
        <SupervisorReviewForm
          assessmentId={assessment.id}
          supervisorId={user.id}
          supervisorRole="hq_admin"
          currentStatus={status}
          assessmentData={assessment}
          onSubmitSuccess={() => { if (cycle) loadData(cycle); }}
        />
      ) : (
        <div className="text-[#94A3B8] text-[14px]">No assessment data available.</div>
      )}
    </div>
  );
}
