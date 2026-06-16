/**
 * API Service for Performance Management System
 * Handles all HTTP requests to the Flask backend
 */

import { logger } from '@/utils/logger';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type {
  Country,
  PerformanceReport,
  BellCurveData,
  AIInsight,
  DashboardSummary,
  Branch,
  BranchPerformanceReport,
  BranchAIInsight,
  BranchDashboardSummary,
  Department,
  SubDepartment,
  Employee,
  SavedReport,
  SavedReportDownload,
} from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    logger.error('API response error', error);
    return Promise.reject(error);
  }
);

//  Countries 
export const countriesApi = {
  getAll: async (): Promise<Country[]> => {
    const res: AxiosResponse = await apiClient.get('/countries');
    return res.data.data;
  },
  getById: async (countryId: string): Promise<Country> => {
    const res: AxiosResponse = await apiClient.get(`/countries/${countryId}`);
    return res.data.data;
  },
  create: async (data: Partial<Country>): Promise<Country> => {
    const res: AxiosResponse = await apiClient.post('/countries', data);
    return res.data.data;
  },
};

//  Performance Reports 

export const reportsApi = {
  getByCountry: async (
    countryId: string,
    filters?: { report_type?: string; year?: number }
  ): Promise<PerformanceReport[]> => {
    const res: AxiosResponse = await apiClient.get(`/reports/${countryId}`, { params: filters });
    return res.data.data;
  },
  create: async (data: Partial<PerformanceReport>): Promise<PerformanceReport> => {
    const res: AxiosResponse = await apiClient.post('/reports', data);
    return res.data.data;
  },
  update: async (reportId: string, data: Partial<PerformanceReport>): Promise<PerformanceReport> => {
    const res: AxiosResponse = await apiClient.put(`/reports/${reportId}`, data);
    return res.data.data;
  },
};

//  Active Report Year (derived from performance_summaries H1 data)
export const activeReportYearApi = {
  get: async (): Promise<{ active_report_year: number; mid_year_data_year: number; year_end_data_year: number }> => {
    const res: AxiosResponse = await apiClient.get('/active-report-year');
    return res.data.data;
  },
};

//  Bell Curve (live from performance_summaries)
export const bellCurveApi = {
  /** Fetches live bell curve distribution computed from performance_summaries.total_score */
  getLive: async (params: {
    period_type: 'mid_year' | 'year_end';
    year: number;
    scope: 'country' | 'branch' | 'department' | 'sub_department' | 'employee';
    scope_id: string;
  }): Promise<BellCurveData[]> => {
    const res: AxiosResponse = await apiClient.get('/bell-curve-live', { params });
    return res.data.data;
  },
};

//  Report Metrics (live)
export const metricsApi = {
  get: async (params: {
    period_type: 'mid_year' | 'year_end';
    year: number;
    scope: 'country' | 'branch' | 'department' | 'sub_department' | 'employee';
    scope_id: string;
    employee_id?: string;
  }): Promise<{
    total_evaluated: number;
    avg_score: number;
    top_performers: number;
    employee_score: number | null;
  }> => {
    const res: AxiosResponse = await apiClient.get('/report-metrics', { params });
    return res.data.data;
  },
};

//  Comparison Live (dynamic, from performance_summaries) 

export const comparisonLiveApi = {
  get: async (params: {
    year: number;
    scope: 'country' | 'branch' | 'department' | 'sub_department';
    scope_id: string;
  }): Promise<any[]> => {
    const res: AxiosResponse = await apiClient.get('/comparison-live', { params });
    return res.data.data;
  },
};



//  AI Insights
export const insightsApi = {
  getByReport: async (reportId: string): Promise<AIInsight[]> => {
    const res: AxiosResponse = await apiClient.get(`/insights/${reportId}`);
    return res.data.data;
  },
};

//  Dashboard 

export const dashboardApi = {
  getSummary: async (countryId: string): Promise<DashboardSummary> => {
    const res: AxiosResponse = await apiClient.get(`/dashboard/summary/${countryId}`);
    return res.data.data;
  },
};

// Branches 

export const branchesApi = {
  getByCountry: async (countryId: string, searchTerm?: string): Promise<Branch[]> => {
    const res: AxiosResponse = await apiClient.get(`/branches/${countryId}`, {
      params: { search: searchTerm },
    });
    return res.data.data;
  },
  getById: async (branchId: string): Promise<Branch> => {
    const res: AxiosResponse = await apiClient.get(`/branch/${branchId}`);
    return res.data.data;
  },
  create: async (data: Partial<Branch>): Promise<Branch> => {
    const res: AxiosResponse = await apiClient.post('/branches', data);
    return res.data.data;
  },
};

export const branchByCodeApi = {
  get: async (code: string): Promise<Branch> => {
    const res: AxiosResponse = await apiClient.get(`/branch-by-code/${code}`);
    return res.data.data;
  },
};

//  Branch Performance Reports 

