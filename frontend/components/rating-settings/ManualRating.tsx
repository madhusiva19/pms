'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface ManualObjective {
  objective_id:   number;
  objective_name: string;
  category_id:    number;
  category_name:  string;
  weight:         number;
  kpi_scale:      string;
  manual_rating:  number | null;
  rating_comment: string | null;
}

interface TeamMember {
  id:            string;
  full_name:     string;
  designation:   string;
  template_name: string | null;
}

interface RatingPeriod {
  rating_open:   boolean;
  active_period: string | null;
  pms_year:      number;
  rating_start:  string;
  rating_end:    string;
  reason:        string | null;
}

const API          = 'http://127.0.0.1:5000';
const EVALUATOR_ID = process.env.NEXT_PUBLIC_LOCKED_ADMIN_UUID ?? 'aaaaaaaa-0001-0001-0001-000000000001';

export default function ManualRatingsPage() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const { user }     = useAuth();

  const userId = searchParams.get('userId') ?? '';
  const year   = parseInt(searchParams.get('year') ?? '2026', 10);
  const period = searchParams.get('period') ?? 'H1';

  const roleSlug = user?.role?.replace(/_/g, '-') ?? 'branch-admin';

  const [member,        setMember]        = useState<TeamMember | null>(null);
  const [objectives,    setObjectives]    = useState<ManualObjective[]>([]);
  const [ratings,       setRatings]       = useState<Record<number, string>>({});
  const [comments,      setComments]      = useState<Record<number, string>>({});
  const [errors,        setErrors]        = useState<Record<number, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<number, string>>({});
  const [globalError,   setGlobalError]   = useState('');
  const [submitMsg,     setSubmitMsg]     = useState('');
  const [loading,       setLoading]       = useState(true);
  const [saving,        setSaving]        = useState(false);
  const [submitted,     setSubmitted]     = useState(false);
  const [isDirty,       setIsDirty]       = useState(false);
  const [ratingPeriod,  setRatingPeriod]  = useState<RatingPeriod | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const evaluatorId = user?.id ?? EVALUATOR_ID;
      const [teamRes, objRes, periodRes] = await Promise.all([
        fetch(`${API}/api/evaluator/${evaluatorId}/team`),
        fetch(`${API}/api/manual-objectives/${userId}?year=${year}&period=${period}`),
        fetch(`${API}/api/rating-periods/current`),
      ]);

      const teamData   = await teamRes.json();
      const objData    = await objRes.json();
      const periodData = await periodRes.json();

      if (Array.isArray(teamData)) {
        const found = teamData.find((m: TeamMember) => m.id === userId);
        if (found) {
          setMember(found);
        } else {
          // fallback: get name from performance endpoint
          try {
            const perfRes  = await fetch(`${API}/api/performance/${userId}/${year}/${period}`);
            if (perfRes.ok) {
              const perfData = await perfRes.json();
              if (perfData?.employee) {
                setMember({
                  id:            userId,
                  full_name:     perfData.employee.name ?? '',
                  designation:   perfData.employee.designation ?? '',
                  template_name: null,
                });
              }
            }
          } catch { /* silent */ }
        }
      }

      if (Array.isArray(objData)) {
        setObjectives(objData);
        const preRatings:  Record<number, string> = {};
        const preComments: Record<number, string> = {};
        let hasAny = false;
        objData.forEach((obj: ManualObjective) => {
          if (obj.manual_rating !== null && obj.manual_rating !== undefined) {
            preRatings[obj.objective_id]  = String(obj.manual_rating);
            hasAny = true;
          }
          if (obj.rating_comment) {
            preComments[obj.objective_id] = obj.rating_comment;
          }
        });
        setRatings(preRatings);
        setComments(preComments);
        setSubmitted(hasAny);
      }

      setRatingPeriod(periodData);
    } catch {
      setGlobalError('Failed to load data. Make sure Flask is running on port 5000.');
    }
    setLoading(false);
  }, [userId, year, period, user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleRatingChange = (objId: number, val: string) => {
    setRatings(prev => ({ ...prev, [objId]: val }));
    setSubmitMsg('');
    setIsDirty(true);

    if (!val || val.trim() === '') {
      setErrors(prev => ({ ...prev, [objId]: '' }));
    } else {
      const num = parseFloat(val);
      if (isNaN(num) || num < 1 || num > 5) {
        setErrors(prev => ({ ...prev, [objId]: 'Must be 1–5' }));
      } else {
        setErrors(prev => ({ ...prev, [objId]: '' }));
        if (num >= 3.0) {
          setCommentErrors(prev => ({ ...prev, [objId]: '' }));
        } else {
          const c = comments[objId] ?? '';
          if (!c.trim()) {
            setCommentErrors(prev => ({ ...prev, [objId]: 'Required for ratings below 3.0' }));
          }
        }
      }
    }
  };

  const handleCommentChange = (objId: number, val: string) => {
    setComments(prev => ({ ...prev, [objId]: val }));
    setIsDirty(true);
    const rating = parseFloat(ratings[objId] ?? '');
    if (!isNaN(rating) && rating < 3.0 && !val.trim()) {
      setCommentErrors(prev => ({ ...prev, [objId]: 'Required for ratings below 3.0' }));
    } else {
      setCommentErrors(prev => ({ ...prev, [objId]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors:        Record<number, string> = {};
    const newCommentErrors: Record<number, string> = {};
    let valid = true;

    objectives.forEach(obj => {
      const val = ratings[obj.objective_id];
      if (!val || val.trim() === '') {
        newErrors[obj.objective_id] = 'Required';
        valid = false;
      } else {
        const num = parseFloat(val);
        if (isNaN(num) || num < 1 || num > 5) {
          newErrors[obj.objective_id] = 'Must be 1–5';
          valid = false;
        } else if (num < 3.0) {
          const c = comments[obj.objective_id] ?? '';
          if (!c.trim()) {
            newCommentErrors[obj.objective_id] = 'Required for ratings below 3.0';
            valid = false;
          }
        }
      }
    });

    setErrors(newErrors);
    setCommentErrors(newCommentErrors);
    return valid;
  };

  const pendingCount = objectives.filter(o => {
    const val = ratings[o.objective_id];
    if (!val || val.trim() === '') return true;
    const num = parseFloat(val);
    return isNaN(num) || num < 1 || num > 5;
  }).length;

  const handleSubmit = async () => {
    setSubmitMsg('');
    if (!validate()) {
      setSubmitMsg('error');
      return;
    }
    setSaving(true);
    try {
      const ratingsList = objectives.map(obj => ({
        objective_id:   obj.objective_id,
        manual_rating:  parseFloat(parseFloat(ratings[obj.objective_id]).toFixed(2)),
        rating_comment: comments[obj.objective_id]?.trim() || null,
      }));

      const res = await fetch(`${API}/api/evaluator/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id:      userId,
          evaluator_id: EVALUATOR_ID,
          year,
          period,
          ratings: ratingsList,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Submission failed');

      setSubmitted(true);
      setIsDirty(false);
      setSubmitMsg('success');

      setTimeout(() => router.push(`/${roleSlug}/rating-settings`), 1800);

    } catch (e: unknown) {
      setSubmitMsg(e instanceof Error ? e.message : 'Submission failed. Please try again.');
    }
    setSaving(false);
  };

  const handleCancel = () => {
    if (isDirty && !confirm('You have unsaved changes. Leave anyway?')) return;
    router.push(`/${roleSlug}/rating-settings`);
  };

  const grouped = objectives.reduce<Record<string, ManualObjective[]>>((acc, obj) => {
    acc[obj.category_name] = acc[obj.category_name] ?? [];
    acc[obj.category_name].push(obj);
    return acc;
  }, {});

  if (loading) return (
    <div style={{ padding: '40px 24px', fontFamily: 'Inter, sans-serif', color: '#64748B', fontSize: 14 }}>
      Loading…
    </div>
  );

  if (globalError) return (
    <div style={{ padding: '32px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{
        background: '#FEF2F2', border: '1px solid #FECACA',
        borderRadius: 10, padding: '20px 24px', maxWidth: 520,
      }}>
        <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 15, marginBottom: 8 }}>⚠️ Failed to Load</div>
        <div style={{ fontSize: 13, color: '#7F1D1D' }}>{globalError}</div>
      </div>
    </div>
  );

  if (!userId) return (
    <div style={{ padding: '32px 24px', fontFamily: 'Inter, sans-serif', color: '#64748B' }}>
      No team member selected.
    </div>
  );

  const P = '10px 14px';

  const thStyle = (align: 'left' | 'center' = 'left'): React.CSSProperties => ({
    padding: P, textAlign: align, color: '#475569',
    fontWeight: 700, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.05em',
  });

  const tdBase = (align: 'left' | 'center' = 'left', extra?: React.CSSProperties): React.CSSProperties => ({
    padding: P, textAlign: align, verticalAlign: 'top', ...extra,
  });

  const hasNoObjectives  = objectives.length === 0;
  const isSubmitDisabled = saving || hasNoObjectives;

  const renderStatusLabel = () => {
    if (hasNoObjectives) {
      return (
        <>
          <AlertTriangle size={14} />
          No manual objectives found for this member
        </>
      );
    }
    if (pendingCount > 0) {
      return (
        <>
          <AlertTriangle size={14} />
          {pendingCount} objective{pendingCount > 1 ? 's' : ''} still need{pendingCount === 1 ? 's' : ''} a valid rating
        </>
      );
    }
    return (
      <>
        <CheckCircle size={14} />
        All objectives rated — ready to submit
      </>
    );
  };

  const statusColor = hasNoObjectives
    ? '#94A3B8'
    : pendingCount > 0
      ? '#D97706'
      : '#16A34A';

  return (
    <div style={{
      padding: '24px 16px', background: '#F8F9FC',
      minHeight: '100vh', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 14, fontSize: 13, color: '#64748B', flexWrap: 'wrap',
        }}>
          <Link href="/" style={{ color: '#64748B', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <Link href={`/${roleSlug}/rating-settings`} style={{ color: '#64748B', textDecoration: 'none' }}>Rating Settings</Link>
          <span>›</span>
          <span style={{ color: '#1E293B', fontWeight: 800 }}>Manual Ratings</span>
        </div>

        {/* Page header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            {/* ── CHANGE 1: show actual member name, fallback to '—' ── */}
            <h1 style={{
              fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 600,
              color: '#101828', margin: '0 0 4px',
            }}>
              {member?.full_name ?? '—'}
            </h1>
            <p style={{ color: '#4A5565', margin: '0 0 10px', fontSize: 14 }}>
              {member?.designation ?? ''} · {period} {year}
            </p>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
              background: submitted ? '#DCFCE7' : '#FEF9C3',
              color:      submitted ? '#166534' : '#854D0E',
              border:     `1px solid ${submitted ? '#BBF7D0' : '#FDE047'}`,
            }}>
              {submitted ? <CheckCircle size={11} /> : <Clock size={11} />}
              {submitted ? 'Submitted' : 'Pending'}
            </span>
          </div>
          <button onClick={handleCancel} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', border: '1px solid #E2E8F0',
            borderRadius: 6, background: '#F8F9FC',
            fontSize: 13, color: '#1E293B', cursor: 'pointer',
          }}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        {/* Rating window banner */}
        {ratingPeriod?.rating_open && (
          <div style={{
            background: '#EFF6FF', border: '1px solid #BFDBFE',
            borderRadius: 8, padding: '10px 16px', marginBottom: 16,
            fontSize: 13, color: '#1E40AF',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Clock size={14} />
            Rating window open: {ratingPeriod.rating_start} → {ratingPeriod.rating_end}
          </div>
        )}

        {/* Info banner */}
        <div style={{
          background: '#FEF9C3', border: '1px solid #FDE047',
          borderRadius: 8, padding: '12px 16px', marginBottom: 16,
          fontSize: 13, color: '#854D0E',
        }}>
          <strong>Rating Mode</strong> — Enter a rating between <strong>1.00</strong> and{' '}
          <strong>5.00</strong> for each objective. Ratings below <strong>3.0</strong> require
          a comment. All objectives must be rated before submitting.
          You can re-edit and resubmit anytime within the rating window.
        </div>

        {/* ── Table card ── */}
        <div style={{
          background: '#fff',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          {/* ── Full blue header bar, white text, no subtitle ── */}
          <div style={{
            padding: '18px 24px',
            background: '#3B82F6',
          }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
              Manual Ratings
            </h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            {hasNoObjectives ? (
              <div style={{
                padding: '48px 24px', textAlign: 'center',
                color: '#94A3B8', fontSize: 14,
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 4 }}>
                  No Manual Objectives Found
                </div>
                <div style={{ fontSize: 13 }}>
                  This team member has no manual KPI objectives assigned for {period} {year}.
                </div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <colgroup>
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '22%' }} />
                  <col style={{ width: '13%' }} />
                  <col style={{ width: '7%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '32%' }} />
                </colgroup>
                <thead>
                  <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #E2E8F0' }}>
                    <th style={thStyle('left')}>Category</th>
                    <th style={thStyle('left')}>Objective</th>
                    <th style={thStyle('left')}>KPI Scale</th>
                    <th style={thStyle('center')}>Weight</th>
                    <th style={thStyle('center')}>Rating (1–5)</th>
                    <th style={thStyle('left')}>
                      Comment
                      <span style={{
                        fontSize: 10, fontWeight: 400, color: '#94A3B8',
                        textTransform: 'none', letterSpacing: 0, marginLeft: 4,
                      }}>
                        (required if rating &lt; 3.0)
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([catName, objs], gi) => (
                    <React.Fragment key={catName}>
                      {objs.map((obj, oi) => {
                        const hasRatingError  = !!errors[obj.objective_id];
                        const hasCommentError = !!commentErrors[obj.objective_id];
                        const ratingNum       = parseFloat(ratings[obj.objective_id] ?? '');
                        const isBelowThree    = !isNaN(ratingNum) && ratingNum < 3.0;
                        const rowBg           = oi === 0 ? '#F8FAFF' : '#fff';

                        return (
                          <tr key={obj.objective_id} style={{
                            borderTop:    oi === 0 && gi > 0 ? '2px solid #CBD5E1' : 'none',
                            borderBottom: '1px solid #E8EDF5',
                            background:   rowBg,
                          }}>

                            {/* Category */}
                            <td style={tdBase('left', {
                              color:      '#1E293B',
                              fontWeight: oi === 0 ? 700 : 400,
                              fontSize:   13,
                              borderLeft: oi === 0 ? '3px solid #2563EB' : '3px solid transparent',
                              background: rowBg,
                            })}>
                              {oi === 0 ? catName : ''}
                            </td>

                            {/* Objective name */}
                            <td style={tdBase('left', {
                              color: '#1C398E', fontWeight: 500, fontSize: 13, background: rowBg,
                            })}>
                              {obj.objective_name}
                            </td>

                            {/* KPI scale badge */}
                            <td style={tdBase('left', { background: rowBg })}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 500,
                                background: '#F3F4F6', color: '#4A5565', border: '1px solid #D1D5DC',
                              }}>
                                Manual Rating
                              </span>
                            </td>

                            {/* Weight */}
                            <td style={tdBase('center', {
                              color: '#475569', fontWeight: 500, fontSize: 13, background: rowBg,
                            })}>
                              {obj.weight}%
                            </td>

                            {/* Rating input */}
                            <td style={tdBase('center', { background: rowBg })}>
                              <input
                                type="number"
                                step="0.01"
                                min="1"
                                max="5"
                                value={ratings[obj.objective_id] ?? ''}
                                onChange={e => handleRatingChange(obj.objective_id, e.target.value)}
                                style={{
                                  width: 80,
                                  padding: '5px 8px',
                                  textAlign: 'center',
                                  border: `1px solid ${hasRatingError ? '#F87171' : '#D1D5DC'}`,
                                  borderRadius: 6,
                                  fontSize: 13,
                                  color: '#1E293B',
                                  background: hasRatingError ? '#FFF5F5' : '#fff',
                                  outline: 'none',
                                }}
                              />
                              {hasRatingError && (
                                <div style={{
                                  fontSize: 11, color: '#DC2626',
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  marginTop: 4, whiteSpace: 'nowrap',
                                }}>
                                  <AlertTriangle size={10} />
                                  {errors[obj.objective_id]}
                                </div>
                              )}
                            </td>

                            {/* Comment input */}
                            <td style={tdBase('left', { background: rowBg, paddingTop: 10, paddingBottom: 10 })}>
                              <textarea
                                placeholder={
                                  isBelowThree
                                    ? 'Comment required for ratings below 3.0…'
                                    : 'Optional comment…'
                                }
                                value={comments[obj.objective_id] ?? ''}
                                onChange={e => handleCommentChange(obj.objective_id, e.target.value)}
                                rows={2}
                                style={{
                                  width: '100%',
                                  padding: '6px 10px',
                                  border: `1px solid ${
                                    hasCommentError
                                      ? '#F87171'
                                      : isBelowThree
                                        ? '#FCD34D'
                                        : '#D1D5DC'
                                  }`,
                                  borderRadius: 6,
                                  fontSize: 12,
                                  color: '#1E293B',
                                  background: hasCommentError ? '#FFF5F5' : isBelowThree ? '#FFFBEB' : '#fff',
                                  outline: 'none',
                                  resize: 'none',
                                  fontFamily: 'Inter, sans-serif',
                                  lineHeight: '1.4',
                                  boxSizing: 'border-box',
                                }}
                              />
                              {hasCommentError && (
                                <div style={{
                                  fontSize: 11, color: '#DC2626',
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  marginTop: 2,
                                }}>
                                  <AlertTriangle size={10} />
                                  {commentErrors[obj.objective_id]}
                                </div>
                              )}
                              {isBelowThree && !hasCommentError && (
                                <div style={{
                                  fontSize: 11, color: '#92400E',
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  marginTop: 2,
                                }}>
                                  <AlertTriangle size={10} />
                                  Comment required for this rating
                                </div>
                              )}
                            </td>

                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Success message */}
        {submitMsg === 'success' && (
          <div style={{
            background: '#F0FDF4', border: '1px solid #BBF7D0',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: 13, color: '#16A34A',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CheckCircle size={15} />
            Ratings submitted successfully! Redirecting to Rating Settings…
          </div>
        )}

        {/* Validation error */}
        {submitMsg === 'error' && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: 13, color: '#DC2626',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <AlertTriangle size={15} />
            Please fix the errors above before submitting. Comments are required for ratings below 3.0.
          </div>
        )}

        {/* API / network error */}
        {submitMsg !== '' && submitMsg !== 'success' && submitMsg !== 'error' && (
          <div style={{
            background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: 8, padding: '12px 16px', marginBottom: 16,
            fontSize: 13, color: '#DC2626',
          }}>
            ❌ {submitMsg}
          </div>
        )}

        {/* ── Submit bar: box-shadow only, matching table card style ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', background: '#fff',
          borderTop: '1px solid #E2E8F0',
          borderRight: '1px solid #E2E8F0',
          borderBottom: '1px solid #E2E8F0',
          borderLeft: '1px solid #E2E8F0',
          borderRadius: 12,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 13, flex: 1,
            color: statusColor,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {renderStatusLabel()}
          </span>

          <button onClick={handleCancel} style={{
            padding: '10px 20px', borderRadius: 6,
            background: '#F1F5F9', border: '1px solid #E2E8F0',
            cursor: 'pointer', fontSize: 13, color: '#1E293B', fontWeight: 600,
          }}>
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            style={{
              padding: '10px 24px', borderRadius: 6, border: 'none',
              background: isSubmitDisabled ? '#93C5FD' : '#16A34A',
              cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
              fontSize: 13, color: '#fff', fontWeight: 600,
            }}
          >
            {saving ? 'Submitting…' : submitted ? 'Resubmit Ratings' : 'Submit Ratings'}
          </button>
        </div>

      </div>
    </div>
  );
}