// Central API client used by React pages to talk to the Flask backend.
// Keeping endpoint calls here makes page components easier to read and maintain.
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type {
  Approval,
  EnquiryPayload,
  EntityId,
  EvaluationStatus,
  MemberEvaluationData,
  NotificationItem,
  PerformanceRecord,
  QueryParams,
  TeamMember,
  TeamMemberStatus,
} from '../types';
import { updateStoredTeamMemberStatus } from './currentMember';

// Backend URL can be overridden with NEXT_PUBLIC_API_BASE_URL in frontend/.env.local.
// Normalise so the baseURL always ends with /api regardless of whether the env
// var was set with or without the /api suffix.
const _rawBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:5000';
const API_BASE_URL = _rawBase.endsWith('/api') ? _rawBase : `${_rawBase}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 404) {
      const url = error?.config?.url || '(unknown)';
      console.warn(`[API 404] ${error?.config?.method?.toUpperCase() ?? 'GET'} ${url}`);
    }
    return Promise.reject(error);
  }
);

// In-memory GET cache — 30-second TTL so re-visiting pages skips the round-trip to Flask.
const memCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000;

async function cachedGet<T>(url: string, params?: QueryParams): Promise<AxiosResponse<T>> {
  const key = url + (params ? JSON.stringify(params) : '');
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return { data: hit.data as T, status: 200, statusText: 'OK', headers: {}, config: {} as never } as AxiosResponse<T>;
  }
  const res = await api.get<T>(url, { params });
  memCache.set(key, { data: res.data, ts: Date.now() });
  return res;
}

// Removes all cached entries whose key starts with a given prefix (use after mutations).
export function invalidateCache(prefix: string) {
  for (const key of memCache.keys()) {
    if (key.startsWith(prefix)) memCache.delete(key);
  }
}

// Fetch all team members shown in My Team and Members pages.
// Pass { manager_id } to scope results to that admin's direct reports.
export const getTeamMembers = (params?: QueryParams): Promise<AxiosResponse<TeamMember[]>> => cachedGet('/team-members', params);
// Fetch one team member for the evaluation page.
export const getTeamMember = (id: EntityId): Promise<AxiosResponse<TeamMember>> => cachedGet(`/team-members/${id}`);
// Update a member evaluation status when workflow actions require it.
export const optimisticallyUpdateTeamMemberStatus = (id: EntityId, status: TeamMemberStatus) => {
  // Update every cached team list optimistically. This makes status chips and
  // counters correct immediately when the user navigates away from Evaluate.
  for (const [key, entry] of memCache.entries()) {
    if (!key.startsWith('/team-members') || !Array.isArray(entry.data)) continue;
    memCache.set(key, {
      ts: Date.now(),
      data: entry.data.map((member: TeamMember) =>
        String(member.id) === String(id) ? { ...member, status } : member
      ),
    });
  }
  updateStoredTeamMemberStatus(id, status);
};

export const updateTeamMemberStatus = (id: EntityId, status: TeamMemberStatus) => {
  optimisticallyUpdateTeamMemberStatus(id, status);
  return api.put(`/team-members/${id}/status`, { status });
};

// Fetch all approval requests for the approvals table.
// Pass { manager_id } to scope results to that admin's direct reports.
export const getApprovals = (params?: QueryParams): Promise<AxiosResponse<Approval[]>> => cachedGet('/approvals', params);
// Fetch one approval request for the approval detail page.
export const getApproval = (id: EntityId): Promise<AxiosResponse<Approval>> => cachedGet(`/approvals/${id}`);
// Update approval status, comments, or other workflow fields.
export const updateApproval = (id: EntityId, data: Record<string, unknown>) => {
  invalidateCache('/approvals');
  return api.put(`/approvals/${id}`, data);
};

// Fetch notifications for the notification center.
export const getNotifications = (): Promise<AxiosResponse<NotificationItem[]>> => cachedGet('/evaluation-notifications');
// Persist a notification's read state.
export const markNotificationRead = (id: EntityId) => {
  invalidateCache('/evaluation-notifications');
  return api.put(`/evaluation-notifications/${id}/read`);
};

// Fetch evaluation progress stages for the status tracking timeline.
export const getEvaluationStatus = (id: EntityId): Promise<AxiosResponse<EvaluationStatus>> =>
  cachedGet(`/evaluation-status/${id}`);

// Fetch metric/objective rows used by evaluation and approval tables.
export const getPerformanceRecords = (params: QueryParams = {}): Promise<AxiosResponse<PerformanceRecord[]>> =>
  cachedGet('/performance-records', params);

// Fetch objectives grouped by category, merged with member-specific actuals/
// ratings from performance_records, plus the overall score from
// performance_summaries. Pass user_id (UUID) and/or team_member_id (numeric).
export const getObjectives = (params: QueryParams = {}): Promise<AxiosResponse<MemberEvaluationData>> =>
  cachedGet('/objectives', params);
// Fetch aggregated performance summary data when a page needs dashboard totals.
export const getPerformanceSummary = () => cachedGet('/performance-summary');

// Fetch all saved evaluations.
export const getEvaluations = () => cachedGet('/evaluations');
// Fetch one saved evaluation.
export const getEvaluation = (id: EntityId) => cachedGet(`/evaluations/${id}`);
// Submit a new evaluation from the evaluate member page.
export const submitEvaluation = (data: Record<string, unknown>) => {
  invalidateCache('/evaluations');
  invalidateCache('/approvals');
  return api.post('/evaluations', data);
};

// Reject an evaluation with reviewer comments.
export const rejectEvaluation = (id: EntityId, comments: string) => {
  invalidateCache('/evaluations');
  return api.post(`/evaluations/${id}/reject`, { comments });
};

// Submit an employee enquiry/re-evaluation request to the evaluator's superior.
export const submitEnquiry = (data: EnquiryPayload) => api.post('/enquiries', data);

export default api;
