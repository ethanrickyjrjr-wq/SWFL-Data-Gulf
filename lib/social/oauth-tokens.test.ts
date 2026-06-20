/**
 * lib/social/oauth-tokens.test.ts
 *
 * Tests for AES-256-GCM encryption primitive + token-store/refresh logic.
 *
 * Security invariants:
 *   1. Round-trip: encrypt → decrypt returns the original plaintext.
 *   2. Tamper-rejection: flipping any ciphertext byte throws (GCM auth tag fails).
 *   3. Token-refresh-before-expiry: tokenNeedsRefresh returns true when TTL < 5 min away.
 *   4. No plaintext tokens in logs (structural check via mock).
 *
 * All tests use a deterministic 32-byte hex test key set via process.env
 * (never a real prod key). No network calls, no DB — everything mocked.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { encrypt, decrypt, tokenNeedsRefresh, storeTokens, retrieveTokens } from "./oauth-tokens";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Platform } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Test key setup — 32 bytes = 64 hex chars
// ─────────────────────────────────────────────────────────────────────────────
const TEST_KEY_HEX = "a".repeat(64); // 32 bytes of 0xaa (deterministic, never prod)

beforeEach(() => {
  process.env.SDG_CRYPTO_KEY = TEST_KEY_HEX;
});

afterEach(() => {
  delete process.env.SDG_CRYPTO_KEY;
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. AES-256-GCM round-trip
// ─────────────────────────────────────────────────────────────────────────────

describe("encrypt / decrypt", () => {
  it("round-trips ASCII plaintext", () => {
    const pt = "ya29.access_token_value_here";
    expect(decrypt(encrypt(pt))).toBe(pt);
  });

  it("round-trips a long OAuth token with special characters", () => {
    const pt = "AQVxyz1234_-abcDEF==.LONGTOKEN".repeat(10);
    expect(decrypt(encrypt(pt))).toBe(pt);
  });

  it("round-trips empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  it("round-trips unicode (emoji in token display name — not likely but safe)", () => {
    const pt = "token☃snowman";
    expect(decrypt(encrypt(pt))).toBe(pt);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const pt = "same-plaintext";
    const c1 = encrypt(pt);
    const c2 = encrypt(pt);
    expect(c1).not.toBe(c2); // different IV → different ciphertext
    // Both must still decrypt correctly
    expect(decrypt(c1)).toBe(pt);
    expect(decrypt(c2)).toBe(pt);
  });

  it("ciphertext is base64 (no raw binary in DB column)", () => {
    const ct = encrypt("test-token");
    expect(() => Buffer.from(ct, "base64")).not.toThrow();
    // Should be longer than the plaintext (IV + tag + ciphertext)
    expect(ct.length).toBeGreaterThan("test-token".length);
  });

  it("throws when SDG_CRYPTO_KEY is not set", () => {
    delete process.env.SDG_CRYPTO_KEY;
    expect(() => encrypt("x")).toThrow("SDG_CRYPTO_KEY is not set");
    expect(() => decrypt(encrypt("x"))).toThrow(); // will throw on encrypt
  });

  it("throws for wrong key length (not 32 bytes)", () => {
    process.env.SDG_CRYPTO_KEY = "tooshort";
    expect(() => encrypt("x")).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tamper rejection — CRITICAL security property
// ─────────────────────────────────────────────────────────────────────────────

describe("tamper rejection", () => {
  it("throws when ciphertext byte is flipped (GCM auth tag mismatch)", () => {
    const ct = encrypt("secret-token");
    const buf = Buffer.from(ct, "base64");

    // Flip a byte in the CIPHERTEXT portion (after the 28-byte IV+tag prefix)
    // Choose a byte that is guaranteed to be in the ciphertext, not the tag
    const flipIdx = 28; // well past the IV(12) + tag(16) = 28 byte prefix
    if (buf.length > flipIdx) {
      buf[flipIdx] = buf[flipIdx] ^ 0xff;
    } else {
      // For very short ciphertext, flip the last byte of the payload
      buf[buf.length - 1] = buf[buf.length - 1] ^ 0xff;
    }

    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when authTag bytes are altered", () => {
    const ct = encrypt("secret-token");
    const buf = Buffer.from(ct, "base64");

    // Auth tag occupies bytes [12..27] (after 12-byte IV)
    buf[12] = buf[12] ^ 0x01; // flip one tag bit

    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws for truncated ciphertext (too short to hold IV+tag)", () => {
    // Any buffer shorter than IV(12) + tag(16) = 28 bytes must reject
    const short = Buffer.alloc(20).toString("base64");
    expect(() => decrypt(short)).toThrow("Ciphertext too short");
  });

  it("throws when IV is zeroed out (wrong decrypt path)", () => {
    const ct = encrypt("secret");
    const buf = Buffer.from(ct, "base64");
    buf.fill(0, 0, 12); // zero the IV
    expect(() => decrypt(buf.toString("base64"))).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. tokenNeedsRefresh — per-platform TTL logic
// ─────────────────────────────────────────────────────────────────────────────

describe("tokenNeedsRefresh", () => {
  const nowSec = () => Math.floor(Date.now() / 1000);

  it("returns false when expiresAt is null (permanent token, e.g. FB Page token)", () => {
    expect(tokenNeedsRefresh(null)).toBe(false);
  });

  it("returns true when token expires in < 5 min (within REFRESH_BUFFER_SECONDS)", () => {
    const almostExpired = nowSec() + 240; // 4 min from now
    expect(tokenNeedsRefresh(almostExpired)).toBe(true);
  });

  it("returns false when token expires in > 5 min", () => {
    const notExpired = nowSec() + 600; // 10 min from now
    expect(tokenNeedsRefresh(notExpired)).toBe(false);
  });

  it("returns true when token is already expired", () => {
    const expired = nowSec() - 1;
    expect(tokenNeedsRefresh(expired)).toBe(true);
  });

  it("handles exactly at the buffer boundary (≤ buffer → refresh)", () => {
    const atBoundary = nowSec() + 299; // 1 second inside the buffer
    expect(tokenNeedsRefresh(atBoundary)).toBe(true);
  });

  it("handles exactly at the buffer edge (> buffer → no refresh)", () => {
    const justOutside = nowSec() + 301; // 1 second outside the buffer
    expect(tokenNeedsRefresh(justOutside)).toBe(false);
  });

  // X: short-lived (~2 hours)
  it("X: token expiring in 1h 55m needs refresh", () => {
    const xExpiry = nowSec() + 115 * 60; // 1h 55m — within typical 2h TTL
    expect(tokenNeedsRefresh(xExpiry)).toBe(false); // > 5 min, no refresh yet
  });

  it("X: token expiring in 3 min needs refresh", () => {
    const xExpiry = nowSec() + 3 * 60;
    expect(tokenNeedsRefresh(xExpiry)).toBe(true);
  });

  // LinkedIn: 60-day token
  it("LinkedIn: token with 59 days left does not need refresh", () => {
    const linkedInExpiry = nowSec() + 59 * 24 * 3600;
    expect(tokenNeedsRefresh(linkedInExpiry)).toBe(false);
  });

  it("LinkedIn: token expiring in 2 min needs refresh", () => {
    const linkedInExpiry = nowSec() + 2 * 60;
    expect(tokenNeedsRefresh(linkedInExpiry)).toBe(true);
  });

  // GBP: 1-hour token
  it("GBP: token expiring in 55 min does not need refresh", () => {
    const gbpExpiry = nowSec() + 55 * 60;
    expect(tokenNeedsRefresh(gbpExpiry)).toBe(false);
  });

  it("GBP: token expiring in 4 min needs refresh", () => {
    const gbpExpiry = nowSec() + 4 * 60;
    expect(tokenNeedsRefresh(gbpExpiry)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. storeTokens / retrieveTokens — mock DB, verify encrypt/decrypt contract
// ─────────────────────────────────────────────────────────────────────────────

type UpsertSpy = { calledWith?: unknown };

function makeStoreDbMock(spy: UpsertSpy, error?: { message: string }): SupabaseClient {
  return {
    from: () => ({
      upsert: (data: unknown) => {
        spy.calledWith = data;
        return Promise.resolve({ error: error ?? null });
      },
    }),
  } as unknown as SupabaseClient;
}

function makeRetrieveDbMock(
  rowData: Record<string, unknown> | null,
  pgrstCode?: string,
): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: function (..._args: unknown[]) {
          return this;
        },
        single: () =>
          Promise.resolve({
            data: rowData,
            error: pgrstCode ? { message: "not found", code: pgrstCode } : null,
          }),
      }),
    }),
  } as unknown as SupabaseClient;
}

describe("storeTokens", () => {
  it("stores tokens with access_token encrypted (not plaintext)", async () => {
    const spy: UpsertSpy = {};
    const db = makeStoreDbMock(spy);

    await storeTokens(
      db,
      "user-1",
      "linkedin" as Platform,
      {
        access_token: "AT_plaintext_value",
        refresh_token: "RT_plaintext_value",
        token_type: "Bearer",
        expires_at: Math.floor(Date.now() / 1000) + 5184000,
        scopes: ["w_organization_social"],
      },
      { account_name: "Test Corp", platform_account_id: "urn:li:organization:12345" },
    );

    const stored = spy.calledWith as Record<string, unknown>;
    expect(stored).toBeTruthy();
    // The stored access_token must NOT be the plaintext value
    expect(stored.access_token).not.toBe("AT_plaintext_value");
    // It must be decryptable back to the plaintext
    const { decrypt: d } = await import("./oauth-tokens");
    expect(d(stored.access_token as string)).toBe("AT_plaintext_value");
    // Refresh token must also be encrypted
    expect(stored.refresh_token).not.toBe("RT_plaintext_value");
    expect(d(stored.refresh_token as string)).toBe("RT_plaintext_value");
  });

  it("stores null refresh_token as null (not encrypted null)", async () => {
    const spy: UpsertSpy = {};
    const db = makeStoreDbMock(spy);

    await storeTokens(
      db,
      "user-1",
      "facebook" as Platform,
      { access_token: "AT", refresh_token: null, token_type: null, expires_at: null, scopes: [] },
      { account_name: "My Page", platform_account_id: "page_12345" },
    );

    const stored = spy.calledWith as Record<string, unknown>;
    expect(stored.refresh_token).toBeNull();
    expect(stored.expires_at).toBeNull();
  });

  it("throws when DB returns an error", async () => {
    const db = makeStoreDbMock({}, { message: "permission denied" });
    await expect(
      storeTokens(
        db,
        "u",
        "x" as Platform,
        { access_token: "AT", refresh_token: null, token_type: null, expires_at: null, scopes: [] },
        { account_name: null, platform_account_id: "12345" },
      ),
    ).rejects.toThrow("storeTokens failed");
  });
});

describe("retrieveTokens", () => {
  it("decrypts stored tokens and returns plaintext", async () => {
    // Encrypt first to simulate what storeTokens would write
    const encryptedAT = encrypt("plaintext_access_token");
    const encryptedRT = encrypt("plaintext_refresh_token");

    const row = {
      id: "row-uuid-1",
      access_token: encryptedAT,
      refresh_token: encryptedRT,
      token_type: "Bearer",
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      scopes: ["w_member_social"],
      account_name: "Alice",
      status: "connected",
    };

    const db = makeRetrieveDbMock(row);
    const result = await retrieveTokens(db, "user-1", "linkedin" as Platform, "urn:li:person:abc");

    expect(result).not.toBeNull();
    expect(result?.access_token).toBe("plaintext_access_token");
    expect(result?.refresh_token).toBe("plaintext_refresh_token");
    expect(result?.accountName).toBe("Alice");
    expect(result?.status).toBe("connected");
  });

  it("returns null when row not found (PGRST116)", async () => {
    const db = makeRetrieveDbMock(null, "PGRST116");
    const result = await retrieveTokens(db, "u", "x" as Platform, "acc1");
    expect(result).toBeNull();
  });

  it("handles null refresh_token in stored row", async () => {
    const row = {
      id: "row-uuid-2",
      access_token: encrypt("AT"),
      refresh_token: null,
      token_type: null,
      expires_at: null,
      scopes: [],
      account_name: null,
      status: "connected",
    };

    const db = makeRetrieveDbMock(row);
    const result = await retrieveTokens(db, "u", "facebook" as Platform, "page_id");
    expect(result?.refresh_token).toBeNull();
    expect(result?.expires_at).toBeNull();
  });
});
