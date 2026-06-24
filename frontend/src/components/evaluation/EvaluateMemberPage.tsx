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
import Sidebar from '../sidebar/Sidebar';
import LoadingScreen from '../LoadingScreen';
import { useRoutes } from '../../lib/routing';
import { EVALUATION_DEFAULTS, ROLE_EVALUATOR_LABEL } from '../../lib/constants';
import { DEFAULT_ADMIN_FEEDBACK, generateObjectivesForScore } from '../../lib/evaluationDefaults';
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

          // Pre-fill feedback from evaluations.admin_recommendation
          setAdminFeedback(
            data.evaluation?.feedback ??
            (member_.evaluation?.feedback as string | undefined) ??
            DEFAULT_ADMIN_FEEDBACK
          );
        } catch {
          setNoRecords(true);
          setAdminFeedback(
            (member_.evaluation?.feedback as string | undefined) ?? DEFAULT_ADMIN_FEEDBACK
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

  // Objective groups: real DB data when present, template fallback otherwise
  const objectiveGroups: ObjectiveGroup[] = useMemo(() => {
    if (dbGroups.length > 0) return dbGroups;
    return generateObjectivesForScore(
      overallScore,
      Array.isArray(member?.id) ? member?.id[0] : member?.id
    );
  }, [dbGroups, member, overallScore]);

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

  if (loading) return <LoadingScreen fullPage />;
  if (!member)  return <div className={viewStyles.v001}>Member not found</div>;

  return (
    <div className={viewStyles.v002}>
      <Sidebar />

      <main className={viewStyles.v003}>
        <div className={viewStyles.v004}>

          {/* Breadcrumb */}
          <div className={viewStyles.v005}>
            <Link href={routes.home}   className={viewStyles.v006}>Home</Link>
            <span className={viewStyles.v007}>&gt;</span>
            <Link href={routes.myTeam} className={viewStyles.v006}>My Team</Link>
            <span className={viewStyles.v007}>&gt;</span>
            <span className={viewStyles.v008}>{member.name}</span>
          </div>

          <h1 className={viewStyles.v009}>Evaluate Team Member</h1>

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

          {/* Warning when no performance_records found for this member */}
          {noRecords && (
            <div
              className={viewStyles.v140}
              style={{ marginBottom: '1rem', background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}
            >
              No performance records found for this member — showing the objectives
              structure. Data columns will populate once records are entered.
            </div>
          )}

          {/* ── Objectives table ──────────────────────────────────────────── */}
          {/*
            OBJECTIVE  ← objectives.name
            WEIGHT     ← performance_records.weight  else  objectives.weight
            TARGET     ← performance_records.target
            ACTUAL     ← performance_records.actual
            ACHIEVE %  ← performance_records.achievement_percentage
                         or  computed (actual / target * 100)
            RATING     ← manual_rating → rating → score
          */}
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
                              (viewStyles as Record<string, string>)[getRatingBadgeClass(item.rating)]
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
          {/* Pre-filled from evaluations.admin_recommendation */}
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
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #1d4ed8 100%)',
              padding: '28px 32px',
              color: '#ffffff',
              boxShadow: '0 20px 60px rgba(15,23,42,0.40), inset 0 1px 0 rgba(255,255,255,0.10)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              {/* Decorative orbs */}
              <div style={{ position:'absolute', top:'-60px', right:'-60px', width:'220px', height:'220px', borderRadius:'50%', background:'rgba(99,102,241,0.12)', pointerEvents:'none' }} />
              <div style={{ position:'absolute', bottom:'-80px', left:'-30px', width:'260px', height:'260px', borderRadius:'50%', background:'rgba(37,99,235,0.10)', pointerEvents:'none' }} />

              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'24px', position:'relative', zIndex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                  <div style={{
                    width:'44px', height:'44px', borderRadius:'14px',
                    background:'rgba(255,255,255,0.12)',
                    border:'1.5px solid rgba(255,255,255,0.20)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:'20px',
                  }}>✦</div>
                  <div>
                    <h3 style={{ margin:0, fontSize:'18px', fontWeight:800, letterSpacing:'-0.01em' }}>AI Performance Recommendation</h3>
                    <p style={{ margin:0, fontSize:'12px', color:'rgba(255,255,255,0.55)', marginTop:'2px' }}>
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
                <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:'14px', padding:'18px', border:'1px solid rgba(255,255,255,0.12)' }}>
                  <p style={{ margin:0, fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'rgba(255,255,255,0.50)' }}>Average Rating</p>
                  <p style={{ margin:'8px 0 0', fontSize:'30px', fontWeight:800, letterSpacing:'-0.02em' }}>{aiInsights.avgRating.toFixed(2)}</p>
                  <p style={{ margin:'4px 0 0', fontSize:'12px', color: aiInsights.levelColor, fontWeight:700 }}>{aiInsights.level}</p>
                </div>

                {/* % meeting target */}
                <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:'14px', padding:'18px', border:'1px solid rgba(255,255,255,0.12)' }}>
                  <p style={{ margin:0, fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'rgba(255,255,255,0.50)' }}>Targets Met</p>
                  <p style={{ margin:'8px 0 0', fontSize:'30px', fontWeight:800, letterSpacing:'-0.02em' }}>{aiInsights.pctMeetingTarget}%</p>
                  <p style={{ margin:'4px 0 0', fontSize:'12px', color:'rgba(255,255,255,0.55)' }}>of objectives ≥ 100% achieved</p>
                </div>

                {/* Objectives count */}
                <div style={{ background:'rgba(255,255,255,0.08)', borderRadius:'14px', padding:'18px', border:'1px solid rgba(255,255,255,0.12)' }}>
                  <p style={{ margin:0, fontSize:'11px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'rgba(255,255,255,0.50)' }}>Objectives Rated</p>
                  <p style={{ margin:'8px 0 0', fontSize:'30px', fontWeight:800, letterSpacing:'-0.02em' }}>
                    {objectiveGroups.flatMap(g => g.items).filter(i => i.rating !== '-').length}
                  </p>
                  <p style={{ margin:'4px 0 0', fontSize:'12px', color:'rgba(255,255,255,0.55)' }}>of {objectiveGroups.flatMap(g => g.items).length} total</p>
                </div>
              </div>

              {/* ── Category breakdown table ── */}
              <div style={{ background:'rgba(255,255,255,0.06)', borderRadius:'14px', overflow:'hidden', marginBottom:'20px', position:'relative', zIndex:1, border:'1px solid rgba(255,255,255,0.10)' }}>
                {/* Table header */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 90px 110px', padding:'12px 18px', background:'rgba(255,255,255,0.08)', fontSize:'10px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'rgba(255,255,255,0.55)', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                  <div>Focus Area</div>
                  <div style={{ textAlign:'right' }}>Avg Score</div>
                  <div style={{ textAlign:'right' }}>Objectives</div>
                  <div style={{ textAlign:'right' }}>Assessment</div>
                </div>

                {aiInsights.categoryScores.map(({ category, avg }, i) => {
                  const catItems = objectiveGroups.find(g => g.category === category)?.items ?? [];
                  let badge = 'Needs Work'; let badgeColor = '#f87171';
                  if (avg >= 4) { badge = 'Excellent'; badgeColor = '#4ade80'; }
                  else if (avg >= 3) { badge = 'Good'; badgeColor = '#60a5fa'; }
                  else if (avg >= 2) { badge = 'Fair'; badgeColor = '#facc15'; }
                  return (
                    <div key={category} style={{ display:'grid', gridTemplateColumns:'1fr 90px 90px 110px', padding:'14px 18px', borderBottom: i < aiInsights.categoryScores.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', alignItems:'center' }}>
                      <div style={{ fontSize:'13px', fontWeight:600, color:'rgba(255,255,255,0.90)' }}>{category}</div>
                      <div style={{ textAlign:'right', fontSize:'15px', fontWeight:800 }}>{avg.toFixed(2)}</div>
                      <div style={{ textAlign:'right', fontSize:'13px', color:'rgba(255,255,255,0.55)' }}>{catItems.length}</div>
                      <div style={{ textAlign:'right' }}>
                        <span style={{ padding:'3px 10px', borderRadius:'999px', fontSize:'11px', fontWeight:700, color: badgeColor, background:`${badgeColor}22`, border:`1px solid ${badgeColor}55` }}>{badge}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Strengths & Gaps ── */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px', position:'relative', zIndex:1 }}>
                {/* Strengths */}
                <div style={{ background:'rgba(74,222,128,0.08)', borderRadius:'14px', padding:'18px', border:'1px solid rgba(74,222,128,0.20)' }}>
                  <p style={{ margin:'0 0 12px', fontSize:'12px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#4ade80', display:'flex', alignItems:'center', gap:'6px' }}>
                    ▲ Top Strengths
                  </p>
                  {aiInsights.strengths.map((item, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i < 2 ? '8px' : 0 }}>
                      <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.80)', flex:1, marginRight:'8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                      <span style={{ fontSize:'12px', fontWeight:800, color:'#4ade80', flexShrink:0 }}>{Number(item.ratingNum).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Gaps */}
                <div style={{ background:'rgba(248,113,113,0.08)', borderRadius:'14px', padding:'18px', border:'1px solid rgba(248,113,113,0.20)' }}>
                  <p style={{ margin:'0 0 12px', fontSize:'12px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#f87171', display:'flex', alignItems:'center', gap:'6px' }}>
                    ▼ Improvement Areas
                  </p>
                  {aiInsights.gaps.map((item, i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i < 2 ? '8px' : 0 }}>
                      <span style={{ fontSize:'12px', color:'rgba(255,255,255,0.80)', flex:1, marginRight:'8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name}</span>
                      <span style={{ fontSize:'12px', fontWeight:800, color:'#f87171', flexShrink:0 }}>{Number(item.ratingNum).toFixed(2)}</span>
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

            {/* Save Draft */}
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={savingDraft || submitting}
              style={{
                borderRadius: '12px',
                border: '1.5px solid #475569',
                background: savingDraft ? '#1e293b' : 'linear-gradient(135deg, #1e293b, #334155)',
                padding: '12px 28px',
                fontSize: '14px',
                fontWeight: 700,
                color: '#e2e8f0',
                cursor: savingDraft || submitting ? 'not-allowed' : 'pointer',
                opacity: savingDraft || submitting ? 0.65 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                letterSpacing: '0.01em',
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
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
          background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)',
          animation:'fadeIn 0.2s ease',
        }}>
          <div style={{
            width:'100%', maxWidth:'460px', margin:'0 16px',
            borderRadius:'24px',
            background:'linear-gradient(160deg,#0f172a 0%,#1e293b 100%)',
            border:'1px solid rgba(255,255,255,0.10)',
            boxShadow:'0 32px 80px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.08)',
            overflow:'hidden',
            animation:'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {/* Slate accent bar */}
            <div style={{ height:'4px', background:'linear-gradient(90deg,#475569,#7c3aed,#6366f1)' }} />

            <div style={{ padding:'36px 36px 32px' }}>
              {/* Icon */}
              <div style={{ display:'flex', justifyContent:'center', marginBottom:'20px' }}>
                <div style={{
                  width:'72px', height:'72px', borderRadius:'50%',
                  background:'radial-gradient(circle at 35% 35%,#7c3aed,#4c1d95)',
                  boxShadow:'0 0 0 12px rgba(124,58,237,0.12), 0 8px 24px rgba(124,58,237,0.30)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                </div>
              </div>

              <h2 style={{ margin:'0 0 8px', textAlign:'center', fontSize:'22px', fontWeight:800, color:'#f1f5f9', letterSpacing:'-0.02em' }}>
                Draft Saved
              </h2>
              <p style={{ margin:'0 0 24px', textAlign:'center', fontSize:'14px', color:'rgba(255,255,255,0.50)', lineHeight:1.5 }}>
                Your progress has been saved. You can continue editing anytime.
              </p>

              {/* Member info */}
              <div style={{
                borderRadius:'14px', background:'rgba(255,255,255,0.05)',
                border:'1px solid rgba(255,255,255,0.08)',
                padding:'16px 20px', marginBottom:'20px',
                display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:'12px',
              }}>
                <div>
                  <p style={{ margin:0, fontSize:'13px', color:'rgba(255,255,255,0.45)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em' }}>Employee</p>
                  <p style={{ margin:'4px 0 0', fontSize:'15px', fontWeight:700, color:'#f1f5f9' }}>{member.name}</p>
                  <p style={{ margin:'2px 0 0', fontSize:'12px', color:'rgba(255,255,255,0.40)' }}>{period}</p>
                </div>
                <div style={{
                  minWidth:'64px', height:'64px', borderRadius:'14px',
                  background:'linear-gradient(135deg,#4c1d95,#7c3aed)',
                  border:'1px solid rgba(124,58,237,0.40)',
                  display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                }}>
                  <span style={{ fontSize:'11px', fontWeight:700, color:'rgba(255,255,255,0.70)', textTransform:'uppercase', letterSpacing:'0.05em' }}>Draft</span>
                  <span style={{ fontSize:'11px', fontWeight:600, color:'rgba(255,255,255,0.50)', marginTop:'2px' }}>Saved</span>
                </div>
              </div>

              {/* Status pill */}
              <div style={{ display:'flex', justifyContent:'center', marginBottom:'28px' }}>
                <div style={{
                  display:'inline-flex', alignItems:'center', gap:'7px',
                  padding:'7px 16px', borderRadius:'999px',
                  background:'rgba(124,58,237,0.12)', border:'1px solid rgba(124,58,237,0.30)',
                  color:'#a78bfa', fontSize:'12px', fontWeight:700,
                }}>
                  <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#a78bfa', display:'inline-block' }} />
                  In Progress
                </div>
              </div>

              <div style={{ display:'flex', gap:'10px' }}>
                <button type="button"
                  onClick={() => setShowDraftSaved(false)}
                  style={{
                    flex:1, padding:'13px', borderRadius:'12px',
                    border:'1.5px solid rgba(255,255,255,0.12)',
                    background:'rgba(255,255,255,0.05)',
                    color:'rgba(255,255,255,0.65)', fontSize:'14px', fontWeight:600,
                    cursor:'pointer',
                  }}>
                  Continue Editing
                </button>
                <button type="button"
                  onClick={() => router.push(routes.myTeam)}
                  style={{
                    flex:2, padding:'13px', borderRadius:'12px', border:'none',
                    background:'linear-gradient(135deg,#4c1d95,#7c3aed)',
                    boxShadow:'0 6px 20px rgba(124,58,237,0.40)',
                    color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer',
                    display:'flex', alignItems:'center', justifyContent:'center', gap:'7px',
                  }}>
                  Go to My Team
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
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
          background:'rgba(0,0,0,0.65)', backdropFilter:'blur(6px)',
          animation:'fadeIn 0.2s ease',
        }}>
          <div style={{
            width:'100%', maxWidth:'440px', margin:'0 16px',
            borderRadius:'24px',
            background:'linear-gradient(160deg,#0f172a 0%,#1c1917 100%)',
            border:'1px solid rgba(255,255,255,0.10)',
            boxShadow:'0 32px 80px rgba(0,0,0,0.60), inset 0 1px 0 rgba(255,255,255,0.08)',
            overflow:'hidden',
            animation:'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          }}>
            {/* Amber accent bar */}
            <div style={{ height:'4px', background:'linear-gradient(90deg,#92400e,#f59e0b,#fcd34d)' }} />

            <div style={{ padding:'36px 36px 32px' }}>
              {/* Icon */}
              <div style={{ display:'flex', justifyContent:'center', marginBottom:'20px' }}>
                <div style={{
                  width:'72px', height:'72px', borderRadius:'50%',
                  background:'radial-gradient(circle at 35% 35%,#d97706,#92400e)',
                  boxShadow:'0 0 0 12px rgba(217,119,6,0.12), 0 8px 24px rgba(217,119,6,0.30)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
              </div>

              <h2 style={{ margin:'0 0 8px', textAlign:'center', fontSize:'22px', fontWeight:800, color:'#f1f5f9', letterSpacing:'-0.02em' }}>
                Leave Without Saving?
              </h2>
              <p style={{ margin:'0 0 28px', textAlign:'center', fontSize:'14px', color:'rgba(255,255,255,0.50)', lineHeight:1.6 }}>
                Any unsaved changes to <strong style={{ color:'rgba(255,255,255,0.75)' }}>{member.name}&apos;s</strong> evaluation will be lost. Consider saving a draft first.
              </p>

              <div style={{ display:'flex', gap:'10px' }}>
                <button type="button"
                  onClick={() => setShowCancelConfirm(false)}
                  style={{
                    flex:2, padding:'13px', borderRadius:'12px', border:'none',
                    background:'linear-gradient(135deg,#92400e,#d97706)',
                    boxShadow:'0 6px 20px rgba(217,119,6,0.35)',
                    color:'#fff', fontSize:'14px', fontWeight:700, cursor:'pointer',
                  }}>
                  Stay Here
                </button>
                <button type="button"
                  onClick={async () => {
                    router.push(routes.myTeam);
                    updateTeamMemberStatus(member.id, 'pending').catch(() => {});
                  }}
                  style={{
                    flex:1, padding:'13px', borderRadius:'12px',
                    border:'1.5px solid rgba(255,255,255,0.12)',
                    background:'rgba(255,255,255,0.05)',
                    color:'rgba(255,255,255,0.55)', fontSize:'14px', fontWeight:600,
                    cursor:'pointer',
                  }}>
                  Leave Page
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Success Modal ─────────────────────────────────────────── */}
      {showSuccess && (
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
                Evaluation Submitted
              </h2>
              <p style={{
                margin: '0 0 24px', textAlign: 'center',
                fontSize: '14px', color: 'rgba(255,255,255,0.50)', lineHeight: 1.5,
              }}>
                The evaluation has been sent for approval review.
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
                  <p style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 700, color: '#f1f5f9' }}>{member.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255,255,255,0.40)' }}>{period}</p>
                </div>
                {overallScore !== null && (
                  <div style={{
                    minWidth: '64px', height: '64px', borderRadius: '14px',
                    background: 'linear-gradient(135deg, #1e3a8a, #1d4ed8)',
                    border: '1px solid rgba(99,102,241,0.40)',
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
                  background: 'rgba(234,179,8,0.12)',
                  border: '1px solid rgba(234,179,8,0.30)',
                  color: '#fbbf24', fontSize: '12px', fontWeight: 700,
                }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#fbbf24', display: 'inline-block' }} />
                  Pending Approval
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowSuccess(false)}
                  style={{
                    flex: 1, padding: '13px', borderRadius: '12px',
                    border: '1.5px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.65)', fontSize: '14px', fontWeight: 600,
                    cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  Stay on Page
                </button>
                <button
                  type="button"
                  onClick={() => { if (!submitting) router.push(routes.approvals); }}
                  disabled={submitting}
                  style={{
                    flex: 2, padding: '13px', borderRadius: '12px',
                    border: 'none',
                    background: submitting
                      ? 'linear-gradient(135deg,#1e3a5f,#1e40af)'
                      : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
                    boxShadow: '0 6px 20px rgba(37,99,235,0.40)',
                    color: '#ffffff', fontSize: '14px', fontWeight: 700,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    transition: 'all 0.2s',
                  }}
                >
                  {submitting ? 'Saving…' : 'View Approvals'}
                  {!submitting && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  )}
                </button>
              </div>

            </div>
          </div>

          {/* Keyframe styles injected inline */}
          <style>{`
            @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
            @keyframes scaleIn { from { opacity:0; transform:scale(0.85) } to { opacity:1; transform:scale(1) } }
          `}</style>
        </div>
      )}

    </div>
  );
}
