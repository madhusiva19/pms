'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Clock, CheckCircle, Send, Calendar, Settings, Lock } from 'lucide-react';

// Base URL for all API calls — falls back to local Flask dev server
const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://127.0.0.1:5000';

// ══════════════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════════════

// One row from the rating_periods table.
// Each row represents a rating window for a specific pms_year + period
// combination, optionally scoped to a country/branch/dept/sub-dept.
interface RatingPeriod {
  id: number;
  pms_year: number;    // e.g. 2025
  period: string;      // "H1" or "H2"
  rating_start: string; // ISO date — when evaluators can start entering ratings
  rating_end: string;   // ISO date — deadline for all ratings to be submitted
  is_active: boolean;
}

// Full response from GET /api/rating-periods/current.
// The backend resolves the most specific period row for the requesting user
// (sub-dept → dept → branch → country → global fallback).
interface RatingPeriodState {
  rating_open: boolean;        // true if today falls within any period's window
  active_period: string | null; // "H1" or "H2" — the open window if any
  pms_year: number;
  rating_start: string;
  rating_end: string;
  reason: string | null;       // human-readable message when window is closed
  periods: RatingPeriod[];     // all resolved periods for this user
}

// One row in the Manual Rating Completion Overview table.
// Represents a direct report of the logged-in evaluator and shows how many
// of that person's own sub-reports have submitted ratings so far.
interface OverviewMember {
  id: string;
  name: string;
  role: string;
  designation: string;
  total: number;      // total sub-reports who need to submit ratings
  submitted: number;  // how many have submitted so far
  pending: number;    // total - submitted
  pct: number;        // submission percentage (0–100)
  status: 'complete' | 'pending' | 'n/a'; // n/a when total === 0
}

// One row in the Team Members Requiring Manual Ratings table.
// These are the evaluator's direct reports who need manual KPI ratings entered.
interface TeamMember {
  id: string;
  full_name: string;
  designation: string;
  template_name: string | null; // performance template assigned to this member
}

// Per-user manual rating submission status fetched from the batch endpoint.
// Tracks how many of a user's manual KPI objectives have been rated.
interface MemberRatingStatus {
  submitted: boolean; // true only when ALL manual objectives have a rating
  pending: number;    // count of objectives still missing a rating
  total: number;      // total manual objectives for this user's template
}
// Keyed by user UUID for O(1) lookup in the team table render
interface ManualRatingStatus { [userId: string]: MemberRatingStatus; }

// Org hierarchy types — populate the scope picker checkboxes in Edit Period modal.
// Each level references its parent so child lists can be filtered by selection.
interface OrgItem     { id: string; name: string; }
interface BranchItem  { id: string; name: string; country_id: string; }
interface DeptItem    { id: string; name: string; branch_id: string; }
interface SubDeptItem { id: string; name: string; department_id: string; }
interface OrgHierarchy {
  countries:       OrgItem[];      // empty for Country Admin (cannot change own period)
  branches:        BranchItem[];
  departments:     DeptItem[];
  sub_departments: SubDeptItem[];
}

// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

// Formats an ISO date string to "DD Mon YYYY" for display (e.g. "01 Jan 2026").
// Returns "—" for empty/null values.
function formatDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// Returns the most appropriate period to display when no window is currently open.
//
// Priority:
//   1. Most recently COMPLETED period — the one whose rating_end is the latest
//      date still in the past. We compare by rating_end date (not pms_year/period
//      label) because the business convention means H1 2025 (Jul–Dec performance)
//      has its rating window in Jan 2026, making it MORE recently completed than
//      H2 2025 (Jan–Jun performance) whose window closed in Jul 2025.
//   2. Soonest UPCOMING period — if no window has closed yet, show the next one.
//   3. First element — absolute last resort.
function getMostRecentPastPeriod(periods: RatingPeriod[]): RatingPeriod | null {
  if (!periods?.length) return null;
  const now = new Date();

  // Filter to periods whose rating window has already closed
  const past = periods.filter(p => new Date(p.rating_end) < now);
  if (past.length > 0)
    return past.reduce((a, b) =>
      new Date(b.rating_end) > new Date(a.rating_end) ? b : a
    );

  // No past periods — fall back to the soonest upcoming window
  const upcoming = periods.filter(p => new Date(p.rating_start) > now);
  if (upcoming.length > 0)
    return upcoming.reduce((a, b) =>
      new Date(a.rating_start) < new Date(b.rating_start) ? a : b
    );

  // Last resort — return the first element
  return periods[0];
}

// ══════════════════════════════════════════════════════════════════
// SMALL UI COMPONENTS
// ══════════════════════════════════════════════════════════════════

// ── TH ────────────────────────────────────────────────────────────
// Reusable <th> cell used in both the team table and the overview table.
// Keeps column header typography consistent across tables.
// Props:
//   center — centres the text (used for Status and Actions columns)
//   width  — optional fixed column width (used in overview table)
function TH({ children, center, width }: {
  children: React.ReactNode; center?: boolean; width?: string;
}) {
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

// ── SectionHeader ─────────────────────────────────────────────────
// Blue left-border card heading used at the top of each content panel.
// Props:
//   title    — main heading text (bold, larger)
//   subtitle — secondary description line (smaller, grey)
function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{
      padding: '18px 24px', borderBottom: '1px solid #E5E7EB',
      borderLeft: '28px solid #2563EB', background: '#FFFFFF',
    }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#101828', lineHeight: 1.3 }}>
        {title}
      </h3>
      <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280' }}>{subtitle}</p>
    </div>
  );
}

// ── StatusPill ────────────────────────────────────────────────────
// Coloured pill badge that shows whether a team member has submitted
// their manual ratings for the active period.
//   Green  = all manual objectives rated (Submitted)
//   Yellow = one or more manual objectives still missing (Pending)
// The `label` prop overrides the default text when a custom label is needed.
function StatusPill({ complete, label }: { complete: boolean; label?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
      background: complete ? '#DCFCE7' : '#FEF9C3',
      color:      complete ? '#166534' : '#854D0E',
      border:     `1px solid ${complete ? '#BBF7D0' : '#FDE047'}`,
    }}>
      {/* CheckCircle icon for submitted, Clock icon for pending */}
      {complete ? <CheckCircle size={10} /> : <Clock size={10} />}
      {label ?? (complete ? 'Submitted' : 'Pending')}
    </span>
  );
}

// ── RemindBtn ─────────────────────────────────────────────────────
// Blue "Remind" button shown in the Overview table's Actions column
// when a sub-report is still pending and the rating window is open.
// Clicking it opens the ReminderModal for that member.
// Only visible when: ratingIsOpen=true AND member.pending > 0
function RemindBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 8, border: '1px solid #BFDBFE',
      background: '#EFF6FF', color: '#2563EB',
      fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    }}>
      {/* Paper plane icon to signal sending a message */}
      <Send size={10} /> Remind
    </button>
  );
}

