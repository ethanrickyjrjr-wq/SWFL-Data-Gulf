import { describe, it, expect } from "bun:test";
import {
  appendExchange,
  clearThreadFor,
  addItem,
  removeItemById,
  loadDraftFrom,
  saveDraftTo,
  DRAFT_KEY,
  DRAFT_CAP,
  THREAD_CAP,
  type ChatEntry,
} from "./context";
import type { ProjectItem } from "@/lib/project/items";

/**
 * The provider's thread/draft behavior is unit-tested at the pure-reducer level
 * (this repo has no DOM test environment by design — every test is bun:test +
 * pure). The React wrapper is a thin pass-through over these functions and is
 * verified by the eslint set-state-in-effect guard + the task's manual smoke.
 */

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v);
    },
    map: m,
  };
}

const note = (id: string): ProjectItem => ({
  id,
  added_at: "t",
  origin: "web",
  kind: "note",
  text: "hi " + id,
});

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

describe("draft reducers + persistence", () => {
  it("adds an item and persists it through a Storage sink", () => {
    const store = memStorage();
    const next = addItem([], note("1"));
    saveDraftTo(store, next);
    expect(next).toHaveLength(1);
    expect(JSON.parse(store.getItem(DRAFT_KEY)!)).toHaveLength(1);
  });

  it("caps the draft at DRAFT_CAP (keeps the most recent)", () => {
    let items: ProjectItem[] = [];
    for (let i = 0; i < DRAFT_CAP + 10; i++) items = addItem(items, note(String(i)));
    expect(items).toHaveLength(DRAFT_CAP);
    // The oldest were dropped; the very last added survives.
    expect(items[items.length - 1].id).toBe(String(DRAFT_CAP + 9));
  });

  it("removeItemById removes the matching item", () => {
    const items = [note("1"), note("2")];
    expect(removeItemById(items, "1")).toHaveLength(1);
    expect(removeItemById(items, "1")[0].id).toBe("2");
  });

  it("round-trips through load/save", () => {
    const store = memStorage();
    saveDraftTo(store, [note("1")]);
    const loaded = loadDraftFrom(store);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("1");
  });

  it("loadDraftFrom returns [] on corrupt JSON or null storage", () => {
    const store = memStorage();
    store.setItem(DRAFT_KEY, "{not json");
    expect(loadDraftFrom(store)).toEqual([]);
    expect(loadDraftFrom(null)).toEqual([]);
  });
});
