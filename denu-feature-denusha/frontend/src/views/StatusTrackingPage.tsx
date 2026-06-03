import viewStyles from '../styles/views.module.css';
// Status Tracking page: shows the active employee's position inside the approval workflow.
import { useState, useEffect } from 'react';
import Link, { useRouter } from '../lib/routing';
import { getEvaluationStatus, getTeamMember, getTeamMembers } from '../lib/api';
import Sidebar from '../components/Sidebar';
import { EVALUATION_DEFAULTS, ROUTES, TEAM_MEMBER_STATUS } from '../lib/constants';
import { readStoredMember, saveStoredMember } from '../lib/currentMember';
import { normalizeStatus } from '../lib/formatters';
import type { EvaluationStatus, TeamMember } from '../types';

export default function StatusTracking() {
  const router = useRouter();
  // Stores the workflow status object returned from the backend.
  const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus | null>(null);
  // Stores the employee currently being evaluated by the admin.
  const [activeMember, setActiveMember] = useState<TeamMember | null>(() => readStoredMember());
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

        if (routeMemberId || storedMember?.id) {
          const memberResponse = await getTeamMember(routeMemberId || storedMember?.id);
          member = memberResponse.data;
        } else {
          const membersResponse = await getTeamMembers();
          member =
            membersResponse.data.find((item) => normalizeStatus(item.status) === TEAM_MEMBER_STATUS.inProgress) ||
            membersResponse.data[0] ||
            null;
        }

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
      } catch (error) {
        console.error('Error fetching status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [router.query.memberId]);

  // Returns CSS module classes used by the workflow timeline for each stage status.
  const getStageColor = (status?: string) => {
    switch (normalizeStatus(status)) {
      case 'completed':
        return { text: viewStyles.stageTextCompleted, dot: viewStyles.stageDotCompleted };
      case 'in progress':
        return { text: viewStyles.stageTextInProgress, dot: viewStyles.stageDotInProgress };
      default:
        return { text: viewStyles.stageTextDefault, dot: viewStyles.stageDotDefault };
    }
  };

  if (loading) {
    return <div className={viewStyles.v052}>Loading...</div>;
  }

  if (!evaluationStatus) {
    return <div className={viewStyles.v052}>Status not found</div>;
  }

  const employeeName = activeMember?.name || evaluationStatus.employee || 'Employee';

  return (
    <div className={viewStyles.v031}>
      <Sidebar />

      <main className={viewStyles.v032}>
        <div className={viewStyles.v033}>
          {/* Breadcrumb */}
          <div className={viewStyles.v034}>
            <Link href={ROUTES.myTeam} className={viewStyles.v035}>
              My Team
            </Link>
            {' > Status Tracking'}
          </div>

          {/* Header */}
          <h1 className={viewStyles.v036}>Evaluation Status - {employeeName}</h1>
          {activeMember?.role && <p className={viewStyles.v182}>{activeMember.role}</p>}

          <div className={viewStyles.v183}>
            {/* Workflow timeline renders every stage and connects it with vertical progress lines. */}
            <div className={viewStyles.v184}>
              <div className={viewStyles.v185}>
                <h2 className={viewStyles.v186}>Evaluation Workflow</h2>

                <div className={viewStyles.v065}>
                  {evaluationStatus.stages.map((stage, idx) => {
                    const color = getStageColor(stage.status);
                    return (
                      <div key={idx} className={viewStyles.v187}>
                        <div className={viewStyles.v188}>
                          <div className={`${viewStyles.v202} ${color.dot}`}>
                            {normalizeStatus(stage.status) === 'completed' ? '✓' : idx + 1}
                          </div>
                          {idx < evaluationStatus.stages.length - 1 && (
                            <div className={`${viewStyles.v203} ${color.dot}`}></div>
                          )}
                        </div>
                        <div className={viewStyles.v189}>
                          <h3 className={viewStyles.v094}>{stage.name}</h3>
                          <p className={`${viewStyles.v204} ${color.text}`}>{normalizeStatus(stage.status)}</p>
                          {stage.date && <p className={viewStyles.v190}>{stage.date}</p>}
                          {stage.user && <p className={viewStyles.v191}>{stage.user}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Enquiry action sits at the end of the workflow for employees who need re-evaluation. */}
                <div className={viewStyles.v192}>
                  <Link
                    href={{
                      pathname: ROUTES.enquiry,
                      query: activeMember?.id ? { memberId: activeMember.id } : {},
                    }}
                    className={viewStyles.v193}
                  >
                    For Enquiry
                  </Link>
                </div>
              </div>
            </div>

            {/* Side panel summarizes the current stage and completed history. */}
            <div className={viewStyles.v065}>
              <div className={viewStyles.v148}>
                <h2 className={viewStyles.v194}>Current Stage</h2>
                <div className={viewStyles.v195}>
                  <p className={viewStyles.v196}>{evaluationStatus.currentStage || EVALUATION_DEFAULTS.currentStage} (Level 1)</p>
                  <p className={viewStyles.v197}>{EVALUATION_DEFAULTS.currentStatus}</p>
                </div>
              </div>

              <div className={viewStyles.v148}>
                <h2 className={viewStyles.v194}>History</h2>
                <div className={viewStyles.v171}>
                  {evaluationStatus.stages
                    .filter((stage) => normalizeStatus(stage.status) === 'completed')
                    .map((stage, idx) => (
                      <div key={idx} className={viewStyles.v198}>
                        <div className={viewStyles.v199}></div>
                        <div>
                          <p className={viewStyles.v200}>{stage.name}</p>
                          <p className={viewStyles.v201}>Completed</p>
                          <p className={viewStyles.v190}>{stage.date}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
