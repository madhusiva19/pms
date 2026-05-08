/**
 * Potential Assessment API Service
 * All calls go through the same Flask backend base URL.
 * This file is isolated — it does NOT modify any existing api.ts exports.
 */

import axios, { AxiosInstance } from 'axios';
import type {
  AppraisalCycle,
  PotentialAssessment,
  PotentialAssessmentItem,
  SubordinateAssessmentSummary,
  SelfSubmitPayload,
  SupervisorSubmitPayload,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const paClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

paClient.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('[PotentialAssessment API]', err.response?.data || err.message);
    return Promise.reject(err);
  }
);

// ── Active Cycle ──────────────────────────────────────────────────────────────

export const appraisalCyclesApi = {
  getActive: async (): Promise<AppraisalCycle> => {
    const res = await paClient.get('/appraisal-cycles/active');
    return res.data.data;
  },
};

// ── Self Assessment ───────────────────────────────────────────────────────────

export const potentialAssessmentApi = {
  /**
   * Get full assessment record + items for an employee in a given cycle.
   * Returns { status: 'not_started' } when no record exists yet.
   * Supervisor columns are stripped from the response unless status=completed
   * and the requester is the supervisor (enforced in Flask).
   */
  getForEmployee: async (
    employeeId: string,
    cycle: string,
    requesterId: string
  ): Promise<PotentialAssessment & { items: PotentialAssessmentItem[] }> => {
    const res = await paClient.get(
      `/potential-assessment/${employeeId}/${encodeURIComponent(cycle)}`,
      { params: { requester_id: requesterId } }
    );
    return res.data.data;
  },

  /**
   * Returns list of direct subordinates with their assessment status for cycle.
   * supervisor_role is required by the backend to resolve the correct scope.
   */
  getSubordinates: async (
    supervisorId: string,
    cycle: string,
    supervisorRole: string
  ): Promise<SubordinateAssessmentSummary[]> => {
    const res = await paClient.get(
      `/potential-assessment/subordinates/${supervisorId}/${encodeURIComponent(cycle)}`,
      { params: { supervisor_role: supervisorRole } }
    );
    return res.data.data;
  },

  /**
   * Appraisee submits their self-assessment.
   * Creates the assessment record if none exists.
   * Transitions status: pending_self → pending_supervisor.
   * Self columns are permanently locked after this call.
   */
  submitSelf: async (payload: SelfSubmitPayload): Promise<PotentialAssessment> => {
    const res = await paClient.post('/potential-assessment/self-submit', payload);
    return res.data.data;
  },

  /**
   * Supervisor submits their ratings.
   * Calculates pillar overall ratings + talent block.
   * Transitions status: pending_supervisor → completed.
   */
  submitSupervisor: async (payload: SupervisorSubmitPayload): Promise<PotentialAssessment> => {
    const res = await paClient.post('/potential-assessment/supervisor-submit', payload);
    return res.data.data;
  },
};
