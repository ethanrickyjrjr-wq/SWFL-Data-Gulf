// lib/export/build-csv.test.ts
// Guards: failure mode 1 (formula injection — the OWASP worked example must
// arrive escaped), 6 (no internal column in header or body), 7 (BOM first
// code point), plus zero-rows→header-only and the format rules (tags "; ",
// dates YYYY-MM-DD only).
import { describe, expect, test } from "bun:test";
import { EXPORT_SURFACES } from "./surfaces";
import { buildCsv } from "./build-csv";

const contactRow = {
  id: "c-1",
  user_id: "u-1",
  name: '=1+2";=1+2', // OWASP's worked example
  email: "jose@example.com",
  phone: null,
  tags: ["investors", "FMB"],
  created_at: "2026-08-01T14:03:22.000Z",
};

describe("buildCsv", () => {
  test("FM7: first code point is U+FEFF", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, [contactRow]);
    expect(csv.codePointAt(0)).toBe(0xfeff);
  });

  test("FM1: formula cell arrives in OWASP-escaped form", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, [contactRow]);
    expect(csv).toContain('"\'=1+2"";=1+2"'); // '=1+2";=1+2 → "'=1+2"";=1+2"
  });

  test("FM6: id/user_id never appear in header or body", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, [contactRow]);
    expect(csv).not.toContain("user_id");
    expect(csv).not.toContain("c-1");
    expect(csv).not.toContain("u-1");
  });

  test("header line + formats: tags joined '; ', date YYYY-MM-DD only, null → empty cell", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, [contactRow]);
    const lines = csv.slice(1).split("\r\n"); // strip BOM
    expect(lines[0]).toBe('"name","email","phone","tags","created"');
    expect(lines[1]).toContain('"investors; FMB"');
    expect(lines[1]).toContain('"2026-08-01"');
    expect(lines[1]).toContain('""'); // null phone
  });

  test("zero rows → header-only document (a true answer)", () => {
    const csv = buildCsv(EXPORT_SURFACES.contacts, []);
    expect(csv.slice(1)).toBe('"name","email","phone","tags","created"\r\n');
  });

  test("listings: attribs union columns appended after fixed columns, values land", () => {
    const row = {
      address: "1 A St",
      price: 100000,
      beds: 3,
      baths: 2,
      sqft: 1500,
      status: "active",
      url: null,
      zip_code: "33901",
      county: "Lee",
      updated_at: "2026-08-02T00:00:00.000Z",
      attribs: { hoa_fee: "120", pool: "yes" },
      address_key: "SECRET-KEY",
    };
    const csv = buildCsv(EXPORT_SURFACES.listings, [row]);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0].endsWith('"imported","hoa_fee","pool"')).toBe(true);
    expect(lines[1]).toContain('"120"');
    expect(lines[1]).toContain('"yes"');
    expect(csv).not.toContain("SECRET-KEY"); // FM6 on listings
  });
});
