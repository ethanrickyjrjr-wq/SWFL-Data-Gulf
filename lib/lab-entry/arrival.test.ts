// lib/lab-entry/arrival.test.ts
import { describe, expect, test } from "bun:test";
import { planArrival, type ArrivalInput } from "./arrival";

const base: ArrivalInput = {
  params: {},
  signedIn: true,
  offeredProject: { id: "p1", title: "Rainbow Meadows" },
  insideProject: false,
  subjectAddress: null,
  recipeHasBlank: false,
  recipeInputKind: null,
  firstRunGalleryEligible: false,
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
    // heroDestination ALWAYS carries zip (scope) alongside the address-anchored
    // recipe. The zip branch used to fire first and drop this onto the generic
    // ZIP city card — the 07/06/2026 screenshot. The recipe is the subject; it wins.
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
