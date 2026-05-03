'use client';
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

interface ManualObjective {
  objective_id:   number;
  objective_name: string;
  category_id:    number;
  category_name:  string;
  weight:         number;
  kpi_scale:      string;
  manual_rating:  number | null;
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

  const userId = searchParams.get('userId') ?? '';
  const year   = parseInt(searchParams.get('year') ?? '2026', 10);
  const period = searchParams.get('period') ?? 'H1';

  const [member,       setMember]       = useState<TeamMember | null>(null);
  const [objectives,   setObjectives]   = useState<ManualObjective[]>([]);
  const [ratings,      setRatings]      = useState<Record<number, string>>({});
  const [errors,       setErrors]       = useState<Record<number, string>>({});
  const [globalError,  setGlobalError]  = useState('');
  const [submitMsg,    setSubmitMsg]    = useState('');
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [submitted,    setSubmitted]    = useState(false);
  const [isDirty,      setIsDirty]      = useState(false);
  const [ratingPeriod, setRatingPeriod] = useState<RatingPeriod | null>(null);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [teamRes, objRes, periodRes] = await Promise.all([
        fetch(`${API}/api/evaluator/${EVALUATOR_ID}/team`),
        fetch(`${API}/api/manual-objectives/${userId}?year=${year}&period=${period}`),
        fetch(`${API}/api/rating-periods/current`),
      ]);

      const teamData   = await teamRes.json();
      const objData    = await objRes.json();
      const periodData = await periodRes.json();

      if (Array.isArray(teamData)) {
        const found = teamData.find((m: TeamMember) => m.id === userId);
        if (found) setMember(found);
      }

      if (Array.isArray(objData)) {
        setObjectives(objData);
        const pre: Record<number, string> = {};
        let hasAny = false;
        objData.forEach((obj: ManualObjective) => {
          if (obj.manual_rating !== null && obj.manual_rating !== undefined) {
            pre[obj.objective_id] = String(obj.manual_rating);
            hasAny = true;
          }
        });
        setRatings(pre);
        setSubmitted(hasAny);
      }

