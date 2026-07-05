import { describe, expect, test } from "bun:test";
import {
  buildEmailDocOccurrence,
  refreshPrompt,
  type EmailDocDeliverable,
  type EmailDocOccurrenceDeps,
} from "./emaildoc-occurrence";
import { defaultDoc } from "./doc/default-docs";
import type { EmailDoc } from "./doc/types";

const STYLE: EmailDoc["globalStyle"] = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};
// The doc buildDoc returns (drives subject + render).
const FRESH: EmailDoc = {
  globalStyle: STYLE,
  blocks: [{ id: "s", type: "signal", props: { title: "Fresh headline this run" } }],
};

function deliverable(over: Partial<EmailDocDeliverable> = {}): EmailDocDeliverable {
  return {
    doc: defaultDoc(), // a guaranteed schema-valid EmailDoc
    instruction: "Lee County price trend, with a chart.",
    scope_kind: "county",
    scope_value: "lee",
    template: "block-canvas",
    ...over,
  };
}

function makeDeps(over: Partial<EmailDocOccurrenceDeps> = {}) {
  const calls: { buildDoc: { prompt: string; scope?: { kind?: string; value?: string } }[] } = {
    buildDoc: [],
  };
  const deps: EmailDocOccurrenceDeps = {
    loadDeliverable: async () => deliverable(),
    buildDoc: async ({ prompt, scope }) => {
      calls.buildDoc.push({ prompt, scope });
      return FRESH;
    },
    renderDoc: async (doc) =>
      `<html><body>${doc.blocks.map((b) => (b.props as { title?: string }).title ?? "").join("")}</body></html>`,
    ...over,
  };
  return { deps, calls };
}

describe("buildEmailDocOccurrence", () => {
  test("happy path: load → re-build with the stored prompt+scope → render → derived subject", async () => {
    const { deps, calls } = makeDeps();
    const out = await buildEmailDocOccurrence("deliv-1", deps);
    expect(out).not.toBeNull();
    expect(out!.subject).toBe("Fresh headline this run");
    expect(out!.body).toBe("");
    expect(out!.emailDocHtml).toContain("Fresh headline this run");
    // Prompt = the deliverable's stored instruction; scope rides off the deliverable.
    expect(calls.buildDoc).toHaveLength(1);
    expect(calls.buildDoc[0].prompt).toBe("Lee County price trend, with a chart.");
    expect(calls.buildDoc[0].scope).toEqual({ kind: "county", value: "lee" });
  });

  test("a listing project's subject_address rides the occurrence scope (address spine)", async () => {
    const { deps, calls } = makeDeps({
      loadDeliverable: async () => deliverable({ subject_address: "123 Main St, Cape Coral" }),
    });
    const out = await buildEmailDocOccurrence("deliv-1", deps);
    expect(out).not.toBeNull();
    expect(calls.buildDoc[0].scope).toEqual({
      kind: "county",
      value: "lee",
      address: "123 Main St, Cape Coral",
    });
  });

  test("no subject_address → scope unchanged (regression contract)", async () => {
    const { deps, calls } = makeDeps();
    await buildEmailDocOccurrence("deliv-1", deps);
    expect(calls.buildDoc[0].scope).toEqual({ kind: "county", value: "lee" });
  });

  test("no stored instruction → a neutral refresh prompt that still names the scope", async () => {
    const { deps, calls } = makeDeps({
      loadDeliverable: async () => deliverable({ instruction: null }),
    });
    await buildEmailDocOccurrence("deliv-1", deps);
    expect(calls.buildDoc[0].prompt).toBe(refreshPrompt({ kind: "county", value: "lee" }));
    expect(calls.buildDoc[0].prompt).toContain("for lee");
  });

  test("whole-region (null scope) → no scope passed, generic refresh prompt", async () => {
    const { deps, calls } = makeDeps({
      loadDeliverable: async () =>
        deliverable({ instruction: null, scope_kind: null, scope_value: null }),
    });
    await buildEmailDocOccurrence("deliv-1", deps);
    expect(calls.buildDoc[0].scope).toBeUndefined();
    expect(calls.buildDoc[0].prompt).toBe(refreshPrompt());
  });

  test("deliverable missing → null (caller falls back to digest)", async () => {
    const { deps } = makeDeps({ loadDeliverable: async () => null });
    expect(await buildEmailDocOccurrence("gone", deps)).toBeNull();
  });

  test("not a block-canvas deliverable → null", async () => {
    const { deps } = makeDeps({ loadDeliverable: async () => deliverable({ template: "email" }) });
    expect(await buildEmailDocOccurrence("deliv-1", deps)).toBeNull();
  });

  test("invalid doc → null (never throws)", async () => {
    const { deps } = makeDeps({
      loadDeliverable: async () => deliverable({ doc: { not: "an email doc" } }),
    });
    expect(await buildEmailDocOccurrence("deliv-1", deps)).toBeNull();
  });

  test("occurrence html binds the doc footer's #unsubscribe to the broadcast token", async () => {
    const { deps } = makeDeps({
      renderDoc: async () => `<html><body><a href="#unsubscribe">Unsubscribe</a></body></html>`,
    });
    const built = await buildEmailDocOccurrence("d1", deps);
    expect(built?.emailDocHtml?.includes("#unsubscribe")).toBe(false);
    expect(built?.emailDocHtml?.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")).toBe(true);
  });
});
