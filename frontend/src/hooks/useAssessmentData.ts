'use client';

/**
 * useAssessmentData — shared hook for loading cycle + assessment for the current user.
 */

import { useState, useEffect } from 'react';
import { appraisalCyclesApi, potentialAssessmentApi } from '@/services/potentialAssessmentApi';
import type { AppraisalCycle, PotentialAssessment, AssessmentStatus } from '@/types';

interface UseAssessmentDataResult {
  cycle: AppraisalCycle | null;
  assessment: (PotentialAssessment & { items: any[] }) | null;
  status: AssessmentStatus;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAssessmentData(
  employeeId: string | undefined,
  requesterId: string | undefined
): UseAssessmentDataResult {
  const [cycle, setCycle] = useState<AppraisalCycle | null>(null);
  const [assessment, setAssessment] = useState<(PotentialAssessment & { items: any[] }) | null>(null);
  const [status, setStatus] = useState<AssessmentStatus>('not_started');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!employeeId || !requesterId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    appraisalCyclesApi.getActive()
      .then(async (activeCycle) => {
        if (cancelled) return;
        setCycle(activeCycle);
        const data = await potentialAssessmentApi.getForEmployee(employeeId, String(activeCycle.cycle_year), requesterId);
        if (cancelled) return;
        if (data.status === 'not_started' || !('id' in data)) {
          setAssessment(null);
          setStatus('not_started');
        } else {
          setAssessment(data as any);
          setStatus((data as any).status as AssessmentStatus);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.error ?? 'Failed to load assessment data.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [employeeId, requesterId, tick]);

  return { cycle, assessment, status, loading, error, reload: () => setTick((t) => t + 1) };
}
// Shared hook: fetches active cycle + assessment
