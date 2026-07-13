import { describe, it, expect } from "bun:test";
import { seedResolvedDataset } from "./seed-authored";
import { stubSb } from "./defs/test-stub";
import { CORRIDOR_ROWS } from "./materialize.test";
import type { EmailDoc } from "@/lib/email/doc/types";

const BASE_DOC: EmailDoc = {
  globalStyle: {
    primaryColor: "#0f1d24",
    accentColor: "#3DC9C0",
    fontFamily: "MODERN_SANS",
    textColor: "#111111",
    backdropColor: "#f5f5f5",
  },
  blocks: [
    { id: "h1", type: "header", props: {}, layout: { x: 0, y: 0, w: 12, h: 2 } },
    {
      id: "t1",
      type: "text",
      props: { body: "Corridor read." },
      layout: { x: 0, y: 2, w: 12, h: 3 },
    },
    {
      id: "s1",
      type: "sources",
      props: { sources: [{ label: "SWFL Data Gulf" }] },
      layout: { x: 0, y: 5, w: 12, h: 2 },
    },
  ],
};

const DEPS = { sb: stubSb(CORRIDOR_ROWS), hostPng: async (k: string) => `https://cdn/x/${k}` };

describe("seedResolvedDataset", () => {
  it("prompt naming a dataset appends its blocks (minus a duplicate sources) with bindings", async () => {
    const { doc, seededLabel } = await seedResolvedDataset(
      BASE_DOC,
      "an email about commercial corridor rents",
      null,
      DEPS,
    );
    expect(seededLabel).toBe("Commercial rents & vacancy");
    expect(doc.blocks.length).toBeGreaterThan(BASE_DOC.blocks.length);
    const seeded = doc.blocks.filter((b) => b.binding);
    expect(seeded.length).toBeGreaterThan(0);
    // the dataset's own sources block was dropped — the doc already has one
    expect(doc.blocks.filter((b) => b.type === "sources")).toHaveLength(1);
    // placed BELOW the existing content
    for (const b of seeded) expect(b.layout!.y).toBeGreaterThanOrEqual(7);
  });
  it("no dataset in the prompt → doc unchanged", async () => {
    const { doc, seededLabel } = await seedResolvedDataset(BASE_DOC, "happy birthday!", null, DEPS);
    expect(seededLabel).toBeNull();
    expect(doc).toBe(BASE_DOC);
  });
  it("unsatisfiable required params → skipped, never guessed", async () => {
    const { seededLabel } = await seedResolvedDataset(
      BASE_DOC,
      "median asking price trend please",
      { kind: "place", value: "Bonita Springs" },
      DEPS,
    );
    expect(seededLabel).toBeNull();
  });
  it("loader failure → doc unchanged (fail-soft)", async () => {
    const { doc, seededLabel } = await seedResolvedDataset(
      BASE_DOC,
      "commercial corridor rents",
      null,
      { sb: stubSb([]) },
    );
    expect(seededLabel).toBeNull();
    expect(doc).toBe(BASE_DOC);
  });
  it("block cap respected — a nearly-full doc is left alone", async () => {
    const fat: EmailDoc = {
      ...BASE_DOC,
      blocks: Array.from({ length: 18 }, (_, i) => ({
        id: `b${i}`,
        type: "text" as const,
        props: { body: "x" },
        layout: { x: 0, y: i * 2, w: 12, h: 2 },
      })),
    };
    const { doc, seededLabel } = await seedResolvedDataset(
      fat,
      "commercial corridor rents",
      null,
      DEPS,
    );
    expect(seededLabel).toBeNull();
    expect(doc.blocks).toHaveLength(18);
  });
});
