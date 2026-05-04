"use client";

// ─── React & Next.js Imports ──────────────────────────────────────────────────
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

// ─── Icon Imports ─────────────────────────────────────────────────────────────
import {
  Search, FileText, Pencil, Trash2, Lock, Loader2, Inbox,
  Target, Calendar, Copy, BookOpen, CheckCircle2, Clock3,
  Eye, ChevronDown, ChevronUp, Layers, Unlock, Award,
  Users, Building2, BarChart3, TrendingUp, GitBranch,
  UserCheck, Settings, X, AlertTriangle, Globe, History,
} from "lucide-react";

// ─── Internal Imports ─────────────────────────────────────────────────────────
import { toast } from "sonner";
import styles from "./TemplateDashboardBase.module.css";
import { formatDate, daysUntil } from "@/lib/freezeUtils";


// ─── Constants ────────────────────────────────────────────────────────────────

/** Base URL for all API calls. Falls back to local dev server. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

/**
 * Days remaining threshold before showing the objective-closing warning banner.
 * Extracted as a constant to avoid magic numbers in logic.
 */
const CLOSING_WARNING_THRESHOLD_DAYS = 14;

/**
 * Palette used to colour-code performance categories in the expanded card view.
 * Each entry defines background, fill (progress bar / accent), and text colours.
 */
const CATEGORY_PALETTE: ReadonlyArray<{ bg: string; fill: string; text: string }> = [
  { bg: "#eff6ff", fill: "#3b82f6", text: "#1e40af" },
  { bg: "#ecfdf5", fill: "#059669", text: "#065f46" },
  { bg: "#fef3c7", fill: "#d97706", text: "#92400e" },
  { bg: "#f5f3ff", fill: "#8b5cf6", text: "#5b21b6" },
  { bg: "#fff1f2", fill: "#f43f5e", text: "#be123c" },
  { bg: "#ecfeff", fill: "#0891b2", text: "#164e63" },
];

/**
 * Maps scope rule keys returned by the API to human-readable labels
 * shown in the assignment section of each template card.
 */
const SCOPE_LABELS: Readonly<Record<string, string>> = {
  all_country_admins:  "All Country Admins",
  all_branch_admins:   "All Branch Admins",
  all_dept_admins:     "All Department Admins",
  all_sub_dept_admins: "All Sub-Department Admins",
};

/**
 * Maps admin level numbers to their URL route prefixes.
 * Level 1 = HQ Admin, Levels 2-5 = progressively lower admin tiers.
 */
const ROLE_PREFIXES: Readonly<Record<number, string>> = {
  1: "/hq-admin",
  2: "/country-admin",
  3: "/branch-admin",
  4: "/dept-admin",
  5: "/sub-dept-admin",
};

/** Default route prefix used when an unrecognised level is supplied. */
const DEFAULT_ROLE_PREFIX = "/hq-admin";

/**
 * Human-readable labels for each admin level.
 * Used in banners and the role pill in the page header.
 */
const ROLE_LABELS: Readonly<Record<number, string>> = {
  1: "HQ Administrator",
  2: "Country Administrator",
  3: "Branch Administrator",
  4: "Department Administrator",
  5: "Sub-Department Administrator",
};


// ─── Type Definitions ─────────────────────────────────────────────────────────

/** The three possible freeze states for the current PMS cycle. */
type FreezeStatus = "open" | "grace" | "frozen";

/** Key dates derived from the active PMS cycle record. */
interface DynamicFreezeDates {
  pmsYearStart:        Date;
  objectiveSettingEnd: Date;
  graceEnd:            Date;
  midYearReview:       Date | null;
  yearEndReview:       Date | null;
}

/**
 * Aggregated permission flags computed from the admin level and the current
 * freeze status. Passed down to child components to drive button states.
 */
interface TemplatePermissions {
  freezeStatus:    FreezeStatus;
  /** Whether the current user may edit any template at all. */
  canEdit:         boolean;
  /** Whether the current user may create a new template. */
  canCreate:       boolean;
  /** Whether the current user may delete a template. */
  canDelete:       boolean;
  /** Whether the current user may edit a Locked-control objective. */
  canEditLocked:   boolean;
  /** Whether the current user may edit an Editable-control objective. */
  canEditEditable: boolean;
  roleLabel:       string;
}

// ── Assignment-related interfaces ─────────────────────────────────────────────

interface AssignedDepartment {
  id:        string;
  name:      string;
  code:      string | null;
  branch_id: string | null;
}

interface AssignedBranch {
  id:   string;
  name: string;
  code: string | null;
}

interface AssignedCountry {
  id:   string;
  name: string;
  code: string | null;
}

interface AssignmentRule {
  designation_id:    number | null;
  department_id:     string | null;
  branch_id:         string | null;
  user_id:           string | null;
  country_id:        string | null;
  sub_department_id: string | null;
  scope:             string | null;
}

/** Full template record as returned by the API. */
interface TemplateRecord {
  id:           number;
  name:         string;
  description?: string;
  categories?:  any[];
  total_weight?: number;
  max_score?:    number;
  lastModified?: string;
  created_at?:   string;
  pms_cycle_id?: number | null;
  /**
   * Freeze status scoped to this individual template.
   * The backend sets this to "frozen" for past-cycle templates regardless
   * of the active cycle's current state.
   */
  freeze_status?:  FreezeStatus;
  /** True when the template belongs to a completed (past) PMS cycle. */
  is_past_cycle?:  boolean;
  assignedDesignations?:   string[];
  assignedDesignationIds?: number[];
  assignedDepartments?:    AssignedDepartment[];
  assignedDepartmentNames?: string[];
  assignedDepartmentsIds?: string[];
  assignedBranches?:       AssignedBranch[];
  assignedBranchIds?:      string[];
  assignedCountries?:      AssignedCountry[];
  assignedCountryIds?:     string[];
  assignedEmployees?:      string[];
  assignedEmployeeIds?:    string[];
  assignedRules?:          AssignmentRule[];
}

/** Form state used inside the EditCycleDatesModal. */
interface CycleDatesForm {
  objective_setting_end: string;
  grace_period_end:      string;
  mid_year_review:       string;
  year_end_review:       string;
}

/** Props for the EditCycleDatesModal dialog. */
interface EditCycleDatesModalProps {
  activeCycle: any;
  onClose:     () => void;
  onSaved:     (updatedCycle: any) => void;
}

/** Props accepted by the top-level TemplateDashboardBase component. */
interface TemplateDashboardBaseProps {
  level: number;
}

/** Props for each individual TemplateCard. */
interface TemplateCardProps {
  template:               TemplateRecord;
  level:                  number;
  permissions:            TemplatePermissions;
  isCategoryExpanded:     boolean;
  isAssignExpanded:       boolean;
  isDuplicating:          boolean;
  onToggleCategoryExpand: () => void;
  onToggleAssignExpand:   () => void;
  onView:                 () => void;
  onEdit:                 () => void;
  onDelete:               () => void;
  onDuplicate:            () => void;
}


// ─── Pure Utility Functions ───────────────────────────────────────────────────

/**
 * Returns the route prefix for the given admin level.
 * Falls back to DEFAULT_ROLE_PREFIX for unrecognised levels.
 */
