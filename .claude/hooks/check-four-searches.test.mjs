// check-four-searches.test.mjs
//
// Every test is named for the REAL 07/22/2026 failure it would have caught.

import { describe, expect, test } from "bun:test";
import { isDataTurn, isInjected, laneFor, missingLanes, readTurn } from "./check-four-searches.mjs";

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
    expect(isDataTurn(text)).toBe(true);
    const missing = missingLanes(calls);
    expect(missing).toContain("research"); // the census that already answered it
    expect(missing).toContain("live");
    expect(missing).toContain("catalog");
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
    expect(missing).toContain("research");
    expect(missing).toContain("catalog");
  });

  test("F3 — reading a PARSER is not reading the source", () => {
    // Real failure: "the vendor dates no sale" — read one endpoint's parser. The sold
    // endpoint we already call returns exact day-grain dates.
    const lines = [
      u("what dates does the source hold?"),
      a([{ name: "Read", input: { file_path: "lib/listings/steadyapi.ts" } }]),
    ];
    expect(missingLanes(readTurn(lines).calls)).toContain("live");
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
    expect(missingLanes(readTurn(lines).calls)).toEqual([]);
  });
});

describe("scope — RULE 11, a per-turn tax gets ignored on the turn that matters", () => {
  test("conversational turns do NOT fire", () => {
    expect(isDataTurn("nice, ship it")).toBe(false);
    expect(isDataTurn("make the header bigger")).toBe(false);
  });

  test("data questions DO fire", () => {
    expect(isDataTurn("what dates does the lake hold?")).toBe(true);
    expect(isDataTurn("WE CAN'T GET THIS DATA FROM STEADYAPI??")).toBe(true);
    expect(isDataTurn("which table feeds the sold median")).toBe(true);
  });

  test("the operator can opt out explicitly", () => {
    expect(isDataTurn("what fields do we have? no search, just tell me")).toBe(false);
  });

  // 07/22/2026 — MEASURED against the real transcript, not imagined. The gate was deaf
  // to 5 of the operator's 6 messages that session, including the one it exists to
  // force. Every string below is verbatim from that transcript; none of them matched.
  test("fires on 'do we have it somewhere else' — the four-lane question itself", () => {
    expect(isDataTurn("do we not have the information somewhere else?????")).toBe(true);
    expect(isDataTurn("dont we already have this")).toBe(true);
    expect(isDataTurn("is that somewhere already")).toBe(true);
  });

  test("fires when the subject is a specific artifact, not the word 'data'", () => {
    // "geometry", "pipe", "vintage" are subjects; the old SUBJECT list had none of them.
    expect(isDataTurn("why did we ue 2010 geometry anywhere???")).toBe(true);
    expect(isDataTurn("WHY IS THE PIPE BLOCKKED??????")).toBe(true);
    expect(isDataTurn("what vintage is that file")).toBe(true);
  });

  test("fires on a bare incredulous challenge to something just asserted", () => {
    // The operator's real reaction to a claim he doubts. It IS a demand to re-verify.
    expect(isDataTurn("WHAT????????????")).toBe(true);
    expect(isDataTurn("really??")).toBe(true);
  });

  test("still does NOT fire on genuine conversation", () => {
    // The scope limit has to survive the widening, or RULE 11 kicks in and the gate
    // gets ignored on the turn that actually matters.
    expect(isDataTurn("nice, ship it")).toBe(false);
    expect(isDataTurn("make the header bigger")).toBe(false);
    expect(isDataTurn("thanks")).toBe(false);
    expect(isDataTurn("commit and push")).toBe(false);
    expect(isDataTurn("looks good")).toBe(false);
  });
});

