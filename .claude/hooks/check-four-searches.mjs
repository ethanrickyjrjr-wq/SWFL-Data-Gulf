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

/**
 * The graphify MCP tools that TRAVERSE the graph. Module scope 08/11/2026 so `laneFor`
 * (which CREDITS a traversal) and `graphFirstGap` (which REQUIRES one on a structural
 * turn) can never drift — two copies would silently mean two definitions of "consulted
 * the graph".
 */
const GRAPH_TRAVERSAL =
  /^mcp__graphify(-local)?__(query_graph|shortest_path|get_node|get_neighbors|get_community|god_nodes|gx_(find|find_seeds|callers|callees|impact|trace|references|expand|node|file_neighbors|rank_files|tests_for|imports_exports))$/;

/**
 * Is this a STRUCTURAL question — "who touches this?" — as opposed to a value lookup?
 *
 * ADDED 08/11/2026. Operator, verbatim: "ARE WE USING GRAPHIFY ON EVERY SESSSION OR
 * NOT????????". Measured answer that day: no, and nothing made us. RULE 0.5 had been
 * amended hours earlier to say the graph is the FIRST reach and grep the FALLBACK, and
 * `laneFor` had been amended the same day to CREDIT graphify traversals — but
 * `searchesTheTree` is an OR, so a plain Grep satisfied the code lane exactly as well as
 * a traversal. CREDITING IS NOT REQUIRING. Third strike on the registry shape
 * `decree-in-prose-code-never-walked-it`, so RULE 2 §0b forbids another scratchpad entry
 * and demands the mechanism instead.
 *
 * WHY A SHAPE AND NOT A NOUN LIST. Grep only returns what you already hypothesized; the
 * graph returns what you had no reason to type. That difference only matters for
 * questions about EDGES — who calls, what reads, what breaks. A value lookup ("what's in
 * the sold table") is answered fine by grep and is deliberately NOT gated: RULE 11 says a
 * gate that fires on ordinary prose gets ignored on the turn that matters. `laneFor`'s
 * defect (b) taught us what over-crediting costs; over-TRIGGERING is the same error
 * pointed the other way.
 */
export function isStructuralTurn(text) {
  const t = String(text || "");
  if (!t.trim()) return false;

  // "who/what/anything <relationship verb> <thing>" — the edge question.
  // `(?<!per )touch` — "per touch" is cadence jargon ("migrate opportunistically per
  // touch"), not the edge verb; measured false-fire 08/18/2026 on a definitional question.
  const TOUCHES =
    /\b(who|what|anything|any other|nothing)\b[^.?!\n]{0,60}\b(calls?|calling|reads?|reading|uses?|using|consumes?|consuming|(?<!per )touch(?:es|ing)?|depends? on|imports?|importing|references?|referencing|wired to|writes? to)\b/i;
  // "and then what?" asked about a change — RULE 12's own question.
  const IMPACT =
    /\bwhat (?:breaks|happens) if\b|\bblast radius\b|\bimpact of (?:changing|deleting|removing)\b/i;
  // The dark-consumer question: is anything on the other end of this at all?
  const DEAD =
    /\bdead code\b|\b(?:is|are) (?:this|that|these|it) dead\b|\bstill (?:used|wired|live)\b/i;

  return TOUCHES.test(t) || IMPACT.test(t) || DEAD.test(t);
}

/**
 * Did a real graph probe happen? TRAVERSALS ONLY — the same line `laneFor` draws and for
 * the same reason: `graph_stats` / `list_repositories` are metadata ABOUT the graph and
 * `remember` / `ingest_turns` are writes. Crediting those would let a session satisfy
 * graph-first without traversing an edge — defect (b) in a new lane.
 */
function isGraphProbe(name, input) {
  const n = String(name || "");
  const cmd = String((input && input.command) || "");
  if (GRAPH_TRAVERSAL.test(n)) return true;
  // The CLI form. Grep-shaped commands excluded on purpose: `grep -rn graphify .` is a
  // search FOR the word, not a probe OF the graph, and crediting it would reopen the
  // decoy-Grep hole this gate exists to close.
  return (
    /^(Bash|PowerShell)$/.test(n) &&
    /\bgraphify\b/.test(cmd) &&
    !/\b(grep|rg|ripgrep|Select-String)\b/.test(cmd)
  );
}

