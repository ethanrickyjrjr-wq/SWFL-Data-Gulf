import { test, expect } from "bun:test";
import { fetchReachBlocks } from "./fetch-reach";

test("returns one labeled block per resolvable slug", async () => {
  const blocks = await fetchReachBlocks(["master"], {
    origin: "https://www.swfldatagulf.com",
  });
  expect(blocks.length).toBe(1);
  expect(blocks[0].label.toLowerCase()).toContain("master");
  expect(blocks[0].dossier.freshness_token).toMatch(/^SWFL-/);
});

test("skips an unknown slug instead of throwing", async () => {
  const blocks = await fetchReachBlocks(["definitely-not-a-brain"], {
    origin: "https://x",
  });
  expect(blocks).toEqual([]);
});
