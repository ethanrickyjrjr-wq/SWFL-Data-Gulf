// scripts/email/snicklefritz-scrape.mts
//
// SNICKLEFRITZ prep — Phase 1 brand scrape. Runs the REAL enrichBrand (the color
// scrape) on each prospect folder's domain and persists the result into folder.brand.
// Bun auto-loads .env.local (ANTHROPIC_API_KEY for the Haiku brand-selection step).
//
//   bun scripts/email/snicklefritz-scrape.mts            # scrape + persist into folders
//   bun scripts/email/snicklefritz-scrape.mts --dry-run  # scrape + log only, no write
//
// enrichBrand NEVER throws and NEVER invents: a failed scrape returns source:"fallback"
// with null colors → folder.brand.status becomes "fallback" (prep then uses the SWFL
// house brand for that target rather than guessed colors).

import { loadAllFolders, saveFolder, type ProspectBrand } from "@/lib/email/snicklefritz/targets";
import { enrichBrand } from "@/lib/prospects/enrich-brand";

const DRY = process.argv.includes("--dry-run");

async function main(): Promise<void> {
  const folders = loadAllFolders();
  if (folders.length === 0) {
    console.log(
      "[snicklefritz-scrape] no prospect folders under data/prospects/ — run discovery first.",
    );
    return;
  }
  console.log(
    `[snicklefritz-scrape] ${DRY ? "DRY-RUN " : ""}scraping ${folders.length} folder(s)…`,
  );

  for (const f of folders) {
    console.log(`\n=== ${f.name} · ${f.company} · ${f.domain} (${f.role}) ===`);
    const b = await enrichBrand(f.domain);
    console.log(
      `  source=${b.source}  confidence=${b.confidence}\n` +
        `  primary=${b.primary ?? "-"}  secondary=${b.secondary ?? "-"}\n` +
        `  logo=${b.logo_url ?? "-"}\n` +
        `  company=${b.company_name ?? "-"}`,
    );

    if (DRY) continue;

    const brand: ProspectBrand = {
      status: b.source === "fallback" ? "fallback" : "scraped",
      primary: b.primary,
      secondary: b.secondary,
      logo_url: b.logo_url,
      company_name: b.company_name ?? null,
      confidence: b.confidence,
      source: b.source,
    };
    f.brand = brand;
    saveFolder(f);
    console.log(
      `  → saved brand (status=${brand.status}) into data/prospects/${f.slug}/folder.json`,
    );
  }
}

main().catch((err) => {
  console.error(`[snicklefritz-scrape] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
