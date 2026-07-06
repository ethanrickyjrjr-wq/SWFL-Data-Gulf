// lib/lab-entry/arrival.ts
//
// THE ONE arrival controller (pure). Both lab clients decide doc + popups +
// auto-build here so every door arrives identically (spec 2026-07-06 §A2). The
// disease this cures: recipe clicks fake-filled a demo doc ($485K/34 DOM), the
// signed-in redirect auto-picked projects[0], and a generic on-mount auto-build
// produced wrong-listing emails. New-build arrivals now get a BLANK skeleton and
// the generic auto-build (legacyAutoGenerate) is dead.

export interface ArrivalInput {
  params: {
    did?: string | null;
    seed?: string | null;
    zip?: string | null;
    recipe?: string | null;
    recipeNeeds?: string | null;
    addr?: string | null;
  };
  signedIn: boolean;
  offeredProject: { id: string; title: string } | null;
  insideProject: boolean;
  subjectAddress: string | null;
  recipeHasBlank: boolean;
  recipeInputKind: "address" | "area" | null;
  firstRunGalleryEligible: boolean;
}

export type DocChoice =
  | { kind: "load-did"; did: string }
  | { kind: "seed"; seedId: string }
  | { kind: "zip"; zip: string }
  | { kind: "blank" }
  | { kind: "gallery" };

export interface ArrivalPlan {
  doc: DocChoice;
  projectConfirm: boolean;
  addressPopup: boolean;
  autoBuildAfterConfirm: boolean;
  legacyAutoGenerate: false;
}

const trimmed = (s?: string | null) => (s ?? "").trim();

export function planArrival(input: ArrivalInput): ArrivalPlan {
  const { params } = input;
  const dead = { autoBuildAfterConfirm: false, legacyAutoGenerate: false as const };

  // Open-existing — never any new-build flow.
  if (trimmed(params.did)) {
    return {
      doc: { kind: "load-did", did: params.did! },
      projectConfirm: false,
      addressPopup: false,
      ...dead,
    };
  }

  // Explicit template pick — the user chose this seed; no popups.
  if (trimmed(params.seed)) {
    return {
      doc: { kind: "seed", seedId: params.seed! },
      projectConfirm: false,
      addressPopup: false,
      ...dead,
    };
  }

  // A signed-in standalone new-build arrival must confirm the project (it rode
  // the redirect that used to silently pick projects[0]). In-project + anonymous
  // never confirm.
  const projectConfirm = input.signedIn && !input.insideProject && input.offeredProject !== null;

  // Map prebuild — the ZIP is the subject, so no address popup.
  if (/^\d{5}$/.test(trimmed(params.zip))) {
    return { doc: { kind: "zip", zip: params.zip! }, projectConfirm, addressPopup: false, ...dead };
  }

  // Recipe (Make-this / campaign / hero) — BLANK skeleton, never a demo doc.
  if (trimmed(params.recipe)) {
    const addrPreFilled = Boolean(trimmed(params.addr));
    const addressPopup = input.recipeHasBlank && !addrPreFilled;
    return {
      doc: { kind: "blank" },
      projectConfirm,
      addressPopup,
      autoBuildAfterConfirm: input.recipeHasBlank && addrPreFilled,
      legacyAutoGenerate: false,
    };
  }

  // Plain open (tool tab, landing CTA): gallery where it shows today, else blank.
  return {
    doc: input.firstRunGalleryEligible ? { kind: "gallery" } : { kind: "blank" },
    projectConfirm: false,
    addressPopup: false,
    ...dead,
  };
}
