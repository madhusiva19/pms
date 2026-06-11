'use client';

import viewStyles from '../styles/views.module.css';
// Rejection page: shows rejection information and links back to approvals.
import Link from '../lib/routing';
import { useRouter } from '../lib/routing';
import Sidebar from '../components/Sidebar';
import { ROUTES } from '../lib/constants';

export default function Rejection() {
  // Router handles the Back/View Approvals button navigation.
  const router = useRouter();

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
              <h3 className={viewStyles.v149}>Comments from Approver (Manager)</h3>
              <div className={viewStyles.v179}>
                <p className={viewStyles.v180}>
                  Please provide more details in the &quot;Teamwork&quot; section and add specific examples of your contributions.
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
                    defaultValue={new Date().toLocaleDateString()}
                    readOnly
                    className={viewStyles.v181}
                  />
                </div>
              </div>

              {/* Navigation buttons return the user to the approvals workflow. */}
              <div className={viewStyles.v175}>
                <button
                  onClick={() => router.push(ROUTES.approvals)}
                  className={viewStyles.v176}
                >
                  Back to Approvals
                </button>
                <button
                  onClick={() => router.push(ROUTES.approvals)}
                  className={viewStyles.v178}
                >
                  View Approvals
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
