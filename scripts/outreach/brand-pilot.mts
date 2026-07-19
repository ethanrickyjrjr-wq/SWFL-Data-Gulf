// scripts/outreach/brand-pilot.mts
//
// Brand-at-scale pilot: Brandfetch bulk → candidate fixtures (status:"api", conf ≤ 0.7).
// SAFE BY DEFAULT — dry-run unless --live AND brandfetch_key is in .env.local.
// NEVER overwrites an existing fixture file. Companies not in the DBPR corp list land
// in unconfirmed/, not index.json (06/26 hard rule).
//
// Usage:
//   bun scripts/outreach/brand-pilot.mts --rank <RE_rgn7.csv>
//   bun scripts/outreach/brand-pilot.mts --domains <domains.txt> [--live]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadBrandFixtures, validateFixture } from "@/lib/email/outreach/brand-fixtures";
import { splitCsvLine } from "@/lib/email/outreach/targets";
import { mapToCandidateFixture, slugFromDomain, type BrandfetchBrand } from "./pilot-lib";

const BRANDS_DIR = "fixtures/real-estate-brands";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const LIVE = process.argv.includes("--live");

async function readKey(): Promise<string | undefined> {
  try {
    const env = await readFile(".env.local", "utf8");
    return env.match(/^brandfetch_key=(.+)$/m)?.[1]?.trim();
  } catch {
    return undefined;
  }
}

async function rankMode(csvPath: string): Promise<void> {
  // DBPR RE_rgn7.csv has NO header row; every cell is quoted (verified on the live
  // file 07/10/2026). Positional layout (observed + the published column list):
  //   0 license code · 1 code description · 2 licensee name · 3 DBA · 4 rank
  //   5-7 addr · 8 city · 9 state · 10 zip · 11 county code · 12 county name
  //   13 license # · 14 primary status · 15 secondary status · 16-18 dates
  //   19 alternate license # · 20 self-proprietor · 21 employer name · 22 employer lic #
  // Agent ranks: "SL Sales Associate" / "BK Broker" / "BL Broker Sales".
  const RANK = 4;
  const COUNTY = 12;
  const STATUS = 14;
  const EMPLOYER = 21;
  const text = await readFile(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  const counts = new Map<string, number>();
  let agents = 0;
  for (const line of lines) {
    const cells = splitCsvLine(line);
    if (cells.length < 22) continue;
    const county = cells[COUNTY]?.trim().toLowerCase();
    if (county !== "lee" && county !== "collier") continue;
    if (!/current/i.test(cells[STATUS] ?? "")) continue;
    if (!/^(SL|BK|BL)\b/.test(cells[RANK]?.trim() ?? "")) continue;
    agents += 1;
    const employer = cells[EMPLOYER]?.trim();
    if (!employer) continue;
    counts.set(employer, (counts.get(employer) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
  for (const [name, n] of top) console.log(`${String(n).padStart(6)}  ${name}`);
  console.log(
    `\n${agents} current Lee/Collier agents · ${counts.size} distinct employers; top 100 above. Curate domains into a --domains file.`,
  );
}

async function fetchMode(domainsPath: string): Promise<void> {
  const key = await readKey();
  const domains = (await readFile(domainsPath, "utf8"))
    .split(/\r?\n/)
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d && !d.startsWith("#"));

  const { fixtures } = await loadBrandFixtures(BRANDS_DIR);
  const held = new Set(fixtures.map((f) => f.domain).filter(Boolean));
  const corpText = await readFile(join(BRANDS_DIR, "dbpr-all-corps-lee-collier.json"), "utf8");
  const corpHaystack = corpText.toUpperCase();

  const plan = domains.map((d) => ({
    domain: d,
    slug: slugFromDomain(d),
    action: held.has(d)
      ? "skip: fixture already held"
      : existsSync(join(BRANDS_DIR, `${slugFromDomain(d)}.json`))
        ? "skip: file exists (never overwrite)"
        : "fetch",
  }));
  for (const p of plan) console.log(`${p.action.padEnd(32)} ${p.domain}`);
  const toFetch = plan.filter((p) => p.action === "fetch");
  console.log(`\n${toFetch.length}/${domains.length} to fetch.`);

  if (!LIVE || !key) {
    console.log(
      !key ? "No brandfetch_key in .env.local — dry-run only." : "DRY RUN (pass --live to fetch).",
    );
    return;
  }

  await mkdir(join(BRANDS_DIR, "unconfirmed"), { recursive: true });
  const report: object[] = [];
  const indexPath = join(BRANDS_DIR, "index.json");
  const index = JSON.parse(await readFile(indexPath, "utf8"));

  for (const p of toFetch) {
    const res = await fetch(`https://api.brandfetch.io/v2/brands/domain/${p.domain}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    console.log(
      `${p.domain}: HTTP ${res.status} (quota ${res.headers.get("x-api-key-approximate-usage") ?? "?"}/${res.headers.get("x-api-key-quota") ?? "?"})`,
    );
    if (res.status === 429) {
      console.error("Quota reached — stopping.");
      break;
    }
    if (!res.ok) {
      report.push({ domain: p.domain, status: res.status });
      continue;
    }
    const raw = (await res.json()) as BrandfetchBrand;
    const fx = mapToCandidateFixture(raw, { slug: p.slug });
    if (!fx) {
      report.push({ domain: p.domain, status: "no-colors" });
      continue;
    }
    const v = validateFixture(fx);
    if (!v.ok) {
      report.push({ domain: p.domain, status: `invalid: ${v.reason}` });
      continue;
    }
    const confirmed = corpHaystack.includes((fx.company_name ?? "").toUpperCase());
    const outPath = confirmed
      ? join(BRANDS_DIR, `${p.slug}.json`)
      : join(BRANDS_DIR, "unconfirmed", `${p.slug}.json`);
    await writeFile(outPath, JSON.stringify(fx, null, 2) + "\n");
    if (confirmed) {
      index.brokerages.push({
        slug: p.slug,
        company_name: fx.company_name,
        type: "unknown",
        counties: [],
        primary: fx.brand.palette.primaryColor,
        accent: fx.brand.palette.accentColor ?? null,
        confidence: fx.brand.confidence,
        file: `${p.slug}.json`,
      });
    }
    report.push({ domain: p.domain, status: confirmed ? "written" : "unconfirmed", file: outPath });
    await new Promise((r) => setTimeout(r, 250));
  }

  await writeFile(indexPath, JSON.stringify(index, null, 2) + "\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await mkdir(join("runs", "outreach-runs"), { recursive: true });
  await writeFile(
    join("runs", "outreach-runs", `brand-pilot-${stamp}.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(`\nReport: runs/outreach-runs/brand-pilot-${stamp}.json`);
  console.log(
    'NEXT: crawl4ai-verify the top-20 send targets before any email uses an "api" fixture at trust.',
  );
}

const rank = arg("rank");
const domainsFile = arg("domains");
if (rank) await rankMode(rank);
else if (domainsFile) await fetchMode(domainsFile);
else console.log("Usage: --rank <RE_rgn7.csv> | --domains <file> [--live]");
