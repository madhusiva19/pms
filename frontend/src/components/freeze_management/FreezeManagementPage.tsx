/**
 * FreezeManagementPage.tsx

 * @module FreezeManagementPage
 */

"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams }    from "next/navigation";
import {
  ArrowLeft,    CheckCircle2, Eye,
  GitBranch,    Layers,       Loader2,
  Lock,         Pencil,       Plus,
  ShieldCheck,  Unlock,       X,
} from "lucide-react";
import { toast } from "sonner";
import Sidebar    from "@/components/sidebar/Sidebar";
import Breadcrumb from "@/components/breadcrumb/Breadcrumb";
import styles    from "./FreezeManagementPage.module.css";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Base URL for all API requests; falls back to local dev server. */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";

/** Dashboard URL to navigate back to. */
const TEMPLATE_DASHBOARD_PATH = "/hq-admin/template-management";

/** URL prefix for HQ Admin pages. */
const HQ_ROLE_PREFIX = "/hq-admin";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssignedBranch {
  id:          string;
  name:        string;
  code:        string | null;
  country_id?: string | null;
}

interface AssignedCountry {
  id:   string;
  name: string;
  code: string | null;
}

interface AssignedDepartment {
  id:        string;
  name:      string;
  code:      string | null;
  branch_id: string | null;
}

interface AssignedSubDept {
  id:   string;
  name: string;
  code: string | null;
}

/** An unfreeze exception record. */
interface UnfreezeException {
  id:          number;
  branch_id:   string | null;
  country_id:  string | null;
  unfrozen_at: string | null;
}

/** A branch- or country-specific content variant. */
interface TemplateVariant {
  id:           number;
  branch_id:    string | null;
  country_id:   string | null;
  name:         string | null;
  lastModified: string | null;
}

/** Subset of the full template record required by this page. */
interface TemplateRecord {
  id:                      number;
  name:                    string;
  assignedBranches?:       AssignedBranch[];
  assignedCountries?:      AssignedCountry[];
  assignedDepartments?:    AssignedDepartment[];
  assignedSubDepartments?: AssignedSubDept[];
  unfrozenBranchIds?:      string[];
  unfrozenCountryIds?:     string[];
  unfreezeExceptions?:     UnfreezeException[];
  variants?:               TemplateVariant[];
}

/** Which tab is currently active in the branch/country switcher. */
type ActiveTab = "branches" | "countries";

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Formats a date string into a short "DD Mon" display.
 * Returns "—" for null/undefined.
 */
function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day:   "numeric",
      month: "short",
    });
  } catch {
    return "—";
  }
}

// ─── ScopeBanner ─────────────────────────────────────────────────────────────

/**
 * Displays department / sub-department scope chips
 * so the admin knows which organisational units this template covers.
 */
function ScopeBanner({ template }: { template: TemplateRecord }) {
  const uniqueDeptNames = [
    ...new Set(
      (template.assignedDepartments ?? []).map(d => d.name),
    ),
  ];
  const uniqueSubDeptNames = [
    ...new Set(
      (template.assignedSubDepartments ?? []).map(s => s.name),
    ),
  ];

  if (uniqueDeptNames.length === 0 && uniqueSubDeptNames.length === 0) {
    return null;
  }

  return (
    <div className={styles.scopeBanner}>
      <span className={styles.scopeLabel}>Scope:</span>

      {uniqueDeptNames.map(name => (
        <span key={name} className={styles.scopeChipDept}>
          {name}
        </span>
      ))}

      {uniqueSubDeptNames.map(name => (
        <span key={name} className={styles.scopeChipSubDept}>
          {name}
        </span>
      ))}
    </div>
  );
}

// ─── UnfrozenItem ─────────────────────────────────────────────────────────────

/**
 * A single row in the "Currently Unfrozen" section.
 * Shows re-freeze and create/edit variant actions.
 */
