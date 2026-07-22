// check-four-searches.test.mjs
//
// Every test is named for the REAL 07/22/2026 failure it would have caught.

import { describe, expect, test } from "bun:test";
import { isDataTurn, laneFor, missingLanes, readTurn } from "./check-four-searches.mjs";

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
