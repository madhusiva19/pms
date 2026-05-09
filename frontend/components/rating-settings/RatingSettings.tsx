'use client';
import { useState, useEffect, useCallback, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Clock, CheckCircle, ChevronDown, ChevronUp,
  Send, Calendar, Users, BarChart3, Settings,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

interface RatingPeriod {
  id: number;
  pms_year: number;
  period: string;
  rating_start: string;
  rating_end: string;
  is_active: boolean;
}

interface RatingPeriodState {
  rating_open: boolean;
  active_period: string | null;
  pms_year: number;
  rating_start: string;
  rating_end: string;
  reason: string | null;
  periods: RatingPeriod[];
}

interface OverviewMember {
  id: string;
  name: string;
  role: string;
  designation: string;
  total: number;
  submitted: number;
  pending: number;
  pct: number;
  status: 'complete' | 'pending';
}

interface TeamMember {
  id: string;
  full_name: string;
  designation: string;
  template_name: string | null;
}

interface ManualRatingStatus {
  [userId: string]: { submitted: boolean; count: number };
}

const ROLE_LABELS: Record<string, string> = {
  hq_admin: 'HQ Admin', country_admin: 'Country Admin',
  branch_admin: 'Branch Admin', dept_admin: 'Dept Admin',
  sub_dept_admin: 'Sub Dept Admin', employee: 'Employee',
};

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Shared style tokens (match app theme) ──────────────────────────
const NAVY       = '#1C398E';
const BLUE_LIGHT = '#EFF6FF';
const BLUE_BORDER= '#BFDBFE';
const PAGE_BG    = '#F9FAFB';
const CARD_BG    = '#FFFFFF';
const BORDER     = '#E5E7EB';
const TEXT_HEAD  = '#101828';
const TEXT_BODY  = '#374151';
const TEXT_SUB   = '#4A5565';
const TEXT_MUTED = '#6B7280';
const TEXT_FAINT = '#9CA3AF';

// ── Reminder Modal ─────────────────────────────────────────────────
function ReminderModal({
  member, period, pmsYear, senderId, onClose, onSent,
}: {
  member: OverviewMember | TeamMember;
  period: string; pmsYear: number; senderId: string;
  onClose: () => void; onSent: () => void;
}) {
  const name = 'full_name' in member ? member.full_name : member.name;
  const [msg, setMsg] = useState(
    `Hi ${name}, please complete your pending manual ratings for ${period} ${pmsYear} as soon as possible. The rating window is closing soon.`
  );
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      await fetch(`${API}/api/manual-rating-notifications/send-reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id:    senderId,
          recipient_id: member.id,
          period,
          pms_year:     pmsYear,
          message:      msg,
        }),
      });
      setSent(true);
      setTimeout(() => { onSent(); onClose(); }, 1200);
    } catch {
      setSending(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: CARD_BG, borderRadius: 14, padding: 28, width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', fontFamily: 'Inter, sans-serif' }}>

        {/* Modal header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: BLUE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Send size={16} color={NAVY} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT_HEAD }}>Send Reminder</p>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>To: {name}</p>
          </div>
        </div>

        <div style={{ height: 1, background: BORDER, margin: '16px 0' }} />

        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={5}
          style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            border: `1px solid ${BORDER}`, borderRadius: 8,
            fontSize: 13, color: TEXT_BODY, resize: 'vertical',
            outline: 'none', fontFamily: 'Inter, sans-serif',
            background: PAGE_BG, lineHeight: 1.6,
          }}
        />

        {sent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16A34A', fontSize: 13, marginTop: 10 }}>
            <CheckCircle size={14} /> Reminder sent successfully!
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${BORDER}`, background: CARD_BG, fontSize: 13, cursor: 'pointer', color: TEXT_BODY, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
            Cancel
          </button>
          <button onClick={handleSend} disabled={sending || sent} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: sent ? '#16A34A' : NAVY,
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: (sending || sent) ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            opacity: sending ? 0.8 : 1,
          }}>
            {sending ? 'Sending…' : sent ? 'Sent!' : 'Send Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Period Modal ──────────────────────────────────────────────
function EditPeriodModal({
  period, pmsYear, currentStart, currentEnd, onClose, onSaved,
}: {
  period: string; pmsYear: number;
  currentStart: string; currentEnd: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [start,  setStart]  = useState(currentStart?.slice(0, 10) ?? '');
  const [end,    setEnd]    = useState(currentEnd?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    if (!start || !end)                           { setError('Both dates are required.');            return; }
    if (new Date(end) <= new Date(start))          { setError('End date must be after start date.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/api/rating-periods/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, pms_year: pmsYear, rating_start: start, rating_end: end }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 1000);
    } catch {
      setError('Failed to save. Please try again.');
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: `1px solid ${BORDER}`, borderRadius: 8,
    fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif',
    color: TEXT_BODY, background: PAGE_BG,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: TEXT_SUB, display: 'block', marginBottom: 6,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: CARD_BG, borderRadius: 14, padding: 28, width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.18)', fontFamily: 'Inter, sans-serif' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: BLUE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={16} color={NAVY} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT_HEAD }}>Edit Rating Period</p>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED }}>{period} {pmsYear}</p>
          </div>
        </div>

        <div style={{ height: 1, background: BORDER, margin: '16px 0' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Rating Start</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Rating End</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
          </div>
        </div>

        {error && <p style={{ color: '#DC2626', fontSize: 12, marginTop: 10, margin: '10px 0 0' }}>{error}</p>}
        {saved && <p style={{ color: '#16A34A', fontSize: 12, marginTop: 10, margin: '10px 0 0' }}>Period updated successfully!</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${BORDER}`, background: CARD_BG, fontSize: 13, cursor: 'pointer', color: TEXT_BODY, fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || saved} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none',
            background: saved ? '#16A34A' : NAVY,
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: (saving || saved) ? 'not-allowed' : 'pointer',
            fontFamily: 'Inter, sans-serif',
            opacity: saving ? 0.8 : 1,
          }}>
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────
export default function RatingSettings() {
  const { user } = useAuth();
  const router   = useRouter();

  const roleSlug      = user?.role?.replace(/_/g, '-') ?? 'branch-admin';
  const canEditPeriod = user?.role === 'country_admin' || user?.role === 'hq_admin';
  const evaluatorId   = user?.id ?? '';

  const [selectedPeriod, setSelectedPeriod] = useState<'H1' | 'H2'>('H1');
  const [periodData,     setPeriodData]     = useState<RatingPeriodState | null>(null);
  const [overview,       setOverview]       = useState<OverviewMember[]>([]);
  const [team,           setTeam]           = useState<TeamMember[]>([]);
  const [ratingStatus,   setRatingStatus]   = useState<ManualRatingStatus>({});
  const [loading,        setLoading]        = useState(true);
  const [expandedRows,   setExpandedRows]   = useState<Record<string, boolean>>({});
  const [reminderTarget, setReminderTarget] = useState<OverviewMember | TeamMember | null>(null);
  const [editPeriodOpen, setEditPeriodOpen] = useState(false);

  const pmsYear = periodData?.pms_year ?? 2026;

  const fetchAll = useCallback(async () => {
    if (!evaluatorId) return;
    setLoading(true);
    try {
      const [periodRes, overviewRes, teamRes] = await Promise.all([
        fetch(`${API}/api/rating-periods/current`),
        fetch(`${API}/api/rating-settings/overview/${evaluatorId}?period=${selectedPeriod}&year=2025`),
        fetch(`${API}/api/evaluator/${evaluatorId}/team`),
      ]);

      const periodJson   = await periodRes.json();
      const overviewJson = await overviewRes.json();
      const teamJson     = await teamRes.json();

      setPeriodData(periodJson);
      setOverview(Array.isArray(overviewJson) ? overviewJson : []);
      setTeam(Array.isArray(teamJson) ? teamJson : []);

      if (Array.isArray(teamJson) && teamJson.length > 0) {
        const statuses: ManualRatingStatus = {};
        await Promise.all(teamJson.map(async (m: TeamMember) => {
          try {
            const res  = await fetch(`${API}/api/manual-objectives/${m.id}?year=2025&period=${selectedPeriod}`);
            const data = await res.json();
            if (Array.isArray(data)) {
              const submitted = data.filter((o: { manual_rating: number | null }) => o.manual_rating !== null).length;
              statuses[m.id] = { submitted: submitted === data.length && data.length > 0, count: data.length - submitted };
            }
          } catch { statuses[m.id] = { submitted: false, count: 0 }; }
        }));
        setRatingStatus(statuses);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [evaluatorId, selectedPeriod]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleRow = (id: string) => setExpandedRows(p => ({ ...p, [id]: !p[id] }));
  const activePeriodData = periodData?.periods?.find(p => p.period === selectedPeriod);

  if (loading) return (
    <div style={{ padding: '40px 24px', fontFamily: 'Inter, sans-serif', color: TEXT_MUTED, fontSize: 14 }}>
      Loading…
    </div>
  );

  // ── Shared table header cell ───────────────────────────────────
  const TH = ({ children }: { children: React.ReactNode }) => (
    <th style={{
      padding: '11px 16px', textAlign: 'left',
      fontSize: 11, fontWeight: 700, color: TEXT_SUB,
      textTransform: 'uppercase', letterSpacing: '0.06em',
      background: '#F9FAFB', borderBottom: `2px solid ${BORDER}`,
    }}>
      {children}
    </th>
  );

  return (
    <main style={{
      minHeight: '100vh', background: PAGE_BG,
      fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      padding: '32px',
    }}>

      {/* ── Modals ── */}
      {reminderTarget && (
        <ReminderModal
          member={reminderTarget}
          period={selectedPeriod}
          pmsYear={pmsYear}
          senderId={evaluatorId}
          onClose={() => setReminderTarget(null)}
          onSent={fetchAll}
        />
      )}
      {editPeriodOpen && activePeriodData && (
        <EditPeriodModal
          period={selectedPeriod}
          pmsYear={activePeriodData.pms_year}
          currentStart={activePeriodData.rating_start}
          currentEnd={activePeriodData.rating_end}
          onClose={() => setEditPeriodOpen(false)}
          onSaved={fetchAll}
        />
      )}

      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Breadcrumb — matches notifications page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, marginBottom: 16 }}>
          <Link href="/dashboard" style={{ color: TEXT_MUTED, textDecoration: 'none' }}>Home</Link>
          <span style={{ color: TEXT_MUTED }}>›</span>
          <span style={{ color: TEXT_HEAD }}>Rating Settings</span>
        </div>

        {/* Page header + H1/H2 toggle */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 30, fontWeight: 600, color: TEXT_HEAD, margin: '0 0 8px' }}>Rating Settings</h1>
            <p style={{ fontSize: 16, color: TEXT_SUB, margin: 0 }}>Manage manual ratings and monitor team progress</p>
          </div>

          {/* Period toggle — pill style matching Notifications tabs */}
          <div style={{ display: 'flex', gap: 10 }}>
            {(['H1', 'H2'] as const).map(p => {
              const active = p === selectedPeriod;
              return (
                <button key={p} onClick={() => setSelectedPeriod(p)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 20px', borderRadius: 999,
                  border: active ? 'none' : `1px solid ${BORDER}`,
                  background: active ? NAVY : CARD_BG,
                  color: active ? '#fff' : TEXT_BODY,
                  fontSize: 14, fontWeight: active ? 700 : 600,
                  cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>
                  {p} 2025
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Rating Period Banner ─────────────────────────────── */}
        <div style={{
          background: CARD_BG, border: `1px solid ${BORDER}`,
          borderRadius: 12, padding: '20px 24px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: BLUE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Calendar size={15} color={NAVY} />
                </div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT_HEAD }}>
                  Rating Period — {selectedPeriod} {activePeriodData?.pms_year ?? 2025}
                </h3>
                {/* Open/Closed badge */}
                <span style={{
                  padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: periodData?.rating_open ? '#DCFCE7' : '#FEF9C3',
                  color:      periodData?.rating_open ? '#166534'  : '#854D0E',
                  border:     `1px solid ${periodData?.rating_open ? '#BBF7D0' : '#FDE047'}`,
                }}>
                  {periodData?.rating_open ? '● Open' : '● Closed'}
                </span>
              </div>
              {activePeriodData ? (
                <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, paddingLeft: 42 }}>
                  {formatDate(activePeriodData.rating_start)} → {formatDate(activePeriodData.rating_end)}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: TEXT_FAINT, paddingLeft: 42 }}>
                  {periodData?.reason ?? 'No period configured for this half.'}
                </p>
              )}
            </div>

            {canEditPeriod && activePeriodData && (
              <button onClick={() => setEditPeriodOpen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 10, border: `1px solid ${BLUE_BORDER}`,
                background: BLUE_LIGHT, color: NAVY,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}>
                <Settings size={14} /> Edit Period
              </button>
            )}
          </div>
        </div>

        {/* ── Rating Overview ──────────────────────────────────── */}
        <div style={{
          background: CARD_BG, border: `1px solid ${BORDER}`,
          borderRadius: 12, marginBottom: 24, overflow: 'hidden',
        }}>
          {/* Section header */}
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: BLUE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BarChart3 size={15} color={NAVY} />
            </div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT_HEAD }}>Rating Overview</h3>
            <span style={{ fontSize: 13, color: TEXT_MUTED }}>— How your team is progressing with ratings</span>
          </div>

          {overview.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: TEXT_FAINT, fontSize: 15 }}>
              No team members found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Role', 'To Rate', 'Rated', 'Pending', 'Progress', 'Status', 'Action'].map(h => (
                      <TH key={h}>{h}</TH>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overview.map(member => (
                    <Fragment key={member.id}>
                      <tr
                        style={{ borderBottom: `1px solid ${BORDER}`, background: CARD_BG, transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = CARD_BG)}
                      >
                        {/* Name */}
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => toggleRow(member.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: TEXT_MUTED, display: 'flex' }}>
                              {expandedRows[member.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_HEAD }}>{member.name}</div>
                              <div style={{ fontSize: 11, color: TEXT_FAINT }}>{member.designation}</div>
                            </div>
                          </div>
                        </td>

                        {/* Role */}
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: '#F1F5F9', color: TEXT_SUB, fontWeight: 600 }}>
                            {ROLE_LABELS[member.role] ?? member.role}
                          </span>
                        </td>

                        {/* To Rate */}
                        <td style={{ padding: '13px 16px', fontSize: 13, color: TEXT_HEAD, fontWeight: 600 }}>{member.total}</td>

                        {/* Rated */}
                        <td style={{ padding: '13px 16px', fontSize: 13, color: '#16A34A', fontWeight: 700 }}>{member.submitted}</td>

                        {/* Pending */}
                        <td style={{ padding: '13px 16px', fontSize: 13, color: member.pending > 0 ? '#D97706' : '#16A34A', fontWeight: 700 }}>{member.pending}</td>

                        {/* Progress bar */}
                        <td style={{ padding: '13px 16px', minWidth: 140 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{
                                width: `${member.pct}%`, height: '100%', borderRadius: 99,
                                background: member.pct === 100 ? '#16A34A' : NAVY,
                                transition: 'width 0.4s',
                              }} />
                            </div>
                            <span style={{ fontSize: 11, color: TEXT_MUTED, minWidth: 34, fontWeight: 600 }}>{member.pct}%</span>
                          </div>
                        </td>

                        {/* Status badge */}
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background: member.status === 'complete' ? '#DCFCE7' : '#FEF9C3',
                            color:      member.status === 'complete' ? '#166534'  : '#854D0E',
                            border:     `1px solid ${member.status === 'complete' ? '#BBF7D0' : '#FDE047'}`,
                          }}>
                            {member.status === 'complete' ? <CheckCircle size={10} /> : <Clock size={10} />}
                            {member.status === 'complete' ? 'Complete' : 'Pending'}
                          </span>
                        </td>

                        {/* Remind action */}
                        <td style={{ padding: '13px 16px' }}>
                          {member.pending > 0 && (
                            <button onClick={() => setReminderTarget(member)} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '6px 12px', borderRadius: 8,
                              border: `1px solid ${BLUE_BORDER}`,
                              background: BLUE_LIGHT, color: NAVY,
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif',
                            }}>
                              <Send size={11} /> Remind
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {expandedRows[member.id] && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0 16px 14px 52px', background: '#F9FAFB', borderBottom: `1px solid ${BORDER}` }}>
                            <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6 }}>
                              <strong style={{ color: TEXT_HEAD }}>{member.name}</strong> has rated{' '}
                              <strong style={{ color: '#16A34A' }}>{member.submitted}</strong> out of{' '}
                              <strong style={{ color: TEXT_HEAD }}>{member.total}</strong> manual objectives for {selectedPeriod} 2025.
                              {member.pending > 0 && (
                                <span style={{ color: '#D97706', fontWeight: 600 }}> {member.pending} still pending.</span>
                              )}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── My Team — Manual Ratings ─────────────────────────── */}
        <div style={{
          background: CARD_BG, border: `1px solid ${BORDER}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: BLUE_LIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={15} color={NAVY} />
            </div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: TEXT_HEAD }}>My Team — Manual Ratings</h3>
            <span style={{ fontSize: 13, color: TEXT_MUTED }}>— Click to enter ratings for a team member</span>
          </div>

          {team.length === 0 ? (
            <div style={{ padding: '48px 24px', textAlign: 'center', color: TEXT_FAINT, fontSize: 15 }}>
              No team members found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Designation', 'Template', 'Status', 'Actions'].map(h => (
                      <TH key={h}>{h}</TH>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.map(member => {
                    const status = ratingStatus[member.id];
                    return (
                      <tr key={member.id}
                        style={{ borderBottom: `1px solid ${BORDER}`, background: CARD_BG, transition: 'background 0.1s' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = CARD_BG)}
                      >
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: TEXT_HEAD }}>{member.full_name}</div>
                        </td>
                        <td style={{ padding: '13px 16px', fontSize: 13, color: TEXT_SUB }}>{member.designation || '—'}</td>
                        <td style={{ padding: '13px 16px', fontSize: 13, color: TEXT_SUB }}>{member.template_name || '—'}</td>
                        <td style={{ padding: '13px 16px' }}>
                          {status ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                              background: status.submitted ? '#DCFCE7' : '#FEF9C3',
                              color:      status.submitted ? '#166534'  : '#854D0E',
                              border:     `1px solid ${status.submitted ? '#BBF7D0' : '#FDE047'}`,
                            }}>
                              {status.submitted ? <CheckCircle size={10} /> : <Clock size={10} />}
                              {status.submitted ? 'Submitted' : `${status.count} pending`}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: TEXT_FAINT }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              onClick={() => router.push(`/${roleSlug}/manual-rating?userId=${member.id}&year=2025&period=${selectedPeriod}`)}
                              style={{
                                padding: '7px 14px', borderRadius: 8, border: 'none',
                                background: NAVY, color: '#fff',
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                fontFamily: 'Inter, sans-serif',
                              }}>
                              Manual Rating
                            </button>
                            {status && !status.submitted && (
                              <button onClick={() => setReminderTarget(member)} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '7px 12px', borderRadius: 8,
                                border: `1px solid ${BLUE_BORDER}`,
                                background: BLUE_LIGHT, color: NAVY,
                                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                fontFamily: 'Inter, sans-serif',
                              }}>
                                <Send size={11} /> Remind
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}