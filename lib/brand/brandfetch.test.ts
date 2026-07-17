// lib/brand/brandfetch.test.ts
import { describe, expect, it, mock, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mapBrandfetchResponse,
  fetchBrandKit,
  fillEmptyBrandFields,
  type BrandfetchBrand,
} from "./brandfetch";

const SAMPLE_PATH = join(
  process.cwd(),
  "scripts",
  "outreach",
  "__fixtures__",
  "brandfetch-sample.json",
);
const SAMPLE = JSON.parse(readFileSync(SAMPLE_PATH, "utf8")) as BrandfetchBrand;

describe("mapBrandfetchResponse (real probe fixture)", () => {
  it("extracts logoUrl preferring a transparent SVG/PNG format", () => {
    const kit = mapBrandfetchResponse(SAMPLE);
    // First logos[] entry (light theme) has a transparent SVG first in its
    // formats[] -- the fixture's own first-and-transparent match.
    expect(kit.logoUrl).toBe(
      "https://cdn.brandfetch.io/idL0iThUh6/theme/light/logo.svg?c=1bxetk31i42hlwc245ud97rs7rgBlODsoYL",
    );
  });

  it("extracts colors as valid 6-digit hex, brand-typed first", () => {
    const kit = mapBrandfetchResponse(SAMPLE);
    expect(kit.colors.length).toBeGreaterThan(0);
    for (const c of kit.colors) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
    // Fixture's first `type:"brand"` color is #00193E (the #0084ff entry is
    // type:"accent", listed first in the raw array but not brand-primary).
    expect(kit.colors[0]).toBe("#00193E");
  });

  it("extracts font names", () => {
    const kit = mapBrandfetchResponse(SAMPLE);
    expect(kit.fonts).toEqual(["Inter", "Poppins"]);
  });

  it("no colors -> empty array, never invented", () => {
    const kit = mapBrandfetchResponse({ ...SAMPLE, colors: [] });
    expect(kit.colors).toEqual([]);
  });

  it("no logos -> null logoUrl", () => {
    const kit = mapBrandfetchResponse({ ...SAMPLE, logos: [] });
    expect(kit.logoUrl).toBeNull();
  });

  it("filters out non-hex color entries", () => {
    const kit = mapBrandfetchResponse({
      ...SAMPLE,
      colors: [{ hex: "not-a-color" }, { hex: "#ABCDEF", type: "brand" }],
    });
    expect(kit.colors).toEqual(["#ABCDEF"]);
  });
});

const ORIGINAL_KEY = process.env.brandfetch_key;
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.brandfetch_key;
  else process.env.brandfetch_key = ORIGINAL_KEY;
  // @ts-expect-error -- test-only global fetch restore
  if (globalThis.__origFetch) {
    globalThis.fetch = globalThis.__origFetch;
    // @ts-expect-error -- cleanup
    delete globalThis.__origFetch;
  }
});

function stubFetch(impl: typeof fetch) {
  // @ts-expect-error -- stash for restore in afterEach
  globalThis.__origFetch = globalThis.fetch;
  globalThis.fetch = mock(impl) as unknown as typeof fetch;
  return globalThis.fetch;
}

describe("fetchBrandKit", () => {
  it("returns null when brandfetch_key is unset", async () => {
    delete process.env.brandfetch_key;
    const f = stubFetch(async () => new Response("{}", { status: 200 }));
    const kit = await fetchBrandKit("example.com");
    expect(kit).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("returns null on a non-OK response (401/404/429/etc.)", async () => {
    process.env.brandfetch_key = "test-key";
    stubFetch(
      async () => new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }),
    );
    const kit = await fetchBrandKit("example.com");
    expect(kit).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    process.env.brandfetch_key = "test-key";
    stubFetch(async () => new Response("not json{{{", { status: 200 }));
    const kit = await fetchBrandKit("example.com");
    expect(kit).toBeNull();
  });

  it("returns null when fetch itself throws (network error)", async () => {
    process.env.brandfetch_key = "test-key";
    stubFetch(async () => {
      throw new Error("network down");
    });
    const kit = await fetchBrandKit("example.com");
    expect(kit).toBeNull();
  });

  it("maps a successful response, calling the verified endpoint + Bearer auth", async () => {
    process.env.brandfetch_key = "test-key";
    const f = stubFetch(async () => new Response(JSON.stringify(SAMPLE), { status: 200 }));
    const kit = await fetchBrandKit("brandfetch.com");
    expect(kit).not.toBeNull();
    expect(kit!.colors[0]).toBe("#00193E");
    expect(kit!.fonts).toEqual(["Inter", "Poppins"]);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brandfetch.io/v2/brands/domain/brandfetch.com");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  });
});

function fakeSupabase(existing: Record<string, unknown> | null) {
  const calls: { upserted: Record<string, unknown> | null } = { upserted: null };
  const client = {
    from(table: string) {
      expect(table).toBe("user_brand_profiles");
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: existing }) };
            },
          };
        },
        upsert(row: Record<string, unknown>, opts: { onConflict: string }) {
          expect(opts.onConflict).toBe("user_id");
          calls.upserted = row;
          return Promise.resolve({ error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

describe("fillEmptyBrandFields", () => {
  it("fills only the empty fields -- existing logo_url preserved, missing accent_color filled", async () => {
    const { client, calls } = fakeSupabase({
      logo_url: "https://existing.example/logo.png",
      primary_color: null,
      accent_color: "",
    });
    await fillEmptyBrandFields(client, "u1", {
      logoUrl: "https://brandfetch.example/new-logo.svg",
      colors: ["#111111", "#222222"],
      fonts: ["Inter"],
    });
    expect(calls.upserted).toMatchObject({
      user_id: "u1",
      primary_color: "#111111",
      accent_color: "#222222",
    });
    expect(calls.upserted).not.toHaveProperty("logo_url");
  });

  it("empty kit (no logo, no colors) writes nothing", async () => {
    const { client, calls } = fakeSupabase({});
    await fillEmptyBrandFields(client, "u1", { logoUrl: null, colors: [], fonts: [] });
    expect(calls.upserted).toBeNull();
  });

  it("never throws on a failing client (best-effort, fire-safe)", async () => {
    const broken = {
      from() {
        throw new Error("boom");
      },
    } as unknown as SupabaseClient;
    await expect(
      fillEmptyBrandFields(broken, "u1", {
        logoUrl: "https://x.example/logo.png",
        colors: ["#111111"],
        fonts: [],
      }),
    ).resolves.toBeUndefined();
  });
});
