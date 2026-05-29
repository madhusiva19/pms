import viewStyles from '../styles/views.module.css';
// Approval detail page.
// This page is the review screen for one submitted evaluation. It loads the
// approval request, finds the matching employee, displays objective scores and
// evaluator feedback, then lets the reviewer approve or reject the evaluation.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '../lib/routing';
import Link from '../lib/routing';
import {
  getApproval,
  getPerformanceRecords,
  getTeamMember,
  updateApproval,
} from '../lib/api';
import Sidebar from '../components/Sidebar';
import { EVALUATION_DEFAULTS, ROUTES } from '../lib/constants';
import { DEFAULT_ADMIN_FEEDBACK, DEFAULT_OBJECTIVES } from '../lib/evaluationDefaults';
import { formatScore, getRatingBadgeClass, valueOrDash } from '../lib/formatters';
import { groupPerformanceRecords, isNumericId } from '../lib/performanceRecords';
import { saveStoredMember, updateStoredApproval } from '../lib/currentMember';
import type { Approval, PerformanceRecord, TeamMember } from '../types';

export default function EvaluationApproval() {
  const router = useRouter();
  // Approval ID comes from /approvals/:id. memberId can come from the query string
  // so the page can load the exact employee connected to the approval.
  const { id, memberId: routeMemberId } = router.query;

  // Stores the approval row being reviewed.
  const [approval, setApproval] = useState<Approval | null>(null);
  // Stores the member connected to the approval.
  const [member, setMember] = useState<TeamMember | null>(null);
  // Stores objective/metric records used in the review table.
  const [performanceRecords, setPerformanceRecords] = useState<PerformanceRecord[]>([]);
  // Stores read-only feedback shown to approvers.
  const [adminFeedback, setAdminFeedback] = useState('');
  // Controls loading and loaded page states.
  const [loading, setLoading] = useState(true);

  // Main loading process for the review page:
  // 1. Get the approval request.
  // 2. Resolve the employee/member ID from the approval or route query.
  // 3. Load employee profile and performance records in parallel.
  // 4. Store all data in state so the review page can render.
  useEffect(() => {
    if (!id) return;

    const fetchApprovalDetails = async () => {
      setLoading(true);
      try {
        // Load the approval first because it contains the employee reference.
        const approvalResponse = await getApproval(id);
        const approvalData = approvalResponse.data;

        // Different database tables may store the employee reference under
        // different column names, so this chooses the first available value.
        const memberId = approvalData.team_member_id || approvalData.member_id || approvalData.memberId || routeMemberId || approvalData.employee_id || approvalData.employeeId || null;

        // Performance records can be linked by member_id or user_id depending on
        // the database table, so choose the safest filter based on ID format.
        const recordsParams = isNumericId(memberId)
          ? { member_id: memberId }
          : { user_id: memberId };

        // These requests are independent after memberId is known, so they run
        // together to reduce waiting time on the review page.
        const recordsPromise = getPerformanceRecords(recordsParams).catch(() => ({ data: [] }));
        const memberPromise = isNumericId(memberId)
          ? getTeamMember(memberId).catch(() => ({ data: null }))
          : Promise.resolve({ data: null });

        const [memberResponse, recordsResponse] = await Promise.all([
          memberPromise,
          recordsPromise,
        ]);

        const memberData = memberResponse.data || {};

        // Store approval details exactly as the backend returns them.
        setApproval(approvalData);
        // Build a complete member object even if the backend cannot return the
        // member row, so the UI can still show a name and role.
        const resolvedMember = {
          ...memberData,
          id: memberData.id || memberId,
          name: approvalData.employee || memberData.name || EVALUATION_DEFAULTS.defaultEmployeeName,
          role: approvalData.level || memberData.role || EVALUATION_DEFAULTS.approvalReviewRole,
        };
        setMember(resolvedMember);
        saveStoredMember(resolvedMember);
        // Store objective/metric rows for the score table.
        setPerformanceRecords(recordsResponse.data || []);
        // Prefer submitted feedback, then member evaluation feedback, then a safe
        // fallback message so the section is never blank.
        setAdminFeedback(
          approvalData.feedback ||
            memberData?.evaluation?.feedback ||
            DEFAULT_ADMIN_FEEDBACK
        );
      } catch (error) {
        console.error('Error fetching approval details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovalDetails();
  }, [id, routeMemberId]);

  // Builds the objective table from real records first. If there are no separate
  // performance record rows, it uses objectives already attached to the member.
  // The final fallback keeps the table layout usable while database data is empty.
  const objectiveGroups = useMemo(() => {
    const recordGroups = groupPerformanceRecords(performanceRecords);
    if (recordGroups.length) return recordGroups;
    return member?.evaluation?.objectives?.length ? member.evaluation.objectives : DEFAULT_OBJECTIVES;
  }, [member, performanceRecords]);

  // Overall score can come from the member row or nested evaluation row.
  // The fallback value keeps the score card stable if the backend field is absent.
  const overallScore = member?.overallScore || member?.evaluation?.overallScore || member?.evaluation?.overall_score || 3.24;

  // Approve process:
  // 1. Update the approval status in the backend.
  // 2. Update local cached approval data so the Approvals page immediately shows
  //    "approved" after redirect.
  // 3. Notify the reviewer and return to the approval list.
  const handleApprove = async () => {
    try {
      const response = await updateApproval(id, { status: 'approved' });
      updateStoredApproval({
        ...approval,
        ...response.data,
        id: approval?.id || id,
        employee: approval?.employee || member?.name || response.data?.employee,
        employee_id: approval?.employee_id || member?.id || response.data?.employee_id,
        team_member_id: approval?.team_member_id || member?.id || response.data?.team_member_id,
        status: 'approved',
      });
      alert('Evaluation approved successfully!');
      router.push(ROUTES.approvals);
    } catch (error) {
      console.error('Error approving evaluation:', error);
      alert('Error approving evaluation');
    }
  };

  // Marks the approval as rejected, updates the local approval cache, then opens
  // the rejection detail page where the reviewer can add comments.
  const handleReject = async () => {
    try {
      const response = await updateApproval(id, { status: 'rejected' });
      updateStoredApproval({
        ...approval,
        ...response.data,
        id: approval?.id || id,
        employee: approval?.employee || member?.name || response.data?.employee,
        employee_id: approval?.employee_id || member?.id || response.data?.employee_id,
        team_member_id: approval?.team_member_id || member?.id || response.data?.team_member_id,
        status: 'rejected',
      });
      router.push({
        pathname: `${ROUTES.rejection}/${id}`,
        query: member?.id && isNumericId(member.id) ? { memberId: member.id } : {},
      });
    } catch (error) {
      console.error('Error rejecting evaluation:', error);
      alert('Error rejecting evaluation');
    }
  };

  if (loading) {
    return <div className={viewStyles.v001}>Loading...</div>;
  }

  if (!approval || !member) {
    return <div className={viewStyles.v001}>Approval not found</div>;
  }

  return (
    <div className={viewStyles.v002}>
      <Sidebar />

      <main className={viewStyles.v003}>
        <div className={viewStyles.v004}>
          {/* Breadcrumb shows where the reviewer is inside the approval workflow. */}
          <div className={viewStyles.v005}>
            <Link href={ROUTES.home} className={viewStyles.v006}>Home</Link>
            <span className={viewStyles.v007}>&gt;</span>
            <Link href={ROUTES.approvals} className={viewStyles.v006}>Approvals</Link>
            <span className={viewStyles.v007}>&gt;</span>
            <span className={viewStyles.v008}>Review Evaluation</span>
          </div>

          <h1 className={viewStyles.v009}>Review Evaluation for Approval</h1>

          {/* Header card identifies the employee and shows the overall score. */}
          <section className={viewStyles.v010}>
            <div>
              {/* Employee identity comes from approval first, then member profile. */}
              <h2 className={viewStyles.v011}>{approval.employee || member.name}</h2>
              <p className={viewStyles.v012}>{approval.level || member.role}</p>
              <p className={viewStyles.v013}>
                Evaluation By: {approval.evaluationBy || EVALUATION_DEFAULTS.evaluatorRole}
              </p>
            </div>

            <div className={viewStyles.v014}>
              <div className={viewStyles.v015}>{formatScore(overallScore)}</div>
              <div className={viewStyles.v016}>Overall Score</div>
            </div>
          </section>

          {/* Read-only objective table lets the approver inspect scoring details. */}
          <section className={viewStyles.v017}>
            <div className={viewStyles.v018}>
              <div className={viewStyles.v019}>
                {/* Fixed grid columns keep the scoring table aligned and easy to scan. */}
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
                    {/* Category header groups related objectives together. */}
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
                          {/* Rating badge color changes based on score value. */}
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

          {/* Feedback panel displays the admin recommendation for the approver. */}
          <section className={viewStyles.v024}>
            <h3 className={viewStyles.v025}>Evaluator Feedback</h3>
            <p className={viewStyles.v026}>{adminFeedback}</p>
          </section>

          {/* Final actions either reject the evaluation or approve it. */}
          <div className={viewStyles.v027}>
            <button
              type="button"
              onClick={handleReject}
              className={viewStyles.v028}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={handleApprove}
              className={viewStyles.v029}
            >
              Approve
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
