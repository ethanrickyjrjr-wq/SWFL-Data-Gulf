#!/usr/bin/env node
// scripts/check-duplicate-roots.mjs
//
// THE LIVE HALF of Gate 14. The gate reads the REPO; this reads the DATABASE.
//
// Why both exist: on 08/04/2026 three views landed parsing arrays that three tables built
// the day before, at identical row counts. Gate 14 (.claude/hooks/lib/duplicate-root.mjs)
// blocks that at push time by comparing derivations across pushed artifacts. But
// data_lake.steadyapi_property_permits is live in prod with a primary key, a unique key and
// 79,281 rows, and has NO migration file and NO parser anywhere in this repo — an object
// with no artifact is invisible to any repo scan. This finds those.
//
// WHAT IT REPORTS — two independent signals, because either alone is noisy:
//   1. SHARED SOURCE: two data_lake objects that both depend on the same relation. For
//      views this is exact (pg_depend), not a guess.
//   2. IDENTICAL ROW COUNT: two objects over the same source with the same count. That
//      pairing is what a duplicate actually looks like; a legitimate sibling family
//      (property_history vs tax_history off one raw table) agrees on the source and
//      disagrees on the count.
//
// PROVEN IN BOTH DIRECTIONS ON LIVE DATA, 08/04/2026, within one session — which is the
// only reason to trust it:
//   POSITIVE CONTROL — run while steadyapi_tax_history_v and steadyapi_property_permits_v
//     still parsed steadyapi_property_history_raw themselves, it named all three pairs at
//     235,383 / 273,051 / 79,281.
//   NEGATIVE CONTROL — run again after those views were rebuilt to read their base TABLES
//     (the correct rule-4 layering), it went silent, because a 1:1 read layer legitimately
//     holds its base's row count.
// A check that only ever fires, or only ever passes, has not been tested. This one changed
// its answer when the world changed, for the right reason.
//
// Read-only. Never writes, never drops. Exit 1 when a same-source + same-count pair exists,
// so it can be wired into CI later; today it is a command you run.
//
//   node scripts/check-duplicate-roots.mjs
//
// Creds: .dlt/secrets.toml, same as every other live probe in scripts/.

import { readFileSync } from "node:fs";

function connString() {
  const s = readFileSync(".dlt/secrets.toml", "utf8");
  const t = (k) => {
    const m = s.match(new RegExp(`^${k}\\s*=\\s*"([^"]+)"`, "m"));
    if (!m) throw new Error(`.dlt/secrets.toml is missing "${k}"`);
    return m[1];
  };
  const port = (s.match(/^port\s*=\s*(\d+)/m) || [])[1] || "5432";
  return `postgres://${t("username")}:${encodeURIComponent(t("password"))}@${t("host")}:${port}/${t("database")}?sslmode=require`;
}

// Views carry their dependencies in the catalog exactly; tables do not (their source is
// whatever pipeline writes them), so tables participate only via the row-count signal.
const DEPS_SQL = `
  select dependent.relname as object_name,
         source.relname    as source_name
  from pg_depend d
  join pg_rewrite rw on rw.oid = d.objid
  join pg_class dependent on dependent.oid = rw.ev_class
  join pg_class source    on source.oid = d.refobjid
  join pg_namespace dn on dn.oid = dependent.relnamespace
  join pg_namespace sn on sn.oid = source.relnamespace
  where dn.nspname = 'data_lake'
    and sn.nspname = 'data_lake'
    and dependent.oid <> source.oid
    and d.classid = 'pg_rewrite'::regclass
  group by 1, 2
  order by 1, 2
`;

const RELS_SQL = `
  select c.relname,
         case c.relkind when 'r' then 'table' when 'v' then 'view' when 'm' then 'matview' end as kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'data_lake' and c.relkind in ('r', 'v', 'm')
  order by c.relname
`;

