/**
 * THE BUILD-TIME AI'S GROUNDING — one test per named failure mode.
 *
 * Plan: docs/handoff/2026-08-12-open-house-and-build-ai-grounding-handoff.md §4 Step 3
 * ("ONE AI, TWO FEEDS"). Every test below is named after a failure mode listed there
 * or found while executing it — never after a function.
 */
import { describe, expect, test } from "bun:test";
import { RECIPE_KEYS } from "@/lib/deliverable/recipes";
import { lengthProfile } from "@/lib/narratives/length";
import { buildGroundingPrefix, projectFeedFor, recipeFeed } from "./build-grounding";
import type { ProjectDigest } from "@/lib/project/digest";
import type { SignificantChange } from "@/lib/signals/types";

/** A real SignificantChange (lib/signals/types.ts) — not a string standing in for one. */
function change(slug: string, delta = "dropped 4.2 points"): SignificantChange {
  return {
    slug,
    item_id: `item-${slug}`,
    label: `${slug} label`,
    previous_value: "-3.5% YoY",
    current_value: "-7.7% YoY",
    delta_description: delta,
  } as SignificantChange;
}

function digest(projectId: string, over: Partial<ProjectDigest> = {}): ProjectDigest {
  return {
    projectId,
    title: `Project ${projectId}`,
    rev: "r1",
    scope: { zip: "33901", place: "Fort Myers" } as ProjectDigest["scope"],
    itemCount: 4,
    kindCounts: { listing: 3, note: 1 },
    identityKeys: [],
    freshnessChangedSinceSeen: false,
    deliverables: [],
    schedules: [],
    recentSends: [],
    staleMetrics: [],
    ...over,
  } as ProjectDigest;
}

describe("FM: stale project leaks into another project's build", () => {
  // The module store survives route changes, so it can still hold project A while the
  // user is building inside project B. chat guards this in page-context.ts; the email
  // lab had NO equivalent because it never carried a project id at all.
  test("a digest for a DIFFERENT project is refused, not used", () => {
    expect(projectFeedFor("project-B", digest("project-A"))).toBeNull();
  });

  test("a digest for the REQUESTED project passes through", () => {
    const feed = projectFeedFor("project-A", digest("project-A"));
    expect(feed).not.toBeNull();
    expect(feed!.projectId).toBe("project-A");
  });

  // "No project" must mean NO project context — never "whatever was open last".
  test("no requested project id yields no project feed even when a digest exists", () => {
    expect(projectFeedFor(undefined, digest("project-A"))).toBeNull();
    expect(projectFeedFor("", digest("project-A"))).toBeNull();
  });

  test("no digest yields no project feed", () => {
    expect(projectFeedFor("project-A", null)).toBeNull();
  });
});

describe("FM: resolver silently returns empty and the AI is ungrounded while APPEARING grounded", () => {
  // The handoff's guard (d): every registry key must resolve to a non-empty
  // constraint set. A key that resolves to nothing produces a confident, unguarded AI.
  test("EVERY recipe key in the registry resolves to a non-empty constraint set", () => {
    const unresolved: string[] = [];
    for (const key of RECIPE_KEYS) {
      const feed = recipeFeed(key);
      if (!feed || !feed.label || !feed.lengthInstruction) unresolved.push(key);
    }
    expect(unresolved).toEqual([]);
  });

  test("an unknown or stale key resolves to null rather than a half-filled set", () => {
    expect(recipeFeed("not-a-real-recipe")).toBeNull();
    expect(recipeFeed(undefined)).toBeNull();
  });
});

describe("FM: a cited constraint has drifted from the code root", () => {
  // The guard is derivation, not discipline: the number must come FROM lengthProfile at
  // request time, so a change there can never leave a stale literal in a prompt string.
  test("the length band is derived from lengthProfile, never retyped", () => {
    const feed = recipeFeed("new-listing")!;
    expect(feed.lengthInstruction).toBe(lengthProfile("area-email").instruction);
  });

  test("emails get the EMAIL band, never the 200-word REPORT band", () => {
    const feed = recipeFeed("new-listing")!;
    expect(feed.lengthInstruction).not.toBe(lengthProfile("report").instruction);
    expect(feed.lengthInstruction).toContain("50–125 WORDS");
  });
});