function UnfrozenItem({
  item,
  isBranchTab,
  parentCountry,
  existingVariant,
  isRefreezing,
  isCreatingVariant,
  onRefreeze,
  onCreateVariant,
  onEditVariant,
}: {
  item:             AssignedBranch | AssignedCountry;
  isBranchTab:      boolean;
  parentCountry:    AssignedCountry | undefined;
  existingVariant:  TemplateVariant | undefined;
  isRefreezing:     boolean;
  isCreatingVariant: boolean;
  onRefreeze:       () => void;
  onCreateVariant:  () => void;
  onEditVariant:    (variantId: number) => void;
}) {
  return (
    <div className={styles.unfrozenRow}>
      <Unlock size={14} color="#16a34a" className={styles.rowIcon} />

      <div className={styles.rowBody}>
        <div className={styles.rowName}>
          {(item as any).code ? `${(item as any).code} — ` : ""}
          {item.name}
        </div>

        {/* Show parent country name for branch items */}
        {isBranchTab && parentCountry && (
          <div className={styles.rowMeta}>
            {parentCountry.code ?? parentCountry.name}
          </div>
        )}

        {existingVariant && (
          <div className={styles.rowVariantNote}>
            Has custom variant · last modified{" "}
            {formatShortDate(existingVariant.lastModified)}
          </div>
        )}
      </div>

      {/* Edit existing variant (full edit — item is unfrozen) */}
      {existingVariant
        ? (
          <button
            className={styles.btnEditVariant}
            onClick={() => onEditVariant(existingVariant.id)}
          >
            <Pencil size={11} /> Edit Variant
          </button>
        )
        : (
          /* Create a new variant */
          <button
            className={styles.btnCreateVariant}
            onClick={onCreateVariant}
            disabled={isCreatingVariant}
          >
            {isCreatingVariant
              ? <><Loader2 size={11} className={styles.spinner} /> Creating…</>
              : <><Plus    size={11} /> Create Variant</>}
          </button>
        )}

      {/* Re-freeze this item */}
      <button
        className={styles.btnRefreeze}
        onClick={onRefreeze}
        disabled={isRefreezing}
      >
        {isRefreezing
          ? <><Loader2 size={11} className={styles.spinner} /> Freezing…</>
          : <><Lock    size={11} /> Re-freeze</>}
      </button>
    </div>
  );
}

// ─── FrozenItem ───────────────────────────────────────────────────────────────

/**
 * A single row in the "Currently Frozen" section.
 * Shows a checkbox to select for unfreezing, and a read-only variant viewer.
 */
function FrozenItem({
  item,
  isBranchTab,
  parentCountry,
  existingVariant,
  isSelected,
  onToggleSelect,
  onViewVariant,
}: {
  item:            AssignedBranch | AssignedCountry;
  isBranchTab:     boolean;
  parentCountry:   AssignedCountry | undefined;
  existingVariant: TemplateVariant | undefined;
  isSelected:      boolean;
  onToggleSelect:  () => void;
  onViewVariant:   (variantId: number) => void;
}) {
  return (
    <div
      className={`${styles.frozenRow} ${isSelected ? styles.frozenRowSelected : ""}`}
    >
      {/* Selection checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggleSelect}
        className={styles.rowCheckbox}
        aria-label={`Select ${item.name} to unfreeze`}
      />

      <Lock
        size={13}
        color={isSelected ? "#3b82f6" : "#94a3b8"}
        className={styles.rowIcon}
      />

      <div className={styles.rowBody}>
        <div
          className={styles.rowName}
          style={{ color: isSelected ? "#1e40af" : "#475569" }}
        >
          {(item as any).code ? `${(item as any).code} — ` : ""}
          {item.name}
        </div>

        {/* Parent country for branch items */}
        {isBranchTab && parentCountry && (
          <div className={styles.rowMeta}>
            {parentCountry.code ?? parentCountry.name}
          </div>
        )}

        {existingVariant && (
          <div className={styles.rowVariantNoteFrozen}>
            <Lock size={9} color="#94a3b8" />
            Has custom variant (frozen) · last modified{" "}
            {formatShortDate(existingVariant.lastModified)}{" "}
            <span className={styles.rowVariantFrozenHint}>
              · Unfreeze to edit
            </span>
          </div>
        )}
      </div>

      {/* View variant read-only (frozen — no edits allowed) */}
      {existingVariant && (
        <button
          className={styles.btnViewVariant}
          onClick={() => onViewVariant(existingVariant.id)}
          title="View variant (read-only — unfreeze to edit)"
        >
          <Eye size={11} /> View Variant
        </button>
      )}
    </div>
  );
}

