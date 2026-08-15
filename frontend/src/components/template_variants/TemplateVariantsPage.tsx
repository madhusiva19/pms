/**
 * TemplateVariantsPage.tsx
 *
 * Standalone dashboard for HQ Admin to browse ALL template variants
 * across every template, branch, and country in one place.
 *
 * URL: /hq-admin/template-management/template-variants
 *
 * Features:
 *  - Shows every variant with its parent template name, scope (branch/country),
 *    last modified date, category count, and KPI count.
 *  - Filter bar: search by template name, filter by branch, country,
 *    designation, department, PMS year.
 *  - Actions per variant: View (read-only), Edit, Delete.
 *  - Expandable row to preview categories inside the variant.
 *  - Origin badge: "HQ Created" vs "Branch Edit" vs "Country Edit".
 */

"use client";

import { Suspense, useEffect, useState, useMemo, useRef } from "react";
import { useRouter }                                       from "next/navigation";
import {
  ArrowLeft,    Building2,    Calendar,     CalendarDays, ChevronDown,
  ChevronUp,    CheckCircle2, Clock3,       Eye,          FileText,
  GitBranch,    Globe,        History,      Inbox,        Layers,
  Loader2,      Lock,         Pencil,       Search,       ShieldCheck,
  SlidersHorizontal, Trash2,  Unlock,       Users,        X,
  Flag,         Sparkles,     UserRound
} from "lucide-react";
import { toast }    from "sonner";
import Sidebar      from "@/components/sidebar/Sidebar";
import styles       from "./TemplateVariantsPage.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const HQ_PREFIX = "/hq-admin";
const DASHBOARD_PATH = `${HQ_PREFIX}/template-management`;

const CATEGORY_PALETTE: ReadonlyArray<{ bg: string; fill: string; text: string }> = [
  { bg: "#eff6ff", fill: "#3b82f6", text: "#1e40af" },
  { bg: "#ecfdf5", fill: "#059669", text: "#065f46" },
  { bg: "#fef3c7", fill: "#d97706", text: "#92400e" },
  { bg: "#f5f3ff", fill: "#8b5cf6", text: "#5b21b6" },
  { bg: "#fff1f2", fill: "#f43f5e", text: "#be123c" },
  { bg: "#ecfeff", fill: "#0891b2", text: "#164e63" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssignedBranch {
  id: string; name: string; code: string | null; country_id?: string | null;
}
interface AssignedCountry {
  id: string; name: string; code: string | null;
}
interface AssignedDepartment {
  id: string; name: string; code: string | null; branch_id: string | null;
}
interface AssignedSubDept {
  id: string; name: string; code: string | null;
}
interface TemplateVariantSummary {
  id: number;
  branch_id:    string | null;
  country_id:   string | null;
  name:         string | null;
  lastModified: string | null;
}
interface TemplateRecord {
  id:                       number;
  name:                     string;
  description?:             string;
  pms_cycle_id?:            number | null;
  is_past_cycle?:           boolean;
  freeze_status?:           string;
  assignedDesignations?:    string[];
  assignedDepartments?:     AssignedDepartment[];
  assignedBranches?:        AssignedBranch[];
  assignedCountries?:       AssignedCountry[];
  assignedSubDepartments?:  AssignedSubDept[];
  variants?:                TemplateVariantSummary[];
  hasVariants?:             boolean;
  pms_year?:                string | null;
}

/** A fully hydrated variant fetched from /templates/:id/variants */
interface HydratedVariant {
  id:               number;
  parent_template_id: number;
  parentTemplateName: string;
  branch_id:        string | null;
  branch_name?:     string | null;
  country_id:       string | null;
  country_name?:    string | null;
  name:             string | null;
  description?:     string | null;
  categories?:      any[];
  max_score?:       number | null;
  total_weight?:    number | null;
  lastModified:     string | null;
  created_at?:      string | null;
  created_by?:      string | null;
  pms_cycle_id?:    number | null;
  /** Resolved from parent template */
  assignedDesignations?: string[];
  assignedDepartments?:  AssignedDepartment[];
  assignedBranches?:     AssignedBranch[];
  assignedCountries?:    AssignedCountry[];
  pms_year?:             string | null;
  is_past_cycle?:        boolean;
  freeze_status?:        string;
}

interface FilterState {
  search:       string;
  designations: string[];
  departments:  string[];
  branches:     string[];
  countries:    string[];
  years:        string[];
  scope:        string[]; // "branch" | "country"
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch { return "—"; }
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short",
    });
  } catch { return "—"; }
}

