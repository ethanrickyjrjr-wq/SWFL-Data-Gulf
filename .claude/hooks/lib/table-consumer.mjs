// .claude/hooks/lib/table-consumer.mjs
//
// PURE RULES for Gate 12 — the brain-first ingest gate, which until 08/04/2026 was
// doctrine with no mechanism.
//
// CLAUDE.md has said this since the Brain Factory rules were written:
//   "Brain-first ingest gate: no bulk ingest hits Tier 2 (data_lake.*) without its
//    consuming brain's PackDefinition in the same PR."
// check-prepush-gate.mjs implemented Gates 1-11 and NOT that one. So on 08/03/2026 an
// ingest lane landed three populated tables — steadyapi_neighborhoods (245 rows),
// steadyapi_neighborhood_amenities (16,304), steadyapi_property_neighborhood (19,805) —
// and pushed clean with zero readers anywhere in refinery/ lib/ app/. The operator
// found it a day later by asking. This module is the mechanism that makes that push
// fail instead.
//
// TWO CORRECTIONS to the doctrine, both deliberate:
//  1. A CONSUMER IS NOT ONLY A PackDefinition. The doctrine only ever imagined a brain
//     reading a table, so an email recipe, an app route, or a lib resolver satisfied it
//     in spirit and nothing in writing. The 08/03 case wanted a DELIVERABLE consumer.
//     Any non-test reader under refinery/ lib/ app/ components/ counts here.
//  2. It gates the TABLE, not the pipeline. What matters is that something reads the
//     rows, not which layer wrote them.
//
// KNOWN LIMITATION 2 — A COMMENT SATISFIES THIS GATE. Consumer detection is
// file-granular (`git grep -l` + isConsumerPath), not AST-aware, so a bare
// `// TODO: read data_lake.foo` inside any lib/ file clears the orphan. That is a real
// hole and it is named here rather than hidden: the gate's job is to stop the
// ACCIDENTAL case (a pipeline lands, the reader is "next session", nobody notices for
// a day), which it does. It cannot stop someone deliberately writing a comment to
// silence it — and that person already has ALLOW_TABLE_WITHOUT_CONSUMER=1, which at
// least logs. Tightening to "the table name appears in a string literal or a .from()
// call" is the obvious next step if the comment case ever actually happens.
//
// KNOWN LIMITATION 1, stated rather than papered over: detection is convention-based —
// added .sql migrations that CREATE a data_lake table, and added ingest pipeline .py
// files declaring `*_TABLE = "name"` constants (this repo's actual convention, see
// ingest/pipelines/neighborhood_amenities/pipeline.py). A table conjured by dlt with no
// migration and no such constant is NOT detected. This gate catches the real, common
// shape; it does not claim to be exhaustive.

/** Table names a .sql file CREATEs in the data_lake schema. Case/whitespace tolerant,
 *  IF NOT EXISTS tolerant, quoted-identifier tolerant. */
export function tablesCreatedInSql(sqlText) {
  const found = new Set();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?data_lake"?\s*\.\s*"?([a-z0-9_]+)"?/gi;
  let m;
  while ((m = re.exec(String(sqlText ?? "")))) found.add(m[1].toLowerCase());
  return [...found];
}

/** Table names an ingest pipeline declares via this repo's `*_TABLE = "name"`
 *  convention. A name with a dot (a schema-qualified string) is normalized to its
 *  last segment so `"data_lake.foo"` and `"foo"` agree. */
export function tablesDeclaredInPipeline(pyText) {
  const found = new Set();
  const re = /^[A-Z][A-Z0-9_]*TABLE[A-Z0-9_]*\s*=\s*["']([A-Za-z0-9_.]+)["']/gm;
  let m;
  while ((m = re.exec(String(pyText ?? "")))) {
    const raw = m[1].toLowerCase();
    const name = raw.includes(".") ? raw.split(".").pop() : raw;
    // Guard against a constant holding a schema name only (e.g. SCHEMA_TABLE = "data_lake").
    if (name && name !== "data_lake") found.add(name);
  }
  return [...found];
}

/** Paths that may NOT satisfy "something reads this table".
 *
 *  - ingest/ and migrations/ are the WRITERS; a writer referencing its own table is
 *    the very thing being gated, so counting it would make the gate always pass.
 *  - docs/, verification/, _ASSISTANT/, _RESEARCH/ are prose. A catalogued table is
 *    still an unread table — that is the whole documented failure.
 *  - *.test.* / fixtures are not product consumers. A test proving a reader works is
 *    good; a test that is the ONLY reader means nothing in the product reads it.
 */
export function isConsumerPath(path) {
  const p = String(path ?? "").replace(/\\/g, "/");
  if (!p) return false;
  if (
    /(^|\/)(ingest|migrations|docs|verification|fixtures|_ASSISTANT|_RESEARCH|node_modules)\//.test(
      p,
    )
  )
    return false;
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(p)) return false;
  if (/(^|\/)test_[^/]+\.py$/.test(p)) return false;
  if (/\.(md|sql|ya?ml|json|jsonl|txt)$/.test(p)) return false;
  return /^(refinery|lib|app|components|utils|scripts)\//.test(p);
}

/**
 * The gate verdict. Pure: caller supplies the detected tables and, per table, the
 * list of paths that mention it anywhere in the tree.
 *
 * Returns the table names with NO consumer path — the orphans that must block.
 */
export function orphanTables(tables, mentionsByTable) {
  const orphans = [];
  for (const t of tables) {
    const mentions = mentionsByTable[t] ?? [];
    if (!mentions.some(isConsumerPath)) orphans.push(t);
  }
  return orphans;
}
