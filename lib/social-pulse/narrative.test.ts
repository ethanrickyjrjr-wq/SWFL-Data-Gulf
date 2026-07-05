// lib/social-pulse/narrative.test.ts
import { test, expect } from "bun:test";
import { buildNarrative, narrativeSystem } from "./narrative";
import type { PulseDigest } from "./digest";

const digest: PulseDigest = {
  week: "2026-W27",
  asOf: "07/05/2026",
  scanId: 7,
  benchmarks: [
    { area: "swfl", label: "SWFL-wide", medianLikes: 100, topQuartileLikes: 300, postCount: 3 },
  ],
  formats: [{ format: "video", share: 0.5, medianLikes: 300 }],
  topPosts: [],
  hashtags: [],
  topics: [],
};

test("system prompt forbids invention and bans the vendor name", () => {
  const sys = narrativeSystem();
  expect(sys).toContain("ONLY the figures");
  expect(sys.toLowerCase()).not.toContain("steadyapi");
});

test("buildNarrative passes digest JSON to the completer and returns its text", async () => {
  let sawUser = "";
  const text = await buildNarrative(digest, {
    complete: async (_sys, user) => {
      sawUser = user;
      return "Reels led the week.";
    },
  });
  expect(text).toBe("Reels led the week.");
  expect(sawUser).toContain('"medianLikes":100');
});

test("a completer failure yields null, never a throw (digest still publishes)", async () => {
  const text = await buildNarrative(digest, {
    complete: async () => {
      throw new Error("model down");
    },
  });
  expect(text).toBeNull();
});
