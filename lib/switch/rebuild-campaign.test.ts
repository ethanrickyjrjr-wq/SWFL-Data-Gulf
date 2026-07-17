import { test, expect, describe, mock } from "bun:test";
import {
  deriveRebuildPrompt,
  rebuildForwardedCampaign,
  MAX_CAMPAIGN_TEXT,
  type RebuildCampaignDeps,
} from "./rebuild-campaign";
import type { EmailDoc } from "@/lib/email/doc/types";

// ── deriveRebuildPrompt — PURE ────────────────────────────────────────────────

describe("deriveRebuildPrompt", () => {
  test("strips HTML to plain text", () => {
    const prompt = deriveRebuildPrompt("<p>Hello <b>there</b></p><p>World</p>", null);
    // No angle-bracket tags survive into the prompt.
    expect(prompt).not.toContain("<p>");
    expect(prompt).not.toContain("<b>");
    expect(prompt).not.toContain("</");
    expect(prompt).toContain("Hello there World");
  });

  test("truncates the campaign text to exactly MAX_CAMPAIGN_TEXT chars", () => {
    expect(MAX_CAMPAIGN_TEXT).toBe(1500);
    const long = "x".repeat(MAX_CAMPAIGN_TEXT + 100); // 1600, no tags, no whitespace runs
    const prompt = deriveRebuildPrompt(long, null);
    const xCount = (prompt.match(/x/g) ?? []).length;
    expect(xCount).toBe(MAX_CAMPAIGN_TEXT); // 1500, not 1600, not 1501
  });

  test("text at exactly the boundary is kept whole", () => {
    // 'z' is absent from the instruction wrapper, so the count isolates the
    // campaign-text portion (unlike 'y', which also lives in "every").
    const exact = "z".repeat(MAX_CAMPAIGN_TEXT);
    const prompt = deriveRebuildPrompt(exact, null);
    expect((prompt.match(/z/g) ?? []).length).toBe(MAX_CAMPAIGN_TEXT);
  });

  test("names the platform when it is known", () => {
    const prompt = deriveRebuildPrompt("<p>hi</p>", "mailchimp");
    expect(prompt.toLowerCase()).toContain("mailchimp");
  });

  test("omits any platform phrase when platform is null", () => {
    const prompt = deriveRebuildPrompt("<p>hi</p>", null);
    expect(prompt.toLowerCase()).not.toContain("mailchimp");
    expect(prompt.toLowerCase()).not.toContain("constant contact");
  });

  test("the instruction wrapper invents no figures (no digits of its own)", () => {
    // With empty campaign text + null platform, the whole prompt IS the
    // instruction — it must carry no fabricated numbers.
    const prompt = deriveRebuildPrompt("", null);
    expect(/\d/.test(prompt)).toBe(false);
    // And it must demand real data / forbid stale figures.
    expect(prompt.toLowerCase()).toContain("live data");
  });

  test("demands a real-data rebuild that keeps topic and intent", () => {
    const prompt = deriveRebuildPrompt("<p>Spring market update</p>", "constantcontact");
    expect(prompt).toContain("Rebuild this email");
    expect(prompt.toLowerCase()).toContain("topic and intent");
  });
});

// ── rebuildForwardedCampaign — orchestration (mocked deps) ─────────────────────

const FAKE_DOC = { globalStyle: {}, blocks: [] } as unknown as EmailDoc;

function makeDeps(over: Partial<RebuildCampaignDeps> = {}): RebuildCampaignDeps {
  return {
    log: () => {},
    siteUrl: "https://www.swfldatagulf.com",
    loadForward: mock(async () => ({ html: "<p>Old campaign body</p>", platform: "mailchimp" })),
    buildDoc: mock(async () => FAKE_DOC),
    persistDraft: mock(async () => ({ projectId: "proj_1", deliverableId: "deliv_1" })),
    getAuthEmail: mock(async () => "agent@example.com"),
    sendEmail: mock(async () => {}),
    ...over,
  };
}

