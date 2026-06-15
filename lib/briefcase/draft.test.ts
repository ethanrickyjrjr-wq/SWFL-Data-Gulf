import { describe, it, expect } from "bun:test";
import { addItem, removeItemById, loadDraftFrom, saveDraftTo, DRAFT_KEY, DRAFT_CAP } from "./draft";
import type { ProjectItem } from "@/lib/project/items";

/**
 * Draft reducers + persistence — pure (no React, no DOM), unit-tested directly.
 * Lifted out of lib/highlighter/context.test.tsx when the draft state was
 * extracted from the highlighter context into its own BriefcaseProvider (A-2).
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
