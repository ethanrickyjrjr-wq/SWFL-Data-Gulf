// scripts/email/outreach-demo-enroll.mts
//
// Enroll cycle-1 funnel-demo prospects from the operator's CSV. Enrollment ONLY —
// no email is composed or sent here; rows land at stage 'cold_t1' due-now and the
// demo runner (outreach-demo-run.mts) builds + previews + (operator-gated) sends.
//
// SAFE BY DEFAULT — DRY_RUN unless DRY_RUN=false: parses, enriches, resolves each
// brand, writes the enroll report, and mutates NOTHING.
//
// Brand truth (spec §3): CSV overrides (primary/accent/logo — operator-verified
// from the brokerage's own site) win field-wise over enrichBrand's scrape. A row
// whose EFFECTIVE brand confidence is < 0.5 is SKIPPED with a REVIEW flag — a demo
// email in the wrong brand defeats the demo; the house-brand fallback of the
// legacy drip does NOT apply here. SVG logos are rasterized to hosted PNGs.
//
// Usage:
//   bun scripts/email/outreach-demo-enroll.mts --csv demo-targets.csv --campaign demo-2026-07
//   env: DRY_RUN (default true), SITE_ORIGIN (default https://www.swfldatagulf.com),
//        CONFIDENCE_THRESHOLD (default 0.5)
//   CSV columns: email,name,domain,zip,track,primary,accent,logo (track: agent|broker)

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseTargetsCsv, type OutreachTarget } from "@/lib/email/outreach/targets";
import { ensureRasterLogo } from "@/lib/email/outreach/logo-raster";
import { enrichBrand } from "@/lib/prospects/enrich-brand";
import { buildArrivalUrl } from "@/lib/prospects/build-arrival-url";
import type { ActivationBrand } from "@/lib/email/activation/types";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const DRY_RUN = process.env.DRY_RUN !== "false"; // default true — must opt OUT to write
const SITE_ORIGIN = process.env.SITE_ORIGIN ?? "https://www.swfldatagulf.com";
const CONFIDENCE_THRESHOLD = Number(process.env.CONFIDENCE_THRESHOLD ?? "0.5");

function arg(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) return argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

interface ResolvedRow {
  email: string;
  status: "ready" | "skipped";
  reason?: string;
  track: "agent" | "broker";
  subject_variant: "a" | "b";
  zip?: string;
  brand?: ActivationBrand;
  brand_source?: string;
  brand_confidence?: number;
  arrival_url?: string;
}

/** CSV overrides win field-wise over the scrape; confidence 1 when ALL brand fields are operator-supplied. */
async function resolveBrand(t: OutreachTarget): Promise<{
  brand: ActivationBrand;
  source: string;
  confidence: number;
}> {
  const allFromCsv = Boolean(t.primary && t.accent && t.logo);
  const scraped = allFromCsv ? null : t.domain ? await enrichBrand(t.domain) : null;
  const brand: ActivationBrand = {
    primary: t.primary ?? scraped?.primary ?? null,
    accent: t.accent ?? scraped?.secondary ?? null,
    logoUrl: t.logo ?? scraped?.logo_url ?? null,
    companyName: t.name ?? scraped?.company_name ?? null,
  };
  return {
    brand,
    source: allFromCsv ? "operator-csv" : (scraped?.source ?? "operator-csv"),
    confidence: allFromCsv ? 1 : (scraped?.confidence ?? 0),
  };
}

