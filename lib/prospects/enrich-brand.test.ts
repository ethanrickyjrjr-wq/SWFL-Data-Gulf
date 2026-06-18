import { test, expect } from "bun:test";
import { enrichBrand, type EnrichDeps } from "./enrich-brand";

function htmlOk(html: string): typeof fetch {
  return (async () => new Response(html, { status: 200 })) as unknown as typeof fetch;
}

function anthropicReturning(input: Record<string, unknown>) {
  return {
    messages: {
      create: async () => ({ content: [{ type: "tool_use", name: "select_brand", input }] }),
    },
  } as unknown as EnrichDeps["anthropic"];
}

const C21_HTML = `<html><head>
<meta name="theme-color" content="#BEAF87">
<meta property="og:image" content="https://www.century21.com/images/home/C21/home-image-600.webp">
<meta property="og:site_name" content="Century 21">
<link rel="icon" href="https://www.century21.com/favicon/C21-favicon.ico">
<style>:root { --color-primary: #BEAF87; --color-accent: #262627; }</style>
</head><body></body></html>`;

test("extracts real brand color from theme-color + CSS vars (C21 gold)", async () => {
  const out = await enrichBrand("century21.com", {
    fetchImpl: htmlOk(C21_HTML),
    anthropic: anthropicReturning({
      primary_hex: "#BEAF87",
      secondary_hex: "#262627",
      logo_url: "https://www.century21.com/images/home/C21/home-image-600.webp",
      company_name: "Century 21",
      confidence: 0.85,
    }),
  });
  expect(out.primary).toBe("#BEAF87");
  expect(out.source).toBe("direct-scrape+haiku");
  expect(out.logo_url).toContain("home-image-600.webp");
  expect(out.company_name).toBe("Century 21");
});

test("non-2xx response → fallback nulls, confidence 0", async () => {
  const out = await enrichBrand("example.com", {
    fetchImpl: (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch,
    anthropic: anthropicReturning({}),
  });
  expect(out).toMatchObject({
    primary: null,
    secondary: null,
    logo_url: null,
    confidence: 0,
    source: "fallback",
  });
});

test("fetch throws (network error) → fallback", async () => {
  const out = await enrichBrand("nobrand.com", {
    fetchImpl: (() => {
      throw new Error("network error");
    }) as unknown as typeof fetch,
    anthropic: anthropicReturning({}),
  });
  expect(out.source).toBe("fallback");
});

test("haiku throws → fallback", async () => {
  const out = await enrichBrand("x.com", {
    fetchImpl: htmlOk("<html><body></body></html>"),
    anthropic: {
      messages: {
        create: async () => {
          throw new Error("quota");
        },
      },
    } as unknown as EnrichDeps["anthropic"],
  });
  expect(out.source).toBe("fallback");
});

test("non-hex primary from Haiku → null; relative favicon absolutized", async () => {
  const html = `<html><head>
    <meta name="theme-color" content="#2EA3F2">
    <link rel="icon" href="/wp-content/logo.png">
  </head><body></body></html>`;
  const out = await enrichBrand("sagerealtor.com", {
    fetchImpl: htmlOk(html),
    anthropic: anthropicReturning({
      primary_hex: "teal",
      secondary_hex: "",
      logo_url: "",
      company_name: "",
      confidence: 0.3,
    }),
  });
  expect(out.primary).toBeNull(); // "teal" fails HEX_RE
  expect(out.logo_url).toBe("https://sagerealtor.com/wp-content/logo.png");
  expect(out.company_name).toBeNull();
});
