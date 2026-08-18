// check-four-searches.test.mjs
//
// Every test is named for the REAL 07/22/2026 failure it would have caught.

// node:test, NOT bun:test. CI runs this directory as
//   node --test .github/scripts/*.test.mjs scripts/lib/*.test.mjs .claude/hooks/*.test.mjs
// and node's ESM loader cannot resolve the `bun:` protocol — importing bun:test here is
// not a failing test, it is ERR_UNSUPPORTED_ESM_URL_SCHEME killing the whole step before
// a single assertion runs. Every sibling in this directory uses node:test + node:assert;
// this file was the lone exception. Caught 07/22/2026 before it ever reached CI: the
// node:test step is currently masked behind an earlier `bun test` failure, so this would
// have landed silently and surfaced later as someone else's mystery break.
import assert from "node:assert";
import { describe, test } from "node:test";
import {
  graphFirstGap,
  isDataTurn,
  isInjected,
  isStructuralTurn,
  laneFor,
  missingLanes,
  readTurn,
} from "./check-four-searches.mjs";

const u = (text) => JSON.stringify({ type: "user", message: { content: text } });
const a = (calls) =>
  JSON.stringify({
    type: "assistant",
    message: { content: calls.map((c) => ({ type: "tool_use", name: c.name, input: c.input })) },
  });

describe("the five failures of 07/22/2026 — each is one missing lane", () => {
  test("F4 — grepping ONE file is not searching the code", () => {
    // Real failure: grepped `steadyGet(` in lib/listings/steadyapi.ts, reported "we call
    // 3 of 18 endpoints." The Python ingest layer was never searched. Answer was 7.
    const lines = [
      u("ARE YOU SURE? THERE IS NO WAY WE ONLY CALL 3 OF 18 ENDPOINTS"),
      a([{ name: "Grep", input: { pattern: "steadyGet\\(", path: "lib/listings/steadyapi.ts" } }]),
    ];
    const { text, calls } = readTurn(lines);
    assert.strictEqual(isDataTurn(text), true);
    const missing = missingLanes(calls);
    assert.ok(missing.includes("research")); // the census that already answered it
    assert.ok(missing.includes("live"));
    assert.ok(missing.includes("catalog"));
  });

  test("F5 — a live API call does NOT substitute for reading our own research", () => {
    // Real failure: re-derived the capability picture with live calls while
    // docs/steadyapi-capability-census.md had answered it on 07/16/2026.
    const lines = [
      u("what else are we not grabbing from the api?"),
      a([{ name: "Bash", input: { command: "bun -e 'await fetch(\"https://api...\")'" } }]),
      a([{ name: "Grep", input: { pattern: "endpoint" } }]),
    ];
    const missing = missingLanes(readTurn(lines).calls);
    assert.ok(missing.includes("research"));
    assert.ok(missing.includes("catalog"));
  });

  test("F3 — reading a PARSER is not reading the source", () => {
    // Real failure: "the vendor dates no sale" — read one endpoint's parser. The sold
    // endpoint we already call returns exact day-grain dates.
    const lines = [
      u("what dates does the source hold?"),
      a([{ name: "Read", input: { file_path: "lib/listings/steadyapi.ts" } }]),
    ];
    assert.ok(missingLanes(readTurn(lines).calls).includes("live"));
  });

  test("a turn that searched ALL FOUR lanes passes", () => {
    const lines = [
      u("what dates does the lake hold?"),
      a([
        { name: "Read", input: { file_path: "_RESEARCH/INDEX.md" } },
        { name: "Read", input: { file_path: "docs/standards/data-roots.md" } },
        { name: "Grep", input: { pattern: "sale_date" } },
        { name: "mcp__supabase__execute_sql", input: { query: "select min(sale_month) ..." } },
      ]),
    ];
    assert.deepStrictEqual(missingLanes(readTurn(lines).calls), []);
  });
});

