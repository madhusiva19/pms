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

export interface PerformanceComparison {
  id: string;
  country_id: string;
  rating_range: string;
  mid_year_count: number;
  year_end_count: number;
  comparison_year: number;
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

export interface BranchBellCurveData {
  id: string;
  report_id: string;
  rating_range: string;
  employee_count: number;
  percentage: number;
  created_at: string;
}

export interface BranchPerformanceComparison {
  id: string;
  branch_id: string;
  country_id: string;
  rating_range: string;
  mid_year_count: number;
  year_end_count: number;
  comparison_year: number;
  created_at: string;
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
  assigned_country_id?: string;
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