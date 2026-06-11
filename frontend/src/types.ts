// Shared frontend data types for API responses and route/query identifiers.
import type { ParsedUrlQueryInput } from 'querystring';

export type EntityId = string | number | string[] | undefined;
export type TeamMemberStatus = 'pending' | 'in progress' | 'completed' | string;

export interface ObjectiveItem {
  name: string;
  weight?: string | number;
  target?: string | number;
  actual?: string | number;
  achieve?: string | number;
  rating?: string | number;
}

export interface ObjectiveGroup {
  category: string;
  items: ObjectiveItem[];
}

export interface EvaluationDetails {
  period?: string;
  evaluation_period?: string;
  feedback?: string;
  overallScore?: string | number;
  overall_score?: string | number;
  objectives?: ObjectiveGroup[];
}

export interface TeamMember {
  id: EntityId;
  name: string;
  role?: string;
  department?: string;
  status?: TeamMemberStatus;
  email?: string;
  phone?: string;
  overallScore?: string | number;
  evaluation?: EvaluationDetails;
  [key: string]: unknown;
}

export interface Approval {
  id: EntityId;
  employee?: string;
  evaluationBy?: string;
  level?: string;
  status?: string;
  dueDate?: string;
  team_member_id?: EntityId;
  member_id?: EntityId;
  memberId?: EntityId;
  employee_id?: EntityId;
  employeeId?: EntityId;
  feedback?: string;
  [key: string]: unknown;
}

export interface NotificationItem {
  id: EntityId;
  type?: string;
  title?: string;
  description?: string;
  timestamp?: string;
  is_read?: boolean;
  [key: string]: unknown;
}

export interface EvaluationStage {
  name: string;
  status?: string;
  date?: string;
  user?: string;
}

export interface EvaluationStatus {
  employee?: string;
  currentStage?: string;
  stages: EvaluationStage[];
  [key: string]: unknown;
}

export interface PerformanceRecord {
  category?: string;
  category_name?: string;
  focus_area?: string;
  section?: string;
  objective?: string;
  metric_name?: string;
  item_name?: string;
  name?: string;
  weight?: string | number;
  target_value?: string | number;
  target?: string | number;
  actual_value?: string | number;
  actual?: string | number;
  achievement_percentage?: string | number;
  achieve?: string | number;
  achieve_percentage?: string | number;
  rating?: string | number;
  score?: string | number;
  [key: string]: unknown;
}

export interface EnquiryPayload {
  employee_id?: EntityId;
  employee_name?: string;
  employee_role?: string;
  evaluator_name: string;
  current_stage?: string;
  current_status?: string;
  reason: string;
  additional_comments?: string;
  request_type: 're_evaluation';
  related_evaluation_id?: EntityId;
}

export type QueryParams = ParsedUrlQueryInput;