export const branchReportsApi = {
  getByBranch: async (
    branchId: string,
    filters?: { report_type?: string; year?: number }
  ): Promise<BranchPerformanceReport[]> => {
    const res: AxiosResponse = await apiClient.get(`/branch-reports/${branchId}`, { params: filters });
    return res.data.data;
  },
  create: async (data: Partial<BranchPerformanceReport>): Promise<BranchPerformanceReport> => {
    const res: AxiosResponse = await apiClient.post('/branch-reports', data);
    return res.data.data;
  },
  update: async (reportId: string, data: Partial<BranchPerformanceReport>): Promise<BranchPerformanceReport> => {
    const res: AxiosResponse = await apiClient.put(`/branch-reports/${reportId}`, data);
    return res.data.data;
  },
};





//  Branch AI Insights

export const branchInsightsApi = {
  getByReport: async (reportId: string): Promise<BranchAIInsight[]> => {
    const res: AxiosResponse = await apiClient.get(`/branch-insights/${reportId}`);
    return res.data.data;
  },
};

//  Branch Dashboard

export const branchDashboardApi = {
  getSummary: async (branchId: string): Promise<BranchDashboardSummary> => {
    const res: AxiosResponse = await apiClient.get(`/dashboard/branch-summary/${branchId}`);
    return res.data.data;
  },
};

//  Saved Reports 
export const savedReportsApi = {
  list: async (
    userId: string,
    filters?: {
      report_type?: 'country' | 'branch';
      country_id?: string;
      branch_id?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<SavedReport[]> => {
    const res: AxiosResponse = await apiClient.get('/saved-reports', {
      params: { user_id: userId, ...filters },
    });
    return res.data.data;
  },
  create: async (data: Partial<SavedReport>): Promise<SavedReport> => {
    const res: AxiosResponse = await apiClient.post('/saved-reports', data);
    return res.data.data;
  },
  getById: async (id: string): Promise<SavedReport> => {
    const res: AxiosResponse = await apiClient.get(`/saved-reports/${id}`);
    return res.data.data;
  },
  update: async (id: string, data: Partial<SavedReport>): Promise<SavedReport> => {
    const res: AxiosResponse = await apiClient.put(`/saved-reports/${id}`, data);
    return res.data.data;
  },
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/saved-reports/${id}`);
  },
  logDownload: async (
    id: string,
    data: { user_id: string; file_format?: string; user_email?: string }
  ): Promise<SavedReportDownload> => {
    const res: AxiosResponse = await apiClient.post(`/saved-reports/${id}/download`, data);
    return res.data.data;
  },
  getDownloads: async (id: string): Promise<SavedReportDownload[]> => {
    const res: AxiosResponse = await apiClient.get(`/saved-reports/${id}/downloads`);
    return res.data.data;
  },
  share: async (id: string, sharedWithEmails: string[]): Promise<SavedReport> => {
    const res: AxiosResponse = await apiClient.post(`/saved-reports/${id}/share`, {
      shared_with_emails: sharedWithEmails,
    });
    return res.data.data;
  },
  getTrendData: async (id: string): Promise<SavedReport['trend_metrics']> => {
    const res: AxiosResponse = await apiClient.get(`/saved-reports/${id}/trend-data`);
    return res.data.data;
  },
};

// Departments 

export const departmentsApi = {
  getByBranch: async (branchId: string): Promise<Department[]> => {
    const res: AxiosResponse = await apiClient.get(`/departments/branch/${branchId}`);
    return res.data.data;
  },
  getById: async (deptId: string): Promise<Department> => {
    const res: AxiosResponse = await apiClient.get(`/departments/${deptId}`);
    return res.data.data;
  },
};

//  Sub-Departments 

export const subDepartmentsApi = {
  getByDepartment: async (deptId: string): Promise<SubDepartment[]> => {
    const res: AxiosResponse = await apiClient.get(`/sub-departments/dept/${deptId}`);
    return res.data.data;
  },
  getById: async (subDeptId: string): Promise<SubDepartment> => {
    const res: AxiosResponse = await apiClient.get(`/sub-departments/${subDeptId}`);
    return res.data.data;
  },
};

//  Employees 

export const employeesApi = {
  getBySubDepartment: async (subDeptId: string): Promise<Employee[]> => {
    const res: AxiosResponse = await apiClient.get(`/employees/sub-dept/${subDeptId}`);
    return res.data.data;
  },
  getById: async (empId: string): Promise<Employee> => {
    const res: AxiosResponse = await apiClient.get(`/employees/${empId}`);
    return res.data.data;
  },
};

//  Performance Summaries 

export const performanceSummariesApi = {
  getByUser: async (userId: string, year?: number): Promise<any[]> => {
    const res: AxiosResponse = await apiClient.get(`/performance-summaries/user/${userId}`, {
      params: { year },
    });
    return res.data.data;
  },
};

// Health Check 

export const healthCheck = async (): Promise<{ status: string; timestamp: string }> => {
  const res: AxiosResponse = await apiClient.get('/health');
  return res.data;
};

export default {
  countries: countriesApi,
  reports: reportsApi,
  bellCurve: bellCurveApi,

  insights: insightsApi,
  dashboard: dashboardApi,
  branches: branchesApi,
  branchReports: branchReportsApi,


  branchInsights: branchInsightsApi,
  branchDashboard: branchDashboardApi,
  savedReports: savedReportsApi,
  healthCheck,
};

export type { SavedReport, SavedReportDownload };
