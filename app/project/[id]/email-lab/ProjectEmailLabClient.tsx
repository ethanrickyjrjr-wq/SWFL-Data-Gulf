"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EmailLabGridShell } from "@/components/email-lab/EmailLabGridShell";
import { DEFAULT_H } from "@/components/email-lab/GridCanvas";
import { ensureGridLayouts } from "@/lib/email/doc/grid-layouts";
import { defaultDoc, seedById, SEED_DOCS, type SeedDoc } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";
import { TemplateGallery } from "@/components/email-lab/TemplateGallery";
import { ArcStrip, type ArcSequence } from "@/components/email-lab/ArcStrip";
import { findPlaceholder, type ShowcaseRecipe } from "@/lib/showcase/recipe";
import { planArrival } from "@/lib/lab-entry/arrival";
import { reconcileAddress, addressItem } from "@/lib/lab-entry/address-reconcile";
import { AddressPopup } from "@/components/lab-entry/AddressPopup";
import { projectEmailLabBase } from "@/lib/lab-entry/destination";
import { useAutosave, makeAutosaveScheduler } from "@/lib/lab-entry/use-autosave";
import { useLeaveGuard } from "@/lib/lab-entry/use-leave-guard";
import { useLastDid } from "../LastDidContext";
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
  /** Lifecycle arc (spec 2026-07-05): the armed sequence for the strip, or null. */
  initialSequence?: ArcSequence | null;
  /** ?arcStep= — a save in this lab session records its deliverable on that step. */
  arcStep?: string | null;
  /** Listing projects (subject_address set) get the arm CTA when no arc exists. */
  subjectAddress?: string | null;
}

