import viewStyles from '../styles/views.module.css';
// Evaluation page. Group Admin reviews performance records, edits feedback, and submits the evaluation.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '../lib/routing';
import Link from '../lib/routing';
import {
  getPerformanceRecords,
  getTeamMember,
  submitEvaluation,
  updateTeamMemberStatus,
} from '../lib/api';
import Sidebar from '../components/Sidebar';
import { EVALUATION_DEFAULTS, ROUTES, TEAM_MEMBER_STATUS } from '../lib/constants';
import { DEFAULT_ADMIN_FEEDBACK, DEFAULT_OBJECTIVES } from '../lib/evaluationDefaults';
import { formatScore, getRatingBadgeClass, valueOrDash } from '../lib/formatters';
import { readStoredMember, saveLatestApproval, saveStoredMember } from '../lib/currentMember';
import { groupPerformanceRecords } from '../lib/performanceRecords';
import type { PerformanceRecord, TeamMember } from '../types';

// Returns the selected member saved from My Team when it matches the current route.
const readRouteMember = (id: unknown): TeamMember | null => {
  const storedMember = readStoredMember();
  return storedMember?.id && String(storedMember.id) === String(id) ? storedMember : null;
};

export default function EvaluateMember() {
  const router = useRouter();
  // Member ID comes from the route path: /evaluate/:id.
  const { id } = router.query;
  const initialMember = readRouteMember(id);
  // Stores the selected member profile and evaluation metadata.
  const [member, setMember] = useState<TeamMember | null>(initialMember);
  // Stores performance records that become the objective table.
  const [performanceRecords, setPerformanceRecords] = useState<PerformanceRecord[]>([]);
  // Stores editable feedback text submitted with the evaluation.
  const [adminFeedback, setAdminFeedback] = useState(initialMember?.evaluation?.feedback || DEFAULT_ADMIN_FEEDBACK);
  // Controls loading and loaded page states.
  const [loading, setLoading] = useState(!initialMember);
  // Prevents duplicate submissions while the backend creates the approval request.
  const [submitting, setSubmitting] = useState(false);

  // Loads the member and performance records required to build the evaluation form.
  useEffect(() => {
    if (!id) return;

    const fetchEvaluationTemplate = async () => {
      const savedMember = readRouteMember(id);
      setLoading(!savedMember);
      try {
        const memberResponse = await getTeamMember(id);
        const memberData = memberResponse.data;
        setMember(memberData);
        saveStoredMember(memberData);
        setAdminFeedback(memberData?.evaluation?.feedback || DEFAULT_ADMIN_FEEDBACK);
        setLoading(false);

        const recordsResponse = await getPerformanceRecords({ member_id: id });
        setPerformanceRecords(recordsResponse.data || []);
      } catch (error) {
        console.error('Error fetching evaluation template:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvaluationTemplate();
  }, [id]);

  // Uses real performance records when available; otherwise falls back to demo objectives.
  const objectiveGroups = useMemo(() => {
    const recordGroups = groupPerformanceRecords(performanceRecords);
    if (recordGroups.length) return recordGroups;
    return member?.evaluation?.objectives?.length ? member.evaluation.objectives : DEFAULT_OBJECTIVES;
  }, [member, performanceRecords]);

  const overallScore = member?.overallScore || member?.evaluation?.overallScore || member?.evaluation?.overall_score || 3.24;

  // Submits the completed evaluation to the backend, then opens the approvals page.
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const response = await submitEvaluation({
        employee_id: id,
        member_id: id,
        period: member?.evaluation?.period || member?.evaluation?.evaluation_period || EVALUATION_DEFAULTS.period,
        overallScore,
        feedback: adminFeedback,
        evaluationBy: EVALUATION_DEFAULTS.evaluatorRole,
        level: EVALUATION_DEFAULTS.approvalLevel,
        status: 'submitted',
      });

      saveLatestApproval({
        ...response.data.approval,
        employee: member?.name || response.data.approval?.employee,
        team_member_id: member?.id || id,
        employee_id: member?.id || id,
      });
      alert('Evaluation submitted successfully!');
      router.push(ROUTES.approvals);
    } catch (error) {
      console.error('Error submitting evaluation:', error);
      alert('Error submitting evaluation');
    } finally {
      setSubmitting(false);
    }
  };

  // Saves the evaluation as a draft by moving the member into the "in process" status.
  // My Team refetches members after navigation, so its status badge and summary counts update.
  const handleSaveDraft = async () => {
    try {
      await updateTeamMemberStatus(id, TEAM_MEMBER_STATUS.inProgress);
      router.push(ROUTES.myTeam);
    } catch (error) {
      console.error('Error saving draft:', error);
      alert('Error saving draft');
    }
  };

  if (loading) {
    return <div className={viewStyles.v001}>Loading...</div>;
  }

  if (!member) {
    return <div className={viewStyles.v001}>Member not found</div>;
  }

  return (
    <div className={viewStyles.v002}>
      <Sidebar />

      <main className={viewStyles.v003}>
        <div className={viewStyles.v004}>
          <div className={viewStyles.v005}>
            <Link href={ROUTES.home} className={viewStyles.v006}>Home</Link>
            <span className={viewStyles.v007}>›</span>
            <Link href={ROUTES.myTeam} className={viewStyles.v006}>My Team</Link>
            <span className={viewStyles.v007}>›</span>
            <span className={viewStyles.v008}>{member.name}</span>
          </div>

          <h1 className={viewStyles.v009}>Evaluate Team Member</h1>

          {/* Member summary card shows who is being evaluated and the overall score. */}
          <section className={viewStyles.v010}>
            <div>
              <h2 className={viewStyles.v011}>{member.name}</h2>
              <p className={viewStyles.v012}>{member.role}</p>
              <p className={viewStyles.v013}>
                Period: {member?.evaluation?.period || member?.evaluation?.evaluation_period || EVALUATION_DEFAULTS.period}
              </p>
            </div>

            <div className={viewStyles.v014}>
              <div className={viewStyles.v015}>{formatScore(overallScore)}</div>
              <div className={viewStyles.v016}>Overall Score</div>
            </div>
          </section>

          {/* Objective table displays targets, actuals, achievement percentage, and rating. */}
          <section className={viewStyles.v017}>
            <div className={viewStyles.v018}>
              <div className={viewStyles.v019}>
                <div className={viewStyles.v020}>
                  <div>Objective</div>
                  <div>Weight</div>
                  <div>Target</div>
                  <div>Actual</div>
                  <div>Achieve %</div>
                  <div>Rating</div>
                </div>

                {objectiveGroups.map((group) => (
                  <div key={group.category}>
                    <div className={viewStyles.v021}>
                      {group.category}
                    </div>
                    {group.items.map((item, index) => (
                      <div
                        key={`${group.category}-${item.name}-${index}`}
                        className={viewStyles.v022}
                      >
                        <div className={viewStyles.v023}>{item.name}</div>
                        <div>{valueOrDash(item.weight)}</div>
                        <div>{valueOrDash(item.target)}</div>
                        <div>{valueOrDash(item.actual)}</div>
                        <div>{valueOrDash(item.achieve)}{valueOrDash(item.achieve) !== '-' ? '%' : ''}</div>
                        <div>
                          <span className={`${viewStyles.v030} ${getRatingBadgeClass(item.rating)}`}>
                            {formatScore(item.rating)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Editable feedback box stores the final admin comment submitted with the evaluation. */}
          <section className={viewStyles.v024}>
            <div className={viewStyles.v071}>
              <h3 className={viewStyles.v072}>Evaluator Feedback</h3>
              <button
                type="button"
                onClick={() => setAdminFeedback('')}
                className={viewStyles.v073}
                aria-label="Clear feedback"
              >
                ×
              </button>
            </div>
            <textarea
              value={adminFeedback}
              onChange={(event) => setAdminFeedback(event.target.value)}
              rows={5}
              className={viewStyles.v074}
            />
          </section>

          {/* AI recommendation panel highlights the next action for the review cycle. */}
          <section className={viewStyles.v075}>
            <h3 className={viewStyles.v076}>AI Recommendation</h3>
            <p className={viewStyles.v077}>
              Focus the next review cycle on the lowest scoring objectives, set measurable improvement actions,
              and schedule a follow-up checkpoint with the team member before final approval.
            </p>
          </section>

          {/* Form actions let the user cancel, save a placeholder draft, or submit. */}
          <div className={viewStyles.v027}>
            <button
              type="button"
              onClick={() => router.push(ROUTES.myTeam)}
              className={viewStyles.v078}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveDraft}
              className={viewStyles.v079}
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={viewStyles.v080}
            >
              {submitting ? 'Submitting...' : 'Submit Evaluation'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
