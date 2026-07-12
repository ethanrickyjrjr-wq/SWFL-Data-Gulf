import { describe, it, expect } from "bun:test";
import { materializeLoad, rebindBlock, turnIntoBlock, BindingUnrefreshable } from "./materialize";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";
import { CORRIDOR_ROWS } from "./materialize.test";

const FRESHER = CORRIDOR_ROWS.map((r) => ({
  ...r,
  asking_rent_psf: (r.asking_rent_psf as number) + 1,
  metrics_verified_date: "2026-07-01",
}));

async function firstStatsBlock() {
  const { blocks } = await materializeLoad(
    corridorProfiles,
    {},
    {
      sb: stubSb(CORRIDOR_ROWS),
      hostPng: async () => "https://cdn/x.png",
    },
  );
  return blocks.find((b) => b.type === "stats")!;
}

describe("rebindBlock", () => {
  it("re-bakes values, keeps id/type/layout/slice, updates asOf", async () => {
    const block = await firstStatsBlock();
    const re = await rebindBlock(
      block,
      {},
      {
        sb: stubSb(FRESHER),
        hostPng: async () => "https://cdn/x.png",
      },
    );
    expect(re.id).toBe(block.id);
    expect(re.type).toBe(block.type);
    expect(re.layout).toEqual(block.layout);
    expect(re.binding?.slice).toEqual(block.binding?.slice);
    expect(re.binding?.asOf).toBe("07/01/2026");
    expect(JSON.stringify(re.props)).not.toBe(JSON.stringify(block.props)); // values moved
  });
  it("throws BindingUnrefreshable on version mismatch (degrade, never break)", async () => {
    const block = await firstStatsBlock();
    const old = { ...block, binding: { ...block.binding!, v: 999 } };
    await expect(
      rebindBlock(old as never, {}, { sb: stubSb(CORRIDOR_ROWS) }),
    ).rejects.toBeInstanceOf(BindingUnrefreshable);
  });
  it("throws BindingUnrefreshable when the block has no binding", async () => {
    const block = { ...(await firstStatsBlock()), binding: undefined };
    await expect(
      rebindBlock(block as never, {}, { sb: stubSb(CORRIDOR_ROWS) }),
    ).rejects.toBeInstanceOf(BindingUnrefreshable);
  });
  it("throws BindingUnrefreshable on an unknown dataset id", async () => {
    const block = await firstStatsBlock();
    const foreign = { ...block, binding: { ...block.binding!, concoctionId: "gone" } };
    await expect(
      rebindBlock(foreign as never, {}, { sb: stubSb(CORRIDOR_ROWS) }),
    ).rejects.toBeInstanceOf(BindingUnrefreshable);
  });
  it("throws BindingUnrefreshable on params the current schema rejects (enum violation)", async () => {
    const { zipListingActivity } = await import("./defs/zip-listing-activity");
    const ZIP_ROWS = [
      {
        county: "Lee",
        zip_code: "33914",
        new_listings_90d: 92,
        price_cuts_90d: 120,
        sales_90d: 3,
        latest_at: "2026-07-11T00:00:00Z",
      },
      {
        county: "Lee",
        zip_code: "33904",
        new_listings_90d: 61,
        price_cuts_90d: 75,
        sales_90d: 0,
        latest_at: "2026-07-11T00:00:00Z",
      },
      {
        county: "Collier",
        zip_code: "34112",
        new_listings_90d: 45,
        price_cuts_90d: 51,
        sales_90d: 1,
        latest_at: "2026-07-11T00:00:00Z",
      },
      {
        county: "Collier",
        zip_code: "34102",
        new_listings_90d: 38,
        price_cuts_90d: 44,
        sales_90d: 0,
        latest_at: "2026-07-11T00:00:00Z",
      },
      {
        county: "Lee",
        zip_code: "33908",
        new_listings_90d: 77,
        price_cuts_90d: 95,
        sales_90d: 2,
        latest_at: "2026-07-11T00:00:00Z",
      },
    ];
    const { blocks } = await materializeLoad(
      zipListingActivity,
      {},
      {
        sb: stubSb(ZIP_ROWS),
        hostPng: async () => "https://cdn/x.png",
      },
    );
    const hero = blocks.find((b) => b.type === "hero")!;
    await expect(
      rebindBlock(hero, { county: "Atlantis" }, { sb: stubSb(ZIP_ROWS) }),
    ).rejects.toBeInstanceOf(BindingUnrefreshable);
  });
});

describe("turnIntoBlock", () => {
  it("stats → list keeps id/binding/layout, renders the list mapper (Notion semantics)", async () => {
    const block = await firstStatsBlock();
    const li = await turnIntoBlock(block, "list", {
      sb: stubSb(CORRIDOR_ROWS),
      hostPng: async () => "https://cdn/x.png",
    });
    expect(li.id).toBe(block.id);
    expect(li.type).toBe("list");
    expect(li.layout).toEqual(block.layout);
    expect(li.binding?.slice).toEqual(block.binding?.slice);
    expect((li.props as { items: unknown[] }).items.length).toBeGreaterThan(0);
  });
  it("list → image renders a chart when guards pass", async () => {
    const { blocks } = await materializeLoad(
      corridorProfiles,
      {},
      {
        sb: stubSb(CORRIDOR_ROWS),
        hostPng: async (k) => `https://cdn/x/${k}`,
      },
    );
    const list = blocks.find((b) => b.type === "list")!;
    const img = await turnIntoBlock(list, "image", {
      sb: stubSb(CORRIDOR_ROWS),
      hostPng: async (k) => `https://cdn/x/${k}`,
    });
    expect(img.type).toBe("image");
    expect((img.props as { kind?: string }).kind).toBe("chart");
    expect(img.id).toBe(list.id);
  });
});
