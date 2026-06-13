import { test, expect } from "bun:test";
import { safeLogoUrl } from "./logo-allowlist";

test("drops arbitrary external agent-CDN logos (the tracking-pixel vector)", () => {
  expect(safeLogoUrl("https://evil.example.com/track.gif")).toBeNull();
  expect(safeLogoUrl("https://cdn.some-brokerage.com/logo.png")).toBeNull();
  // even another *.amazonaws.com / supabase.co bucket is NOT allowed until re-host
  expect(safeLogoUrl("https://attacker.s3.amazonaws.com/x.png")).toBeNull();
  expect(safeLogoUrl("https://jtkdowmrjaxfvwmemxso.supabase.co/x.png")).toBeNull();
});

test("allows our own site (exact, www, and subdomains)", () => {
  expect(safeLogoUrl("https://swfldatagulf.com/logo.png")).toBe(
    "https://swfldatagulf.com/logo.png",
  );
  expect(safeLogoUrl("https://www.swfldatagulf.com/logo.png")).toBe(
    "https://www.swfldatagulf.com/logo.png",
  );
  expect(safeLogoUrl("https://assets.swfldatagulf.com/l.png")).toBe(
    "https://assets.swfldatagulf.com/l.png",
  );
});

test("allows a same-origin relative path (the re-hosted-logo shape)", () => {
  expect(safeLogoUrl("/logos/agent-123.png")).toBe("/logos/agent-123.png");
});

test("rejects protocol-relative, non-http schemes, and garbage", () => {
  expect(safeLogoUrl("//evil.com/x.png")).toBeNull(); // protocol-relative is NOT same-origin
  expect(safeLogoUrl("javascript:alert(1)")).toBeNull();
  expect(safeLogoUrl("data:image/png;base64,AAAA")).toBeNull();
  expect(safeLogoUrl("ftp://swfldatagulf.com/x")).toBeNull();
  expect(safeLogoUrl("not a url")).toBeNull();
  expect(safeLogoUrl("")).toBeNull();
  expect(safeLogoUrl(undefined)).toBeNull();
});

test("a look-alike host suffix does not slip past the allowlist", () => {
  expect(safeLogoUrl("https://swfldatagulf.com.evil.com/x.png")).toBeNull();
  expect(safeLogoUrl("https://notswfldatagulf.com/x.png")).toBeNull();
});
