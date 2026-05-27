/**
 * CycleDatesPage.tsx
 
 * @module CycleDatesPage
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams }    from "next/navigation";
import {
  AlertTriangle, ArrowLeft,    BarChart3,
  Calendar,      CheckCircle2, Clock3,
  Flag,          Info,         Loader2,
  Lock,          Settings,     Star,
  Target,
} from "lucide-react";
import { toast } from "sonner";
import Sidebar    from "@/components/sidebar/Sidebar";
import Breadcrumb from "@/components/breadcrumb/Breadcrumb";
import styles    from "./CycleDatesPage.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Base URL for all API requests; falls back to local dev server. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

/** Dashboard path to return to after saving or cancelling. */
const TEMPLATE_DASHBOARD_PATH = "/hq-admin/template-management";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Form field values bound to the four date inputs. */
interface CycleDatesForm {
  objective_setting_end: string;
  grace_period_end:      string;
  mid_year_review:       string;
  year_end_review:       string;
}

/**
 * Static configuration for a single date field.
 * Drives label, hint, required marker, and leading icon.
 */
interface DateFieldConfig {
  field:    keyof CycleDatesForm;
  label:    string;
  required: boolean;
  hint:     string;
  icon:     React.ReactNode;
}

// ─── Field Configuration ──────────────────────────────────────────────────────

/**
 * Static config for all four editable milestone date fields.
 * Defined at module level to avoid re-creation on every render.
 */
const DATE_FIELD_CONFIG: DateFieldConfig[] = [
  {
    field:    "objective_setting_end",
    label:    "Objective Setting End",
    required: true,
    hint:     "Templates remain open for editing until this date.",
    icon:     <Target   size={16} />,
  },
  {
    field:    "grace_period_end",
    label:    "Grace Period End (Hard Freeze)",
    required: true,
    hint:     "HQ Admin retains edit access during grace. After this date, templates are fully frozen.",
    icon:     <Clock3   size={16} />,
  },
  {
    field:    "mid_year_review",
    label:    "Mid-Year Review Date",
    required: false,
    hint:     "Target date for mid-cycle performance check-ins.",
    icon:     <BarChart3 size={16} />,
  },
  {
    field:    "year_end_review",
    label:    "Year-End Review Date",
    required: false,
    hint:     "Target date for the annual appraisal and final score submission.",
    icon:     <Star     size={16} />,
  },
];

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Converts an ISO date string (or null/undefined) to the YYYY-MM-DD
 * format required by <input type="date">.
 */
function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

/**
 * Formats an ISO date string into a human-readable display string.
 * Returns "—" for null / undefined / invalid input.
 */
function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day:   "numeric",
      month: "long",
      year:  "numeric",
    });
  } catch {
    return "—";
  }
}

/**
 * Attempts to fetch a PMS cycle.
 *
 * Strategy (handles backends that may not implement /pms-cycles/:id):
 *  1. If cycleId is provided, try  GET /pms-cycles/:id  first.
 *  2. On any failure (404, network error, etc.) fall back to
 *     GET /pms-cycles/active so the page always has data to show.
 */
async function fetchPmsCycle(cycleId: string | null): Promise<any> {
  /* ── Attempt 1: specific cycle by ID ── */
  if (cycleId) {
    try {
      const res = await fetch(`${API_BASE}/pms-cycles/${cycleId}`);
      if (res.ok) return await res.json();
      /* Log the failure but don't throw — fall through to active */
      console.warn(
        `[CycleDatesPage] /pms-cycles/${cycleId} returned ${res.status}. ` +
        "Falling back to /pms-cycles/active.",
      );
    } catch (err) {
      console.warn(
        `[CycleDatesPage] /pms-cycles/${cycleId} fetch error:`, err,
        "Falling back to /pms-cycles/active.",
      );
    }
  }

  /* ── Attempt 2: active cycle fallback ── */
  const activeRes = await fetch(`${API_BASE}/pms-cycles/active`);
  if (!activeRes.ok) {
    throw new Error(
      `Both /pms-cycles/${cycleId} and /pms-cycles/active failed. ` +
      `Active endpoint returned ${activeRes.status}.`,
    );
  }
  return activeRes.json();
}

// ─── CycleInfoCard ────────────────────────────────────────────────────────────

/**
 * Read-only summary card at the top of the page.
 * Shows PMS year, cycle start date, and HQ-Admin-only badge.
 */
