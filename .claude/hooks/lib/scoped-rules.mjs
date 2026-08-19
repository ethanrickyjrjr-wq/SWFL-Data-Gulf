// scoped-rules.mjs — THE RULE TABLE for write-scoped delivery (writ-guard-trio C).
// Spec: docs/superpowers/specs/2026-08-19-writ-guard-trio-design.md
//
// Each rule fires when the CONTENT being written matches `content` inside `path`'s
// scope (both must hit — that conjunction is what keeps this from being the topic
// router inject-focus.mjs deliberately rejects). Text stays ≤3 lines and POINTS at the
// owning doc: the doc is canon, this table is the doorbell. Once per rule per session.
//
// Adding a rule: only shapes that have actually recurred (a strike, a scratchpad
// entry, a locked CLAUDE.md rule). This is not a style linter.

export const SCOPED_RULES = [
  {
    id: "h-screen-dvh",
    path: null,
    content: /\bh-screen\b/,
    text: "Layout standard: use h-full or dvh, never h-screen (global CLAUDE.md non-negotiable #5).",
  },
  {
    id: "font-family-guard",
    path: /(^|\/)lib\/(email|deliverable)\//i,
    content: /font-?family/i,
    text:
      "Fonts are locked to Inter / JetBrains Mono (docs/design-reference/colors_and_type.css). " +
      "Hand-set fontFamily was the unguarded hole ('a rule only in a doc is not a rule') — " +
      "route through the existing typography guard in lib/email, never inline a family.",
  },
  {
    id: "zip-three-gates",
    path: /(^|\/)(ingest|lib|refinery)\//i,
    content: /zip_?code/i,
    text:
      "ZIP 3 gates (ingest/CLAUDE.md + docs/standards/claude-rules-archive-2026-08-18.md): " +
      "G1 situs address/lat-lon only — mailing ZIP is a " +
      "violation · G2 derivable now → derive+backfill+wire, else park in deferred · G3 new " +
      "Tier-2 zip_code needs its consuming brain in the same PR.",
  },
  {
    id: "deno-imports",
    path: /(^|\/)supabase\/functions\//i,
    content: /[\s\S]/,
    text: "Code in supabase/functions uses Deno-style imports (global CLAUDE.md non-negotiable #6).",
  },
  {
    id: "deed-not-list-price",
    path: /(^|\/)(lib|ingest|refinery)\//i,
    content: /(sale|sold|list)_?price/i,
    text:
      "Sold prices come from deed records (lee_deed_official_records / LEEPA lanes — " +
      "docs/standards/data-roots.md), never list price. Comps are size-banded same-type " +
      "(condos ≠ SFH, situs not mailing ZIP); rates are read as written, never recomputed.",
  },
  {
    id: "baked-before-live",
    path: /(^|\/)lib\/(email|deliverable|assistant)\//i,
    content: /\b(anthropic|claude-|generateText|messages\.create|narrative)/i,
    text:
      "RULE 0.7b: baked prose before a live model call — check `narratives` via " +
      "bakedAreaRead() in lib/narratives/area-read.ts (the ONE reader) first; compare " +
      "inputs_hash/baked_at; baked ships only behind the caller's own anchoring guard.",
  },
  {
    id: "paid-ladder",
    path: null,
    content: /\b(apify|steadyapi|OPERATOR_APPROVED_PAID_RUN)\b/i,
    text:
      "RULE 0.7a — the order is the rule: our free data → a paid row ALREADY BOUGHT → one " +
      "missing field behind the spend switch → labelled open slot. Check the rung below before " +
      "any paid call (docs/standards/email-build-playbook.md §3.3).",
  },
  {
    // RULE 1 ask-first, delivered at write time (folder-structure wave 08/19/2026:
    // the ask-first list was the one costly CLAUDE.md rule with zero mechanical
    // delivery, unlike its siblings 0.55/0.7a which already sit in this table).
    id: "ask-first-pack-output",
    path: /(^|\/)refinery\/packs\//i,
    content: /---\s*OUTPUT\s*---|key_metrics/i,
    text:
      "RULE 1 ask-first: brain pack edits that change --- OUTPUT --- shape or key_metrics " +
      "math need operator sign-off BEFORE the push — this is on the ask-first list, not " +
      "the just-push list.",
  },
  {
    id: "ask-first-data-lake-write",
    path: /(^|\/)ingest\//i,
    content: /data_lake\./i,
    text:
      "RULE 1 ask-first: ingest writes to data_lake.* need operator sign-off, and no bulk " +
      "ingest lands without its consuming brain's PackDefinition in the same PR " +
      "(brain-first ingest gate).",
  },
  {
    id: "ask-first-live-api-surface",
    path: /(^|\/)app\/api\/(b|mcp)\//i,
    content: /[\s\S]/,
    text:
      "RULE 1 ask-first: anything touching live /api/b/* or the MCP surface needs operator " +
      "sign-off before push — consumers read these live.",
  },
  {
    id: "sql-migrations-idempotent",
    path: null,
    content: /\b(CREATE\s+(TABLE|INDEX|SCHEMA)|ALTER\s+TABLE|DROP\s+(TABLE|INDEX))\b/i,
    text:
      "RULE 1 SQL migrations: run directly via `new Bun.SQL` (creds .dlt/secrets.toml; psql is " +
      "NOT installed), ALWAYS idempotent (IF NOT EXISTS / OR REPLACE), verify row count after.",
  },
  {
    id: "react-set-state-in-effect",
    path: /\.(tsx|jsx)$/i,
    content: /useEffect\(/,
    text:
      "Setting state inside useEffect is a hard-error RULE here (memory: " +
      "feedback_react-set-state-in-effect) — derive during render or move to the event handler.",
  },
];

/**
 * Which rules govern this write? Both path scope (when present) and content pattern
 * must hit, and already-fired ids stay silent — once per rule per session.
 */
export function matchScopedRules(filePath, text, fired = new Set(), rules = SCOPED_RULES) {
  const path = String(filePath || "").replace(/\\/g, "/");
  const body = String(text || "");
  if (!path || !body) return [];
  return rules.filter(
    (r) => !fired.has(r.id) && (!r.path || r.path.test(path)) && r.content.test(body),
  );
}
