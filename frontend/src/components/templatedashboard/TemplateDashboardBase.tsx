/**
 * TemplateDashboardBase.tsx
 *
 * Main dashboard component for the Template Management module.
 * Handles template listing, filtering, freeze management,
 * PMS cycle display, and role-based access control.
 *
 * @module TemplateDashboardBase
 */

"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Search, FileText, Pencil, Trash2, Lock, Loader2, Inbox,
  Target, Calendar, Copy, BookOpen, CheckCircle2, Clock3,
  Eye, ChevronDown, ChevronUp, Layers, Unlock, Award,
  Users, Building2, BarChart3, TrendingUp, GitBranch,
  Settings, X, AlertTriangle, Globe, History,
  SlidersHorizontal, Flag, Star, ShieldCheck, Plus,
} from "lucide-react";
import { toast } from "sonner";
import styles from "./TemplateDashboardBase.module.css";
import { formatDate, daysUntil } from "@/lib/freezeUtils";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Base URL for all API requests, falls back to local dev server. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

/** Number of days before objective-setting close that triggers a "closing soon" warning banner. */
const CLOSING_WARNING_THRESHOLD_DAYS = 14;

/** Maximum number of API tokens to request per Claude completion (not used directly here but kept for reference). */
const MAX_TOKENS = 1000;

/**
 * Colour palette cycled across template categories.
 * Each entry contains background, fill (chart/bar), and text colours.
 */
const CATEGORY_PALETTE: ReadonlyArray<{ bg: string; fill: string; text: string }> = [
  { bg: "#eff6ff", fill: "#3b82f6", text: "#1e40af" },
  { bg: "#ecfdf5", fill: "#059669", text: "#065f46" },
  { bg: "#fef3c7", fill: "#d97706", text: "#92400e" },
  { bg: "#f5f3ff", fill: "#8b5cf6", text: "#5b21b6" },
  { bg: "#fff1f2", fill: "#f43f5e", text: "#be123c" },
  { bg: "#ecfeff", fill: "#0891b2", text: "#164e63" },
];

/** Human-readable labels for scope-based assignment rules. */
const SCOPE_LABELS: Readonly<Record<string, string>> = {
  all_country_admins:  "All Country Admins",
  all_branch_admins:   "All Branch Admins",
  all_dept_admins:     "All Department Admins",
  all_sub_dept_admins: "All Sub-Department Admins",
};

/**
 * Maps a numeric role level to its dashboard URL prefix.
 * Level 1 = HQ Admin, 2 = Country Admin, etc.
 */
const ROLE_PREFIXES: Readonly<Record<number, string>> = {
  1: "/hq-admin",
  2: "/country-admin",
  3: "/branch-admin",
  4: "/dept-admin",
  5: "/sub-dept-admin",
};

/** Fallback prefix when the level is not found in ROLE_PREFIXES. */
const DEFAULT_ROLE_PREFIX = "/hq-admin";

/** Display labels used in status banners and permission summaries. */
const ROLE_LABELS: Readonly<Record<number, string>> = {
  1: "HQ Administrator",
  2: "Country Administrator",
  3: "Branch Administrator",
  4: "Department Administrator",
  5: "Sub-Department Administrator",
};

// ─── Types ────────────────────────────────────────────────────────────────────

/** Possible freeze states for a template within a PMS cycle. */
type FreezeStatus = "open" | "grace" | "frozen";

/** Key milestone dates derived from the active PMS cycle record. */
interface DynamicFreezeDates {
  pmsYearStart:        Date;
  objectiveSettingEnd: Date;
  graceEnd:            Date;
  midYearReview:       Date | null;
  yearEndReview:       Date | null;
}

/** Computed permissions for the current role and freeze state. */
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
  id:        string;
  name:      string;
  code:      string | null;
  branch_id: string | null;
}

interface AssignedBranch {
  id:         string;
  name:       string;
  code:       string | null;
  country_id?: string | null;
}

interface AssignedCountry {
  id:   string;
  name: string;
  code: string | null;
}

interface AssignedSubDept {
  id:   string;
  name: string;
  code: string | null;
}

/** A single row in the template assignment rules table. */
interface AssignmentRule {
  designation_id:    number | null;
  department_id:     string | null;
  branch_id:         string | null;
  user_id:           string | null;
  country_id:        string | null;
  sub_department_id: string | null;
  scope:             string | null;
}

/** An unfreeze exception record that temporarily opens a frozen template for a branch or country. */
interface UnfreezeException {
  id:           number;
  branch_id:    string | null;
  country_id:   string | null;
  unfrozen_at:  string | null;
}

/** A branch- or country-specific override copy of a template's content. */
interface TemplateVariant {
  id:           number;
  branch_id:    string | null;
  country_id:   string | null;
  name:         string | null;
  lastModified: string | null;
}

/** Full template record returned by the API. */
interface TemplateRecord {
  id:                      number;
  name:                    string;
  description?:            string;
  categories?:             any[];
  total_weight?:           number;
  max_score?:              number;
  lastModified?:           string;
  created_at?:             string;
  pms_cycle_id?:           number | null;
  freeze_status?:          FreezeStatus;
  is_past_cycle?:          boolean;
  assignedDesignations?:   string[];
  assignedDesignationIds?: number[];
  assignedDepartments?:    AssignedDepartment[];
  assignedDepartmentNames?: string[];
  assignedDepartmentsIds?: string[];
  assignedBranches?:       AssignedBranch[];
  assignedBranchIds?:      string[];
  assignedCountries?:      AssignedCountry[];
  assignedCountryIds?:     string[];
  assignedSubDepartments?: AssignedSubDept[];
  assignedSubDepartmentIds?: string[];
  assignedEmployees?:      string[];
  assignedEmployeeIds?:    string[];
  assignedRules?:          AssignmentRule[];
  unfrozenBranchIds?:      string[];
  unfrozenCountryIds?:     string[];
  unfreezeExceptions?:     UnfreezeException[];
  variants?:               TemplateVariant[];
  hasVariants?:            boolean;
}

/** Form state for the Edit PMS Cycle Dates modal. */
interface CycleDatesForm {
  objective_setting_end: string;
  grace_period_end:      string;
  mid_year_review:       string;
  year_end_review:       string;
}

/** State object for the horizontal filter bar. */
interface FilterState {
  search:       string;
  designations: string[];
  departments:  string[];
  branches:     string[];
  countries:    string[];
}

// ─── Pure Utility Functions ───────────────────────────────────────────────────

/**
 * Returns the URL prefix for the given admin role level.
 * Falls back to DEFAULT_ROLE_PREFIX when the level is unrecognised.
 */
function getRolePrefix(level: number): string {
  return ROLE_PREFIXES[level] ?? DEFAULT_ROLE_PREFIX;
}

/**
 * Sorts an array of items with a `lastModified` or `created_at` field,
 * newest first. Items without dates are placed at the end.
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
 * Derives DynamicFreezeDates from a raw PMS cycle API record.
 * Provides safe fallbacks when cycle data is missing.
 */
function buildFreezeDates(activeCycle: any): DynamicFreezeDates {
  const now         = new Date();
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
 * Computes the current TemplatePermissions for a given admin level and freeze dates.
 * Permissions are purely derived — they contain no side effects.
 */
function computePermissions(
  level:       number,
  freezeDates: DynamicFreezeDates,
): TemplatePermissions {
  const now = new Date();

  const freezeStatus: FreezeStatus =
    now <= freezeDates.objectiveSettingEnd ? "open"
    : now <= freezeDates.graceEnd          ? "grace"
    : "frozen";

  const isHqAdmin    = level === 1;
  const isNonHqAdmin = level >= 2 && level <= 5;

  const canEditLocked   = isHqAdmin && freezeStatus !== "frozen";
  const canEditEditable =
    (isHqAdmin && freezeStatus !== "frozen") ||
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

/**
 * Converts an ISO date string (or null/undefined) to the YYYY-MM-DD format
 * required by HTML <input type="date"> elements.
 */
function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().split("T")[0];
  } catch {
    return "";
  }
}

// ─── ManageFreezeModal ────────────────────────────────────────────────────────

/**
 * Modal that lets an HQ Admin:
 *  - View which branches/countries are frozen or unfrozen.
 *  - Unfreeze selected frozen branches/countries.
 *  - Re-freeze previously unfrozen ones.
 *  - Create or navigate to branch/country content variants.
 */
