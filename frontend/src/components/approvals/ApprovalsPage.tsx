import viewStyles from '../../styles/views.module.css';
import { useState, useEffect } from 'react';
import Link from '../../lib/routing';
import { useRoutes } from '../../lib/routing';
import { getApprovals, invalidateCache } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import LoadingScreen from '../LoadingScreen';
import { TEAM_MEMBER_STATUS } from '../../lib/constants';
import { normalizeStatus } from '../../lib/formatters';
import type { Approval } from '../../lib/types';

const APPROVAL_TAB = {
  pending: 'pending',
  all: 'all',
} as const;

// Maps the approval status to the evaluation flow display label.
// The flow is only "completed" when the last stage (HQ Admin Finalization) is
// done, i.e. the approval is approved. Everything before that is "in progress".
const getEvalFlowLabel = (status?: string): string => {
  const s = normalizeStatus(status);
  if (s === 'approved')  return 'completed';
  if (s === 'rejected')  return 'rejected';
  return 'pending';
};

// Returns CSS module classes for status badges in the table.
const getStatusColor = (status?: string, styles: Record<string, string> = {}) => {
  switch (normalizeStatus(status)) {
    case 'approved':                    return styles.statusApproved;
    case 'rejected':                    return styles.statusRejected;
    case TEAM_MEMBER_STATUS.inProgress: return styles.statusInProgress;
    case TEAM_MEMBER_STATUS.pending:    return styles.statusInProgress;
    default:                            return styles.statusDefault;
  }
};

const getInitials = (name?: string) =>
  (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function Approvals({ roleFilter }: { roleFilter?: string } = {}) {
  const routes = useRoutes();
  const { user, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<Approval[]>([]);
  const [activeTab, setActiveTab] = useState<string>(APPROVAL_TAB.pending);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const fetchData = async () => {
      setLoading(true);
      invalidateCache('/approvals');
      try {
        const params = user?.id ? { manager_id: user.id } : {};
        const approvalsRes = await getApprovals(params);
        // Backend already filters to real submissions (evaluation_id IS NOT NULL)
        // and resolves employee / evaluator names via FK joins.
        const records: Approval[] = approvalsRes.data ?? [];
        setRows(records);
      } catch (error) {
        console.error('Error fetching approvals:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user?.id, authLoading]);

  const filteredRows = activeTab === APPROVAL_TAB.pending
    ? rows.filter(r => normalizeStatus(r.status) === TEAM_MEMBER_STATUS.pending)
    : rows;

  const pendingCount  = rows.filter(r => normalizeStatus(r.status) === TEAM_MEMBER_STATUS.pending).length;
  const approvedCount = rows.filter(r => normalizeStatus(r.status) === 'approved').length;
  const rejectedCount = rows.filter(r => normalizeStatus(r.status) === 'rejected').length;

  return (
    <main className={viewStyles.v032}>
        <div className={viewStyles.v033}>
          {/* Header */}
          <p className={viewStyles.v037}>Review and manage pending evaluation requests</p>

          {/* Stats bar */}
          <div className={viewStyles.approvalStats}>
            <div className={viewStyles.approvalStatCard}>
              <div className={`${viewStyles.approvalStatIcon} ${viewStyles.approvalStatIconPending}`}>⏳</div>
              <div className={viewStyles.approvalStatBody}>
                <span className={`${viewStyles.approvalStatNum} ${viewStyles.approvalStatNumPending}`}>{pendingCount}</span>
                <span className={viewStyles.approvalStatLabel}>Pending</span>
              </div>
            </div>
            <div className={viewStyles.approvalStatCard}>
              <div className={`${viewStyles.approvalStatIcon} ${viewStyles.approvalStatIconApproved}`}>✅</div>
              <div className={viewStyles.approvalStatBody}>
                <span className={`${viewStyles.approvalStatNum} ${viewStyles.approvalStatNumApproved}`}>{approvedCount}</span>
                <span className={viewStyles.approvalStatLabel}>Approved</span>
              </div>
            </div>
            <div className={viewStyles.approvalStatCard}>
              <div className={`${viewStyles.approvalStatIcon} ${viewStyles.approvalStatIconRejected}`}>❌</div>
              <div className={viewStyles.approvalStatBody}>
                <span className={`${viewStyles.approvalStatNum} ${viewStyles.approvalStatNumRejected}`}>{rejectedCount}</span>
                <span className={viewStyles.approvalStatLabel}>Rejected</span>
              </div>
            </div>
            <div className={viewStyles.approvalStatCard}>
              <div className={`${viewStyles.approvalStatIcon} ${viewStyles.approvalStatIconTotal}`}>📋</div>
              <div className={viewStyles.approvalStatBody}>
                <span className={`${viewStyles.approvalStatNum} ${viewStyles.approvalStatNumTotal}`}>{rows.length}</span>
                <span className={viewStyles.approvalStatLabel}>Total</span>
              </div>
            </div>
          </div>

          {/* Pill tabs */}
          <div className={viewStyles.v038}>
            <button
              onClick={() => setActiveTab(APPROVAL_TAB.pending)}
              className={`${viewStyles.v048} ${activeTab === APPROVAL_TAB.pending ? viewStyles.v049 : viewStyles.v050}`}
            >
              Pending ({pendingCount})
            </button>
            <button
              onClick={() => setActiveTab(APPROVAL_TAB.all)}
              className={`${viewStyles.v048} ${activeTab === APPROVAL_TAB.all ? viewStyles.v049 : viewStyles.v050}`}
            >
              All ({rows.length})
            </button>
          </div>

          {/* Approval table */}
          {loading ? (
            <LoadingScreen />
          ) : filteredRows.length === 0 ? (
            <div className={viewStyles.approvalEmpty}>
              <div className={viewStyles.approvalEmptyIcon}>📭</div>
              No approvals found.
            </div>
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
                  {filteredRows.map((row) => (
                    <tr key={String(row.id)} className={viewStyles.v044}>
                      <td className={viewStyles.v045}>
                        <div className={viewStyles.approvalEmployeeCell}>
                          <span className={viewStyles.approvalAvatar}>{getInitials(row.employee)}</span>
                          {row.employee}
                        </div>
                      </td>
                      <td className={viewStyles.v046}>{row.evaluationBy}</td>
                      <td className={viewStyles.v046}>{row.level}</td>
                      <td className={viewStyles.v046}>
                        <span className={`${viewStyles.v051} ${getStatusColor(row.status, viewStyles as Record<string, string>)}`}>
                          {getEvalFlowLabel(row.status)}
                        </span>
                      </td>
                      <td className={viewStyles.v046}>{row.dueDate}</td>
                      <td className={viewStyles.v046}>
                        <Link
                          href={{
                            pathname: `${routes.approvals}/${row.id}`,
                            query: { memberId: row.team_member_id ?? row.employee_id },
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
  );
}
