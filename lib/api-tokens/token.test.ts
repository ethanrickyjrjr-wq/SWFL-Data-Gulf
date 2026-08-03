// lib/api-tokens/token.test.ts
// Guards: failure mode 6 (token abuse → hashed at rest, prefix-checked) and
// 5 (cross-user: resolveTokenUser returns the token's OWN user, never a default).
import { describe, expect, test } from "bun:test";
import { hashToken, mintToken, resolveTokenUser } from "./token";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";

function fakeAdmin(rows: Array<{ token_hash: string; user_id: string }>) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, hash: string) => ({
          maybeSingle: async () => ({
            data: rows.find((r) => r.token_hash === hash) ?? null,
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  } as unknown as SupabaseClient<Database>;
}

describe("api tokens", () => {
  test("mintToken → sdg_ prefix + 64 hex chars; hash is stable sha256 hex", () => {
    const t = mintToken();
    expect(t).toMatch(/^sdg_[0-9a-f]{64}$/);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
  });
  test("resolveTokenUser finds the row by hash and returns its user_id", async () => {
    const t = mintToken();
    const admin = fakeAdmin([{ token_hash: hashToken(t), user_id: "user-9" }]);
    expect(await resolveTokenUser(admin, `Bearer ${t}`)).toBe("user-9");
  });
  test("wrong token, wrong prefix, or missing header → null", async () => {
    const admin = fakeAdmin([]);
    expect(await resolveTokenUser(admin, "Bearer sdg_" + "0".repeat(64))).toBeNull();
    expect(await resolveTokenUser(admin, "Bearer not-our-prefix")).toBeNull();
    expect(await resolveTokenUser(admin, null)).toBeNull();
  });
});