function ManageFreezeModal({
  template,
  rolePrefix,
  onClose,
  onSaved,
}: {
  template:   TemplateRecord;
  rolePrefix: string;
  onClose:    () => void;
  onSaved:    (updated: TemplateRecord) => void;
}) {
  const router = useRouter();

  // ── Derived sets for quick membership tests ──
  const assignedBranches  = template.assignedBranches  ?? [];
  const assignedCountries = template.assignedCountries ?? [];
  const exceptions        = template.unfreezeExceptions ?? [];
  const variants          = template.variants ?? [];

  const unfrozenBranchIdSet  = new Set(template.unfrozenBranchIds  ?? []);
  const unfrozenCountryIdSet = new Set(template.unfrozenCountryIds ?? []);

  const frozenBranches    = assignedBranches.filter(b  => !unfrozenBranchIdSet.has(b.id));
  const unfrozenBranches  = assignedBranches.filter(b  =>  unfrozenBranchIdSet.has(b.id));
  const frozenCountries   = assignedCountries.filter(c => !unfrozenCountryIdSet.has(c.id));
  const unfrozenCountries = assignedCountries.filter(c =>  unfrozenCountryIdSet.has(c.id));

  // ── Local state ──
  const [selectedToUnfreeze, setSelectedToUnfreeze] = useState<Set<string>>(new Set());
  const [isSaving,           setIsSaving]            = useState(false);
  const [refreezingIds,      setRefreezingIds]        = useState<Set<string>>(new Set());
  const [creatingVariantFor, setCreatingVariantFor]   = useState<string | null>(null);
  const [activeTab,          setActiveTab]            = useState<"branches" | "countries">("branches");

  const isBranchTab = activeTab === "branches";

  // Items visible in the currently selected tab
  const currentFrozenItems   = isBranchTab ? frozenBranches   : frozenCountries;
  const currentUnfrozenItems = isBranchTab ? unfrozenBranches : unfrozenCountries;

  // Only the items from the current tab that are selected
  const currentTabSelected = [...selectedToUnfreeze].filter(id =>
    currentFrozenItems.some(item => item.id === id),
  );

  const areAllFrozenSelected =
    currentFrozenItems.length > 0 &&
    currentFrozenItems.every(item => selectedToUnfreeze.has(item.id));

  // ── Helpers ──

  function toggleItemSelection(id: string): void {
    setSelectedToUnfreeze(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll(): void {
    const ids = currentFrozenItems.map(item => item.id);
    setSelectedToUnfreeze(prev => {
      const next = new Set(prev);
      areAllFrozenSelected
        ? ids.forEach(id => next.delete(id))
        : ids.forEach(id => next.add(id));
      return next;
    });
  }

  /** Re-fetches the full template list and calls onSaved with the updated record. */
  async function refreshAndSave(successMessage: string): Promise<void> {
    const refreshRes = await fetch(`${API_BASE}/templates`);
    if (refreshRes.ok) {
      const allTemplates: TemplateRecord[] = await refreshRes.json();
      const updated = allTemplates.find(t => t.id === template.id);
      if (updated) {
        toast.success(successMessage);
        onSaved(updated);
        return;
      }
    }
    // Fallback: show message and close without a fresh record
    toast.success(successMessage);
    onClose();
  }

  /** Deletes an unfreeze exception, effectively re-freezing the branch/country. */
  async function handleRefreeze(itemId: string): Promise<void> {
    const exception = exceptions.find(
      e => e.branch_id === itemId || e.country_id === itemId,
    );
    if (!exception) {
      toast.error("Exception record not found.");
      return;
    }

    setRefreezingIds(prev => new Set(prev).add(itemId));
    try {
      const response = await fetch(
        `${API_BASE}/templates/${template.id}/unfreeze-exceptions/${exception.id}`,
        { method: "DELETE", headers: { "X-User-Level": "1" } },
      );
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Re-freeze failed");
      }
      await refreshAndSave("Re-frozen successfully.");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to re-freeze.");
    } finally {
      setRefreezingIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  }

  /** Creates unfreeze exceptions for all currently selected items in the active tab. */
  async function handleUnfreezeSelected(): Promise<void> {
    if (currentTabSelected.length === 0) return;

    setIsSaving(true);
    try {
      const requestBody = isBranchTab
        ? { branch_ids: currentTabSelected, country_ids: [] }
        : { branch_ids: [],                 country_ids: currentTabSelected };

      const response = await fetch(
        `${API_BASE}/templates/${template.id}/unfreeze-exceptions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-User-Level": "1" },
          body:    JSON.stringify(requestBody),
        },
      );
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Unfreeze failed");
      }

      // Deselect the just-unfrozen items
      setSelectedToUnfreeze(prev => {
        const next = new Set(prev);
        currentTabSelected.forEach(id => next.delete(id));
        return next;
      });

      const entityLabel = isBranchTab ? "branch(es)" : "countr(ies)";
      await refreshAndSave(`Unfrozen ${currentTabSelected.length} ${entityLabel}.`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to unfreeze.");
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Creates a new content variant for the given branch or country,
   * then navigates to the variant editor.
   * If a variant already exists (HTTP 409), navigates directly to it.
   */
  async function handleCreateVariant(
    branchId:  string | null,
    countryId: string | null,
  ): Promise<void> {
    const scopeKey = branchId ?? countryId ?? "";
    setCreatingVariantFor(scopeKey);

    try {
      const requestBody: Record<string, string> = {};
      if (branchId)  requestBody.branch_id  = branchId;
      if (countryId) requestBody.country_id = countryId;

      const response = await fetch(
        `${API_BASE}/templates/${template.id}/variants`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json", "X-User-Level": "1" },
          body:    JSON.stringify(requestBody),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        // 409 = variant already exists — navigate to it instead
        if (response.status === 409 && data.variant_id) {
          onClose();
          router.push(
            `${rolePrefix}/template-management/create-assign-template?edit=${template.id}&variantId=${data.variant_id}`,
          );
          return;
        }
        throw new Error(data.error ?? "Failed to create variant");
      }

      toast.success("Variant created — opening editor…");
      onClose();
      router.push(
        `${rolePrefix}/template-management/create-assign-template?edit=${template.id}&variantId=${data.variant.id}`,
      );
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create variant.");
    } finally {
      setCreatingVariantFor(null);
    }
  }

  function handleEditVariant(variantId: number): void {
    onClose();
    router.push(
      `${rolePrefix}/template-management/create-assign-template?edit=${template.id}&variantId=${variantId}`,
    );
  }

  // ── Tab configuration ──
  const TAB_CONFIG = [
    {
      key:           "branches"  as const,
      label:         "Branches",
      totalCount:    assignedBranches.length,
      unfrozenCount: unfrozenBranches.length,
    },
    {
      key:           "countries" as const,
      label:         "Countries",
      totalCount:    assignedCountries.length,
      unfrozenCount: unfrozenCountries.length,
    },
  ];

  // ── Derived department / sub-dept data for scope display ──
  const uniqueDeptNames    = [...new Set((template.assignedDepartments    ?? []).map(d => d.name))];
  const uniqueSubDeptNames = [...new Set((template.assignedSubDepartments ?? []).map(s => s.name))];
  const hasScopeChips      = uniqueDeptNames.length > 0 || uniqueSubDeptNames.length > 0;

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div style={{
        background: "#fff", borderRadius: "20px", width: "600px",
        maxWidth: "95vw", maxHeight: "90vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.18)", border: "1px solid #e2e8f0",
      }}>

        {/* ── Modal header ── */}
        <div style={{
          padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9",
          background: "#fafbff", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              width: "38px", height: "38px", background: "#fff7ed",
              border: "1px solid #fed7aa", borderRadius: "10px",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <ShieldCheck size={18} color="#ea580c" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "800", color: "#0f172a" }}>
                Manage Freeze Exceptions
              </h3>
              <p style={{ margin: 0, fontSize: "12px", color: "#64748b", fontWeight: "500" }}>
                {template.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: "#f1f5f9", border: "none", borderRadius: "8px",
              padding: "7px", cursor: "pointer", color: "#64748b",
              display: "flex", alignItems: "center",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Scope chips (departments / sub-departments) ── */}
        {hasScopeChips && (
          <div style={{
            margin: "14px 24px 0", padding: "10px 14px", background: "#f8fafc",
            border: "1px solid #e2e8f0", borderRadius: "10px",
            display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap",
          }}>
            <span style={{
              fontSize: "11px", fontWeight: "700", color: "#64748b",
              textTransform: "uppercase", letterSpacing: "0.4px", flexShrink: 0,
            }}>
              Scope:
            </span>
            {uniqueDeptNames.map(name => (
              <span key={name} style={{
                fontSize: "11px", fontWeight: "700", padding: "2px 8px",
                borderRadius: "6px", background: "#fef3c7", color: "#92400e",
                border: "1px solid #fde68a",
              }}>
                {name}
              </span>
            ))}
            {uniqueSubDeptNames.map(name => (
              <span key={name} style={{
                fontSize: "11px", fontWeight: "700", padding: "2px 8px",
                borderRadius: "6px", background: "#eff6ff", color: "#1e40af",
                border: "1px solid #bfdbfe",
              }}>
                {name}
              </span>
            ))}
          </div>
        )}

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", padding: "12px 24px 0", borderBottom: "1px solid #f1f5f9" }}>
          {TAB_CONFIG.map(tab => {
            const isActiveTab = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSelectedToUnfreeze(new Set()); }}
                style={{
                  padding: "8px 16px", border: "none", cursor: "pointer",
                  fontSize: "13px", fontWeight: "700", background: "transparent",
                  borderBottom: isActiveTab ? "2px solid #3b82f6" : "2px solid transparent",
                  color: isActiveTab ? "#1e40af" : "#64748b",
                  marginBottom: "-1px", transition: "all 0.15s",
                  display: "flex", alignItems: "center", gap: "6px",
                }}
              >
                {tab.label}
                <span style={{
                  fontSize: "11px", fontWeight: "800", padding: "1px 7px",
                  borderRadius: "10px",
                  background: isActiveTab ? "#eff6ff" : "#f1f5f9",
                  color:      isActiveTab ? "#1e40af" : "#64748b",
                }}>
                  {tab.totalCount}
                </span>
                {tab.unfrozenCount > 0 && (
                  <span style={{
                    fontSize: "10px", fontWeight: "800", padding: "1px 6px",
                    borderRadius: "10px", background: "#f0fdf4", color: "#166534",
                    border: "1px solid #bbf7d0",
                  }}>
                    {tab.unfrozenCount} unfrozen
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 16px" }}>

          {/* Section: Currently Unfrozen */}
          {currentUnfrozenItems.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                <Unlock size={13} color="#166534" />
                <span style={{
                  fontSize: "11px", fontWeight: "800", color: "#166534",
                  textTransform: "uppercase", letterSpacing: "0.5px",
                }}>
                  Currently Unfrozen — {currentUnfrozenItems.length}
                </span>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                  Re-freeze or create a branch variant
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {currentUnfrozenItems.map(item => {
                  const isRefreezing    = refreezingIds.has(item.id);
                  const branchId        = isBranchTab ? item.id : null;
                  const countryId       = !isBranchTab ? item.id : null;
                  const existingVariant = variants.find(
                    v => (branchId  && v.branch_id  === branchId)  ||
                         (countryId && v.country_id === countryId),
                  );
                  const isCreatingVariant = creatingVariantFor === item.id;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "11px 14px", borderRadius: "10px",
                        background: "#f0fdf4", border: "1.5px solid #bbf7d0", flexWrap: "wrap",
                      }}
                    >
                      <Unlock size={14} color="#16a34a" style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: "700", color: "#14532d" }}>
                          {(item as any).code ? `${(item as any).code} — ` : ""}
                          {item.name}
                        </div>

                        {/* Show parent country for a branch item */}
                        {isBranchTab && (item as AssignedBranch).country_id && (() => {
                          const parentCountry = assignedCountries.find(
                            c => c.id === (item as AssignedBranch).country_id,
                          );
                          return parentCountry
                            ? <div style={{ fontSize: "11px", color: "#4ade80", marginTop: "2px" }}>
                                {parentCountry.code ?? parentCountry.name}
                              </div>
                            : null;
                        })()}

                        {existingVariant && (
                          <div style={{ fontSize: "10px", color: "#166534", marginTop: "3px", fontWeight: "600" }}>
                            Has custom variant · last modified{" "}
                            {existingVariant.lastModified
                              ? new Date(existingVariant.lastModified).toLocaleDateString(
                                  "en-GB",
                                  { day: "numeric", month: "short" },
                                )
                              : "—"}
                          </div>
                        )}
                      </div>

                      {/* Edit or Create Variant button */}
                      {existingVariant ? (
                        <button
                          onClick={() => handleEditVariant(existingVariant.id)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: "5px",
                            padding: "5px 11px", borderRadius: "7px", cursor: "pointer",
                            fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap",
                            background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e40af",
                            transition: "all 0.15s",
                          }}
                        >
                          <Pencil size={11} /> Edit Variant
                        </button>
                      ) : (
                        <button
                          onClick={() => handleCreateVariant(branchId, countryId)}
                          disabled={isCreatingVariant}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: "5px",
                            padding: "5px 11px", borderRadius: "7px",
                            cursor: isCreatingVariant ? "not-allowed" : "pointer",
                            fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap",
                            background: isCreatingVariant ? "#e2e8f0" : "#f0fdf4",
                            border: `1px solid ${isCreatingVariant ? "#e2e8f0" : "#bbf7d0"}`,
                            color:  isCreatingVariant ? "#94a3b8" : "#166534",
                            transition: "all 0.15s",
                          }}
                        >
                          {isCreatingVariant
                            ? <><Loader2 size={11} className={styles.spinner} /> Creating…</>
                            : <><Plus    size={11} /> Create Variant</>}
                        </button>
                      )}

                      {/* Re-freeze button */}
                      <button
                        onClick={() => handleRefreeze(item.id)}
                        disabled={isRefreezing}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "5px",
                          padding: "5px 11px", borderRadius: "7px",
                          cursor: isRefreezing ? "not-allowed" : "pointer",
                          fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap",
                          background: isRefreezing ? "#e2e8f0" : "#fff",
                          border: `1px solid ${isRefreezing ? "#e2e8f0" : "#fca5a5"}`,
                          color:  isRefreezing ? "#94a3b8" : "#dc2626",
                          transition: "all 0.15s",
                        }}
                      >
                        {isRefreezing
                          ? <><Loader2 size={11} className={styles.spinner} /> Freezing…</>
                          : <><Lock    size={11} /> Re-freeze</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Currently Frozen */}
          {currentFrozenItems.length > 0 && (
            <div style={{ marginTop: currentUnfrozenItems.length > 0 ? "20px" : "16px" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "10px", flexWrap: "wrap", gap: "8px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Lock size={13} color="#1e3a8a" />
                  <span style={{
                    fontSize: "11px", fontWeight: "800", color: "#1e3a8a",
                    textTransform: "uppercase", letterSpacing: "0.5px",
                  }}>
                    Currently Frozen — {currentFrozenItems.length}
                  </span>
                  <span style={{ fontSize: "11px", color: "#94a3b8" }}>Select to unfreeze</span>
                </div>
                {currentFrozenItems.length > 1 && (
                  <label style={{
                    display: "flex", alignItems: "center", gap: "6px", cursor: "pointer",
                    fontSize: "12px", fontWeight: "600", color: "#475569", userSelect: "none",
                  }}>
                    <input
                      type="checkbox"
                      checked={areAllFrozenSelected}
                      onChange={toggleSelectAll}
                      style={{ width: "14px", height: "14px", accentColor: "#3b82f6", cursor: "pointer" }}
                    />
                    Select all
                  </label>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {currentFrozenItems.map(item => {
                  const isSelected = selectedToUnfreeze.has(item.id);
                  return (
                    <label
                      key={item.id}
                      style={{
                        display: "flex", alignItems: "center", gap: "12px",
                        padding: "11px 14px", borderRadius: "10px",
                        cursor: "pointer", userSelect: "none",
                        background: isSelected ? "#eff6ff" : "#f8fafc",
                        border: `1.5px solid ${isSelected ? "#3b82f6" : "#e2e8f0"}`,
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(item.id)}
                        style={{
                          width: "16px", height: "16px",
                          accentColor: "#3b82f6", cursor: "pointer", flexShrink: 0,
                        }}
                      />
                      <Lock size={13} color={isSelected ? "#3b82f6" : "#94a3b8"} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: "13px", fontWeight: "700",
                          color: isSelected ? "#1e40af" : "#475569",
                        }}>
                          {(item as any).code ? `${(item as any).code} — ` : ""}
                          {item.name}
                        </div>
                        {isBranchTab && (item as AssignedBranch).country_id && (() => {
                          const parentCountry = assignedCountries.find(
                            c => c.id === (item as AssignedBranch).country_id,
                          );
                          return parentCountry
                            ? <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                                {parentCountry.code ?? parentCountry.name}
                              </div>
                            : null;
                        })()}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {currentFrozenItems.length === 0 && currentUnfrozenItems.length === 0 && (
            <p style={{ fontSize: "13px", color: "#94a3b8", textAlign: "center", padding: "32px 0" }}>
              No {isBranchTab ? "branches" : "countries"} assigned to this template.
            </p>
          )}

          {/* All-unfrozen confirmation message */}
          {currentFrozenItems.length === 0 && currentUnfrozenItems.length > 0 && (
            <div style={{
              marginTop: "16px", padding: "12px 16px", background: "#f0fdf4",
              border: "1px solid #bbf7d0", borderRadius: "10px",
              fontSize: "12px", color: "#166534", fontWeight: "600",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              <CheckCircle2 size={14} color="#16a34a" />
              All {isBranchTab ? "branches" : "countries"} are currently unfrozen.
            </div>
          )}
        </div>

        {/* ── Modal footer ── */}
        <div style={{
          padding: "14px 24px 20px", borderTop: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
        }}>
          <div style={{ fontSize: "12px", color: "#64748b" }}>
            {currentTabSelected.length > 0
              ? <span style={{ fontWeight: "700", color: "#1e40af" }}>
                  {currentTabSelected.length} selected to unfreeze
                </span>
              : <span>
                  Select frozen {isBranchTab ? "branches" : "countries"} above to unfreeze them
                </span>}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={onClose}
              style={{
                padding: "9px 20px", borderRadius: "9px",
                border: "1px solid #e2e8f0", background: "#f8fafc",
                color: "#475569", fontWeight: "700", fontSize: "13px", cursor: "pointer",
              }}
            >
              Close
            </button>
            <button
              onClick={handleUnfreezeSelected}
              disabled={currentTabSelected.length === 0 || isSaving}
              style={{
                padding: "9px 20px", borderRadius: "9px", border: "none",
                background: currentTabSelected.length > 0 && !isSaving
                  ? "linear-gradient(135deg, #2563eb, #1d4ed8)"
                  : "#e2e8f0",
                color:  currentTabSelected.length > 0 && !isSaving ? "#fff" : "#94a3b8",
                fontWeight: "700", fontSize: "13px",
                cursor: currentTabSelected.length > 0 && !isSaving ? "pointer" : "not-allowed",
                transition: "all 0.15s", display: "inline-flex", alignItems: "center", gap: "6px",
              }}
            >
              {isSaving
                ? <><Loader2 size={13} className={styles.spinner} /> Unfreezing…</>
                : <><Unlock size={13} /> Unfreeze {currentTabSelected.length > 0 ? `${currentTabSelected.length} Selected` : "Selected"}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FilterDropdown ───────────────────────────────────────────────────────────

/**
 * A multi-select dropdown used inside the filter bar.
 * Closes automatically when the user clicks outside.
 */
function FilterDropdown({
  label,
  icon,
  options,
  selected,
  onChange,
}: {
  label:    string;
  icon:     React.ReactNode;
  options:  string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef        = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleOutsideClick(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  function toggleOption(value: string): void {
    onChange(
      selected.includes(value)
        ? selected.filter(item => item !== value)
        : [...selected, value],
    );
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
                      <span className={[
                        styles.dropdownOptionLabel,
                        isChecked ? styles.dropdownOptionLabelChecked : "",
                      ].join(" ")}>
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

/** A dismissible chip that represents one active filter value. */
function ActiveFilterChip({
  label,
  category,
  colorClass,
  onRemove,
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
      <button className={styles.chipRemoveBtn} onClick={onRemove} aria-label={`Remove ${category} filter: ${label}`}>
        <X size={10} />
      </button>
    </span>
  );
}

// ─── HorizontalFilterBar ──────────────────────────────────────────────────────

/**
 * Full-width filter bar containing a search input, category dropdowns,
 * active filter chips, and a result count indicator.
 */
function HorizontalFilterBar({
  filters,
  onFilterChange,
  allDesignations,
  allDepartments,
  allBranches,
  allCountries,
  totalCount,
  filteredCount,
  isLoading,
}: {
  filters:         FilterState;
  onFilterChange:  (updated: FilterState) => void;
  allDesignations: string[];
  allDepartments:  string[];
  allBranches:     string[];
  allCountries:    string[];
  totalCount:      number;
  filteredCount:   number;
  isLoading:       boolean;
}) {
  const activeFilterCount =
    filters.designations.length +
    filters.departments.length  +
    filters.branches.length     +
    filters.countries.length;

  /** Clears all dropdown filters while preserving the text search. */
  function clearDropdownFilters(): void {
    onFilterChange({ search: filters.search, designations: [], departments: [], branches: [], countries: [] });
  }

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterRow}>

        {/* Search input */}
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

        {/* Dropdown filters */}
        <FilterDropdown label="Designation" icon={<Users    size={13} />} options={allDesignations} selected={filters.designations} onChange={v => onFilterChange({ ...filters, designations: v })} />
        <FilterDropdown label="Department"  icon={<Building2 size={13} />} options={allDepartments}  selected={filters.departments}  onChange={v => onFilterChange({ ...filters, departments:  v })} />
        <FilterDropdown label="Branch"      icon={<GitBranch size={13} />} options={allBranches}     selected={filters.branches}     onChange={v => onFilterChange({ ...filters, branches:     v })} />
        <FilterDropdown label="Country"     icon={<Globe     size={13} />} options={allCountries}    selected={filters.countries}    onChange={v => onFilterChange({ ...filters, countries:    v })} />

        {activeFilterCount > 0 && (
          <button className={styles.clearFiltersBtn} onClick={clearDropdownFilters}>
            <X size={12} />
            Clear filters
            <span className={styles.clearFiltersBadge}>{activeFilterCount}</span>
          </button>
        )}

        {/* Result count */}
        {!isLoading && (
          <span className={styles.resultCount}>
            {filteredCount !== totalCount
              ? <>
                  <strong className={styles.resultCountBold}>{filteredCount}</strong>
                  {" of "}
                  {totalCount} templates{" "}
                  <span className={styles.resultCountFiltered}>filtered</span>
                </>
              : <>
                  <strong className={styles.resultCountBold}>{totalCount}</strong>
                  {" template"}{totalCount !== 1 ? "s" : ""}
                </>}
          </span>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className={styles.chipsRow}>
          <span className={styles.chipsRowLabel}>Active:</span>
          {filters.designations.map(d => (
            <ActiveFilterChip key={`designation-${d}`} label={d} category="Designation" colorClass={styles.chipDesignation}
              onRemove={() => onFilterChange({ ...filters, designations: filters.designations.filter(x => x !== d) })} />
          ))}
          {filters.departments.map(d => (
            <ActiveFilterChip key={`department-${d}`} label={d} category="Department" colorClass={styles.chipDepartment}
              onRemove={() => onFilterChange({ ...filters, departments: filters.departments.filter(x => x !== d) })} />
          ))}
          {filters.branches.map(b => (
            <ActiveFilterChip key={`branch-${b}`} label={b} category="Branch" colorClass={styles.chipBranch}
              onRemove={() => onFilterChange({ ...filters, branches: filters.branches.filter(x => x !== b) })} />
          ))}
          {filters.countries.map(c => (
            <ActiveFilterChip key={`country-${c}`} label={c} category="Country" colorClass={styles.chipCountry}
              onRemove={() => onFilterChange({ ...filters, countries: filters.countries.filter(x => x !== c) })} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── EditCycleDatesModal ──────────────────────────────────────────────────────

/** Configuration for each editable date field in the cycle dates form. */
const CYCLE_DATE_FIELD_CONFIG: Array<{
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

/**
 * Modal that allows an HQ Admin to update the key date milestones
 * for the active PMS cycle. Changes take effect immediately for all users.
 */
function EditCycleDatesModal({
  activeCycle,
  onClose,
  onSaved,
}: {
  activeCycle: any;
  onClose:     () => void;
  onSaved:     (updatedCycle: any) => void;
}) {
  const [form, setForm] = useState<CycleDatesForm>({
    objective_setting_end: toInputDate(activeCycle?.objective_setting_end ?? activeCycle?.objective_end),
    grace_period_end:      toInputDate(activeCycle?.grace_period_end      ?? activeCycle?.grace_end),
    mid_year_review:       toInputDate(activeCycle?.mid_year_review),
    year_end_review:       toInputDate(activeCycle?.year_end_review),
  });
  const [isSaving,      setIsSaving]      = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(false);

  /**
   * Validates the form values before submission.
   * @returns A human-readable error message, or null if valid.
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

  async function handleSave(): Promise<void> {
    const validationError = validateForm();
    if (validationError) { toast.error(validationError); return; }
    if (!isAcknowledged) { toast.error("Please acknowledge the impact of this change."); return; }
    if (!activeCycle?.id) { toast.error("No active PMS cycle found."); return; }

    setIsSaving(true);
    try {
      const payload: Record<string, string> = {
        objective_setting_end: form.objective_setting_end,
        grace_period_end:      form.grace_period_end,
      };
      if (form.mid_year_review) payload.mid_year_review = form.mid_year_review;
      if (form.year_end_review) payload.year_end_review  = form.year_end_review;

      const response = await fetch(`${API_BASE}/pms-cycles/${activeCycle.id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", "X-User-Level": "1" },
        body:    JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Update failed");
      }

      const refreshRes  = await fetch(`${API_BASE}/pms-cycles/active`);
      const updatedCycle = refreshRes.ok ? await refreshRes.json() : activeCycle;
      toast.success("PMS cycle dates updated successfully.");
      onSaved(updatedCycle);
    } catch (err: any) {
      toast.error(err.message ?? "Could not update cycle dates.");
    } finally {
      setIsSaving(false);
    }
  }

  const pmsStartLabel = activeCycle?.pms_start
    ? new Date(activeCycle.pms_start).toLocaleDateString(
        "en-GB",
        { day: "numeric", month: "short", year: "numeric" },
      )
    : "—";

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.editCycleModalCard}>

        {/* Header */}
        <div className={styles.editCycleHeader}>
          <div className={styles.editCycleHeaderLeft}>
            <div className={styles.editCycleIconWrap}>
              <Settings size={18} color="#3b82f6" />
            </div>
            <div>
              <h3 className={styles.editCycleTitle}>Edit PMS Cycle Dates</h3>
              <p className={styles.editCycleSubtitle}>
                PMS Year {activeCycle?.pms_year ?? "—"}&nbsp;·&nbsp;Starts {pmsStartLabel}
              </p>
            </div>
          </div>
          <button className={styles.editCycleCloseBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Impact warning */}
        <div className={styles.editCycleWarning}>
          <AlertTriangle size={15} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <p className={styles.editCycleWarningText}>
            Changing cycle dates affects <strong>all employees and managers</strong> on this PMS
            cycle. Only make changes after consulting senior management.
          </p>
        </div>

        {/* Date fields */}
        <div className={styles.editCycleDateGrid}>
          {CYCLE_DATE_FIELD_CONFIG.map(({ field, label, required, hint }) => (
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
                onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                aria-label={label}
              />
              <p className={styles.editCycleDateHint}>{hint}</p>
            </div>
          ))}
        </div>

        {/* Acknowledgement checkbox */}
        <label className={styles.editCycleAckRow}>
          <input
            type="checkbox"
            checked={isAcknowledged}
            onChange={e => setIsAcknowledged(e.target.checked)}
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
            className={`${styles.editCycleSaveBtn} ${!isAcknowledged ? styles.editCycleSaveBtnDisabled : ""}`}
            onClick={handleSave}
            disabled={isSaving || !isAcknowledged}
          >
            {isSaving ? "Saving…" : "Save Cycle Dates"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PmsCyclePanel ────────────────────────────────────────────────────────────

/** Milestone definitions used to populate the PMS cycle timeline cards. */
const buildMilestones = (freezeDates: DynamicFreezeDates) => [
  {
    key:        "start",
    label:      "Cycle Start",
    shortDate:  freezeDates.pmsYearStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    icon:       <Flag     size={22} />,
    bgGradient: "linear-gradient(135deg,#6366f1,#818cf8)",
    shadow:     "rgba(99,102,241,0.35)",
    iconBg:     "#eef2ff",
    iconColor:  "#6366f1",
  },
  {
    key:        "objective",
    label:      "Objective Setting",
    shortDate:  freezeDates.objectiveSettingEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    icon:       <Target   size={22} />,
    bgGradient: "linear-gradient(135deg,#0ea5e9,#38bdf8)",
    shadow:     "rgba(14,165,233,0.35)",
    iconBg:     "#e0f2fe",
    iconColor:  "#0ea5e9",
  },
  {
    key:        "grace",
    label:      "Grace Period",
    shortDate:  freezeDates.graceEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    icon:       <Clock3   size={22} />,
    bgGradient: "linear-gradient(135deg,#f59e0b,#fbbf24)",
    shadow:     "rgba(245,158,11,0.35)",
    iconBg:     "#fef3c7",
    iconColor:  "#d97706",
  },
  {
    key:        "frozen",
    label:      "Templates Frozen",
    shortDate:  freezeDates.graceEnd.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    icon:       <Lock     size={22} />,
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
    icon:       <Star     size={22} />,
    bgGradient: "linear-gradient(135deg,#8b5cf6,#a78bfa)",
    shadow:     "rgba(139,92,246,0.35)",
    iconBg:     "#f3e8ff",
    iconColor:  "#8b5cf6",
  },
];

/**
 * Displays the PMS cycle progress panel — year label, key stats,
 * a progress bar, and milestone icon cards.
 */
function PmsCyclePanel({
  freezeDates,
  activeCycle,
  templateCount,
  permissions,
  level,
  onEditCycle,
}: {
  freezeDates:   DynamicFreezeDates;
  activeCycle:   any;
  templateCount: number;
  permissions:   TemplatePermissions;
  level:         number;
  onEditCycle:   () => void;
}) {
  const now            = new Date();
  const cycleYearLabel = `${freezeDates.pmsYearStart.getFullYear()} / ${freezeDates.pmsYearStart.getFullYear() + 1}`;

  const yearStart = freezeDates.pmsYearStart.getTime();
  const yearEnd   = freezeDates.yearEndReview?.getTime()
    ?? new Date(freezeDates.pmsYearStart.getFullYear() + 1, 2, 31).getTime();

  const progressPercent = Math.min(
    100,
    Math.max(0, Math.round(((now.getTime() - yearStart) / (yearEnd - yearStart)) * 100)),
  );

  /** Determines which milestone card should be highlighted as "current". */
  const activeMilestoneKey =
    now < freezeDates.objectiveSettingEnd ? "objective" :
    now < freezeDates.graceEnd            ? "grace"     :
    (freezeDates.midYearReview && now < freezeDates.midYearReview) ? "frozen"  :
    (freezeDates.yearEndReview  && now < freezeDates.yearEndReview) ? "midyear" :
    "yearend";

  const milestones = buildMilestones(freezeDates);
  const isHqAdmin  = level === 1;

  return (
    <div className={styles.cyclePanelWrapper}>
      {/* Left column: stats and progress */}
      <div className={styles.cyclePanelLeft}>
        <div className={styles.cyclePanelLeftTop}>
          <div className={styles.cyclePanelYearBadge}>
            <TrendingUp size={13} />
            <span>Annual PMS Cycle</span>
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
        {isHqAdmin && activeCycle?.id && (
          <button className={styles.editCycleDatesBtn} onClick={onEditCycle}>
            <Calendar size={13} />Edit Cycle Dates
          </button>
        )}
      </div>

      {/* Right column: milestone icon cards */}
      <div className={styles.cyclePanelRight}>
        {milestones.map(milestone => {
          const isActiveMilestone = activeMilestoneKey === milestone.key;
          return (
            <div
              key={milestone.key}
              className={`${styles.milestoneIconCard} ${isActiveMilestone ? styles.milestoneIconCardActive : ""}`}
              style={isActiveMilestone
                ? { background: milestone.bgGradient, boxShadow: `0 6px 20px ${milestone.shadow}` }
                : {}}
            >
              {isActiveMilestone && <div className={styles.milestoneNowDot} />}
              <div
                className={styles.milestoneIconWrap}
                style={isActiveMilestone
                  ? { background: "rgba(255,255,255,0.22)", color: "#fff" }
                  : { background: milestone.iconBg, color: milestone.iconColor }}
              >
                {milestone.icon}
              </div>
              <div
                className={styles.milestoneIconLabel}
                style={isActiveMilestone ? { color: "rgba(255,255,255,0.8)" } : {}}
              >
                {milestone.label}
              </div>
              <div
                className={styles.milestoneIconDate}
                style={isActiveMilestone ? { color: "#fff" } : {}}
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

/** Small pill badge indicating whether templates are open, in grace, or frozen. */
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
 * Top-of-page contextual banner that describes the current freeze state
 * and remaining days to the objective-setting deadline.
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
  const isHqAdmin      = level === 1;
  const daysRemaining  = daysUntil(freezeDates.objectiveSettingEnd);

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
            hard freeze <strong>{formatDate(freezeDates.graceEnd)}</strong>{" "}
            ({daysUntil(freezeDates.graceEnd)} days)
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
            Objective-setting window closes in <strong>{daysRemaining} days</strong>{" "}
            ({formatDate(freezeDates.objectiveSettingEnd)})
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
          {" · "}
          <strong>{daysRemaining} days remaining</strong>
          {!isHqAdmin && " · Editable objectives only"}
        </span>
      </div>
    </div>
  );
}

// ─── TemplateCard ─────────────────────────────────────────────────────────────

/**
 * Card component representing a single template.
 * Displays key stats, assignment summary, category breakdown,
 * and contextual action buttons based on role and freeze status.
 */
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
  onManageFreeze,
}: {
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
  onManageFreeze:         () => void;
}) {
  const categories = template.categories ?? [];
  const isHqAdmin  = level === 1;

  // ── Derived status values ──
  const effectiveStatus: FreezeStatus = template.freeze_status ?? permissions.freezeStatus;
  const isPastCycle = template.is_past_cycle ?? false;
  const isFrozen    = effectiveStatus === "frozen";
  const isGrace     = effectiveStatus === "grace";

  // ── Objective counts ──
  const lockedCount     = categories.reduce(
    (sum: number, cat: any) =>
      sum + (cat.objectives?.filter((obj: any) => obj.control === "Locked").length ?? 0),
    0,
  );
  const totalObjectives = categories.reduce(
    (sum: number, cat: any) => sum + (cat.objectives?.length ?? 0),
    0,
  );
  const editableCount   = totalObjectives - lockedCount;
  const totalRules      = template.assignedRules?.length ?? 0;

  // ── Unfreeze / variant state ──
  const unfrozenBranchCount  = template.unfrozenBranchIds?.length  ?? 0;
  const unfrozenCountryCount = template.unfrozenCountryIds?.length ?? 0;
  const hasUnfreezeExceptions = unfrozenBranchCount > 0 || unfrozenCountryCount > 0;
  const variantCount = template.variants?.length ?? 0;
  const hasVariants  = (template.hasVariants ?? false) || variantCount > 0;

  /** True when the current user has unfreeze exceptions that allow editing. */
  const hasUnfreezeAccess = isHqAdmin && !isPastCycle && hasUnfreezeExceptions;

  // ── Permission flags for this specific card ──
  const canEditThisCard         = !isPastCycle && (permissions.canEdit || hasUnfreezeAccess);
  const canDeleteThisCard       = !isPastCycle && isHqAdmin && permissions.canDelete;
  const canCopyThisCard         = isHqAdmin && permissions.canCreate;
  const canManageFreezeThisCard = isHqAdmin && !isPastCycle && (isFrozen || isGrace);

  // ── Disabled-reason helpers ──

  function getEditDisabledReason(): string | null {
    if (isPastCycle) return "This template belongs to a past PMS cycle and is permanently frozen.";
    if (isFrozen && hasUnfreezeAccess) return null;
    if (!permissions.canEdit && !isHqAdmin) {
      if (isFrozen) return "Templates are fully frozen. Editing is not permitted.";
      if (isGrace)  return "Grace period is active. Only HQ Admin may edit during this period.";
    }
    if (isFrozen) return "Templates are fully frozen. No edits are permitted in this period.";
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

  // ── Click handlers with error feedback ──

  function handleEditClick(): void {
    const reason = getEditDisabledReason();
    if (reason) { toast.error(reason); return; }
    onEdit();
  }

  function handleDeleteClick(): void {
    const reason = getDeleteDisabledReason();
    if (reason) { toast.error(reason); return; }
    onDelete();
  }

  function handleCopyClick(): void {
    const reason = getCopyDisabledReason();
    if (reason) { toast.error(reason); return; }
    onDuplicate();
  }

  // ── Display helpers ──

  const lastUpdatedDisplay = new Date(
    template.lastModified ?? template.created_at ?? Date.now(),
  ).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  /** Builds a concise human-readable assignment summary for the collapsed row. */
  const assignmentSummary = useMemo((): string => {
    const parts: string[] = [];
    if (template.assignedDesignations?.length) {
      parts.push(`${template.assignedDesignations.length} designation${template.assignedDesignations.length !== 1 ? "s" : ""}`);
    }
    if (template.assignedDepartments?.length) {
      const uniqueCount = new Set(template.assignedDepartments.map(d => d.name.trim().toLowerCase())).size;
      parts.push(`${uniqueCount} dept type${uniqueCount !== 1 ? "s" : ""}`);
    }
    if (template.assignedSubDepartments?.length) {
      const uniqueCount = new Set(template.assignedSubDepartments.map(s => s.name.trim().toLowerCase())).size;
      parts.push(`${uniqueCount} sub-dept${uniqueCount !== 1 ? "s" : ""}`);
    }
    if (template.assignedCountries?.length) {
      parts.push(`${template.assignedCountries.length} countr${template.assignedCountries.length !== 1 ? "ies" : "y"}`);
    }
    if (template.assignedBranches?.length) {
      parts.push(`${template.assignedBranches.length} branch${template.assignedBranches.length !== 1 ? "es" : ""}`);
    }
    return parts.length ? parts.join(" · ") : "Unassigned";
  }, [template]);

  const scopeRules    = template.assignedRules?.filter(r => r.scope) ?? [];
  const hasScopeRules = scopeRules.length > 0;

  /** Summary stat cells shown in the card's statistics row. */
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
      style={isPastCycle ? { opacity: 0.85, borderLeft: "3px solid #94a3b8" } : undefined}
    >
      {/* Past-cycle notice bar */}
      {isPastCycle && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "6px 14px", background: "#f8fafc",
          borderBottom: "1px solid #e2e8f0",
          fontSize: "11px", color: "#64748b", fontWeight: 600,
        }}>
          <History size={12} color="#94a3b8" />
          Past PMS Cycle — Permanently Frozen (Read Only)
        </div>
      )}

      {/* Partial-unfreeze banner */}
      {hasUnfreezeExceptions && !isPastCycle && (
        <div style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "6px 14px", background: "#fff7ed",
          borderBottom: "1px solid #fed7aa",
          fontSize: "11px", color: "#9a3412", fontWeight: "600",
        }}>
          <Unlock size={11} color="#ea580c" />
          Partially unfrozen:
          {unfrozenBranchCount > 0 && (
            <span style={{
              background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a",
              borderRadius: "10px", padding: "1px 7px", fontSize: "10px", fontWeight: "700",
            }}>
              {unfrozenBranchCount} branch{unfrozenBranchCount !== 1 ? "es" : ""}
            </span>
          )}
          {unfrozenCountryCount > 0 && (
            <span style={{
              background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc",
              borderRadius: "10px", padding: "1px 7px", fontSize: "10px", fontWeight: "700",
            }}>
              {unfrozenCountryCount} countr{unfrozenCountryCount !== 1 ? "ies" : "y"}
            </span>
          )}
          {hasVariants && (
            <span style={{
              background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0",
              borderRadius: "10px", padding: "1px 7px", fontSize: "10px", fontWeight: "700",
            }}>
              {variantCount} variant{variantCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )}

      {/* Card header */}
      <div className={styles.cardTop}>
        <div className={styles.cardTopInner}>
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
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: "4px",
                    padding: "2px 8px", borderRadius: "20px",
                    fontSize: "10px", fontWeight: "700",
                    background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe",
                  }}>
                    <GitBranch size={9} /> {variantCount} variant{variantCount !== 1 ? "s" : ""}
                  </span>
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

          {/* Action buttons */}
          <div className={styles.cardActions}>
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
                title={isPastCycle
                  ? "Duplicate into current cycle"
                  : !canCopyThisCard
                    ? (getCopyDisabledReason() ?? undefined)
                    : "Duplicate template"}
              >
                {isDuplicating
                  ? <Loader2 size={13} className={styles.spinner} />
                  : <Copy    size={13} />}
                <span>Copy</span>
              </button>
            )}
            {isHqAdmin && canManageFreezeThisCard && (
              <button
                onClick={onManageFreeze}
                title="Manage freeze exceptions for specific branches/countries"
                style={{
                  display: "inline-flex", alignItems: "center", gap: "5px",
                  padding: "6px 12px", borderRadius: "6px",
                  background:  hasUnfreezeExceptions ? "#fff7ed" : "#f0f5ff",
                  border:      `1px solid ${hasUnfreezeExceptions ? "#fed7aa" : "#c7d5f0"}`,
                  color:       hasUnfreezeExceptions ? "#ea580c" : "#1e3a8a",
                  fontSize: "12px", fontWeight: "700", cursor: "pointer",
                  transition: "all 0.15s", whiteSpace: "nowrap",
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

      {/* Meta row */}
      <div className={styles.cardMeta}>
        <div className={styles.cardMetaLeft}>
          <BookOpen size={12} color="#8b5cf6" />
          <span className={styles.cardMetaLabel}>AI Suggested Insights</span>
          <Award    size={12} color="#d97706" />
          <span className={styles.cardMetaLabel}>Training Recommendations</span>
          <Target   size={12} color="#3b82f6" />
          <span className={styles.cardMetaLabel}>Smart Analysis Enabled</span>
        </div>
        <span className={styles.cardMetaTimestamp}>Updated: {lastUpdatedDisplay}</span>
      </div>

      {/* Category expand toggle */}
      <button className={styles.expandToggle} onClick={onToggleCategoryExpand}>
        <Layers size={14} color="#3b82f6" />
        <span>{isCategoryExpanded ? "Hide" : "Show"} Category Details</span>
        {isCategoryExpanded
          ? <ChevronUp   size={14} color="#3b82f6" />
          : <ChevronDown size={14} color="#3b82f6" />}
      </button>

      {/* Expanded category grid */}
      {isCategoryExpanded && (
        <div className={styles.expandedSection}>
          <div className={styles.expandedSectionHeading}>
            <Layers size={13} color="#64748b" />
            <span>Performance Categories</span>
          </div>
          <div className={styles.categoryGrid}>
            {categories.length === 0
              ? <p className={styles.categoryEmptyNote}>No categories defined.</p>
              : categories.map((cat: any, index: number) => {
                  const palette    = CATEGORY_PALETTE[index % CATEGORY_PALETTE.length];
                  const catWeight  = cat.weight ?? (cat.objectives ?? []).reduce(
                    (sum: number, obj: any) => sum + (Number(obj.weight) || 0), 0,
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
                          height: "100%", width: `${catWeight}%`,
                          background: palette.fill, borderRadius: "3px",
                        }} />
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

      {/* Assignment expand toggle */}
      <button className={styles.expandToggle} onClick={onToggleAssignExpand}>
        <Users size={14} color="#3b82f6" />
        <span>{isAssignExpanded ? "Hide" : "Show"} Assignments</span>
        {!isAssignExpanded && totalRules > 0 && (
          <span style={{
            marginLeft: "auto", fontSize: "11px", fontWeight: "600",
            color: "#64748b", background: "#f1f5f9",
            padding: "2px 8px", borderRadius: "10px",
          }}>
            {assignmentSummary}
          </span>
        )}
        {isAssignExpanded
          ? <ChevronUp   size={14} color="#3b82f6" />
          : <ChevronDown size={14} color="#3b82f6" />}
      </button>

      {/* Expanded assignments section */}
      {isAssignExpanded && (
        <div className={styles.expandedSection}>
          {totalRules === 0
            ? <p style={{ fontSize: "13px", color: "#94a3b8", padding: "8px 0" }}>No assignments set.</p>
            : (
              <div className={styles.rolesDeptsSection}>

                {/* Global scope assignments */}
                {hasScopeRules && (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}>
                      <Globe size={13} color="#0891b2" />
                      <span>Global Assignments</span>
                    </div>
                    <div className={styles.rolesDeptsChips}>
                      {scopeRules.map((rule, index) => (
                        <span key={index} style={{
                          display: "inline-flex", alignItems: "center", gap: "4px",
                          padding: "3px 10px", borderRadius: "20px",
                          fontSize: "11px", fontWeight: "700",
                          background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc",
                        }}>
                          {SCOPE_LABELS[rule.scope!] ?? rule.scope}
                          {rule.country_id && (
                            <span style={{ fontSize: "10px", opacity: 0.7 }}>· specific country</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Designation chips */}
                {(template.assignedDesignations?.length ?? 0) > 0 && (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}>
                      <Users size={13} color="#3b82f6" />
                      <span>Designations</span>
                    </div>
                    <div className={styles.rolesDeptsChips}>
                      {template.assignedDesignations!.map(designation => (
                        <span key={designation} className={styles.rolesChip}>{designation}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sub-department chips (deduplicated by name) */}
                {(template.assignedSubDepartments?.length ?? 0) > 0 && (() => {
                  const seen      = new Set<string>();
                  const uniqueSubs = (template.assignedSubDepartments ?? []).filter(sub => {
                    const key = sub.name.trim().toLowerCase();
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                  return (
                    <div className={styles.rolesDeptsGroup}>
                      <div className={styles.rolesDeptsLabel}>
                        <Layers size={13} color="#0891b2" />
                        <span>Sub-Departments</span>
                      </div>
                      <div className={styles.rolesDeptsChips}>
                        {uniqueSubs.map(sub => (
                          <span key={sub.name} style={{
                            padding: "3px 10px", borderRadius: "20px",
                            fontSize: "11px", fontWeight: "700",
                            background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc",
                          }}>
                            {sub.code ? `[${sub.code}] ` : ""}{sub.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Country chips */}
                {(template.assignedCountries?.length ?? 0) > 0 && (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}>
                      <Globe size={13} color="#0891b2" />
                      <span>Countries</span>
                    </div>
                    <div className={styles.rolesDeptsChips}>
                      {template.assignedCountries!.map(country => (
                        <span key={country.id} style={{
                          display: "inline-flex", alignItems: "center", gap: "4px",
                          padding: "3px 10px", borderRadius: "20px",
                          fontSize: "11px", fontWeight: "700",
                          background: "#ecfeff", color: "#0891b2", border: "1px solid #a5f3fc",
                        }}>
                          {country.code ?? country.name}
                          {(template.unfrozenCountryIds ?? []).includes(country.id) && (
                            <Unlock size={9} color="#16a34a" />
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Department chips (grouped and deduplicated by name) */}
                {(template.assignedDepartments?.length ?? 0) > 0 && (() => {
                  const grouped = new Map<string, { name: string; code: string | null; branchCount: number }>();
                  template.assignedDepartments!.forEach(dept => {
                    const key = dept.name.trim().toLowerCase();
                    if (!grouped.has(key)) grouped.set(key, { name: dept.name, code: dept.code, branchCount: 0 });
                    if (dept.branch_id) grouped.get(key)!.branchCount++;
                  });
                  return (
                    <div className={styles.rolesDeptsGroup}>
                      <div className={styles.rolesDeptsLabel}>
                        <Building2 size={13} color="#8b5cf6" />
                        <span>Departments</span>
                      </div>
                      <div className={styles.rolesDeptsChips}>
                        {[...grouped.values()].map(dept => (
                          <span key={dept.name} className={styles.deptsChip} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                            {dept.code ? `[${dept.code}] ` : ""}
                            {dept.name}
                            {dept.branchCount > 0 && (
                              <span style={{
                                fontSize: "10px", fontWeight: "700",
                                background: "#ddd6fe", color: "#5b21b6",
                                padding: "1px 6px", borderRadius: "10px",
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

                {/* Branch chips */}
                {(template.assignedBranches?.length ?? 0) > 0 && (
                  <div className={styles.rolesDeptsGroup}>
                    <div className={styles.rolesDeptsLabel}>
                      <GitBranch size={13} color="#7c3aed" />
                      <span>Branches</span>
                    </div>
                    <div className={styles.rolesDeptsChips}>
                      {template.assignedBranches!.map(branch => {
                        const isUnfrozen = (template.unfrozenBranchIds ?? []).includes(branch.id);
                        const hasVariant = (template.variants ?? []).some(v => v.branch_id === branch.id);
                        return (
                          <span key={branch.id} style={{
                            display: "inline-flex", alignItems: "center", gap: "4px",
                            padding: "3px 10px", borderRadius: "20px",
                            fontSize: "11px", fontWeight: "700",
                            background: isUnfrozen ? "#f0fdf4" : "#f5f3ff",
                            color:      isUnfrozen ? "#166534" : "#5b21b6",
                            border:     `1px solid ${isUnfrozen ? "#bbf7d0" : "#ddd6fe"}`,
                          }}>
                            {branch.code ?? branch.name}
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

/**
 * Root component for the Template Management page.
 * Fetches templates and the active PMS cycle on mount, then coordinates
 * all sub-components: filter bar, cycle panel, template cards, and modals.
 *
 * @param level - Numeric admin role level (1 = HQ Admin … 5 = Sub-Dept Admin).
 */
export default function TemplateDashboardBase({ level }: { level: number }) {
  const router = useRouter();

  // ── Page-level state ──
  const [templates,           setTemplates]           = useState<TemplateRecord[]>([]);
  const [confirmDeleteId,     setConfirmDeleteId]      = useState<number | null>(null);
  const [isLoading,           setIsLoading]            = useState(true);
  const [expandedCardId,      setExpandedCardId]       = useState<number | null>(null);
  const [expandedAssignId,    setExpandedAssignId]     = useState<number | null>(null);
  const [isDuplicatingId,     setIsDuplicatingId]      = useState<number | null>(null);
  const [activeCycle,         setActiveCycle]          = useState<any>(null);
  const [showEditCycleModal,  setShowEditCycleModal]   = useState(false);
  const [freezeModalTemplate, setFreezeModalTemplate]  = useState<TemplateRecord | null>(null);
  const [filters,             setFilters]              = useState<FilterState>({
    search: "", designations: [], departments: [], branches: [], countries: [],
  });

  // ── Derived values ──
  const freezeDates = useMemo(() => buildFreezeDates(activeCycle),            [activeCycle]);
  const permissions = useMemo(() => computePermissions(level, freezeDates),  [level, freezeDates]);
  const rolePrefix  = getRolePrefix(level);

  const confirmDeleteTemplate = useMemo(
    () => templates.find(t => t.id === confirmDeleteId) ?? null,
    [templates, confirmDeleteId],
  );

  const periodWrapperClass =
    permissions.freezeStatus === "frozen" ? styles.periodFrozen :
    permissions.freezeStatus === "grace"  ? styles.periodGrace  :
    styles.periodOpen;

  /** Unique filter options derived from all loaded templates. */
  const filterOptions = useMemo(() => {
    const designationSet = new Set<string>();
    const departmentSet  = new Set<string>();
    const branchSet      = new Set<string>();
    const countrySet     = new Set<string>();

    templates.forEach(template => {
      template.assignedDesignations?.forEach(d  => designationSet.add(d));
      template.assignedDepartments?.forEach(d   => departmentSet.add(d.name));
      template.assignedBranches?.forEach(b      => branchSet.add(b.name));
      template.assignedCountries?.forEach(c     => {
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

  // ── Data fetching ──

  useEffect(() => {
    async function loadDashboardData(): Promise<void> {
      try {
        setIsLoading(true);
        const [templateRes, cycleRes] = await Promise.all([
          fetch(`${API_BASE}/templates`),
          fetch(`${API_BASE}/pms-cycles/active`),
        ]);

        if (!templateRes.ok) {
          throw new Error(`Failed to load templates: ${templateRes.status}`);
        }
        const rawTemplates: TemplateRecord[] = await templateRes.json();
        setTemplates(sortByLastModified(rawTemplates));

        if (cycleRes.ok) {
          setActiveCycle(await cycleRes.json());
        }
      } catch (err) {
        // Non-blocking — user can still see empty state and retry
        toast.error("Could not load templates. Please refresh and try again.");
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboardData();
  }, []);

  // ── Filtered template list ──

  const filteredTemplates = useMemo(() => {
    let result = templates;

    if (filters.search.trim()) {
      const query = filters.search.toLowerCase().trim();
      result = result.filter(t => t.name?.toLowerCase().includes(query));
    }
    if (filters.designations.length > 0) {
      result = result.filter(t =>
        filters.designations.some(d => t.assignedDesignations?.includes(d)),
      );
    }
    if (filters.departments.length > 0) {
      result = result.filter(t =>
        filters.departments.some(d => t.assignedDepartments?.some(x => x.name === d)),
      );
    }
    if (filters.branches.length > 0) {
      result = result.filter(t =>
        filters.branches.some(b => t.assignedBranches?.some(x => x.name === b)),
      );
    }
    if (filters.countries.length > 0) {
      result = result.filter(t =>
        filters.countries.some(c =>
          t.assignedCountries?.some(x => (x.name?.trim() || x.code?.trim()) === c),
        ),
      );
    }

    return sortByLastModified(result);
  }, [templates, filters]);

  // ── Template action handlers ──

  /** Optimistically bumps a template's lastModified to keep it sorted first. */
  function bumpTemplateToTop(id: number): void {
    setTemplates(prev =>
      sortByLastModified(
        prev.map(t => t.id === id ? { ...t, lastModified: new Date().toISOString() } : t),
      ),
    );
  }

  function handleViewTemplate(id: number): void {
    router.push(`${rolePrefix}/template-management/create-assign-template?edit=${id}&mode=view`);
  }

  function handleEditTemplate(id: number, template: TemplateRecord): void {
    const effectiveStatus = template.freeze_status ?? permissions.freezeStatus;

    if (template.is_past_cycle) {
      toast.error("This template is from a past PMS cycle and is permanently frozen.");
      return;
    }

    const hasExceptions = level === 1 && (
      (template.unfrozenBranchIds?.length  ?? 0) > 0 ||
      (template.unfrozenCountryIds?.length ?? 0) > 0
    );

    if (effectiveStatus === "frozen" && !hasExceptions) {
      toast.error("Templates are fully frozen. No edits are permitted in this period.");
      return;
    }
    if (!permissions.canEdit && !hasExceptions) {
      toast.error(
        effectiveStatus === "grace"
          ? "Grace period is active. Only HQ Admin may edit."
          : "You do not have permission to edit templates.",
      );
      return;
    }

    bumpTemplateToTop(id);
    const unfreezeParam = hasExceptions ? "&unfreezeMode=1" : "";
    router.push(`${rolePrefix}/template-management/create-assign-template?edit=${id}${unfreezeParam}`);
  }

  async function handleDuplicateTemplate(template: TemplateRecord): Promise<void> {
    if (!permissions.canCreate) {
      toast.error("Templates are frozen — duplication is not permitted in this period.");
      return;
    }

    const previousTemplates = [...templates];
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
        const freshTemplates: TemplateRecord[] = await refreshRes.json();
        setTemplates(sortByLastModified(freshTemplates));
      }
      toast.success(`"${template.name}" duplicated into the current cycle.`);
    } catch (err: any) {
      // Roll back optimistic state
      setTemplates(previousTemplates);
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

    const previousTemplates = [...templates];
    // Optimistic removal
    setTemplates(prev => prev.filter(t => t.id !== id));
    setConfirmDeleteId(null);

    try {
      const response = await fetch(`${API_BASE}/templates/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Delete failed");
      }
      toast.success("Template deleted.");
    } catch (err: any) {
      // Roll back on failure
      setTemplates(previousTemplates);
      toast.error(err.message ?? "Could not delete template.");
    }
  }

  /** Merges an updated template record into state after a freeze-modal save. */
  function handleFreezeModalSaved(updated: TemplateRecord): void {
    setTemplates(prev =>
      sortByLastModified(prev.map(t => t.id === updated.id ? updated : t)),
    );
    setFreezeModalTemplate(updated);
  }

  // ── Derived booleans ──
  const hasAnyFilter =
    !!filters.search ||
    filters.designations.length > 0 ||
    filters.departments.length  > 0 ||
    filters.branches.length     > 0 ||
    filters.countries.length    > 0;

  // ── Render ──

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
            {confirmDeleteTemplate?.is_past_cycle
              ? <p className={styles.modalText}>
                  This template belongs to a past PMS cycle and{" "}
                  <strong>cannot be deleted</strong>. Past-cycle templates are permanently
                  frozen for audit purposes.
                </p>
              : <p className={styles.modalText}>
                  This action cannot be undone. All assignments will also be removed.
                </p>}
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancelBtn}
                onClick={() => setConfirmDeleteId(null)}
              >
                {confirmDeleteTemplate?.is_past_cycle ? "Close" : "Cancel"}
              </button>
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

      {/* ── Edit cycle dates modal ── */}
      {showEditCycleModal && activeCycle && (
        <EditCycleDatesModal
          activeCycle={activeCycle}
          onClose={() => setShowEditCycleModal(false)}
          onSaved={updated => { setActiveCycle(updated); setShowEditCycleModal(false); }}
        />
      )}

      {/* ── Manage freeze modal ── */}
      {freezeModalTemplate && (
        <ManageFreezeModal
          template={freezeModalTemplate}
          rolePrefix={rolePrefix}
          onClose={() => setFreezeModalTemplate(null)}
          onSaved={handleFreezeModalSaved}
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
            {permissions.freezeStatus === "open"   && (
              <span className={styles.subtitleNote}>
                Objective window closes <strong>{formatDate(freezeDates.objectiveSettingEnd)}</strong>
              </span>
            )}
            {permissions.freezeStatus === "grace"  && (
              <span className={styles.subtitleNoteAmber}>
                Grace period until <strong>{formatDate(freezeDates.graceEnd)}</strong>
              </span>
            )}
            {permissions.freezeStatus === "frozen" && (
              <span className={styles.subtitleNoteFrozen}>
                Templates frozen — read only
                {level === 1 && " (use Manage Freeze to unfreeze per branch)"}
              </span>
            )}
          </p>
        </div>
        <div className={styles.headerActions}>
          <CycleStatusBadge status={permissions.freezeStatus} />
          {permissions.canCreate && (
            <button
              className={styles.createBtn}
              onClick={() => router.push(`${rolePrefix}/template-management/create-assign-template`)}
            >
              + Create New Template
            </button>
          )}
        </div>
      </div>

      {/* ── Status banner ── */}
      <StatusBanner permissions={permissions} freezeDates={freezeDates} level={level} />

      {/* ── PMS cycle panel ── */}
      {!isLoading && (
        <PmsCyclePanel
          freezeDates={freezeDates}
          activeCycle={activeCycle}
          templateCount={templates.filter(t => !t.is_past_cycle).length}
          permissions={permissions}
          level={level}
          onEditCycle={() => setShowEditCycleModal(true)}
        />
      )}

      {/* ── Filter bar ── */}
      <HorizontalFilterBar
        filters={filters}
        onFilterChange={setFilters}
        allDesignations={filterOptions.designations}
        allDepartments={filterOptions.departments}
        allBranches={filterOptions.branches}
        allCountries={filterOptions.countries}
        totalCount={templates.length}
        filteredCount={filteredTemplates.length}
        isLoading={isLoading}
      />

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
              {hasAnyFilter ? "No Matching Templates" : "No Templates Yet"}
            </h3>
            <p className={styles.emptyText}>
              {hasAnyFilter
                ? "No templates match your current filters. Try adjusting or clearing them."
                : "Click \"Create New Template\" to get started."}
            </p>
            {hasAnyFilter && (
              <button
                onClick={() => setFilters({ search: "", designations: [], departments: [], branches: [], countries: [] })}
                style={{
                  marginTop: "12px", padding: "8px 16px", borderRadius: "8px",
                  border: "1.5px solid #e2e8f0", background: "#f8fafc",
                  color: "#374151", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                }}
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
                onToggleCategoryExpand={() =>
                  setExpandedCardId(prev  => prev === template.id ? null : template.id)
                }
                onToggleAssignExpand={() =>
                  setExpandedAssignId(prev => prev === template.id ? null : template.id)
                }
                onView={()         => handleViewTemplate(template.id)}
                onEdit={()         => handleEditTemplate(template.id, template)}
                onDelete={()       => setConfirmDeleteId(template.id)}
                onDuplicate={()    => handleDuplicateTemplate(template)}
                onManageFreeze={() => setFreezeModalTemplate(template)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
