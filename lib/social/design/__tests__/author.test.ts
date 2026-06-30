// lib/social/design/__tests__/author.test.ts
import { test, expect } from "bun:test";
import {
  tryParseSocialAuthor,
  pickFormat,
  attachListingPhoto,
  authorSocialSystem,
} from "@/lib/social/design/author";
import {
  getTemplate,
  offerableTemplates,
  type TemplateTokens,
} from "@/lib/social/design/templates";
import type { Listing } from "@/lib/listings/rentcast";

const TOKENS: TemplateTokens = { primary: "#0f1d24", accent: "#0ea5b7", text: "#fff" };

test("tryParseSocialAuthor parses templateId / format / patch / caption / hashtags / variants", () => {
  const text = `Here you go:\n{"templateId":"stat-hero","format":"portrait","captionText":"Naples median is up.","hashtags":["Naples","SWFL","realestate"],"patch":{"stat":{"value":"$412K","label":"median"},"headline":{"text":"Naples is moving"}},"variants":{"x":"short","tiktok":"dropped"}}`;
  const p = tryParseSocialAuthor(text);
  expect(p).not.toBeNull();
  expect(p!.templateId).toBe("stat-hero");
  expect(p!.format).toBe("portrait");
  expect(p!.caption).toBe("Naples median is up.");
  expect(p!.hashtags).toEqual(["Naples", "SWFL", "realestate"]);
  expect(p!.patch.stat.value).toBe("$412K");
  expect(p!.variants.x).toBe("short");
  // tiktok is not a publishable platform → dropped
  expect("tiktok" in p!.variants).toBe(false);
});

test("tryParseSocialAuthor returns null without a templateId (a miss)", () => {
  expect(tryParseSocialAuthor(`{"captionText":"hi","patch":{}}`)).toBeNull();
});

test("tryParseSocialAuthor returns null on non-JSON", () => {
  expect(tryParseSocialAuthor("the model refused")).toBeNull();
});

test("pickFormat honors the model's choice only when the template offers it", () => {
  const t = getTemplate("stat-hero")!; // formats: square, portrait, story
  expect(pickFormat(t, "portrait")).toBe("portrait"); // model valid + offered
  expect(pickFormat(t, "landscape")).toBe("square"); // model picked a non-offered format → default
  expect(pickFormat(t, "bogus", "story")).toBe("story"); // invalid model → requested (offered)
  expect(pickFormat(t, undefined, "landscape")).toBe("square"); // requested not offered → default
  expect(pickFormat(t)).toBe("square"); // nothing → first declared format
});

test("attachListingPhoto sets the MLS photo into the image slot, leaves text untouched", () => {
  const design = getTemplate("listing-feature")!.build(TOKENS, "square");
  const listing = { photoUrl: "https://mls/p.jpg" } as Listing;
  const out = attachListingPhoto(design, listing);
  const img = out.elements.find((e) => e.id === "image")!;
  expect(img.type === "image" && img.src).toBe("https://mls/p.jpg");
  // the other elements are unchanged objects/ids
  expect(out.elements.map((e) => e.id)).toEqual(design.elements.map((e) => e.id));
});

test("attachListingPhoto leaves the design unchanged with no photo and no coords", () => {
  const design = getTemplate("listing-feature")!.build(TOKENS, "square");
  const listing = {} as Listing; // no photoUrl, no lat/lon
  const out = attachListingPhoto(design, listing);
  const img = out.elements.find((e) => e.id === "image")!;
  expect(img.type === "image" && img.src).toBe("");
});

test("authorSocialSystem appends project-file text as an EQUAL source, lists templates + four-lane rules", () => {
  const templates = offerableTemplates(); // stat-hero, headline-cta, three-stat
  const withFiles = authorSocialSystem({
    templates,
    tokens: TOKENS,
    lakeContext: "Naples median: $412K · RentCast · 06/30/2026",
    filesText: 'DOCUMENT "flood.pdf":\nAnnual loss estimate $8,400 for 33931.',
    platforms: ["x", "instagram"],
  });
  // files are framed as DATA and present
  expect(withFiles).toContain("PROJECT FILES");
  expect(withFiles).toContain("$8,400");
  // every offered template id is in the menu
  for (const t of templates) expect(withFiles).toContain(t.id);
  // the four-lane no-invention rules ride along
  expect(withFiles).toContain("invented number");
  // requested platform variant keys are named
  expect(withFiles).toContain("instagram");

  // with no files, the PROJECT FILES block is absent (no empty header)
  const noFiles = authorSocialSystem({ templates, tokens: TOKENS, lakeContext: "x" });
  expect(noFiles).not.toContain("PROJECT FILES");
});
