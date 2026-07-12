import { describe, it, expect } from "bun:test";
import { checkDocFreshness } from "./freshness";
import { materializeLoad } from "./materialize";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";
import { CORRIDOR_ROWS } from "./materialize.test";

const FRESHER = CORRIDOR_ROWS.map((r) => ({ ...r, metrics_verified_date: "2026-07-01" }));

/** stubSb wrapper that counts how many times a load chain resolves. */
function countingSb(rows: unknown[], counter: { n: number }) {
  const base = stubSb(rows);
  return {
    schema: base.schema,
    from: (table: string) => {
      counter.n += 1;
      return base.from(table);
    },
  };
}

async function loadBlocks() {
  const { blocks } = await materializeLoad(
    corridorProfiles,
    {},
    {
      sb: stubSb(CORRIDOR_ROWS),
      hostPng: async () => "https://cdn/x.png",
    },
  );
  return blocks;
}

describe("checkDocFreshness", () => {
  it("same dataset+params across many blocks costs ONE probe; newer source → stale", async () => {
    const blocks = await loadBlocks(); // ≥4 blocks, all same binding key, asOf 06/01/2026
    const counter = { n: 0 };
    const map = await checkDocFreshness(blocks, { sb: countingSb(FRESHER, counter) });
    expect(counter.n).toBe(1); // deduped
    for (const b of blocks) {
      expect(map[b.id]).toEqual({ stale: true, currentAsOf: "07/01/2026" });
    }
  });
  it("unchanged source → not stale", async () => {
    const blocks = await loadBlocks();
    const map = await checkDocFreshness(blocks, { sb: stubSb(CORRIDOR_ROWS) });
    for (const b of blocks) {
      expect(map[b.id]).toEqual({ stale: false, currentAsOf: "06/01/2026" });
    }
  });
  it("foreign binding version → can't refresh, NOT stale", async () => {
    const blocks = await loadBlocks();
    const old = blocks.map((b) => ({ ...b, binding: { ...b.binding!, v: 999 } }));
    const map = await checkDocFreshness(old as never, { sb: stubSb(FRESHER) });
    for (const b of old) {
      expect(map[b.id]).toEqual({ stale: false, currentAsOf: null });
    }
  });
  it("unknown dataset id → can't refresh, NOT stale", async () => {
    const blocks = await loadBlocks();
    const foreign = blocks.map((b) => ({ ...b, binding: { ...b.binding!, concoctionId: "gone" } }));
    const map = await checkDocFreshness(foreign as never, { sb: stubSb(FRESHER) });
    for (const b of foreign) {
      expect(map[b.id]).toEqual({ stale: false, currentAsOf: null });
    }
  });
  it("unbound blocks are absent from the map", async () => {
    const map = await checkDocFreshness(
      [{ id: "plain", type: "text", props: { body: "hi" } }] as never,
      { sb: stubSb(CORRIDOR_ROWS) },
    );
    expect(map.plain).toBeUndefined();
    expect(Object.keys(map)).toHaveLength(0);
  });
});
