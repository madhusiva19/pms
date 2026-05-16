'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Clock, CheckCircle, Send, Calendar, Settings, Filter, ChevronDown, Lock } from 'lucide-react';

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
interface MemberRatingStatus {
  submitted: boolean;
  pending:   number;
  total:     number;
}
interface ManualRatingStatus {
  [userId: string]: MemberRatingStatus;
}

// ── Helpers ────────────────────────────────────────────────────────

function dedupe(items: OrgItem[]): OrgItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = (item.name ?? '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getClosestPeriod(periods: RatingPeriod[]): RatingPeriod | null {
  if (!periods || periods.length === 0) return null;
  const now  = Date.now();
  const open = periods.find(p => p.is_active);
  if (open) return open;
  return periods.reduce((best, cur) => {
    const bestDiff = Math.abs(new Date(best.rating_start).getTime() - now);
    const curDiff  = Math.abs(new Date(cur.rating_start).getTime() - now);
    return curDiff < bestDiff ? cur : best;
  });
}

// ── Sub-components ─────────────────────────────────────────────────

function TH({ children, center, width }: {
  children: React.ReactNode; center?: boolean; width?: string;
}) {
  return (
    <th style={{
      padding: '10px 16px',
      textAlign: center ? 'center' : 'left',
      fontSize: 11, fontWeight: 700, color: '#475569',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      background: '#F9FAFB', borderBottom: '2px solid #E5E7EB',
      width: width ?? 'auto',
    }}>
      {children}
    </th>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{
      padding: '18px 24px',
      borderBottom: '1px solid #E5E7EB',
      borderLeft: '28px solid #2563EB',
      background: '#FFFFFF',
    }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#101828', lineHeight: 1.3 }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280' }}>{subtitle}</p>
    </div>
  );
}

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
      {label ?? (complete ? 'Submitted' : 'Pending')}
    </span>
  );
}

function RemindBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 8,
      border: '1px solid #BFDBFE',
      background: '#EFF6FF', color: '#2563EB',
      fontSize: 12, fontWeight: 600, cursor: 'pointer',
      fontFamily: 'inherit',
    }}>
      <Send size={10} /> Remind
    </button>
  );
}

