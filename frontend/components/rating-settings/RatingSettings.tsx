'use client';
import { useState, useEffect, useCallback, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Clock, CheckCircle, ChevronDown, ChevronUp, Send, Calendar, Settings } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

// ── Types ──────────────────────────────────────────────────────────
interface RatingPeriod {
  id: number; pms_year: number; period: string;
  rating_start: string; rating_end: string; is_active: boolean;
}
interface RatingPeriodState {
  rating_open: boolean; active_period: string | null;
  pms_year: number; rating_start: string; rating_end: string;
  reason: string | null; periods: RatingPeriod[];
}
interface OverviewMember {
  id: string; name: string; role: string; designation: string;
  total: number; submitted: number; pending: number;
  pct: number; status: 'complete' | 'pending';
}
interface TeamMember {
  id: string; full_name: string; designation: string; template_name: string | null;
}
interface ManualRatingStatus {
  [userId: string]: { submitted: boolean; count: number };
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Determine closest period to today (auto-select, no toggle) ─────
function getClosestPeriod(periods: RatingPeriod[]): RatingPeriod | null {
  if (!periods || periods.length === 0) return null;
  const now = Date.now();
  // Prefer currently open periods; else find nearest by start date
  const open = periods.find(p => p.is_active);
  if (open) return open;
  return periods.reduce((best, cur) => {
    const bestDiff = Math.abs(new Date(best.rating_start).getTime() - now);
    const curDiff  = Math.abs(new Date(cur.rating_start).getTime() - now);
    return curDiff < bestDiff ? cur : best;
  });
}

// ── Rating window state for the Enter Ratings button ──────────────
// Returns: 'open' | 'closed'
function ratingWindowState(ratingEnd: string | undefined): 'open' | 'closed' {
  if (!ratingEnd) return 'closed';
  return Date.now() > new Date(ratingEnd).getTime() ? 'closed' : 'open';
}

// ── Design tokens ──────────────────────────────────────────────────
const BLUE        = '#2563EB';
const BLUE_LIGHT  = '#EFF6FF';
const BLUE_BORDER = '#BFDBFE';
const PAGE_BG     = '#F9FAFB';
const CARD_BG     = '#FFFFFF';
const BORDER      = '#E5E7EB';
const TEXT_HEAD   = '#101828';
const TEXT_BODY   = '#374151';
const TEXT_SUB    = '#4A5565';
const TEXT_MUTED  = '#6B7280';
const TEXT_FAINT  = '#9CA3AF';

// ── Table header cell ──────────────────────────────────────────────
function TH({ children, center, width }: { children: React.ReactNode; center?: boolean; width?: string }) {
  return (
    <th style={{
      padding: '10px 16px',
      textAlign: center ? 'center' : 'left',
      fontSize: 11, fontWeight: 700, color: '#475569',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      background: '#F9FAFB', borderBottom: `2px solid ${BORDER}`,
      width: width ?? 'auto',
    }}>
      {children}
    </th>
  );
}

// ── Section header ─────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{
      padding: '18px 24px',
      borderBottom: `1px solid ${BORDER}`,
      borderLeft: `4px solid ${BLUE}`,
      background: CARD_BG,
    }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: TEXT_HEAD, lineHeight: 1.3 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 12.5, color: TEXT_MUTED }}>{subtitle}</p>
    </div>
  );
}

// ── Status pill ────────────────────────────────────────────────────
function StatusPill({ complete, label }: { complete: boolean; label?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
      background: complete ? '#DCFCE7' : '#FEF9C3',
      color:      complete ? '#166534' : '#854D0E',
      border:     `1px solid ${complete ? '#BBF7D0' : '#FDE047'}`,
    }}>
      {complete ? <CheckCircle size={10} /> : <Clock size={10} />}
      {label ?? (complete ? 'Complete' : 'Pending')}
    </span>
  );
}

