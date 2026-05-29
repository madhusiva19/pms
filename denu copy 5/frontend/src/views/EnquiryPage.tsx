import viewStyles from '../styles/views.module.css';
// Enquiry page: lets an employee request re-evaluation from the evaluator's superior.
import { useEffect, useState } from 'react';
import Link, { useRouter } from '../lib/routing';
import { getEvaluationStatus, getTeamMember, getTeamMembers, submitEnquiry } from '../lib/api';
import Sidebar from '../components/Sidebar';
import { EVALUATION_DEFAULTS, ROUTES, TEAM_MEMBER_STATUS } from '../lib/constants';
import { readStoredMember, saveStoredMember } from '../lib/currentMember';
import { normalizeStatus } from '../lib/formatters';
import type { EvaluationStatus, TeamMember } from '../types';

export default function Enquiry() {
  const router = useRouter();
  // Stores the employee who is raising the enquiry.
  const [member, setMember] = useState<TeamMember | null>(() => readStoredMember());
  // Stores the current evaluation status shown in the details section.
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus | null>(null);
  // Stores the evaluator whose superior will receive the enquiry notification.
  const [evaluatorName, setEvaluatorName] = useState<string>(EVALUATION_DEFAULTS.evaluatorName);
  // Stores the reason/complaint entered by the employee.
  const [reason, setReason] = useState('');
  // Stores optional supporting comments for the superior.
  const [additionalComments, setAdditionalComments] = useState('');
  // Controls the page loading state while employee/evaluation context is resolved.
  const [loading, setLoading] = useState(true);
  // Controls the submit button while the enquiry is being sent.
  const [submitting, setSubmitting] = useState(false);

  // Loads the employee and current evaluation details from route, localStorage, or team list.
  useEffect(() => {
    const fetchEnquiryContext = async () => {
      try {
        const routeMemberId = Array.isArray(router.query.memberId)
          ? router.query.memberId[0]
          : router.query.memberId;
        const storedMember = readStoredMember();
        let selectedMember: TeamMember | null = null;

        if (routeMemberId || storedMember?.id) {
          const memberResponse = await getTeamMember(routeMemberId || storedMember?.id);
          selectedMember = memberResponse.data;
        } else {
          const membersResponse = await getTeamMembers();
          selectedMember =
            membersResponse.data.find((item) => normalizeStatus(item.status) === TEAM_MEMBER_STATUS.inProgress) ||
            membersResponse.data[0] ||
            null;
        }

        setMember(selectedMember);
        if (selectedMember) {
          saveStoredMember(selectedMember);
        }

        if (selectedMember?.id) {
          const statusResponse = await getEvaluationStatus(selectedMember.id);
          setEvaluationStatus(statusResponse.data);
          const inProgressStage = statusResponse.data.stages?.find(
            (stage) => normalizeStatus(stage.status) === TEAM_MEMBER_STATUS.inProgress
          );
          if (inProgressStage?.user) {
            setEvaluatorName(inProgressStage.user);
          }
        }
      } catch (error) {
        console.error('Error loading enquiry context:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEnquiryContext();
  }, [router.query.memberId]);

  // Sends the enquiry to the backend, which creates a notification for the superior.
  const handleSubmit = async () => {
    if (!reason.trim()) {
      alert('Please add a reason for the enquiry.');
      return;
    }

    setSubmitting(true);
    try {
      await submitEnquiry({
        employee_id: member?.id,
        employee_name: member?.name,
        employee_role: member?.role,
        evaluator_name: evaluatorName,
        current_stage: evaluationStatus?.currentStage || EVALUATION_DEFAULTS.currentStage,
        current_status: EVALUATION_DEFAULTS.currentStatus,
        reason,
        additional_comments: additionalComments,
        request_type: 're_evaluation',
      });
      alert('Enquiry submitted successfully.');
      router.push({
        pathname: ROUTES.statusTracking,
        query: member?.id ? { memberId: member.id } : {},
      });
    } catch (error) {
      console.error('Error submitting enquiry:', error);
      alert('Error submitting enquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={viewStyles.v052}>Loading...</div>;
  }

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v053}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={ROUTES.statusTracking} className={viewStyles.v035}>
              Status Tracking
            </Link>
            {' > Enquiry'}
          </div>

          <div className={viewStyles.v054}>
            <h1 className={viewStyles.v055}>Evaluation Enquiry</h1>
            <p className={viewStyles.v056}>
              Request a re-evaluation from the direct evaluator's superior.
            </p>
          </div>

          <div className={viewStyles.v057}>
            {/* Employee Details */}
            <section className={viewStyles.v058}>
              <h2 className={viewStyles.v059}>Employee Details</h2>
              <div className={viewStyles.v060}>
                <div>
                  <p className={viewStyles.v061}>Name</p>
                  <p className={viewStyles.v062}>{member?.name || EVALUATION_DEFAULTS.defaultEmployeeName}</p>
                </div>
                <div>
                  <p className={viewStyles.v061}>Role</p>
                  <p className={viewStyles.v062}>{member?.role || EVALUATION_DEFAULTS.defaultEmployeeRole}</p>
                </div>
              </div>
            </section>

            {/* Current Evaluation Details */}
            <section className={viewStyles.v058}>
              <h2 className={viewStyles.v059}>Current Evaluation Details</h2>
              <div className={viewStyles.v060}>
                <div>
                  <p className={viewStyles.v061}>Direct Evaluator</p>
                  <input
                    type="text"
                    value={evaluatorName}
                    onChange={(event) => setEvaluatorName(event.target.value)}
                    className={viewStyles.v063}
                  />
                </div>
                <div>
                  <p className={viewStyles.v061}>Current Stage</p>
                  <p className={viewStyles.v062}>{evaluationStatus?.currentStage || EVALUATION_DEFAULTS.currentStage}</p>
                </div>
                <div>
                  <p className={viewStyles.v061}>Request Type</p>
                  <p className={viewStyles.v062}>Re-evaluation request</p>
                </div>
              </div>
            </section>
          </div>

          {/* Enquiry form */}
          <section className={viewStyles.v064}>
            <div className={viewStyles.v065}>
              <div>
                <label className={viewStyles.v066}>Reason for Enquiry</label>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  rows={5}
                  placeholder="Explain why you are not satisfied with the evaluation..."
                  className={viewStyles.v067}
                />
              </div>

              <div>
                <label className={viewStyles.v066}>Additional Comments</label>
                <textarea
                  value={additionalComments}
                  onChange={(event) => setAdditionalComments(event.target.value)}
                  rows={4}
                  placeholder="Add any supporting context for the superior..."
                  className={viewStyles.v067}
                />
              </div>

              <div className={viewStyles.v068}>
                <button
                  type="button"
                  onClick={() =>
                    router.push({
                      pathname: ROUTES.statusTracking,
                      query: member?.id ? { memberId: member.id } : {},
                    })
                  }
                  className={viewStyles.v069}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={viewStyles.v070}
                >
                  {submitting ? 'Submitting...' : 'Submit Enquiry'}
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
