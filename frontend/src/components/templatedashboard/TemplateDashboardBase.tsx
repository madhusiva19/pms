"use client";

// TemplateDashboardBase.tsx — FIXED VERSION
// Fixes:
//   1. Dynamic cycle dates — uses activeCycle from API instead of hardcoded computeFreezeDates
//   2. Role-aware routing — view/edit URLs use correct role prefix (hq-admin / country-admin / branch-admin)
//   3. Back navigation — goes to the correct role's template-management page
//   4. Other admins (level 2/3) can edit Editable objectives only during objective-setting window
//   5. HQ Admin (level 1) retains full edit access through grace period

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, FileText, Pencil, Trash2,
  Lock, Loader2, Inbox, Target,
  Calendar, Copy, BookOpen,
  CheckCircle2, Clock3,
  Eye, ChevronDown, ChevronUp,
  Layers, Unlock, Award,
  Bell, Users, Building2, BarChart3,
  TrendingUp, GitBranch, UserCheck,
  Settings, X, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import styles from "./TemplateDashboardBase.module.css";
import {
  formatDate,
  daysUntil,
} from "@/lib/freezeUtils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

const CATEGORY_PALETTE = [
  { bg: "#eff6ff", fill: "#3b82f6", text: "#1e40af" },
  { bg: "#ecfdf5", fill: "#059669", text: "#065f46" },
  { bg: "#fef3c7", fill: "#d97706", text: "#92400e" },
  { bg: "#f5f3ff", fill: "#8b5cf6", text: "#5b21b6" },
  { bg: "#fff1f2", fill: "#f43f5e", text: "#be123c" },
  { bg: "#ecfeff", fill: "#0891b2", text: "#164e63" },
];

// ─── Role routing helpers ─────────────────────────────────────────────────────
// level 1 = HQ Admin, level 2 = Country Admin, level 3 = Branch Admin

function getRolePrefix(level: number): string {
  if (level === 1) return "/hq-admin";
  if (level === 2) return "/country-admin";
  return "/branch-admin";
}

function getDashboardPath(level: number): string {
  return `${getRolePrefix(level)}/template-management`;
}

function getCreateTemplatePath(level: number): string {
  return `${getRolePrefix(level)}/create-template`;
}

// ─── Dynamic freeze / permissions from activeCycle ────────────────────────────

interface DynamicFreezeDates {
  pmsYearStart:         Date;
  objectiveSettingEnd:  Date;
  graceEnd:             Date;
  midYearReview:        Date | null;
  yearEndReview:        Date | null;
}

type FreezeStatus = "open" | "grace" | "frozen";

interface TemplatePermissions {
  freezeStatus: FreezeStatus;
  canEdit:      boolean;
  canCreate:    boolean;
  canDelete:    boolean;
  canEditLocked:    boolean;   // only HQ Admin
  canEditEditable:  boolean;   // HQ Admin + other admins during open window
  roleLabel:    string;
}

function buildFreezeDates(activeCycle: any): DynamicFreezeDates {
  // Fallback to a far-future date if no cycle — everything is "open"
  const now = new Date();
  const fallbackYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // April = new PMS year

  const pmsStart  = activeCycle?.pms_start
    ? new Date(activeCycle.pms_start)
    : new Date(fallbackYear, 3, 1); // April 1

  const objEnd = activeCycle?.objective_setting_end ?? activeCycle?.objective_end
    ? new Date(activeCycle.objective_setting_end ?? activeCycle.objective_end)
    : new Date(fallbackYear, 5, 30); // June 30

  const graceEnd = activeCycle?.grace_period_end ?? activeCycle?.grace_end
    ? new Date(activeCycle.grace_period_end ?? activeCycle.grace_end)
    : new Date(fallbackYear, 6, 31); // July 31

  const midYear = activeCycle?.mid_year_review ? new Date(activeCycle.mid_year_review) : null;
  const yearEnd = activeCycle?.year_end_review  ? new Date(activeCycle.year_end_review)  : null;

  return {
    pmsYearStart:        pmsStart,
    objectiveSettingEnd: objEnd,
    graceEnd,
    midYearReview:       midYear,
    yearEndReview:       yearEnd,
  };
}