// ── EnterRatingsBtn ───────────────────────────────────────────────
// Action button in the Team Members table. Has three visual states:
//
//   "Period Closed" (grey, disabled)
//     → shown when the rating window is not open (ratingIsOpen=false)
//     → clicking is blocked (cursor: not-allowed)
//
//   "Enter Ratings" (blue)
//     → shown when the window is open and this member has NOT yet submitted
//     → navigates to the manual-rating entry page for that member
//
//   "Re-enter Ratings" (grey-blue)
//     → shown when the window is open and this member HAS already submitted
//     → allows the evaluator to revise previously entered ratings
function EnterRatingsBtn({ onClick, reenter, ratingIsOpen }: {
  onClick: () => void; reenter?: boolean; ratingIsOpen: boolean;
}) {
  // Period closed — disable the button entirely
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
  // Period open — show Enter or Re-enter depending on submission state
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
// Full-screen overlay modal that lets an evaluator send a push notification
// reminder to a team member who has not yet submitted their manual ratings.
//
// Features:
//   - Pre-filled message mentioning the member's name, period, and year
//   - Editable textarea so the evaluator can personalise the message
//   - Sends via POST /api/manual-rating-notifications/send-reminder
//   - Shows "Sent!" confirmation then auto-closes after 1.2 seconds
//   - Calls onSent() to refresh the page data after sending
//
// Props:
//   member    — OverviewMember or TeamMember (name field differs between the two)
//   period    — "H1" or "H2"
//   pmsYear   — e.g. 2025
//   senderId  — UUID of the logged-in evaluator
//   onClose   — close the modal without refreshing
//   onSent    — called after a successful send to trigger a data refresh
function ReminderModal({ member, period, pmsYear, senderId, onClose, onSent }: {
  member: OverviewMember | TeamMember; period: string; pmsYear: number;
  senderId: string; onClose: () => void; onSent: () => void;
}) {
  // OverviewMember uses "name"; TeamMember uses "full_name"
  const name = 'full_name' in member ? member.full_name : member.name;

  // Pre-fill with a sensible default reminder message
  const [msg,     setMsg]     = useState(
    `Hi ${name}, please complete your pending manual ratings for ${period} ${pmsYear} as soon as possible. The rating window is closing soon.`
  );
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      await fetch(`${API}/api/manual-rating-notifications/send-reminder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender_id:    senderId,
          recipient_id: member.id,
          period,
          pms_year:     pmsYear,
          message:      msg,
        }),
      });
      setSent(true);
      // Brief success flash before closing — gives the user visual confirmation
      setTimeout(() => { onSent(); onClose(); }, 1200);
    } catch { setSending(false); }
  };

  return (
    // Semi-transparent backdrop — clicking outside does NOT close (prevents accidents)
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 12, padding: 28,
        width: '90%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)', fontFamily: 'inherit',
      }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: '#101828' }}>Send Reminder</h3>
        {/* Recipient name shown for confirmation before sending */}
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6B7280' }}>To: {name}</p>
        <div style={{ height: 1, background: '#E5E7EB', marginBottom: 16 }} />

        {/* Editable reminder message textarea */}
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

        {/* Success confirmation — shown briefly after a successful send */}
        {sent && (
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#16A34A' }}>
            ✓ Reminder sent successfully!
          </p>
        )}

        {/* Modal action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          {/* Cancel — closes modal without sending */}
          <button onClick={onClose} style={{
            padding: '7px 16px', borderRadius: 8, border: '1px solid #E5E7EB',
            background: '#FFFFFF', fontSize: 13, cursor: 'pointer',
            color: '#374151', fontWeight: 600,
          }}>Cancel</button>

          {/* Send — disabled while sending or after sent to prevent double-send */}
          <button onClick={handleSend} disabled={sending || sent} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none',
            background: sent ? '#16A34A' : '#2563EB', color: '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: (sending || sent) ? 'not-allowed' : 'pointer',
            opacity: sending ? 0.8 : 1,
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
// Multi-level checkbox picker used inside the Edit Period modal.
// Lets the evaluator choose exactly which admin(s) to update.
//
// KEY DESIGN PRINCIPLE — one selection = one admin's period (no cascading):
//   Selecting a country  → updates ONLY that Country Admin's period row
//   Selecting a branch   → updates ONLY that Branch Admin's period row
//   Selecting a dept     → updates ONLY that Dept Admin's period row
//   Selecting a sub-dept → updates ONLY that Sub-Dept Admin's period row
//
// Parent selections act as DISPLAY FILTERS only — checking "India" narrows
// the branches list to India branches, but does NOT automatically update
// all India branches. Each checkbox is independent.
//
// Deselecting a parent PRUNES its children from the selection lists to
// prevent stale/invisible selections from being submitted accidentally.
//
// Visibility rules:
//   HQ Admin      → sees Include Myself + Countries + Branches + Depts + Sub-Depts
//   Country Admin → sees Branches + Depts + Sub-Depts (under their country only)
//                   (no Countries section — CA cannot change their own period)
function CascadeScopePicker({
  hierarchy, isHQ,
  selCountries, setSelCountries,
  selBranches,  setSelBranches,
  selDepts,     setSelDepts,
  selSubDepts,  setSelSubDepts,
  includeSelf,  setIncludeSelf,
}: {
  hierarchy:    OrgHierarchy; isHQ: boolean;
  selCountries: string[]; setSelCountries: (v: string[]) => void;
  selBranches:  string[]; setSelBranches:  (v: string[]) => void;
  selDepts:     string[]; setSelDepts:     (v: string[]) => void;
  selSubDepts:  string[]; setSelSubDepts:  (v: string[]) => void;
  includeSelf:  boolean;  setIncludeSelf:  (v: boolean) => void;
}) {
  // Lookup maps used to build parent-name subtitles in child item rows.
  // e.g. "Operations" shown with subtitle "Mumbai Headquarters" to distinguish
  // it from "Operations — Hyderabad" in the same dropdown.
  const countryById = Object.fromEntries(hierarchy.countries.map(c => [c.id, c.name]));
  const branchById  = Object.fromEntries(hierarchy.branches.map(b => [b.id, b.name]));
  const deptById    = Object.fromEntries(hierarchy.departments.map(d => [d.id, d.name]));

  // Filtered lists — each level only shows items whose parent is currently selected.
  // Empty parent selection = show all items at that level (no filter applied).
  const filteredBranches = hierarchy.branches.filter(b =>
    selCountries.length === 0 || selCountries.includes(b.country_id));
  const filteredDepts = hierarchy.departments.filter(d =>
    selBranches.length === 0 || selBranches.includes(d.branch_id));
  const filteredSubDepts = hierarchy.sub_departments.filter(s =>
    selDepts.length === 0 || selDepts.includes(s.department_id));

  // When a country is deselected, prune any branches/depts/sub-depts that
  // are no longer in scope so stale hidden selections don't get submitted.
  const handleCountryChange = (ids: string[]) => {
    setSelCountries(ids);
    const validBranches  = hierarchy.branches
      .filter(b => ids.length === 0 || ids.includes(b.country_id)).map(b => b.id);
    const prunedBranches = selBranches.filter(id => validBranches.includes(id));
    setSelBranches(prunedBranches);
    const validDepts  = hierarchy.departments
      .filter(d => prunedBranches.length === 0 || prunedBranches.includes(d.branch_id)).map(d => d.id);
    const prunedDepts = selDepts.filter(id => validDepts.includes(id));
    setSelDepts(prunedDepts);
    const validSubs = hierarchy.sub_departments
      .filter(s => prunedDepts.length === 0 || prunedDepts.includes(s.department_id)).map(s => s.id);
    setSelSubDepts(selSubDepts.filter(id => validSubs.includes(id)));
  };

  // When a branch is deselected, prune orphaned depts and sub-depts
  const handleBranchChange = (ids: string[]) => {
    setSelBranches(ids);
    const validDepts  = hierarchy.departments
      .filter(d => ids.length === 0 || ids.includes(d.branch_id)).map(d => d.id);
    const prunedDepts = selDepts.filter(id => validDepts.includes(id));
    setSelDepts(prunedDepts);
    const validSubs = hierarchy.sub_departments
      .filter(s => prunedDepts.length === 0 || prunedDepts.includes(s.department_id)).map(s => s.id);
    setSelSubDepts(selSubDepts.filter(id => validSubs.includes(id)));
  };

  // When a dept is deselected, prune orphaned sub-depts
  const handleDeptChange = (ids: string[]) => {
    setSelDepts(ids);
    const validSubs = hierarchy.sub_departments
      .filter(s => ids.length === 0 || ids.includes(s.department_id)).map(s => s.id);
    setSelSubDepts(selSubDepts.filter(id => validSubs.includes(id)));
  };

  // Toggle a single item in/out of a selection list
  const toggleOne = (id: string, list: string[], setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  // Select-all (or deselect-all) every visible item in a given level
  const toggleAll = (items: { id: string }[], list: string[], setter: (v: string[]) => void) =>
    setter(list.length === items.length ? [] : items.map(i => i.id));

  // ── Shared styles ──────────────────────────────────────────────
  const sectionBox: React.CSSProperties = {
    border: '1px solid #E5E7EB', borderRadius: 10,
    overflow: 'hidden', marginBottom: 12,
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)', contain: 'paint',
  };
  const sectionHead: React.CSSProperties = {
    padding: '9px 14px', background: '#F8FAFC',
    borderBottom: '1px solid #E5E7EB',
    fontSize: 11, fontWeight: 700, color: '#64748B',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  };
  // Scrollable item list — max 180px tall then scrolls to keep modal compact
  const scrollList: React.CSSProperties = {
    maxHeight: 180, overflowY: 'auto', background: '#FFFFFF',
    borderBottomLeftRadius: 9, borderBottomRightRadius: 9, overflowX: 'hidden',
  };
  // Consistent checkbox style across all levels
  const chk: React.CSSProperties = {
    accentColor: '#2563EB', width: 14, height: 14, flexShrink: 0, marginTop: 1,
  };

  // ── Sub-components ─────────────────────────────────────────────

  // Blue pill showing how many items are selected at this level.
  // Shows "All" when every item is selected, otherwise "N selected".
  // Hidden when count === 0.
  const CountBadge = ({ count, total }: { count: number; total: number }) =>
    count === 0 ? null : (
      <span style={{
        background: '#2563EB', color: '#fff',
        borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 700,
      }}>
        {count === total ? 'All' : `${count} selected`}
      </span>
    );

  // Small "Clear" text button in the section header to deselect all items at that level
  const ClearBtn = ({ onClear }: { onClear: () => void }) => (
    <button
      onClick={e => { e.preventDefault(); onClear(); }}
      style={{
        fontSize: 11, color: '#94A3B8', background: 'none',
        border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
      }}
    >
      Clear
    </button>
  );

  // "Select all [level]" row pinned to the top of each scrollable list.
  // Ticking it selects all currently visible items; ticking again deselects all.
  const SelectAllRow = ({ checked, onChange, label }: {
    checked: boolean; onChange: () => void; label: string;
  }) => (
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

  // Individual item row in a level's scrollable list.
  // Shows the item name and an optional parent-context subtitle.
  // Highlighted in blue when selected; dot indicator on the right.
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
        {/* Primary label — bold and blue when selected */}
        <span style={{
          display: 'block', fontSize: 13,
          fontWeight: checked ? 600 : 400,
          color: checked ? '#1D4ED8' : '#374151', lineHeight: 1.3,
        }}>
          {name}
        </span>
        {/* Parent context subtitle — e.g. branch name under a department */}
        {subtitle && (
          <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 1, lineHeight: 1.2 }}>
            {subtitle}
          </span>
        )}
      </span>
      {/* Blue dot indicator — visible only when item is selected */}
      {checked && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
      )}
    </label>
  );

  return (
    <div>

      {/* ── "Include myself" toggle — HQ Admin only ───────────────
          When checked, the global (all-NULL) rating_period row is also
          updated, changing the HQ Admin's own rating window.
          NOT shown to Country Admins — their own period is managed
          exclusively by HQ Admin. */}
      {isHQ && (
        <label style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '11px 14px', borderRadius: 10, marginBottom: 12,
          background: includeSelf ? '#EFF6FF' : '#F8FAFC',
          border: `1.5px solid ${includeSelf ? '#93C5FD' : '#E2E8F0'}`,
          cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <input
            type="checkbox"
            checked={includeSelf}
            onChange={e => setIncludeSelf(e.target.checked)}
            style={{ ...chk, width: 15, height: 15 }}
          />
          <span style={{ flex: 1 }}>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: includeSelf ? '#1D4ED8' : '#374151', display: 'block',
            }}>
              Include myself
            </span>
            <span style={{ fontSize: 11.5, color: '#94A3B8', display: 'block', marginTop: 2 }}>
              Only updates the rating window for the HQ Admin account — does not affect any other users
            </span>
          </span>
        </label>
      )}

      {/* ── Countries section — HQ Admin only ─────────────────────
          Each country checkbox corresponds to ONE Country Admin's period.
          Checking "India" updates ONLY the India Country Admin's row.
          Branch/Dept/Sub-Dept admins under India are NOT affected because
          they have branch_id set and skip the country-scoped row entirely.
          Selecting countries also acts as a display filter — the Branches
          list below narrows to show only branches under selected countries. */}
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
              <ItemRow
                key={c.id} id={c.id} name={c.name}
                checked={selCountries.includes(c.id)}
                onChange={() => handleCountryChange(
                  selCountries.includes(c.id)
                    ? selCountries.filter(x => x !== c.id)
                    : [...selCountries, c.id]
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Branches section ───────────────────────────────────────
          Each branch checkbox corresponds to ONE Branch Admin's period.
          Checking "Mumbai Headquarters" updates ONLY the Mumbai Branch Admin.
          Dept/Sub-Dept admins under this branch are NOT affected.
          Country subtitle shown in HQ Admin view to disambiguate branches
          across countries that might share the same branch name.
          List is filtered to show only branches under selected countries
          (or all branches if no country is selected). */}
      {filteredBranches.length > 0 && (
        <div style={sectionBox}>
          <div style={sectionHead}>
            <span>
              Branches
              {/* Show count when filtered by country selection */}
              {selCountries.length > 0 ? ` — ${filteredBranches.length} shown` : ''}
            </span>
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
              <ItemRow
                key={b.id} id={b.id} name={b.name}
                // Show country name as subtitle in HQ Admin view
                subtitle={isHQ && b.country_id ? countryById[b.country_id] : undefined}
                checked={selBranches.includes(b.id)}
                onChange={() => handleBranchChange(
                  selBranches.includes(b.id)
                    ? selBranches.filter(x => x !== b.id)
                    : [...selBranches, b.id]
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Departments section ────────────────────────────────────
          Each dept checkbox corresponds to ONE Dept Admin's period.
          Checking "Finance & Accounts — Hyderabad" updates ONLY that
          specific Dept Admin — no other admins are affected.
          Branch name shown as subtitle to distinguish same-named depts
          (e.g. "Operations" appears in both Mumbai and Hyderabad).
          List filtered to depts under selected branches (or all if none). */}
      {filteredDepts.length > 0 && (
        <div style={sectionBox}>
          <div style={sectionHead}>
            <span>
              Departments
              {selBranches.length > 0
                ? ` — ${filteredDepts.length} shown`
                : ` — all ${filteredDepts.length}`}
            </span>
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
              <ItemRow
                key={d.id} id={d.id} name={d.name}
                subtitle={(() => {
                  const branch      = hierarchy.branches.find(b => b.id === d.branch_id);
                  const branchName  = branchById[d.branch_id];
                  const countryName = isHQ && branch ? countryById[branch.country_id] : undefined;
                  // In HQ view: "Country · Branch"; in CA view: "Branch" only
                  if (countryName && branchName) return `${countryName} · ${branchName}`;
                  if (branchName)                return branchName;
                  return undefined;
                })()}
                checked={selDepts.includes(d.id)}
                onChange={() => handleDeptChange(
                  selDepts.includes(d.id)
                    ? selDepts.filter(x => x !== d.id)
                    : [...selDepts, d.id]
                )}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Sub-Departments section ────────────────────────────────
          Each sub-dept checkbox corresponds to ONE Sub-Dept Admin's period.
          Full ancestry shown as subtitle (Country · Branch · Dept) so the
          evaluator can clearly distinguish "Import Operations — Mumbai"
          from "Import Operations — Hyderabad".
          List filtered to sub-depts under selected depts (or all if none). */}
      {filteredSubDepts.length > 0 && (
        <div style={sectionBox}>
          <div style={sectionHead}>
            <span>
              Sub-Departments
              {selDepts.length > 0
                ? ` — ${filteredSubDepts.length} shown`
                : ` — all ${filteredSubDepts.length}`}
            </span>
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
              <ItemRow
                key={s.id} id={s.id} name={s.name}
                subtitle={(() => {
                  const deptName    = deptById[s.department_id];
                  const dept        = hierarchy.departments.find(d => d.id === s.department_id);
                  const branchName  = dept ? branchById[dept.branch_id] : undefined;
                  const branch      = dept ? hierarchy.branches.find(b => b.id === dept.branch_id) : undefined;
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
// Full-screen overlay modal that lets HQ and Country Admins change the
// rating window start/end dates for specific admin levels in the org tree.
//
// Who can open this modal:
//   HQ Admin      → "Edit Period" button visible (canEditPeriod=true)
//   Country Admin → "Edit Period" button visible (canEditPeriod=true)
//   All others    → button hidden
//
// What each role can change:
//   HQ Admin      → global row (own period) via "Include myself",
//                   plus any Country/Branch/Dept/Sub-Dept Admin's period
//   Country Admin → Branch/Dept/Sub-Dept admins under their country only
//                   (their own period is set exclusively by HQ Admin)
//
// Form fields:
//   Rating Start  — date input, pre-filled from the current period's start
//   Rating End    — date input, pre-filled from the current period's end
//   Scope picker  — CascadeScopePicker showing the evaluator's visible org tree
//
// Validation:
//   Both dates must be filled.
//   End date must be strictly after start date.
//   At least one scope item must be selected.
//
// On save:
//   POST /api/rating-periods/update with the selected dates and scope.
//   Shows "Saved!" confirmation, then closes and calls onSaved() to refresh data.
function EditPeriodModal({ period, pmsYear, currentStart, currentEnd, evaluatorId, onClose, onSaved }: {
  period: string; pmsYear: number; currentStart: string; currentEnd: string;
  evaluatorId: string; onClose: () => void; onSaved: () => void;
}) {
  const { user } = useAuth();
  // Only HQ Admin has the "Include myself" toggle and the Countries section
  const isHQ = user?.role === 'hq_admin';

  // Date inputs — pre-filled from the currently displayed period's dates
  const [start,  setStart]  = useState(currentStart?.slice(0, 10) ?? '');
  const [end,    setEnd]    = useState(currentEnd?.slice(0, 10) ?? '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  // HQ only — when true, the global (all-NULL) row is also updated.
  // This changes the HQ Admin's own rating window without affecting
  // any other users (all other users resolve to a more specific row).
  const [includeSelf, setIncludeSelf] = useState(false);

  // Full org hierarchy for the scope picker checkboxes.
  // Fetched on mount; scoped to what this evaluator's role can see.
  const [hierarchy,   setHierarchy]   = useState<OrgHierarchy>({
    countries: [], branches: [], departments: [], sub_departments: [],
  });
  const [loadingHier, setLoadingHier] = useState(true);

  // Selected scope items — each list passed into CascadeScopePicker
  const [selCountries, setSelCountries] = useState<string[]>([]);
  const [selBranches,  setSelBranches]  = useState<string[]>([]);
  const [selDepts,     setSelDepts]     = useState<string[]>([]);
  const [selSubDepts,  setSelSubDepts]  = useState<string[]>([]);

  // Fetch org hierarchy on mount.
  // HQ Admin receives the full tree; Country Admin receives only the
  // branches/depts/sub-depts under their own country.
  useEffect(() => {
    if (!evaluatorId || !user?.role) return;
    setLoadingHier(true);
    fetch(`${API}/api/rating-periods/org-hierarchy?evaluator_id=${evaluatorId}&role=${user.role}`)
      .then(r => r.json())
      .then((d: OrgHierarchy) => setHierarchy(d))
      .catch(() => {})
      .finally(() => setLoadingHier(false));
  }, [evaluatorId, user?.role]);

  // Total selected items across all levels — gates the Save button
  const totalSelected =
    (includeSelf ? 1 : 0) +
    selCountries.length + selBranches.length + selDepts.length + selSubDepts.length;

  // Human-readable summary shown in the green confirmation box below the picker.
  // Clarifies exactly which admin roles will be updated before the user saves.
  const summaryParts: string[] = [];
  if (includeSelf)         summaryParts.push('My rating period (HQ Admin)');
  if (selCountries.length) summaryParts.push(`${selCountries.length} ${selCountries.length === 1 ? 'country admin' : 'country admins'}`);
  if (selBranches.length)  summaryParts.push(`${selBranches.length} ${selBranches.length === 1 ? 'branch admin' : 'branch admins'}`);
  if (selDepts.length)     summaryParts.push(`${selDepts.length} ${selDepts.length === 1 ? 'dept admin' : 'dept admins'}`);
  if (selSubDepts.length)  summaryParts.push(`${selSubDepts.length} sub-${selSubDepts.length === 1 ? 'dept admin' : 'dept admins'}`);

  const handleSave = async () => {
    // Client-side validation before hitting the API
    if (!start || !end)                   { setError('Both dates are required.'); return; }
    if (new Date(end) <= new Date(start)) { setError('End date must be after start date.'); return; }
    if (totalSelected === 0)              { setError('Please select at least one scope.'); return; }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/rating-periods/update`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period,
          pms_year:             pmsYear,
          rating_start:         start,
          rating_end:           end,
          evaluator_id:         evaluatorId,
          // Country Admin cannot set a self-scope or pick countries —
          // those are restricted to HQ Admin only
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
      // Brief success flash before closing so the user sees the confirmation
      setTimeout(() => { onSaved(); onClose(); }, 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save. Please try again.');
    }
    setSaving(false);
  };

  // Shared input style for the date pickers
  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', boxSizing: 'border-box',
    border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13,
    outline: 'none', fontFamily: 'inherit', color: '#374151', background: '#F9FAFB',
  };

  return (
    // Semi-transparent backdrop
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
      <div style={{
        background: '#FFFFFF', borderRadius: 12, padding: 32,
        width: '94%', maxWidth: 640,
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)', fontFamily: 'inherit',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 15, fontWeight: 700, color: '#101828' }}>Edit Rating Period</h3>
        {/* Period label shown for context — e.g. "H1 2025" */}
        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: '#6B7280' }}>{period} {pmsYear}</p>
        <div style={{ height: 1, background: '#E5E7EB', marginBottom: 18 }} />

        {/* ── Date pickers ── side by side for compact layout */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 22 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5565', display: 'block', marginBottom: 6 }}>
              Rating Start
            </label>
            {/* Date when evaluators can begin entering manual ratings */}
            <input type="date" value={start} onChange={e => setStart(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#4A5565', display: 'block', marginBottom: 6 }}>
              Rating End
            </label>
            {/* Deadline — after this date the period is shown as "Closed" */}
            <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={inp} />
          </div>
        </div>

        {/* ── Scope section header ── */}
        <div style={{
          fontSize: 12, fontWeight: 700, color: '#101828',
          marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #E5E7EB',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Settings size={13} color="#2563EB" />
          Scope — choose who this update applies to
        </div>

        {/* ── Scope picker ── shows loading state while org data is being fetched */}
        {loadingHier ? (
          <div style={{ fontSize: 13, color: '#9CA3AF', padding: '12px 0' }}>
            Loading org structure…
          </div>
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

        {/* ── Live summary banner ──
            Green confirmation box that appears once any scope is selected.
            Shows exactly which admin roles will have their period updated,
            giving the evaluator a final sanity check before saving. */}
        {totalSelected > 0 && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, margin: '12px 0',
            background: '#DCFCE7', border: '1px solid #BBF7D0',
            fontSize: 12, color: '#166534', fontWeight: 600,
          }}>
            Rating window will be updated for: {summaryParts.join(', ')}
          </div>
        )}

        {/* Error message — shown when validation fails or the API returns an error */}
        {error && <p style={{ color: '#DC2626', fontSize: 12, margin: '8px 0' }}>{error}</p>}
        {/* Success message — shown briefly after a successful save */}
        {saved  && <p style={{ color: '#16A34A', fontSize: 12, margin: '8px 0' }}>Period updated successfully!</p>}

        {/* ── Modal action buttons ── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
          {/* Cancel — closes modal without saving any changes */}
          <button onClick={onClose} style={{
            padding: '7px 16px', borderRadius: 8, border: '1px solid #E5E7EB',
            background: '#FFFFFF', fontSize: 13, cursor: 'pointer',
            color: '#374151', fontWeight: 600,
          }}>Cancel</button>

          {/* Save Changes — disabled while saving or after successful save to prevent double-submit */}
          <button onClick={handleSave} disabled={saving || saved} style={{
            padding: '7px 18px', borderRadius: 8, border: 'none',
            background: saved ? '#16A34A' : '#2563EB', color: '#fff',
            fontSize: 13, fontWeight: 600,
            cursor: (saving || saved) ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.8 : 1,
          }}>
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE — RatingSettings
// ══════════════════════════════════════════════════════════════════
// Rating Settings page shared across HQ Admin, Country Admin, Branch Admin,
// Dept Admin, and Sub-Dept Admin role routes.
//
// Page sections:
//   1. Rating Period Banner      — shows the active period dates and Open/Closed status
//   2. Team Members Table        — evaluator's direct reports + Enter/Re-enter Ratings buttons
//   3. Overview Table            — completion progress of all sub-reports under each direct report
//
// Edit Period flow (HQ Admin and Country Admin only):
//   Clicking "Edit Period" opens EditPeriodModal → CascadeScopePicker →
//   POST /api/rating-periods/update → page refreshes with new dates
export default function RatingSettings() {
  const { user }     = useAuth();
  const router       = useRouter();
  // useSearchParams enables URL param demo-mode override (?year=YYYY&period=H1)
  const searchParams = useSearchParams();

  // Convert role string to URL path segment (e.g. "hq_admin" → "hq-admin")
  // Used when navigating to the manual-rating entry page
  const roleSlug = user?.role?.replace(/_/g, '-') ?? 'branch-admin';

  // Only HQ Admin and Country Admin can open the Edit Period modal
  const canEditPeriod = user?.role === 'country_admin' || user?.role === 'hq_admin';
  const evaluatorId   = user?.id ?? '';

  // ── Page state ─────────────────────────────────────────────────

  // Full API response from /api/rating-periods/current for the logged-in user
  const [periodData,    setPeriodData]    = useState<RatingPeriodState | null>(null);

  // The period currently displayed in the banner and used for all data fetches.
  // Set by fetchAll using the 3-step priority logic below.
  const [activePeriod,  setActivePeriod]  = useState<RatingPeriod | null>(null);

  // Rows for the Manual Rating Completion Overview table (direct reports of evaluator)
  const [overview,      setOverview]      = useState<OverviewMember[]>([]);

  // Rows for the Team Members table (evaluator's own direct reports)
  const [team,          setTeam]          = useState<TeamMember[]>([]);

  // Batch manual rating submission status keyed by user UUID
  const [ratingStatus,  setRatingStatus]  = useState<ManualRatingStatus>({});

  // true while the batch status fetch is in progress (shows "Loading…" in cells)
  const [statusLoading, setStatusLoading] = useState(false);

  // true while the initial page data is loading (shows full-page loading state)
  const [loading,       setLoading]       = useState(true);

  // Which member's Remind button was clicked — null means modal is closed
  const [reminderTarget, setReminderTarget] = useState<OverviewMember | TeamMember | null>(null);

  // Whether the Edit Period modal is currently open
  const [editPeriodOpen, setEditPeriodOpen] = useState(false);

  // ── Convenience aliases ────────────────────────────────────────
  // Derived from activePeriod so JSX stays readable without null checks everywhere
  const pmsYear        = activePeriod?.pms_year ?? new Date().getFullYear();
  const selectedPeriod = activePeriod?.period   ?? 'H1';
  // true when today falls within the active period's rating_start → rating_end window
  const ratingIsOpen   = periodData?.rating_open ?? false;

  // ── fetchRatingStatuses ────────────────────────────────────────
  // Fetches manual rating submission status for all team members in a single
  // batch request (avoids N individual requests for an N-member team).
  // Updates ratingStatus state which drives the StatusPill and EnterRatingsBtn
  // in the Team Members table.
  const fetchRatingStatuses = useCallback(async (
    members: TeamMember[], year: number, period: string
  ) => {
    if (!members.length || !year || !period) return;
    setStatusLoading(true);
    try {
      const res = await fetch(
        `${API}/api/rating-status/batch?user_ids=${members.map(m => m.id).join(',')}&year=${year}&period=${period}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRatingStatus(await res.json());
    } catch {
      // On failure mark all members as pending so the UI doesn't silently
      // show incorrect "Submitted" statuses
      const fallback: ManualRatingStatus = {};
      members.forEach(m => { fallback[m.id] = { submitted: false, pending: 0, total: 0 }; });
      setRatingStatus(fallback);
    }
    setStatusLoading(false);
  }, []);

  // ── fetchAll ───────────────────────────────────────────────────
  // Master data loader — fetches everything the page needs in order:
  //   1. /api/rating-periods/current  → determines which period to display
  //   2. /api/rating-settings/overview → populates the overview table
  //   3. /api/evaluator/:id/team       → populates the team members table
  //   4. fetchRatingStatuses           → populates submission status badges
  //
  // Period selection priority (first match wins):
  //   Step 1 — URL param override (?year=YYYY&period=H1)
  //            Allows demo/test mode by forcing a specific period via URL.
  //            Must match on BOTH pms_year AND period to avoid confusion
  //            between H1 2025 and H1 2026.
  //   Step 2 — Currently open window from the API
  //            Uses active_period + pms_year from the backend response.
  //            Again matched on BOTH fields to prevent cross-year confusion.
  //   Step 3 — Most recently completed past period (fallback)
  //            Compares by rating_end date so H1 2025 (window ends Jan 2026)
  //            correctly ranks above H2 2025 (window ends Jul 2025).
  const fetchAll = useCallback(async () => {
    if (!evaluatorId) return;
    setLoading(true);
    setRatingStatus({});
    try {
      const periodRes  = await fetch(`${API}/api/rating-periods/current?user_id=${evaluatorId}`);
      const periodJson = periodRes.ok ? await periodRes.json() : null;
      const periods: RatingPeriod[] = periodJson?.periods ?? [];

      // ── Step 1: URL param override (demo / test mode) ──────────
      const urlYear   = searchParams.get('year')   ? parseInt(searchParams.get('year')!)   : null;
      const urlPeriod = searchParams.get('period') ?? null;

      let best: RatingPeriod | null = null;
      if (urlYear && urlPeriod) {
        // Match on BOTH pms_year AND period — not just period string alone
        best = periods.find(p => p.pms_year === urlYear && p.period === urlPeriod) ?? null;
      }

      // ── Step 2: Currently open window from the API ─────────────
      if (!best && periodJson?.rating_open && periodJson?.active_period && periodJson?.pms_year) {
        best = periods.find(
          p => p.is_active &&
               p.period   === periodJson.active_period &&
               p.pms_year === periodJson.pms_year
        ) ?? null;
      }

      // ── Step 3: Most recently completed past period (fallback) ──
      if (!best) best = getMostRecentPastPeriod(periods);

      setPeriodData(periodJson);
      setActivePeriod(best);

      const yr  = best?.pms_year ?? new Date().getFullYear();
      const per = best?.period   ?? 'H1';

      // Fetch overview and team data in parallel to reduce total load time
      const [overviewRes, teamRes] = await Promise.all([
        fetch(`${API}/api/rating-settings/overview/${evaluatorId}?year=${yr}&period=${per}`),
        fetch(`${API}/api/evaluator/${evaluatorId}/team`),
      ]);

      const overviewJson = overviewRes.ok ? await overviewRes.json() : [];
      const teamJson     = teamRes.ok     ? await teamRes.json()     : [];

      setOverview(Array.isArray(overviewJson) ? overviewJson : []);
      const resolvedTeam: TeamMember[] = Array.isArray(teamJson) ? teamJson : [];
      setTeam(resolvedTeam);

      // Fetch submission statuses for all team members once we have both
      // the team list and the active period confirmed
      if (resolvedTeam.length > 0 && best) {
        fetchRatingStatuses(resolvedTeam, best.pms_year, best.period);
      }
    } catch (e) {
      console.error('[RatingSettings] fetchAll failed:', e);
    }
    setLoading(false);
  // searchParams in deps so URL param changes trigger a re-fetch automatically
  }, [evaluatorId, fetchRatingStatuses, searchParams]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Full-page loading state while the initial data fetch runs
  if (loading) return (
    <div style={{ padding: '40px 24px', fontFamily: 'Inter, sans-serif', color: '#6B7280', fontSize: 14 }}>
      Loading…
    </div>
  );

  // ── Render helpers ─────────────────────────────────────────────

  // Status cell for the Overview table.
  // "N/A" pill when this manager has no sub-reports.
  // StatusPill (green/yellow) otherwise.
  const renderOverviewStatus = (member: OverviewMember) => {
    if (member.total === 0) return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
        background: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB',
      }}>N/A</span>
    );
    return <StatusPill complete={member.status === 'complete'} />;
  };

  // Actions cell for the Overview table.
  // RemindBtn when window is open AND this manager still has pending sub-reports.
  // Em-dash otherwise (nothing useful to show).
  const renderOverviewActions = (member: OverviewMember) => {
    if (ratingIsOpen && member.total > 0 && member.pending > 0)
      return <RemindBtn onClick={() => setReminderTarget(member)} />;
    return <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>;
  };

  // ── Page render ────────────────────────────────────────────────
  return (
    <main style={{
      minHeight: '100vh', background: '#F9FAFB',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif', padding: '32px',
    }}>

      {/* ── Reminder Modal ─────────────────────────────────────────
          Opens when an evaluator clicks a "Remind" button in the Overview table.
          reminderTarget is null when the modal is closed. */}
      {reminderTarget && (
        <ReminderModal
          member={reminderTarget} period={selectedPeriod} pmsYear={pmsYear}
          senderId={evaluatorId}
          onClose={() => setReminderTarget(null)}
          onSent={fetchAll} // refresh page data after sending
        />
      )}

      {/* ── Edit Period Modal ──────────────────────────────────────
          Opens when HQ/Country Admin clicks the "Edit Period" button.
          Only rendered when editPeriodOpen=true AND we have an activePeriod
          so the modal has dates to pre-fill. */}
      {editPeriodOpen && activePeriod && (
        <EditPeriodModal
          period={selectedPeriod} pmsYear={activePeriod.pms_year}
          currentStart={activePeriod.rating_start} currentEnd={activePeriod.rating_end}
          evaluatorId={evaluatorId}
          onClose={() => setEditPeriodOpen(false)}
          onSaved={fetchAll} // refresh page data after saving new dates
        />
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Breadcrumb navigation ──────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 13.5, color: '#6B7280', marginBottom: 16,
        }}>
          <Link href="/dashboard" style={{ color: '#6B7280', textDecoration: 'none' }}>Home</Link>
          <span>›</span>
          <span style={{ color: '#101828' }}>Rating Settings</span>
        </div>

        {/* ── Page header ────────────────────────────────────────── */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 32, flexWrap: 'wrap', gap: 12,
        }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 600, color: '#101828', margin: '0 0 6px' }}>
              Rating Settings
            </h1>
            <p style={{ fontSize: 15, color: '#4A5565', margin: 0 }}>
              Manage manual ratings and monitor team progress
            </p>
          </div>
          {/* Period badge — top-right pill showing the currently viewed period (e.g. "H1 2025") */}
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

        {/* ════════════════════════════════════════════════════════
            SECTION 1 — RATING PERIOD BANNER
            ════════════════════════════════════════════════════════
            Shows the currently resolved rating period for this user,
            including the window dates and Open/Closed status badge.

            Open  (green pill) → today falls between rating_start and rating_end
            Closed (yellow pill) → window has not started yet or has already ended

            "Edit Period" button — visible to HQ Admin and Country Admin only.
            Opens EditPeriodModal to change dates and/or scope.

            "Open Period →" shortcut — appears inside the Closed warning banner
            in the Team Members table (also opens EditPeriodModal). */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6,
          padding: '18px 24px', marginBottom: 64,
          borderLeft: '28px solid #2563EB', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              {/* Period label + Open/Closed status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                <h3 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#101828' }}>
                  Rating Period — {selectedPeriod} {activePeriod?.pms_year ?? new Date().getFullYear()}
                </h3>
                {/* Green = open, Yellow = closed */}
                <span style={{
                  padding: '2px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  background: ratingIsOpen ? '#DCFCE7' : '#FEF9C3',
                  color:      ratingIsOpen ? '#166534' : '#854D0E',
                  border:     `1px solid ${ratingIsOpen ? '#BBF7D0' : '#FDE047'}`,
                }}>
                  {ratingIsOpen ? '● Open' : '● Closed'}
                </span>
              </div>
              {/* Date range — e.g. "01 Jan 2026 → 15 Jan 2026" */}
              <p style={{ margin: 0, fontSize: 12.5, color: '#6B7280' }}>
                {activePeriod
                  ? `${formatDate(activePeriod.rating_start)} → ${formatDate(activePeriod.rating_end)}`
                  : (periodData?.reason ?? 'No period configured.')}
              </p>
            </div>

            {/* "Edit Period" button — HQ Admin and Country Admin only */}
            {canEditPeriod && activePeriod && (
              <button onClick={() => setEditPeriodOpen(true)} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10,
                border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                <Settings size={13} /> Edit Period
              </button>
            )}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            SECTION 2 — TEAM MEMBERS REQUIRING MANUAL RATINGS
            ════════════════════════════════════════════════════════
            Table of the evaluator's own direct reports.
            Each row shows:
              - Member name
              - Rating Status pill (Submitted / Pending / No manual KPIs / Loading…)
              - Action button (Enter Ratings / Re-enter Ratings / Period Closed)

            "Submitted" = all manual objectives for this member have a rating value.
            "Pending"   = one or more manual objectives still have NULL manual_rating.
            "No manual KPIs" = this member's template has no manual-type objectives.

            When the rating window is closed:
              - A yellow warning banner is shown at the top of the table.
              - All action buttons are replaced with the disabled "Period Closed" state.
              - An "Open Period →" link is shown in the banner (admins only) to
                quickly navigate to the Edit Period modal. */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6,
          overflow: 'hidden', marginBottom: 64, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <SectionHeader
            title="Team Members Requiring Manual Ratings"
            subtitle={`Enter manual ratings for each team member · ${selectedPeriod} ${pmsYear}`}
          />

          {/* ── Closed period warning banner ──
              Shown when the rating window is not open. Informs the evaluator
              that ratings cannot be modified. Includes a shortcut to open the
              Edit Period modal (admins only). */}
          {!ratingIsOpen && (
            <div style={{
              margin: '20px 24px', background: '#FEF9C3',
              border: '1px solid #FDE047', borderRadius: 8,
              padding: '12px 16px', fontSize: 13, color: '#854D0E',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Lock size={14} />
              The rating window is currently closed. Ratings cannot be entered or modified.
              {/* Quick-open shortcut for admins — only shown if they can edit periods */}
              {canEditPeriod && (
                <button onClick={() => setEditPeriodOpen(true)} style={{
                  marginLeft: 8, padding: '3px 10px', borderRadius: 6,
                  border: '1px solid #FDE047', background: 'transparent',
                  color: '#854D0E', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                  Open Period →
                </button>
              )}
            </div>
          )}

          {/* Empty state */}
          {team.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              No team members found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              {/* Fixed column widths: 50% name, 25% status, 25% actions */}
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '50%' }} />
                  <col style={{ width: '25%' }} />
                  <col style={{ width: '25%' }} />
                </colgroup>
                <thead>
                  <tr>
                    {/* Team Member — name of the direct report */}
                    <TH>Team Member</TH>
                    {/* Rating Status — Submitted/Pending/No manual KPIs/Loading */}
                    <TH center>Rating Status</TH>
                    {/* Actions — Enter/Re-enter Ratings or Period Closed */}
                    <TH center>Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member, idx) => {
                    const status = ratingStatus[member.id];
                    const isLast = idx === team.length - 1;

                    // Status cell content — depends on loading state and submission data
                    const renderStatus = () => {
                      // Still loading the batch status fetch
                      if (statusLoading && !status)
                        return <span style={{ fontSize: 12, color: '#9CA3AF' }}>Loading…</span>;
                      // Status not yet available (batch fetch not started)
                      if (!status)
                        return <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>;
                      // This member's template has no manual-type objectives
                      if (status.total === 0)
                        return <span style={{ fontSize: 12, color: '#9CA3AF' }}>No manual KPIs</span>;
                      // Show Submitted (green) or Pending (yellow) pill
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
                        style={{ borderBottom: isLast ? 'none' : '1px solid #E5E7EB', background: '#FFFFFF' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                        onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                      >
                        {/* Member name */}
                        <td style={{ padding: '6px 20px 6px 28px' }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#101828' }}>
                            {member.full_name}
                          </div>
                        </td>

                        {/* Submission status badge */}
                        <td style={{ padding: '6px 20px', textAlign: 'center' }}>
                          {renderStatus()}
                        </td>

                        {/* Enter / Re-enter / Period Closed button.
                            Navigates to manual-rating page with userId, year, and period
                            so the entry form pre-loads the correct objectives. */}
                        <td style={{ padding: '6px 20px', textAlign: 'center' }}>
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

        {/* ════════════════════════════════════════════════════════
            SECTION 3 — MANUAL RATING COMPLETION OVERVIEW
            ════════════════════════════════════════════════════════
            Table of the evaluator's direct reports and their team's
            submission progress. Each row represents one direct report
            and shows how many of THEIR sub-reports have submitted ratings.

            Columns:
              Team Member     — name of the direct report (manager/admin)
              Members To Rate — X / Y (submitted / total sub-reports)
              Completion      — horizontal progress bar + percentage
              Status          — complete (green) / pending (yellow) / N/A (grey)
              Actions         — Remind button or em-dash

            "Remind" button — visible only when:
              - Rating window is open (ratingIsOpen=true)
              - This manager has at least one pending sub-report (member.pending > 0)
              Clicking it opens the ReminderModal to send a push notification.

            "N/A" status — shown when a manager has no sub-reports (total === 0).
            Progress bar turns green when pct === 100 (all sub-reports submitted). */}
        <div style={{
          background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 6,
          overflow: 'hidden', marginBottom: 64, boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <SectionHeader
            title="Manual Rating Completion Overview"
            subtitle="Track completion progress of manual rating submissions across your team"
          />

          {/* Empty state */}
          {overview.length === 0 ? (
            <div style={{ padding: '40px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
              No team members found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {/* Team Member — the direct report's name */}
                    <TH>Team Member</TH>
                    {/* Members To Rate — "submitted / total" count */}
                    <TH center width="170px">Members To Rate</TH>
                    {/* Completion — progress bar + percentage */}
                    <TH width="170px">Completion</TH>
                    {/* Status — complete / pending / N/A pill */}
                    <TH center width="170px">Status</TH>
                    {/* Actions — Remind button or em-dash */}
                    <TH center width="170px">Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {overview.map((member, idx) => (
                    <tr
                      key={member.id}
                      style={{ borderBottom: idx === overview.length - 1 ? 'none' : '1px solid #E5E7EB', background: '#FFFFFF' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F9FAFB')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
                    >
                      {/* Manager/admin name */}
                      <td style={{ padding: '6px 20px' }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#101828' }}>
                          {member.name}
                        </div>
                      </td>

                      {/* Submitted / Total count — blue for submitted, grey for total */}
                      <td style={{ padding: '6px 16px', textAlign: 'center' }}>
                        {member.total === 0
                          ? <span style={{ fontSize: 13, color: '#9CA3AF' }}>—</span>
                          : (
                            <>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#2563EB' }}>
                                {member.submitted}
                              </span>
                              <span style={{ fontSize: 13, color: '#9CA3AF', fontWeight: 400 }}> / </span>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#374151' }}>
                                {member.total}
                              </span>
                            </>
                          )}
                      </td>

                      {/* Progress bar — green when 100%, blue otherwise */}
                      <td style={{ padding: '6px 20px' }}>
                        {member.total === 0
                          ? <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                          : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {/* Track */}
                              <div style={{
                                flex: 1, height: 6, background: '#E5E7EB',
                                borderRadius: 99, overflow: 'hidden',
                              }}>
                                {/* Fill — animates width change when data updates */}
                                <div style={{
                                  width: `${member.pct}%`, height: '100%', borderRadius: 99,
                                  background: member.pct === 100 ? '#16A34A' : '#2563EB',
                                  transition: 'width 0.4s',
                                }} />
                              </div>
                              {/* Percentage label */}
                              <span style={{ fontSize: 11.5, color: '#6B7280', minWidth: 36, fontWeight: 600 }}>
                                {member.pct}%
                              </span>
                            </div>
                          )}
                      </td>

                      {/* Status pill (complete / pending / N/A) */}
                      <td style={{ padding: '6px 16px', textAlign: 'center' }}>
                        {renderOverviewStatus(member)}
                      </td>

                      {/* Remind button or em-dash */}
                      <td style={{ padding: '6px 16px', textAlign: 'center' }}>
                        {renderOverviewActions(member)}
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