describe("lane classification", () => {
  test("the catalog is its own lane even though it lives under docs/", () => {
    expect(laneFor("Read", { file_path: "docs/standards/data-roots.md" })).toBe("catalog");
    expect(laneFor("Grep", { path: "ingest/cadence_registry.yaml" })).toBe("catalog");
  });

  test("a bare Grep with no path counts as a TREE-WIDE code search", () => {
    expect(laneFor("Grep", { pattern: "compsForAddress" })).toBe("code");
  });

  test("SQL, crawl4ai and a real fetch all count as LIVE", () => {
    expect(laneFor("mcp__supabase__execute_sql", { query: "select 1" })).toBe("live");
    expect(laneFor("Bash", { command: "crawl4ai https://docs.example.com" })).toBe("live");
    expect(laneFor("Bash", { command: "bun -e 'fetch(\"https://x\")'" })).toBe("live");
  });

  test("an unrelated call earns NO lane — running tests is not research", () => {
    expect(laneFor("Bash", { command: "bun test lib/assistant" })).toBe(null);
    expect(laneFor("Edit", { file_path: "lib/foo.ts" })).toBe(null);
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
    expect(text).toContain("what dates");
    expect(calls).toHaveLength(1);
  });

  test("malformed lines are skipped, never thrown on", () => {
    const { text } = readTurn(["not json", "", u("which table holds sold price?")]);
    expect(text).toContain("which table");
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
    expect(text).toContain("which table"); // the OPERATOR's message, not the injection
    expect(calls).toHaveLength(1); // the Grep is still counted
  });

  test("FM: the gate's own block message must not re-trigger the gate", () => {
    expect(isInjected("Stop hook feedback: [check-four-searches.mjs] 4 of 4 lanes")).toBe(true);
    expect(isInjected("<task-notification><result>3 rows</result></task-notification>")).toBe(true);
    expect(isInjected("[SYSTEM NOTIFICATION - NOT USER INPUT]")).toBe(true);
    // A real question that merely mentions one of those words is NOT an injection.
    expect(isInjected("did the task notification say which table?")).toBe(false);
  });

  test("FM4: a Grep scoped to ONE file must NOT satisfy the code lane", () => {
    // Failure #4 verbatim: grepped `steadyGet` in one .ts file and called the result
    // "everything we call". Real answer was 7 of 18. The gate used to pass that.
    expect(laneFor("Grep", { pattern: "steadyGet", path: "lib/listings/steadyapi.ts" })).toBe(null);
    expect(laneFor("Grep", { pattern: "steadyGet", path: "lib" })).toBe("code");
    expect(laneFor("Grep", { pattern: "steadyGet" })).toBe("code");
  });

  test("FM: the repo's OWN preferred probes must earn the code lane", () => {
    // RULE 0.5 says prefer graphify; a PreToolUse hook nags Serena on every edit; a
    // tree-wide grep through Bash is the commonest search there is. All returned null,
    // so a turn that genuinely searched scored 0 of 4 and got blocked.
    expect(laneFor("Bash", { command: "grep -rn steadyGet ." })).toBe("code");
    expect(laneFor("Bash", { command: 'graphify query "sale dates"' })).toBe("code");
    expect(laneFor("mcp__serena__search_for_pattern", {})).toBe("code");
    expect(laneFor("Bash", { command: 'psql -c "select 1"' })).toBe("live");
  });

  test("RULE 11: generic nouns must not fire on ordinary operator prose", () => {
    // Measured ~30% fire rate on real prose before this trim. A gate that cries wolf on
    // a third of messages is ignored on the one that matters.
    expect(isDataTurn("take over for this idiot")).toBe(false);
    expect(isDataTurn("I need this all fixed. No questions. Just fix it.")).toBe(false);
    expect(isDataTurn("tune it!!!!!!!!!!!!!")).toBe(false);
    expect(isDataTurn("land it and make sure we don't fuck up egress again")).toBe(false);
    // …while the five real 07/22 failures still fire.
    expect(isDataTurn("ok, just make sure we have beds and baths")).toBe(true);
    expect(isDataTurn("check this / where are we wiring to??")).toBe(true);
  });
});
