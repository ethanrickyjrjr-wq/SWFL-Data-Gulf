// scripts/email/snicklefritz-send-preview.mts
//
// SNICKLEFRITZ preview send — builds the two branded, real-data emails and (with
// --send) delivers them to the OPERATOR'S inboxes only. NEVER the agents.
//
//   bun scripts/email/snicklefritz-send-preview.mts            # DRY RUN: render HTML to scratchpad, no send
//   bun scripts/email/snicklefritz-send-preview.mts --send     # send per SEND_PLAN
//
// Brand = scraped (folder.brand) + a favicon logo (Google s2 favicons, the "try
// favicon" path). Every figure below is REAL + cited (realtor.com via FRED, lake
// query 2026-06-25) — no number is invented; the daily one is the 30-yr mortgage.
// Resend send path mirrors the proven scripts/email/send-test.mts.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@react-email/render";
import { Resend } from "resend";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { EmailDocEmail } from "@/lib/email/blocks/EmailDocRenderer";
import { loadFolder } from "@/lib/email/snicklefritz/targets";
import { buildEmailDoc, type MarketData } from "@/lib/email/snicklefritz/build-email";

const SEND = process.argv.includes("--send");
const SCRATCH =
  "C:/Users/ethan/AppData/Local/Temp/claude/C--Users-ethan-dev-brain-platform/79d3ade4-34b6-4dc7-9815-88f53603bcfb/scratchpad";

const FROM = "SWFL Data Gulf <hello@swfldatagulf.com>";
const UNSUB = "https://www.swfldatagulf.com/unsubscribe?token=preview";

// Real, cited figures pulled from the live lake on 2026-06-25 (mcp lake query):
//   fred_listing_swfl_2026_06 (realtor.com, vintage May 2026) + daily_truth mortgage (FRED, today).
const DATA: Record<string, { market: MarketData; subject: string; preview: string }> = {
  "greg-guminski": {
    subject: "Cape Coral market snapshot — $399,000 median, 87 days on market",
    preview: "Cape Coral (Lee County): $399,000 median list, 11,347 active, 87 days on market.",
    market: {
      asOf: "May 2026 (listings) · today (mortgage)",
      headline: {
        value: "$399,000",
        label: "Median list price · Cape Coral area (Lee County)",
        source: "realtor.com (May 2026)",
      },
      stats: [
        { value: "11,347", label: "Active listings", source: "realtor.com (May 2026)" },
        { value: "87 days", label: "Median time on market", source: "realtor.com (May 2026)" },
        { value: "6.47%", label: "30-yr fixed mortgage", source: "FRED (Jun 25, 2026)" },
      ],
      ctaUrl: "https://www.swfldatagulf.com",
      ctaLabel: "See the full Cape Coral report",
    },
  },
  "suzanne-powers": {
    subject: "Naples market snapshot — $699,900 median, 95 days on market",
    preview: "Naples (Collier County): $699,900 median list, 6,238 active, 95 days on market.",
    market: {
      asOf: "May 2026 (listings) · today (mortgage)",
      headline: {
        value: "$699,900",
        label: "Median list price · Naples area (Collier County)",
        source: "realtor.com (May 2026)",
      },
      stats: [
        { value: "6,238", label: "Active listings", source: "realtor.com (May 2026)" },
        { value: "95 days", label: "Median time on market", source: "realtor.com (May 2026)" },
        { value: "6.47%", label: "30-yr fixed mortgage", source: "FRED (Jun 25, 2026)" },
      ],
      ctaUrl: "https://www.swfldatagulf.com",
      ctaLabel: "See the full Naples report",
    },
  },
};

// Operator inboxes ONLY. "two powers emails and a century 21."
const SEND_PLAN: { slug: string; to: string }[] = [
  { slug: "suzanne-powers", to: "allstatecoop@gmail.com" },
  { slug: "suzanne-powers", to: "ethanrickyjrjr@gmail.com" },
  { slug: "greg-guminski", to: "ethanrickyjrjr@gmail.com" },
];

function faviconLogo(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

async function renderFor(slug: string): Promise<{ html: string; subject: string }> {
  const cfg = DATA[slug];
  if (!cfg) throw new Error(`no MarketData for slug ${slug}`);
  const folder = loadFolder(slug);
  const doc = buildEmailDoc(folder, cfg.market, faviconLogo(folder.domain));
  const parsed = EmailDocSchema.safeParse(doc);
  if (!parsed.success) {
    throw new Error(
      `built doc failed EmailDocSchema for ${slug}: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`,
    );
  }
  const html = await render(EmailDocEmail({ doc: parsed.data, preview: cfg.preview }));
  return { html, subject: cfg.subject };
}

async function main(): Promise<void> {
  // Always render + verify both first (cache per slug).
  const cache = new Map<string, { html: string; subject: string }>();
  for (const slug of Object.keys(DATA)) {
    const r = await renderFor(slug);
    cache.set(slug, r);
    const folder = loadFolder(slug);
    const hasNumbers = /\$399,000|\$699,900|11,347|6,238|87 days|95 days|6\.47%/.test(r.html);
    console.log(
      `\n[${slug}] ${folder.name} · ${folder.company}\n` +
        `  brand=${folder.brand.primary ?? "-"}  logo=favicon(${folder.domain})\n` +
        `  subject="${r.subject}"\n` +
        `  html=${r.html.length} bytes  real-numbers-present=${hasNumbers}`,
    );
    if (!SEND) {
      const p = join(SCRATCH, `snicklefritz-${slug}.html`);
      writeFileSync(p, r.html, "utf8");
      console.log(`  → wrote ${p}`);
    }
  }

  if (!SEND) {
    console.log(`\n[snicklefritz] DRY RUN — no send. Send plan would be:`);
    for (const s of SEND_PLAN) console.log(`  ${s.slug} → ${s.to}`);
    console.log(`Re-run with --send to deliver.`);
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    console.error("[snicklefritz] RESEND_API_KEY not set");
    process.exit(1);
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  for (const { slug, to } of SEND_PLAN) {
    const r = cache.get(slug)!;
    const res = await resend.emails.send({
      from: FROM,
      to: [to],
      subject: r.subject,
      html: r.html,
      headers: {
        "List-Unsubscribe": `<${UNSUB}>, <mailto:unsubscribe@swfldatagulf.com?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (res.error) {
      console.error(`[snicklefritz] FAILED ${slug} → ${to}: ${JSON.stringify(res.error)}`);
    } else {
      console.log(`[snicklefritz] SENT ${slug} → ${to} · id ${res.data?.id}`);
    }
  }
}

main().catch((err) => {
  console.error(`[snicklefritz] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
