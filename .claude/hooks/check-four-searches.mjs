#!/usr/bin/env node
// check-four-searches.mjs — THE FOUR-LANE READ GATE (Stop hook).
//
// OPERATOR DECREE 07/22/2026, verbatim:
//   "I WANT 4 SEARCHES FOR DATA BEFORE CLAUDE SAYS A FUCKING WORD TO ME"
//
// WHY THIS EXISTS. Every read-first rule on this platform is honor-system — RULE 0.4
// (our research first), RULE 0.5 (probe the code), RULE 0.55 (the data-roots catalog).
// Nothing MEASURES whether the read happened; the only evidence is the assistant's own
// narration of it. On 07/22/2026 that failed FIVE times in ONE session, each time the
// same shape — answer from the first artifact touched, state it with confidence, write
// it into a permanent record:
//   1. "neither source has beds/baths"  — read two TABLES, not the source ceiling that
//      was already recorded in our own registry with a URL and an as_of date.
//   2. built `lee_comp_sales_v` and never added it to data-roots, the ONE catalog.
//   3. "the vendor dates no sale"       — read ONE endpoint's parser; the sold endpoint
//      we already call returns exact day-grain dates.
//   4. "we call 3 of 18 endpoints"      — grepped ONE helper in ONE .ts file, ignoring
//      the entire Python ingest layer. Real answer: 7 of 18.
//   5. re-derived the whole capability picture with live API calls while
//      docs/steadyapi-capability-census.md had answered it on 07/16/2026.
// Each was stated confidently, and three were committed. A rule skipped five times in a
// day is not a rule. This is the forcing function.
//
// WHAT IT DOES. On a DATA turn, blocks the assistant from ending its turn until all four
// lanes have actually been searched. Lanes are detected from REAL tool calls in the
// transcript — not from anything the assistant says it did.
//
// SCOPE (RULE 11 — a per-turn habit tax gets ignored on the one turn that matters).
// Fires only when the user's message reads as a data/capability question. Conversation,
// styling, and "run the tests" turns pass straight through.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LANES = {
  research:
    "OUR RESEARCH — _RESEARCH/ + docs/ (censuses, handoffs, specs). The answer is often ALREADY written.",
  catalog:
    "THE CATALOG — docs/standards/data-roots.md or ingest/cadence_registry.yaml (roots + source_ceiling).",
  code: "THE CODE — a TREE-WIDE Grep/Glob, every language. One file is not the codebase.",
  live: "THE LIVE SOURCE — a real query/response (SQL, API, crawl4ai). A parser's shape is not the source's shape.",
};

/**
 * Does this user message read as a data / capability question?
 *
 * WIDENED 07/22/2026 after measuring the original against a real transcript: it was
 * deaf to 5 of the operator's 6 messages that session — including "do we not have the
 * information somewhere else?", the exact question this gate exists to force. The
 * original demanded a noun from a fixed list AND an interrogative. Real operator
 * messages often carry neither: "dont we already have this" names no noun, and
 * "WHAT????" is a challenge rather than a question. Three doors now, any one opens.
 */