// FIX 1: EnterRatingsBtn now accepts ratingIsOpen.
// When the period is closed it renders a disabled "Period Closed" badge
// instead of a clickable button — preventing any navigation.
function EnterRatingsBtn({
  onClick,
  reenter,
  ratingIsOpen,
}: {
  onClick: () => void;
  reenter?: boolean;
  ratingIsOpen: boolean;
}) {
  if (!ratingIsOpen) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 14px', borderRadius: 8,
        background: '#F3F4F6', color: '#9CA3AF',
        fontSize: 12.5, fontWeight: 600,
        border: '1px solid #E5E7EB',
        cursor: 'not-allowed',
      }}>
        <Lock size={11} /> Period Closed
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 16px', borderRadius: 8, border: 'none',
        background: reenter ? '#6B7280' : '#2563EB',
        color: '#fff',
        fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {reenter ? 'Re-enter Ratings' : 'Enter Ratings'}
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
  const [msg,     setMsg]     = useState(
    `Hi ${name}, please complete your pending manual ratings for ${period} ${pmsYear} as soon as possible. The rating window is closing soon.`
  );
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      await fetch(`${API}/api/manual-rating-notifications/send-reminder`, {
        method:  'POST',
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 28, width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', fontFamily: 'inherit' }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: '#101828' }}>Send Reminder</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6B7280' }}>To: {name}</p>
        <div style={{ height: 1, background: '#E5E7EB', marginBottom: 16 }} />
        <textarea
          value={msg}
          onChange={e => setMsg(e.target.value)}
          rows={5}
          style={{
            width: '100%', padding: '10px 12px', boxSizing: 'border-box',
            border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13,
            color: '#374151', resize: 'vertical', outline: 'none',
            fontFamily: 'inherit', background: '#F9FAFB', lineHeight: 1.6,
          }}
        />
        {sent && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#16A34A' }}>
            ✓ Reminder sent successfully!
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', fontSize: 13, cursor: 'pointer', color: '#374151', fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending || sent}
            style={{
              padding: '7px 18px', borderRadius: 8, border: 'none',
              background: sent ? '#16A34A' : '#2563EB', color: '#fff',
              fontSize: 13, fontWeight: 600,
              cursor: (sending || sent) ? 'not-allowed' : 'pointer',
              opacity: sending ? 0.8 : 1,
            }}
          >
            {sending ? 'Sending…' : sent ? 'Sent!' : 'Send Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── MultiSelect ────────────────────────────────────────────────────
interface OrgItem { id: string; name: string; all_ids?: string[]; }

function MultiSelect({
  label, items, selected, onChange,
}: {
  label: string;
  items: OrgItem[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen]  = useState(false);
  const allSelected      = selected.includes('all');
  const displayLabel     = allSelected ? `All ${label}` : `${selected.length} selected`;

  const handleToggleAll = () => onChange(allSelected ? [] : ['all']);

  const handleToggleItem = (id: string) => {
    if (allSelected) {
      const next = items.map(i => i.id).filter(i => i !== id);
      onChange(next.length === 0 ? [] : next);
    } else if (selected.includes(id)) {
      const next = selected.filter(i => i !== id);
      onChange(next.length === 0 ? [] : next);
    } else {
      const next = [...selected, id];
      onChange(next.length === items.length ? ['all'] : next);
    }
  };

  const isChecked = (id: string) => allSelected || selected.includes(id);

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5565', display: 'block', marginBottom: 5 }}>
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 8,
          border: `1px solid ${open ? '#2563EB' : '#E5E7EB'}`,
          background: '#F9FAFB', fontSize: 13, color: '#374151',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', fontFamily: 'inherit', outline: 'none',
        }}
      >
        <span style={{ color: allSelected || selected.length > 0 ? '#374151' : '#9CA3AF' }}>
          {displayLabel}
        </span>
        <ChevronDown
          size={13}
          color="#6B7280"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}
        />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto',
          }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
              cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #E5E7EB',
              fontWeight: 600, color: '#2563EB',
              background: allSelected ? '#EFF6FF' : '#FFFFFF',
            }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleToggleAll}
                style={{ accentColor: '#2563EB', width: 14, height: 14 }}
              />
              Select All
            </label>
            {items.map(item => (
              <label key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
                cursor: 'pointer', fontSize: 13, color: '#374151',
                borderBottom: '1px solid #E5E7EB',
                background: isChecked(item.id) ? '#F0F9FF' : '#FFFFFF',
              }}>
                <input
                  type="checkbox"
                  checked={isChecked(item.id)}
                  onChange={() => handleToggleItem(item.id)}
                  style={{ accentColor: '#2563EB', width: 14, height: 14 }}
                />
                {item.name}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Edit Period Modal ──────────────────────────────────────────────
function EditPeriodModal({ period, pmsYear, currentStart, currentEnd, onClose, onSaved }: {
  period: string; pmsYear: number; currentStart: string; currentEnd: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();

  // FIX 3: hq_admin can also edit rating periods.
  // isHQ gives them the extra Countries multi-select in the "Apply To" section.
  const isHQ = user?.role === 'hq_admin';

  const [start,  setStart]  = useState(currentStart?.slice(0, 10) ?? '');
  const [end,    setEnd]    = useState(currentEnd?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const [countries,   setCountries]   = useState<OrgItem[]>([]);
  const [branches,    setBranches]    = useState<OrgItem[]>([]);
  const [departments, setDepartments] = useState<OrgItem[]>([]);
  const [subDepts,    setSubDepts]    = useState<OrgItem[]>([]);

  const [selCountries,   setSelCountries]   = useState<string[]>(['all']);
  const [selBranches,    setSelBranches]    = useState<string[]>(['all']);
  const [selDepartments, setSelDepartments] = useState<string[]>(['all']);
  const [selSubDepts,    setSelSubDepts]    = useState<string[]>(['all']);

  useEffect(() => {
    const uid = user?.id ?? '';

    if (isHQ) {
      fetch(`${API}/api/org/countries`)
        .then(r => r.json())
        .then((d: OrgItem[]) => setCountries(dedupe(d || [])))
        .catch(() => {});
    }

    fetch(`${API}/api/org/branches?evaluator_id=${uid}`)
      .then(r => r.json())
      .then((d: OrgItem[]) => setBranches(dedupe(d || [])))
      .catch(() => {});

    fetch(`${API}/api/org/departments?evaluator_id=${uid}`)
      .then(r => r.json())
      .then((d: OrgItem[]) => setDepartments(dedupe(d || [])))
      .catch(() => {});

    fetch(`${API}/api/org/sub-departments?evaluator_id=${uid}`)
      .then(r => r.json())
      .then((d: OrgItem[]) => setSubDepts(dedupe(d || [])))
      .catch(() => {});
  }, [user?.id, isHQ]);

  const resolve = (sel: string[], list: OrgItem[]) => {
    const chosen = sel.includes('all') ? list : list.filter(i => sel.includes(i.id));
    return chosen.flatMap(i => i.all_ids ?? [i.id]);
  };

  const handleSave = async () => {
    if (!start || !end)                   { setError('Both dates are required.'); return; }
    if (new Date(end) <= new Date(start)) { setError('End date must be after start date.'); return; }

    setSaving(true);
    setError('');

    try {
      const res = await fetch(`${API}/api/rating-periods/update`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          pms_year:             pmsYear,
          rating_start:         start,
          rating_end:           end,
          affected_countries:   isHQ ? resolve(selCountries, countries) : undefined,
          affected_branches:    resolve(selBranches, branches),
          affected_departments: resolve(selDepartments, departments),
          affected_sub_depts:   resolve(selSubDepts, subDepts),
        }),
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
    border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13,
    outline: 'none', fontFamily: 'inherit', color: '#374151', background: '#F9FAFB',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 12, padding: 28, width: '90%', maxWidth: 500,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)', fontFamily: 'inherit',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: '#101828' }}>Edit Rating Period</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6B7280' }}>{period} {pmsYear}</p>
        <div style={{ height: 1, background: '#E5E7EB', marginBottom: 18 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5565', display: 'block', marginBottom: 6 }}>
              Rating Start
            </label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5565', display: 'block', marginBottom: 6 }}>
              Rating End
            </label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #E5E7EB' }}>
            <Filter size={13} color="#2563EB" />
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#101828' }}>Apply To</span>
            <span style={{ fontSize: 11.5, color: '#6B7280' }}>— select which units are affected</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isHQ && countries.length > 0 && (
              <MultiSelect label="Countries"       items={countries}   selected={selCountries}   onChange={setSelCountries} />
            )}
            {branches.length > 0 && (
              <MultiSelect label="Branches"        items={branches}    selected={selBranches}    onChange={setSelBranches} />
            )}
            {departments.length > 0 && (
              <MultiSelect label="Departments"     items={departments} selected={selDepartments} onChange={setSelDepartments} />
            )}
            {subDepts.length > 0 && (
              <MultiSelect label="Sub-Departments" items={subDepts}    selected={selSubDepts}    onChange={setSelSubDepts} />
            )}
          </div>
        </div>

        {error && <p style={{ color: '#DC2626', fontSize: 12, margin: '12px 0 0' }}>{error}</p>}
        {saved && <p style={{ color: '#16A34A', fontSize: 12, margin: '12px 0 0' }}>Period updated successfully!</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', fontSize: 13, cursor: 'pointer', color: '#374151', fontWeight: 600 }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || saved}
            style={{
              padding: '7px 18px', borderRadius: 8, border: 'none',
              background: saved ? '#16A34A' : '#2563EB', color: '#fff',
              fontSize: 13, fontWeight: 600,
              cursor: (saving || saved) ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.8 : 1,
            }}
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function RatingSettings() {
  const { user } = useAuth();
  const router   = useRouter();

  const roleSlug = user?.role?.replace(/_/g, '-') ?? 'branch-admin';

  // FIX 3: hq_admin was missing — now both hq_admin and country_admin can edit
  const canEditPeriod = (
    user?.role === 'country_admin' ||
    user?.role === 'hq_admin'
  );

  const evaluatorId = user?.id ?? '';

  const [periodData,     setPeriodData]     = useState<RatingPeriodState | null>(null);
  const [activePeriod,   setActivePeriod]   = useState<RatingPeriod | null>(null);
  const [overview,       setOverview]       = useState<OverviewMember[]>([]);
  const [team,           setTeam]           = useState<TeamMember[]>([]);
  const [ratingStatus,   setRatingStatus]   = useState<ManualRatingStatus>({});
  const [statusLoading,  setStatusLoading]  = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [reminderTarget, setReminderTarget] = useState<OverviewMember | TeamMember | null>(null);
  const [editPeriodOpen, setEditPeriodOpen] = useState(false);

  const pmsYear        = activePeriod?.pms_year ?? new Date().getFullYear();
  const selectedPeriod = activePeriod?.period   ?? 'H1';
  const ratingIsOpen   = periodData?.rating_open ?? false;

  const fetchRatingStatuses = useCallback(async (
    teamMembers: TeamMember[],
    year:        number,
    period:      string,
  ) => {
    if (!teamMembers.length || !year || !period) return;
    setStatusLoading(true);
    try {
      const userIds = teamMembers.map(m => m.id).join(',');
      const res     = await fetch(
        `${API}/api/rating-status/batch?user_ids=${userIds}&year=${year}&period=${period}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ManualRatingStatus = await res.json();
      setRatingStatus(data);
    } catch (e) {
      console.error('[RatingSettings] batch status fetch failed:', e);
      const fallback: ManualRatingStatus = {};
      teamMembers.forEach(m => { fallback[m.id] = { submitted: false, pending: 0, total: 0 }; });
      setRatingStatus(fallback);
    }
    setStatusLoading(false);
  }, []);

  const fetchAll = useCallback(async () => {
    if (!evaluatorId) return;
    setLoading(true);
    setRatingStatus({});

    try {
      const [periodRes, overviewRes, teamRes] = await Promise.all([
        fetch(`${API}/api/rating-periods/current`),
        fetch(`${API}/api/rating-settings/overview/${evaluatorId}`),
        fetch(`${API}/api/evaluator/${evaluatorId}/team`),
      ]);

      const periodJson   = periodRes.ok   ? await periodRes.json()   : null;
      const overviewJson = overviewRes.ok ? await overviewRes.json() : [];
      const teamJson     = teamRes.ok     ? await teamRes.json()     : [];

      const periods: RatingPeriod[] = periodJson?.periods ?? [];
      const best: RatingPeriod | null =
        periods.find(p => p.is_active && p.period === periodJson?.active_period)
        ?? getClosestPeriod(periods)
        ?? null;

      setPeriodData(periodJson);
      setActivePeriod(best);
      setOverview(Array.isArray(overviewJson) ? overviewJson : []);

      const resolvedTeam: TeamMember[] = Array.isArray(teamJson) ? teamJson : [];
      setTeam(resolvedTeam);

      if (resolvedTeam.length > 0 && best) {
        fetchRatingStatuses(resolvedTeam, best.pms_year, best.period);
      }
    } catch (e) {
      console.error('[RatingSettings] fetchAll failed:', e);
    }

    setLoading(false);
  }, [evaluatorId, fetchRatingStatuses]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return (
    <div style={{ padding: '40px 24px', fontFamily: 'Inter, sans-serif', color: '#6B7280', fontSize: 14 }}>
      Loading…
    </div>
  );

  return (
    <main style={{
      minHeight: '100vh', background: '#F9FAFB',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      padding: '32px',
    }}>

      {reminderTarget && (
        <ReminderModal
          member={reminderTarget} period={selectedPeriod} pmsYear={pmsYear}
          senderId={evaluatorId}
          onClose={() => setReminderTarget(null)}
          onSent={fetchAll}
        />
      )}

      {editPeriodOpen && activePeriod && (
        <EditPeriodModal
          period={selectedPeriod} pmsYear={activePeriod.pms_year}
          currentStart={activePeriod.rating_start} currentEnd={activePeriod.rating_end}
          onClose={() => setEditPeriodOpen(false)}
          onSaved={fetchAll}
        />
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: '#6B7280', marginBottom: 16 }}>
          <Link href="/dashboard" style={{ color: '#6B7280', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ color: '#101828' }}>Rating Settings</span>
        </div>

        {/* Page header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: '#101828', margin: '0 0 6px' }}>Rating Settings</h1>
            <p style={{ fontSize: 15, color: '#4A5565', margin: 0 }}>Manage manual ratings and monitor team progress</p>
          </div>
          {activePeriod && (
            <div style={{
              alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8,
              background: '#F3F4F6', color: '#4A5565', border: '1px solid #E5E7EB',
              fontSize: 13, fontWeight: 600,
            }}>
              <Calendar size={13} color="#6B7280" />
              {activePeriod.period} {activePeriod.pms_year}
            </div>
          )}
        </div>

        {/* ── Rating Period Banner ──────────────────────────────── */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6,
          padding: '18px 24px', marginBottom: 64, borderLeft: '28px solid #2563EB',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#101828' }}>
                  Rating Period — {selectedPeriod} {activePeriod?.pms_year ?? new Date().getFullYear()}
                </h3>
                <span style={{
                  padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: ratingIsOpen ? '#DCFCE7' : '#FEF9C3',
                  color:      ratingIsOpen ? '#166534' : '#854D0E',
                  border:     `1px solid ${ratingIsOpen ? '#BBF7D0' : '#FDE047'}`,
                }}>
                  {ratingIsOpen ? '● Open' : '● Closed'}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280' }}>
                {activePeriod
                  ? `${formatDate(activePeriod.rating_start)} → ${formatDate(activePeriod.rating_end)}`
                  : (periodData?.reason ?? 'No period configured.')}
              </p>
            </div>

            {/* FIX 3: hq_admin now sees the Edit Period button too */}
            {canEditPeriod && activePeriod && (
              <button
                onClick={() => setEditPeriodOpen(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 10,
                  border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <Settings size={13} /> Edit Period
              </button>
            )}
          </div>
        </div>

        {/* ══ TEAM MEMBERS — MANUAL RATING REQUIRED ════════════ */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6,
          overflow: 'hidden', marginBottom: 64,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <SectionHeader
            title="Team Members Requiring Manual Ratings"
            subtitle={`Enter manual ratings for each team member · ${selectedPeriod} ${pmsYear}`}
          />

          {/* FIX 1 & 2: show a closed banner when the period is not open */}
          {!ratingIsOpen && (
            <div style={{
              margin: '20px 24px',
              background: '#FEF9C3', border: '1px solid #FDE047',
              borderRadius: 8, padding: '12px 16px',
              fontSize: 13, color: '#854D0E',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Lock size={14} />
              The rating window is currently closed. Ratings cannot be entered or modified.
              {canEditPeriod && (
                <button
                  onClick={() => setEditPeriodOpen(true)}
                  style={{
                    marginLeft: 8, padding: '3px 10px', borderRadius: 6,
                    border: '1px solid #FDE047', background: 'transparent',
                    color: '#854D0E', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Open Period →
                </button>
              )}
            </div>
          )}

          {team.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              No team members found.
            </div>
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
                    <TH>Team Member</TH>
                    <TH center>Rating Status</TH>
                    <TH center>Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member, idx) => {
                    const status = ratingStatus[member.id];
                    const isLast = idx === team.length - 1;

                    const renderStatus = () => {
                      // FIX 2: hide Pending/Submitted pills when period is closed
                      if (!ratingIsOpen) {
                        return <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>;
                      }
                      if (statusLoading && !status) {
                        return <span style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</span>;
                      }
                      if (!status) {
                        return <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>;
                      }
                      if (status.total === 0) {
                        return <span style={{ fontSize: 12, color: '#9CA3AF' }}>No manual KPIs</span>;
                      }
                      return (
                        <StatusPill
                          complete={status.submitted}
                          label={status.submitted ? 'Submitted' : 'Pending'}
                        />
                      );
                    };

                    return (
                      <tr
                        key={member.id}
                        style={{
                          borderBottom: isLast ? 'none' : '1px solid #E5E7EB',
                          background: '#FFFFFF',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                      >
                        <td style={{ padding: '6px 20px 6px 28px' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#101828' }}>
                            {member.full_name}
                          </div>
                        </td>
                        <td style={{ padding: '6px 20px', textAlign: 'center' }}>
                          {renderStatus()}
                        </td>
                        <td style={{ padding: '6px 20px', textAlign: 'center' }}>
                          {/* FIX 1: ratingIsOpen controls whether button is clickable */}
                          <EnterRatingsBtn
                            ratingIsOpen={ratingIsOpen}
                            reenter={status?.submitted === true}
                            onClick={() => router.push(
                              `/${roleSlug}/manual-rating?userId=${member.id}&year=${pmsYear}&period=${selectedPeriod}`
                            )}
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

        {/* ══ RATING OVERVIEW ══════════════════════════════════ */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6,
          overflow: 'hidden', marginBottom: 64,
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <SectionHeader
            title="Manual Rating Completion Overview"
            subtitle="Track completion progress of manual rating submissions across your team"
          />

          {overview.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              No team members found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <TH>Team Member</TH>
                    <TH center width="170px">Members To Rate</TH>
                    <TH width="170px">Completion</TH>
                    <TH center width="170px">Status</TH>
                    <TH center width="170px">Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {overview.map((member, idx) => (
                    <tr
                      key={member.id}
                      style={{
                        borderBottom: idx === overview.length - 1 ? 'none' : '1px solid #E5E7EB',
                        background: '#FFFFFF',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                    >
                      <td style={{ padding: '6px 20px' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#101828' }}>
                          {member.name}
                        </div>
                      </td>
                      <td style={{ padding: '6px 16px', textAlign: 'center', fontSize: 13.5, fontWeight: 700, color: '#2563EB' }}>
                        {member.total}
                      </td>
                      <td style={{ padding: '6px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                              width: `${member.pct}%`, height: '100%', borderRadius: 99,
                              background: member.pct === 100 ? '#16A34A' : '#2563EB',
                              transition: 'width 0.4s',
                            }} />
                          </div>
                          <span style={{ fontSize: 11.5, color: '#6B7280', minWidth: 36, fontWeight: 600 }}>
                            {member.pct}%
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '6px 16px', textAlign: 'center' }}>
                        {/* FIX 2: hide status pill in overview when period is closed */}
                        {ratingIsOpen
                          ? <StatusPill complete={member.status === 'complete'} />
                          : <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                        }
                      </td>
                      <td style={{ padding: '6px 16px', textAlign: 'center' }}>
                        {/* Only show Remind button when period is open and ratings are pending */}
                        {ratingIsOpen && member.pending > 0
                          ? <RemindBtn onClick={() => setReminderTarget(member)} />
                          : <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}