// lib/lab-entry/arrival.ts
//
// THE ONE arrival controller (pure). Both lab clients decide doc + popups +
// auto-build here so every door arrives identically (spec 2026-07-06 §A2). The
// disease this cures: recipe clicks fake-filled a demo doc ($485K/34 DOM), the
// signed-in redirect auto-picked projects[0], and a generic on-mount auto-build
// produced wrong-listing emails. New-build arrivals now get a BLANK skeleton and
// the generic auto-build (legacyAutoGenerate) is dead.
import type { SeedSubject } from "@/lib/email/doc/default-docs";
import { planSeedStart, type SeedStartPlan } from "@/lib/lab-entry/seed-start";

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
  /** The project's remembered market area (projects.subject_area) — the area
   *  twin of subjectAddress for area-subject template picks. */
  subjectArea: string | null;
  recipeHasBlank: boolean;
  recipeInputKind: "address" | "area" | null;
  firstRunGalleryEligible: boolean;
  /** The picked template's declared subject (SeedDoc.subject), null when the
   *  arrival carries no seed or the seed id is unknown. */
  seedSubject: SeedSubject | null;
  /** The user explicitly chose blank (?blank=1 / the popup's escape). */
  seedBlankChosen: boolean;
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
  /** ADDRESS-FIRST (operator decree 08/10/2026): a signed-in standalone arrival
   *  with an address-subject recipe gets ONE question — the address, which IS
   *  the project (title + kind:listing + subject_address). Suppresses the
   *  project confirm; the client routes/creates by address and hops carrying
   *  ?addr= so the in-project arrival builds with no second popup. */
  addressFirst: boolean;
  autoBuildAfterConfirm: boolean;
  legacyAutoGenerate: false;
  /** Capture-or-blank verdict for a seed arrival (spec 2026-07-16); null on
   *  every non-seed arrival. "choice" renders the client's fill-or-blank popup. */
  seedStart: SeedStartPlan | null;
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
      addressFirst: false,
      ...dead,
      seedStart: null,
    };
  }

  // Template pick (spec 2026-07-16-seed-capture-or-blank-design.md): the pure
  // matrix decides capture / skip-and-build / explicit blank. A seed with no
  // classification resolvable (unknown id) keeps the legacy no-popups landing.
  if (trimmed(params.seed)) {
    const seedStart = input.seedSubject
      ? planSeedStart({
          subject: input.seedSubject,
          knownAddress: input.subjectAddress,
          knownArea: input.subjectArea,
          blankChosen: input.seedBlankChosen,
        })
      : null;
    return {
      doc: { kind: "seed", seedId: params.seed! },
      projectConfirm: false,
      addressPopup: seedStart?.mode === "ask",
      addressFirst: false,
      autoBuildAfterConfirm: seedStart?.mode === "build",
      legacyAutoGenerate: false,
      seedStart,
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
    return {
      doc: { kind: "zip", zip: params.zip! },
      projectConfirm,
      addressPopup: false,
      addressFirst: false,
      ...dead,
      seedStart: null,
    };
  }

  // Recipe (Make-this / campaign / hero) — BLANK skeleton, never a demo doc.
  if (trimmed(params.recipe)) {
    const addrPreFilled = Boolean(trimmed(params.addr));
    // A recipe still holding a [[blank]] needs the address popup (unless an addr
    // param already answers it). The hero slices its typed address INTO the
    // prompt before navigating, so a real hero arrival has no remaining blank.
    const addressPopup = input.recipeHasBlank && !addrPreFilled;
    // ADDRESS-FIRST (decree 08/10/2026, WIDENED 08/11/2026): scoped to
    // ADDRESS-subject recipes only — an area/ZIP recipe's subject is not a project
    // identity, so it keeps the confirm-then-ask flow.
    //
    // IT NO LONGER REQUIRES THE POPUP. It used to read `addressPopup && …`, which
    // meant the door that ALREADY KNOWS the address — the /go hero, which slices the
    // typed address into the prompt and carries ?addr= — fell straight through to
    // `projectConfirm` and got asked "Build this in <last project you touched>?" over
    // a different listing's name (operator screenshot 08/11/2026 10:45: *"whenever
    // you have to put in an address or choose, no new project, it fucks everything
    // up… the project name is the address and once put in, whatever build you had
    // chosen will start building"*). Knowing the address is MORE reason to skip the
    // question, not less: the address IS the project (title + kind:listing +
    // subject_address), so there is nothing left to ask. The client routes into the
    // project that already owns that address, else creates one titled by it, and
    // builds. addressPopup stays the flag for "we still have to ASK"; addressFirst is
    // now the flag for "the address decides the project, ask or no ask".
    const addressFirst =
      (addressPopup || addrPreFilled) &&
      input.signedIn &&
      !input.insideProject &&
      input.recipeInputKind === "address";
    return {
      doc: { kind: "blank" },
      projectConfirm: projectConfirm && !addressFirst,
      addressPopup,
      addressFirst,
      // Ready to build the moment the project is confirmed: a recipe with no
      // remaining blank (hero pre-filled, or the recipe never had one). A recipe
      // still holding a blank waits for the popup's Build instead.
      autoBuildAfterConfirm: !input.recipeHasBlank,
      legacyAutoGenerate: false,
      seedStart: null,
    };
  }

  // Plain open (tool tab, landing CTA): gallery where it shows today, else blank.
  return {
    doc: input.firstRunGalleryEligible ? { kind: "gallery" } : { kind: "blank" },
    projectConfirm: false,
    addressPopup: false,
    addressFirst: false,
    ...dead,
    seedStart: null,
  };
}

/** The arrival gap-gate (the shell's "Sign this email" hold before an arrival
 *  auto-build). Operator launch decree 08/11/2026 ("get /go running correctly",
 *  no popups on the one-click flow): a SIGNED-OUT arrival never holds the build
 *  for brand gaps — there is no account brand to bank into, and the first-touch
 *  visitor must see their email, not a form. The doc renders with open labelled
 *  slots (RULE 0.7 lane 4); identity is collected on save/send, where sign-in
 *  already happens. Signed-in users with real gaps still get the fill-once ask,
 *  and a saved-layout offer always asks — that question is theirs to answer. */
export function holdArrivalForPopup(input: {
  gapCount: number;
  hasSavedLayoutOffer: boolean;
  /** true iff /api/user/brand answered 200 (a signed-in account brand read). */
  brandAuthed: boolean;
}): boolean {
  if (input.hasSavedLayoutOffer) return true;
  return input.brandAuthed && input.gapCount > 0;
}