describe("scope — RULE 11, a per-turn tax gets ignored on the turn that matters", () => {
  test("conversational turns do NOT fire", () => {
    assert.strictEqual(isDataTurn("nice, ship it"), false);
    assert.strictEqual(isDataTurn("make the header bigger"), false);
  });

  test("data questions DO fire", () => {
    assert.strictEqual(isDataTurn("what dates does the lake hold?"), true);
    assert.strictEqual(isDataTurn("WE CAN'T GET THIS DATA FROM STEADYAPI??"), true);
    assert.strictEqual(isDataTurn("which table feeds the sold median"), true);
  });

  test("the operator can opt out explicitly", () => {
    assert.strictEqual(isDataTurn("what fields do we have? no search, just tell me"), false);
  });

  // 07/22/2026 — MEASURED against the real transcript, not imagined. The gate was deaf
  // to 5 of the operator's 6 messages that session, including the one it exists to
  // force. Every string below is verbatim from that transcript; none of them matched.
  test("fires on 'do we have it somewhere else' — the four-lane question itself", () => {
    assert.strictEqual(isDataTurn("do we not have the information somewhere else?????"), true);
    assert.strictEqual(isDataTurn("dont we already have this"), true);
    assert.strictEqual(isDataTurn("is that somewhere already"), true);
  });

  test("fires when the subject is a specific artifact, not the word 'data'", () => {
    // "geometry", "pipe", "vintage" are subjects; the old SUBJECT list had none of them.
    assert.strictEqual(isDataTurn("why did we ue 2010 geometry anywhere???"), true);
    assert.strictEqual(isDataTurn("WHY IS THE PIPE BLOCKKED??????"), true);
    assert.strictEqual(isDataTurn("what vintage is that file"), true);
  });

  test("fires on a bare incredulous challenge to something just asserted", () => {
    // The operator's real reaction to a claim he doubts. It IS a demand to re-verify.
    assert.strictEqual(isDataTurn("WHAT????????????"), true);
    assert.strictEqual(isDataTurn("really??"), true);
  });

  test("still does NOT fire on genuine conversation", () => {
    // The scope limit has to survive the widening, or RULE 11 kicks in and the gate
    // gets ignored on the turn that actually matters.
    assert.strictEqual(isDataTurn("nice, ship it"), false);
    assert.strictEqual(isDataTurn("make the header bigger"), false);
    assert.strictEqual(isDataTurn("thanks"), false);
    assert.strictEqual(isDataTurn("commit and push"), false);
    assert.strictEqual(isDataTurn("looks good"), false);
  });
});

describe("lane classification", () => {
  test("the catalog is its own lane even though it lives under docs/", () => {
    assert.strictEqual(laneFor("Read", { file_path: "docs/standards/data-roots.md" }), "catalog");
    assert.strictEqual(laneFor("Grep", { path: "ingest/cadence_registry.yaml" }), "catalog");
  });

  test("a bare Grep with no path counts as a TREE-WIDE code search", () => {
    assert.strictEqual(laneFor("Grep", { pattern: "compsForAddress" }), "code");
  });

  test("SQL, crawl4ai and a real fetch all count as LIVE", () => {
    assert.strictEqual(laneFor("mcp__supabase__execute_sql", { query: "select 1" }), "live");
    assert.strictEqual(laneFor("Bash", { command: "crawl4ai https://docs.example.com" }), "live");
    assert.strictEqual(laneFor("Bash", { command: "bun -e 'fetch(\"https://x\")'" }), "live");
  });

  test("a graphify MCP traversal counts as CODE — same probe as the CLI, new transport", () => {
    // RULE 0.5 names graphify as the preferred code probe. The Bash arm already credited
    // the CLI; both MCP servers in .mcp.json (hosted `graphify`, stdio `graphify-local`)
    // scored zero until 08/11/2026.
    assert.strictEqual(
      laneFor("mcp__graphify__query_graph", { query: "who reads zip_code" }),
      "code",
    );
    assert.strictEqual(laneFor("mcp__graphify__gx_callers", { symbol: "updateSession" }), "code");
    assert.strictEqual(laneFor("mcp__graphify-local__get_neighbors", { node: "x" }), "code");
  });

  test("graphify METADATA and WRITES earn no lane — a lookup is not a search", () => {
    // Defect (b) guard: crediting these would let `list_repositories` stand in for the
    // tree-wide search the code lane exists to force.
    assert.strictEqual(laneFor("mcp__graphify__list_repositories", {}), null);
    assert.strictEqual(laneFor("mcp__graphify__graph_stats", { repository_id: "x" }), null);
    assert.strictEqual(laneFor("mcp__graphify__remember", { text: "x" }), null);
  });

  test("a graphify traversal is CODE, never LIVE — a derived index is not the source", () => {
    // The graph is an index OF OUR TREE. It cannot satisfy the lane whose whole point is
    // "a parser's shape is not the source's shape."
    assert.notStrictEqual(laneFor("mcp__graphify__query_graph", { query: "x" }), "live");
  });

  test("an unrelated call earns NO lane — running tests is not research", () => {
    assert.strictEqual(laneFor("Bash", { command: "bun test lib/assistant" }), null);
    assert.strictEqual(laneFor("Edit", { file_path: "lib/foo.ts" }), null);
  });
});

