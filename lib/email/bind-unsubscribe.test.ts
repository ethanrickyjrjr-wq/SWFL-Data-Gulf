// lib/email/bind-unsubscribe.test.ts
import { describe, test, expect } from "bun:test";
import { bindUnsubscribeHref } from "./bind-unsubscribe";

describe("bindUnsubscribeHref", () => {
  test("replaces the dead footer href with the real target", () => {
    const html = `<a href="#unsubscribe" style="color:#999">Unsubscribe</a>`;
    expect(bindUnsubscribeHref(html, "https://x.test/u?id=1")).toBe(
      `<a href="https://x.test/u?id=1" style="color:#999">Unsubscribe</a>`,
    );
  });

  test("replaces every occurrence", () => {
    const html = `<a href="#unsubscribe">a</a><a href="#unsubscribe">b</a>`;
    const out = bindUnsubscribeHref(html, "T");
    expect(out.includes("#unsubscribe")).toBe(false);
    expect(out.match(/href="T"/g)?.length).toBe(2);
  });

  test("no-op when the doc carries a real user-set unsubscribe link", () => {
    const html = `<a href="https://their-crm.test/unsub">Unsubscribe</a>`;
    expect(bindUnsubscribeHref(html, "T")).toBe(html);
  });

  test("token target passes through verbatim (broadcast lane)", () => {
    const html = `<a href="#unsubscribe">u</a>`;
    expect(bindUnsubscribeHref(html, "{{{RESEND_UNSUBSCRIBE_URL}}}")).toBe(
      `<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">u</a>`,
    );
  });
});
