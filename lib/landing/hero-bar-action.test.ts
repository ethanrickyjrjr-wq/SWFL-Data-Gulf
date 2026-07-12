// lib/landing/hero-bar-action.test.ts
import { describe, expect, test } from "bun:test";
import { heroBarAction, homeAskInput } from "./hero-bar-action";
import { HERO_CAMPAIGNS } from "@/lib/campaigns";
import { streamConverse } from "@/lib/assistant/converse";

const newListing = HERO_CAMPAIGNS[0]; // input: "address"

describe("heroBarAction", () => {
  test("empty input is a no-op in every mode", () => {
    expect(heroBarAction("campaign", "  ", newListing)).toEqual({ kind: "none" });
    expect(heroBarAction("report", "", newListing)).toEqual({ kind: "none" });
    expect(heroBarAction("ask", "   ", newListing)).toEqual({ kind: "none" });
  });

  test("campaign: bare ZIP routes through the existing ZIP lab door", () => {
    expect(heroBarAction("campaign", "33901", newListing)).toEqual({
      kind: "navigate",
      href: "/email-lab?zip=33901",
    });
  });

  test("campaign: an address goes to the grid lab with the recipe filled", () => {
    const action = heroBarAction("campaign", "123 Main St, Fort Myers", newListing);
    if (action.kind !== "navigate") throw new Error("expected navigate");
    expect(action.href.startsWith("/email-lab/grid?")).toBe(true);
    expect(action.href).toContain("addr=123+Main+St%2C+Fort+Myers");
  });

  test("report: bare ZIP is the one-ZIP-truth report route", () => {
    expect(heroBarAction("report", "33931", newListing)).toEqual({
      kind: "navigate",
      href: "/r/zip-report/33931",
    });
  });

  test("report: anything else goes to /r/search", () => {
    expect(heroBarAction("report", "Bonita Springs", newListing)).toEqual({
      kind: "navigate",
      href: "/r/search?q=Bonita%20Springs",
    });
  });

  test("ask: returns the question for inline streaming, no navigation", () => {
    expect(heroBarAction("ask", "Is Naples inventory rising?", newListing)).toEqual({
      kind: "ask",
      question: "Is Naples inventory rising?",
    });
  });
});

describe("homeAskInput", () => {
  test("carries the question and NOTHING that grounds to a report", () => {
    const input = homeAskInput("what moved this week?");
    expect(input.question).toBe("what moved this week?");
    expect("reportId" in input).toBe(false);
  });

  test("streamConverse posts it to /api/assistant with report_id undefined", async () => {
    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const fakeFetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(url), body: JSON.parse(String(init?.body)) };
      // Minimal empty stream: converse treats a clean end as done.
      return new Response(new Blob([""]).stream(), { status: 200 });
    }) as typeof fetch;
    await streamConverse(homeAskInput("hello"), { onText: () => {}, onError: () => {} }, fakeFetch);
    if (!captured) throw new Error("fetch never called");
    const got = captured as { url: string; body: Record<string, unknown> };
    expect(got.url).toBe("/api/assistant");
    expect(got.body.report_id).toBeUndefined();
    expect(got.body.context).toBe("outside");
    expect(got.body.messages).toEqual([{ role: "user", content: "hello" }]);
  });
});
