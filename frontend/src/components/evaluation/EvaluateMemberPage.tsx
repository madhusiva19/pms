import viewStyles from '../../styles/views.module.css';
// Evaluation page. Group Admin reviews performance records, edits feedback, and submits the evaluation.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '../../lib/routing';
import Link from '../../lib/routing';
import {
  getPerformanceRecords,
  getTeamMember,
  submitEvaluation,
  updateTeamMemberStatus,
} from '../../lib/api';
import Sidebar from '../sidebar/Sidebar';
import { useRoutes } from '../../lib/routing';
import { EVALUATION_DEFAULTS, TEAM_MEMBER_STATUS } from '../../lib/constants';
import { DEFAULT_ADMIN_FEEDBACK, DEFAULT_OBJECTIVES } from '../../lib/evaluationDefaults';
import { formatRole, formatScore, getRatingBadgeClass, valueOrDash } from '../../lib/formatters';
import { readStoredMember, saveLatestApproval, saveStoredMember, saveEvaluationDate } from '../../lib/currentMember';
import { groupPerformanceRecords } from '../../lib/performanceRecords';
import { ROLE_EVALUATOR_LABEL, STORAGE_KEYS } from '../../lib/constants';
import LoadingScreen from '../LoadingScreen';
import type { PerformanceRecord, TeamMember } from '../../lib/types';

// Returns the selected member saved from My Team when it matches the current route.
const readRouteMember = (id: unknown): TeamMember | null => {
  const storedMember = readStoredMember();
  return storedMember?.id && String(storedMember.id) === String(id) ? storedMember : null;
};

interface StoredUser { full_name?: string; role?: string; }

export default function EvaluateMember() {
  const router = useRouter();
  const routes = useRoutes();
  const { id } = router.query;
  const initialMember = readRouteMember(id);
  const [member, setMember] = useState<TeamMember | null>(initialMember);
  const [performanceRecords, setPerformanceRecords] = useState<PerformanceRecord[]>([]);
  const [adminFeedback, setAdminFeedback] = useState(initialMember?.evaluation?.feedback || DEFAULT_ADMIN_FEEDBACK);
  const [loading, setLoading] = useState(!initialMember);
  const [submitting, setSubmitting] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<StoredUser | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  // Read logged-in user and prefetch likely destinations to eliminate button-click delay.
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.user) || 'null') as StoredUser | null;
      setLoggedInUser(stored);
    } catch { /* ignore */ }
    router.prefetch(routes.approvals);
    router.prefetch(routes.myTeam);
  }, [routes.approvals, routes.myTeam]);

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
      saveEvaluationDate(new Date().toLocaleDateString());
      setShowSuccess(true);
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
      router.push(routes.myTeam);
    } catch (error) {
      console.error('Error saving draft:', error);
      alert('Error saving draft');
    }
  };

  if (loading) {
    return <LoadingScreen fullPage />;
  }

  if (!member) {
    return <div className={viewStyles.v001}>Member not found</div>;
  }

  return (
    <div className={viewStyles.v002}>
      {showSuccess && (
        <div className={viewStyles.successOverlay}>
          <div className={viewStyles.successCard}>
            <div className={viewStyles.successIconRing}>
              <svg className={viewStyles.successCheck} viewBox="0 0 52 52" fill="none">
                <circle className={viewStyles.successCircle} cx="26" cy="26" r="24" stroke="#16a34a" strokeWidth="2.5" fill="none" />
                <path className={viewStyles.successTick} d="M14 27l9 9 16-18" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <h2 className={viewStyles.successTitle}>Submitted Successfully!</h2>
            <p className={viewStyles.successSub}>
              Evaluation for <strong>{member.name}</strong> has been submitted and is now pending approval.
            </p>
            <div className={viewStyles.successMeta}>
              <span className={viewStyles.successMetaItem}>
                <span className={viewStyles.successMetaDot} />
                {member.name}
              </span>
              <span className={viewStyles.successMetaItem}>
                <span className={viewStyles.successMetaDot} />
                {new Date().toLocaleDateString()}
              </span>
            </div>
            <button
              type="button"
              className={viewStyles.successBtn}
              onClick={() => router.push(routes.approvals)}
            >
              View Approvals
            </button>
          </div>
        </div>
      )}
      <Sidebar />

      <main className={viewStyles.v003}>
        <div className={viewStyles.v004}>
          <div className={viewStyles.v005}>
            <Link href={routes.home} className={viewStyles.v006}>Home</Link>
            <span className={viewStyles.v007}>›</span>
            <Link href={routes.myTeam} className={viewStyles.v006}>My Team</Link>
            <span className={viewStyles.v007}>›</span>
            <span className={viewStyles.v008}>{member.name}</span>
          </div>

          <h1 className={viewStyles.v009}>Evaluate Team Member</h1>

          {/* Member summary card shows who is being evaluated and the overall score. */}
          <section className={viewStyles.v010}>
            <div>
              <h2 className={viewStyles.v011}>{member.name}</h2>
              <p className={viewStyles.v012}>{formatRole(member.role)}</p>
              <p className={viewStyles.v013}>
                Period: {member?.evaluation?.period || member?.evaluation?.evaluation_period || EVALUATION_DEFAULTS.period}
              </p>
              <p className={viewStyles.v013}>
                Evaluated By: {loggedInUser?.full_name || 'Admin'} ({ROLE_EVALUATOR_LABEL[member.role] || 'Admin'})
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
                          <span className={`${viewStyles.v030} ${(viewStyles as Record<string,string>)[getRatingBadgeClass(item.rating)]}`}>
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
              rows={6}
              placeholder="Write your evaluation feedback here…"
              className={viewStyles.v074}
            />
            <div className={viewStyles.feedbackFooter}>
              <span className={viewStyles.feedbackHint}>Auto-saved with submission</span>
              <span className={viewStyles.feedbackWordCount}>
                {adminFeedback.trim().split(/\s+/).filter(Boolean).length} words · {adminFeedback.length} chars
              </span>
            </div>
          </section>

          {/* AI recommendation panel highlights the next action for the review cycle. */}
          <section className={viewStyles.v075}>
            <div className={viewStyles.v071} style={{ borderBottom: '1px solid rgba(22,163,74,0.18)', marginBottom: '16px', paddingBottom: '12px' }}>
              <h3 className={viewStyles.v076} style={{ marginBottom: 0 }}>AI Recommendation</h3>
              <span className={viewStyles.aiBadge}>Powered by AI</span>
            </div>
            <div className={viewStyles.aiActions}>
              <div className={viewStyles.aiActionItem}>
                <span className={viewStyles.aiActionNum}>1</span>
                <span className={viewStyles.aiActionText}>Focus the next review cycle on the lowest scoring objectives and set measurable improvement targets.</span>
              </div>
              <div className={viewStyles.aiActionItem}>
                <span className={viewStyles.aiActionNum}>2</span>
                <span className={viewStyles.aiActionText}>Schedule a mid-cycle check-in to track progress and adjust action plans before the final approval.</span>
              </div>
              <div className={viewStyles.aiActionItem}>
                <span className={viewStyles.aiActionNum}>3</span>
                <span className={viewStyles.aiActionText}>Document agreed action steps with the team member and share a copy for mutual accountability.</span>
              </div>
            </div>
          </section>

          {/* Form actions let the user cancel, save a placeholder draft, or submit. */}
          <div className={viewStyles.v027}>
            <Link href={routes.myTeam} className={viewStyles.v078}>
              Cancel
            </Link>
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
