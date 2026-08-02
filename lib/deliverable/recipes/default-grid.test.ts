// lib/deliverable/recipes/default-grid.test.ts
//
// The terminal fallback builder's contract (one-lane collapse, spec 2026-08-02).
// FM1 is the load-bearing failure mode: the default grid is the LAST resort, so it
// must build from a completely empty context — no prompt, no facts, no zip — and
// still return a schema-valid doc with open slots. Refusal or null here would mean
// a keyless build has nowhere to land, which is exactly the failure the one-lane
// collapse exists to make impossible.

import { describe, expect, test } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { RECIPES } from "@/lib/deliverable/recipes";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";
import { buildDefaultGrid } from "./default-grid";

const skeleton = SEED_DOCS.find((d) => d.id === "skeleton-clean-white")!;

const emptyCtx = {
  recipe: RECIPES["default-grid"],
  prompt: "   ",
  currentDoc: skeleton.build(),
  facts: null,
  resolved: false,
  zip: undefined,
};

describe("FM1: default-grid builds from a completely empty context", () => {
  test("returns a schema-valid doc, never null, with no invented figures", async () => {
    const doc = await buildDefaultGrid(emptyCtx as never);
    expect(doc).not.toBeNull();
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
  });

  test("the empty-context build IS the open-slot skeleton — untouched, not filled", async () => {
    const doc = await buildDefaultGrid(emptyCtx as never);
    // A blank prompt means there is nothing to source from; the contract is the
    // skeleton itself (open slots), never a model call and never invented content.
    expect(doc).toBe(emptyCtx.currentDoc);
  });
});
