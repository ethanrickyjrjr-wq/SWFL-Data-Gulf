import { describe, test, expect } from "bun:test";
import {
  BUTTON_ROLES,
  type ButtonRole,
  resolveButtonDestination,
  isPlatformDestination,
  needsHouseConfirm,
  roleDestinationsFromBrand,
} from "./button-destinations";

const AGENT = "https://myagentsite.com";
const OURS = "https://www.swfldatagulf.com/r/communities-swfl/cape-coral";

describe("role roster — adding a role forces you to route it", () => {
  test("every role declares whether website_url may serve as its generic default", () => {
    for (const [role, meta] of Object.entries(BUTTON_ROLES)) {
      expect(typeof meta.usesWebsiteDefault).toBe("boolean");
      expect(meta.label.length).toBeGreaterThan(0);
      expect(role).toBe(meta.role);
    }
  });
});

describe("resolution order — ours is LAST (§3.2)", () => {
  const saved: Partial<Record<ButtonRole, string>> = { community: `${AGENT}/communities` };

  test("rung 1: the doc's own authored url wins over everything saved", () => {
    const r = resolveButtonDestination({
      role: "community",
      authoredUrl: `${AGENT}/hand-typed`,
      saved,
      websiteUrl: AGENT,
      housePage: OURS,
    });
    expect(r.url).toBe(`${AGENT}/hand-typed`);
    expect(r.rung).toBe("authored");
  });

  test("rung 2: the agent's saved destination for THAT role", () => {
    const r = resolveButtonDestination({
      role: "community",
      saved,
      websiteUrl: AGENT,
      housePage: OURS,
    });
    expect(r.url).toBe(`${AGENT}/communities`);
    expect(r.rung).toBe("saved-role");
  });

  test("rung 3: website_url serves a generic CTA with nothing saved", () => {
    const r = resolveButtonDestination({
      role: "primary-cta",
      saved,
      websiteUrl: AGENT,
      housePage: OURS,
    });
    expect(r.url).toBe(AGENT);
    expect(r.rung).toBe("website");
  });

  test("rung 3 is SKIPPED for a role whose meaning website_url cannot carry", () => {
    // A homepage is not a community page. Falling back to it would silently
    // mis-send readers, which is the granularity bug this build exists to fix.
    const r = resolveButtonDestination({
      role: "community",
      saved: {},
      websiteUrl: AGENT,
      housePage: OURS,
    });
    expect(r.url).toBe(OURS);
    expect(r.rung).toBe("house");
  });

  test("rung 4: our page is reached ONLY after every agent-owned rung is empty", () => {
    const r = resolveButtonDestination({ role: "community", saved: {}, housePage: OURS });
    expect(r.url).toBe(OURS);
    expect(r.rung).toBe("house");
  });

  test("rung 5: nothing at all is an OPEN SLOT, never a dead or house URL", () => {
    const r = resolveButtonDestination({ role: "booking", saved: {} });
    expect(r.url).toBeNull();
    expect(r.rung).toBe("open-slot");
  });

  test("a blank/whitespace saved value does not count as saved", () => {
    const r = resolveButtonDestination({
      role: "community",
      saved: { community: "   " },
      housePage: OURS,
    });
    expect(r.rung).toBe("house");
  });
});

describe("listing role — the destination travels with the listing (§3.6)", () => {
  test("two consecutive listings produce two different destinations", () => {
    const a = resolveButtonDestination({
      role: "listing",
      authoredUrl: `${AGENT}/homes/123-main-st`,
      saved: {},
    });
    const b = resolveButtonDestination({
      role: "listing",
      authoredUrl: `${AGENT}/homes/987-gulf-blvd`,
      saved: {},
    });
    expect(a.url).not.toBe(b.url);
    expect(b.url).toBe(`${AGENT}/homes/987-gulf-blvd`);
  });

  test("a listing button NEVER defaults to our site — no property_url is an open slot", () => {
    const r = resolveButtonDestination({
      role: "listing",
      saved: {},
      websiteUrl: AGENT,
      housePage: OURS,
    });
    expect(r.url).not.toBe(OURS);
    expect(r.rung).toBe("open-slot");
  });
});

describe("rename carries the destination — binding is by ROLE, never by label", () => {
  test("relabeling a button keeps the saved URL attached", () => {
    const saved: Partial<Record<ButtonRole, string>> = { community: `${AGENT}/communities` };
    const before = resolveButtonDestination({ role: "community", saved, label: "Find Out More" });
    const after = resolveButtonDestination({
      role: "community",
      saved,
      label: "See the Neighborhood",
    });
    expect(after.url).toBe(before.url);
  });
});

describe("the swfldatagulf fail-confirm (§3.4)", () => {
  test("brand user + a swfldatagulf destination raises a confirm", () => {
    expect(needsHouseConfirm({ url: OURS, hasBrand: true })).toBe(true);
  });

  test("a brandless/house send never nags", () => {
    expect(needsHouseConfirm({ url: OURS, hasBrand: false })).toBe(false);
  });

  test("an agent-owned destination never raises a confirm", () => {
    expect(needsHouseConfirm({ url: `${AGENT}/communities`, hasBrand: true })).toBe(false);
  });

  test("it is a CONFIRM, not a block — the resolver never rewrites a chosen house URL", () => {
    const r = resolveButtonDestination({ role: "community", authoredUrl: OURS, saved: {} });
    expect(r.url).toBe(OURS);
  });

  test("platform detection covers the bare apex and www, and is not fooled by a lookalike", () => {
    expect(isPlatformDestination("https://swfldatagulf.com/x")).toBe(true);
    expect(isPlatformDestination("https://www.swfldatagulf.com/x")).toBe(true);
    expect(isPlatformDestination("https://swfldatagulf.com.evil.co/x")).toBe(false);
    expect(isPlatformDestination("https://notswfldatagulf.com/x")).toBe(false);
  });
});

describe("mailto: — the engine-set reply CTA survives the overlay (regression)", () => {
  test("a saved brand destination never clobbers an engine-set mailto:", () => {
    const r = resolveButtonDestination({
      role: "primary-cta",
      authoredUrl: "mailto:agent@example.com",
      saved: { "primary-cta": `${AGENT}/book` },
      websiteUrl: AGENT,
    });
    expect(r.url).toBe("mailto:agent@example.com");
    expect(r.rung).toBe("authored");
  });
});

describe("brand round-trip", () => {
  test("reads per-role destinations off the brand blob, ignoring blanks and junk keys", () => {
    const saved = roleDestinationsFromBrand({
      button_destinations: {
        community: `${AGENT}/communities`,
        booking: "   ",
        "not-a-role": "https://x.com",
      },
    });
    expect(saved.community).toBe(`${AGENT}/communities`);
    expect(saved.booking).toBeUndefined();
    expect((saved as Record<string, string>)["not-a-role"]).toBeUndefined();
  });

  test("a brand with no map at all is empty, never a throw", () => {
    expect(roleDestinationsFromBrand(null)).toEqual({});
    expect(roleDestinationsFromBrand({})).toEqual({});
  });
});
