// Central API client used by React pages to talk to the Flask backend.
// Keeping endpoint calls here makes page components easier to read and maintain.
import axios from 'axios';
import type { AxiosResponse } from 'axios';
import type {
  Approval,
  EnquiryPayload,
  EntityId,
  EvaluationStatus,
  NotificationItem,
  PerformanceRecord,
  QueryParams,
  TeamMember,
  TeamMemberStatus,
} from '../types';

// Backend URL can be overridden with NEXT_PUBLIC_API_BASE_URL in frontend/.env.local.
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://127.0.0.1:8000/api';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Fetch all team members shown in My Team and Members pages.
export const getTeamMembers = (): Promise<AxiosResponse<TeamMember[]>> => api.get('/team-members');
// Fetch one team member for the evaluation page.
export const getTeamMember = (id: EntityId): Promise<AxiosResponse<TeamMember>> => api.get(`/team-members/${id}`);
// Update a member evaluation status when workflow actions require it.
export const updateTeamMemberStatus = (id: EntityId, status: TeamMemberStatus) =>
  api.put(`/team-members/${id}/status`, { status });

// Fetch all approval requests for the approvals table.
export const getApprovals = (): Promise<AxiosResponse<Approval[]>> => api.get('/approvals');
// Fetch one approval request for the approval detail page.
export const getApproval = (id: EntityId): Promise<AxiosResponse<Approval>> => api.get(`/approvals/${id}`);
// Update approval status, comments, or other workflow fields.
export const updateApproval = (id: EntityId, data: Record<string, unknown>) => api.put(`/approvals/${id}`, data);

// Fetch notifications for the notification center.
export const getNotifications = (): Promise<AxiosResponse<NotificationItem[]>> => api.get('/notifications');
// Persist a notification's read state.
export const markNotificationRead = (id: EntityId) => api.put(`/notifications/${id}/read`);

// Fetch evaluation progress stages for the status tracking timeline.
export const getEvaluationStatus = (id: EntityId): Promise<AxiosResponse<EvaluationStatus>> => api.get(`/evaluation-status/${id}`);

// Fetch metric/objective rows used by evaluation and approval tables.
export const getPerformanceRecords = (params: QueryParams = {}): Promise<AxiosResponse<PerformanceRecord[]>> => api.get('/performance-records', { params });
// Fetch aggregated performance summary data when a page needs dashboard totals.
export const getPerformanceSummary = () => api.get('/performance-summary');

// Fetch all saved evaluations.
export const getEvaluations = () => api.get('/evaluations');
// Fetch one saved evaluation.
export const getEvaluation = (id: EntityId) => api.get(`/evaluations/${id}`);
// Submit a new evaluation from the evaluate member page.
export const submitEvaluation = (data: Record<string, unknown>) => api.post('/evaluations', data);

// Reject an evaluation with reviewer comments.
export const rejectEvaluation = (id: EntityId, comments: string) =>
  api.post(`/evaluations/${id}/reject`, { comments });

// Submit an employee enquiry/re-evaluation request to the evaluator's superior.
export const submitEnquiry = (data: EnquiryPayload) => api.post('/enquiries', data);

export default api;