/**
 * TRUE when the turn asks a structural question and no graph probe was made.
 *
 * FALL-THROUGH IS DELIBERATE and is what keeps this from being worse than no gate: an
 * ATTEMPT satisfies it, it never requires the graph to ANSWER. Measured 08/11/2026 —
 * `gx_callers` and `gx_references` both returned 0 for `reportToEmailHtml` while the tree
 * carried a real import at lib/email/activation/sequence.ts:22, and the hosted index is
 * code-only and often many commits behind HEAD. A gate demanding a non-empty result would
 * wedge on exactly that false negative. Consult the graph first, then fall down the
 * ladder to grep precisely as RULE 0.5 already says.
 */
export function graphFirstGap(text, calls) {
  const t = String(text || "");
  if (!isStructuralTurn(t)) return false;
  // The operator's opt-out beats this gate too, or a vendor outage makes a turn
  // unendable. Same phrases isDataTurn honors — he keeps "just tell me".
  if (/\b(no search|skip search|no probe)\b/i.test(t)) return false;
  return !(calls || []).some((c) => isGraphProbe(c?.name, c?.input));
}

/**
 * A path INSIDE an installed dependency — the vendor's code as actually shipped to this
 * box, not our tree and not our writing about it.
 */
// `(?:^|[/\\])` — NOT a bare separator. A relative path starts AT the segment
// (`node_modules/eve/docs/README.md`), and requiring a leading slash silently dropped it
// into the research arm, i.e. filed the vendor's own shipped text as our writing.
const INSTALLED_PKG =
  /(?:^|[/\\])(?:site-packages|dist-packages|node_modules|Cellar|\.venv|[\w.-]*-venv)[/\\]|\.cargo[/\\]registry[/\\]/i;

/**
 * A command asking a binary to describe ITSELF — its real flags, its real version.
 *
 * SHORT FLAGS ARE DELIBERATELY ABSENT. `-h` is `du -h` / `sort -h`, `-v` is `curl -v`;
 * crediting them would make this lane satisfiable by accident, and a lane satisfied by
 * accident is defect (b) — the over-credit failure this file has already paid for twice.
 */
const SELF_DESCRIBE =
  /(?:^|\s)--(?:help|version)\b|\b__version__\b|\bpip3?\s+(?:show|list)\b|\bnpm\s+(?:ls|list|view)\b|\bbun\s+pm\s+ls\b/i;