function computePermissions(level: number, freezeDates: DynamicFreezeDates): TemplatePermissions {
  const now = new Date();

  let freezeStatus: FreezeStatus;
  if (now <= freezeDates.objectiveSettingEnd) {
    freezeStatus = "open";
  } else if (now <= freezeDates.graceEnd) {
    freezeStatus = "grace";
  } else {
    freezeStatus = "frozen";
  }

  const isHqAdmin      = level === 1;
  const isCountryAdmin = level === 2;
  const isBranchAdmin  = level === 3;

  // HQ Admin: full access during open + grace; read-only when frozen
  // Country/Branch Admin: can only edit Editable objectives during open window; nothing during grace/frozen
  const canEditLocked   = isHqAdmin && freezeStatus !== "frozen";
  const canEditEditable = (isHqAdmin && freezeStatus !== "frozen") ||
                          ((isCountryAdmin || isBranchAdmin) && freezeStatus === "open");

  const canEdit  = canEditEditable; // at minimum can edit something
  const canCreate = isHqAdmin && freezeStatus !== "frozen";
  const canDelete = isHqAdmin && freezeStatus !== "frozen";

  const roleLabel =
    isHqAdmin      ? "HQ Administrator"      :
    isCountryAdmin ? "Country Administrator"  :
                     "Branch Administrator";

  return { freezeStatus, canEdit, canCreate, canDelete, canEditLocked, canEditEditable, roleLabel };
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface TemplateDashboardBaseProps {
  level: number;
}

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

interface AssignmentRule {
  designation_id: number | null;
  department_id: string | null;
  branch_id:     string | null;
  user_id:       string | null;
}

interface TemplateRecord {
  id:                      number;
  name:                    string;
  description?:            string;
  categories?:             any[];
  total_weight?:           number;
  max_score?:              number;
  lastModified?:           string;
  created_at?:             string;
  assignedDesignations?:           string[];
  assignedDesignationIds?:        number[];
  assignedDepartments?:     AssignedDepartment[];
  assignedDepartmentNames?: string[];
  assignedDepartmentsIds?:  string[];
  assignedBranches?:        AssignedBranch[];
  assignedBranchIds?:       string[];
  assignedEmployees?:       string[];
  assignedEmployeeIds?:     string[];
  assignedRules?:           AssignmentRule[];
  assignedCount?:           number;
}

// ─── Edit Cycle Dates Modal ───────────────────────────────────────────────────

interface CycleDatesForm {
  objective_setting_end: string;
  grace_period_end:      string;
  mid_year_review:       string;
  year_end_review:       string;
}

interface EditCycleDatesModalProps {
  activeCycle: any;
  onClose:     () => void;
  onSaved:     (updatedCycle: any) => void;
}

function EditCycleDatesModal({ activeCycle, onClose, onSaved }: EditCycleDatesModalProps) {
  const toInputDate = (isoStr: string | null | undefined) => {
    if (!isoStr) return "";
    try { return new Date(isoStr).toISOString().split("T")[0]; }
    catch { return ""; }
  };

  const [form, setForm] = useState<CycleDatesForm>({
    objective_setting_end: toInputDate(activeCycle?.objective_setting_end ?? activeCycle?.objective_end),
    grace_period_end:      toInputDate(activeCycle?.grace_period_end      ?? activeCycle?.grace_end),
    mid_year_review:       toInputDate(activeCycle?.mid_year_review),
    year_end_review:       toInputDate(activeCycle?.year_end_review),
  });

  const [isSaving,     setIsSaving]     = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const pmsStart = activeCycle?.pms_start
    ? new Date(activeCycle.pms_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : "—";

  const validate = (): string | null => {
    if (!form.objective_setting_end) return "Objective Setting End date is required.";
    if (!form.grace_period_end)      return "Grace Period End date is required.";
    const obj   = new Date(form.objective_setting_end);
    const grace = new Date(form.grace_period_end);
    if (grace <= obj) return "Grace Period End must be after Objective Setting End.";
    if (form.mid_year_review && form.year_end_review) {
      if (new Date(form.year_end_review) <= new Date(form.mid_year_review))
        return "Year-End Review must be after Mid-Year Review.";
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (!acknowledged) { toast.error("Please acknowledge the impact of this change."); return; }

    setIsSaving(true);
    try {
      const payload: Record<string, string> = {
        objective_setting_end: form.objective_setting_end,
        grace_period_end:      form.grace_period_end,
      };
      if (form.mid_year_review) payload.mid_year_review = form.mid_year_review;
      if (form.year_end_review)  payload.year_end_review  = form.year_end_review;

      const cycleId = activeCycle?.id;
      if (!cycleId) { toast.error("No active PMS cycle found to update."); return; }

      const res = await fetch(`${API_BASE}/pms-cycles/${cycleId}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", "X-User-Level": "1" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Update failed");
      }

      const refreshRes = await fetch(`${API_BASE}/pms-cycles/active`);
      const refreshed  = refreshRes.ok ? await refreshRes.json() : activeCycle;

      toast.success("PMS cycle dates updated successfully.");
      onSaved(refreshed);
    } catch (err: any) {
      toast.error(err.message ?? "Could not update cycle dates.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="edit-cycle-modal-title">
      <div className={styles.editCycleModalCard}>

        <div className={styles.editCycleHeader}>
          <div className={styles.editCycleHeaderLeft}>
            <div className={styles.editCycleIconWrap}><Settings size={18} color="#3b82f6" /></div>
            <div>
              <h3 id="edit-cycle-modal-title" className={styles.editCycleTitle}>Edit PMS Cycle Dates</h3>
              <p className={styles.editCycleSubtitle}>
                PMS Year {activeCycle?.pms_year ?? "—"} &nbsp;·&nbsp; Starts {pmsStart}
              </p>
            </div>
          </div>
          <button className={styles.editCycleCloseBtn} onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className={styles.editCycleWarning}>
          <AlertTriangle size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <p className={styles.editCycleWarningText}>
            Changing cycle dates affects <strong>all employees and managers</strong> on this PMS cycle.
            The objective-setting window, freeze state, and review deadlines will update immediately.
            Only make changes after consulting senior management.
          </p>
        </div>

        <div className={styles.editCycleDateGrid}>

          <div className={styles.editCycleDateGroup}>
            <label className={styles.editCycleDateLabel}>
              Objective Setting End <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="date"
              className={styles.editCycleDateInput}
              value={form.objective_setting_end}
              onChange={(e) => setForm((f) => ({ ...f, objective_setting_end: e.target.value }))}
            />
            <p className={styles.editCycleDateHint}>
              Templates are open for editing until this date. All users may set objectives.
            </p>
          </div>

          <div className={styles.editCycleDateGroup}>
            <label className={styles.editCycleDateLabel}>
              Grace Period End (Hard Freeze) <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              type="date"
              className={styles.editCycleDateInput}
              value={form.grace_period_end}
              onChange={(e) => setForm((f) => ({ ...f, grace_period_end: e.target.value }))}
            />
            <p className={styles.editCycleDateHint}>
              HQ Admin retains edit access during the grace period. After this date, templates are fully frozen.
            </p>
          </div>

          <div className={styles.editCycleDateGroup}>
            <label className={styles.editCycleDateLabel}>Mid-Year Review Date <span className={styles.editCycleDateOptional}>optional</span></label>
            <input
              type="date"
              className={styles.editCycleDateInput}
              value={form.mid_year_review}
              onChange={(e) => setForm((f) => ({ ...f, mid_year_review: e.target.value }))}
            />
            <p className={styles.editCycleDateHint}>Target date for mid-cycle performance check-ins.</p>
          </div>

          <div className={styles.editCycleDateGroup}>
            <label className={styles.editCycleDateLabel}>Year-End Review Date <span className={styles.editCycleDateOptional}>optional</span></label>
            <input
              type="date"
              className={styles.editCycleDateInput}
              value={form.year_end_review}
              onChange={(e) => setForm((f) => ({ ...f, year_end_review: e.target.value }))}
            />
            <p className={styles.editCycleDateHint}>Target date for the annual appraisal / final score submission.</p>
          </div>

        </div>

        <label className={styles.editCycleAckRow}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className={styles.editCycleAckCheckbox}
          />
          <span className={styles.editCycleAckText}>
            I understand that these changes will take effect immediately and impact all users on this PMS cycle.
          </span>
        </label>

        <div className={styles.editCycleActions}>
          <button className={styles.editCycleCancelBtn} onClick={onClose}>Cancel</button>
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TemplateDashboardBase({ level }: TemplateDashboardBaseProps) {
  const router = useRouter();

  const [templates,        setTemplates]       = useState<TemplateRecord[]>([]);
  const [searchQuery,      setSearchQuery]      = useState("");
  const [confirmDeleteId,  setConfirmDeleteId]  = useState<number | null>(null);
  const [isLoading,        setIsLoading]        = useState(true);
  const [expandedCardId,   setExpandedCardId]   = useState<number | null>(null);
  const [expandedAssignId, setExpandedAssignId] = useState<number | null>(null);
  const [isDuplicating,    setIsDuplicating]    = useState<number | null>(null);
  const [activeCycle,      setActiveCycle]      = useState<any>(null);
  const [showEditCycle,    setShowEditCycle]    = useState(false);

  // ── Derive freeze dates + permissions from activeCycle (reactive to cycle changes) ──
  const freezeDates = useMemo(() => buildFreezeDates(activeCycle), [activeCycle]);
  const permissions = useMemo(() => computePermissions(level, freezeDates), [level, freezeDates]);

  // ── Role-aware route prefix ────────────────────────────────────────────────
  const rolePrefix = getRolePrefix(level);

  // ── Fetch templates + active cycle ─────────────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [tmplRes, cycleRes] = await Promise.all([
          fetch(`${API_BASE}/templates`),
          fetch(`${API_BASE}/pms-cycles/active`),
        ]);
        if (!tmplRes.ok) throw new Error(`Templates: ${tmplRes.status}`);
        setTemplates(await tmplRes.json());
        if (cycleRes.ok) setActiveCycle(await cycleRes.json());
      } catch (error) {
        console.error("Failed to load data:", error);
        toast.error("Could not load templates. Is the server running?");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // ── Filtered list ────────────────────────────────────────────────────────
  const filteredTemplates = useMemo(
    () =>
      templates
        .filter((t) => t.name?.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort(
          (a, b) =>
            new Date(b.lastModified ?? b.created_at ?? 0).getTime() -
            new Date(a.lastModified ?? a.created_at ?? 0).getTime(),
        ),
    [templates, searchQuery],
  );

  // ── Navigation — role-aware ────────────────────────────────────────────────
  const handleViewTemplate = (templateId: number) =>
    router.push(`${rolePrefix}/create-template?edit=${templateId}&mode=view`);

  const handleEditTemplate = (templateId: number) => {
    if (!permissions.canEdit) {
      toast.error(
        permissions.freezeStatus === "frozen"
          ? "Templates are fully frozen — no edits allowed until next PMS cycle."
          : "You do not have permission to edit templates.",
      );
      return;
    }
    router.push(`${rolePrefix}/create-template?edit=${templateId}`);
  };

  // ── Duplicate ─────────────────────────────────────────────────────────────
  const handleDuplicateTemplate = async (template: TemplateRecord) => {
    if (!permissions.canCreate) {
      toast.error("Templates are frozen — duplication not permitted right now.");
      return;
    }
    const previousTemplates = [...templates];
    setIsDuplicating(template.id);
    toast.info("Duplicating template…");
    try {
      const payload = {
        name:         `${template.name} (Copy)`,
        description:  template.description ?? "",
        max_score:    template.max_score ?? 5,
        categories:   template.categories ?? [],
        totalWeight:  template.total_weight ?? 0,
        lastModified: new Date().toISOString(),
      };
      const res = await fetch(`${API_BASE}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Duplicate failed");
      const tmplRes = await fetch(`${API_BASE}/templates`);
      if (tmplRes.ok) setTemplates(await tmplRes.json());
      toast.success(`"${template.name}" Duplicated Successfully`);
    } catch (err: any) {
      console.error("Duplicate failed:", err);
      setTemplates(previousTemplates);
      toast.error(err.message ?? "Could not Duplicate Template");
    } finally {
      setIsDuplicating(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDeleteTemplate = async (templateId: number) => {
    if (!permissions.canDelete) {
      toast.error("Deletion is not permitted in the current freeze state.");
      return;
    }
    const previousTemplates = [...templates];
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    setConfirmDeleteId(null);
    toast.info("Deleting template…");
    try {
      const response = await fetch(`${API_BASE}/templates/${templateId}`, { method: "DELETE" });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Server error during Deletion");
      }
      toast.success("Template deleted successfully");
    } catch (error: any) {
      console.error("Delete failed:", error);
      setTemplates(previousTemplates);
      toast.error(error.message ?? "Could not Delete — Server may be offline.");
    }
  };

  // ── Save cycle dates callback ─────────────────────────────────────────────
  // After the cycle dates are saved, activeCycle updates → freezeDates + permissions
  // recompute automatically via useMemo above.
  const handleCycleSaved = (updatedCycle: any) => {
    setActiveCycle(updatedCycle);
    setShowEditCycle(false);
  };

  const periodWrapperClass =
    permissions.freezeStatus === "frozen" ? styles.periodFrozen
    : permissions.freezeStatus === "grace" ? styles.periodGrace
    : styles.periodOpen;

  return (
    <div className={styles.wrapper}>

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className={styles.modalCard}>
            <div className={styles.modalIconWrapper}><Trash2 size={22} color="#ef4444" /></div>
            <h3 id="delete-modal-title" className={styles.modalTitle}>Delete Template?</h3>
            <p className={styles.modalText}>
              This action cannot be undone. All assignments linked to this template will also be removed.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className={styles.modalDeleteBtn} onClick={() => handleDeleteTemplate(confirmDeleteId)}>Delete Template</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit cycle dates modal — HQ Admin only */}
      {showEditCycle && activeCycle && (
        <EditCycleDatesModal
          activeCycle={activeCycle}
          onClose={() => setShowEditCycle(false)}
          onSaved={handleCycleSaved}
        />
      )}

      {/* Page header */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Template Management</h1>
          <p className={styles.pageSubtitleMain}>Manage and deploy evaluation structures across your organisation</p>
          <p className={styles.pageSubtitle}>
            <span className={styles.rolePill}>{permissions.roleLabel}</span>
            {permissions.freezeStatus === "open"
              ? <span className={styles.subtitleNote}>Objective window closes <strong>{formatDate(freezeDates.objectiveSettingEnd)}</strong></span>
              : permissions.freezeStatus === "grace"
              ? <span className={styles.subtitleNoteAmber}>Grace period until <strong>{formatDate(freezeDates.graceEnd)}</strong></span>
              : <span className={styles.subtitleNoteFrozen}>Templates frozen — read only</span>}
          </p>
        </div>
        <div className={styles.headerActions}>
          <CycleStatusBadge status={permissions.freezeStatus} level={level} />

          {/* Edit Cycle Dates — HQ Admin only */}
          {level === 1 && activeCycle?.id && (
            <button
              className={styles.editCycleDatesBtn}
              onClick={() => setShowEditCycle(true)}
              title="Modify PMS cycle dates (HQ Admin only)"
            >
              <Calendar size={13} />
              Edit Cycle Dates
            </button>
          )}

          {/* Create — HQ Admin only, not frozen */}
          {permissions.canCreate && (
            <button className={styles.createBtn} onClick={() => router.push(`${rolePrefix}/create-template`)}>
              + Create New Template
            </button>
          )}
        </div>
      </div>

      <StatusBanner permissions={permissions} freezeDates={freezeDates} level={level} />

      {!isLoading && (
        <PmsCycleTimeline
          freezeDates={freezeDates}
          activeCycle={activeCycle}
          templateCount={templates.length}
          permissions={permissions}
        />
      )}

      {/* Search */}
      <div className={styles.searchCard}>
        <div className={styles.searchWrapper}>
          <Search size={17} color="#94a3b8" />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search templates by name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search templates"
          />
          {searchQuery && (
            <button className={styles.searchClear} onClick={() => setSearchQuery("")} aria-label="Clear search">×</button>
          )}
          {!isLoading && (
            <span className={styles.searchCount}>
              {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Period wrapper */}
      <div className={`${styles.periodWrapper} ${periodWrapperClass}`}>
        {isLoading ? (
          <div className={styles.loadingWrapper}>
            <Loader2 size={36} color="#3b82f6" className={styles.spinner} />
            <p className={styles.loadingText}>Loading templates…</p>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div className={styles.emptyState}>
            <Inbox size={48} color="#cbd5e1" style={{ margin: "0 auto 16px" }} />
            <h3 className={styles.emptyTitle}>{searchQuery ? "No Results Found" : "No Templates Yet"}</h3>
            <p className={styles.emptyText}>
              {searchQuery
                ? `No templates match "${searchQuery}". Try a different search term.`
                : "No evaluation templates have been created. Click \"Create New Template\" to get started."}
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
                isCategoryExpanded={expandedCardId === template.id}
                isAssignExpanded={expandedAssignId === template.id}
                isDuplicating={isDuplicating === template.id}
                onToggleCategoryExpand={() => setExpandedCardId(expandedCardId === template.id ? null : template.id)}
                onToggleAssignExpand={() => setExpandedAssignId(expandedAssignId === template.id ? null : template.id)}
                onView={() => handleViewTemplate(template.id)}
                onEdit={() => handleEditTemplate(template.id)}
                onDelete={() => {
                  if (permissions.canDelete) setConfirmDeleteId(template.id);
                  else toast.error("Templates are frozen — deletion is not permitted until the next PMS cycle.");
                }}
                onDuplicate={() => handleDuplicateTemplate(template)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── PMS Cycle Timeline ───────────────────────────────────────────────────────

function PmsCycleTimeline({
  freezeDates, activeCycle, templateCount, permissions,
}: {
  freezeDates:   DynamicFreezeDates;
  activeCycle:   any;
  templateCount: number;
  permissions:   TemplatePermissions;
}) {
  const now = new Date();
  const yearStart = freezeDates.pmsYearStart.getTime();
  const yearEnd   = freezeDates.yearEndReview?.getTime()
    ?? new Date(freezeDates.pmsYearStart.getFullYear() + 1, 2, 31).getTime();

  const progressPercent = Math.min(100, Math.max(0, Math.round(((now.getTime() - yearStart) / (yearEnd - yearStart)) * 100)));

  const activeMilestone =
    now < freezeDates.objectiveSettingEnd ? "objective"
    : now < freezeDates.graceEnd ? "grace"
    : freezeDates.midYearReview && now < freezeDates.midYearReview ? "frozen"
    : freezeDates.yearEndReview && now < freezeDates.yearEndReview ? "midyear"
    : "yearend";

  const milestones = [
    { key: "start",     label: "Cycle Start",              date: formatDate(freezeDates.pmsYearStart),        icon: <Calendar size={14} /> },
    { key: "objective", label: "Objective Setting Closes", date: formatDate(freezeDates.objectiveSettingEnd), icon: <Target size={14} /> },
    { key: "grace",     label: "Grace Period",             date: `${formatDate(freezeDates.objectiveSettingEnd)} – ${formatDate(freezeDates.graceEnd)}`, icon: <Clock3 size={14} /> },
    { key: "frozen",    label: "Frozen",                   date: `From ${formatDate(freezeDates.graceEnd)}`,  icon: <Lock size={14} /> },
    { key: "midyear",   label: "Mid-Year Review",          date: freezeDates.midYearReview ? formatDate(freezeDates.midYearReview) : "Not set", icon: <BarChart3 size={14} /> },
    { key: "yearend",   label: "Year-End Review",          date: freezeDates.yearEndReview  ? formatDate(freezeDates.yearEndReview)  : "Not set", icon: <CheckCircle2 size={14} /> },
  ];

  return (
    <div className={styles.timelineSection}>
      <div className={styles.timelineSectionHeader}>
        <div className={styles.timelineSectionTitleGroup}>
          <TrendingUp size={15} color="#3b82f6" />
          <span className={styles.timelineSectionTitle}>Templates across the PMS Cycle</span>
          <span className={styles.timelineSectionTag}>{freezeDates.pmsYearStart.getFullYear()} / {freezeDates.pmsYearStart.getFullYear() + 1}</span>
        </div>
        <div className={styles.timelineSectionMeta}>
          <span className={styles.timelineSectionMetaLabel}>{templateCount} template{templateCount !== 1 ? "s" : ""} active</span>
        </div>
      </div>
      <div className={styles.progressBarWrap}>
        <div className={styles.progressBarTrack}>
          <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100} />
        </div>
        <span className={styles.progressBarLabel}>{progressPercent}% through cycle</span>
      </div>
      <div className={styles.milestoneGrid}>
        {milestones.map((m) => (
          <div key={m.key} data-key={m.key} className={`${styles.milestoneBox} ${activeMilestone === m.key ? styles.milestoneBoxActive : ""}`}>
            <div className={styles.milestoneBoxIcon}>{m.icon}</div>
            <div className={styles.milestoneBoxLabel}>{m.label}</div>
            <div className={styles.milestoneBoxDate}>{m.date}</div>
            {activeMilestone === m.key && <div className={styles.milestoneBoxNow}>Now</div>}
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Cycle Status Badge ───────────────────────────────────────────────────────

function CycleStatusBadge({ status, level }: { status: string; level: number }) {
  if (status === "open")  return <span className={`${styles.statusPill} ${styles.statusPillOpen}`}><CheckCircle2 size={13} />Open</span>;
  if (status === "grace") return <span className={`${styles.statusPill} ${styles.statusPillGrace}`}><Clock3 size={13} />Grace Period</span>;
  return <span className={`${styles.statusPill} ${styles.statusPillFrozen}`}><Lock size={13} />Frozen</span>;
}


// ─── Status Banner ────────────────────────────────────────────────────────────

function StatusBanner({
  permissions,
  freezeDates,
  level,
}: {
  permissions: TemplatePermissions;
  freezeDates: DynamicFreezeDates;
  level:       number;
}) {
  if (permissions.freezeStatus === "frozen") {
    return (
      <div className={`${styles.banner} ${styles.bannerFrozen}`}>
        <div className={styles.bannerIconWrapper}><Lock size={18} color="#fff" /></div>
        <div>
          <div className={styles.bannerTitle}>Templates Frozen — Read Only</div>
          <div className={styles.bannerText}>Grace period ended on <strong style={{ color: "rgba(255,255,255,0.95)" }}>{formatDate(freezeDates.graceEnd)}</strong>. All templates are locked with last-set KPIs.</div>
        </div>
      </div>
    );
  }
  if (permissions.freezeStatus === "grace") {
    const isHqAdmin = level === 1;
    return (
      <div className={`${styles.banner} ${styles.bannerGrace}`}>
        <div className={styles.bannerIconWrapper}><Clock3 size={18} color="#fff" /></div>
        <div>
          <div className={styles.bannerTitle}>
            {isHqAdmin
              ? "Grace Period Active — You retain access to manage templates"
              : "Grace Period Active — Read Only for Your Role"}
          </div>
          <div className={styles.bannerText}>
            Objective-setting window closed <strong style={{ color: "rgba(255,255,255,0.95)" }}>{formatDate(freezeDates.objectiveSettingEnd)}</strong>.
            Hard freeze on <strong style={{ color: "rgba(255,255,255,0.95)" }}>{formatDate(freezeDates.graceEnd)}</strong> ({daysUntil(freezeDates.graceEnd)} days remaining).
            {!isHqAdmin && " Only HQ Admin may make changes during the grace period."}
          </div>
        </div>
      </div>
    );
  }

  // Open window — distinguish roles
  const daysRemaining = daysUntil(freezeDates.objectiveSettingEnd);
  const isHqAdmin     = level === 1;

  if (daysRemaining <= 14) {
    return (
      <div className={`${styles.banner} ${styles.bannerWarning}`}>
        <div className={styles.bannerIconWrapper}><Calendar size={18} color="#fff" /></div>
        <div className={styles.bannerText}>
          <strong>Objective-setting window closes in {daysRemaining} days</strong> ({formatDate(freezeDates.objectiveSettingEnd)}). Ensure all templates are finalised before the deadline.
          {!isHqAdmin && " Note: you can only edit Editable objectives — Locked objectives require HQ Admin access."}
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.banner} ${styles.bannerOpen}`}>
      <div className={styles.bannerIconWrapper}><Unlock size={18} color="#3b82f6" /></div>
      <div>
        <div className={styles.bannerTitle}>
          {isHqAdmin
            ? "The Objective setting period has begun"
            : "Objective Setting Period — Limited Edit Access"}
        </div>
        <div className={styles.bannerText}>
          Objective-setting window is open until <strong style={{ color: "#1e40af" }}>{formatDate(freezeDates.objectiveSettingEnd)}</strong>{" "}
          <strong>{daysRemaining} days remaining</strong>.{" "}
          {isHqAdmin
            ? "New templates are now active for Objective Management."
            : "You can view and edit Editable objectives. Locked objectives can only be modified by HQ Admin."}
        </div>
      </div>
    </div>
  );
}


// ─── Template Card ────────────────────────────────────────────────────────────

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

function TemplateCard({
  template, level, permissions,
  isCategoryExpanded, isAssignExpanded, isDuplicating,
  onToggleCategoryExpand, onToggleAssignExpand,
  onView, onEdit, onDelete, onDuplicate,
}: TemplateCardProps) {
  const categories   = template.categories ?? [];
  const freezeStatus = permissions.freezeStatus;
  const isFrozen     = freezeStatus === "frozen";

  const lockedCount = categories.reduce(
    (sum: number, cat: any) => sum + (cat.objectives?.filter((o: any) => o.control === "Locked").length ?? 0), 0,
  );
  const totalObjectives = categories.reduce((sum: number, cat: any) => sum + (cat.objectives?.length ?? 0), 0);
  const editableCount   = totalObjectives - lockedCount;

  const totalRules = template.assignedRules?.length ?? 0;

  const lastUpdatedDate = new Date(template.lastModified ?? template.created_at ?? Date.now());
  const lastUpdatedText = lastUpdatedDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const assignmentSummary = useMemo(() => {
    const parts: string[] = [];
    if (template.assignedEmployees?.length) parts.push(`${template.assignedEmployees.length} direct`);
    if (template.assignedDesignations?.length) parts.push(`${template.assignedDesignations!.length} designation${template.assignedDesignations!.length !== 1 ? "s" : ""}`);
    if (template.assignedDepartments?.length) parts.push(`${template.assignedDepartments.length} dept${template.assignedDepartments.length !== 1 ? "s" : ""}`);
    if (template.assignedBranches?.length)  parts.push(`${template.assignedBranches.length} branch${template.assignedBranches.length !== 1 ? "es" : ""}`);
    return parts.length ? parts.join(" · ") : "Unassigned";
  }, [template]);

  // Determine what the edit button does for non-HQ admins
  // They can edit (Editable objectives only) during open window
  const canThisUserEdit = permissions.canEdit;
  const isHqAdmin       = level === 1;

  // Edit tooltip based on role and state
  const editTooltip = isFrozen
    ? "Editing not permitted during freeze"
    : !canThisUserEdit
    ? "No edit access in current period"
    : !isHqAdmin
    ? "Edit Editable objectives only"
    : "Edit template";

  return (
    <div className={styles.card}>

      {/* Card header */}
      <div className={styles.cardTop}>
        <div className={styles.cardTopInner}>
          <div className={styles.cardLeft}>
            <div className={styles.cardIconWrapper}><FileText size={22} color="#3b82f6" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.cardTitle}>{template.name}</h3>
                <CycleStatusBadge status={freezeStatus} level={level} />
              </div>
              <p className={styles.cardDescription}>{template.description || "Standard organisational evaluation template."}</p>
              {/* Show access level note for non-HQ admins */}
              {!isHqAdmin && permissions.freezeStatus === "open" && editableCount > 0 && (
                <p style={{ fontSize: "11px", color: "#7c3aed", fontWeight: "600", marginTop: "4px" }}>
                  <Unlock size={10} style={{ display: "inline", marginRight: "3px" }} />
                  {editableCount} editable objective{editableCount !== 1 ? "s" : ""} accessible to you
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className={styles.cardActions}>
            <button className={styles.actionBtn} onClick={onView} title="View template">
              <Eye size={13} /><span>View</span>
            </button>

            {/* Edit — visible to all roles, but gated by permissions */}
            {canThisUserEdit && (
              <button
                className={`${styles.actionBtn} ${isFrozen ? styles.actionBtnFrozen : ""}`}
                onClick={onEdit}
                title={editTooltip}
              >
                <Pencil size={13} /><span>Edit</span>
              </button>
            )}

            {/* Duplicate + Delete — HQ Admin only */}
            {isHqAdmin && (
              <button
                className={`${styles.actionBtn} ${isFrozen ? styles.actionBtnFrozen : ""}`}
                onClick={onDuplicate}
                title={isFrozen ? "Duplication not permitted during freeze" : "Duplicate template"}
                disabled={isDuplicating}
              >
                {isDuplicating ? <Loader2 size={13} className={styles.spinner} /> : <Copy size={13} />}
                <span>Copy</span>
              </button>
            )}
            {isHqAdmin && (
              <button
                className={`${styles.actionBtnDanger} ${isFrozen ? styles.actionBtnDangerFrozen : ""}`}
                onClick={onDelete}
                title={isFrozen ? "Deletion not permitted during freeze" : "Delete template"}
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className={styles.statsRow}>
        {[
          { label: "Categories",        value: categories.length },
          { label: "Total KPIs",        value: totalObjectives },
          { label: "Locked",            value: lockedCount },
          { label: "Editable",          value: editableCount },
          { label: "Assignment Rules",  value: totalRules },
        ].map((stat, index) => (
          <div key={stat.label} className={styles.statCell} style={{ borderRight: index < 4 ? "1px solid #f1f5f9" : "none" }}>
            <div className={styles.statValue}>{stat.value}</div>
            <div className={styles.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Meta row */}
      <div className={styles.cardMeta}>
        <div className={styles.cardMetaLeft}>
          <BookOpen size={12} color="#8b5cf6" /><span className={styles.cardMetaLabel}>AI Suggested Insights</span>
          <Award size={12} color="#d97706" /><span className={styles.cardMetaLabel}>Training Recommendations</span>
          <Target size={12} color="#3b82f6" /><span className={styles.cardMetaLabel}>Smart Analysis Enabled</span>
        </div>
        <div className={styles.cardMetaRight}>
          <span className={styles.cardMetaTimestamp}>Updated: {lastUpdatedText}</span>
        </div>
      </div>

      {/* Expand: Category Details */}
      <button className={styles.expandToggle} onClick={onToggleCategoryExpand}>
        <Layers size={14} color="#3b82f6" />
        <span>{isCategoryExpanded ? "Hide" : "Show"} Category Details</span>
        {isCategoryExpanded ? <ChevronUp size={14} color="#3b82f6" /> : <ChevronDown size={14} color="#3b82f6" />}
      </button>

      {isCategoryExpanded && (
        <div className={styles.expandedSection}>
          <div className={styles.expandedSectionHeading}><Layers size={13} color="#64748b" /><span>Performance Categories</span></div>
          <div className={styles.categoryGrid}>
            {categories.length === 0 ? (
              <p className={styles.categoryEmptyNote}>No categories defined.</p>
            ) : categories.map((cat: any, catIndex: number) => {
              const catLocked   = (cat.objectives ?? []).filter((o: any) => o.control === "Locked").length;
              const catObjCount = (cat.objectives ?? []).length;
              const palette     = CATEGORY_PALETTE[catIndex % CATEGORY_PALETTE.length];
              const catWeight   = cat.weight ?? (cat.objectives ?? []).reduce((s: number, o: any) => s + (Number(o.weight) || 0), 0);
              return (
                <div key={catIndex} className={styles.categoryDetailCard} style={{ background: palette.bg, borderColor: `${palette.fill}33` }}>
                  <div className={styles.categoryDetailHeader}>
                    <span style={{ fontWeight: 700, fontSize: "12px", color: palette.text }}>{cat.name}</span>
                    <span style={{ fontWeight: 800, fontSize: "13px", color: palette.fill }}>{catWeight}%</span>
                  </div>
                  <div className={styles.categoryDetailBar}>
                    <div style={{ height: "100%", width: `${catWeight}%`, background: palette.fill, borderRadius: "3px" }} />
                  </div>
                  <div className={styles.categoryDetailStats}>
                    <span><strong>{catObjCount}</strong> KPIs</span>
                    <span><strong>{catLocked}</strong> Locked</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expand: Assignments */}
      <button className={styles.expandToggle} onClick={onToggleAssignExpand}>
        <Users size={14} color="#3b82f6" />
        <span>{isAssignExpanded ? "Hide" : "Show"} Assignments</span>
        {!isAssignExpanded && totalRules > 0 && (
          <span style={{ marginLeft: "auto", fontSize: "11px", fontWeight: "600", color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "10px" }}>
            {assignmentSummary}
          </span>
        )}
        {isAssignExpanded ? <ChevronUp size={14} color="#3b82f6" /> : <ChevronDown size={14} color="#3b82f6" />}
      </button>

      {isAssignExpanded && (
        <div className={styles.expandedSection}>
          {totalRules === 0 ? (
            <p style={{ fontSize: "13px", color: "#94a3b8", padding: "8px 0" }}>No assignments set for this template.</p>
          ) : (
            <div className={styles.rolesDeptsSection}>

              {(template.assignedEmployees?.length ?? 0) > 0 && (
                <div className={styles.rolesDeptsGroup}>
                  <div className={styles.rolesDeptsLabel}>
                    <UserCheck size={13} color="#1e40af" />
                    <span>Direct Employees</span>
                  </div>
                  <div className={styles.rolesDeptsChips}>
                    {template.assignedEmployees!.map((emp) => (
                      <span key={emp} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" }}>
                        {emp}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.rolesDeptsGroup}>
                <div className={styles.rolesDeptsLabel}>
                  <Users size={13} color="#3b82f6" />
                  <span>Assigned Designations</span>
                </div>
                {template.assignedDesignations && template.assignedDesignations?.length > 0 ? (
                  <div className={styles.rolesDeptsChips}>
                    {template.assignedDesignations?.map((desig) => (
                      <span key={desig} className={styles.rolesChip}>{desig}</span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.rolesDeptsEmpty}>No roles assigned</span>
                )}
              </div>

              <div className={styles.rolesDeptsGroup}>
                <div className={styles.rolesDeptsLabel}>
                  <Building2 size={13} color="#8b5cf6" />
                  <span>Assigned Departments</span>
                </div>
                {template.assignedDepartments && template.assignedDepartments.length > 0 ? (
                  <div className={styles.rolesDeptsChips}>
                    {template.assignedDepartments.map((dept) => (
                      <span key={dept.id} className={styles.deptsChip}>
                        {dept.code ? `[${dept.code}] ` : ""}{dept.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.rolesDeptsEmpty}>No departments assigned</span>
                )}
              </div>

              <div className={styles.rolesDeptsGroup}>
                <div className={styles.rolesDeptsLabel}>
                  <GitBranch size={13} color="#7c3aed" />
                  <span>Branches</span>
                </div>
                {template.assignedBranches && template.assignedBranches.length > 0 ? (
                  <div className={styles.rolesDeptsChips}>
                    {template.assignedBranches.map((branch) => (
                      <span key={branch.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#f5f3ff", color: "#5b21b6", border: "1px solid #ddd6fe" }}>
                        {branch.code ?? branch.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.rolesDeptsEmpty}>Branches auto-resolved from departments</span>
                )}
              </div>

              {template.assignedRules && template.assignedRules.length > 0 && (
                <div style={{ marginTop: "12px", width: "100%" }}>
                  <div style={{ fontSize: "10px", fontWeight: "800", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                    {template.assignedRules.length} Assignment Rule{template.assignedRules.length !== 1 ? "s" : ""}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {template.assignedRules.map((rule, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", padding: "5px 10px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "11px" }}>
                        {rule.user_id ? (
                          <span style={{ padding: "1px 7px", borderRadius: "5px", background: "#eff6ff", color: "#1e40af", fontWeight: "700" }}>
                            👤 Direct user
                          </span>
                        ) : (
                          <>
                            {rule.designation_id != null && (
                              <span style={{ padding: "1px 7px", borderRadius: "5px", background: "#f0fdf4", color: "#166534", fontWeight: "700" }}>
                                Designation #{rule.designation_id}
                              </span>
                            )}
                            {rule.department_id && (
                              <span style={{ padding: "1px 7px", borderRadius: "5px", background: "#fef3c7", color: "#92400e", fontWeight: "700" }}>
                                Dept
                              </span>
                            )}
                            {rule.branch_id && (
                              <span style={{ padding: "1px 7px", borderRadius: "5px", background: "#f5f3ff", color: "#5b21b6", fontWeight: "700" }}>
                                Branch
                              </span>
                            )}
                            {rule.designation_id == null && !rule.department_id && !rule.branch_id && (
                              <span style={{ color: "#94a3b8" }}>Empty rule</span>
                            )}
                          </>
                        )}
                      </div>
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