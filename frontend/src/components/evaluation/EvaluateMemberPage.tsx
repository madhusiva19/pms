'use client';

/**
 * Evaluate Team Member Page
 *
 * Data sources (in priority order):
 *
 *  Overall Score  → performance_summaries.total_score
 *                   else evaluations.overall_score
 *                   else team_members.overall_score
 *
 *  Period         → performance_summaries.period
 *                   else evaluations.period
 *                   else constant
 *
 *  Feedback       → evaluations.admin_recommendation (pre-fill)
 *
 *  Table columns  → performance_records joined with objectives + categories
 *    OBJECTIVE    → objectives.name
 *    WEIGHT       → performance_records.weight  else  objectives.weight
 *    TARGET       → performance_records.target
 *    ACTUAL       → performance_records.actual
 *    ACHIEVE %    → performance_records.achievement_percentage
 *                   else computed: round(actual / target * 100, 2)
 *    RATING       → performance_records.manual_rating → rating → score
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from '../../lib/routing';
import Link from '../../lib/routing';
import { getApprovals, getObjectives, getTeamMember, submitEvaluation, updateTeamMemberStatus } from '../../lib/api';
import LoadingScreen from '../LoadingScreen';
import { useRoutes } from '../../lib/routing';
import { EVALUATION_DEFAULTS, ROLE_EVALUATOR_LABEL } from '../../lib/constants';
import { formatRole, formatScore, getRatingBadgeClass, valueOrDash } from '../../lib/formatters';
import { isNumericId } from '../../lib/performanceRecords';
import { saveStoredMember } from '../../lib/currentMember';
import viewStyles from '../../styles/views.module.css';
import type {
  EvaluationRecord,
  EvaluationSummary,
  ObjectiveGroup,
  TeamMember,
} from '../../lib/types';

export default function EvaluateMemberPage() {
  const router = useRouter();
  const routes = useRoutes();
  const { id } = router.query;

  const [member, setMember]     = useState<TeamMember | null>(null);
  const [dbGroups, setDbGroups] = useState<ObjectiveGroup[]>([]);
  const [summary, setSummary]   = useState<EvaluationSummary>({});
  const [evalRec, setEvalRec]   = useState<EvaluationRecord>({});
  const [noRecords, setNoRecords]   = useState(false);
  const [templateAssigned, setTemplateAssigned] = useState(true);
  const [adminFeedback, setAdminFeedback] = useState('');
  const [loading, setLoading]             = useState(true);
  const [submitting, setSubmitting]       = useState(false);
  const [savingDraft, setSavingDraft]     = useState(false);
  const [showSuccess, setShowSuccess]     = useState(false);
  const [showDraftSaved, setShowDraftSaved] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    router.prefetch(routes.myTeam);
    router.prefetch(routes.approvals);
  }, [routes.myTeam, routes.approvals]);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);
      try {
        // ── 1. Load team member (get user_id UUID) ──────────────────────────
        const { data: memberData } = await getTeamMember(id);
        const member_: TeamMember = memberData ?? { id, name: '' };
        setMember(member_);
        saveStoredMember(member_);

        // ── 2. Load objectives + performance_records + summaries + evaluation ─
        const params: Record<string, string> = {};
        // user_id (UUID) is the primary FK in performance_records and summaries
        if (member_.user_id) params.user_id = String(member_.user_id);
        // team_member_id (bigint) is the secondary FK
        if (isNumericId(id)) params.team_member_id = String(id);

        try {
          const { data } = await getObjectives(params);

          setDbGroups(data.groups ?? []);
          setSummary(data.summary ?? {});
          setEvalRec(data.evaluation ?? {});
          setNoRecords((data.groups ?? []).length === 0);
          setTemplateAssigned(data.template_assigned ?? true);

          // Pre-fill feedback from evaluations.admin_recommendation
          setAdminFeedback(
            data.evaluation?.feedback ??
            (member_.evaluation?.feedback as string | undefined) ??
            ''
          );
        } catch {
          setNoRecords(true);
          setAdminFeedback(
            (member_.evaluation?.feedback as string | undefined) ?? ''
          );
        }
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 404) { router.push(routes.myTeam); return; }
        console.error('Error loading evaluation data:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id]);

  // ── Derived values ──────────────────────────────────────────────────────

  // OVERALL SCORE: performance_summaries → evaluations → team_members row
  const overallScore =
    summary.total_score ??
    evalRec.overall_score ??
    member?.overallScore ??
    (member?.evaluation?.overallScore as number | undefined) ??
    null;

  // PERIOD: performance_summaries → evaluations → team_members evaluation → constant
  const period =
    summary.period ??
    evalRec.period ??
    (member?.evaluation?.period as string | undefined) ??
    EVALUATION_DEFAULTS.period;

  // EVALUATOR LABEL: derived from the member's role (who evaluates them)
  const evaluatorLabel =
    ROLE_EVALUATOR_LABEL[member?.role as string] ?? EVALUATION_DEFAULTS.evaluatorName;

  // Objective groups: always from the database (performance_records → objectives → categories)
  const objectiveGroups: ObjectiveGroup[] = dbGroups;

  // ── AI insights (derived from loaded performance data) ──────────────────
  const aiInsights = useMemo(() => {
    const allItems = objectiveGroups.flatMap((g) =>
      g.items.map((item) => ({
        ...item,
        category: g.category,
        ratingNum: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
        achieveNum: Number.isFinite(Number(item.achieve)) ? Number(item.achieve) : null,
      }))
    );

    const rated = allItems.filter((i) => i.ratingNum !== null);
    if (!rated.length) return null;

    const avgRating  = rated.reduce((s, i) => s + (i.ratingNum ?? 0), 0) / rated.length;
    const strengths  = [...rated].sort((a, b) => (b.ratingNum ?? 0) - (a.ratingNum ?? 0)).slice(0, 3);
    const gaps       = [...rated].sort((a, b) => (a.ratingNum ?? 0) - (b.ratingNum ?? 0)).slice(0, 3);

    // Category averages
    const catMap: Record<string, number[]> = {};
    rated.forEach((i) => {
      catMap[i.category] = catMap[i.category] || [];
      catMap[i.category].push(i.ratingNum ?? 0);
    });
    const categoryScores = Object.entries(catMap).map(([cat, scores]) => ({
      category: cat,
      avg: scores.reduce((s, v) => s + v, 0) / scores.length,
    }));

    const pctMeetingTarget = allItems.length
      ? Math.round((allItems.filter((i) => (i.achieveNum ?? 0) >= 100).length / allItems.length) * 100)
      : 0;

    let level = 'Needs Improvement';
    let verdict = 'Hold for Review';
    let levelColor = '#dc2626';
    let verdictColor = '#dc2626';
    let verdictBg = 'rgba(220,38,38,0.15)';

    if (avgRating >= 4.5) {
      level = 'Outstanding'; verdict = 'Strongly Recommend Approval';
      levelColor = '#16a34a'; verdictColor = '#16a34a'; verdictBg = 'rgba(22,163,74,0.15)';
    } else if (avgRating >= 3.5) {
      level = 'Exceeds Expectations'; verdict = 'Recommend Approval';
      levelColor = '#2563eb'; verdictColor = '#2563eb'; verdictBg = 'rgba(37,99,235,0.15)';
    } else if (avgRating >= 2.5) {
      level = 'Meets Expectations'; verdict = 'Conditionally Approve';
      levelColor = '#ca8a04'; verdictColor = '#ca8a04'; verdictBg = 'rgba(202,138,4,0.15)';
    } else if (avgRating >= 1.5) {
      level = 'Below Expectations'; verdict = 'Review Required';
      levelColor = '#ea580c'; verdictColor = '#ea580c'; verdictBg = 'rgba(234,88,12,0.15)';
    }

    return { avgRating, level, levelColor, verdict, verdictColor, verdictBg, strengths, gaps, categoryScores, pctMeetingTarget };
  }, [objectiveGroups]);

  // ── Submit handler ──────────────────────────────────────────────────────

  const handleSubmit = () => {
    if (!member || submitting) return;
    setSubmitting(true);
    setShowSuccess(true);
    submitEvaluation({
      team_member_id:  member.id,
      employee:        member.name,
      employee_id:     member.user_id ?? member.id,
      feedback:        adminFeedback,
      objectives:      objectiveGroups,
      overall_score:   overallScore,
      period,
      evaluation_id:   evalRec.id,
      status:          'pending',
    }).then(() => {
      // Pre-warm the approvals cache while the user reads the success modal.
      getApprovals().catch(() => {});
    }).catch((error) => {
      console.error('Error submitting evaluation:', error);
    }).finally(() => {
      setSubmitting(false);
    });
  };

  // ── Save Draft handler ──────────────────────────────────────────────────

  const handleSaveDraft = () => {
    if (!member || savingDraft) return;
    setSavingDraft(true);
    setShowDraftSaved(true);
    submitEvaluation({
      team_member_id: member.id,
      employee:       member.name,
      employee_id:    member.user_id ?? member.id,
      feedback:       adminFeedback,
      objectives:     objectiveGroups,
      overall_score:  overallScore,
      period,
      evaluation_id:  evalRec.id,
      status:         'draft',
    }).then(() => {
      updateTeamMemberStatus(member.id, 'in progress').catch(() => {});
    }).catch((error) => {
      console.error('Error saving draft:', error);
    }).finally(() => {
      setSavingDraft(false);
    });
  };

  if (loading) return <LoadingScreen />;
  if (!member)  return <div className={viewStyles.v001}>Member not found</div>;

  return (
    <>
    <main className={viewStyles.v003}>
        <div className={viewStyles.v004}>

          {/* ── Member header card ─────────────────────────────────────────── */}
          <section className={viewStyles.v010}>
            <div>
              <h2 className={viewStyles.v011}>{member.name}</h2>
              {/* Role badge */}
              <p className={viewStyles.v012}>{formatRole(member.role)}</p>
              {/* Period — performance_summaries.period else evaluations.period */}
              <p className={viewStyles.v013}>Period: {period}</p>
              {/* Evaluator label derived from member role */}
              <p className={viewStyles.v013}>Evaluated By: {evaluatorLabel}</p>
            </div>

            {/* Overall Score — performance_summaries.total_score */}
            <div className={viewStyles.v014}>
              <div className={viewStyles.v015}>
                {overallScore !== null ? formatScore(overallScore) : '-'}
              </div>
              <div className={viewStyles.v016}>Overall Score</div>
            </div>
          </section>

          {/* Warning when this member has no template assigned yet — takes priority
              over the "no records" message since there's no objectives structure to show at all */}
          {noRecords && !templateAssigned && (
            <div
              className={viewStyles.v140}
              style={{ marginBottom: '1rem', background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}
            >
              No template assigned to this member yet. Assign an evaluation template
              before objectives and performance data can be entered.
            </div>
          )}

          {/* Warning when a template is assigned but no performance_records exist yet */}
          {noRecords && templateAssigned && (
            <div
              className={viewStyles.v140}
              style={{ marginBottom: '1rem', background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}
            >
              No performance records found for this member — showing the objectives
              structure. Data columns will populate once records are entered.
            </div>
          )}

          {/* ── Objectives table ──────────────────────────────────────────── */}
          <section className={viewStyles.v017}>
            <div className={viewStyles.v018}>
              <div className={viewStyles.v019}>

                {/* Table header */}
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
                    {/* Category header — categories.name */}
                    <div className={viewStyles.v021}>{group.category}</div>

                    {group.items.map((item, index) => (
                      <div
                        key={`${group.category}-${item.name}-${index}`}
                        className={viewStyles.v022}
                      >
                        {/* OBJECTIVE */}
                        <div className={viewStyles.v023}>{item.name}</div>

                        {/* WEIGHT */}
                        <div>{valueOrDash(item.weight)}</div>

                        {/* TARGET */}
                        <div>{valueOrDash(item.target)}</div>

                        {/* ACTUAL */}
                        <div>{valueOrDash(item.actual)}</div>

                        {/* ACHIEVE % */}
                        <div>
                          {valueOrDash(item.achieve) !== '-'
                            ? `${valueOrDash(item.achieve)}%`
                            : '-'}
                        </div>

                        {/* RATING — colour badge */}
                        <div>
                          <span
                            className={`${viewStyles.v030} ${
                              (viewStyles as Record<string, string>)[getRatingBadgeClass(item.rating) ?? ''] ?? ''
                            }`}
                          >
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

          {/* ── Evaluator feedback ────────────────────────────────────────── */}
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
              placeholder="Enter evaluation feedback…"
            />
            <p className={viewStyles.v074CharCount}>{adminFeedback.length} characters</p>
          </section>

          {/* ── AI Recommendation ─────────────────────────────────────────── */}
          {aiInsights && (
            <section style={{
              marginBottom: '20px',
              borderRadius: '20px',
              background: '#ffffff',
              padding: '28px 32px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgb(15 23 42 / 0.08)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'24px', position:'relative', zIndex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <div style={{
                    width:'44px', height:'44px', borderRadius:'14px',
                    background:'#f1f5f9',
                    border:'1px solid #e2e8f0',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'20px', color:'#1c398e',
                  }}>✦</div>
                  <div>
                    <h3 style={{ margin:0, fontSize:'18px', fontWeight:800, letterSpacing:'-0.01em', color:'#0f172a' }}>AI Performance Recommendation</h3>
                    <p style={{ margin:0, fontSize:'12px', color:'#64748b', marginTop:'2px' }}>
                      Generated from {objectiveGroups.flatMap(g => g.items).filter(i => i.rating !== '-').length} rated objectives
                    </p>
                  </div>
                </div>

                {/* Verdict badge */}
                <div style={{
                  padding:'8px 18px', borderRadius:'999px',
                  background: aiInsights.verdictBg,
                  border:`1.5px solid ${aiInsights.verdictColor}`,
                  color: aiInsights.verdictColor,
                  fontSize:'13px', fontWeight:700,
                }}>
                  {aiInsights.verdict}
                </div>
              </div>

              {/* ── Summary cards row ── */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'24px', position:'relative', zIndex:1 }}>
                {/* Avg Rating */}
                <div style={{ background:'#f8fafc', borderRadius:'14px', padding:'18px', border:'1px solid #e2e8f0' }}>
                  <p style={{ margin:0, fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#64748b' }}>Average Rating</p>
                  <p style={{ margin:'8px 0 0', fontSize:'30px', fontWeight:800, letterSpacing:'-0.02em', color:'#0f172a' }}>{aiInsights.avgRating.toFixed(2)}</p>
                  <p style={{ margin:'4px 0 0', fontSize:'12px', color: aiInsights.levelColor, fontWeight:700 }}>{aiInsights.level}</p>
                </div>

                {/* % meeting target */}
                <div style={{ background:'#f8fafc', borderRadius:'14px', padding:'18px', border:'1px solid #e2e8f0' }}>
                  <p style={{ margin:0, fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#64748b' }}>Targets Met</p>
                  <p style={{ margin:'8px 0 0', fontSize:'30px', fontWeight:800, letterSpacing:'-0.02em', color:'#0f172a' }}>{aiInsights.pctMeetingTarget}%</p>
                  <p style={{ margin:'4px 0 0', fontSize:'12px', color:'#64748b' }}>of objectives ≥ 100% achieved</p>
                </div>

                {/* Objectives count */}
                <div style={{ background:'#f8fafc', borderRadius:'14px', padding:'18px', border:'1px solid #e2e8f0' }}>
                  <p style={{ margin:0, fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#64748b' }}>Objectives Rated</p>
                  <p style={{ margin:'8px 0 0', fontSize:'30px', fontWeight:800, letterSpacing:'-0.02em', color:'#0f172a' }}>
                    {objectiveGroups.flatMap(g => g.items).filter(i => i.rating !== '-').length}
                  </p>
                  <p style={{ margin:'4px 0 0', fontSize:'12px', color:'#64748b' }}>of {objectiveGroups.flatMap(g => g.items).length} total</p>
                </div>
              </div>

              {/* ── Category breakdown table ── */}
              <div style={{ background:'#f8fafc', borderRadius:'14px', overflow:'hidden', marginBottom:'20px', position:'relative', zIndex:1, border:'1px solid #e2e8f0' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 90px 110px', padding:'12px 18px', background:'#f1f5f9', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#64748b', borderBottom:'1px solid #e2e8f0' }}>
                  <div>Focus Area</div>
                  <div style={{ textAlign:'right' }}>Avg Score</div>
                  <div style={{ textAlign:'right' }}>Objectives</div>
                  <div style={{ textAlign:'right' }}>Assessment</div>
                </div>

                {aiInsights.categoryScores.map(({ category, avg }, i) => {
                  const catItems = objectiveGroups.find(g => g.category === category)?.items ?? [];
                  let badge = 'Needs Work'; let badgeBg = '#fee2e2'; let badgeColor = '#991b1b'; let badgeBorder = '#fecaca';
                  if (avg >= 4) { badge = 'Excellent'; badgeBg = '#dcfce7'; badgeColor = '#15803d'; badgeBorder = '#bbf7d0'; }
                  else if (avg >= 3) { badge = 'Good'; badgeBg = '#dbeafe'; badgeColor = '#1e40af'; badgeBorder = '#bfdbfe'; }
                  else if (avg >= 2) { badge = 'Fair'; badgeBg = '#fef9c3'; badgeColor = '#92400e'; badgeBorder = '#fde68a'; }
                  return (
                    <div key={category} style={{ display:'grid', gridTemplateColumns:'1fr 90px 90px 110px', padding:'14px 18px', borderBottom: i < aiInsights.categoryScores.length - 1 ? '1px solid #e2e8f0' : 'none', alignItems:'center' }}>
                      <div style={{ fontSize:'13px', fontWeight:600, color:'#0f172a' }}>{category}</div>
                      <div style={{ textAlign:'right', fontSize:'15px', fontWeight:800, color:'#0f172a' }}>{avg.toFixed(2)}</div>
                      <div style={{ textAlign:'right', fontSize:'13px', color:'#64748b' }}>{catItems.length}</div>
                      <div style={{ textAlign:'right' }}>
                        <span style={{ padding:'3px 10px', borderRadius:'999px', fontSize:'11px', fontWeight:700, color: badgeColor, background: badgeBg, border:`1px solid ${badgeBorder}` }}>{badge}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Strengths & Gaps ── */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', position:'relative', zIndex:1 }}>
                <div style={{ background:'#f0fdf4', borderRadius:'14px', padding:'18px', border:'1px solid #bbf7d0' }}>
                  <p style={{ margin:'0 0 12px', fontSize:'12px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#15803d', display:'flex', alignItems:'center', gap:'6px' }}>
                    ▲ Top Strengths
                  </p>
                  {aiInsights.strengths.map((item, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i < 2 ? '8px' : 0 }}>
                      <span style={{ fontSize:'12px', color:'#334155', flex:1, marginRight:'8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                      <span style={{ fontSize:'12px', fontWeight:800, color:'#15803d', flexShrink:0 }}>{Number(item.ratingNum).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div style={{ background:'#fff5f5', borderRadius:'14px', padding:'18px', border:'1px solid #fecaca' }}>
                  <p style={{ margin:'0 0 12px', fontSize:'12px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#991b1b', display:'flex', alignItems:'center', gap:'6px' }}>
                    ▼ Improvement Areas
                  </p>
                  {aiInsights.gaps.map((item, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i < 2 ? '8px' : 0 }}>
                      <span style={{ fontSize:'12px', color:'#334155', flex:1, marginRight:'8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                      <span style={{ fontSize:'12px', fontWeight:800, color:'#991b1b', flexShrink:0 }}>{Number(item.ratingNum).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* ── Actions ───────────────────────────────────────────────────── */}
          <div className={viewStyles.v027}>
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className={viewStyles.v028}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft || submitting}
              style={{
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                background: '#f1f5f9',
                padding: '12px 28px',
                fontSize: '14px',
                fontWeight: 700,
                color: '#334155',
                cursor: savingDraft || submitting ? 'not-allowed' : 'pointer',
                opacity: savingDraft || submitting ? 0.65 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                letterSpacing: '0.01em',
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 2px rgb(15 23 42 / 0.08)',
              }}
            >
              {savingDraft ? 'Saving…' : 'Save Draft'}
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={viewStyles.v029}
            >
              {submitting ? 'Submitting…' : 'Submit Evaluation'}
            </button>
          </div>

        </div>
      </main>

      {/* ── Draft Saved Modal ───────────────────────────────────────────── */}
      {showDraftSaved && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(10, 20, 60, 0.55)', backdropFilter:'blur(6px)',
        }}>
          <div style={{
            width:'100%', maxWidth:'460px', margin:'0 16px',
            borderRadius:'24px',
            background:'#ffffff',
            boxShadow:'0 32px 80px rgba(10, 20, 60, 0.30), 0 0 0 1px rgba(255,255,255,0.08)',
            overflow:'hidden',
          }}>
            <div style={{ padding:'36px 36px 32px' }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:'20px' }}>
                <div style={{ width:'72px', height:'72px', borderRadius:'50%', background:'#dbeafe', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1e40af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                </div>
              </div>
              <h2 style={{ margin:'0 0 8px', textAlign:'center', fontSize:'22px', fontWeight:800, color:'#0f172a' }}>Draft Saved</h2>
              <p style={{ margin:'0 0 24px', textAlign:'center', fontSize:'14px', color:'#475569' }}>Your progress has been saved. You can continue editing anytime.</p>
              <div style={{ display:'flex', gap:'10px' }}>
                <button type="button" onClick={() => setShowDraftSaved(false)}
                  style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1px solid #e2e8f0', background:'#f1f5f9', color:'#334155', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>
                  Continue Editing
                </button>
                <button type="button" onClick={() => router.push(routes.myTeam)}
                  style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'#1c398e', boxShadow:'0 2px 8px rgba(28, 57, 142, 0.22)', color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer' }}>
                  Go to My Team
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Confirmation Modal ────────────────────────────────────── */}
      {showCancelConfirm && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(10, 20, 60, 0.55)', backdropFilter:'blur(6px)',
        }}>
          <div style={{
            width:'100%', maxWidth:'440px', margin:'0 16px',
            borderRadius:'24px',
            background:'#ffffff',
            boxShadow:'0 32px 80px rgba(10, 20, 60, 0.30), 0 0 0 1px rgba(255,255,255,0.08)',
            overflow:'hidden',
          }}>
            <div style={{ padding:'36px 36px 32px' }}>
              <h2 style={{ margin:'0 0 8px', textAlign:'center', fontSize:'22px', fontWeight:800, color:'#0f172a' }}>Leave Without Saving?</h2>
              <p style={{ margin:'0 0 28px', textAlign:'center', fontSize:'14px', color:'#475569', lineHeight:1.6 }}>
                Any unsaved changes to <strong style={{ color:'#0f172a' }}>{member.name}&apos;s</strong> evaluation will be lost.
              </p>
              <div style={{ display:'flex', gap:'10px' }}>
                <button type="button" onClick={() => setShowCancelConfirm(false)}
                  style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'#d97706', boxShadow:'0 2px 8px rgba(217, 119, 6, 0.22)', color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer' }}>
                  Stay Here
                </button>
                <button type="button" onClick={() => { router.push(routes.myTeam); updateTeamMemberStatus(member.id, 'pending').catch(() => {}); }}
                  style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1px solid #e2e8f0', background:'#f1f5f9', color:'#334155', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>
                  Leave Page
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Success Modal ─────────────────────────────────────────── */}
      {showSuccess && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(10, 20, 60, 0.55)', backdropFilter:'blur(6px)' }}>
          <div style={{ width:'100%', maxWidth:'480px', margin:'0 16px', borderRadius:'24px', background:'#ffffff', boxShadow:'0 32px 80px rgba(10, 20, 60, 0.30), 0 0 0 1px rgba(255,255,255,0.08)', overflow:'hidden' }}>
            <div style={{ padding:'36px 36px 32px' }}>
              <div style={{ display:'flex', justifyContent:'center', marginBottom:'20px' }}>
                <div style={{ width:'72px', height:'72px', borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              </div>
              <h2 style={{ margin:'0 0 8px', textAlign:'center', fontSize:'22px', fontWeight:800, color:'#0f172a' }}>Evaluation Submitted</h2>
              <p style={{ margin:'0 0 24px', textAlign:'center', fontSize:'14px', color:'#475569' }}>The evaluation has been sent for approval review.</p>
              <div style={{ display:'flex', gap:'10px' }}>
                <button type="button" onClick={() => setShowSuccess(false)}
                  style={{ flex:1, padding:'13px', borderRadius:'12px', border:'1px solid #e2e8f0', background:'#f1f5f9', color:'#334155', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>
                  Stay on Page
                </button>
                <button type="button" onClick={() => { if (!submitting) router.push(routes.approvals); }} disabled={submitting}
                  style={{ flex:2, padding:'13px', borderRadius:'12px', border:'none', background:'#1c398e', boxShadow:'0 2px 8px rgba(28, 57, 142, 0.22)', color:'#fff', fontSize:'14px', fontWeight:700, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Saving…' : 'View Approvals'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