// ─── FreezeManagementInner ────────────────────────────────────────────────────

/**
 * Inner component that uses useSearchParams().
 * Must be wrapped in <Suspense> by the exported default (Next.js App Router).
 */
function FreezeManagementInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const templateId   = searchParams.get("templateId");

  /* ── State ── */
  const [template,          setTemplate]          = useState<TemplateRecord | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(true);
  const [activeTab,         setActiveTab]         = useState<ActiveTab>("branches");

  /* IDs of frozen items checked to be unfrozen */
  const [selectedToUnfreeze, setSelectedToUnfreeze] = useState<Set<string>>(new Set());

  /* Per-item async loading indicators */
  const [isSaving,          setIsSaving]          = useState(false);
  const [refreezingIds,     setRefreezingIds]      = useState<Set<string>>(new Set());
  const [creatingVariantFor,setCreatingVariantFor] = useState<string | null>(null);

  // ── Derived data ────────────────────────────────────────────────────────────

  const assignedBranches  = template?.assignedBranches  ?? [];
  const assignedCountries = template?.assignedCountries ?? [];
  const exceptions        = template?.unfreezeExceptions ?? [];
  const variants          = template?.variants ?? [];

  const unfrozenBranchIdSet  = new Set(template?.unfrozenBranchIds  ?? []);
  const unfrozenCountryIdSet = new Set(template?.unfrozenCountryIds ?? []);

  const frozenBranches    = assignedBranches.filter(b => !unfrozenBranchIdSet.has(b.id));
  const unfrozenBranches  = assignedBranches.filter(b =>  unfrozenBranchIdSet.has(b.id));
  const frozenCountries   = assignedCountries.filter(c => !unfrozenCountryIdSet.has(c.id));
  const unfrozenCountries = assignedCountries.filter(c =>  unfrozenCountryIdSet.has(c.id));

  const isBranchTab        = activeTab === "branches";
  const currentFrozenItems   = isBranchTab ? frozenBranches   : frozenCountries;
  const currentUnfrozenItems = isBranchTab ? unfrozenBranches : unfrozenCountries;

  /* Items from the current tab that are checked */
  const currentTabSelected = [...selectedToUnfreeze].filter(id =>
    currentFrozenItems.some(item => item.id === id),
  );

  const areAllFrozenSelected =
    currentFrozenItems.length > 0 &&
    currentFrozenItems.every(item => selectedToUnfreeze.has(item.id));

  // ── Tab configuration ───────────────────────────────────────────────────────

  const TAB_CONFIG = [
    {
      key:           "branches"  as ActiveTab,
      label:         "Branches",
      totalCount:    assignedBranches.length,
      unfrozenCount: unfrozenBranches.length,
    },
    {
      key:           "countries" as ActiveTab,
      label:         "Countries",
      totalCount:    assignedCountries.length,
      unfrozenCount: unfrozenCountries.length,
    },
  ];

  // ── Fetch template ──────────────────────────────────────────────────────────

  useEffect(() => {
    async function fetchTemplate(): Promise<void> {
      if (!templateId) {
        toast.error("No template ID provided.");
        return;
      }
      setIsLoadingTemplate(true);
      try {
        const response = await fetch(`${API_BASE}/templates`);
        if (!response.ok) throw new Error("Failed to load templates");

        const allTemplates: TemplateRecord[] = await response.json();
        const found = allTemplates.find(
          t => String(t.id) === String(templateId),
        );
        if (!found) throw new Error("Template not found");

        setTemplate(found);
      } catch {
        toast.error(
          "Could not load template. Please go back and try again.",
        );
      } finally {
        setIsLoadingTemplate(false);
      }
    }

    fetchTemplate();
  }, [templateId]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

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

  /**
   * Re-fetches the full template list and updates local state
   * with the refreshed record for this template.
   */
  async function refreshTemplate(successMessage: string): Promise<void> {
    const refreshRes = await fetch(`${API_BASE}/templates`);
    if (refreshRes.ok) {
      const allTemplates: TemplateRecord[] = await refreshRes.json();
      const updated = allTemplates.find(
        t => String(t.id) === String(templateId),
      );
      if (updated) {
        toast.success(successMessage);
        setTemplate(updated);
        return;
      }
    }
    toast.success(successMessage);
  }

  // ── Unfreeze selected items ─────────────────────────────────────────────────

  async function handleUnfreezeSelected(): Promise<void> {
    if (currentTabSelected.length === 0 || !template) return;

    setIsSaving(true);
    try {
      const requestBody = isBranchTab
        ? { branch_ids: currentTabSelected,  country_ids: [] }
        : { branch_ids: [],                   country_ids: currentTabSelected };

      const response = await fetch(
        `${API_BASE}/templates/${template.id}/unfreeze-exceptions`,
        {
          method:  "POST",
          headers: {
            "Content-Type": "application/json",
            "X-User-Level": "1",
          },
          body: JSON.stringify(requestBody),
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Unfreeze failed");
      }

      /* Remove unfrozen IDs from the selection set */
      setSelectedToUnfreeze(prev => {
        const next = new Set(prev);
        currentTabSelected.forEach(id => next.delete(id));
        return next;
      });

      const entityLabel = isBranchTab ? "branch(es)" : "countr(ies)";
      await refreshTemplate(
        `Unfrozen ${currentTabSelected.length} ${entityLabel}.`,
      );
    } catch (err: any) {
      toast.error(err.message ?? "Failed to unfreeze.");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Re-freeze a single item ─────────────────────────────────────────────────

  async function handleRefreeze(itemId: string): Promise<void> {
    if (!template) return;

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
        {
          method:  "DELETE",
          headers: { "X-User-Level": "1" },
        },
      );

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error ?? "Re-freeze failed");
      }

      await refreshTemplate("Re-frozen successfully.");
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

  // ── Create / navigate to variant ────────────────────────────────────────────

  /**
   * Creates a new content variant for the given branch or country,
   * then navigates to the variant editor.
   * On HTTP 409 (variant already exists), navigates directly to it.
   */
  async function handleCreateVariant(
    branchId:  string | null,
    countryId: string | null,
  ): Promise<void> {
    if (!template) return;
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
          headers: {
            "Content-Type": "application/json",
            "X-User-Level": "1",
          },
          body: JSON.stringify(requestBody),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        /* Variant already exists — navigate directly */
        if (response.status === 409 && data.variant_id) {
          router.push(
            `${HQ_ROLE_PREFIX}/template-management/template-creation` +
            `?edit=${template.id}&variantId=${data.variant_id}`,
          );
          return;
        }
        throw new Error(data.error ?? "Failed to create variant");
      }

      toast.success("Variant created — opening editor…");
      router.push(
        `${HQ_ROLE_PREFIX}/template-management/template-creation` +
        `?edit=${template.id}&variantId=${data.variant.id}`,
      );
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create variant.");
    } finally {
      setCreatingVariantFor(null);
    }
  }

  /** Navigate to edit an existing variant (item is currently unfrozen). */
  function handleEditVariant(variantId: number): void {
    if (!template) return;
    router.push(
      `${HQ_ROLE_PREFIX}/template-management/template-creation` +
      `?edit=${template.id}&variantId=${variantId}`,
    );
  }

  /**
   * Navigate to VIEW a variant in read-only mode.
   * Used when the parent branch/country is still frozen.
   */
  function handleViewVariant(variantId: number): void {
    if (!template) return;
    router.push(
      `${HQ_ROLE_PREFIX}/template-management/template-creation` +
      `?edit=${template.id}&variantId=${variantId}&mode=view`,
    );
  }

  // ── Loading state ───────────────────────────────────────────────────────────

  if (isLoadingTemplate) {
    return (
      <div className={styles.loadingWrapper}>
        <Loader2 size={36} className={styles.spinner} color="#3b82f6" />
        <p className={styles.loadingText}>Loading template…</p>
      </div>
    );
  }

  if (!template) {
    return (
      <div className={styles.loadingWrapper}>
        <p className={styles.loadingText}>Template not found.</p>
        <button
          className={styles.backBtn}
          onClick={() => router.push(TEMPLATE_DASHBOARD_PATH)}
        >
          <ArrowLeft size={15} /> Back to Templates
        </button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={styles.dashShell}>
      <main className={styles.mainContent}>
        <Breadcrumb />
        <div className={styles.pageWrapper}>

      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIconWrap}>
            <ShieldCheck size={22} color="#ea580c" />
          </div>
          <div>
            <h1 className={styles.pageTitle}>Template Freeze Management</h1>
            <p className={styles.pageSubtitle}>
              Manage freeze exceptions and content variants for{" "}
              <strong>{template.name}</strong>
            </p>
          </div>
        </div>

        {/* Navigate back to the template dashboard */}
        <button
          className={styles.backBtn}
          onClick={() => router.push(TEMPLATE_DASHBOARD_PATH)}
          aria-label="Back to Template Management"
        >
          <ArrowLeft size={15} />
          Back to Templates
        </button>
      </div>

      {/* ── Scope / department chips ── */}
      <ScopeBanner template={template} />

      {/* ── Info card ── */}
      <div className={styles.infoCard}>
        <div className={styles.infoCardIcon}>
          <Layers size={18} color="#3b82f6" />
        </div>
        <div className={styles.infoCardBody}>
          <div className={styles.infoCardTitle}>{template.name}</div>
          <div className={styles.infoCardMeta}>
            <span>
              {assignedBranches.length} branch
              {assignedBranches.length !== 1 ? "es" : ""}
            </span>
            <span className={styles.infoCardDot} />
            <span>
              {assignedCountries.length} countr
              {assignedCountries.length !== 1 ? "ies" : "y"}
            </span>
            {(template.unfrozenBranchIds?.length  ?? 0) > 0 ||
             (template.unfrozenCountryIds?.length ?? 0) > 0
              ? (
                <>
                  <span className={styles.infoCardDot} />
                  <span className={styles.infoCardBadgeUnfrozen}>
                    <Unlock size={10} />
                    Partially unfrozen
                  </span>
                </>
              )
              : null}
          </div>
        </div>
      </div>

      {/* ── Main content card ── */}
      <div className={styles.contentCard}>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          {TAB_CONFIG.map(tab => {
            const isActiveTab = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                className={`${styles.tab} ${
                  isActiveTab ? styles.tabActive : ""
                }`}
                onClick={() => {
                  setActiveTab(tab.key);
                  setSelectedToUnfreeze(new Set());
                }}
              >
                {tab.label}

                {/* Total count badge */}
                <span
                  className={`${styles.tabBadge} ${
                    isActiveTab ? styles.tabBadgeActive : ""
                  }`}
                >
                  {tab.totalCount}
                </span>

                {/* Unfrozen count badge */}
                {tab.unfrozenCount > 0 && (
                  <span className={styles.tabUnfrozenBadge}>
                    {tab.unfrozenCount} unfrozen
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Scrollable body ── */}
        <div className={styles.contentBody}>

          {/* Section: Currently Unfrozen */}
          {currentUnfrozenItems.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <Unlock size={13} color="#166534" />
                <span className={styles.sectionTitleGreen}>
                  Currently Unfrozen — {currentUnfrozenItems.length}
                </span>
                <span className={styles.sectionHint}>
                  Re-freeze or create a variant
                </span>
              </div>

              <div className={styles.itemList}>
                {currentUnfrozenItems.map(item => {
                  const branchId  = isBranchTab ? item.id : null;
                  const countryId = !isBranchTab ? item.id : null;

                  const existingVariant = variants.find(
                    v =>
                      (branchId  && v.branch_id  === branchId)  ||
                      (countryId && v.country_id === countryId),
                  );

                  const parentCountry =
                    isBranchTab
                      ? assignedCountries.find(
                          c => c.id === (item as AssignedBranch).country_id,
                        )
                      : undefined;

                  return (
                    <UnfrozenItem
                      key={item.id}
                      item={item}
                      isBranchTab={isBranchTab}
                      parentCountry={parentCountry}
                      existingVariant={existingVariant}
                      isRefreezing={refreezingIds.has(item.id)}
                      isCreatingVariant={creatingVariantFor === item.id}
                      onRefreeze={() => handleRefreeze(item.id)}
                      onCreateVariant={() =>
                        handleCreateVariant(branchId, countryId)
                      }
                      onEditVariant={handleEditVariant}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* Section: Currently Frozen */}
          {currentFrozenItems.length > 0 && (
            <section
              className={styles.section}
              style={{
                marginTop:
                  currentUnfrozenItems.length > 0 ? "24px" : "0",
              }}
            >
              <div className={styles.sectionHeader}>
                <Lock size={13} color="#1e3a8a" />
                <span className={styles.sectionTitleBlue}>
                  Currently Frozen — {currentFrozenItems.length}
                </span>
                <span className={styles.sectionHint}>
                  Select to unfreeze
                </span>

                {/* Select all checkbox */}
                {currentFrozenItems.length > 1 && (
                  <label className={styles.selectAllLabel}>
                    <input
                      type="checkbox"
                      checked={areAllFrozenSelected}
                      onChange={toggleSelectAll}
                      className={styles.selectAllCheckbox}
                    />
                    Select all
                  </label>
                )}
              </div>

              <div className={styles.itemList}>
                {currentFrozenItems.map(item => {
                  const branchId  = isBranchTab ? item.id : null;
                  const countryId = !isBranchTab ? item.id : null;

                  const existingVariant = variants.find(
                    v =>
                      (branchId  && v.branch_id  === branchId)  ||
                      (countryId && v.country_id === countryId),
                  );

                  const parentCountry =
                    isBranchTab
                      ? assignedCountries.find(
                          c => c.id === (item as AssignedBranch).country_id,
                        )
                      : undefined;

                  return (
                    <FrozenItem
                      key={item.id}
                      item={item}
                      isBranchTab={isBranchTab}
                      parentCountry={parentCountry}
                      existingVariant={existingVariant}
                      isSelected={selectedToUnfreeze.has(item.id)}
                      onToggleSelect={() => toggleItemSelection(item.id)}
                      onViewVariant={handleViewVariant}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* Empty state — no items in this tab */}
          {currentFrozenItems.length === 0 &&
            currentUnfrozenItems.length === 0 && (
              <p className={styles.emptyNote}>
                No {isBranchTab ? "branches" : "countries"} assigned to
                this template.
              </p>
            )}

          {/* All-unfrozen confirmation */}
          {currentFrozenItems.length === 0 &&
            currentUnfrozenItems.length > 0 && (
              <div className={styles.allUnfrozenNote}>
                <CheckCircle2 size={14} color="#16a34a" />
                All {isBranchTab ? "branches" : "countries"} are currently
                unfrozen.
              </div>
            )}
        </div>

        {/* ── Footer: selection summary + unfreeze button ── */}
        <div className={styles.footer}>
          <div className={styles.footerInfo}>
            {currentTabSelected.length > 0
              ? (
                <span className={styles.footerSelected}>
                  {currentTabSelected.length} selected to unfreeze
                </span>
              )
              : (
                <span className={styles.footerHint}>
                  Select frozen{" "}
                  {isBranchTab ? "branches" : "countries"} above to
                  unfreeze them
                </span>
              )}
          </div>

          <div className={styles.footerActions}>
            {/* Navigate back */}
            <button
              className={styles.cancelBtn}
              onClick={() => router.push(TEMPLATE_DASHBOARD_PATH)}
            >
              Close
            </button>

            {/* Unfreeze selected */}
            <button
              className={`${styles.unfreezeBtn} ${
                currentTabSelected.length === 0 || isSaving
                  ? styles.unfreezeBtnDisabled
                  : ""
              }`}
              onClick={handleUnfreezeSelected}
              disabled={currentTabSelected.length === 0 || isSaving}
              aria-busy={isSaving}
            >
              {isSaving
                ? (
                  <>
                    <Loader2 size={13} className={styles.spinner} />
                    Unfreezing…
                  </>
                )
                : (
                  <>
                    <Unlock size={13} />
                    Unfreeze
                    {currentTabSelected.length > 0
                      ? ` ${currentTabSelected.length} Selected`
                      : " Selected"}
                  </>
                )}
            </button>
          </div>
        </div>
      </div>
    </div>
 </main>
</div> 
  );
}

// ─── FreezeManagementPage (exported default) ──────────────────────────────────

/**
 * Public export.
 * Wraps FreezeManagementInner in Suspense so that useSearchParams()
 * works correctly under Next.js App Router without a build error.
 */
export default function FreezeManagementPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.loadingWrapper}>
          <Loader2 size={36} className={styles.spinner} color="#3b82f6" />
          <p className={styles.loadingText}>Loading…</p>
        </div>
      }
    >
      <FreezeManagementInner />
    </Suspense>
  );
}

