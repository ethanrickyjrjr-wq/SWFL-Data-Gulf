import { test, expect } from "bun:test";
import { mondayOf, formatForClipboard } from "./week";
import type { SocialDraft } from "./types";

test("mondayOf returns the Monday of the week (UTC)", () => {
  expect(mondayOf(new Date("2026-06-24T12:00:00Z"))).toBe("2026-06-22"); // Wed -> Mon
  expect(mondayOf(new Date("2026-06-22T00:00:00Z"))).toBe("2026-06-22"); // Mon -> same
  expect(mondayOf(new Date("2026-06-28T23:00:00Z"))).toBe("2026-06-22"); // Sun -> prior Mon
});

test("formatForClipboard joins caption + #hashtags paste-ready", () => {
  const draft = {
    day: "mon",
    theme: "Market Monday",
    caption: "Median hit $485K.",
    hashtags: ["FortMyers", "SWFLDataGulf"],
    card: { globalStyle: {} as never, blocks: [] },
  } as unknown as SocialDraft;
  expect(formatForClipboard(draft)).toBe("Median hit $485K.\n\n#FortMyers #SWFLDataGulf");
});
