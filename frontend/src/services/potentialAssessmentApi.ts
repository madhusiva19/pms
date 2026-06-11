/**
 * Potential Assessment API Service
 * All calls go through the same Flask backend base URL.
 * This file is isolated — it does NOT modify any existing api.ts exports.
 */

import { logger } from '@/utils/logger';
import axios, { AxiosInstance } from 'axios';
import type {
  AppraisalCycle,
  PotentialAssessment,
  PotentialAssessmentItem,
  PotentialAssessmentReconsideration,
  SubordinateAssessmentSummary,
  SelfSubmitPayload,
  SupervisorSubmitPayload,
  AssessmentComponent,
  AppraiseeRole,
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
    logger.error('Potential assessment API response error', err);
    return Promise.reject(err);
  }
);

// Active Cycle 
let _activeCycleCache: AppraisalCycle | null = null;

export const appraisalCyclesApi = {
  getActive: async (): Promise<AppraisalCycle> => {
    if (_activeCycleCache) return _activeCycleCache;
    const res = await paClient.get('/appraisal-cycles/active');
    _activeCycleCache = res.data.data;
    return _activeCycleCache!;
  },
  clearCache: () => { _activeCycleCache = null; },
};

//  Self Assessment

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

// Assessment Components (HQ Admin CRUD + per-role fetch) 

// Reconsideration

export const reconsiderationApi = {
  /** Employee submits a reconsideration request. employee_id is verified by the backend. */
  submit: async (assessmentId: string, comment: string, employeeId: string): Promise<PotentialAssessmentReconsideration> => {
    const res = await paClient.post(`/potential-assessment/${assessmentId}/reconsideration`, {
      reconsideration_comment: comment,
      employee_id: employeeId,
    });
    return res.data.data;
  },

  /** Senior supervisor approves or rejects, optionally overriding component scores. */
  review: async (
    assessmentId: string,
    action: 'approve' | 'reject',
    opts?: {
      rejectionNote?:  string;
      reviewerId?:     string;
      justification?:  string;
      overrideItems?:  { item_id: string; rating: string }[];
    },
  ): Promise<PotentialAssessmentReconsideration> => {
    const res = await paClient.put(`/potential-assessment/${assessmentId}/reconsideration/review`, {
      action,
      rejection_note: opts?.rejectionNote ?? '',
      reviewer_id:    opts?.reviewerId    ?? '',
      justification:  opts?.justification ?? '',
      override_items: opts?.overrideItems ?? [],
    });
    return res.data.data;
  },

  /**
   * Fetch the reconsideration record for an assessment, enriched with
   * employee_name, supervisor_name, appraisal_cycle, and assessment_status.
   * Returns 404 if no reconsideration exists yet.
   */
  getStatus: async (assessmentId: string): Promise<PotentialAssessmentReconsideration> => {
    const res = await paClient.get(`/potential-assessment/${assessmentId}/reconsideration`);
    return res.data.data;
  },
};

export const assessmentComponentsApi = {
  /** HQ Admin: all components (global + role-specific). */
  getAll: async (): Promise<AssessmentComponent[]> => {
    const res = await paClient.get('/assessment-components');
    return res.data.data;
  },

  /** Fetch merged effective components for a role (role-specific overrides global). */
  getForRole: async (role: AppraiseeRole | string): Promise<AssessmentComponent[]> => {
    const res = await paClient.get('/assessment-components/merged', { params: { role } });
    return res.data.data;
  },

  create: async (payload: Omit<AssessmentComponent, 'id' | 'created_at' | 'updated_at'>): Promise<AssessmentComponent> => {
    const res = await paClient.post('/assessment-components', payload);
    return res.data.data;
  },

  update: async (id: string, payload: Partial<Omit<AssessmentComponent, 'id' | 'created_at' | 'updated_at'>>): Promise<AssessmentComponent> => {
    const res = await paClient.put(`/assessment-components/${id}`, payload);
    return res.data.data;
  },

  delete: async (id: string): Promise<void> => {
    await paClient.delete(`/assessment-components/${id}`);
  },
};
