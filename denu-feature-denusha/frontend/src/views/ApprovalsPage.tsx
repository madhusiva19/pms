import viewStyles from '../styles/views.module.css';
// Approvals page: lists evaluation approval requests and routes reviewers to detail pages.
import { useState, useEffect } from 'react';
import Link from '../lib/routing';
import { getApprovals } from '../lib/api';
import Sidebar from '../components/Sidebar';
import MemberAvatar from '../components/MemberAvatar';
import { ROUTES, TEAM_MEMBER_STATUS } from '../lib/constants';
import { readApprovalsCache, readLatestApproval, saveApprovalsCache } from '../lib/currentMember';
import { normalizeStatus } from '../lib/formatters';
import type { Approval } from '../types';

const APPROVAL_TAB = {
  pending: 'pending',
  all: 'all',
} as const;

// Checks whether two approval rows point to the same evaluated employee/request.
const isSameApproval = (approval: Approval, latestApproval: Approval): boolean => {
  const sameApprovalId = approval.id && latestApproval.id && String(approval.id) === String(latestApproval.id);
  const sameTeamMember =
    approval.team_member_id &&
    latestApproval.team_member_id &&
    String(approval.team_member_id) === String(latestApproval.team_member_id);
  const sameEmployee =
    approval.employee_id &&
    latestApproval.employee_id &&
    String(approval.employee_id) === String(latestApproval.employee_id);

  return Boolean(sameApprovalId || sameTeamMember || sameEmployee);
};

// Builds a stable key for one employee so repeated approvals do not show many times.
const getApprovalEmployeeKey = (approval: Approval): string =>
  String(
    approval.team_member_id ||
      approval.employee_id ||
      approval.member_id ||
      approval.memberId ||
      approval.employee ||
      approval.id ||
      ''
  ).toLowerCase();

