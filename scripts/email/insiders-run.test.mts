// scripts/email/insiders-run.test.mts — the runner's pure helpers.
import { describe, expect, test } from "bun:test";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";
import { ledgerReport, preSendGates } from "./insiders-run.mts";

describe("preSendGates", () => {
  test("passes with unsubscribe token + subject", () => {
    expect(preSendGates(`<html>${UNSUBSCRIBE_TOKEN}</html>`, "July issue")).toEqual([]);
  });
  test("names each failure", () => {
    const failures = preSendGates("<html></html>", "  ");
    expect(failures).toContain("unsubscribe token missing");
    expect(failures).toContain("empty subject");
  });
});

describe("ledgerReport", () => {
  test("shapes per-pass lines and totals against the cap", () => {
    const r = ledgerReport(
      [
        {
          pass: "draft",
          model: "claude-fable-5",
          usage: { input_tokens: 250_000, output_tokens: 30_000 },
          costUsd: 4.0,
        },
        {
          pass: "editor",
          model: "claude-fable-5",
          usage: { input_tokens: 60_000, output_tokens: 25_000, cache_read_input_tokens: 250_000 },
          costUsd: 2.35,
        },
      ],
      20,
    );
    expect(r.totalUsd).toBeCloseTo(6.35, 2);
    expect(r.lines[0]).toContain("draft");
    expect(r.lines[0]).toContain("claude-fable-5");
    expect(r.lines[0]).toContain("$4.00");
    expect(r.lines[1]).toContain("cache-read");
    expect(r.lines[2]).toContain("TOTAL $6.35 of $20.00 cap");
  });

  test("empty ledger (mock run) totals $0", () => {
    const r = ledgerReport([], 20);
    expect(r.totalUsd).toBe(0);
    expect(r.lines).toEqual(["TOTAL $0.00 of $20.00 cap"]);
  });
});
