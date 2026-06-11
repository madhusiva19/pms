'use client';

import viewStyles from '../styles/views.module.css';
// Rejection detail page: captures rejection comments and guides the user back to editing.
import Link from '../lib/routing';
import { useRouter } from '../lib/routing';
import { useEffect, useState } from 'react';
import { getApproval, updateApproval } from '../lib/api';
import Sidebar from '../components/Sidebar';
import { ROUTES } from '../lib/constants';
import { saveStoredMember, updateStoredApproval } from '../lib/currentMember';
import type { Approval } from '../types';

export default function RejectionDetail() {
  const router = useRouter();
  // Approval ID comes from the route; member ID can come from query params.
  const { id, memberId } = router.query;
  // Stores the approval record being rejected.
  const [approval, setApproval] = useState<Approval | null>(null);
  // Controls the loading state while approval data is fetched.
  const [loading, setLoading] = useState(true);
  // Stores editable rejection comments from the approver.
  const [comments, setComments] = useState('Please provide more details in the "Teamwork" section and add specific examples of your contributions.');
  // Stores the name shown in the resubmission form.
  const [resubmittedBy, setResubmittedBy] = useState('John Smith');
  // Stores the resubmission date shown in the form.
  const [date, setDate] = useState(new Date().toLocaleDateString());

  // Loads the approval so the page can show employee context and member ID.
  useEffect(() => {
    if (!id) return;

    const fetchApproval = async () => {
      try {
        const response = await getApproval(id);
        setApproval(response.data);
      } catch (error) {
        console.error('Error fetching rejected approval:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApproval();
  }, [id]);

  // Chooses the best available member ID for returning to the evaluate page.
  const resolvedMemberId = approval?.team_member_id || memberId;

  // Persists the rejection status and comments, then returns to approvals.
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
      alert('Evaluation rejected successfully!');
      router.push(ROUTES.approvals);
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
      router.push(`${ROUTES.evaluate}/${resolvedMemberId}`);
      return;
    }

    router.push(ROUTES.approvals);
  };

  if (loading) {
    return <div className={viewStyles.v162}>Loading...</div>;
  }

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v136}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={ROUTES.myTeam} className={viewStyles.v035}>
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
              <h3 className={viewStyles.v149}>Comments from Approver (Manager)</h3>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                className={viewStyles.v167}
                rows={4}
              />
              <p className={viewStyles.v168}>- Admin User (15 May 2024)</p>
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
                    value={approval?.employee || resubmittedBy}
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
                <button
                  onClick={() => router.push(ROUTES.approvals)}
                  className={viewStyles.v176}
                >
                  Back to Approvals
                </button>
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
