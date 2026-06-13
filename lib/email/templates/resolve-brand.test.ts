import { describe, it, expect } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveUserBrand } from "./resolve-brand";

/**
 * Minimal fake of the Supabase query-builder chain used by resolveUserBrand:
 *   .from(table).select(cols).eq(...).eq(...).single()
 * Each table maps to the `{ data }` the terminal `.single()` should resolve to.
 * Records the user_id filter so we can assert scoping.
 */
function fakeSupabase(tables: Record<string, { data: unknown }>) {
  const calls: { table: string; filters: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select() {
          return builder;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return builder;
        },
        single() {
          calls.push({ table, filters });
          return Promise.resolve(tables[table] ?? { data: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

describe("resolveUserBrand", () => {
  it("returns the project brand when projectId is given and the project has branding", async () => {
    const { client } = fakeSupabase({
      projects: { data: { branding: { primary_color: "#0F2035", accent_color: "#1BB8C9" } } },
    });
    const brand = await resolveUserBrand(client, "user-1", "proj-1");
    expect(brand).toEqual({ primary: "#0F2035", accent: "#1BB8C9", logoUrl: null });
  });

  it("falls through to the user profile when the project has no branding", async () => {
    const { client } = fakeSupabase({
      projects: { data: { branding: null } },
      user_brand_profiles: {
        data: { primary_color: "#111111", accent_color: null, logo_url: null },
      },
    });
    const brand = await resolveUserBrand(client, "user-1", "proj-1");
    expect(brand).toEqual({ primary: "#111111", accent: null, logoUrl: null });
  });

  it("returns the user profile brand when no projectId is supplied", async () => {
    const { client, calls } = fakeSupabase({
      user_brand_profiles: {
        data: { primary_color: null, accent_color: null, logo_url: "https://cdn/logo.png" },
      },
    });
    const brand = await resolveUserBrand(client, "user-7");
    expect(brand).toEqual({ primary: null, accent: null, logoUrl: "https://cdn/logo.png" });
    // never touched projects when no projectId
    expect(calls.some((c) => c.table === "projects")).toBe(false);
    // scoped to the caller's user
    expect(calls[0].filters.user_id).toBe("user-7");
  });

  it("returns null for a new user with no brand anywhere", async () => {
    const { client } = fakeSupabase({
      projects: { data: null },
      user_brand_profiles: { data: null },
    });
    expect(await resolveUserBrand(client, "user-new", "proj-x")).toBeNull();
  });

  it("returns null when the profile row exists but every color field is empty", async () => {
    const { client } = fakeSupabase({
      user_brand_profiles: {
        data: { primary_color: null, accent_color: null, logo_url: null },
      },
    });
    expect(await resolveUserBrand(client, "user-blank")).toBeNull();
  });

  it("prefers the project brand over the user profile (most-specific wins)", async () => {
    const { client, calls } = fakeSupabase({
      projects: { data: { branding: { primary_color: "#AAAAAA" } } },
      user_brand_profiles: { data: { primary_color: "#BBBBBB" } },
    });
    const brand = await resolveUserBrand(client, "user-1", "proj-1");
    expect(brand?.primary).toBe("#AAAAAA");
    // short-circuits before reading user_brand_profiles
    expect(calls.some((c) => c.table === "user_brand_profiles")).toBe(false);
  });
});
