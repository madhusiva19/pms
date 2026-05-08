'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  Clock, CheckCircle, AlertTriangle, ChevronDown, ChevronUp,
  Send, Calendar, Users, BarChart3, Settings,
} from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

// ── Types ─────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  hq_admin: 'HQ Admin', country_admin: 'Country Admin',
  branch_admin: 'Branch Admin', dept_admin: 'Dept Admin',
  sub_dept_admin: 'Sub Dept Admin', employee: 'Employee',
};

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Reminder Modal ────────────────────────────────────────────────
function ReminderModal({
  member, period, pmsYear, senderId,
  onClose, onSent,
}: {
  member: OverviewMember | TeamMember;
  period: string; pmsYear: number; senderId: string;
  onClose: () => void; onSent: () => void;
}) {
  const name = 'full_name' in member ? member.full_name : member.name;
  const [msg, setMsg] = useState(
    `Hi ${ name }, please complete your pending manual ratings for ${period} ${pmsYear} as soon as possible. The rating window is closing soon.`
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
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: 28,
        width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Send size={18} color="#2563EB" />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#101828' }}>
            Send Reminder to {name}
          </h3>
        </div>
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={5}
          style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            border: '1px solid #E2E8F0', borderRadius: 8, fontSize: 13,
            color: '#1E293B', resize: 'vertical', outline: 'none', fontFamily: 'Inter, sans-serif',
          }}
        />
        {sent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16A34A', fontSize: 13, marginTop: 10 }}>
            <CheckCircle size={14} /> Reminder sent!
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 7, border: '1px solid #E2E8F0',
            background: '#F8F9FC', fontSize: 13, cursor: 'pointer', color: '#1E293B',
          }}>Cancel</button>
          <button onClick={handleSend} disabled={sending || sent} style={{
            padding: '8px 20px', borderRadius: 7, border: 'none',
            background: sent ? '#16A34A' : '#2563EB',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: sending ? 'not-allowed' : 'pointer',
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
  period, pmsYear, currentStart, currentEnd,
  onClose, onSaved,
}: {
  period: string; pmsYear: number;
  currentStart: string; currentEnd: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [start,   setStart]   = useState(currentStart?.slice(0, 10) ?? '');
  const [end,     setEnd]     = useState(currentEnd?.slice(0, 10) ?? '');
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  const handleSave = async () => {
    if (!start || !end) { setError('Both dates are required.'); return; }
    if (new Date(end) <= new Date(start)) { setError('End date must be after start date.'); return; }
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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: 28,
        width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Calendar size={18} color="#2563EB" />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#101828' }}>
            Edit Rating Period — {period} {pmsYear}
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>
              Rating Start
            </label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, outline: 'none' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 5 }}>
              Rating End
            </label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 13, outline: 'none' }} />
          </div>
        </div>
        {error && <p style={{ color: '#DC2626', fontSize: 12, marginTop: 10 }}>{error}</p>}
        {saved && <p style={{ color: '#16A34A', fontSize: 12, marginTop: 10 }}>✅ Period updated successfully!</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            padding: '8px 18px', borderRadius: 7, border: '1px solid #E2E8F0',
            background: '#F8F9FC', fontSize: 13, cursor: 'pointer', color: '#1E293B',
          }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || saved} style={{
            padding: '8px 20px', borderRadius: 7, border: 'none',
            background: saved ? '#16A34A' : '#2563EB',
            color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────
export default function RatingSettings() {
  const { user } = useAuth();
  const router   = useRouter();

  const roleSlug   = user?.role?.replace(/_/g, '-') ?? 'branch-admin';
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

      // Fetch manual rating status for each team member
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
    <div style={{ padding: '40px 24px', fontFamily: 'Inter, sans-serif', color: '#64748B', fontSize: 14 }}>
      Loading…
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#F8F9FC', fontFamily: 'Inter, sans-serif', padding: '24px' }}>

      {/* Reminder Modal */}
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

      {/* Edit Period Modal */}
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

        {/* Breadcrumb */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, fontSize: 13, color: '#64748B', alignItems: 'center' }}>
          <Link href="/dashboard" style={{ color: '#64748B', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ color: '#1E293B' }}>Rating Settings</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: '#101828', margin: '0 0 4px' }}>Rating Settings</h1>
            <p style={{ fontSize: 15, color: '#4A5565', margin: 0 }}>Manage manual ratings and monitor team progress</p>
          </div>
          {/* Period toggle */}
          <div style={{ display: 'flex', background: '#F3F4F6', borderRadius: 12, padding: 3 }}>
            {(['H1', 'H2'] as const).map(p => {
              const active = p === selectedPeriod;
              return (
                <button key={p} onClick={() => setSelectedPeriod(p)}
                  style={{ padding: '5px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    background: active ? '#fff' : 'transparent', color: active ? '#1E293B' : '#64748B',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                  {p} 2025
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Rating Period Banner ───────────────────────────────── */}
        <div style={{
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
          padding: '20px 24px', marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Calendar size={16} color="#2563EB" />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#101828' }}>
                  Rating Period — {selectedPeriod} {activePeriodData?.pms_year ?? 2025}
                </h3>
                <span style={{
                  padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: periodData?.rating_open ? '#DCFCE7' : '#FEF9C3',
                  color:      periodData?.rating_open ? '#166534' : '#854D0E',
                  border:     `1px solid ${periodData?.rating_open ? '#BBF7D0' : '#FDE047'}`,
                }}>
                  {periodData?.rating_open ? '● Open' : '● Closed'}
                </span>
              </div>
              {activePeriodData ? (
                <p style={{ margin: 0, fontSize: 13, color: '#4A5565' }}>
                  {formatDate(activePeriodData.rating_start)} → {formatDate(activePeriodData.rating_end)}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: '#94A3B8' }}>
                  {periodData?.reason ?? 'No period configured for this half.'}
                </p>
              )}
            </div>
            {canEditPeriod && activePeriodData && (
              <button onClick={() => setEditPeriodOpen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 16px', borderRadius: 8, border: '1px solid #BFDBFE',
                background: '#EFF6FF', color: '#2563EB', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}>
                <Settings size={14} /> Edit Period
              </button>
            )}
          </div>
        </div>

        {/* ── Rating Overview ────────────────────────────────────── */}
        <div style={{
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
          marginBottom: 24, overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} color="#2563EB" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#101828' }}>Rating Overview</h3>
            <span style={{ fontSize: 12, color: '#64748B', marginLeft: 4 }}>— How your team is progressing with ratings</span>
          </div>

          {overview.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
              No team members found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFF', borderBottom: '2px solid #E2E8F0' }}>
                    {['Name', 'Role', 'To Rate', 'Rated', 'Pending', 'Progress', 'Status', 'Action'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overview.map(member => (
                    <>
                      <tr key={member.id}
                        style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFF')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => toggleRow(member.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#64748B' }}>
                              {expandedRows[member.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{member.name}</div>
                              <div style={{ fontSize: 11, color: '#94A3B8' }}>{member.designation}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#F1F5F9', color: '#475569' }}>
                            {ROLE_LABELS[member.role] ?? member.role}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{member.total}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#16A34A', fontWeight: 600 }}>{member.submitted}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: member.pending > 0 ? '#D97706' : '#16A34A', fontWeight: 600 }}>{member.pending}</td>
                        <td style={{ padding: '12px 16px', minWidth: 120 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${member.pct}%`, height: '100%', background: member.pct === 100 ? '#16A34A' : '#2563EB', borderRadius: 3, transition: 'width 0.4s' }} />
                            </div>
                            <span style={{ fontSize: 11, color: '#64748B', minWidth: 32 }}>{member.pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            background: member.status === 'complete' ? '#DCFCE7' : '#FEF9C3',
                            color:      member.status === 'complete' ? '#166534' : '#854D0E',
                            border:     `1px solid ${member.status === 'complete' ? '#BBF7D0' : '#FDE047'}`,
                          }}>
                            {member.status === 'complete' ? <CheckCircle size={10} /> : <Clock size={10} />}
                            {member.status === 'complete' ? 'Complete' : 'Pending'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {member.pending > 0 && (
                            <button onClick={() => setReminderTarget(member)} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              padding: '5px 12px', borderRadius: 6, border: '1px solid #BFDBFE',
                              background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 600,
                              cursor: 'pointer',
                            }}>
                              <Send size={11} /> Remind
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedRows[member.id] && (
                        <tr key={`${member.id}-detail`}>
                          <td colSpan={8} style={{ padding: '0 16px 12px 48px', background: '#F8FAFF' }}>
                            <div style={{ fontSize: 12, color: '#64748B', padding: '10px 0' }}>
                              <strong style={{ color: '#1E293B' }}>{member.name}</strong> has rated{' '}
                              <strong style={{ color: '#16A34A' }}>{member.submitted}</strong> out of{' '}
                              <strong>{member.total}</strong> manual objectives for {selectedPeriod} 2025.
                              {member.pending > 0 && (
                                <span style={{ color: '#D97706' }}> {member.pending} still pending.</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Team Member List with Manual Rating buttons ─────────── */}
        <div style={{
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} color="#2563EB" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#101828' }}>My Team — Manual Ratings</h3>
            <span style={{ fontSize: 12, color: '#64748B', marginLeft: 4 }}>— Click to enter ratings for a team member</span>
          </div>

          {team.length === 0 ? (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>
              No team members found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F8FAFF', borderBottom: '2px solid #E2E8F0' }}>
                    {['Name', 'Designation', 'Template', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {team.map(member => {
                    const status = ratingStatus[member.id];
                    return (
                      <tr key={member.id}
                        style={{ borderBottom: '1px solid #F1F5F9' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFF')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{member.full_name}</div>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#4A5565' }}>{member.designation || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: '#4A5565' }}>{member.template_name || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                          {status ? (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              background: status.submitted ? '#DCFCE7' : '#FEF9C3',
                              color:      status.submitted ? '#166534' : '#854D0E',
                              border:     `1px solid ${status.submitted ? '#BBF7D0' : '#FDE047'}`,
                            }}>
                              {status.submitted ? <CheckCircle size={10} /> : <Clock size={10} />}
                              {status.submitted ? 'Submitted' : `${status.count} pending`}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#94A3B8' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <button
                              onClick={() => router.push(`/${roleSlug}/manual-rating?userId=${member.id}&year=2025&period=${selectedPeriod}`)}
                              style={{
                                padding: '6px 14px', borderRadius: 6, border: 'none',
                                background: '#2563EB', color: '#fff', fontSize: 12,
                                fontWeight: 600, cursor: 'pointer',
                              }}>
                              Manual Rating
                            </button>
                            {status && !status.submitted && (
                              <button onClick={() => setReminderTarget(member)} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 5,
                                padding: '6px 12px', borderRadius: 6, border: '1px solid #BFDBFE',
                                background: '#EFF6FF', color: '#2563EB', fontSize: 12,
                                fontWeight: 600, cursor: 'pointer',
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
    </div>
  );
}