      setRatingPeriod(periodData);
    } catch {
      setGlobalError('Failed to load data. Make sure Flask is running on port 5000.');
    }
    setLoading(false);
  }, [userId, year, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Inline real-time validation on every keystroke ───────────────
  const handleRatingChange = (objId: number, val: string) => {
    setRatings(prev => ({ ...prev, [objId]: val }));
    setSubmitMsg('');
    setIsDirty(true);

    if (!val || val.trim() === '') {
      setErrors(prev => ({ ...prev, [objId]: '' }));
    } else {
      const num = parseFloat(val);
      if (isNaN(num) || num < 1 || num > 5) {
        setErrors(prev => ({ ...prev, [objId]: 'Invalid' }));
      } else {
        setErrors(prev => ({ ...prev, [objId]: '' }));
      }
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<number, string> = {};
    let valid = true;
    objectives.forEach(obj => {
      const val = ratings[obj.objective_id];
      if (!val || val.trim() === '') {
        newErrors[obj.objective_id] = 'Invalid';
        valid = false;
      } else {
        const num = parseFloat(val);
        if (isNaN(num) || num < 1 || num > 5) {
          newErrors[obj.objective_id] = 'Invalid';
          valid = false;
        }
      }
    });
    setErrors(newErrors);
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
        objective_id:  obj.objective_id,
        manual_rating: parseFloat(parseFloat(ratings[obj.objective_id]).toFixed(2)),
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
      setTimeout(() => router.push('/my-team'), 1800);

    } catch (e: unknown) {
      setSubmitMsg(e instanceof Error ? e.message : 'Submission failed. Please try again.');
    }
    setSaving(false);
  };

  const handleCancel = () => {
    if (isDirty && !confirm('You have unsaved changes. Leave anyway?')) return;
    router.push('/my-team');
  };

  const grouped = objectives.reduce<Record<string, ManualObjective[]>>((acc, obj) => {
    acc[obj.category_name] = acc[obj.category_name] ?? [];
    acc[obj.category_name].push(obj);
    return acc;
  }, {});

  // ── Loading / error states ────────────────────────────────────────
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
        <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 15, marginBottom: 8 }}>
          ⚠️ Failed to Load
        </div>
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

  const tdStyle = (align: 'left' | 'center' = 'left', extra?: React.CSSProperties): React.CSSProperties => ({
    padding: P, textAlign: align, verticalAlign: 'middle', ...extra,
  });

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
          <Link href="/my-team" style={{ color: '#64748B', textDecoration: 'none' }}>My Team</Link>
          <span>›</span>
          <span style={{ color: '#1E293B', fontWeight: 700 }}>Manual Ratings</span>
        </div>

        {/* Page header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: 20, gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <h1 style={{
              fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 600,
              color: '#101828', margin: '0 0 4px',
            }}>
              {member?.full_name ?? 'Team Member'}
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
          <strong>5.00</strong> for each objective. All objectives must be rated before
          submitting. You can re-edit and resubmit anytime within the rating window.
        </div>

        {/* Table */}
        <div style={{
          background: '#fff', border: '1px solid #E2E8F0',
          borderRadius: 12, overflow: 'hidden', marginBottom: 16,
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1E293B' }}>
              Manual Objectives — {period} {year}
            </h3>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={thStyle('left')}>Category</th>
                  <th style={thStyle('left')}>Objective</th>
                  <th style={thStyle('left')}>KPI Scale</th>
                  <th style={thStyle('center')}>Weight</th>
                  <th style={thStyle('center')}>Rating (1–5)</th>
                  <th style={thStyle('left')}></th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(grouped).map(([catName, objs], gi) => (
                  <React.Fragment key={catName}>
                    {objs.map((obj, oi) => {
                      const hasError = !!errors[obj.objective_id];

                      return (
                        <tr key={obj.objective_id} style={{
                          borderTop:    oi === 0 && gi > 0 ? '2px solid #CBD5E1' : 'none',
                          borderBottom: '1px solid #E8EDF5',
                          background:   '#fff',
                        }}>

                          {/* Category — first row only with blue left accent */}
                          <td style={tdStyle('left', {
                            color:      '#1E293B',
                            fontWeight: oi === 0 ? 700 : 400,
                            fontSize:   13,
                            borderLeft: oi === 0 ? '3px solid #2563EB' : '3px solid transparent',
                            background: oi === 0 ? '#F8FAFF' : '#fff',
                          })}>
                            {oi === 0 ? catName : ''}
                          </td>

                          {/* Objective name */}
                          <td style={tdStyle('left', {
                            color:      '#1C398E',
                            fontWeight: 500,
                            fontSize:   13,
                            background: oi === 0 ? '#F8FAFF' : '#fff',
                          })}>
                            {obj.objective_name}
                          </td>

                          {/* KPI Scale badge */}
                          <td style={tdStyle('left', {
                            background: oi === 0 ? '#F8FAFF' : '#fff',
                          })}>
                            <span style={{
                              display:      'inline-flex',
                              alignItems:   'center',
                              gap:          4,
                              padding:      '3px 10px',
                              borderRadius: 6,
                              fontSize:     11,
                              fontWeight:   500,
                              background:   '#F3F4F6',
                              color:        '#4A5565',
                              border:       '1px solid #D1D5DC',
                            }}>
                              Manual Rating
                            </span>
                          </td>

                          {/* Weight */}
                          <td style={tdStyle('center', {
                            color:      '#475569',
                            fontWeight: 500,
                            fontSize:   13,
                            background: oi === 0 ? '#F8FAFF' : '#fff',
                          })}>
                            {obj.weight}%
                          </td>

                          {/* Rating input */}
                          <td style={tdStyle('center', {
                            background: oi === 0 ? '#F8FAFF' : '#fff',
                          })}>
                            <input
                              type="number"
                              step="0.01"
                              min="1"
                              max="5"
                              value={ratings[obj.objective_id] ?? ''}
                              onChange={e => handleRatingChange(obj.objective_id, e.target.value)}
                              style={{
                                width:        80,
                                padding:      '5px 8px',
                                textAlign:    'center',
                                border:       `1px solid ${hasError ? '#F87171' : '#D1D5DC'}`,
                                borderRadius: 6,
                                fontSize:     13,
                                color:        '#1E293B',
                                background:   hasError ? '#FFF5F5' : '#fff',
                                outline:      'none',
                              }}
                            />
                          </td>

                          {/* Validation message — dedicated column, red only */}
                          <td style={tdStyle('left', {
                            background:  oi === 0 ? '#F8FAFF' : '#fff',
                            paddingLeft: 8,
                          })}>
                            {hasError && (
                              <span style={{
                                fontSize:   11,
                                color:      '#DC2626',
                                display:    'flex',
                                alignItems: 'center',
                                gap:        4,
                                whiteSpace: 'nowrap',
                                fontWeight: 500,
                              }}>
                                <AlertTriangle size={11} />
                                {errors[obj.objective_id]}
                              </span>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Success message */}
        {submitMsg === 'success' && (
          <div style={{
            background:   '#F0FDF4',
            border:       '1px solid #BBF7D0',
            borderRadius: 8,
            padding:      '12px 16px',
            marginBottom: 16,
            fontSize:     13,
            color:        '#16A34A',
            display:      'flex',
            alignItems:   'center',
            gap:          8,
          }}>
            <CheckCircle size={15} />
            Ratings submitted successfully! Redirecting to My Team…
          </div>
        )}

        {/* Validation error — shown when Submit clicked with invalid/missing ratings */}
        {submitMsg === 'error' && (
          <div style={{
            background:   '#FEF2F2',
            border:       '1px solid #FECACA',
            borderRadius: 8,
            padding:      '12px 16px',
            marginBottom: 16,
            fontSize:     13,
            color:        '#DC2626',
            display:      'flex',
            alignItems:   'center',
            gap:          8,
          }}>
            <AlertTriangle size={15} />
            Please fix the invalid ratings before submitting.
          </div>
        )}

        {/* API / network error message */}
        {submitMsg !== '' && submitMsg !== 'success' && submitMsg !== 'error' && (
          <div style={{
            background:   '#FEF2F2',
            border:       '1px solid #FECACA',
            borderRadius: 8,
            padding:      '12px 16px',
            marginBottom: 16,
            fontSize:     13,
            color:        '#DC2626',
          }}>
            ❌ {submitMsg}
          </div>
        )}

        {/* Submit bar */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          12,
          padding:      '16px 20px',
          background:   '#fff',
          border:       '1px solid #E2E8F0',
          borderRadius: 12,
          flexWrap:     'wrap',
        }}>
          <span style={{
            fontSize:   13,
            flex:       1,
            color:      pendingCount > 0 ? '#D97706' : '#16A34A',
            display:    'flex',
            alignItems: 'center',
            gap:        6,
          }}>
            {pendingCount > 0 ? (
              <>
                <AlertTriangle size={14} />
                {pendingCount} objective{pendingCount > 1 ? 's' : ''} still need{pendingCount === 1 ? 's' : ''} a valid rating
              </>
            ) : (
              <>
                <CheckCircle size={14} />
                All objectives rated — ready to submit
              </>
            )}
          </span>
          <button onClick={handleCancel} style={{
            padding:      '10px 20px',
            borderRadius: 6,
            background:   '#F1F5F9',
            border:       '1px solid #E2E8F0',
            cursor:       'pointer',
            fontSize:     13,
            color:        '#1E293B',
            fontWeight:   600,
          }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{
            padding:      '10px 24px',
            borderRadius: 6,
            border:       'none',
            background:   saving ? '#93C5FD' : '#16A34A',
            cursor:       saving ? 'not-allowed' : 'pointer',
            fontSize:     13,
            color:        '#fff',
            fontWeight:   600,
          }}>
            {saving ? 'Submitting…' : submitted ? 'Resubmit Ratings' : 'Submit Ratings'}
          </button>
        </div>

      </div>
    </div>
  );
}