async function main() {
  const { SQL } = await import("bun");
  const sql = new SQL(connString());

  const rels = await sql.unsafe(RELS_SQL);
  const deps = await sql.unsafe(DEPS_SQL);

  // object -> the set of data_lake relations it reads (views only; exact from the catalog)
  const sourcesOf = new Map();
  for (const d of deps) {
    if (!sourcesOf.has(d.object_name)) sourcesOf.set(d.object_name, new Set());
    sourcesOf.get(d.object_name).add(d.source_name);
  }

  // Row counts are the expensive part, so only count objects that share a source with
  // something else, plus every relation named as a source.
  const interesting = new Set();
  const bySource = new Map();
  for (const [obj, srcs] of sourcesOf) {
    for (const s of srcs) {
      if (!bySource.has(s)) bySource.set(s, new Set());
      bySource.get(s).add(obj);
      interesting.add(s);
      interesting.add(obj);
    }
  }

  const counts = new Map();
  for (const name of [...interesting].sort()) {
    if (!rels.some((r) => r.relname === name)) continue;
    try {
      const r = await sql.unsafe(`select count(*)::bigint as n from data_lake."${name}"`);
      counts.set(name, String(r[0].n));
    } catch (e) {
      counts.set(name, `ERR ${String(e.message).split("\n")[0].slice(0, 60)}`);
    }
  }

  const findings = [];
  for (const [source, objs] of bySource) {
    const list = [...objs];
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const ca = counts.get(a);
        const cb = counts.get(b);
        if (ca && cb && ca === cb && !String(ca).startsWith("ERR")) {
          findings.push({ source, a, b, count: ca, why: "same source + same row count" });
        }
      }
    }
  }

  // The permits shape: an object whose row count equals a sibling's but which the catalog
  // shows no dependency for (it is a TABLE written by a pipeline, not a view).
  const tablesByCount = new Map();
  for (const [name, n] of counts) {
    if (String(n).startsWith("ERR")) continue;
    if (!tablesByCount.has(n)) tablesByCount.set(n, []);
    tablesByCount.get(n).push(name);
  }

  console.log("data_lake objects sharing a source, with row counts:");
  for (const [source, objs] of [...bySource].sort()) {
    if (objs.size < 2) continue;
    console.log(`\n  source: data_lake.${source}  (${counts.get(source) ?? "?"} rows)`);
    for (const o of [...objs].sort()) console.log(`    -> ${o.padEnd(38)} ${counts.get(o) ?? "?"}`);
  }

  // THE PERMITS SHAPE, and the reason the same-source rule alone is not enough: a TABLE
  // written by a pipeline has no catalog dependency, so `steadyapi_property_permits` and
  // `steadyapi_property_permits_v` never appear as siblings under one source. What links
  // them is the naming convention this repo actually uses — the read layer is the base name
  // plus a view suffix — combined with an identical count. Name affinity alone is fine (a
  // read layer SHOULD share its base's name); an identical count alone is a coincidence
  // (four unrelated rollups all hold 4 rows). Together they are a duplicate.
  const VIEW_SUFFIXES = ["_v", "_view", "_vw"];
  const nameAffinity = (a, b) => {
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return VIEW_SUFFIXES.some((s) => long === `${short}${s}`);
  };
  //
  // CRITICAL EXCLUSION — a 1:1 READ LAYER IS THE CORRECT ARCHITECTURE, NOT A DUPLICATE.
  // data-roots rule 4: ingest writes base tables, root views read them, consumers read root
  // views. A view sitting directly on its base SHOULD hold the same row count — that is what
  // "1:1 read layer" means. Flagging it would make this check wrong on the very shape we
  // want people to build, and a check that punishes the right answer gets switched off.
  // The discriminator is where the view's dependency actually points: at the base table
  // (legitimate) or past it at the raw source (a second parse). Verified live 08/04/2026 —
  // steadyapi_listing_events_v depends on steadyapi_listing_events and is correct;
  // steadyapi_tax_history_v depends on steadyapi_property_history_raw and is not.
  const readsItsBase = (viewName, baseName) => (sourcesOf.get(viewName) ?? new Set()).has(baseName);

  for (const [n, names] of tablesByCount) {
    if (names.length < 2) continue;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        if (!nameAffinity(names[i], names[j])) continue;
        const [base, layer] =
          names[i].length <= names[j].length ? [names[i], names[j]] : [names[j], names[i]];
        if (readsItsBase(layer, base)) continue; // the correct shape — say nothing
        if (findings.some((f) => f.a === names[i] && f.b === names[j])) continue;
        findings.push({
          source: "(no catalog link — one side is a pipeline-written table)",
          a: names[i],
          b: names[j],
          count: n,
          why: "base/read-layer name pair holding the SAME row count",
        });
      }
    }
  }

  const exactPairs = [...tablesByCount.entries()].filter(([, names]) => names.length > 1);
  if (exactPairs.length) {
    console.log("\nSAME ROW COUNT (across everything counted — includes table/view pairs");
    console.log("that the catalog cannot link, which is how the permits duplicate hid):");
    for (const [n, names] of exactPairs)
      console.log(`  ${String(n).padStart(9)}  ${names.join("  ==  ")}`);
  }

  await sql.end();

  if (findings.length) {
    console.error(
      `\nDUPLICATE ROOT SUSPECTED — ${findings.length} pair(s) read the same source AND hold the same row count:`,
    );
    for (const f of findings) {
      console.error(`  data_lake.${f.a}  ==  data_lake.${f.b}   (${f.count} rows)`);
      console.error(`      ${f.why} — ${f.source}`);
    }
    console.error(
      `\nSame source + same count is what a second parse looks like. A legitimate sibling\n` +
        `family agrees on the source and DISAGREES on the count. Decide one root per concept\n` +
        `(docs/standards/data-roots.md) before either grows a consumer.`,
    );
    process.exit(1);
  }
  console.log("\nNo same-source + same-count pair found.");
}

main().catch((e) => {
  console.error("check-duplicate-roots failed:", e.message);
  process.exit(2); // distinct from a real finding — a broken probe is not a clean bill
});
