// lib/social-pulse/topics.test.ts
import { test, expect } from "bun:test";
import { classifyTopic } from "./topics";

test("keyword rules bucket captions; first-match priority; null → other", () => {
  expect(classifyTopic("Gulf-access canal home with private dock")).toBe("waterfront");
  expect(classifyTopic("New construction spec home, CO in hand")).toBe("new-construction");
  expect(classifyTopic("OPEN HOUSE Sunday 1-3pm!")).toBe("open-house");
  expect(classifyTopic("Median price in Cape Coral rose again — market update")).toBe(
    "market-stats",
  );
  expect(classifyTopic("Best beaches and sunsets in Naples living")).toBe("lifestyle");
  expect(classifyTopic("Just listed! Take the full walkthrough tour")).toBe("listing-tour");
  expect(classifyTopic("random words")).toBe("other");
  expect(classifyTopic(null)).toBe("other");
  // priority: waterfront beats listing-tour when both match
  expect(classifyTopic("Just listed waterfront pool home tour")).toBe("waterfront");
});
