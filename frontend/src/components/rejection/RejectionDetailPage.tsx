import viewStyles from '../../styles/views.module.css';
// Rejection detail page: captures rejection comments and guides the user back to editing.
import Link, { useRouter, useRoutes } from '../../lib/routing';
import { useEffect, useState } from 'react';
import { getApproval, updateApproval } from '../../lib/api';
import Sidebar from '../sidebar/Sidebar';
import LoadingScreen from '../LoadingScreen';
import { saveStoredMember, updateStoredApproval, readStoredMember, readEvaluationDate } from '../../lib/currentMember';
import { ROLE_EVALUATOR_LABEL } from '../../lib/constants';
import type { Approval } from '../../lib/types';

export default function RejectionDetail() {
  const router = useRouter();
  const routes = useRoutes();
  // Approval ID comes from the route; member ID can come from query params.
  const { id, memberId } = router.query;
  // Stores the approval record being rejected.
  const [approval, setApproval] = useState<Approval | null>(null);
  // Controls the loading state while approval data is fetched.
  const [loading, setLoading] = useState(true);
  // Stores editable rejection comments from the approver.
  const [comments, setComments] = useState('');
  // Stores the name shown in the resubmission form — filled from the approval record on load.
  const [resubmittedBy, setResubmittedBy] = useState('');
  const [date, setDate] = useState('');
  const [evaluatorLabel, setEvaluatorLabel] = useState('Manager');
  const [showRejectSuccess, setShowRejectSuccess] = useState(false);

  // Read localStorage only on the client to avoid SSR hydration mismatch.
  useEffect(() => {
    const storedMember = readStoredMember();
    setEvaluatorLabel(ROLE_EVALUATOR_LABEL[storedMember?.role || ''] || 'Manager');
    setDate(readEvaluationDate());
  }, []);

  // Loads the approval so the page can show employee context and member ID.
  useEffect(() => {
    if (!id) return;

    const fetchApproval = async () => {
      try {
        const response = await getApproval(id);
        setApproval(response.data);
        // Pre-fill resubmittedBy with the employee name from the approval record.
        if (response.data?.employee) setResubmittedBy(response.data.employee);
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          router.push(routes.rejection);
          return;
        }
        console.error('Error fetching rejected approval:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApproval();
  }, [id]);

  // Chooses the best available member ID for returning to the evaluate page.
  const resolvedMemberId = approval?.team_member_id || memberId;

  // Persists the rejection status and comments, then shows the rejection success overlay.
  const handleReject = async () => {
    try {
      const response = await updateApproval(id, { status: 'rejected', comments, resubmittedBy, date });
      updateStoredApproval({
        ...approval,
        ...response.data,
        id: approval?.id || id,
        employee: approval?.employee || response.data?.employee,
        employee_id: approval?.employee_id || memberId || response.data?.employee_id,
        team_member_id: approval?.team_member_id || memberId || response.data?.team_member_id,
        status: 'rejected',
      });
      setShowRejectSuccess(true);
    } catch (error) {
      console.error('Error rejecting evaluation:', error);
      alert('Error rejecting evaluation');
    }
  };

  // Opens the evaluation form when a member ID exists; otherwise returns to approvals.
  const handleEditResubmit = () => {
    if (resolvedMemberId) {
      saveStoredMember({
        id: resolvedMemberId,
        name: approval?.employee || 'Employee',
        role: approval?.level,
      });
      router.push(`${routes.evaluate}/${resolvedMemberId}`);
      return;
    }

    router.push(routes.approvals);
  };

  if (loading) {
    return <LoadingScreen fullPage />;
  }

  return (
    <div className={viewStyles.v031}>

      {/* Rejection success overlay — mirrors green success overlay but in red. */}
      {showRejectSuccess && (
        <div className={viewStyles.rejectOverlay}>
          <div className={viewStyles.rejectCard}>
            <div className={viewStyles.rejectIconRing}>
              <svg className={viewStyles.rejectSvg} viewBox="0 0 52 52" fill="none">
                <circle
                  className={viewStyles.rejectCircle}
                  cx="26" cy="26" r="24"
                  stroke="#dc2626" strokeWidth="2.5" fill="none"
                />
                <path
                  className={viewStyles.rejectXMark}
                  d="M17 17 L35 35"
                  stroke="#dc2626" strokeWidth="3" strokeLinecap="round"
                />
                <path
                  className={viewStyles.rejectXMark2}
                  d="M35 17 L17 35"
                  stroke="#dc2626" strokeWidth="3" strokeLinecap="round"
                />
              </svg>
            </div>
            <h2 className={viewStyles.rejectTitle}>Evaluation Rejected</h2>
            <p className={viewStyles.rejectSub}>
              The evaluation for <strong>{approval?.employee || 'this member'}</strong> has been rejected and sent back for revision.
            </p>
            <div className={viewStyles.rejectMeta}>
              <span className={viewStyles.rejectMetaItem}>
                <span className={viewStyles.rejectMetaDot} />
                {approval?.employee || 'Employee'}
              </span>
              <span className={viewStyles.rejectMetaItem}>
                <span className={viewStyles.rejectMetaDot} />
                {new Date().toLocaleDateString()}
              </span>
            </div>
            <button
              type="button"
              className={viewStyles.rejectBtn}
              onClick={() => router.push(routes.approvals)}
            >
              Back to Approvals
            </button>
          </div>
        </div>
      )}

      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v136}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={routes.myTeam} className={viewStyles.v035}>
              My Team
            </Link>
            {' > Evaluation Rejected'}
          </div>

          {/* Alert explains that the evaluation is rejected and needs resubmission. */}
          <div className={viewStyles.v163}>
            <div className={viewStyles.v142}>⚠️</div>
            <div>
              <h2 className={viewStyles.v164}>Evaluation Rejected</h2>
              <p className={viewStyles.v165}>The evaluation has been rejected and sent back for re-submission.</p>
            </div>
          </div>

          {/* Editable rejection details and resubmission controls. */}
          <div className={viewStyles.v166}>
            {/* Rejection Comments - Editable */}
            <div>
              <h3 className={viewStyles.v149}>Comments from Approver ({evaluatorLabel})</h3>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className={viewStyles.v167}
                rows={4}
              />
              <p className={viewStyles.v168}>- {approval?.evaluationBy || evaluatorLabel}{date ? ` (${date})` : ''}</p>
            </div>

            {/* Resubmit form captures who is resubmitting and the resubmission date. */}
            <div className={viewStyles.v169}>
              <h3 className={viewStyles.v170}>Re-submit Evaluation</h3>

              <div className={viewStyles.v171}>
                <div>
                  <label className={viewStyles.v172}>Status</label>
                  <div className={viewStyles.v173}>
                    Rejected
                  </div>
                </div>

                <div>
                  <label className={viewStyles.v172}>Re-submitted By</label>
                  <input
                    type="text"
                    value={resubmittedBy}
                    onChange={(e) => setResubmittedBy(e.target.value)}
                    className={viewStyles.v174}
                  />
                </div>

                <div>
                  <label className={viewStyles.v172}>Date</label>
                  <input
                    type="text"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className={viewStyles.v174}
                  />
                </div>
              </div>

              {/* Action buttons navigate back, reject, or reopen the evaluation form. */}
              <div className={viewStyles.v175}>
                <Link href={routes.approvals} className={viewStyles.v176}>
                  Back to Approvals
                </Link>
                <button
                  onClick={handleReject}
                  className={viewStyles.v177}
                >
                  Reject Evaluation
                </button>
                <button
                  onClick={handleEditResubmit}
                  className={viewStyles.v178}
                >
                  Edit & Re-submit
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
