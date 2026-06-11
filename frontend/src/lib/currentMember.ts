import type { Approval, TeamMember } from '../types';
import { EVALUATION_DEFAULTS, STORAGE_KEYS } from './constants';

// Reads the currently selected evaluation member from browser storage.
export const readStoredMember = (): TeamMember | null => {
  if (typeof window === 'undefined') return null;

  const id = localStorage.getItem(STORAGE_KEYS.currentMemberId) || undefined;
  const name = localStorage.getItem(STORAGE_KEYS.currentMemberName) || undefined;
  const role = localStorage.getItem(STORAGE_KEYS.currentMemberRole) || undefined;

  return id || name || role
    ? {
        id,
        name: name || EVALUATION_DEFAULTS.defaultEmployeeName,
        role: role || EVALUATION_DEFAULTS.defaultEmployeeRole,
      }
    : null;
};

// Saves the selected member so status tracking and enquiry pages open the right employee.
export const saveStoredMember = (member: TeamMember): void => {
  if (typeof window === 'undefined') return;

  localStorage.setItem(STORAGE_KEYS.currentMemberId, String(member.id || ''));
  localStorage.setItem(STORAGE_KEYS.currentMemberName, member.name || EVALUATION_DEFAULTS.defaultEmployeeName);
  localStorage.setItem(STORAGE_KEYS.currentMemberRole, member.role || EVALUATION_DEFAULTS.defaultEmployeeRole);
};

// Saves the latest submitted approval so the approval list can show the same employee immediately after redirect.
export const saveLatestApproval = (approval: Approval): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.latestApproval, JSON.stringify(approval));
};

// Reads the latest submitted approval handoff from localStorage.
export const readLatestApproval = (): Approval | null => {
  if (typeof window === 'undefined') return null;

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.latestApproval) || 'null') as Approval | null;
  } catch {
    return null;
  }
};

// Caches the approvals list so old approval rows can render immediately on return visits.
export const saveApprovalsCache = (approvals: Approval[]): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.approvalsCache, JSON.stringify(approvals));
};

// Reads cached approval rows before the backend refresh completes.
export const readApprovalsCache = (): Approval[] => {
  if (typeof window === 'undefined') return [];

  try {
    const approvals = JSON.parse(localStorage.getItem(STORAGE_KEYS.approvalsCache) || '[]') as Approval[];
    return Array.isArray(approvals) ? approvals : [];
  } catch {
    return [];
  }
};

// Checks whether two approval rows represent the same approval/employee.
const isSameStoredApproval = (left: Approval, right: Approval): boolean => {
  const sameApprovalId = left.id && right.id && String(left.id) === String(right.id);
  const sameTeamMember =
    left.team_member_id &&
    right.team_member_id &&
    String(left.team_member_id) === String(right.team_member_id);
  const sameEmployee =
    left.employee_id &&
    right.employee_id &&
    String(left.employee_id) === String(right.employee_id);

  return Boolean(sameApprovalId || sameTeamMember || sameEmployee);
};

// Updates cached approvals after approve/reject so the list page reflects the new status immediately.
export const updateStoredApproval = (updatedApproval: Approval): void => {
  if (typeof window === 'undefined') return;

  const latestApproval = readLatestApproval();
  if (latestApproval && isSameStoredApproval(latestApproval, updatedApproval)) {
    saveLatestApproval({ ...latestApproval, ...updatedApproval });
  }

  const cachedApprovals = readApprovalsCache();
  const nextApprovals = cachedApprovals.map((approval) =>
    isSameStoredApproval(approval, updatedApproval) ? { ...approval, ...updatedApproval } : approval
  );

  const hasCachedApproval = cachedApprovals.some((approval) => isSameStoredApproval(approval, updatedApproval));
  saveApprovalsCache(hasCachedApproval ? nextApprovals : [updatedApproval, ...cachedApprovals]);
};
