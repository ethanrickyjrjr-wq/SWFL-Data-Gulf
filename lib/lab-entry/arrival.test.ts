// lib/lab-entry/arrival.test.ts
import { describe, expect, test } from "bun:test";
import { planArrival, type ArrivalInput } from "./arrival";

const base: ArrivalInput = {
  params: {},
  signedIn: true,
  offeredProject: { id: "p1", title: "Rainbow Meadows" },
  insideProject: false,
  subjectAddress: null,
  subjectArea: null,
  recipeHasBlank: false,
  recipeInputKind: null,
  firstRunGalleryEligible: false,
  seedSubject: null,
  seedBlankChosen: false,
};

describe("planArrival", () => {
  test("?did= → load existing, no popups, no auto-build", () => {
    const p = planArrival({ ...base, params: { did: "d9" } });
    expect(p.doc).toEqual({ kind: "load-did", did: "d9" });
    expect(p.projectConfirm).toBe(false);
    expect(p.addressPopup).toBe(false);
    expect(p.legacyAutoGenerate).toBe(false);
  });

  test("?seed= → the chosen seed, no popups (explicit pick)", () => {
    const p = planArrival({ ...base, params: { seed: "skeleton-dark-pro" } });
    expect(p.doc).toEqual({ kind: "seed", seedId: "skeleton-dark-pro" });
    expect(p.projectConfirm).toBe(false);
    expect(p.addressPopup).toBe(false);
  });

  test("?zip= ONLY (map / zip-report click, no recipe) → zip doc + project confirm, NO address popup", () => {
    const p = planArrival({ ...base, params: { zip: "33901" } });
    expect(p.doc).toEqual({ kind: "zip", zip: "33901" });
    expect(p.projectConfirm).toBe(true);
    expect(p.addressPopup).toBe(false);
  });

  test("?recipe= + ?addr= + ?zip= together (real New-Listing arrival) → BLANK, recipe wins over the ZIP card", () => {
    // heroDestination no longer sends an ambient zip alongside an address-anchored
    // recipe (lib/campaigns.ts) — but a stray zip param (e.g. a stale bookmark, or
    // any other future door) must still never hijack a recipe arrival onto the
    // generic ZIP city card, which is exactly what happened before this guard
    // (the 07/06/2026 screenshot). The recipe is the subject; it always wins.
    const p = planArrival({
      ...base,
      params: {
        recipe: "Just listed 123 Palm Ave, Fort Myers",
        addr: "123 Palm Ave, Fort Myers",
        zip: "33908",
      },
      recipeHasBlank: false,
      recipeInputKind: "address",
    });
    expect(p.doc).toEqual({ kind: "blank" });
    expect(p.autoBuildAfterConfirm).toBe(true);
  });

  test("?recipe= signed-in standalone → BLANK skeleton + confirm + address popup", () => {
    const p = planArrival({
      ...base,
      params: { recipe: "Just listed [[your listing address]]" },
      recipeHasBlank: true,
      recipeInputKind: "address",
    });
    expect(p.doc).toEqual({ kind: "blank" });
    expect(p.projectConfirm).toBe(true);
    expect(p.addressPopup).toBe(true);
    expect(p.autoBuildAfterConfirm).toBe(false);
    expect(p.legacyAutoGenerate).toBe(false);
  });

  test("recipe never yields the fake-fill default doc", () => {
    const p = planArrival({ ...base, params: { recipe: "x" }, recipeHasBlank: true });
    expect(p.doc.kind).toBe("blank");
  });

  test("hero arrival (blank already sliced into prompt, addr set) → no popup, auto-build after confirm", () => {
    // heroDestination fills the [[blank]] BEFORE navigating, so a real hero
    // arrival reaches the client with recipeHasBlank=false and an addr param.
    const p = planArrival({
      ...base,
      params: { recipe: "Just listed 123 Palm Ave", addr: "123 Palm Ave" },
      recipeHasBlank: false,
      recipeInputKind: "address",
    });
    expect(p.addressPopup).toBe(false);
    expect(p.autoBuildAfterConfirm).toBe(true);
  });

  test("recipe still holding a blank → address popup, NOT auto-build", () => {
    const p = planArrival({
      ...base,
      params: { recipe: "Just listed [[your listing address]]" },
      recipeHasBlank: true,
    });
    expect(p.addressPopup).toBe(true);
    expect(p.autoBuildAfterConfirm).toBe(false);
  });

  test("in-project recipe → NO project confirm (already inside the project you clicked)", () => {
    const p = planArrival({
      ...base,
      insideProject: true,
      params: { recipe: "Just listed [[addr]]" },
      recipeHasBlank: true,
    });
    expect(p.projectConfirm).toBe(false);
    expect(p.addressPopup).toBe(true);
  });

  test("anonymous recipe → no project confirm (no projects exist)", () => {
    const p = planArrival({
      ...base,
      signedIn: false,
      offeredProject: null,
      params: { recipe: "x" },
      recipeHasBlank: true,
    });
    expect(p.projectConfirm).toBe(false);
  });

  test("plain open, gallery-eligible → gallery, no popups", () => {
    const p = planArrival({ ...base, insideProject: true, firstRunGalleryEligible: true });
    expect(p.doc).toEqual({ kind: "gallery" });
    expect(p.projectConfirm).toBe(false);
  });

  test("plain open, not gallery-eligible → blank", () => {
    const p = planArrival({ ...base, insideProject: true });
    expect(p.doc).toEqual({ kind: "blank" });
  });
});

