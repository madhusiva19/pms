import viewStyles from '../../styles/views.module.css';
// Rejection page: shows rejection information and links back to approvals.
import { useState, useEffect } from 'react';
import Link, { useRoutes } from '../../lib/routing';
import Sidebar from '../sidebar/Sidebar';
import { ROLE_EVALUATOR_LABEL } from '../../lib/constants';
import { readStoredMember, readEvaluationDate } from '../../lib/currentMember';

export default function Rejection() {
  const routes = useRoutes();
  const [evaluatorLabel, setEvaluatorLabel] = useState('Manager');
  const [evalDate, setEvalDate] = useState('');

  useEffect(() => {
    const storedMember = readStoredMember();
    setEvaluatorLabel(ROLE_EVALUATOR_LABEL[storedMember?.role || ''] || 'Manager');
    setEvalDate(readEvaluationDate());
  }, []);

  return (
    <div className={viewStyles.v031}>
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

          {/* Alert tells the user that the evaluation was sent back. */}
          <div className={viewStyles.v163}>
            <div className={viewStyles.v142}>⚠️</div>
            <div>
              <h2 className={viewStyles.v164}>Evaluation Rejected</h2>
              <p className={viewStyles.v165}>The evaluation has been rejected and sent back for re-submission.</p>
            </div>
          </div>

          {/* Details card explains the rejection reason and resubmission status. */}
          <div className={viewStyles.v166}>
            {/* Read-only rejection comment from the approver. */}
            <div>
              <h3 className={viewStyles.v149}>Comments from Approver ({evaluatorLabel})</h3>
              <div className={viewStyles.v179}>
                <p className={viewStyles.v180}>
                  Please provide more details in the "Teamwork" section and add specific examples of your contributions.
                </p>
              </div>
              <p className={viewStyles.v168}>- Admin User (15 May 2024)</p>
            </div>

            {/* Read-only resubmission fields shown for context. */}
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
                    defaultValue="John Smith"
                    readOnly
                    className={viewStyles.v181}
                  />
                </div>

                <div>
                  <label className={viewStyles.v172}>Date</label>
                  <input
                    type="text"
                    defaultValue={evalDate}
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
    </div>
  );
}