// Keeps only one approval row per employee, preserving the first row in the list.
const uniqueApprovalsByEmployee = (approvalRows: Approval[]): Approval[] => {
  const seenKeys = new Set<string>();

  return approvalRows.filter((approval) => {
    const key = getApprovalEmployeeKey(approval);
    if (!key || seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
};

// Keeps the just-submitted approval visible first while the database response catches up.
const mergeLatestApproval = (approvalRows: Approval[]): Approval[] => {
  const latestApproval = readLatestApproval();
  if (!latestApproval) return uniqueApprovalsByEmployee(approvalRows);

  const matchingApproval = approvalRows.find((approval) => isSameApproval(approval, latestApproval));
  const mergedLatestApproval = matchingApproval
    ? {
        ...matchingApproval,
        employee: latestApproval.employee || matchingApproval.employee,
        employee_id: latestApproval.employee_id || matchingApproval.employee_id,
        team_member_id: latestApproval.team_member_id || matchingApproval.team_member_id,
      }
    : latestApproval;

  return uniqueApprovalsByEmployee([
    mergedLatestApproval,
    ...approvalRows.filter((approval) => !isSameApproval(approval, mergedLatestApproval)),
  ]);
};

export default function Approvals() {
  const latestApproval = readLatestApproval();
  const cachedApprovals = mergeLatestApproval(readApprovalsCache());
  // Stores all approval rows returned from the backend.
  const [approvals, setApprovals] = useState<Approval[]>(() => cachedApprovals);
  // Stores whether the table shows only pending approvals or all approvals.
  const [activeTab, setActiveTab] = useState<string>(
    ['approved', 'rejected'].includes(normalizeStatus(latestApproval?.status)) ? APPROVAL_TAB.all : APPROVAL_TAB.pending
  );
  // Controls the table loading state.
  const [loading, setLoading] = useState(cachedApprovals.length === 0);

  // Loads approval requests once when the page opens.
  useEffect(() => {
    const fetchApprovals = async () => {
      try {
        if (!latestApproval) {
          setLoading(true);
        }
        const response = await getApprovals();
        const mergedApprovals = mergeLatestApproval(response.data);
        setApprovals(mergedApprovals);
        saveApprovalsCache(mergedApprovals);
      } catch (error) {
        console.error('Error fetching approvals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovals();
  }, []);

  // Applies the selected tab to either show pending approvals or all rows.
  const filteredApprovals = activeTab === APPROVAL_TAB.pending
    ? approvals.filter(a => normalizeStatus(a.status) === TEAM_MEMBER_STATUS.pending)
    : approvals;

  // Returns CSS module classes for status badges in the table.
  const getStatusColor = (status?: string) => {
    switch (normalizeStatus(status)) {
      case TEAM_MEMBER_STATUS.pending:
        return viewStyles.statusPending;
      case 'approved':
        return viewStyles.statusApproved;
      case 'rejected':
        return viewStyles.statusRejected;
      case TEAM_MEMBER_STATUS.inProgress:
        return viewStyles.statusInProgress;
      default:
        return viewStyles.statusDefault;
    }
  };

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v033}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={ROUTES.myTeam} className={viewStyles.v035}>
              My Team
            </Link>
            {' > Approvals'}
          </div>

          {/* Header */}
          <h1 className={viewStyles.v036}>Approvals</h1>
          <p className={viewStyles.v037}>Review and approve pending evaluations</p>

          {/* Tabs switch between pending-only and full approval lists. */}
          <div className={viewStyles.v038}>
            <button
              onClick={() => setActiveTab(APPROVAL_TAB.pending)}
              className={`${viewStyles.v048} ${
                activeTab === APPROVAL_TAB.pending
                  ? viewStyles.v049
                  : viewStyles.v050
              }`}
            >
              Pending ({approvals.filter(a => normalizeStatus(a.status) === TEAM_MEMBER_STATUS.pending).length})
            </button>
            <button
              onClick={() => setActiveTab(APPROVAL_TAB.all)}
              className={`${viewStyles.v048} ${
                activeTab === APPROVAL_TAB.all
                  ? viewStyles.v049
                  : viewStyles.v050
              }`}
            >
              All ({approvals.length})
            </button>
          </div>

          {/* Approval table links each row to the detailed review page. */}
          {loading ? (
            <div className={viewStyles.v039}>Loading...</div>
          ) : (
            <div className={viewStyles.v040}>
              <table className={viewStyles.v041}>
                <thead>
                  <tr className={viewStyles.v042}>
                    <th className={viewStyles.v043}>Employee</th>
                    <th className={viewStyles.v043}>Evaluation By</th>
                    <th className={viewStyles.v043}>Level</th>
                    <th className={viewStyles.v043}>Status</th>
                    <th className={viewStyles.v043}>Due Date</th>
                    <th className={viewStyles.v043}>Action</th>
                    
                  </tr>
                </thead>
                <tbody>
                  {filteredApprovals.map((approval) => (
                    <tr key={String(approval.id)} className={viewStyles.v044}>
                      <td className={viewStyles.v045}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <MemberAvatar name={approval.employee} size="small" />
                          {approval.employee}
                        </div>
                      </td>
                      <td className={viewStyles.v046}>{approval.evaluationBy}</td>
                      <td className={viewStyles.v046}>{approval.level}</td>
                      <td className={viewStyles.v046}>
                        <span className={`${viewStyles.v051} ${getStatusColor(approval.status)}`}>
                          {normalizeStatus(approval.status)}
                        </span>
                      </td>
                      <td className={viewStyles.v046}>{approval.dueDate}</td>
                      <td className={viewStyles.v046}>
                        <Link
                          href={{
                            pathname: `${ROUTES.approvals}/${approval.id}`,
                            query: approval.team_member_id
                              ? { memberId: approval.team_member_id }
                              : approval.employee_id
                              ? { memberId: approval.employee_id }
                              : {},
                          }}
                          className={viewStyles.v047}
                        >
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
