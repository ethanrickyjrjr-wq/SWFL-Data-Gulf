// lib/social/__tests__/frozen-post.test.ts
import { test, expect } from "bun:test";
import { frozenPublishPayload } from "@/lib/social/frozen-post";
import type { SocialSchedule } from "@/lib/social/types";

function row(frozen: Partial<SocialSchedule["frozen_post"]> | null): SocialSchedule {
  return { id: 1, frozen_post: frozen as SocialSchedule["frozen_post"] } as SocialSchedule;
}

test("returns null when there is no frozen media_url (template path)", () => {
  expect(frozenPublishPayload(row(null))).toBeNull();
  expect(
    frozenPublishPayload(
      row({ caption: "x", media_url: null, hashtags: [], freshness_token: null, composed_at: "" }),
    ),
  ).toBeNull();
});

test("frozen square post → caption + media at 1:1", () => {
  const p = frozenPublishPayload(
    row({
      caption: "Hello",
      media_url: "https://x/a.png",
      hashtags: [],
      freshness_token: null,
      composed_at: "",
    }),
  );
  expect(p).toEqual({ caption: "Hello", media: [{ url: "https://x/a.png", ratio: "1:1" }] });
});

test("ratio comes from frozen design.format", () => {
  const p = frozenPublishPayload(
    row({
      caption: "Tall",
      media_url: "https://x/b.png",
      hashtags: [],
      freshness_token: null,
      composed_at: "",
      design: { version: 1, format: "portrait", background: "#000", elements: [] },
    }),
  );
  expect(p?.media[0].ratio).toBe("4:5");
});
