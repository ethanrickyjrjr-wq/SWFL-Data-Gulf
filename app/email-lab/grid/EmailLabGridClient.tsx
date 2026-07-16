"use client";

import { useRef, useState } from "react";
import { EmailLabGridShell } from "@/components/email-lab/EmailLabGridShell";
import { SendToSelfModal } from "@/components/email-lab/SendToSelfModal";
import { TemplateGallery } from "@/components/email-lab/TemplateGallery";
import { ListingCampaignHero } from "@/components/email-lab/ListingCampaignHero";
import { seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import { DEFAULT_H } from "@/components/email-lab/GridCanvas";
import { ensureGridLayouts } from "@/lib/email/doc/grid-layouts";
import type { EmailDoc } from "@/lib/email/doc/types";
import {
  findPlaceholder,
  inputKindForRecipe,
  type BrandNeed,
  type ShowcaseRecipe,
} from "@/lib/showcase/recipe";
import { isRecipeKey } from "@/lib/deliverable/recipes";
import { openSeed, projectEmailLabBase } from "@/lib/lab-entry/destination";
import { planArrival } from "@/lib/lab-entry/arrival";
import { seedFillPrompt } from "@/lib/lab-entry/seed-fill-prompt";
import { useLeaveGuard } from "@/lib/lab-entry/use-leave-guard";
import { ProjectConfirmPopup } from "@/components/lab-entry/ProjectConfirmPopup";
import { AddressPopup } from "@/components/lab-entry/AddressPopup";

// Standalone PAID-tier grid lab (spec 2026-07-06-lab-entry-root). The signed-in
// visit no longer redirects into projects[0]: this client renders a blank
// skeleton and asks (ProjectConfirmPopup) which project the build belongs to,
// then routes into it carrying the recipe. Anonymous visitors build right here.
// A recipe NEVER seeds a fake-fill demo doc — it opens a blank skeleton.
export function EmailLabGridClient({
  seedDoc,
  zip,
  addr,
  recipe,
  recipeNeeds,
  rkey,
  seedId,
  seedBlankChosen,
  refCode,
  signedIn,
  offeredProject,
}: {
  seedDoc?: EmailDoc | null;
  zip?: string | null;
  addr?: string | null;
  recipe?: string | null;
  recipeNeeds?: string | null;
  /** The recipe KEY (?rkey=) — the deliverable's identity. */
  rkey?: string | null;
  /** ?seed= — a template pick (the /showcase start-from door); runs
   *  capture-or-blank (spec 2026-07-16). */
  seedId?: string | null;
  /** ?blank=1 — the user explicitly chose the raw layout. */
  seedBlankChosen?: boolean;
  refCode?: string | null;
  signedIn: boolean;
  offeredProject: { id: string; title: string } | null;
}) {
  const initialRecipe: ShowcaseRecipe | null = recipe
    ? {
        // The key is what the builder routes on. A door that sent a prompt but no key
        // (an old link) leaves it undefined, and the builder falls back to matching the
        // prompt — so nothing breaks, it just loses the immunity to prompt edits.
        key: isRecipeKey(rkey) ? rkey : undefined,
        prompt: recipe,
        needs: (recipeNeeds ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as BrandNeed[],
      }
    : null;
  const recipeBlank = initialRecipe ? findPlaceholder(initialRecipe.prompt) : null;

  // The picked template (?seed=), resolved once — feeds the arrival plan, the
  // capture popup, and the fill prompt (spec 2026-07-16).
  const arrivalSeed = seedId ? (SEED_DOCS.find((s) => s.id === seedId) ?? null) : null;
  const [plan] = useState(() =>
    planArrival({
      params: { zip, recipe, addr, recipeNeeds, seed: seedId },
      signedIn,
      offeredProject,
      insideProject: false,
      // The standalone lab holds no project belief — address/area seeds always ask.
      subjectAddress: null,
      subjectArea: null,
      recipeHasBlank: Boolean(recipeBlank),
      recipeInputKind: recipeBlank ? "address" : null,
      seedSubject: arrivalSeed?.subject ?? null,
      seedBlankChosen: Boolean(seedBlankChosen),
      // Signed-in + no recipe/zip/seed/did = a plain "New Campaign" open — show the gallery
      // instead of a blank canvas (spec 2026-07-15-gallery-listing-hero-design.md). Anonymous
      // visitors are unchanged — different taste-surface flow (EMAIL_LAB_LANDING).
      firstRunGalleryEligible: signedIn,
    }),
  );

  const showGallery = plan.doc.kind === "gallery";

  // The doc the canvas opens on: the picked template for a seed arrival, blank
  // skeleton for a recipe arrival (never a demo doc), the server ZIP prebuild
  // when present, else the static grid seed.
  const [initialDoc] = useState<EmailDoc>(() => {
    if (plan.doc.kind === "seed")
      return ensureGridLayouts(
        seedDoc ?? (seedById(plan.doc.seedId) ?? SEED_DOCS[0]).build(),
        DEFAULT_H,
      );
    if (plan.doc.kind === "zip" && seedDoc) return seedDoc;
    if (plan.doc.kind === "blank")
      return ensureGridLayouts(
        (seedById("skeleton-clean-white") ?? SEED_DOCS[0]).build(),
        DEFAULT_H,
      );
    return seedDoc ?? (seedById("luxury-market-report") ?? SEED_DOCS[0]).build();
  });

  // Leave guard (spec §D): an anonymous grid visitor's unsaved work shouldn't
  // vanish on an accidental back/close. Dirty once they edit the canvas.
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard({ dirty });

  // Lab-first funnel capture (spec 2026-07-03-lab-first-funnel-landing): the
  // anonymous visitor's exit ramp is "Send this to yourself" → inline OTP →
  // project + one send. The shell owns the live doc; hold it for send time.
  const currentDocRef = useRef<EmailDoc>(initialDoc);
  const [sendOpen, setSendOpen] = useState(false);

  // The gallery case never auto-opens this — the "Building into" line + its own Change link
  // (Step 5 below) replace the old blocking upfront confirm. A signed-in SEED arrival
  // (the /showcase start-from door) confirms the project first, then rides into it
  // carrying the seed — the in-project arrival runs capture-or-blank with save/banking
  // (spec 2026-07-16). Every other arrival keeps the original behavior untouched.
  const signedInSeedHop = plan.doc.kind === "seed" && signedIn && offeredProject != null;
  const [confirmOpen, setConfirmOpen] = useState(
    showGallery ? false : plan.projectConfirm || signedInSeedHop,
  );
  const [targetProject, setTargetProject] = useState(offeredProject);
  // ASK FOR THE ADDRESS, ALWAYS. This used to be `plan.addressPopup && !signedIn` on
  // the theory that a signed-in recipe rides into a project, where the in-project
  // client shows the popup. It only rides if there IS a project: `plan.projectConfirm`
  // is false when offeredProject is null, so a signed-in user with no project got no
  // confirm, no popup, and no build — they picked a showcase recipe and landed on a
  // BLANK CANVAS. The render below already sequences these (`!confirmOpen &&
  // addressOpen`), so the confirm still comes first when there IS a project to offer.
  const [addressOpen, setAddressOpen] = useState(plan.addressPopup);
  const [creating, setCreating] = useState(false);

  // Remount-build: the shell's autoGenerate effect fires ONE build off
  // `initialAiPrompt` on mount. To build a filled prompt (anonymous hero-ready
  // recipe, or the address popup's Build), we bump `buildKey` to remount the
  // shell with the filled prompt + autoGenerate. The canvas was blank, so a
  // remount loses nothing.
  const readyPrompt =
    !signedIn && plan.autoBuildAfterConfirm && initialRecipe ? initialRecipe.prompt : null;
  const [build, setBuild] = useState<{ prompt: string } | null>(
    readyPrompt ? { prompt: readyPrompt } : null,
  );
  const [buildKey, setBuildKey] = useState(0);

  // Route into the chosen project carrying the recipe + the hero's typed address
  // (+ zip) so the in-project build uses the right scope/comps. projectEmailLabBase
  // keeps the path in the root; the query is composed here (no raw lab literal).
  function intoProject(projectId: string) {
    const params = new URLSearchParams();
    if (initialRecipe) {
      params.set("recipe", initialRecipe.prompt);
      // The identity has to survive the hop into the project, or the in-project build
      // routes on prompt text again and we are back to the bug.
      if (initialRecipe.key) params.set("rkey", initialRecipe.key);
      if (initialRecipe.needs.length > 0) params.set("recipeNeeds", initialRecipe.needs.join(","));
    }
    if (addr) params.set("addr", addr);
    if (zip) params.set("zip", zip);
    // A template pick survives the hop — the in-project arrival runs its
    // capture-or-blank (spec 2026-07-16).
    if (seedId) {
      params.set("seed", seedId);
      if (seedBlankChosen) params.set("blank", "1");
    }
    const q = params.toString();
    // assign(), not `location.href =` — same hard navigation (the server must re-read
    // the session cookie), but an assignment to a global trips react-hooks/immutability
    // and would block any commit that touches this file.
    window.location.assign(`${projectEmailLabBase(projectId)}${q ? `?${q}` : ""}`);
  }

  async function createAndEnter(name: string) {
    setCreating(true);
    try {
      // The hero's typed address is the project's subject — persist it on the row
      // (kind:"listing" + subject_address), not just in the arrival URL, or every
      // return visit loses the address lane (comps feed, campaign arm-CTA).
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: name,
          ...(addr ? { kind: "listing", subject_address: addr } : {}),
        }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      if (data?.id) intoProject(data.id);
    } finally {
      setCreating(false);
    }
  }

  // Brand typed into the arrival popup by a signed-out visitor — seeds the remounted
  // shell so the build it fires is SIGNED. Signed-in visitors leave this empty: the
  // shell reads their saved brand from the account on mount.
  const [arrivalBrand, setArrivalBrand] = useState<Record<string, string>>({});

  // Template capture (spec 2026-07-16), local-build path only: anonymous visitors
  // build right here. Signed-in seed arrivals confirm-then-hop instead (above), so
  // their ask never renders on this surface.
  const [seedAsk, setSeedAsk] = useState<
    { inputKind: "address" | "area" } | { choice: true } | null
  >(
    signedInSeedHop
      ? null
      : plan.seedStart?.mode === "ask"
        ? { inputKind: plan.seedStart.inputKind }
        : plan.seedStart?.mode === "choice"
          ? { choice: true }
          : null,
  );

  // Fill the picked template for the captured subject ("" = choice mode's
  // Fill-with-AI → brand + region). No project here, so nothing to bank — the
  // signed-in path hops into a project instead.
  function onSeedSubjectBuild(value: string) {
    if (!arrivalSeed) return;
    setSeedAsk(null);
    const v = value.trim();
    setBuild({ prompt: seedFillPrompt(arrivalSeed, v || null) });
    setBuildKey((k) => k + 1);
  }

  // Fill the recipe's [[blank]] with the popup value, then remount the shell to
  // build it.
  function buildWithAddress(value: string, brandPatch: Record<string, string>) {
    setAddressOpen(false);
    if (!initialRecipe) return;
    if (Object.keys(brandPatch).length > 0) setArrivalBrand(brandPatch);
    const ph = findPlaceholder(initialRecipe.prompt);
    const filled = ph
      ? initialRecipe.prompt.slice(0, ph.start) + value + initialRecipe.prompt.slice(ph.end)
      : initialRecipe.prompt;
    setBuild({ prompt: filled });
    setBuildKey((k) => k + 1);
  }

  // A signed-out visitor has no account brand (that route 401s), so every field the
  // recipe prints is a gap — collect them HERE, in the box that's already open, rather
  // than making them answer a second popup after the remount. Signed-in: leave it to
  // the shell, which reads the real account brand and only asks for what's missing.
  const arrivalGaps = signedIn ? [] : (initialRecipe?.needs ?? []).filter((n) => n !== "photo_url");

  return (
    <>
      {showGallery && targetProject ? (
        <div className="min-h-[calc(100dvh-3.5rem)]">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-end gap-2 px-6 pt-4 text-xs text-white/40">
            Building into: <span className="text-white/70">{targetProject.title}</span>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="text-gulf-teal hover:underline"
            >
              Change
            </button>
          </div>
          <TemplateGallery
            onPick={(seed) => window.location.assign(openSeed(targetProject.id, seed.id))}
            onStartBlank={() =>
              // blank:true — an explicit Start-blank must land the raw layout, not
              // the in-project capture popup (spec 2026-07-16).
              window.location.assign(
                openSeed(targetProject.id, "skeleton-clean-white", { blank: true }),
              )
            }
            heroSlot={<ListingCampaignHero subjectAddress={null} />}
          />
        </div>
      ) : (
        <EmailLabGridShell
          key={buildKey}
          initialDoc={initialDoc}
          initialAiPrompt={build?.prompt}
          autoGenerate={build != null}
          // The filled prompt no longer carries the recipe, so the recipe's brand needs
          // ride separately — without them the mount build can't tell whether the email
          // it's about to author would go out signed by a placeholder.
          autoBuildNeeds={initialRecipe?.needs}
          initialBranding={Object.keys(arrivalBrand).length > 0 ? arrivalBrand : undefined}
          // The popup owns the blank now; don't also seed it into the Build box.
          initialRecipe={build || plan.addressPopup ? null : initialRecipe}
          onDocChange={(d) => {
            currentDocRef.current = d;
            setDirty(true);
          }}
          // Address-first scope: a property email's subject is the ADDRESS (comps
          // ride scope.address, and the feed is NOT narrowed to a ZIP), so ZIP is
          // just one derived layer among many. The email is ZIP-scoped ONLY when the
          // arrival is the actual ZIP door (map/report click) — otherwise a listing
          // never gets hijacked into a ZIP-only feed.
          scope={
            plan.doc.kind === "zip" && zip
              ? { kind: "zip", value: zip, address: addr ?? undefined }
              : addr
                ? { address: addr }
                : undefined
          }
          headerSlot={
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-gulf-teal">Email</span>
              <span className="text-gulf-teal">Lab</span>
              <span className="rounded bg-gulf-teal px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#0a1419]">
                Grid · paid
              </span>
              {!signedIn && (
                <button
                  type="button"
                  onClick={() => setSendOpen(true)}
                  className="btn-gradient ml-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-navy-dark"
                >
                  Send this to yourself
                </button>
              )}
            </span>
          }
        />
      )}
      {!signedIn && (
        <SendToSelfModal
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          getDoc={() => currentDocRef.current}
          zip={zip}
          refCode={refCode}
        />
      )}
      {confirmOpen && (targetProject ?? offeredProject) && (
        <ProjectConfirmPopup
          projectTitle={(targetProject ?? offeredProject)!.title}
          creating={creating}
          onConfirm={() => {
            setConfirmOpen(false);
            if (showGallery && targetProject) return; // "Change" cancel-to-same — stay on the gallery
            intoProject(offeredProject!.id);
          }}
          onNewProject={async (name) => {
            if (showGallery) {
              setCreating(true);
              try {
                const res = await fetch("/api/projects", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ title: name }),
                });
                const data = (await res.json().catch(() => null)) as { id?: string } | null;
                if (data?.id) {
                  setTargetProject({ id: data.id, title: name });
                  setConfirmOpen(false);
                }
              } finally {
                setCreating(false);
              }
              return;
            }
            await createAndEnter(name);
          }}
        />
      )}
      {/* Template capture (spec 2026-07-16): the subject ask or fill-or-blank
          choice for an anonymous template pick. Start blank / Cancel both land
          on the already-loaded raw layout. */}
      {!confirmOpen && seedAsk && arrivalSeed && (
        <AddressPopup
          inputKind={"inputKind" in seedAsk ? seedAsk.inputKind : null}
          choiceMode={"choice" in seedAsk}
          initialValue={addr ?? ""}
          onBuild={(value) => onSeedSubjectBuild(value)}
          onStartBlank={() => setSeedAsk(null)}
          onCancel={() => setSeedAsk(null)}
        />
      )}
      {!confirmOpen && addressOpen && recipeBlank && initialRecipe && (
        <AddressPopup
          // Was hardcoded "address", so a farm/area recipe ("…about [[your city or
          // ZIP]]") demanded a street address. The RECIPE decides now: its subject
          // spine is declared on its key, and a declared fact beats one re-derived
          // from the sentence. Falls back to the blank's hint for keyless legacy links.
          inputKind={inputKindForRecipe(initialRecipe) ?? "address"}
          initialValue={addr ?? ""}
          gaps={arrivalGaps}
          onBuild={buildWithAddress}
          onCancel={() => setAddressOpen(false)}
        />
      )}
      {guard.active && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1822] p-5 shadow-2xl">
            <h2 className="text-sm font-semibold text-white">Leave without saving?</h2>
            <p className="mt-1 text-xs text-white/50">
              Your design will be lost. Send it to yourself first to keep it.
            </p>
            <div className="mt-4 flex flex-col gap-2">
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
                Stay
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
