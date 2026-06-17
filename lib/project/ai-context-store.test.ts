import { describe, it, expect, beforeEach } from "bun:test";
import {
  getAiContext,
  getCachedAiContext,
  cacheAiContext,
  setAiContext,
  clearAiContext,
  subscribeAiContext,
  __resetAiContextStoreForTest,
} from "./ai-context-store";
import type { ProjectDigest } from "./digest";

/**
 * The context-bus store — pure, no React, no DOM. This is the #1 Piece 2 risk surface,
 * so the keyed-write no-op (which prevents `useSyncExternalStore` re-render loops) and
 * subscribe/unsubscribe are locked here.
 */

function digest(projectId: string, rev: string): ProjectDigest {
  return {
    projectId,
    title: `Project ${projectId}`,
    rev,
    scope: {},
    itemCount: 0,
    kindCounts: {},
    identityKeys: [],
    freshnessChangedSinceSeen: false,
    deliverables: [],
    schedules: [],
    recentSends: [],
    staleMetrics: [],
  };
}

describe("ai-context-store", () => {
  beforeEach(() => __resetAiContextStoreForTest());

  it("starts with no active context", () => {
    expect(getAiContext()).toBeNull();
  });

  it("setAiContext activates a digest and getAiContext returns the same reference", () => {
    const d = digest("p1", "r1");
    setAiContext(d);
    expect(getAiContext()).toBe(d); // stable reference (getSnapshot contract)
  });

  it("cacheAiContext warms the cache WITHOUT activating", () => {
    const d = digest("p2", "r1");
    cacheAiContext(d);
    expect(getAiContext()).toBeNull(); // not active
    expect(getCachedAiContext("p2")).toBe(d); // but cached for prefetch
  });

  it("notifies subscribers on a real change, NOT on an unchanged re-seed", () => {
    let calls = 0;
    const unsub = subscribeAiContext(() => calls++);

    setAiContext(digest("p1", "r1"));
    expect(calls).toBe(1);

    // Same project + same rev → no notify (re-seed during render must not loop).
    setAiContext(digest("p1", "r1"));
    expect(calls).toBe(1);

    // Same project, NEW rev (data changed) → notify.
    setAiContext(digest("p1", "r2"));
    expect(calls).toBe(2);

    // Different project → notify.
    setAiContext(digest("p2", "r1"));
    expect(calls).toBe(3);

    unsub();
    setAiContext(digest("p3", "r1"));
    expect(calls).toBe(3); // unsubscribed → no further calls
  });

  it("clearAiContext nulls the active context and notifies once", () => {
    let calls = 0;
    subscribeAiContext(() => calls++);
    setAiContext(digest("p1", "r1"));
    expect(calls).toBe(1);
    clearAiContext();
    expect(getAiContext()).toBeNull();
    expect(calls).toBe(2);
    clearAiContext(); // already null → no notify
    expect(calls).toBe(2);
  });

  it("switching active project reads the newly-active cached digest", () => {
    const a = digest("p1", "r1");
    const b = digest("p2", "r1");
    setAiContext(a);
    setAiContext(b);
    expect(getAiContext()).toBe(b);
    // p1 stays in the cache for a fast switch-back.
    expect(getCachedAiContext("p1")).toBe(a);
  });
});
