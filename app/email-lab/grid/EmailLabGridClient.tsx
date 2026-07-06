"use client";

import { useState } from "react";
import { EmailLabGridShell } from "@/components/email-lab/EmailLabGridShell";
import { seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import { DEFAULT_H } from "@/components/email-lab/GridCanvas";
import { ensureGridLayouts } from "@/lib/email/doc/grid-layouts";
import type { EmailDoc } from "@/lib/email/doc/types";
import { findPlaceholder, type BrandNeed, type ShowcaseRecipe } from "@/lib/showcase/recipe";
import { projectEmailLabBase } from "@/lib/lab-entry/destination";
import { planArrival } from "@/lib/lab-entry/arrival";
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
  signedIn,
  offeredProject,
}: {
  seedDoc?: EmailDoc | null;
  zip?: string | null;
  addr?: string | null;
  recipe?: string | null;
  recipeNeeds?: string | null;
  signedIn: boolean;
  offeredProject: { id: string; title: string } | null;
}) {
  const initialRecipe: ShowcaseRecipe | null = recipe
    ? {
        prompt: recipe,
        needs: (recipeNeeds ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as BrandNeed[],
      }
    : null;
  const recipeBlank = initialRecipe ? findPlaceholder(initialRecipe.prompt) : null;

  const [plan] = useState(() =>
    planArrival({
      params: { zip, recipe, addr, recipeNeeds },
      signedIn,
      offeredProject,
      insideProject: false,
      subjectAddress: null,
      recipeHasBlank: Boolean(recipeBlank),
      recipeInputKind: recipeBlank ? "address" : null,
      firstRunGalleryEligible: false,
    }),
  );

  // The doc the canvas opens on: blank skeleton for a recipe arrival (never a
  // demo doc), the server ZIP prebuild when present, else the static grid seed.
  const [initialDoc] = useState<EmailDoc>(() => {
    if (plan.doc.kind === "zip" && seedDoc) return seedDoc;
    if (plan.doc.kind === "blank")
      return ensureGridLayouts(
        (seedById("skeleton-clean-white") ?? SEED_DOCS[0]).build(),
        DEFAULT_H,
      );
    return seedDoc ?? (seedById("luxury-market-report") ?? SEED_DOCS[0]).build();
  });

  const [confirmOpen, setConfirmOpen] = useState(plan.projectConfirm);
  // The address popup only matters for the ANONYMOUS recipe arrival — a signed-in
  // recipe rides into a project, where the in-project client shows the popup.
  const [addressOpen, setAddressOpen] = useState(plan.addressPopup && !signedIn);
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
      if (initialRecipe.needs.length > 0) params.set("recipeNeeds", initialRecipe.needs.join(","));
    }
    if (addr) params.set("addr", addr);
    if (zip) params.set("zip", zip);
    const q = params.toString();
    window.location.href = `${projectEmailLabBase(projectId)}${q ? `?${q}` : ""}`;
  }

  async function createAndEnter(name: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: name }),
      });
      const data = (await res.json().catch(() => null)) as { id?: string } | null;
      if (data?.id) intoProject(data.id);
    } finally {
      setCreating(false);
    }
  }

  // Fill the recipe's [[blank]] with the popup value, then remount the shell to
  // build it (anonymous only — a signed-in recipe never reaches this popup).
  function buildWithAddress(value: string) {
    setAddressOpen(false);
    if (!initialRecipe) return;
    const ph = findPlaceholder(initialRecipe.prompt);
    const filled = ph
      ? initialRecipe.prompt.slice(0, ph.start) + value + initialRecipe.prompt.slice(ph.end)
      : initialRecipe.prompt;
    setBuild({ prompt: filled });
    setBuildKey((k) => k + 1);
  }

  return (
    <>
      <EmailLabGridShell
        key={buildKey}
        initialDoc={initialDoc}
        initialAiPrompt={build?.prompt}
        autoGenerate={build != null}
        // The popup owns the blank now; don't also seed it into the Build box.
        initialRecipe={build || plan.addressPopup ? null : initialRecipe}
        scope={zip ? { kind: "zip", value: zip, address: addr ?? undefined } : undefined}
        headerSlot={
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-gulf-teal">Email</span>
            <span className="text-gulf-teal">Lab</span>
            <span className="rounded bg-gulf-teal px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#0a1419]">
              Grid · paid
            </span>
          </span>
        }
      />
      {confirmOpen && offeredProject && (
        <ProjectConfirmPopup
          projectTitle={offeredProject.title}
          creating={creating}
          onConfirm={() => {
            setConfirmOpen(false);
            intoProject(offeredProject.id);
          }}
          onNewProject={createAndEnter}
        />
      )}
      {!confirmOpen && addressOpen && recipeBlank && (
        <AddressPopup
          inputKind="address"
          initialValue={addr ?? ""}
          onBuild={buildWithAddress}
          onCancel={() => setAddressOpen(false)}
        />
      )}
    </>
  );
}
