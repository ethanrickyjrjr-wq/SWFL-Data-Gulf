import { describe, it, expect } from "bun:test";
import { runConcoctionAction, listDatasets } from "./api-actions";
import { materializeLoad } from "./materialize";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";
import { CORRIDOR_ROWS } from "./materialize.test";

const DEPS = { sb: stubSb(CORRIDOR_ROWS), hostPng: async (k: string) => `https://cdn/x/${k}` };

describe("listDatasets", () => {
  it("returns the picker index", () => {
    const { datasets } = listDatasets();
    expect(datasets.map((d) => d.id)).toContain("corridor-profiles");
  });
});

describe("runConcoctionAction", () => {
  it("load happy path returns blocks + asOf", async () => {
    const r = await runConcoctionAction({ action: "load", id: "corridor-profiles" }, DEPS);
    expect("blocks" in r).toBe(true);
    expect((r as { asOf: string }).asOf).toBe("06/01/2026");
  });
  it("load unknown id → 404 error, never a throw", async () => {
    const r = await runConcoctionAction({ action: "load", id: "nope" }, DEPS);
    expect(r).toEqual({ error: "unknown dataset nope", status: 404 });
  });
  it("invalid action → 400", async () => {
    const r = await runConcoctionAction({ action: "explode" }, DEPS);
    expect((r as { status: number }).status).toBe(400);
  });
  it("rebind on an unbound block → { unrefreshable: true }, not a throw", async () => {
    const r = await runConcoctionAction(
      { action: "rebind", block: { id: "x", type: "text", props: {} } },
      DEPS,
    );
    expect((r as { unrefreshable?: boolean }).unrefreshable).toBe(true);
  });
  it("turn-into rejects a non-target type at the schema", async () => {
    const r = await runConcoctionAction(
      { action: "turn-into", block: {}, newType: "footer" },
      DEPS,
    );
    expect((r as { status: number }).status).toBe(400);
  });
  it("freshness passthrough maps bound blocks", async () => {
    const { blocks } = await materializeLoad(corridorProfiles, {}, DEPS);
    const r = await runConcoctionAction({ action: "freshness", blocks }, DEPS);
    const staleness = (r as { staleness: Record<string, { stale: boolean }> }).staleness;
    expect(Object.keys(staleness).length).toBe(blocks.length);
  });
  it("loader failure surfaces as a 502-shaped error, never a throw", async () => {
    const r = await runConcoctionAction(
      { action: "load", id: "corridor-profiles" },
      { sb: stubSb([]) },
    );
    expect((r as { status: number }).status).toBe(502);
    expect((r as { error: string }).error).toMatch(/no rows/);
  });
});
