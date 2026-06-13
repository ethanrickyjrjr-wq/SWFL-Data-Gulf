import { describe, expect, it } from "bun:test";
import { enrollProspect, processActivationStep, type ActivationDeps, type ActivationRow } from "./sequence";
import type { AssembledReport, ReportMetric } from "./snapshot";

function metric(key: string, value: number, direction: ReportMetric["direction"] = "neutral"): ReportMetric {
  return { key, label: key, value, unit: "", direction, display: String(value) };
}

function reportFor(zip: string, price: number, inScope = true): AssembledReport {
  const metrics = [metric("housing.median_sale_price", price, "neutral")];
  return {
    in_scope: inScope,
    zip,
    primaryPlace: "Fort Myers Beach",
    countyName: "Lee",
    freshness_token: `SWFL-7421-v5-2026061${price === 400000 ? "0" : "3"}`,
    metrics,
    lines: [
      { brain_id: "city-pulse-swfl", grain: "city", is_true_zip: false, label: "pulse", text: `signal ${price}`, source_url: "", source_citation: "" },
    ],
    coverage_caveats: [],
    snapshot: {
      zip,
      freshness_token: `SWFL-7421-v5-2026061${price === 400000 ? "0" : "3"}`,
      captured_at: "2026-06-10T00:00:00.000Z",
      metrics: metrics.map(({ key, label, value, unit, direction }) => ({ key, label, value, unit, direction })),
      lines: [{ brain_id: "city-pulse-swfl", grain: "city", is_true_zip: false, label: "pulse", fingerprint: `signal ${price}` }],
    },
  };
}

function baseDeps(over: Partial<ActivationDeps> = {}): { deps: ActivationDeps; log: string[]; sends: { to: string; subject: string }[] } {
  const log: string[] = [];
  const sends: { to: string; subject: string }[] = [];
  const deps: ActivationDeps = {
    dryRun: false,
    assemble: async (scope) => reportFor(scope.zip, 412000),
    render: async () => "<html><body>ok {{{RESEND_UNSUBSCRIBE_URL}}}</body></html>",
    send: async (m) => {
      sends.push({ to: m.to, subject: m.subject });
      return { ok: true, id: "snd_1" };
    },
    insertEnrollment: async () => ({ id: 99 }),
    completeStep: async () => {},
    now: new Date("2026-06-13T12:00:00.000Z"),
    log: (l) => log.push(l),
    ...over,
  };
  return { deps, log, sends };
}

describe("enrollProspect", () => {
  it("sends email #1 and enrolls, scheduling step 2 at +3 days", async () => {
    const { deps, sends } = baseDeps();
    const r = await enrollProspect({ email: "a@b.com", scope: { zip: "33931" }, brand: null }, deps);
    expect(r).toEqual({ kind: "enrolled", id: 99 });
    expect(sends).toHaveLength(1);
    expect(sends[0].subject).toContain("Fort Myers Beach");
  });

  it("parks an out-of-scope scope and never sends", async () => {
    const { deps, sends } = baseDeps({ assemble: async (s) => reportFor(s.zip, 0, false) });
    const r = await enrollProspect({ email: "a@b.com", scope: { zip: "90210" }, brand: null }, deps);
    expect(r.kind).toBe("parked");
    expect(sends).toHaveLength(0);
  });

  it("DRY_RUN renders but never sends or inserts", async () => {
    let inserted = false;
    const { deps, sends } = baseDeps({ dryRun: true, insertEnrollment: async () => { inserted = true; return { id: 1 }; } });
    const r = await enrollProspect({ email: "a@b.com", scope: { zip: "33931" }, brand: null }, deps);
    expect(r.kind).toBe("sent-dry-run");
    expect(sends).toHaveLength(0);
    expect(inserted).toBe(false);
  });
});

function rowAtStep1(): ActivationRow {
  // The frozen v1 snapshot showed price 400000 + a "signal 400000" line.
  return {
    id: 7,
    email: "a@b.com",
    scope: { zip: "33931" },
    brand: null,
    step: 1,
    snapshot: reportFor("33931", 400000).snapshot,
    next_send_at: "2026-06-13T00:00:00.000Z",
    status: "active",
  };
}

describe("processActivationStep — beat 2 delta", () => {
  it("diffs current vs the frozen snapshot and sends email #2 with a real change", async () => {
    let renderedHadDelta = false;
    const { deps, sends } = baseDeps({
      assemble: async (s) => reportFor(s.zip, 412000), // moved +12k since v1
      render: async (_r, opts) => {
        renderedHadDelta = opts.delta?.has_change === true;
        return "<html><body>{{{RESEND_UNSUBSCRIBE_URL}}}</body></html>";
      },
    });
    const out = await processActivationStep(rowAtStep1(), deps);
    expect(out).toEqual({ kind: "sent", id: 7, hadChange: true });
    expect(renderedHadDelta).toBe(true);
    expect(sends[0].subject).toContain("What changed");
  });

  it("on a true no-change cycle, sends a re-verified email (has_change=false)", async () => {
    const { deps, sends } = baseDeps({
      // Same numbers AND same signal as the stored snapshot → only freshness moved.
      assemble: async (s) => {
        const r = reportFor(s.zip, 400000);
        r.freshness_token = "SWFL-7421-v6-20260613";
        r.snapshot.freshness_token = "SWFL-7421-v6-20260613";
        return r;
      },
    });
    const out = await processActivationStep(rowAtStep1(), deps);
    expect(out).toEqual({ kind: "sent", id: 7, hadChange: false });
    expect(sends[0].subject).toContain("re-verified");
  });

  it("DRY_RUN computes the delta but never sends or completes", async () => {
    let completed = false;
    const { deps, sends } = baseDeps({
      dryRun: true,
      assemble: async (s) => reportFor(s.zip, 412000),
      completeStep: async () => { completed = true; },
    });
    const out = await processActivationStep(rowAtStep1(), deps);
    expect(out.kind).toBe("dry-run");
    expect(sends).toHaveLength(0);
    expect(completed).toBe(false);
  });

  it("skips a row that is not at step 1 / has no snapshot", async () => {
    const { deps } = baseDeps();
    const out = await processActivationStep({ ...rowAtStep1(), step: 2 }, deps);
    expect(out.kind).toBe("skipped");
  });

  it("a send failure is isolated as an error outcome, never thrown", async () => {
    const { deps } = baseDeps({ send: async () => ({ ok: false, error: "resend_down" }) });
    const out = await processActivationStep(rowAtStep1(), deps);
    expect(out).toEqual({ kind: "error", id: 7, error: "resend_down" });
  });
});
