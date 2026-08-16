/**
 * TemplateDashboardBase.tsx
 *
 * Main dashboard component for the Template Management module.
 *
 * Key behaviours:
 *  - Newly created / recently edited templates always sort to the top.
 *  - Window "focus" event re-fetches the list so returning from
 *    template-creation or edit pages reflects changes immediately.
 *  - Duplicated templates receive a client-side "now" timestamp so
 *    they sort above all other entries right after copying.
 *  - Multi-select bulk-delete: HQ Admins can enter a "selection mode"
 *    via a button in the toolbar, tick any number of non-past-cycle,
 *    non-frozen templates and delete them in one shot.
 *
 * @module TemplateDashboardBase
 */

"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useRouter }                                          from "next/navigation";
import {
  Search,       FileText,     Pencil,       Trash2,       Lock,
  Loader2,      Inbox,        Target,       Calendar,     Copy,
  BookOpen,     CheckCircle2, Clock3,       Eye,          ChevronDown,
  ChevronUp,    Layers,       Unlock,       Award,        Users,
  Building2,    BarChart3,    TrendingUp,   GitBranch,    Settings,
  X,            Globe,        History,      SlidersHorizontal,
  Flag,         Star,         ShieldCheck,  CalendarDays, Sparkles,
  Pen,          Square,       CheckSquare,  MinusSquare,  ListChecks,
} from "lucide-react";
import { toast }                  from "sonner";
import styles                     from "./TemplateDashboardBase.module.css";
import Sidebar                    from "@/components/sidebar/Sidebar";
import LoadingSpinner             from "@/components/shared/LoadingSpinner";
import { formatDate, daysUntil }  from "@/lib/freezeUtils";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE                      = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const CLOSING_WARNING_THRESHOLD_DAYS = 14;

const CATEGORY_PALETTE: ReadonlyArray<{ bg: string; fill: string; text: string }> = [
  { bg: "#eff6ff", fill: "#3b82f6", text: "#1e40af" },
  { bg: "#ecfdf5", fill: "#059669", text: "#065f46" },
  { bg: "#fef3c7", fill: "#d97706", text: "#92400e" },
  { bg: "#f5f3ff", fill: "#8b5cf6", text: "#5b21b6" },
  { bg: "#fff1f2", fill: "#f43f5e", text: "#be123c" },
  { bg: "#ecfeff", fill: "#0891b2", text: "#164e63" },
];

const SCOPE_LABELS: Readonly<Record<string, string>> = {
  all_country_admins:  "All Country Admins",
  all_branch_admins:   "All Branch Admins",
  all_dept_admins:     "All Department Admins",
  all_sub_dept_admins: "All Sub-Department Admins",
};

const ROLE_PREFIXES: Readonly<Record<number, string>> = {
  1: "/hq-admin",
  2: "/country-admin",
  3: "/branch-admin",
  4: "/dept-admin",
  5: "/sub-dept-admin",
};

const DEFAULT_ROLE_PREFIX = "/hq-admin";

const ROLE_LABELS: Readonly<Record<number, string>> = {
  1: "HQ Administrator",
  2: "Country Administrator",
  3: "Branch Administrator",
  4: "Department Administrator",
  5: "Sub-Department Administrator",
};

// ─── Types ────────────────────────────────────────────────────────────────────

type FreezeStatus = "open" | "grace" | "frozen";

interface DynamicFreezeDates {
  pmsYearStart:        Date;
  objectiveSettingEnd: Date;
  graceEnd:            Date;
  midYearReview:       Date | null;
  yearEndReview:       Date | null;
}

interface TemplatePermissions {
  freezeStatus:    FreezeStatus;
  canEdit:         boolean;
  canCreate:       boolean;
  canDelete:       boolean;
  canEditLocked:   boolean;
  canEditEditable: boolean;
  roleLabel:       string;
}

interface AssignedDepartment {
  id: string; name: string; code: string | null; branch_id: string | null;
}

interface AssignedBranch {
  id: string; name: string; code: string | null; country_id?: string | null;
}

interface AssignedCountry {
  id: string; name: string; code: string | null;
}

interface AssignedSubDept {
  id: string; name: string; code: string | null;
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

interface UnfreezeException {
  id: number; branch_id: string | null; country_id: string | null; unfrozen_at: string | null;
}

interface TemplateVariant {
  id: number; branch_id: string | null; country_id: string | null;
  name: string | null; lastModified: string | null;
}

interface TemplateRecord {
  id:                        number;
  name:                      string;
  description?:              string;
  categories?:               any[];
  total_weight?:             number;
  max_score?:                number;
  lastModified?:             string;
  created_at?:               string;
  pms_cycle_id?:             number | null;
  pms_year?:                 string | null;
  freeze_status?:            FreezeStatus;
  is_past_cycle?:            boolean;
  assignedDesignations?:     string[];
  assignedDesignationIds?:   number[];
  assignedDepartments?:      AssignedDepartment[];
  assignedDepartmentNames?:  string[];
  assignedDepartmentsIds?:   string[];
  assignedBranches?:         AssignedBranch[];
  assignedBranchIds?:        string[];
  assignedCountries?:        AssignedCountry[];
  assignedCountryIds?:       string[];
  assignedSubDepartments?:   AssignedSubDept[];
  assignedSubDepartmentIds?: string[];
  assignedEmployees?:        string[];
  assignedEmployeeIds?:      string[];
  assignedRules?:            AssignmentRule[];
  unfrozenBranchIds?:        string[];
  unfrozenCountryIds?:       string[];
  unfreezeExceptions?:       UnfreezeException[];
  variants?:                 TemplateVariant[];
  hasVariants?:              boolean;
}

interface FilterState {
  search:       string;
  designations: string[];
  departments:  string[];
  branches:     string[];
  countries:    string[];
  years:        string[];
}

// ─── Pure Utility Functions ───────────────────────────────────────────────────

function getRolePrefix(level: number): string {
  return ROLE_PREFIXES[level] ?? DEFAULT_ROLE_PREFIX;
}

function sortByLastModified<T extends { lastModified?: string; created_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const dateA = a.lastModified ?? a.created_at;
    const dateB = b.lastModified ?? b.created_at;
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });
}

function buildFreezeDates(activeCycle: any): DynamicFreezeDates {
  const now          = new Date();
  const fallbackYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  if (!activeCycle?.id && activeCycle?.source === "none") {
    const pastDate = new Date(2000, 0, 1);
    return {
      pmsYearStart:        new Date(fallbackYear, 3, 1),
      objectiveSettingEnd: pastDate,
      graceEnd:            pastDate,
      midYearReview:       null,
      yearEndReview:       null,
    };
  }

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
    yearEndReview: activeCycle?.year_end_review  ? new Date(activeCycle.year_end_review)  : null,
  };
}

function computePermissions(level: number, freezeDates: DynamicFreezeDates): TemplatePermissions {
  const now = new Date();

  const freezeStatus: FreezeStatus =
    now <= freezeDates.objectiveSettingEnd ? "open"
    : now <= freezeDates.graceEnd          ? "grace"
    :                                        "frozen";

  const isHqAdmin    = level === 1;
  const isNonHqAdmin = level >= 2 && level <= 5;

  const canEditLocked   = isHqAdmin && freezeStatus !== "frozen";
  const canEditEditable =
    (isHqAdmin    && freezeStatus !== "frozen") ||
    (isNonHqAdmin && freezeStatus === "open");

  return {
    freezeStatus,
    canEdit:         canEditEditable,
    canCreate:       isHqAdmin && freezeStatus !== "frozen",
    canDelete:       isHqAdmin && freezeStatus !== "frozen",
    canEditLocked,
    canEditEditable,
    roleLabel:       ROLE_LABELS[level] ?? "Administrator",
  };
}

