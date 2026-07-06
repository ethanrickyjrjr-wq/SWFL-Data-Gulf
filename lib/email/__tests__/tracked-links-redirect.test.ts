import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { resolveTrackedRedirect } from "../tracked-links/redirect";
import { signLinkToken, type LinkContext } from "../tracked-links/token";

const CTX: LinkContext = { rid: "rec-1", cid: "camp-a", step: 3, bk: "cta", ch: "email" };
const SITE = "https://www.swfldatagulf.com";
let prevSecret: string | undefined;

beforeAll(() => {
  prevSecret = process.env.SDG_COOKIE_SECRET;
  process.env.SDG_COOKIE_SECRET = "test-secret-for-tracked-links";
});
afterAll(() => {
  if (prevSecret === undefined) delete process.env.SDG_COOKIE_SECRET;
  else process.env.SDG_COOKIE_SECRET = prevSecret;
});

describe("tracked-links/redirect", () => {
  test("valid token → 302 to the destination + a clicked row to log", () => {
    const dest = "https://www.swfldatagulf.com/welcome?zip=33901";
    const token = signLinkToken(dest, CTX)!;
    const r = resolveTrackedRedirect(token, { siteOrigin: SITE });
    expect(r.location).toBe(dest);
    expect(r.log).toEqual({ dest, ctx: CTX });
  });

  test("tampered token → safe-fallback to the homepage, nothing logged", () => {
    const token = signLinkToken("https://x.test/a", CTX)!;
    const sig = token.slice(token.lastIndexOf(".") + 1);
    const forged = Buffer.from(
      JSON.stringify({ v: 1, d: "https://evil.test/steal", c: CTX, iat: 0 }),
    ).toString("base64url");
    const r = resolveTrackedRedirect(`${forged}.${sig}`, { siteOrigin: SITE });
    expect(r.location).toBe(SITE);
    expect(r.log).toBeNull();
  });

  test("malformed token → same safe-fallback path, nothing logged", () => {
    const r = resolveTrackedRedirect("not-a-token", { siteOrigin: SITE });
    expect(r.location).toBe(SITE);
    expect(r.log).toBeNull();
  });
});