describe("seed arrivals — capture or blank (spec 2026-07-16)", () => {
  const seedBase: ArrivalInput = {
    params: { seed: "just-sold" },
    signedIn: true,
    offeredProject: null,
    insideProject: true,
    subjectAddress: null,
    subjectArea: null,
    recipeHasBlank: false,
    recipeInputKind: null,
    firstRunGalleryEligible: false,
    seedSubject: "address",
    seedBlankChosen: false,
  };

  test("address seed, no known address → seed doc + address popup, no auto-build", () => {
    const p = planArrival(seedBase);
    expect(p.doc).toEqual({ kind: "seed", seedId: "just-sold" });
    expect(p.seedStart).toEqual({ mode: "ask", inputKind: "address" });
    expect(p.addressPopup).toBe(true);
    expect(p.autoBuildAfterConfirm).toBe(false);
  });

  test("address seed, project knows the address → skip-and-build", () => {
    const p = planArrival({ ...seedBase, subjectAddress: "123 Palm Ave" });
    expect(p.seedStart).toEqual({ mode: "build", subjectValue: "123 Palm Ave" });
    expect(p.addressPopup).toBe(false);
    expect(p.autoBuildAfterConfirm).toBe(true);
  });

  test("area seed uses subjectArea, not subjectAddress", () => {
    const p = planArrival({ ...seedBase, seedSubject: "area", subjectAddress: "123 Palm Ave" });
    expect(p.seedStart).toEqual({ mode: "ask", inputKind: "area" });
  });

  test("area seed + known area → skip-and-build", () => {
    const p = planArrival({ ...seedBase, seedSubject: "area", subjectArea: "Cape Coral" });
    expect(p.seedStart).toEqual({ mode: "build", subjectValue: "Cape Coral" });
    expect(p.autoBuildAfterConfirm).toBe(true);
  });

  test("no-subject seed → fill-or-blank choice, no address popup (choice popup is the client's)", () => {
    const p = planArrival({ ...seedBase, seedSubject: "none" });
    expect(p.seedStart).toEqual({ mode: "choice" });
    expect(p.addressPopup).toBe(false);
    expect(p.autoBuildAfterConfirm).toBe(false);
  });

  test("blank chosen → exactly today's behavior", () => {
    const p = planArrival({ ...seedBase, seedBlankChosen: true });
    expect(p).toEqual({
      doc: { kind: "seed", seedId: "just-sold" },
      projectConfirm: false,
      addressPopup: false,
      autoBuildAfterConfirm: false,
      legacyAutoGenerate: false,
      seedStart: { mode: "blank" },
    });
  });

  test("unclassifiable seed (seedSubject null) → today's behavior, no popups", () => {
    const p = planArrival({ ...seedBase, seedSubject: null });
    expect(p.addressPopup).toBe(false);
    expect(p.autoBuildAfterConfirm).toBe(false);
    expect(p.seedStart).toBeNull();
  });

  test("non-seed arrivals carry seedStart: null", () => {
    const p = planArrival({ ...seedBase, params: {}, insideProject: false });
    expect(p.seedStart).toBeNull();
  });
});
