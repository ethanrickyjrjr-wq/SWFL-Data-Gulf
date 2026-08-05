// scripts/migrate-deliverable-recipe-key.mts
// Idempotent: public.deliverables.recipe_key — WHICH email built this row.
//
// WHY THIS EXISTS. Counted live 08/05/2026: 92 deliverables, 75 of them recording their
// template as `block-canvas` and NOT ONE recording which of the 17 emails produced it.
// "Every email runs one pipe" was true in the code and unverifiable in the product —
// there was no column to check it against. Operator, 08/05/2026: "MAKE SURE WE ARE
// TRACKING WHERE AND HOW EVERYTHING GETS BUILT SO WE CAN REPRODUCE EXACTLY."
//
// WHAT THE VALUE MEANS — read this before you query it. `recipe_key` is the key of the
// recipe whose BUILDER PRODUCED THE DOC, not the key the caller asked for. They are the
// same on every healthy build. They differ in exactly two places, both deliberate:
//   • a keyed build whose builder returned null/invalid falls through to the terminal
//     default-grid lane — that row records `default-grid`, because default-grid is what
//     built it. Recording the requested key there would launder a fallback as a success.
//   • a keyless/organic ask resolves to `default-grid` and records it.
// The REQUESTED-vs-BUILT distinction, per-cell provenance, and the model/prompt version
// belong to the build manifest (`deliverable_build_manifest` — separate build).
//
// NO BACKFILL, ON PURPOSE. The 92 existing rows stay NULL. Their key is not recorded
// anywhere; deriving it from `doc` or `instruction` would be an inferred value sitting in
// a provenance column, which is the exact fabrication shape this product forbids. NULL is
// the honest answer for "built before we tracked it."
//
// Run: bun scripts/migrate-deliverable-recipe-key.mts
import { readFileSync } from "fs";

const secrets = readFileSync(".dlt/secrets.toml", "utf8");
const tomlStr = (key: string): string => {
  const m = secrets.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  if (!m) throw new Error(`missing ${key} in .dlt/secrets.toml`);
  return m[1]!;
};
const port = secrets.match(/^port\s*=\s*(\d+)/m)?.[1] ?? "5432";
const sql = new Bun.SQL(
  `postgres://${tomlStr("username")}:${encodeURIComponent(tomlStr("password"))}@${tomlStr("host")}:${port}/${tomlStr("database")}?sslmode=require`,
);

await sql.unsafe(`
  ALTER TABLE public.deliverables ADD COLUMN IF NOT EXISTS recipe_key text;

  COMMENT ON COLUMN public.deliverables.recipe_key IS
    'The recipe key whose BUILDER produced this doc (lib/deliverable/recipes.ts RECIPE_KEYS). '
    'NOT the key the caller requested: a keyed build that fell through to the terminal lane '
    'records default-grid. NULL = built by a path that has no recipe (legacy templates, '
    'showing-prep, hand-edited saves) or built before 08/05/2026 when tracking landed.';

  -- The question this column exists to answer is "how many of each email did we build",
  -- so the index is on the grouping column, partial to skip the 92 untracked rows.
  CREATE INDEX IF NOT EXISTS deliverables_recipe_key_idx
    ON public.deliverables (recipe_key) WHERE recipe_key IS NOT NULL;
`);

// POSTGREST CANNOT SEE A COLUMN IT HAS NOT RELOADED. Same landmine as the apify records
// table (08/04/2026): the app talks to this table through PostgREST, and without this the
// first insert carrying recipe_key fails with "column does not exist" while the row that
// SHOULD have carried it silently never lands. Verified by the live read below.
await sql.unsafe(`NOTIFY pgrst, 'reload schema'`);

const cols = await sql`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'deliverables' AND column_name = 'recipe_key'
`;
const [{ total, tracked }] = await sql`
  SELECT count(*)::int AS total,
         count(recipe_key)::int AS tracked
  FROM public.deliverables
`;
console.log(
  cols.length === 1
    ? `public.deliverables.recipe_key ready — ${cols[0]!.data_type}, nullable=${cols[0]!.is_nullable}`
    : "FAILED: recipe_key column not present after ALTER",
);
console.log(
  `rows: ${total} total · ${tracked} carrying a key · ${total - tracked} untracked (NULL)`,
);
await sql.end();
