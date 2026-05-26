'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Clock, CheckCircle, Send, Calendar, Settings, Lock } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════
// One row from the rating_periods table
interface RatingPeriod {
  id: number; pms_year: number; period: string;
  rating_start: string; rating_end: string; is_active: boolean;
}
// Full response from GET /api/rating-periods/current
interface RatingPeriodState {
  rating_open: boolean; active_period: string | null;
  pms_year: number; rating_start: string; rating_end: string;
  reason: string | null; periods: RatingPeriod[];
}
// One row in the rating overview table (direct report of the evaluator)
interface OverviewMember {
  id: string; name: string; role: string; designation: string;
  total: number; submitted: number; pending: number;
  pct: number; status: 'complete' | 'pending' | 'n/a';
}
// Team member shown in the "My Team" manual ratings table
interface TeamMember {
  id: string; full_name: string; designation: string; template_name: string | null;
}
// Per-user manual rating submission status (submitted/pending/total objective counts)
interface MemberRatingStatus { submitted: boolean; pending: number; total: number; }
interface ManualRatingStatus { [userId: string]: MemberRatingStatus; }

// Org hierarchy types — used to populate the scope picker in the Edit Period drawer
interface OrgItem     { id: string; name: string; }
interface BranchItem  { id: string; name: string; country_id: string; }
interface DeptItem    { id: string; name: string; branch_id: string; }
interface SubDeptItem { id: string; name: string; department_id: string; }
interface OrgHierarchy {
  countries:       OrgItem[];
  branches:        BranchItem[];
  departments:     DeptItem[];
  sub_departments: SubDeptItem[];
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════
// Formats an ISO date string to "DD Mon YYYY" (e.g. "01 Jan 2025")
function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Returns the most recent completed period, or the nearest upcoming one as a fallback
function getMostRecentPastPeriod(periods: RatingPeriod[]): RatingPeriod | null {
  if (!periods?.length) return null;
  const now  = new Date();
  const past = periods.filter(p => new Date(p.rating_end) < now);
  if (past.length > 0)
    return past.reduce((a, b) => new Date(b.rating_end) > new Date(a.rating_end) ? b : a);
  const upcoming = periods.filter(p => new Date(p.rating_start) > now);
  if (upcoming.length > 0)
    return upcoming.reduce((a, b) => new Date(b.rating_start) < new Date(a.rating_start) ? b : a);
  return periods[0];
}

// ══════════════════════════════════════════════════════════════════
// SMALL UI COMPONENTS
// ══════════════════════════════════════════════════════════════════
// Reusable table header cell with consistent typography
function TH({ children, center, width }: { children: React.ReactNode; center?: boolean; width?: string }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: center ? 'center' : 'left',
      fontSize: 11, fontWeight: 700, color: '#475569',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      background: '#F9FAFB', borderBottom: '2px solid #E5E7EB',
      width: width ?? 'auto',
    }}>
      {children}
    </th>
  );
}

// Section heading used at the top of each card panel
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ padding: '18px 24px', borderBottom: '1px solid #E5E7EB', borderLeft: '28px solid #2563EB', background: '#FFFFFF' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#101828', lineHeight: 1.3 }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280' }}>{subtitle}</p>
    </div>
  );
}

// Green "Submitted" / yellow "Pending" pill badge shown per team member row
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

// Button that sends a manual reminder notification to a team member
function RemindBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 8, border: '1px solid #BFDBFE',
      background: '#EFF6FF', color: '#2563EB',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    }}>
      <Send size={10} /> Remind
    </button>
  );
}