// Project-scoped Email tool (cockpit D2). The GRID canvas is the ONE authoring
// surface (per-section AI editing); the block canvas was retired 2026-07-07
// (retire-block-shell) — a stored ui_state.email_canvas is now ignored. Auto-fills
// on mount when no saved doc is loaded (?did absent).
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
  initialSequence,
  arcStep,
  subjectAddress,
}: Props) {
  const [savedId, setSavedId] = useState<string | null>(deliverableId ?? null);
  const [saving, setSaving] = useState(false);
  // Local echo of the project's title so a first-save auto-rename (below) shows
  // immediately in the header without a reload.
  const [title, setTitle] = useState(projectTitle);
  // Tells the tab switcher (ToolFrame, a layout sibling) which deliverable to
  // reopen if the user leaves Email and comes back — null outside a project
  // ToolFrame (shouldn't happen here, but this page always renders inside one).
  const lastDid = useLastDid();
  useEffect(() => {
    if (deliverableId) lastDid?.setLastDid(deliverableId);
    // Only needs to run once per mount — deliverableId is this page's initial prop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Lifecycle arc state — the strip mutates via its own API calls and bubbles back.
  const [sequence, setSequence] = useState<ArcSequence | null>(initialSequence ?? null);
  const [arming, setArming] = useState(false);
  // Set when a save is refused because the piece is frozen (armed one-shot).
  const [frozenNote, setFrozenNote] = useState<string | null>(null);
  // The recipe's remaining [[blank]], if any (a hero arrival has none — it slices
  // the address into the prompt before navigating).
  const recipeBlank = initialRecipe ? findPlaceholder(initialRecipe.prompt) : null;
  // THE arrival plan (spec 2026-07-06 §A2) — the ONE decision for doc + popups +
  // auto-build, shared with the standalone lab. insideProject=true, so it never
  // asks "is this for <this project>?". did/seed/zip already produced initialDoc.
  const [plan] = useState(() =>
    planArrival({
      params: { did: deliverableId, recipe: initialRecipe?.prompt ?? null },
      signedIn: true,
      offeredProject: { id: projectId, title: projectTitle },
      insideProject: true,
      subjectAddress: subjectAddress ?? null,
      recipeHasBlank: Boolean(recipeBlank),
      recipeInputKind: recipeBlank ? "address" : null,
      firstRunGalleryEligible: !initialDoc && !hasDeliverables && !initialRecipe,
    }),
  );
  // A recipe arrival opens the BLANK skeleton (never defaultDoc / a fake-fill demo);
  // did/seed/zip already resolved initialDoc server-side.
  const [doc0] = useState<EmailDoc>(() => {
    if (initialDoc) return initialDoc;
    if (plan.doc.kind === "blank")
      return (seedById("skeleton-clean-white") ?? SEED_DOCS[0]).build();
    return defaultDoc();
  });
  // The doc the grid canvas mount was seeded with (updated on gallery pick).
  const [seedDoc, setSeedDoc] = useState<EmailDoc>(doc0);
  // Refs, not state: the shells own the live doc; we only need it at toggle/save time.
  const currentDocRef = useRef<EmailDoc>(doc0);
  const savedDocRef = useRef<EmailDoc>(doc0);
  const dirtyRef = useRef(false);
  // Lane E first-run gallery — pure UI state, never persisted (arrival plan decides).
  const [showGallery, setShowGallery] = useState(() => plan.doc.kind === "gallery");
  // A pick/Start-blank suppresses the shells' one-shot AI auto-build: on the
  // grid canvas that build REPLACES the doc, which would clobber the choice.
  const [galleryPicked, setGalleryPicked] = useState(false);
  // Address popup (spec §C) — a recipe still holding a blank collects it here,
  // pre-filled with what the project believes (subject_address). Anonymous grid
  // never reaches this client.
  const [addressOpen, setAddressOpen] = useState(plan.addressPopup);
  // Differ confirm: the entered address doesn't match the project's belief.
  const [diffAddr, setDiffAddr] = useState<string | null>(null);
  // Remount-build: the grid shell fires ONE build off initialAiPrompt on mount.
  // To build a filled recipe (the address popup's Build), we set buildPrompt and
  // bump buildKey to remount the grid shell with autoGenerate.
  const [buildPrompt, setBuildPrompt] = useState<string | null>(null);
  const [buildKey, setBuildKey] = useState(0);

  // Silent autosave for a SAVED doc (spec §D): debounced ~5s after edits +
  // keepalive flush on exit. The action ref always calls the latest handleSave
  // (which closes over the current savedId). ai_prompt "" never wipes the stored
  // build prompt (materials PATCH only overwrites when a non-empty one is sent).
  const autosaveAction = useRef<() => void>(() => {});
  const autosave = useRef(makeAutosaveScheduler(() => autosaveAction.current()));
  // Cancel any pending debounced save on unmount (fire-and-forget otherwise).
  useEffect(() => () => autosave.current.cancel(), []);
  useAutosave({
    savedId,
    projectId,
    getDoc: () => currentDocRef.current,
    getPrompt: () => "",
    dirtyRef,
  });

  // Leave guard (spec §D): a reactive dirty flag (dirtyRef alone can't drive the
  // guard) + a 5-min save-nudge for a never-saved doc. Cleared on save.
  const [dirty, setDirty] = useState(false);
  const [nudge, setNudge] = useState(false);
  const guard = useLeaveGuard({ dirty });
  useEffect(() => {
    if (!dirty || savedId) return; // nudge only a never-saved, edited doc
    const t = setTimeout(() => setNudge(true), 5 * 60 * 1000);
    return () => clearTimeout(t);
  }, [dirty, savedId]);

  function seedCanvas(doc: EmailDoc) {
    setSeedDoc(doc);
    currentDocRef.current = doc;
    savedDocRef.current = doc;
    dirtyRef.current = false;
    setGalleryPicked(true);
    setShowGallery(false);
  }

  // Fill the recipe's [[blank]] with `value` and remount the grid shell to build
  // it (autoGenerate off buildPrompt). The canvas was the blank skeleton, so a
  // remount loses nothing.
  function fireBuild(value: string) {
    if (!initialRecipe) return;
    const ph = findPlaceholder(initialRecipe.prompt);
    const filled = ph
      ? initialRecipe.prompt.slice(0, ph.start) + value + initialRecipe.prompt.slice(ph.end)
      : initialRecipe.prompt;
    setBuildPrompt(filled);
    setBuildKey((k) => k + 1);
  }

  // Record an address the project didn't already know as a project item, so the
  // build feed + assistant see every address the project has touched (spec §C).
  async function recordAddress(address: string) {
    await fetch(`/api/projects/${projectId}/add-item`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        item: {
          id: crypto.randomUUID(),
          added_at: new Date().toISOString(),
          origin: "web",
          ...addressItem(address),
        },
      }),
    }).catch(() => {});
  }

  // Address popup Build → reconcile against what the project believes. Match /
  // no-belief → build here. Differ → the keep/new confirm.
  function onAddressBuild(value: string) {
    setAddressOpen(false);
    const r = reconcileAddress(value, subjectAddress ?? null);
    if (r.kind === "differ") {
      setDiffAddr(value);
      return;
    }
    fireBuild(value);
  }

  // Differ → Keep: build here AND record the address so the project knows it.
  async function keepDifferingAddress(address: string) {
    setDiffAddr(null);
    await recordAddress(address);
    fireBuild(address);
  }

  // Differ → New: a project titled the address (listing kind), then build there.
  async function newProjectForAddress(address: string) {
    setDiffAddr(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: address, kind: "listing", subject_address: address }),
    });
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    if (!data?.id) return;
    const params = new URLSearchParams();
    if (initialRecipe) {
      params.set("recipe", initialRecipe.prompt);
      if (initialRecipe.needs.length > 0) params.set("recipeNeeds", initialRecipe.needs.join(","));
    }
    params.set("addr", address);
    window.location.href = `${projectEmailLabBase(data.id)}?${params.toString()}`;
  }

  const scopeLabel = scope
    ? `${scope.kind === "zip" ? "ZIP " : ""}${scope.value}`
    : "Southwest Florida";
  const effectiveScope = scope ?? { kind: "region", value: "swfl" };

  function handleDocChange(doc: EmailDoc) {
    currentDocRef.current = doc;
    dirtyRef.current = true;
    setDirty(true);
    if (savedId) autosave.current.schedule(); // debounced silent save (spec §D)
  }
  // Keep the autosave action pointed at the latest handleSave / savedId (synced
  // per commit in an effect — never assign a ref during render).
  useEffect(() => {
    autosaveAction.current = () => {
      if (savedId && dirtyRef.current) void handleSave(currentDocRef.current, "");
    };
  });

  // Lifecycle arc: a save made while ?arcStep= is set records the deliverable on
  // that step (state → built). Best-effort; the strip re-renders from the response.
  function recordArcBuilt(did: string) {
    if (!arcStep) return;
    void fetch(`/api/projects/${projectId}/sequence`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step_key: arcStep, op: "record-built", deliverable_id: did }),
    }).then(async (r) => {
      const j = await r.json().catch(() => null);
      if (r.ok && j?.sequence) setSequence(j.sequence);
    });
  }

  // A project born from the plain "New project" button carries the literal placeholder
  // title forever (nothing else renames it — building an email never touches
  // project.items, so the content-driven deriveProjectName has nothing to read). Fire
  // once, right after the FIRST save creates a deliverable: rename off the same
  // scopeLabel already shown in the header/scope line. Best-effort; a failed PATCH just
  // leaves the placeholder rather than blocking the save that already succeeded.
  function renameIfUntitled() {
    if (title.trim() && title !== "Untitled project") return;
    const next = scope ? `${scopeLabel} Email` : "SWFL Market Email";
    setTitle(next);
    void fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    }).catch(() => {});
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
        const patchRes = await fetch(`/api/projects/${projectId}/materials`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deliverable_id: savedId, doc, ai_prompt: prompt }),
        });
        if (patchRes.status === 423) {
          // Frozen: an armed one-shot references this deliverable (operator copy).
          const j = await patchRes.json().catch(() => null);
          const when = j?.scheduled_for
            ? new Date(j.scheduled_for).toLocaleString("en-US", {
                timeZone: "America/New_York",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }) + " ET"
            : "its send time";
          setFrozenNote(
            `Scheduling locks this email. It can't be edited or sent until ${when} — unlock to change it.`,
          );
          return;
        }
        savedDocRef.current = doc;
        dirtyRef.current = false;
        setDirty(false);
        setNudge(false);
        recordArcBuilt(savedId);
        lastDid?.setLastDid(savedId);
        // Heals older projects that already had a deliverable built before this
        // rename existed (renameIfUntitled no-ops once it's no longer the
        // placeholder, so this costs nothing on every other save).
        renameIfUntitled();
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
        setDirty(false);
        setNudge(false);
        window.history.replaceState({}, "", `/project/${projectId}/email-lab?did=${id}`);
        recordArcBuilt(id);
        renameIfUntitled();
        lastDid?.setLastDid(id);
        return id;
      }
    } finally {
      setSaving(false);
    }
  }

  // Arm the listing campaign (v1-minimal audience/hour pickers; the real
  // audience picker upgrade is a welcome follow-up, not a requirement).
  async function armArc() {
    const audience = window.prompt(
      "Which contact list should this campaign send to? (audience slug)",
      "all-contacts",
    );
    if (!audience) return;
    setArming(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/sequence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audience_slug: audience, send_hour_et: 9 }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.sequence) setSequence(j.sequence);
    } finally {
      setArming(false);
    }
  }

  const headerSlot = (
    <>
      <Link
        href={`/project/${projectId}`}
        className="mb-2 flex items-center gap-1.5 text-[10px] text-white/35 transition-colors hover:text-white/60"
      >
        ← {title}
      </Link>
      <p className="text-sm font-semibold text-white/80">Email</p>
      <p className="mt-0.5 text-[10px] text-gulf-teal">
        {scope ? `Scope: ${scopeLabel}` : "Southwest Florida"} · real data enabled
      </p>
    </>
  );

  // The ONLY on-mount build now is an explicit recipe that's ready to fire: the
  // address popup filled the blank (buildPrompt), or the recipe never had one
  // (hero pre-filled → plan.autoBuildAfterConfirm). The generic "market spotlight"
  // auto-build is GONE for new-build arrivals — it produced the wrong-listing
  // email (spec §A2). A saved/toggled/gallery-picked doc never auto-builds.
  const readyPrompt =
    buildPrompt ?? (plan.autoBuildAfterConfirm && initialRecipe ? initialRecipe.prompt : null);
  const autoBuild = readyPrompt != null && !savedId && !galleryPicked && !zipSeeded;
  const shared = {
    brandTokens: initialTokens,
    initialBranding,
    scope: effectiveScope,
    // A truly blank project (no ready recipe) gets an EMPTY box, not a fake
    // pre-written sentence — the aiPlaceholder below already shows a grey example.
    initialAiPrompt: readyPrompt ?? undefined,
    // The popup owns the blank now — don't also seed the recipe into the Build box.
    initialRecipe: buildPrompt || plan.addressPopup ? null : initialRecipe,
    autoGenerate: autoBuild,
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
      {sequence ? (
        <ArcStrip projectId={projectId} sequence={sequence} onChanged={setSequence} />
      ) : subjectAddress ? (
        <div className="border-b border-white/10 bg-[#081420] px-4 py-2.5">
          <button
            type="button"
            disabled={arming}
            onClick={() => void armArc()}
            className="rounded-full bg-gulf-teal px-3 py-1.5 text-xs font-semibold text-[#070f14] hover:bg-[#17a3b3] disabled:opacity-50"
          >
            {arming ? "Starting…" : "Start the listing campaign"}
          </button>
          <span className="ml-2 text-[10px] text-white/40">
            Five pieces, teaser to sold — you fire each milestone. Every number sourced.
          </span>
        </div>
      ) : null}
      {frozenNote && (
        <div className="border-b border-amber-300/30 bg-amber-300/10 px-4 py-2 text-[11px] text-amber-200">
          {frozenNote}
          <button
            type="button"
            onClick={() => setFrozenNote(null)}
            className="ml-3 text-amber-300/70 hover:text-amber-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {showGallery ? (
        <div className="min-h-[calc(100dvh-3.5rem)]">
          <TemplateGallery
            onPick={(seed: SeedDoc) => seedCanvas(seed.build())}
            onStartBlank={() => seedCanvas(defaultDoc())}
          />
        </div>
      ) : (
        <EmailLabGridShell
          // buildKey bumps when the address popup fires a build → remount so the
          // grid shell's mount-only autoGenerate runs with the filled prompt.
          key={`grid-${buildKey}`}
          initialDoc={ensureGridLayouts(seedDoc, DEFAULT_H)}
          {...shared}
        />
      )}

      {addressOpen && recipeBlank && (
        <AddressPopup
          inputKind={recipeBlank.hint.toLowerCase().includes("address") ? "address" : "area"}
          initialValue={subjectAddress ?? ""}
          onBuild={onAddressBuild}
          onCancel={() => setAddressOpen(false)}
        />
      )}

      {diffAddr && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-white">Different address</h2>
            <p className="mt-1 text-xs text-white/50">
              This project knows {subjectAddress}. Build {diffAddr} as a new project, or keep it in
              this one?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void newProjectForAddress(diffAddr)}
                className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3]"
              >
                New project for {diffAddr}
              </button>
              <button
                type="button"
                onClick={() => void keepDifferingAddress(diffAddr)}
                className="rounded-lg border border-white/15 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Keep in {projectTitle}
              </button>
              <button
                type="button"
                onClick={() => setDiffAddr(null)}
                className="py-1 text-xs text-white/40 hover:text-white/70"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {nudge && !savedId && (
        <div className="fixed bottom-4 left-1/2 z-[55] -translate-x-1/2 rounded-full border border-gulf-teal/30 bg-[#0a1822] px-4 py-2 text-xs text-white/70 shadow-2xl">
          You haven’t saved yet.
          <button
            type="button"
            onClick={() => void handleSave(currentDocRef.current, "")}
            className="ml-2 font-semibold text-gulf-teal hover:text-[#17a3b3]"
          >
            Save now
          </button>
        </div>
      )}

      {guard.active && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-white">Leave without saving?</h2>
            <p className="mt-1 text-xs text-white/50">Your design isn’t saved yet.</p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  await handleSave(currentDocRef.current, "");
                  guard.accept();
                }}
                className="rounded-lg bg-gulf-teal py-2 text-sm font-semibold text-[#070f14] hover:bg-[#17a3b3]"
              >
                Save &amp; leave
              </button>
              <button
                type="button"
                onClick={guard.accept}
                className="rounded-lg border border-white/15 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Leave without saving
              </button>
              <button
                type="button"
                onClick={guard.reject}
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
