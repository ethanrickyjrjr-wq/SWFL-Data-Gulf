import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { signLinkToken, verifyLinkToken, type LinkContext } from "../tracked-links/token";

const CTX: LinkContext = { rid: "rec-1", cid: "camp-a", step: 2, bk: "cta", ch: "email" };
let prevSecret: string | undefined;

beforeAll(() => {
  prevSecret = process.env.SDG_COOKIE_SECRET;
  process.env.SDG_COOKIE_SECRET = "test-secret-for-tracked-links";
});
afterAll(() => {
  if (prevSecret === undefined) delete process.env.SDG_COOKIE_SECRET;
  else process.env.SDG_COOKIE_SECRET = prevSecret;
});

describe("tracked-links/token", () => {
  test("round-trip recovers the destination + full context", () => {
    const token = signLinkToken("https://www.swfldatagulf.com/welcome?name=Foo&zip=33901", CTX)!;
    expect(token).toBeTruthy();
    const v = verifyLinkToken(token);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.dest).toBe("https://www.swfldatagulf.com/welcome?name=Foo&zip=33901");
      expect(v.ctx).toEqual(CTX);
    }
  });

  test("a null campaign/step round-trips as null (not dropped)", () => {
    const ctx: LinkContext = { rid: "r", cid: null, step: null, bk: "cta", ch: "email" };
    const v = verifyLinkToken(signLinkToken("https://x.test/a", ctx)!);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.ctx).toEqual(ctx);
  });

  test("a tampered payload fails the signature check — no throw, no leak", () => {
    const token = signLinkToken("https://x.test/a", CTX)!;
    const sig = token.slice(token.lastIndexOf(".") + 1);
    const forged = Buffer.from(
      JSON.stringify({ v: 1, d: "https://evil.test/steal", c: CTX, iat: 0 }),
    ).toString("base64url");
    const v = verifyLinkToken(`${forged}.${sig}`);
    expect(v).toEqual({ ok: false, reason: "bad_signature" });
  });

  test("garbage is malformed, not a crash", () => {
    expect(verifyLinkToken("not-a-token").ok).toBe(false);
    expect(verifyLinkToken("").ok).toBe(false);
    expect(verifyLinkToken("a.b.c.d").ok).toBe(false);
  });

  test("a valid signature is honored regardless of age (tracked links do not expire)", () => {
    const old = Date.now() - 400 * 24 * 60 * 60 * 1000; // ~13 months ago
    const token = signLinkToken("https://x.test/old", CTX, old)!;
    const v = verifyLinkToken(token);
    expect(v.ok).toBe(true); // an old newsletter link must still route, never dead-end
  });

  test("no signing secret → sign null, verify missing_secret", () => {
    const saved = process.env.SDG_COOKIE_SECRET;
    delete process.env.SDG_COOKIE_SECRET;
    try {
      expect(signLinkToken("https://x.test/a", CTX)).toBeNull();
      expect(verifyLinkToken("x.y")).toEqual({ ok: false, reason: "missing_secret" });
    } finally {
      process.env.SDG_COOKIE_SECRET = saved;
    }
  });
});
