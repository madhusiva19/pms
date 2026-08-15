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
  Target,        CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import Sidebar    from "@/components/sidebar/Sidebar";
import styles     from "./CycleDatesPage.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE             = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const TEMPLATE_DASHBOARD_PATH = "/hq-admin/template-management";
const TEMPLATE_CYCLE_PATH =  "/hq-admin/appraisal-cycle";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CycleDatesForm {
  objective_setting_start: string;  // ← added — maps to DB column
  objective_setting_end:   string;
  grace_period_end:        string;
  mid_year_review:         string;
  year_end_review:         string;
}

interface DateFieldConfig {
  field:    keyof CycleDatesForm;
  label:    string;
  required: boolean;
  hint:     string;
  icon:     React.ReactNode;
}

// ─── Field Configuration ──────────────────────────────────────────────────────

const DATE_FIELD_CONFIG: DateFieldConfig[] = [
  {
    field:    "objective_setting_start",
    label:    "Objective Setting Start",
    required: false,
    hint:     "Date when objective setting opens. Defaults to cycle start date if not set.",
    icon:     <Flag       size={16} />,
  },
  {
    field:    "objective_setting_end",
    label:    "Objective Setting End",
    required: true,
    hint:     "Templates remain open for editing until this date.",
    icon:     <Target     size={16} />,
  },
  {
    field:    "grace_period_end",
    label:    "Grace Period End (Hard Freeze)",
    required: true,
    hint:     "HQ Admin retains edit access during grace. After this date, templates are fully frozen.",
    icon:     <Clock3     size={16} />,
  },
{
    field:    "mid_year_review",
    label:    "Mid-Year Review Date (H1 End)",
    required: false,
    hint:     "Target date for mid-cycle performance check-ins.",
    icon:     <BarChart3  size={16} />,
  },
  {
    field:    "year_end_review",
    label:    "Year-End Review Date (H2 End)",
    required: false,
    hint:     "Target date for the annual appraisal and final score submission.",
    icon:     <Star       size={16} />,
  },
];

// ─── Utility Functions ────────────────────────────────────────────────────────

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.split("T")[0]; // never use new Date() on date-only strings
}

function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const [year, month, day] = iso.split("T")[0].split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric",
    });
  } catch { return "—"; }
}

async function fetchPmsCycle(cycleId: string | null): Promise<any> {
  if (cycleId) {
    try {
      const res = await fetch(`${API_BASE}/pms-cycles/${cycleId}`);
      if (res.ok) return await res.json();
      console.warn(
        `[CycleDatesPage] /pms-cycles/${cycleId} returned ${res.status}. ` +
        "Falling back to /pms-cycles/active.",
      );
    } catch (err) {
      console.warn("[CycleDatesPage] Falling back to /pms-cycles/active.", err);
    }
  }
  const activeRes = await fetch(`${API_BASE}/pms-cycles/active`);
  if (!activeRes.ok) {
    throw new Error(`Both endpoints failed. Active returned ${activeRes.status}.`);
  }
  return activeRes.json();
}

// ─── CycleInfoCard ────────────────────────────────────────────────────────────