function EnterRatingsBtn({ onClick, reenter, ratingIsOpen }: {
  onClick: () => void; reenter?: boolean; ratingIsOpen: boolean;
}) {
  if (!ratingIsOpen) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '6px 14px', borderRadius: 8,
        background: '#F3F4F6', color: '#9CA3AF',
        fontSize: 12.5, fontWeight: 600, border: '1px solid #E5E7EB', cursor: 'not-allowed',
      }}>
        <Lock size={11} /> Period Closed
      </span>
    );
  }
  return (
    <button onClick={onClick} style={{
      padding: '6px 16px', borderRadius: 8, border: 'none',
      background: reenter ? '#6B7280' : '#2563EB', color: '#fff',
      fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    }}>
      {reenter ? 'Re-enter Ratings' : 'Enter Ratings'}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════
// REMINDER MODAL
// ══════════════════════════════════════════════════════════════════
// Modal that lets an evaluator send a manual reminder notification to one team member.
// The message is pre-filled but editable before sending.
function ReminderModal({ member, period, pmsYear, senderId, onClose, onSent }: {
  member: OverviewMember | TeamMember; period: string; pmsYear: number; senderId: string;
  onClose: () => void; onSent: () => void;
}) {
  // OverviewMember uses "name"; TeamMember uses "full_name"
  const name = 'full_name' in member ? member.full_name : member.name;
  const [msg,     setMsg]     = useState(`Hi ${name}, please complete your pending manual ratings for ${period} ${pmsYear} as soon as possible. The rating window is closing soon.`);
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
      // Brief success state before closing so the user sees the confirmation
      setTimeout(() => { onSent(); onClose(); }, 1200);
    } catch { setSending(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{ background: '#FFFFFF', borderRadius: 12, padding: 28, width: '90%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', fontFamily: 'inherit' }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: '#101828' }}>Send Reminder</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6B7280' }}>To: {name}</p>
        <div style={{ height: 1, background: '#E5E7EB', marginBottom: 16 }} />
        <textarea value={msg} onChange={e => setMsg(e.target.value)} rows={5} style={{
          width: '100%', padding: '10px 12px', boxSizing: 'border-box',
          border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13,
          color: '#374151', resize: 'vertical', outline: 'none',
          fontFamily: 'inherit', background: '#F9FAFB', lineHeight: 1.6,
        }} />
        {sent && <p style={{ margin: '10px 0 0', fontSize: 13, color: '#16A34A' }}>✓ Reminder sent successfully!</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', fontSize: 13, cursor: 'pointer', color: '#374151', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSend} disabled={sending || sent} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none',
            background: sent ? '#16A34A' : '#2563EB', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: (sending || sent) ? 'not-allowed' : 'pointer', opacity: sending ? 0.8 : 1,
          }}>
            {sending ? 'Sending…' : sent ? 'Sent!' : 'Send Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CASCADE SCOPE PICKER
// ══════════════════════════════════════════════════════════════════
// Multi-level checkbox picker for selecting which org units the rating
// period update should apply to. Selecting a parent auto-filters children;
// deselecting a parent prunes any now-invalid child selections.
function CascadeScopePicker({
  hierarchy, isHQ,
  selCountries, setSelCountries,
  selBranches,  setSelBranches,
  selDepts,     setSelDepts,
  selSubDepts,  setSelSubDepts,
  includeSelf,  setIncludeSelf,
}: {
  hierarchy: OrgHierarchy; isHQ: boolean;
  selCountries: string[]; setSelCountries: (v: string[]) => void;
  selBranches:  string[]; setSelBranches:  (v: string[]) => void;
  selDepts:     string[]; setSelDepts:     (v: string[]) => void;
  selSubDepts:  string[]; setSelSubDepts:  (v: string[]) => void;
  includeSelf: boolean; setIncludeSelf: (v: boolean) => void;
}) {
  // Lookup maps used to resolve parent names in child-level labels
  const countryById = Object.fromEntries(hierarchy.countries.map(c => [c.id, c.name]));
  const branchById  = Object.fromEntries(hierarchy.branches.map(b => [b.id, b.name]));
  const deptById    = Object.fromEntries(hierarchy.departments.map(d => [d.id, d.name]));

  // Each level only shows items that belong to a selected parent (empty = show all)
  const filteredBranches = hierarchy.branches.filter(b =>
    selCountries.length === 0 || selCountries.includes(b.country_id));
  const filteredDepts = hierarchy.departments.filter(d =>
    selBranches.length === 0 || selBranches.includes(d.branch_id));
  const filteredSubDepts = hierarchy.sub_departments.filter(s =>
    selDepts.length === 0 || selDepts.includes(s.department_id));

  // When a country is deselected, remove any branches/depts/sub-depts that no longer belong
  const handleCountryChange = (ids: string[]) => {
    setSelCountries(ids);
    const validBranches  = hierarchy.branches.filter(b => ids.length === 0 || ids.includes(b.country_id)).map(b => b.id);
    const prunedBranches = selBranches.filter(id => validBranches.includes(id));
    setSelBranches(prunedBranches);
    const validDepts  = hierarchy.departments.filter(d => prunedBranches.length === 0 || prunedBranches.includes(d.branch_id)).map(d => d.id);
    const prunedDepts = selDepts.filter(id => validDepts.includes(id));
    setSelDepts(prunedDepts);
    const validSubs = hierarchy.sub_departments.filter(s => prunedDepts.length === 0 || prunedDepts.includes(s.department_id)).map(s => s.id);
    setSelSubDepts(selSubDepts.filter(id => validSubs.includes(id)));
  };

  // When a branch is deselected, prune orphaned depts and sub-depts
  const handleBranchChange = (ids: string[]) => {
    setSelBranches(ids);
    const validDepts  = hierarchy.departments.filter(d => ids.length === 0 || ids.includes(d.branch_id)).map(d => d.id);
    const prunedDepts = selDepts.filter(id => validDepts.includes(id));
    setSelDepts(prunedDepts);
    const validSubs = hierarchy.sub_departments.filter(s => prunedDepts.length === 0 || prunedDepts.includes(s.department_id)).map(s => s.id);
    setSelSubDepts(selSubDepts.filter(id => validSubs.includes(id)));
  };

  // When a dept is deselected, prune orphaned sub-depts
  const handleDeptChange = (ids: string[]) => {
    setSelDepts(ids);
    const validSubs = hierarchy.sub_departments.filter(s => ids.length === 0 || ids.includes(s.department_id)).map(s => s.id);
    setSelSubDepts(selSubDepts.filter(id => validSubs.includes(id)));
  };

  // Toggle a single item in a selection list
  const toggleOne = (id: string, list: string[], setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  // Select-all / deselect-all for a given level
  const toggleAll = (items: { id: string }[], list: string[], setter: (v: string[]) => void) =>
    setter(list.length === items.length ? [] : items.map(i => i.id));

  // ── Shared styles ──────────────────────────────────────────────
  const sectionBox: React.CSSProperties = {
    border: '1px solid #E5E7EB', borderRadius: 10,
    overflow: 'hidden', marginBottom: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    contain: 'paint',
  };
  const sectionHead: React.CSSProperties = {
    padding: '9px 14px', background: '#F8FAFC',
    borderBottom: '1px solid #E5E7EB',
    fontSize: 11, fontWeight: 700, color: '#64748B',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  const scrollList: React.CSSProperties = {
    maxHeight: 180, overflowY: 'auto',
    background: '#FFFFFF',
    borderBottomLeftRadius: 9, borderBottomRightRadius: 9,
    overflowX: 'hidden',
  };
  const chk: React.CSSProperties = { accentColor: '#2563EB', width: 14, height: 14, flexShrink: 0, marginTop: 1 };

  // ── Sub-components ─────────────────────────────────────────────
  const CountBadge = ({ count, total }: { count: number; total: number }) =>
    count === 0 ? null : (
      <span style={{
        background: '#2563EB', color: '#fff',
        borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700,
      }}>
        {count === total ? 'All' : `${count} selected`}
      </span>
    );

  const ClearBtn = ({ onClear }: { onClear: () => void }) => (
    <button onClick={e => { e.preventDefault(); onClear(); }}
      style={{ fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}>
      Clear
    </button>
  );

  // Select-all row
  const SelectAllRow = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 14px', cursor: 'pointer',
      borderBottom: '1px solid #F1F5F9',
      background: checked ? '#EFF6FF' : '#FAFAFA',
      fontSize: 12.5, fontWeight: 700, color: '#2563EB',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={chk} />
      {label}
    </label>
  );

  // Regular item row — shows name + optional parent subtitle
  const ItemRow = ({ id, name, subtitle, checked, onChange }: {
    id: string; name: string; subtitle?: string; checked: boolean; onChange: () => void;
  }) => (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 14px', cursor: 'pointer',
      borderBottom: '1px solid #F8FAFC',
      background: checked ? '#EFF6FF' : '#FFFFFF',
      transition: 'background 0.1s',
    }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={chk} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 13, fontWeight: checked ? 600 : 400, color: checked ? '#1D4ED8' : '#374151', lineHeight: 1.3 }}>
          {name}
        </span>
        {subtitle && (
          <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 1, lineHeight: 1.2 }}>
            {subtitle}
          </span>
        )}
      </span>
      {checked && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
      )}
    </label>
  );

  return (
    <div>
      {/* Include myself — HQ only */}
      {isHQ && (
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '11px 14px', borderRadius: 10, marginBottom: 12,
          background: includeSelf ? '#EFF6FF' : '#F8FAFC',
          border: `1.5px solid ${includeSelf ? '#93C5FD' : '#E2E8F0'}`,
          cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <input type="checkbox" checked={includeSelf} onChange={e => setIncludeSelf(e.target.checked)}
            style={{ ...chk, width: 15, height: 15 }} />
          <span style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: includeSelf ? '#1D4ED8' : '#374151', display: 'block' }}>
              Include myself
            </span>
            <span style={{ fontSize: 11.5, color: '#94A3B8', display: 'block', marginTop: 2 }}>
              Only updates the rating window for the HQ Admin account — does not affect any other users
            </span>
          </span>
        </label>
      )}

      {/* Countries — HQ only */}
      {isHQ && hierarchy.countries.length > 0 && (
        <div style={sectionBox}>
          <div style={sectionHead}>
            <span>Countries</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CountBadge count={selCountries.length} total={hierarchy.countries.length} />
              <ClearBtn onClear={() => handleCountryChange([])} />
            </div>
          </div>
          <div style={scrollList}>
            <SelectAllRow
              checked={selCountries.length === hierarchy.countries.length && hierarchy.countries.length > 0}
              onChange={() => toggleAll(hierarchy.countries, selCountries, handleCountryChange)}
              label="Select all countries"
            />
            {hierarchy.countries.map(c => (
              <ItemRow key={c.id} id={c.id} name={c.name}
                checked={selCountries.includes(c.id)}
                onChange={() => handleCountryChange(
                  selCountries.includes(c.id) ? selCountries.filter(x => x !== c.id) : [...selCountries, c.id]
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Branches */}
      {filteredBranches.length > 0 && (
        <div style={sectionBox}>
          <div style={sectionHead}>
            <span>Branches{selCountries.length > 0 ? ` — ${filteredBranches.length} shown` : ''}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CountBadge count={selBranches.length} total={filteredBranches.length} />
              <ClearBtn onClear={() => handleBranchChange([])} />
            </div>
          </div>
          <div style={scrollList}>
            <SelectAllRow
              checked={selBranches.length === filteredBranches.length && filteredBranches.length > 0}
              onChange={() => toggleAll(filteredBranches, selBranches, handleBranchChange)}
              label="Select all branches"
            />
            {filteredBranches.map(b => (
              <ItemRow key={b.id} id={b.id} name={b.name}
                subtitle={isHQ && b.country_id ? countryById[b.country_id] : undefined}
                checked={selBranches.includes(b.id)}
                onChange={() => handleBranchChange(
                  selBranches.includes(b.id) ? selBranches.filter(x => x !== b.id) : [...selBranches, b.id]
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Departments — shows branch name as subtitle to resolve duplicates */}
      {filteredDepts.length > 0 && (
        <div style={sectionBox}>
          <div style={sectionHead}>
            <span>Departments{selBranches.length > 0 ? ` — ${filteredDepts.length} shown` : ` — all ${filteredDepts.length}`}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CountBadge count={selDepts.length} total={filteredDepts.length} />
              <ClearBtn onClear={() => handleDeptChange([])} />
            </div>
          </div>
          <div style={scrollList}>
            <SelectAllRow
              checked={selDepts.length === filteredDepts.length && filteredDepts.length > 0}
              onChange={() => toggleAll(filteredDepts, selDepts, handleDeptChange)}
              label="Select all departments"
            />
            {filteredDepts.map(d => (
              <ItemRow key={d.id} id={d.id} name={d.name}
                subtitle={(() => {
                  const branch = hierarchy.branches.find(b => b.id === d.branch_id);
                  const branchName = branchById[d.branch_id];
                  const countryName = isHQ && branch ? countryById[branch.country_id] : undefined;
                  if (countryName && branchName) return `${countryName} · ${branchName}`;
                  if (branchName) return branchName;
                  return undefined;
                })()}
                checked={selDepts.includes(d.id)}
                onChange={() => handleDeptChange(
                  selDepts.includes(d.id) ? selDepts.filter(x => x !== d.id) : [...selDepts, d.id]
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sub-Departments — shows department name as subtitle to resolve duplicates */}
      {filteredSubDepts.length > 0 && (
        <div style={sectionBox}>
          <div style={sectionHead}>
            <span>Sub-Departments{selDepts.length > 0 ? ` — ${filteredSubDepts.length} shown` : ` — all ${filteredSubDepts.length}`}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CountBadge count={selSubDepts.length} total={filteredSubDepts.length} />
              <ClearBtn onClear={() => setSelSubDepts([])} />
            </div>
          </div>
          <div style={scrollList}>
            <SelectAllRow
              checked={selSubDepts.length === filteredSubDepts.length && filteredSubDepts.length > 0}
              onChange={() => toggleAll(filteredSubDepts, selSubDepts, setSelSubDepts)}
              label="Select all sub-departments"
            />
            {filteredSubDepts.map(s => (
              <ItemRow key={s.id} id={s.id} name={s.name}
                subtitle={(() => {
                  const deptName   = deptById[s.department_id];
                  const dept       = hierarchy.departments.find(d => d.id === s.department_id);
                  const branchName = dept ? branchById[dept.branch_id] : undefined;
                  const branch     = dept ? hierarchy.branches.find(b => b.id === dept.branch_id) : undefined;
                  const countryName = isHQ && branch ? countryById[branch.country_id] : undefined;
                  const parts = [countryName, branchName, deptName].filter(Boolean);
                  return parts.length > 0 ? parts.join(' · ') : undefined;
                })()}
                checked={selSubDepts.includes(s.id)}
                onChange={() => toggleOne(s.id, selSubDepts, setSelSubDepts)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// EDIT PERIOD MODAL
// ══════════════════════════════════════════════════════════════════
// Modal that lets HQ/Country admins adjust the rating window dates and scope
function EditPeriodModal({ period, pmsYear, currentStart, currentEnd, evaluatorId, onClose, onSaved }: {
  period: string; pmsYear: number; currentStart: string; currentEnd: string;
  evaluatorId: string; onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  // HQ admins can set a self-scope and pick countries; Country admins cannot
  const isHQ           = user?.role === 'hq_admin';
  const isCountryAdmin = user?.role === 'country_admin';

  // Initialise date inputs from the existing period dates (trim to YYYY-MM-DD)
  const [start,  setStart]  = useState(currentStart?.slice(0, 10) ?? '');
  const [end,    setEnd]    = useState(currentEnd?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  // When true (HQ only), the update also applies to the HQ Admin's own rating period
  const [includeSelf,  setIncludeSelf]  = useState(false);
  // Full org hierarchy used to populate the scope checkboxes
  const [hierarchy,    setHierarchy]    = useState<OrgHierarchy>({ countries: [], branches: [], departments: [], sub_departments: [] });
  const [loadingHier,  setLoadingHier]  = useState(true);

  // Scope selections — only the levels visible to this admin role are shown
  const [selCountries, setSelCountries] = useState<string[]>([]);
  const [selBranches,  setSelBranches]  = useState<string[]>([]);
  const [selDepts,     setSelDepts]     = useState<string[]>([]);
  const [selSubDepts,  setSelSubDepts]  = useState<string[]>([]);

  useEffect(() => {
    if (!evaluatorId || !user?.role) return;
    setLoadingHier(true);
    // Fetch org units scoped to this evaluator's visible hierarchy
    fetch(`${API}/api/rating-periods/org-hierarchy?evaluator_id=${evaluatorId}&role=${user.role}`)
      .then(r => r.json())
      .then((d: OrgHierarchy) => setHierarchy(d))
      .catch(() => {})
      .finally(() => setLoadingHier(false));
  }, [evaluatorId, user?.role]);

  // Count of all selected scope items — used to gate the Save button
  const totalSelected =
    (includeSelf ? 1 : 0) +
    selCountries.length + selBranches.length + selDepts.length + selSubDepts.length;

  // Human-readable summary shown below the scope pickers
  const summaryParts: string[] = [];
  if (includeSelf)         summaryParts.push('My rating period (HQ Admin)');
  if (selCountries.length) summaryParts.push(`${selCountries.length} ${selCountries.length === 1 ? 'country' : 'countries'}`);
  if (selBranches.length)  summaryParts.push(`${selBranches.length} ${selBranches.length === 1 ? 'branch' : 'branches'}`);
  if (selDepts.length)     summaryParts.push(`${selDepts.length} ${selDepts.length === 1 ? 'department' : 'departments'}`);
  if (selSubDepts.length)  summaryParts.push(`${selSubDepts.length} sub-${selSubDepts.length === 1 ? 'department' : 'departments'}`);

  const handleSave = async () => {
    if (!start || !end)                   { setError('Both dates are required.'); return; }
    if (new Date(end) <= new Date(start)) { setError('End date must be after start date.'); return; }
    if (totalSelected === 0)              { setError('Please select at least one scope.'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/rating-periods/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period, pms_year: pmsYear,
          rating_start: start, rating_end: end,
          evaluator_id: evaluatorId,
          // Country-level admins cannot set a self-scope or pick countries
          include_self:         isHQ ? includeSelf : false,
          selected_countries:   isHQ ? selCountries : [],
          selected_branches:    selBranches,
          selected_departments: selDepts,
          selected_sub_depts:   selSubDepts,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Save failed');
      }
      setSaved(true);
      // Brief success state before closing so the user sees the confirmation
      setTimeout(() => { onSaved(); onClose(); }, 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    }
    setSaving(false);
  };

  // Reusable input style for the date pickers
  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13,
    outline: 'none', fontFamily: 'inherit', color: '#374151', background: '#F9FAFB',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 12, padding: 32, width: '94%', maxWidth: 640,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)', fontFamily: 'inherit',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: '#101828' }}>Edit Rating Period</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6B7280' }}>{period} {pmsYear}</p>
        <div style={{ height: 1, background: '#E5E7EB', marginBottom: 18 }} />

        {/* Dates side by side */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5565', display: 'block', marginBottom: 6 }}>Rating Start</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5565', display: 'block', marginBottom: 6 }}>Rating End</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inp} />
          </div>
        </div>

        {/* Scope header */}
        <div style={{ fontSize: 12, fontWeight: 700, color: '#101828', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Settings size={13} color="#2563EB" />
          Scope — choose who this update applies to
        </div>

        {loadingHier ? (
          <div style={{ fontSize: 13, color: '#9CA3AF', padding: '12px 0' }}>Loading org structure…</div>
        ) : (
          <CascadeScopePicker
            hierarchy={hierarchy} isHQ={isHQ}
            selCountries={selCountries} setSelCountries={setSelCountries}
            selBranches={selBranches}   setSelBranches={setSelBranches}
            selDepts={selDepts}         setSelDepts={setSelDepts}
            selSubDepts={selSubDepts}   setSelSubDepts={setSelSubDepts}
            includeSelf={includeSelf}   setIncludeSelf={setIncludeSelf}
          />
        )}

        {/* Live summary */}
        {totalSelected > 0 && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, margin: '12px 0',
            background: '#DCFCE7', border: '1px solid #BBF7D0',
            fontSize: 12, color: '#166534', fontWeight: 600,
          }}>
            Rating window will be updated for: {summaryParts.join(', ')}
          </div>
        )}

        {error && <p style={{ color: '#DC2626', fontSize: 12, margin: '8px 0' }}>{error}</p>}
        {saved  && <p style={{ color: '#16A34A', fontSize: 12, margin: '8px 0' }}>Period updated successfully!</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#FFFFFF', fontSize: 13, cursor: 'pointer', color: '#374151', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving || saved} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none',
            background: saved ? '#16A34A' : '#2563EB', color: '#fff',
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

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function RatingSettings() {
  const { user } = useAuth();
  const router   = useRouter();

  // Convert role string for URL paths (e.g. "hq_admin" → "hq-admin")
  const roleSlug      = user?.role?.replace(/_/g, '-') ?? 'branch-admin';
  // Only HQ and Country admins can open the Edit Period drawer
  const canEditPeriod = user?.role === 'country_admin' || user?.role === 'hq_admin';
  const evaluatorId   = user?.id ?? '';

  // Full response from the rating-periods endpoint
  const [periodData,    setPeriodData]    = useState<RatingPeriodState | null>(null);
  // The period currently being viewed (open window, or most recent if none open)
  const [activePeriod,  setActivePeriod]  = useState<RatingPeriod | null>(null);
  // Overview table rows — one per direct report of the evaluator
  const [overview,      setOverview]      = useState<OverviewMember[]>([]);
  // Team table rows — the evaluator's own direct reports for manual rating entry
  const [team,          setTeam]          = useState<TeamMember[]>([]);
  // Batch submission status keyed by user UUID
  const [ratingStatus,  setRatingStatus]  = useState<ManualRatingStatus>({});
  const [statusLoading, setStatusLoading] = useState(false);
  const [loading,       setLoading]       = useState(true);
  // The team member whose Remind button was clicked (opens the reminder modal)
  const [reminderTarget, setReminderTarget] = useState<OverviewMember | TeamMember | null>(null);
  // Controls visibility of the Edit Rating Period side-drawer
  const [editPeriodOpen, setEditPeriodOpen] = useState(false);

  // Convenience aliases derived from the active period so JSX stays readable
  const pmsYear        = activePeriod?.pms_year ?? new Date().getFullYear();
  const selectedPeriod = activePeriod?.period   ?? 'H1';
  const ratingIsOpen   = periodData?.rating_open ?? false;

  // Fetches manual rating submission status for all team members in one batch request
  const fetchRatingStatuses = useCallback(async (members: TeamMember[], year: number, period: string) => {
    if (!members.length || !year || !period) return;
    setStatusLoading(true);
    try {
      const res  = await fetch(`${API}/api/rating-status/batch?user_ids=${members.map(m => m.id).join(',')}&year=${year}&period=${period}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRatingStatus(await res.json());
    } catch {
      // On failure, mark all as pending so the UI doesn't silently show wrong data
      const fallbackStatus: ManualRatingStatus = {};
      members.forEach(m => { fallbackStatus[m.id] = { submitted: false, pending: 0, total: 0 }; });
      setRatingStatus(fallbackStatus);
    }
    setStatusLoading(false);
  }, []);

  // Loads all data needed for the page: period info, overview table, and team list
  const fetchAll = useCallback(async () => {
    if (!evaluatorId) return;
    setLoading(true);
    setRatingStatus({});
    try {
      const periodRes  = await fetch(`${API}/api/rating-periods/current?user_id=${evaluatorId}`);
      const periodJson = periodRes.ok ? await periodRes.json() : null;
      const periods: RatingPeriod[] = periodJson?.periods ?? [];

      // Prefer the currently open window; fall back to the most recent past period
      let best: RatingPeriod | null = null;
      if (periodJson?.rating_open && periodJson?.active_period && periodJson?.pms_year) {
        best = periods.find(
          p => p.is_active &&
               p.period   === periodJson.active_period &&
               p.pms_year === periodJson.pms_year
        ) ?? null;
      }
      if (!best) best = getMostRecentPastPeriod(periods);

      setPeriodData(periodJson);
      setActivePeriod(best);

      const yr  = best?.pms_year ?? new Date().getFullYear();
      const per = best?.period   ?? 'H1';

      const [overviewRes, teamRes] = await Promise.all([
        fetch(`${API}/api/rating-settings/overview/${evaluatorId}?year=${yr}&period=${per}`),
        fetch(`${API}/api/evaluator/${evaluatorId}/team`),
      ]);

      const overviewJson = overviewRes.ok ? await overviewRes.json() : [];
      const teamJson     = teamRes.ok     ? await teamRes.json()     : [];

      setOverview(Array.isArray(overviewJson) ? overviewJson : []);
      const resolvedTeam: TeamMember[] = Array.isArray(teamJson) ? teamJson : [];
      setTeam(resolvedTeam);

      if (resolvedTeam.length > 0 && best) fetchRatingStatuses(resolvedTeam, best.pms_year, best.period);
    } catch (e) { console.error('[RatingSettings] fetchAll failed:', e); }
    setLoading(false);
  }, [evaluatorId, fetchRatingStatuses]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) return (
    <div style={{ padding: '40px 24px', fontFamily: 'Inter, sans-serif', color: '#6B7280', fontSize: 14 }}>Loading…</div>
  );

  const renderOverviewStatus = (member: OverviewMember) => {
    if (member.total === 0)
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }}>N/A</span>;
    return <StatusPill complete={member.status === 'complete'} />;
  };

  const renderOverviewActions = (member: OverviewMember) => {
    if (ratingIsOpen && member.total > 0 && member.pending > 0)
      return <RemindBtn onClick={() => setReminderTarget(member)} />;
    return <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>;
  };

  return (
    <main style={{ minHeight: '100vh', background: '#F9FAFB', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', padding: '32px' }}>

      {reminderTarget && (
        <ReminderModal member={reminderTarget} period={selectedPeriod} pmsYear={pmsYear}
          senderId={evaluatorId} onClose={() => setReminderTarget(null)} onSent={fetchAll} />
      )}

      {editPeriodOpen && activePeriod && (
        <EditPeriodModal
          period={selectedPeriod} pmsYear={activePeriod.pms_year}
          currentStart={activePeriod.rating_start} currentEnd={activePeriod.rating_end}
          evaluatorId={evaluatorId}
          onClose={() => setEditPeriodOpen(false)} onSaved={fetchAll}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: '#101828', margin: '0 0 6px' }}>Rating Settings</h1>
            <p style={{ fontSize: 15, color: '#4A5565', margin: 0 }}>Manage manual ratings and monitor team progress</p>
          </div>
          {activePeriod && (
            <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#F3F4F6', color: '#4A5565', border: '1px solid #E5E7EB', fontSize: 13, fontWeight: 600 }}>
              <Calendar size={13} color="#6B7280" />
              {activePeriod.period} {activePeriod.pms_year}
            </div>
          )}
        </div>

        {/* Rating Period Banner */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6, padding: '18px 24px', marginBottom: 64, borderLeft: '28px solid #2563EB', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
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
            {canEditPeriod && activePeriod && (
              <button onClick={() => setEditPeriodOpen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10,
                border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <Settings size={13} /> Edit Period
              </button>
            )}
          </div>
        </div>

        {/* Team Members — Manual Rating Required */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'hidden', marginBottom: 64, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <SectionHeader
            title="Team Members Requiring Manual Ratings"
            subtitle={`Enter manual ratings for each team member · ${selectedPeriod} ${pmsYear}`}
          />

          {!ratingIsOpen && (
            <div style={{ margin: '20px 24px', background: '#FEF9C3', border: '1px solid #FDE047', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#854D0E', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lock size={14} />
              The rating window is currently closed. Ratings cannot be entered or modified.
              {canEditPeriod && (
                <button onClick={() => setEditPeriodOpen(true)} style={{ marginLeft: 8, padding: '3px 10px', borderRadius: 6, border: '1px solid #FDE047', background: 'transparent', color: '#854D0E', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Open Period →
                </button>
              )}
            </div>
          )}

          {team.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>No team members found.</div>
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
                      if (statusLoading && !status) return <span style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</span>;
                      if (!status)                  return <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>;
                      if (status.total === 0)        return <span style={{ fontSize: 12, color: '#9CA3AF' }}>No manual KPIs</span>;
                      return <StatusPill complete={status.submitted} label={status.submitted ? 'Submitted' : 'Pending'} />;
                    };
                    return (
                      <tr key={member.id} style={{ borderBottom: isLast ? 'none' : '1px solid #E5E7EB', background: '#FFFFFF' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}>
                        <td style={{ padding: '6px 20px 6px 28px' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#101828' }}>{member.full_name}</div>
                        </td>
                        <td style={{ padding: '6px 20px', textAlign: 'center' }}>{renderStatus()}</td>
                        <td style={{ padding: '6px 20px', textAlign: 'center' }}>
                          <EnterRatingsBtn ratingIsOpen={ratingIsOpen} reenter={status?.submitted === true}
                            onClick={() => router.push(`/${roleSlug}/manual-rating?userId=${member.id}&year=${pmsYear}&period=${selectedPeriod}`)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Rating Overview */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6, overflow: 'hidden', marginBottom: 64, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <SectionHeader
            title="Manual Rating Completion Overview"
            subtitle="Track completion progress of manual rating submissions across your team"
          />
          {overview.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>No team members found.</div>
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
                    <tr key={member.id}
                      style={{ borderBottom: idx === overview.length - 1 ? 'none' : '1px solid #E5E7EB', background: '#FFFFFF' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}>
                      <td style={{ padding: '6px 20px' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#101828' }}>{member.name}</div>
                      </td>
                      <td style={{ padding: '6px 16px', textAlign: 'center' }}>
                        {member.total === 0 ? <span style={{ fontSize: 13, color: '#9CA3AF' }}>—</span> : (
                          <>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2563EB' }}>{member.submitted}</span>
                            <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 400 }}> / </span>
                            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#374151' }}>{member.total}</span>
                          </>
                        )}
                      </td>
                      <td style={{ padding: '6px 20px' }}>
                        {member.total === 0 ? <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span> : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#E5E7EB', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ width: `${member.pct}%`, height: '100%', borderRadius: 99, background: member.pct === 100 ? '#16A34A' : '#2563EB', transition: 'width 0.4s' }} />
                            </div>
                            <span style={{ fontSize: 11.5, color: '#6B7280', minWidth: 36, fontWeight: 600 }}>{member.pct}%</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '6px 16px', textAlign: 'center' }}>{renderOverviewStatus(member)}</td>
                      <td style={{ padding: '6px 16px', textAlign: 'center' }}>{renderOverviewActions(member)}</td>
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