describe("transcript reading", () => {
  test("a tool RESULT is not the operator speaking", () => {
    // Tool results arrive as user-role turns. Treating one as the prompt would reset the
    // turn boundary and silently forgive every search made before it.
    const lines = [
      u("what dates does the lake hold?"),
      a([{ name: "Grep", input: { pattern: "sale_date" } }]),
      JSON.stringify({
        type: "user",
        message: { content: [{ type: "tool_result", content: "rows" }] },
      }),
    ];
    const { text, calls } = readTurn(lines);
    assert.ok(text.includes("what dates"));
    assert.strictEqual(calls.length, 1);
  });

  test("malformed lines are skipped, never thrown on", () => {
    const { text } = readTurn(["not json", "", u("which table holds sold price?")]);
    assert.ok(text.includes("which table"));
  });
});

// ── TUNING PASS 07/22/2026 ───────────────────────────────────────────────────
// Each test below is named for a defect MEASURED against the live transcripts
// after the gate went live: 44 rendered blocks across 9 sessions, 24 of them
// reporting all four lanes missing.
describe("tuning — measured against live transcripts", () => {
  test("FM: a harness injection resets the tool-call window to zero mid-turn", () => {
    // The window is counted from the last user-role message. Skill loads, background
    // task-notifications and compact resumes all arrive as user-role TEXT, so each one
    // zeroed a turn in which the lanes HAD been searched. RULE 3.5 makes those skill
    // loads mandatory — the gate fired hardest on the workflow the repo requires.
    const lines = [
      u("which table holds sold price?"),
      JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Grep", input: { pattern: "sold" } }] },
      }),
      u("Base directory for this skill: C:/skills/brainstorming"),
    ];
    const { text, calls } = readTurn(lines);
    assert.ok(text.includes("which table")); // the OPERATOR's message, not the injection
    assert.strictEqual(calls.length, 1); // the Grep is still counted
  });

  test("FM: the gate's own block message must not re-trigger the gate", () => {
    assert.strictEqual(
      isInjected("Stop hook feedback: [check-four-searches.mjs] 4 of 4 lanes"),
      true,
    );
    assert.strictEqual(
      isInjected("<task-notification><result>3 rows</result></task-notification>"),
      true,
    );
    assert.strictEqual(isInjected("[SYSTEM NOTIFICATION - NOT USER INPUT]"), true);
    // A real question that merely mentions one of those words is NOT an injection.
    assert.strictEqual(isInjected("did the task notification say which table?"), false);
  });

  test("FM4: a Grep scoped to ONE file must NOT satisfy the code lane", () => {
    // Failure #4 verbatim: grepped `steadyGet` in one .ts file and called the result
    // "everything we call". Real answer was 7 of 18. The gate used to pass that.
    assert.strictEqual(
      laneFor("Grep", { pattern: "steadyGet", path: "lib/listings/steadyapi.ts" }),
      null,
    );
    assert.strictEqual(laneFor("Grep", { pattern: "steadyGet", path: "lib" }), "code");
    assert.strictEqual(laneFor("Grep", { pattern: "steadyGet" }), "code");
  });

  test("FM: the repo's OWN preferred probes must earn the code lane", () => {
    // RULE 0.5 says prefer graphify; a PreToolUse hook nags Serena on every edit; a
    // tree-wide grep through Bash is the commonest search there is. All returned null,
    // so a turn that genuinely searched scored 0 of 4 and got blocked.
    assert.strictEqual(laneFor("Bash", { command: "grep -rn steadyGet ." }), "code");
    assert.strictEqual(laneFor("Bash", { command: 'graphify query "sale dates"' }), "code");
    assert.strictEqual(laneFor("mcp__serena__search_for_pattern", {}), "code");
    assert.strictEqual(laneFor("Bash", { command: 'psql -c "select 1"' }), "live");
  });

  test("RULE 11: generic nouns must not fire on ordinary operator prose", () => {
    // Measured ~30% fire rate on real prose before this trim. A gate that cries wolf on
    // a third of messages is ignored on the one that matters.
    assert.strictEqual(isDataTurn("take over for this idiot"), false);
    assert.strictEqual(isDataTurn("I need this all fixed. No questions. Just fix it."), false);
    assert.strictEqual(isDataTurn("tune it!!!!!!!!!!!!!"), false);
    assert.strictEqual(isDataTurn("land it and make sure we don't fuck up egress again"), false);
    // …while the five real 07/22 failures still fire.
    assert.strictEqual(isDataTurn("ok, just make sure we have beds and baths"), true);
    assert.strictEqual(isDataTurn("check this / where are we wiring to??"), true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GRAPH-FIRST GATE — added 08/11/2026.
//
// OPERATOR, verbatim: "ARE WE USING GRAPHIFY ON EVERY SESSSION OR NOT????????"
// Measured answer that day: NO. RULE 0.5 was amended 08/11/2026 to say the graph is the
// FIRST reach and grep the FALLBACK, and this gate was amended the same day to CREDIT
// graphify traversals — but crediting is not requiring. `searchesTheTree` is an OR: a
// plain Grep satisfied the code lane exactly as well as a graph traversal, so nothing
// noticed a session doing the reverse of the rule. Third strike on
// `decree-in-prose-code-never-walked-it`, so RULE 2 §0b makes this the mechanism.
//
// Each test is named for the failure mode it guards.
// ─────────────────────────────────────────────────────────────────────────────
describe("graph-first gate", () => {
  const GRAPH_CALL = { name: "mcp__graphify__gx_callers", input: { symbol: "x" } };
  const GREP_CALL = { name: "Grep", input: { pattern: "reportToEmailHtml" } };

  test("FM4 under-trigger: the structural shapes RULE 0.5 is about must actually fire", () => {
    assert.strictEqual(isStructuralTurn("who calls reportToEmailHtml?"), true);
    assert.strictEqual(isStructuralTurn("what reads active_listings_residential"), true);
    assert.strictEqual(isStructuralTurn("is anything consuming this table"), true);
    assert.strictEqual(isStructuralTurn("what breaks if I change planArrival"), true);
    assert.strictEqual(isStructuralTurn("blast radius of deleting that view"), true);
    assert.strictEqual(isStructuralTurn("is this dead code"), true);
    assert.strictEqual(isStructuralTurn("does anything still use bakedAreaRead"), true);
    assert.strictEqual(isStructuralTurn("who depends on the email doc renderer"), true);
  });

  test("FM1 over-trigger: ordinary prose must not become a structural question", () => {
    // RULE 11 — a gate that fires on ordinary sentences is ignored on the turn that
    // matters. Each of these carries a code-ish word and no SHAPE.
    assert.strictEqual(isStructuralTurn("call me when the build is green"), false);
    assert.strictEqual(isStructuralTurn("make the button blue"), false);
    assert.strictEqual(isStructuralTurn("read the playbook before you touch emails"), false);
    // MEASURED FALSE-FIRE 08/18/2026: "per touch" is cadence jargon ("migrate
    // opportunistically per touch"), not the edge verb — the gate blocked a
    // definitional question about a migration option.
    assert.strictEqual(isStructuralTurn("What is opportunistic per touch?"), false);
    assert.strictEqual(isStructuralTurn("use the paid row we already bought"), false);
    assert.strictEqual(isStructuralTurn("this is a dead end, back it out"), false);
    assert.strictEqual(isStructuralTurn(""), false);
  });

  test("FM: grep alone no longer satisfies a structural question", () => {
    // THE WHOLE POINT. Before this these two were interchangeable.
    assert.strictEqual(graphFirstGap("who calls reportToEmailHtml?", [GREP_CALL]), true);
    assert.strictEqual(graphFirstGap("who calls reportToEmailHtml?", [GRAPH_CALL]), false);
  });

  test("FM: a graph ATTEMPT satisfies it — the gate never demands a graph ANSWER", () => {
    // Measured 08/11/2026: gx_callers AND gx_references both returned 0 for
    // reportToEmailHtml while the tree had a real import at
    // lib/email/activation/sequence.ts:22. A gate requiring a non-empty result would
    // wedge on exactly that false negative.
    assert.strictEqual(
      graphFirstGap("who calls reportToEmailHtml?", [GRAPH_CALL, GREP_CALL]),
      false,
    );
    // The CLI form counts — same tool, different transport.
    assert.strictEqual(
      graphFirstGap("who calls X?", [{ name: "Bash", input: { command: 'graphify query "X"' } }]),
      false,
    );
    // Local stdio counts: stale beats unconsulted, and the ladder still ends at grep.
    assert.strictEqual(
      graphFirstGap("who calls X?", [{ name: "mcp__graphify-local__query_graph", input: {} }]),
      false,
    );
  });

  test("FM: a grep FOR the word graphify is not a probe OF the graph", () => {
    // Decoy-Grep, the shape defect (a) already cost us once.
    assert.strictEqual(
      graphFirstGap("who calls X?", [{ name: "Bash", input: { command: "grep -rn graphify ." } }]),
      true,
    );
  });

  test("FM2 wedge: the operator's opt-out must beat this gate too", () => {
    // If the graph is down or he just wants an answer, he keeps the ability to say so —
    // otherwise a vendor outage makes the turn unendable.
    assert.strictEqual(graphFirstGap("who calls X? no probe", [GREP_CALL]), false);
    assert.strictEqual(graphFirstGap("no search — who reads this table", [GREP_CALL]), false);
  });

  test("FM: metadata and writes must not satisfy it (defect (b), new lane)", () => {
    assert.strictEqual(
      graphFirstGap("who calls X?", [{ name: "mcp__graphify__graph_stats", input: {} }]),
      true,
    );
    assert.strictEqual(
      graphFirstGap("who calls X?", [{ name: "mcp__graphify__remember", input: { text: "x" } }]),
      true,
    );
  });

  test("FM3 loop: this gate's own block message must read as an injection", () => {
    // The four-lane gate learned this the hard way — a user-role message that is really
    // harness output silently RESET the tool-call window. Ours must be recognized too,
    // or a blocked turn re-reads as a fresh structural question forever.
    assert.strictEqual(isInjected("⛔ GRAPH-FIRST GATE — this is a structural question"), true);
    assert.strictEqual(isInjected("Stop hook feedback:\n⛔ GRAPH-FIRST GATE"), true);
  });

  test("the four-lane gate is untouched by any of this", () => {
    // Regression fence: graph-first is an ADDITIONAL requirement on structural turns,
    // never a relaxation of the four lanes.
    assert.deepStrictEqual(missingLanes([GRAPH_CALL]), ["research", "catalog", "live"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE INSTALLED VENDOR SURFACE — added 08/12/2026.
//
// The live matcher credited crawl4ai, curl, a URL, and Bun.SQL, but had no notion of
// "run the installed binary and read what it really does." So on 08/11/2026 a session
// that probed the graphify CLI directly — and found two of its three tuning flags
// UNDOCUMENTED on graphify.com, a finding only the installed artifact could produce —
// scored zero on the lane that finding belongs to, and the gate fired four times.
//
// This is defect (a) — UNDER-CREDIT, the repo's own canonical probe path scoring nothing
// — for the third time in this file, after the graphify-CLI miss and the psql/Bun.SQL
// miss documented directly above the arm this pass extends.
//
// THE LINE, and it is a fine one: using an installed tool to search OUR TREE is the CODE
// lane; asking that tool what IT is, or reading it as shipped, is the LIVE lane. RULE 0.4
// is why — "the plan says X" and "I remember X" are not verification, and neither is a
// vendor's own docs page when the installed artifact disagrees with it.
// ─────────────────────────────────────────────────────────────────────────────
describe("installed vendor surface — the live lane", () => {
  test("FM: reading the installed package as shipped is a LIVE probe, not nothing", () => {
    // The 08/11/2026 finding came from this exact call and it earned no lane at all:
    // `Read` matches neither the research arm (not _RESEARCH/docs) nor searchesTheTree.
    assert.strictEqual(
      laneFor("Read", {
        file_path: "C:/Users/ethan/crawl4ai-venv/Lib/site-packages/graphify/cli.py",
      }),
      "live",
    );
    assert.strictEqual(
      laneFor("Read", { file_path: "node_modules/resend/dist/index.d.ts" }),
      "live",
    );
    // Windows separators — the box this runs on.
    assert.strictEqual(
      laneFor("Read", {
        file_path: "C:\\Users\\ethan\\dev\\brain-platform\\node_modules\\dlt\\x.py",
      }),
      "live",
    );
  });

  test("FM: a vendor's OWN docs dir must not be eaten by the research lane", () => {
    // Ordering guard. The research arm matches any path containing `docs/`, so
    // node_modules/**/docs/** would score "research" — our writing — when it is in fact
    // the vendor's shipped text. The installed-package arm has to run FIRST.
    assert.strictEqual(laneFor("Read", { file_path: "node_modules/eve/docs/README.md" }), "live");
  });

  test("FM: asking a binary what it is counts as LIVE", () => {
    assert.strictEqual(laneFor("Bash", { command: "graphify --help" }), "live");
    assert.strictEqual(laneFor("Bash", { command: "gh --version" }), "live");
    assert.strictEqual(
      laneFor("Bash", {
        command:
          'C:\\Users\\ethan\\crawl4ai-venv\\Scripts\\python.exe -c "import crawl4ai; print(crawl4ai.__version__)"',
      }),
      "live",
    );
    assert.strictEqual(laneFor("Bash", { command: "pip show crawl4ai" }), "live");
  });

  test("THE LINE: `graphify query` is CODE, `graphify --help` is LIVE", () => {
    // A derived index OF OUR TREE cannot satisfy the lane whose whole point is "a
    // parser's shape is not the source's shape" — but the CLI's own contract can. This
    // distinction is subtle enough to get collapsed by the next session; both halves are
    // asserted together so collapsing either one reddens here.
    assert.strictEqual(laneFor("Bash", { command: 'graphify query "sale dates"' }), "code");
    assert.strictEqual(laneFor("Bash", { command: "graphify --help" }), "live");
    assert.notStrictEqual(laneFor("mcp__graphify__query_graph", { query: "x" }), "live");
  });

  test("FM: defect (b) in the new lane — a search tool's own flags are not a probe", () => {
    // If `--help|--version` alone earned LIVE, then `rg --version` would satisfy the lane
    // that exists to force a real source read. Search binaries are excluded by name, the
    // same exclusion `isGraphProbe` already draws for the decoy-Grep shape.
    assert.strictEqual(laneFor("Bash", { command: "rg --version" }), "code");
    assert.strictEqual(laneFor("Bash", { command: "grep --help" }), "code");
  });

  test("FM: ordinary flags are not contract probes — `-h` and `-v` stay out", () => {
    // `du -h`, `sort -h`, `curl -v` are everyday usage. Crediting short flags would make
    // the lane satisfiable by accident, which is how a gate stops meaning anything.
    assert.strictEqual(laneFor("Bash", { command: "du -h ." }), null);
    assert.strictEqual(laneFor("Bash", { command: "bun test lib/assistant" }), null);
    assert.strictEqual(laneFor("Edit", { file_path: "node_modules/x/y.js" }), null);
  });
});
