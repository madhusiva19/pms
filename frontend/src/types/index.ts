/**
 * Type definitions for Performance Management System
 * Dashboard & Reporting Module
 */

export interface Country {
  id: string;
  name: string;
  code: string;
  total_employees: number;
  total_branches: number;
  created_at: string;
}

export interface PerformanceReport {
  id: string;
  country_id: string;
  report_type: 'mid_year' | 'year_end';
  report_year: number;
  total_evaluated: number;
  avg_score: number;
  top_performers: number;
  completion_percentage: number;

  created_at: string;
  updated_at: string;
}

export interface BellCurveData {
  id: string;
  report_id: string;
  rating_range: string;
  employee_count: number;
  percentage: number;
  created_at: string;
}


export interface AIInsight {
  id: string;
  report_id: string;
  insight_text: string;
  insight_type: string;
  created_at: string;
}

export interface DashboardSummary {
  country: Country;
  mid_year: PerformanceReport | null;
  year_end: PerformanceReport | null;
}

export type ReportType = 'mid_year' | 'year_end';

// Branch-related types for Country Admin feature
export interface Branch {
  id: string;
  country_id: string;
  name: string;
  code: string;
  total_employees: number;
  created_at: string;
  updated_at?: string;
}

export interface BranchPerformanceReport {
  id: string;
  branch_id: string;
  country_id: string;
  report_type: 'mid_year' | 'year_end';
  report_year: number;
  total_evaluated: number;
  avg_score: number;
  top_performers: number;
  completion_percentage: number;
  created_at: string;
  updated_at: string;
}



export interface BranchAIInsight {
  id: string;
  report_id: string;
  insight_text: string;
  insight_type: string;
  created_at: string;
}

export interface BranchDashboardSummary {
  branch: Branch;
  mid_year: BranchPerformanceReport | null;
  year_end: BranchPerformanceReport | null;
}

// Saved Reports types for Create & Save Reports feature
export interface SavedReport {
  id: string;
  user_id: string;
  report_name: string;
  report_description?: string;
  report_type: 'country' | 'branch';
  country_id: string;
  branch_id?: string;
  report_period: 'mid_year' | 'year_end' | 'both';
  report_year: number;
  metrics_included: string[];
  charts_included: string[];
  include_ai_insights: boolean;
  include_comparison: boolean;
  created_at: string;
  updated_at: string;
  created_by_email?: string;
  is_shared: boolean;
  shared_with_emails: string[];
  // Trend Analysis fields
  is_trend_report?: boolean;
  selected_periods?: string[]; // e.g., ["mid_year_2025", "year_end_2025", "mid_year_2026"]
  // trend_metrics stores all extra report data as JSON:
  // { type, admin_comment, avg_scores, country_data, year_data, comparison_years, ... }
  trend_metrics?: Record<string, any>;
}

export interface CountryComparisonEntry {
  country_id: string;
  country_name: string;
  avg_score: number;
  top_performers: number;
  total_evaluated: number;
}

export interface YearComparisonEntry {
  year: number;
  avg_score: number;
  top_performers: number;
  total_evaluated: number;
}

export interface SavedReportDownload {
  id: string;
  saved_report_id: string;
  user_id: string;
  download_timestamp: string;
  file_format: string;
  user_email?: string;
}

// Trend Analysis types
export interface PeriodMetrics {
  period: string; // e.g., "mid_year_2025"
  year: number;
  report_type: 'mid_year' | 'year_end';
  metrics: {
    total_evaluated: number;
    avg_score: number;
    top_performers: number;
    completion_percentage: number;
  };
}

export interface MetricChange {
  value: number; // Raw change
  percentage: number; // Percentage change
  direction: 'up' | 'down' | 'stable'; // Direction of change
  label: string; // Human readable label
}

export interface TrendAnalysis {
  periods: PeriodMetrics[];
  changes: {
    total_evaluated: MetricChange;
    avg_score: MetricChange;
    top_performers: MetricChange;
    completion_percentage: MetricChange;
  };
  trends: {
    avg_score_trend: 'improving' | 'declining' | 'stable';
    top_performers_trend: 'improving' | 'declining' | 'stable';
    evaluated_trend: 'growing' | 'declining' | 'stable';
  };
}

// ============================================================
// BRANCH ADMIN — Level 3 types
// ============================================================

export interface Department {
  id: string;
  branch_id: string;
  name: string;
  code: string;
  total_employees: number;
  dept_admin_name?: string | number;
  created_at: string;
}

export interface DepartmentCompletion {
  department_id: string;
  department_name: string;
  total_employees: number;
  evaluated: number;
  completion_percentage: number;
}