export function isDataTurn(text) {
  const t = String(text || "");
  if (!t.trim()) return false;
  // Explicit opt-out for turns the operator knows are trivial. Stays first — it must
  // beat every door below, or he loses the ability to say "just tell me".
  if (/\b(no search|skip search|no probe)\b/i.test(t)) return false;

  // DOOR 1 — "don't we already have this?" The four-lane question, asked outright.
  // Needs no subject noun: the phrasing IS the instruction to go look.
  const ALREADY_HAVE =
    /\b(already (have|hold|has|got|pulled|built)|do(n'?t| not) we|somewhere (else|already)|elsewhere|anywhere else)\b/i;
  if (ALREADY_HAVE.test(t)) return true;

  // DOOR 2 — a bare incredulous challenge to something just asserted. "WHAT????" is
  // the operator disbelieving a claim, which is a demand to re-verify it, not chatter.
  // Anchored to the WHOLE message, so "what dates does the lake hold?" takes door 3.
  if (/^\W*(what|really|huh|seriously|wait|since when)\W*$/i.test(t)) return true;

  // DOOR 3 — the original: a data subject plus an interrogative. SUBJECT gained the
  // concrete artifact nouns the operator actually types (geometry, pipe, vintage,
  // file, layer, fixture…); the old list held only abstractions like "data".
  const SUBJECT =
    // TRIMMED 07/22/2026. The generic nouns below were measured firing on ~30% of real
    // operator prose — "value", "number", "count", "index", "info", "information",
    // "feed", "hold(s)", "wire", "wired" appear constantly in ordinary sentences and
    // carry no data specificity on their own. Dropped. The concrete artifact nouns and
    // the property fields stay: those are what the five 07/22 failures were actually
    // about. A gate that cries wolf on a third of messages is a gate that gets ignored
    // on the one message that matters (RULE 11 — a per-turn habit tax is not free).
    /\b(data|dataset|field|fields|column|columns|table|tables|root|roots|endpoint|endpoints|api|source|sources|ingest|pipe|pipeline|schema|grain|quota|comps?|sold|sale|dates?|records?|rows?|coverage|grab|grabbing|pull|pulling|store|stored|storing|geometry|polygon|vintage|layers?|fixture|catalog|crosswalk|median|beds?|baths?|bedrooms?|bathrooms?|sqft|acreage|wiring|calls?|calling)\b/i;
  // ASKING stays permissive ONLY because SUBJECT is the real gate: a turn carrying no
  // data noun never fires regardless of phrasing. Verified 07/22/2026 by running the
  // binary against 9 real operator messages from SCRATCHPAD — "make the button blue"
  // and "make sure we don't fuck up egress" both stay silent, because neither carries
  // a SUBJECT word. The three that were DEAF before this widening:
  //   "ok, just make sure we have beds and baths"      -> failure #1 in the header above
  //   "...WE ONLYY CALL 3 OF 18. ARE YOU LOOKING..."   -> failure #4 in the header above
  //   "check this / where are we wiring to??"          -> scratchpad 0ab
  // The gate was deaf to the exact messages that produced the failures it exists to stop.
  const ASKING =
    /\?|\b(what|which|why|where|how many|do we|did we|can we|are we|is there|are there|show me|list|make sure|we have|we hold|we got|verify|confirm)\b/i;
  return SUBJECT.test(t) && ASKING.test(t);
}

/** Classify ONE tool call into a lane, or null. Pure. */
export function laneFor(name, input) {
  const n = String(name || "");
  const i = input && typeof input === "object" ? input : {};
  const path = String(i.file_path || i.path || i.pattern || "");
  const cmd = String(i.command || "");
  const hay = `${path} ${cmd}`;

  // LIVE — a real response from the real thing.
  if (/^mcp__supabase__(execute_sql|list_tables)$/.test(n)) return "live";
  if (/^mcp__swfl__swfl_fetch$/.test(n)) return "live";
  if (/^(WebFetch|WebSearch)$/.test(n)) return "live";
  if (/^(Bash|PowerShell)$/.test(n) && /crawl4ai|curl\s+|https?:\/\/|fetch\(/.test(cmd))
    return "live";

  // CATALOG — the one-root registries.
  if (/data-roots\.md|cadence_registry\.ya?ml/i.test(hay)) return "catalog";

  // RESEARCH — what we already wrote down.
  if (
    /^(Read|Grep|Glob)$/.test(n) &&
    /_RESEARCH|docs[/\\]|_FABLE5|SCRATCHPAD|SESSION_LOG/i.test(hay)
  )
    return "research";

  // LIVE — a real DB shell counts too.
  if (/^(Bash|PowerShell)$/.test(n) && /\b(psql|execute_sql|supabase\s+db)\b/.test(cmd))
    return "live";

  // CODE — a SEARCH across the tree.
  // TUNED 07/22/2026. Two measured defects, both fixed here:
  //
  //  (a) UNDER-CREDIT. The repo's OWN preferred probes earned nothing: RULE 0.5 says
  //      prefer graphify when the graph exists, a PreToolUse hook nags Serena on every
  //      edit, and a tree-wide `grep`/`rg` through Bash is the most common search there
  //      is. All returned null. Measured live: this gate blocked a turn in which the
  //      binary had been run, every tool classified against it, and 44 real blocks
  //      counted across 9 transcripts — because all of that went through Bash. A gate
  //      that cannot see the search it demands trains people to run a decoy Grep.
  //
  //  (b) OVER-CREDIT. A Grep scoped to ONE file returned "code". Failure #4 in the
  //      header above IS that exact shape — `grep steadyGet lib/listings/steadyapi.ts`,
  //      one file, called "everything we call". The gate would have waved it through on
  //      the very lane it exists to enforce. A single-file pattern now earns nothing.
  const searchesTheTree =
    /^(Grep|Glob)$/.test(n) ||
    /^mcp__serena__(search_for_pattern|find_symbol|find_referencing_symbols|get_symbols_overview)$/.test(
      n,
    ) ||
    (/^(Bash|PowerShell)$/.test(n) && /\b(grep|rg|ripgrep|graphify|Select-String)\b/.test(cmd));
  if (searchesTheTree) {
    // One named file with an extension and no glob is a READ wearing a search's clothes.
    const scopedToOneFile =
      /^(Grep|Glob)$/.test(n) &&
      /\.[a-z0-9]{1,5}$/i.test(String(i.path || "")) &&
      !/[*?]/.test(String(i.path || ""));
    if (!scopedToOneFile) return "code";
  }

  return null;
}

/** Lanes covered by a list of {name, input} tool calls. Pure. */
export function lanesCovered(calls) {
  const seen = new Set();
  for (const c of calls || []) {
    const l = laneFor(c.name, c.input);
    if (l) seen.add(l);
  }
  return seen;
}

/** Missing lane keys, in a stable order. Pure. */
export function missingLanes(calls) {
  const seen = lanesCovered(calls);
  return Object.keys(LANES).filter((k) => !seen.has(k));
}

/** Text of a message content field, string or block array. Pure. */
export function textOf(content) {
  if (typeof content === "string") return content;
  return (content || [])
    .filter((b) => b?.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/**
 * User-role text that is NOT the operator speaking. The harness injects several
 * classes of message with role=user; none of them is a question from Ricky, and
 * treating them as one both false-fires the gate and resets the tool-call window.
 * Anchored to the START of the message so a genuine question that merely mentions
 * one of these words is unaffected.
 */
export function isInjected(text) {
  return /^\s*(<task-notification|\[SYSTEM NOTIFICATION|Base directory for this skill:|<command-name>|<local-command|<system-reminder|Caveat: The messages below were generated by the user|This session is being continued from a previous conversation|Stop hook feedback:|⛔ FOUR-LANE READ GATE)/i.test(
    String(text || ""),
  );
}

/** Last user text + tool calls made since it. Pure over transcript lines. */
export function readTurn(lines) {
  const entries = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    try {
      entries.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }
  let lastUserIdx = -1;
  for (let i = entries.length - 1; i >= 0; i--) {
    const content = entries[i]?.message?.content;
    if (entries[i]?.type !== "user") continue;
    // A tool RESULT arrives as a user-role turn; that is not the operator speaking.
    const isToolResult = Array.isArray(content) && content.some((b) => b?.type === "tool_result");
    if (isToolResult) continue;
    const hasText =
      typeof content === "string" ||
      (Array.isArray(content) && content.some((b) => b?.type === "text"));
    if (!hasText) continue;
    // NEITHER IS A HARNESS INJECTION — and this is the load-bearing one.
    // The tool-call window is counted from the last user-role message. Skill loads,
    // background task-notifications and auto-compact resumes all arrive as user-role
    // TEXT, so each one silently RESET that window to zero mid-turn: a turn in which
    // all four lanes were genuinely searched, followed by a mandated
    // `superpowers:brainstorming` load, scored 0 of 4. RULE 3.5 makes those loads
    // mandatory, so the gate fired hardest on the workflow the repo requires.
    // Measured 07/22/2026 across the live transcripts: of 44 rendered blocks in 9
    // sessions, 24 reported all four lanes missing — the signature of a reset window,
    // not of an agent that skipped four searches.
    if (textOf(content) && isInjected(textOf(content))) continue;
    lastUserIdx = i;
    break;
  }
  if (lastUserIdx < 0) return { text: "", calls: [] };

  const uc = entries[lastUserIdx]?.message?.content;
  const text =
    typeof uc === "string"
      ? uc
      : (uc || [])
          .filter((b) => b?.type === "text")
          .map((b) => b.text)
          .join("\n");

  const calls = [];
  for (let i = lastUserIdx + 1; i < entries.length; i++) {
    const c = entries[i]?.message?.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) if (b?.type === "tool_use") calls.push({ name: b.name, input: b.input });
  }
  return { text, calls };
}

function main() {
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    process.exit(0); // not our shape — fail open
  }
  // Never loop: if we already blocked once and the model is continuing, let it finish.
  if (payload.stop_hook_active) process.exit(0);

  const tp = payload.transcript_path;
  if (!tp) process.exit(0);

  let lines;
  try {
    lines = readFileSync(tp, "utf8").split("\n");
  } catch {
    process.exit(0); // can't read state — fail open, never wedge the session
  }

  const { text, calls } = readTurn(lines);
  if (!isDataTurn(text)) process.exit(0);

  const missing = missingLanes(calls);
  if (missing.length === 0) process.exit(0);

  const done = Object.keys(LANES).filter((k) => !missing.includes(k));
  process.stderr.write(
    `\n⛔ FOUR-LANE READ GATE — this is a data question and ${missing.length} of 4 lanes were never searched.\n\n` +
      `Operator decree 07/22/2026: "I WANT 4 SEARCHES FOR DATA BEFORE CLAUDE SAYS A FUCKING WORD TO ME"\n\n` +
      (done.length ? `SEARCHED: ${done.join(", ")}\n\n` : "") +
      `NOT SEARCHED — do these before answering:\n` +
      missing.map((k) => `  ${k.toUpperCase()} — ${LANES[k]}`).join("\n") +
      `\n\nAll five documented failures of 07/22/2026 were one missing lane. Do not narrate a\n` +
      `search you did not run — this gate reads the transcript, not your description of it.\n`,
  );
  process.exit(2);
}

// WINDOWS. The idiomatic `import.meta.url === \`file://${process.argv[1]}\`` is BROKEN
// here: argv[1] is `C:\Users\…` (backslashes, drive letter) while import.meta.url is
// `file:///C:/Users/…`. They never match, so main() never runs and the gate silently
// becomes a no-op that exits 0 on every input — which is exactly how it shipped in
// ce163255 and got described as a forcing function without ever being executed once.
// The unit tests could not catch it: they import the pure helpers and never touch main().
// pathToFileURL normalizes both sides. Verified by RUNNING the binary, not reading it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
