"use client";

// components/TemplateDashboardBase.tsx

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Search, FileText, Pencil, Trash2,
  Lock, Loader2, Inbox, Target,
  Calendar, Copy, BookOpen,
  CheckCircle2, Clock3,
  Eye, ChevronDown, ChevronUp,
  Layers, Unlock,
  Bell, Users, Building2, BarChart3,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import styles from "./TemplateDashboardBase.module.css";
import {
  computeFreezeDates,
  getTemplatePermissions,
  formatDate,
  daysUntil,
  type TemplatePermissions,
} from "@/lib/freezeUtils";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

const CATEGORY_PALETTE = [
  { bg: "#eff6ff", fill: "#3b82f6", text: "#1e40af" },
  { bg: "#ecfdf5", fill: "#059669", text: "#065f46" },
  { bg: "#fef3c7", fill: "#d97706", text: "#92400e" },
  { bg: "#f5f3ff", fill: "#8b5cf6", text: "#5b21b6" },
  { bg: "#fff1f2", fill: "#f43f5e", text: "#be123c" },
  { bg: "#ecfeff", fill: "#0891b2", text: "#164e63" },
];



// ─── Types ────────────────────────────────────────────────────────────────────

interface TemplateDashboardBaseProps {
  level: number;
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
  assignedRoles?:          string[];
  assignedDepartments?:    string[];
  assignedRolesIds?:       number[];
  assignedDepartmentsIds?: number[];
  assignedCount?:          number;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TemplateDashboardBase({ level }: TemplateDashboardBaseProps) {
  const router = useRouter();

  const [templates,       setTemplates]       = useState<TemplateRecord[]>([]);
  const [searchQuery,     setSearchQuery]      = useState("");
  const [confirmDeleteId, setConfirmDeleteId]  = useState<number | null>(null);
  const [isLoading,       setIsLoading]        = useState(true);
  const [expandedCardId,  setExpandedCardId]   = useState<number | null>(null);
  const [expandedAssignId, setExpandedAssignId] = useState<number | null>(null);
  const [isDuplicating,   setIsDuplicating]    = useState<number | null>(null);
  const [activeCycle,     setActiveCycle]      = useState<any>(null);

  const freezeDates  = useMemo(() => computeFreezeDates(new Date()), []);
  const permissions: TemplatePermissions = useMemo(
    () => getTemplatePermissions(level, freezeDates),
    [level, freezeDates],
  );

  // ── Fetch templates ────────────────────────────────────────────────────────

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

  // ── Filtered list ──────────────────────────────────────────────────────────

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

  // ── Navigation ─────────────────────────────────────────────────────────────

  const handleViewTemplate = (templateId: number) =>
    router.push(`/hq-admin/create-template?edit=${templateId}&mode=view`);

  const handleEditTemplate = (templateId: number) => {
    if (!permissions.canEdit) {
      toast.error(
        permissions.freezeStatus === "frozen"
          ? "Templates are fully frozen — no edits allowed until next PMS cycle."
          : "You do not have permission to edit templates.",
      );
      return;
    }
    router.push(`/hq-admin/create-template?edit=${templateId}`);
  };

  // ── Duplicate ──────────────────────────────────────────────────────────────

  const handleDuplicateTemplate = async (template: TemplateRecord) => {
    if (!permissions.canCreate) {
      toast.error("Templates are frozen — duplication not permitted right now.");
      return;
    }
    setIsDuplicating(template.id);
    try {
      const payload = {
        name:         `${template.name} (Copy)`,
        description:  template.description ?? "",
        max_score:    template.max_score ?? 5,
        categories:   template.categories ?? [],
        trainingTags: [],
        totalWeight:  template.total_weight ?? 0,
        lastModified: new Date().toISOString(),
      };
      const res = await fetch(`${API_BASE}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Duplicate failed");
      const created = await res.json();
      setTemplates((prev) => [created, ...prev]);
      toast.success(`"${template.name}" Duplicated Successfully`);
    } catch (err: any) {
      toast.error(err.message ?? "Could not Duplicate Template");
    } finally {
      setIsDuplicating(null);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

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
      const response = await fetch(`${API_BASE}/templates/${templateId}`, {
        method: "DELETE",
      });
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

  // ── Period wrapper class ───────────────────────────────────────────────────
  // The outer container changes colour per freeze period; cards stay white.

  const periodWrapperClass =
    permissions.freezeStatus === "frozen"
      ? styles.periodFrozen
      : permissions.freezeStatus === "grace"
      ? styles.periodGrace
      : styles.periodOpen;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.wrapper}>

      {/* Delete confirmation modal */}
      {confirmDeleteId !== null && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
          <div className={styles.modalCard}>
            <div className={styles.modalIconWrapper}>
              <Trash2 size={22} color="#ef4444" />
            </div>
            <h3 id="delete-modal-title" className={styles.modalTitle}>Delete Template?</h3>
            <p className={styles.modalText}>
              This action cannot be undone. All assignments linked to this template will also be removed.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className={styles.modalDeleteBtn} onClick={() => handleDeleteTemplate(confirmDeleteId)}>
                Delete Template
              </button>
            </div>
          </div>
        </div>
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
            {permissions.freezeStatus === "open"
              ? <span className={styles.subtitleNote}>Objective window closes <strong>{formatDate(freezeDates.objectiveSettingEnd)}</strong></span>
              : permissions.freezeStatus === "grace"
              ? <span className={styles.subtitleNoteAmber}>Grace period until <strong>{formatDate(freezeDates.graceEnd)}</strong></span>
              : <span className={styles.subtitleNoteFrozen}>Templates frozen — read only</span>}
          </p>
        </div>

        <div className={styles.headerActions}>
          <CycleStatusBadge status={permissions.freezeStatus} level={level} />
          {permissions.canCreate && (
            <button className={styles.createBtn} onClick={() => router.push("/hq-admin/create-template")}>
              + Create New Template
            </button>
          )}
        </div>
      </div>

      {/* ── Status banners ── */}
      <StatusBanner permissions={permissions} freezeDates={freezeDates} level={level} />

      {/* ── Combined PMS Timeline + Notification Cascade ── */}
      {!isLoading && (
        <PmsCycleTimeline
          freezeDates={freezeDates}
          activeCycle={activeCycle}
          templateCount={templates.length}
          permissions={permissions}
        />
      )}

      {/* ── Search — white card matching template cards ── */}
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
            <button className={styles.searchClear} onClick={() => setSearchQuery("")} aria-label="Clear search">
              ×
            </button>
          )}
          {!isLoading && (
            <span className={styles.searchCount}>
              {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Period wrapper — changes background per freeze state ── */}
      <div className={`${styles.periodWrapper} ${periodWrapperClass}`}>

        {/* ── Content ── */}
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
                onToggleCategoryExpand={() =>
                  setExpandedCardId(expandedCardId === template.id ? null : template.id)
                }
                onToggleAssignExpand={() =>
                  setExpandedAssignId(expandedAssignId === template.id ? null : template.id)
                }
                onView={() => handleViewTemplate(template.id)}
                onEdit={() => handleEditTemplate(template.id)}
                onDelete={() => {
                  if (permissions.canDelete) {
                    setConfirmDeleteId(template.id);
                  } else {
                    toast.error("Templates are frozen — deletion is not permitted until the next PMS cycle.");
                  }
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
// Combines the progress bar, milestone boxes, and notification cascade
// into a single unified section. Replaces PmsCycleDatesBar + NotificationTimeline.
function PmsCycleTimeline({
  freezeDates,
  activeCycle,
  templateCount,
  permissions,
}: {
  freezeDates:   any;
  activeCycle:   any;
  templateCount: number;
  permissions:   TemplatePermissions;
}) {
  const now = new Date();

  // ── Derive notification stages from freezeDates (no hardcoded dates) ──────
  // freezeDates.notificationDates comes from freezeConfig via computeFreezeDates
  // Shape: { role: string; date: Date }[]
  // We map role names to match the display labels used in the UI
  const notificationStages: { roleLabel: string; date: Date }[] =
    (freezeDates.notificationDates ?? []).map(
      (n: { role: string; date: Date }) => ({
        roleLabel: n.role,
        date:      n.date,
      })
    );

  // Progress bar: 0–100% across the full PMS year
  const yearStart = freezeDates.pmsYearStart.getTime();
  const yearEnd   = activeCycle?.year_end_review
    ? new Date(activeCycle.year_end_review).getTime()
    : new Date(freezeDates.pmsYearStart.getFullYear() + 1, 2, 31).getTime();

  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((now.getTime() - yearStart) / (yearEnd - yearStart)) * 100)),
  );

  // Which milestone box is currently active
  const activeMilestone =
    now < freezeDates.objectiveSettingEnd ? "objective"
    : now < freezeDates.graceEnd         ? "grace"
    : activeCycle?.mid_year_review && now < new Date(activeCycle.mid_year_review) ? "frozen"
    : activeCycle?.year_end_review && now < new Date(activeCycle.year_end_review) ? "midyear"
    : "yearend";

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
      date:  activeCycle?.mid_year_review
        ? formatDate(new Date(activeCycle.mid_year_review))
        : "Not set",
      icon:  <BarChart3 size={14} />,
    },
    {
      key:   "yearend",
      label: "Year-End Review",
      date:  activeCycle?.year_end_review
        ? formatDate(new Date(activeCycle.year_end_review))
        : "Not set",
      icon:  <CheckCircle2 size={14} />,
    },
  ];

  return (
    <div className={styles.timelineSection}>

      {/* Header row */}
      <div className={styles.timelineSectionHeader}>
        <div className={styles.timelineSectionTitleGroup}>
          <TrendingUp size={15} color="#3b82f6" />
          <span className={styles.timelineSectionTitle}>PMS Cycle Timeline</span>
          <span className={styles.timelineSectionTag}>
            {freezeDates.pmsYearStart.getFullYear()} / {freezeDates.pmsYearStart.getFullYear() + 1}
          </span>
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

      {/* Milestone boxes */}
      <div className={styles.milestoneGrid}>
        {milestones.map((m) => (
          <div
            key={m.key}
            data-key={m.key}
            className={`${styles.milestoneBox} ${activeMilestone === m.key ? styles.milestoneBoxActive : ""}`}
          >
            <div className={styles.milestoneBoxIcon}>{m.icon}</div>
            <div className={styles.milestoneBoxLabel}>{m.label}</div>
            <div className={styles.milestoneBoxDate}>{m.date}</div>
            {activeMilestone === m.key && (
              <div className={styles.milestoneBoxNow}>Now</div>
            )}
          </div>
        ))}
      </div>

    </div>
  );
}

// ─── Cycle Status Badge ───────────────────────────────────────────────────────

function CycleStatusBadge({ status, level }: { status: string; level: number }) {
  if (status === "open") {
    return (
      <span className={`${styles.statusPill} ${styles.statusPillOpen}`}>
        <CheckCircle2 size={13} />
        Open
      </span>
    );
  }
  if (status === "grace") {
    return (
      <span className={`${styles.statusPill} ${styles.statusPillGrace}`}>
        <Clock3 size={13} />
        Grace Period
      </span>
    );
  }
  return (
    <span className={`${styles.statusPill} ${styles.statusPillFrozen}`}>
      <Lock size={13} />
      Frozen
    </span>
  );
}

// ─── Status Banner ────────────────────────────────────────────────────────────

function StatusBanner({
  permissions, freezeDates, level,
}: {
  permissions: TemplatePermissions;
  freezeDates: any;
  level:       number;
}) {
  if (permissions.freezeStatus === "frozen") {
    return (
      <div className={`${styles.banner} ${styles.bannerFrozen}`}>
        <div className={styles.bannerIconWrapper} >
          <Lock size={18} color="#fff" />
        </div>
        <div>
          <div className={styles.bannerTitle}>Templates Frozen — Read Only</div>
          <div className={styles.bannerText}>
            Grace period ended on{" "}
            <strong style={{ color: "rgba(255,255,255,0.95)" }}>{formatDate(freezeDates.graceEnd)}</strong>.
            All templates are locked with last-set KPIs.
          </div>
        </div>
      </div>
    );
  }

  if (permissions.freezeStatus === "grace") {
    const isHqAdmin = level === 1;
    return (
      <div className={`${styles.banner} ${styles.bannerGrace}`}>
        <div className={styles.bannerIconWrapper} >
          <Clock3 size={18} color="#fff" />
        </div>
        <div>
          <div className={styles.bannerTitle}>
            {isHqAdmin ? "Grace Period Active — You May Still Edit" : "Grace Period Active — HQ Admin Only"}
          </div>
          <div className={styles.bannerText}>
            Objective-setting window closed{" "}
            <strong style={{ color: "rgba(255,255,255,0.95)" }}>{formatDate(freezeDates.objectiveSettingEnd)}</strong>.
            Hard freeze on{" "}
            <strong style={{ color: "rgba(255,255,255,0.95)" }}>{formatDate(freezeDates.graceEnd)}</strong>
            {" "}({daysUntil(freezeDates.graceEnd)} days remaining).
            {!isHqAdmin && " Only HQ Admin may make changes during this period."}
          </div>
        </div>
      </div>
    );
  }

  const daysRemaining    = daysUntil(freezeDates.objectiveSettingEnd);
  const warningThreshold = 14;

  if (daysRemaining <= warningThreshold) {
    return (
      <div className={`${styles.banner} ${styles.bannerWarning}`}>
        <div className={styles.bannerIconWrapper} >
          <Calendar size={18} color="#fff" />
        </div>
        <div className={styles.bannerText}>
          <strong>Objective-setting window closes in {daysRemaining} days</strong>
          {" "}({formatDate(freezeDates.objectiveSettingEnd)}).
          Ensure all templates are finalised before the deadline.
        </div>
      </div>
    );
  }

  return null;
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
    (sum: number, cat: any) =>
      sum + (cat.objectives?.filter((o: any) => o.control === "Locked").length ?? 0),
    0,
  );

  const totalObjectives = categories.reduce(
    (sum: number, cat: any) => sum + (cat.objectives?.length ?? 0), 0,
  );

  const editableCount = totalObjectives - lockedCount;

  const linkedCount = categories.reduce(
    (sum: number, cat: any) =>
      sum + (cat.objectives?.filter(
        (o: any) => o.trainingLinkageId !== null && o.trainingLinkageId !== undefined,
      ).length ?? 0),
    0,
  );

  const lastUpdatedDate = new Date(template.lastModified ?? template.created_at ?? Date.now());
  const lastUpdatedText = lastUpdatedDate.toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div className={styles.card}>

      {/* ── Card header ── */}
      <div className={styles.cardTop}>
        <div className={styles.cardTopInner}>
          <div className={styles.cardLeft}>
            <div className={styles.cardIconWrapper}>
              <FileText size={22} color="#3b82f6" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.cardTitle}>{template.name}</h3>
                <CycleStatusBadge status={freezeStatus} level={level} />
              </div>
              <p className={styles.cardDescription}>
                {template.description || "Standard organisational evaluation template."}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className={styles.cardActions}>
            <button className={styles.actionBtn} onClick={onView} title="View template">
              <Eye size={13} />
              <span>View</span>
            </button>

            {level === 1 && (
              <button
                className={`${styles.actionBtn} ${isFrozen ? styles.actionBtnFrozen : ""}`}
                onClick={onEdit}
                title={isFrozen ? "Editing not permitted during freeze" : "Edit template"}
              >
                <Pencil size={13} />
                <span>Edit</span>
              </button>
            )}

            {level === 1 && (
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

            {level === 1 && (
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

      {/* ── Stats row ── */}
      <div className={styles.statsRow}>
        {[
          { label: "Categories",    value: categories.length },
          { label: "Total KPIs",     value: totalObjectives },
          { label: "Locked",         value: lockedCount },
          { label: "Editable",       value: editableCount },
          { label: "Assigned Roles", value: template.assignedRoles?.length || 0 },

        ].map((stat, index) => (
          <div
            key={stat.label}
            className={styles.statCell}
            style={{ borderRight: index < 4 ? "1px solid #f1f5f9" : "none" }}
          >
            <div className={styles.statValue}>{stat.value}</div>
            <div className={styles.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* ── Training linkage + meta row ── */}
      <div className={styles.cardMeta}>
        <div className={styles.cardMetaLeft}>
          <BookOpen size={12} color="#8b5cf6" />
          <span className={styles.cardMetaLabel}>Training Linkage:</span>
          <span
            className={styles.linkageBadge}
            style={{
              color:       linkedCount === totalObjectives && totalObjectives > 0 ? "#15803d" : linkedCount > 0 ? "#b45309" : "#64748b",
              background:  linkedCount === totalObjectives && totalObjectives > 0 ? "#dcfce7" : linkedCount > 0 ? "#fef3c7" : "#f8fafc",
              borderColor: linkedCount === totalObjectives && totalObjectives > 0 ? "#bbf7d0" : linkedCount > 0 ? "#fde68a" : "#e2e8f0",
            }}
          >
            {linkedCount}/{totalObjectives} Linked
          </span>
        </div>
        <div className={styles.cardMetaRight}>
          <span className={styles.cardMetaTimestamp}>Updated: {lastUpdatedText}</span>
        </div>
      </div>

      {/* ── Expand: Category Details ── */}
      <button className={styles.expandToggle} onClick={onToggleCategoryExpand}>
        <Layers size={14} color="#3b82f6" />
        <span>{isCategoryExpanded ? "Hide" : "Show"} Category Details</span>
        {isCategoryExpanded ? <ChevronUp size={14} color="#3b82f6" /> : <ChevronDown size={14} color="#3b82f6" />}
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
            ) : categories.map((cat: any, catIndex: number) => {
              const catLocked   = (cat.objectives ?? []).filter((o: any) => o.control === "Locked").length;
              const catLinked   = (cat.objectives ?? []).filter((o: any) => o.trainingLinkageId !== null && o.trainingLinkageId !== undefined).length;
              const catObjCount = (cat.objectives ?? []).length;
              const palette     = CATEGORY_PALETTE[catIndex % CATEGORY_PALETTE.length];
              const catWeight   = cat.weight ?? (cat.objectives ?? []).reduce((s: number, o: any) => s + (Number(o.weight) || 0), 0);

              return (
                <div
                  key={catIndex}
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
                    <div style={{ height: "100%", width: `${catWeight}%`, background: palette.fill, borderRadius: "3px" }} />
                  </div>
                  <div className={styles.categoryDetailStats}>
                    <span><strong>{catObjCount}</strong> KPIs</span>
                    <span><strong>{catLocked}</strong> Locked</span>
                    <span><strong>{catLinked}/{catObjCount}</strong> Linked</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Expand: Assignments (roles + departments) ── */}
      <button className={styles.expandToggle} onClick={onToggleAssignExpand}>
        <Users size={14} color="#3b82f6" />
        <span>{isAssignExpanded ? "Hide" : "Show"} Assignments</span>
        {isAssignExpanded ? <ChevronUp size={14} color="#3b82f6" /> : <ChevronDown size={14} color="#3b82f6" />}
      </button>

      {isAssignExpanded && (
        <div className={styles.expandedSection}>
          <div className={styles.rolesDeptsSection}>
            <div className={styles.rolesDeptsGroup}>
              <div className={styles.rolesDeptsLabel}>
                <Users size={13} color="#3b82f6" />
                <span>Assigned Roles</span>
              </div>
              {template.assignedRoles && template.assignedRoles.length > 0 ? (
                <div className={styles.rolesDeptsChips}>
                  {template.assignedRoles.map((role) => (
                    <span key={role} className={styles.rolesChip}>{role}</span>
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
                    <span key={dept} className={styles.deptsChip}>{dept}</span>
                  ))}
                </div>
              ) : (
                <span className={styles.rolesDeptsEmpty}>No departments assigned</span>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}




