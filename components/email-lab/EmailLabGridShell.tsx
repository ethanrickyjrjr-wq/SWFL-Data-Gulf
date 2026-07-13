"use client";
// components/email-lab/EmailLabGridShell.tsx
//
// THE NORTH STAR, made real. The PAID-tier grid email shell: a true 2D resizable
// canvas (GridCanvas) with a context-aware AI panel on the right. Click a block →
// the AI + inspector re-target to THAT block ("NOW EDITING"). "Build with AI"
// lays out the whole email (author engine). Width presets (Full/⅔/½/⅓) snap the
// selected block; the 12-col grid is internal plumbing the user never counts.
// Add/duplicate happen straight on the grid; neighbors auto-reflow.
//
// THE ONE EMAIL SURFACE since the 2026-07-07 retire-block-shell pass (the free
// linear shell, EmailLabShell, is deleted; /email-lab redirects here). Owns the
// brand bridge (applyBrand from lib/email/brand/apply-brand.ts, ONE root), seeds,
// blocks, photos, save/send/schedule/PDF, undo-redo, plus the grid + author +
// width presets. Tier differences come from capabilitiesFor(tier), never hardcoded.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CHART_TYPE_OPTIONS, type ChartType } from "@/lib/email/reshape-chart-type";
import { RECIPE_IDS, RECIPE_LABELS } from "@/lib/email/author-recipes";
import type {
  BlockLayout,
  BlockType,
  EmailBlock,
  EmailDoc,
  FontFamily,
} from "@/lib/email/doc/types";
import { EmailDocSchema, mintBlockId } from "@/lib/email/doc/schema";
import { SEED_DOCS, createBlock } from "@/lib/email/doc/default-docs";
import { SEED_PREVIEWS } from "@/lib/email/doc/seed-previews";
import { GRID_COLS, WIDTH_PRESETS, widthPresetLabel } from "@/lib/email/grid-schema";
import {
  initHistory,
  pushDoc,
  patchPresent,
  undo as undoHistory,
  redo as redoHistory,
  canUndo,
  canRedo,
  HISTORY_LIMIT,
  type DocHistory,
} from "@/lib/email/doc/history";
import { GridCanvas, DEFAULT_H } from "./GridCanvas";
import { BlockInspector } from "./BlockInspector";
import { BLOCK_MENU } from "./AddBlockPanel";
import { applyBrand } from "@/lib/email/brand/apply-brand";
import { auditDocLinks, subjectListingUrl, type LinkAsk } from "@/lib/email/link-audit";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import { LinkAskModal } from "./LinkAskModal";
import { ContactPickerModal } from "@/components/contacts/ContactPickerModal";
import { ScheduleSendModal } from "./ScheduleSendModal";
import { ScheduleSocialModal } from "./ScheduleSocialModal";
import { SocialCalendarPanel } from "./SocialCalendarPanel";
import { SocialComposer } from "./social/SocialComposer";
import { useSocialComposer } from "./social/useSocialComposer";
import { SocialElementInspector } from "./social/SocialElementInspector";
import { PhotosPanel } from "./PhotosPanel";
import { MediaPanel } from "./MediaPanel";
import { DatasetBrowser } from "./DatasetBrowser";
import { DatasetChip } from "./DatasetChip";
import { insertDatasetBlocks, shouldAutoRefresh } from "./dataset-browser-core";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/social/formats";
import type { SocialElement } from "@/lib/social/design/types";
import { formatForClipboard } from "@/lib/email/social-calendar/week";
import type { CalendarDay, SocialDraft, WeeklyCalendar } from "@/lib/email/social-calendar/types";
import { capabilitiesFor } from "@/lib/email/lab/capabilities";
import { initialPhoneTab, type PhoneTab } from "@/lib/email/lab/phone-tabs";
import dynamic from "next/dynamic";
const FilerobotModal = dynamic(() => import("./FilerobotModal").then((m) => m.FilerobotModal), {
  ssr: false,
});
import { BrandingBlock } from "@/components/brand/BrandingBlock";
import { AddressPopup } from "@/components/lab-entry/AddressPopup";
import { LoginModal } from "@/components/landing/LoginModal";
import { registerBrandPanel, pulseBrandPanel } from "@/lib/brand/reveal-brand-panel";
import { ExamplesAccordion } from "@/components/showcase/ExamplesAccordion";
import { campaignFollowUpForPrompt, campaignKeyForPrompt } from "@/lib/campaigns";
import {
  brandGaps,
  findPlaceholder,
  inputKindForPrompt,
  typableGaps,
  NEED_LABELS,
  type BrandNeed,
  type ShowcaseRecipe,
} from "@/lib/showcase/recipe";
import { brandingToTokens } from "@/lib/email/brand/branding-to-tokens";
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

const FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: "MODERN_SANS", label: "Modern Sans" },
  { value: "BOOK_SERIF", label: "Book Serif" },
  { value: "GEOMETRIC_SANS", label: "Geometric Sans" },
  { value: "PLAYFAIR_SERIF", label: "Playfair Display" },
  { value: "LATO_SANS", label: "Lato" },
  { value: "MONTSERRAT_SANS", label: "Montserrat" },
];

// Social composer palette + format labels (relocated from SocialComposer's left rail).
const SOCIAL_PALETTE: { type: SocialElement["type"]; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "stat", label: "Stat" },
  { type: "cta", label: "Button + link" },
  { type: "image", label: "Image" },
  { type: "logo", label: "Logo" },
  { type: "chart", label: "Chart" },
];
const SOCIAL_FORMAT_LABEL: Record<SocialFormat, string> = {
  square: "Square 1:1",
  portrait: "Portrait 4:5",
  landscape: "Landscape 1.91:1",
  story: "Story 9:16",
};

// Friendly block-type labels for the "Now editing" header.
const LABELS: Partial<Record<BlockType, string>> = {
  header: "Header",
  hero: "Headline",
  stats: "Stats",
  signal: "Signal",
  text: "Text",
  image: "Image",
  listing: "Listing card",
  "multi-column": "Columns",
  list: "List",
  "agent-card": "Agent card",
  "agent-hero": "Agent banner",
  "social-icons": "Social icons",
  button: "Button",
  divider: "Divider",
  footer: "Footer",
};

// Only the grid seeds (every block carries a `layout`) belong on the grid shell.
const GRID_SEEDS = SEED_DOCS.filter((s) => s.build().blocks.every((b) => b.layout != null));

async function renderDocHtml(doc: EmailDoc): Promise<string> {
  const res = await fetch("/api/email-lab/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc }),
  });
  return (await res.json()).html ?? "";
}

/** y of the first free row under everything (incl. a static footer). */
function nextBottomY(blocks: EmailBlock[]): number {
  let max = 0;
  for (const b of blocks) {
    if (b.layout) max = Math.max(max, b.layout.y + b.layout.h);
  }
  return max;
}

/** A block's layout, or a synthesized full-width one stacked at the bottom. */
function ensureLayout(block: EmailBlock, blocks: EmailBlock[]): BlockLayout {
  return (
    block.layout ?? { x: 0, y: nextBottomY(blocks), w: GRID_COLS, h: DEFAULT_H[block.type] ?? 4 }
  );
}

/** The author engine derives bounds-correct {x,y,w} but a uniform advisory h=1
 *  (email height is content-driven). On the fixed-cell grid that clips to 30px,
 *  so give each ROW a real height (max default of its members) and re-stack y.
 *  Only fires when every block is thin (h≤1) → never touches a real grid doc. */
function normalizeAuthorHeights(doc: EmailDoc): EmailDoc {
  const blocks = doc.blocks;
  if (blocks.length === 0 || !blocks.every((b) => b.layout && b.layout.h <= 1)) return doc;
  const rows = new Map<number, EmailBlock[]>();
  for (const b of blocks) {
    const y = b.layout!.y;
    (rows.get(y) ?? rows.set(y, []).get(y)!).push(b);
  }
  const ys = [...rows.keys()].sort((a, b) => a - b);
  const nextLayout = new Map<string, BlockLayout>();
  let cursorY = 0;
  for (const y of ys) {
    const row = rows.get(y)!;
    const rowH = Math.max(...row.map((b) => DEFAULT_H[b.type] ?? 4));
    for (const b of row) nextLayout.set(b.id, { ...b.layout!, y: cursorY, h: rowH });
    cursorY += rowH;
  }
  return {
    ...doc,
    blocks: blocks.map((b) => ({ ...b, layout: nextLayout.get(b.id) ?? b.layout })),
  };
}

export interface EmailLabGridShellProps {
  initialDoc: EmailDoc;
  brandTokens?: Record<string, string>;
  /** Area scope + optional subject listing address (address spine) — forwarded
   *  verbatim to the build API, where BuildScope.address pulls nearby comps. */
  scope?: { kind?: string; value?: string; address?: string };
  /** Mirrors the block shell's contract: seed the prompt box… */
  initialAiPrompt?: string;
  /** …and fire ONE author build on mount (project auto-fill path). */
  autoGenerate?: boolean;
  /** Brand fields the auto-building recipe PRINTS. Given, the mount build waits for
   *  the account brand and asks for whatever is still missing instead of authoring an
   *  email signed "Company / Tagline". The arrival carries the recipe's `needs` here
   *  because the filled prompt it builds from no longer carries the recipe itself. */
  autoBuildNeeds?: readonly BrandNeed[];
  /** Cross-page "Make this →" handoff — the pill and the /showcase page both
   *  carry a recipe here via `?recipe=<prompt>&recipeNeeds=<comma needs>`
   *  (lib/project/lab-redirect.ts). Seeds the SAME pendingRecipe/gap-guard
   *  path as the in-page Examples accordion's onUseRecipe, so a Build click
   *  still catches the unfilled [[blank]] instead of authoring garbage from
   *  the literal placeholder. */
  initialRecipe?: ShowcaseRecipe | null;
  headerSlot: ReactNode;
  aiPlaceholder?: string;
  /** Save the doc as a deliverable. `campaignKey` = quick-start campaign
   *  provenance (null for organic builds) — stored as
   *  deliverables.campaign_key, read back as the blast `campaign` tag. */
  onSave?: (doc: EmailDoc, aiPrompt: string, campaignKey?: string | null) => Promise<string | void>;
  saving?: boolean;
  autoOpenSchedule?: boolean;
  deliverableId?: string | null;
  projectId?: string;
  projectPhotos?: { storage_path: string; signedUrl: string; caption?: string }[];
  initialBranding?: Record<string, string>;
  /** Cockpit D2: reports every committed/live-edited doc so the canvas toggle
   *  can detect in-flight edits (unsaved-switch dialog). */
  onDocChange?: (doc: EmailDoc) => void;
}

