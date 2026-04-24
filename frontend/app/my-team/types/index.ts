export type EvaluationStatus = 'pending' | 'in-progress' | 'completed';
export type AdminLevel = 1 | 2 | 3 | 4 | 5;

export interface TeamMember {
  id: string;
  name: string;
  role?: string;
  title?: string;
  department: string;
  status?: EvaluationStatus;
  level?: number;
  email?: string;
}

export interface Admin extends TeamMember {
  level: AdminLevel;
  reportsTo?: string;
  directReports: string[];
  title: string;
  email: string;
}

export const ADMIN_LEVEL_LABELS: Record<AdminLevel, string> = {
  1: 'HQ Admin',
  2: 'Country Admin',
  3: 'Branch Admin',
  4: 'Dept Admin',
  5: 'Sub Dept Admin',
};

export const ADMIN_LEVEL_DESCRIPTIONS: Record<AdminLevel, string> = {
  1: 'Global Authority - Evaluates Country Admins',
  2: 'Country-wide Authority - Evaluates Branch Admins',
  3: 'Branch-level Authority - Evaluates Dept Admins',
  4: 'Department-level Authority - Evaluates Sub Dept Admins',
  5: 'Sub-dept Authority - Evaluates Employees',
};

export const STATUS_LABELS: Record<EvaluationStatus, string> = {
  pending: 'Pending',
  'in-progress': 'In Progress',
  completed: 'Completed',
};

export const EVALUATION_STATUS_COLORS: Record<
  EvaluationStatus,
  { bg: string; text: string }
> = {
  pending: { bg: '#FEF3C7', text: '#92400E' },
  'in-progress': { bg: '#DBEAFE', text: '#1E40AF' },
  completed: { bg: '#D1FAE5', text: '#065F46' },
};