async function main(): Promise<void> {
  const csvPath = arg("csv");
  const campaignId = arg("campaign");
  if (!csvPath || !campaignId) {
    console.error(
      "usage: --csv <targets.csv> --campaign <id>  (columns: email,name,domain,zip,track,primary,accent,logo)",
    );
    process.exit(1);
  }

  const text = await readFile(csvPath, "utf8");
  const { rows, errors } = parseTargetsCsv(text);
  if (errors.length) {
    console.error(`[demo-enroll] ${errors.length} row(s) skipped at parse:`);
    for (const e of errors) console.error(`  line ${e.line}: ${e.reason}`);
  }
  if (rows.length === 0) {
    console.error("[demo-enroll] no valid targets — nothing to do.");
    process.exit(1);
  }

  console.log(
    `[demo-enroll] resolving ${rows.length} target(s) · campaign=${campaignId} · DRY_RUN=${DRY_RUN}`,
  );

  // A/B assignment: alternate WITHIN each track by enroll order (deterministic).
  const variantCounter: Record<"agent" | "broker", number> = { agent: 0, broker: 0 };
  const resolved: ResolvedRow[] = [];

  for (const t of rows) {
    const track = t.track ?? "agent";
    const subject_variant: "a" | "b" = variantCounter[track]++ % 2 === 0 ? "a" : "b";
    const base: ResolvedRow = { email: t.email, status: "skipped", track, subject_variant };

    if (!t.zip) {
      resolved.push({ ...base, reason: "no zip — demo content is scope-anchored" });
      continue;
    }

    const { brand, source, confidence } = await resolveBrand(t);
    if (confidence < CONFIDENCE_THRESHOLD) {
      resolved.push({
        ...base,
        zip: t.zip,
        reason: `REVIEW: brand confidence ${confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD} — supply CSV overrides (never house-brand a demo)`,
      });
      continue;
    }
    if (!brand.primary || !brand.logoUrl) {
      resolved.push({
        ...base,
        zip: t.zip,
        reason: "REVIEW: missing brand primary or logo — pre-send gates would reject",
      });
      continue;
    }

    // SVG logos → hosted PNG (email clients strip SVG). Fail = skip + report.
    try {
      brand.logoUrl = await ensureRasterLogo(brand.logoUrl, t.domain ?? t.email);
    } catch (err) {
      resolved.push({
        ...base,
        zip: t.zip,
        reason: `logo rasterize failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }

    const arrival_url = buildArrivalUrl({
      name: brand.companyName ?? undefined,
      brand: {
        primary: brand.primary,
        secondary: brand.accent ?? null,
        logo_url: brand.logoUrl,
        company_name: brand.companyName ?? null,
        confidence,
        source: "fallback",
      },
      zip: t.zip,
      base: SITE_ORIGIN,
    });

    resolved.push({
      ...base,
      status: "ready",
      zip: t.zip,
      brand,
      brand_source: source,
      brand_confidence: confidence,
      arrival_url,
    });
  }

  // Enroll report — ALWAYS written (runs/ is gitignored).
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = join("runs", "outreach-runs", stamp);
  await mkdir(outDir, { recursive: true });
  const summary = {
    total: resolved.length,
    ready: resolved.filter((r) => r.status === "ready").length,
    skipped: resolved.filter((r) => r.status === "skipped").length,
  };
  await writeFile(
    join(outDir, "enroll-report.json"),
    JSON.stringify(
      { generated_at: new Date().toISOString(), campaign: campaignId, summary, rows: resolved },
      null,
      2,
    ),
  );

  console.log("\n========================================================================");
  console.log(`ENROLL REPORT: ${join(outDir, "enroll-report.json")}`);
  console.log(`SUMMARY: ${JSON.stringify(summary)}`);
  for (const r of resolved) {
    console.log(`  ${r.status.toUpperCase().padEnd(8)} ${r.track.padEnd(6)} ${r.email}`);
    if (r.reason) console.log(`    reason: ${r.reason}`);
  }
  console.log("========================================================================\n");

  if (DRY_RUN) {
    console.log("[demo-enroll] DRY_RUN — no rows written. Re-run with DRY_RUN=false to enroll.");
    return;
  }

  // ── live enroll: upsert on the (campaign_id, lower(email)) unique index ──
  const db = createServiceRoleClient();
  let written = 0;
  for (const r of resolved) {
    if (r.status !== "ready") continue;
    const patch = {
      name: r.brand?.companyName ?? null,
      zip: r.zip ?? null,
      brand: r.brand as unknown as Record<string, unknown>,
      brand_source: r.brand_source ?? null,
      brand_confidence: r.brand_confidence ?? null,
      arrival_url: r.arrival_url ?? null,
      track: r.track,
      stage: "cold_t1",
      subject_variant: r.subject_variant,
      status: "active",
      next_send_at: null, // due immediately — the runner sends T1
      trial_sends: 0,
      updated_at: new Date().toISOString(),
    };
    const { data: existing, error: selErr } = await db
      .from("outreach_recipients")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("email", r.email)
      .maybeSingle();
    if (selErr) throw new Error(`select ${r.email}: ${selErr.message}`);
    if (existing?.id) {
      const { error } = await db
        .from("outreach_recipients")
        .update(patch)
        .eq("id", existing.id as string);
      if (error) throw new Error(`update ${r.email}: ${error.message}`);
    } else {
      const { error } = await db
        .from("outreach_recipients")
        .insert({ campaign_id: campaignId, email: r.email, ...patch });
      if (error) throw new Error(`insert ${r.email}: ${error.message}`);
    }
    written++;
  }
  console.log(`[demo-enroll] enrolled ${written} recipient(s) at stage cold_t1 (due now).`);
}

main().catch((err) => {
  console.error(`[demo-enroll] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
