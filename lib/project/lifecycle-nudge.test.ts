import { describe, test, expect } from "bun:test";
import {
  decideLifecycleNudges,
  nudgeDedupKey,
  type LifecycleTransition,
  type SequenceForNudge,
} from "./lifecycle-nudge";

const TODAY = new Date("2026-07-20T12:00:00Z");

function seq(
  steps: Partial<Record<string, { state: string; sent_at?: string | null }>>,
): SequenceForNudge {
  const keys = ["coming-soon", "new-listing", "market-comps", "under-contract", "sold"];
  return {
    id: "seq-1",
    project_id: "proj-1",
    user_id: "user-1",
    address_key: "123MAINST:33901",
    steps: keys.map((key) => ({
      key,
      state: steps[key]?.state ?? "pending",
      sent_at: steps[key]?.sent_at ?? null,
    })),
  };
}

describe("nudgeDedupKey", () => {
  test("builds the canonical lifecycle:<seq>:<step>:<event>:<toState>:<at> key", () => {
    expect(nudgeDedupKey("seq-1", "sold", "resolved_sold", "sold", "2026-07-15")).toBe(
      "lifecycle:seq-1:sold:resolved_sold:sold:2026-07-15",
    );
  });

  test("uses a stable placeholder when toState is null (time_elapsed)", () => {
    expect(nudgeDedupKey("seq-1", "market-comps", "time_elapsed", null, "2026-07-20")).toBe(
      "lifecycle:seq-1:market-comps:time_elapsed:-:2026-07-20",
    );
  });
});

describe("decideLifecycleNudges — appeared", () => {
  test("fires for new-listing when a from_state=null transition exists and the step is pending", () => {
    const s = seq({ "new-listing": { state: "pending" } });
    const transitions: LifecycleTransition[] = [
      { from_state: null, to_state: "active", at: "2026-07-01", price: 450000, price_delta: null },
    ];
    const out = decideLifecycleNudges(s, transitions, "active", TODAY);
    const hit = out.find((n) => n.step_key === "new-listing");
    expect(hit).toBeDefined();
    expect(hit?.event_kind).toBe("appeared");
    expect(hit?.at).toBe("2026-07-01");
  });

  test("does NOT fire when new-listing is already sent", () => {
    const s = seq({ "new-listing": { state: "sent", sent_at: "2026-07-02T00:00:00Z" } });
    const transitions: LifecycleTransition[] = [
      { from_state: null, to_state: "active", at: "2026-07-01", price: 450000, price_delta: null },
    ];
    const out = decideLifecycleNudges(s, transitions, "active", TODAY);
    expect(out.find((n) => n.step_key === "new-listing")).toBeUndefined();
  });
});

describe("decideLifecycleNudges — departed_holding", () => {
  test("fires for under-contract (ambiguous) on a to_state=holding transition", () => {
    const s = seq({ "under-contract": { state: "pending" } });
    const transitions: LifecycleTransition[] = [
      {
        from_state: "active",
        to_state: "holding",
        at: "2026-07-10",
        price: 450000,
        price_delta: null,
      },
    ];
    const out = decideLifecycleNudges(s, transitions, "holding", TODAY);
    const hit = out.find((n) => n.step_key === "under-contract");
    expect(hit).toBeDefined();
    expect(hit?.event_kind).toBe("departed_holding");
  });

  test("does NOT fire when under-contract is already sent or skipped", () => {
    const s = seq({ "under-contract": { state: "skipped" } });
    const transitions: LifecycleTransition[] = [
      {
        from_state: "active",
        to_state: "holding",
        at: "2026-07-10",
        price: 450000,
        price_delta: null,
      },
    ];
    const out = decideLifecycleNudges(s, transitions, "holding", TODAY);
    expect(out.find((n) => n.step_key === "under-contract")).toBeUndefined();
  });
});

describe("decideLifecycleNudges — resolved_sold", () => {
  test("fires for sold when listing_state.state is sold and the step isn't sent", () => {
    const s = seq({ sold: { state: "built" } });
    const transitions: LifecycleTransition[] = [
      {
        from_state: "holding",
        to_state: "sold",
        at: "2026-07-18",
        price: 440000,
        price_delta: -10000,
      },
    ];
    const out = decideLifecycleNudges(s, transitions, "sold", TODAY);
    const hit = out.find((n) => n.step_key === "sold");
    expect(hit).toBeDefined();
    expect(hit?.price_delta).toBe(-10000);
  });

  test("does NOT fire when sold step already sent", () => {
    const s = seq({ sold: { state: "sent" } });
    const transitions: LifecycleTransition[] = [
      {
        from_state: "holding",
        to_state: "sold",
        at: "2026-07-18",
        price: 440000,
        price_delta: -10000,
      },
    ];
    const out = decideLifecycleNudges(s, transitions, "sold", TODAY);
    expect(out.find((n) => n.step_key === "sold")).toBeUndefined();
  });
});

describe("decideLifecycleNudges — time_elapsed (market-comps)", () => {
  test("fires exactly at 14 days after new-listing's sent_at", () => {
    const s = seq({
      "new-listing": { state: "sent", sent_at: "2026-07-06T09:00:00Z" },
      "market-comps": { state: "pending" },
    });
    const today14 = new Date("2026-07-20T09:00:00Z"); // exactly 14 days later
    const out = decideLifecycleNudges(s, [], null, today14);
    expect(out.find((n) => n.step_key === "market-comps")).toBeDefined();
  });

  test("does NOT fire before 14 days", () => {
    const s = seq({
      "new-listing": { state: "sent", sent_at: "2026-07-06T09:00:00Z" },
      "market-comps": { state: "pending" },
    });
    const today13 = new Date("2026-07-19T09:00:00Z");
    const out = decideLifecycleNudges(s, [], null, today13);
    expect(out.find((n) => n.step_key === "market-comps")).toBeUndefined();
  });

  test("does NOT fire when new-listing was never sent", () => {
    const s = seq({ "market-comps": { state: "pending" } });
    const out = decideLifecycleNudges(s, [], null, TODAY);
    expect(out.find((n) => n.step_key === "market-comps")).toBeUndefined();
  });
});

describe("decideLifecycleNudges — dedup stability", () => {
  test("the same inputs always produce the same dedup_key (idempotent rerun)", () => {
    const s = seq({ "new-listing": { state: "pending" } });
    const transitions: LifecycleTransition[] = [
      { from_state: null, to_state: "active", at: "2026-07-01", price: 450000, price_delta: null },
    ];
    const first = decideLifecycleNudges(s, transitions, "active", TODAY);
    const second = decideLifecycleNudges(s, transitions, "active", TODAY);
    expect(first[0]?.dedup_key).toBe(second[0]?.dedup_key);
  });
});
