"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectItem } from "@/lib/project/items";
import { ADD_ITEM_EVENT, type AddItemDetail } from "@/lib/project/add-item-event";
import type { TemplateId } from "@/lib/deliverable/templates";
import { templateLabel } from "@/lib/deliverable/template-labels";
import { emailDeliverableScope } from "@/lib/deliverable/email-scope";
import { reorderWithinKind } from "@/lib/project/reorder";
import { buildProjectDigest, brandingForDigest } from "@/lib/project/digest";
import type { SignificantChange, ScoredEventSummary } from "@/lib/signals/types";
import { withConfirmed, withoutConfirmed } from "@/lib/signals/confirmed-values";
import type { FeedRow } from "@/lib/project/feed";
import { deriveProjectName } from "@/lib/project/derive-name";
import { Breadcrumbs } from "@/components/nav/Breadcrumbs";
import { projectTrail } from "@/lib/nav/breadcrumbs";
import { ProjectAiContextBridge } from "./workspace/ProjectAiContextBridge";
import { UploadDrop } from "@/components/project/UploadDrop";
import { MaterialsHub } from "@/components/project/MaterialsHub";
import { ProjectTitle } from "./workspace/ProjectTitle";
import { ItemsBoard } from "./workspace/ItemsBoard";
import { BrandingBlock } from "@/components/brand/BrandingBlock";
import { registerBrandPanel, pulseBrandPanel } from "@/lib/brand/reveal-brand-panel";
import { PropertyUrlBlock } from "./workspace/PropertyUrlBlock";
import {
  type BrandPalette,
  PALETTE_SLOT_KEYS,
  defaultScheme,
  newPaletteId,
  sanitizePalettes,
  schemeFromBranding,
  schemeHasColor,
  schemesEqual,
} from "@/lib/brand/palette";
import { ConnectMcpBlock } from "./workspace/ConnectMcpBlock";
import { ThisWeek } from "./workspace/ThisWeek";
import type { ThisWeekState } from "@/lib/project/this-week";
import { DeliverableLanes } from "./workspace/DeliverableLanes";
import { BuildActions } from "./workspace/BuildActions";
import { ProjectActionBar } from "./workspace/ProjectActionBar";
import type {
  SavedChart,
  DeliverableRow,
  EmailScheduleRow,
  ProjectUiState,
} from "./workspace/types";

// Agent fields that BrandingBlock edits — used for pre-fill detection.
// business_address rides along (CAN-SPAM postal address, account-level like
// the rest of these so it seeds every new project once saved globally).
const AGENT_KEYS = ["agent_name", "photo_url", "license", "brokerage", "business_address"] as const;

interface Seed {
  template: string;
  scopeKind: string | null;
  scopeValue: string | null;
}

interface Props {
  id: string;
  title: string | null;
  branding: Record<string, string> | null;
  items: ProjectItem[];
  charts: Record<string, SavedChart>;
  /** Live heads (each with its older versions attached) from splitDeliverableVersions. */
  deliverables: (DeliverableRow & { versions: DeliverableRow[] })[];
  emailSchedules: EmailScheduleRow[];
  feedRows: FeedRow[];
  uiState: ProjectUiState;
  fileUrls: Record<string, string>;
  mcpKey: string | null;
  /** Wave 1.5: the user's own listing-page URL (head of the artifact link chain). */
  propertyUrl: string | null;
  seed: Seed | null;
  /** Pre-computed from computeSignificantChanges() server-side. */
  significantChanges: SignificantChange[];
  /** Scored nearby events from project_events (inject_ai=true, dismissed_at=null, 180d). */
  activeEvents: ScoredEventSummary[];
  /** Pre-formatted recent activity (last 30d, sig ≥ 5) from readRecentActivity(). */
  recentActivity?: string[];
}

interface BuildOpts {
  template?: string;
  scopeKind?: string | null;
  scopeValue?: string | null;
}

