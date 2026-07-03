// lib/email/weekly-read/issue.test.ts
import { describe, expect, it } from "bun:test";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import { UNSUBSCRIBE_TOKEN } from "@/lib/email/scheduler";
import {
  buildWeeklyIssue,
  finalizeIssueHtml,
  weeklyReadPrompt,
  weeklyReadSeedDoc,
  type WeeklyIssueDeps,
} from "./issue";

const CTA = "https://www.swfldatagulf.com/r/zip-report/33914";

describe("weeklyReadPrompt", () => {
  it("names the place and ZIP", () => {
    const p = weeklyReadPrompt("33914", "Cape Coral");
    expect(p).toContain("Cape Coral");
    expect(p).toContain("33914");
  });
  it("falls back to the bare ZIP when no place is held", () => {
    expect(weeklyReadPrompt("33914", null)).toContain("ZIP 33914");
  });
});

describe("weeklyReadSeedDoc", () => {
  it("returns a schema-valid EmailDoc with the weekly hero identity", () => {
    const doc = weeklyReadSeedDoc("33914", "Cape Coral");
    expect(EmailDocSchema.safeParse(doc).success).toBe(true);
    const hero = doc.blocks.find((b) => b.type === "hero");
    expect(hero).toBeDefined();
    expect(JSON.stringify(hero)).toContain("Cape Coral");
    expect(JSON.stringify(hero)).toContain("33914");
  });
  it("returns a fresh copy each call (no shared mutable state)", () => {
    const a = weeklyReadSeedDoc("33914", "Cape Coral");
    const b = weeklyReadSeedDoc("33914", "Cape Coral");
    expect(a).not.toBe(b);
    a.blocks.length = 0;
    expect(b.blocks.length).toBeGreaterThan(0);
  });
});

describe("finalizeIssueHtml", () => {
  const base = "<html><body><p>the issue</p></body></html>";

  it("injects the CTA, the unsubscribe token, and the postal address", () => {
    const html = finalizeIssueHtml(base, {
      ctaUrl: CTA,
      postalAddress: "1234 Example Blvd #5, Fort Myers, FL 33901",
    });
    expect(html).toContain(CTA);
    expect(html).toContain(UNSUBSCRIBE_TOKEN);
    expect(html).toContain("1234 Example Blvd #5, Fort Myers, FL 33901");
    // Everything landed inside the document, not after </body>.
    expect(html.lastIndexOf("</body>")).toBeGreaterThan(html.indexOf(CTA));
  });
  it("omits the postal block when not configured", () => {
    const html = finalizeIssueHtml(base, { ctaUrl: CTA });
    expect(html).toContain(UNSUBSCRIBE_TOKEN);
    expect(html).not.toContain("Fort Myers, FL 33901");
  });
  it("does not double-inject the token when the doc already carries one", () => {
    const withToken = `<html><body><a href="${UNSUBSCRIBE_TOKEN}">Unsubscribe</a></body></html>`;
    const html = finalizeIssueHtml(withToken, { ctaUrl: CTA });
    expect(html.split(UNSUBSCRIBE_TOKEN).length - 1).toBe(1);
  });
  it("escapes HTML in the postal address", () => {
    const html = finalizeIssueHtml(base, { ctaUrl: CTA, postalAddress: "<b>addr</b>" });
    expect(html).not.toContain("<b>addr</b>");
  });
});

describe("buildWeeklyIssue", () => {
  function deps(
    applied: boolean,
  ): WeeklyIssueDeps & { seen: { scope?: unknown; prompt?: string } } {
    const seen: { scope?: unknown; prompt?: string } = {};
    return {
      seen,
      async buildDoc({ prompt, rawDoc, scope }) {
        seen.scope = scope;
        seen.prompt = prompt;
        return { doc: rawDoc, applied };
      },
      async renderDoc() {
        return "<html><body><p>rendered</p></body></html>";
      },
    };
  }

  it("returns finalized html + a subject on applied:true, passing the zip scope through", async () => {
    const d = deps(true);
    const issue = await buildWeeklyIssue("33914", "Cape Coral", d, { ctaUrl: CTA });
    expect(issue).not.toBeNull();
    expect(issue!.html).toContain(UNSUBSCRIBE_TOKEN);
    expect(issue!.html).toContain(CTA);
    expect(issue!.subject.length).toBeGreaterThan(0);
    expect(d.seen.scope).toEqual({ kind: "zip", value: "33914" });
    expect(d.seen.prompt).toContain("33914");
  });
  it("returns null when the AI fill did not apply (skip, never send the bare skeleton)", async () => {
    expect(await buildWeeklyIssue("33914", "Cape Coral", deps(false), { ctaUrl: CTA })).toBeNull();
  });
});
