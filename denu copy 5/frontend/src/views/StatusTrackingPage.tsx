import viewStyles from '../styles/views.module.css';
// Status Tracking page: shows the active employee's position inside the approval workflow.
import { useState, useEffect } from 'react';
import Link, { useRouter } from '../lib/routing';
import { getEvaluationStatus, getTeamMember, getTeamMembers } from '../lib/api';
import Sidebar from '../components/Sidebar';
import LoadingScreen from '../components/LoadingScreen';
import { useRoutes } from '../lib/routing';
import { EVALUATION_DEFAULTS, TEAM_MEMBER_STATUS } from '../lib/constants';
import { readStoredMember, saveStoredMember } from '../lib/currentMember';
import { formatRole, normalizeStatus } from '../lib/formatters';
import type { EvaluationStatus, TeamMember } from '../types';

export default function StatusTracking() {
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
          // Fetch member details and evaluation status in parallel since both IDs are known.
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
        } else {
          const membersResponse = await getTeamMembers();
          member =
            membersResponse.data.find((item) => normalizeStatus(item.status) === TEAM_MEMBER_STATUS.inProgress) ||
            membersResponse.data[0] ||
            null;

          if (!member?.id) {
            setEvaluationStatus(null);
            setActiveMember(null);
            return;
          }

          saveStoredMember(member);
          setActiveMember(member);

          const statusResponse = await getEvaluationStatus(member.id);
          setEvaluationStatus({
            ...statusResponse.data,
            employee: member.name || statusResponse.data.employee,
          });
        }
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
    return <div className={viewStyles.v052}>Status not found</div>;
  }

  const employeeName = activeMember?.name || evaluationStatus.employee || 'Employee';
  const initials = employeeName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  const currentStage = evaluationStatus.currentStage || EVALUATION_DEFAULTS.currentStage;
  const completedStages = evaluationStatus.stages.filter(s => normalizeStatus(s.status) === 'completed');

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v033}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={routes.myTeam} className={viewStyles.v035}>
              My Team
            </Link>
            {' > Status Tracking'}
          </div>

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
                {evaluationStatus.stages.map((stage, idx) => {
                  const status = normalizeStatus(stage.status);
                  const isCompleted = status === 'completed';
                  const isInProgress = status === 'in progress';
                  const isLast = idx === evaluationStatus.stages.length - 1;

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
                  <div className={viewStyles.trackCurrentStageStatus}>{EVALUATION_DEFAULTS.currentStatus}</div>
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
    </div>
  );
}
