import { describe, expect, it } from "bun:test";
import { buildContentDeps } from "./brain-fetch";
import type { BrainDossier } from "./build-content";

/** A recording fake `fetch`: captures every requested URL, returns `handler`'s Response. */
function makeFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const impl = (async (input: unknown) => {
    const url = typeof input === "string" ? input : String(input);
    calls.push(url);
    return handler(url);
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Run `fn` with console.warn silenced; return the captured warning lines. */
async function captureWarn(fn: () => Promise<void>): Promise<string[]> {
  const orig = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => String(a)).join(" "));
  };
  try {
    await fn();
  } finally {
    console.warn = orig;
  }
  return warnings;
}

const FULL_PAYLOAD = {
  in_scope: true,
  freshness_token: "SWFL-7421-v5-20260620",
  conclusion: "Fort Myers Beach stays a high-value market.",
  key_metrics: [{ label: "Median home value", value: "$482K" }],
  brain_id: "master",
};

describe("buildContentDeps fetchBrain", () => {
  it("requests /api/b/master with format=json&view=speak&tier=2 and the scope params", async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    await deps.fetchBrain("zip", "33931");
    expect(calls).toEqual([
      "https://example.test/api/b/master?format=json&view=speak&tier=2&scope_kind=zip&scope_value=33931",
    ]);
  });

  it("omits scope params when scopeKind/scopeValue are null (whole region)", async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    await deps.fetchBrain(null, null);
    expect(calls).toEqual(["https://example.test/api/b/master?format=json&view=speak&tier=2"]);
  });

  it("omits scope params when only one of scopeKind/scopeValue is present (the && guard)", async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    await deps.fetchBrain("zip", null);
    expect(calls).toEqual(["https://example.test/api/b/master?format=json&view=speak&tier=2"]);
  });

  it("strips a trailing slash from siteUrl", async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
    const deps = buildContentDeps({ siteUrl: "https://example.test/", fetchImpl: impl });
    await deps.fetchBrain(null, null);
    expect(calls[0]).toBe("https://example.test/api/b/master?format=json&view=speak&tier=2");
  });

  it("maps the payload to a BrainDossier verbatim", async () => {
    const { impl } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    const dossier = await deps.fetchBrain("zip", "33931");
    expect(dossier).toEqual({
      in_scope: true,
      freshness_token: "SWFL-7421-v5-20260620",
      conclusion: "Fort Myers Beach stays a high-value market.",
      key_metrics: [{ label: "Median home value", value: "$482K" }],
      brain_id: "master",
    } satisfies BrainDossier);
  });

  it("applies defaults for a sparse payload (in_scope=false, blank token, null conclusion, empty metrics)", async () => {
    const { impl } = makeFetch(() => jsonResponse({}));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    const dossier = await deps.fetchBrain("zip", "33931");
    expect(dossier).toEqual({
      in_scope: false,
      freshness_token: "",
      conclusion: null,
      key_metrics: [],
      brain_id: undefined,
    });
  });

  it("returns null and warns on a non-ok response", async () => {
    const { impl, calls } = makeFetch(() => new Response("nope", { status: 503 }));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    let dossier: BrainDossier | null = {} as BrainDossier;
    const warnings = await captureWarn(async () => {
      dossier = await deps.fetchBrain("zip", "33931");
    });
    expect(dossier).toBeNull();
    expect(calls.length).toBe(1);
    expect(warnings.some((w) => w.includes("503"))).toBe(true);
  });

  it("returns null and warns when fetch throws (network error)", async () => {
    const { impl } = makeFetch(() => {
      throw new Error("network down");
    });
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    let dossier: BrainDossier | null = {} as BrainDossier;
    const warnings = await captureWarn(async () => {
      dossier = await deps.fetchBrain("zip", "33931");
    });
    expect(dossier).toBeNull();
    expect(warnings.some((w) => w.includes("network down"))).toBe(true);
  });

  it("caches per scope: a repeated scope is fetched once and returns the same object", async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    const a = await deps.fetchBrain("zip", "33931");
    const b = await deps.fetchBrain("zip", "33931");
    expect(calls.length).toBe(1);
    expect(b).toBe(a); // same cached object reference, not a re-derived value
  });

  it("fetches distinct scopes separately", async () => {
    const { impl, calls } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    await deps.fetchBrain("zip", "33931");
    await deps.fetchBrain("place", "naples");
    expect(calls.length).toBe(2);
  });

  it("negative-caches a failure: a failed scope is not re-fetched", async () => {
    const { impl, calls } = makeFetch(() => new Response("nope", { status: 500 }));
    const deps = buildContentDeps({ siteUrl: "https://example.test", fetchImpl: impl });
    await captureWarn(async () => {
      const a = await deps.fetchBrain("zip", "33931");
      const b = await deps.fetchBrain("zip", "33931");
      expect(a).toBeNull();
      expect(b).toBeNull();
    });
    expect(calls.length).toBe(1);
  });

  it("defaults siteUrl to NEXT_PUBLIC_SITE_URL when no override is given", async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.swfldatagulf.com/";
    try {
      const { impl, calls } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
      const deps = buildContentDeps({ fetchImpl: impl });
      await deps.fetchBrain(null, null);
      expect(calls[0]).toBe(
        "https://www.swfldatagulf.com/api/b/master?format=json&view=speak&tier=2",
      );
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  it("falls back to http://localhost:3000 when no siteUrl and no env are set", async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      const { impl, calls } = makeFetch(() => jsonResponse(FULL_PAYLOAD));
      const deps = buildContentDeps({ fetchImpl: impl });
      await deps.fetchBrain(null, null);
      expect(calls[0]).toBe("http://localhost:3000/api/b/master?format=json&view=speak&tier=2");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });
});
