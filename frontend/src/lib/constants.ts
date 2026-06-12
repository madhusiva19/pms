// Shared constants keep route paths, default labels, and workflow statuses in one place.
// This avoids hidden hardcoded strings across pages and makes changes safer.
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
