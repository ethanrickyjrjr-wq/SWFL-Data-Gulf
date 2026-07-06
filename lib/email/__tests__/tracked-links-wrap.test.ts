import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { wrapTrackedLink } from "../tracked-links/wrap";
import { verifyLinkToken, type LinkContext } from "../tracked-links/token";

const CTX: LinkContext = { rid: "rec-1", cid: "camp-a", step: 1, bk: "cta", ch: "email" };
const ORIGIN = "https://www.swfldatagulf.com";
let prevSecret: string | undefined;

beforeAll(() => {
  prevSecret = process.env.SDG_COOKIE_SECRET;
  process.env.SDG_COOKIE_SECRET = "test-secret-for-tracked-links";
});
afterAll(() => {
  if (prevSecret === undefined) delete process.env.SDG_COOKIE_SECRET;
  else process.env.SDG_COOKIE_SECRET = prevSecret;
});

describe("tracked-links/wrap", () => {
  test("replaces the destination href with a signed /api/r/ link that decodes back", () => {
    const dest = "https://www.swfldatagulf.com/welcome?name=Foo&zip=33901";
    const html = `<a href="${dest}" style="color:blue">Create your own report</a>`;
    const out = wrapTrackedLink(html, dest, CTX, ORIGIN);

    expect(out.token).toBeTruthy();
    expect(out.html).not.toContain(dest);
    expect(out.html).toContain(`${ORIGIN}/api/r/${out.token}`);
    // The label + surrounding markup are untouched — only the URL changed.
    expect(out.html).toContain(">Create your own report</a>");
    expect(out.html).toContain(`style="color:blue"`);

    const v = verifyLinkToken(out.token!);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.dest).toBe(dest);
      expect(v.ctx).toEqual(CTX);
    }
  });

  test("also matches the &amp;-escaped form of the URL", () => {
    const dest = "https://x.test/welcome?a=1&b=2";
    const html = `<a href="https://x.test/welcome?a=1&amp;b=2">go</a>`;
    const out = wrapTrackedLink(html, dest, CTX, ORIGIN);
    expect(out.token).toBeTruthy();
    expect(out.html).toContain(`${ORIGIN}/api/r/${out.token}`);
    expect(out.html).not.toContain("a=1&amp;b=2");
  });

  test("destination absent from the html → unchanged, nothing minted", () => {
    const html = `<a href="https://other.test/x">go</a>`;
    const out = wrapTrackedLink(html, "https://x.test/missing", CTX, ORIGIN);
    expect(out.token).toBeNull();
    expect(out.html).toBe(html);
  });

  test("empty destination → unchanged, nothing minted", () => {
    const html = `<p>no link</p>`;
    const out = wrapTrackedLink(html, "", CTX, ORIGIN);
    expect(out.token).toBeNull();
    expect(out.html).toBe(html);
  });

  test("no signing secret → raw link ships untracked (unchanged, no token)", () => {
    const saved = process.env.SDG_COOKIE_SECRET;
    delete process.env.SDG_COOKIE_SECRET;
    try {
      const dest = "https://x.test/a";
      const html = `<a href="${dest}">go</a>`;
      const out = wrapTrackedLink(html, dest, CTX, ORIGIN);
      expect(out.token).toBeNull();
      expect(out.html).toBe(html); // unchanged — degrade to an untracked but working link
    } finally {
      process.env.SDG_COOKIE_SECRET = saved;
    }
  });
});
