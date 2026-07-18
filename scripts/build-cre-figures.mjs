// Build + materialize the CRE figures layer.
//   bun scripts/build-cre-figures.mjs --dry-run   # counts only, writes nothing
//   bun scripts/build-cre-figures.mjs             # full refresh of both tables
//
// Reads ALL of data_lake.marketbeat_swfl (every firm — no `verified` filter), normalizes
// to canonical_submarket × sector × quarter × metric × firm (refinery/lib/derived), runs
// the corroboration engine, and materializes data_lake.cre_figures + cre_figures_confidence.
// Rows with no firm URL (Cushman, Colliers) are cited to the SWFL Data Gulf citation
// (operator 07/18). Full-refresh is guarded: it refuses to wipe the tables on an empty build.
import { readFileSync } from "node:fs";
import { normalizeMarketbeat } from "../refinery/lib/derived/cre-figures.mts";
import { corroborate } from "../refinery/lib/derived/cre-corroboration.mts";
import { buildSourceCitationUrl } from "../refinery/lib/citation-url.mts";

const MARKETBEAT_COLUMNS =
  "source_name, sector, submarket, quarter, vacancy_rate, asking_rent_nnn, " +
  "asking_rent_full_service, absorption_sqft, cap_rate, sale_price_psf, source_url, verified";

const FIGURE_COLS = [
  "canonical_submarket",
  "sector",
  "quarter",
  "metric",
  "value",
  "units",
  "source_firm",
  "source_url",
  "source_verified",
  "as_of",
  "fanned",
];

/** Last-wins dedupe on the cre_figures primary key. Two raw submarkets normalizing to one
 *  canonical in the same sector/quarter/metric for one firm (e.g. a firm's own "Lehigh" vs
 *  "Lehigh Acres" inconsistency) would otherwise collide on INSERT and redden the rebuild. */
function dedupeByPk(figures) {
  const byKey = new Map();
  for (const f of figures) {
    byKey.set(`${f.canonical_submarket}|${f.sector}|${f.quarter}|${f.metric}|${f.source_firm}`, f);
  }
  return [...byKey.values()];
}

/** Pure core — no IO. Deterministic, unit-tested. */
export function buildFigures(marketbeatRows, citationUrl) {
  const figures = dedupeByPk(normalizeMarketbeat(marketbeatRows, citationUrl));
  const confidence = corroborate(figures);
  return { figures, confidence };
}

/** The SWFL Data Gulf citation used when a firm row carries no report URL. */
function swflCitation() {
  return buildSourceCitationUrl("marketbeat_swfl", {
    label: "MarketBeat — SWFL CRE quarterly",
    source: "SWFL Data Gulf",
    brain: "cre-swfl",
    date_col: "quarter",
  });
}

function connect() {
  const secrets = readFileSync(".dlt/secrets.toml", "utf8");
  const val = (k) => {
    const m = secrets.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"));
    if (!m) throw new Error(`Could not find ${k} in .dlt/secrets.toml`);
    return m[1];
  };
  const port = (secrets.match(/^port\s*=\s*(\d+)/m) ?? [null, "5432"])[1];
  const url = `postgres://${val("username")}:${encodeURIComponent(val("password"))}@${val("host")}:${port}/${val("database")}?sslmode=require`;
  return new Bun.SQL(url);
}

function tally(items, key) {
  const out = {};
  for (const it of items) out[it[key]] = (out[it[key]] ?? 0) + 1;
  return out;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  // This build writes the SHARED production data_lake; the SWFL Data Gulf citation must
  // point at production, not a local dev origin from .env.local's NEXT_PUBLIC_SITE_URL.
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.swfldatagulf.com";
  const sql = connect();
  try {
    const rows = await sql.unsafe(`SELECT ${MARKETBEAT_COLUMNS} FROM data_lake.marketbeat_swfl`);
    const citation = swflCitation();
    const { figures, confidence } = buildFigures(rows, citation);

    console.log(`\nsource marketbeat rows: ${rows.length}`);
    console.log(`figures=${figures.length}  confidence=${confidence.length}`);
    console.log("figures by firm:", tally(figures, "source_firm"));
    console.log("confidence by tier:", tally(confidence, "tier"));
    const flagged = confidence.filter((c) => c.tier === "flagged");
    if (flagged.length) {
      console.log(`\nflagged disagreements (${flagged.length}):`);
      for (const f of flagged) {
        console.log(
          `  ${f.canonical_submarket} / ${f.sector} / ${f.quarter} / ${f.metric}` +
            ` — ${f.contributing_firms.join(" vs ")} spread ${f.spread}`,
        );
      }
    }

    if (dryRun) {
      console.log("\n--dry-run: no writes.");
      return;
    }
    if (figures.length === 0) {
      console.error("\nrefusing to write: 0 figures built (non-null guard).");
      process.exitCode = 1;
      return;
    }

    await sql.begin(async (tx) => {
      await tx.unsafe("DELETE FROM data_lake.cre_figures");
      await tx.unsafe("DELETE FROM data_lake.cre_figures_confidence");
      // cre_figures has no array columns → fast multi-row helper.
      await tx`INSERT INTO data_lake.cre_figures ${tx(figures, ...FIGURE_COLS)}`;
      // cre_figures_confidence carries contributing_firms text[]; the multi-row helper
      // mis-encodes nested arrays, so insert per-row and let Bun.SQL encode the array param.
      for (const c of confidence) {
        // Build the Postgres text[] literal explicitly and cast — Bun.SQL does not encode
        // a JS array as text[] here (firm ids are simple, but quote/escape defensively).
        const firmsLiteral =
          "{" +
          c.contributing_firms.map((f) => `"${f.replace(/(["\\])/g, "\\$1")}"`).join(",") +
          "}";
        await tx`INSERT INTO data_lake.cre_figures_confidence
          (canonical_submarket, sector, quarter, metric, tier, reported_value, units, contributing_firms, spread, reported_firm, has_fanned_contributor)
          VALUES (${c.canonical_submarket}, ${c.sector}, ${c.quarter}, ${c.metric}, ${c.tier},
                  ${c.reported_value}, ${c.units}, ${firmsLiteral}::text[], ${c.spread}, ${c.reported_firm}, ${c.has_fanned_contributor})`;
      }
    });
    console.log(
      `\nmaterialized: cre_figures=${figures.length}, cre_figures_confidence=${confidence.length}`,
    );
  } finally {
    await sql.end();
  }
}

if (import.meta.main) await main();
