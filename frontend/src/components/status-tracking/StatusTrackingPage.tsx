import viewStyles from '../../styles/views.module.css';
// Status Tracking page: shows the active employee's position inside the approval workflow.
import { useState, useEffect } from 'react';
import Link, { useRouter } from '../../lib/routing';
import { getEvaluationStatus, getTeamMember, getTeamMembers } from '../../lib/api';
import LoadingScreen from '../LoadingScreen';
import { useRoutes } from '../../lib/routing';
import { EVALUATION_DEFAULTS } from '../../lib/constants';
import { readStoredMember, saveStoredMember } from '../../lib/currentMember';
import { formatRole, normalizeStatus } from '../../lib/formatters';
import type { EvaluationStatus, TeamMember } from '../../lib/types';

// Defines which stage names each role should see in their evaluation workflow.
// Each role only sees Self Evaluation + the admin levels above them.
const ROLE_STAGE_NAMES: Record<string, string[]> = {
  hq_admin:       ['Self Evaluation'],
  country_admin:  ['Self Evaluation', 'HQ Admin Finalization'],
  branch_admin:   ['Self Evaluation', 'Country Admin Final Approval', 'HQ Admin Finalization'],
  dept_admin:     ['Self Evaluation', 'Branch Admin Review', 'Country Admin Final Approval', 'HQ Admin Finalization'],
  sub_dept_admin: ['Self Evaluation', 'Dept Admin Approval', 'Branch Admin Review', 'Country Admin Final Approval', 'HQ Admin Finalization'],
  employee:       ['Self Evaluation', 'Sub Dept Admin Evaluation', 'Dept Admin Approval', 'Branch Admin Review', 'Country Admin Final Approval', 'HQ Admin Finalization'],
};