function CycleInfoCard({ activeCycle }: { activeCycle: any }) {
  const pmsYear   = activeCycle?.pms_year ?? "—";
  const startDate = formatDisplayDate(activeCycle?.pms_start);

  return (
    <div className={styles.infoCard}>
      <div className={styles.infoCardIcon}>
        <Flag size={20} color="#6366f1" />
      </div>
      <div className={styles.infoCardBody}>
        <div className={styles.infoCardTitle}>PMS Year {pmsYear}</div>
        <div className={styles.infoCardMeta}>
          Cycle starts <strong>{startDate}</strong>
          <span className={styles.infoCardDot} />
          <span className={styles.infoCardBadge}>
            <Lock size={11} />
            HQ Admin Only
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── WarningBox ───────────────────────────────────────────────────────────────

/**
 * Amber warning panel reminding the admin that date changes
 * have immediate, system-wide effects on all users.
 */
function WarningBox() {
  return (
    <div className={styles.warningBox}>
      <AlertTriangle
        size={16}
        color="#d97706"
        style={{ flexShrink: 0, marginTop: 1 }}
      />
      <div>
        <p className={styles.warningTitle}>
          Important — Changing these dates has immediate system-wide effects
        </p>
        <p className={styles.warningText}>
          All employees and managers on this PMS cycle will be affected.
          Objective-setting windows, freeze states, and notification schedules
          recalculate instantly. Only proceed after consulting senior management.
        </p>
      </div>
    </div>
  );
}

// ─── DateField ────────────────────────────────────────────────────────────────

/**
 * Single labelled date input with a leading icon, required/optional
 * marker, and a descriptive hint below.
 */
function DateField({
  config,
  value,
  onChange,
}: {
  config:   DateFieldConfig;
  value:    string;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.dateGroup}>
      <label className={styles.dateLabel}>
        <span className={styles.dateLabelIcon}>{config.icon}</span>
        {config.label}
        {config.required
          ? (
            <span className={styles.dateLabelRequired} aria-label="required">
              *
            </span>
          )
          : (
            <span className={styles.dateLabelOptional}>optional</span>
          )}
      </label>

      <input
        type="date"
        className={styles.dateInput}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={config.label}
        aria-required={config.required}
      />

      <p className={styles.dateHint}>
        <Info size={11} style={{ flexShrink: 0, marginTop: 1 }} />
        {config.hint}
      </p>
    </div>
  );
}

// ─── CycleDatesInner ──────────────────────────────────────────────────────────

/**
 * Inner component that uses useSearchParams().
 * Must be wrapped in <Suspense> by the parent (Next.js App Router requirement).
 */
function CycleDatesInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const cycleId      = searchParams.get("cycleId");

  /* ── State ── */
  const [activeCycle,    setActiveCycle]    = useState<any>(null);
  const [isLoadingCycle, setIsLoadingCycle] = useState(true);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [form,           setForm]           = useState<CycleDatesForm>({
    objective_setting_end: "",
    grace_period_end:      "",
    mid_year_review:       "",
    year_end_review:       "",
  });

  // ── Fetch cycle on mount ──────────────────────────────────────────────────

  useEffect(() => {
    async function loadCycle(): Promise<void> {
      setIsLoadingCycle(true);
      try {
        const data = await fetchPmsCycle(cycleId);
        setActiveCycle(data);

        /*
         * Pre-populate the form.
         * Handle both field name variants returned by the API:
         *   objective_setting_end  OR  objective_end
         *   grace_period_end       OR  grace_end
         */
        setForm({
          objective_setting_end: toInputDate(
            data.objective_setting_end ?? data.objective_end,
          ),
          grace_period_end: toInputDate(
            data.grace_period_end ?? data.grace_end,
          ),
          mid_year_review: toInputDate(data.mid_year_review),
          year_end_review: toInputDate(data.year_end_review),
        });
      } catch (err: any) {
        /* Log full error for developer visibility */
        console.error("[CycleDatesPage] Failed to load cycle:", err);
        toast.error(
          "Could not load PMS cycle. Check the console for details.",
        );
      } finally {
        setIsLoadingCycle(false);
      }
    }

    loadCycle();
  }, [cycleId]);

  // ── Validation ────────────────────────────────────────────────────────────

  /** Returns a validation error string, or null if the form is valid. */
  function validateForm(): string | null {
    if (!form.objective_setting_end) {
      return "Objective Setting End date is required.";
    }
    if (!form.grace_period_end) {
      return "Grace Period End date is required.";
    }
    if (
      new Date(form.grace_period_end) <=
      new Date(form.objective_setting_end)
    ) {
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

  // ── Save handler ──────────────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    const validationError = validateForm();
    if (validationError) { toast.error(validationError); return; }
    if (!isAcknowledged)  { toast.error("Please acknowledge the impact of this change."); return; }
    if (!activeCycle?.id) { toast.error("No active PMS cycle found."); return; }

    setIsSaving(true);
    try {
      /* Only include optional dates when the user has filled them */
      const payload: Record<string, string> = {
        objective_setting_end: form.objective_setting_end,
        grace_period_end:      form.grace_period_end,
      };
      if (form.mid_year_review) payload.mid_year_review = form.mid_year_review;
      if (form.year_end_review) payload.year_end_review  = form.year_end_review;

      const response = await fetch(
        `${API_BASE}/pms-cycles/${activeCycle.id}`,
        {
          method:  "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-User-Level": "1",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error ?? `Save failed (${response.status})`);
      }

      toast.success("PMS cycle dates updated successfully.");

      /* Brief pause so the user sees the success toast */
      setTimeout(() => router.push(TEMPLATE_DASHBOARD_PATH), 800);
    } catch (err: any) {
      console.error("[CycleDatesPage] Save error:", err);
      toast.error(err.message ?? "Could not update cycle dates.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoadingCycle) {
    return (
      <div className={styles.loadingWrapper}>
        <Loader2 size={36} className={styles.spinner} color="#3b82f6" />
        <p className={styles.loadingText}>Loading PMS cycle…</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
     <div className={styles.dashShell}>
      <Sidebar />
      <main className={styles.mainContent}>
        <Breadcrumb />
        <div className={styles.pageWrapper}>

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIconWrap}>
            <Settings size={22} color="#3b82f6" />
          </div>
          <div>
            <h1 className={styles.pageTitle}>Edit Appraisal Cycle Dates</h1>
            <p className={styles.pageSubtitle}>
              Adjust milestone dates for the active performance management cycle
            </p>
          </div>
        </div>

        {/* Navigate back without saving */}
        <button
          className={styles.backBtn}
          onClick={() => router.push(TEMPLATE_DASHBOARD_PATH)}
          aria-label="Back to Template Management"
        >
          <ArrowLeft size={15} />
          Back to Templates
        </button>
      </div>

      {/* ── Read-only cycle summary ── */}
      <CycleInfoCard activeCycle={activeCycle} />

      {/* ── Impact warning ── */}
      <WarningBox />

      {/* ── Date fields ── */}
      <div className={styles.formCard}>
        <div className={styles.formCardHeader}>
          <Calendar size={16} color="#3b82f6" />
          <span className={styles.formCardTitle}>Milestone Dates</span>
          <span className={styles.formCardNote}>
            Fields marked{" "}
            <span style={{ color: "#ef4444" }}>*</span> are required
          </span>
        </div>

        <div className={styles.dateGrid}>
          {DATE_FIELD_CONFIG.map(config => (
            <DateField
              key={config.field}
              config={config}
              value={form[config.field]}
              onChange={value =>
                setForm(prev => ({ ...prev, [config.field]: value }))
              }
            />
          ))}
        </div>
      </div>

      {/* ── Acknowledgement checkbox ── */}
      <label className={styles.ackRow}>
        <input
          type="checkbox"
          checked={isAcknowledged}
          onChange={e => setIsAcknowledged(e.target.checked)}
          className={styles.ackCheckbox}
          aria-label="Acknowledge impact of cycle date changes"
        />
        <span className={styles.ackText}>
          I understand that these changes will take effect immediately
          and impact all users on this PMS cycle.
        </span>
        {isAcknowledged && (
          <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0 }} />
        )}
      </label>

      {/* ── Save / Cancel ── */}
      <div className={styles.actionsRow}>
        <button
          className={styles.cancelBtn}
          onClick={() => router.push(TEMPLATE_DASHBOARD_PATH)}
          disabled={isSaving}
        >
          Cancel
        </button>

        <button
          className={`${styles.saveBtn} ${
            !isAcknowledged || isSaving ? styles.saveBtnDisabled : ""
          }`}
          onClick={handleSave}
          disabled={isSaving || !isAcknowledged}
          aria-busy={isSaving}
        >
          {isSaving
            ? <><Loader2 size={14} className={styles.spinner} /> Saving…</>
            : <><CheckCircle2 size={14} /> Save Cycle Dates</>}
        </button>
      </div>
    </div>
  </main>
 </div>
  );
}

// ─── CycleDatesPage (exported default) ───────────────────────────────────────

/**
 * Public export.
 * Wraps CycleDatesInner in Suspense so that useSearchParams() works
 * correctly under Next.js App Router without triggering a build error.
 */
export default function CycleDatesPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingWrapper}>
          <Loader2 size={36} className={styles.spinner} color="#3b82f6" />
          <p className={styles.loadingText}>Loading…</p>
        </div>
      }
    >
      <CycleDatesInner />
    </Suspense>
  );
}
