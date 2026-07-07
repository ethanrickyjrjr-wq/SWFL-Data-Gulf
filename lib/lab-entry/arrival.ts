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

  // Map / zip-report prebuild — the ZIP is the SUBJECT, so no address popup. This
  // fires ONLY when the visitor chose a ZIP: a map click, the report's "email this"
  // button, or a bare ZIP typed into the hero — all route through openZipLab. The
  // property/campaign flows (heroDestination) no longer carry an ambient zip at all,
  // so a listing can never be hijacked onto the generic ZIP card. The `!recipe`
  // guard stays as belt-and-suspenders: a ZIP subject never has a recipe.
  if (/^\d{5}$/.test(trimmed(params.zip)) && !trimmed(params.recipe)) {
    return { doc: { kind: "zip", zip: params.zip! }, projectConfirm, addressPopup: false, ...dead };
  }

  // Recipe (Make-this / campaign / hero) — BLANK skeleton, never a demo doc.
  if (trimmed(params.recipe)) {
    const addrPreFilled = Boolean(trimmed(params.addr));
    // A recipe still holding a [[blank]] needs the address popup (unless an addr
    // param already answers it). The hero slices its typed address INTO the
    // prompt before navigating, so a real hero arrival has no remaining blank.
    const addressPopup = input.recipeHasBlank && !addrPreFilled;
    return {
      doc: { kind: "blank" },
      projectConfirm,
      addressPopup,
      // Ready to build the moment the project is confirmed: a recipe with no
      // remaining blank (hero pre-filled, or the recipe never had one). A recipe
      // still holding a blank waits for the popup's Build instead.
      autoBuildAfterConfirm: !input.recipeHasBlank,
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
