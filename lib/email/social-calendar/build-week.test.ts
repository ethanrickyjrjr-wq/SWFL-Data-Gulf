import { test, expect } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import {
  seedSocialCard,
  socialPostSystem,
  tryParseSocial,
  assembleDraft,
  buildVariants,
  clampToChars,
} from "./build-week";
import { DAY_THEMES } from "./themes";

const monday = DAY_THEMES[0]; // hero + stats

test("seedSocialCard builds a valid doc with the theme's blocks and no header/footer", () => {
  const card = seedSocialCard(monday);
  expect(EmailDocSchema.safeParse(card).success).toBe(true);
  expect(card.blocks.map((b) => b.type)).toEqual(["hero", "stats"]);
  expect(card.blocks.some((b) => b.type === "header" || b.type === "footer")).toBe(false);
});

test("socialPostSystem carries the four-lane rule, the lake data, and the day addendum", () => {
  const sys = socialPostSystem("median $485K · LeePA · 05/2026", monday.systemAddendum);
  expect(sys).toContain("four lanes");
  expect(sys).toContain("invented number");
  expect(sys).toContain("median $485K");
  expect(sys).toContain(monday.systemAddendum);
});

test("tryParseSocial parses caption+hashtags+patch, rejects no-caption, clamps to 8 tags", () => {
  const ok = tryParseSocial(
    '{"captionText":"Median hit $485K.","hashtags":["a","b","c","d","e","f","g","h","i"],"patch":{"x":{"value":"$485K"}}}',
  );
  expect(ok?.caption).toBe("Median hit $485K.");
  expect(ok?.hashtags.length).toBe(8);
  expect(tryParseSocial('{"hashtags":[]}')).toBeNull();
  expect(tryParseSocial("not json")).toBeNull();
});

test("assembleDraft applies the patch INTO the card cells (AI-fill actually fills)", () => {
  const card = seedSocialCard(monday);
  const heroId = card.blocks[0].id;
  const draft = assembleDraft(monday, card, {
    caption: "Median hit $485K this week.",
    hashtags: ["FortMyers", "SWFLDataGulf"],
    patch: { [heroId]: { value: "$485K", label: "Median Sale Price" } },
  });
  expect(draft).not.toBeNull();
  expect((draft!.card.blocks[0].props as { value?: string }).value).toBe("$485K");
  expect(draft!.theme).toBe("Market Monday");
  expect(draft!.day).toBe("mon");
});

// ── Task 3: per-platform caption variants + goal/tone knobs ──────────────────

test("socialPostSystem layers per-network rules + goal/tone ON the four-lane block (never replaces it)", () => {
  const sys = socialPostSystem("median $485K · LeePA · 05/2026", monday.systemAddendum, {
    platforms: ["x", "linkedin"],
    goalTone: { goal: "leads", tone: "professional" },
  });
  // four-lane moat still present, layered ON (not replaced)
  expect(sys).toContain("four lanes");
  expect(sys).toContain("invented number");
  expect(sys).toContain("median $485K");
  expect(sys).toContain(monday.systemAddendum);
  // per-network variants requested for exactly the chosen platforms
  expect(sys).toContain("variants");
  expect(sys).toContain("280"); // X hard limit surfaced
  expect(sys).toContain("linkedin");
  // goal/tone knob surfaced
  expect(sys.toLowerCase()).toContain("leads");
  expect(sys.toLowerCase()).toContain("professional");
});

test("socialPostSystem with no opts is byte-identical to the 2-arg call (back-compat)", () => {
  const a = socialPostSystem("median $485K", monday.systemAddendum);
  const b = socialPostSystem("median $485K", monday.systemAddendum, {});
  expect(a).toBe(b);
  expect(a).not.toContain("variants");
});

test("tryParseSocial extracts variants for publishable platforms and drops unknown keys", () => {
  const r = tryParseSocial(
    '{"captionText":"Median hit $485K.","hashtags":["a"],"variants":{"x":"short x post","linkedin":"longer pro take","tiktok":"ignored"}}',
  );
  expect(r?.variants.x).toBe("short x post");
  expect(r?.variants.linkedin).toBe("longer pro take");
  expect((r?.variants as Record<string, unknown>).tiktok).toBeUndefined();
});

test("clampToChars trims to <=max at a word boundary so an inline citation is never cut mid-token", () => {
  const text = "Fort Myers median is $485K per Realtor.com " + "filler ".repeat(80);
  const out = clampToChars(text, 280);
  expect(out.length).toBeLessThanOrEqual(280);
  expect(out.endsWith(" ")).toBe(false);
  expect(text.startsWith(out)).toBe(true); // prefix only — never invents
  expect(out).toContain("Realtor.com"); // citation survives the cut
});

test("buildVariants: X clamped <=280, requested platform without an AI variant falls back to the generic caption (google_business gap safety)", () => {
  const xLong = "Fort Myers median is $485K per Realtor.com. " + "more ".repeat(80); // > 280 chars
  const out = buildVariants(
    "Median hit $485K this week.",
    { x: xLong, linkedin: "A professional, longer-form take on the $485K median." },
    ["x", "linkedin", "google_business"],
  );
  expect(out.x!.length).toBeLessThanOrEqual(280);
  expect(out.linkedin).not.toBe(out.x);
  // google_business has no AI variant AND no platforms.ts registry entry -> caption fallback, never a crash
  expect(out.google_business).toBe("Median hit $485K this week.");
});

test("assembleDraft attaches variants for the requested platforms; omits them when none requested", () => {
  const card = seedSocialCard(monday);
  const heroId = card.blocks[0].id;
  const parsed = {
    caption: "Median hit $485K this week.",
    hashtags: ["FortMyers"],
    patch: { [heroId]: { value: "$485K" } },
    variants: {
      x: "Fort Myers median $485K per Realtor.com. " + "more ".repeat(80),
      linkedin: "Professional longer-form LinkedIn take on the $485K median.",
    } as Record<string, string>,
  };
  const tailored = assembleDraft(monday, card, parsed, ["x", "linkedin"]);
  expect(tailored).not.toBeNull();
  expect(tailored!.variants!.x!.length).toBeLessThanOrEqual(280);
  expect(tailored!.variants!.linkedin).not.toBe(tailored!.variants!.x);

  // back-compat: 3-arg call (no platforms) yields no variants
  const generic = assembleDraft(monday, card, { caption: "x", hashtags: [], patch: {} });
  expect(generic!.variants).toBeUndefined();
});
