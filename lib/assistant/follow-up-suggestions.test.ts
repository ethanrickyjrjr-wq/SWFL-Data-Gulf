import { test, expect } from "bun:test";
import { suggestFollowUps } from "./follow-up-suggestions";

test("topic keyword in the question selects that topic's chips", () => {
  expect(suggestFollowUps("what's the flood risk in 33931?")).toEqual([
    "How does this compare to nearby ZIPs?",
    "What's the flood-risk trend over time?",
    "Which ZIP is worst off?",
  ]);
});

test("no topic keyword anywhere falls to the generic set", () => {
  expect(suggestFollowUps("tell me more")).toEqual([
    "What's driving this?",
    "How does this compare to nearby areas?",
    "What should I watch next?",
  ]);
});

test("generic-bucket trap: clicking a generic chip alone can no longer escape once the answer carries a topic", () => {
  // Regression for the reported bug: clicking a GENERIC_FOLLOW_UPS chip resubmits its
  // own literal (topic-free) text as the next question. Question-only matching got
  // stuck on GENERIC_FOLLOW_UPS forever from that point on, no matter how specific the
  // conversation actually was. Matching the answer text breaks the loop.
  const clickedChip = "What should I watch next?";
  const answerAboutFlood =
    "If you want ZIP-level flood loss history, current NFIP claims data, or the annualized loss expectation for a specific address, I can pull that.";
  expect(suggestFollowUps(clickedChip, answerAboutFlood)).toEqual([
    "How does this compare to nearby ZIPs?",
    "What's the flood-risk trend over time?",
    "Which ZIP is worst off?",
  ]);
});

test("question with no topic + answer with no topic still falls to generic", () => {
  expect(suggestFollowUps("tell me more", "Here's a general overview of the area.")).toEqual([
    "What's driving this?",
    "How does this compare to nearby areas?",
    "What should I watch next?",
  ]);
});

test("an answer offering to 'build' a chart does not return permit chips", () => {
  // The live bug (07/09/2026): OUTSIDE_SYSTEM told the model to offer to *build* a
  // chart, this table matches the ANSWER too, and the bare verb `build` sat in the
  // permits regex above every residential rule. Corridor-heat conversations got
  // "What's driving the permit activity?" underneath them.
  const chips = suggestFollowUps(
    "Which corridors are heating up?",
    "I can build that chart for you — inventory is tightening across several corridors.",
  );
  expect(chips).not.toContain("What's driving the permit activity?");
});

test("a heat/inventory conversation gets residential chips, not the generic set", () => {
  expect(suggestFollowUps("where is inventory tightening?")).toEqual([
    "How does this compare to last year?",
    "Show me this by ZIP",
    "What's driving this?",
  ]);
});

test("no inputs at all returns generic", () => {
  expect(suggestFollowUps("")).toEqual([
    "What's driving this?",
    "How does this compare to nearby areas?",
    "What should I watch next?",
  ]);
});