export interface DeptAdminListItem {
  id: string;
  full_name: string;
  email: string;
  department_id: string;
  department_name: string;
  iata_branch_code: string;
  total_employees: number;
  evaluated: number;
  completion_percentage: number;
}

// ============================================================
// DEPT ADMIN — Level 4 types
// ============================================================

export interface SubDepartment {
  id: string;
  department_id: string;
  name: string;
  code: string;
  total_employees: number;
  sub_dept_admin_name?: string;
  created_at: string;
}

export interface SubDeptCompletion {
  sub_dept_id: string;
  sub_dept_name: string;
  total_employees: number;
  objectives_set: number;
  evaluated: number;
  completion_percentage: number;
  objective_setting_percentage: number;
}

export interface SubDeptAdminListItem {
  id: string;
  full_name: string;
  email: string;
  sub_department_id: string;
  sub_department_name: string;
  department_id: string;
  total_employees: number;
  objectives_set: number;
  evaluated: number;
  completion_percentage: number;
}

// ============================================================
// SUB DEPT ADMIN — Level 5 types
// ============================================================

export interface Employee {
  id: string;                   // users.id (UUID)
  email: string;
  full_name: string;
  role: string;
  is_admin?: boolean;
  designation?: string;
  emp_id?: string;              // human-readable code e.g. EMP-0001
  department?: string;
  department_id?: string;       // UUID
  sub_department_id?: string;   // UUID
  branch_id?: string;           // UUID
  country_id?: string;          // UUID
  manager_id?: string;
  iata_branch_code?: string;
  created_at?: string;
  updated_at?: string;

  // Legacy aliases kept for backward compatibility
  name?: string;
  employee_id?: string;         // maps to emp_id
}

export interface TeamOverviewSummary {
  total_employees: number;
  objectives_set: number;
  mid_year_completed: number;
  year_end_completed: number;
  completion_percentage: number;
  avg_team_score: number;
}

// ============================================================
// POTENTIAL ASSESSMENT MODULE — New types (do not modify above)
// ============================================================

export interface AppraisalCycle {
  id: string;
  name: string;         // e.g. "2024-25"
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export type AssessmentStatus = 'not_started' | 'pending_self' | 'pending_supervisor' | 'completed';
export type PillarType = 'ability' | 'aspiration' | 'leadership';
export type RatingValue = 'H' | 'M' | 'L';
export type TalentBlock = 'A' | 'B' | 'C';
export type AppraiseeRole = 'country_admin' | 'branch_admin' | 'dept_admin' | 'sub_dept_admin' | 'employee';

export interface PotentialAssessment {
  id: string;
  employee_id: string;
  supervisor_id: string;
  appraisee_role: AppraiseeRole;
  appraisal_cycle: string;
  status: AssessmentStatus;
  self_submitted_at: string | null;
  supervisor_submitted_at: string | null;
  overall_ability: RatingValue | null;
  overall_aspiration: RatingValue | null;
  overall_leadership: RatingValue | null;
  talent_block: TalentBlock | null;
  created_at: string;
  items?: PotentialAssessmentItem[];
}

export interface PotentialAssessmentItem {
  id: string;
  assessment_id: string;
  pillar: PillarType;
  component_number: 1 | 2 | 3;
  self_rating: RatingValue | null;
  self_example: string | null;
  supervisor_rating?: RatingValue | null;    // hidden until completed
  supervisor_justification?: string | null;  // hidden until completed
  created_at: string;
}

/** Returned by GET /api/potential-assessment/subordinates/:supervisorId/:cycle */
export interface SubordinateAssessmentSummary {
  id: string;
  full_name: string;
  email: string;
  emp_id?: string;
  role: string;
  // role-specific location fields
  country_id?: string;
  iata_branch_code?: string;
  department_id?: string;
  sub_department_id?: string;
  designation?: string;
  // assessment state
  assessment_status: AssessmentStatus;
  talent_block: TalentBlock | null;
}

export interface SelfSubmitItemPayload {
  pillar: PillarType;
  component_number: 1 | 2 | 3;
  self_rating: RatingValue;
  self_example: string;
}

export interface SelfSubmitPayload {
  employee_id: string;
  supervisor_id: string;
  appraisee_role: AppraiseeRole;
  cycle: string;
  items: SelfSubmitItemPayload[];
}

export interface SupervisorSubmitItemPayload {
  id: string;   // potential_assessment_items.id
  supervisor_rating: RatingValue;
  supervisor_justification: string;
}

export interface SupervisorSubmitPayload {
  assessment_id: string;
  supervisor_id: string;
  supervisor_role: string;
  items: SupervisorSubmitItemPayload[];
}