function getRolePrefix(level: number): string {
  return ROLE_PREFIXES[level] ?? DEFAULT_ROLE_PREFIX;
}

/**
 * Sorts a list of template records in descending order of last-modification
 * date. Records without a date fall to the bottom.
 */
function sortByLastModified<T extends { lastModified?: string; created_at?: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const dateA = a.lastModified ?? a.created_at;
    const dateB = b.lastModified ?? b.created_at;
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
}

/**
 * Derives concrete Date objects from the raw active-cycle API record.
 * Uses sensible fallbacks when fields are absent so the UI never breaks.
 */
function buildFreezeDates(activeCycle: any): DynamicFreezeDates {
  const now          = new Date();
  const fallbackYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  const pmsYearStart = activeCycle?.pms_start
    ? new Date(activeCycle.pms_start)
    : new Date(fallbackYear, 3, 1);

  const objectiveSettingEnd =
    activeCycle?.objective_setting_end ?? activeCycle?.objective_end
      ? new Date(activeCycle.objective_setting_end ?? activeCycle.objective_end)
      : new Date(fallbackYear, 5, 30);

  const graceEnd =
    activeCycle?.grace_period_end ?? activeCycle?.grace_end
      ? new Date(activeCycle.grace_period_end ?? activeCycle.grace_end)
      : new Date(fallbackYear, 6, 31);

  return {
    pmsYearStart,
    objectiveSettingEnd,
    graceEnd,
    midYearReview: activeCycle?.mid_year_review ? new Date(activeCycle.mid_year_review) : null,
    yearEndReview:  activeCycle?.year_end_review  ? new Date(activeCycle.year_end_review)  : null,
  };
}

/**
 * Derives the full TemplatePermissions object for a given admin level and the
 * current freeze dates.
 *
 * Permission matrix:
 *  - HQ Admin (level 1):
 *      open  → can create, edit, delete locked+editable
 *      grace → can create, edit, delete locked+editable
 *      frozen → view only
 *  - Non-HQ Admins (levels 2-5):
 *      open  → can edit editable objectives only
 *      grace → view only
 *      frozen → view only
 */
function computePermissions(level: number, freezeDates: DynamicFreezeDates): TemplatePermissions {
  const now = new Date();

  const freezeStatus: FreezeStatus =
    now <= freezeDates.objectiveSettingEnd ? "open"  :
    now <= freezeDates.graceEnd            ? "grace" : "frozen";

  const isHqAdmin    = level === 1;
  const isNonHqAdmin = level >= 2 && level <= 5;

  // HQ Admin retains full edit/create/delete access during grace; loses all at frozen.
  const canEditLocked   = isHqAdmin && freezeStatus !== "frozen";
  const canEditEditable =
    (isHqAdmin    && freezeStatus !== "frozen") ||
    (isNonHqAdmin && freezeStatus === "open");

  const canEdit   = canEditEditable;
  const canCreate = isHqAdmin && freezeStatus !== "frozen";
  const canDelete = isHqAdmin && freezeStatus !== "frozen";

  return {
    freezeStatus,
    canEdit,
    canCreate,
    canDelete,
    canEditLocked,
    canEditEditable,
    roleLabel: ROLE_LABELS[level] ?? "Administrator",
  };
}

/**
 * Converts an ISO date string to the yyyy-mm-dd format required by
 * HTML <input type="date">. Returns an empty string for null/undefined.
 */
function toInputDate(isoString: string | null | undefined): string {
  if (!isoString) return "";
  try {
    return new Date(isoString).toISOString().split("T")[0];
  } catch {
    return "";
  }
}


// ─── EditCycleDatesModal ──────────────────────────────────────────────────────

/**
 * Modal dialog that allows HQ Admins to update key dates on the active PMS
 * cycle. Shows a warning and requires explicit acknowledgement before saving.
 */
