// lib/deliverable/recipes/derivations.test.ts
//
// The derivations registry is the OTHER half of the config seam: the irreducible
// math, named and keyed. A config referencing a key that does not exist fails HERE
// at CI; at runtime a derivation that throws degrades to no blocks (RULE 0.7) —
// the email ships quieter, never broken, never invented.
import { describe, expect, test } from "bun:test";
import { CONFIGURED_RECIPES } from "./config";
import { DERIVATIONS, runDerivations } from "./derivations";
import type { RecipeBuildContext } from "./index";

describe("derivations registry", () => {
  test("every derivation key referenced by a configured recipe exists", () => {
    for (const { key, config } of CONFIGURED_RECIPES()) {
      for (const k of [...config.middle, ...config.tail]) {
        expect(DERIVATIONS[k], `${key} references unknown derivation "${k}"`).toBeDefined();
      }
    }
  });

  test("runDerivations is empty-tolerant: no keys → no blocks, never throws", async () => {
    const r = await runDerivations([], {} as RecipeBuildContext, {});
    expect(r.blocks).toEqual([]);
    expect(r.subjectVars).toEqual({});
  });

  test("a failing derivation degrades to no blocks (RULE 0.7), never a throw", async () => {
    DERIVATIONS["__test-boom"] = async () => {
      throw new Error("boom");
    };
    try {
      const r = await runDerivations(["__test-boom"], {} as RecipeBuildContext, {});
      expect(r.blocks).toEqual([]);
    } finally {
      delete DERIVATIONS["__test-boom"];
    }
  });

  test("subjectVars from later keys win, blocks concatenate in key order", async () => {
    DERIVATIONS["__test-a"] = async () => ({
      blocks: [{ block: { id: "a", type: "text", props: { body: "A" } } }],
      subjectVars: { days: "9", scope: "ZIP 33908" },
    });
    DERIVATIONS["__test-b"] = async () => ({
      blocks: [{ block: { id: "b", type: "text", props: { body: "B" } } }],
      subjectVars: { days: "12" },
    });
    try {
      const r = await runDerivations(["__test-a", "__test-b"], {} as RecipeBuildContext, {});
      expect(r.blocks.map((b) => b.block.id)).toEqual(["a", "b"]);
      expect(r.subjectVars).toEqual({ days: "12", scope: "ZIP 33908" });
    } finally {
      delete DERIVATIONS["__test-a"];
      delete DERIVATIONS["__test-b"];
    }
  });
});
