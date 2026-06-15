import { describe, it, expect } from "bun:test";
import { appendExchange, clearThreadFor, THREAD_CAP, type ChatEntry } from "./context";

/**
 * The provider's thread behavior is unit-tested at the pure-reducer level (this
 * repo has no DOM test environment by design — every test is bun:test + pure).
 * The React wrapper is a thin pass-through over these functions and is verified
 * by the eslint set-state-in-effect guard + the task's manual smoke. The draft
 * reducers moved to lib/briefcase/draft.test.ts when the draft state was
 * extracted from this context into BriefcaseProvider (A-2).
 */

describe("thread reducers", () => {
  it("archives an exchange under its reportId only", () => {
    const t0: Record<string, ChatEntry[]> = {};
    const t1 = appendExchange(t0, "env-swfl", { question: "q", answer: "a" });
    expect(t1["env-swfl"]).toHaveLength(1);
    expect(t1["other"] ?? []).toHaveLength(0);
  });

  it("condenses the oldest answer past THREAD_CAP", () => {
    let t: Record<string, ChatEntry[]> = {};
    for (let i = 0; i <= THREAD_CAP; i++) {
      t = appendExchange(t, "r", { question: `q${i}`, answer: `a${i}` });
    }
    const entries = t["r"];
    expect(entries).toHaveLength(THREAD_CAP + 1);
    // Oldest is condensed to question-only; newest keeps its answer.
    expect(entries[0]).toEqual({ question: "q0", answer: "" });
    expect(entries[entries.length - 1].answer).toBe(`a${THREAD_CAP}`);
  });

  it("clearThreadFor empties only the target report", () => {
    let t: Record<string, ChatEntry[]> = {};
    t = appendExchange(t, "a", { question: "q", answer: "a" });
    t = appendExchange(t, "b", { question: "q", answer: "a" });
    const cleared = clearThreadFor(t, "a");
    expect(cleared["a"]).toHaveLength(0);
    expect(cleared["b"]).toHaveLength(1);
  });
});
