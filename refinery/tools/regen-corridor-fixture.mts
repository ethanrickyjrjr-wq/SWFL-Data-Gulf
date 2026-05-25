/**
 * Regenerate fixtures/corridors.json from Supabase corridor_profiles.
 *
 * Why this exists: the original 12-row fixture was a Fiverr scaffold; the
 * cre-swfl pack has long since grown to 26 verified corridors. The asking-rent
 * embed card was rendering a 12-row subset and lying about the market floor.
 *
 * What this does:
 *   1. Reads existing fixtures/corridors.json into a map keyed by `id`.
 *   2. Queries corridor_profiles (verified, non-deleted) — same predicate as
 *      refinery/sources/cre-source.mts.
 *   3. For each Supabase row, emits a fixture row owning the corridor_profiles
 *      fields (id/name/submarket/rent/vacancy/absorption). Non-owned fields
 *      (permit_zscore, saturation_index, lat, lng) are preserved from the
 *      existing fixture by id-match; new rows get nulls. Downstream charts
 *      that need those fields must null-filter before rendering.
 *   4. Sorts by id, writes back with 2-space indent + trailing newline.
 *
 * Run: `npm run fixtures:corridors`
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getSupabase } from "../sources/supabase.mts";

interface FixtureRow {
  id: string;
  name: string;
  submarket: string;
  nnn_asking_rent_per_sqft: number | null;
  vacancy_pct: number | null;
  absorption_sqft: number | null;
  permit_zscore: number | null;
  saturation_index: number | null;
  lat: number | null;
  lng: number | null;
}

const FIXTURE_PATH = path.join(process.cwd(), "fixtures", "corridors.json");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

async function loadExisting(): Promise<Map<string, FixtureRow>> {
  try {
    const raw = await readFile(FIXTURE_PATH, "utf-8");
    const rows = JSON.parse(raw) as FixtureRow[];
    return new Map(rows.map((r) => [r.id, r]));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw err;
  }
}

async function main(): Promise<void> {
  const existing = await loadExisting();
  const before = existing.size;

  const { data, error } = await getSupabase()
    .from("corridor_profiles")
    .select(
      "corridor_name, city, asking_rent_psf, vacancy_rate_pct, absorption_sqft",
    )
    .is("deleted_at", null)
    .eq("verification_status", "verified");

  if (error) {
    throw new Error(
      `regen-corridor-fixture: corridor_profiles fetch failed — ${error.message}`,
    );
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    throw new Error(
      "regen-corridor-fixture: corridor_profiles returned 0 verified rows. " +
        "Refusing to overwrite fixture with an empty array.",
    );
  }

  const seen = new Set<string>();
  const out: FixtureRow[] = [];
  for (const row of rows) {
    const name = str(row.corridor_name);
    if (!name) continue;
    const id = slugify(name);
    if (seen.has(id)) {
      throw new Error(
        `regen-corridor-fixture: duplicate id "${id}" derived from "${name}". ` +
          `Fix corridor_profiles to disambiguate, then re-run.`,
      );
    }
    seen.add(id);
    const prior = existing.get(id);
    out.push({
      id,
      name,
      submarket: str(row.city),
      nnn_asking_rent_per_sqft: num(row.asking_rent_psf),
      vacancy_pct: num(row.vacancy_rate_pct),
      absorption_sqft: num(row.absorption_sqft),
      permit_zscore: prior?.permit_zscore ?? null,
      saturation_index: prior?.saturation_index ?? null,
      lat: prior?.lat ?? null,
      lng: prior?.lng ?? null,
    });
  }

  out.sort((a, b) => a.id.localeCompare(b.id));

  await writeFile(FIXTURE_PATH, JSON.stringify(out, null, 2) + "\n", "utf-8");

  const after = out.length;
  const withPermit = out.filter((r) => r.permit_zscore != null).length;
  const withGeo = out.filter((r) => r.lat != null && r.lng != null).length;
  const withRent = out.filter((r) => r.nnn_asking_rent_per_sqft != null).length;

  console.log(
    `regen-corridor-fixture: ${before} → ${after} rows ` +
      `(rent: ${withRent}/${after}, permit: ${withPermit}/${after}, geo: ${withGeo}/${after})`,
  );
  if (withPermit < after || withGeo < after) {
    console.log(
      `  note: ${after - withPermit} rows missing permit_zscore/saturation_index, ` +
        `${after - withGeo} missing lat/lng. ` +
        `Downstream charts that consume those fields must null-filter.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