export function EmailLabGridShell({
  initialDoc,
  brandTokens,
  scope,
  initialAiPrompt,
  autoGenerate,
  autoBuildNeeds,
  initialRecipe,
  headerSlot,
  aiPlaceholder = "Describe the whole email — the AI lays it out on the grid with real SWFL numbers…",
  onSave,
  saving,
  autoOpenSchedule,
  deliverableId,
  projectId,
  projectPhotos,
  initialBranding,
  onDocChange,
}: EmailLabGridShellProps) {
  // Tier dial (lib/email/lab/capabilities.ts) — socials etc. are gated on this, never hardcoded.
  const caps = capabilitiesFor("paid");

  // Phone layout (spec 2026-07-05-grid-lab-phone-design): below lg exactly ONE
  // pane shows — assistant ("build") or canvas ("preview") — via the bottom tab
  // bar. Desktop lg+ renders the split-pane and ignores this state. Both panes
  // stay MOUNTED at all sizes (visibility is CSS-only) so pane state survives
  // tab flips and the desktop DOM is unchanged.
  const [phoneTab, setPhoneTab] = useState<PhoneTab>(() =>
    initialPhoneTab({ hasRecipe: initialRecipe != null }),
  );
  // Top-level mode: Email grid ↔ Social composer. The tab itself is gated on the dial.
  const [mode, setMode] = useState<"email" | "social">("email");
  const [history, setHistory] = useState<DocHistory>(() =>
    initHistory(applyBrand(initialDoc, brandTokens)),
  );
  const doc = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState(initialAiPrompt ?? initialRecipe?.prompt ?? "");
  const [chartType, setChartType] = useState<ChartType | "auto">("auto");
  const [aiLoading, setAiLoading] = useState(Boolean(autoGenerate));
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  // The AI's last "what I just did" line, shown in the panel ("Built the whole email…").
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  // Post-build link asks: click-promising slots (labeled button / listing card /
  // link-label) the build left with no destination. One dismissible modal; the
  // send-time fallback ladder is the floor, so skipping is always safe.
  const [linkAsks, setLinkAsks] = useState<LinkAsk[]>([]);
  // "Make this →" recipe flow (spec: 2026-07-03-email-lab-make-this-design.md):
  // the injected showcase recipe rides until its build fires, so the Build click
  // can guard the unfilled [[blank]] and run the brand-gap yes/no.
  const aiBoxRef = useRef<HTMLTextAreaElement>(null);
  const [pendingRecipe, setPendingRecipe] = useState<ShowcaseRecipe | null>(initialRecipe ?? null);
  // THE ACTIVE DELIVERABLE'S IDENTITY. Held separately from `pendingRecipe` because
  // that gets cleared the moment a build starts — but the build still needs to know
  // WHICH deliverable it is. This is what the builder dispatches on, so a user typing
  // their address over the [[blank]] can no longer reroute the build to another recipe.
  const [activeRecipeKey, setActiveRecipeKey] = useState<string | null>(initialRecipe?.key ?? null);
  // Campaign second step — set when the Build box was seeded by a campaign
  // button whose registry entry carries a followUp (matched by seed prompt at
  // seed time, before the user edits the [[blank]]); armed (visible) only after
  // that build succeeds. Session-scoped by design — no persistence.
  const [campaignFollowUp, setCampaignFollowUp] = useState<{
    label: string;
    recipe: ShowcaseRecipe;
  } | null>(null);
  const [followUpArmed, setFollowUpArmed] = useState(false);
  // Campaign provenance for saves — separate from the chip lifecycle on
  // purpose: a dismissed/consumed chip must still save provenance, and the
  // weekly (follow-up) build carries the same key. Matched at seed time via
  // campaignKeyForPrompt (seed AND follow-up prompts); organic seeds clear it.
  // Saved as deliverables.campaign_key → the `campaign` Resend tag at blast.
  const [campaignKey, setCampaignKey] = useState<string | null>(null);
  const [recipeGaps, setRecipeGaps] = useState<BrandNeed[] | null>(null);
  const [recipeHint, setRecipeHint] = useState<string | null>(() => {
    if (!initialRecipe) return null;
    const ph = findPlaceholder(initialRecipe.prompt);
    return ph ? `Type ${ph.hint} over the highlighted part, then hit Build the email.` : null;
  });
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [sendId, setSendId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(Boolean(autoOpenSchedule && deliverableId));
  const [scheduleId, setScheduleId] = useState<string | null>(deliverableId ?? null);
  const [promotingPath, setPromotingPath] = useState<string | null>(null);
  const [photopeaBlockId, setPhotopeaBlockId] = useState<string | null>(null);
  // Social calendar (PAID-ONLY via the dial).
  const [showCalendar, setShowCalendar] = useState(false);
  const [calState, setCalState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [calendar, setCalendar] = useState<WeeklyCalendar | null>(null);
  const [expandedDay, setExpandedDay] = useState<CalendarDay | null>(null);
  // "Schedule this post" → ScheduleSocialModal (writes a social_schedules recipe).
  const [scheduleDraft, setScheduleDraft] = useState<SocialDraft | null>(null);

  // Brand panel (ONE ROOT — same blob the project workspace edits).
  const [branding, setBranding] = useState<Record<string, string>>(initialBranding ?? {});
  const [palettes, setPalettes] = useState<BrandPalette[]>([]);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandSavedMsg, setBrandSavedMsg] = useState<string | null>(null);
  // Signed-out brand save → the account-creating email-code form, then the save
  // completes in place. The palettes computed for the interrupted save ride here so
  // the replay writes exactly what they clicked Save on.
  const [authOpen, setAuthOpen] = useState(false);
  const pendingPalettesRef = useRef<BrandPalette[] | null>(null);
  // The campaign/example start box — non-null while it's asking for the address (and
  // any brand fields the recipe prints) that the click used to swallow silently.
  const [startRecipe, setStartRecipe] = useState<ShowcaseRecipe | null>(null);
  const brandPrefillAttempted = useRef(false);
  // Arrival brand gate: the account brand has been read (or failed to read), and the
  // fields the arriving recipe prints that we still don't have. The mount build waits
  // on the first and is held by the second.
  const [brandLoaded, setBrandLoaded] = useState(false);
  const [autoBuildGaps, setAutoBuildGaps] = useState<BrandNeed[] | null>(null);
  const autoBuildFired = useRef(false);
  // Async callbacks (mount effects) capture a stale `branding` — the ref is what they
  // read so the build signs with the brand that actually landed, not the empty blob
  // the component mounted with.
  const brandingRef = useRef(branding);
  useEffect(() => {
    brandingRef.current = branding;
  }, [branding]);
  // Set whenever the Brand panel edits a field (applyBranding); cleared once that
  // change has actually reached projects.branding. The main Save button used to only
  // persist the doc — a brand edit that was never separately re-saved from inside the
  // Brand panel would silently revert on the next load. See saveBrandIfDirty below.
  const [brandDirty, setBrandDirty] = useState(false);

  // Social composer — ALL social state + actions lifted here so the right "AI assistant"
  // aside drives the center canvas (mode === "social"). Effect-free until an action fires,
  // so it's idle/free in email mode. (Photos-accordion state now lives in PhotosPanel.)
  const social = useSocialComposer({ scope, projectId, branding });

  // Right-panel accordions. Examples LEAD (open, right under the Build box);
  // Brand starts CLOSED and sits low — operator ruling 07/03/2026 ("lead with
  // what they can do"; brand was hogging the rail).
  const [showBrand, setShowBrand] = useState(false);
  const [showDatasets, setShowDatasets] = useState(false);
  // Dataset freshness (zero-cost open: ONE metadata compare, no re-bakes, no
  // tokens; operator rules 07/12/2026). stale=false + currentAsOf=null ⇒ the
  // binding can't refresh (kept values). Auto-refresh arms on the FIRST EDIT.
  const [datasetStaleness, setDatasetStaleness] = useState<
    Record<string, { stale: boolean; currentAsOf: string | null }>
  >({});
  const [datasetBusy, setDatasetBusy] = useState(false);
  const datasetAutoRanRef = useRef(false);
  const initialBoundRef = useRef(initialDoc.blocks.filter((b) => b.binding));
  const [showSeeds, setShowSeeds] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  // Brand-reveal registration — inert today (/email-lab/grid is chrome-free, no
  // account menu renders) but any future in-grid caller of revealBrandPanel()
  // gets open+scroll+pulse for free (spec 2026-07-05-account-quick-access).
  const brandRevealRef = useRef<HTMLDivElement>(null);
  // The panel sits below the fold, past Campaigns/Examples/Start-from. Expanding it
  // without scrolling to it reads as "the button did nothing" — so opening it ALWAYS
  // travels: open + scroll into view + pulse. Every caller goes through here.
  const openBrandPanel = useCallback(() => {
    setShowBrand(true);
    requestAnimationFrame(() => pulseBrandPanel(brandRevealRef.current));
  }, []);
  useEffect(() => registerBrandPanel(openBrandPanel), [openBrandPanel]);

  // history helpers (coalesced field edits → meaningful undo frames)
  const editingRef = useRef(false);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: EmailDoc) {
    editingRef.current = false;
    if (idleRef.current) clearTimeout(idleRef.current);
    setHistory((h) => pushDoc(h, next));
    onDocChange?.(next);
    armDatasetAutoRefresh(next);
  }

  /** Content auto-height correction from the grid canvas — replace present in place,
   *  no undo frame (a line-wrap crossing a row boundary must not pollute undo). */
  function patchPresentDoc(next: EmailDoc) {
    setHistory((h) => patchPresent(h, next));
    onDocChange?.(next);
  }

  function liveEdit(next: EmailDoc) {
    const wasEditing = editingRef.current;
    setHistory((h) =>
      wasEditing
        ? { ...h, present: next }
        : { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] },
    );
    editingRef.current = true;
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      editingRef.current = false;
    }, 500);
    onDocChange?.(next);
    armDatasetAutoRefresh(next);
  }

  // ── AI: Build the whole email (author engine) ───────────────────────────────
  async function runAuthor(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setAiLoading(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/email-lab/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          doc,
          scope,
          build: true,
          chartType: chartType === "auto" ? undefined : chartType,
          recipeId: branding.preferred_recipe || undefined,
          // The DELIVERABLE's identity (distinct from recipeId, which is the prose
          // recipe). Absent for an organically typed prompt — that still falls through
          // to the generic author exactly as before.
          recipeKey: activeRecipeKey || undefined,
        }),
      });
      const data = (await res.json()) as {
        doc?: unknown;
        applied?: boolean;
        message?: string;
        note?: string;
      };
      // Only treat it as a real build when the engine actually authored — the
      // author path echoes the INPUT doc with applied:false on a miss, so guarding
      // on `data.doc` alone would falsely report "built" and re-commit the seed.
      if (data.applied === false) {
        setAiStatus(null);
        setAiMessage(data.message ?? "The AI couldn't build the layout — try rephrasing.");
      } else if (data.doc) {
        const parsed = EmailDocSchema.safeParse(data.doc);
        if (parsed.success) {
          const normalized = normalizeAuthorHeights(applyBrand(parsed.data, brandTokens));
          commit(normalized);
          setSelectedId(null);
          setLinkAsks(auditDocLinks(normalized));
          // A dedicated build path (e.g. Showing Prep) may carry its own explainer —
          // what this doc actually is, since that's not obvious from the prompt alone.
          setAiStatus(
            data.note ??
              `Built the whole email from one line — ${normalized.blocks.length} blocks laid out on the grid.`,
          );
          // Phone: show them what got built (the tab bar is right there to come
          // back). No-op on lg+ where both panes are visible. Failure paths stay
          // on Build so the message is seen.
          setPhoneTab("preview");
          if (campaignFollowUp) setFollowUpArmed(true);
        }
      }
    } catch {
      setAiMessage("Something went wrong — try again.");
    } finally {
      setAiLoading(false);
    }
  }

  // Auto-build on mount (a recipe arrival lands on a generated email, not a blank
  // grid). Two things gate it, and both are the fix for "the email shipped unsigned":
  //
  //   1. It WAITS for the account brand (brandLoaded). It used to race the prefill
  //      and usually won, authoring against branding = {} — so a user whose name was
  //      saved in their account still got "Company / Tagline" in the header.
  //   2. If the recipe PRINTS brand fields we still don't have, it asks first
  //      (autoBuildGaps → the same popup the card path uses) instead of building an
  //      email signed by a placeholder. Asking is the whole point; the build is never
  //      refused (the popup's Build is always enabled in brand-only mode).
  /** The mount build itself — shared by the clean path and the post-popup replay. */
  async function runAutoBuild(brandPatch?: Record<string, string>) {
    const nextBranding = brandPatch
      ? { ...brandingRef.current, ...brandPatch }
      : brandingRef.current;
    setAiLoading(true);
    try {
      const res = await fetch("/api/email-lab/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: (initialAiPrompt ?? "").trim(),
          doc: brandPatch ? applyBrand(doc, brandingToTokens(nextBranding)) : doc,
          scope,
          build: true,
          recipeId: nextBranding.preferred_recipe || undefined,
        }),
      });
      const data = (await res.json()) as { doc?: unknown; applied?: boolean; message?: string };
      if (data.applied === false) {
        setAiMessage(data.message ?? "The AI couldn't build the layout — try rephrasing.");
        return;
      }
      if (data.doc) {
        const parsed = EmailDocSchema.safeParse(data.doc);
        if (parsed.success) {
          // brandTokens (the prop) is undefined on the standalone grid, so falling
          // back to the live brand is what actually signs the built doc.
          const tokens = brandTokens ?? brandingToTokens(nextBranding);
          commit(normalizeAuthorHeights(applyBrand(parsed.data, tokens)));
          setSelectedId(null);
        }
      }
    } catch {
      setAiMessage("Something went wrong — try again.");
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => {
    if (!autoGenerate || !brandLoaded || autoBuildFired.current) return;
    const gaps = typableGaps(autoBuildNeeds ?? [], brandingRef.current);
    if (gaps.length > 0) {
      setAutoBuildGaps(gaps);
      setAiLoading(false); // the spinner must not sit under the popup
      return;
    }
    autoBuildFired.current = true;
    void runAutoBuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandLoaded, autoGenerate]);

  /** Popup submit on the arrival path: bank the brand, then run the held build. */
  function buildAfterBrand(_value: string, brandPatch: Record<string, string>) {
    setAutoBuildGaps(null);
    autoBuildFired.current = true;
    if (Object.keys(brandPatch).length > 0) {
      applyBranding({ ...brandingRef.current, ...brandPatch });
      void fetch("/api/user/brand", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(brandPatch),
      });
    }
    void runAutoBuild(brandPatch);
  }

  // ── AI: Fill content into the current layout (content patch — words/numbers) ──
  async function runFill(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setAiLoading(true);
    setAiMessage(null);
    try {
      const res = await fetch("/api/email-lab/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: trimmed,
          doc,
          scope,
          chartType: chartType === "auto" ? undefined : chartType,
        }),
      });
      const data = (await res.json()) as {
        doc?: unknown;
        applied?: boolean;
        message?: string;
        chartNote?: string;
      };
      if (data.doc) {
        const parsed = EmailDocSchema.safeParse(data.doc);
        if (parsed.success) {
          commit(parsed.data);
          setLinkAsks(auditDocLinks(parsed.data));
        }
      }
      if (data.applied === false && data.message) setAiMessage(data.message);
      else if (data.chartNote) setAiMessage(data.chartNote);
    } catch {
      setAiMessage("Something went wrong — try again.");
    } finally {
      setAiLoading(false);
    }
  }

  // A recipe carried in via `initialRecipe` (cross-page "Make this →" handoff)
  // already seeded aiPrompt/pendingRecipe/recipeHint in the lazy state
  // initializers above — this mount-only effect ONLY focuses + selects the
  // [[blank]] (DOM side effect, no setState, so it's clear of the set-state
  // -in-effect lint even though it depends on a prop).
  useEffect(() => {
    if (!initialRecipe) return;
    const ph = findPlaceholder(initialRecipe.prompt);
    const el = aiBoxRef.current;
    if (el) {
      el.focus();
      if (ph) el.setSelectionRange(ph.start, ph.end);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── "Make this →" / "Start →" (campaign card or example → BUILD) ────────────
  // Used to seed the Build textarea at the top of the rail and select the [[blank]].
  // From a card halfway down a scrolling rail that is invisible: the click wrote
  // words into a box that was off-screen, so it read as doing nothing at all. Now
  // the click opens a box that ASKS for what the recipe is missing, and then builds.
  function handleUseRecipe(recipe: ShowcaseRecipe) {
    // Capture the campaign second step NOW — the prompt is still the registry's
    // verbatim seed; after this the [[blank]] gets replaced.
    const follow = campaignFollowUpForPrompt(recipe.prompt);
    setCampaignFollowUp(follow ? { label: follow.label, recipe: follow.recipe } : null);
    setFollowUpArmed(false);
    setCampaignKey(campaignKeyForPrompt(recipe.prompt));
    setPendingRecipe(recipe);
    // Latch the identity the moment the user picks the recipe — from the showcase
    // card, the examples accordion, a campaign button, or the follow-up chip. Every
    // one of those hands us the SAME registry object now, so they cannot disagree.
    setActiveRecipeKey(recipe.key ?? null);
    setRecipeGaps(null);
    setRecipeHint(null);
    setAiStatus(null);
    setAiMessage(null);
    setAiPrompt(recipe.prompt);

    // Nothing to ask for → don't interrupt. Click, build, done.
    const needsInput =
      findPlaceholder(recipe.prompt) !== null || brandGaps(recipe.needs, branding).length > 0;
    if (!needsInput) {
      setPendingRecipe(null);
      void runAuthor(recipe.prompt);
      return;
    }
    setStartRecipe(recipe);
  }

  /** The one submit out of the popup: bank the brand fields they typed, fill the
   *  [[blank]], and build — no second trip to the rail, no amber nag afterwards. */
  function startFromPopup(filled: string, brandPatch: Record<string, string>) {
    const recipe = startRecipe;
    if (!recipe) return;
    setStartRecipe(null);

    if (Object.keys(brandPatch).length > 0) {
      applyBranding({ ...branding, ...brandPatch });
      // "Type it once — we'll remember" has to be true. Signed-out this 401s and is
      // dropped on purpose: the build must NOT be held hostage to a sign-up, and the
      // Brand panel's Save still offers them the account afterwards.
      void fetch("/api/user/brand", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(brandPatch),
      });
    }

    const ph = findPlaceholder(recipe.prompt);
    const prompt =
      ph && filled
        ? recipe.prompt.slice(0, ph.start) + filled + recipe.prompt.slice(ph.end)
        : recipe.prompt;
    setAiPrompt(prompt);
    setPendingRecipe(null);
    setRecipeGaps(null);
    void runAuthor(prompt);
  }

  /** True (and nags + re-selects) while a recipe's [[blank]] is still unfilled. */
  function placeholderBlocked(): boolean {
    if (!pendingRecipe) return false;
    const ph = findPlaceholder(aiPrompt);
    if (!ph) return false;
    setAiMessage(`Fill in ${ph.hint} first — it's highlighted in the box.`);
    const el = aiBoxRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(ph.start, ph.end);
    }
    return true;
  }

  // Live, not frozen: the nag names what Brand is STILL missing right now. Filling a
  // field in the Brand panel empties this on its own, so the amber box retires itself
  // instead of nagging for info you just typed in.
  const liveGaps = pendingRecipe ? brandGaps(pendingRecipe.needs, branding) : [];

  /** Build-button pre-flight: no placeholder garbage, then the brand-gap yes/no. */
  function buildFromPanel() {
    if (placeholderBlocked()) return;
    if (pendingRecipe && liveGaps.length > 0 && recipeGaps === null) {
      setRecipeGaps(liveGaps);
      return;
    }
    proceedBuild();
  }

  function proceedBuild() {
    setPendingRecipe(null);
    setRecipeGaps(null);
    setRecipeHint(null);
    void runAuthor(aiPrompt);
  }

  // ── per-block AI (re-targets to the selected block) ─────────────────────────
  async function runBlockAi(block: EmailBlock, prompt: string): Promise<EmailBlock | null> {
    const miniDoc = { globalStyle: doc.globalStyle, blocks: [block] };
    try {
      const res = await fetch("/api/email-lab/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, doc: miniDoc, scope }),
      });
      const data = (await res.json()) as { doc?: unknown };
      if (!data.doc) return null;
      const parsed = EmailDocSchema.safeParse(data.doc);
      if (!parsed.success) return null;
      // Keep the block's grid position — per-block AI rewrites content, not layout.
      const next = parsed.data.blocks[0];
      return next ? ({ ...next, layout: block.layout } as EmailBlock) : null;
    } catch {
      return null;
    }
  }

  // ── block ops ───────────────────────────────────────────────────────────────
  const selectedBlock = selectedId ? (doc.blocks.find((b) => b.id === selectedId) ?? null) : null;

  function updateBlock(next: EmailBlock) {
    liveEdit({ ...doc, blocks: doc.blocks.map((b) => (b.id === next.id ? next : b)) });
  }

  function deleteSelected() {
    if (!selectedId || doc.blocks.length <= 1) return;
    commit({ ...doc, blocks: doc.blocks.filter((b) => b.id !== selectedId) });
    setSelectedId(null);
  }

  /** Snap the selected block to a width preset; clamp x so it never overflows. */
  function setSelectedWidth(w: number) {
    if (!selectedBlock) return;
    const cur = ensureLayout(selectedBlock, doc.blocks);
    const x = cur.x + w > GRID_COLS ? Math.max(0, GRID_COLS - w) : cur.x;
    commit({
      ...doc,
      blocks: doc.blocks.map((b) =>
        b.id === selectedBlock.id ? { ...b, layout: { ...cur, x, w } } : b,
      ),
    });
  }

  /** Add a block straight onto the grid (full-width, stacked at the bottom). */
  function addBlockToGrid(type: BlockType) {
    const block = createBlock(type);
    const layout: BlockLayout = {
      x: 0,
      y: nextBottomY(doc.blocks),
      w: GRID_COLS,
      h: DEFAULT_H[type] ?? 4,
    };
    commit({ ...doc, blocks: [...doc.blocks, { ...block, layout } as EmailBlock] });
    setSelectedId(block.id);
    setShowBlocks(false);
  }

  /** Place freshly-materialized dataset blocks under the canvas content —
   *  values baked, bindings remembered; one commit = one undo frame.
   *
   *  BEFORE THE FOOTER, always. A blind append put the data underneath the
   *  unsubscribe line (found on the 07/13/2026 live-verify — the email read
   *  footer-then-content). Same rule the author engine already follows in
   *  lib/email/author-doc.ts: find the footer, splice ahead of it, and only
   *  push to the end when the doc has no footer at all. */
  function addDatasetBlocks(loaded: EmailBlock[]) {
    if (loaded.length === 0) return;
    const blocks = insertDatasetBlocks(doc.blocks, loaded);
    const added = blocks.find((b) => !doc.blocks.some((o) => o.id === b.id));
    commit({ ...doc, blocks });
    if (added) setSelectedId(added.id);
    setShowDatasets(false);
  }

  // ── Dataset freshness + refresh (operator rules 07/12/2026) ────────────────
  // Open = ONE metadata compare (no re-bakes, no tokens). Update chips per
  // block; Update-all in the rail; the per-doc always-fresh dial arms on the
  // FIRST EDIT ACTION (armDatasetAutoRefresh below), never the open.
  useEffect(() => {
    const bound = initialBoundRef.current;
    if (bound.length === 0) return;
    let alive = true;
    void fetch("/api/concoctions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "freshness", blocks: bound }),
    })
      .then((r) => r.json())
      .then(
        (json: { staleness?: Record<string, { stale: boolean; currentAsOf: string | null }> }) => {
          if (alive && json?.staleness) setDatasetStaleness(json.staleness);
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  async function postDatasetAction(
    body: unknown,
  ): Promise<{ block?: EmailBlock; unrefreshable?: boolean } | null> {
    try {
      const res = await fetch("/api/concoctions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return (await res.json().catch(() => null)) as {
        block?: EmailBlock;
        unrefreshable?: boolean;
      } | null;
    } catch {
      return null;
    }
  }

  /** Replace re-baked blocks in ONE commit (one undo frame) + settle their chips. */
  function commitDatasetReplacements(pairs: [string, EmailBlock][], base?: EmailDoc) {
    const d = base ?? doc;
    const map = new Map(pairs);
    commit({ ...d, blocks: d.blocks.map((b) => map.get(b.id) ?? b) });
    setDatasetStaleness((m) => {
      const next = { ...m };
      for (const [id, nb] of pairs)
        next[id] = { stale: false, currentAsOf: nb.binding?.asOf ?? null };
      return next;
    });
  }

  function markUnrefreshable(id: string) {
    setDatasetStaleness((m) => ({ ...m, [id]: { stale: false, currentAsOf: null } }));
  }

  async function refreshDatasetBlock(target: EmailBlock, params?: Record<string, string>) {
    setDatasetBusy(true);
    try {
      const json = await postDatasetAction({
        action: "rebind",
        block: target,
        ...(params ? { params } : {}),
      });
      if (json?.block) commitDatasetReplacements([[target.id, json.block]]);
      else if (json?.unrefreshable) markUnrefreshable(target.id);
    } finally {
      setDatasetBusy(false);
    }
  }

  async function turnDatasetBlock(target: EmailBlock, newType: BlockType) {
    if (newType === target.type) return;
    setDatasetBusy(true);
    try {
      const json = await postDatasetAction({ action: "turn-into", block: target, newType });
      if (json?.block) commitDatasetReplacements([[target.id, json.block]]);
      else if (json?.unrefreshable) markUnrefreshable(target.id);
    } finally {
      setDatasetBusy(false);
    }
  }

  async function updateAllDatasets(base: EmailDoc) {
    const staleIds = new Set(
      Object.entries(datasetStaleness)
        .filter(([, s]) => s.stale)
        .map(([id]) => id),
    );
    const targets = base.blocks.filter((b) => staleIds.has(b.id));
    if (targets.length === 0) return;
    setDatasetBusy(true);
    try {
      const pairs: [string, EmailBlock][] = [];
      for (const t of targets) {
        const json = await postDatasetAction({ action: "rebind", block: t });
        if (json?.block) pairs.push([t.id, json.block]);
        else if (json?.unrefreshable) markUnrefreshable(t.id);
      }
      if (pairs.length) commitDatasetReplacements(pairs, base);
    } finally {
      setDatasetBusy(false);
    }
  }

  /** Flatten the doc's data story into a social PNG and download it. The canvas
   *  keeps its layers — only the exported copy is flattened ("export as"). */
  async function exportDatasetCard(format: string) {
    setDatasetBusy(true);
    try {
      const res = await fetch("/api/concoctions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "social", blocks: doc.blocks, format }),
      });
      const json = (await res.json().catch(() => null)) as { pngBase64?: string } | null;
      if (!json?.pngBase64) return;
      const a = document.createElement("a");
      a.href = `data:image/png;base64,${json.pngBase64}`;
      a.download = `swfl-card-${format}.png`;
      a.click();
    } finally {
      setDatasetBusy(false);
    }
  }

  /** Called from commit()/liveEdit() — the first edit of the session re-bakes
   *  stale bindings when the doc's always-fresh dial is on. Ran-once ref is set
   *  BEFORE the async work so the refresh's own commit can never re-trigger. */
  function armDatasetAutoRefresh(next: EmailDoc) {
    const anyStale = Object.values(datasetStaleness).some((s) => s.stale);
    if (
      !shouldAutoRefresh({
        alwaysFresh: Boolean(next.datasetsAlwaysFresh),
        alreadyRan: datasetAutoRanRef.current,
        anyStale,
      })
    )
      return;
    datasetAutoRanRef.current = true;
    void updateAllDatasets(next);
  }

  /** Duplicate a block — fresh id, content cloned, placed below; movable. */
  function duplicateBlock(id: string) {
    const src = doc.blocks.find((b) => b.id === id);
    if (!src) return;
    const layout: BlockLayout = {
      ...ensureLayout(src, doc.blocks),
      y: nextBottomY(doc.blocks),
      static: undefined,
    };
    const copy = {
      ...src,
      id: mintBlockId(),
      props: structuredClone(src.props),
      layout,
    } as EmailBlock;
    commit({ ...doc, blocks: [...doc.blocks, copy] });
    setSelectedId(copy.id);
  }

  function setGlobalStyle(patch: Partial<EmailDoc["globalStyle"]>) {
    liveEdit({ ...doc, globalStyle: { ...doc.globalStyle, ...patch } });
  }

  // ── Brand panel (one root) ──────────────────────────────────────────────────
  function applyBranding(next: Record<string, string>) {
    setBranding(next);
    setBrandDirty(true);
    liveEdit(applyBrand(doc, brandingToTokens(next)));
  }

  function persistPalettes(next: BrandPalette[]) {
    setPalettes(next);
    void fetch("/api/user/brand", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color_palettes: next }),
    });
  }

  async function saveBrandToProject(): Promise<boolean> {
    if (!projectId) return false;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ branding }),
    });
    if (res.ok) setBrandDirty(false);
    return res.ok;
  }

  // The main toolbar Save/Send/Schedule actions used to save the doc only — a brand
  // edit that was never separately re-saved from inside the Brand panel silently
  // reverted on the next load (the project's stored branding never changed). Project-
  // scoped ONLY: saveBrandGlobal also writes the user's account-wide brand, which would
  // bleed this project's colors into every future project.
  async function saveBrandIfDirty(): Promise<void> {
    if (brandDirty) await saveBrandToProject();
  }

  /** The account-level write. Was `void fetch(...)` — fire-and-forget, so a signed-out
   *  401 hit the floor and the panel still announced "Brand saved" over a save that
   *  never happened. The response is now load-bearing: 401 is a SIGN-UP moment, not a
   *  failure, and the caller turns it into one. */
  async function patchUserBrand(
    nextPalettes: BrandPalette[],
  ): Promise<"ok" | "unauthorized" | "failed"> {
    const res = await fetch("/api/user/brand", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...branding, color_palettes: nextPalettes }),
    });
    if (res.ok) return "ok";
    return res.status === 401 ? "unauthorized" : "failed";
  }

  async function saveBrandGlobal(): Promise<boolean> {
    setBrandSaving(true);
    setBrandSavedMsg(null);
    try {
      const scheme = schemeFromBranding(branding);
      let nextPalettes = palettes;
      if (schemeHasColor(scheme) && !palettes.some((p) => schemesEqual(p.colors, scheme))) {
        nextPalettes = [
          ...palettes,
          { id: newPaletteId(), name: `Palette ${palettes.length + 1}`, colors: scheme },
        ];
        setPalettes(nextPalettes);
      }
      const account = await patchUserBrand(nextPalettes);
      // No account yet → don't fail, and don't lie. Hold the save, sign them up with
      // the email-code form we already ship (signInWithOtp shouldCreateUser), and
      // finish this exact save on the other side. Nothing typed is lost.
      if (account === "unauthorized") {
        pendingPalettesRef.current = nextPalettes;
        setAuthOpen(true);
        return false;
      }
      const ok = account === "ok" && (projectId ? await saveBrandToProject() : true);
      setBrandSavedMsg(ok ? "Brand saved" : "Save failed");
      return ok;
    } finally {
      setBrandSaving(false);
    }
  }

  /** Post-OTP: the session cookie is live and we never left the page, so replay the
   *  save they clicked before we interrupted them. */
  async function finishBrandSaveAfterSignIn(): Promise<void> {
    setAuthOpen(false);
    setBrandSaving(true);
    try {
      const account = await patchUserBrand(pendingPalettesRef.current ?? palettes);
      const ok = account === "ok" && (projectId ? await saveBrandToProject() : true);
      setBrandSavedMsg(ok ? "Saved to your account" : "Save failed");
    } finally {
      pendingPalettesRef.current = null;
      setBrandSaving(false);
    }
  }

  async function saveBrandProjectOnly(): Promise<boolean> {
    setBrandSaving(true);
    setBrandSavedMsg(null);
    try {
      const ok = await saveBrandToProject();
      setBrandSavedMsg(ok ? "Saved to this project" : "Save failed");
      return ok;
    } finally {
      setBrandSaving(false);
    }
  }

  function pickSeed(seedId: string) {
    const seed = SEED_DOCS.find((s) => s.id === seedId);
    if (!seed) return;
    setSelectedId(null);
    setAiStatus(null);
    setPendingRecipe(null);
    setRecipeGaps(null);
    setRecipeHint(null);
    commit(applyBrand(seed.build(), brandTokens));
    setShowSeeds(false);
  }

  // ── Social calendar (PAID-ONLY via the dial) ─────────────────────────────────
  async function generateWeek() {
    setCalState("loading");
    try {
      const res = await fetch("/api/email-lab/social-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = (await res.json()) as { calendar?: WeeklyCalendar };
      if (data.calendar?.posts?.length) {
        setCalendar(data.calendar);
        setCalState("ready");
      } else {
        setCalState("error");
      }
    } catch {
      setCalState("error");
    }
  }

  function copyCaption(draft: SocialDraft) {
    void navigator.clipboard.writeText(formatForClipboard(draft));
  }

  // Social cards are linear (no layout); stack each block full-width so the 2D grid
  // can place it. Brand is applied like every other load. (Native grid composition
  // of social cards is a follow-up — see the grid-lab socials handoff.)
  function loadSocialCard(card: EmailDoc) {
    setSelectedId(null);
    setAiStatus(null);
    let y = 0;
    const blocks = card.blocks.map((b) => {
      const h = DEFAULT_H[b.type] ?? 4;
      const layout: BlockLayout = { x: 0, y, w: GRID_COLS, h };
      y += h;
      return { ...b, layout } as EmailBlock;
    });
    commit(
      applyBrand({ ...card, blocks }, { ...(brandTokens ?? {}), ...brandingToTokens(branding) }),
    );
    setShowCalendar(false);
  }

  // ── Photos bridge ─────────────────────────────────────────────────────────
  function applyPhotoUrl(url: string, caption?: string) {
    // caption rides along for attributed picks (Pexels "Photo by X" credit).
    const extra = caption ? { caption } : {};
    const sel = selectedId ? doc.blocks.find((b) => b.id === selectedId) : null;
    if (sel?.type === "image") {
      commit({
        ...doc,
        blocks: doc.blocks.map((b) =>
          b.id === sel.id ? { ...sel, props: { ...sel.props, url, ...extra } } : b,
        ),
      });
    } else if (sel?.type === "listing") {
      commit({
        ...doc,
        blocks: doc.blocks.map((b) =>
          b.id === sel.id ? { ...sel, props: { ...sel.props, photoUrl: url } } : b,
        ),
      });
    } else {
      const layout: BlockLayout = {
        x: 0,
        y: nextBottomY(doc.blocks),
        w: GRID_COLS,
        h: DEFAULT_H.image,
      };
      const newBlock = {
        id: mintBlockId(),
        type: "image",
        props: { url, ...extra },
        layout,
      } as EmailBlock;
      commit({ ...doc, blocks: [...doc.blocks, newBlock] });
      setSelectedId(newBlock.id);
    }
  }

  async function pickFiledPhoto(storagePath: string) {
    if (!projectId) return;
    setPromotingPath(storagePath);
    try {
      const res = await fetch(`/api/projects/${projectId}/email-media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storage_path: storagePath }),
      });
      if (!res.ok) return;
      const { url } = (await res.json()) as { url: string };
      applyPhotoUrl(url);
    } finally {
      setPromotingPath(null);
    }
  }

  /** THE uploader — one root. Uploads a picked/dropped file and returns the hosted
   *  URL (null on a miss). Two callers: the photos panel (`uploadNewPhoto`, which
   *  applies it to the selection) and an OPEN IMAGE SLOT on the canvas, which commits
   *  the URL to its OWN block (never the selection — an unselected slot would have
   *  appended a stray image block). */
  const uploadPhotoFile = useCallback(
    async (file: File): Promise<string | null> => {
      setPromotingPath("__upload__");
      try {
        const fd = new FormData();
        fd.append("file", file);
        const endpoint = projectId
          ? `/api/projects/${projectId}/email-media`
          : "/api/email-lab/media";
        const res = await fetch(endpoint, { method: "PUT", body: fd });
        if (!res.ok) return null;
        const { url } = (await res.json()) as { url: string };
        return url;
      } catch {
        return null;
      } finally {
        setPromotingPath(null);
      }
    },
    [projectId],
  );

  async function uploadNewPhoto(file: File) {
    const url = await uploadPhotoFile(file);
    if (url) applyPhotoUrl(url);
  }

  // ── export ──────────────────────────────────────────────────────────────────
  async function copyHtml() {
    setExporting(true);
    try {
      const html = await renderDocHtml(doc);
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setExporting(false);
    }
  }

  function printToPdf(html: string) {
    const win = window.open("", "_blank");
    if (!win) return;
    win.onload = () => win.print();
    win.document.write(html);
    win.document.close();
  }

  async function downloadPdf() {
    setExporting(true);
    try {
      try {
        const res = await fetch(`/api/deliverables/${deliverableId ?? "live"}/pdf`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href;
          a.download = "report.pdf";
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(href);
          return;
        }
      } catch {
        // fall through to print
      }
      printToPdf(await renderDocHtml(doc));
    } finally {
      setExporting(false);
    }
  }

  async function openSend() {
    let id = deliverableId ?? null;
    if (onSave) {
      await saveBrandIfDirty();
      const saved = await onSave(doc, aiPrompt, campaignKey);
      if (typeof saved === "string") id = saved;
    }
    if (id) {
      setSendId(id);
      setSendOpen(true);
    }
  }

  async function openSchedule() {
    let id = deliverableId ?? null;
    if (onSave) {
      await saveBrandIfDirty();
      const saved = await onSave(doc, aiPrompt, campaignKey);
      if (typeof saved === "string") id = saved;
    }
    if (id) {
      setScheduleId(id);
      setScheduleOpen(true);
    }
  }

  // Account brand — loaded ON MOUNT, not on the first Brand-accordion open.
  //
  // It used to wait for `showBrand`, which meant a signed-in user with a saved brand
  // carried EMPTY branding for the whole session unless they happened to click
  // "Brand". The auto-build then fired against {} and the email went out signed
  // "Company / Tagline" — the brand they'd already typed was sitting in their account
  // the entire time. "Type it once, we'll remember" has to survive a page load, and
  // the gap-gate below can't ask an honest question about a brand it never read.
  //
  // Signed out this 401s → `{}` → every need reads as a gap, which is correct: they
  // have no account brand, so the popup asks. It never throws.
  useEffect(() => {
    if (brandPrefillAttempted.current) return;
    brandPrefillAttempted.current = true;
    fetch("/api/user/brand")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, unknown>) => {
        setPalettes(sanitizePalettes(data.color_palettes));
        setBranding((prev) => {
          const next = { ...prev };
          // preferred_recipe rides along so a saved account default seeds the
          // recipe picker on NEW projects (only when the project has none yet).
          for (const k of ["agent_name", "photo_url", "license", "brokerage", "preferred_recipe"]) {
            if (!next[k] && typeof data[k] === "string" && data[k]) next[k] = data[k] as string;
          }
          // The old prefill pulled name/photo/license/brokerage and NOTHING else, so
          // business_address — the CAN-SPAM footer line, and a brand `need` the gap
          // gate asks about — could never arrive from the account. It got re-asked on
          // every visit even when it was saved.
          for (const k of ["business_address", "contact_email", "contact_phone", "website_url"]) {
            if (!next[k] && typeof data[k] === "string" && data[k]) next[k] = data[k] as string;
          }
          const scheme = defaultScheme(data);
          PALETTE_SLOT_KEYS.forEach((k, i) => {
            if (!prev[k] && scheme[i]) next[k] = scheme[i];
          });
          return next;
        });
      })
      .catch(() => {})
      // Load-bearing: the auto-build waits on this, so it MUST flip on every path
      // (401, network error, malformed body) or a recipe arrival would hang forever
      // on a spinner instead of building.
      .finally(() => setBrandLoaded(true));
  }, []);

  // Keyboard: ⌘Z / ⌘⇧Z undo-redo, Escape deselects.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Typing in an inline-editable node: let the browser's native text-level
      // undo/Escape work; the doc-level shortcuts stay out of the field.
      if ((e.target as HTMLElement | null)?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        editingRef.current = false;
        if (e.shiftKey) setHistory((h) => redoHistory(h));
        else {
          setHistory((h) => undoHistory(h));
          setSelectedId(null);
        }
      } else if (e.key === "Escape") {
        setSelectedId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Rail auto-scroll: selecting a block brings the "Now editing" editor into
  // view (it sits below the Build-with-AI section and was invisible on a normal
  // screen — the 07/12/2026 "can't change the text" report). DOM-only effect.
  const nowEditingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId) nowEditingRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId]);

  const busy = aiLoading || exporting;
  const selectedWidth = selectedBlock ? (selectedBlock.layout?.w ?? GRID_COLS) : null;
  const photopeaBlock = photopeaBlockId
    ? (doc.blocks.find((b) => b.id === photopeaBlockId) ?? null)
    : null;

  return (
    // Phone-first root (spec 2026-07-05-grid-lab-phone-design + web.dev macro-layouts:
    // single column is the default, the split-pane is APPLIED at lg). lg = 1024px on
    // purpose, not md: at 768px the canvas next to the 380px panel would get ~390px —
    // the shrunk-down-desktop anti-pattern the research forbids.
    <div className="flex h-dvh flex-col overflow-hidden bg-[#e9edf0] text-[#242424] lg:grid lg:grid-cols-[1fr_380px]">
      {/* ══════════ CENTER: top bar + grid canvas (phone: the Preview tab) ══════════ */}
      <main
        className={`${phoneTab === "preview" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex lg:flex-auto`}
      >
        {/* top bar — phone: horizontal overflow-scroll (web.dev overflow pattern)
            instead of clipping or wrapping; lg+: exactly as before */}
        <div className="flex shrink-0 items-center justify-between gap-3 overflow-x-auto border-b border-black bg-[#111418] px-5 py-2.5 lg:overflow-x-visible">
          <div className="flex items-center gap-4">
            {headerSlot}
            {/* Inside the cockpit (projectId set) the Social TAB is the social surface —
                this pre-cockpit inner toggle would be a second Email/Social switcher on
                the same screen (operator: killed 07/03/2026). Standalone lab keeps it. */}
            {caps.socialCalendar && !projectId && (
              <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/5 p-0.5">
                {(["email", "social"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                      mode === m
                        ? "bg-gulf-teal text-[#06231f]"
                        : "text-white/55 hover:text-white/85"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
            <span className="hidden items-center gap-2 text-[11px] lg:inline-flex">
              <span className="rounded bg-gulf-teal px-1.5 py-0.5 font-semibold text-[#0a1419]">
                Auto-reflow on
              </span>
              <span className="text-[#c2902f]">
                click to edit · click an empty cell to add · drag a corner to resize
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-1 flex items-center gap-1">
              <button
                onClick={() => {
                  editingRef.current = false;
                  setHistory((h) => undoHistory(h));
                  setSelectedId(null);
                }}
                disabled={!canUndo(history)}
                className="rounded border border-[#f59e0b]/40 px-2 py-0.5 text-xs text-[#f59e0b] hover:text-[#fbbf24] disabled:opacity-25"
                title="Undo (⌘Z)"
              >
                ↶
              </button>
              <button
                onClick={() => {
                  editingRef.current = false;
                  setHistory((h) => redoHistory(h));
                }}
                disabled={!canRedo(history)}
                className="rounded border border-[#f59e0b]/40 px-2 py-0.5 text-xs text-[#f59e0b] hover:text-[#fbbf24] disabled:opacity-25"
                title="Redo (⌘⇧Z)"
              >
                ↷
              </button>
            </div>
            <button
              onClick={downloadPdf}
              disabled={exporting}
              className="rounded border border-[#f59e0b]/40 px-2.5 py-1 text-xs text-[#f59e0b] transition-colors hover:border-[#f59e0b] hover:text-[#fbbf24] disabled:opacity-30"
            >
              Download PDF
            </button>
            <button
              onClick={copyHtml}
              disabled={exporting}
              className="rounded border border-[#f59e0b]/40 px-2.5 py-1 text-xs text-[#f59e0b] transition-colors hover:border-[#f59e0b] hover:text-[#fbbf24] disabled:opacity-30"
            >
              {copied ? "Copied ✓" : "Copy HTML"}
            </button>
            {mode === "social" && (
              <button
                onClick={() => void social.exportPng()}
                disabled={social.exporting || !social.hasElements}
                className="rounded border border-[#f59e0b]/40 px-2.5 py-1 text-xs text-[#f59e0b] transition-colors hover:border-[#f59e0b] hover:text-[#fbbf24] disabled:opacity-30"
              >
                {social.exporting ? "Exporting…" : "Export PNG"}
              </button>
            )}
            {/* Campaign second step — armed by a successful campaign-seeded build. */}
            {mode === "email" && followUpArmed && campaignFollowUp && (
              <span className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const r = campaignFollowUp.recipe;
                    setFollowUpArmed(false);
                    setCampaignFollowUp(null);
                    handleUseRecipe(r);
                  }}
                  className="rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-xs text-gulf-teal transition-colors hover:bg-gulf-teal/20"
                >
                  Next: {campaignFollowUp.label} →
                </button>
                <button
                  type="button"
                  aria-label="Dismiss follow-up"
                  onClick={() => {
                    setFollowUpArmed(false);
                    setCampaignFollowUp(null);
                  }}
                  className="text-xs text-gray-500 transition-colors hover:text-gray-300"
                >
                  ✕
                </button>
              </span>
            )}
            {mode === "email" &&
              !(
                (doc.blocks.find((b) => b.type === "footer")?.props as { address?: string })
                  ?.address ?? ""
              ).trim() && (
                <span
                  className="max-w-56 text-right text-[10px] leading-tight text-[#f59e0b]/70"
                  title="CAN-SPAM requires a physical postal address (business address, PO box, or mailbox service) in every commercial email. Add your Business Address in Brand — the footer picks it up."
                >
                  Footer needs a postal address (CAN-SPAM) — add it in Brand
                </span>
              )}
            {onSave && (
              <button
                type="button"
                onClick={openSend}
                disabled={busy}
                className="rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-sm text-gulf-teal transition-colors hover:bg-gulf-teal/20 disabled:opacity-40"
              >
                Send to contacts
              </button>
            )}
            {mode === "social" ? (
              <button
                type="button"
                onClick={() => void social.openSchedule()}
                disabled={busy || social.exporting || !social.hasElements}
                className="rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-sm text-gulf-teal transition-colors hover:bg-gulf-teal/20 disabled:opacity-40"
              >
                Schedule post
              </button>
            ) : (
              onSave &&
              projectId && (
                <button
                  type="button"
                  onClick={openSchedule}
                  disabled={busy || saving}
                  className="rounded-lg border border-gulf-teal/30 bg-gulf-teal/10 px-3 py-1.5 text-sm text-gulf-teal transition-colors hover:bg-gulf-teal/20 disabled:opacity-40"
                >
                  Schedule
                </button>
              )
            )}
            {onSave && (
              <button
                type="button"
                onClick={async () => {
                  await saveBrandIfDirty();
                  await onSave(doc, aiPrompt, campaignKey);
                }}
                disabled={saving}
                className="rounded-lg border border-gulf-teal/30 bg-gulf-teal/20 px-3 py-1.5 text-sm text-gulf-teal transition-colors hover:bg-gulf-teal/30 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            )}
          </div>
        </div>

        {/* width-preset bar (selected block) — email-only (operates on selectedBlock).
            Desktop-only furniture: precision width-picking is a fine-pointer job
            (web.dev interaction: pointer:coarse ≠ smaller mouse UI) and the row ate a
            third of the phone screen. Phone keeps tap-select + per-block AI. */}
        {mode === "email" && (
          <div className="hidden shrink-0 items-center gap-3 border-b border-[#dde3e8] bg-white px-5 py-2 text-xs lg:flex">
            <span className="text-xs font-semibold text-[#0a1419]">Selected block width</span>
            <div className="flex items-center gap-1">
              {WIDTH_PRESETS.map((p) => (
                <button
                  key={p.w}
                  type="button"
                  disabled={!selectedBlock}
                  onClick={() => setSelectedWidth(p.w)}
                  className={`min-w-[46px] rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    selectedWidth === p.w
                      ? "border-gulf-teal bg-gulf-teal text-[#06231f]"
                      : "border-gray-400 bg-white text-[#0a1419] hover:border-gray-600 disabled:opacity-40"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <span className="text-xs font-medium text-[#0a1419]/60">
              {selectedBlock
                ? "a fine grid underneath snaps it — you never count columns"
                : "click a block to set its width"}
            </span>
          </div>
        )}

        {/* the real grid (email) ↔ the social composer */}
        <div className="min-h-0 flex-1">
          {mode === "email" ? (
            <GridCanvas
              doc={doc}
              selectedId={selectedId}
              onSelectBlock={setSelectedId}
              onChangeDoc={(next, opts) =>
                opts?.autoHeightOnly ? patchPresentDoc(next) : commit(next)
              }
              onDuplicate={duplicateBlock}
              onAddBlock={() => setShowBlocks(true)}
              onBlockAi={setSelectedId}
              onEditPhoto={(id) => {
                setSelectedId(id);
                setPhotopeaBlockId(id);
              }}
              onUploadPhoto={uploadPhotoFile}
            />
          ) : (
            <SocialComposer composer={social} />
          )}
        </div>
      </main>

      {/* ══════════ RIGHT: AI assistant (full height; phone: the Build tab) ══════════ */}
      <aside
        className={`${phoneTab === "build" ? "flex" : "hidden"} min-h-0 flex-1 flex-col overflow-hidden border-[#0a141a] bg-[#0f1d24] lg:flex lg:flex-auto lg:border-l`}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-white/8 px-4 py-3">
          <span className="text-gulf-teal">✦</span>
          <span className="text-sm font-semibold text-white/85">AI assistant</span>
          {busy && (
            <span className="ml-auto inline-block h-3 w-3 animate-spin rounded-full border-2 border-gulf-teal/30 border-t-gulf-teal" />
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── Build the whole email — leads the panel (operator ruling 07/07/2026:
              AI on top of every lab, Start a Campaign below it) ── */}
          {mode === "email" && (
            <div className="border-b border-white/8 px-4 pb-4 pt-4">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
                Build with AI
              </p>
              <textarea
                ref={aiBoxRef}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) buildFromPanel();
                }}
                placeholder={aiPlaceholder}
                rows={4}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none focus:ring-1 focus:ring-gulf-teal"
              />
              {recipeHint && <p className="mt-1.5 text-[11px] text-gulf-teal/90">{recipeHint}</p>}
              <div className="mb-1.5 mt-2.5 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/35">
                  Chart type
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {([{ type: "auto", label: "Auto" }, ...CHART_TYPE_OPTIONS] as const).map((o) => (
                  <button
                    key={o.type}
                    type="button"
                    onClick={() => setChartType(o.type as ChartType | "auto")}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      chartType === o.type
                        ? "border-gulf-teal bg-gulf-teal/20 text-gulf-teal"
                        : "border-white/10 bg-white/5 text-white/50 hover:text-white/80"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {/* Recipe picker (M3) — pick a research-backed layout recipe, or let the
                  prompt choose. Stored in the brand blob, so it saves with the project. */}
              <div className="mb-1.5 mt-2.5">
                <span className="text-[10px] uppercase tracking-[0.15em] text-white/35">
                  Recipe
                </span>
              </div>
              <select
                value={branding.preferred_recipe ?? ""}
                onChange={(e) => setBranding({ ...branding, preferred_recipe: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/80 focus:border-gulf-teal/50 focus:outline-none"
              >
                <option value="">Auto — choose from my prompt</option>
                {RECIPE_IDS.map((id) => (
                  <option key={id} value={id} className="text-black">
                    {RECIPE_LABELS[id]}
                  </option>
                ))}
              </select>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={buildFromPanel}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] transition-colors hover:bg-[#17a3b3] disabled:opacity-40"
                >
                  {aiLoading ? "Working…" : "Build the email"}
                </button>
                <button
                  onClick={() => {
                    if (!placeholderBlocked()) runFill(aiPrompt);
                  }}
                  disabled={aiLoading || !aiPrompt.trim()}
                  title="Fill content into the current layout (keeps your blocks)"
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 transition-colors hover:text-white/90 disabled:opacity-40"
                >
                  Fill
                </button>
              </div>
              {recipeGaps && liveGaps.length > 0 && (
                <div className="mt-2.5 rounded-md border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-2.5 py-2">
                  <p className="text-[11px] leading-relaxed text-[#fbbf24]">
                    This example uses {liveGaps.map((g) => NEED_LABELS[g]).join(", ")} — Brand
                    doesn&rsquo;t have {liveGaps.length === 1 ? "it" : "them"} yet.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={openBrandPanel}
                      className="flex-1 rounded-md bg-[#f59e0b] px-2 py-1.5 text-[11px] font-semibold text-[#1a1206] transition-opacity hover:opacity-90"
                    >
                      Add my info
                    </button>
                    <button
                      type="button"
                      onClick={proceedBuild}
                      className="flex-1 rounded-md border border-white/15 px-2 py-1.5 text-[11px] text-white/70 transition-colors hover:text-white"
                    >
                      Build anyway
                    </button>
                  </div>
                </div>
              )}
              {aiStatus && (
                <p className="mt-2.5 rounded-md border border-gulf-teal/20 bg-gulf-teal/10 px-2.5 py-2 text-[11px] text-gulf-teal/90">
                  ✓ {aiStatus}
                </p>
              )}
              {aiMessage && <p className="mt-2 text-[11px] text-amber-300/80">{aiMessage}</p>}
            </div>
          )}

          {/* ── Examples — the ONE campaign surface (operator ruling 07/13/2026).
              CampaignQuickStart used to sit right here too, directly above this: both
              are thin reads over the SAME SHOWCASES registry, so the email rail showed
              New Listing / Agent Launch / Newsletter as blurb cards and then showed the
              exact same three showcases again as example cards, back to back, wired to
              the same handleUseRecipe. Two skins, one registry, stacked — indefensible.
              The example cards win: they carry the artwork, so you SEE the thing before
              you start it. The blurb row is gone from this rail (CampaignQuickStart is
              still the right component on the hub and the social cockpit, where no
              examples list renders). Supersedes the 07/07 "Start a Campaign below the
              AI box" placement, which is what created the double. ── */}
          {mode === "email" && (
            <ExamplesAccordion surface="email" defaultOpen onUseRecipe={handleUseRecipe} />
          )}

          {/* ── SOCIAL: Build the post (author) / Fill ── */}
          {mode === "social" && (
            <div className="border-b border-white/8 px-4 pb-4 pt-4">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
                Build with AI
              </p>
              <textarea
                value={social.prompt}
                onChange={(e) => social.setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void social.author();
                }}
                placeholder="Describe the post — the AI picks a layout, writes cited copy, and drops in a photo…"
                rows={4}
                className="w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/80 placeholder:text-white/25 focus:border-gulf-teal/50 focus:outline-none focus:ring-1 focus:ring-gulf-teal"
              />
              <p className="mb-1.5 mt-2.5 text-[10px] uppercase tracking-[0.15em] text-white/35">
                Format
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SOCIAL_FORMATS) as SocialFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => social.setFormat(f)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      social.design.format === f
                        ? "border-gulf-teal bg-gulf-teal/20 text-gulf-teal"
                        : "border-white/10 bg-white/5 text-white/50 hover:text-white/80"
                    }`}
                  >
                    {SOCIAL_FORMAT_LABEL[f]}
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => void social.author()}
                  disabled={social.aiBusy || !social.prompt.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] transition-colors hover:bg-[#17a3b3] disabled:opacity-40"
                >
                  {social.aiBusy ? "Working…" : "Build the post"}
                </button>
                <button
                  onClick={() => void social.fill()}
                  disabled={social.aiBusy}
                  title="Fill cited copy into the current canvas (keeps your elements)"
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 transition-colors hover:text-white/90 disabled:opacity-40"
                >
                  Fill
                </button>
              </div>
              {social.aiStatus && (
                <p className="mt-2.5 rounded-md border border-gulf-teal/20 bg-gulf-teal/10 px-2.5 py-2 text-[11px] text-gulf-teal/90">
                  ✓ {social.aiStatus}
                </p>
              )}
              {social.aiError && (
                <p className="mt-2 text-[11px] text-amber-300/80">{social.aiError}</p>
              )}
              {social.exportError && (
                <p className="mt-2 text-[11px] text-amber-300/80">{social.exportError}</p>
              )}
              {social.mediaUrl && (
                <p className="mt-1 text-[10px] text-gulf-teal/80">Image saved ✓</p>
              )}
            </div>
          )}

          {/* ── SOCIAL: Now editing (the selected canvas element) ── */}
          {mode === "social" && social.selectedElement && (
            <div className="border-b border-white/8 px-4 pb-4 pt-4">
              <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#f59e0b]">
                Now editing
              </p>
              <div className="mt-3 rounded-lg bg-white p-3 text-gray-900">
                <SocialElementInspector
                  element={social.selectedElement}
                  onChange={social.updateElement}
                  onDelete={social.deleteSelected}
                  onClose={() => social.setSelectedId(null)}
                />
              </div>
            </div>
          )}

          {/* ── SOCIAL: Add / size ── */}
          {mode === "social" && (
            <div className="border-b border-white/8 px-4 pb-4 pt-3">
              <p className="mb-2 text-[10px] uppercase tracking-[0.15em] text-white/35">Add</p>
              <div className="grid grid-cols-2 gap-1">
                {SOCIAL_PALETTE.map((p) => (
                  <button
                    key={p.type}
                    type="button"
                    onClick={() =>
                      p.type === "chart" ? social.addChart() : social.addElement(p.type)
                    }
                    className="rounded border border-white/10 px-2 py-1.5 text-[11px] text-white/60 hover:text-white/90"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="mb-1.5 mt-3 text-[10px] uppercase tracking-[0.15em] text-white/35">
                Size
              </p>
              <div className="grid grid-cols-2 gap-1">
                {(Object.keys(SOCIAL_FORMATS) as SocialFormat[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => social.setFormat(f)}
                    className={`rounded border px-2 py-1 text-left text-[11px] ${
                      social.design.format === f
                        ? "border-gulf-teal text-gulf-teal"
                        : "border-white/10 text-white/55"
                    }`}
                  >
                    {SOCIAL_FORMAT_LABEL[f]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── NOW EDITING (re-targets to the selected block) ── */}
          {mode === "email" &&
            (selectedBlock ? (
              <div ref={nowEditingRef} className="border-b border-white/8 px-4 pb-4 pt-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[#f59e0b]">
                  Now editing
                </p>
                <p className="mt-1 text-sm font-semibold text-white/85">
                  {LABELS[selectedBlock.type] ?? selectedBlock.type} ·{" "}
                  <span className="text-gulf-teal">
                    {widthPresetLabel(selectedWidth ?? GRID_COLS)} width
                  </span>
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                  The AI sees the whole layout — every block and where it sits — so it changes this
                  one and reflows the neighbors.
                </p>
                {selectedBlock.binding && (
                  <DatasetChip
                    binding={selectedBlock.binding}
                    blockType={selectedBlock.type}
                    stale={datasetStaleness[selectedBlock.id]?.stale ?? false}
                    unrefreshable={
                      datasetStaleness[selectedBlock.id] !== undefined &&
                      !datasetStaleness[selectedBlock.id].stale &&
                      datasetStaleness[selectedBlock.id].currentAsOf === null
                    }
                    busy={datasetBusy}
                    onUpdate={() => void refreshDatasetBlock(selectedBlock)}
                    onTurnInto={(t) => void turnDatasetBlock(selectedBlock, t)}
                    onRebind={(p) => void refreshDatasetBlock(selectedBlock, p)}
                  />
                )}
                <div className="mt-3 rounded-lg bg-white p-3 text-gray-900">
                  <BlockInspector
                    block={selectedBlock}
                    onChange={updateBlock}
                    onDelete={deleteSelected}
                    onClose={() => setSelectedId(null)}
                    onBlockAi={runBlockAi}
                  />
                </div>
              </div>
            ) : (
              <div className="border-b border-white/8 px-4 pb-4 pt-4">
                <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/35">
                  It re-targets to whatever you click
                </p>
                <ul className="mt-2 space-y-1.5 text-[11px] text-white/45">
                  <li>
                    <span className="text-gulf-teal">Any block</span> — click it, then tweak it here
                    or ask the AI to rewrite it.
                  </li>
                  <li>
                    <span className="text-gulf-teal">Width</span> — Full / ⅔ / ½ / ⅓ snaps the
                    selected block; neighbors reflow.
                  </li>
                  <li>
                    <span className="text-gulf-teal">Add</span> — the “add” tile on the canvas drops
                    a new block on the grid.
                  </li>
                </ul>
              </div>
            ))}

          {/* ── Social Calendar — PAID-ONLY via the capabilities dial ── */}
          {caps.socialCalendar && mode === "social" && (
            <div className="border-b border-white/8 px-4 pb-4 pt-3">
              <button
                onClick={() => setShowCalendar((v) => !v)}
                className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
              >
                <span>Social calendar</span>
                <span className={`transition-transform ${showCalendar ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
              {showCalendar && (
                <SocialCalendarPanel
                  state={calState}
                  calendar={calendar}
                  expandedDay={expandedDay}
                  onGenerate={generateWeek}
                  onToggleDay={(d) => setExpandedDay((cur) => (cur === d ? null : d))}
                  onCopyCaption={copyCaption}
                  onLoadCard={loadSocialCard}
                  onSchedule={setScheduleDraft}
                />
              )}
            </div>
          )}

          {/* ── Start from (grid seeds) ── */}
          {mode === "email" && (
            <div className="border-b border-white/8 px-4 pb-4 pt-3">
              <button
                onClick={() => setShowSeeds((v) => !v)}
                className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
              >
                <span>Start from a layout</span>
                <span className={`transition-transform ${showSeeds ? "rotate-180" : ""}`}>▾</span>
              </button>
              {showSeeds && (
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {/* Filled-preview thumbnails (committed captures — the same
                      tiles /showcase browses); picking still commits the honest
                      slot-rule skeleton via pickSeed → seed.build(). */}
                  {GRID_SEEDS.map((s) => {
                    const thumb = SEED_PREVIEWS.find((p) => p.id === s.id)?.image;
                    return (
                      <button
                        key={s.id}
                        onClick={() => pickSeed(s.id)}
                        title={s.description}
                        className="overflow-hidden rounded-md border border-white/8 bg-white/4 text-left transition-colors hover:border-white/25 hover:bg-white/8"
                      >
                        {thumb && (
                          // eslint-disable-next-line @next/next/no-img-element -- committed static capture, top crop
                          <img
                            src={thumb}
                            alt=""
                            className="h-24 w-full object-cover object-top"
                            loading="lazy"
                          />
                        )}
                        <span className="block px-2 py-1.5 text-[10px] font-medium leading-tight text-white/75">
                          {s.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Add Blocks ── */}
          {mode === "email" && (
            <div className="border-b border-white/8 px-4 pb-4 pt-3">
              <button
                onClick={() => setShowBlocks((v) => !v)}
                className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
              >
                <span>Add a block</span>
                <span className={`transition-transform ${showBlocks ? "rotate-180" : ""}`}>▾</span>
              </button>
              {showBlocks && (
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {BLOCK_MENU.map((b) => (
                    <button
                      key={b.type}
                      type="button"
                      onClick={() => addBlockToGrid(b.type)}
                      className="flex items-center gap-2 rounded-md border border-white/8 bg-white/4 px-2.5 py-2 text-left transition-colors hover:bg-white/8"
                    >
                      <span className="w-4 text-center text-sm leading-none text-white/40">
                        {b.icon}
                      </span>
                      <span className="text-[11px] font-medium text-white/55">{b.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Datasets — data-bound blocks from the curated registry (paid dial) ── */}
          {mode === "email" && caps.datasets && (
            <div className="border-b border-white/8 px-4 pb-4 pt-3">
              <button
                onClick={() => setShowDatasets((v) => !v)}
                className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
              >
                <span>Datasets</span>
                <span className={`transition-transform ${showDatasets ? "rotate-180" : ""}`}>
                  ▾
                </span>
              </button>
              {showDatasets && (
                <>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 text-[10px] text-white/45">
                      <input
                        type="checkbox"
                        checked={Boolean(doc.datasetsAlwaysFresh)}
                        onChange={(e) => commit({ ...doc, datasetsAlwaysFresh: e.target.checked })}
                      />
                      Keep always fresh
                    </label>
                    {Object.values(datasetStaleness).filter((s) => s.stale).length > 0 && (
                      <button
                        type="button"
                        disabled={datasetBusy}
                        onClick={() => void updateAllDatasets(doc)}
                        className="rounded bg-[#f59e0b] px-2 py-1 text-[10px] font-semibold text-[#0a1419] disabled:opacity-40"
                      >
                        Update all ({Object.values(datasetStaleness).filter((s) => s.stale).length})
                      </button>
                    )}
                  </div>
                  <DatasetBrowser onLoad={addDatasetBlocks} />
                  {doc.blocks.some((b) => b.binding) && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <select
                        id="dataset-card-format"
                        defaultValue="square"
                        className="min-w-0 flex-1 rounded border border-white/10 bg-[#0a1822] px-1.5 py-1 text-[10px] text-white/60"
                        aria-label="Card size"
                      >
                        {(Object.keys(SOCIAL_FORMATS) as SocialFormat[]).map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={datasetBusy}
                        onClick={() => {
                          const sel = document.getElementById(
                            "dataset-card-format",
                          ) as HTMLSelectElement | null;
                          void exportDatasetCard(sel?.value ?? "square");
                        }}
                        className="rounded bg-gulf-teal/80 px-2 py-1 text-[10px] font-semibold text-[#0a1419] disabled:opacity-40"
                      >
                        Export card (PNG)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Brand — closed by default, below the action sections (operator
              ruling 07/03/2026: it was hogging the rail). The gap yes/no's
              "Add my info" pops it open. ── */}
          <div className="border-b border-white/8 px-4 pb-4 pt-3" ref={brandRevealRef}>
            <button
              onClick={() => setShowBrand((v) => !v)}
              className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
            >
              <span>Brand</span>
              <span className={`transition-transform ${showBrand ? "rotate-180" : ""}`}>▾</span>
            </button>
            {showBrand && (
              <div className="mt-3">
                <BrandingBlock
                  branding={branding}
                  onChange={applyBranding}
                  palettes={palettes}
                  onPalettesChange={persistPalettes}
                  onSaveGlobal={saveBrandGlobal}
                  onSaveProjectOnly={projectId ? saveBrandProjectOnly : undefined}
                  saving={brandSaving}
                  savedMsg={brandSavedMsg}
                  onClose={() => setShowBrand(false)}
                  headerColorClass="text-[#f59e0b]"
                />
                <label className="mt-3 block border-t border-white/10 pt-3">
                  <span className="mb-1 block text-[10px] text-white/40">Font</span>
                  <select
                    value={doc.globalStyle.fontFamily}
                    onChange={(e) => setGlobalStyle({ fontFamily: e.target.value as FontFamily })}
                    className="w-full rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white/75 focus:outline-none focus:ring-1 focus:ring-gulf-teal"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value} className="text-black">
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>

          {/* ── Photos (shared component; the target is mode-aware) ── */}
          <PhotosPanel
            projectPhotos={projectPhotos}
            promotingPath={mode === "social" ? social.promotingPath : promotingPath}
            onApplyUrl={mode === "social" ? social.applyPhotoUrl : applyPhotoUrl}
            onPickFiled={mode === "social" ? social.pickFiledPhoto : pickFiledPhoto}
            onUploadFile={mode === "social" ? social.uploadNewPhoto : uploadNewPhoto}
          />

          {/* ── Media library (uploads + Pexels; email canvas target) ── */}
          {mode === "email" && <MediaPanel onApply={applyPhotoUrl} />}
        </div>
      </aside>

      {/* ══════════ PHONE ONLY: Build / Preview tab bar (spec 2026-07-05-grid-lab-phone-design).
          Text-labeled (NN/g tabs-used-right; no mystery-meat icons), 48px targets
          (web.dev interaction: coarse pointers), thumb zone, safe-area padded
          (env() is 0 without viewport-fit=cover — defensive, not load-bearing). ══════════ */}
      <div
        role="tablist"
        aria-label="Lab view"
        className="flex shrink-0 border-t border-black bg-[#111418] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {(
          [
            { tab: "build" as const, label: "✦ Build" },
            { tab: "preview" as const, label: "Preview" },
          ] as const
        ).map(({ tab, label }) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={phoneTab === tab}
            onClick={() => setPhoneTab(tab)}
            className={`h-12 flex-1 text-sm font-semibold transition-colors ${
              phoneTab === tab ? "bg-gulf-teal text-[#06231f]" : "text-white/60 hover:text-white/85"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Arrival brand gate — the recipe came in already filled (nothing to ask about
          the PLACE), but it prints brand fields the account doesn't have. Ask, then run
          the held build. Without this the email auto-built signed "Company / Tagline". */}
      {autoBuildGaps && autoBuildGaps.length > 0 && (
        <AddressPopup
          inputKind={null}
          initialValue=""
          gaps={autoBuildGaps}
          onCancel={() => {
            // Cancel = build it anyway. A build is never refused (RULE 0.7); they just
            // get the placeholder signature they chose.
            setAutoBuildGaps(null);
            autoBuildFired.current = true;
            void runAutoBuild();
          }}
          onBuild={buildAfterBrand}
        />
      )}

      {/* Click a campaign or an example → the SAME popup the arrival door already used:
          ask for the address/area (and any brand field the email prints), then BUILD.
          Replaces the old silent seed of a Build box that was scrolled off-screen. */}
      {startRecipe && (
        <AddressPopup
          inputKind={inputKindForPrompt(startRecipe.prompt)}
          initialValue=""
          gaps={typableGaps(startRecipe.needs, branding)}
          onCancel={() => {
            setStartRecipe(null);
            setPendingRecipe(null);
          }}
          onBuild={startFromPopup}
        />
      )}

      {/* Signed-out "Save to my account" → the same email-code form the site already
          uses to sign people up. It finishes in place (onSignedIn) rather than
          navigating, so the email on the canvas survives the sign-up. */}
      <LoginModal
        open={authOpen}
        onClose={() => {
          setAuthOpen(false);
          pendingPalettesRef.current = null;
          setBrandSavedMsg("Not saved — you need an account to keep your brand.");
        }}
        onSignedIn={finishBrandSaveAfterSignIn}
        title="Save your brand"
        blurb="Enter your email and we’ll send you a code. Your brand saves to your account so you only type it once — your email stays right where it is."
      />

      {sendOpen && sendId && (
        <ContactPickerModal
          deliverableId={sendId}
          isBlockCanvas
          onClose={() => setSendOpen(false)}
          subjectVariants={doc.subjectVariants}
          ctaVariants={doc.ctaVariants}
        />
      )}

      {scheduleOpen && scheduleId && projectId && (
        <ScheduleSendModal
          deliverableId={scheduleId}
          projectId={projectId}
          scopeKind={scope?.kind ?? null}
          scopeValue={scope?.value ?? null}
          onClose={() => setScheduleOpen(false)}
        />
      )}

      {caps.socialCalendar && scheduleDraft && (
        <ScheduleSocialModal
          draft={scheduleDraft}
          projectId={projectId}
          scopeKind={scope?.kind ?? null}
          scopeValue={scope?.value ?? null}
          onClose={() => setScheduleDraft(null)}
        />
      )}

      {social.scheduleOpen && (
        <ScheduleSocialModal
          draft={
            {
              day: "mon",
              theme: "composed",
              caption: social.caption,
              hashtags: social.hashtags,
              card: { globalStyle: {}, blocks: [] },
              variants: social.variants,
            } as unknown as SocialDraft
          }
          projectId={projectId}
          scopeKind={scope?.kind ?? null}
          scopeValue={scope?.value ?? null}
          mediaUrl={social.mediaUrl}
          design={social.design}
          onClose={() => social.setScheduleOpen(false)}
        />
      )}

      {photopeaBlock && (
        <FilerobotModal
          block={photopeaBlock}
          onSave={(blockId, url) => {
            commit({
              ...doc,
              blocks: doc.blocks.map((b) => {
                if (b.id !== blockId) return b;
                if (b.type === "image") return { ...b, props: { ...b.props, url } };
                if (b.type === "listing") return { ...b, props: { ...b.props, photoUrl: url } };
                return b;
              }),
            });
            setPhotopeaBlockId(null);
          }}
          onClose={() => setPhotopeaBlockId(null)}
        />
      )}

      {linkAsks.length > 0 && (
        <LinkAskModal
          asks={linkAsks}
          suggestions={[
            ...(() => {
              const l = subjectListingUrl(doc);
              return l ? [{ label: "The listing page", url: l }] : [];
            })(),
            ...(() => {
              const w = brandWebsiteUrl(doc);
              return w ? [{ label: "Your website", url: w }] : [];
            })(),
            ...(() => {
              const f = doc.blocks.find((b) => b.type === "footer");
              const email = f && f.type === "footer" ? f.props.email : undefined;
              return email ? [{ label: "Reply by email", url: `mailto:${email}` }] : [];
            })(),
          ]}
          onApply={(answers) => {
            // ONE commit for all answers — sequential per-block writes would each
            // clone the same pre-modal doc and lose every write but the last.
            const blocks = doc.blocks.map((b) => {
              const mine = answers.filter((a) => a.ask.blockId === b.id);
              if (mine.length === 0) return b;
              if (b.type === "button") {
                return { ...b, props: { ...b.props, url: mine[0].url } };
              }
              if (b.type === "listing") {
                return { ...b, props: { ...b.props, linkUrl: mine[0].url } };
              }
              if (b.type === "multi-column") {
                const byCol = new Map(mine.map((a) => [a.ask.columnIndex, a.url]));
                const columns = (b.props.columns ?? []).map((c, i) =>
                  byCol.has(i) ? { ...c, linkUrl: byCol.get(i) } : c,
                );
                return { ...b, props: { ...b.props, columns } };
              }
              return b;
            });
            commit({ ...doc, blocks });
          }}
          onClose={() => setLinkAsks([])}
        />
      )}
    </div>
  );
}
