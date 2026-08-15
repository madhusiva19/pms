import viewStyles from '../../styles/views.module.css';
// Rejection page: shows rejection details for the stored member and links back to approvals.
import { useState, useEffect } from 'react';
import Link, { useRoutes } from '../../lib/routing';
import LoadingScreen from '../LoadingScreen';
import { ROLE_EVALUATOR_LABEL } from '../../lib/constants';
import { readStoredMember, readEvaluationDate } from '../../lib/currentMember';
import { getEvaluationStatus } from '../../lib/api';

export default function Rejection() {
  const routes = useRoutes();
  const [loading, setLoading] = useState(true);
  const [memberName, setMemberName] = useState('');
  const [evaluatorLabel, setEvaluatorLabel] = useState('Manager');
  const [evalDate, setEvalDate] = useState('');
  const [rejectionComments, setRejectionComments] = useState('');

  useEffect(() => {
    const load = async () => {
      const storedMember = readStoredMember();
      setMemberName(storedMember?.name || '');
      setEvaluatorLabel(ROLE_EVALUATOR_LABEL[storedMember?.role || ''] || 'Manager');
      setEvalDate(readEvaluationDate());

      if (storedMember?.id) {
        try {
          const statusResponse = await getEvaluationStatus(storedMember.id);
          const comments = statusResponse.data?.rejectionComments;
          if (comments && typeof comments === 'string') {
            setRejectionComments(comments);
          }
        } catch {
          // No comments available — use generic fallback below
        }
      }

      setLoading(false);
    };

    load();
  }, []);

  if (loading) return <LoadingScreen fullPage />;

  const commentText = rejectionComments ||
    'The evaluation has been rejected. Please review the feedback and re-submit with the required corrections.';
  const approverLine = `${evaluatorLabel}${evalDate ? ' (' + evalDate + ')' : ''}`;

  return (
    <main className={viewStyles.v032}>
        <div className={viewStyles.v136}>
          {/* Alert tells the user that the evaluation was sent back. */}
          <div className={viewStyles.v163}>
            <div className={viewStyles.v142}>⚠️</div>
            <div>
              <p className={viewStyles.v165}>The evaluation has been rejected and sent back for re-submission.</p>
            </div>
          </div>

          {/* Details card explains the rejection reason and resubmission status. */}
          <div className={viewStyles.v166}>
            {/* Rejection comment from the approver. */}
            <div>
              <h3 className={viewStyles.v149}>Comments from Approver ({evaluatorLabel})</h3>
              <div className={viewStyles.v179}>
                <p className={viewStyles.v180}>{commentText}</p>
              </div>
              <p className={viewStyles.v168}>- {approverLine}</p>
            </div>

            {/* Resubmission context fields. */}
            <div className={viewStyles.v169}>
              <h3 className={viewStyles.v170}>Re-submit Evaluation</h3>

              <div className={viewStyles.v171}>
                <div>
                  <label className={viewStyles.v172}>Status</label>
                  <div className={viewStyles.v173}>Rejected</div>
                </div>

                <div>
                  <label className={viewStyles.v172}>Re-submitted By</label>
                  <input
                    type="text"
                    value={memberName}
                    readOnly
                    className={viewStyles.v181}
                  />
                </div>

                <div>
                  <label className={viewStyles.v172}>Date</label>
                  <input
                    type="text"
                    value={evalDate}
                    readOnly
                    className={viewStyles.v181}
                  />
                </div>
              </div>

              {/* Navigation buttons return the user to the approvals workflow. */}
              <div className={viewStyles.v175}>
                <Link href={routes.approvals} className={viewStyles.v176}>
                  Back to Approvals
                </Link>
                <Link href={routes.approvals} className={viewStyles.v178}>
                  View Approvals
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
  );
}
