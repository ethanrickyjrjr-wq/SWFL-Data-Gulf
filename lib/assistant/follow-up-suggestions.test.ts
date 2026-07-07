import { test, expect } from "bun:test";
import { suggestFollowUps } from "./follow-up-suggestions";

test("topic keyword in the question selects that topic's chips", () => {
  expect(suggestFollowUps("what's the flood risk in 33931?")).toEqual([
    "How does this compare to nearby ZIPs?",
    "What's the flood-risk trend over time?",
    "Chart this by ZIP",
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
    "Chart this by ZIP",
  ]);
});

test("question with no topic + answer with no topic still falls to generic", () => {
  expect(suggestFollowUps("tell me more", "Here's a general overview of the area.")).toEqual([
    "What's driving this?",
    "How does this compare to nearby areas?",
    "What should I watch next?",
  ]);
});

test("no inputs at all returns generic", () => {
  expect(suggestFollowUps("")).toEqual([
    "What's driving this?",
    "How does this compare to nearby areas?",
    "What should I watch next?",
  ]);
});
