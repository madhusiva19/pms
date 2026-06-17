"use client";

/**
 * TemplateHistoryPage.tsx
 *
 * Displays all past-cycle templates grouped by PMS year.
 * Templates appear as compact horizontally-scrollable cards.
 * Only "View" is available — past-cycle templates are permanently frozen.
 */

import { useEffect, useState, useMemo ,useRef} from "react";
import { useRouter }                    from "next/navigation";
import {
  History,
  Lock,
  Eye,
  FileText,
  Loader2,
  Inbox,
  Archive,
  ArrowLeft,
  CalendarDays,
  Users,
  Building2,
  GitBranch,
  Globe,
  Tag,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { toast }      from "sonner";
import styles         from "./TemplateHistoryPage.module.css";
import Sidebar        from "@/components/sidebar/Sidebar";
import Breadcrumb     from "@/components/breadcrumb/Breadcrumb";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

const ROLE_PREFIXES: Readonly<Record<number, string>> = {
  1: "/hq-admin",
  2: "/country-admin",
  3: "/branch-admin",
  4: "/dept-admin",
  5: "/sub-dept-admin",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryTemplate {
  id:                    number;
  name:                  string;
  description?:          string;
  pms_cycle_id?:         number | null;
  pms_year?:             string | null;
  lastModified?:         string;
  created_at?:           string;
  is_past_cycle?:        boolean;
  freeze_status?:        string;
  assignedDesignations?: string[];
  assignedDepartments?:  { id: string; name: string }[];
  assignedBranches?:     { id: string; name: string; code?: string | null }[];
  assignedCountries?:    { id: string; name: string; code?: string | null }[];
  categories?:           any[];
  total_weight?:         number;
}

interface CycleGroup {
  pmsYear:   string;
  cycleId:   number | null;
  templates: HistoryTemplate[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolvePmsYearLabel(
  template:    HistoryTemplate,
  allCycles:   any[],
  activeCycle: any,
): string {
  if (template.pms_year) return String(template.pms_year);

  if (template.pms_cycle_id) {
    const matched = allCycles.find(c => c.id === template.pms_cycle_id);
    if (matched?.pms_year) return String(matched.pms_year);
    if (matched?.pms_start) {
      const y = new Date(matched.pms_start).getFullYear();
      return `${y}/${y + 1}`;
    }
  }

  if (activeCycle?.pms_year) return String(activeCycle.pms_year);
  if (activeCycle?.pms_start) {
    const y = new Date(activeCycle.pms_start).getFullYear();
    return `${y}/${y + 1}`;
  }

  return "Unknown";
}

function formatShortDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "2-digit",
  });
}

// ─── CompactHistoryCard ───────────────────────────────────────────────────────

/**
 * Small archive card: name, year, frozen badge, assignment summary, view button.
 * No category/KPI counts — kept intentionally minimal.
 */
function CompactHistoryCard({
  template,
  pmsYear,
  onView,
}: {
  template: HistoryTemplate;
  pmsYear:  string;
  onView:   () => void;
}) {
  // Build a short assignment summary (icons only + count)
  const hasDesignations = (template.assignedDesignations?.length ?? 0) > 0;
  const hasDepartments  = (template.assignedDepartments?.length  ?? 0) > 0;
  const hasBranches     = (template.assignedBranches?.length     ?? 0) > 0;
  const hasCountries    = (template.assignedCountries?.length    ?? 0) > 0;

  const totalAssigned =
    (template.assignedDesignations?.length ?? 0) +
    (template.assignedDepartments?.length  ?? 0) +
    (template.assignedBranches?.length     ?? 0) +
    (template.assignedCountries?.length    ?? 0);

  const updatedDate = formatShortDate(template.lastModified ?? template.created_at);

  return (
    <div className={styles.histCard}>
      {/* Frozen accent strip */}
      <div className={styles.histCardStrip} />

      {/* Top row: icon + frozen pill */}
      <div className={styles.histCardTopRow}>
        <div className={styles.histCardIconWrap}>
          <FileText size={13} />
        </div>
        <span className={styles.histFrozenPill}>
          <Lock size={8} />
          Frozen
        </span>
      </div>

      {/* Template name */}
      <p className={styles.histCardName} title={template.name}>
        {template.name}
      </p>

      {/* Year + updated date */}
      <div className={styles.histCardMeta}>
        <span className={styles.histCardMetaItem}>
          <CalendarDays size={9} />
          {pmsYear}
        </span>
        <span className={styles.histCardMetaDot} />
        <span className={styles.histCardMetaItem}>
          {updatedDate}
        </span>
      </div>

      {/* Assignment icon row (only if assigned) */}
      {totalAssigned > 0 && (
        <div className={styles.histCardAssignRow}>
          {hasDesignations && (
            <span className={styles.histAssignBadge} title={`${template.assignedDesignations!.length} designation(s)`}>
              <Tag size={8} />
              {template.assignedDesignations!.length}
            </span>
          )}
          {hasDepartments && (
            <span className={styles.histAssignBadge} title={`${template.assignedDepartments!.length} department(s)`}>
              <Building2 size={8} />
              {template.assignedDepartments!.length}
            </span>
          )}
          {hasBranches && (
            <span className={styles.histAssignBadge} title={`${template.assignedBranches!.length} branch(es)`}>
              <GitBranch size={8} />
              {template.assignedBranches!.length}
            </span>
          )}
          {hasCountries && (
            <span className={styles.histAssignBadge} title={`${template.assignedCountries!.length} country/countries`}>
              <Globe size={8} />
              {template.assignedCountries!.length}
            </span>
          )}
        </div>
      )}

      {/* View button */}
      <button className={styles.histViewBtn} onClick={onView}>
        <Eye size={10} />
        View
      </button>
    </div>
  );
}

// ─── CycleHistoryRow ──────────────────────────────────────────────────────────
function CycleHistoryRow({
  group,
  animDelay,
  onView,
}: {
  group:      CycleGroup;
  animDelay:  number;
  onView:     (id: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scroll(dir: "left" | "right") {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 320 : -320, behavior: "smooth" });
  }

  return (
    <div className={styles.cycleRow} style={{ animationDelay: `${animDelay}ms` }}>
      {/* Row header */}
      <div className={styles.cycleRowHeader}>
        <div className={styles.cycleRowLeft}>
          <div className={styles.cycleYearBadge}>
            <Archive size={11} strokeWidth={3} />
            <span>Appraisal Year {group.pmsYear}</span>
          </div>
          <span className={styles.cycleCount}>
            {group.templates.length} template{group.templates.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className={styles.cycleRowRight}>
          <Lock size={10} />
          <span>Permanently Frozen</span>
        </div>
      </div>

      {/* Scroll area with arrows */}
      <div className={styles.scrollWrapper}>
        <button className={`${styles.scrollArrow} ${styles.scrollArrowLeft}`} onClick={() => scroll("left")}>
          <ChevronLeft size={18} />
        </button>

        <div className={styles.cycleScrollArea} ref={scrollRef}>
          <div className={styles.cycleCardTrack}>
            {group.templates.map(t => (
              <CompactHistoryCard
                key={t.id}
                template={t}
                pmsYear={group.pmsYear}
                onView={() => onView(t.id)}
              />
            ))}
          </div>
        </div>

        <button className={`${styles.scrollArrow} ${styles.scrollArrowRight}`} onClick={() => scroll("right")}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

// ─── TemplateHistoryPage ──────────────────────────────────────────────────────

export default function TemplateHistoryPage({ level = 1 }: { level?: number }) {
  const router = useRouter();

  const [templates,   setTemplates]   = useState<HistoryTemplate[]>([]);
  const [allCycles,   setAllCycles]   = useState<any[]>([]);
  const [activeCycle, setActiveCycle] = useState<any>(null);
  const [isLoading,   setIsLoading]   = useState(true);

  const rolePrefix = ROLE_PREFIXES[level] ?? "/hq-admin";

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load(): Promise<void> {
      try {
        setIsLoading(true);

        const [templateRes, cycleRes, allCyclesRes] = await Promise.all([
          fetch(`${API_BASE}/templates`),
          fetch(`${API_BASE}/pms-cycles/active`),
          fetch(`${API_BASE}/pms-cycles`),
        ]);

        if (!templateRes.ok) throw new Error("Failed to load templates");

        const raw: HistoryTemplate[] = await templateRes.json();
        // Only past-cycle (frozen archived) templates
        setTemplates(raw.filter(t => t.is_past_cycle === true));

        if (cycleRes.ok)     setActiveCycle(await cycleRes.json());
        if (allCyclesRes.ok) setAllCycles(await allCyclesRes.json());
      } catch {
        toast.error("Could not load template history. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // ── Group by PMS year, newest first ───────────────────────────────────────
  const cycleGroups = useMemo((): CycleGroup[] => {
    const map = new Map<string, { cycleId: number | null; templates: HistoryTemplate[] }>();

    templates.forEach(t => {
      const label = resolvePmsYearLabel(t, allCycles, activeCycle);
      if (!map.has(label)) {
        map.set(label, { cycleId: t.pms_cycle_id ?? null, templates: [] });
      }
      map.get(label)!.templates.push(t);
    });

    return [...map.entries()]
      .map(([pmsYear, data]) => ({ pmsYear, ...data }))
      .sort((a, b) => b.pmsYear.localeCompare(a.pmsYear));
  }, [templates, allCycles, activeCycle]);

  function handleViewTemplate(id: number): void {
    router.push(
      `${rolePrefix}/template-management/template-creation?edit=${id}&mode=view`,
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <Breadcrumb />
        <div className={styles.wrapper}>

          {/* ── Page header ── */}
          <div className={styles.pageHeader}>
  <div className={styles.titleRow}>
    <div className={styles.titleIcon}>
      <History size={20} />
    </div>
    <div style={{ flex: 1 }}>
      <h1 className={styles.pageTitle}>Template History</h1>
      <p className={styles.pageSubtitle}>
        Archived templates from previous PMS cycles — permanently frozen, view only
      </p>
    </div>
    <button
      className={styles.backBtn}
      onClick={() => router.push(`${rolePrefix}/template-management`)}
    >
      <ArrowLeft size={13} />
      Back to Templates
    </button>
  </div>

            {/* Summary strip */}
           {!isLoading && (
  <div className={styles.statsBar}>
    <div className={`${styles.statBarCell} ${styles.statBarCellTotal}`}>
      <span className={styles.statBarValue}>{templates.length}</span>
      <span className={styles.statBarLabel}>Archived Templates</span>
    </div>
    <div className={`${styles.statBarCell} ${styles.statBarCellCycles}`}>
      <span className={styles.statBarValue}>{cycleGroups.length}</span>
      <span className={styles.statBarLabel}>Past Cycles</span>
    </div>
    <div className={`${styles.statBarCell} ${styles.statBarCellLock}`}>
      <Lock size={20} color="#ea580c" />
      <span className={styles.statBarLabel}>No Edits Permitted</span>
    </div>
  </div>
)}
          </div>

          {/* ── Body ── */}
          {isLoading ? (
            <div className={styles.loadingState}>
              <Loader2 size={28} className={styles.spinner} />
              <p>Loading archived templates…</p>
            </div>
          ) : cycleGroups.length === 0 ? (
            <div className={styles.emptyState}>
              <Inbox size={44} />
              <h3>No Archived Templates</h3>
              <p>Past-cycle templates will appear here once a new PMS cycle is opened.</p>
            </div>
          ) : (
            <div className={styles.groupList}>
              {cycleGroups.map((group, i) => (
                <CycleHistoryRow
                  key={group.pmsYear}
                  group={group}
                  animDelay={i * 70}
                  onView={handleViewTemplate}
                />
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}