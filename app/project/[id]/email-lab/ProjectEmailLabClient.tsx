"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { EmailLabShell } from "@/components/email-lab/EmailLabShell";
import { EmailLabGridShell } from "@/components/email-lab/EmailLabGridShell";
import { DEFAULT_H } from "@/components/email-lab/GridCanvas";
import { ensureGridLayouts } from "@/lib/email/doc/grid-layouts";
import {
  emailCanvasPref,
  nextCanvasAfterChoice,
  type EmailCanvas,
  type SwitchChoice,
} from "@/lib/email/lab/canvas-pref";
import { defaultDoc, type SeedDoc } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";
import { TemplateGallery } from "@/components/email-lab/TemplateGallery";
import type { ShowcaseRecipe } from "@/lib/showcase/recipe";
import type { ProjectUiState } from "../workspace/types";

interface Props {
  projectId: string;
  projectTitle: string;
  /** Project branding mapped to email tokens by the page (PRIMARY, ACCENT,
   *  COMPANY_NAME, AGENT_*, CTA_URL, …). The shell applies these onto the doc's
   *  globalStyle + brand-bearing blocks. */
  initialTokens: Record<string, string>;
  /** The raw project branding blob (snake_case) — seeds the lab's live Brand
   *  panel so editing brand here writes back to the SAME projects.branding. */
  initialBranding?: Record<string, string>;
  /** Area scope + optional subject listing address (address spine) — rides
   *  every build call so the feed pulls the listing's nearby sold comps. */
  scope?: { kind: string; value: string; address?: string } | null;
  initialDoc?: EmailDoc | null;
  /** True when initialDoc is the homepage-map ?zip= prebuild — suppresses the
   *  one-shot AI auto-build (deterministic seed must not be clobbered by an
   *  LLM call on arrival; the AI engages when the visitor edits). */
  zipSeeded?: boolean;
  /** Showcase "Make this →" carry (?recipe=<prompt>&recipeNeeds=<comma
   *  needs>, built server-side in page.tsx from the raw params) — seeds the
   *  grid canvas's AI box with the prompt, blank pre-selected, instead of the
   *  generic auto-build. Grid-only; ignored by the block canvas. */
  initialRecipe?: ShowcaseRecipe | null;
  deliverableId?: string | null;
  /** Lane E gallery: false = no block-canvas deliverable exists yet, so a
   *  doc-less open lands on the template gallery instead of the canvas. */
  hasDeliverables?: boolean;
  /** Re-open the Schedule modal on mount (set when returning from contacts-upload). */
  autoOpenSchedule?: boolean;
  projectPhotos?: { storage_path: string; signedUrl: string; caption?: string }[];
  uiState: ProjectUiState;
}