function resolvePmsYear(pmsYear: string | null | undefined, allCycles: any[], cycleId: number | null | undefined): string {
  if (pmsYear) return pmsYear;
  if (cycleId) {
    const c = allCycles.find(x => x.id === cycleId);
    if (c?.pms_year) return String(c.pms_year);
    if (c?.pms_start) {
      const y = new Date(c.pms_start).getFullYear();
      return `${y}/${y + 1}`;
    }
  }
  return "Unknown";
}

function sortByDate<T extends { lastModified?: string | null; created_at?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const da = a.lastModified ?? a.created_at;
    const db = b.lastModified ?? b.created_at;
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return new Date(db).getTime() - new Date(da).getTime();
  });
}

/** Determine how the variant was created */
function resolveOrigin(variant: HydratedVariant): { label: string; color: string; bg: string; border: string } {
  const creator = (variant.created_by ?? "").toLowerCase();
  if (creator === "hq_admin" || creator === "hq admin" || creator === "") {
    return { label: "HQ Created", color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" };
  }
  if (variant.branch_id) {
    return { label: "Branch Edit", color: "#065f46", bg: "#ecfdf5", border: "#6ee7b7" };
  }
  return { label: "Country Edit", color: "#92400e", bg: "#fef3c7", border: "#fde68a" };
}

// ─── FilterDropdown ───────────────────────────────────────────────────────────

function FilterDropdown({
  label, icon, options, selected, onChange,
}: {
  label: string; icon: React.ReactNode; options: string[];
  selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  }

  const has = selected.length > 0;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(p => !p)}
        className={`${styles.dropTrigger} ${has ? styles.dropTriggerActive : ""}`}
      >
        {icon}
        {label}
        {has && <span className={styles.dropBadge}>{selected.length}</span>}
        <ChevronDown size={12} style={{ marginLeft: "auto", opacity: 0.5, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
      </button>

      {open && (
        <div className={styles.dropPanel}>
          <div className={styles.dropHeader}>
            <span>{label}</span>
            {has && (
              <button className={styles.dropClear} onClick={() => { onChange([]); setOpen(false); }}>
                Clear
              </button>
            )}
          </div>
          <div className={styles.dropOptions}>
            {options.length === 0
              ? <p className={styles.dropEmpty}>No options</p>
              : options.map(opt => {
                  const checked = selected.includes(opt);
                  return (
                    <label key={opt} className={`${styles.dropOpt} ${checked ? styles.dropOptChecked : ""}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(opt)} className={styles.dropCheck} />
                      <span>{opt}</span>
                      {checked && <CheckCircle2 size={11} color="#3b82f6" style={{ marginLeft: "auto" }} />}
                    </label>
                  );
                })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ActiveChip ───────────────────────────────────────────────────────────────

function ActiveChip({ label, category, onRemove }: { label: string; category: string; onRemove: () => void }) {
  return (
    <span className={styles.chip}>
      <span className={styles.chipCat}>{category}:</span>
      {label}
      <button className={styles.chipX} onClick={onRemove} aria-label={`Remove ${label}`}>
        <X size={9} />
      </button>
    </span>
  );
}

// ─── FilterBar ────────────────────────────────────────────────────────────────

function FilterBar({
  filters, onChange, opts, total, filtered, loading,
}: {
  filters: FilterState; onChange: (f: FilterState) => void;
  opts: { designations: string[]; departments: string[]; branches: string[]; countries: string[]; years: string[] };
  total: number; filtered: number; loading: boolean;
}) {
  const activeCount = filters.designations.length + filters.departments.length +
    filters.branches.length + filters.countries.length + filters.years.length + filters.scope.length;

  function clearDropdowns() {
    onChange({ ...filters, designations: [], departments: [], branches: [], countries: [], years: [], scope: [] });
  }

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterRow}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search by template or variant name…"
            value={filters.search}
            onChange={e => onChange({ ...filters, search: e.target.value })}
            className={styles.searchInput}
          />
          {filters.search && (
            <button className={styles.searchClear} onClick={() => onChange({ ...filters, search: "" })}>
              <X size={12} />
            </button>
          )}
        </div>

        <div className={styles.divider} />

        <div className={styles.filterLabel}>
          <SlidersHorizontal size={13} />
          <span>Filter:</span>
        </div>

        <FilterDropdown label="Designation" icon={<Users size={12} />}
          options={opts.designations} selected={filters.designations}
          onChange={v => onChange({ ...filters, designations: v })} />
        <FilterDropdown label="Department" icon={<Building2 size={12} />}
          options={opts.departments} selected={filters.departments}
          onChange={v => onChange({ ...filters, departments: v })} />
        <FilterDropdown label="Branch" icon={<GitBranch size={12} />}
          options={opts.branches} selected={filters.branches}
          onChange={v => onChange({ ...filters, branches: v })} />
        <FilterDropdown label="Country" icon={<Globe size={12} />}
          options={opts.countries} selected={filters.countries}
          onChange={v => onChange({ ...filters, countries: v })} />
        <FilterDropdown label="PMS Year" icon={<CalendarDays size={12} />}
          options={opts.years} selected={filters.years}
          onChange={v => onChange({ ...filters, years: v })} />
        <FilterDropdown label="Scope" icon={<Layers size={12} />}
          options={["Branch Variant", "Country Variant"]} selected={filters.scope}
          onChange={v => onChange({ ...filters, scope: v })} />

        {activeCount > 0 && (
          <button className={styles.clearBtn} onClick={clearDropdowns}>
            <X size={11} /> Clear <span className={styles.clearBadge}>{activeCount}</span>
          </button>
        )}

        {!loading && (
          <span className={styles.resultCount}>
            {filtered !== total
              ? <><strong>{filtered}</strong> of {total} variants</>
              : <><strong>{total}</strong> variant{total !== 1 ? "s" : ""}</>}
          </span>
        )}
      </div>

      {/* Active chips */}
      {activeCount > 0 && (
        <div className={styles.chipsRow}>
          <span className={styles.chipsLabel}>Active:</span>
          {filters.designations.map(d => (
            <ActiveChip key={d} label={d} category="Designation"
              onRemove={() => onChange({ ...filters, designations: filters.designations.filter(x => x !== d) })} />
          ))}
          {filters.departments.map(d => (
            <ActiveChip key={d} label={d} category="Department"
              onRemove={() => onChange({ ...filters, departments: filters.departments.filter(x => x !== d) })} />
          ))}
          {filters.branches.map(b => (
            <ActiveChip key={b} label={b} category="Branch"
              onRemove={() => onChange({ ...filters, branches: filters.branches.filter(x => x !== b) })} />
          ))}
          {filters.countries.map(c => (
            <ActiveChip key={c} label={c} category="Country"
              onRemove={() => onChange({ ...filters, countries: filters.countries.filter(x => x !== c) })} />
          ))}
          {filters.years.map(y => (
            <ActiveChip key={y} label={y} category="PMS Year"
              onRemove={() => onChange({ ...filters, years: filters.years.filter(x => x !== y) })} />
          ))}
          {filters.scope.map(s => (
            <ActiveChip key={s} label={s} category="Scope"
              onRemove={() => onChange({ ...filters, scope: filters.scope.filter(x => x !== s) })} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── VariantCard ──────────────────────────────────────────────────────────────
function VariantCard({
  variant,
  allCycles,
  isExpanded,
  onToggleExpand,
  onView,
  onEdit,
  onDelete,
  isDeleting,
}: {
  variant:        HydratedVariant;
  allCycles:      any[];
  isExpanded:     boolean;
  onToggleExpand: () => void;
  onView:         () => void;
  onEdit:         () => void;
  onDelete:       () => void;
  isDeleting:     boolean;
}) {
  const isBranch   = !!variant.branch_id;
  const scopeLabel = isBranch
    ? (variant.branch_name ?? variant.branch_id)
    : (variant.country_name ?? variant.country_id);
  const isPast     = variant.is_past_cycle ?? false;
  const isFrozen   = variant.freeze_status === "frozen";

  return (
    <div className={styles.card}>

      {/* ── Illustration banner ── */}
      <div className={[styles.cardBanner, isBranch ? styles.cardBannerBranch : styles.cardBannerCountry].join(" ")}>
        <div className={styles.cardBannerDot1} />
        <div className={styles.cardBannerDot2} />
        <div className={[styles.cardBannerIcon, isBranch ? styles.cardBannerIconBranch : styles.cardBannerIconCountry].join(" ")}>
          {isBranch ? <UserRound size={17} color="#fff" /> : <Globe size={28} color="#fff" />}
        </div>

        {/* Past cycle badge */}
        {isPast && (
          <span style={{
            position: "absolute", top: 10, right: 10,
            background: "rgba(0,0,0,0.35)", color: "#fff",
            fontSize: 10, fontWeight: 700, padding: "2px 8px",
            borderRadius: 20, display: "flex", alignItems: "center", gap: 4,
          }}>
            <History size={10} /> Past Cycle
          </span>
        )}

        {/* HQ Editable badge — shown only when frozen but NOT past */}
        {!isPast && isFrozen && (
          <span style={{
            position: "absolute", top: 10, right: 10,
            background: "rgba(59,130,246,0.7)", color: "#fff",
            fontSize: 10, fontWeight: 700, padding: "2px 8px",
            borderRadius: 20, display: "flex", alignItems: "center", gap: 4,
          }}>
            <Unlock size={10} /> HQ Editable
          </span>
        )}
      </div>

      {/* ── Body ── */}
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>
          {variant.name ?? variant.parentTemplateName}
        </h3>
        <p className={styles.cardDescription}>
          {variant.description || "Branch-specific variant of the parent template."}
        </p>

        {/* Meta boxes */}
        <div className={styles.cardMeta}>

          {/* Scope — Branch or Country */}
          <div className={styles.cardMetaBox}>
            <div className={[styles.cardMetaBoxIcon, isBranch ? styles.cardMetaBoxIconBranch : styles.cardMetaBoxIconCountry].join(" ")}>
              {isBranch ? <GitBranch size={13} /> : <Globe size={13} />}
            </div>
            <div className={styles.cardMetaBoxText}>
              <span className={styles.cardMetaBoxValue}>{scopeLabel}</span>
              <span className={styles.cardMetaBoxLabel}>{isBranch ? "Branch" : "Country"}</span>
            </div>
          </div>

          {/* Last updated */}
          <div className={styles.cardMetaBox}>
            <div className={[styles.cardMetaBoxIcon, isBranch ? styles.cardMetaBoxIconBranch : styles.cardMetaBoxIconCountry].join(" ")}>
              <Clock3 size={13} />
            </div>
            <div className={styles.cardMetaBoxText}>
              <span className={styles.cardMetaBoxValue}>{formatShortDate(variant.lastModified)}</span>
              <span className={styles.cardMetaBoxLabel}>Updated</span>
            </div>
          </div>

          {/* Created by */}
          <div className={styles.cardMetaBox}>
            <div className={[styles.cardMetaBoxIcon, isBranch ? styles.cardMetaBoxIconBranch : styles.cardMetaBoxIconCountry].join(" ")}>
              <Users size={13} />
            </div>
            <div className={styles.cardMetaBoxText}>
              <span
                className={styles.cardMetaBoxValue}
                style={{ textTransform: "capitalize" }}
              >
                {variant.created_by
                  ? variant.created_by.replace(/_/g, " ")
                  : "—"}
              </span>
              <span className={styles.cardMetaBoxLabel}>Created by</span>
            </div>
          </div>

        </div>
      </div>

      {/* ── Footer actions ── */}
      <div className={styles.cardFooter}>
        <button
          className={`${styles.cardFooterBtn} ${isBranch ? styles.cardFooterBtnPrimary : styles.cardFooterBtnPrimaryCountry}`}
          onClick={() => {
            if (isPast) {
              toast.error("Past-cycle variants are permanently frozen.");
              return;
            }
            onEdit();
          }}
        >
          <Pencil size={13} /> Edit Variant
        </button>
        <button
          className={`${styles.cardFooterBtn} ${styles.cardFooterBtnSecondary}`}
          onClick={onView}
        >
          <Eye size={13} /> View
        </button>
        <button
          className={`${styles.cardFooterBtn} ${styles.cardFooterBtnDanger}`}
          onClick={() => {
            if (isPast) { toast.error("Past-cycle variants cannot be deleted."); return; }
            onDelete();
          }}
          disabled={isDeleting}
        >
          {isDeleting ? <Loader2 size={13} className={styles.spin} /> : <Trash2 size={13} />}
        </button>
      </div>
    </div>
  );
}

// ─── DeleteConfirmModal ───────────────────────────────────────────────────────

function DeleteConfirmModal({
  variant,
  onCancel,
  onConfirm,
  isDeleting,
}: {
  variant:   HydratedVariant;
  onCancel:  () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  const scopeLabel = variant.branch_id
    ? (variant.branch_name ?? variant.branch_id)
    : (variant.country_name ?? variant.country_id);

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalIconWrap}>
          <Trash2 size={22} color="#ef4444" />
        </div>
        <h3 className={styles.modalTitle}>Delete Variant?</h3>
        <p className={styles.modalText}>
          This will permanently delete the <strong>{variant.branch_id ? "branch" : "country"}</strong> variant
          for <strong>{scopeLabel}</strong> on template <strong>{variant.parentTemplateName}</strong>.
          The parent template content will be used for this scope instead.
        </p>
        <div className={styles.modalActions}>
          <button className={styles.modalCancel} onClick={onCancel} disabled={isDeleting}>
            Cancel
          </button>
          <button className={styles.modalDelete} onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? <><Loader2 size={13} className={styles.spin} /> Deleting…</> : "Delete Variant"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TemplateVariantsPage ─────────────────────────────────────────────────────

export default function TemplateVariantsPage() {
  const router = useRouter();

  const [templates,       setTemplates]       = useState<TemplateRecord[]>([]);
  const [allVariants,     setAllVariants]      = useState<HydratedVariant[]>([]);
  const [allCycles,       setAllCycles]        = useState<any[]>([]);
  const [activeCycle,     setActiveCycle]      = useState<any>(null);
  const [isLoading,       setIsLoading]        = useState(true);
  const [expandedId,      setExpandedId]       = useState<number | null>(null);
  const [deleteTarget,    setDeleteTarget]      = useState<HydratedVariant | null>(null);
  const [isDeletingId,    setIsDeletingId]     = useState<number | null>(null);
  const [filters,         setFilters]          = useState<FilterState>({
    search: "", designations: [], departments: [], branches: [], countries: [], years: [], scope: [],
  });

  // ── Load data ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [tmplRes, cycleRes, allCyclesRes] = await Promise.all([
          fetch(`${API_BASE}/templates`),
          fetch(`${API_BASE}/pms-cycles/active`),
          fetch(`${API_BASE}/pms-cycles`),
        ]);

        if (!tmplRes.ok) throw new Error("Failed to load templates");
        const tmplData: TemplateRecord[] = await tmplRes.json();
        setTemplates(tmplData);

        if (cycleRes.ok)     setActiveCycle(await cycleRes.json());
        if (allCyclesRes.ok) setAllCycles(await allCyclesRes.json());

        // Fetch full variant details for every template that has variants
        const templatesWithVariants = tmplData.filter(
          t => (t.hasVariants || (t.variants?.length ?? 0) > 0),
        );

        const variantFetches = templatesWithVariants.map(async tmpl => {
          try {
            const res = await fetch(
              `${API_BASE}/templates/${tmpl.id}/variants`,
              { headers: { "X-User-Level": "1" } },
            );
            if (!res.ok) return [];
            const data: any[] = await res.json();
            // Hydrate with parent template metadata
            return data.map((v): HydratedVariant => ({
              ...v,
              parent_template_id: tmpl.id,
              parentTemplateName: tmpl.name,
              assignedDesignations: tmpl.assignedDesignations,
              assignedDepartments:  tmpl.assignedDepartments,
              assignedBranches:     tmpl.assignedBranches,
              assignedCountries:    tmpl.assignedCountries,
              pms_year:             tmpl.pms_year,
              is_past_cycle:        tmpl.is_past_cycle,
              freeze_status:        tmpl.freeze_status,
            }));
          } catch {
            return [];
          }
        });

        const results = await Promise.all(variantFetches);
        const flat = results.flat();
        setAllVariants(sortByDate(flat));
      } catch {
        toast.error("Could not load variants. Please refresh.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // ── Filter options ─────────────────────────────────────────────────────────

  const filterOpts = useMemo(() => {
    const d = new Set<string>(), dept = new Set<string>(), br = new Set<string>(), co = new Set<string>();
    templates.forEach(t => {
      t.assignedDesignations?.forEach(x => d.add(x));
      t.assignedDepartments?.forEach(x => dept.add(x.name));
      t.assignedBranches?.forEach(x => br.add(x.name));
      t.assignedCountries?.forEach(x => { const l = x.name?.trim() || x.code?.trim(); if (l) co.add(l); });
    });
    const yearSet = new Set<string>();
    allVariants.forEach(v => {
      const y = resolvePmsYear(v.pms_year, allCycles, v.pms_cycle_id);
      if (y && y !== "Unknown") yearSet.add(y);
    });
    return {
      designations: [...d].sort(),
      departments:  [...dept].sort(),
      branches:     [...br].sort(),
      countries:    [...co].sort(),
      years:        [...yearSet].sort((a, b) => b.localeCompare(a)),
    };
  }, [templates, allVariants, allCycles]);

  // ── Filtered variants ──────────────────────────────────────────────────────

  const filteredVariants = useMemo(() => {
    let result = allVariants;

    if (filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(v =>
        v.parentTemplateName?.toLowerCase().includes(q) ||
        v.name?.toLowerCase().includes(q) ||
        v.branch_name?.toLowerCase().includes(q) ||
        v.country_name?.toLowerCase().includes(q),
      );
    }
    if (filters.designations.length > 0) {
      result = result.filter(v =>
        filters.designations.some(d => v.assignedDesignations?.includes(d)),
      );
    }
    if (filters.departments.length > 0) {
      result = result.filter(v =>
        filters.departments.some(d => v.assignedDepartments?.some(x => x.name === d)),
      );
    }
    if (filters.branches.length > 0) {
      result = result.filter(v =>
        filters.branches.some(b =>
          v.assignedBranches?.some(x => x.name === b) ||
          v.branch_name === b,
        ),
      );
    }
    if (filters.countries.length > 0) {
      result = result.filter(v =>
        filters.countries.some(c =>
          v.assignedCountries?.some(x => (x.name?.trim() || x.code?.trim()) === c) ||
          v.country_name === c,
        ),
      );
    }
    if (filters.years.length > 0) {
      result = result.filter(v => {
        const y = resolvePmsYear(v.pms_year, allCycles, v.pms_cycle_id);
        return filters.years.includes(y);
      });
    }
    if (filters.scope.length > 0) {
      result = result.filter(v => {
        if (filters.scope.includes("Branch Variant") && v.branch_id)   return true;
        if (filters.scope.includes("Country Variant") && v.country_id) return true;
        return false;
      });
    }
    return sortByDate(result);
  }, [allVariants, filters, allCycles]);

  // ── Stats for header ───────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const branchVariants  = allVariants.filter(v => v.branch_id);
    const countryVariants = allVariants.filter(v => v.country_id);
    const pastVariants    = allVariants.filter(v => v.is_past_cycle);
    return { total: allVariants.length, branch: branchVariants.length, country: countryVariants.length, past: pastVariants.length };
  }, [allVariants]);

  // ── Actions ────────────────────────────────────────────────────────────────

  function handleView(variant: HydratedVariant) {
    router.push(
      `${HQ_PREFIX}/template-management/template-creation` +
      `?edit=${variant.parent_template_id}&variantId=${variant.id}&mode=view`,
    );
  }

  function handleEdit(variant: HydratedVariant) {
    router.push(
      `${HQ_PREFIX}/template-management/template-creation` +
      `?edit=${variant.parent_template_id}&variantId=${variant.id}`,
    );
  }

  async function handleDelete(variant: HydratedVariant) {
    setIsDeletingId(variant.id);
    try {
      const res = await fetch(
        `${API_BASE}/templates/${variant.parent_template_id}/variants/${variant.id}`,
        { method: "DELETE", headers: { "X-User-Level": "1" } },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Delete failed");
      }
      setAllVariants(prev => prev.filter(v => v.id !== variant.id));
      setDeleteTarget(null);
      toast.success("Variant deleted — branch/country will now use the parent template.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not delete variant.");
    } finally {
      setIsDeletingId(null);
    }
  }

  const hasFilter = !!(filters.search || filters.designations.length || filters.departments.length ||
    filters.branches.length || filters.countries.length || filters.years.length || filters.scope.length);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.shell}>
      <main className={styles.main}>
        <div className={styles.wrapper}>

          {/* Delete confirm modal */}
          {deleteTarget && (
            <DeleteConfirmModal
              variant={deleteTarget}
              onCancel={() => setDeleteTarget(null)}
              onConfirm={() => handleDelete(deleteTarget)}
              isDeleting={isDeletingId === deleteTarget.id}
            />
          )}

          {/* Page header */}
          <div className={styles.pageHeader}>
            <div className={styles.headerLeft}>
              <div className={styles.headerIcon}>
                <Layers size={22} color="#3b82f6" />
              </div>
              <div>
                <p className={styles.pageSubtitle}>
                  All branch and country content variants across every template
                </p>
              </div>
            </div>

            <button
              className={styles.backBtn}
              onClick={() => router.push(DASHBOARD_PATH)}
            >
              <ArrowLeft size={14} /> Back to Templates
            </button>
          </div>

          {/* Summary stats */}
          {!isLoading && (
           <div className={styles.statsBar}>
  <div className={`${styles.statBarCell} ${styles.statBarCellTotal}`}>
    <div className={styles.statBarIcon}>
      <Layers size={18} color="#6d28d9" />
    </div>
    <span className={styles.statBarValue}>{stats.total}</span>
    <span className={styles.statBarLabel}>Total Variants</span>
  </div>

  <div className={`${styles.statBarCell} ${styles.statBarCellBranch}`}>
    <div className={styles.statBarIcon}>
      <GitBranch size={18} color="#0891b2" />
    </div>
    <span className={styles.statBarValue}>{stats.branch}</span>
    <span className={styles.statBarLabel}>Branch Variants</span>
  </div>

  <div className={`${styles.statBarCell} ${styles.statBarCellCountry}`}>
    <div className={styles.statBarIcon}>
      <Globe size={18} color="#059669" />
    </div>
    <span className={styles.statBarValue}>{stats.country}</span>
    <span className={styles.statBarLabel}>Country Variants</span>
  </div>

  <div className={`${styles.statBarCell} ${styles.statBarCellPast}`}>
    <div className={styles.statBarIcon}>
      <History size={18} color="#d97706" />
    </div>
    <span className={styles.statBarValue}>{stats.past}</span>
    <span className={styles.statBarLabel}>Past Cycle</span>
  </div>
</div>
          )}

          {/* Filter bar */}
          <FilterBar
            filters={filters}
            onChange={setFilters}
            opts={filterOpts}
            total={allVariants.length}
            filtered={filteredVariants.length}
            loading={isLoading}
          />

          {/* Content */}
          {isLoading ? (
            <div className={styles.loadingWrap}>
              <Loader2 size={36} color="#3b82f6" className={styles.spin} />
              <p className={styles.loadingText}>Loading all variants…</p>
            </div>
          ) : filteredVariants.length === 0 ? (
            <div className={styles.emptyState}>
              <Inbox size={48} color="#cbd5e1" style={{ margin: "0 auto 16px" }} />
              <h3 className={styles.emptyTitle}>
                {hasFilter ? "No Matching Variants" : "No Variants Yet"}
              </h3>
              <p className={styles.emptyText}>
                {hasFilter
                  ? "No variants match your current filters."
                  : "Variants are created via Manage Freeze on the template dashboard when branches or countries need customised content."}
              </p>
              {hasFilter && (
                <button
                  className={styles.clearAllBtn}
                  onClick={() => setFilters({ search: "", designations: [], departments: [], branches: [], countries: [], years: [], scope: [] })}
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className={styles.cardList}>
              {filteredVariants.map(variant => (
                <VariantCard
                  key={variant.id}
                  variant={variant}
                  allCycles={allCycles}
                  isExpanded={expandedId === variant.id}
                  onToggleExpand={() => setExpandedId(p => p === variant.id ? null : variant.id)}
                  onView={() => handleView(variant)}
                  onEdit={() => handleEdit(variant)}
                  onDelete={() => setDeleteTarget(variant)}
                  isDeleting={isDeletingId === variant.id}
                />
              ))}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}