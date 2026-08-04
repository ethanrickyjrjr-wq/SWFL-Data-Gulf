// .claude/hooks/lib/duplicate-root.mjs
//
// PURE RULES for Gate 14 — THE SAME ROOT, BUILT TWICE.
//
// THE INCIDENT (08/03-08/04/2026, operator decree to build this):
// Three typed tables landed 08/03 parsing data_lake.steadyapi_property_history_raw —
// steadyapi_listing_events (235,383 rows), steadyapi_tax_history (273,051),
// steadyapi_property_permits (79,281). The NEXT DAY a different session parsed the SAME
// raw bytes into three VIEWS with the same names plus `_v`, at IDENTICAL row counts, and
// wrote a handoff calling them new roots and one of them a "SOLE SOURCE". Every existing
// guard reported green the whole time:
//   · repolith claims are FILE-level — two sessions writing DIFFERENT files never collide
//   · git merge is FILE-level — same
//   · Gate 12 fires on an added data_lake TABLE with no reader — these were VIEWS, and
//     their readers existed (they were simply never called)
//   · the tests passed, the typecheck passed, the row counts matched
// The duplication was at the CONCEPT level, and nothing in this repo compared concepts.
//
// WHAT THIS GATE COMPARES: not filenames, not table names — DERIVATIONS. Two artifacts
// that parse the same array out of the same source relation are building the same thing,
// whatever they call it and whichever file they live in.
//
// WHY THE KEY IS (relation + json path) AND NOT THE RELATION ALONE:
// events, tax and permits ALL legitimately read steadyapi_property_history_raw. Keying on
// the relation would flag all three against each other on day one, the gate would be
// wrong more often than right, and it would be switched off inside a week. The array is
// what separates a family from a duplicate: `->'property_history'` vs `->'tax_history'`
// vs `->'building_permits'`.
//
// WHY PYTHON IS SCANNED TOO: the 08/03 migrations create EMPTY tables. The link from
// table to source lives only in the parser's SQL string
// (ingest/pipelines/listing_lifecycle/parse_listing_events.py). A scan that read .sql
// alone would have found nothing to collide with and passed the push — i.e. it would have
// been a gate that reported green on the exact incident it was written for.
//
// KNOWN LIMITATION, stated rather than hidden: an object created OUT OF BAND has no
// artifact to index. data_lake.steadyapi_property_permits is live in prod with a primary
// key and a unique key and has NO migration and NO parser anywhere in this repo — this
// gate cannot see it, and would NOT have blocked the permits half of the incident. That
// half is covered by the live sweep, `node scripts/check-duplicate-roots.mjs`, which
// compares what is actually IN the database rather than what the repo says should be.
// Two halves, because the failure had two shapes.

/** data_lake objects a text CREATEs — tables AND views. Gate 12 only ever looked for
 *  tables, which is one of the reasons the 08/04 views walked past it. */
export function objectsCreatedInSql(text) {
  const found = new Set();
  const re =
    /create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?"?data_lake"?\s*\.\s*"?([a-z0-9_]+)"?/gi;
  let m;
  while ((m = re.exec(String(text ?? "")))) found.add(m[1].toLowerCase());
  return [...found];
}

/** Every data_lake relation a text NAMES. Includes both sources and created objects —
 *  callers subtract the created set. Catches bare `data_lake.foo` (SQL) and the
 *  `"data_lake.foo"` string constants this repo's Python parsers use. */
function relationsMentioned(text) {
  const found = new Set();
  const re = /"?data_lake"?\s*\.\s*"?([a-z0-9_]+)"?/gi;
  let m;
  while ((m = re.exec(String(text ?? "")))) found.add(m[1].toLowerCase());
  return found;
}

/** The json arrays a text EXPLODES — the last path segment inside each
 *  `jsonb_array_elements(...)` call. This is the discriminator that keeps three legitimate
 *  families off each other's backs.
 *
 *  It is deliberately NOT "every `->'x'` in the file". An earlier cut of this rule counted
 *  scalar field reads too, so a view selecting `->>'event_name'` collided with any other
 *  artifact that also read a field called event_name — noise that has nothing to do with
 *  building the same root. What makes two artifacts the same root is exploding the same
 *  array out of the same relation. */
function arrayPathsExploded(text) {
  const found = new Set();
  const src = String(text ?? "");
  const call = /jsonb_array_elements(?:_text)?\s*\(/gi;
  let m;
  while ((m = call.exec(src))) {
    // The argument may nest (coalesce(r.body->'body'->'property_history', '[]')), so read a
    // bounded window after the call rather than trying to balance parentheses.
    const window = src.slice(m.index, m.index + 300);
    const paths = [...window.matchAll(/->>?\s*'([a-z0-9_]+)'/gi)]
      .map((p) => p[1].toLowerCase())
      .filter((p) => !ENVELOPE_PATHS.has(p));
    if (paths.length) found.add(paths[0]);
  }
  return found;
}

/** Paths that are envelope plumbing rather than a family: every Steady body is
 *  {meta, body}, so `body` appears in all of them and would collide everything. */
const ENVELOPE_PATHS = new Set(["body", "meta", "data", "results", "items"]);

/**
 * The set of "<source_relation>::<json_path>" derivations a text performs.
 *
 * A relation the text CREATES is never counted as its own source — otherwise every file
 * collides with itself. When a text names a source but parses no json, the relation alone
 * is the key, so a plain `create view x as select * from data_lake.y` is still comparable.
 */
export function derivationKeys(text) {
  const created = new Set(objectsCreatedInSql(text));
  const sources = [...relationsMentioned(text)].filter((r) => !created.has(r));
  const paths = [...arrayPathsExploded(text)];
  if (!sources.length) return [];
  if (!paths.length) return sources.map((s) => `${s}::*`);
  const keys = new Set();
  for (const s of sources) for (const p of paths) keys.add(`${s}::${p}`);
  return [...keys];
}

/**
 * Collisions between a CANDIDATE artifact (one being added/changed in this push) and an
 * INDEX of everything already in the repo.
 *
 * Only fires when the candidate actually CREATES something — a probe script or an ad-hoc
 * query that reads the same array is not building a second root.
 *
 * @param {{artifact: string, text: string}} candidate
 * @param {Array<{artifact: string, text: string}>} index
 * @returns {Array<{newObject: string, key: string, existingArtifact: string}>}
 */
export function findDerivationCollisions(candidate, index) {
  const created = objectsCreatedInSql(candidate?.text);
  if (!created.length) return [];

  const mine = new Set(derivationKeys(candidate?.text));
  if (!mine.size) return [];

  const hits = [];
  const seen = new Set();
  for (const other of index ?? []) {
    // An artifact never collides with itself (a re-push of the same file).
    if (!other || other.artifact === candidate.artifact) continue;
    for (const key of derivationKeys(other.text)) {
      if (!mine.has(key)) continue;
      // A wildcard key means "reads this relation, parses no json" — too weak to block on
      // its own, or every probe would trip it.
      if (key.endsWith("::*")) continue;
      for (const obj of created) {
        const dedupe = `${obj}|${key}|${other.artifact}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        hits.push({ newObject: obj, key, existingArtifact: other.artifact });
      }
    }
  }
  return hits;
}