/** Search binaries, excluded from SELF_DESCRIBE — `rg --version` probes nothing. */
const SEARCH_BINARY = /\b(grep|rg|ripgrep|Select-String|findstr|ack|ag)\b/i;

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

  // LIVE — THE INSTALLED VENDOR SURFACE, run or read as shipped.
  //
  // ADDED 08/12/2026, and this is defect (a) — UNDER-CREDIT, the repo's own canonical
  // probe path scoring zero — for the THIRD time in this function, after the graphify-CLI
  // miss and the psql/Bun.SQL miss documented below. The live matcher knew crawl4ai, curl,
  // a URL and Bun.SQL, but had no notion of "run the installed binary and read what it
  // really does." Measured 08/11/2026: a session read the installed graphify `cli.py` and
  // found two of its three tuning flags UNDOCUMENTED on graphify.com — a finding ONLY the
  // installed artifact could produce — and the call that produced it earned no lane at all,
  // matching neither the research arm nor `searchesTheTree`. The gate then fired four times.
  //
  // THE LINE, and it is fine: using an installed tool to search OUR TREE is the CODE lane;
  // asking that tool what IT is, or reading it as shipped, is LIVE. RULE 0.4 is the reason
  // — a vendor's docs page is not verification when the installed artifact disagrees, which
  // is exactly what the graphify probe found. ORDER MATTERS: this sits ABOVE the research
  // arm on purpose, or `node_modules/**/docs/**` scores "research" — our writing — when it
  // is the vendor's own shipped text.
  if (/^(Read|Grep|Glob)$/.test(n) && INSTALLED_PKG.test(path)) return "live";
  if (
    /^(Bash|PowerShell)$/.test(n) &&
    SELF_DESCRIBE.test(cmd) &&
    !SEARCH_BINARY.test(cmd) // `rg --version` is not a probe — defect (b), new lane.
  )
    return "live";

  // CATALOG — the one-root registries.
  if (/data-roots\.md|cadence_registry\.ya?ml/i.test(hay)) return "catalog";

  // RESEARCH — what we already wrote down.
  if (
    /^(Read|Grep|Glob)$/.test(n) &&
    /_RESEARCH|docs[/\\]|_FABLE5|_AUDIT_AND_ROADMAP|SCRATCHPAD|SESSION_LOG/i.test(hay)
  )
    return "research";

  // LIVE — a real DB shell counts too.
  //
  // FIXED 08/04/2026. `psql` IS NOT INSTALLED ON THIS BOX — every live Postgres read in this
  // repo goes through `new Bun.SQL(...)` (scripts/run-migration.ts, scripts/check-schema-drift.ts,
  // scripts/gen-supabase-types.ts, and every ad-hoc `bun -e` probe). The matcher below recognized
  // only psql / execute_sql / supabase db, so the repo's OWN canonical DB path scored zero and the
  // gate blocked turns that had already queried prod. Measured the day this was fixed: five live
  // SQL queries in one session, all credited as nothing, two forced re-answers.
  if (
    /^(Bash|PowerShell)$/.test(n) &&
    /\b(psql|execute_sql|supabase\s+db)\b|Bun\.SQL|sql\.unsafe\(|run-migration\.ts/.test(cmd)
  )
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
  //
  //  (c) UNDER-CREDIT, THE MCP FORM. ADDED 08/11/2026. The Bash arm below has credited
  //      the `graphify` CLI since (a), but graphify now also reaches us as MCP servers
  //      (`graphify` hosted, `graphify-local` stdio — both in .mcp.json), and every one
  //      of those traversals scored zero. Same defect as (a), same tool, new transport.
  //      TRAVERSALS ONLY, on purpose: `graph_stats` / `list_repositories` are metadata
  //      about the graph, and `remember` / `ingest_turns` are writes — crediting those
  //      would be defect (b) again, a lookup wearing a search's clothes.
  const graphifyTraversal = GRAPH_TRAVERSAL.test(n);
  const searchesTheTree =
    /^(Grep|Glob)$/.test(n) ||
    /^mcp__serena__(search_for_pattern|find_symbol|find_referencing_symbols|get_symbols_overview)$/.test(
      n,
    ) ||
    graphifyTraversal ||
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
  return /^\s*(<task-notification|\[SYSTEM NOTIFICATION|Base directory for this skill:|<command-name>|<local-command|<system-reminder|Caveat: The messages below were generated by the user|This session is being continued from a previous conversation|Stop hook feedback:|⛔ FOUR-LANE READ GATE|⛔ GRAPH-FIRST GATE)/i.test(
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

  // GRAPH-FIRST GATE — checked BEFORE the four-lane gate and INDEPENDENTLY of it.
  // Independent on purpose: `isDataTurn` requires a data NOUN, and the structural
  // questions RULE 0.5 is actually about often carry none — "what reads this?" names no
  // dataset. Gating graph-first behind isDataTurn would fire it only on the overlap and
  // miss the exact turns the rule exists for.
  if (graphFirstGap(text, calls)) {
    process.stderr.write(
      `\n⛔ GRAPH-FIRST GATE — this is a structural question and the graph was never asked.\n\n` +
        `RULE 0.5 (08/11/2026): the graph is the FIRST reach; grep is the FALLBACK.\n` +
        `Operator: "ARE WE USING GRAPHIFY ON EVERY SESSSION OR NOT????????"\n\n` +
        `Grep only returns what you already thought to type. The graph returns what you had\n` +
        `no reason to type — which is why it matters most exactly when you are most sure you\n` +
        `already know the answer. Load the tools in ONE call, then traverse:\n` +
        `  ToolSearch("select:mcp__graphify__gx_rank_files,mcp__graphify__gx_callers,mcp__graphify__gx_impact,mcp__graphify__gx_trace,mcp__graphify__gx_tests_for,mcp__graphify__gx_find")\n\n` +
        `An ATTEMPT satisfies this gate — a graph that answers nothing is fine, and you then\n` +
        `fall through to grep. What is not fine is never asking it.\n` +
        `Genuinely not a structural question, or the graph is down? Say "no probe".\n`,
    );
    process.exit(2);
  }

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
