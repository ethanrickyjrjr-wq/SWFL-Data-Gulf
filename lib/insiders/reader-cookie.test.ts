// lib/insiders/reader-cookie.test.ts
// Failure modes covered (spec §Failure modes #3, #4): forged cookie, missing secret.
import { describe, expect, test } from "bun:test";
import {
  signReader,
  verifyReader,
  buildReaderSetCookie,
  readerCookieFromHeader,
} from "./reader-cookie";

const SECRET = "test-secret-0123456789abcdef0123456789abcdef";

describe("reader-cookie", () => {
  test("sign → verify round-trip passes", () => {
    const v = signReader("reader@example.com", SECRET);
    expect(verifyReader(v, SECRET)).toBe(true);
  });

  test("tampered value is rejected (forged-cookie failure mode)", () => {
    const v = signReader("reader@example.com", SECRET);
    const [email, sig] = v.split(".");
    expect(verifyReader(`${email}.AAAA${sig!.slice(4)}`, SECRET)).toBe(false);
    expect(verifyReader("ins=1", SECRET)).toBe(false);
    expect(verifyReader("just-a-flag", SECRET)).toBe(false);
  });

  test("wrong secret is rejected", () => {
    const v = signReader("reader@example.com", SECRET);
    expect(verifyReader(v, "another-secret")).toBe(false);
  });

  test("missing secret NEVER opens the gate (missing-env failure mode)", () => {
    const v = signReader("reader@example.com", SECRET);
    expect(verifyReader(v, undefined)).toBe(false);
    expect(verifyReader(v, "")).toBe(false);
  });

  test("missing value is rejected", () => {
    expect(verifyReader(undefined, SECRET)).toBe(false);
  });

  test("Set-Cookie header carries the hard attributes", () => {
    const h = buildReaderSetCookie("reader@example.com", SECRET);
    expect(h.startsWith("ins_reader=")).toBe(true);
    for (const attr of ["Path=/", "Max-Age=31536000", "HttpOnly", "Secure", "SameSite=Lax"]) {
      expect(h).toContain(attr);
    }
  });

  test("readerCookieFromHeader finds ins_reader among other cookies", () => {
    const v = signReader("reader@example.com", SECRET);
    expect(readerCookieFromHeader(`a=b; ins_reader=${v}; c=d`)).toBe(v);
    expect(readerCookieFromHeader("a=b; c=d")).toBeUndefined();
    expect(readerCookieFromHeader(null)).toBeUndefined();
  });
});