describe("FM: the AI confabulates instead of saying it does not hold a field", () => {
  test("the prefix always carries the gap language, even with both feeds absent", () => {
    const prefix = buildGroundingPrefix({ project: null, recipe: null });
    expect(prefix).toContain("I don't have");
    expect(prefix).toMatch(/never invent|do not invent/i);
  });

  test("an absent project feed is stated as absent, not silently omitted", () => {
    const prefix = buildGroundingPrefix({ project: null, recipe: recipeFeed("new-listing") });
    // Absence must be SPOKEN, never a missing section — AND it must be a claim about
    // our INPUTS, not about the world. Two live callers sit under /api/projects/[id]/
    // and send no id: telling the model they have no project would be a false statement.
    expect(prefix).toMatch(/PROJECT: not provided/);
    expect(prefix).toMatch(/do NOT have the user's project/i);
    expect(prefix).not.toMatch(/is not attached to a project/);
  });
});

describe("FM: the rich digest is injected raw and rots the context window", () => {
  // chat PROJECTS before it injects (11 fields, lists sliced to 3). Copy the projection.
  test("long activity lists are sliced, not passed whole", () => {
    const feed = projectFeedFor(
      "p",
      digest("p", {
        significantChanges: Array.from({ length: 12 }, (_, i) => change(`m${i}`)),
        recentActivity: Array.from({ length: 12 }, (_, i) => `activity ${i}`),
      }),
    )!;
    expect(feed.significantChanges!.length).toBeLessThanOrEqual(3);
    expect(feed.recentActivity!.length).toBeLessThanOrEqual(3);
  });

  // significantChanges is an OBJECT array. The first version of this suite passed a
  // string[] through an `as Partial<ProjectDigest>` cast, so the type checker never saw
  // the mismatch and the length assertion passed against an object shape the code would
  // never receive — the test measured a different object than the one that ships.
  test("a significant change renders its real fields, never [object Object]", () => {
    const feed = projectFeedFor("p", digest("p", { significantChanges: [change("rate")] }))!;
    expect(feed.significantChanges![0]).not.toContain("[object Object]");
    expect(feed.significantChanges![0]).toContain("rate label");
    expect(feed.significantChanges![0]).toContain("dropped 4.2 points");
  });

  // A project title and an activity line are typed by a user and land in a SYSTEM prompt.
  // other-projects.ts:68 already bounds a title for exactly this reason.
  test("user-controlled strings are bounded before they reach the system prompt", () => {
    const long = "x".repeat(500);
    const feed = projectFeedFor(
      "p",
      digest("p", {
        title: long,
        significantChanges: [change("x", long)],
        recentActivity: [long],
      }),
    )!;
    expect(feed.title.length).toBeLessThanOrEqual(60);
    expect(feed.significantChanges![0].length).toBeLessThanOrEqual(100);
    expect(feed.recentActivity![0].length).toBeLessThanOrEqual(100);
  });

  test("the prefix stays small enough to sit in front of every turn", () => {
    const prefix = buildGroundingPrefix({
      project: projectFeedFor("p", digest("p")),
      recipe: recipeFeed("new-listing"),
    });
    // A grounding prefix is a always-on cost. Keep it in the low hundreds of tokens.
    expect(prefix.length).toBeLessThan(2400);
  });
});

describe("the composed prefix names the deliverable it is grounding", () => {
  test("carries the recipe label and the project title", () => {
    const prefix = buildGroundingPrefix({
      project: projectFeedFor("p", digest("p", { title: "Carlene Ave farm" })),
      recipe: recipeFeed("just-sold"),
    });
    expect(prefix).toContain("Carlene Ave farm");
    expect(prefix.toLowerCase()).toContain("just sold");
  });
});

describe("FM: the prefix asserts an absence it never checked", () => {
  // The whole point of this file is to stop confabulation. A prefix that prints
  // "no email schedule" for a project that HAS one is that same defect, committed by
  // the guard itself. `buildProjectDigest` defaults `schedules` to [], so an empty
  // array cannot distinguish "none" from "never fetched" — only the caller knows.
  test("schedules NOT loaded: the prefix says nothing about schedules", () => {
    const feed = projectFeedFor("p", digest("p"))!;
    expect(feed.hasEmailSchedule).toBeUndefined();
    const prefix = buildGroundingPrefix({ project: feed, recipe: null });
    expect(prefix).not.toContain("no email schedule");
    expect(prefix).not.toContain("has a running email schedule");
  });

  test("schedules loaded and empty: NOW it may say there are none", () => {
    const feed = projectFeedFor("p", digest("p"), { schedules: true })!;
    expect(feed.hasEmailSchedule).toBe(false);
    expect(buildGroundingPrefix({ project: feed, recipe: null })).toContain("no email schedule");
  });

  test("schedules loaded and present: it says so", () => {
    const d = digest("p", { schedules: [{ cadence: "weekly" }] as ProjectDigest["schedules"] });
    const feed = projectFeedFor("p", d, { schedules: true })!;
    expect(feed.hasEmailSchedule).toBe(true);
    expect(buildGroundingPrefix({ project: feed, recipe: null })).toContain(
      "has a running email schedule",
    );
  });
});