function resolvePmsYearLabel(template: TemplateRecord, allCycles: any[], activeCycle: any): string {
  if (template.pms_year) return template.pms_year;
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

// ─── FilterDropdown ───────────────────────────────────────────────────────────

function FilterDropdown({
  label, icon, options, selected, onChange,
}: {
  label:    string;
  icon:     React.ReactNode;
  options:  string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef        = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleOutsideClick);
    return ()  => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  function toggleOption(value: string): void {
    onChange(selected.includes(value) ? selected.filter(i => i !== value) : [...selected, value]);
  }

  const hasSelection = selected.length > 0;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className={[
          styles.dropdownTrigger,
          hasSelection ? styles.dropdownTriggerActive : "",
          isOpen       ? styles.dropdownTriggerOpen   : "",
        ].join(" ")}
      >
        {icon}
        {label}
        {hasSelection && (
          <span className={styles.dropdownBadge}>{selected.length}</span>
        )}
        <ChevronDown
          size={13}
          className={[
            styles.dropdownChevron,
            isOpen ? styles.dropdownChevronOpen : "",
          ].join(" ")}
        />
      </button>

      {isOpen && (
        <div className={styles.dropdownPanel}>
          <div className={styles.dropdownHeader}>
            <span className={styles.dropdownHeaderTitle}>{label}</span>
            {hasSelection && (
              <button
                className={styles.dropdownClearBtn}
                onClick={() => { onChange([]); setIsOpen(false); }}
              >
                Clear all
              </button>
            )}
          </div>

          <div className={styles.dropdownOptions}>
            {options.length === 0
              ? <p className={styles.dropdownEmpty}>No options available</p>
              : options.map(option => {
                  const isChecked = selected.includes(option);
                  return (
                    <label
                      key={option}
                      className={[
                        styles.dropdownOption,
                        isChecked ? styles.dropdownOptionChecked : "",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOption(option)}
                        className={styles.dropdownOptionCheckbox}
                      />
                      <span
                        className={[
                          styles.dropdownOptionLabel,
                          isChecked ? styles.dropdownOptionLabelChecked : "",
                        ].join(" ")}
                      >
                        {option}
                      </span>
                      {isChecked && <CheckCircle2 size={12} className={styles.dropdownOptionCheck} />}
                    </label>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ActiveFilterChip ─────────────────────────────────────────────────────────

function ActiveFilterChip({
  label, category, colorClass, onRemove,
}: {
  label:      string;
  category:   string;
  colorClass: string;
  onRemove:   () => void;
}) {
  return (
    <span className={`${styles.chip} ${colorClass}`}>
      <span className={styles.chipCategory}>{category}:</span>
      {label}
      <button
        className={styles.chipRemoveBtn}
        onClick={onRemove}
        aria-label={`Remove ${category} filter: ${label}`}
      >
        <X size={10} />
      </button>
    </span>
  );
}

// ─── HorizontalFilterBar ──────────────────────────────────────────────────────

function HorizontalFilterBar({
  filters, onFilterChange, allDesignations, allDepartments,
  allBranches, allCountries, allYears, totalCount, filteredCount, isLoading,
}: {
  filters:         FilterState;
  onFilterChange:  (updated: FilterState) => void;
  allDesignations: string[];
  allDepartments:  string[];
  allBranches:     string[];
  allCountries:    string[];
  allYears:        string[];
  totalCount:      number;
  filteredCount:   number;
  isLoading:       boolean;
}) {
  const activeFilterCount =
    filters.designations.length + filters.departments.length +
    filters.branches.length     + filters.countries.length   +
    filters.years.length;

  function clearDropdownFilters(): void {
    onFilterChange({
      search:       filters.search,
      designations: [],
      departments:  [],
      branches:     [],
      countries:    [],
      years:        [],
    });
  }

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterRow}>

        <div className={styles.searchWrapper}>
          <Search size={15} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search templates…"
            value={filters.search}
            onChange={e => onFilterChange({ ...filters, search: e.target.value })}
            className={styles.searchInput}
            aria-label="Search templates"
          />
          {filters.search && (
            <button
              className={styles.searchClearBtn}
              onClick={() => onFilterChange({ ...filters, search: "" })}
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <div className={styles.divider} />
        <div className={styles.filterLabel}>
          <SlidersHorizontal size={14} />
          <span>Filter by:</span>
        </div>

        <FilterDropdown label="Designation" icon={<Users        size={13} />} options={allDesignations} selected={filters.designations} onChange={v => onFilterChange({ ...filters, designations: v })} />
        <FilterDropdown label="Department"  icon={<Building2    size={13} />} options={allDepartments}  selected={filters.departments}  onChange={v => onFilterChange({ ...filters, departments: v })} />
        <FilterDropdown label="Branch"      icon={<GitBranch    size={13} />} options={allBranches}     selected={filters.branches}     onChange={v => onFilterChange({ ...filters, branches: v })} />
        <FilterDropdown label="Country"     icon={<Globe        size={13} />} options={allCountries}    selected={filters.countries}    onChange={v => onFilterChange({ ...filters, countries: v })} />
        <FilterDropdown label="PMS Year"    icon={<CalendarDays size={13} />} options={allYears}        selected={filters.years}        onChange={v => onFilterChange({ ...filters, years: v })} />

        {activeFilterCount > 0 && (
          <button className={styles.clearFiltersBtn} onClick={clearDropdownFilters}>
            <X size={12} />
            Clear filters
            <span className={styles.clearFiltersBadge}>{activeFilterCount}</span>
          </button>
        )}

        {!isLoading && (
          <span className={styles.resultCount}>
            {filteredCount !== totalCount ? (
              <>
                <strong className={styles.resultCountBold}>{filteredCount}</strong>
                {" of "}
                {totalCount} templates{" "}
                <span className={styles.resultCountFiltered}>filtered</span>
              </>
            ) : (
              <>
                <strong className={styles.resultCountBold}>{totalCount}</strong>
                {" template"}{totalCount !== 1 ? "s" : ""}
              </>
            )}
          </span>
        )}
      </div>

      {activeFilterCount > 0 && (
        <div className={styles.chipsRow}>
          <span className={styles.chipsRowLabel}>Active:</span>
          {filters.designations.map(d => (
            <ActiveFilterChip key={`d-${d}`}  label={d} category="Designation" colorClass={styles.chipDesignation} onRemove={() => onFilterChange({ ...filters, designations: filters.designations.filter(x => x !== d) })} />
          ))}
          {filters.departments.map(d => (
            <ActiveFilterChip key={`dp-${d}`} label={d} category="Department"  colorClass={styles.chipDepartment}  onRemove={() => onFilterChange({ ...filters, departments:  filters.departments.filter(x => x !== d) })} />
          ))}
          {filters.branches.map(b => (
            <ActiveFilterChip key={`b-${b}`}  label={b} category="Branch"      colorClass={styles.chipBranch}      onRemove={() => onFilterChange({ ...filters, branches:     filters.branches.filter(x => x !== b) })} />
          ))}
          {filters.countries.map(c => (
            <ActiveFilterChip key={`c-${c}`}  label={c} category="Country"     colorClass={styles.chipCountry}     onRemove={() => onFilterChange({ ...filters, countries:    filters.countries.filter(x => x !== c) })} />
          ))}
          {filters.years.map(y => (
            <ActiveFilterChip key={`y-${y}`}  label={y} category="PMS Year"    colorClass={styles.chipYear ?? styles.chipBranch} onRemove={() => onFilterChange({ ...filters, years: filters.years.filter(x => x !== y) })} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Milestone Configuration ──────────────────────────────────────────────────

const buildMilestones = (freezeDates: DynamicFreezeDates) => [
  {
    key:        "start",
    label:      "Cycle Start",
    shortDate:  freezeDates.pmsYearStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    icon:       <Flag      size={22} />,
    bgGradient: "linear-gradient(135deg,#6366f1,#818cf8)",
    shadow:     "rgba(99,102,241,0.35)",
    iconBg:     "#eef2ff",
    iconColor:  "#6366f1",
  },
  {
    key:        "objective",
    label:      "Objective Setting",
    shortDate:  freezeDates.objectiveSettingEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    icon:       <Target    size={22} />,
    bgGradient: "linear-gradient(135deg,#0ea5e9,#38bdf8)",
    shadow:     "rgba(14,165,233,0.35)",
    iconBg:     "#e0f2fe",
    iconColor:  "#0ea5e9",
  },
  {
    key:        "grace",
    label:      "Grace Period",
    shortDate:  freezeDates.graceEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    icon:       <Clock3    size={22} />,
    bgGradient: "linear-gradient(135deg,#f59e0b,#fbbf24)",
    shadow:     "rgba(245,158,11,0.35)",
    iconBg:     "#fef3c7",
    iconColor:  "#d97706",
  },
  {
    key:        "frozen",
    label:      "Templates Frozen",
    shortDate:  freezeDates.graceEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    icon:       <Lock      size={22} />,
    bgGradient: "linear-gradient(135deg,#1e3a8a,#3b5bdb)",
    shadow:     "rgba(30,58,138,0.35)",
    iconBg:     "#dbeafe",
    iconColor:  "#1e3a8a",
  },
  {
    key:        "midyear",
    label:      "Mid-Year Review",
    shortDate:  freezeDates.midYearReview
      ? freezeDates.midYearReview.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "—",
    icon:       <BarChart3 size={22} />,
    bgGradient: "linear-gradient(135deg,#f43f5e,#fb7185)",
    shadow:     "rgba(244,63,94,0.35)",
    iconBg:     "#ffe4e6",
    iconColor:  "#f43f5e",
  },
  {
    key:        "yearend",
    label:      "Year-End Review",
    shortDate:  freezeDates.yearEndReview
      ? freezeDates.yearEndReview.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
      : "—",
    icon:       <Star      size={22} />,
    bgGradient: "linear-gradient(135deg,#8b5cf6,#a78bfa)",
    shadow:     "rgba(139,92,246,0.35)",
    iconBg:     "#f3e8ff",
    iconColor:  "#8b5cf6",
  },
];

// ─── PmsCyclePanel ────────────────────────────────────────────────────────────

function PmsCyclePanel({
  freezeDates, activeCycle, templateCount, permissions, level,
}: {
  freezeDates:   DynamicFreezeDates;
  activeCycle:   any;
  templateCount: number;
  permissions:   TemplatePermissions;
  level:         number;
}) {
  const now            = new Date();
  const cycleYearLabel = `${freezeDates.pmsYearStart.getFullYear()} / ${freezeDates.pmsYearStart.getFullYear() + 1}`;
  const yearStart      = freezeDates.pmsYearStart.getTime();
  const yearEnd        = freezeDates.yearEndReview?.getTime()
    ?? new Date(freezeDates.pmsYearStart.getFullYear() + 1, 2, 31).getTime();
  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((now.getTime() - yearStart) / (yearEnd - yearStart)) * 100)),
  );

  const activeMilestoneKey =
    now < freezeDates.objectiveSettingEnd ? "objective"
    : now < freezeDates.graceEnd          ? "grace"
    : (freezeDates.midYearReview && now < freezeDates.midYearReview) ? "frozen"
    : (freezeDates.yearEndReview  && now < freezeDates.yearEndReview) ? "midyear"
    : "yearend";

  const milestones = buildMilestones(freezeDates);

  return (
    <div className={styles.cyclePanelWrapper}>
      <div className={styles.cyclePanelLeft}>
        <div className={styles.cyclePanelLeftTop}>
          <div className={styles.cyclePanelYearBadge}>
            <TrendingUp size={13} />
            <span>Annual Appraisal Cycle</span>
          </div>
          <div className={styles.cyclePanelYear}>{cycleYearLabel}</div>
          <p className={styles.cyclePanelDesc}>
            Performance Management System cycle tracking all templates, objectives, and review milestones.
          </p>
        </div>

        <div className={styles.cyclePanelStats}>
          <div className={styles.cyclePanelStat}>
            <span className={styles.cyclePanelStatValue}>{templateCount}</span>
            <span className={styles.cyclePanelStatLabel}>Active Templates</span>
          </div>
          <div className={styles.cyclePanelStatDivider} />
          <div className={styles.cyclePanelStat}>
            <span className={styles.cyclePanelStatValue}>{progressPercent}%</span>
            <span className={styles.cyclePanelStatLabel}>Cycle Progress</span>
          </div>
        </div>

        <div className={styles.cyclePanelProgressTrack}>
          <div className={styles.cyclePanelProgressFill} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className={styles.cyclePanelRight}>
        {milestones.map(milestone => {
          const isActive = activeMilestoneKey === milestone.key;
          return (
            <div
              key={milestone.key}
              className={`${styles.milestoneIconCard} ${isActive ? styles.milestoneIconCardActive : ""}`}
              style={isActive ? { background: milestone.bgGradient, boxShadow: `0 6px 20px ${milestone.shadow}` } : {}}
            >
              {isActive && <div className={styles.milestoneNowDot} />}
              <div
                className={styles.milestoneIconWrap}
                style={isActive
                  ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                  : { background: milestone.iconBg, color: milestone.iconColor }}
              >
                {milestone.icon}
              </div>
              <div
                className={styles.milestoneIconLabel}
                style={isActive ? { color: "rgba(255,255,255,0.8)" } : {}}
              >
                {milestone.label}
              </div>
              <div
                className={styles.milestoneIconDate}
                style={isActive ? { color: "#fff" } : {}}
              >
                {milestone.shortDate}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── CycleStatusBadge ─────────────────────────────────────────────────────────

function CycleStatusBadge({ status }: { status: FreezeStatus | string }) {
  if (status === "open")
    return <span className={`${styles.statusPill} ${styles.statusPillOpen}`}><CheckCircle2 size={13} /> Open</span>;
  if (status === "grace")
    return <span className={`${styles.statusPill} ${styles.statusPillGrace}`}><Clock3 size={13} /> Grace Period</span>;
  return <span className={`${styles.statusPill} ${styles.statusPillFrozen}`}><Lock size={13} /> Frozen</span>;
}

// ─── StatusBanner ─────────────────────────────────────────────────────────────

function StatusBanner({ permissions, freezeDates, level }: {
  permissions: TemplatePermissions;
  freezeDates: DynamicFreezeDates;
  level:       number;
}) {
  const isHqAdmin     = level === 1;
  const daysRemaining = daysUntil(freezeDates.objectiveSettingEnd);

  if (permissions.freezeStatus === "frozen") {
    return (
      <div className={`${styles.banner} ${styles.bannerFrozen}`}>
        <div className={styles.bannerIconWrapper}><Lock size={14} /></div>
        <div className={styles.bannerBody}>
          <span className={styles.bannerLabel}>Templates Frozen</span>
          <span className={styles.bannerDot} />
          <span className={styles.bannerText}>
            Read only — grace period ended <strong>{formatDate(freezeDates.graceEnd)}</strong>
            {isHqAdmin && " · Use Manage Freeze to unfreeze specific branches"}
          </span>
        </div>
      </div>
    );
  }

  if (permissions.freezeStatus === "grace") {
    return (
      <div className={`${styles.banner} ${styles.bannerGrace}`}>
        <div className={styles.bannerIconWrapper}><Clock3 size={14} /></div>
        <div className={styles.bannerBody}>
          <span className={styles.bannerLabel}>Grace Period Active</span>
          <span className={styles.bannerDot} />
          <span className={styles.bannerText}>
            {isHqAdmin ? "You retain edit access — " : "Read only for your role — "}
            hard freeze <strong>{formatDate(freezeDates.graceEnd)}</strong> ({daysUntil(freezeDates.graceEnd)} days)
          </span>
        </div>
      </div>
    );
  }

  if (daysRemaining <= CLOSING_WARNING_THRESHOLD_DAYS) {
    return (
      <div className={`${styles.banner} ${styles.bannerWarning}`}>
        <div className={styles.bannerIconWrapper}><Calendar size={14} /></div>
        <div className={styles.bannerBody}>
          <span className={styles.bannerLabel}>Closing Soon</span>
          <span className={styles.bannerDot} />
          <span className={styles.bannerText}>
            Objective-setting window closes in <strong>{daysRemaining} days</strong> ({formatDate(freezeDates.objectiveSettingEnd)})
            {!isHqAdmin && " · Editable objectives only"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.banner} ${styles.bannerOpen}`}>
      <div className={styles.bannerIconWrapper}><Unlock size={14} /></div>
      <div className={styles.bannerBody}>
        <span className={styles.bannerLabel}>
          {isHqAdmin ? "Objective Setting Open" : `Open — ${permissions.roleLabel}`}
        </span>
        <span className={styles.bannerDot} />
        <span className={styles.bannerText}>
          Window closes <strong>{formatDate(freezeDates.objectiveSettingEnd)}</strong>
          {" · "}<strong>{daysRemaining} days remaining</strong>
          {!isHqAdmin && " · Editable objectives only"}
        </span>
      </div>
    </div>
  );
}

// ─── BulkDeleteBar ────────────────────────────────────────────────────────────

function BulkDeleteBar({
  selectedCount, onDelete, onClear, isDeleting,
}: {
  selectedCount: number;
  onDelete:      () => void;
  onClear:       () => void;
  isDeleting:    boolean;
}) {
  if (selectedCount === 0) return null;

  return (
    <div style={{
      position:       "fixed",
      bottom:         "24px",
      left:           "50%",
      transform:      "translateX(-50%)",
      zIndex:         200,
      display:        "flex",
      alignItems:     "center",
      gap:            "12px",
      padding:        "12px 20px",
      background:     "#1e293b",
      borderRadius:   "12px",
      boxShadow:      "0 8px 32px rgba(0,0,0,0.28)",
      border:         "1px solid #334155",
      minWidth:       "320px",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <CheckSquare size={16} color="#60a5fa" />
        <span style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}>
          {selectedCount} template{selectedCount !== 1 ? "s" : ""} selected
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button
          onClick={onClear}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "5px",
            padding:      "6px 12px",
            borderRadius: "7px",
            border:       "1px solid #475569",
            background:   "transparent",
            color:        "#94a3b8",
            fontSize:     "12px",
            fontWeight:   600,
            cursor:       "pointer",
          }}
        >
          <X size={12} /> Clear
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          style={{
            display:      "flex",
            alignItems:   "center",
            gap:          "5px",
            padding:      "6px 14px",
            borderRadius: "7px",
            border:       "none",
            background:   isDeleting ? "#7f1d1d" : "#ef4444",
            color:        "#fff",
            fontSize:     "12px",
            fontWeight:   700,
            cursor:       isDeleting ? "not-allowed" : "pointer",
            transition:   "background 0.15s",
          }}
        >
          {isDeleting
            ? <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> Deleting…</>
            : <><Trash2  size={12} /> Delete {selectedCount} template{selectedCount !== 1 ? "s" : ""}</>}
        </button>
      </div>
    </div>
  );
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

function TemplateCard({
  template, level, permissions, isCategoryExpanded, isAssignExpanded,
  isDuplicating, isSelected, isSelectionMode, onSelect,
  onToggleCategoryExpand, onToggleAssignExpand,
  onView, onEdit, onDelete, onDuplicate, onManageFreeze,
}: {
  template:               TemplateRecord;
  level:                  number;
  permissions:            TemplatePermissions;
  isCategoryExpanded:     boolean;
  isAssignExpanded:       boolean;
  isDuplicating:          boolean;
  isSelected:             boolean;
  isSelectionMode:        boolean;
  onSelect:               (checked: boolean) => void;
  onToggleCategoryExpand: () => void;
  onToggleAssignExpand:   () => void;
  onView:                 () => void;
  onEdit:                 () => void;
  onDelete:               () => void;
  onDuplicate:            () => void;
  onManageFreeze:         () => void;
}) {
  const categories = template.categories ?? [];
  const isHqAdmin  = level === 1;

  const effectiveStatus: FreezeStatus = template.freeze_status ?? permissions.freezeStatus;
  const isPastCycle = template.is_past_cycle ?? false;
  const isFrozen    = effectiveStatus === "frozen";
  const isGrace     = effectiveStatus === "grace";

  const lockedCount     = categories.reduce((sum: number, cat: any) => sum + (cat.objectives?.filter((obj: any) => obj.control === "Locked").length ?? 0), 0);
  const totalObjectives = categories.reduce((sum: number, cat: any) => sum + (cat.objectives?.length ?? 0), 0);
  const editableCount   = totalObjectives - lockedCount;
  const totalRules      = template.assignedRules?.length ?? 0;

  const unfrozenBranchCount   = template.unfrozenBranchIds?.length  ?? 0;
  const unfrozenCountryCount  = template.unfrozenCountryIds?.length ?? 0;
  const hasUnfreezeExceptions = unfrozenBranchCount > 0 || unfrozenCountryCount > 0;
  const variantCount          = template.variants?.length ?? 0;
  const hasVariants           = (template.hasVariants ?? false) || variantCount > 0;

  const canEditThisCard         = !isPastCycle && permissions.canEdit;
  const canDeleteThisCard       = !isPastCycle && isHqAdmin && permissions.canDelete;
  const canCopyThisCard         = isHqAdmin && permissions.canCreate;
  const canManageFreezeThisCard = isHqAdmin && !isPastCycle && (isFrozen || isGrace);
  const isSelectable            = isHqAdmin && !isPastCycle && !isFrozen && permissions.canDelete;

  function getEditDisabledReason(): string | null {
    if (isPastCycle) return "This template belongs to a past PMS cycle and is permanently frozen.";
    if (isFrozen)    return hasUnfreezeExceptions
      ? 'The parent template is frozen. Use "Manage Freeze" to create or edit a branch/country variant instead.'
      : "Templates are fully frozen. No edits are permitted in this period.";
    if (isGrace && !isHqAdmin) return "Grace period is active. Only HQ Admin may edit templates during this period.";
    if (!permissions.canEdit)  return "You do not have permission to edit templates.";
    return null;
  }

  function getDeleteDisabledReason(): string | null {
    if (!isHqAdmin)  return "Only HQ Admin may delete templates.";
    if (isPastCycle) return "Past-cycle templates are permanently archived and cannot be deleted.";
    if (isFrozen)    return "Templates are fully frozen. Deletion is not permitted in this period.";
    return null;
  }

  function getCopyDisabledReason(): string | null {
    if (!isHqAdmin) return "Only HQ Admin may duplicate templates.";
    if (isFrozen)   return "Templates are fully frozen. Duplication is not permitted in this period.";
    return null;
  }

  function handleEditClick():   void { const r = getEditDisabledReason();   if (r) { toast.error(r); return; } onEdit(); }
  function handleDeleteClick(): void { const r = getDeleteDisabledReason(); if (r) { toast.error(r); return; } onDelete(); }
  function handleCopyClick():   void { const r = getCopyDisabledReason();   if (r) { toast.error(r); return; } onDuplicate(); }

  const lastUpdatedDisplay = new Date(template.lastModified ?? template.created_at ?? Date.now())
    .toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const assignmentSummary = useMemo((): string => {
    const parts: string[] = [];
    if (template.assignedDesignations?.length) {
      const c = template.assignedDesignations.length;
      parts.push(`${c} designation${c !== 1 ? "s" : ""}`);
    }
    if (template.assignedDepartments?.length) {
      const c = new Set(template.assignedDepartments.map(d => d.name.trim().toLowerCase())).size;
      parts.push(`${c} dept type${c !== 1 ? "s" : ""}`);
    }
    if (template.assignedSubDepartments?.length) {
      const c = new Set(template.assignedSubDepartments.map(s => s.name.trim().toLowerCase())).size;
      parts.push(`${c} sub-dept${c !== 1 ? "s" : ""}`);
    }
    if (template.assignedCountries?.length) {
      const c = template.assignedCountries.length;
      parts.push(`${c} countr${c !== 1 ? "ies" : "y"}`);
    }
    if (template.assignedBranches?.length) {
      const c = template.assignedBranches.length;
      parts.push(`${c} branch${c !== 1 ? "es" : ""}`);
    }
    return parts.length ? parts.join(" · ") : "Unassigned";
  }, [template]);

  const scopeRules    = template.assignedRules?.filter(r => r.scope) ?? [];
  const hasScopeRules = scopeRules.length > 0;

  const statCells = [
    { label: "Categories",       value: categories.length },
    { label: "Total KPIs",       value: totalObjectives },
    { label: "Locked",           value: lockedCount },
    { label: "Editable",         value: editableCount },
    { label: "Assignment Rules", value: totalRules },
  ];

  return (
    <div
      className={styles.card}
      style={{
        ...(isPastCycle ? { opacity: 0.85, borderLeft: "3px solid #94a3b8" } : {}),
        ...(isSelected  ? { outline: "2px solid #3b82f6", outlineOffset: "2px" } : {}),
        ...(isSelectionMode && isSelectable ? { cursor: "pointer" } : {}),
        position: "relative",
        overflow: "visible",
      }}
      onClick={isSelectionMode && isSelectable ? () => onSelect(!isSelected) : undefined}
    >
      {/* Past-cycle banner */}
      {isPastCycle && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "6px 14px",
          background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
          fontSize: "11px", color: "#64748b", fontWeight: 600,
        }}>
          <History size={12} color="#94a3b8" />
          Past PMS Cycle — Permanently Frozen (Read Only)
        </div>
      )}

      {/* Partial-unfreeze corner badge */}
      {hasUnfreezeExceptions && !isPastCycle && (
        <div className={styles.partialUnfreezeCorner}>
          <Unlock size={10} color="#16a34a" />
          <span>Partially unfrozen</span>
          {unfrozenBranchCount  > 0 && <span className={`${styles.partialUnfreezeCount} ${styles.partialUnfreezeCountBranch}`}>{unfrozenBranchCount}B</span>}
          {unfrozenCountryCount > 0 && <span className={`${styles.partialUnfreezeCount} ${styles.partialUnfreezeCountCountry}`}>{unfrozenCountryCount}C</span>}
          {hasVariants              && <span className={`${styles.partialUnfreezeCount} ${styles.partialUnfreezeCountVariant}`}>{variantCount}V</span>}
        </div>
      )}

      {/* Card top */}
      <div className={styles.cardTop}>
        <div className={styles.cardTopInner}>

          {isSelectionMode && isSelectable && (
            <div
              style={{ display: "flex", alignItems: "flex-start", paddingTop: "2px", marginRight: "8px", flexShrink: 0 }}
              title={isSelected ? "Deselect template" : "Select for bulk delete"}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={e => onSelect(e.target.checked)}
                onClick={e => e.stopPropagation()}
                style={{ width: "17px", height: "17px", accentColor: "#3b82f6", cursor: "pointer", flexShrink: 0, marginTop: "3px" }}
                aria-label={`Select template "${template.name}" for bulk delete`}
              />
            </div>
          )}

          <div className={styles.cardLeft}>
            <div className={styles.cardIconWrapper}>
              <FileText size={22} color={isPastCycle ? "#94a3b8" : "#3b82f6"} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.cardTitleRow}>
                <h3 className={styles.cardTitle} style={isPastCycle ? { color: "#64748b" } : undefined}>
                  {template.name}
                </h3>
                <CycleStatusBadge status={effectiveStatus} />
                {hasVariants && !isPastCycle && (
                  <button
                    onClick={e => { e.stopPropagation(); canManageFreezeThisCard && onManageFreeze(); }}
                    title={canManageFreezeThisCard ? "Open Manage Freeze to view or edit variants" : `${variantCount} branch variant${variantCount !== 1 ? "s" : ""}`}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px",
                      borderRadius: "20px", fontSize: "10px", fontWeight: "700",
                      background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe",
                      cursor: canManageFreezeThisCard ? "pointer" : "default", transition: "all 0.15s",
                    }}
                  >
                    <GitBranch size={9} />
                    {variantCount} variant{variantCount !== 1 ? "s" : ""}
                  </button>
                )}
              </div>
              <p className={styles.cardDescription}>
                {template.description || "Standard organisational evaluation template."}
              </p>
              {!isHqAdmin && effectiveStatus === "open" && editableCount > 0 && (
                <p style={{ fontSize: "11px", color: "#7c3aed", fontWeight: "600", marginTop: "4px" }}>
                  <Unlock size={10} style={{ display: "inline", marginRight: "3px" }} />
                  {editableCount} editable objective{editableCount !== 1 ? "s" : ""} accessible to you
                </p>
              )}
            </div>
          </div>

          <div className={styles.cardActions} onClick={e => e.stopPropagation()}>
            <button className={styles.actionBtn} onClick={onView}>
              <Eye size={13} /><span>View</span>
            </button>
            <button
              className={`${styles.actionBtn} ${!canEditThisCard ? styles.actionBtnDisabled : ""}`}
              onClick={handleEditClick}
              title={!canEditThisCard ? (getEditDisabledReason() ?? undefined) : "Edit template"}
            >
              <Pencil size={13} /><span>Edit</span>
            </button>
            {isHqAdmin && (
              <button
                className={`${styles.actionBtn} ${!canCopyThisCard ? styles.actionBtnDisabled : ""}`}
                onClick={handleCopyClick}
                disabled={isDuplicating}
                title={isPastCycle ? "Duplicate into current cycle" : !canCopyThisCard ? (getCopyDisabledReason() ?? undefined) : "Duplicate template"}
              >
                {isDuplicating ? <Loader2 size={13} className={styles.spinner} /> : <Copy size={13} />}
                <span>Copy</span>
              </button>
            )}
            {isHqAdmin && canManageFreezeThisCard && (
              <button
                onClick={onManageFreeze}
                title="Navigate to Template Freeze Management page"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 12px",
                  borderRadius: "6px",
                  background: hasUnfreezeExceptions ? "#fff7ed" : "#f0f5ff",
                  border: `1px solid ${hasUnfreezeExceptions ? "#fed7aa" : "#c7d5f0"}`,
                  color: hasUnfreezeExceptions ? "#ea580c" : "#1e3a8a",
                  fontSize: "12px", fontWeight: "700", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
                }}
              >
                <ShieldCheck size={13} />
                <span>{hasUnfreezeExceptions ? "Freeze Mgmt" : "Manage Freeze"}</span>
              </button>
            )}
            {isHqAdmin && (
              <button
                className={`${styles.actionBtnDanger} ${!canDeleteThisCard ? styles.actionBtnDangerDisabled : ""}`}
                onClick={handleDeleteClick}
                title={!canDeleteThisCard ? (getDeleteDisabledReason() ?? undefined) : "Delete template"}
                aria-label="Delete template"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className={styles.statsRow} onClick={e => e.stopPropagation()}>
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

      {/* Card meta */}
      <div className={styles.cardMeta} onClick={e => e.stopPropagation()}>
        <div className={styles.cardMetaLeft}>
          <BookOpen size={12} color="#8b5cf6" /><span className={styles.cardMetaLabel}>AI Suggested Insights</span>
          <Award    size={12} color="#d97706" /><span className={styles.cardMetaLabel}>Training Recommendations</span>
          <Target   size={12} color="#3b82f6" /><span className={styles.cardMetaLabel}>Smart Analysis Enabled</span>
        </div>
        <span className={styles.cardMetaTimestamp}>Updated: {lastUpdatedDisplay}</span>
      </div>

      {/* Category expand toggle */}
      <button className={styles.expandToggle} onClick={e => { e.stopPropagation(); onToggleCategoryExpand(); }}>
        <Layers size={14} color="#3b82f6" />
        <span>{isCategoryExpanded ? "Hide" : "Show"} Category Details</span>
        {isCategoryExpanded ? <ChevronUp size={14} color="#3b82f6" /> : <ChevronDown size={14} color="#3b82f6" />}
      </button>

      {isCategoryExpanded && (
        <div className={styles.expandedSection} onClick={e => e.stopPropagation()}>
          <div className={styles.expandedSectionHeading}>
            <Layers size={13} color="#64748b" /><span>Performance Categories</span>
          </div>
          <div className={styles.categoryGrid}>
            {categories.length === 0
              ? <p className={styles.categoryEmptyNote}>No categories defined.</p>
              : categories.map((cat: any, index: number) => {
                  const palette     = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
                  const catWeight   = cat.weight ?? (cat.objectives ?? []).reduce((sum: number, obj: any) => sum + (Number(obj.weight) || 0), 0);
                  const lockedInCat = (cat.objectives ?? []).filter((obj: any) => obj.control === "Locked").length;
                  return (
                    <div key={index} className={styles.categoryDetailCard} style={{ background: palette.bg, borderColor: `${palette.fill}33` }}>
                      <div className={styles.categoryDetailHeader}>
                        <span style={{ fontWeight: 700, fontSize: "12px", color: palette.text }}>{cat.name}</span>
                        <span style={{ fontWeight: 800, fontSize: "13px", color: palette.fill }}>{catWeight}%</span>
                      </div>
                      <div className={styles.categoryDetailBar}>
                        <div style={{ height: "100%", width: `${catWeight}%`, background: palette.fill, borderRadius: "3px" }} />
                      </div>
                      <div className={styles.categoryDetailStats}>
                        <span><strong>{(cat.objectives ?? []).length}</strong> KPIs</span>
                        <span><strong>{lockedInCat}</strong> Locked</span>
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      )}

      {/* Assignments expand toggle */}
      <button className={styles.expandToggle} onClick={e => { e.stopPropagation(); onToggleAssignExpand(); }}>
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
        <div className={styles.expandedSection} onClick={e => e.stopPropagation()}>
          {totalRules === 0
            ? <p style={{ fontSize: "13px", color: "#94a3b8", padding: "8px 0" }}>No assignments set.</p>
            : (
              <div className={styles.rolesDeptsSection}>
                {hasScopeRules && (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}><Globe size={13} color="#0891b2" /><span>Global Assignments</span></div>
                    <div className={styles.rolesDeptsChips}>
                      {scopeRules.map((rule, i) => (
                        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc" }}>
                          {SCOPE_LABELS[rule.scope!] ?? rule.scope}
                          {rule.country_id && <span style={{ fontSize: "10px", opacity: 0.7 }}>· specific country</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(template.assignedDesignations?.length ?? 0) > 0 && (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}><Users size={13} color="#3b82f6" /><span>Designations</span></div>
                    <div className={styles.rolesDeptsChips}>
                      {template.assignedDesignations!.map(d => <span key={d} className={styles.rolesChip}>{d}</span>)}
                    </div>
                  </div>
                )}

                {(template.assignedSubDepartments?.length ?? 0) > 0 && (() => {
                  const seen       = new Set<string>();
                  const uniqueSubs = (template.assignedSubDepartments ?? []).filter(s => {
                    const k = s.name.trim().toLowerCase();
                    if (seen.has(k)) return false;
                    seen.add(k);
                    return true;
                  });
                  return (
                    <div className={styles.rolesDeptsGroup}>
                      <div className={styles.rolesDeptsLabel}><Layers size={13} color="#0891b2" /><span>Sub-Departments</span></div>
                      <div className={styles.rolesDeptsChips}>
                        {uniqueSubs.map(s => (
                          <span key={s.name} style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc" }}>
                            {s.code ? `[${s.code}] ` : ""}{s.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {(template.assignedCountries?.length ?? 0) > 0 && (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}><Globe size={13} color="#0891b2" /><span>Countries</span></div>
                    <div className={styles.rolesDeptsChips}>
                      {template.assignedCountries!.map(c => (
                        <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc" }}>
                          {c.code ?? c.name}
                          {(template.unfrozenCountryIds ?? []).includes(c.id) && <Unlock size={9} color="#16a34a" />}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(template.assignedDepartments?.length ?? 0) > 0 && (() => {
                  const grouped = new Map<string, { name: string; code: string | null; branchCount: number }>();
                  template.assignedDepartments!.forEach(d => {
                    const k = d.name.trim().toLowerCase();
                    if (!grouped.has(k)) grouped.set(k, { name: d.name, code: d.code, branchCount: 0 });
                    if (d.branch_id) grouped.get(k)!.branchCount++;
                  });
                  return (
                    <div className={styles.rolesDeptsGroup}>
                      <div className={styles.rolesDeptsLabel}><Building2 size={13} color="#8b5cf6" /><span>Departments</span></div>
                      <div className={styles.rolesDeptsChips}>
                        {[...grouped.values()].map(d => (
                          <span key={d.name} className={styles.deptsChip} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            {d.code ? `[${d.code}] ` : ""}{d.name}
                            {d.branchCount > 0 && (
                              <span style={{ fontSize: "10px", fontWeight: "700", background: "#ddd6fe", color: "#5b21b6", padding: "1px 6px", borderRadius: "10px" }}>
                                {d.branchCount} branch{d.branchCount !== 1 ? "es" : ""}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {(template.assignedBranches?.length ?? 0) > 0 && (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}><GitBranch size={13} color="#7c3aed" /><span>Branches</span></div>
                    <div className={styles.rolesDeptsChips}>
                      {template.assignedBranches!.map(b => {
                        const isUnfrozen = (template.unfrozenBranchIds ?? []).includes(b.id);
                        const hasVariant = (template.variants ?? []).some(v => v.branch_id === b.id);
                        return (
                          <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: "700", background: isUnfrozen ? "#f0fdf4" : "#f5f3ff", color: isUnfrozen ? "#166534" : "#5b21b6", border: `1px solid ${isUnfrozen ? "#bbf7d0" : "#ddd6fe"}` }}>
                            {b.code ?? b.name}
                            {isUnfrozen && <Unlock    size={9} color="#16a34a" />}
                            {hasVariant  && <GitBranch size={9} color="#1e40af" />}
                          </span>
                        );
                      })}
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

// ─── TemplateDashboardBase ────────────────────────────────────────────────────

export default function TemplateDashboardBase({ level }: { level: number }) {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const [templates,             setTemplates]             = useState<TemplateRecord[]>([]);
  const [confirmDeleteId,       setConfirmDeleteId]       = useState<number | null>(null);
  const [isLoading,             setIsLoading]             = useState(true);
  const [expandedCardId,        setExpandedCardId]        = useState<number | null>(null);
  const [expandedAssignId,      setExpandedAssignId]      = useState<number | null>(null);
  const [isDuplicatingId,       setIsDuplicatingId]       = useState<number | null>(null);
  const [activeCycle,           setActiveCycle]           = useState<any>(null);
  const [allCycles,             setAllCycles]             = useState<any[]>([]);
  const [isCopyingAssignments,  setIsCopyingAssignments]  = useState(false);
  const [assignmentsCopied,     setAssignmentsCopied]     = useState(false);
  const [showAssignmentsBanner, setShowAssignmentsBanner] = useState(false);
  const [filters,               setFilters]               = useState<FilterState>({
    search: "", designations: [], departments: [], branches: [], countries: [], years: [],
  });

  // ── Bulk-delete state ──────────────────────────────────────────────────────
  const [selectedIds,         setSelectedIds]         = useState<Set<number>>(new Set());
  const [isBulkDeleting,      setIsBulkDeleting]      = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isSelectionMode,     setIsSelectionMode]     = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const skipNextFocusRefetch = useRef(false);
  const mainContentRef       = useRef<HTMLElement>(null);

  // ── Derived values ─────────────────────────────────────────────────────────
  const freezeDates = useMemo(() => buildFreezeDates(activeCycle),           [activeCycle]);
  const permissions = useMemo(() => computePermissions(level, freezeDates), [level, freezeDates]);
  const rolePrefix  = getRolePrefix(level);

  const previousCycle = useMemo(() => {
    const sorted = [...allCycles].sort((a, b) => b.pms_year - a.pms_year);
    return sorted.length >= 2 ? sorted[1] : null;
  }, [allCycles]);

  const confirmDeleteTemplate = useMemo(
    () => templates.find(t => t.id === confirmDeleteId) ?? null,
    [templates, confirmDeleteId],
  );

  const periodWrapperClass =
    permissions.freezeStatus === "frozen" ? styles.periodFrozen :
    permissions.freezeStatus === "grace"  ? styles.periodGrace  :
    styles.periodOpen;

  // ── Filter options ─────────────────────────────────────────────────────────
  const filterOptions = useMemo(() => {
    const designationSet = new Set<string>();
    const departmentSet  = new Set<string>();
    const branchSet      = new Set<string>();
    const countrySet     = new Set<string>();
    templates.forEach(t => {
      t.assignedDesignations?.forEach(d => designationSet.add(d));
      t.assignedDepartments?.forEach(d  => departmentSet.add(d.name));
      t.assignedBranches?.forEach(b     => branchSet.add(b.name));
      t.assignedCountries?.forEach(c    => {
        const label = c.name?.trim() || c.code?.trim();
        if (label) countrySet.add(label);
      });
    });
    return {
      designations: [...designationSet].sort(),
      departments:  [...departmentSet].sort(),
      branches:     [...branchSet].sort(),
      countries:    [...countrySet].sort(),
    };
  }, [templates]);

  const allYearOptions = useMemo((): string[] => {
    const yearSet = new Set<string>();
    templates.forEach(t => {
      const label = resolvePmsYearLabel(t, allCycles, activeCycle);
      if (label && label !== "Unknown") yearSet.add(label);
    });
    return [...yearSet].sort((a, b) => b.localeCompare(a));
  }, [templates, allCycles, activeCycle]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const loadDashboardData = useCallback(async (isFromFocus = false): Promise<void> => {
    if (isFromFocus && skipNextFocusRefetch.current) {
      skipNextFocusRefetch.current = false;
      return;
    }
    try {
      setIsLoading(true);

      const [templateRes, cycleRes, allCyclesRes] = await Promise.all([
        fetch(`${API_BASE}/templates`),
        fetch(`${API_BASE}/pms-cycles/active`),
        fetch(`${API_BASE}/pms-cycles`),
      ]);

      if (!templateRes.ok) throw new Error(`Failed to load templates: ${templateRes.status}`);

      setTemplates(sortByLastModified(await templateRes.json()));

      if (cycleRes.ok) {
        const cycleData = await cycleRes.json();
        setActiveCycle(cycleData);

        if (cycleData?.id && level === 1) {
          try {
            const assignRes = await fetch(
              `${API_BASE}/pms-cycles/${cycleData.id}/assignments-status`,
              { headers: { "X-User-Level": "1" } },
            );
            if (assignRes.ok) {
              const d = await assignRes.json();
              setAssignmentsCopied(d.assignments_copied);
            }
          } catch {
            // Non-critical
          }
        }
      }

      if (allCyclesRes.ok) {
        const cycles = await allCyclesRes.json();
        setAllCycles(cycles);
        if (cycles.length >= 2) setShowAssignmentsBanner(true);
      }
    } catch {
      toast.error("Could not load templates. Please refresh and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [level]);

  useEffect(() => {
    loadDashboardData();
    const handler = () => loadDashboardData(true);
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [loadDashboardData]);

  // ── Filtered & sorted templates ────────────────────────────────────────────
  const filteredTemplates = useMemo(() => {
    let result = templates.filter(t => !t.is_past_cycle);

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      result   = result.filter(t => t.name?.toLowerCase().includes(q));
    }
    if (filters.designations.length > 0)
      result = result.filter(t => filters.designations.some(d => t.assignedDesignations?.includes(d)));
    if (filters.departments.length  > 0)
      result = result.filter(t => filters.departments.some(d  => t.assignedDepartments?.some(x => x.name === d)));
    if (filters.branches.length     > 0)
      result = result.filter(t => filters.branches.some(b     => t.assignedBranches?.some(x => x.name === b)));
    if (filters.countries.length    > 0)
      result = result.filter(t => filters.countries.some(c    => t.assignedCountries?.some(x => (x.name?.trim() || x.code?.trim()) === c)));
    if (filters.years.length        > 0)
      result = result.filter(t => filters.years.includes(resolvePmsYearLabel(t, allCycles, activeCycle)));

    return sortByLastModified(result);
  }, [templates, filters, allCycles, activeCycle]);

  // ── Scroll helper ──────────────────────────────────────────────────────────
  function scrollToTop(): void {
    setTimeout(() => {
      mainContentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
      document.body.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  }

  // ── Single-template handlers ───────────────────────────────────────────────

  function bumpTemplateToTop(id: number): void {
    setTemplates(prev =>
      sortByLastModified(prev.map(t =>
        t.id === id ? { ...t, lastModified: new Date().toISOString() } : t,
      )),
    );
  }

  function handleViewTemplate(id: number): void {
    router.push(`${rolePrefix}/template-management/template-creation?edit=${id}&mode=view`);
  }

  function handleEditTemplate(id: number, template: TemplateRecord): void {
    const effectiveStatus = template.freeze_status ?? permissions.freezeStatus;

    if (template.is_past_cycle) {
      toast.error("This template is from a past PMS cycle and is permanently frozen.");
      return;
    }
    if (effectiveStatus === "frozen") {
      const hasEx = (template.unfrozenBranchIds?.length ?? 0) > 0 || (template.unfrozenCountryIds?.length ?? 0) > 0;
      toast.error(hasEx
        ? 'The parent template is frozen. Use "Manage Freeze" to create or edit a branch/country variant instead.'
        : "Templates are fully frozen. No edits are permitted in this period.");
      return;
    }
    if (effectiveStatus === "grace" && !permissions.canEdit) {
      toast.error("Grace period is active. Only HQ Admin may edit templates during this period.");
      return;
    }
    if (!permissions.canEdit) {
      toast.error("You do not have permission to edit templates.");
      return;
    }

    bumpTemplateToTop(id);
    router.push(`${rolePrefix}/template-management/template-creation?edit=${id}`);
  }

  async function handleDuplicateTemplate(template: TemplateRecord): Promise<void> {
    if (!permissions.canCreate) {
      toast.error("Templates are frozen — duplication is not permitted in this period.");
      return;
    }

    const prev = [...templates];
    setIsDuplicatingId(template.id);

    try {
      const response = await fetch(`${API_BASE}/templates`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:         `${template.name} (Copy)`,
          description:  template.description ?? "",
          max_score:    template.max_score    ?? 5,
          categories:   template.categories   ?? [],
          totalWeight:  template.total_weight ?? 0,
          lastModified: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error("Duplicate failed");

      const refreshRes = await fetch(`${API_BASE}/templates`);
      if (refreshRes.ok) {
        const fresh: TemplateRecord[] = await refreshRes.json();
        const copyName = `${template.name} (Copy)`;
        const copy     = [...fresh].filter(t => t.name === copyName).sort((a, b) => b.id - a.id)[0];
        if (copy) copy.lastModified = new Date().toISOString();
        setTemplates(sortByLastModified(fresh));
      }

      toast.success(`"${template.name}" duplicated into the current cycle.`);
    } catch (err: any) {
      setTemplates(prev);
      toast.error(err.message ?? "Could not duplicate template.");
    } finally {
      setIsDuplicatingId(null);
    }
  }

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

    const prev = [...templates];
    setTemplates(p => p.filter(t => t.id !== id));
    setConfirmDeleteId(null);

    try {
      const response = await fetch(`${API_BASE}/templates/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const e = await response.json().catch(() => ({}));
        throw new Error(e.error ?? "Delete failed");
      }
      toast.success("Template deleted successfully");
    } catch (err: any) {
      setTemplates(prev);
      toast.error(err.message ?? "Could not delete template.");
    }
  }

  function handleNavigateToFreezeManagement(template: TemplateRecord): void {
    router.push(`${rolePrefix}/template-management/freeze-management?templateId=${template.id}`);
  }

  // ── Bulk-delete handlers ───────────────────────────────────────────────────

  function handleToggleSelect(id: number, checked: boolean): void {
    setSelectedIds(prev => {
      const next = new Set(prev);
      checked ? next.add(id) : next.delete(id);
      return next;
    });
  }

  function handleSelectAll(): void {
    const deletable   = filteredTemplates.filter(
      t => !t.is_past_cycle && (t.freeze_status ?? permissions.freezeStatus) !== "frozen",
    );
    const allSelected = deletable.every(t => selectedIds.has(t.id));

    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        deletable.forEach(t => next.delete(t.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        deletable.forEach(t => next.add(t.id));
        return next;
      });
    }
  }

  function handleClearSelection(): void {
    setSelectedIds(new Set());
  }

  function handleExitSelectionMode(): void {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete(): Promise<void> {
  if (selectedIds.size === 0) return;

  setIsBulkDeleting(true);
  setShowBulkDeleteModal(false);

  const idsToDelete = [...selectedIds];
  const prev        = [...templates];

  setTemplates(p => p.filter(t => !selectedIds.has(t.id)));
  setSelectedIds(new Set());
  setIsSelectionMode(false);

  try {
    const results = await Promise.allSettled(
      idsToDelete.map(id => fetch(`${API_BASE}/templates/${id}`, { method: "DELETE" })),
    );

    const failedIds: number[] = [];

    results.forEach((r, i) => {
      const id = idsToDelete[i];
      if (r.status === "rejected") {
        failedIds.push(id);
      } else if (!r.value.ok) {
        failedIds.push(id);
      }
    });

    if (failedIds.length === 0) {
      toast.success(`${idsToDelete.length} template${idsToDelete.length !== 1 ? "s" : ""} deleted successfully.`);
    } else {
      const failedSet = new Set(failedIds);
      // Restore only the templates that actually failed to delete
      const restored = prev.filter(t => failedSet.has(t.id));
      setTemplates(p => sortByLastModified([...p, ...restored]));

      const succeededCount = idsToDelete.length - failedIds.length;
      if (succeededCount > 0) {
        toast.error(`${succeededCount} template${succeededCount !== 1 ? "s" : ""} deleted, ${failedIds.length} failed.`);
      } else {
        toast.error(`${failedIds.length} of ${idsToDelete.length} deletions failed. Please try again.`);
      }
    }
  } catch {
    setTemplates(prev);
    toast.error("Bulk delete failed. Please try again.");
  } finally {
    setIsBulkDeleting(false);
  }
}

  // ── Copy-previous-assignments handler ──────────────────────────────────────
  async function handleCopyPreviousAssignments(): Promise<void> {
    if (!activeCycle?.id || !previousCycle?.id) {
      toast.error("Could not find previous cycle to copy assignments from.");
      return;
    }
    if (assignmentsCopied) {
      toast.info("Assignments have already been applied for this cycle.");
      return;
    }

    setIsCopyingAssignments(true);
    try {
      const response = await fetch(`${API_BASE}/pms-cycles/copy-assignments`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-User-Level": "1" },
        body:    JSON.stringify({
          old_cycle_id: previousCycle.id,
          new_cycle_id: activeCycle.id,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to copy assignments.");

      if (data.skipped) {
        toast.info("Assignments were already applied — no changes made.");
        setAssignmentsCopied(true);
        return;
      }

      toast.success(`Assignments applied! ${data.copied_rules} rules and ${data.copied_users} users copied.`);

      const refreshRes = await fetch(`${API_BASE}/templates`);
      if (refreshRes.ok) {
        const fresh: TemplateRecord[] = await refreshRes.json();
        const assigned   = fresh.filter(t => !t.is_past_cycle && (t.assignedRules?.length ?? 0) > 0);
        const unassigned = fresh.filter(t =>  t.is_past_cycle || (t.assignedRules?.length ?? 0) === 0);
        skipNextFocusRefetch.current = true;
        setTemplates([
          ...sortByLastModified(assigned),
          ...sortByLastModified(unassigned),
        ]);
        // Scroll to top after React re-renders the new order
        scrollToTop();
      }

      setAssignmentsCopied(true);
    } catch (err: any) {
      toast.error(err.message ?? "Could not copy assignments.");
    } finally {
      setIsCopyingAssignments(false);
    }
  }

  // ── Computed helpers ───────────────────────────────────────────────────────
  const deletableInView     = filteredTemplates.filter(
    t => !t.is_past_cycle && (t.freeze_status ?? permissions.freezeStatus) !== "frozen",
  );
  const allVisibleSelected  = deletableInView.length > 0 && deletableInView.every(t => selectedIds.has(t.id));
  const someVisibleSelected = deletableInView.some(t => selectedIds.has(t.id));
  const isHqAdmin           = level === 1;

  const hasAnyFilter =
    !!filters.search           || filters.designations.length > 0 ||
    filters.departments.length > 0 || filters.branches.length > 0 ||
    filters.countries.length   > 0 || filters.years.length    > 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={styles.dashShell}>
      <main className={styles.mainContent} ref={mainContentRef}>
        <div className={styles.wrapper}>

          {/* Single-delete confirmation modal */}
          {confirmDeleteId !== null && (
            <div className={styles.modalOverlay}>
              <div className={styles.modalCard}>
                <div className={styles.modalIconWrapper}>
                  <Trash2 size={22} color="#ef4444" />
                </div>
                <h3 className={styles.modalTitle}>Delete Template?</h3>
                {confirmDeleteTemplate?.is_past_cycle
                  ? (
                    <p className={styles.modalText}>
                      This template belongs to a past PMS cycle and <strong>cannot be deleted</strong>.
                      Past-cycle templates are permanently frozen for audit purposes.
                    </p>
                  ) : (
                    <p className={styles.modalText}>
                      This action cannot be undone. All assignments will also be removed.
                    </p>
                  )}
                <div className={styles.modalActions}>
                  <button className={styles.modalCancelBtn} onClick={() => setConfirmDeleteId(null)}>
                    {confirmDeleteTemplate?.is_past_cycle ? "Close" : "Cancel"}
                  </button>
                  {!confirmDeleteTemplate?.is_past_cycle && (
                    <button
                      className={styles.modalDeleteBtn}
                      onClick={() => confirmDeleteTemplate && handleDeleteTemplate(confirmDeleteId, confirmDeleteTemplate)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Bulk-delete confirmation modal */}
          {showBulkDeleteModal && (
            <div className={styles.modalOverlay}>
              <div className={styles.modalCard}>
                <div className={styles.modalIconWrapper}>
                  <Trash2 size={22} color="#ef4444" />
                </div>
                <h3 className={styles.modalTitle}>
                  Delete {selectedIds.size} Template{selectedIds.size !== 1 ? "s" : ""}?
                </h3>
                <p className={styles.modalText}>
                  You are about to permanently delete{" "}
                  <strong>{selectedIds.size} template{selectedIds.size !== 1 ? "s" : ""}</strong>.
                  All associated assignments will also be removed. This action cannot be undone.
                </p>
                <div className={styles.modalActions}>
                  <button className={styles.modalCancelBtn} onClick={() => setShowBulkDeleteModal(false)}>
                    Cancel
                  </button>
                  <button className={styles.modalDeleteBtn} onClick={handleBulkDelete}>
                    Delete {selectedIds.size} Template{selectedIds.size !== 1 ? "s" : ""}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Page header */}
          <div className={styles.pageHeader}>
            <div>
              <p className={styles.pageSubtitleMain}>
                Manage and deploy evaluation templates across org
              </p>
              <p className={styles.pageSubtitle}>
                <span className={styles.rolePill}>{permissions.roleLabel}</span>
                {permissions.freezeStatus === "open"   && <span className={styles.subtitleNote}>Objective window closes <strong>{formatDate(freezeDates.objectiveSettingEnd)}</strong></span>}
                {permissions.freezeStatus === "grace"  && <span className={styles.subtitleNoteAmber}>Grace period until <strong>{formatDate(freezeDates.graceEnd)}</strong></span>}
                {permissions.freezeStatus === "frozen" && <span className={styles.subtitleNoteFrozen}>Templates frozen — read only{level === 1 && " (use Manage Freeze to unfreeze per branch)"}</span>}
              </p>
            </div>

            <div className={styles.headerActions}>
              <CycleStatusBadge status={permissions.freezeStatus} />

              {/* Copy-previous-assignments button */}
              {level === 1 && showAssignmentsBanner && previousCycle && (
                <button
                  onClick={handleCopyPreviousAssignments}
                  disabled={isCopyingAssignments || assignmentsCopied}
                  title={assignmentsCopied
                    ? "Assignments from previous cycle already applied"
                    : `Copy assignments from PMS ${previousCycle.pms_year} to current cycle`}
                  className={[
                    styles.assignPrevBtn,
                    assignmentsCopied    ? styles.assignPrevBtnDone    : "",
                    isCopyingAssignments ? styles.assignPrevBtnLoading : "",
                  ].join(" ")}
                >
                  {isCopyingAssignments ? (
                    <><Loader2 size={13} className={styles.spinner} /><span>Applying…</span></>
                  ) : assignmentsCopied ? (
                    <><CheckCircle2 size={13} /><span>Assignments Applied</span></>
                  ) : (
                    <><Users size={13} /><span>Assign Previous Combinations</span></>
                  )}
                </button>
              )}

              {/* View Variants */}
              <button
                className={styles.actionBtn}
                onClick={() => router.push(`${rolePrefix}/template-management/template-variants`)}
                title="View all branch and country template variants"
              >
                <GitBranch size={13} /><span>View Variants</span>
              </button>

              {/* Template history */}
              <button
                className={styles.actionBtn}
                onClick={() => router.push(`${rolePrefix}/template-management/template-history`)}
                title="View archived templates from past PMS cycles"
              >
                <History size={13} /><span>History</span>
              </button>

              {/* Create new template */}
              {permissions.canCreate && (
                <button
                  className={styles.createBtn}
                  onClick={() => router.push(`${rolePrefix}/template-management/template-creation`)}
                >
                  <span className={styles.createBtnIcon}>
                    <FileText size={32} strokeWidth={1.8} className={styles.createBtnMainIcon} />
                    <Sparkles size={16} strokeWidth={2}   className={styles.createBtnSparkle1} />
                    <Sparkles size={12} strokeWidth={2}   className={styles.createBtnSparkle2} />
                    <Pen      size={20} strokeWidth={2}   className={styles.createBtnPen} />
                    <Sparkles size={12} strokeWidth={2}   className={styles.createBtnSparkle3} />
                  </span>
                  <span className={styles.createBtnTexts}>
                    <span className={styles.createBtnText}>Create</span>
                    <span className={styles.createBtnSubText}>New Template</span>
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Status banner */}
          <StatusBanner permissions={permissions} freezeDates={freezeDates} level={level} />

          {/* Assignment-copy yellow prompt banner */}
          {level === 1 && showAssignmentsBanner && previousCycle && !assignmentsCopied && !isLoading && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: "12px", padding: "12px 16px", background: "#fffbeb",
              border: "1px solid #fde68a", borderRadius: "10px", marginBottom: "16px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Users size={16} color="#d97706" />
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#92400e" }}>
                  Assignments not applied yet — Copy designation, department, branch and user assignments from previous cycle
                </span>
              </div>
              <button
                onClick={handleCopyPreviousAssignments}
                disabled={isCopyingAssignments}
                className={[styles.assignPrevBtn, isCopyingAssignments ? styles.assignPrevBtnLoading : ""].join(" ")}
              >
                {isCopyingAssignments
                  ? <><Loader2 size={13} className={styles.spinner} /><span>Applying…</span></>
                  : <><Users   size={13} /><span>Apply Previous Assignments</span></>}
              </button>
            </div>
          )}

          {/* Assignments-applied green confirmation bar */}
          {level === 1 && showAssignmentsBanner && previousCycle && assignmentsCopied && !isLoading && (
            <div style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px",
              background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px",
              marginBottom: "16px", fontSize: "13px", fontWeight: "600", color: "#166534",
            }}>
              <CheckCircle2 size={16} color="#16a34a" />
              Assignments applied from previous cycle
            </div>
          )}

          {/* PMS cycle timeline panel */}
          {!isLoading && (
            <PmsCyclePanel
              freezeDates={freezeDates}
              activeCycle={activeCycle}
              templateCount={templates.filter(t => !t.is_past_cycle).length}
              permissions={permissions}
              level={level}
            />
          )}

          {/* Filter bar */}
          <HorizontalFilterBar
            filters={filters}
            onFilterChange={setFilters}
            allDesignations={filterOptions.designations}
            allDepartments={filterOptions.departments}
            allBranches={filterOptions.branches}
            allCountries={filterOptions.countries}
            allYears={allYearOptions}
            totalCount={templates.length}
            filteredCount={filteredTemplates.length}
            isLoading={isLoading}
          />

          {/* Bulk-select toolbar */}
          {isHqAdmin && permissions.canDelete && !isLoading && filteredTemplates.length > 0 && (
            <div style={{
              display:      "flex",
              alignItems:   "center",
              gap:          "10px",
              padding:      "8px 14px",
              background:   isSelectionMode ? (selectedIds.size > 0 ? "#eff6ff" : "#f0fdf4") : "#f8fafc",
              border:       `1px solid ${isSelectionMode ? (selectedIds.size > 0 ? "#bfdbfe" : "#bbf7d0") : "#e2e8f0"}`,
              borderRadius: "8px",
              marginBottom: "10px",
              transition:   "background 0.2s, border-color 0.2s",
            }}>

              {!isSelectionMode ? (
                <button
                  onClick={() => setIsSelectionMode(true)}
                  style={{
                    display:      "flex",
                    alignItems:   "center",
                    gap:          "6px",
                    padding:      "5px 13px",
                    borderRadius: "7px",
                    border:       "1px solid #fca5a5",
                    background:   "#fff5f5",
                    color:        "#b91c1c",
                    fontSize:     "12px",
                    fontWeight:   "600",
                    cursor:       "pointer",
                    transition:   "all 0.15s",
                  }}
                  title="Enter selection mode to delete multiple templates at once"
                >
                  <ListChecks size={14} />
                  Delete Multiple Templates
                </button>
              ) : (
                <>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                    onChange={handleSelectAll}
                    style={{ width: "15px", height: "15px", accentColor: "#3b82f6", cursor: "pointer" }}
                    aria-label="Select all visible templates"
                  />

                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569", userSelect: "none" }}>
                    {selectedIds.size > 0
                      ? `${selectedIds.size} of ${deletableInView.length} selected`
                      : `Select templates to delete (${deletableInView.length} available)`}
                  </span>

                  {selectedIds.size > 0 && (
                    <button
                      onClick={() => setShowBulkDeleteModal(true)}
                      style={{
                        display:      "flex",
                        alignItems:   "center",
                        gap:          "5px",
                        padding:      "5px 12px",
                        borderRadius: "7px",
                        border:       "none",
                        background:   "#ef4444",
                        color:        "#fff",
                        fontSize:     "12px",
                        fontWeight:   700,
                        cursor:       "pointer",
                      }}
                    >
                      <Trash2 size={12} />
                      Delete {selectedIds.size} template{selectedIds.size !== 1 ? "s" : ""}
                    </button>
                  )}

                  <button
                    onClick={handleExitSelectionMode}
                    style={{
                      marginLeft:   "auto",
                      display:      "flex",
                      alignItems:   "center",
                      gap:          "5px",
                      padding:      "5px 11px",
                      borderRadius: "7px",
                      border:       "1px solid #e2e8f0",
                      background:   "#fff",
                      color:        "#64748b",
                      fontSize:     "12px",
                      fontWeight:   600,
                      cursor:       "pointer",
                    }}
                    title="Exit selection mode"
                  >
                    <X size={12} /> Cancel
                  </button>
                </>
              )}
            </div>
          )}

          {/* Template card list */}
          <div className={`${styles.periodWrapper} ${periodWrapperClass}`}>
            {isLoading ? (
              <LoadingSpinner />
            ) : filteredTemplates.length === 0 ? (
              <div className={styles.emptyState}>
                <Inbox size={48} color="#cbd5e1" style={{ margin: "0 auto 16px" }} />
                <h3 className={styles.emptyTitle}>
                  {hasAnyFilter ? "No Matching Templates" : "No Templates Yet"}
                </h3>
                <p className={styles.emptyText}>
                  {hasAnyFilter
                    ? "No templates match your current filters. Try adjusting or clearing them."
                    : 'Click "Create New Template" to get started.'}
                </p>
                {hasAnyFilter && (
                  <button
                    onClick={() => setFilters({ search: "", designations: [], departments: [], branches: [], countries: [], years: [] })}
                    style={{ marginTop: "12px", padding: "8px 16px", borderRadius: "8px", border: "1.5px solid #e2e8f0", background: "#f8fafc", color: "#374151", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.cardList}>
                {filteredTemplates.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    level={level}
                    permissions={permissions}
                    isCategoryExpanded={expandedCardId   === template.id}
                    isAssignExpanded={expandedAssignId   === template.id}
                    isDuplicating={isDuplicatingId       === template.id}
                    isSelected={selectedIds.has(template.id)}
                    isSelectionMode={isSelectionMode}
                    onSelect={checked => handleToggleSelect(template.id, checked)}
                    onToggleCategoryExpand={() => setExpandedCardId(prev  => prev === template.id ? null : template.id)}
                    onToggleAssignExpand={()   => setExpandedAssignId(prev => prev === template.id ? null : template.id)}
                    onView={()       => handleViewTemplate(template.id)}
                    onEdit={()       => handleEditTemplate(template.id, template)}
                    onDelete={()     => setConfirmDeleteId(template.id)}
                    onDuplicate={()  => handleDuplicateTemplate(template)}
                    onManageFreeze={() => handleNavigateToFreezeManagement(template)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Sticky bulk-delete bar */}
      <BulkDeleteBar
        selectedCount={selectedIds.size}
        onDelete={() => setShowBulkDeleteModal(true)}
        onClear={handleClearSelection}
        isDeleting={isBulkDeleting}
      />
    </div>
  );
}