describe("rebuildForwardedCampaign", () => {
  test("happy path: builds off the seed, persists a draft, emails one edit link", async () => {
    const buildDoc = mock(async () => FAKE_DOC);
    const persistDraft = mock(async () => ({ projectId: "proj_1", deliverableId: "deliv_1" }));
    const sendEmail = mock(async () => {});
    const deps = makeDeps({ buildDoc, persistDraft, sendEmail });

    const result = await rebuildForwardedCampaign(deps, "user_1", "fwd_1");

    expect(result).toEqual({ deliverableId: "deliv_1" });

    // Built off a deep-copied trend-snapshot seed (a real EmailDoc with blocks).
    expect(buildDoc).toHaveBeenCalledTimes(1);
    const [prompt, rawDoc] = buildDoc.mock.calls[0] as [string, EmailDoc];
    expect(prompt).toContain("Rebuild this email");
    expect(Array.isArray((rawDoc as { blocks?: unknown[] }).blocks)).toBe(true);
    expect((rawDoc as { blocks: unknown[] }).blocks.length).toBeGreaterThan(0);

    // Persisted the BUILT doc as a draft.
    expect(persistDraft).toHaveBeenCalledTimes(1);
    expect(persistDraft.mock.calls[0][0]).toBe("user_1");
    expect(persistDraft.mock.calls[0][1]).toBe(FAKE_DOC);

    // Emailed exactly one alert with the edit link + the edit-before-send line.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, body] = sendEmail.mock.calls[0] as [string, string, string];
    expect(to).toBe("agent@example.com");
    expect(subject.toLowerCase()).toContain("rebuilt");
    expect(body).toContain("open it to edit before it goes anywhere");
    expect(body).toContain("/project/proj_1/email-lab?did=deliv_1");
  });

  test("returns null (no build) when the forward row is missing", async () => {
    const buildDoc = mock(async () => FAKE_DOC);
    const deps = makeDeps({ loadForward: mock(async () => null), buildDoc });
    const result = await rebuildForwardedCampaign(deps, "user_1", "fwd_1");
    expect(result).toEqual({ deliverableId: null });
    expect(buildDoc).not.toHaveBeenCalled();
  });

  test("returns null (no build) when the campaign has no html", async () => {
    const buildDoc = mock(async () => FAKE_DOC);
    const deps = makeDeps({
      loadForward: mock(async () => ({ html: "   ", platform: "mailchimp" })),
      buildDoc,
    });
    const result = await rebuildForwardedCampaign(deps, "user_1", "fwd_1");
    expect(result).toEqual({ deliverableId: null });
    expect(buildDoc).not.toHaveBeenCalled();
  });

  test("returns null and never persists when the build yields no doc", async () => {
    const persistDraft = mock(async () => ({ projectId: "p", deliverableId: "d" }));
    const deps = makeDeps({ buildDoc: mock(async () => null), persistDraft });
    const result = await rebuildForwardedCampaign(deps, "user_1", "fwd_1");
    expect(result).toEqual({ deliverableId: null });
    expect(persistDraft).not.toHaveBeenCalled();
  });

  test("returns null and never emails when persistence fails", async () => {
    const sendEmail = mock(async () => {});
    const deps = makeDeps({ persistDraft: mock(async () => null), sendEmail });
    const result = await rebuildForwardedCampaign(deps, "user_1", "fwd_1");
    expect(result).toEqual({ deliverableId: null });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("still returns the draft id when the agent has no auth email (draft is never lost)", async () => {
    const sendEmail = mock(async () => {});
    const deps = makeDeps({ getAuthEmail: mock(async () => null), sendEmail });
    const result = await rebuildForwardedCampaign(deps, "user_1", "fwd_1");
    expect(result).toEqual({ deliverableId: "deliv_1" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test("a failing alert email never loses the draft", async () => {
    const deps = makeDeps({
      sendEmail: mock(async () => {
        throw new Error("resend down");
      }),
    });
    const result = await rebuildForwardedCampaign(deps, "user_1", "fwd_1");
    expect(result).toEqual({ deliverableId: "deliv_1" });
  });

  test("a thrown loadForward degrades to null, never throws", async () => {
    const deps = makeDeps({
      loadForward: mock(async () => {
        throw new Error("db down");
      }),
    });
    const result = await rebuildForwardedCampaign(deps, "user_1", "fwd_1");
    expect(result).toEqual({ deliverableId: null });
  });
});
