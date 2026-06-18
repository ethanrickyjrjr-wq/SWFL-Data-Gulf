import Anthropic from "@anthropic-ai/sdk";
import { getAnthropic, TRIAGE_MODEL } from "@/refinery/agents/anthropic.mts";

export type BrandEnrichment = {
  primary: string | null;
  secondary: string | null;
  logo_url: string | null;
  confidence: number; // 0..1; 0 on fallback
  source: "direct-scrape+haiku" | "fallback";
  company_name?: string | null;
};

export type EnrichDeps = {
  fetchImpl?: typeof fetch;
  anthropic?: Pick<Anthropic, "messages">;
};

const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

const FALLBACK: BrandEnrichment = {
  primary: null,
  secondary: null,
  logo_url: null,
  confidence: 0,
  source: "fallback",
  company_name: null,
};

const SELECT_BRAND_TOOL = {
  name: "select_brand",
  description: "Record the company's real brand identity selected from the labeled signals.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      primary_hex: {
        type: "string",
        description:
          "Dominant brand color as #RRGGBB. Never a neutral white/black/near-gray or the background.",
      },
      secondary_hex: {
        type: "string",
        description: "Complementary brand color #RRGGBB, or empty string.",
      },
      logo_url: {
        type: "string",
        description:
          "Best logo URL (prefer images.logo, else ogImage, else favicon), or empty string.",
      },
      company_name: {
        type: "string",
        description:
          "Company/brand name from images.logoAlt or the domain; empty string if unknown.",
      },
      confidence: {
        type: "number",
        description: "0..1 confidence the chosen colors are the real brand colors.",
      },
    },
    required: ["primary_hex", "secondary_hex", "logo_url", "company_name", "confidence"],
  },
} as const;

function normDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}
function absUrl(href: string, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}
function hexOrNull(v: unknown): string | null {
  return typeof v === "string" && HEX_RE.test(v) ? v : null;
}

/**
 * Hybrid prospect brand enrichment. Direct page fetch extracts meta-tag signals;
 * claude-haiku-4-5 selects the real primary/secondary from them.
 * Network I/O but no app coupling — deps are injectable for tests. NEVER throws and
 * NEVER applies SWFL defaults: any failure returns nulls + source "fallback".
 */
export async function enrichBrand(domain: string, deps: EnrichDeps = {}): Promise<BrandEnrichment> {
  const fetchImpl = deps.fetchImpl ?? fetch;

  const d = normDomain(domain);
  const base = `https://${d}`;

  let html = "";
  try {
    const res = await fetchImpl(base, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SWFL-Branding/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return FALLBACK;
    html = await res.text();
  } catch {
    return FALLBACK;
  }

  // Extract branding signals from meta tags + inline styles
  const themeColor =
    html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const favicon =
    html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
    html.match(
      /<link[^>]+href=["']([^"']+\.(?:ico|png|svg))["'][^>]+rel=["'](?:shortcut )?icon["']/i,
    )?.[1] ??
    "";
  const siteName =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  const twitterImage =
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
  // CSS custom properties — grab first few --color-* / --brand-* values from inline styles
  const cssColors = [
    ...html.matchAll(/--(?:color|brand|primary|accent)-\w+\s*:\s*(#[0-9a-fA-F]{3,8})/g),
  ]
    .slice(0, 8)
    .map((m) => m[1]);

  const candidates = {
    domain: d,
    theme_color: themeColor,
    og_image: ogImage,
    favicon: favicon ? absUrl(favicon, base) : "",
    twitter_image: twitterImage,
    site_name: siteName,
    css_colors: cssColors,
  };

  let input: Record<string, unknown> = {};
  try {
    const client = deps.anthropic ?? getAnthropic();
    const msg = await client.messages.create({
      model: TRIAGE_MODEL,
      max_tokens: 300,
      tools: [SELECT_BRAND_TOOL as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: "select_brand" },
      messages: [
        {
          role: "user",
          content:
            `Select the REAL brand identity for ${d} from these page signals. ` +
            `Pick the dominant brand color (never a neutral white/black/near-gray or the background) as primary_hex, ` +
            `a complementary secondary_hex if present, the best logo_url (og_image or favicon), ` +
            `the company_name (from site_name), and a confidence 0..1.\n\n` +
            JSON.stringify(candidates).slice(0, 8_000),
        },
      ],
    });
    const block = msg.content.find((b) => b.type === "tool_use") as
      | Anthropic.ToolUseBlock
      | undefined;
    input = (block?.input ?? {}) as Record<string, unknown>;
  } catch {
    return FALLBACK;
  }

  const rawLogo =
    (typeof input.logo_url === "string" && input.logo_url) ||
    ogImage ||
    (favicon ? absUrl(favicon, base) : "") ||
    "";
  const company =
    typeof input.company_name === "string" && input.company_name.trim()
      ? input.company_name.trim()
      : null;

  return {
    primary: hexOrNull(input.primary_hex),
    secondary: hexOrNull(input.secondary_hex),
    logo_url: absUrl(String(rawLogo), base),
    confidence: typeof input.confidence === "number" ? input.confidence : 0,
    source: "direct-scrape+haiku",
    company_name: company,
  };
}
