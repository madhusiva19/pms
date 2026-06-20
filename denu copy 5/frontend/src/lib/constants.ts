// Shared constants keep route paths, default labels, and workflow statuses in one place.
// This avoids hidden hardcoded strings across pages and makes changes safer.
export const ROLE_ROUTE_PREFIX: Record<string, string> = {
  hq_admin: '/hq-admin',
  country_admin: '/country-admin',
  branch_admin: '/branch-admin',
  dept_admin: '/department-admin',
  sub_dept_admin: '/sub-department-admin',
};

export const ROUTES = {
  home: '/',
  myTeam: '/my-team',
  members: '/members',
  approvals: '/approvals',
  evaluate: '/evaluate',
  rejection: '/rejection',
  statusTracking: '/status-tracking',
  enquiry: '/enquiry',
  notifications: '/notifications',
  testConnection: '/test-connection',
} as const;

export const TEAM_MEMBER_STATUS = {
  all: 'all',
  pending: 'pending',
  inProgress: 'in progress',
  completed: 'completed',
} as const;

export const EVALUATION_DEFAULTS = {
  period: 'Annual Performance 2024',
  evaluatorName: 'Sarah Fernando',
  evaluatorRole: 'Group Admin',
  approvalLevel: 'Level 1 (Manager)',
  approvalReviewRole: 'Evaluation Review',
  currentStage: 'Sub Dept Admin Evaluation',
  currentStatus: 'In Progress',
  defaultEmployeeName: 'Employee',
  defaultEmployeeRole: 'Team Member',
} as const;

export const STORAGE_KEYS = {
  user: 'pms_user',
  currentMemberId: 'pms_current_member_id',
  currentMemberName: 'pms_current_member_name',
  currentMemberRole: 'pms_current_member_role',
  latestApproval: 'pms_latest_approval',
  approvalsCache: 'pms_approvals_cache',
} as const;

export const SIDEBAR_DEFAULT_USER = {
  name: 'Branch Admin',
  role: 'Admin',
  initials: 'BA',
} as const;

// Maps a member's role to the evaluation stage name for that role.
export const ROLE_STAGE_LABEL: Record<string, string> = {
  hq_admin: 'HQ Admin Evaluation',
  country_admin: 'Country Admin Evaluation',
  branch_admin: 'Branch Admin Evaluation',
  dept_admin: 'Department Admin Evaluation',
  sub_dept_admin: 'Sub Department Admin Evaluation',
  employee: 'Employee Evaluation',
};

// Maps a member's role to the display label of the admin directly above them who evaluates them.
export const ROLE_EVALUATOR_LABEL: Record<string, string> = {
  country_admin: 'HQ Admin',
  branch_admin: 'Country Admin',
  dept_admin: 'Branch Admin',
  sub_dept_admin: 'Department Admin',
  employee: 'Sub Department Admin',
};

// Maps each admin role to the role directly below it in the hierarchy.
// Used by role-based My Team pages to filter the correct subordinates.
export const ROLE_SUBORDINATE_MAP: Record<string, string> = {
  hq_admin: 'country_admin',
  country_admin: 'branch_admin',
  branch_admin: 'dept_admin',
  dept_admin: 'sub_dept_admin',
  sub_dept_admin: 'employee',
} as const;

export const WORKFLOW_ROUTES = [
  ROUTES.home,
  ROUTES.myTeam,
  ROUTES.evaluate,
  ROUTES.approvals,
  ROUTES.rejection,
  ROUTES.statusTracking,
  ROUTES.enquiry,
  ROUTES.notifications,
] as const;