// ── Remind button ──────────────────────────────────────────────────
function RemindBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 8,
      border: `1px solid ${BLUE_BORDER}`,
      background: BLUE_LIGHT, color: BLUE,
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      fontFamily: 'Inter, sans-serif',
    }}>
      <Send size={10} /> Remind
    </button>
  );
}

// ── Enter Ratings button — blue when open, amber locked pill when closed ──
function EnterRatingsBtn({ onClick, windowState }: {
  onClick: () => void;
  windowState: 'open' | 'closed';
}) {
  if (windowState === 'closed') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 14px', borderRadius: 8,
        background: '#FEF9C3', color: '#92400E',
        border: '1px solid #F59E0B',
        fontSize: 12.5, fontWeight: 600,
        cursor: 'not-allowed', userSelect: 'none',
        fontFamily: 'Inter, sans-serif',
      }}
        title="Rating period has ended"
      >
        🔒 Period Locked
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 16px', borderRadius: 8,
        border: 'none', background: BLUE, color: '#fff',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      Enter Ratings
    </button>
  );
}

// ── Reminder Modal ─────────────────────────────────────────────────
function ReminderModal({ member, period, pmsYear, senderId, onClose, onSent }: {
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_id: senderId, recipient_id: member.id, period, pms_year: pmsYear, message: msg }),
      });
      setSent(true);
      setTimeout(() => { onSent(); onClose(); }, 1200);
    } catch { setSending(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: CARD_BG, borderRadius: 12, padding: 28, width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', fontFamily: 'Inter, sans-serif' }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: TEXT_HEAD }}>Send Reminder</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: TEXT_MUTED }}>To: {name}</p>
        <div style={{ height: 1, background: BORDER, marginBottom: 16 }} />
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5} style={{
          width: '100%', padding: '10px 12px', boxSizing: 'border-box',
          border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13,
          color: TEXT_BODY, resize: 'vertical', outline: 'none',
          fontFamily: 'Inter, sans-serif', background: PAGE_BG, lineHeight: 1.6,
        }} />
        {sent && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#16A34A' }}>✓ Reminder sent successfully!</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${BORDER}`, background: CARD_BG, fontSize: 13, cursor: 'pointer', color: TEXT_BODY, fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSend} disabled={sending || sent} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none',
            background: sent ? '#16A34A' : BLUE, color: '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: (sending || sent) ? 'not-allowed' : 'pointer', opacity: sending ? 0.8 : 1,
          }}>
            {sending ? 'Sending…' : sent ? 'Sent!' : 'Send Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Period Modal ──────────────────────────────────────────────
function EditPeriodModal({ period, pmsYear, currentStart, currentEnd, onClose, onSaved }: {
  period: string; pmsYear: number; currentStart: string; currentEnd: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [start,  setStart]  = useState(currentStart?.slice(0, 10) ?? '');
  const [end,    setEnd]    = useState(currentEnd?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const handleSave = async () => {
    if (!start || !end)                   { setError('Both dates are required.'); return; }
    if (new Date(end) <= new Date(start)) { setError('End date must be after start date.'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API}/api/rating-periods/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, pms_year: pmsYear, rating_start: start, rating_end: end }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 1000);
    } catch { setError('Failed to save. Please try again.'); }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13,
    outline: 'none', fontFamily: 'Inter, sans-serif', color: TEXT_BODY, background: PAGE_BG,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: CARD_BG, borderRadius: 12, padding: 28, width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', fontFamily: 'Inter, sans-serif' }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: TEXT_HEAD }}>Edit Rating Period</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: TEXT_MUTED }}>{period} {pmsYear}</p>
        <div style={{ height: 1, background: BORDER, marginBottom: 16 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_SUB, display: 'block', marginBottom: 6 }}>Rating Start</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: TEXT_SUB, display: 'block', marginBottom: 6 }}>Rating End</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
          </div>
        </div>
        {error && <p style={{ color: '#DC2626', fontSize: 12, margin: '10px 0 0' }}>{error}</p>}
        {saved && <p style={{ color: '#16A34A', fontSize: 12, margin: '10px 0 0' }}>Period updated successfully!</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${BORDER}`, background: CARD_BG, fontSize: 13, cursor: 'pointer', color: TEXT_BODY, fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || saved} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none',
            background: saved ? '#16A34A' : BLUE, color: '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: (saving || saved) ? 'not-allowed' : 'pointer', opacity: saving ? 0.8 : 1,
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

  const [periodData,     setPeriodData]     = useState<RatingPeriodState | null>(null);
  const [activePeriod,   setActivePeriod]   = useState<RatingPeriod | null>(null);
  const [overview,       setOverview]       = useState<OverviewMember[]>([]);
  const [team,           setTeam]           = useState<TeamMember[]>([]);
  const [ratingStatus,   setRatingStatus]   = useState<ManualRatingStatus>({});
  const [loading,        setLoading]        = useState(true);
  const [expandedRows,   setExpandedRows]   = useState<Record<string, boolean>>({});
  const [reminderTarget, setReminderTarget] = useState<OverviewMember | TeamMember | null>(null);
  const [editPeriodOpen, setEditPeriodOpen] = useState(false);

  // Always use H2 2025 — most recent data in DB
  const FIXED_YEAR   = 2025;
  const FIXED_PERIOD = 'H2';

  const pmsYear        = activePeriod?.pms_year ?? FIXED_YEAR;
  const selectedPeriod = activePeriod?.period   ?? FIXED_PERIOD;
  const winState     = ratingWindowState(activePeriod?.rating_end);

  const fetchAll = useCallback(async () => {
    if (!evaluatorId) return;
    setLoading(true);
    try {
      const [periodRes, overviewRes, teamRes] = await Promise.all([
        fetch(`${API}/api/rating-periods/current`),
        fetch(`${API}/api/rating-settings/overview/${evaluatorId}?period=H2&year=2025`),
        fetch(`${API}/api/evaluator/${evaluatorId}/team`),
      ]);
      const periodJson   = await periodRes.json();
      const overviewJson = await overviewRes.json();
      const teamJson     = await teamRes.json();

      setPeriodData(periodJson);

      // Pin to H2 2025 — most recent data in DB
      const h2 = periodJson?.periods?.find((p: RatingPeriod) => p.period === 'H2' && p.pms_year === 2025)
              ?? getClosestPeriod(periodJson?.periods ?? []);
      setActivePeriod(h2);

      setOverview(Array.isArray(overviewJson) ? overviewJson : []);
      setTeam(Array.isArray(teamJson) ? teamJson : []);

      if (Array.isArray(teamJson) && teamJson.length > 0) {
        const statuses: ManualRatingStatus = {};
        await Promise.all(teamJson.map(async (m: TeamMember) => {
          try {
            const res  = await fetch(`${API}/api/manual-objectives/${m.id}?year=2025&period=H2`);
            const data = await res.json();
            if (Array.isArray(data)) {
              const submitted = data.filter((o: { manual_rating: number | null }) => o.manual_rating !== null).length;
              statuses[m.id] = { submitted: submitted === data.length && data.length > 0, count: data.length - submitted };
            }
          } catch { statuses[m.id] = { submitted: false, count: 0 }; }
        }));
        setRatingStatus(statuses);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [evaluatorId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleRow = (id: string) => setExpandedRows(p => ({ ...p, [id]: !p[id] }));

  if (loading) return (
    <div style={{ padding: '40px 24px', fontFamily: 'Inter, sans-serif', color: TEXT_MUTED, fontSize: 14 }}>Loading…</div>
  );

  return (
    <main style={{
      minHeight: '100vh', background: PAGE_BG,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '32px',
    }}>

      {/* Modals */}
      {reminderTarget && (
        <ReminderModal
          member={reminderTarget} period={selectedPeriod} pmsYear={pmsYear}
          senderId={evaluatorId} onClose={() => setReminderTarget(null)} onSent={fetchAll}
        />
      )}
      {editPeriodOpen && activePeriod && (
        <EditPeriodModal
          period={selectedPeriod} pmsYear={activePeriod.pms_year}
          currentStart={activePeriod.rating_start} currentEnd={activePeriod.rating_end}
          onClose={() => setEditPeriodOpen(false)} onSaved={fetchAll}
        />
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: TEXT_MUTED, marginBottom: 16 }}>
          <Link href="/dashboard" style={{ color: TEXT_MUTED, textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ color: TEXT_HEAD }}>Rating Settings</span>
        </div>

        {/* Page header — period chip styled grey/neutral so it looks read-only */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: TEXT_HEAD, margin: '0 0 6px' }}>Rating Settings</h1>
            <p style={{ fontSize: 15, color: TEXT_SUB, margin: 0 }}>Manage manual ratings and monitor team progress</p>
          </div>
          {activePeriod && (
            <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8,
              background: '#F3F4F6', color: TEXT_SUB,
              border: `1px solid ${BORDER}`,
              fontSize: 13, fontWeight: 600,
            }}>
              <Calendar size={13} color={TEXT_MUTED} />
              {activePeriod.period} {activePeriod.pms_year}
            </div>
          )}
        </div>

        {/* ── Rating Period Banner ──────────────────────────────── */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '18px 24px', marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                <Calendar size={14} color={BLUE} />
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: TEXT_HEAD }}>
                  Rating Period — {selectedPeriod} {activePeriod?.pms_year ?? 2025}
                </h3>
                <span style={{
                  padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: periodData?.rating_open ? '#DCFCE7' : '#FEF9C3',
                  color:      periodData?.rating_open ? '#166534' : '#854D0E',
                  border:     `1px solid ${periodData?.rating_open ? '#BBF7D0' : '#FDE047'}`,
                }}>
                  {periodData?.rating_open ? '● Open' : '● Closed'}
                </span>
                {winState === 'closed' && (
                  <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#FEF9C3', color: '#92400E', border: '1px solid #F59E0B' }}>
                    🔒 Locked
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: TEXT_MUTED }}>
                {activePeriod
                  ? `${formatDate(activePeriod.rating_start)} → ${formatDate(activePeriod.rating_end)}`
                  : (periodData?.reason ?? 'No period configured.')}
              </p>
            </div>
            {canEditPeriod && activePeriod && (
              <button onClick={() => setEditPeriodOpen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10,
                border: `1px solid ${BLUE_BORDER}`, background: BLUE_LIGHT, color: BLUE,
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}>
                <Settings size={13} /> Edit Period
              </button>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════
            MY TEAM — MANUAL RATINGS
        ══════════════════════════════════════════════════════════ */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          <SectionHeader
            title="My Team — Manual Ratings"
            subtitle="Enter and manage manual KPI ratings for each team member"
          />

          {team.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: TEXT_FAINT, fontSize: 14 }}>No team members found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '50%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <TH>Member</TH>
                    <TH center>Rating Status</TH>
                    <TH center>Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member, idx) => {
                    const status = ratingStatus[member.id];
                    const isLast = idx === team.length - 1;
                    return (
                      <tr key={member.id}
                        style={{ borderBottom: isLast ? 'none' : `1px solid ${BORDER}`, background: CARD_BG }}
                        onMouseEnter={e => (e.currentTarget.style.background = PAGE_BG)}
                        onMouseLeave={e => (e.currentTarget.style.background = CARD_BG)}
                      >
                        <td style={{ padding: '12px 20px 12px 28px' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: TEXT_HEAD }}>{member.full_name}</div>
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                          {status ? (
                            <StatusPill
                              complete={status.submitted}
                              label={status.submitted ? 'All Submitted' : `${status.count} pending`}
                            />
                          ) : (
                            <span style={{ fontSize: 12, color: TEXT_FAINT }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 20px', textAlign: 'center' }}>
                          <EnterRatingsBtn
                            windowState={winState}
                            onClick={() => router.push(`/${roleSlug}/manual-rating?userId=${member.id}&year=2025&period=H2`)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════
            RATING OVERVIEW
        ══════════════════════════════════════════════════════════ */}
        <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
          <SectionHeader
            title="Rating Overview"
            subtitle="Track how many members have completed their manual KPI submissions"
          />

          {overview.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: TEXT_FAINT, fontSize: 14 }}>No team members found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <TH>Member</TH>
                    <TH center width="100px">To Rate</TH>
                    <TH center width="110px">Submitted</TH>
                    <TH center width="100px">Pending</TH>
                    <TH width="180px">Completion</TH>
                    <TH center width="120px">Status</TH>
                    <TH center width="130px">Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {overview.map(member => (
                    <Fragment key={member.id}>
                      <tr
                        style={{ borderBottom: `1px solid ${BORDER}`, background: CARD_BG }}
                        onMouseEnter={e => (e.currentTarget.style.background = PAGE_BG)}
                        onMouseLeave={e => (e.currentTarget.style.background = CARD_BG)}
                      >
                        <td style={{ padding: '12px 20px 12px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => toggleRow(member.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: TEXT_MUTED, display: 'flex', flexShrink: 0 }}>
                              {expandedRows[member.id] ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                            <span style={{ fontSize: 13.5, fontWeight: 600, color: TEXT_HEAD }}>{member.name}</span>
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: BLUE }}>{member.total}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: '#16A34A' }}>{member.submitted}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: member.pending > 0 ? '#D97706' : '#16A34A' }}>{member.pending}</td>

                        <td style={{ padding: '12px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: BORDER, borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{
                                width: `${member.pct}%`, height: '100%', borderRadius: 99,
                                background: member.pct === 100 ? '#16A34A' : BLUE,
                                transition: 'width 0.4s',
                              }} />
                            </div>
                            <span style={{ fontSize: 11.5, color: TEXT_MUTED, minWidth: 36, fontWeight: 600 }}>{member.pct}%</span>
                          </div>
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <StatusPill complete={member.status === 'complete'} />
                        </td>

                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {member.pending > 0
                            ? <RemindBtn onClick={() => setReminderTarget(member)} />
                            : <span style={{ fontSize: 12, color: TEXT_FAINT }}>—</span>
                          }
                        </td>
                      </tr>

                      {expandedRows[member.id] && (
                        <tr>
                          <td colSpan={7} style={{ padding: '8px 20px 14px 50px', background: PAGE_BG, borderBottom: `1px solid ${BORDER}` }}>
                            <p style={{ margin: 0, fontSize: 12.5, color: TEXT_MUTED, lineHeight: 1.7 }}>
                              <strong style={{ color: TEXT_HEAD }}>{member.name}</strong> has submitted{' '}
                              <strong style={{ color: '#16A34A' }}>{member.submitted}</strong> of{' '}
                              <strong style={{ color: TEXT_HEAD }}>{member.total}</strong> manual KPIs for H2 2025.
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

                {overview.length > 0 && (
                  <tfoot>
                    <tr style={{ background: BLUE_LIGHT, borderTop: `2px solid ${BLUE_BORDER}` }}>
                      <td style={{ padding: '10px 20px', fontSize: 12.5, fontWeight: 700, color: BLUE }}>Team Summary</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: BLUE }}>{overview.length}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: '#16A34A' }}>{overview.filter(m => m.status === 'complete').length}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'center', fontSize: 12.5, fontWeight: 700, color: overview.some(m => m.pending > 0) ? '#D97706' : '#16A34A' }}>
                        {overview.filter(m => m.status !== 'complete').length}
                      </td>
                      <td colSpan={3} style={{ padding: '10px 20px', fontSize: 12, color: TEXT_SUB }}>
                        {overview.filter(m => m.status === 'complete').length} of {overview.length} members fully submitted
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}