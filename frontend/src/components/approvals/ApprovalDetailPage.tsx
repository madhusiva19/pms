import viewStyles from '../../styles/views.module.css';
// Approval detail page.
// This page is the review screen for one submitted evaluation. It loads the
// approval request, finds the matching employee, displays objective scores and
// evaluator feedback, then lets the reviewer approve or reject the evaluation.
import { useEffect, useState } from 'react';
import { useRouter } from '../../lib/routing';
import Link from '../../lib/routing';
import {
  getApproval,
  getObjectives,
  getTeamMember,
  updateApproval,
} from '../../lib/api';
import LoadingScreen from '../LoadingScreen';
import { useRoutes } from '../../lib/routing';
import { EVALUATION_DEFAULTS, ROLE_EVALUATOR_LABEL } from '../../lib/constants';
import { formatRole, formatScore, getRatingBadgeClass, valueOrDash } from '../../lib/formatters';
import { isNumericId } from '../../lib/performanceRecords';
import { saveStoredMember, updateStoredApproval } from '../../lib/currentMember';
import type { Approval, EvaluationRecord, EvaluationSummary, ObjectiveGroup, TeamMember } from '../../lib/types';

export default function EvaluationApproval() {
  const router = useRouter();
  const routes = useRoutes();
  // Approval ID comes from /approvals/:id. memberId can come from the query string
  // so the page can load the exact employee connected to the approval.
  const { id, memberId: routeMemberId } = router.query;

  const [approval, setApproval]     = useState<Approval | null>(null);
  const [member, setMember]         = useState<TeamMember | null>(null);
  const [dbGroups, setDbGroups]     = useState<ObjectiveGroup[]>([]);
  const [summary, setSummary]       = useState<EvaluationSummary>({});
  const [evalRec, setEvalRec]       = useState<EvaluationRecord>({});
  const [noRecords, setNoRecords]   = useState(false);
  const [adminFeedback, setAdminFeedback] = useState('');
  const [loading, setLoading]       = useState(true);
  const [showApproveSuccess, setShowApproveSuccess] = useState(false);

  // Pre-warm approvals and rejection pages so button clicks feel instant.
  useEffect(() => {
    router.prefetch(routes.approvals);
    router.prefetch(routes.rejection);
  }, [routes.approvals, routes.rejection]);

  // Main loading process for the review page:
  // 1. Get the approval request.
  // 2. Resolve the numeric team member ID and fetch their profile (for user_id).
  // 3. Query performance records by user_id — the only column records are linked by.
  // 4. Store all data in state so the review page can render.
  useEffect(() => {
    if (!id) return;

    const fetchApprovalDetails = async () => {
      setLoading(true);
      try {
        const approvalResponse = await getApproval(id);
        const approvalData = approvalResponse.data;

        const numericId =
          approvalData.team_member_id ||
          approvalData.member_id ||
          (isNumericId(routeMemberId) ? routeMemberId : null) ||
          null;

        let memberData: Partial<TeamMember> = {};
        if (numericId && isNumericId(numericId)) {
          try {
            const memberResponse = await getTeamMember(numericId);
            memberData = memberResponse.data ?? {};
          } catch {
            memberData = {};
          }
        }

        // ── Same getObjectives call as EvaluateMemberPage ──────────────────
        const params: Record<string, string> = {};
        if (memberData.user_id) params.user_id = String(memberData.user_id);
        if (isNumericId(numericId)) params.team_member_id = String(numericId);

        try {
          const { data } = await getObjectives(params);
          setDbGroups(data.groups ?? []);
          setSummary(data.summary ?? {});
          setEvalRec(data.evaluation ?? {});
          setNoRecords((data.groups ?? []).length === 0);
          setAdminFeedback(
            data.evaluation?.feedback ??
            (memberData?.evaluation?.feedback as string | undefined) ??
            ''
          );
        } catch {
          setNoRecords(true);
          setAdminFeedback(
            (memberData?.evaluation?.feedback as string | undefined) ?? ''
          );
        }

        setApproval(approvalData);
        const resolvedMember = {
          ...memberData,
          id: memberData.id || numericId || approvalData.employee_id,
          name: approvalData.employee || memberData.name || EVALUATION_DEFAULTS.defaultEmployeeName,
          role: memberData.role || EVALUATION_DEFAULTS.approvalReviewRole,
        };
        setMember(resolvedMember);
        saveStoredMember(resolvedMember);
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404) { router.push(routes.approvals); return; }
        console.error('Error fetching approval details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchApprovalDetails();
  }, [id, routeMemberId]);

  const objectiveGroups: ObjectiveGroup[] = dbGroups;

  const overallScore =
    (summary as { total_score?: number }).total_score ??
    (evalRec as { overall_score?: number }).overall_score ??
    member?.overallScore ??
    member?.evaluation?.overallScore ??
    0;

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
      setShowApproveSuccess(true);
    } catch (error) {
      console.error('Error approving evaluation:', error);
      alert('Error approving evaluation');
    }
  };

  // Navigate to the rejection detail page where the reviewer adds comments.
  // The actual status update (PUT /approvals/:id with comments) happens there
  // in one API call, so comments are always included with the rejection.
  const handleReject = () => {
    router.push({
      pathname: `${routes.rejection}/${id}`,
      query: member?.id && isNumericId(member.id) ? { memberId: member.id } : {},
    });
  };

  if (loading) {
    return <LoadingScreen fullPage />;
  }

  if (!approval || !member) {
    return <div className={viewStyles.v001}>Approval not found</div>;
  }

  return (
    <>
    <main className={viewStyles.v003}>
        <div className={viewStyles.v004}>
          {/* Breadcrumb shows where the reviewer is inside the approval workflow. */}
          <div className={viewStyles.v005}>
            <Link href={routes.home} className={viewStyles.v006}>Home</Link>
            <span className={viewStyles.v007}>&gt;</span>
            <Link href={routes.approvals} className={viewStyles.v006}>Approvals</Link>
            <span className={viewStyles.v007}>&gt;</span>
            <span className={viewStyles.v008}>Review Evaluation</span>
          </div>

          <h1 className={viewStyles.v009}>Review Evaluation for Approval</h1>

          {/* Header card identifies the employee and shows the overall score. */}
          <section className={viewStyles.v010}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div className={viewStyles.approvalAvatar} style={{ width: 52, height: 52, fontSize: 18, borderRadius: 14, flexShrink: 0 }}>
                {(approval.employee || member.name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className={viewStyles.v011}>{approval.employee || member.name}</h2>
                <p className={viewStyles.v012}>{formatRole(member.role)}</p>
                <p className={viewStyles.v013}>
                  Evaluated By: {(member.role && ROLE_EVALUATOR_LABEL[member.role]) || EVALUATION_DEFAULTS.evaluatorRole}
                </p>
              </div>
            </div>

            <div className={viewStyles.v014}>
              <div className={viewStyles.v015}>{formatScore(overallScore)}</div>
              <div className={viewStyles.v016}>Overall Score</div>
            </div>
          </section>

          {noRecords && (
            <div className={viewStyles.v140} style={{ marginBottom: '1rem', background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
              ⚠️ Performance records could not be loaded — showing template data. The actual scores may differ.
            </div>
          )}

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

                {objectiveGroups.map((group: ObjectiveGroup) => (
                  <div key={group.category}>
                    <div className={viewStyles.v021}>{group.category}</div>
                    {group.items.map((item: ObjectiveGroup['items'][number], index: number) => (
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
                          <span className={[viewStyles.v030, (viewStyles as Record<string, string>)[getRatingBadgeClass(item.rating) ?? ''] ?? ''].filter(Boolean).join(' ')}>
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
            <div className={viewStyles.v071}>
              <h3 className={viewStyles.v072}>Evaluator Feedback</h3>
              <button
                type="button"
                className={viewStyles.v073}
                onClick={() => setAdminFeedback('')}
                title="Clear"
              >
                ×
              </button>
            </div>
            <textarea
              className={viewStyles.v074}
              rows={5}
              value={adminFeedback}
              onChange={(e) => setAdminFeedback(e.target.value)}
              placeholder="Enter reviewer feedback…"
            />
            <p className={viewStyles.v074CharCount}>{adminFeedback.length} characters</p>
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

      {showApproveSuccess && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(6px)',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{
            width: '100%', maxWidth: '480px', margin: '0 16px',
            borderRadius: '24px',
            background: 'linear-gradient(160deg, #0f172a 0%, #1e293b 100%)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.08)',
            overflow: 'hidden',
            animation: 'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {/* Green accent bar */}
            <div style={{ height: '4px', background: 'linear-gradient(90deg, #16a34a, #4ade80, #22d3ee)' }} />

            <div style={{ padding: '36px 36px 32px' }}>
              {/* Icon */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                <div style={{
                  width: '72px', height: '72px', borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 35%, #22c55e, #15803d)',
                  boxShadow: '0 0 0 12px rgba(34,197,94,0.12), 0 8px 24px rgba(34,197,94,0.30)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>

              {/* Title */}
              <h2 style={{
                margin: '0 0 8px', textAlign: 'center',
                fontSize: '22px', fontWeight: 800, color: '#f1f5f9',
                letterSpacing: '-0.02em',
              }}>
                Evaluation Approved
              </h2>
              <p style={{
                margin: '0 0 24px', textAlign: 'center',
                fontSize: '14px', color: 'rgba(255,255,255,0.50)', lineHeight: 1.5,
              }}>
                The evaluation has been successfully approved.
              </p>

              {/* Member info card */}
              <div style={{
                borderRadius: '14px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '16px 20px',
                marginBottom: '28px',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                gap: '12px',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.45)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Employee</p>
                  <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>{approval.employee || member?.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.40)' }}>{formatRole(member?.role)}</p>
                </div>
                {Number(overallScore) > 0 && (
                  <div style={{
                    minWidth: '64px', height: '64px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #14532d, #16a34a)',
                    border: '1px solid rgba(34,197,94,0.40)',
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{formatScore(overallScore)}</span>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.55)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</span>
                  </div>
                )}
              </div>

              {/* Status pill */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  padding: '7px 16px', borderRadius: '999px',
                  background: 'rgba(34,197,94,0.12)',
                  border: '1px solid rgba(34,197,94,0.30)',
                  color: '#4ade80', fontSize: '12px', fontWeight: 700,
                }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                  Approved
                </div>
              </div>

              {/* Action button */}
              <button
                type="button"
                onClick={() => router.push(routes.approvals)}
                style={{
                  width: '100%', padding: '13px', borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #15803d, #16a34a)',
                  boxShadow: '0 6px 20px rgba(22,163,74,0.40)',
                  color: '#ffffff', fontSize: '14px', fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                  transition: 'all 0.2s',
                }}
              >
                Back to Approvals
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>

          <style>{`
            @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
            @keyframes scaleIn { from { opacity:0; transform:scale(0.85) } to { opacity:1; transform:scale(1) } }
          `}</style>
        </div>
      )}
    </>
  );
}
