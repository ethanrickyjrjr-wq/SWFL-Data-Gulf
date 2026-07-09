import { describe, expect, it } from "bun:test";
import { parseDmarcPolicy } from "./dmarc";

// dns.resolveTxt returns string[][] — one array per TXT record, chunked into
// the record's individual <character-string> segments (a long record can span
// several 255-byte chunks that must be rejoined).
describe("parseDmarcPolicy", () => {
  it("parses p=reject from a single-chunk record", () => {
    expect(parseDmarcPolicy([["v=DMARC1; p=reject; rua=mailto:d@example.com"]])).toBe("reject");
  });

  it("parses p=quarantine", () => {
    expect(parseDmarcPolicy([["v=DMARC1; p=quarantine"]])).toBe("quarantine");
  });

  it("parses p=none (set up but not enforcing)", () => {
    expect(parseDmarcPolicy([["v=DMARC1; p=none"]])).toBe("none");
  });

  it("is case-insensitive on the policy value and v= tag", () => {
    expect(parseDmarcPolicy([["V=dmarc1; P=Reject"]])).toBe("reject");
  });

  it("rejoins a record split across multiple chunks", () => {
    expect(parseDmarcPolicy([["v=DMARC1; ", "p=reject; ", "rua=mailto:d@example.com"]])).toBe(
      "reject",
    );
  });

  it("ignores a non-DMARC TXT record at the same name and finds the real one", () => {
    expect(parseDmarcPolicy([["some-other-verification=abc123"], ["v=DMARC1; p=quarantine"]])).toBe(
      "quarantine",
    );
  });

  it("returns null when no records are present", () => {
    expect(parseDmarcPolicy([])).toBeNull();
  });

  it("returns null when a v=DMARC1 record has no p= tag (malformed)", () => {
    expect(parseDmarcPolicy([["v=DMARC1; rua=mailto:d@example.com"]])).toBeNull();
  });

  it("returns null when nothing looks like a DMARC record", () => {
    expect(parseDmarcPolicy([["some-other-verification=abc123"]])).toBeNull();
  });
});