// Project-scoped Email tool (cockpit D2). GRID is the default canvas (per-section
// AI editing); the block canvas is the fallback via a per-project toggle persisted
// in ui_state.email_canvas. Both canvases operate on the same EmailDoc — the
// toggle re-renders without converting or rewriting the saved doc. Auto-fills on
// mount when no saved doc is loaded (?did absent).
export function ProjectEmailLabClient({
  projectId,
  projectTitle,
  initialTokens,
  initialBranding,
  scope,
  initialDoc,
  zipSeeded,
  initialRecipe,
  deliverableId,
  hasDeliverables,
  autoOpenSchedule,
  projectPhotos,
  uiState,
}: Props) {
  const [savedId, setSavedId] = useState<string | null>(deliverableId ?? null);
  const [saving, setSaving] = useState(false);
  const [doc0] = useState<EmailDoc>(() => initialDoc ?? defaultDoc());
  const [canvas, setCanvas] = useState<EmailCanvas>(() => emailCanvasPref(uiState));
  // The doc the CURRENT canvas mount was seeded with (updated on switch).
  const [seedDoc, setSeedDoc] = useState<EmailDoc>(doc0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Refs, not state: the shells own the live doc; we only need it at toggle/save time.
  const currentDocRef = useRef<EmailDoc>(doc0);
  const savedDocRef = useRef<EmailDoc>(doc0);
  const dirtyRef = useRef(false);
  // autoGenerate fires ONCE per page load — never again after a canvas toggle.
  // State (not a ref): it feeds the autoGenerate prop, i.e. render output.
  const [hasToggled, setHasToggled] = useState(false);
  // Lane E first-run gallery — pure UI state, never persisted. Shows only when
  // the tool opened with no doc (?did/?seed absent) AND nothing was ever built,
  // AND there's no pending recipe to seed the Build box with instead.
  const [showGallery, setShowGallery] = useState(
    () => !initialDoc && !hasDeliverables && !initialRecipe,
  );
  // A pick/Start-blank suppresses the shells' one-shot AI auto-build: on the
  // grid canvas that build REPLACES the doc, which would clobber the choice.
  const [galleryPicked, setGalleryPicked] = useState(false);

  function seedCanvas(doc: EmailDoc) {
    setSeedDoc(doc);
    currentDocRef.current = doc;
    savedDocRef.current = doc;
    dirtyRef.current = false;
    setGalleryPicked(true);
    setShowGallery(false);
  }

  const scopeLabel = scope
    ? `${scope.kind === "zip" ? "ZIP " : ""}${scope.value}`
    : "Southwest Florida";
  const effectiveScope = scope ?? { kind: "region", value: "swfl" };
  const aiPrompt = `Market spotlight email for ${scopeLabel} — fill in realistic market context and agent copy`;

  function handleDocChange(doc: EmailDoc) {
    currentDocRef.current = doc;
    dirtyRef.current = true;
  }

  // `ai_prompt` is persisted as the deliverable's build prompt so a SCHEDULED re-render
  // reproduces this exact email — chart included — with fresh data each occurrence (the
  // chart selector keys off the prompt; without it a scheduled send loses the chart).
  async function handleSave(
    doc: EmailDoc,
    prompt: string,
    campaignKey?: string | null,
  ): Promise<string | void> {
    setSaving(true);
    try {
      if (savedId) {
        // PATCH is doc-only on purpose — a later edit never wipes the
        // campaign provenance set at creation.
        await fetch(`/api/projects/${projectId}/materials`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliverable_id: savedId, doc, ai_prompt: prompt }),
        });
        savedDocRef.current = doc;
        dirtyRef.current = false;
        return savedId;
      }
      const res = await fetch(`/api/projects/${projectId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc,
          ai_prompt: prompt,
          ...(campaignKey ? { campaign_key: campaignKey } : {}),
        }),
      });
      if (res.ok) {
        const { id } = await res.json();
        setSavedId(id);
        savedDocRef.current = doc;
        dirtyRef.current = false;
        window.history.replaceState({}, "", `/project/${projectId}/email-lab?did=${id}`);
        return id;
      }
    } finally {
      setSaving(false);
    }
  }

  function switchTo(next: EmailCanvas, seed: EmailDoc) {
    setHasToggled(true);
    setSeedDoc(seed);
    setCanvas(next);
    currentDocRef.current = seed;
    dirtyRef.current = false;
    // Persist the preference — additive merge of the whole bag (established
    // patchUiState pattern). Best-effort; a miss just means the default next visit.
    void fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ui_state: { ...uiState, email_canvas: next } }),
    });
  }

  function onTogglePress() {
    if (!dirtyRef.current) {
      switchTo(nextCanvasAfterChoice(canvas, "discard"), currentDocRef.current);
      return;
    }
    // In-flight edits: canvases seed history independently, so switching would
    // silently lose them. Explicit dialog — no silent loss, no silent save.
    setConfirmOpen(true);
  }

  async function onChoice(choice: SwitchChoice) {
    setConfirmOpen(false);
    if (choice === "cancel") return;
    const next = nextCanvasAfterChoice(canvas, choice);
    if (choice === "save") {
      await handleSave(currentDocRef.current, "");
      switchTo(next, currentDocRef.current);
    } else {
      switchTo(next, savedDocRef.current); // discard in-flight edits
    }
  }

  const headerSlot = (
    <>
      <Link
        href={`/project/${projectId}`}
        className="mb-2 flex items-center gap-1.5 text-[10px] text-white/35 transition-colors hover:text-white/60"
      >
        ← {projectTitle}
      </Link>
      <p className="text-sm font-semibold text-white/80">Email</p>
      <p className="mt-0.5 text-[10px] text-gulf-teal">
        {scope ? `Scope: ${scopeLabel}` : "Southwest Florida"} · real data enabled
      </p>
      <button
        type="button"
        onClick={onTogglePress}
        className="mt-2 rounded-full border border-white/15 px-2.5 py-1 text-[10px] text-white/50 transition-colors hover:border-gulf-teal/50 hover:text-gulf-teal"
      >
        {canvas === "grid" ? "Switch to block canvas" : "Switch to grid canvas"}
      </button>
    </>
  );

  const shared = {
    brandTokens: initialTokens,
    initialBranding,
    scope: effectiveScope,
    initialAiPrompt: aiPrompt,
    initialRecipe,
    autoGenerate: !savedId && !hasToggled && !galleryPicked && !zipSeeded && !initialRecipe,
    aiPlaceholder: `e.g. Listing announcement for ${scopeLabel} — 3BR condo, pool view, under market…`,
    onSave: handleSave,
    saving,
    autoOpenSchedule,
    deliverableId: savedId,
    projectId,
    projectPhotos,
    onDocChange: handleDocChange,
    headerSlot,
  };

  return (
    <>
      {showGallery ? (
        <div className="min-h-[calc(100dvh-3.5rem)]">
          <TemplateGallery
            onPick={(seed: SeedDoc) => seedCanvas(seed.build())}
            onStartBlank={() => seedCanvas(defaultDoc())}
          />
        </div>
      ) : canvas === "grid" ? (
        <EmailLabGridShell
          key="grid"
          initialDoc={ensureGridLayouts(seedDoc, DEFAULT_H)}
          {...shared}
        />
      ) : (
        <EmailLabShell key="block" initialDoc={seedDoc} {...shared} />
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-white">You have unsaved changes</h2>
            <p className="mt-1 text-xs text-white/50">
              Switching canvases resets the edit history. Save this design first?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void onChoice("save")}
                className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3]"
              >
                Save &amp; switch
              </button>
              <button
                type="button"
                onClick={() => void onChoice("discard")}
                className="rounded-lg border border-white/15 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Switch without saving
              </button>
              <button
                type="button"
                onClick={() => void onChoice("cancel")}
                className="py-1 text-xs text-white/40 hover:text-white/70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