function CycleInfoCard({ activeCycle }: { activeCycle: any }) {
  const pmsYear   = activeCycle?.pms_year ?? "—";
  const startDate = formatDisplayDate(activeCycle?.pms_start);

  return (
    <div className={styles.infoCard}>
      <div className={styles.infoCardIcon}>
        <Flag size={20} color="#6366f1" />
      </div>
      <div className={styles.infoCardBody}>
        <div className={styles.infoCardTitle}>Appraisal Year {pmsYear}</div>
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

// ─── CycleSummaryChips ────────────────────────────────────────────────────────

/**
 * Shows all current DB dates as read-only chips above the edit form.
 * Helps HQ Admin see what's currently saved before making changes.
 */
function CycleSummaryChips({ activeCycle }: { activeCycle: any }) {
  if (!activeCycle) return null;

  const chips = [
    {
      label: "Cycle Start",
      value: formatDisplayDate(activeCycle.pms_start),
      icon:  <Flag      size={12} color="#6366f1" />,
      bg:    "#ede9fe",
      color: "#5b21b6",
    },
    {
      label: "Obj. Setting Start",
      value: formatDisplayDate(
        activeCycle.objective_setting_start ?? activeCycle.pms_start
      ),
      icon:  <CalendarDays size={12} color="#0ea5e9" />,
      bg:    "#e0f2fe",
      color: "#0369a1",
    },
    {
      label: "Obj. Setting End",
      value: formatDisplayDate(
        activeCycle.objective_setting_end ?? activeCycle.objective_end
      ),
      icon:  <Target    size={12} color="#2563eb" />,
      bg:    "#dbeafe",
      color: "#1e40af",
    },
    {
      label: "Grace Period End",
      value: formatDisplayDate(
        activeCycle.grace_period_end ?? activeCycle.grace_end
      ),
      icon:  <Clock3    size={12} color="#d97706" />,
      bg:    "#fef3c7",
      color: "#92400e",
    },
    {
      label: "Mid-Year Review (H1 End)",
      value: formatDisplayDate(activeCycle.mid_year_review),
      icon:  <BarChart3 size={12} color="#e11d48" />,
      bg:    "#ffe4e6",
      color: "#9f1239",
    },
    {
      label: "Year-End Review (H2 End)",
      value: formatDisplayDate(activeCycle.year_end_review),
      icon:  <Star      size={12} color="#9333ea" />,
      bg:    "#f3e8ff",
      color: "#6b21a8",
    },
  ];

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
      gap:                 "10px",
      marginBottom:        "24px",
    }}>
      {chips.map(chip => (
        <div
          key={chip.label}
          style={{
            background:   chip.bg,
            borderRadius: "10px",
            padding:      "10px 14px",
            display:      "flex",
            flexDirection: "column",
            gap:          "4px",
          }}
        >
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:        "5px",
            fontSize:   "10px",
            fontWeight: "700",
            color:      chip.color,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            {chip.icon}
            {chip.label}
          </div>
          <div style={{
            fontSize:   "12px",
            fontWeight: "600",
            color:      "#1e293b",
          }}>
            {chip.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── WarningBox ───────────────────────────────────────────────────────────────

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
          recalculate instantly. When the cycle ends, the next cycle will be
          created automatically using the same date pattern you set here.
          Only proceed after consulting senior management.
        </p>
      </div>
    </div>
  );
}

// ─── DateField ────────────────────────────────────────────────────────────────

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
          ? <span className={styles.dateLabelRequired} aria-label="required">*</span>
          : <span className={styles.dateLabelOptional}>optional</span>}
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

function CycleDatesInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const cycleId      = searchParams.get("cycleId");

  const [activeCycle,    setActiveCycle]    = useState<any>(null);
  const [isLoadingCycle, setIsLoadingCycle] = useState(true);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);
  const [form,           setForm]           = useState<CycleDatesForm>({
    objective_setting_start: "",
    objective_setting_end:   "",
    grace_period_end:        "",
    mid_year_review:         "",
    year_end_review:         "",
  });

  // ── Fetch cycle ───────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadCycle(): Promise<void> {
      setIsLoadingCycle(true);
      try {
        const data = await fetchPmsCycle(cycleId);
        setActiveCycle(data);

        // Pre-populate all 5 form fields
        // Handle dual field name aliases from API
        setForm({
          objective_setting_start: toInputDate(
            data.objective_setting_start ?? data.pms_start
          ),
          objective_setting_end: toInputDate(
            data.objective_setting_end ?? data.objective_end
          ),
          grace_period_end: toInputDate(
            data.grace_period_end ?? data.grace_end
          ),
          mid_year_review: toInputDate(data.mid_year_review),
          year_end_review: toInputDate(data.year_end_review),
        });
      } catch (err: any) {
        console.error("[CycleDatesPage] Failed to load cycle:", err);
        toast.error("Could not load PMS cycle. Check the console for details.");
      } finally {
        setIsLoadingCycle(false);
      }
    }
    loadCycle();
  }, [cycleId]);

  // ── Validation ────────────────────────────────────────────────────────────

  function validateForm(): string | null {
    if (!form.objective_setting_end) {
      return "Objective Setting End date is required.";
    }
    if (!form.grace_period_end) {
      return "Grace Period End date is required.";
    }
    // obj start must be before or equal to obj end (if set)
    if (
      form.objective_setting_start &&
      new Date(form.objective_setting_start) >= new Date(form.objective_setting_end)
    ) {
      return "Objective Setting Start must be before Objective Setting End.";
    }
    if (
      new Date(form.grace_period_end) <= new Date(form.objective_setting_end)
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

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    const validationError = validateForm();
    if (validationError) { toast.error(validationError); return; }
    if (!isAcknowledged)  { toast.error("Please acknowledge the impact of this change."); return; }
    if (!activeCycle?.id) { toast.error("No active PMS cycle found."); return; }

    setIsSaving(true);
    try {
      // Always send required fields
      const payload: Record<string, string> = {
        objective_setting_end: form.objective_setting_end,
        grace_period_end:      form.grace_period_end,
      };
      // Only include optional fields if filled
      if (form.objective_setting_start) payload.objective_setting_start = form.objective_setting_start;
      if (form.mid_year_review)         payload.mid_year_review         = form.mid_year_review;
      if (form.year_end_review)         payload.year_end_review          = form.year_end_review;

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
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => router.push(TEMPLATE_CYCLE_PATH), 800);
    } catch (err: any) {
      console.error("[CycleDatesPage] Save error:", err);
      toast.error(err.message ?? "Could not update cycle dates.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────

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
      <main className={styles.mainContent}>
        <div className={styles.pageWrapper}>

          {/* ── Page header ── */}
          <div className={styles.pageHeader}>
            <div className={styles.pageHeaderLeft}>
              <div className={styles.pageIconWrap}>
                <Settings size={22} color="#3b82f6" />
              </div>
              <div>
                <p className={styles.pageSubtitle}>
                  Adjust milestone dates for the active performance management cycle.
                  These dates will be used to auto-create next year's cycle.
                </p>
              </div>
            </div>

            <button
              className={styles.backBtn}
              onClick={() => router.push(TEMPLATE_DASHBOARD_PATH)}
              aria-label="Back to Template Management"
            >
              <ArrowLeft size={15} />
              Back to Templates
            </button>
          </div>

          {/* ── Current cycle summary ── */}
          <CycleInfoCard activeCycle={activeCycle} />

          {/* ── Read-only current dates overview ── */}
          <CycleSummaryChips activeCycle={activeCycle} />

          {/* ── Impact warning ── */}
          <WarningBox />

          {/* ── Date edit form ── */}
          <div className={styles.formCard}>
            <div className={styles.formCardHeader}>
              <Calendar size={16} color="#3b82f6" />
              <span className={styles.formCardTitle}>Update Milestone Dates</span>
              <span className={styles.formCardNote}>
                Fields marked <span style={{ color: "#ef4444" }}>*</span> are required.
                These dates will repeat next year automatically.
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

          {/* ── Auto-repeat info box ── */}
          <div style={{
            display:      "flex",
            alignItems:   "flex-start",
            gap:          "12px",
            padding:      "14px 18px",
            borderRadius: "12px",
            background:   "#f0fdf4",
            border:       "1px solid #bbf7d0",
            marginBottom: "20px",
          }}>
            <Info size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: "13px", fontWeight: "700", color: "#14532d", margin: 0 }}>
                Auto-repeat enabled
              </p>
              <p style={{ fontSize: "12px", color: "#166534", margin: "4px 0 0" }}>
                When this cycle's grace period ends, the next year's cycle will be created
                automatically using the same date pattern. HQ Admin can update dates again after
                auto-creation if needed.
              </p>
            </div>
          </div>

          {/* ── Acknowledgement ── */}
          <label className={styles.ackRow}>
            <input
              type="checkbox"
              checked={isAcknowledged}
              onChange={e => setIsAcknowledged(e.target.checked)}
              className={styles.ackCheckbox}
              aria-label="Acknowledge impact of cycle date changes"
            />
            <span className={styles.ackText}>
              I understand that these changes will take effect immediately,
              impact all users on this PMS cycle, and will be used as the
              pattern for future auto-created cycles.
            </span>
            {isAcknowledged && (
              <CheckCircle2 size={16} color="#16a34a" style={{ flexShrink: 0 }} />
            )}
          </label>

          {/* ── Save / Cancel ── */}
          <div className={styles.actionsRow}>
            <button
              className={styles.cancelBtn}
              onClick={() => router.push(TEMPLATE_CYCLE_PATH)}
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