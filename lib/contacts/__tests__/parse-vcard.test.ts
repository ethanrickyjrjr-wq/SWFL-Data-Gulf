import { describe, it, expect } from "bun:test";
import { parseVcards } from "../parse-vcard";

describe("parseVcards", () => {
  it("parses a basic Apple-style card", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Jane Doe",
      "EMAIL;TYPE=INTERNET;TYPE=HOME:jane@example.com",
      "TEL;TYPE=CELL:239-555-0100",
      "END:VCARD",
    ].join("\r\n");
    const r = parseVcards(vcf);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({
      email: "jane@example.com",
      name: "Jane Doe",
      phone: "239-555-0100",
      tags: [],
      attribs: {},
    });
  });

  it("prefers a WORK/PREF email over others", () => {
    const vcf = [
      "BEGIN:VCARD",
      "FN:Bob",
      "EMAIL;TYPE=HOME:home@x.com",
      "EMAIL;TYPE=WORK:work@x.com",
      "END:VCARD",
    ].join("\n");
    expect(parseVcards(vcf).rows[0].email).toBe("work@x.com");
  });

  it("derives a name from N when FN is absent", () => {
    const vcf = "BEGIN:VCARD\nN:Smith;John;;;\nEMAIL:john@x.com\nEND:VCARD";
    expect(parseVcards(vcf).rows[0].name).toBe("John Smith");
  });

  it("skips a card with no valid email and reports it", () => {
    const vcf = "BEGIN:VCARD\nFN:No Email\nEND:VCARD";
    const r = parseVcards(vcf);
    expect(r.rows).toHaveLength(0);
    expect(r.skipped).toBe(1);
  });

  it("parses multiple cards", () => {
    const vcf =
      "BEGIN:VCARD\nFN:A\nEMAIL:a@x.com\nEND:VCARD\n" +
      "BEGIN:VCARD\nFN:B\nEMAIL:b@x.com\nEND:VCARD";
    expect(parseVcards(vcf).rows.map((r) => r.email)).toEqual(["a@x.com", "b@x.com"]);
  });
});
