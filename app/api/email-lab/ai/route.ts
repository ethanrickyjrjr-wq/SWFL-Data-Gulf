import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystem(lakeContext?: string): string {
  const dataBlock = lakeContext
    ? `\n\nREAL LAKE DATA (use these numbers — do not invent):\n${lakeContext}\n`
    : "";

  return `You are an email design assistant for SWFL Data Gulf, a Southwest Florida real estate intelligence platform.

The user will describe the email they want. Return ONLY a valid JSON object with updated token values — no markdown, no explanation.${dataBlock}

Available tokens:
- COMPANY_NAME, TAGLINE, WEBSITE_URL, CONTACT_EMAIL
- HERO_KICKER (e.g. "Market Spotlight", "Weekly Digest", "Just Sold Alert")
- HERO_VALUE (the big number or stat — e.g. "$485K", "34 days", "↑ 12%")
- HERO_LABEL (what the value measures — e.g. "Median Sale Price · Lee County")
- HERO_PROSE (2-3 sentence summary, conversational, no jargon)
- STAT1_VALUE, STAT1_LABEL, STAT2_VALUE, STAT2_LABEL, STAT3_VALUE, STAT3_LABEL
- SIGNAL_KICKER (e.g. "Signal to Watch")
- SIGNAL_TITLE (short, punchy headline)
- SIGNAL_BODY (2-3 sentences, concrete detail)

Rules:
- ${lakeContext ? "Prefer the REAL LAKE DATA numbers above over anything invented" : "Use real-sounding SWFL data (Lee County, Collier County, Cape Coral, Fort Myers, Naples, Bonita Springs, etc.)"}
- Numbers must be plausible (median price $300K–$600K, DOM 20–90 days, etc.)
- Keep prose tight — no fluff
- Return only the tokens you're changing, not all of them`;
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.swfldatagulf.com";

async function fetchLakeContext(scope?: { kind?: string; value?: string }): Promise<string> {
  try {
    const params = new URLSearchParams({ view: "speak", tier: "1", v: "5" });
    if (scope?.kind === "zip" && scope.value) params.set("zip", scope.value);
    else if (scope?.kind === "county" && scope.value) params.set("county", scope.value);
    // region / place / undefined → no extra param, master returns SWFL-wide data
    const res = await fetch(`${BASE_URL}/api/b/master?${params}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return "";
    const text = await res.text();
    // Trim to first 2000 chars — enough for key metrics, not the full dossier
    return text.slice(0, 2000);
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  const { prompt, currentTokens, scope } = (await req.json()) as {
    prompt: string;
    currentTokens?: Record<string, string>;
    scope?: { kind?: string; value?: string };
  };

  const lakeContext = scope ? await fetchLakeContext(scope) : undefined;

  const userMsg = currentTokens
    ? `Current values:\n${JSON.stringify(currentTokens, null, 2)}\n\nUser request: ${prompt}`
    : `User request: ${prompt}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: buildSystem(lakeContext || undefined),
    messages: [{ role: "user", content: userMsg }],
  });

  const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";

  let tokens: Record<string, string> = {};
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    tokens = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    // Return empty update if parse fails
  }

  return NextResponse.json({ tokens });
}