export default function StatusTracking({ forceAllCompleted = false }: { forceAllCompleted?: boolean }) {
  const router = useRouter();
  const routes = useRoutes();
  // Stores the workflow status object returned from the backend.
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus | null>(null);
  // Stores the employee currently being evaluated by the admin.
  const [activeMember, setActiveMember] = useState<TeamMember | null>(null);
  // Controls loading, empty, and loaded states.
  const [loading, setLoading] = useState(true);

  // Loads workflow status for the current employee instead of a hardcoded employee.
  useEffect(() => {
    const fetchStatus = async () => {
      setLoading(true);

      try {
        const routeMemberId = Array.isArray(router.query.memberId)
          ? router.query.memberId[0]
          : router.query.memberId;
        const storedMember = readStoredMember();
        let member: TeamMember | null = null;

        const knownId = routeMemberId || storedMember?.id;

        if (knownId) {
          try {
            // Use the previously stored member (the "past path").
            const [memberResponse, statusResponse] = await Promise.all([
              getTeamMember(knownId),
              getEvaluationStatus(knownId),
            ]);
            member = memberResponse.data;
            saveStoredMember(member);
            setActiveMember(member);
            setEvaluationStatus({
              ...statusResponse.data,
              employee: member.name || statusResponse.data.employee,
            });
            return;
          } catch (err: unknown) {
            const httpStatus = (err as { response?: { status?: number } })?.response?.status;
            if (httpStatus === 404) {
              // Stale stored ID — clear it and fall through to auto-pick a
              // real member from the team list so the page still loads.
              localStorage.removeItem('pms_current_member_id');
              localStorage.removeItem('pms_current_member_name');
              localStorage.removeItem('pms_current_member_role');
            } else {
              throw err;
            }
          }
        }

        // No valid stored member — find the most relevant member from the team
        // list so the page is always useful.
        // normalizeStatus converts "in_progress" → "in progress".
        const membersResponse = await getTeamMembers();
        member =
          membersResponse.data.find((item) => normalizeStatus(item.status) === 'in progress') ||
          membersResponse.data.find((item) => normalizeStatus(item.status) === 'pending') ||
          membersResponse.data[0] ||
          null;

        if (!member?.id) {
          setEvaluationStatus(null);
          setActiveMember(null);
          return;
        }

        // Auto-picked member — set active without overwriting localStorage so a
        // real past selection (saved from My Team) is preserved for next visit.
        setActiveMember(member);

        const statusResponse = await getEvaluationStatus(member.id);
        setEvaluationStatus({
          ...statusResponse.data,
          employee: member.name || statusResponse.data.employee,
        });
      } catch (error) {
        console.error('Error fetching status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [router.query.memberId]);

  if (loading) {
    return <LoadingScreen fullPage />;
  }

  if (!evaluationStatus) {
    return (
    <main className={viewStyles.v032}>
          <div className={viewStyles.v033}>
            <div className={viewStyles.v052}>
              No evaluation status found. Please select a team member from{' '}
              <Link href={routes.myTeam} className={viewStyles.v035}>My Team</Link> first.
            </div>
          </div>
        </main>
    );
  }

  const employeeName = activeMember?.name || evaluationStatus.employee || 'Employee';
  const initials = employeeName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  const allowedStageNames = activeMember?.role ? ROLE_STAGE_NAMES[activeMember.role] : null;
  const displayedStages = allowedStageNames
    ? evaluationStatus.stages.filter(s => allowedStageNames.includes(s.name))
    : evaluationStatus.stages;

  const currentStage = forceAllCompleted
    ? (displayedStages[displayedStages.length - 1]?.name || EVALUATION_DEFAULTS.currentStage)
    : (evaluationStatus.currentStage || EVALUATION_DEFAULTS.currentStage);
  const completedStages = forceAllCompleted
    ? displayedStages
    : displayedStages.filter(s => normalizeStatus(s.status) === 'completed');

  return (
    <main className={viewStyles.v032}>
        <div className={viewStyles.v033}>
          {/* Hero banner with employee avatar */}
          <div className={viewStyles.trackHero}>
            <div className={viewStyles.trackAvatar}>{initials}</div>
            <div className={viewStyles.trackHeroText}>
              <div className={viewStyles.trackName}>{employeeName}</div>
              {activeMember?.role && (
                <div className={viewStyles.trackRole}>{formatRole(activeMember.role)}</div>
              )}
            </div>
            <div className={viewStyles.trackStatusBadge}>
              <span className={viewStyles.trackStatusLabel}>Current Stage</span>
              <span className={viewStyles.trackStatusValue}>{currentStage}</span>
            </div>
          </div>

          <div className={viewStyles.trackLayout}>
            {/* Workflow timeline card */}
            <div className={viewStyles.timelineCard}>
              <h2 className={viewStyles.timelineHeading}>Evaluation Workflow</h2>

              <div>
                {displayedStages.map((stage, idx) => {
                  const status = forceAllCompleted ? 'completed' : normalizeStatus(stage.status);
                  const isCompleted = status === 'completed';
                  const isInProgress = status === 'in progress';
                  const isLast = idx === displayedStages.length - 1;

                  const dotClass = `${viewStyles.trackStageDot} ${
                    isCompleted
                      ? viewStyles.trackStageDotCompleted
                      : isInProgress
                      ? viewStyles.trackStageDotInProgress
                      : viewStyles.trackStageDotDefault
                  }`;

                  const connectorClass = `${viewStyles.trackStageConnector} ${
                    isCompleted
                      ? viewStyles.trackConnectorCompleted
                      : isInProgress
                      ? viewStyles.trackConnectorInProgress
                      : viewStyles.trackConnectorDefault
                  }`;

                  const statusTextClass = `${viewStyles.trackStageStatus} ${
                    isCompleted
                      ? viewStyles.trackStageStatusCompleted
                      : isInProgress
                      ? viewStyles.trackStageStatusInProgress
                      : viewStyles.trackStageStatusDefault
                  }`;

                  return (
                    <div key={idx} className={viewStyles.trackStage}>
                      <div className={viewStyles.trackStageLine}>
                        <div className={dotClass}>
                          {isCompleted ? '✓' : idx + 1}
                        </div>
                        {!isLast && <div className={connectorClass} />}
                      </div>
                      <div className={viewStyles.trackStageContent}>
                        <div className={viewStyles.trackStageName}>{stage.name}</div>
                        <div className={statusTextClass}>{status}</div>
                        <div className={viewStyles.trackStageMeta}>
                          {stage.date && <span className={viewStyles.trackStageDate}>{stage.date}</span>}
                          {stage.user && <span className={viewStyles.trackStageUser}>{stage.user}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Enquiry action sits at the end of the workflow. */}
              <div className={viewStyles.trackEnquiryFooter}>
                <Link
                  href={{
                    pathname: routes.enquiry,
                    query: activeMember?.id ? { memberId: activeMember.id } : {},
                  }}
                  className={viewStyles.trackEnquiryBtn}
                >
                  For Enquiry
                </Link>
              </div>
            </div>

            {/* Side panel summarizes current stage and completed history. */}
            <div className={viewStyles.trackSidePanel}>
              <div className={viewStyles.trackSideCard}>
                <h2 className={viewStyles.trackSideTitle}>Current Stage</h2>
                <div className={viewStyles.trackCurrentStageBox}>
                  <div className={viewStyles.trackCurrentStageName}>{currentStage} (Level 1)</div>
                  <div className={viewStyles.trackCurrentStageStatus}>{forceAllCompleted ? 'completed' : EVALUATION_DEFAULTS.currentStatus}</div>
                </div>
              </div>

              <div className={viewStyles.trackSideCard}>
                <h2 className={viewStyles.trackSideTitle}>History</h2>
                {completedStages.length > 0 ? (
                  <div>
                    {completedStages.map((stage, idx) => (
                      <div key={idx} className={viewStyles.trackHistoryItem}>
                        <div className={viewStyles.trackHistoryDot} />
                        <div>
                          <div className={viewStyles.trackHistoryName}>{stage.name}</div>
                          <div className={viewStyles.trackHistoryLabel}>Completed</div>
                          {stage.date && <div className={viewStyles.trackHistoryDate}>{stage.date}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={viewStyles.trackNoHistory}>No completed stages yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
  );
}
