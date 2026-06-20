import viewStyles from '../styles/views.module.css';
// Enquiry page: lets an employee request re-evaluation from the evaluator's superior.
import { useEffect, useState } from 'react';
import Link, { useRouter } from '../lib/routing';
import { getEvaluationStatus, getTeamMember, getTeamMembers, submitEnquiry } from '../lib/api';
import Sidebar from '../components/Sidebar';
import LoadingScreen from '../components/LoadingScreen';
import { useRoutes } from '../lib/routing';
import { EVALUATION_DEFAULTS, TEAM_MEMBER_STATUS, ROLE_EVALUATOR_LABEL, ROLE_STAGE_LABEL, STORAGE_KEYS } from '../lib/constants';
import { readStoredMember, saveStoredMember } from '../lib/currentMember';
import { formatRole, normalizeStatus } from '../lib/formatters';
import type { EvaluationStatus, TeamMember } from '../types';

interface StoredUser { full_name?: string; role?: string; }

export default function Enquiry() {
  const router = useRouter();
  const routes = useRoutes();
  const [member, setMember] = useState<TeamMember | null>(null);
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus | null>(null);
  const [evaluatorName, setEvaluatorName] = useState<string>(EVALUATION_DEFAULTS.evaluatorName);
  const [reason, setReason] = useState('');
  const [additionalComments, setAdditionalComments] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Read logged-in user once so evaluator name and role label are correct.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || 'null') as StoredUser | null;
      if (stored?.full_name) setEvaluatorName(stored.full_name);
    } catch { /* ignore */ }
  }, []);

  // Loads the employee and current evaluation details from route, localStorage, or team list.
  useEffect(() => {
    const fetchEnquiryContext = async () => {
      try {
        const routeMemberId = Array.isArray(router.query.memberId)
          ? router.query.memberId[0]
          : router.query.memberId;
        const storedMember = readStoredMember();
        let selectedMember: TeamMember | null = null;

        const knownId = routeMemberId || storedMember?.id;

        if (knownId) {
          // Fetch member details and evaluation status in parallel since the ID is known.
          const [memberResponse, statusResponse] = await Promise.all([
            getTeamMember(knownId),
            getEvaluationStatus(knownId),
          ]);
          selectedMember = memberResponse.data;
          setMember(selectedMember);
          saveStoredMember(selectedMember);
          setEvaluationStatus(statusResponse.data);
          const inProgressStage = statusResponse.data.stages?.find(
            (stage) => normalizeStatus(stage.status) === TEAM_MEMBER_STATUS.inProgress
          );
          if (inProgressStage?.user) setEvaluatorName(inProgressStage.user);
        } else {
          const membersResponse = await getTeamMembers();
          selectedMember =
            membersResponse.data.find((item) => normalizeStatus(item.status) === TEAM_MEMBER_STATUS.inProgress) ||
            membersResponse.data[0] ||
            null;
          setMember(selectedMember);
          if (selectedMember) saveStoredMember(selectedMember);

          if (selectedMember?.id) {
            const statusResponse = await getEvaluationStatus(selectedMember.id);
            setEvaluationStatus(statusResponse.data);
            const inProgressStage = statusResponse.data.stages?.find(
              (stage) => normalizeStatus(stage.status) === TEAM_MEMBER_STATUS.inProgress
            );
            if (inProgressStage?.user) setEvaluatorName(inProgressStage.user);
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
        pathname: routes.statusTracking,
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
    return <LoadingScreen fullPage />;
  }

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v053}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={routes.statusTracking} className={viewStyles.v035}>
              Status Tracking
            </Link>
            {' > Enquiry'}
          </div>

          {/* Hero banner */}
          <div className={viewStyles.enquiryHero}>
            <div className={viewStyles.enquiryHeroIcon}>📋</div>
            <div className={viewStyles.enquiryHeroText}>
              <h1>Evaluation Enquiry</h1>
              <p>Request a re-evaluation from the direct evaluator&apos;s superior. Your enquiry will be reviewed promptly.</p>
            </div>
          </div>

          <div className={viewStyles.v057}>
            {/* Employee Details */}
            <section className={viewStyles.v058}>
              <h2 className={viewStyles.v059}>Employee Details</h2>
              <div className={viewStyles.v060}>
                <div>
                  <p className={viewStyles.v061}>Full Name</p>
                  <p className={viewStyles.v062}>{member?.name || EVALUATION_DEFAULTS.defaultEmployeeName}</p>
                </div>
                <div>
                  <p className={viewStyles.v061}>Designation</p>
                  <p className={viewStyles.v062}>{formatRole(member?.role) || EVALUATION_DEFAULTS.defaultEmployeeRole}</p>
                </div>
                <div>
                  <p className={viewStyles.v061}>Employee ID</p>
                  <p className={viewStyles.v062}>{member?.id ? `#${member.id}` : '—'}</p>
                </div>
              </div>
            </section>

            {/* Current Evaluation Details */}
            <section className={viewStyles.v058}>
              <h2 className={viewStyles.v059}>Current Evaluation Details</h2>
              <div className={viewStyles.v060}>
                <div>
                  <p className={viewStyles.v061}>Direct Evaluator</p>
                  <p className={viewStyles.v062}>{evaluatorName}</p>
                  <p className={viewStyles.v061} style={{ marginTop: 2 }}>{ROLE_EVALUATOR_LABEL[member?.role || ''] || 'Admin'}</p>
                </div>
                <div>
                  <p className={viewStyles.v061}>Current Stage</p>
                  <p className={viewStyles.v062}>
                    {evaluationStatus?.currentStage || ROLE_STAGE_LABEL[member?.role || ''] || EVALUATION_DEFAULTS.currentStage}
                  </p>
                </div>
                <div>
                  <p className={viewStyles.v061}>Request Type</p>
                  <p className={viewStyles.v062}>Re-evaluation Request</p>
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
                      pathname: routes.statusTracking,
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