function EditCycleDatesModal({ activeCycle, onClose, onSaved }: EditCycleDatesModalProps) {
  const [form, setForm] = useState<CycleDatesForm>({
    objective_setting_end: toInputDate(activeCycle?.objective_setting_end ?? activeCycle?.objective_end),
    grace_period_end:      toInputDate(activeCycle?.grace_period_end      ?? activeCycle?.grace_end),
    mid_year_review:       toInputDate(activeCycle?.mid_year_review),
    year_end_review:       toInputDate(activeCycle?.year_end_review),
  });

  const [isSaving,      setIsSaving]      = useState(false);
  const [acknowledged,  setAcknowledged]  = useState(false);

  // Format the PMS start date for display in the modal subtitle.
  const pmsStartDisplay = activeCycle?.pms_start
    ? new Date(activeCycle.pms_start).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
      })
    : "—";

  /**
   * Client-side validation for the date form.
   * Returns an error message string, or null when valid.
   */
  function validateForm(): string | null {
    if (!form.objective_setting_end) return "Objective Setting End date is required.";
    if (!form.grace_period_end)      return "Grace Period End date is required.";

    if (new Date(form.grace_period_end) <= new Date(form.objective_setting_end)) {
      return "Grace Period End must be after Objective Setting End.";
    }

    if (
      form.mid_year_review &&
      form.year_end_review &&
      new Date(form.year_end_review) <= new Date(form.mid_year_review)
    ) {
      return "Year-End Review must be after Mid-Year Review.";
    }

    return null;
  }

  /** Persists the updated dates to the API and refreshes the cycle record. */
  async function handleSave(): Promise<void> {
    const validationError = validateForm();
    if (validationError)  { toast.error(validationError); return; }
    if (!acknowledged)    { toast.error("Please acknowledge the impact of this change."); return; }
    if (!activeCycle?.id) { toast.error("No active PMS cycle found to update."); return; }

    setIsSaving(true);

    try {
      const payload: Record<string, string> = {
        objective_setting_end: form.objective_setting_end,
        grace_period_end:      form.grace_period_end,
      };
      if (form.mid_year_review) payload.mid_year_review = form.mid_year_review;
      if (form.year_end_review)  payload.year_end_review  = form.year_end_review;

      const updateResponse = await fetch(`${API_BASE}/pms-cycles/${activeCycle.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", "X-User-Level": "1" },
        body:    JSON.stringify(payload),
      });

      if (!updateResponse.ok) {
        const errorBody = await updateResponse.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Update failed");
      }

      // Re-fetch the active cycle so the UI reflects the new dates immediately.
      const refreshResponse = await fetch(`${API_BASE}/pms-cycles/active`);
      const refreshedCycle  = refreshResponse.ok ? await refreshResponse.json() : activeCycle;

      toast.success("PMS cycle dates updated successfully.");
      onSaved(refreshedCycle);
    } catch (error: any) {
      toast.error(error.message ?? "Could not update cycle dates.");
    } finally {
      setIsSaving(false);
    }
  }

  /** Field definitions for the date grid to keep JSX concise. */
  const DATE_FIELDS: Array<{
    field:    keyof CycleDatesForm;
    label:    string;
    required: boolean;
    hint:     string;
  }> = [
    {
      field:    "objective_setting_end",
      label:    "Objective Setting End",
      required: true,
      hint:     "Templates are open for editing until this date.",
    },
    {
      field:    "grace_period_end",
      label:    "Grace Period End (Hard Freeze)",
      required: true,
      hint:     "HQ Admin retains edit access during grace. After this, fully frozen.",
    },
    {
      field:    "mid_year_review",
      label:    "Mid-Year Review Date",
      required: false,
      hint:     "Target date for mid-cycle performance check-ins.",
    },
    {
      field:    "year_end_review",
      label:    "Year-End Review Date",
      required: false,
      hint:     "Target date for the annual appraisal / final score submission.",
    },
  ];

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-cycle-modal-title"
    >
      <div className={styles.editCycleModalCard}>

        {/* Header */}
        <div className={styles.editCycleHeader}>
          <div className={styles.editCycleHeaderLeft}>
            <div className={styles.editCycleIconWrap}>
              <Settings size={18} color="#3b82f6" />
            </div>
            <div>
              <h3 id="edit-cycle-modal-title" className={styles.editCycleTitle}>
                Edit PMS Cycle Dates
              </h3>
              <p className={styles.editCycleSubtitle}>
                PMS Year {activeCycle?.pms_year ?? "—"}&nbsp;·&nbsp;Starts {pmsStartDisplay}
              </p>
            </div>
          </div>
          <button
            className={styles.editCycleCloseBtn}
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Impact warning */}
        <div className={styles.editCycleWarning}>
          <AlertTriangle size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <p className={styles.editCycleWarningText}>
            Changing cycle dates affects <strong>all employees and managers</strong> on this PMS
            cycle. The objective-setting window, freeze state, and review deadlines will update
            immediately. Only make changes after consulting senior management.
          </p>
        </div>

        {/* Date input grid */}
        <div className={styles.editCycleDateGrid}>
          {DATE_FIELDS.map(({ field, label, required, hint }) => (
            <div key={field} className={styles.editCycleDateGroup}>
              <label className={styles.editCycleDateLabel}>
                {label}
                {required
                  ? <span style={{ color: "#ef4444" }}> *</span>
                  : <span className={styles.editCycleDateOptional}>optional</span>}
              </label>
              <input
                type="date"
                className={styles.editCycleDateInput}
                value={form[field]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))}
              />
              <p className={styles.editCycleDateHint}>{hint}</p>
            </div>
          ))}
        </div>

        {/* Acknowledgement checkbox */}
        <label className={styles.editCycleAckRow}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className={styles.editCycleAckCheckbox}
          />
          <span className={styles.editCycleAckText}>
            I understand that these changes will take effect immediately and impact all users on
            this PMS cycle.
          </span>
        </label>

        {/* Action buttons */}
        <div className={styles.editCycleActions}>
          <button className={styles.editCycleCancelBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            className={`${styles.editCycleSaveBtn} ${!acknowledged ? styles.editCycleSaveBtnDisabled : ""}`}
            onClick={handleSave}
            disabled={isSaving || !acknowledged}
          >
            {isSaving ? "Saving…" : "Save Cycle Dates"}
          </button>
        </div>

      </div>
    </div>
  );
}


// ─── PmsCycleTimeline ─────────────────────────────────────────────────────────

/**
 * Horizontal timeline that shows where the organisation currently sits within
 * the active PMS cycle. Milestones highlight the current phase.
 */
function PmsCycleTimeline({
  freezeDates,
  activeCycle,
  templateCount,
  permissions,
}: {
  freezeDates:    DynamicFreezeDates;
  activeCycle:    any;
  templateCount:  number;
  permissions:    TemplatePermissions;
}) {
  const now       = new Date();
  const yearStart = freezeDates.pmsYearStart.getTime();

  // Default year-end to 31 March of the following year when no review date is set.
  const yearEnd = freezeDates.yearEndReview?.getTime()
    ?? new Date(freezeDates.pmsYearStart.getFullYear() + 1, 2, 31).getTime();

  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((now.getTime() - yearStart) / (yearEnd - yearStart)) * 100)),
  );

  /** Identifies which milestone bucket the current date falls into. */
  const activeMilestoneKey =
    now < freezeDates.objectiveSettingEnd                                              ? "objective" :
    now < freezeDates.graceEnd                                                         ? "grace"     :
    (freezeDates.midYearReview && now < freezeDates.midYearReview)                    ? "frozen"    :
    (freezeDates.yearEndReview  && now < freezeDates.yearEndReview)                    ? "midyear"   :
    "yearend";

  const milestones = [
    {
      key:   "start",
      label: "Cycle Start",
      date:  formatDate(freezeDates.pmsYearStart),
      icon:  <Calendar size={14} />,
    },
    {
      key:   "objective",
      label: "Objective Setting Closes",
      date:  formatDate(freezeDates.objectiveSettingEnd),
      icon:  <Target size={14} />,
    },
    {
      key:   "grace",
      label: "Grace Period",
      date:  `${formatDate(freezeDates.objectiveSettingEnd)} – ${formatDate(freezeDates.graceEnd)}`,
      icon:  <Clock3 size={14} />,
    },
    {
      key:   "frozen",
      label: "Frozen",
      date:  `From ${formatDate(freezeDates.graceEnd)}`,
      icon:  <Lock size={14} />,
    },
    {
      key:   "midyear",
      label: "Mid-Year Review",
      date:  freezeDates.midYearReview ? formatDate(freezeDates.midYearReview) : "Not set",
      icon:  <BarChart3 size={14} />,
    },
    {
      key:   "yearend",
      label: "Year-End Review",
      date:  freezeDates.yearEndReview ? formatDate(freezeDates.yearEndReview) : "Not set",
      icon:  <CheckCircle2 size={14} />,
    },
  ];

  const cycleYearLabel = `${freezeDates.pmsYearStart.getFullYear()} / ${
    freezeDates.pmsYearStart.getFullYear() + 1
  }`;

  return (
    <div className={styles.timelineSection}>

      {/* Section header */}
      <div className={styles.timelineSectionHeader}>
        <div className={styles.timelineSectionTitleGroup}>
          <TrendingUp size={15} color="#3b82f6" />
          <span className={styles.timelineSectionTitle}>Templates across the PMS Cycle</span>
          <span className={styles.timelineSectionTag}>{cycleYearLabel}</span>
        </div>
        <div className={styles.timelineSectionMeta}>
          <span className={styles.timelineSectionMetaLabel}>
            {templateCount} template{templateCount !== 1 ? "s" : ""} active
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className={styles.progressBarWrap}>
        <div className={styles.progressBarTrack}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${progressPercent}%` }}
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        <span className={styles.progressBarLabel}>{progressPercent}% through cycle</span>
      </div>

      {/* Milestone grid */}
      <div className={styles.milestoneGrid}>
        {milestones.map((milestone) => (
          <div
            key={milestone.key}
            data-key={milestone.key}
            className={`${styles.milestoneBox} ${
              activeMilestoneKey === milestone.key ? styles.milestoneBoxActive : ""
            }`}
          >
            <div className={styles.milestoneBoxIcon}>{milestone.icon}</div>
            <div className={styles.milestoneBoxLabel}>{milestone.label}</div>
            <div className={styles.milestoneBoxDate}>{milestone.date}</div>
            {activeMilestoneKey === milestone.key && (
              <div className={styles.milestoneBoxNow}>Now</div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}


// ─── CycleStatusBadge ─────────────────────────────────────────────────────────

/**
 * Compact pill badge that communicates the active cycle's freeze status.
 * Rendered in the page header and on individual template cards.
 */
function CycleStatusBadge({ status }: { status: FreezeStatus | string }) {
  if (status === "open") {
    return (
      <span className={`${styles.statusPill} ${styles.statusPillOpen}`}>
        <CheckCircle2 size={13} /> Open
      </span>
    );
  }

  if (status === "grace") {
    return (
      <span className={`${styles.statusPill} ${styles.statusPillGrace}`}>
        <Clock3 size={13} /> Grace Period
      </span>
    );
  }

  return (
    <span className={`${styles.statusPill} ${styles.statusPillFrozen}`}>
      <Lock size={13} /> Frozen
    </span>
  );
}


// ─── StatusBanner ─────────────────────────────────────────────────────────────

/**
 * Full-width contextual banner rendered beneath the page header.
 * Adapts its message, colour, and icon to the current freeze status and
 * the signed-in admin's role.
 */
function StatusBanner({
  permissions,
  freezeDates,
  level,
}: {
  permissions: TemplatePermissions;
  freezeDates: DynamicFreezeDates;
  level:       number;
}) {
  const isHqAdmin     = level === 1;
  const daysRemaining = daysUntil(freezeDates.objectiveSettingEnd);

  if (permissions.freezeStatus === "frozen") {
    return (
      <div className={`${styles.banner} ${styles.bannerFrozen}`}>
        <div className={styles.bannerIconWrapper}><Lock size={18} color="#fff" /></div>
        <div>
          <div className={styles.bannerTitle}>Templates Frozen — Read Only</div>
          <div className={styles.bannerText}>
            Grace period ended <strong>{formatDate(freezeDates.graceEnd)}</strong>.
          </div>
        </div>
      </div>
    );
  }

  if (permissions.freezeStatus === "grace") {
    return (
      <div className={`${styles.banner} ${styles.bannerGrace}`}>
        <div className={styles.bannerIconWrapper}><Clock3 size={18} color="#fff" /></div>
        <div>
          <div className={styles.bannerTitle}>
            {isHqAdmin
              ? "Grace Period Active — You retain edit access"
              : "Grace Period Active — Read Only for Your Role"}
          </div>
          <div className={styles.bannerText}>
            Hard freeze on <strong>{formatDate(freezeDates.graceEnd)}</strong>{" "}
            ({daysUntil(freezeDates.graceEnd)} days remaining).
            {!isHqAdmin && " Only HQ Admin may make changes during grace."}
          </div>
        </div>
      </div>
    );
  }

  // Objective-setting period — warn when closing soon.
  if (daysRemaining <= CLOSING_WARNING_THRESHOLD_DAYS) {
    return (
      <div className={`${styles.banner} ${styles.bannerWarning}`}>
        <div className={styles.bannerIconWrapper}><Calendar size={18} color="#fff" /></div>
        <div className={styles.bannerText}>
          <strong>
            Objective-setting window closes in {daysRemaining} days
          </strong>{" "}
          ({formatDate(freezeDates.objectiveSettingEnd)}).
          {!isHqAdmin && " You can only edit Editable objectives."}
        </div>
      </div>
    );
  }

  // Standard open-period banner.
  return (
    <div className={`${styles.banner} ${styles.bannerOpen}`}>
      <div className={styles.bannerIconWrapper}><Unlock size={18} color="#3b82f6" /></div>
      <div>
        <div className={styles.bannerTitle}>
          {isHqAdmin
            ? "Objective Setting Period Active"
            : `Objective Setting Period — ${permissions.roleLabel} Edit Access`}
        </div>
        <div className={styles.bannerText}>
          Window open until{" "}
          <strong style={{ color: "#1e40af" }}>{formatDate(freezeDates.objectiveSettingEnd)}</strong>
          {" ─── "}
          <strong style={{ color: "#1eaf3d" }}>{daysRemaining} days remaining.</strong>{" "}
          {isHqAdmin
            ? "New templates are active for Objective Management"
            : "You can edit Editable objectives only"}
        </div>
      </div>
    </div>
  );
}


// ─── TemplateCard ─────────────────────────────────────────────────────────────


function TemplateCard({
  template,
  level,
  permissions,
  isCategoryExpanded,
  isAssignExpanded,
  isDuplicating,
  onToggleCategoryExpand,
  onToggleAssignExpand,
  onView,
  onEdit,
  onDelete,
  onDuplicate,
}: TemplateCardProps) {
  const categories = template.categories ?? [];
  const isHqAdmin  = level === 1;

  // ── Derive per-card freeze status ─────────────────────────────────────────
  // Past-cycle templates always arrive with freeze_status="frozen" from the API.
  const effectiveStatus: FreezeStatus = template.freeze_status ?? permissions.freezeStatus;
  const isPastCycle = template.is_past_cycle ?? false;
  const isFrozen    = effectiveStatus === "frozen";
  const isGrace     = effectiveStatus === "grace";

  // ── Objective counts ──────────────────────────────────────────────────────
  const lockedCount = categories.reduce(
    (sum: number, cat: any) =>
      sum + (cat.objectives?.filter((obj: any) => obj.control === "Locked").length ?? 0),
    0,
  );
  const totalObjectives = categories.reduce(
    (sum: number, cat: any) => sum + (cat.objectives?.length ?? 0),
    0,
  );
  const editableCount = totalObjectives - lockedCount;
  const totalRules    = template.assignedRules?.length ?? 0;

  // ── Per-button permission derivation ─────────────────────────────────────
  /**
   * Edit is allowed when:
   *  - Not a past-cycle template, AND
   *  - HQ Admin during open or grace, OR non-HQ Admin during open only.
   */
  const canEditThisCard = !isPastCycle && permissions.canEdit;

  /**
   * Delete is allowed when:
   *  - Not a past-cycle template, AND
   *  - HQ Admin during open or grace.
   */
  const canDeleteThisCard = !isPastCycle && isHqAdmin && permissions.canDelete;

  /**
   * Copy (duplicate) is available to HQ Admin whenever the cycle is not fully
   * frozen — even for past-cycle templates (creates a fresh current-cycle copy).
   */
  const canCopyThisCard = isHqAdmin && permissions.canCreate;

  // ── Disabled-state tooltip messages ──────────────────────────────────────
  /**
   * Returns the reason string to show in a toast when the edit button is
   * clicked while disabled. Returns null when editing is permitted.
   */
  function getEditDisabledReason(): string | null {
    if (!permissions.canEdit && !isHqAdmin) {
      if (isFrozen) return "Templates are fully frozen. Editing is not permitted.";
      if (isGrace)  return "Grace period is active. Only HQ Admin may edit during this period.";
    }
    if (isPastCycle) return "This template belongs to a past PMS cycle and is permanently frozen.";
    if (isFrozen)    return "Templates are fully frozen. No edits are permitted in this period.";
    return null;
  }

  /** Returns the reason string to show when the delete button is clicked while disabled. */
  function getDeleteDisabledReason(): string | null {
    if (!isHqAdmin)  return "Only HQ Admin may delete templates.";
    if (isPastCycle) return "Past-cycle templates are permanently archived and cannot be deleted.";
    if (isFrozen)    return "Templates are fully frozen. Deletion is not permitted in this period.";
    return null;
  }

  /** Returns the reason string to show when the copy button is clicked while disabled. */
  function getCopyDisabledReason(): string | null {
    if (!isHqAdmin) return "Only HQ Admin may duplicate templates.";
    if (isFrozen)   return "Templates are fully frozen. Duplication is not permitted in this period.";
    return null;
  }

  // ── Click handlers with disabled guard ───────────────────────────────────

  /** Fires the edit callback or shows the disabled toast. */
  function handleEditClick(): void {
    const reason = getEditDisabledReason();
    if (reason) { toast.error(reason); return; }
    onEdit();
  }

  /** Fires the delete callback or shows the disabled toast. */
  function handleDeleteClick(): void {
    const reason = getDeleteDisabledReason();
    if (reason) { toast.error(reason); return; }
    onDelete();
  }

  /** Fires the duplicate callback or shows the disabled toast. */
  function handleCopyClick(): void {
    const reason = getCopyDisabledReason();
    if (reason) { toast.error(reason); return; }
    onDuplicate();
  }

  // ── Derived display values ────────────────────────────────────────────────

  const lastUpdatedDisplay = new Date(
    template.lastModified ?? template.created_at ?? Date.now(),
  ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  /** Compact summary of all assignment rules for the collapsed assignment row. */
  const assignmentSummary = useMemo((): string => {
    const parts: string[] = [];

    if (template.assignedEmployees?.length)    parts.push(`${template.assignedEmployees.length} direct`);
    if (template.assignedDesignations?.length) {
      const count = template.assignedDesignations.length;
      parts.push(`${count} designation${count !== 1 ? "s" : ""}`);
    }
    if (template.assignedDepartments?.length) {
      const uniqueDeptNames = new Set(
        template.assignedDepartments.map((d) => d.name.trim().toLowerCase()),
      );
      parts.push(`${uniqueDeptNames.size} dept type${uniqueDeptNames.size !== 1 ? "s" : ""}`);
    }
    if (template.assignedCountries?.length) {
      const count = template.assignedCountries.length;
      parts.push(`${count} countr${count !== 1 ? "ies" : "y"}`);
    }
    if (template.assignedBranches?.length) {
      const count = template.assignedBranches.length;
      parts.push(`${count} branch${count !== 1 ? "es" : ""}`);
    }

    return parts.length ? parts.join(" · ") : "Unassigned";
  }, [template]);

  const scopeRules    = template.assignedRules?.filter((rule) => rule.scope) ?? [];
  const hasScopeRules = scopeRules.length > 0;

  // ── Stat cells definition ────────────────────────────────────────────────

  const statCells = [
    { label: "Categories",       value: categories.length },
    { label: "Total KPIs",       value: totalObjectives  },
    { label: "Locked",           value: lockedCount      },
    { label: "Editable",         value: editableCount    },
    { label: "Assignment Rules", value: totalRules       },
  ];

  return (
    <div
      className={styles.card}
      style={isPastCycle ? { opacity: 0.85, borderLeft: "3px solid #94a3b8" } : undefined}
    >

      {/* Past-cycle indicator strip */}
      {isPastCycle && (
        <div style={{
          display:       "flex",
          alignItems:    "center",
          gap:           6,
          padding:       "6px 14px",
          background:    "#f8fafc",
          borderBottom:  "1px solid #e2e8f0",
          fontSize:      "11px",
          color:         "#64748b",
          fontWeight:    600,
        }}>
          <History size={12} color="#94a3b8" />
          Past PMS Cycle — Permanently Frozen (Read Only)
        </div>
      )}

      {/* ── Card top row: title + action buttons ── */}
      <div className={styles.cardTop}>
        <div className={styles.cardTopInner}>

          {/* Left: icon + title + description */}
          <div className={styles.cardLeft}>
            <div className={styles.cardIconWrapper}>
              <FileText size={22} color={isPastCycle ? "#94a3b8" : "#3b82f6"} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.cardTitleRow}>
                <h3
                  className={styles.cardTitle}
                  style={isPastCycle ? { color: "#64748b" } : undefined}
                >
                  {template.name}
                </h3>
                {/* Per-card status badge — may differ from global when past-cycle */}
                <CycleStatusBadge status={effectiveStatus} />
              </div>
              <p className={styles.cardDescription}>
                {template.description || "Standard organisational evaluation template."}
              </p>

              {/* Editable-objective hint for non-HQ admins during open period */}
              {!isHqAdmin && effectiveStatus === "open" && editableCount > 0 && (
                <p style={{
                  fontSize:   "11px",
                  color:      "#7c3aed",
                  fontWeight: "600",
                  marginTop:  "4px",
                }}>
                  <Unlock size={10} style={{ display: "inline", marginRight: "3px" }} />
                  {editableCount} editable objective{editableCount !== 1 ? "s" : ""} accessible to you
                </p>
              )}
            </div>
          </div>

          {/* Right: action buttons (always visible; disabled state communicated via style + toast) */}
          <div className={styles.cardActions}>

            {/* View — available to all roles in all periods */}
            <button className={styles.actionBtn} onClick={onView}>
              <Eye size={13} /><span>View</span>
            </button>

            {/*
              Edit — visible for ALL templates (including past-cycle) so the
              disabled state is communicated by styling + toast, not by hiding.
              Reason: assessors need to know the button exists even if they cannot use it.
            */}
            <button
              className={`${styles.actionBtn} ${!canEditThisCard ? styles.actionBtnDisabled : ""}`}
              onClick={handleEditClick}
              aria-disabled={!canEditThisCard}
              title={!canEditThisCard ? (getEditDisabledReason() ?? undefined) : "Edit template"}
            >
              <Pencil size={13} /><span>Edit</span>
            </button>

            {/*
              Copy (Duplicate) — visible for HQ Admin only.
              Disabled when the cycle is fully frozen (grace is still permitted).
            */}
            {isHqAdmin && (
              <button
                className={`${styles.actionBtn} ${!canCopyThisCard ? styles.actionBtnDisabled : ""}`}
                onClick={handleCopyClick}
                disabled={isDuplicating}
                aria-disabled={!canCopyThisCard}
                title={
                  isPastCycle
                    ? "Duplicate into current cycle"
                    : !canCopyThisCard
                    ? (getCopyDisabledReason() ?? undefined)
                    : "Duplicate template"
                }
              >
                {isDuplicating
                  ? <Loader2 size={13} className={styles.spinner} />
                  : <Copy size={13} />}
                <span>Copy</span>
              </button>
            )}

            {/*
              Delete — visible for HQ Admin only.
              Disabled for past-cycle templates and during the frozen period.
            */}
            {isHqAdmin && (
              <button
                className={`${styles.actionBtnDanger} ${!canDeleteThisCard ? styles.actionBtnDangerDisabled : ""}`}
                onClick={handleDeleteClick}
                aria-disabled={!canDeleteThisCard}
                title={!canDeleteThisCard ? (getDeleteDisabledReason() ?? undefined) : "Delete template"}
              >
                <Trash2 size={13} />
              </button>
            )}

          </div>
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        {statCells.map((stat, index) => (
          <div
            key={stat.label}
            className={styles.statCell}
            style={{ borderRight: index < statCells.length - 1 ? "1px solid #f1f5f9" : "none" }}
          >
            <div className={styles.statValue}>{stat.value}</div>
            <div className={styles.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Meta row ── */}
      <div className={styles.cardMeta}>
        <div className={styles.cardMetaLeft}>
          <BookOpen size={12} color="#8b5cf6" />
          <span className={styles.cardMetaLabel}>AI Suggested Insights</span>
          <Award size={12} color="#d97706" />
          <span className={styles.cardMetaLabel}>Training Recommendations</span>
          <Target size={12} color="#3b82f6" />
          <span className={styles.cardMetaLabel}>Smart Analysis Enabled</span>
        </div>
        <span className={styles.cardMetaTimestamp}>Updated: {lastUpdatedDisplay}</span>
      </div>

      {/* ── Category expand/collapse ── */}
      <button className={styles.expandToggle} onClick={onToggleCategoryExpand}>
        <Layers size={14} color="#3b82f6" />
        <span>{isCategoryExpanded ? "Hide" : "Show"} Category Details</span>
        {isCategoryExpanded
          ? <ChevronUp   size={14} color="#3b82f6" />
          : <ChevronDown size={14} color="#3b82f6" />}
      </button>

      {isCategoryExpanded && (
        <div className={styles.expandedSection}>
          <div className={styles.expandedSectionHeading}>
            <Layers size={13} color="#64748b" />
            <span>Performance Categories</span>
          </div>
          <div className={styles.categoryGrid}>
            {categories.length === 0 ? (
              <p className={styles.categoryEmptyNote}>No categories defined.</p>
            ) : (
              categories.map((cat: any, index: number) => {
                const palette   = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
                const catWeight = cat.weight ??
                  (cat.objectives ?? []).reduce(
                    (sum: number, obj: any) => sum + (Number(obj.weight) || 0),
                    0,
                  );
                const lockedInCat = (cat.objectives ?? []).filter(
                  (obj: any) => obj.control === "Locked",
                ).length;

                return (
                  <div
                    key={index}
                    className={styles.categoryDetailCard}
                    style={{ background: palette.bg, borderColor: `${palette.fill}33` }}
                  >
                    <div className={styles.categoryDetailHeader}>
                      <span style={{ fontWeight: 700, fontSize: "12px", color: palette.text }}>
                        {cat.name}
                      </span>
                      <span style={{ fontWeight: 800, fontSize: "13px", color: palette.fill }}>
                        {catWeight}%
                      </span>
                    </div>
                    <div className={styles.categoryDetailBar}>
                      <div style={{
                        height:       "100%",
                        width:        `${catWeight}%`,
                        background:   palette.fill,
                        borderRadius: "3px",
                      }} />
                    </div>
                    <div className={styles.categoryDetailStats}>
                      <span><strong>{(cat.objectives ?? []).length}</strong> KPIs</span>
                      <span><strong>{lockedInCat}</strong> Locked</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ── Assignment expand/collapse ── */}
      <button className={styles.expandToggle} onClick={onToggleAssignExpand}>
        <Users size={14} color="#3b82f6" />
        <span>{isAssignExpanded ? "Hide" : "Show"} Assignments</span>
        {!isAssignExpanded && totalRules > 0 && (
          <span style={{
            marginLeft:   "auto",
            fontSize:     "11px",
            fontWeight:   "600",
            color:        "#64748b",
            background:   "#f1f5f9",
            padding:      "2px 8px",
            borderRadius: "10px",
          }}>
            {assignmentSummary}
          </span>
        )}
        {isAssignExpanded
          ? <ChevronUp   size={14} color="#3b82f6" />
          : <ChevronDown size={14} color="#3b82f6" />}
      </button>

      {isAssignExpanded && (
        <div className={styles.expandedSection}>
          {totalRules === 0 ? (
            <p style={{ fontSize: "13px", color: "#94a3b8", padding: "8px 0" }}>
              No assignments set.
            </p>
          ) : (
            <div className={styles.rolesDeptsSection}>

              {/* Global scope assignments */}
              {hasScopeRules && (
                <div className={styles.rolesDeptsGroup}>
                  <div className={styles.rolesDeptsLabel}>
                    <Globe size={13} color="#0891b2" /><span>Global Assignments</span>
                  </div>
                  <div className={styles.rolesDeptsChips}>
                    {scopeRules.map((rule, index) => (
                      <span
                        key={index}
                        style={{
                          display:      "inline-flex",
                          alignItems:   "center",
                          gap:          "4px",
                          padding:      "3px 10px",
                          borderRadius: "20px",
                          fontSize:     "11px",
                          fontWeight:   "700",
                          background:   "#ecfeff",
                          color:        "#0891b2",
                          border:       "1px solid #a5f3fc",
                        }}
                      >
                        {SCOPE_LABELS[rule.scope!] ?? rule.scope}
                        {rule.country_id && (
                          <span style={{ fontSize: "10px", opacity: 0.7 }}>· specific country</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct employee assignments */}
              {(template.assignedEmployees?.length ?? 0) > 0 && (
                <div className={styles.rolesDeptsGroup}>
                  <div className={styles.rolesDeptsLabel}>
                    <UserCheck size={13} color="#1e40af" /><span>Direct Employees</span>
                  </div>
                  <div className={styles.rolesDeptsChips}>
                    {template.assignedEmployees!.map((employee) => (
                      <span
                        key={employee}
                        style={{
                          padding:      "3px 10px",
                          borderRadius: "20px",
                          fontSize:     "11px",
                          fontWeight:   "700",
                          background:   "#eff6ff",
                          color:        "#1e40af",
                          border:       "1px solid #bfdbfe",
                        }}
                      >
                        {employee}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Designation assignments */}
              {(template.assignedDesignations?.length ?? 0) > 0 && (
                <div className={styles.rolesDeptsGroup}>
                  <div className={styles.rolesDeptsLabel}>
                    <Users size={13} color="#3b82f6" /><span>Designations</span>
                  </div>
                  <div className={styles.rolesDeptsChips}>
                    {template.assignedDesignations!.map((designation) => (
                      <span key={designation} className={styles.rolesChip}>
                        {designation}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Country assignments */}
              {(template.assignedCountries?.length ?? 0) > 0 && (
                <div className={styles.rolesDeptsGroup}>
                  <div className={styles.rolesDeptsLabel}>
                    <Globe size={13} color="#0891b2" /><span>Countries</span>
                  </div>
                  <div className={styles.rolesDeptsChips}>
                    {template.assignedCountries!.map((country) => (
                      <span
                        key={country.id}
                        style={{
                          padding:      "3px 10px",
                          borderRadius: "20px",
                          fontSize:     "11px",
                          fontWeight:   "700",
                          background:   "#ecfeff",
                          color:        "#0891b2",
                          border:       "1px solid #a5f3fc",
                        }}
                      >
                        {country.code ?? country.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Department assignments — grouped by department name */}
              {(template.assignedDepartments?.length ?? 0) > 0 && (() => {
                // De-duplicate departments by normalised name, counting branch occurrences.
                const groupedDepts = new Map<string, { name: string; code: string | null; branchCount: number }>();
                template.assignedDepartments!.forEach((dept) => {
                  const key = dept.name.trim().toLowerCase();
                  if (!groupedDepts.has(key)) {
                    groupedDepts.set(key, { name: dept.name, code: dept.code, branchCount: 0 });
                  }
                  if (dept.branch_id) groupedDepts.get(key)!.branchCount++;
                });

                return (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}>
                      <Building2 size={13} color="#8b5cf6" /><span>Departments</span>
                    </div>
                    <div className={styles.rolesDeptsChips}>
                      {[...groupedDepts.values()].map((dept) => (
                        <span
                          key={dept.name}
                          className={styles.deptsChip}
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                        >
                          {dept.code ? `[${dept.code}] ` : ""}{dept.name}
                          {dept.branchCount > 0 && (
                            <span style={{
                              fontSize:     "10px",
                              fontWeight:   "700",
                              background:   "#ddd6fe",
                              color:        "#5b21b6",
                              padding:      "1px 6px",
                              borderRadius: "10px",
                            }}>
                              {dept.branchCount} branch{dept.branchCount !== 1 ? "es" : ""}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Branch assignments */}
              {(template.assignedBranches?.length ?? 0) > 0 && (
                <div className={styles.rolesDeptsGroup}>
                  <div className={styles.rolesDeptsLabel}>
                    <GitBranch size={13} color="#7c3aed" /><span>Branches</span>
                  </div>
                  <div className={styles.rolesDeptsChips}>
                    {template.assignedBranches!.map((branch) => (
                      <span
                        key={branch.id}
                        style={{
                          padding:      "3px 10px",
                          borderRadius: "20px",
                          fontSize:     "11px",
                          fontWeight:   "700",
                          background:   "#f5f3ff",
                          color:        "#5b21b6",
                          border:       "1px solid #ddd6fe",
                        }}
                      >
                        {branch.code ?? branch.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ─── TemplateDashboardBase (Main Component) ───────────────────────────────────

/**
 * Root dashboard component for Template Management.
 * Renders the page header, PMS cycle timeline, search bar, and the list of
 * template cards. Shared across all admin levels — behaviour is gated by the
 * `level` prop which drives permission computation.
 */
export default function TemplateDashboardBase({ level }: TemplateDashboardBaseProps) {
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────
  const [templates,       setTemplates]       = useState<TemplateRecord[]>([]);
  const [searchQuery,     setSearchQuery]      = useState("");
  const [confirmDeleteId, setConfirmDeleteId]  = useState<number | null>(null);
  const [isLoading,       setIsLoading]        = useState(true);
  const [expandedCardId,  setExpandedCardId]   = useState<number | null>(null);
  const [expandedAssignId, setExpandedAssignId] = useState<number | null>(null);
  const [isDuplicating,   setIsDuplicating]    = useState<number | null>(null);
  const [activeCycle,     setActiveCycle]      = useState<any>(null);
  const [showEditCycle,   setShowEditCycle]    = useState(false);

  // ── Derived values ────────────────────────────────────────────────────────
  const freezeDates  = useMemo(() => buildFreezeDates(activeCycle),           [activeCycle]);
  const permissions  = useMemo(() => computePermissions(level, freezeDates), [level, freezeDates]);
  const rolePrefix   = getRolePrefix(level);

  /** Template pending deletion — needed so the modal can check isPastCycle. */
  const confirmDeleteTemplate = useMemo(
    () => templates.find((t) => t.id === confirmDeleteId) ?? null,
    [templates, confirmDeleteId],
  );

  const periodWrapperClass =
    permissions.freezeStatus === "frozen" ? styles.periodFrozen :
    permissions.freezeStatus === "grace"  ? styles.periodGrace  : styles.periodOpen;

  // ── Data loading ──────────────────────────────────────────────────────────

  /** Fetches templates and the active PMS cycle in parallel on mount. */
  useEffect(() => {
    async function loadDashboardData(): Promise<void> {
      try {
        setIsLoading(true);
        const [templatesResponse, cycleResponse] = await Promise.all([
          fetch(`${API_BASE}/templates`),
          fetch(`${API_BASE}/pms-cycles/active`),
        ]);

        if (!templatesResponse.ok) {
          throw new Error(`Failed to load templates: ${templatesResponse.status}`);
        }

        const rawTemplates: TemplateRecord[] = await templatesResponse.json();
        setTemplates(sortByLastModified(rawTemplates));

        if (cycleResponse.ok) {
          setActiveCycle(await cycleResponse.json());
        }
      } catch {
        toast.error("Could not load templates. Please refresh and try again.");
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  // ── Filtered template list ────────────────────────────────────────────────

  const filteredTemplates = useMemo(
    () =>
      sortByLastModified(
        templates.filter((t) =>
          t.name?.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
      ),
    [templates, searchQuery],
  );

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Optimistically updates a template's lastModified timestamp so it bubbles
   * to the top of the list after an edit action.
   */
  function bumpTemplateToTop(id: number): void {
    setTemplates((prev) =>
      sortByLastModified(
        prev.map((t) =>
          t.id === id ? { ...t, lastModified: new Date().toISOString() } : t,
        ),
      ),
    );
  }

  // ── Action handlers ───────────────────────────────────────────────────────

  /** Navigates to the view-mode template editor. Always available. */
  function handleViewTemplate(id: number): void {
    router.push(`${rolePrefix}/template-management/create-assign-template?edit=${id}&mode=view`);
  }

  /**
   * Navigates to the edit-mode template editor.
   * Shows a toast and returns early when editing is not permitted.
   */
  function handleEditTemplate(id: number, template: TemplateRecord): void {
    const effectiveStatus = template.freeze_status ?? permissions.freezeStatus;

    if (template.is_past_cycle) {
      toast.error("This template is from a past PMS cycle and is permanently frozen.");
      return;
    }

    if (effectiveStatus === "frozen") {
      toast.error("Templates are fully frozen. No edits are permitted in this period.");
      return;
    }

    if (!permissions.canEdit) {
      toast.error(
        effectiveStatus === "grace"
          ? "Grace period is active. Only HQ Admin may edit during this period."
          : "You do not have permission to edit templates.",
      );
      return;
    }

    bumpTemplateToTop(id);
    router.push(`${rolePrefix}/template-management/create-assign-template?edit=${id}`);
  }

  /**
   * Creates a duplicate of the selected template in the current PMS cycle.
   * Restricted to HQ Admin during non-frozen periods.
   */
  async function handleDuplicateTemplate(template: TemplateRecord): Promise<void> {
    if (!permissions.canCreate) {
      toast.error("Templates are frozen — duplication is not permitted in this period.");
      return;
    }

    const previousTemplates = [...templates];
    setIsDuplicating(template.id);

    try {
      const createResponse = await fetch(`${API_BASE}/templates`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:          `${template.name} (Copy)`,
          description:   template.description ?? "",
          max_score:     template.max_score ?? 5,
          categories:    template.categories ?? [],
          totalWeight:   template.total_weight ?? 0,
          lastModified:  new Date().toISOString(),
        }),
      });

      if (!createResponse.ok) throw new Error("Duplicate failed");

      // Re-fetch to get the server-assigned ID and any defaults.
      const refreshResponse = await fetch(`${API_BASE}/templates`);
      if (refreshResponse.ok) {
        setTemplates(sortByLastModified(await refreshResponse.json()));
      }

      toast.success(`"${template.name}" duplicated into the current cycle.`);
    } catch (error: any) {
      setTemplates(previousTemplates);
      toast.error(error.message ?? "Could not duplicate template.");
    } finally {
      setIsDuplicating(null);
    }
  }

  /**
   * Deletes the specified template after the confirmation modal is accepted.
   * Past-cycle templates and the frozen period block deletion.
   */
  async function handleDeleteTemplate(id: number, template: TemplateRecord): Promise<void> {
    if (template.is_past_cycle) {
      toast.error("Past-cycle templates are permanently archived and cannot be deleted.");
      setConfirmDeleteId(null);
      return;
    }

    if (!permissions.canDelete) {
      toast.error("Deletion is not permitted in this period.");
      setConfirmDeleteId(null);
      return;
    }

    // Optimistic removal.
    const previousTemplates = [...templates];
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setConfirmDeleteId(null);

    try {
      const deleteResponse = await fetch(`${API_BASE}/templates/${id}`, { method: "DELETE" });
      if (!deleteResponse.ok) {
        const errorBody = await deleteResponse.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Delete failed");
      }
      toast.success("Template deleted.");
    } catch (error: any) {
      // Rollback on failure.
      setTemplates(previousTemplates);
      toast.error(error.message ?? "Could not delete template.");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrapper}>

      {/* ── Delete confirmation modal ── */}
      {confirmDeleteId !== null && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            <div className={styles.modalIconWrapper}>
              <Trash2 size={22} color="#ef4444" />
            </div>
            <h3 className={styles.modalTitle}>Delete Template?</h3>

            {confirmDeleteTemplate?.is_past_cycle ? (
              <p className={styles.modalText}>
                This template belongs to a past PMS cycle and{" "}
                <strong>cannot be deleted</strong>. Past-cycle templates are permanently
                frozen for audit purposes.
              </p>
            ) : (
              <p className={styles.modalText}>
                This action cannot be undone. All assignments will also be removed.
              </p>
            )}

            <div className={styles.modalActions}>
              <button
                className={styles.modalCancelBtn}
                onClick={() => setConfirmDeleteId(null)}
              >
                {confirmDeleteTemplate?.is_past_cycle ? "Close" : "Cancel"}
              </button>

              {/* Only show the Delete button for non-past-cycle templates */}
              {!confirmDeleteTemplate?.is_past_cycle && (
                <button
                  className={styles.modalDeleteBtn}
                  onClick={() =>
                    confirmDeleteTemplate &&
                    handleDeleteTemplate(confirmDeleteId, confirmDeleteTemplate)
                  }
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Cycle Dates modal ── */}
      {showEditCycle && activeCycle && (
        <EditCycleDatesModal
          activeCycle={activeCycle}
          onClose={() => setShowEditCycle(false)}
          onSaved={(updatedCycle) => {
            setActiveCycle(updatedCycle);
            setShowEditCycle(false);
          }}
        />
      )}

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Template Management</h1>
          <p className={styles.pageSubtitleMain}>
            Manage and deploy evaluation structures across your organisation
          </p>
          <p className={styles.pageSubtitle}>
            <span className={styles.rolePill}>{permissions.roleLabel}</span>
            {permissions.freezeStatus === "open" ? (
              <span className={styles.subtitleNote}>
                Objective window closes{" "}
                <strong>{formatDate(freezeDates.objectiveSettingEnd)}</strong>
              </span>
            ) : permissions.freezeStatus === "grace" ? (
              <span className={styles.subtitleNoteAmber}>
                Grace period until <strong>{formatDate(freezeDates.graceEnd)}</strong>
              </span>
            ) : (
              <span className={styles.subtitleNoteFrozen}>Templates frozen — read only</span>
            )}
          </p>
        </div>

        <div className={styles.headerActions}>
          <CycleStatusBadge status={permissions.freezeStatus} />

          {/* Edit Cycle Dates — HQ Admin only, requires an active cycle */}
          {level === 1 && activeCycle?.id && (
            <button
              className={styles.editCycleDatesBtn}
              onClick={() => setShowEditCycle(true)}
            >
              <Calendar size={13} /> Edit Cycle Dates
            </button>
          )}

          {/* Create New Template — HQ Admin only during open/grace */}
          {permissions.canCreate && (
            <button
              className={styles.createBtn}
              onClick={() =>
                router.push(`${rolePrefix}/template-management/create-assign-template`)
              }
            >
              + Create New Template
            </button>
          )}
        </div>
      </div>

      {/* ── Freeze-status banner ── */}
      <StatusBanner permissions={permissions} freezeDates={freezeDates} level={level} />

      {/* ── PMS cycle timeline ── */}
      {!isLoading && (
        <PmsCycleTimeline
          freezeDates={freezeDates}
          activeCycle={activeCycle}
          templateCount={templates.filter((t) => !t.is_past_cycle).length}
          permissions={permissions}
        />
      )}

      {/* ── Search bar ── */}
      <div className={styles.searchCard}>
        <div className={styles.searchWrapper}>
          <Search size={17} color="#94a3b8" />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search templates by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles.searchClear}
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
          {!isLoading && (
            <span className={styles.searchCount}>
              {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
              {filteredTemplates.some((t) => t.is_past_cycle) && (
                <span style={{ marginLeft: 6, fontSize: "10px", color: "#94a3b8" }}>
                  (incl. past cycles)
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Template list ── */}
      <div className={`${styles.periodWrapper} ${periodWrapperClass}`}>
        {isLoading ? (
          <div className={styles.loadingWrapper}>
            <Loader2 size={36} color="#3b82f6" className={styles.spinner} />
            <p className={styles.loadingText}>Loading templates…</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className={styles.emptyState}>
            <Inbox size={48} color="#cbd5e1" style={{ margin: "0 auto 16px" }} />
            <h3 className={styles.emptyTitle}>
              {searchQuery ? "No Results Found" : "No Templates Yet"}
            </h3>
            <p className={styles.emptyText}>
              {searchQuery
                ? `No templates match "${searchQuery}".`
                : "Click \"Create New Template\" to get started."}
            </p>
          </div>
        ) : (
          <div className={styles.cardList}>
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                level={level}
                permissions={permissions}
                isCategoryExpanded={expandedCardId   === template.id}
                isAssignExpanded={expandedAssignId   === template.id}
                isDuplicating={isDuplicating         === template.id}
                onToggleCategoryExpand={() =>
                  setExpandedCardId((prev) => (prev === template.id ? null : template.id))
                }
                onToggleAssignExpand={() =>
                  setExpandedAssignId((prev) => (prev === template.id ? null : template.id))
                }
                onView={()      => handleViewTemplate(template.id)}
                onEdit={()      => handleEditTemplate(template.id, template)}
                onDelete={()    => setConfirmDeleteId(template.id)}
                onDuplicate={()  => handleDuplicateTemplate(template)}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
