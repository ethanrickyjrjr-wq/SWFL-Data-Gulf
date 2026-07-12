import { describe, it, expect } from "bun:test";
import { blocksToSocialModel, exportSocialPng } from "./social-export";
import { materializeLoad } from "./materialize";
import { corridorProfiles } from "./defs/corridor-profiles";
import { stubSb } from "./defs/test-stub";
import { CORRIDOR_ROWS } from "./materialize.test";

async function loadedBlocks() {
  const { blocks } = await materializeLoad(
    corridorProfiles,
    {},
    {
      sb: stubSb(CORRIDOR_ROWS),
      hostPng: async (k) => `https://cdn/x/${k}`,
    },
  );
  return blocks;
}

describe("blocksToSocialModel", () => {
  it("hero → headline, stats cell → stat, binding → provenance", async () => {
    const model = blocksToSocialModel(await loadedBlocks());
    expect(model.headline.length).toBeGreaterThan(0);
    expect(model.headline).toContain("$60.84"); // hero value restated verbatim
    expect(model.stat?.value).toBe("$60.84");
    expect(model.source).toBe("SWFL Data Gulf verified corridor metrics");
    expect(model.as_of).toBe("06/01/2026");
    // the internal freshness token NEVER ships on a card
    expect("freshness_token" in model).toBe(false);
  });
  it("no stat-bearing block → stat omitted entirely (no placeholder)", () => {
    const model = blocksToSocialModel([
      { id: "t", type: "text", props: { body: "A market note." } },
    ] as never);
    expect(model.stat).toBeUndefined();
    expect(model.headline).toBe("A market note.");
  });
  it("no binding → provenance fields absent, model still valid", () => {
    const model = blocksToSocialModel([
      { id: "t", type: "text", props: { body: "Hello." } },
    ] as never);
    expect(model.source).toBeUndefined();
    expect(model.as_of).toBeUndefined();
  });
});

describe("exportSocialPng", () => {
  it("hands the distilled model + format to the renderer and returns its bytes", async () => {
    const blocks = await loadedBlocks();
    let seen: { format?: string; headline?: string } = {};
    const buf = await exportSocialPng(blocks, "square", {
      render: async (args) => {
        seen = { format: args.format as string, headline: args.model.headline };
        return Buffer.from("png");
      },
    });
    expect(buf.toString()).toBe("png");
    expect(seen.format).toBe("square");
    expect(seen.headline).toContain("$60.84");
  });
});