/**
 * The project workspace orchestrator (Piece 1 §A). Owns per-project session state
 * and composes the workspace/* presentational components.
 *
 * Layout: Title → Brand+AI pills (popovers) → ItemsBoard → UploadDrop →
 *         DeliverableLanes → BuildActions → ProjectActionBar.
 */
export function ProjectWorkspace({
  id,
  title: initialTitle,
  branding: initialBranding,
  items: initialItems,
  charts,
  deliverables,
  emailSchedules,
  feedRows,
  uiState: initialUiState,
  fileUrls,
  mcpKey,
  propertyUrl: initialPropertyUrl,
  seed,
  significantChanges,
  activeEvents,
  recentActivity = [],
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState<ProjectItem[]>(initialItems);
  const [title, setTitle] = useState(initialTitle ?? "");
  const [branding, setBranding] = useState<Record<string, string>>(initialBranding ?? {});
  // Account-level saved color palettes (schemes), loaded with the brand profile.
  const [palettes, setPalettes] = useState<BrandPalette[]>([]);
  const [uiState, setUiState] = useState<ProjectUiState>(initialUiState);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState<TemplateId>("market-overview");
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [propertyUrl, setPropertyUrl] = useState<string | null>(initialPropertyUrl);
  // Which pill popover is open (null = all closed).
  const [activePill, setActivePill] = useState<"brand" | "mcp" | "link" | null>(null);
  // Tracks whether a per-project MCP key is active this session (stays in sync with
  // ConnectMcpBlock's internal key state via the onKeyChange callback).
  const [hasMcpKey, setHasMcpKey] = useState(!!mcpKey);
  // Phase 3B: refresh state for the significant-changes nudge chip.
  const [refreshing, setRefreshing] = useState(false);
  const [refreshDismissed, setRefreshDismissed] = useState(false);

  // True when this project has at least one agent branding field saved.
  const hasBranding = AGENT_KEYS.some((k) => !!branding[k]);

  // Account-menu Brand click lands HERE when this workspace is on screen: open
  // the pill popover, scroll to it, pulse (spec 2026-07-05-account-quick-access).
  const brandRevealRef = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      registerBrandPanel(() => {
        setActivePill("brand");
        requestAnimationFrame(() => pulseBrandPanel(brandRevealRef.current));
      }),
    [],
  );

  // On first brand-pill open, load the user's saved brand profile: seed agent
  // fields + empty color slots from the account default (funnel arrivals, new
  // projects) and load the saved-palette library.
  const brandPrefillAttempted = useRef(false);

  useEffect(() => {
    if (activePill !== "brand") return;
    if (brandPrefillAttempted.current) return;
    brandPrefillAttempted.current = true;

    fetch("/api/user/brand")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, unknown>) => {
        setPalettes(sanitizePalettes(data.color_palettes));
        setBranding((prev) => {
          const next = { ...prev };
          // Agent fields: only seed when the project has none yet.
          if (!AGENT_KEYS.some((k) => prev[k])) {
            for (const k of AGENT_KEYS) {
              if (typeof data[k] === "string" && data[k]) next[k] = data[k] as string;
            }
          }
          // Colors: seed each empty slot from the account default scheme so a
          // saved palette carries to new projects without rewriting set colors.
          const scheme = defaultScheme(data);
          PALETTE_SLOT_KEYS.forEach((k, i) => {
            if (!prev[k] && scheme[i]) next[k] = scheme[i];
          });
          return next;
        });
      })
      .catch(() => {});
  }, [activePill]);

  const fileCount = items.filter((i) => i.kind === "file").length;

  useEffect(() => {
    function onAdd(e: Event) {
      const detail = (e as CustomEvent<AddItemDetail>).detail;
      if (!detail || detail.projectId !== id) return;
      if (items.some((i) => i.id === detail.item.id)) return;
      const next = [...items, detail.item];
      setItems(next);
      setSaving(true);
      setSavedMsg(null);
      fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: next }),
      })
        .then((res) => setSavedMsg(res.ok ? "Added" : "Save failed"))
        .catch(() => setSavedMsg("Save failed"))
        .finally(() => setSaving(false));
    }
    window.addEventListener(ADD_ITEM_EVENT, onAdd);
    return () => window.removeEventListener(ADD_ITEM_EVENT, onAdd);
  }, [items, id]);

  function mutate(next: ProjectItem[]) {
    setItems(next);
    setDirty(true);
  }
  function removeById(itemId: string) {
    mutate(items.filter((it) => it.id !== itemId));
  }
  function move(itemId: string, dir: -1 | 1) {
    const next = reorderWithinKind(items, itemId, dir);
    if (next !== items) mutate(next);
  }

  // Phase F: metric collision chip ("Keep mine") + inline value edit.
  const changesByItemId = useMemo(
    () => Object.fromEntries(significantChanges.map((c) => [c.item_id, c])),
    [significantChanges],
  );
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [localSuppressed, setLocalSuppressed] = useState<Record<string, boolean>>({});

  async function onKeepMine(item: ProjectItem) {
    if (item.kind !== "metric") return;
    setConfirmingId(item.id);
    try {
      // Persist the sticky flag FIRST; only suppress the chip + log evidence if it
      // landed. Otherwise a failed ui_state PATCH leaves the chip hidden locally while
      // the server still re-alerts on reload (flash-back) and the evidence row orphans.
      const persisted = await patchUiState({
        confirmed_values: withConfirmed(uiState, item.id, item.value).confirmed_values,
      });
      if (!persisted) return;
      await fetch(`/api/projects/${id}/confirm-value`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          change: changesByItemId[item.id],
          scope_kind: item.scope_kind,
          scope_value: item.scope_value,
        }),
      });
      setLocalSuppressed((s) => ({ ...s, [item.id]: true }));
    } finally {
      setConfirmingId(null);
    }
  }

  async function onEditValue(itemId: string, newValue: string) {
    const nextItems = items.map((it) =>
      it.kind === "metric" && it.id === itemId ? { ...it, value: newValue } : it,
    );
    setItems(nextItems);
    const nextUi = withoutConfirmed(uiState, itemId);
    setUiState(nextUi);
    await patch({ items: nextItems, ui_state: nextUi }, "Updated your number");
  }

  // Chip map with locally-suppressed (just-confirmed) entries removed so the chip
  // disappears immediately on "Keep mine".
  const visibleChanges = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(changesByItemId).filter(([itemId]) => !localSuppressed[itemId]),
      ),
    [changesByItemId, localSuppressed],
  );

  async function runBuild(opts?: BuildOpts) {
    if (building || items.length === 0) return;
    setBuilding(true);
    setBuildError(null);
    try {
      const tmpl = opts?.template ?? template;
      const body: Record<string, unknown> = { template: tmpl };
      if (tmpl === "email") {
        // An email builds at WHATEVER grain the project holds — a ZIP seed wins, else the
        // project's inferred ZIP/place, else whole-region (null → NULL/NULL scope → a SWFL
        // read). Never refuse for a missing ZIP; the numbers are the frozen filed items.
        const s =
          opts?.scopeKind === "zip" && opts?.scopeValue
            ? { scope_kind: "zip" as const, scope_value: opts.scopeValue }
            : emailDeliverableScope(items);
        if (s) {
          body.scope_kind = s.scope_kind;
          body.scope_value = s.scope_value;
        }
      } else if (opts?.scopeKind && opts?.scopeValue) {
        body.scope_kind = opts.scopeKind;
        body.scope_value = opts.scopeValue;
      }
      const res = await fetch(`/api/projects/${id}/build`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error || "Build failed — please try again.");
      window.location.assign(`/p/${data.id}`);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : "Build failed — please try again.");
      setBuilding(false);
    }
  }

  async function patch(body: Record<string, unknown>, okMsg: string): Promise<boolean> {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSavedMsg(okMsg);
        if ("items" in body || "title" in body) setDirty(false);
        return true;
      }
      setSavedMsg("Save failed");
      return false;
    } catch {
      setSavedMsg("Save failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function patchUiState(partial: Partial<ProjectUiState>): Promise<boolean> {
    const prevUi = uiState;
    const next = { ...uiState, ...partial };
    setUiState(next);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ui_state: next }),
      });
      if (!res.ok) {
        setUiState(prevUi);
        return false;
      }
      return true;
    } catch {
      setUiState(prevUi);
      return false;
    }
  }

  // Persist the saved-palette library to the account (best-effort) and keep
  // local state in sync. Called when a palette is added or removed in BrandingBlock.
  function persistPalettes(next: BrandPalette[]) {
    setPalettes(next);
    void fetch("/api/user/brand", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color_palettes: next }),
    });
  }

  async function saveBrandGlobal(): Promise<boolean> {
    // Auto-add the current scheme to the account palette library so it carries
    // to new projects (dedup against what's already saved).
    const scheme = schemeFromBranding(branding);
    let nextPalettes = palettes;
    if (schemeHasColor(scheme) && !palettes.some((p) => schemesEqual(p.colors, scheme))) {
      nextPalettes = [
        ...palettes,
        { id: newPaletteId(), name: `Palette ${palettes.length + 1}`, colors: scheme },
      ];
      setPalettes(nextPalettes);
    }
    // Fire the user-level brand save in parallel — best-effort (failure is silent;
    // the project save is the authoritative gate for the OK/close signal). Sends
    // the agent + color fields (in `branding`) plus the palette library.
    void fetch("/api/user/brand", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...branding, color_palettes: nextPalettes }),
    });
    return patch({ branding }, "Branding saved");
  }

  async function saveBrandProjectOnly(): Promise<boolean> {
    return patch({ branding }, "Saved to this project");
  }

  async function addFileItem(item: ProjectItem, objectUrl: string) {
    const next = [...items, item];
    setItems(next);
    setLocalPreviews((p) => ({ ...p, [item.id]: objectUrl }));
    setDirty(false);
    await patch({ items: next, title: title || null }, "File attached");
  }

  // Materials Hub v2 — block-canvas materials use their OWN endpoints, not the legacy
  // /api/deliverables/* edit/refresh modal flow (retired with the Built lane in Task 9).
  async function handleRefreshMaterial(did: string): Promise<void> {
    const res = await fetch(`/api/projects/${id}/materials/${did}/refresh`, { method: "POST" });
    if (res.ok) router.refresh(); // re-runs the server component → fresh heads via splitDeliverableVersions
  }

  async function handleAiMaterial(
    intent: string,
  ): Promise<{ template: { name: string }; id: string } | null> {
    const res = await fetch(`/api/projects/${id}/ai-material`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent }),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as {
      id: string;
      template: { id: string; name: string };
    } | null;
    if (!data?.id) return null;
    router.push(`/project/${id}/email-lab?did=${data.id}`); // open the new material to edit
    return data;
  }

  async function refreshItems() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/projects/${id}/refresh`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { items?: ProjectItem[] };
        if (Array.isArray(data.items)) setItems(data.items);
      }
    } finally {
      setRefreshing(false);
      setRefreshDismissed(true);
    }
  }

  const lastFreshnessSeen =
    typeof uiState.last_freshness_token_seen === "string"
      ? uiState.last_freshness_token_seen
      : undefined;
  const digest = useMemo(
    () =>
      buildProjectDigest({
        projectId: id,
        title: title || deriveProjectName(items),
        items,
        deliverables: deliverables.map((d) => ({
          id: d.id,
          template: d.template,
          created_at: d.created_at,
        })),
        schedules: emailSchedules.map((s) => ({
          cadence: s.cadence,
          scope_kind: s.scope_kind,
          scope_value: s.scope_value,
          topic: s.topic,
          last_run_at: s.last_run_at,
        })),
        lastFreshnessTokenSeen: lastFreshnessSeen,
        staleMetrics: [],
        feedRows,
        significantChanges,
        activeEvents,
        recentActivity,
        branding: brandingForDigest(branding),
      }),
    [
      id,
      title,
      items,
      deliverables,
      emailSchedules,
      lastFreshnessSeen,
      feedRows,
      significantChanges,
      activeEvents,
      recentActivity,
      branding,
    ],
  );

  const emailScope = emailDeliverableScope(items);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <ProjectAiContextBridge digest={digest} />
      <Breadcrumbs trail={projectTrail(title || deriveProjectName(items))} />

      {/* Cockpit D0 — the ready-for-you queue is the TOP section */}
      <ThisWeek
        projectId={id}
        week={(uiState.this_week as ThisWeekState | undefined) ?? null}
        deliverables={deliverables}
        scopeKind={emailScope?.scope_kind ?? null}
        scopeValue={emailScope?.scope_value ?? null}
        onWeekChange={(next) => patchUiState({ this_week: next })}
      />

      {seed && (
        <div className="mb-6 rounded-xl border border-gulf-teal/40 bg-gulf-teal/10 p-4">
          <p className="text-sm font-medium text-white">
            Ready to build a {templateLabel(seed.template)}
            {seed.scopeValue ? ` for ${seed.scopeValue.toUpperCase()}` : ""}.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Seeded from your last step — review the items below, then build a preview.
          </p>
          <button
            type="button"
            onClick={() =>
              void runBuild({
                template: seed.template,
                scopeKind: seed.scopeKind,
                scopeValue: seed.scopeValue,
              })
            }
            disabled={building || items.length === 0}
            className="btn-gradient mt-3 rounded-full px-4 py-2 text-sm font-semibold text-navy-dark disabled:opacity-50"
          >
            {building ? "Building…" : `Build ${templateLabel(seed.template)} preview`}
          </button>
          {buildError && <p className="mt-2 text-xs text-red-400">{buildError}</p>}
        </div>
      )}

      <ProjectTitle
        title={title}
        onChange={(t) => {
          setTitle(t);
          setDirty(true);
        }}
        onSave={() => patch({ items, title: title || null }, "Saved")}
        dirty={dirty}
        saving={saving}
        savedMsg={savedMsg}
      />

      {/* Brand + Connect AI pills — each opens a popover panel */}
      <div className="relative mt-3" ref={brandRevealRef}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActivePill((p) => (p === "brand" ? null : "brand"))}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              activePill === "brand"
                ? "bg-gulf-teal text-[#04121b]"
                : "border border-gulf-teal/40 bg-gulf-teal/10 text-gulf-teal hover:bg-gulf-teal/20"
            }`}
          >
            {hasBranding ? "✓ Brand" : "Brand"}
          </button>
          <button
            type="button"
            onClick={() => setActivePill((p) => (p === "mcp" ? null : "mcp"))}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              activePill === "mcp"
                ? "bg-gulf-teal text-[#04121b]"
                : "border border-gulf-teal/40 bg-gulf-teal/10 text-gulf-teal hover:bg-gulf-teal/20"
            }`}
          >
            {hasMcpKey ? "✓ AI" : "Connect AI"}
          </button>
          <button
            type="button"
            onClick={() => setActivePill((p) => (p === "link" ? null : "link"))}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              activePill === "link"
                ? "bg-gulf-teal text-[#04121b]"
                : "border border-gulf-teal/40 bg-gulf-teal/10 text-gulf-teal hover:bg-gulf-teal/20"
            }`}
          >
            {propertyUrl ? "✓ Listing link" : "Listing link"}
          </button>
        </div>

        {/* Click-outside backdrop */}
        {activePill && <div className="fixed inset-0 z-40" onClick={() => setActivePill(null)} />}

        {/* Floating popover panel */}
        {activePill && (
          <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-xl border border-white/15 bg-[#0d1e2b] p-4 shadow-2xl">
            {activePill === "brand" && (
              <BrandingBlock
                branding={branding}
                onChange={setBranding}
                palettes={palettes}
                onPalettesChange={persistPalettes}
                onSaveGlobal={saveBrandGlobal}
                onSaveProjectOnly={saveBrandProjectOnly}
                saving={saving}
                savedMsg={savedMsg}
                onClose={() => setActivePill(null)}
              />
            )}
            {activePill === "link" && (
              <PropertyUrlBlock
                projectId={id}
                initialUrl={propertyUrl}
                onSaved={setPropertyUrl}
                onClose={() => setActivePill(null)}
              />
            )}
            {activePill === "mcp" && (
              <ConnectMcpBlock
                projectId={id}
                initialKey={mcpKey}
                dismissedCount={uiState.mcp_dismissed_count ?? 0}
                onDismiss={() =>
                  void patchUiState({
                    mcp_dismissed_count: (uiState.mcp_dismissed_count ?? 0) + 1,
                  })
                }
                onClose={() => setActivePill(null)}
                onKeyChange={(k) => setHasMcpKey(!!k)}
              />
            )}
          </div>
        )}
      </div>

      {/* §8 freshness nudge — only fires when at least one metric moved significantly.
           Phase E1: removed generic "fresh figures" fallback (noise when nothing moved).
           Phase C1: single-change shows filed→current both-values text (not just direction). */}
      {digest.freshnessChangedSinceSeen &&
        digest.freshnessToken &&
        !refreshDismissed &&
        significantChanges.length > 0 && (
          <div className="mb-4 mt-4 flex items-center justify-between rounded-lg border border-gulf-teal/20 bg-gulf-teal/5 px-3 py-2">
            <span className="flex items-center gap-2 text-xs text-gray-300">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-gulf-teal" />
              {significantChanges.length === 1
                ? `${significantChanges[0]!.label}: filed ${significantChanges[0]!.previous_value} → ${significantChanges[0]!.delta_description}. Want to refresh?`
                : `${significantChanges.length} of your metrics moved since your last visit.`}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void refreshItems()}
                className="text-xs font-medium text-gulf-teal hover:underline disabled:opacity-50"
              >
                {refreshing ? "Refreshing…" : "Refresh items →"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRefreshDismissed(true);
                  void patchUiState({ last_freshness_token_seen: digest.freshnessToken });
                }}
                className="text-xs text-gray-500 hover:text-gray-300"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

      {/* Materials Hub — template-first create rail over the materials library */}
      <div className="mt-6">
        <MaterialsHub
          projectId={id}
          materials={deliverables}
          onRefresh={handleRefreshMaterial}
          onAiMaterial={handleAiMaterial}
        />
      </div>

      {/* Scheduled sends — schedule-driven lane (the Built lane now lives in the hub) */}
      <DeliverableLanes emailSchedules={emailSchedules} />

      {/* Filed data — the raw items board + uploader. Defaults to expanded; user can
           collapse and the state persists via ui_state.materials_filed_collapsed. */}
      <details
        open={!(uiState.materials_filed_collapsed ?? false)}
        onToggle={(e) =>
          void patchUiState({
            materials_filed_collapsed: !(e.currentTarget as HTMLDetailsElement).open,
          })
        }
        className="mt-6"
      >
        <summary className="cursor-pointer select-none text-sm text-white/35 transition-colors hover:text-white/60">
          Filed data · {items.length} items
        </summary>
        <div className="mt-3">
          <ItemsBoard
            items={items}
            charts={charts}
            fileUrls={fileUrls}
            localPreviews={localPreviews}
            onMove={move}
            onRemove={removeById}
            changesByItemId={visibleChanges}
            confirmingId={confirmingId}
            onKeepMine={onKeepMine}
            onEditValue={onEditValue}
          />
          <div className="mt-6">
            <UploadDrop projectId={id} fileCount={fileCount} onUploaded={addFileItem} />
          </div>
        </div>
      </details>

      <BuildActions
        id={id}
        template={template}
        onTemplate={setTemplate}
        onBuild={() => void runBuild()}
        building={building}
        buildError={buildError}
        itemCount={items.length}
      />

      {/* G1 — authenticated free-form action surface (Piece 2) */}
      <ProjectActionBar projectId={id} />
    </main>
  );
}
